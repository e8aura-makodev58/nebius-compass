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
inventory shape (`boards`, `reservations`). No default inventory is manufactured,
and GET never creates it.
`loadboards.mjs` exposes only explicit board facts and the current HELD reservation
ID through the dedicated room read route. Released reservation detail and unrelated
source metadata are not projected or copied into normal state/model payloads.
The shared `validateLoadboardInventory` helper is exported from the pure checkout
module for current-fact projection validation. Inventory provisioning remains
separate; round 33 command APIs below operate on the existing inventory.


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
seed injection; defaults and reset remain the normal scenario. No inventory import
or production provisioning endpoint is added. The dedicated obligations read builder
publishes only the existing strict obligation rows, without exposing counter sources
or initiating reconciliation/ordinary Issue dispatch.
