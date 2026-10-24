import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateCorrelationRecords } from '../src/correlation-records.mjs';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { migrateLiveState } from '../src/live-migration.mjs';
import { createLiveStore } from '../src/live-store.mjs';
import { createLiveRuntime, createApplicationRuntime } from '../src/live-runtime.mjs';
import { createDemoRuntime } from '../src/offline-runtime.mjs';
import { createRequestHandler } from '../src/server.mjs';
import { createTempAuditStore } from './helpers/temp-audit-store.mjs';
const row = overrides => ({ correlationId: 'CORR-1', cellId: 'ATE-1', instrumentId: 'PS-1', referencePartId: 'REF-1', observedAt: '2026-09-01T07:00:00Z', result: 'PASS', ...overrides });
async function request(runtime, body, { method = 'POST', path = '/correlation-records', headers = {}, room = 'plant-1' } = {}) {
  const handler = createRequestHandler({ getRoom: id => id === 'plant-1' ? { id, health: 'READY', applicationRuntime: runtime } : null });
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]); Object.assign(stream, { method, url: `/api/control-rooms/${room}${path}`, headers: { host: 'app.test', 'content-type': 'application/json', ...headers } });
  let status, value; await handler(stream, { writeHead(code) { status = code; }, end(text) { value = JSON.parse(text); } }); return { status, body: value };
}
async function live(t, options = {}) {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'correlations-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'room.json'), store = createLiveStore({ filePath, historyRetentionDays: 0, seedFactory: () => migrateLiveState(createLiveSeed()), ...options });
  await store.snapshot(); return { filePath, store, runtime: createLiveRuntime({ store }) };
}
test('pure validator accepts explicit bounded results and append-only history, without mutation or runtime dependencies', async () => {
  const rows = [row()], before = structuredClone(rows); validateCorrelationRecords(rows); assert.deepEqual(rows, before);
  for (const result of ['PASS', 'FAIL', 'INCONCLUSIVE']) validateCorrelationRecords([row({ result })]);
  validateCorrelationRecords([row(), row({ correlationId: 'CORR-2' })], rows);
  for (const changed of [[], [row({ result: 'FAIL' })], [row({ correlationId: 'OTHER' }), row()]]) assert.throws(() => validateCorrelationRecords(changed, rows), /append-only/);
  for (const invalid of [null, [{}], [row({ cause: 'unknown' })], [row({ observedAt: '2026-02-30T00:00:00Z' })], [row({ result: 'READY' })], [row(), row()]]) assert.throws(() => validateCorrelationRecords(invalid), TypeError);
  const source = await readFile(new URL('../src/correlation-records.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(source, /\bimport\s|Date\.now|new Date\(\)|\bfetch\s*\(/);
});
test('route appends facts, rejects duplicate identity and malformed bodies, and leaves readiness unchanged for every result', async t => {
  const { store, runtime, filePath } = await live(t), ready = await runtime.cellReadiness();
  for (const [index, result] of ['PASS', 'FAIL', 'INCONCLUSIVE'].entries()) {
    const response = await request(runtime, row({ correlationId: `C-${index}`, result }));
    assert.equal(response.status, 200); assert.deepEqual(response.body, { decision: 'RECORDED', reasons: [] }); assert.deepEqual(await runtime.cellReadiness(), ready);
  }
  const before = await store.snapshot(); assert.equal(before.correlationRecords.length, 3);
  for (const bad of [row({ correlationId: 'C-0' }), row({ extra: true }), row({ result: 'UNKNOWN' }), row({ instrumentId: 'responderSkills' })]) assert.equal((await request(runtime, bad)).status, 400);
  assert.deepEqual(await store.snapshot(), before);
  const restarted = createLiveStore({ filePath, historyRetentionDays: 0 }); assert.deepEqual((await restarted.snapshot()).correlationRecords, before.correlationRecords);
  assert.equal(Object.hasOwn(await store.publicSnapshot(), 'correlationRecords'), false);
});
test('no HTTP update/delete path and schema rejects history rewrite, removal or reordering', async t => {
  const { store, runtime } = await live(t); await request(runtime, row()); await request(runtime, row({ correlationId: 'CORR-2' })); const before = await store.snapshot();
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    assert.ok([404, 405].includes((await request(runtime, row(), { method })).status));
    assert.ok([404, 405].includes((await request(runtime, row(), { method, path: '/correlation-records/CORR-1' })).status));
  }
  for (const change of [state => { state.correlationRecords.pop(); }, state => { state.correlationRecords[0].result = 'FAIL'; }, state => { state.correlationRecords.reverse(); }, state => { delete state.correlationRecords; }]) {
    await assert.rejects(store.mutate('invalid-history-edit', change), /append-only/); assert.deepEqual(await store.snapshot(), before);
  }
});
test('concurrent entries serialize; rollback publishes nothing; standard room/body/origin guards apply', async t => {
  let fail = false; const { store, runtime } = await live(t, { beforeCommit: () => { if (fail) throw Error('correlation fault'); } });
  const results = await Promise.all([request(runtime, row()), request(runtime, row())]); assert.deepEqual(results.map(x => x.status).sort(), [200, 400]);
  const before = await store.snapshot(); fail = true; assert.equal((await request(runtime, row({ correlationId: 'NEXT' }))).status, 500); assert.deepEqual(await store.snapshot(), before); fail = false;
  assert.equal((await request(runtime, row({ correlationId: 'NEXT' }))).status, 200);
  assert.equal((await request(runtime, row(), { room: 'missing' })).status, 404);
  assert.equal((await request(runtime, row(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(runtime, row(), { headers: { origin: 'https://other.test' } })).status, 403);
});
test('correlation PASS cannot make expired or unconfigured cells READY; Offline is shared and provider-free', async t => {
  const { store, runtime } = await live(t); await store.mutate('expire', state => { for (const item of state.calibrations) item.dueAt = state.simulationState.simulationTime; });
  const before = await runtime.cellReadiness(); await request(runtime, row()); assert.deepEqual(await runtime.cellReadiness(), before); assert.equal(before.cells[0].readiness, 'EXPIRED');
  const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => 0 });
  const application = createApplicationRuntime({ liveRuntime: {}, offlineRuntime: offline, initialMode: 'OFFLINE' });
  const ready = offline.cellReadiness(), original = globalThis.fetch; globalThis.fetch = () => { throw Error('network forbidden'); };
  try {
    assert.equal((await request(application, row({ cellId: 'UNCONFIGURED' }))).status, 200);
    assert.deepEqual(offline.cellReadiness(), ready); assert.equal(Object.hasOwn(offline.snapshot(), 'correlationRecords'), false);
    assert.equal((await request(application, row({ cellId: 'UNCONFIGURED' }))).status, 400);
  } finally { globalThis.fetch = original; }
});

test('GET empty and appended history is read-only, preserves arrival order, and invalid results are 400', async t => {
  const { store, runtime } = await live(t), initial = await store.snapshot(), ready = await runtime.cellReadiness();
  const empty = await request(runtime, undefined, { method: 'GET' });
  assert.deepEqual(empty, { status: 200, body: { roomId: 'plant-1', asOf: initial.simulationState.simulationTime, records: [] } });
  assert.deepEqual(await store.snapshot(), initial);
  await request(runtime, row({ correlationId: 'Z-FIRST', observedAt: '2026-09-01T07:30:00Z' }));
  const first = await request(runtime, undefined, { method: 'GET' });
  await request(runtime, row({ correlationId: 'A-SECOND', observedAt: '2026-09-01T06:30:00Z', result: 'FAIL' }));
  const before = await store.snapshot(), second = await request(runtime, undefined, { method: 'GET' });
  assert.deepEqual(second.body.records.map(x => x.correlationId), ['Z-FIRST', 'A-SECOND']);
  assert.deepEqual(second.body.records.slice(0, 1), first.body.records);
  assert.deepEqual(Object.keys(second.body.records[0]).sort(), ['correlationId', 'cellId', 'instrumentId', 'referencePartId', 'observedAt', 'result'].sort());
  assert.equal((await request(runtime, row({ correlationId: 'INVALID', result: 'READY' }))).status, 400);
  assert.deepEqual(await request(runtime, undefined, { method: 'GET' }), second);
  assert.deepEqual(await store.snapshot(), before); assert.deepEqual(await runtime.cellReadiness(), ready);
  assert.equal((await request(runtime, undefined, { method: 'GET', room: 'missing' })).status, 404);
});
test('Offline GET shares arrival projection and never advances clock or changes readiness', async () => {
  let now = 0; const offline = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => now });
  const application = createApplicationRuntime({ liveRuntime: {}, offlineRuntime: offline, initialMode: 'OFFLINE' });
  const original = globalThis.fetch; globalThis.fetch = () => { throw Error('network forbidden'); };
  try {
    assert.deepEqual((await request(application, undefined, { method: 'GET' })).body.records, []);
    await request(application, row()); const before = await request(application, undefined, { method: 'GET' }), ready = offline.cellReadiness();
    now += 86_400_000;
    assert.deepEqual(await request(application, undefined, { method: 'GET' }), before); assert.deepEqual(offline.cellReadiness(), ready);
    before.body.records[0].result = 'FAIL'; assert.equal((await request(application, undefined, { method: 'GET' })).body.records[0].result, 'PASS');
  } finally { globalThis.fetch = original; }
});
