# Domain model & state schema

The canonical Live state is one JSON object persisted per room by `live-store.mjs` and
validated by `live-schema.mjs`. Type definitions live in `backend/src/domain.ts`; the
runtime schema constants live in `backend/src/live-schema.mjs`.

## Key constants (`live-schema.mjs`)

- `LIVE_SCHEMA_VERSION = "2.1"`
- `ISSUE_CLASSES = ["A", "B", "C"]`
- `BASELINE_CONFIG` — the auditable naive-score baseline: `version: "naive-score-v1"`,
  formula `(100 * successRate) - (2 * medianResolutionMinutes) - (3 * travelTimeMinutes)`,
  with a no-history policy of `successRate: 0, medianResolutionMinutes: 60`.

## Persisted state shape

```jsonc
{
  "schemaVersion": "2.1",
  "revision": 0,                    // monotonically increasing per mutation
  "equipment": [ /* Equipment[] */ ],
  "responders": [ /* Responder[] */ ],
  "responderSkills": [ /* ResponderSkill[] — HIDDEN, never public */ ],
  "issues": [ /* Issue[] */ ],
  "assignments": [ /* Assignment[] */ ],
  "resolutionAttempts": [ /* ResolutionAttempt[] */ ],
  "resolutionHistory": [ /* ResolutionHistory[] */ ],
  "recommendations": [ /* Recommendation[] */ ],
  "dispatchOffers": [ /* DispatchOffer[] */ ],
  "operationalEvents": [ /* OperationalEvent[] — audit-only */ ],
  "simulationState": {
    "simulationTime": "ISO-8601",
    "status": "RUNNING | PAUSED",
    "speedMultiplier": 1,           // 1 | 5 | 10 | 60
    "nextEventAt": "ISO-8601",
    "dueEventToken": "due-N",
    "rngVersion": "lcg32-v1",
    "rngStreams": { "scheduler": 0, "fallback": 0, "resolution": 0,
                    "attempt": 0, "dispatch": 0, "durability": 0 }
  },
  "simulationConfig": { "maxActiveIssues": 10 },
  "workforceContinuity": { /* WorkforcePolicy, see simulation.md */ },
  "stationMetrics": { /* per-equipment counters */ }
}
```

`revision` is the optimistic-concurrency token: every mutation bumps it, and the frontend
polls it to detect change. RNG streams are per-concern `uint32` seeds advanced by a
32-bit LCG (`lcg32-v1`), which is what makes the whole simulation reproducible.

