import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createLiveStore } from '../src/live-store.mjs';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { migrateLiveState } from '../src/live-migration.mjs';
import { createLiveRuntime, createApplicationRuntime } from '../src/live-runtime.mjs';
import { createDemoRuntime } from '../src/offline-runtime.mjs';
import { createTempAuditStore } from './helpers/temp-audit-store.mjs';
import { createRequestHandler } from '../src/server.mjs';
import { emptyHandlerJam } from '../src/handler-jam-records.mjs';
import { buildRoomHandlerEpisodes } from '../src/handler-jam-service.mjs';
const at = '2026-09-01T09:42:00.000Z';
const time = minute => new Date(Date.UTC(2026, 8, 1, 6, minute)).toISOString();
const alarm = (alarmId = 'A1', minute = 10) => ({ alarmId, reasonCode: 'JAM_PICK', occurredAt: time(minute), ingestedAt: time(minute + 1) });
const context = overrides => ({ observedAt: time(0), programRevision: 'P3', activeSiteCount: 4, referenceUnitsPerHour: 180, ...overrides });
async function request(runtime, path, body, options = {}) {
  const handler = createRequestHandler({ getRoom: id => id === 'plant-1' ? { id, health: 'READY', applicationRuntime: runtime } : null });
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(stream, { method: options.method ?? (body === undefined ? 'GET' : 'POST'), url: `/api/control-rooms/${options.room ?? 'plant-1'}${path}`, headers: { host: 'app.test', 'content-type': 'application/json', ...options.headers } });
  let status, value; await handler(stream, { writeHead(code) { status = code; }, end(text) { value = JSON.parse(text); } }); return { status, body: value };
}
async function live(t, options = {}) {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'handler-routes-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'room.json');
  const store = createLiveStore({ filePath, historyRetentionDays: 0, seedFactory: () => { const state = migrateLiveState(createLiveSeed()); state.simulationState.simulationTime = at; return state; }, ...options });
  await store.snapshot(); return { store, filePath, runtime: createLiveRuntime({ store }) };
}
test('empty aligned read is suppressed and never writes, changes revision or exposes inputs', async t => {
  const { store, runtime } = await live(t), before = await store.snapshot();
  const result = await request(runtime, '/handler-episodes'); assert.equal(result.status, 200);
  assert.deepEqual(result.body.window, { start: time(0), end: time(180) }); assert.equal(result.body.stationId, 'HANDLER-A');
  assert.deepEqual(result.body.episodes, []); assert.deepEqual(result.body.suppressionReasons, ['CONTEXT_MISSING', 'REFERENCE_MISSING']);
  assert.deepEqual(await store.snapshot(), before); assert.equal(Object.hasOwn(await store.publicSnapshot(), 'handlerJam'), false);
});
test('entry feeds pure episodes and context/program gate through real routes', async t => {
  const { store, runtime } = await live(t);
  assert.equal((await request(runtime, '/handler-alarms', { ...alarm(), handlerContext: context() })).body.decision, 'RECORDED');
  await request(runtime, '/handler-alarms', alarm('A2', 15));
  await request(runtime, '/handler-runs', { runId: 'RUN1', start: time(30), end: time(180), acceptedUnits: 450 });
  await request(runtime, '/handler-planned-stops', { stopId: 'STOP1', start: time(15), end: time(20), reasonCode: 'CHANGEOVER' });
  const before = await store.snapshot(), result = await request(runtime, '/handler-episodes');
  assert.equal(result.body.deficitStatus, 'ESTIMATE'); assert.equal(result.body.unplannedStoppedMinutes, 15); assert.equal(result.body.estimatedDeficitUnits, 45);
  assert.deepEqual(result.body.episodes[0].alarmIds, ['A1', 'A2']); assert.deepEqual(await store.snapshot(), before);
  await request(runtime, '/handler-alarms', { ...alarm('A3', 40), handlerContext: context({ observedAt: time(40), programRevision: 'P4' }) });
  const changed = await request(runtime, '/handler-episodes'); assert.deepEqual(changed.body.suppressionReasons, ['PROGRAM_CHANGED']);
  assert.equal(changed.body.estimatedDeficitUnits, null);
});
test('identical retries no-op, conflicts reject, concurrent overlaps serialize and restart retains facts', async t => {
  const { store, runtime, filePath } = await live(t);
  const first = { ...alarm(), handlerContext: context() }, revision = (await store.snapshot()).revision;
  const results = await Promise.all([request(runtime, '/handler-alarms', first), request(runtime, '/handler-alarms', first)]);
  assert.deepEqual(results.map(x => x.body.decision).sort(), ['RECORDED', 'UNCHANGED']);
  assert.equal((await store.snapshot()).revision, revision + 1);
  assert.equal((await request(runtime, '/handler-alarms', { ...first, reasonCode: 'OTHER' })).status, 400);
  assert.equal((await request(runtime, '/handler-alarms', alarm())).status, 400);
  const runs = await Promise.all([request(runtime, '/handler-runs', { runId: 'R1', start: time(30), end: time(60), acceptedUnits: 10 }), request(runtime, '/handler-runs', { runId: 'R2', start: time(45), end: time(90), acceptedUnits: 20 })]);
  assert.deepEqual(runs.map(x => x.status).sort(), [200, 400]);
  const before = await store.snapshot(), restarted = createLiveStore({ filePath, historyRetentionDays: 0 });
  assert.deepEqual((await restarted.snapshot()).handlerJam, before.handlerJam);
  assert.equal((await request(createLiveRuntime({ store: restarted }), '/handler-alarms', first)).body.decision, 'UNCHANGED');
});
test('malformed values and boundary-crossing counts reject before writes; no update/delete route or history edit', async t => {
  const { store, runtime } = await live(t), before = await store.snapshot();
  for (const body of [{}, { ...alarm(), extra: true }, { ...alarm(), occurredAt: '2026-02-30T00:00:00Z' }, { ...alarm(), reasonCode: 'lower' }, { ...alarm(), alarmId: 'responderSkills' }, { ...alarm(), handlerContext: context({ activeSiteCount: -1 }) }]) assert.equal((await request(runtime, '/handler-alarms', body)).status, 400);
  assert.equal((await request(runtime, '/handler-runs', { runId: 'CROSS', start: time(-10), end: time(10), acceptedUnits: 5 })).status, 400);
  assert.deepEqual(await store.snapshot(), before);
  await request(runtime, '/handler-alarms', alarm()); const recorded = await store.snapshot();
  for (const method of ['PATCH', 'PUT', 'DELETE']) assert.ok([404, 405].includes((await request(runtime, '/handler-alarms', alarm(), { method })).status));
  for (const change of [state => { state.handlerJam.alarms.pop(); }, state => { state.handlerJam.alarms[0].reasonCode = 'EDIT'; }]) { await assert.rejects(store.mutate('invalid-edit', change), /append-only/); assert.deepEqual(await store.snapshot(), recorded); }
});
test('journal failure rolls back inputs and optional context; normal guards apply', async t => {
  let fail = false; const { store, runtime } = await live(t, { beforeCommit: () => { if (fail) throw Error('handler fault'); } });
  const before = await store.snapshot(); fail = true;
  assert.equal((await request(runtime, '/handler-alarms', { ...alarm(), handlerContext: context() })).status, 500); assert.deepEqual(await store.snapshot(), before); fail = false;
  assert.equal((await request(runtime, '/handler-alarms', alarm())).status, 200);
  assert.equal((await request(runtime, '/handler-episodes', undefined, { room: 'missing' })).status, 404);
  assert.equal((await request(runtime, '/handler-alarms', alarm(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(runtime, '/handler-alarms', alarm(), { headers: { origin: 'https://other.test' } })).status, 403);
});
test('missing handler migration is deterministic and preserves populated append history', () => {
  const input = createLiveSeed(), first = migrateLiveState(input); assert.deepEqual(first.handlerJam, emptyHandlerJam()); assert.deepEqual(migrateLiveState(first), first);
  first.handlerJam.alarms.push(alarm()); assert.deepEqual(migrateLiveState(first).handlerJam, first.handlerJam);
});
test('Offline uses the same entry/rules and read projection without providers or advancing clocks', async () => {
  let now = 0; const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => now });
  const runtime = createApplicationRuntime({ liveRuntime: {}, offlineRuntime: offline, initialMode: 'OFFLINE' });
  const original = globalThis.fetch; globalThis.fetch = () => { throw Error('network forbidden'); };
  try {
    assert.equal((await request(runtime, '/handler-alarms', alarm())).body.decision, 'RECORDED');
    assert.equal((await request(runtime, '/handler-alarms', alarm())).body.decision, 'UNCHANGED');
    const first = await request(runtime, '/handler-episodes'); now += 86_400_000; assert.deepEqual(await request(runtime, '/handler-episodes'), first);
    assert.equal(Object.hasOwn(offline.snapshot(), 'handlerJam'), false);
  } finally { globalThis.fetch = original; }
});
