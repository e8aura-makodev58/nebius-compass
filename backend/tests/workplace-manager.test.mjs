import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControlRoomManager } from '../src/control-room-manager.mjs';
import { createWorkplaceLifecycle } from '../src/workplace-lifecycle.mjs';
import { WORKPLACE_RUN_MS, WORKPLACE_IDLE_MS, WORKPLACE_CAP } from '../src/workplace-identity.mjs';
async function scratch(t) { const root = fileURLToPath(new URL('../../.cache/', import.meta.url)); await mkdir(root, { recursive: true }); const dir = await mkdtemp(join(root, 'workplaces-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
const fixture = { mode: 'fixture' };
async function manager(t, now) { const dataRoot = await scratch(t); return { dataRoot, manager: await createControlRoomManager({ dataRoot, migrateLegacyData: false, workplacesEnabled: true, now, plannerOptions: fixture, agentOptions: fixture, investigatorOptions: fixture, narratorOptions: fixture, assistantOptions: fixture }) }; }
test('manager clones isolated template seeds once, starts fixed run once, resumes without restart and protects plant-1', async t => {
  let now = 0; const { manager: m, dataRoot } = await manager(t, () => now), plant = m._internalRoomForTests('plant-1');
  await plant.liveStore.mutate('not-a-template', state => { state.calibrations = []; });
  const plantBefore = await plant.liveStore.snapshot(), a = await m.ensureWorkplace('judge-a'), b = await m.ensureWorkplace('judge-b');
  assert.notEqual(a.roomId, b.roomId);
  const room = m._internalRoomForTests(a.roomId), state = await room.liveStore.snapshot();
  assert.deepEqual(state.loadboardInventory.boards.map(x => x.boardId), ['LB-0412', 'LB-0398', 'LB-0204']); assert.deepEqual(state.loadboardInventory.reservations, []); assert.equal(state.calibrations.length, 2); assert.deepEqual(state.handlerJam.alarms, []); assert.deepEqual(state.handlerJam.runs, []);
  assert.equal(state.simulationState.status, 'RUNNING'); assert.equal(m._workplaceEntryForTests(a.roomId).runEndsAt, WORKPLACE_RUN_MS);
  await room.liveStore.mutate('personal-fact', state => { state.loadboardInventory.boards[0].condition = 'QUARANTINED'; });
  assert.equal((await m._internalRoomForTests(b.roomId).liveStore.snapshot()).loadboardInventory.boards[0].condition, 'SERVICEABLE');
  assert.deepEqual((await m.ensureWorkplace('judge-a')).roomId, a.roomId);
  now = WORKPLACE_RUN_MS; await m.enforceWorkplaceRuns(); assert.equal((await room.liveStore.snapshot()).simulationState.status, 'PAUSED');
  const stopped = await room.liveStore.snapshot(); now++; await m.ensureWorkplace('judge-a'); assert.deepEqual(await room.liveStore.snapshot(), stopped);
  assert.deepEqual(await plant.liveStore.snapshot(), plantBefore);
  assert.deepEqual((await m.listRoomsWithStatus(a.roomId)).map(x => x.id), [a.roomId]); assert.deepEqual((await m.listRoomsWithStatus()).map(x => x.id), ['plant-1', 'plant-2']);
  const restarted = await createControlRoomManager({ dataRoot, migrateLegacyData: false, workplacesEnabled: true, now: () => now, plannerOptions: fixture, agentOptions: fixture });
  await restarted.ensureWorkplace('judge-a'); assert.equal((await restarted._internalRoomForTests(a.roomId).liveStore.snapshot()).simulationState.status, 'PAUSED');
  assert.equal(restarted._workplaceEntryForTests(a.roomId).runEndsAt, WORKPLACE_RUN_MS);
});
test('seven-day sweep deletes only owned workplace data, is hourly bounded, and startup applies cleanup', async t => {
  let now = 0; const { manager: m, dataRoot } = await manager(t, () => now), a = await m.ensureWorkplace('expired'), b = await m.ensureWorkplace('active');
  const plantPath = join(dataRoot, 'control-rooms', 'plant-1', 'live-simulation.json'), templatePath = join(dataRoot, 'control-rooms', 'template', 'live-simulation.json');
  now = WORKPLACE_IDLE_MS - 1; await m.touchWorkplace(b.roomId); await m.sweepWorkplaces();
  now++; await m.sweepWorkplaces(); assert.ok(m.getRoom(a.roomId)); // at most one sweep/hour
  now += 3_600_000; await m.sweepWorkplaces(); assert.equal(m.getRoom(a.roomId), null); assert.ok(m.getRoom(b.roomId));
  await assert.rejects(access(join(dataRoot, 'control-rooms', a.roomId)), { code: 'ENOENT' }); await access(plantPath); await access(templatePath);
  now += WORKPLACE_IDLE_MS; const restarted = await createControlRoomManager({ dataRoot, migrateLegacyData: false, workplacesEnabled: true, now: () => now, plannerOptions: fixture, agentOptions: fixture });
  assert.equal(restarted.getRoom(b.roomId), null); await access(plantPath); await access(templatePath);
});
test('cap is 200 under concurrent creation, existing workplace still works and metadata is durable', async t => {
  const dataRoot = await scratch(t), rooms = new Map();
  const lifecycle = createWorkplaceLifecycle({ dataRoot, rooms, now: () => 0, build: async (id, username) => ({ id, label: username, health: 'READY', liveStore: { mutate: async () => {}, snapshot: async () => ({ simulationState: { status: 'PAUSED' } }) }, liveRuntime: { pause: async () => {} } }) });
  await lifecycle.initialize(); const results = await Promise.allSettled(Array.from({ length: WORKPLACE_CAP + 1 }, (_, i) => lifecycle.ensure(`user-${i}`)));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 200); assert.equal(results.find(x => x.status === 'rejected').reason.statusCode, 503);
  const existing = await lifecycle.ensure('user-0'); assert.equal(existing.created, false);
  const metadata = JSON.parse(await readFile(join(dataRoot, 'control-rooms', existing.roomId, 'workplace.json'), 'utf8')); assert.equal(metadata.username, 'user-0');
});

test('missing created workplace state fails closed on restart rather than performing a second clone', async t => {
  let now = 0; const { manager: m, dataRoot } = await manager(t, () => now), existing = await m.ensureWorkplace('missing-state');
  const path = join(dataRoot, 'control-rooms', existing.roomId, 'live-simulation.json'); await rm(path);
  const restarted = await createControlRoomManager({ dataRoot, migrateLegacyData: false, workplacesEnabled: true, now: () => now, plannerOptions: fixture, agentOptions: fixture });
  assert.equal(restarted.getRoom(existing.roomId).health, 'FAILED'); await assert.rejects(restarted.ensureWorkplace('missing-state'), { statusCode: 503 });
  await assert.rejects(access(path), { code: 'ENOENT' }); assert.equal(restarted.getRoom('plant-1').health, 'READY');
});
