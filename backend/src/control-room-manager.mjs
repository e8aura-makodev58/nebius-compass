/**
 * Composes the registry into running Control Rooms: one liveRuntime +
 * offlineRuntime + applicationRuntime triple per room, correctly-scoped
 * store paths, and — per Control_Rooms_SOW_v1_DRAFT.md §4.1 — ONE
 * process-level scheduler interval driving every room's tick concurrently,
 * rather than each room owning its own setInterval. This is the sole
 * boundary through which any route or frontend code may reach a room's
 * runtime; nothing else should construct a liveRuntime/offlineRuntime pair
 * directly outside this module and a hermetic test.
 */
import { join } from "node:path";
import { listRooms, RESERVED_ROOM_IDS } from "./control-room-registry.mjs";
import { migrateLegacyControlRoomData, migrateRenamedControlRoomData } from "./control-room-migration.mjs";
import { createLiveStore } from "./live-store.mjs";
import { createAuditStore } from "./audit-store.mjs";
import { createControlRoomMetadataStore } from "./control-room-metadata-store.mjs";
import { createApplicationRuntime, createLiveRuntime } from "./live-runtime.mjs";
import { createDemoRuntime } from "./offline-runtime.mjs";
import { createControlRoomLogger, logEvent } from "./application-log-store.mjs";
import { resolveCompassDataRoot } from "./data-root.mjs";
import { bootstrapDemoSeed } from "./demo-seed-bootstrap.mjs";


function normalizeRoomId(id) {
  return id === "plant1" ? "plant-1" : id;
}

function roomFilePath(dataRoot, roomId, filename) {
  return join(dataRoot, "control-rooms", roomId, filename);
}

/**
 * A freshly-registered room (never migrated from a legacy single-instance
 * deployment) defaults to LIVE + PAUSED — see §9 of the SOW. LIVE/OFFLINE is
 * a runtime/provider-mode dimension; RUNNING/PAUSED is simulation clock
 * state. Conflating them (e.g. defaulting new rooms to Offline "to save
 * cost") would mean a real new plant silently starts in a demo/fixture code
 * path. Pausing the clock is the correct tool: the room is fully real and
 * fully LIVE, it simply doesn't advance or place any model calls until an
 * operator explicitly starts it.
 */
async function pauseIfFreshlySeeded(liveStore) {
  const state = await liveStore.snapshot();
  if (state.simulationState.status === "RUNNING") {
    await liveStore.mutate("control-room-fresh-room-default-pause", (draft) => {
      draft.simulationState.status = "PAUSED";
    });
  }
}

const DEFAULT_IDLE_PAUSE_MINUTES = 10;

/**
 * How long a RUNNING room may go without operator activity before the
 * scheduler pauses it, so an unattended room (a visitor who resumed it and
 * left, a tab left open) stops placing model calls. `0` disables it, e.g. for
 * a wall display that must keep running unattended.
 */
export function idlePauseMillisecondsFromEnv(value = process.env.COMPASS_IDLE_PAUSE_MINUTES) {
  if (value === undefined || value === "") return DEFAULT_IDLE_PAUSE_MINUTES * 60_000;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error("COMPASS_IDLE_PAUSE_MINUTES must be a non-negative number of minutes");
  return minutes * 60_000;
}

function assertNoReservedIdCollision(rooms) {
  for (const room of rooms) {
    if (RESERVED_ROOM_IDS.includes(room.id)) {
      throw new Error(`Control room id "${room.id}" collides with an existing top-level API route segment`);
    }
  }
  const seen = new Set();
  for (const room of rooms) {
    if (seen.has(room.id)) throw new Error(`Duplicate control room id in registry: "${room.id}"`);
    seen.add(room.id);
  }
}

/**
 * Builds one room's runtime pair. Never falls back to a store's own default
 * file path — every path here is explicit and room-id-derived, per the hard
 * rule in SOW §4.2: a caller that forgets to pass a path is exactly the
 * failure class fixed the week before this feature was built.
 */
