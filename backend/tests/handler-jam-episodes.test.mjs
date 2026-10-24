import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildHandlerJamEpisodes as build } from '../src/handler-jam-episodes.mjs';
const at = minute => new Date(Date.UTC(2026, 9, 24, 6, minute)).toISOString();
const alarm = (alarmId, minute, reasonCode = 'JAM_PICK') => ({ alarmId, occurredAt: at(minute), reasonCode, ingestedAt: at(100) });
const run = (a, b, acceptedUnits = 0) => ({ start: at(a), end: at(b), acceptedUnits });
function fixture() { return { policy: { policyId: 'POLICY-A', version: 2, episodeGapMinutes: 10, minimumJamsPerEpisode: 2 },
  window: { start: at(0), end: at(60) }, station: { stationId: 'HANDLER-A', referenceUnitsPerHour: 180, programRevision: 'P3', activeSiteCount: 4 },
  alarms: [alarm('A', 10), alarm('B', 15), alarm('C', 20)], runIntervals: [run(0, 10, 30), run(30, 60, 90)], plannedStops: [],
  contextObservations: [{ observedAt: at(0), programRevision: 'P3', activeSiteCount: 4 }] }; }
test('three jams form a pattern retaining the full trail and estimate basis', () => {
  const result = build(fixture());
  assert.deepEqual(result.episodes, [{ episodeId: 'EP-A', reasonCode: 'JAM_PICK', firstOccurredAt: at(10), lastOccurredAt: at(20), jamCount: 3,
    alarmIds: ['A', 'B', 'C'], unplannedStoppedMinutes: 20, classification: 'PATTERN' }]);
  assert.equal(result.unplannedStoppedMinutes, 20); assert.equal(result.runningMinutes, 40);
  assert.equal(result.acceptedUnitsPerRunningMinute, 3); assert.equal(result.deficitStatus, 'ESTIMATE'); assert.equal(result.estimatedDeficitUnits, 60);
  assert.deepEqual(result.deficitBasis, { referenceUnitsPerHour: 180, windowMinutes: 60, denominator: 'UNPLANNED_STOPPED_MINUTES' });
});
test('gap boundary is inclusive; beyond gap and intervening reasons split episodes', () => {
  const input = fixture(); input.alarms = [alarm('A', 1), alarm('B', 11), alarm('C', 22), alarm('D', 23, 'JAM_OTHER'), alarm('E', 24)];
  assert.deepEqual(build(input).episodes.map(row => [row.alarmIds, row.classification]), [[['A', 'B'], 'PATTERN'], [['C'], 'SINGLE_EVENT'], [['D'], 'SINGLE_EVENT'], [['E'], 'SINGLE_EVENT']]);
});
test('duplicate IDs count once; missing occurrence is excluded; ingestion never determines grouping', () => {
  const input = fixture(); input.alarms.push({ ...input.alarms[0], ingestedAt: at(200) }, { alarmId: 'MISSING', reasonCode: 'JAM_PICK' }, { alarmId: 'NULL', occurredAt: null, reasonCode: 'JAM_PICK' });
  const result = build(input); assert.equal(result.excludedAlarms, 2); assert.equal(result.episodes[0].jamCount, 3);
  input.alarms.push(alarm('A', 11)); assert.throws(() => build(input), /conflicting alarm/);
});
test('planned overlap and overlapping jam windows use unions, globally across episodes', () => {
  const input = fixture(); input.alarms.push(alarm('D', 21, 'JAM_OTHER'));
  input.plannedStops = [{ start: at(15), end: at(25), reasonCode: 'CHANGEOVER' }, { start: at(20), end: at(28), reasonCode: 'CHANGEOVER' }];
  const result = build(input); assert.equal(result.plannedStopMinutes, 13); assert.equal(result.unplannedStoppedMinutes, 7); assert.equal(result.runningMinutes, 40);
  assert.equal(result.episodes[0].unplannedStoppedMinutes, 7); assert.equal(result.episodes[1].unplannedStoppedMinutes, 2);
});
test('program change suppresses estimate while preserving raw evidence; end observation is outside window', () => {
  const input = fixture(); input.contextObservations.push({ observedAt: at(20), programRevision: 'P4', activeSiteCount: 4 });
  const result = build(input); assert.deepEqual(result.suppressionReasons, ['PROGRAM_CHANGED']); assert.equal(result.deficitStatus, 'SUPPRESSED');
  assert.equal(result.estimatedDeficitUnits, null); assert.equal(result.deficitBasis, null); assert.equal(result.unplannedStoppedMinutes, 20); assert.equal(result.episodes[0].jamCount, 3);
  input.contextObservations[1].observedAt = at(60); assert.equal(build(input).deficitStatus, 'ESTIMATE');
});
test('context is a carried-forward step function with explicit missing and site gates', () => {
  const input = fixture(); input.contextObservations = []; assert.deepEqual(build(input).suppressionReasons, ['CONTEXT_MISSING']);
  input.contextObservations = [{ observedAt: at(1), programRevision: 'P3', activeSiteCount: 4 }]; assert.deepEqual(build(input).suppressionReasons, ['CONTEXT_MISSING']);
  input.contextObservations = [{ observedAt: at(-20), programRevision: 'P3', activeSiteCount: 4 }]; assert.equal(build(input).deficitStatus, 'ESTIMATE');
  input.contextObservations.push({ observedAt: at(20), programRevision: null, activeSiteCount: null }); assert.deepEqual(build(input).suppressionReasons, ['CONTEXT_MISSING']);
  input.contextObservations[1] = { observedAt: at(20), programRevision: 'P3', activeSiteCount: 2 }; assert.deepEqual(build(input).suppressionReasons, ['SITE_COUNT_CHANGED']);
  input.contextObservations.push({ ...input.contextObservations[1], activeSiteCount: 3 }); assert.throws(() => build(input), /conflicting context/);
});
test('missing or zero reference is suppressed, including combined gate reasons', () => {
  for (const reference of [undefined, null, 0]) { const input = fixture(); input.station.referenceUnitsPerHour = reference; assert.deepEqual(build(input).suppressionReasons, ['REFERENCE_MISSING']); }
  const input = fixture(); input.contextObservations = []; input.station.referenceUnitsPerHour = null;
  assert.deepEqual(build(input).suppressionReasons, ['CONTEXT_MISSING', 'REFERENCE_MISSING']);
});
test('no running time returns null rate and NO_RUNNING_TIME; subminute time fails estimate gate', () => {
  const input = fixture(); input.alarms = [alarm('A', 0)]; input.runIntervals = [];
  const result = build(input); assert.equal(result.runningMinutes, 0); assert.equal(result.acceptedUnitsPerRunningMinute, null); assert.deepEqual(result.suppressionReasons, ['NO_RUNNING_TIME']);
  input.alarms = []; input.window.end = '2026-10-24T06:00:20.000Z'; assert.deepEqual(build(input).suppressionReasons, ['NO_RUNNING_TIME']);
});
test('half-open clipping, exact restart, outside data and empty alarms', () => {
  const input = fixture(); input.alarms = [alarm('BEFORE', -1), alarm('END', 60), alarm('RESTART', 30)];
  let result = build(input); assert.equal(result.episodes.length, 1); assert.equal(result.unplannedStoppedMinutes, 0);
  input.alarms = [alarm('NO_RESTART', 40)]; input.runIntervals.push(run(90, 100, 1000));
  result = build(input); assert.equal(result.unplannedStoppedMinutes, 20); assert.equal(result.acceptedUnitsPerRunningMinute, 3);
  input.alarms = []; input.plannedStops = [{ start: at(-20), end: at(5), reasonCode: 'PLANNED' }, { start: at(55), end: at(80), reasonCode: 'PLANNED' }];
  result = build(input); assert.equal(result.plannedStopMinutes, 10); assert.equal(result.runningMinutes, 50); assert.equal(result.estimatedDeficitUnits, 0);
});
test('input order, equal-time IDs, deep freezing and returned objects preserve determinism and independence', () => {
  const input = fixture(); input.alarms.push(alarm('AA', 10)); const expected = build(input);
  for (const key of ['alarms', 'runIntervals', 'plannedStops', 'contextObservations']) input[key].reverse();
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }; freeze(input);
  assert.deepEqual(build(input), expected); expected.episodes[0].alarmIds.push('MUTATION'); assert.equal(build(input).episodes[0].jamCount, 4);
});
test('seconds retain exact arithmetic, then display integer minutes/units and two decimal rate', () => {
  const input = fixture(); input.alarms = [{ ...alarm('A', 10), occurredAt: '2026-10-24T06:10:20.000Z' }];
  const result = build(input); assert.equal(result.unplannedStoppedMinutes, 20); assert.equal(result.estimatedDeficitUnits, 59); assert.equal(result.acceptedUnitsPerRunningMinute, 2.98);
});
test('malformed, overlapping or unallocatable counts fail instead of inventing facts', () => {
  for (const change of [x => { x.window.end = x.window.start; }, x => { x.alarms[0].occurredAt = '2026-02-30T06:00:00Z'; },
    x => { x.runIntervals.push(run(5, 15)); }, x => { x.runIntervals[0].start = at(-1); }, x => { x.runIntervals[0].acceptedUnits = -1; },
    x => { x.policy.minimumJamsPerEpisode = 0; }, x => { x.alarms[0].reasonCode = 'lowercase'; },
    x => { x.station.ResponderSkill = 1; }, x => { x.station.referenceUnitsPerHour = Infinity; }]) {
    const input = fixture(); change(input); assert.throws(() => build(input), TypeError);
  }
});
test('module is independent of runtime, clock and I/O; output has only declared noncausal fields', async () => {
  const source = await readFile(new URL('../src/handler-jam-episodes.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\s|Date\.now|new Date\(\)|Math\.random|\bfetch\s*\(/);
  const result = build(fixture());
  assert.deepEqual(Object.keys(result).sort(), ['stationId', 'window', 'policyId', 'policyVersion', 'episodes', 'excludedAlarms', 'unplannedStoppedMinutes', 'plannedStopMinutes', 'runningMinutes', 'acceptedUnitsPerRunningMinute', 'deficitStatus', 'estimatedDeficitUnits', 'deficitBasis', 'suppressionReasons'].sort());
  assert.doesNotMatch(JSON.stringify(result), /cause|causal|recoverable|measured/i);
  assert.deepEqual(Object.keys(result.episodes[0]).sort(), ['episodeId', 'reasonCode', 'firstOccurredAt', 'lastOccurredAt', 'jamCount', 'alarmIds', 'unplannedStoppedMinutes', 'classification'].sort());
});
