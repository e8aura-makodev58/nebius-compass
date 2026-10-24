import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readDurableLiveState } from '../src/live-journal.mjs';
import { createLiveStore } from '../src/live-store.mjs';
import { migrateLiveState } from '../src/live-migration.mjs';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { createInitialDemoState } from '../src/demo-state.mjs';
import { createDemoRuntime } from '../src/offline-runtime.mjs';
import { createLiveRuntime, createApplicationRuntime } from '../src/live-runtime.mjs';
import { createTempAuditStore } from './helpers/temp-audit-store.mjs';
import { createRequestHandler } from '../src/server.mjs';
import { buildConsumableObligations } from '../src/consumable-obligations.mjs';
import { evaluateConsumableLife } from '../src/consumable-life.mjs';
import { reconcileConsumableObligations, applyConsumableObligationChanges } from '../src/consumable-life-obligations.mjs';
import { assertNoResponderSkill } from '../src/live-schema.mjs';

const checkout = (requestId = 'REQ-A', overrides = {}) => ({ requestId, boardId: 'LB-0412', cellId: 'ATE-1', programRevision: 'SR1260-P3', ...overrides });
const inventory = () => ({ boards: [
  { boardId: 'LB-0412', revision: 'C', condition: 'SERVICEABLE', cellId: null, approvedPrograms: ['SR1260-P3'] },
  { boardId: 'LB-0398', revision: 'B', condition: 'SERVICEABLE', cellId: null, approvedPrograms: ['PM0096-P2'] },
], reservations: [] });
async function scratch(t) {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'loadboard-routes-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
function handlerFor(runtime, other) {
  return createRequestHandler({ getRoom: id => {
    const active = id === 'plant-1' ? runtime : id === 'plant-2' ? other : null;
    return active ? { id, health: 'READY', applicationRuntime: active } : null;
  } });
}
async function request(handler, path, body, { room = 'plant-1', method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(stream, { method, url: `/api/control-rooms/${room}${path}`, headers: { host: 'app.test', 'content-type': 'application/json', ...headers } });
  let status, value; await handler(stream, { writeHead(code) { status = code; }, end(text) { value = JSON.parse(text); } });
  return { status, body: value };
}
async function live(t, options = {}) {
  const directory = await scratch(t), filePath = join(directory, 'room.json');
  const seedFactory = () => ({ ...migrateLiveState(createLiveSeed()), loadboardInventory: inventory() });
  const store = createLiveStore({ filePath, seedFactory, historyRetentionDays: 0, ...options });
  await store.snapshot();
  const forbidden = () => { throw Error('provider forbidden'); };
  const runtime = createLiveRuntime({ store, agentOptions: forbidden, plannerOptions: forbidden });
  return { store, runtime, filePath, handler: handlerFor(runtime) };
}

test('concurrent HTTP checkouts of one board serialize through the real journal and allocate only once', async t => {
  const { store, handler } = await live(t), before = await store.snapshot();
  const results = await Promise.all([
    request(handler, '/loadboards/checkout', checkout('REQ-A')),
    request(handler, '/loadboards/checkout', checkout('REQ-B', { cellId: 'ATE-2' })),
  ]);
  assert.ok(results.every(row => row.status === 200));
  assert.deepEqual(results.map(row => row.body.decision).sort(), ['ALLOCATED', 'REJECTED']);
  assert.ok(results.find(row => row.body.decision === 'REJECTED').body.reasons.includes('BOARD_HELD'));
  const after = await store.snapshot(); assert.equal(after.loadboardInventory.reservations.length, 1);
  assert.equal(after.loadboardInventory.reservations[0].heldSince, before.simulationState.simulationTime);
  assert.equal(after.simulationState.simulationTime, before.simulationState.simulationTime);
  for (const result of results) {
    assert.deepEqual(Object.keys(result.body).sort(), ['decision', 'reasons', 'reservation']); assertNoResponderSkill(result.body);
  }
});

test('a concurrent retry and a post-restart retry cannot create another reservation for the same requestId', async t => {
  const { store, handler, filePath } = await live(t);
  await Promise.all([request(handler, '/loadboards/checkout', checkout()), request(handler, '/loadboards/checkout', checkout())]);
  assert.equal((await store.snapshot()).loadboardInventory.reservations.length, 1);
  const restarted = createLiveStore({ filePath, historyRetentionDays: 0 }), runtime = createLiveRuntime({ store: restarted });
  const retry = await request(handlerFor(runtime), '/loadboards/checkout', checkout());
  assert.equal(retry.status, 200); assert.equal(retry.body.decision, 'REJECTED');
  assert.equal((await restarted.snapshot()).loadboardInventory.reservations.length, 1);
});

test('concurrent checkouts of different boards cannot allocate one cell twice', async t => {
  const { store, handler } = await live(t);
  const results = await Promise.all([
    request(handler, '/loadboards/checkout', checkout('FIRST')),
    request(handler, '/loadboards/checkout', checkout('SECOND', { boardId: 'LB-0398', programRevision: 'PM0096-P2' })),
  ]);
  assert.equal(results.filter(row => row.body.decision === 'ALLOCATED').length, 1);
  assert.ok(results.find(row => row.body.decision === 'REJECTED').body.reasons.includes('CELL_ALREADY_HOLDING'));
  assert.equal((await store.snapshot()).loadboardInventory.reservations.length, 1);
});

test('release rejects the wrong cell, uses the current simulation time and preserves history for a new checkout', async t => {
  const { store, handler } = await live(t);
  const allocated = await request(handler, '/loadboards/checkout', checkout());
  const reservationId = allocated.body.reservation.reservationId, before = await store.snapshot();
  const wrong = await request(handler, '/loadboards/release', { reservationId, cellId: 'ATE-2' });
  assert.equal(wrong.status, 200); assert.deepEqual(wrong.body, { decision: 'REJECTED', reasons: ['NO_HELD_RESERVATION'], reservation: null });
  assert.deepEqual((await store.snapshot()).loadboardInventory, before.loadboardInventory);
  await store.mutate('advance-clock-for-test', state => { state.simulationState.simulationTime = '2026-09-01T09:00:00.000Z'; });
  const released = await request(handler, '/loadboards/release', { reservationId, cellId: 'ATE-1' });
  assert.equal(released.status, 200); assert.equal(released.body.decision, 'RELEASED');
  assert.equal(released.body.reservation.releasedAt, '2026-09-01T09:00:00.000Z');
  assert.equal((await store.snapshot()).loadboardInventory.boards[0].cellId, null);
  const reused = await request(handler, '/loadboards/checkout', checkout()); assert.equal(reused.status, 400);
  const next = await request(handler, '/loadboards/checkout', checkout('REQ-NEW')); assert.equal(next.body.decision, 'ALLOCATED');
  assert.deepEqual((await store.snapshot()).loadboardInventory.reservations.map(row => row.status), ['RELEASED', 'HELD']);
});

test('malformed bodies and client timestamps fail before entering the write queue', async t => {
  const { store, handler } = await live(t), before = await store.snapshot();
  for (const body of [null, [], {}, { ...checkout(), requestId: '' }, { ...checkout(), cellId: 1 }, { ...checkout(), extra: true },
    { ...checkout(), requestedAt: '2099-01-01T00:00:00Z' }, { ...checkout(), requestId: 'trueMedianMinutes' }]) {
    const result = await request(handler, '/loadboards/checkout', body);
    assert.equal(result.status, 400); assert.equal(result.body.code, 'INVALID_LOADBOARD_REQUEST');
  }
  assert.equal((await request(handler, '/loadboards/release', { reservationId: 'RES-A', cellId: 'ATE-1', releasedAt: '2099' })).status, 400);
  assert.deepEqual(await store.snapshot(), before);
  const missing = await request(handler, '/loadboards/checkout', checkout('UNKNOWN', { boardId: 'LB-MISSING' }));
  assert.equal(missing.status, 200); assert.deepEqual(missing.body.reasons, ['BOARD_UNKNOWN']);
});

test('existing JSON/origin mutation guards apply and rooms remain isolated', async t => {
  const first = await live(t), second = await live(t), handler = handlerFor(first.runtime, second.runtime);
  assert.equal((await request(handler, '/loadboards/checkout', checkout(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(handler, '/loadboards/checkout', checkout(), { headers: { origin: 'https://hostile.test' } })).status, 403);
  assert.equal((await request(handler, '/loadboards/checkout', checkout(), { room: 'missing' })).status, 404);
  assert.equal((await request(handler, '/loadboards/checkout', checkout())).body.decision, 'ALLOCATED');
  assert.equal((await request(handler, '/loadboards/checkout', checkout(), { room: 'plant-2' })).body.decision, 'ALLOCATED');
  assert.equal((await first.store.snapshot()).loadboardInventory.reservations.length, 1);
  assert.equal((await second.store.snapshot()).loadboardInventory.reservations.length, 1);
});

test('a failed checkout journal write publishes no reservation and a retry succeeds after the queue recovers', async t => {
  let fail = true;
  const { store, handler } = await live(t, { beforeCommit: ({ label }) => {
    if (label === 'loadboard-checkout' && fail) { fail = false; throw Error('synthetic persistence failure'); }
  } });
  const before = await store.snapshot(), result = await request(handler, '/loadboards/checkout', checkout());
  assert.equal(result.status, 500); assert.deepEqual(await store.snapshot(), before);
  const retry = await request(handler, '/loadboards/checkout', checkout()); assert.equal(retry.body.decision, 'ALLOCATED');
  assert.equal((await store.snapshot()).loadboardInventory.reservations.length, 1);
});

test('Offline checkout/release obey the same rules, use the simulation clock and never call a provider', async () => {
  const original = globalThis.fetch; let now = 0;
  try {
    globalThis.fetch = () => { throw Error('network forbidden'); };
    const seed = createInitialDemoState(); seed.loadboardInventory = inventory(); const saved = structuredClone(seed);
    const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => now, seedFactory: () => seed });
    const runtime = createApplicationRuntime({ liveRuntime: {}, offlineRuntime: offline, initialMode: 'OFFLINE' }), handler = handlerFor(runtime);
    const asOf = (await request(handler, '/loadboards')).body.asOf; now += 86_400_000;
    const results = await Promise.all([request(handler, '/loadboards/checkout', checkout('A')), request(handler, '/loadboards/checkout', checkout('B', { cellId: 'ATE-2' }))]);
    const allocated = results.find(row => row.body.decision === 'ALLOCATED');
    assert.equal(results.filter(row => row.body.decision === 'ALLOCATED').length, 1); assert.equal(allocated.body.reservation.heldSince, asOf);
    const release = { reservationId: allocated.body.reservation.reservationId, cellId: 'ATE-1' };
    assert.equal((await request(handler, '/loadboards/release', { ...release, cellId: 'WRONG' })).body.decision, 'REJECTED');
    assert.equal((await request(handler, '/loadboards/release', release)).body.decision, 'RELEASED');
    assert.equal((await request(handler, '/loadboards/checkout', checkout('NEW'))).body.decision, 'ALLOCATED');
    assert.deepEqual(seed, saved);
  } finally { globalThis.fetch = original; }
});

function obligations() {
  const input = { policy: { policyId: 'CARE-A', version: 1, componentFamily: 'FT_SOCKET', counterUnit: 'ACTUATIONS', cleanEvery: 50_000, lifetimeLimit: 2_000_000, warnFraction: .9 },
    asset: { assetId: 'SOCKET-A', lifecycleId: 'SOCKET-A#1', policyId: 'CARE-A', installedAt: '2026-08-01T00:00:00Z' },
    readings: [{ observedAt: '2026-08-10T06:00:00Z', lifetimeCount: 60_000, unit: 'ACTUATIONS' }], cleanings: [] };
  const openedAt = '2026-09-01T07:50:00.000Z', first = reconcileConsumableObligations({ open: [], evaluations: [evaluateConsumableLife(input)], observedAt: openedAt }).open;
  input.cleanings = [{ cleanedAt: input.readings[0].observedAt, lifetimeCountAtClean: 60_000 }];
  return applyConsumableObligationChanges(first, reconcileConsumableObligations({ open: first, evaluations: [evaluateConsumableLife(input)], observedAt: openedAt }));
}

test('consumable-obligations GET returns explicit persisted rows, without reconciliation or private source fields', async t => {
  const { store, handler } = await live(t);
  await store.mutate('synthetic-obligations', state => { state.consumableObligations = obligations(); });
  const before = await store.snapshot(), result = await request(handler, '/consumable-obligations');
  assert.equal(result.status, 200); assert.deepEqual(Object.keys(result.body).sort(), ['asOf', 'obligations', 'roomId']);
  assert.deepEqual(result.body.obligations, before.consumableObligations); assert.deepEqual(await store.snapshot(), before);
  assertNoResponderSkill(result.body); assert.equal(result.body.obligations[0].closeReason, 'CLEANED');
  assert.deepEqual((await request(handler, '/consumable-obligations', undefined, { room: 'missing' })).body, { error: 'Unknown control room: missing' });
  const raw = { simulationState: before.simulationState, consumableObligations: before.consumableObligations.map(row => ({ ...row, privateCanary: 'never-public' })), consumableInputs: ['never-public'] };
  assert.deepEqual(buildConsumableObligations(raw).obligations, before.consumableObligations);
  assert.doesNotMatch(JSON.stringify(buildConsumableObligations(raw)), /never-public|consumableInputs/);
});

test('empty and populated Offline obligation reads use the same builder without advancing time', async () => {
  let now = 0;
  const runtime = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => now, seedFactory: () => ({ ...createInitialDemoState(), consumableObligations: obligations() }) });
  const handler = handlerFor(runtime), before = await request(handler, '/consumable-obligations'); now += 86_400_000;
  assert.equal(before.status, 200); assert.equal(before.body.obligations.length, 1); assert.deepEqual(await request(handler, '/consumable-obligations'), before);
  assert.deepEqual(buildConsumableObligations({ simulationState: { simulationTime: before.body.asOf } }).obligations, []);
});


