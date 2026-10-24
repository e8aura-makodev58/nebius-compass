import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { migrateLiveState } from '../src/live-migration.mjs';
import { cellReadiness } from '../src/calibration-readiness.mjs';
import { createLiveStore } from '../src/live-store.mjs';
import { createLiveRuntime } from '../src/live-runtime.mjs';
import { createRequestHandler } from '../src/server.mjs';
const at = '2028-02-29T12:34:56.789Z';
function state() {
  const value = migrateLiveState(createLiveSeed()); value.simulationState.simulationTime = at;
  delete value.calibrations; return value;
}
test('missing and empty calibration history migrate deterministically relative to room time, twice identically', () => {
  for (const empty of [false, true]) {
    const input = state(); if (empty) input.calibrations = [];
    const before = structuredClone(input), first = migrateLiveState(input), second = migrateLiveState(first);
    assert.deepEqual(first, second); assert.deepEqual(input, before);
    assert.deepEqual(first.calibrations.map(row => row.cellId), ['ATE-1', 'ATE-2']);
    for (const row of first.calibrations) {
      assert.equal(row.calibratedAt, '2028-02-22T12:34:56.789Z'); assert.equal(row.dueAt, '2028-04-29T12:34:56.789Z');
      assert.equal(cellReadiness(first.calibrations, row.cellId, at).readiness, 'READY');
    }
    assert.equal(first.simulationState.simulationTime, at); assert.equal(first.revision, before.revision);
    const without = structuredClone(first), originalWithout = structuredClone(before); delete without.calibrations; delete originalWithout.calibrations; assert.deepEqual(without, originalWithout);
  }
});
test('explicit history is unchanged, including expired, partial-cell and future-only history', () => {
  for (const calibratedAt of ['2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z']) {
    const input = state(); input.calibrations = [{ calibrationId: 'OPERATOR-1', cellId: 'ATE-2', instrumentId: 'CUSTOM-1', calibratedAt, dueAt: calibratedAt }];
    const before = structuredClone(input); assert.deepEqual(migrateLiveState(input), before); assert.deepEqual(input, before);
  }
});
test('migration is not a renewal when the clock passes the original migrated expiry', () => {
  const first = migrateLiveState(state()), original = structuredClone(first.calibrations);
  first.simulationState.simulationTime = '2028-05-01T00:00:00Z';
  const second = migrateLiveState(first); assert.deepEqual(second.calibrations, original);
  assert.equal(cellReadiness(second.calibrations, 'ATE-1', second.simulationState.simulationTime).readiness, 'EXPIRED');
});
test('persisted legacy room migrates through normal load, checks out a READY cell and retains dates on restart', async t => {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'calibration-migration-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'room.json'), input = state();
  input.loadboardInventory = { boards: [{ boardId: 'LB-1', revision: 'A', condition: 'SERVICEABLE', cellId: null, approvedPrograms: ['P3'] }], reservations: [] };
  await writeFile(filePath, JSON.stringify(input));
  const store = createLiveStore({ filePath, historyRetentionDays: 0 }), runtime = createLiveRuntime({ store });
  const handler = createRequestHandler({ getRoom: id => ({ id, health: 'READY', applicationRuntime: runtime }) });
  const stream = Readable.from([JSON.stringify({ requestId: 'R1', boardId: 'LB-1', cellId: 'ATE-1', programRevision: 'P3' })]);
  Object.assign(stream, { method: 'POST', url: '/api/control-rooms/plant-1/loadboards/checkout', headers: { 'content-type': 'application/json' } });
  let status, body; await handler(stream, { writeHead(code) { status = code; }, end(text) { body = JSON.parse(text); } });
  assert.equal(status, 200); assert.equal(body.decision, 'ALLOCATED'); assert.equal(body.reservation.heldSince, at);
  const before = await store.snapshot(), restarted = createLiveStore({ filePath, historyRetentionDays: 0 });
  assert.deepEqual((await restarted.snapshot()).calibrations, before.calibrations);
  assert.equal(Object.hasOwn(await restarted.publicSnapshot(), 'calibrations'), false);
});
