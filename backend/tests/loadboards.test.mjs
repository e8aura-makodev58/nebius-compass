import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildLoadboards } from '../src/loadboards.mjs';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { createLiveRuntime, createApplicationRuntime } from '../src/live-runtime.mjs';
import { createLiveStore } from '../src/live-store.mjs';
import { createDemoRuntime } from '../src/offline-runtime.mjs';
import { createTempAuditStore } from './helpers/temp-audit-store.mjs';
import { createRequestHandler } from '../src/server.mjs';
import { assertNoResponderSkill } from '../src/live-schema.mjs';

const asOf = '2026-10-24T09:00:00.000Z';
function fixture() {
  return { simulationState: { simulationTime: asOf }, loadboardInventory: {
    boards: [
      { boardId: 'LB-0412', revision: 'C', condition: 'SERVICEABLE', cellId: 'ATE-1', approvedPrograms: ['SR1260-P3'] },
      { boardId: 'LB-0398', revision: 'B', condition: 'UNDER_REPAIR', cellId: null, approvedPrograms: ['PM0096-P2'] },
    ],
    reservations: [
      { reservationId: 'RES-OLD', boardId: 'LB-0398', cellId: 'ATE-2', programRevision: 'PM0096-P2', status: 'RELEASED', heldSince: '2026-10-23T08:00:00Z', releasedAt: '2026-10-23T09:00:00Z' },
      { reservationId: 'RES-NEW', boardId: 'LB-0412', cellId: 'ATE-1', programRevision: 'SR1260-P3', status: 'HELD', heldSince: '2026-10-24T08:00:00Z' },
    ],
  } };
}
async function get(handler, room = 'plant-1') {
  const request = Readable.from([]);
  Object.assign(request, { method: 'GET', url: `/api/control-rooms/${room}/loadboards`, headers: { host: 'app.test' } });
  let status, body;
  await handler(request, { writeHead(code) { status = code; }, end(text) { body = JSON.parse(text); } });
  return { status, body };
}

test('empty loadboard rooms return the exact public response without manufacturing inventory', () => {
  const state = { simulationState: { simulationTime: asOf } }, before = structuredClone(state);
  assert.deepEqual(buildLoadboards(state, { roomId: 'plant-1' }), { roomId: 'plant-1', asOf, boards: [] });
  assert.deepEqual(state, before);
  assert.deepEqual(buildLoadboards({ ...state, loadboardInventory: { boards: [], reservations: [] } }, { roomId: 'plant-2' }), { roomId: 'plant-2', asOf, boards: [] });
});

test('loadboard projection preserves board order, links only HELD reservations and omits arbitrary/private source metadata', () => {
  const state = fixture(), before = structuredClone(state), expected = buildLoadboards(state, { roomId: 'plant-1' });
  assert.deepEqual(expected.boards, [
    { boardId: 'LB-0412', revision: 'C', condition: 'SERVICEABLE', cellId: 'ATE-1', approvedPrograms: ['SR1260-P3'], heldBy: 'RES-NEW' },
    { boardId: 'LB-0398', revision: 'B', condition: 'UNDER_REPAIR', cellId: null, approvedPrograms: ['PM0096-P2'], heldBy: null },
  ]);
  state.loadboardInventory.privateCanary = 'never-public'; state.loadboardInventory.boards[0].privateCanary = 'never-public';
  state.loadboardInventory.reservations[1].privateCanary = 'never-public';
  state.loadboardInventory.reservations[0].heldSince = 'ignored historical timestamp'; state.responderSkills = [{ trueSuccessProbability: .01, trueMedianMinutes: 999 }];
  assert.deepEqual(buildLoadboards(state, { roomId: 'plant-1' }), expected); assertNoResponderSkill(expected);
  assert.doesNotMatch(JSON.stringify(expected), /never-public|heldSince|releasedAt|responder/);
  const result = buildLoadboards(before); result.boards[0].approvedPrograms.push('output-only'); assert.deepEqual(before, fixture());
});