test('checkout/release journal only changed custody rows even with substantial released history', async t => {
  const seedFactory = () => {
    const state = migrateLiveState(createLiveSeed()); state.loadboardInventory = inventory();
    state.loadboardInventory.reservations = Array.from({ length: 500 }, (_, index) => ({ reservationId: `RES-OLD-${index}`,
      boardId: 'LB-0412', cellId: 'ATE-1', programRevision: 'SR1260-P3', status: 'RELEASED', heldSince: '2026-09-01T07:00:00Z', releasedAt: '2026-09-01T07:01:00Z' }));
    return state;
  };
  const { store, handler, filePath } = await live(t, { seedFactory });
  const allocated = await request(handler, '/loadboards/checkout', checkout());
  assert.equal(allocated.body.decision, 'ALLOCATED');
  const released = await request(handler, '/loadboards/release', { reservationId: allocated.body.reservation.reservationId, cellId: 'ATE-1' });
  assert.equal(released.body.decision, 'RELEASED');
  const lines = (await readFile(`${filePath}.journal`, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.ok(Buffer.byteLength(line) < 5000, 'command must not rewrite all reservation history');
    const frame = JSON.parse(JSON.parse(line).payload);
    assert.ok(frame.patches.filter(patch => patch.path[0] === 'loadboardInventory').every(patch => patch.path.length >= 3));
  }
  assert.equal((await store.snapshot()).loadboardInventory.reservations.length, 501);
  assert.deepEqual(await readDurableLiveState(filePath), await store.snapshot());
});


const calibration = overrides => ({ calibrationId: 'CAL-ENTRY', cellId: 'ATE-1', instrumentId: 'ENTRY-PS', calibratedAt: '2026-08-01T08:00:00Z', dueAt: '2027-08-01T08:00:00Z', ...overrides });
test('checkout route fails closed for missing/expired calibrations and entry enables checkout at the room clock', async t => {
  const { store, handler } = await live(t);
  await store.mutate('remove-calibrations', state => { state.calibrations = []; });
  const before = await store.snapshot();
  const missing = await request(handler, '/loadboards/checkout', checkout());
  assert.equal(missing.status, 200); assert.deepEqual(missing.body.reasons, ['CELL_NOT_READY']);
  assert.deepEqual((await store.snapshot()).loadboardInventory, before.loadboardInventory);
  const expired = calibration({ dueAt: before.simulationState.simulationTime });
  assert.deepEqual((await request(handler, '/calibrations', expired)).body, { decision: 'RECORDED', reasons: [] });
  assert.equal((await request(handler, '/cell-readiness')).body.cells[0].readiness, 'EXPIRED');
  assert.ok((await request(handler, '/loadboards/checkout', checkout())).body.reasons.includes('CELL_NOT_READY'));
  const current = calibration({ calibrationId: 'CAL-RENEW', calibratedAt: before.simulationState.simulationTime });
  assert.equal((await request(handler, '/calibrations', current)).body.decision, 'RECORDED');
  assert.equal((await request(handler, '/cell-readiness')).body.cells[0].readiness, 'READY');
  const allocated = await request(handler, '/loadboards/checkout', checkout());
  assert.equal(allocated.body.decision, 'ALLOCATED'); assert.equal(allocated.body.reservation.heldSince, before.simulationState.simulationTime);
});
test('entry validates before queue, rejects concurrent conflicting identities and retries without duplicate history', async t => {
  const { store, handler, filePath } = await live(t); const before = await store.snapshot();
  for (const body of [{}, { ...calibration(), extra: 1 }, calibration({ dueAt: 'bad' }), calibration({ dueAt: '2026-07-01T00:00:00Z' }), calibration({ instrumentId: 'responderSkills' })]) {
    assert.equal((await request(handler, '/calibrations', body)).status, 400);
  }
  assert.deepEqual(await store.snapshot(), before);
  const results = await Promise.all([request(handler, '/calibrations', calibration()), request(handler, '/calibrations', calibration({ dueAt: '2028-08-01T08:00:00Z' }))]);
  assert.deepEqual(results.map(x => x.status).sort(), [200, 400]);
  const added = (await store.snapshot()).calibrations.find(x => x.calibrationId === 'CAL-ENTRY');
  assert.deepEqual((await request(handler, '/calibrations', added)).body, { decision: 'UNCHANGED', reasons: [] });
  assert.equal((await store.snapshot()).calibrations.filter(x => x.calibrationId === 'CAL-ENTRY').length, 1);
  assert.equal((await request(handler, '/calibrations', { ...added, calibrationId: 'SAME-INSTANT' })).status, 400);
  const restarted = createLiveStore({ filePath, historyRetentionDays: 0 });
  assert.equal((await request(handlerFor(createLiveRuntime({ store: restarted })), '/calibrations', added)).body.decision, 'UNCHANGED');
  assert.equal((await request(handler, '/calibrations', calibration(), { room: 'unknown' })).status, 404);
  assert.equal((await request(handler, '/calibrations', calibration(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(handler, '/calibrations', calibration(), { headers: { origin: 'https://other.test' } })).status, 403);
});
test('calibration entries and checkout share the real write queue; read ledger is immutable and room-scoped', async t => {
  const { store, runtime } = await live(t), other = await live(t);
  await store.mutate('clear', state => { state.calibrations = []; });
  const handler = handlerFor(runtime, other.runtime);
  const [entry, allocation] = await Promise.all([request(handler, '/calibrations', calibration()), request(handler, '/loadboards/checkout', checkout())]);
  assert.equal(entry.status, 200); assert.equal(allocation.body.decision, 'ALLOCATED');
  const before = await store.snapshot(), read = await request(handler, '/calibrations');
  assert.equal(read.body.roomId, 'plant-1'); assert.equal(read.body.asOf, before.simulationState.simulationTime);
  assert.equal(read.body.calibrations[0].state, 'CURRENT');
  assert.deepEqual(Object.keys(read.body.calibrations[0]).sort(), ['calibrationId', 'cellId', 'instrumentId', 'calibratedAt', 'dueAt', 'state'].sort());
  assert.deepEqual(await store.snapshot(), before); assert.equal((await request(handler, '/calibrations', undefined, { room: 'plant-2' })).body.calibrations.some(x => x.calibrationId === 'CAL-ENTRY'), false);
});
test('failed calibration journal entry rolls back and retry recovers', async t => {
  let fail = false; const { store, handler } = await live(t, { beforeCommit: () => { if (fail) throw Error('entry fault'); } });
  const before = await store.snapshot(); fail = true;
  assert.equal((await request(handler, '/calibrations', calibration())).status, 500);
  assert.deepEqual(await store.snapshot(), before); fail = false;
  assert.equal((await request(handler, '/calibrations', calibration())).body.decision, 'RECORDED');
});
test('Offline manual entry and gated checkout use identical rules without providers', async () => {
  const seedFactory = () => ({ ...createInitialDemoState(), loadboardInventory: inventory(), calibrations: [] });
  const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => 0, seedFactory });
  const runtime = createApplicationRuntime({ liveRuntime: {}, offlineRuntime: offline, initialMode: 'OFFLINE' });
  const handler = handlerFor(runtime), original = globalThis.fetch; globalThis.fetch = () => { throw Error('network forbidden'); };
  try {
    assert.ok((await request(handler, '/loadboards/checkout', checkout())).body.reasons.includes('CELL_NOT_READY'));
    const at = (await request(handler, '/calibrations')).body.asOf;
    const current = calibration({ calibratedAt: at });
    assert.equal((await request(handler, '/calibrations', current)).body.decision, 'RECORDED');
    assert.equal((await request(handler, '/calibrations', current)).body.decision, 'UNCHANGED');
    assert.equal((await request(handler, '/calibrations', { ...current, dueAt: at })).status, 400);
    assert.equal((await request(handler, '/loadboards/checkout', checkout())).body.decision, 'ALLOCATED');
    assert.equal((await request(handler, '/calibrations')).body.asOf, at);
  } finally { globalThis.fetch = original; }
});
test('both room instances have independent READY calibration seeds in Live and Offline', async t => {
  const first = await live(t), second = await live(t), handler = handlerFor(first.runtime, second.runtime);
  for (const room of ['plant-1', 'plant-2']) {
    const response = await request(handler, '/cell-readiness', undefined, { room });
    assert.deepEqual(response.body.cells.map(x => [x.cellId, x.readiness]), [['ATE-1', 'READY'], ['ATE-2', 'READY']]);
  }
  for (let index = 0; index < 2; index++) {
    const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => 0 });
    assert.deepEqual(offline.cellReadiness().cells.map(x => [x.cellId, x.readiness]), [['ATE-1', 'READY'], ['ATE-2', 'READY']]);
  }
});

