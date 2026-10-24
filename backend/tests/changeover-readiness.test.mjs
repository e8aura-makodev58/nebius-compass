import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkChangeoverReadiness as check } from '../src/changeover-readiness.mjs';
import { cellReadiness } from '../src/calibration-readiness.mjs';
const at = '2026-10-24T14:00:00.000Z';
const board = overrides => ({ boardId: 'LB-0412', revision: 'C', condition: 'SERVICEABLE', cellId: null, approvedPrograms: ['SR1260-P3'], ...overrides });
const hold = overrides => ({ reservationId: 'RES-1', boardId: 'LB-0412', cellId: 'ATE-1', programRevision: 'SR1260-P3', status: 'HELD', heldSince: '2026-10-24T12:00:00Z', ...overrides });
function fixture() { return { changeover: { changeoverId: 'CO-0031', cellId: 'ATE-1', targetProgramRevision: 'SR1260-P3', startsAt: at }, inventory: { boards: [board()], reservations: [] }, readiness: { cellId: 'ATE-1', at, readiness: 'READY', reasons: [], instruments: [] }, kitFacts: null, crewFacts: null }; }
test('compatible in-store board and ready cell pass, kit/crew stay UNKNOWN and overall BLOCKED', () => {
  assert.deepEqual(check(fixture()), { changeoverId: 'CO-0031', cellId: 'ATE-1', startsAt: at, status: 'BLOCKED', checks: [
    { check: 'LOADBOARD_AVAILABLE', result: 'PASS', reasons: [], boardId: 'LB-0412' },
    { check: 'CELL_READY', result: 'PASS', reasons: [] },
    { check: 'KIT_AVAILABLE', result: 'UNKNOWN', reasons: ['KIT_FACTS_NOT_RECORDED'] },
    { check: 'CREW_QUALIFIED', result: 'UNKNOWN', reasons: ['CREW_FACTS_NOT_RECORDED'] },
  ], reasons: ['CREW_FACTS_NOT_RECORDED', 'KIT_FACTS_NOT_RECORDED'] });
});
test('missing, incompatible, nonserviceable and other-cell boards FAIL, never UNKNOWN', () => {
  for (const boards of [[], [board({ approvedPrograms: ['OTHER'] })], [board({ condition: 'UNDER_REPAIR' })], [board({ condition: 'QUARANTINED' })], [board({ cellId: 'ATE-2' })]]) {
    const input = fixture(); input.inventory.boards = boards; const result = check(input);
    assert.deepEqual(result.checks[0], { check: 'LOADBOARD_AVAILABLE', result: 'FAIL', reasons: ['NO_COMPATIBLE_LOADBOARD'] }); assert.equal(result.status, 'BLOCKED');
  }
});
test('current holds and physical custody must agree; released history does not prevent availability', () => {
  for (const [cellId, reservations, expected] of [
    ['ATE-1', [hold()], 'PASS'], ['ATE-2', [hold({ cellId: 'ATE-2' })], 'FAIL'],
    [null, [hold()], 'FAIL'], ['ATE-1', [], 'FAIL'], ['ATE-1', [hold({ cellId: 'ATE-2' })], 'FAIL'],
    ['ATE-1', [hold(), hold({ reservationId: 'RES-2', cellId: 'ATE-2' })], 'FAIL'],
    [null, [hold({ status: 'RELEASED', releasedAt: at })], 'PASS'],
  ]) { const input = fixture(); input.inventory = { boards: [board({ cellId })], reservations }; assert.equal(check(input).checks[0].result, expected); }
});
test('actual cellReadiness packets work; EXPIRED and NO_CALIBRATION fail with CELL_NOT_READY', () => {
  const current = [{ calibrationId: 'CAL-1', instrumentId: 'PS-1', cellId: 'ATE-1', calibratedAt: '2026-10-01T00:00:00Z', dueAt: '2026-11-01T00:00:00Z' }];
  const input = fixture(); input.readiness = cellReadiness(current, 'ATE-1', at); assert.equal(check(input).checks[1].result, 'PASS');
  for (const rows of [[], [{ ...current[0], dueAt: at }]]) { input.readiness = cellReadiness(rows, 'ATE-1', at); assert.deepEqual(check(input).checks[1], { check: 'CELL_READY', result: 'FAIL', reasons: ['CELL_NOT_READY'] }); }
});
test('mismatched cell/time, invalid dates/status/shape and non-null reserved facts are input errors', () => {
  for (const mutate of [x => { x.readiness.cellId = 'ATE-2'; }, x => { x.readiness.at = '2026-10-24T15:00:00Z'; },
    x => { x.changeover.startsAt = '2026-02-30T00:00:00Z'; }, x => { x.readiness.readiness = 'UNKNOWN'; },
    x => { x.readiness.instruments = null; }, x => { x.readiness.extra = true; }, x => { x.inventory.boards[0].condition = 'BAD'; },
    x => { x.kitFacts = {}; }, x => { x.crewFacts = []; }, x => { delete x.kitFacts; },
    x => { x.changeover.ResponderSkill = 1; }, x => { x.extra = 1; }]) { const input = fixture(); mutate(input); assert.throws(() => check(input), TypeError); }
  const input = fixture(); input.readiness.at = '2026-10-24T14:00:00Z'; assert.equal(check(input).checks[1].result, 'PASS');
});
test('board selection is lexical and input order independent; inputs and returned values are independent', () => {
  const input = fixture(); input.inventory.boards.push(board({ boardId: 'LB-0001' }), board({ boardId: 'LB-9999' }));
  const before = structuredClone(input), first = check(input); input.inventory.boards.reverse(); const second = check(input);
  assert.deepEqual(second, first); assert.equal(first.checks[0].boardId, 'LB-0001');
  input.inventory.boards.reverse(); assert.deepEqual(input, before);
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }; freeze(input);
  assert.deepEqual(check(input), first); first.checks[0].boardId = 'CHANGED'; first.checks[2].reasons.push('CHANGED'); assert.deepEqual(check(input), second);
});
test('every slice-1 combination stays BLOCKED while required facts are UNKNOWN; union is sorted and complete', () => {
  for (const available of [true, false]) for (const ready of ['READY', 'EXPIRED', 'NO_CALIBRATION']) {
    const input = fixture(); input.inventory.boards = available ? [board()] : []; input.readiness.readiness = ready;
    const result = check(input); assert.equal(result.status, 'BLOCKED'); assert.equal(result.checks.filter(row => row.result === 'UNKNOWN').length, 2);
    assert.deepEqual(result.reasons, [...new Set(result.checks.flatMap(row => row.reasons))].sort());
    if (!available) assert.equal(Object.hasOwn(result.checks[0], 'boardId'), false);
  }
});
test('only inventory validation is imported, no clock/model/runtime dependencies, no planning fields or moved start', async () => {
  const source = await readFile(new URL('../src/changeover-readiness.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]); assert.deepEqual(imports, ['./loadboard-checkout.mjs']);
  assert.doesNotMatch(source, /Date\.now|new Date\(\)|Math\.random|\bfetch\s*\(/);
  const input = fixture(), result = check(input); assert.equal(result.startsAt, input.changeover.startsAt);
  assert.deepEqual(Object.keys(result).sort(), ['changeoverId', 'cellId', 'startsAt', 'status', 'checks', 'reasons'].sort());
  assert.doesNotMatch(JSON.stringify(result), /schedule|recommend|responder|crewId|assigned/i);
});
