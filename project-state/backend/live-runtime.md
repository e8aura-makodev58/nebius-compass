# Live runtime

Live is a **persistent, real-time control room**: the clock advances, the scheduler raises
issues, the event planner and Compass agent are real model calls, responders accept
asynchronously, and resolution attempts play out over simulated time. It is driven by
`backend/src/live-runtime.mjs` and persisted by `live-store.mjs`.

## What a tick does

The control-room manager calls each room's `runScheduledTick()` on the shared process
scheduler (see [control-rooms.md](control-rooms.md)). One tick, in order:

1. **Advance the clock** by the elapsed real time × speed multiplier (`simulation-clock.mjs`).
2. **Raise a due event.** When `simulationTime` reaches `nextEventAt`, the scheduler
   claims the `dueEventToken`, asks the **event planner** for one `ISSUE_RAISED` proposal,
   validates it, and persists a new `Issue` (or uses the deterministic fallback). The
   active-issue ceiling (`simulationConfig.maxActiveIssues`, default 10) and the
   workforce queue gate whether the issue is actionable now.
3. **Recommend.** For an issue needing a decision, `live-recommendation-service.mjs` builds
   the candidate packet (`context-engine.mjs`), calls the **Compass agent**, validates the
   ranked result, computes disagreement against the nearest-available and naive-score
   baselines, and persists a `Recommendation`.
4. **Dispatch.** `live-assignment-service.mjs` offers the top-ranked eligible responder;
   the responder accepts or rejects asynchronously. Complex or delayed work triggers an
   automatic assistance offer for a second responder (at most two active).
5. **Resolve.** Assigned attempts advance through `attempt-engine.mjs`; when an attempt is
   due, `resolution-engine.mjs` settles it, writes `ResolutionHistory`, returns responders
   to their duty stations, and reopens the issue on failure.

All of this is deterministic given the persisted RNG streams — the model calls only choose
*which eligible responder* and *what plausible next issue*, never the mechanics or the
outcome. See [../concepts/agent-boundary.md](../concepts/agent-boundary.md).

## Persistence & concurrency

- `live-store.mjs` journals each mutation instead of rewriting the room file. A mutation
  runs on a copy-on-write draft (`live-draft.mjs`) that copies only the branches it
  touches; the store validates only rows that changed, appends the changed paths as one
  checksummed frame to `live-simulation.json.journal` (`live-journal.mjs`), fsyncs it,
  and only then publishes the new deeply frozen state and acknowledges the caller,
  bumping `revision`. Every 512 frames or 16 MB it writes a checkpoint (synced temp file,
  rename, synced directory, carrying the journal sequence) and clears the journal. Load
  reads the checkpoint and replays complete frames after its sequence; a torn final frame
  is trimmed, a corrupt complete frame fails closed, and a pre-journal room file loads as a
  sequence-0 checkpoint. `readDurableLiveState` returns the durable state for tools and
  tests. **Back up and copy a room as a whole directory** (checkpoint, journal and archive
  together), never the checkpoint file alone. There is exactly one writer per room per
  process.
