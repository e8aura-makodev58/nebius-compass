import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { buildStationKpis } from '../src/station-kpis.mjs';
import { unionDowntime } from '../src/analytics-service.mjs';
import { compactHistory } from '../src/history-retention.mjs';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { createBuildingEquipment, ratedUnitsPerHourFor } from '../seed/floor-layout.mjs';
import { migrateLiveState } from '../src/live-migration.mjs';
import { validateLiveState, assertNoResponderSkill } from '../src/live-schema.mjs';
import { createLiveRuntime, createApplicationRuntime } from '../src/live-runtime.mjs';
import { createDemoRuntime } from '../src/offline-runtime.mjs';
import { createTempAuditStore } from './helpers/temp-audit-store.mjs';
import { createRequestHandler } from '../src/server.mjs';

const time = hour => `2026-09-01T${String(hour).padStart(2, '0')}:00:00.000Z`;
function fixture() {
  return { simulationState: { simulationTime: time(12) },
    equipment: [{ id: 'EQ-01', name: 'Station 1', floor: 1, ratedUnitsPerHour: 60 }, { id: 'EQ-30', name: 'Station 30', floor: 2, ratedUnitsPerHour: 80 }],
    issues: [], operationalEvents: [{ id: 'event-start', eventType: 'SIMULATION_STARTED', simulationTimestamp: time(0) }],
    recommendations: [], resolutionHistory: [], assignments: [], dispatchOffers: [], resolutionAttempts: [] };
}
function issue(id, from, to, station = 'EQ-01') {
  return { id, equipmentId: station, raisedAt: time(from), downtimeStartedAt: time(from), resolvedAt: to === null ? null : time(to), status: to === null ? 'PENDING' : 'RESOLVED' };
}

test('station KPI windows align to UTC three-hour boundaries with four half-open buckets', () => {
  const state = fixture(); state.simulationState.simulationTime = '2026-09-01T14:59:59.999Z';
  state.issues = [issue('ISS-1', 3, 4), issue('ISS-2', 12, null)];
  const result = buildStationKpis(state, { roomId: 'plant-1' });
  assert.equal(result.asOf, time(12));
  assert.deepEqual(result.window, { start: time(0), end: time(12), hours: 12, bucketHours: 3 });
  assert.deepEqual(result.buckets.map(row => row.start), [0, 3, 6, 9].map(time));
  assert.deepEqual(result.stations[0].buckets.map(row => row.issuesRaised), [0, 1, 0, 0]);
  assert.deepEqual(result.stations[0].buckets.map(row => row.expectedUnits), [180, 180, 180, 180]);
  assert.deepEqual(result.stations[0].buckets.map(row => row.actualUnits), [180, 120, 180, 180]);
  assert.equal(result.stations[0].buckets[1].attainmentPercent, 66.7);
  assert.equal(result.status, 'READY');
  assert.deepEqual(Object.keys(result).sort(), ['roomId', 'asOf', 'window', 'status', 'earliestAvailable', 'buckets', 'stations', 'totals'].sort());
});

test('station downtime reuses analytics union across buckets, overlaps and open intervals at the cutoff', () => {
  const state = fixture(); state.issues = [issue('ISS-1', 2, 5), issue('ISS-2', 4, 7), issue('ISS-3', 10, null), issue('ISS-4', 11, null, 'EQ-30')];
  const result = buildStationKpis(state);
  assert.deepEqual(result.stations[0].buckets.map(row => row.downtimeMinutes), [60, 180, 60, 120]);
  assert.deepEqual(result.stations[0].buckets.map(row => row.actualUnits), [120, 0, 120, 60]);
  assert.equal(result.totals.reduce((sum, row) => sum + row.downtimeMinutes, 0), unionDowntime(state, Date.parse(time(0)), Date.parse(time(12)), Date.parse(time(12))));
  const earlier = buildStationKpis(state, { windowEnd: time(9) });
  assert.equal(earlier.asOf, time(9));
  assert.equal(earlier.stations[0].buckets.at(-1).downtimeMinutes, 60);
  assert.equal(earlier.stations[1].buckets.at(-1).downtimeMinutes, 0);
});

