# Handler jam episodes and observed throughput loss, slice 1 (F4)

Status: **proposal for round 34, not yet approved for build.** Slice 1 of candidate F4 in
`docs/product/ate-feature-proposal.md`. Synthetic, domain-neutral data only. Pure domain module: no route,
no UI, no store, no clock and no model. Application code owns every number and every grouping decision.

## 1. Why

Repeated short jams disappear inside separate tickets, and a slow ATE setup draws attention without evidence
of where time was lost. Slice 1 groups jam alarms into one **episode**, measures the **stopped time** that
is unplanned, and estimates a **reference-rate deficit** only when the comparison is valid. It does not
conclude that a jam has a particular cause.

## 2. Inputs

```json
{
  "policy": {
    "policyId": "JAM-POLICY-A",
    "version": 2,
    "episodeGapMinutes": 10,
    "minimumJamsPerEpisode": 2
  },
  "window": { "start": "2026-10-24T06:00:00.000Z", "end": "2026-10-24T09:00:00.000Z" },
  "station": {
    "stationId": "HANDLER-A",
    "referenceUnitsPerHour": 180,
    "programRevision": "SR1260-P3",
    "activeSiteCount": 4
  },
  "alarms": [
    { "alarmId": "AL-101", "occurredAt": "2026-10-24T06:12:00.000Z", "reasonCode": "JAM_PICK", "ingestedAt": "2026-10-24T06:12:02.000Z" }
  ],
  "runIntervals": [
    { "start": "2026-10-24T06:00:00.000Z", "end": "2026-10-24T09:00:00.000Z", "acceptedUnits": 452 }
  ],
  "plannedStops": [
    { "start": "2026-10-24T07:40:00.000Z", "end": "2026-10-24T07:55:00.000Z", "reasonCode": "CHANGEOVER" }
  ],
  "contextObservations": [
    { "observedAt": "2026-10-24T06:00:00.000Z", "programRevision": "SR1260-P3", "activeSiteCount": 4 }
  ]
}
```

- `occurredAt` is the time the jam happened. `ingestedAt` is when Compass received it. The module groups on
  `occurredAt`; a jam with a missing `occurredAt` is excluded and counted in `excludedAlarms`.
- `runIntervals` are the running periods. `acceptedUnits` is the count for that interval, with an explicit unit.
- `plannedStops` are excluded from unplanned stopped time and from the rate denominator.
- `contextObservations` record the program revision and active site count over time. Missing context is
  `null`, not an assumed value.

## 3. Episodes

- Alarms are sorted by `occurredAt`, then `alarmId`. Duplicate `alarmId` values count once.
- Alarms of the same `reasonCode` form one episode when the gap to the previous one is at most
  `episodeGapMinutes`. A different reason code starts a new episode.
- An episode with fewer than `minimumJamsPerEpisode` alarms is kept but marked `SINGLE_EVENT`, so
  one-off jams are visible without being counted as a pattern.
- Each episode keeps its alarm trail (`alarmIds`), first and last `occurredAt`, and jam count. No alarm is
  dropped from the trail.

## 4. Stopped time and rate

- **Stopped minutes** of an episode = the union of its jam windows, where each jam window runs from
  `occurredAt` to the next run interval start (or the window end). Overlapping jams count once.
- **Unplanned stopped minutes** = the union of stopped minutes, minus any overlap with `plannedStops`.
- **Accepted units per running minute** = total `acceptedUnits` ÷ total running minutes in the window, where
  running minutes = window minutes − unplanned stopped minutes − planned stop minutes. Shown only when running
  minutes > 0.

## 5. Reference-rate deficit (the gate)

A deficit is estimated only when the comparison is valid. The gate requires all of:
- `contextObservations` cover the whole window, with one `programRevision` and one `activeSiteCount` equal to
  the station's `activeSiteCount`.
- `referenceUnitsPerHour` is present and positive.
- The window has at least one running minute.

When the gate passes:
`estimatedDeficitUnits = referenceUnitsPerHour × unplannedStoppedMinutes / 60`, shown with the reference, the
window and the denominator. It is labelled **ESTIMATE**, never "measured recoverable production".

When the gate fails, the output has `deficitStatus: "SUPPRESSED"` with the failing reasons
(`CONTEXT_MISSING`, `PROGRAM_CHANGED`, `SITE_COUNT_CHANGED`, `REFERENCE_MISSING`, `NO_RUNNING_TIME`), and
`estimatedDeficitUnits: null`. Raw counts and stopped minutes are still returned.

## 6. Output

```json
{
  "stationId": "HANDLER-A",
  "window": { "start": "...", "end": "..." },
  "policyId": "JAM-POLICY-A",
  "policyVersion": 2,
  "episodes": [
    { "episodeId": "EP-AL-101", "reasonCode": "JAM_PICK", "firstOccurredAt": "...", "lastOccurredAt": "...",
      "jamCount": 3, "alarmIds": ["AL-101", "AL-102", "AL-104"], "unplannedStoppedMinutes": 14, "classification": "PATTERN" }
  ],
  "excludedAlarms": 0,
  "unplannedStoppedMinutes": 14,
  "plannedStopMinutes": 15,
  "runningMinutes": 150,
  "acceptedUnitsPerRunningMinute": 3.01,
  "deficitStatus": "ESTIMATE",
  "estimatedDeficitUnits": 42,
  "deficitBasis": { "referenceUnitsPerHour": 180, "windowMinutes": 180, "denominator": "UNPLANNED_STOPPED_MINUTES" },
  "suppressionReasons": []
}
```

`episodeId` is derived deterministically from the first alarm ID (for example `EP-` + `alarmId`). No random IDs.
Units are integers; minutes are integers except `acceptedUnitsPerRunningMinute` (two decimals).

## 7. Acceptance (hermetic tests in `backend/tests/handler-jam-episodes.test.mjs`)

- Three `JAM_PICK` alarms within the gap become one `PATTERN` episode; the trail keeps all three alarm IDs.
- A `JAM_PICK` alarm beyond the gap starts a second episode; a single jam is `SINGLE_EVENT`.
- A different reason code within the gap starts a new episode.
- Duplicate `alarmId` counts once; an alarm with no `occurredAt` is excluded and counted.
- A jam that overlaps a planned changeover: only the unplanned part counts toward stopped minutes.
- Overlapping jam windows on one station count their union once.
- Context fully matching → `ESTIMATE` with the basis shown. Program change inside the window → `SUPPRESSED` with
  `PROGRAM_CHANGED`, and raw counts still present. Missing context → `SUPPRESSED` with `CONTEXT_MISSING`.
- No running minutes → `NO_RUNNING_TIME`, and `acceptedUnitsPerRunningMinute` is null.
- Input order does not change the output (determinism); no clock read; the module imports nothing from
  `simulation`, `responder`, `analytics` or any store.
- No output carries causal language: the output has no field that names a cause.

## 8. Open items

- `ingestedAt` versus `occurredAt` ordering rules when the source batches alarms (slice 1 uses `occurredAt` only).
- The jam reason-code list is not confirmed; slice 1 accepts any uppercase code and does not interpret it.
- Restart clearance and responder dispatch reuse the existing approval and eligibility gates; they are not in this slice.
- Whether a deficit should ever be shown without the context gate (proposal: never).
