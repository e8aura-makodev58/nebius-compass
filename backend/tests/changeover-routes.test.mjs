import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { createLiveStore } from '../src/live-store.mjs';
import { migrateLiveState } from '../src/live-migration.mjs';
import { createLiveRuntime, createApplicationRuntime } from '../src/live-runtime.mjs';
import { createDemoRuntime } from '../src/offline-runtime.mjs';
import { createRequestHandler } from '../src/server.mjs';
import { createTempAuditStore } from './helpers/temp-audit-store.mjs';
import { checkChangeoverReadiness } from '../src/changeover-readiness.mjs';
import { cellReadiness } from '../src/calibration-readiness.mjs';
import { validateChangeovers } from '../src/changeover-records.mjs';
const row = overrides => ({ changeoverId: 'CO-1', cellId: 'ATE-1', targetProgramRevision: 'PM0096-P2', startsAt: '2026-08-31T14:00:00Z', ...overrides });
async function request(runtime, path, body, options = {}) {
  const handler = createRequestHandler({ getRoom: id => id === 'plant-1' ? { id, health: 'READY', applicationRuntime: runtime } : null });
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(stream, { method: options.method ?? (body === undefined ? 'GET' : 'POST'), url: `/api/control-rooms/${options.room ?? 'plant-1'}${path}`, headers: { host: 'app.test', 'content-type': 'application/json', ...options.headers } });
  let status, value; await handler(stream, { writeHead(code) { status = code; }, end(text) { value = JSON.parse(text); } }); return { status, body: value };
}
async function live(t, options = {}) {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'changeovers-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'room.json'), store = createLiveStore({ filePath, historyRetentionDays: 0, seedFactory: () => migrateLiveState(createLiveSeed()), ...options });
  await store.snapshot(); return { store, filePath, runtime: createLiveRuntime({ store }) };
}
test('POST allows past/future records; GET matches pure readiness at startsAt and never writes', async t => {
  const { store, runtime } = await live(t);
  for (const startsAt of ['2026-08-31T14:00:00Z', '2027-09-01T14:00:00Z']) {
    const input = row({ changeoverId: `CO-${startsAt.slice(0, 4)}`, startsAt });
    assert.deepEqual(await request(runtime, '/changeovers', input), { status: 200, body: { decision: 'RECORDED', reasons: [] } });
    const before = await store.snapshot(), stored = before.changeovers.at(-1);
    const result = await request(runtime, `/changeovers/${input.changeoverId}/readiness`);
    const expected = checkChangeoverReadiness({ changeover: stored, inventory: before.loadboardInventory, readiness: cellReadiness(before.calibrations, stored.cellId, stored.startsAt), kitFacts: null, crewFacts: null });
    assert.equal(result.status, 200); assert.deepEqual(result.body, expected); assert.equal(result.body.status, 'BLOCKED'); assert.deepEqual(await store.snapshot(), before);
  }
  assert.equal(Object.hasOwn(await store.publicSnapshot(), 'changeovers'), false);
});
test('unknown changeover is 404 without writes, including an empty room', async t => {
  const { store, runtime } = await live(t), before = await store.snapshot();
  assert.equal((await request(runtime, '/changeovers/UNKNOWN/readiness')).status, 404); assert.deepEqual(await store.snapshot(), before);
  assert.equal((await request(runtime, '/changeovers/UNKNOWN/readiness', undefined, { room: 'missing' })).status, 404);
});
test('concurrent identical retries no-op, conflicting identities reject and facts survive restart', async t => {
  const { store, runtime, filePath } = await live(t), revision = (await store.snapshot()).revision;
  const results = await Promise.all([request(runtime, '/changeovers', row()), request(runtime, '/changeovers', row())]);
  assert.deepEqual(results.map(x => x.body.decision).sort(), ['RECORDED', 'UNCHANGED']);
  const before = await store.snapshot(); assert.equal(before.revision, revision + 1); assert.equal(before.changeovers.length, 1);
  assert.equal((await request(runtime, '/changeovers', row({ targetProgramRevision: 'OTHER' }))).status, 400); assert.deepEqual(await store.snapshot(), before);
  const restarted = createLiveStore({ filePath, historyRetentionDays: 0 }), active = createLiveRuntime({ store: restarted });
  assert.deepEqual((await restarted.snapshot()).changeovers, before.changeovers);
  assert.equal((await request(active, '/changeovers', row())).body.decision, 'UNCHANGED'); assert.equal((await restarted.snapshot()).revision, before.revision);
});
test('malformed facts fail before writes and schema forbids edits/deletion/reordering; no update/delete endpoint', async t => {
  const { store, runtime } = await live(t), before = await store.snapshot();
  for (const body of [{}, row({ extra: true }), row({ startsAt: '2026-02-30T00:00:00Z' }), row({ cellId: '' }), row({ targetProgramRevision: 'responderSkills' })]) assert.equal((await request(runtime, '/changeovers', body)).status, 400);
  assert.deepEqual(await store.snapshot(), before);
  await request(runtime, '/changeovers', row()); await request(runtime, '/changeovers', row({ changeoverId: 'CO-2' })); const recorded = await store.snapshot();
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.ok([404, 405].includes((await request(runtime, '/changeovers/CO-1', row(), { method })).status));
  for (const change of [state => { state.changeovers.pop(); }, state => { state.changeovers[0].startsAt = '2026-09-01T00:00:00Z'; }, state => { state.changeovers.reverse(); }, state => { delete state.changeovers; }]) {
    await assert.rejects(store.mutate('invalid-changeover-edit', change), /append-only/); assert.deepEqual(await store.snapshot(), recorded);
  }
});
test('journal failure rolls back and recovers; JSON/origin guards apply', async t => {
  let fail = false; const { store, runtime } = await live(t, { beforeCommit: () => { if (fail) throw Error('changeover fault'); } });
  const before = await store.snapshot(); fail = true; assert.equal((await request(runtime, '/changeovers', row())).status, 500); assert.deepEqual(await store.snapshot(), before); fail = false;
  assert.equal((await request(runtime, '/changeovers', row())).status, 200);
  assert.equal((await request(runtime, '/changeovers', row(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(runtime, '/changeovers', row(), { headers: { origin: 'https://other.test' } })).status, 403);
});
test('missing changeover migration is deterministic, preserves explicit records and pure validation is append-only', () => {
  const input = createLiveSeed(), first = migrateLiveState(input); assert.deepEqual(first.changeovers, []); assert.deepEqual(migrateLiveState(first), first);
  first.changeovers = [row()]; assert.deepEqual(migrateLiveState(first).changeovers, [row()]);
  assert.throws(() => validateChangeovers([row(), row()]), /duplicate/); assert.throws(() => validateChangeovers([], [row()]), /append-only/);
});
test('Offline shares entry/read semantics without providers, hidden state or read clock advancement', async () => {
  let now = 0; const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => now });
  const runtime = createApplicationRuntime({ liveRuntime: {}, offlineRuntime: offline, initialMode: 'OFFLINE' });
  const original = globalThis.fetch; globalThis.fetch = () => { throw Error('network forbidden'); };
  try {
    assert.equal((await request(runtime, '/changeovers/UNKNOWN/readiness')).status, 404);
    assert.equal((await request(runtime, '/changeovers', row())).body.decision, 'RECORDED'); assert.equal((await request(runtime, '/changeovers', row())).body.decision, 'UNCHANGED');
    const before = await request(runtime, '/changeovers/CO-1/readiness'); assert.equal(before.status, 200); assert.equal(before.body.status, 'BLOCKED');
    now += 86_400_000; assert.deepEqual(await request(runtime, '/changeovers/CO-1/readiness'), before);
    assert.equal(Object.hasOwn(offline.snapshot(), 'changeovers'), false);
  } finally { globalThis.fetch = original; }
});
