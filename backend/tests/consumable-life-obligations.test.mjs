import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { evaluateConsumableLife } from '../src/consumable-life.mjs';
import { reconcileConsumableObligations, applyConsumableObligationChanges, validateConsumableObligationRows } from '../src/consumable-life-obligations.mjs';
import { consumableInputDigest, reconcileRoomConsumables } from '../src/consumable-life-service.mjs';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { migrateLiveState } from '../src/live-migration.mjs';
import { validateLiveState, assertNoResponderSkill } from '../src/live-schema.mjs';
import { createLiveStore } from '../src/live-store.mjs';
import { createDemoRuntime } from '../src/offline-runtime.mjs';
import { createTempAuditStore } from './helpers/temp-audit-store.mjs';
import { createLiveRuntime } from '../src/live-runtime.mjs';

const observedAt = '2026-09-01T08:00:00.000Z', later = '2026-09-01T09:00:00.000Z';
function packet(count = 60_000, assetId = 'SOCKET-A', lifecycleId = `${assetId}#1`) {
  return { policy: { policyId: 'CARE-A', version: 1, componentFamily: 'FT_SOCKET', counterUnit: 'ACTUATIONS', cleanEvery: 50_000, lifetimeLimit: 2_000_000, warnFraction: .9 },
    asset: { assetId, lifecycleId, policyId: 'CARE-A', installedAt: '2026-08-01T00:00:00.000Z' },
    readings: [{ observedAt: '2026-08-10T06:00:00.000Z', lifetimeCount: count, unit: 'ACTUATIONS' }], cleanings: [] };
}
const evaluation = input => evaluateConsumableLife(input);
const reconcile = (open, inputs, at = observedAt) => reconcileConsumableObligations({ open, evaluations: inputs.map(evaluation), observedAt: at });
const openRows = input => reconcile([], [input]).open;
async function scratch(t) {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'consumable-obligations-'));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}

test('a due cleaning opens once and subsequent unchanged requirements keep the same obligation', () => {
  const input = packet(), created = reconcile([], [input]);
  assert.equal(created.open.length, 1); assert.equal(created.open[0].kind, 'CLEANING'); assert.equal(created.open[0].openedAt, observedAt);
  assert.equal(created.open[0].obligationKey, 'SOCKET-A#1:CARE-A@1:CLEAN_DUE');
  assert.deepEqual(reconcile(created.open, [input], later), { open: [], close: [], keep: [created.open[0].obligationId] });
  input.readings.push({ ...input.readings[0], observedAt: '2026-08-11T06:00:00Z', lifetimeCount: 100_000 });
  assert.deepEqual(reconcile(created.open, [input]).keep, [created.open[0].obligationId]);
});

test('cleaning closes only cleaning work, with unchanged lifetime and recorded observation time', () => {
  const input = packet(), rows = openRows(input), before = evaluation(input);
  input.cleanings = [{ cleanedAt: input.readings[0].observedAt, lifetimeCountAtClean: 60_000 }];
  const after = evaluation(input), changes = reconcile(rows, [input], later);
  assert.equal(after.latestCount, before.latestCount); assert.equal(after.remainingLifeCount, before.remainingLifeCount);
  assert.deepEqual(changes.close, [{ obligationId: rows[0].obligationId, reason: 'CLEANED', observedAt: later, supersededBy: null }]);
  const history = applyConsumableObligationChanges(rows, changes);
  assert.equal(history[0].status, 'CLOSED'); assert.equal(history[0].closedAt, later); assert.equal(rows[0].status, 'OPEN');
});

test('replacement supersedes cleaning and links the old row to the new obligation', () => {
  const input = packet(), rows = openRows(input);
  input.readings.push({ ...input.readings[0], observedAt: '2026-08-11T06:00:00Z', lifetimeCount: 2_000_000 });
  const changes = reconcile(rows, [input], later);
  assert.equal(changes.open[0].kind, 'REPLACEMENT'); assert.equal(changes.close[0].reason, 'SUPERSEDED');
  assert.equal(changes.close[0].supersededBy, changes.open[0].obligationId);
  const history = applyConsumableObligationChanges(rows, changes);
  assert.deepEqual(history.map(row => row.status), ['CLOSED', 'OPEN']); assert.equal(history[0].supersededBy, history[1].obligationId);
  input.cleanings = [{ cleanedAt: input.readings.at(-1).observedAt, lifetimeCountAtClean: 2_000_000 }];
  assert.deepEqual(reconcile([history[1]], [input]).keep, [history[1].obligationId]);
});