function buildRoom({ id, label, dataRoot, logger, plannerOptions, agentOptions, investigatorOptions, narratorOptions, assistantOptions }) {
  const liveStore = createLiveStore({ filePath: roomFilePath(dataRoot, id, "live-simulation.json") });
  const roomLogger = createControlRoomLogger(logger, id);
  const liveRuntime = createLiveRuntime({ store: liveStore, logger: roomLogger, plannerOptions, agentOptions, investigatorOptions, narratorOptions, assistantOptions });
  const offlineAuditStore = createAuditStore(roomFilePath(dataRoot, id, "recommendation-events.json"));
  const offlineRuntime = createDemoRuntime({ mode: "fixture" }, offlineAuditStore, roomLogger);
  const applicationRuntime = createApplicationRuntime({ liveRuntime, offlineRuntime, initialMode: "LIVE" });
  return { id, label, liveStore, liveRuntime, offlineRuntime, applicationRuntime };
}

/**
 * @param {object} [options]
 * @param {string} [options.dataRoot] Root directory for all per-room and
 *   shared data files. Defaults to backend/data/.
 * @param {object} [options.logger] Shared application logger, handed to
 *   every room's runtimes unchanged — see SOW §4.2 (operational logging is
 *   deployment-global, not per-room).
 * @param {Function} [options.plannerOptions] Shared provider-settings-backed
 *   options factory, handed to every room's liveRuntime unchanged — see SOW
 *   §4.2 (provider configuration is deployment-global, not per-room).
 * @param {Function} [options.agentOptions] Same as plannerOptions, for Compass.
 * @param {boolean} [options.migrateLegacyData] Whether to run the one-time
 *   legacy-data migration (control-room-migration.mjs) before constructing
 *   rooms. Defaults to true; a hermetic test against a fresh temp dataRoot
 *   should pass false, since there is nothing to migrate and it only adds a
 *   filesystem round trip.
 */
