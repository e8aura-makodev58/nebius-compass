# Consumable life and cleaning cadence, slice 1 (F1)

Status: **approved for build, round 29.** First slice of candidate F1 in `docs/product/ate-feature-proposal.md`.
Synthetic, domain-neutral data only. The slice is a pure domain module. It has no route, no UI and no new
persistence. Application code owns every number; no model is involved.

## 1. Scope

In this slice:
- Evaluate **counter readings** for a **socket or contactor** installed in an ATE station against an
  **approved policy** and produce a deterministic status per asset.
- Track two counters separately: **since-clean** (resets on cleaning) and **lifetime** (never reset by cleaning).

Not in this slice: asset registry, installation lineage, issue creation, responder offers, the UI, storage and
probe cards (F2). Later slices connect the status to issues.

## 2. Inputs

All inputs are plain objects passed in by the caller. The module reads no clock and no store.

```json
{
  "policy": {
    "policyId": "CARE-POLICY-A",
    "version": 3,
    "componentFamily": "FT_SOCKET",
    "counterUnit": "ACTUATIONS",
    "cleanEvery": 50000,
    "lifetimeLimit": 2000000,
    "warnFraction": 0.9
  },
  "asset": {
    "assetId": "SOCKET-A",
    "lifecycleId": "SOCKET-A#1",
    "policyId": "CARE-POLICY-A",
    "installedAt": "2026-08-01T00:00:00.000Z"
  },
  "readings": [
    { "observedAt": "2026-08-10T06:00:00.000Z", "lifetimeCount": 120000, "unit": "ACTUATIONS" }
  ],
  "cleanings": [
    { "cleanedAt": "2026-08-12T10:00:00.000Z", "lifetimeCountAtClean": 120000 }
  ]
}
```

Rules:
- `lifetimeCount` is **cumulative since the lifecycle started**. A reading's unit must equal `policy.counterUnit`.
  Any other unit → status `RECONCILE`. No conversion is done in this slice.
- `readings` are sorted by `observedAt` by the module (the caller may pass them in any order).
- `lifetimeCount` **unknown** (opening counter not recorded) is expressed as `lifetimeCount: null`. Unknown is
  **never** treated as zero. Lifetime status becomes `UNKNOWN`, and the overall status cannot be `OK`.
- `cleanings` are the recorded cleaning events. Each one resets the **since-clean** counter to zero at
  `lifetimeCountAtClean`. Cleaning does **not** change the lifetime counter.

## 3. Derived values

- `latestCount` = the latest reading's `lifetimeCount`.
- `sinceCleanCount` = `latestCount − lifetimeCountAtLatestClean`, where the latest clean is the last cleaning
  with `cleanedAt` ≤ the latest reading's `observedAt`. With no clean, use the lifecycle start (count 0 at install).
- `remainingCleanCount` = `cleanEvery − sinceCleanCount`. Negative means overdue.
- `remainingLifeCount` = `lifetimeLimit − latestCount`. A **policy balance**, not a lifetime prediction and not a
  probability of failure. Negative means the lifetime limit is exceeded.

## 4. Status

Evaluated in this order; the first match wins.

| Order | Condition | Status |
|---|---|---|
| 1 | Any reading has a unit other than `policy.counterUnit`, or a lifetime count decreases between sorted readings | `RECONCILE` |
| 2 | No readings | `NO_DATA` |
| 3 | `latestCount` is null (opening counter unknown) | `UNKNOWN` |
| 4 | `remainingLifeCount ≤ 0` | `REPLACE_DUE` |
| 5 | `remainingCleanCount ≤ 0` | `CLEAN_DUE` |
| 6 | `sinceCleanCount ≥ warnFraction × cleanEvery` or `latestCount ≥ warnFraction × lifetimeLimit` | `WARN` |
| 7 | otherwise | `OK` |

- `RECONCILE` never allows release based on the uncertain count. The caller must reconcile, which is a manual step.
- `REPLACE_DUE` is independent of cleaning: exhausted lifetime requires replacement even when freshly cleaned.
- `UNKNOWN` and `NO_DATA` also block an `OK` overall status.

Each result carries `obligationKey = "<lifecycleId>:<policyId>@<version>:<status>"`. Repeated evaluation of the same
facts yields the same key, so a later issue layer can deduplicate one obligation per asset and status.

## 5. Output

```json
{
  "assetId": "SOCKET-A",
  "lifecycleId": "SOCKET-A#1",
  "policyId": "CARE-POLICY-A",
  "policyVersion": 3,
  "status": "OK",
  "latestCount": 120000,
  "sinceCleanCount": 0,
  "remainingCleanCount": 50000,
  "remainingLifeCount": 1880000,
  "obligationKey": "SOCKET-A#1:CARE-POLICY-A@3:OK",
  "reasons": ["WITHIN_LIMITS"]
}
```

`reasons` is a list of stable codes, for example `WITHIN_LIMITS`, `CLEAN_INTERVAL_EXCEEDED`,
`LIFETIME_EXCEEDED`, `UNIT_MISMATCH`, `COUNTER_DECREASED`, `OPENING_COUNT_UNKNOWN`, `NO_READINGS`.
Multiple reasons are allowed and sorted.

## 6. Replacement lifecycle

Replacing a part starts a new `lifecycleId` (for example `SOCKET-A#2`) with its own readings and cleanings. The
old lifecycle keeps its history; the caller evaluates each lifecycle separately. This module never merges
counters across lifecycles.

## 7. Acceptance (hermetic tests in `backend/tests/consumable-life.test.mjs`)

- Under-threshold readings → `OK`, with exact remaining counts.
- Crossing `cleanEvery` since last clean → `CLEAN_DUE`; a cleaning event at the latest count → `OK` again.
- A cleaning event does **not** change `latestCount` or `remainingLifeCount`.
- Crossing `lifetimeLimit` → `REPLACE_DUE` even immediately after cleaning.
- `warnFraction` boundary: exactly at 90% → `WARN`; below → `OK`.
- A unit other than `counterUnit` → `RECONCILE` with `UNIT_MISMATCH`.
- A decreasing lifetime count between readings → `RECONCILE` with `COUNTER_DECREASED`, even if the later reading
  is below the limit.
- `lifetimeCount: null` → `UNKNOWN`, never `OK`, and never a zero count.
- No readings → `NO_DATA`.
- Readings passed out of order are sorted and evaluated correctly.
- Same inputs → same `obligationKey` and output (determinism); the module does not read `Date.now()`.
- A synthetic `SOCKET-A` replacement (`#2`) evaluated alone is unaffected by `#1`.
- The module imports nothing from `simulation`, `responder` or `analytics`; a test asserts no `ResponderSkill`
  field can appear in input or output.

## 8. Open items

- The unit conversion (cycles to insertions) is out of scope; the policy must name the counter unit.
- Real counter sources and their reset behaviour are unknown. `RECONCILE` is the safe default until a source is confirmed.
- The policy's approval workflow is not modelled here; `version` only identifies which approved policy was used.