- `store.snapshot()` returns the published state itself, which is frozen: callers read it
  freely and a write throws. Code that needs a scratch copy (for example the history
  generator's final compaction, or test fixtures) takes `structuredClone` explicitly. At daily simulated boundaries and on load, closed detail older
  than `COMPASS_HISTORY_RETENTION_DAYS` (default seven) moves to per-room daily archives.
  Archive files are synced **before** the live commit, and insert-only by issue ID;
  retrying after a crash neither drops nor duplicates records. Reset starts a new archive
  epoch and leaves old epoch files intact. See [docs/history-retention.md](../../docs/history-retention.md).
- Exact `resolutionHistory` and workforce state stay canonical. Compact issue/lifecycle/
  recommendation facts and ID/token floors preserve analytics and engine decisions.
  Detail is available on demand via archived issue audits and paginated station history.
  `/state` contains open work, at most one hundred recent closed issues plus issues linked
  from the last hundred events, active rosters/attempts and bounded recent controls/feed.
- Read-only analytics projections run on the serialized store queue without cloning
  private detail; builders create their own derived output and never consult archives.
  The timeline caches parsed bin boundaries, preserving arithmetic order and values.
- `OperationalEvent`s are an audit log only; canonical state is the object itself, never
  rebuilt by replaying events.
- Simulation time is derived from wall-clock deltas while `RUNNING`, so **time does not
  advance while the process is stopped** and there is no catch-up burst on restart —
  missed scheduler boundaries replay in order at their persisted effective timestamps.

## Agent activity & deferred work

`live-runtime.mjs` tracks a visible agent-activity status (so the UI can show when the
planner or Compass is "thinking"). Model-bound work started by the **real-time loop**
(`runScheduledTick`: event planning, Compass ranking after a resolution or workforce
change, support matching, the autonomous-dispatch pass) runs in a single serialized
**agent lane**, so a slow provider never holds the clock: ticks keep advancing time and
handling resolutions, offers and shifts while a call is in flight. At most one
autonomous-dispatch pass is queued at a time; it re-reads state when it runs. The loop
context is carried with `AsyncLocalStorage`, so every other caller (API actions, tests,
`advanceSimulation` in offline history generation) still runs that work inline and in the
original order. `agentWorkIdle()` resolves when the lane is empty (tests). A queued event
plan is in memory only: if the process stops first, that event is skipped, never
duplicated. A model call that fails or times out marks the recommendation `UNAVAILABLE`
and dispatch proceeds on the baseline.

## Configuration

Live model behavior is controlled by the provider-settings service and these env vars:
`COMPASS_LIVE_COMPASS_MODE` (default `live`) and `COMPASS_EVENT_PLANNER_MODE` (default
`live`). See [model-providers.md](model-providers.md) and
[../operations/running-and-config.md](../operations/running-and-config.md).

## Mode wrapper

`createApplicationRuntime({ liveRuntime, offlineRuntime, initialMode })` wraps both modes
behind one interface; `mode-service.mjs` routes `getState`/`reset` to the active one.
Switching a room to Offline does not erase Live history — the two are independent stores.
See [offline-runtime.md](offline-runtime.md).

## Generic recommendation evidence

`context-engine.mjs` computes candidate aggregates directly from canonical
`resolutionHistory`, including participant-weighted assistance evidence. Compass
receives these aggregates and eligibility-filtered candidates only. There is no MES
adapter, comparable-case retrieval, case citation, or response-plan result contract.
`live-recommendation-service.mjs` snapshots the aggregates and rejects results when
those candidate facts change during inference. Offline uses the same packet builder
with its API-free fixture.

## Fix recommendation work

`fix-recommendation-service.mjs` snapshots aggregate evidence for the six class procedures
and requests a bounded ranking using the Compass role's settings. Normal scheduled ticks
initiate at most one fix request per room from the live agent lane. Its provider wait is
tracked separately and yields that lane so responder work, offers and the clock continue;
the process-wide provider controls still apply to both jobs. `agentWorkIdle()` drains both
tracked tasks. Sequential history generation awaits fix work after dispatch for repeatable
ordering. At work start, `attempt-engine.mjs` freezes the current order and applied fix;
if the model is pending, it uses and records the deterministic pick. Later model results
cannot change an active attempt. A resolved issue cancels late results; request identity
prevents reset races. Interrupted requests are made eligible for retry on load.

`responseAction` remains accepted as the planner's incident note. New resolution actions
come from the applied catalog procedure. Offline uses the same evidence and attempt
engines with `backend/fixtures/fix-rankings.json`, always API-free.

Paused rooms do not start new fix inference. The fix-work selector uses the queued
read-only projection rather than cloning all history just to inspect pending work.

**Trigger Next Event with a live provider.** `forceNextEvent` claims the trigger in its
own transaction, then, when either role's mode is `live`, dispatches the planner and the
dispatch ranking through the agent lane (`loopContext.run(true, …)`) and returns. Inline,
the request waited for the planner, the responder ranking and the provider limiter, about
four minutes in one live check, far past the UI's 45 s request timeout. Fixture and
forced-failure modes keep the inline path, so tests and generated history are unchanged.

## Staffing approval work

`staffing-service.mjs` creates a deterministic usable recommendation inside the workforce
transaction. `staffing-ranking.mjs` requests the Compass ranking role, validates every
supplied option ID exactly once and allows one bounded repair through `callChatCompletion`.
Rationales contain no digits apart from supplied option IDs; numerical evidence stays in
the application-owned tables. Live requests default to global `fetch` when no test
transport is injected, including the repair request.
The real-time agent lane initiates one tracked staffing request per room and yields during
the provider wait. Clock, deadlines, resolutions and dispatch keep running; `agentWorkIdle`
drains staffing and fix work too. Sequential generation awaits the same service inline.
Paused rooms start no inference. Results are tied to a private UUID request identity;
reset, supersession, approval and deadline passage make late results inapplicable.
Restart migration retries interrupted pending inference without reopening terminal reviews.

The recommendation revision, rather than the constantly changing room revision, guards
operator decisions. API input cannot set the internal policy approval bypass. Full packets
retain only the latest thirty closed recommendations plus the open one. Compact outcome
facts stay canonical in `staffingAudit`, preserving counts across every archive period.
Public snapshots expose the open recommendation and five recent decisions, stripping
scheduler/request tokens. Policy changes and every recommendation/decision are operational
facts, with operator actions attributed to **Central command**.

## Field reports and the investigator lane (N3a)

`investigation-service.mjs` persists report → interpretation → operator-confirmed gated
issue → investigation → decision. The runtime schedules a tracked investigation pump from
the agent lane and returns after submission/confirmation; the pump yields the lane while
awaiting ranking/provider work. It handles reports in paused rooms because they are
operator requests. `agentWorkIdle` drains this work for tests. The shared monotonic run
deadline bounds even a never-resolving provider. Run identities discard late results after
reset/closure; migration requeues interrupted runs/rankings with old tokens removed.
The control-room manager receives a separate investigator-options factory, wired to the
investigator role in provider settings; interpretation ranking uses Compass role settings.

`dispatch-gate.mjs` gates every assignment writer, including transfer and handover, without
changing OPEN issues. Gated issues cannot head-of-line block the autonomous queue; ordinary
fix inference skips them. Operator approval validates and assigns the exact authorized fix
and responder atomically. Failed attempts cannot silently rematch under an old approval.
See [investigation.md](investigation.md) for budgets, public state bounds and N3b deferrals.


## Investigation lifecycle pump

The shared investigation service drains interpretation, sampled narration and investigation
jobs outside store mutations. Narration publishes only if its persisted claim is current;
restart requeues interrupted work and closed reports cancel it. Scheduler deadline claims
are durable and replayed on restart; final safety validation and assignment are atomic.
Sequential `advanceSimulation` drains agent work for reproducible history generation, while
the scheduled Live loop yields during provider waits. Room wrappers expose policy updates
and re-investigation through the same service as Offline.


## Counter-driven consumable reconciliation (round 31)

`consumable-life-service.mjs` supplies the shared internal `reconcileConsumables()`
operation. Live scheduled ticks call it before ordinary simulation work, including
paused rooms, without advancing the clock. The same API-free service is available via
the Offline/runtime adapter; no counter input route is added in either mode.

Only changed counter-source packets trigger evaluation/writes. Their canonical digest
includes policy, current lifecycle, readings and cleaning facts, with array/key order
normalized; clock changes and ordinary GETs never trigger it. Frozen input identity
caches avoid repeatedly hashing unchanged histories. A cleaning/policy/lifecycle change
must trigger just like a new numeric reading, because each can change the obligation.

The normal serialized store mutation re-reads current source inputs, evaluates slice 1,
applies closes/opens and persists the digest in the same journal frame. Failed writes
roll back both; restart retries an unapplied source exactly once. Concurrent calls on a
room's store share one pending operation. Missing/cleared inputs keep previous work.
No model, responder allocation or new ordinary simulation Issue is invoked by this hook.


Round 37 adds an idempotent calibration upgrade in `live-migration.mjs` on the normal
persisted-room load path: absent/empty history gets ATE-1/ATE-2 synthetic records
at simulationTime minus seven / plus sixty days. The store checkpoints a changed
migration before publishing. Nonempty history is retained, so expired records never
renew just because the room restarts. See [domain-model.md](domain-model.md).
