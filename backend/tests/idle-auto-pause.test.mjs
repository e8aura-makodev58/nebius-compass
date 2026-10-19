import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createControlRoomManager, idlePauseMillisecondsFromEnv } from "../src/control-room-manager.mjs";
import { createRequestHandler } from "../src/server.mjs";

const FIXTURE_OPTIONS = { mode: "force-failure" };
const MINUTE = 60_000;

async function idleManager({ idlePauseMilliseconds = 10 * MINUTE, logger = null } = {}) {
  const clock = { now: 1_000_000 };
  const manager = await createControlRoomManager({
    dataRoot: await mkdtemp(join(tmpdir(), "compass-idle-pause-")),
    migrateLegacyData: false,
    plannerOptions: FIXTURE_OPTIONS,
    agentOptions: FIXTURE_OPTIONS,
    idlePauseMilliseconds,
    logger,
    now: () => clock.now,
  });
  return { manager, clock };
}

async function status(manager, id) {
  return (await manager.getRoom(id).applicationRuntime.snapshot()).simulationState.status;
}

async function invoke(handler, method, url) {
  const request = { method, url, headers: { host: "localhost", "content-type": "application/json" }, async *[Symbol.asyncIterator]() {} };
  const response = { statusCode: 200, body: "", writeHead(code) { this.statusCode = code; }, end(body = "") { this.body = body; } };
  await handler(request, response);
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

test("a RUNNING room pauses once it has gone the full idle period without activity, and records why", async () => {
  const events = [];
  const { manager, clock } = await idleManager({ logger: { log: (line) => events.push(JSON.parse(line)) } });
  await manager.getRoom("plant-2").applicationRuntime.resumeSimulation();

  clock.now += 10 * MINUTE - 1;
  await manager.pauseIdleRooms();
  assert.equal(await status(manager, "plant-2"), "RUNNING");

  clock.now += 1;
  await manager.pauseIdleRooms();
  const snapshot = await manager.getRoom("plant-2").applicationRuntime.snapshot();
  assert.equal(snapshot.simulationState.status, "PAUSED");
  const pause = snapshot.operationalEvents.at(-1);
  assert.equal(pause.eventType, "SIMULATION_PAUSED");
  assert.deepEqual(pause.payload, { reason: "OPERATOR_INACTIVITY", idleMinutes: 10 });
  assert.ok(events.some((event) => event.event === "simulation_auto_paused" && event.controlRoomId === "plant-2"));
});

test("activity in one room restarts only that room's idle period", async () => {
  const { manager, clock } = await idleManager();
  for (const id of ["plant-1", "plant-2"]) await manager.getRoom(id).applicationRuntime.resumeSimulation();
  clock.now += 9 * MINUTE;
  manager.recordActivity("plant-1");
  clock.now += 2 * MINUTE;
  await manager.pauseIdleRooms();
  assert.equal(await status(manager, "plant-1"), "RUNNING");
  assert.equal(await status(manager, "plant-2"), "PAUSED");
});

test("an idle room is paused even while it shows Offline, since its live clock would keep running", async () => {
  const { manager, clock } = await idleManager();
  const room = manager.getRoom("plant-2").applicationRuntime;
  await room.resumeSimulation();
  await room.setMode("OFFLINE");
  clock.now += 10 * MINUTE;
  await manager.pauseIdleRooms();
  assert.equal((await manager._internalRoomForTests("plant-2").liveStore.snapshot()).simulationState.status, "PAUSED");
});

test("an idle limit of 0 never pauses", async () => {
  const { manager, clock } = await idleManager({ idlePauseMilliseconds: 0 });
  await manager.getRoom("plant-2").applicationRuntime.resumeSimulation();
  clock.now += 24 * 60 * MINUTE;
  await manager.pauseIdleRooms();
  assert.equal(await status(manager, "plant-2"), "RUNNING");
});

test("room mutations and the heartbeat count as activity; GET polling does not", async () => {
  const { manager, clock } = await idleManager();
  const handler = createRequestHandler(manager);
  assert.equal((await invoke(handler, "POST", "/api/control-rooms/plant-2/simulation/resume")).status, 200);

  clock.now += 9 * MINUTE;
  assert.deepEqual(await invoke(handler, "POST", "/api/control-rooms/plant-2/activity"), { status: 202, body: { accepted: true } });
  clock.now += 9 * MINUTE;
  await manager.pauseIdleRooms();
  assert.equal(await status(manager, "plant-2"), "RUNNING");

  for (let poll = 0; poll < 3; poll += 1) assert.equal((await invoke(handler, "GET", "/api/control-rooms/plant-2/state")).status, 200);
  clock.now += 1 * MINUTE;
  await manager.pauseIdleRooms();
  assert.equal(await status(manager, "plant-2"), "PAUSED");
});

test("COMPASS_IDLE_PAUSE_MINUTES defaults to 10, accepts 0 and rejects nonsense", () => {
  assert.equal(idlePauseMillisecondsFromEnv(undefined), 10 * MINUTE);
  assert.equal(idlePauseMillisecondsFromEnv(""), 10 * MINUTE);
  assert.equal(idlePauseMillisecondsFromEnv("0"), 0);
  assert.equal(idlePauseMillisecondsFromEnv("2.5"), 2.5 * MINUTE);
  assert.throws(() => idlePauseMillisecondsFromEnv("-1"), /non-negative/);
  assert.throws(() => idlePauseMillisecondsFromEnv("ten"), /non-negative/);
});