test('malformed inventory and conflicting current holds fail instead of returning invented availability', () => {
  const state = fixture(); state.loadboardInventory.reservations.push({ ...state.loadboardInventory.reservations[1], reservationId: 'RES-CONFLICT' });
  assert.throws(() => buildLoadboards(state), /Ambiguous held/);
  const poisoned = fixture(); poisoned.loadboardInventory.boards[0].revision = 'trueMedianMinutes 999';
  assert.throws(() => buildLoadboards(poisoned), /hidden median/);
  state.loadboardInventory = null; assert.throws(() => buildLoadboards(state), TypeError);
  state.loadboardInventory = { boards: [], reservations: 'bad' }; assert.throws(() => buildLoadboards(state), TypeError);
});

test('room loadboards route uses isolated read projections and preserves the existing unknown/unavailable room errors', async () => {
  const first = fixture(), second = fixture(); second.loadboardInventory = { boards: [], reservations: [] };
  const before = structuredClone(first), forbidden = () => { throw Error('write/provider/public snapshot forbidden'); };
  let reads = 0;
  const runtime = state => createLiveRuntime({ store: { project: async builder => { reads++; return builder(state); }, snapshot: forbidden, mutate: forbidden }, agentOptions: forbidden, plannerOptions: forbidden });
  const rooms = { 'plant-1': { id: 'plant-1', health: 'READY', applicationRuntime: runtime(first) }, 'plant-2': { id: 'plant-2', health: 'READY', applicationRuntime: runtime(second) }, broken: { id: 'broken', health: 'UNAVAILABLE', reason: 'synthetic' } };
  const handler = createRequestHandler({ getRoom: id => rooms[id], recordActivity: forbidden });
  const result = await get(handler); assert.equal(result.status, 200); assert.deepEqual(result.body, buildLoadboards(first, { roomId: 'plant-1' }));
  assert.deepEqual((await get(handler, 'plant-2')).body, { roomId: 'plant-2', asOf, boards: [] });
  assert.deepEqual(await get(handler, 'missing'), { status: 404, body: { error: 'Unknown control room: missing' } });
  assert.equal((await get(handler, 'broken')).status, 503);
  assert.equal(reads, 2); assert.deepEqual(first, before);
});

test('Offline loadboards use the same API-free builder without advancing its clock', async () => {
  let now = 0; const original = globalThis.fetch;
  try {
    globalThis.fetch = () => { throw Error('network forbidden'); };
    const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => now });
    const applicationRuntime = createApplicationRuntime({ liveRuntime: {}, offlineRuntime: offline, initialMode: 'OFFLINE' });
    const handler = createRequestHandler({ getRoom: id => id === 'plant-1' ? { id, health: 'READY', applicationRuntime } : null });
    const first = await get(handler); now += 86_400_000;
    assert.equal(first.status, 200); assert.deepEqual(first.body.boards, []); assert.deepEqual(await get(handler), first);
  } finally { globalThis.fetch = original; }
});

test('durable Live reads leave room revision, clock and inventory unchanged and keep raw inventory out of state polling', async t => {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'loadboards-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createLiveStore({ filePath: join(dir, 'room.json'), seedFactory: () => { const state = createLiveSeed(); state.simulationState.simulationTime = asOf; state.loadboardInventory = fixture().loadboardInventory; return state; }, historyRetentionDays: 0 });
  const runtime = createLiveRuntime({ store }), before = await store.snapshot();
  const handler = createRequestHandler({ getRoom: id => ({ id, health: 'READY', applicationRuntime: runtime }) });
  assert.equal((await get(handler)).body.boards[0].heldBy, 'RES-NEW');
  assert.deepEqual(await store.snapshot(), before); assert.equal(Object.hasOwn(await store.publicSnapshot(), 'loadboardInventory'), false);
});
