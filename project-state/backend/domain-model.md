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