An optional private `historyRetention` block records archive addresses/reset epoch,
original ID high-water marks and length-based token counts, original analytic reduction
order, compact closed-issue/lifecycle/recommendation facts and the last hundred events.
It is removed entirely from public snapshots. Full closed detail lives in per-room
`history-archive/<epoch>/<resolution-day>.json` bundles; exact resolution observations
remain in canonical `resolutionHistory`. The public arrays contain current/recent work,
not all historical detail. See [live-runtime.md](live-runtime.md#persistence--concurrency).

## Core entities

| Entity | Key fields | Notes |
|--------|-----------|-------|
| **Issue** | `id`, `equipmentId`, `issueClass` (`A`/`B`/`C`), `status`, `raisedAt`, `description`, `responseAction`, `complexity` (`STANDARD`/`COMPLEX`) | One owning issue per active problem; may reopen after a failed attempt. |
| **Responder** | `id`, `name`, `availability` (`AVAILABLE`/`OFFERED`/`ASSIGNED`/`UNAVAILABLE`), `floor` (1–3), `x`, `y`, `crewId` (`A`–`D`), `currentIssueId`, `currentOfferId` | Public `name`s use neutral `EngrNNN`/`TechNNN`/`OptrNNN` forms. |
| **Equipment** | `id`, `name`, `status` (`NORMAL`/`ISSUE_ACTIVE`/`ATTENTION_REQUIRED`/`OFFLINE`), `floor` (1–3), `x`, `y` | The manufacturing-floor machines; three floors. |
| **Assignment** | `id`, `issueId`, `responderId`, `attemptId`, `role` (`PRIMARY`/`SUPPORT`), `status` (`ACTIVE`/`RELEASED`/`COMPLETED`), `roleHistory` | **At most two active per issue.** Primary promotion is automatic. |
| **ResolutionAttempt** | `id`, `issueId`, `status` (`ACTIVE`/`SUCCEEDED`/`FAILED`), `durationFactor`, `successDraw`, `workTotal`, `completedWork`, `segments`, `assistance` | Deterministic work simulation; re-planned (not re-rolled) when the roster changes. |
| **ResolutionHistory** | `id`, `issueId`, `attemptId`, `responderId`, `success`, `resolutionMinutes`, `participants[]`, `roleIntervals`, `durability` (`TEMPORARY`/`DURABLE`) | Completed-attempt outcome. Multi-contributor via `contributionShare`. Sequential handovers may record 3+ historical contributors even though only ≤2 are ever active at once. |
| **Recommendation** | `id`, `issueId`, `status` (`PENDING_MODEL`/`READY`/`STALE`/`UNAVAILABLE`), `nearestWinner`, `naiveWinner`, `agentResult`, `candidateEvidenceSnapshot[]` | Frozen at decision time; records baseline disagreement. |
| **DispatchOffer** | `id`, `issueId`, `responderId`, `status` (`PENDING`/`ACCEPTED`/`REJECTED`/`CANCELLED`), `rank`, `purpose` (`INITIAL_ASSIGNMENT`/`ASSISTANCE`) | Asynchronous accept/reject. |
| **OperationalEvent** | `id`, `eventType`, `issueId`, `responderId`, `simulationTimestamp`, `payload` | Audit-only append log. Public snapshot returns the most recent 100; full history stays on disk. |
| **ResponderSkill** | `id`, `responderId`, `issueClass`, `trueMedianMinutes`, `trueSuccessProbability` | **HIDDEN simulation truth. See invariant below.** |

Issue lifecycle (`domain.ts`): `PENDING` → `RECOMMENDATION_READY` → `OFFER_PENDING` →
`ASSIGNED` → `RESOLVED` (a failed attempt can send an issue back for a further attempt).

## Invariant: ResponderSkill is hidden truth

> **`ResponderSkill` and every derived hidden number must never cross a public boundary.**
> It is the simulation's ground truth for how good a responder actually is, and the whole
> point of Compass is to rank *without* seeing it.

`createPublicLiveSnapshot()` (`live-schema.mjs`) removes `responderSkills` and
`resolutionHistory` and strips hidden numeric fields (`successDraw`, `durationFactor`,
`workTotal`, `completedWork`, `participantWork`, `contributionShare`, `teamRate`,
`trueSuccessProbability`, `trueMedianMinutes`) before any state reaches the UI, the agent,
the event planner, or analytics. `assertNoResponderSkill()` re-checks serialized public
state for any hidden marker. This invariant is also a binding rule in the repo-root
`AGENTS.md`. See [../concepts/agent-boundary.md](../concepts/agent-boundary.md).

Saved snapshots using the former `suggestedResponseAction` issue field are normalized
back to `responseAction` by `live-migration.mjs`, without changing the caller's input.
Historical extra provenance fields may remain in old files, but are not required or
used for recommendation evidence. New recommendations have aggregate candidate
snapshots and the generic ranking result only.

## Private fault state and observable fixes

An optional `faultTruth` block contains per-issue latent causes; the separate `fault` RNG
stream is private too. Only `fault-truth.mjs` reads cause/effectiveness tables.
`assertNoFaultTruth`, also called by the existing privacy guard, rejects private fault
keys and identifiers across public/model boundaries. Causes are never copied into issues,
operational events, resolution observations or issue archive bundles. Issues expose a
catalog symptom; attempts/observations expose the applied public procedure and decision
source. Missing applied fixes identify legacy evidence and are excluded from fix ranking.
Migration assigns symptoms/causes only to open issues, preserving old actions and attempts.

## Staffing recommendation state

`workforceContinuity` adds `staffingApproval` (default `OPERATOR`), independent
`staffingPolicyRevision`, `staffingDeadlineMinutes` (30), monotone `staffingSequence` and
`staffingRecommendations`. A recommendation owns a revision, pending/terminal status,
code-built packet, ranked options, source, baseline/disagreement, deadline tokens and an
optional private model request UUID. `domain.ts` documents the public contracts. Full
packets are bounded to thirty closed plus one pending record; `/state` returns five closed
plus the pending one. `staffingAudit` retains compact terminal comparison/outcome facts.
Migration adds defaults, preserves legacy audit and never reopens an old review. Interrupted
new inference is retryable; claimed deadline dispatch tokens survive restart.

## Investigation public records

Responders have public `certifications[]` (ISOLATION / SPECIALIST-A/B/C), generated in an
independent id-seeded RNG namespace, never from skill. Issues have `reportNarrative` and
`narrativeSource` (operator/simulated/template). Migration fills missing certification
arrays and public-symptom-only narratives in current issues and compact archived facts;
operator reports survive unchanged. The portable month seed uses the same load migration.
Case identity is `CASE-<issueId>` and is derived from resolved public issue facts plus
observed completed attempts, never hidden truth. See [investigation.md](investigation.md)
for the explicit Case/Responder/Fix/Equipment DTO fields and legacy handling.

## FieldReport and Investigation state (N3a)

Room state may contain `fieldReports`, `investigations` and private monotone
`investigationSequences`. Report status is UNRESOLVED/CONFIRMED/CLOSED; interpretation
ranking has QUEUED/PENDING_MODEL/READY with a private request identity. Investigation
states are QUEUED/RUNNING/READY/ABSTAINED/ESCALATED and operator APPROVED/REJECTED; expiry
and supersession are listed in the lifecycle additions below. A private token protects every in-flight run, and
interrupted runs are requeued on load. Public projections construct explicit fields and
retain open plus twenty terminal records; they never spread private run rows.

Report-created issues have `origin: FIELD_REPORT` and `dispatchGate: INVESTIGATION`;
missing/OPEN gates preserve legacy behavior. Approval stores authorized responder/fix,
Central command, timestamp, original revision and prerequisite confirmations. The first
attempt ID consumes that authorization. Public decisions omit internal authorization IDs
and run tokens. Full contracts and state/mode behavior are in [investigation.md](investigation.md).


## Investigation lifecycle additions

Persisted `investigationPolicy` holds approval mode, simulated-minute deadline, sampled share
and revision. Runs retain creation/transition times, original result outcome, frozen public
baseline fix, deadline and private claim tokens; SUPERSEDED, EXPIRED, OVERRIDDEN and
AUTO_APPROVED are explicit terminal statuses. ObservableDTO contains only equipmentName,
issueClass, symptomText and recentPublicEvents. Simulated reports are engine-confirmed;
operator field reports retain the explicit confirmation workflow. See investigation.md.

New operator reports retain application-owned simulated `createdAt` and, on closure,
`closedAt` timestamps for orphan retention; these fields do not expand the public report
DTO. Closed unlinked reports and their full orphan investigation rows expire by age or
count cap; compact investigation facts and sequence high-water marks survive reclamation.
Report admission's real-time window is process-local, while the open backlog cap is
checked against persisted report/investigation state. See investigation.md for limits.


## Station throughput plan (round 28 follow-up)

Every equipment row carries `deviceId` and its matching `ratedUnitsPerHour` cache.
`backend/src/device-catalog.mjs` owns the twenty immutable synthetic device records
(rates are integer 1–10,000, placeholders pending test engineering confirmation).
The KPI projection looks up the device's authoritative rate; validation rejects
unknown devices or mismatched caches. Stations run one device for the entire window;
changeovers are not modelled.

New Live/Offline seeds use station-ID hash modulo twenty to assign a device, with
no RNG use. Existing rooms without device IDs receive the same deterministic mapping,
replacing the former station-specific 40–120 rate. Existing valid device selections
are preserved; a missing rate cache is filled from the device. Invalid explicit
IDs/rate mismatches fail validation. No hidden simulation truth enters this plan.


## Consumable life policy balances (round 29, F1 slice 1)

`backend/src/consumable-life.mjs` exports `evaluateConsumableLife({policy, asset,
readings, cleanings})`. This standalone domain library has no imports, clock reads,
I/O, route, store or runtime wiring. Callers pass one installed socket/contactor
lifecycle and its approved policy; replacement lifecycles are evaluated separately.

Readings are sorted on a copy by observed time. Cumulative lifetime is separate from
since-clean count: the last cleaning at/before the latest reading supplies its baseline,
or zero at install if none exists. A later cleaning cannot reset an earlier reading.
Cleaning never changes lifetime or the remaining lifetime policy balance.

Status precedence is RECONCILE (unit mismatch or decreasing known readings), NO_DATA,
UNKNOWN (latest lifetime null), REPLACE_DUE, CLEAN_DUE, WARN, then OK. Null is never zero;
a known decrease across intervening unknown readings still requires reconciliation.
Unknown/no-data results have null counters/balances. RECONCILE retains the latest raw
reading count but leaves derived balances null, so uncertain values cannot imply release.
Remaining balances can be negative when overdue; they are policy balances, not a failure
probability or predicted remaining physical life.

The explicit result includes identity, policy version, status, counts/balances, sorted
stable reason codes and `obligationKey = lifecycleId:policyId@version:status`. Reasons
include both exhausted thresholds when applicable, with replacement taking precedence;
warning codes distinguish cleaning interval and lifetime thresholds.

Input validation rejects extra fields (including hidden truth anywhere in the specified
objects), unsafe/negative/fractional counts, invalid policy parameters or UTC dates,
policy-ID mismatch, pre-install records, conflicting counters at identical timestamps,
and a selected cleaning baseline greater than the latest known reading. Malformed inputs
throw TypeError rather than returning OK. Identifiers are bounded alphanumeric/underscore/
hyphen strings (replacement `#` allowed); obligation delimiters are reserved. Valid unit
mismatches and reading decreases produce RECONCILE as required, with no unit conversion.


## Loadboard checkout transitions (round 30, F3 slice 1)

`backend/src/loadboard-checkout.mjs` is an import-free pure domain library. Callers
supply `{boards,reservations}` and timestamped requests; there is no registry, route,
store, UI, model, wall clock or runtime integration in this slice.

`checkoutBoard(inventory, {requestId,boardId,cellId,programRevision,requestedAt})`
returns `{decision,reasons,inventory,reservation}`. Allocation requires a SERVICEABLE
board physically in store (`cellId:null`), no HELD row for that board or requested
cell, and an exact approved-program-list match for the board revision. Every known
failed rule is returned, sorted: BOARD_UNKNOWN, CONDITION_BLOCKED, BOARD_NOT_IN_STORE,
BOARD_HELD, PROGRAM_NOT_APPROVED, CELL_ALREADY_HOLDING. An unknown board does not
invent condition or compatibility facts; independent held/cell conflicts still count.
RELEASED history does not occupy a board or cell.

ALLOCATED sets the copied board location and appends one HELD row with
`reservationId = RES-<requestId>` and `heldSince = requestedAt`. REJECTED returns
null reservation and a new inventory with unchanged content. Copies include nested
compatibility lists and history, so returned data cannot mutate caller-owned inputs.

`checkoutBatch(inventory,requests)` returns `{inventory,decisions}`. Requests sort
by parsed UTC timestamp, then lexical requestId without locale dependence. Each
ordered decision includes requestId, decision, reasons and reservation; the final
inventory is returned once, avoiding a full history copy per request. Transitions use
a single private inventory copy, giving one winner for a board or cell without
mutating caller inputs. Empty batches return an independent inventory.
This library provides no locking or persistent transaction boundary; consumers must
serialize writes. The round 33 HTTP adapter below uses the normal room mutation queue.

`releaseBoard(inventory,{reservationId,releasedAt,cellId})` uses the same decision
envelope, with RELEASED or REJECTED. A matching HELD row and matching reservation
cell are required. Success records releasedAt, changes the row to RELEASED, preserves
history and returns the board to store. Unknown, already-released or wrong-cell
requests return NO_HELD_RESERVATION and unchanged copied inventory.

Malformed fields, impossible UTC dates, duplicate board/reservation/batch request
identities, release-before-checkout and absent board detail for an authorized release
throw TypeError. Re-request after release uses a new requestId; reusing a historical
reservation identity cannot append duplicate history. Input field sets are explicit,
so hidden or arbitrary fields are rejected rather than copied into decisions.


## Consumable obligation episodes (round 31, F1 slice 2)

`consumable-life-obligations.mjs` reconciles current slice-1 evaluations with OPEN
obligations. Rows have exactly obligationId, obligationKey, assetId, lifecycleId,
policyId, policyVersion, kind, status, openedAt, closedAt, closeReason and supersededBy.
CLEAN_DUE maps to CLEANING, REPLACE_DUE to REPLACEMENT, and UNKNOWN/RECONCILE to the
same RECONCILIATION identity. OK/WARN/NO_DATA create nothing. At most one OPEN row
exists per lifecycle/kind; policy changes explicitly close/reopen required work.

One current lifecycle/policy evaluation per asset is required. A different explicitly
current lifecycle for the same asset retires old-lifecycle obligations with REPLACED.
Omission is never retirement: absent evaluations and NO_DATA preserve existing work.
UNKNOWN/RECONCILE may add a reconciliation obligation but cannot discharge existing
cleaning/replacement work. Cleaning cannot satisfy a still-due lifetime or fix an
invalid counter source. Valid corrected readings can resolve reconciliation; clock
passage cannot. Kind/policy supersessions link to the successor obligation. Each
change records the supplied observedAt in openedAt or closedAt; identity never uses time.

Identity-derived IDs include length-prefixed lifecycle/policy fields, policy version
and kind. The room applicator appends deterministic `~2`, `~3`, … episode suffixes when
an already-closed semantic obligation recurs. Closed rows and prior identities remain
immutable, including repeated cleaning cycles with the same obligationKey. Schema
checks reject extra/responder fields, duplicate active identities, invalid dates,
missing/cyclic supersession targets and edits/deletion of prior history. Reset alone
starts new history. Existing rooms migrate to an empty array without evaluating data.

The private optional `consumableInputs` array contains current slice-1 input packets
(`policy`, `asset`, `readings`, `cleanings`), one per asset. Their dates must not exceed
the room clock; no counter ingestion route or registry is added. They are schema
validated with the existing evaluator. A private `consumableReconciliation.inputDigest`
records the last applied canonical input digest. Source packets, digest and obligation
history are excluded from ordinary Live/Offline public snapshots and model inputs.
This slice persists obligation work only: ordinary Issue/dispatch mapping needs the
later asset-to-station/issue-class contract and is not invented here.


## Loadboard read projection (round 32)

A room may carry private `loadboardInventory` in the existing pure checkout
inventory shape (`boards`, `reservations`). GET never creates inventory. Round 38 migration provisions synthetic boards only
when persisted inventory is absent or has no board rows.
`loadboards.mjs` exposes only explicit board facts and the current HELD reservation
ID through the dedicated room read route. Released reservation detail and unrelated
source metadata are not projected or copied into normal state/model payloads.
The shared `validateLoadboardInventory` helper is exported from the pure checkout
module for current-fact projection validation. Round 38 adds manual board entry; round 33 command APIs below operate on the
existing inventory.


## Loadboard command ownership (round 33)

The pure F3 transitions are now used by `loadboard-service.mjs` through the room's
normal mutation adapter. Eligibility, reservation identity and location changes are
rechecked inside the serialized transaction. Successful transitions patch private
loadboardInventory custody rows; rejections preserve its content. Client timestamps are prohibited;
heldSince/releasedAt come from that transaction's simulation clock. Retry identity
is durable in reservation history, so restart/release cannot permit duplicate IDs.
No separate request cache or direct file writer is introduced.

Live and Offline share the service and public response projection. Offline supports
an internal synthetic seedFactory option, defensively copied, analogous to Live's
seed injection; defaults and reset remain the normal scenario. Round 38 adds manual board entry through this same mutation adapter. The dedicated obligations read builder
publishes only the existing strict obligation rows, without exposing counter sources
or initiating reconciliation/ordinary Issue dispatch.


## Handler jam episodes (round 34, F4 slice 1)

`handler-jam-episodes.mjs` exports `buildHandlerJamEpisodes(input)` over the approved
`docs/design/handler-jam-episodes-slice-1.md` packet. It has no imports, I/O, clock,
store, model or runtime wiring. All input fields are explicit; caller metadata and
hidden responder facts cannot be copied into output.

Alarms sort by occurredAt then lexical alarmId. Duplicate identities count once;
conflicting occurrence/reason facts throw TypeError. Ingestion time never drives
order. Missing/null occurrence counts once in excludedAlarms. Valid alarms outside
the half-open window are ignored. Consecutive alarms with the same reason and an
inclusive policy gap form an episode, with EP- plus its first alarm ID, a complete
trail and PATTERN/SINGLE_EVENT classification. Reasons are opaque uppercase codes,
not diagnoses. Jam windows end at the next run start at or after occurrence, or the
window end. Both per-episode and global stopped time use unions minus the clipped
planned-stop union; overlapping episodes must not be summed for the station total.

Context is carried forward from the latest observation at/before window start;
subsequent observations apply until replaced. Missing/null coverage suppresses the
estimate, as do mismatching program/site counts, absent/zero reference, or less than
one running minute. Conflicting observations at one timestamp are invalid. All gate
failures are returned in stable order; raw evidence remains available. Deficit units
are an ESTIMATE from reference rate times unplanned stop duration, never a measured
loss or a causal claim. Suppressed estimates and their basis are null.

Arithmetic uses exact milliseconds before independently rounding minute/unit display
values to nearest integer; the running rate uses the exact denominator and rounds
to two decimals (null only at zero running duration). Run counts are nonnegative
integers on disjoint intervals fully inside or outside the query window. A run
crossing a window edge is rejected because no count attribution/prorating contract
exists. Planned intervals may overlap and cross boundaries. This pure slice adds no
persisted entity, HTTP route, counter ingestion or responder/dispatch behavior.


## Calibration readiness (round 35, F8 slice 1)

`calibration-readiness.mjs` exports import-free `cellReadiness(calibrations,cellId,at)`
and source validation. Rows have exactly calibrationId, cellId, instrumentId,
calibratedAt and dueAt. The latest effective calibratedAt per instrument wins;
future rows are ignored. DueAt is exclusive: equality is EXPIRED. Every effective
instrument must be current and at least one must exist for READY. Missing/future-only
cells return NO_CALIBRATION; expired instruments return CALIBRATION_EXPIRED. Instrument
facts sort lexically. Correlation evidence is separate and cannot change this gate.
Conflicting IDs or different records at the same cell/instrument/instant throw;
identical duplicate facts count once. UTC timestamps and non-reversed validity are
validated, without any clock, store, simulation or model dependency.

`checkoutBoard(inventory,request,readiness?)` optionally consumes this result for the
same requested cell and instant. Non-READY adds CELL_NOT_READY alongside all existing
failing rules, preserving inventory. Wrong-cell/stale packets are invalid. Omission
preserves legacy behavior; batch behavior is unchanged. **Checkout HTTP wiring is enforced in round 36**: the command adapter evaluates
readiness inside the same serialized transaction as allocation.

Optional private room `calibrations` rows feed `cell-readiness.mjs` and its dedicated
GET projection in both modes. Shared synthetic seed rows cover ATE-1 and ATE-2; the round-37 Live migration
provisions missing/empty history on load. Manual entries use the round-36 POST. Raw history is excluded from ordinary
Live/Offline snapshots; the dedicated endpoint exposes only latest instrument facts
and readiness at the existing simulation clock. Reads do not advance time, revise
state, call providers or change calibration history. Source validation happens in
the pure reader; round 37 adds the missing-history migration below.


## Manual calibrations and enforced checkout (round 36)

`calibration-service.mjs` validates exactly the five source fields before queuing,
then validates against current history inside store.mutate. New entries append one
row and return RECORDED; exact identity retries return UNCHANGED without duplicate
history. Conflicting identity or competing same-instant records are malformed (400).
Dates canonicalize to UTC milliseconds. Future facts are permitted but cannot make
readiness current early. This is the shared Live/Offline mutation path, with rollback
on journal failure in Live and no provider dependency in Offline.

`loadboard-service.mjs` now computes cellReadiness from current private rows at the
transaction simulation clock before checkoutBoard, so missing/expired cells yield
CELL_NOT_READY along with all other failing rules. Calibration entry and checkout
use the same queue; a read before queuing cannot authorize an allocation. Release
remains possible when calibration has expired.

`backend/seed/calibrations.mjs` provides independent synthetic ATE-1/ATE-2 records to
both Live and Offline seeds, hence both room instances. Due dates follow both seed
clocks; expiry remains real as simulated time advances. Existing persisted rooms with absent/empty history receive the explicitly authorized
round-37 migration below; nonempty history is preserved. The GET ledger shows all
history with per-record FUTURE/CURRENT/EXPIRED validity at asOf; effective readiness
continues to select the latest calibration per instrument. Old records are retained.


## Existing-room calibration migration (round 37)

`migrateLiveState` fills absent or empty calibrations with synthetic ATE-1/ATE-2
records using the shared seed identifiers. CalibratedAt is exactly seven days before
the persisted simulation clock and dueAt is sixty days after it. No wall clock or RNG
is used. The migration runs before both legacy/current schema branches and operates
on a copied input. Existing nonempty rows are left intact, including expired,
future-only and partial-cell history; the migration never fills missing cells in
an already configured room and never renews expiry. Reapplying it yields identical
state. The normal Live-store load/checkpoint path persists the upgrade without
resetting the simulation clock, revision, inventory or operational history. Offline
continues to use its existing shared seeded calibration records.


## Board entry and existing-room inventory migration (round 38)

`loadboard-service.mjs` exposes enterBoard through POST loadboards/boards in both
modes. Explicit board fields are checked by validateLoadboardInventory before the
queue. Omitted cellId defaults to null; a non-null cell must exist in the room's
calibration rows (the current cell registry). Cell existence does not claim READY.
Inside the serialized mutation, duplicate board IDs and unknown cells fail with 400;
a successful entry appends only the board and returns ADDED with empty reasons.
Existing board/reservation history remains unchanged; no reservation is invented.
Normal request guards apply and journal failure publishes nothing.

`live-migration.mjs` adds independent synthetic LB-0412/LB-0398 SERVICEABLE and
LB-0204 UNDER_REPAIR rows, all in store, when loadboardInventory is absent or its
boards array is empty. Synthetic approved programs come from backend/seed/loadboards.mjs.
Absent inventory gets empty reservations; existing reservation history is preserved.
Any existing board rows prevent seeding entirely. Repeated migration is identical,
and normal load/checkpoint persistence retains subsequent custody and manual entries.
This migration covers persisted Live rooms; new seeds and Offline retain their
existing behavior until configured via the shared entry endpoint.
