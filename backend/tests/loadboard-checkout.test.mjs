import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkoutBoard, checkoutBatch, releaseBoard } from '../src/loadboard-checkout.mjs';

const morning = '2026-10-24T08:00:00.000Z';
const later = '2026-10-24T09:00:00.000Z';
const program = 'SR1260-P3';
const board = (boardId = 'LB-0412') => ({ boardId, revision: 'C', condition: 'SERVICEABLE', cellId: null, approvedPrograms: [program, 'CX4820-P1'] });
const inventory = () => ({ boards: [board(), board('LB-0398')], reservations: [] });
const request = (requestId = 'REQ-01', overrides = {}) => ({ requestId, boardId: 'LB-0412', cellId: 'ATE-1', programRevision: program, requestedAt: morning, ...overrides });
const held = (reservationId = 'RES-old', overrides = {}) => ({ reservationId, boardId: 'LB-0412', cellId: 'ATE-2', programRevision: program, status: 'HELD', heldSince: morning, ...overrides });

test('checkout allocates only an explicitly approved, serviceable in-store board and returns a copied inventory', () => {
  const input = inventory(), before = structuredClone(input), result = checkoutBoard(input, request());
  assert.equal(result.decision, 'ALLOCATED'); assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.reservation, { reservationId: 'RES-REQ-01', boardId: 'LB-0412', cellId: 'ATE-1', programRevision: program, status: 'HELD', heldSince: morning });
  assert.equal(result.inventory.reservations.length, 1); assert.equal(result.inventory.boards[0].cellId, 'ATE-1');
  assert.deepEqual(input, before); assert.notEqual(result.inventory, input);
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasons', 'inventory', 'reservation'].sort());
  result.inventory.boards[1].approvedPrograms.push('mutated-output'); assert.deepEqual(input, before);
});

test('compatibility is an exact revision-specific list, never inferred from similar names', () => {
  for (const programRevision of ['SR1260-P30', 'SR1260-P2', 'sr1260-p3', 'SR1260', 'UNKNOWN']) {
    const input = inventory(), result = checkoutBoard(input, request('R', { programRevision }));
    assert.equal(result.decision, 'REJECTED'); assert.deepEqual(result.reasons, ['PROGRAM_NOT_APPROVED']);
    assert.deepEqual(result.inventory, input); assert.equal(result.reservation, null);
  }
  const input = inventory(); input.boards[0].revision = 'D'; input.boards[0].approvedPrograms = ['SR1260-P4'];
  assert.deepEqual(checkoutBoard(input, request()).reasons, ['PROGRAM_NOT_APPROVED']);
});

test('repair and quarantine block checkout regardless of compatible program', () => {
  for (const condition of ['UNDER_REPAIR', 'QUARANTINED']) {
    const input = inventory(); input.boards[0].condition = condition;
    assert.deepEqual(checkoutBoard(input, request()).reasons, ['CONDITION_BLOCKED']);
  }
});

test('physical location and current held reservations independently block allocation', () => {
  const located = inventory(); located.boards[0].cellId = 'ATE-2';
  assert.deepEqual(checkoutBoard(located, request()).reasons, ['BOARD_NOT_IN_STORE']);
  const allocated = inventory(); allocated.reservations = [held()];
  assert.deepEqual(checkoutBoard(allocated, request()).reasons, ['BOARD_HELD']);
  const history = inventory(); history.reservations = [held('RES-history', { status: 'RELEASED', releasedAt: later })];
  assert.equal(checkoutBoard(history, request('NEW', { requestedAt: later })).decision, 'ALLOCATED');
});

test('cell occupancy blocks another board and every independently failing rule is returned in sorted order', () => {
  const input = inventory(); input.reservations = [held('RES-cell', { boardId: 'LB-0398', cellId: 'ATE-1' })];
  assert.deepEqual(checkoutBoard(input, request()).reasons, ['CELL_ALREADY_HOLDING']);
  input.reservations.push(held()); input.boards[0].cellId = 'ATE-2'; input.boards[0].condition = 'QUARANTINED';
  const result = checkoutBoard(input, request('FAIL', { programRevision: 'SR1260-P30' }));
  assert.equal(result.decision, 'REJECTED');
  assert.deepEqual(result.reasons, ['BOARD_HELD', 'BOARD_NOT_IN_STORE', 'CELL_ALREADY_HOLDING', 'CONDITION_BLOCKED', 'PROGRAM_NOT_APPROVED']);
});