test('station KPIs exclude future issues and clamp later resolution timestamps without reading private truth', () => {
  const state = fixture(); state.issues = [issue('ISS-1', 11, 15)];
  const expected = buildStationKpis(state);
  state.issues.push(issue('ISS-2', 13, null));
  state.responderSkills = [{ trueMedianMinutes: 999, trueSuccessProbability: .01 }];
  state.faultTruth = { privateCanary: 'never-public' }; state.issues[0].unknown = 'never-public';
  assert.deepEqual(buildStationKpis(state), expected);
  assertNoResponderSkill(expected); assert.doesNotMatch(JSON.stringify(expected), /never-public|ISS-|responder/);
  assert.equal(expected.stations[0].buckets.at(-1).downtimeMinutes, 60);
});

test('station selection preserves equipment order and totals sum only returned stations, including explicit None', () => {
  const state = fixture();
  const selected = buildStationKpis(state, { stations: 'EQ-30,EQ-01,EQ-30' });
  assert.deepEqual(selected.stations.map(row => row.stationId), ['EQ-01', 'EQ-30']);
  assert.equal(selected.totals[0].expectedUnits, 420);
  assert.equal(buildStationKpis(state, { stations: 'EQ-30' }).totals[0].expectedUnits, 240);
  const empty = buildStationKpis(state, { stations: '' });
  assert.deepEqual(empty.stations, []);
  assert.ok(empty.totals.every(row => row.expectedUnits === 0 && row.actualUnits === 0 && row.downtimeMinutes === 0 && row.issuesRaised === 0));
});

test('station KPI history availability never invents whole-bucket production before retained coverage', () => {
  const state = fixture(); state.operationalEvents[0].simulationTimestamp = time(4);
  const result = buildStationKpis(state);
  assert.equal(result.status, 'PARTIAL'); assert.equal(result.earliestAvailable, time(4));
  assert.deepEqual(result.buckets.map(row => row.available), [false, false, true, true]);
  assert.ok(result.stations.every(row => row.buckets.slice(0, 2).every(bucket => bucket.expectedUnits === 0 && bucket.actualUnits === 0 && bucket.attainmentPercent === null)));
  assert.deepEqual(buildStationKpis(state, { windowEnd: time(3) }).buckets.map(row => row.available), [false, false, false, false]);
  assert.equal(buildStationKpis(state, { windowEnd: time(3) }).earliestAvailable, time(4));
});

test('station output uses precise uptime for flooring units, with integer displayed minutes', () => {
  const state = fixture(); state.equipment[0].ratedUnitsPerHour = 40;
  state.issues = [{ ...issue('ISS-1', 1, 2), resolvedAt: '2026-09-01T01:00:45.000Z' }];
  const bucket = buildStationKpis(state).stations[0].buckets[0];
  assert.equal(bucket.downtimeMinutes, 1); assert.equal(bucket.actualUnits, 119); assert.equal(bucket.expectedUnits, 120);
});

test('compacted archived issue facts produce exactly the same station KPIs without archive I/O or state writes', () => {
  const state = fixture(); state.simulationState.simulationTime = '2026-10-01T12:00:00.000Z'; state.issues = [issue('ISS-1', 2, 5), issue('ISS-2', 4, 7)];
  const query = { windowEnd: time(12) }, expected = buildStationKpis(state, query);
  compactHistory(state, 7, { force: true }); assert.equal(state.issues.length, 0);
  const before = structuredClone(state);
  assert.deepEqual(buildStationKpis(state, query), expected); assert.deepEqual(state, before);
});

test('station coverage handles long retained event histories without argument-list limits', () => {
  const state = fixture();
  state.operationalEvents = Array.from({ length: 150_000 }, () => ({ simulationTimestamp: time(0) }));
  const result = buildStationKpis(state, { stations: 'EQ-01' });
  assert.equal(result.earliestAvailable, time(0)); assert.equal(result.status, 'READY');
});

test('station window and station errors are bounded, explicit and deterministic', () => {
  const state = fixture();
  for (const windowEnd of ['', null, '2026-09-01', time(15), time(11), '2026-02-30T00:00:00Z', '2026-09-01T12:00:00+00:00', '2026-09-01T12:00:00.001Z', 'not-a-date']) {
    assert.throws(() => buildStationKpis(state, { windowEnd }), { code: 'INVALID_WINDOW', statusCode: 400 });
  }
  assert.equal(buildStationKpis(state, { windowEnd: '2026-09-01T12:00:00Z' }).window.end, time(12));
  for (const stations of ['EQ-99', 'R-1', 'EQ-01,', 'EQ-01, EQ-30', Array(201).fill('EQ-01').join(','), ['EQ-01']]) {
    assert.throws(() => buildStationKpis(state, { stations }), { code: 'UNKNOWN_STATION', statusCode: 400 });
  }
});

