# Control Rooms (multi-instance)

A single deployment runs **several fully independent simulations** — named `e8-aura-p1`
and `e8-aura-p2` by default — each with its own persisted state, clock, issues, responders, and history.
This is the first step toward a multi-domain platform. The design was specified in
`Control_Rooms_SOW_v1_DRAFT.md` and is implemented across four modules.

## The pieces

| Module | Role |
|--------|------|
| `control-room-registry.mjs` | The frozen, hardcoded room list (`plant-1`, `plant-2`) plus `RESERVED_ROOM_IDS`, which prevents a room id from colliding with a real route segment. |
| `control-room-manager.mjs` | The **sole boundary** for room-scoped access. Composes one Live + Offline + application runtime per room; shares one logger, one settings service, and one planner/agent config across all rooms; and owns the single process scheduler. |
| `control-room-migration.mjs` | The idempotent first-boot move of legacy single-instance data into `backend/data/control-rooms/plant-1/`. |
| `control-room-metadata-store.mjs` | Revisioned display names in a shared `room-metadata.json`. |

## Invariants

- **One scheduler for the whole process.** The manager runs exactly one `setInterval`,
  which dispatches every `READY` room's tick **concurrently** (never awaiting one room
  before the next). N independent timers would violate the codebase's single-timer
  concurrency discipline. See [simulation.md](simulation.md) and [live-runtime.md](live-runtime.md).
- **One writer per room.** Each room has its own `live-store.mjs` writing its own state
  files through its own checkpoint and journal (see live-runtime.md). Rooms never share operational state.
- **Health is separate from clock state.** A room is `READY` or `FAILED` (manager health)
  independently of `RUNNING` or `PAUSED` (its clock). A corrupt state file or a migration
  conflict fails just that one room; every other room boots and serves normally.
- **Migration never guesses.** If both a legacy source file and its destination already
  exist, migration records a `CONFLICT` and touches neither — ambiguous provenance is
  surfaced loudly, not silently repaired.

## Idle auto-pause

The manager keeps each room's last operator activity in memory (`recordActivity`). Any
non-GET room request counts, and so does `POST /api/control-rooms/:id/activity`, the
browser's interaction heartbeat; read-only polling never does. On every scheduler cycle,
before the tick, a READY room that is RUNNING and has had no activity for
`COMPASS_IDLE_PAUSE_MINUTES` (default 10, `0` disables) is paused through the live runtime
directly, so the live clock stops even while the room shows Offline. The pause appends
`SIMULATION_PAUSED` with payload `{ reason: "OPERATOR_INACTIVITY", idleMinutes }` and logs
`simulation_auto_paused`. Activity is not persisted: after a restart a room left RUNNING
gets one full idle period from boot. Tests: `idle-auto-pause.test.mjs`,
`e2e/idle-auto-pause.spec.mjs`.

## Routing consequences

`server.mjs` resolves `/api/control-rooms/:id/...` through the manager: an unknown id
`404`s, a non-`READY` id `503`s before any handler runs. Settings (`/api/settings*`) and
diagnostics (`/api/logs*`) stay **deployment-global** — they are process-wide concerns, and
no single room's mode can be authoritative over a shared settings surface. See
[http-api.md](http-api.md).

## Frontend consequences

`/` shows a pre-boot room picker; choosing a room navigates to `/rooms/:id`, which the SPA
parses once at boot. Room switching is full-page navigation, not in-page teardown. The
client scopes calls with `roomApi()` (room-prefixed) vs. `globalApi()` (global). See
[frontend/overview.md](../frontend/overview.md).

## New-room default

A freshly seeded room starts `LIVE + PAUSED` — an operator starts the clock explicitly.
"Live mode" (vs. Offline) and "running" (vs. paused) are distinct axes; do not conflate
them.

## Restored generic rooms

The canonical IDs and storage directories are `plant-1` and `plant-2`, matching
`backend/seed/demo-control-rooms/`. Registry labels also supply the generic display
names when metadata is absent. Operator renames remain revisioned metadata.
The former `plant1` route is a compatibility alias for `plant-1`; startup moves its
known state files into the canonical directory without overwriting conflicting files.
A conflict fails only the first room. Metadata saved under `plant1` keeps its name
and revision when read as `plant-1`.

## Committed demo history

`backend/seed/demo-control-rooms/plant-1.json` contains the corrected history from
1 September to 6 October 2026, 08:00 UTC, LIVE + PAUSED. Its companion
`plant-1.json.history/` contains immutable closed-issue bundles. Fresh-root bootstrap
stages both room seeds, metadata and archives together before publishing the room root;
an existing root is untouched. Plant-2 and metadata are unchanged.

`npm run generate:history` uses the shared Live engine, deterministic provider fallbacks
and the same retention planner. Copying a retained seed requires its companion archives;
normal room storage places them at `plant-1/history-archive/`. Missing indexed day files
fail room startup instead of silently losing audit history. See
[demo-history.md](../../docs/demo-history.md) for reproduction and measurements, and
[history-retention.md](../../docs/history-retention.md) for persistence and reader inventory.

Round 8 plant-1 uses a checksum-verified gzip manifest and companion payload to keep each
committed file below 20 MB. `demo-seed-reader.mjs` restores ordinary runtime JSON during
bootstrap; plant-2's ordinary JSON remains supported. The generator also accepts either
format. Copying the manifest as a live state file is invalid; see the materialization
command in `docs/demo-history.md`. Runtime state and memory are not compressed.


## Authenticated visitor workplaces (round 45)

Production startup enables workplaces in createControlRoomManager. It reuses the
same buildRoom/live-store/runtime construction path for a hidden PAUSED template
and username-derived rooms. The template seed is independently built from synthetic
seed facts, with ATE-1/ATE-2 calibration, three boards, no reservations and empty
handler inputs. Neither plant-1 nor the template's evolving live state is copied.
Usernames normalize lower-case/trim and must match [a-z0-9-]{1,32}; the ID includes
that username plus a short SHA-256 suffix. This prevents path/registry collisions.

workplace-lifecycle.mjs persists workplace.json only inside owned room directories,
with username, roomId, createdAt, lastSeenAt and runEndsAt. Creation is serialized:
cap checks, durable creation marker, normal room initialization, then one RUNNING
transition. A crash cannot replay start; a missing previously created state file
marks that workplace unavailable rather than recloning. Resumed rooms retain their
state; login never starts/resumes their clock. The scheduler enforces a fixed
three-minute real-time deadline from creation, independently of user activity.
Demo runtime providers are fixture-only. Manual start/resume/speed/mode/model routes
are denied at the public session boundary, so users cannot extend the run or spend
provider budget. Deterministic entry, custody, reset, pause and activity paths are
allowed only in the owning room; reset yields the paused template seed.

The manager restores durable workplaces at startup, sweeps those idle for seven
days, and repeats cleanup at most hourly through its existing process scheduler.
Only directories whose metadata matches the safe username-derived ID are eligible;
template, plant-1, plant-2 and unrelated files are never swept. Cap is 200 workplaces;
new creation at cap returns 503 while existing workplaces remain usable. Session
use touches durable workplace activity; sweeps invalidate a session on its next use.
Demo rooms and the template are absent from ordinary operator room listings, and
a demo session receives only its own room. Shared room metadata remains separate.

The default programmatic manager/handler fixtures retain the legacy operator
surface for hermetic component tests. The actual server.mjs entry point always
enables workplaces and the auth guard; there is no production environment bypass.
See operations/testing.md for the explicitly separate pre-login browser harness.
