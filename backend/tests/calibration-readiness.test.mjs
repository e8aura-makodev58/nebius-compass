import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cellReadiness } from '../src/calibration-readiness.mjs';
import { buildCellReadiness } from '../src/cell-readiness.mjs';
import { checkoutBoard } from '../src/loadboard-checkout.mjs';
import { createLiveStore } from '../src/live-store.mjs';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { createLiveRuntime, createApplicationRuntime } from '../src/live-runtime.mjs';
import { createDemoRuntime } from '../src/offline-runtime.mjs';
import { createInitialDemoState } from '../src/demo-state.mjs';
import { createRequestHandler } from '../src/server.mjs';
import { createTempAuditStore } from './helpers/temp-audit-store.mjs';
const at = '2026-10-24T08:00:00.000Z';
const row = (overrides = {}) => ({ calibrationId: 'CAL-1', cellId: 'ATE-1', instrumentId: 'PS-1', calibratedAt: '2026-10-01T08:00:00.000Z', dueAt: '2026-11-01T08:00:00.000Z', ...overrides });
const inventory = () => ({ boards: [{ boardId: 'LB-1', revision: 'A', condition: 'SERVICEABLE', cellId: null, approvedPrograms: ['P3'] }], reservations: [] });
const request = () => ({ requestId: 'REQ-1', boardId: 'LB-1', cellId: 'ATE-1', programRevision: 'P3', requestedAt: at });
test('all current instruments yield READY with sorted explicit due-date facts', () => {
  const rows = [row({ instrumentId: 'PS-2' }), row({ calibrationId: 'CAL-2' })];
  const result = cellReadiness(rows, 'ATE-1', at);
  assert.deepEqual(result, { cellId: 'ATE-1', at, readiness: 'READY', reasons: [], instruments: [
    { instrumentId: 'PS-1', calibrationId: 'CAL-2', dueAt: rows[1].dueAt, state: 'CURRENT' },
    { instrumentId: 'PS-2', calibrationId: 'CAL-1', dueAt: rows[0].dueAt, state: 'CURRENT' },
  ] });
});
test('expired instrument and exact expiry boundary block readiness while retaining all instruments', () => {
  for (const dueAt of ['2026-10-23T08:00:00.000Z', at]) {
    const result = cellReadiness([row({ dueAt }), row({ calibrationId: 'CAL-2', instrumentId: 'PS-2' })], 'ATE-1', at);
    assert.equal(result.readiness, 'EXPIRED'); assert.deepEqual(result.reasons, ['CALIBRATION_EXPIRED']);
    assert.deepEqual(result.instruments.map(x => x.state), ['EXPIRED', 'CURRENT']);
  }
});
test('missing and other-cell records never imply readiness', () => {
  for (const rows of [[], [row({ cellId: 'OTHER' })]]) assert.deepEqual(cellReadiness(rows, 'ATE-1', at), { cellId: 'ATE-1', at, readiness: 'NO_CALIBRATION', reasons: ['NO_CALIBRATION_RECORD'], instruments: [] });
});
test('latest effective calibration supersedes expired history; future calibrations do not act early', () => {
  const expired = row({ dueAt: '2026-10-10T08:00:00Z' }), current = row({ calibrationId: 'CAL-2', calibratedAt: '2026-10-20T08:00:00Z' });
  assert.equal(cellReadiness([current, expired], 'ATE-1', at).readiness, 'READY');
  const future = { ...current, calibratedAt: '2026-10-25T08:00:00Z' };
  assert.equal(cellReadiness([expired, future], 'ATE-1', at).readiness, 'EXPIRED');
  assert.equal(cellReadiness([future], 'ATE-1', at).readiness, 'NO_CALIBRATION');
  const result = cellReadiness([current, row({ calibrationId: 'FUTURE-OTHER', instrumentId: 'OTHER', calibratedAt: '2026-10-25T08:00:00Z' })], 'ATE-1', at);
  assert.equal(result.instruments.length, 1); assert.equal(result.readiness, 'READY');
});
test('optional checkout gate reports all failing rules without changing inventory', () => {
  for (const rows of [[], [row({ dueAt: at })]]) {
    const source = inventory(), before = structuredClone(source); source.boards[0].condition = 'UNDER_REPAIR'; before.boards[0].condition = 'UNDER_REPAIR';
    const result = checkoutBoard(source, request(), cellReadiness(rows, 'ATE-1', at));
    assert.equal(result.decision, 'REJECTED'); assert.deepEqual(result.reasons, ['CELL_NOT_READY', 'CONDITION_BLOCKED']); assert.equal(result.reservation, null);
    assert.deepEqual(result.inventory, before); assert.deepEqual(source, before); result.inventory.boards[0].condition = 'QUARANTINED'; assert.deepEqual(source, before);
  }
});
test('READY and omitted readiness preserve legacy checkout results; stale/wrong-cell packets fail', () => {
  assert.deepEqual(checkoutBoard(inventory(), request(), cellReadiness([row()], 'ATE-1', at)), checkoutBoard(inventory(), request()));
  assert.throws(() => checkoutBoard(inventory(), request(), cellReadiness([], 'ATE-2', at)), /mismatch/);
  assert.throws(() => checkoutBoard(inventory(), request(), cellReadiness([], 'ATE-1', '2026-10-24T09:00:00Z')), /mismatch/);
});
test('deterministic and immutable, duplicate facts count once and conflicts fail', () => {
  const rows = [row(), row({ calibrationId: 'CAL-2', instrumentId: 'PS-2' })], before = structuredClone(rows);
  const result = cellReadiness(rows, 'ATE-1', at); assert.deepEqual(cellReadiness([...rows].reverse(), 'ATE-1', at), result); assert.deepEqual(rows, before);
  rows.forEach(Object.freeze); Object.freeze(rows); assert.deepEqual(cellReadiness(rows, 'ATE-1', at), result);
  result.instruments[0].dueAt = 'CHANGED'; assert.equal(cellReadiness(rows, 'ATE-1', at).instruments[0].dueAt, before[0].dueAt);
  assert.equal(cellReadiness([row(), row()], 'ATE-1', at).instruments.length, 1);
  const alternate = row({ calibratedAt: '2026-10-01T08:00:00Z', dueAt: '2026-11-01T08:00:00Z' });
  assert.deepEqual(cellReadiness([row(), alternate], 'ATE-1', at), cellReadiness([alternate, row()], 'ATE-1', at));
  assert.throws(() => cellReadiness([row(), row({ dueAt: at })], 'ATE-1', at), /conflicting/);
  assert.throws(() => cellReadiness([row(), row({ calibrationId: 'OTHER' })], 'ATE-1', at), /ambiguous/);
});
test('invalid rows, dates, reversed validity and unknown fields are rejected', () => {
  for (const rows of [null, [row({ dueAt: '2026-02-30T08:00:00Z' })], [row({ dueAt: '2026-09-01T08:00:00Z' })], [row({ ResponderSkill: 1 })], [row({ correlation: 'PASS' })]]) assert.throws(() => cellReadiness(rows, 'ATE-1', at), TypeError);
});
test('pure module imports no runtime dependencies and reads no clock or network', async () => {
  const source = await readFile(new URL('../src/calibration-readiness.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\s|Date\.now|new Date\(\)|Math\.random|\bfetch\s*\(/);
});
async function get(runtime, room = 'plant-1') {
  const handler = createRequestHandler({ getRoom: id => id === 'plant-1' ? { id, health: 'READY', applicationRuntime: runtime } : null });
  const stream = Readable.from([]); Object.assign(stream, { method: 'GET', url: `/api/control-rooms/${room}/cell-readiness`, headers: {} });
  let status, body; await handler(stream, { writeHead(code) { status = code; }, end(text) { body = JSON.parse(text); } }); return { status, body };
}
test('room projection is sorted, explicit and includes future-only cells as unavailable', () => {
  const state = { simulationState: { simulationTime: at }, calibrations: [row({ cellId: 'Z' }), row({ calibrationId: 'FUTURE', calibratedAt: '2026-10-25T08:00:00Z' })] };
  const before = structuredClone(state), result = buildCellReadiness(state, { roomId: 'plant-1' });
  assert.deepEqual(result.cells.map(x => [x.cellId, x.readiness]), [['ATE-1', 'NO_CALIBRATION'], ['Z', 'READY']]);
  assert.deepEqual(Object.keys(result.cells[0]).sort(), ['cellId', 'readiness', 'reasons', 'instruments'].sort()); assert.deepEqual(state, before);
  assert.deepEqual(buildCellReadiness({ simulationState: { simulationTime: at } }).cells, []);
});
test('real Live endpoint uses room time and leaves durable revision/clock/rows unchanged', async t => {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'calibration-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createLiveStore({ filePath: join(dir, 'room.json'), historyRetentionDays: 0, seedFactory: () => { const state = createLiveSeed(); state.simulationState.simulationTime = at; state.calibrations = [row()]; return state; } });
  const runtime = createLiveRuntime({ store }), before = await store.snapshot(); const result = await get(runtime);
  assert.equal(result.status, 200); assert.equal(result.body.asOf, at); assert.equal(result.body.roomId, 'plant-1'); assert.equal(result.body.cells[0].readiness, 'READY');
  assert.deepEqual(await store.snapshot(), before); assert.equal(Object.hasOwn(await store.publicSnapshot(), 'calibrations'), false); assert.equal((await get(runtime, 'missing')).status, 404);
});
test('Offline endpoint shares rules without clock advancement or network, including empty rooms', async () => {
  let now = 0; const seedFactory = () => ({ ...createInitialDemoState(), calibrations: [row({ dueAt: '2026-10-01T08:00:00Z' })] });
  const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => now, seedFactory });
  const runtime = createApplicationRuntime({ liveRuntime: {}, offlineRuntime: offline, initialMode: 'OFFLINE' });
  const original = globalThis.fetch; globalThis.fetch = () => { throw Error('network forbidden'); };
  try {
    const first = await get(runtime); assert.equal(first.status, 200); const rows = seedFactory().calibrations;
    assert.equal(first.body.cells[0].readiness, cellReadiness(rows, 'ATE-1', first.body.asOf).readiness);
    now += 86_400_000; assert.deepEqual(await get(runtime), first); assert.equal(Object.hasOwn(offline.snapshot(), 'calibrations'), false);
    const empty = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore()); assert.deepEqual((await get(empty)).body.cells, []);
  } finally { globalThis.fetch = original; }
});
