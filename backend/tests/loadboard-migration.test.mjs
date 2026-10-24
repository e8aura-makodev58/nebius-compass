import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { migrateLiveState } from '../src/live-migration.mjs';
import { createLiveStore } from '../src/live-store.mjs';
import { createLiveRuntime } from '../src/live-runtime.mjs';
import { validateLoadboardInventory } from '../src/loadboard-checkout.mjs';
function state() { const value = migrateLiveState(createLiveSeed()); delete value.loadboardInventory; return value; }
test('missing and boardless inventories migrate twice identically without changing unrelated state', () => {
  for (const empty of [false, true]) {
    const input = state(); if (empty) input.loadboardInventory = { boards: [], reservations: [] };
    const before = structuredClone(input), first = migrateLiveState(input);
    assert.deepEqual(migrateLiveState(first), first); assert.deepEqual(input, before);
    assert.deepEqual(first.loadboardInventory.boards.map(row => [row.boardId, row.condition, row.cellId]), [['LB-0412', 'SERVICEABLE', null], ['LB-0398', 'SERVICEABLE', null], ['LB-0204', 'UNDER_REPAIR', null]]);
    assert.deepEqual(first.loadboardInventory.reservations, []); validateLoadboardInventory(first.loadboardInventory);
    const without = structuredClone(first); delete without.loadboardInventory; delete before.loadboardInventory; assert.deepEqual(without, before);
  }
});
test('existing board rows and reservation history are never changed or completed by migration', () => {
  const input = state(); input.loadboardInventory = { boards: [{ boardId: 'CUSTOM', revision: 'Z', condition: 'QUARANTINED', cellId: 'ATE-1', approvedPrograms: ['CUSTOM-P'] }], reservations: [] };
  const before = structuredClone(input); assert.deepEqual(migrateLiveState(input), before);
  const history = [{ reservationId: 'RES-OLD', boardId: 'OLD', cellId: 'ATE-2', programRevision: 'OLD-P', status: 'RELEASED', heldSince: '2026-08-01T00:00:00Z', releasedAt: '2026-08-02T00:00:00Z' }];
  input.loadboardInventory = { boards: [], reservations: history };
  const migrated = migrateLiveState(input); assert.deepEqual(migrated.loadboardInventory.reservations, history); assert.deepEqual(migrateLiveState(migrated), migrated);
});
test('persisted migrated room checks out LB-0398 to READY cell and retains inventory on restart', async t => {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'board-migration-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'room.json'), input = state(); await writeFile(filePath, JSON.stringify(input));
  const store = createLiveStore({ filePath, historyRetentionDays: 0 }), runtime = createLiveRuntime({ store });
  const result = await runtime.checkoutLoadboard({ requestId: 'MIGRATED', boardId: 'LB-0398', cellId: 'ATE-1', programRevision: 'PM0096-P2' });
  assert.equal(result.decision, 'ALLOCATED'); assert.equal(result.reservation.heldSince, input.simulationState.simulationTime);
  const before = await store.snapshot(), restarted = createLiveStore({ filePath, historyRetentionDays: 0 });
  assert.deepEqual((await restarted.snapshot()).loadboardInventory, before.loadboardInventory);
});

test('migration refuses orphan HELD history before seeding even if a seed ID would appear to repair it', () => {
  for (const boardId of ['LB-0398', 'MISSING']) {
    const input = state(); input.loadboardInventory = { boards: [], reservations: [{ reservationId: 'RES-ORPHAN', boardId, cellId: 'ATE-1', programRevision: 'PM0096-P2', status: 'HELD', heldSince: input.simulationState.simulationTime }] };
    const before = structuredClone(input);
    assert.throws(() => validateLoadboardInventory(input.loadboardInventory), /HELD reservation references absent board/);
    assert.throws(() => migrateLiveState(input), /Cannot migrate loadboard inventory: HELD reservation references absent board/);
    assert.deepEqual(input, before);
  }
});


test('migration refusal leaves persisted bytes untouched on repeated load and does not block another room', async t => {
  const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'board-refusal-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const input = state(); input.loadboardInventory = { boards: [], reservations: [{ reservationId: 'ORPHAN', boardId: 'LB-0398', cellId: 'ATE-1', programRevision: 'PM0096-P2', status: 'HELD', heldSince: input.simulationState.simulationTime }] };
  const filePath = join(dir, 'invalid.json'), bytes = JSON.stringify(input); await writeFile(filePath, bytes);
  const invalid = createLiveStore({ filePath, historyRetentionDays: 0 });
  for (let index = 0; index < 2; index++) { await assert.rejects(invalid.snapshot(), /Cannot migrate loadboard inventory: HELD reservation references absent board/); assert.equal(await readFile(filePath, 'utf8'), bytes); }
  const otherPath = join(dir, 'healthy.json'); await writeFile(otherPath, JSON.stringify(state()));
  const other = createLiveStore({ filePath: otherPath, historyRetentionDays: 0 });
  assert.equal((await other.snapshot()).loadboardInventory.boards.length, 3);
});