test('an explicit current replacement lifecycle retires every old obligation without inferring retirement from missing data', () => {
  const due = packet(), rows = openRows(due), uncertain = packet(null);
  const withReview = applyConsumableObligationChanges(rows, reconcile(rows, [uncertain]));
  assert.equal(withReview.filter(row => row.status === 'OPEN').length, 2);
  const fresh = packet(10, 'SOCKET-A', 'SOCKET-A#2'), changes = reconcile(withReview, [fresh], later);
  assert.equal(changes.open.length, 0); assert.equal(changes.close.length, 2); assert.ok(changes.close.every(row => row.reason === 'REPLACED'));
  const history = applyConsumableObligationChanges(withReview, changes); assert.ok(history.every(row => row.status === 'CLOSED'));
  assert.deepEqual(reconcile(rows, []).keep, [rows[0].obligationId]);
  assert.deepEqual(reconcile(rows, [packet(10, 'SOCKET-B')]).keep, [rows[0].obligationId]);
});

test('reconciliation survives cleaning, elapsed time and NO_DATA until a valid counter source resolves it', () => {
  const input = packet(); input.readings[0].unit = 'CYCLES'; const rows = openRows(input);
  assert.equal(rows[0].kind, 'RECONCILIATION');
  input.cleanings = [{ cleanedAt: input.readings[0].observedAt, lifetimeCountAtClean: 60_000 }];
  assert.deepEqual(reconcile(rows, [input], later).keep, [rows[0].obligationId]);
  input.readings = []; assert.deepEqual(reconcile(rows, [input], later).keep, [rows[0].obligationId]);
  const corrected = packet(20_000);
  assert.equal(reconcile(rows, [corrected], later).close[0].reason, 'RESOLVED_BY_READING');
});

test('UNKNOWN and RECONCILE share one reconciliation identity and uncertain usage never closes due work', () => {
  const unknown = packet(null), review = openRows(unknown), mismatch = packet(60_000);
  mismatch.readings[0].unit = 'CYCLES';
  assert.deepEqual(reconcile(review, [mismatch]).keep, [review[0].obligationId]);
  for (const due of [packet(), packet(2_000_000)]) {
    const rows = openRows(due), changes = reconcile(rows, [unknown]);
    assert.equal(changes.close.length, 0); assert.deepEqual(changes.keep, [rows[0].obligationId]); assert.equal(changes.open[0].kind, 'RECONCILIATION');
  }
});

test('policy changes are explicit close/reopen transitions, including still-required reconciliation', () => {
  for (const input of [packet(), packet(null)]) {
    const rows = openRows(input); input.policy.version = 2;
    const changes = reconcile(rows, [input], later);
    assert.equal(changes.close[0].reason, 'SUPERSEDED'); assert.equal(changes.open[0].policyVersion, 2);
    assert.notEqual(changes.open[0].obligationId, rows[0].obligationId);
    assert.equal(applyConsumableObligationChanges(rows, changes).filter(row => row.status === 'OPEN').length, 1);
  }
});