const newBoard = overrides => ({ boardId: 'LB-NEW', revision: 'A', condition: 'SERVICEABLE', approvedPrograms: ['SR1260-P3'], ...overrides });
test('board entry defaults to store, accepts existing cells and rejects duplicate or unknown cell without changing inventory', async t => {
  const { store, handler } = await live(t);
  assert.deepEqual((await request(handler, '/loadboards/boards', newBoard())).body, { decision: 'ADDED', reasons: [] });
  assert.equal((await store.snapshot()).loadboardInventory.boards.find(row => row.boardId === 'LB-NEW').cellId, null);
  const before = await store.snapshot(); assert.equal((await request(handler, '/loadboards/boards', newBoard())).status, 400);
  assert.deepEqual(await store.snapshot(), before);
  assert.equal((await request(handler, '/loadboards/boards', newBoard({ boardId: 'LB-CELL', cellId: 'ATE-2' }))).status, 200);
  const after = await store.snapshot();
  assert.equal((await request(handler, '/loadboards/boards', newBoard({ boardId: 'LB-BAD', cellId: 'UNKNOWN' }))).status, 400);
  assert.deepEqual(await store.snapshot(), after); assert.deepEqual(after.loadboardInventory.reservations, []);
});
test('concurrent duplicate board entries serialize to one addition and malformed input fails before writes', async t => {
  const { store, handler } = await live(t), before = await store.snapshot();
  for (const body of [{}, newBoard({ extra: true }), newBoard({ condition: 'UNKNOWN' }), newBoard({ approvedPrograms: 'P3' }), newBoard({ approvedPrograms: ['responderSkills'] }), newBoard({ cellId: '' })]) assert.equal((await request(handler, '/loadboards/boards', body)).status, 400);
  assert.deepEqual(await store.snapshot(), before);
  const results = await Promise.all([request(handler, '/loadboards/boards', newBoard()), request(handler, '/loadboards/boards', newBoard())]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 400]);
  assert.equal((await store.snapshot()).loadboardInventory.boards.filter(row => row.boardId === 'LB-NEW').length, 1);
  assert.equal((await request(handler, '/loadboards/boards', newBoard(), { room: 'unknown' })).status, 404);
  assert.equal((await request(handler, '/loadboards/boards', newBoard(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(handler, '/loadboards/boards', newBoard(), { headers: { origin: 'https://other.test' } })).status, 403);
});
test('board entry journal failure rolls back and a retry recovers', async t => {
  let fail = false; const { store, handler } = await live(t, { beforeCommit: () => { if (fail) throw Error('board fault'); } });
  const before = await store.snapshot(); fail = true;
  assert.equal((await request(handler, '/loadboards/boards', newBoard())).status, 500); assert.deepEqual(await store.snapshot(), before);
  fail = false; assert.equal((await request(handler, '/loadboards/boards', newBoard())).body.decision, 'ADDED');
});
test('Offline board entry uses the same rules, supports absent inventory and enables checkout without network', async () => {
  const runtime = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => 0 });
  const handler = handlerFor(runtime), original = globalThis.fetch; globalThis.fetch = () => { throw Error('network forbidden'); };
  try {
    assert.equal((await request(handler, '/loadboards/boards', newBoard())).body.decision, 'ADDED');
    assert.equal((await request(handler, '/loadboards/boards', newBoard())).status, 400);
    assert.equal((await request(handler, '/loadboards/boards', newBoard({ boardId: 'OTHER', cellId: 'UNKNOWN' }))).status, 400);
    assert.equal((await request(handler, '/loadboards/checkout', checkout('OFFLINE-NEW', { boardId: 'LB-NEW' }))).body.decision, 'ALLOCATED');
  } finally { globalThis.fetch = original; }
});