test('unknown boards are rejected without inventing condition or compatibility facts; independent held/cell rules still apply', () => {
  const input = inventory();
  assert.deepEqual(checkoutBoard(input, request('X', { boardId: 'LB-UNKNOWN' })).reasons, ['BOARD_UNKNOWN']);
  input.reservations = [held('RES-missing', { boardId: 'LB-UNKNOWN', cellId: 'ATE-1' })];
  assert.deepEqual(checkoutBoard(input, request('X', { boardId: 'LB-UNKNOWN' })).reasons, ['BOARD_HELD', 'BOARD_UNKNOWN', 'CELL_ALREADY_HOLDING']);
});

test('simultaneous competing batch requests allocate the lower requestId exactly once with deterministic inventory threading', () => {
  const input = inventory(), before = structuredClone(input);
  const requests = [request('B', { cellId: 'ATE-2' }), request('A')], saved = structuredClone(requests);
  const result = checkoutBatch(input, requests);
  assert.deepEqual(result.decisions.map(row => row.decision), ['ALLOCATED', 'REJECTED']);
  assert.deepEqual(result.decisions.map(row => row.requestId), ['A', 'B']);
  assert.equal(result.decisions[0].reservation.reservationId, 'RES-A'); assert.ok(result.decisions[1].reasons.includes('BOARD_HELD'));
  assert.equal(result.inventory.reservations.length, 1); assert.equal(result.inventory.boards[0].cellId, 'ATE-1');
  assert.deepEqual(checkoutBatch(input, [...requests].reverse()), result);
  assert.deepEqual(input, before); assert.deepEqual(requests, saved);
});

test('batch orders timestamp first, then requestId lexically, without copying full history into each decision', () => {
  const input = inventory();
  const requests = [request('A', { requestedAt: later }), request('Z', { cellId: 'ATE-2' }), request('third', { boardId: 'LB-0398', cellId: 'ATE-3', requestedAt: later })];
  const result = checkoutBatch(input, requests);
  assert.equal(result.decisions[0].reservation.reservationId, 'RES-Z');
  assert.equal(result.decisions[1].decision, 'REJECTED'); assert.equal(result.decisions[2].decision, 'ALLOCATED');
  assert.equal(result.inventory.reservations.length, 2);
  assert.ok(result.decisions.every(row => !Object.hasOwn(row, 'inventory')));
  assert.deepEqual(result.decisions[0].reservation, result.inventory.reservations[0]);
  assert.deepEqual(checkoutBatch(input, []), { inventory: input, decisions: [] });
  const tie = checkoutBatch(inventory(), [request('a'), request('Z', { requestedAt: '2026-10-24T08:00:00Z' })]);
  assert.equal(tie.decisions[0].reservation.reservationId, 'RES-Z');
});

test('a batch allocates at most one board to a cell, including competing requests for different boards', () => {
  const result = checkoutBatch(inventory(), [request('B', { boardId: 'LB-0398' }), request('A')]);
  assert.deepEqual(result.decisions.map(row => row.decision), ['ALLOCATED', 'REJECTED']);
  assert.deepEqual(result.decisions[1].reasons, ['CELL_ALREADY_HOLDING']);
  assert.equal(result.inventory.boards[1].cellId, null);
});

test('release returns a board to store, retains released history and allows a new request', () => {
  const allocated = checkoutBoard(inventory(), request()), before = structuredClone(allocated.inventory);
  const release = { reservationId: allocated.reservation.reservationId, releasedAt: later, cellId: 'ATE-1' };
  const result = releaseBoard(allocated.inventory, release);
  assert.equal(result.decision, 'RELEASED'); assert.deepEqual(result.reasons, []);
  assert.equal(result.inventory.boards[0].cellId, null); assert.equal(result.inventory.reservations[0].status, 'RELEASED');
  assert.equal(result.reservation.releasedAt, later); assert.deepEqual(allocated.inventory, before);
  const next = checkoutBoard(result.inventory, request('REQ-02', { cellId: 'ATE-2', requestedAt: later }));
  assert.equal(next.decision, 'ALLOCATED'); assert.equal(next.inventory.reservations.length, 2);
  assert.equal(next.inventory.reservations[0].status, 'RELEASED'); assert.equal(next.inventory.reservations[1].status, 'HELD');
});