test('reconciliation is deterministic across input order and clock-free; malformed or private fields fail closed', async () => {
  const source = await readFile(new URL('../src/consumable-life-obligations.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\b|\bimport\s*\(|Date\.now\s*\(/m);
  const a = packet(), b = packet(2_000_000, 'CONTACTOR-B'), rows = [...openRows(a), ...openRows(b)], before = structuredClone(rows);
  a.policy.version++;
  const expected = reconcile(rows, [a, b], later), now = Date.now;
  try { Date.now = () => { throw Error('clock forbidden'); }; assert.deepEqual(reconcile([...rows].reverse(), [b, a], later), expected); }
  finally { Date.now = now; }
  assert.deepEqual(rows, before); assertNoResponderSkill(expected); assert.doesNotMatch(JSON.stringify(expected), /responder/i);
  const invalid = evaluation(a); invalid.ResponderSkill = 'never-public';
  assert.throws(() => reconcileConsumableObligations({ open: [], evaluations: [invalid], observedAt }), TypeError);
  assert.throws(() => reconcile([], [a, a]), TypeError);
  const privateRow = { ...rows[0], responderId: 'R-private' }; assert.throws(() => validateConsumableObligationRows([privateRow]), TypeError);
});

test('recurring cleaning appends deterministic episode IDs and retains immutable closed history', () => {
  const input = packet(), first = openRows(input);
  input.cleanings = [{ cleanedAt: input.readings[0].observedAt, lifetimeCountAtClean: 60_000 }];
  const closed = applyConsumableObligationChanges(first, reconcile(first, [input], later));
  input.readings.push({ observedAt: '2026-08-11T06:00:00Z', lifetimeCount: 120_000, unit: 'ACTUATIONS' });
  const changes = reconcile([], [input], later), second = applyConsumableObligationChanges(closed, changes);
  assert.equal(second[1].obligationId, `${first[0].obligationId}~2`); assert.equal(second[1].obligationKey, first[0].obligationKey);
  assert.deepEqual(reconcile([second[1]], [input]).keep, [second[1].obligationId]);
  assert.deepEqual(second[0], closed[0]); assert.deepEqual(applyConsumableObligationChanges(closed, changes), second);
  assert.throws(() => validateConsumableObligationRows([{ ...closed[0], closeReason: 'REPLACED' }], closed), /history is immutable/);
});

test('room migration adds an empty obligations array deterministically, without counter evaluations or RNG changes', () => {
  const seed = createLiveSeed(); delete seed.consumableObligations;
  const before = structuredClone(seed), migrated = migrateLiveState(seed);
  assert.deepEqual(migrated.consumableObligations, []); assert.deepEqual(migrated.simulationState.rngStreams, seed.simulationState.rngStreams);
  assert.deepEqual(seed, before); assert.deepEqual(migrateLiveState(migrated), migrated); assert.doesNotThrow(() => validateLiveState(migrated));
  const invalid = createLiveSeed(); invalid.consumableObligations = null; assert.throws(() => migrateLiveState(invalid), /consumableObligations/);
});

test('room schema enforces strict rows, closed history, supersession links and private input boundaries', () => {
  const seed = createLiveSeed(); seed.consumableObligations = openRows(packet());
  assert.doesNotThrow(() => validateLiveState(seed));
  for (const change of [
    row => { row.extra = 1; }, row => { row.kind = 'SECRET'; }, row => { row.status = 'CLOSED'; },
    row => { row.closedAt = later; }, row => { row.obligationKey = 'wrong'; }, row => { row.supersededBy = row.obligationId; },
  ]) {
    const state = structuredClone(seed); change(state.consumableObligations[0]); assert.throws(() => validateLiveState(state));
  }
  const duplicate = structuredClone(seed); duplicate.consumableObligations.push({ ...duplicate.consumableObligations[0], obligationId: 'other' });
  assert.throws(() => validateLiveState(duplicate), /duplicate open/);
  const source = createLiveSeed(); source.consumableInputs = [packet()]; source.consumableInputs[0].readings[0].observedAt = '2099-01-01T00:00:00Z';
  assert.throws(() => validateLiveState(source), /future consumable/);
});

test('scheduled hook evaluates changed private counter packets in paused rooms, never GETs or unchanged clock ticks', async t => {
  const directory = await scratch(t), store = createLiveStore({ filePath: join(directory, 'room.json'), historyRetentionDays: 0 });
  const forbidden = () => { throw Error('provider access forbidden'); };
  const runtime = createLiveRuntime({ store, agentOptions: forbidden, plannerOptions: forbidden });
  await store.mutate('synthetic-counter', state => { state.consumableInputs = [packet()]; });
  const before = await store.snapshot(); await store.publicSnapshot();
  assert.equal((await store.snapshot()).revision, before.revision); assert.deepEqual(before.consumableObligations, []);
  await runtime.runScheduledTick(); const first = await store.snapshot();
  assert.equal(first.consumableObligations.length, 1); assert.equal(first.revision, before.revision + 1);
  assert.equal(first.simulationState.simulationTime, before.simulationState.simulationTime);
  await runtime.runScheduledTick(); assert.equal((await store.snapshot()).revision, first.revision);
  const publicState = await store.publicSnapshot();
  for (const key of ['consumableInputs', 'consumableObligations', 'consumableReconciliation']) assert.equal(Object.hasOwn(publicState, key), false);
  await store.mutate('clock-only', state => { state.simulationState.simulationTime = later; });
  const revision = (await store.snapshot()).revision; await runtime.runScheduledTick(); assert.equal((await store.snapshot()).revision, revision);
});

test('hook follows cleaning/policy/lifecycle source changes, preserves episodes and does not react to array order', async t => {
  const directory = await scratch(t), store = createLiveStore({ filePath: join(directory, 'room.json'), historyRetentionDays: 0 });
  await store.mutate('source', state => { state.consumableInputs = [packet()]; }); await reconcileRoomConsumables(store);
  await store.mutate('reading', state => { state.consumableInputs[0].readings.push({ observedAt: '2026-08-11T06:00:00Z', lifetimeCount: 100_000, unit: 'ACTUATIONS' }); });
  await reconcileRoomConsumables(store); assert.equal((await store.snapshot()).consumableObligations.length, 1);
  await store.mutate('order-only', state => { state.consumableInputs[0].readings.reverse(); });
  const revision = (await store.snapshot()).revision; await reconcileRoomConsumables(store); assert.equal((await store.snapshot()).revision, revision);
  await store.mutate('clean', state => { state.consumableInputs[0].cleanings = [{ cleanedAt: '2026-08-11T06:00:00Z', lifetimeCountAtClean: 100_000 }]; });
  await reconcileRoomConsumables(store); assert.equal((await store.snapshot()).consumableObligations[0].closeReason, 'CLEANED');
  await store.mutate('replace', state => { state.consumableInputs = [packet(2_000_000, 'SOCKET-A', 'SOCKET-A#2')]; }); await reconcileRoomConsumables(store);
  const rows = (await store.snapshot()).consumableObligations; assert.deepEqual(rows.map(row => row.status), ['CLOSED', 'OPEN']);
});

test('normal journal failures roll back rows and digest; restart and concurrent retry cannot duplicate obligations', async t => {
  const directory = await scratch(t), filePath = join(directory, 'room.json'); let failOnce = true;
  const store = createLiveStore({ filePath, historyRetentionDays: 0, beforeCommit: ({ label }) => {
    if (label === 'consumable-obligations-reconcile' && failOnce) { failOnce = false; throw Error('synthetic write failure'); }
  } });
  await store.mutate('source', state => { state.consumableInputs = [packet()]; }); const before = await store.snapshot();
  await assert.rejects(reconcileRoomConsumables(store), /synthetic write failure/);
  const failed = await store.snapshot(); assert.deepEqual(failed.consumableObligations, []); assert.equal(failed.revision, before.revision); assert.equal(failed.consumableReconciliation, undefined);
  await Promise.all([reconcileRoomConsumables(store), reconcileRoomConsumables(store)]);
  const committed = await store.snapshot(); assert.equal(committed.consumableObligations.length, 1); assert.equal(committed.revision, before.revision + 1);
  const restarted = createLiveStore({ filePath, historyRetentionDays: 0 }); const loaded = await restarted.snapshot();
  await reconcileRoomConsumables(restarted); assert.equal((await restarted.snapshot()).revision, loaded.revision);
  assert.deepEqual((await restarted.snapshot()).consumableObligations, committed.consumableObligations);
});

test('room inputs and reconciliation markers remain isolated, including migration from a persisted legacy room', async t => {
  const directory = await scratch(t), old = createLiveSeed(); delete old.consumableObligations;
  await writeFile(join(directory, 'old.json'), JSON.stringify(old));
  const first = createLiveStore({ filePath: join(directory, 'old.json'), historyRetentionDays: 0 });
  const other = createLiveStore({ filePath: join(directory, 'other.json'), historyRetentionDays: 0 });
  assert.deepEqual((await first.snapshot()).consumableObligations, []);
  await first.mutate('source', state => { state.consumableInputs = [packet()]; });
  await Promise.all([reconcileRoomConsumables(first), reconcileRoomConsumables(other)]);
  assert.equal((await first.snapshot()).consumableObligations.length, 1); assert.deepEqual((await other.snapshot()).consumableObligations, []);
  assert.equal((await other.snapshot()).consumableReconciliation, undefined);
});


test('counter digests canonicalize timestamp spellings, duplicate ordering and object-key ordering', () => {
  const first = packet(); first.readings.push({ ...first.readings[0], observedAt: '2026-08-10T06:00:00Z' });
  const second = structuredClone(first); second.readings.reverse(); second.asset.installedAt = '2026-08-01T00:00:00Z';
  second.policy = Object.fromEntries(Object.entries(second.policy).reverse());
  assert.equal(consumableInputDigest([first]), consumableInputDigest([second]));
});


test('the shared Offline hook is API-free and does not advance its clock or expose private consumable fields', async () => {
  let time = 0;
  const runtime = createDemoRuntime({ mode: 'fixture' }, createTempAuditStore(), null, { now: () => time });
  const before = runtime.stationKpis({}); time += 86_400_000;
  assert.deepEqual(await runtime.reconcileConsumables(), { result: { changed: false } });
  assert.deepEqual(runtime.stationKpis({}), before);
  const state = runtime.snapshot();
  for (const field of ['consumableInputs', 'consumableObligations', 'consumableReconciliation']) assert.equal(Object.hasOwn(state, field), false);
});

test('reconciliation facts are independent of responder truth and reset starts fresh counter history', async t => {
  const directory = await scratch(t), store = createLiveStore({ filePath: join(directory, 'room.json'), historyRetentionDays: 0 });
  await store.mutate('source', state => { state.consumableInputs = [packet()]; }); await reconcileRoomConsumables(store);
  const before = await store.snapshot();
  await store.mutate('private-truth-perturbation', state => { state.responderSkills[0].trueSuccessProbability = .01; state.responderSkills[0].trueMedianMinutes = 999; });
  const revision = (await store.snapshot()).revision; await reconcileRoomConsumables(store);
  const after = await store.snapshot(); assert.equal(after.revision, revision); assert.deepEqual(after.consumableObligations, before.consumableObligations);
  await store.reset(); await reconcileRoomConsumables(store);
  assert.deepEqual((await store.snapshot()).consumableObligations, []); assert.equal((await store.snapshot()).consumableReconciliation, undefined);
});