test('rated throughput migration is deterministic/idempotent for every room and never consumes RNG', () => {
  const seed = createLiveSeed(); const streams = structuredClone(seed.simulationState.rngStreams);
  const legacy = structuredClone(seed); legacy.equipment.forEach(row => { delete row.ratedUnitsPerHour; });
  const before = structuredClone(legacy), first = migrateLiveState(legacy), secondRoom = migrateLiveState(legacy);
  assert.deepEqual(legacy, before); assert.deepEqual(first.equipment, secondRoom.equipment);
  assert.deepEqual(first.equipment.map(row => row.ratedUnitsPerHour), createBuildingEquipment().map(row => row.ratedUnitsPerHour));
  assert.deepEqual(first.simulationState.rngStreams, streams);
  assert.deepEqual(migrateLiveState(first), first);
  for (const row of first.equipment) { assert.equal(row.ratedUnitsPerHour, ratedUnitsPerHourFor(row.id)); assert.ok(row.ratedUnitsPerHour >= 40 && row.ratedUnitsPerHour <= 120); }
  first.equipment[0].ratedUnitsPerHour = 120;
  assert.equal(migrateLiveState(first).equipment[0].ratedUnitsPerHour, 120);
  for (const rated of [undefined, null, 39, 121, 60.5, '60']) {
    const invalid = structuredClone(seed); invalid.equipment[0].ratedUnitsPerHour = rated;
    assert.throws(() => validateLiveState(invalid), /rated throughput/);
  }
});

test('room KPI endpoint uses isolated raw read projections in both modes without advancing the Offline clock', async () => {
  const state = createLiveSeed(), before = structuredClone(state);
  const forbidden = () => { throw Error('mutation/provider access forbidden'); };
  const live = createLiveRuntime({ store: { snapshot: async () => structuredClone(state), mutate: forbidden }, agentOptions: forbidden, plannerOptions: forbidden });
  let clock = 0;
  const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => clock });
  const runtime = createApplicationRuntime({ liveRuntime: live, offlineRuntime: offline });
  const other = createApplicationRuntime({ liveRuntime: createLiveRuntime({ store: { snapshot: async () => ({ ...state, equipment: state.equipment.slice(1) }), mutate: forbidden } }), offlineRuntime: offline });
  const handler = createRequestHandler({ getRoom: id => ({ 'plant-1': { id, health: 'READY', applicationRuntime: runtime }, 'plant-2': { id, health: 'READY', applicationRuntime: other } })[id] });
  async function get(tail = '', room = 'plant-1') {
    const request = Readable.from([]); Object.assign(request, { method: 'GET', url: `/api/control-rooms/${room}/station-kpis${tail}`, headers: { host: 'app.test' } });
    let status, body; await handler(request, { writeHead(code) { status = code; }, end(text) { body = JSON.parse(text); } }); return { status, body };
  }
  assert.equal((await get()).status, 200); assert.equal((await get()).body.roomId, 'plant-1');
  assert.equal((await get('?stations=EQ-01')).body.stations.length, 1);
  assert.equal((await get('?stations=EQ-01', 'plant-2')).status, 400);
  for (const [query, code] of [['?windowEnd=invalid', 'INVALID_WINDOW'], ['?windowEnd=&windowEnd=x', 'INVALID_WINDOW'], ['?extra=x', 'INVALID_WINDOW'], ['?stations=EQ-99', 'UNKNOWN_STATION'], ['?stations=EQ-01&stations=EQ-02', 'UNKNOWN_STATION']]) {
    const result = await get(query); assert.equal(result.status, 400); assert.equal(result.body.code, code);
  }
  assert.equal((await get('', 'missing')).status, 404); assert.deepEqual(state, before);
  await runtime.setMode('OFFLINE');
  const baseline = await get(); clock += 86_400_000;
  assert.equal(baseline.status, 200); assert.deepEqual(await get(), baseline);
  assert.ok(baseline.body.stations.every(row => Number.isInteger(row.ratedUnitsPerHour)));
});