test('wrong-cell, unknown and repeated releases reject with an unchanged independent inventory', () => {
  const allocated = checkoutBoard(inventory(), request());
  for (const release of [
    { reservationId: 'RES-REQ-01', cellId: 'ATE-2', releasedAt: later },
    { reservationId: 'RES-MISSING', cellId: 'ATE-1', releasedAt: later },
  ]) {
    const before = structuredClone(allocated.inventory), result = releaseBoard(allocated.inventory, release);
    assert.equal(result.decision, 'REJECTED'); assert.deepEqual(result.reasons, ['NO_HELD_RESERVATION']);
    assert.deepEqual(result.inventory, before); assert.notEqual(result.inventory, allocated.inventory); assert.deepEqual(allocated.inventory, before);
  }
  const release = { reservationId: 'RES-REQ-01', cellId: 'ATE-1', releasedAt: later };
  const released = releaseBoard(allocated.inventory, release);
  assert.deepEqual(releaseBoard(released.inventory, release).reasons, ['NO_HELD_RESERVATION']);
});

test('rejected checkout leaves every input unchanged, including nested compatibility and reservation history', () => {
  const input = inventory(); input.reservations = [held()]; const before = structuredClone(input);
  const wanted = request(), saved = structuredClone(wanted), result = checkoutBoard(input, wanted);
  assert.equal(result.decision, 'REJECTED'); assert.deepEqual(result.inventory, before); assert.notEqual(result.inventory, input);
  result.inventory.boards[0].approvedPrograms.push('MUTATED'); result.inventory.reservations[0].cellId = 'OTHER';
  assert.deepEqual(input, before); assert.deepEqual(wanted, saved);
});

test('checkout, batch and release are deterministic and import/clock/API free', () => {
  const source = readFileSync(new URL('../src/loadboard-checkout.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\b|\bimport\s*\(|\brequire\s*\(|Date\.now\s*\(|\bfetch\s*\(/m);
  const input = inventory(), expected = checkoutBatch(input, [request('A'), request('B')]), original = Date.now;
  try {
    Date.now = () => { throw Error('clock forbidden'); };
    assert.deepEqual(checkoutBatch(input, [request('B'), request('A')]), expected);
    const one = checkoutBoard(input, request());
    assert.equal(releaseBoard(one.inventory, { reservationId: one.reservation.reservationId, cellId: 'ATE-1', releasedAt: later }).decision, 'RELEASED');
  } finally { Date.now = original; }
});

test('malformed identities/history and hidden fields cannot silently allocate or corrupt reservation history', () => {
  for (const change of [
    input => { input.boards.push(board()); }, input => { input.reservations = [held(), held()]; },
    input => { input.boards[0].condition = 'UNKNOWN'; }, input => { input.boards[0].ResponderSkill = 'never-public'; },
    input => { input.boards[0].approvedPrograms = new Array(1); },
  ]) {
    const input = inventory(); change(input); assert.throws(() => checkoutBoard(input, request()), TypeError);
  }
  assert.throws(() => checkoutBoard(inventory(), request('X', { requestedAt: '2026-02-30T00:00:00Z' })), TypeError);
  assert.throws(() => checkoutBatch(inventory(), [request('A'), request('A')]), TypeError);
  assert.throws(() => checkoutBatch(inventory(), new Array(1)), TypeError);
  const one = checkoutBoard(inventory(), request()), release = { reservationId: one.reservation.reservationId, cellId: 'ATE-1', releasedAt: later };
  assert.throws(() => releaseBoard(one.inventory, { ...release, releasedAt: '2026-10-24T07:00:00Z' }), TypeError);
  const released = releaseBoard(one.inventory, release);
  assert.throws(() => checkoutBoard(released.inventory, request('REQ-01', { requestedAt: later })), /requestId already used/);
});