export async function createControlRoomManager({
  dataRoot = resolveCompassDataRoot(),
  logger = null,
  plannerOptions = { mode: process.env.COMPASS_EVENT_PLANNER_MODE ?? "live" },
  assistantOptions = { mode: process.env.COMPASS_ASSISTANT_MODE ?? process.env.COMPASS_LIVE_COMPASS_MODE ?? "live" },
  narratorOptions = { mode: process.env.COMPASS_NARRATOR_MODE ?? process.env.COMPASS_LIVE_COMPASS_MODE ?? "live" },
  investigatorOptions = { mode: process.env.COMPASS_INVESTIGATOR_MODE ?? process.env.COMPASS_LIVE_COMPASS_MODE ?? "live" },
  agentOptions = { mode: process.env.COMPASS_LIVE_COMPASS_MODE ?? "live" },
  migrateLegacyData = true,
  idlePauseMilliseconds = idlePauseMillisecondsFromEnv(),
  now = Date.now,
} = {}) {
  // Must run before metadata/runtime stores are constructed. It only copies a
  // committed demo snapshot into an entirely new control-room root; an
  // existing clone or Docker volume is left exactly as it is.
  await bootstrapDemoSeed({ dataRoot });
  const descriptors = listRooms();
  assertNoReservedIdCollision(descriptors);
  const metadataStore = createControlRoomMetadataStore({ filePath: join(dataRoot, "control-rooms", "room-metadata.json"), rooms: descriptors });

  const rooms = new Map(); // id -> { id, label, health, reason, liveRuntime, offlineRuntime, applicationRuntime }

  for (const descriptor of descriptors) {
    try {
      // Whether THIS room actually has real prior-deployment data behind it —
      // not just "is this room literally named plant1". A truly fresh
      // install (no legacy file anywhere, e.g. a new dev environment) has
      // nothing to migrate, so plant1 is exactly as freshly-seeded as
      // plant-2 and must get the same LIVE+PAUSED default; only a room whose
      // migration actually moved (or previously moved) a real file is exempt.
      let hasMigratedData = false;
      if (migrateLegacyData && descriptor.id === "plant-1") {
        const renamed = await migrateRenamedControlRoomData({ dataRoot });
        if (renamed.status === "CONFLICT") throw new Error("Migration conflict: both plant1 and plant-1 contain room data. Neither conflicting file was touched; resolve manually.");
        const migration = await migrateLegacyControlRoomData({ dataRoot, roomId: descriptor.id });
        if (migration.status === "CONFLICT") {
          rooms.set(descriptor.id, { id: descriptor.id, label: descriptor.label, health: "FAILED", reason: `Migration conflict: both a legacy file and control-rooms/${descriptor.id} already exist for ${migration.conflicts.map((entry) => entry.file).join(", ")}. Neither was touched; resolve manually.` });
          continue;
        }
        hasMigratedData = migration.results.some((entry) => entry.status === "MIGRATED" || entry.status === "ALREADY_MIGRATED");
      }
      const room = buildRoom({ id: descriptor.id, label: descriptor.label, dataRoot, logger, plannerOptions, agentOptions, investigatorOptions, narratorOptions, assistantOptions });
      // Only a freshly-seeded room (no real prior-deployment data behind it)
      // gets the LIVE+PAUSED default. A room with real migrated state must be
      // preserved exactly as-is, whatever its clock status already was.
      if (!hasMigratedData) await pauseIfFreshlySeeded(room.liveStore);
      await room.liveRuntime.reconcileStartup();
      rooms.set(descriptor.id, { ...room, health: "READY", reason: null });
    } catch (error) {
      rooms.set(descriptor.id, { id: descriptor.id, label: descriptor.label, health: "FAILED", reason: error.message });
    }
  }

  let processInterval = null;
  // Real time of each room's last operator activity, in memory only: after a
  // restart nobody has been seen yet, so a room left RUNNING gets one full
  // idle period from boot before it pauses.
  const lastActivityAt = new Map([...rooms.keys()].map((id) => [id, now()]));
  const idleCheckRunning = new Set();

  async function pauseIfIdle(room) {
    if (idlePauseMilliseconds === 0 || idleCheckRunning.has(room.id)) return;
    const idleMilliseconds = now() - lastActivityAt.get(room.id);
    if (idleMilliseconds < idlePauseMilliseconds) return;
    idleCheckRunning.add(room.id);
    try {
      const snapshot = await room.liveStore.snapshot();
      if (snapshot.simulationState.status !== "RUNNING") return;
      // Straight to the live runtime, not the mode-gated application surface:
      // the live clock must stop whichever mode the room is showing.
      await room.liveRuntime.pause({ reason: "OPERATOR_INACTIVITY", idleMinutes: Math.floor(idleMilliseconds / 60_000) });
      logEvent(createControlRoomLogger(logger, room.id), "simulation_auto_paused", { reason: "OPERATOR_INACTIVITY", idleMs: idleMilliseconds });
    } finally {
      idleCheckRunning.delete(room.id);
    }
  }

  return {
    /** The sole boundary: every room-scoped route resolves through here. */
    getRoom(id) {
      const room = rooms.get(normalizeRoomId(id));
      if (!room) return null;
      return { id: room.id, label: room.label, health: room.health, reason: room.reason, applicationRuntime: room.applicationRuntime };
    },

    async renameRoomDisplayName(id, payload) {
      const normalizedId = normalizeRoomId(id);
      const room = rooms.get(normalizedId);
      if (!room) throw Object.assign(new Error(`Unknown control room: ${id}`), { statusCode: 404 });
      if (room.health !== "READY") throw Object.assign(new Error(`Control room "${id}" is unavailable`), { statusCode: 503 });
      return metadataStore.rename(normalizedId, payload);
    },

    /**
     * Test-only escape hatch: exposes liveRuntime/liveStore directly, which
     * getRoom() deliberately does not (route handlers must only ever go
     * through applicationRuntime's mode-routed surface). Used by
     * wp23-control-room-manager.test.mjs to drive scheduler ticks directly
     * and to inject simulated store failures without a real 1s interval or a
     * real network stub. Never call this outside a hermetic test.
     */
    /**
     * Marks operator activity in a room: any room-scoped mutation, plus the
     * browser's interaction heartbeat. Read-only polling never counts, or an
     * open tab would keep an unattended room running forever.
     */
    recordActivity(id) {
      const normalizedId = normalizeRoomId(id);
      if (lastActivityAt.has(normalizedId)) lastActivityAt.set(normalizedId, now());
    },

    /** Pauses every READY, RUNNING room idle past the limit. The scheduler calls it each cycle. */
    async pauseIdleRooms() {
      await Promise.all([...rooms.values()].filter((room) => room.health === "READY").map((room) => pauseIfIdle(room)));
    },

    _internalRoomForTests(id) {
      return rooms.get(id) ?? null;
    },

    async listRoomsWithStatus() {
      let metadata;
      try { metadata = await metadataStore.snapshot(); } catch { metadata = { rooms: Object.fromEntries(descriptors.map((room) => [room.id, { displayName: room.label, revision: 0 }])) }; }
      const entries = [];
      for (const room of rooms.values()) {
        const roomMetadata = metadata.rooms[room.id];
        if (room.health !== "READY") {
          entries.push({ id: room.id, label: room.label, displayName: roomMetadata.displayName, revision: roomMetadata.revision, health: "FAILED", reason: room.reason });
          continue;
        }
        const snapshot = await room.applicationRuntime.snapshot();
        entries.push({
          id: room.id,
          label: room.label, displayName: roomMetadata.displayName, revision: roomMetadata.revision,
          health: "READY",
          mode: snapshot.mode,
          simulationStatus: snapshot.simulationState?.status ?? null,
        });
      }
      return entries;
    },

    /**
     * Reconciles every READY room's startup-claimed triggers. Called once at
     * boot, before startProcessScheduler — mirrors the single-instance boot
     * sequence's reconcile-before-serve discipline, extended per room. One
     * room's reconcile failure marks that room FAILED without preventing
     * others from being reconciled (SOW §4.4 — room failure isolation).
     */
    async reconcileAll() {
      for (const [id, room] of rooms) {
        if (room.health !== "READY") continue;
        try {
          await room.liveRuntime.reconcileStartup();
        } catch (error) {
          rooms.set(id, { ...room, health: "FAILED", reason: `reconcileStartup failed: ${error.message}` });
        }
      }
    },

    /**
     * The one process-level scheduler interval (SOW §4.1, Required 1). Ticks
     * every room CONCURRENTLY each cycle — never sequentially awaiting one
     * room before the next — so a slow/hung model call in one room's tick
     * can never delay another room's simulation clock. Each room's own
     * `runScheduledTick` keeps its own re-entry guard, so a still-in-flight
     * tick for one room is simply skipped that cycle, independent of every
     * other room.
     */
    startProcessScheduler(intervalMilliseconds = 1_000) {
      if (processInterval) return processInterval;
      processInterval = setInterval(() => {
        for (const room of rooms.values()) {
          if (room.health !== "READY") continue;
          // Intentionally not awaited: dispatch must not serialize rooms.
          // Each room's own runScheduledTick catches and logs its own
          // errors, so a rejection here is a defensive backstop, not the
          // primary error path.
          // The idle check runs first so a paused room places no tick work.
          pauseIfIdle(room).then(() => room.liveRuntime.runScheduledTick()).catch((error) => {
            createControlRoomLogger(logger, room.id)?.log(JSON.stringify({ timestamp: new Date().toISOString(), event: "control_room_tick_error", error: error.message }));
          });
        }
      }, intervalMilliseconds);
      return processInterval;
    },

    stopProcessScheduler() {
      if (processInterval) clearInterval(processInterval);
      processInterval = null;
    },
  };
}
