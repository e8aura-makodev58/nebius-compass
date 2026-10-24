# Station KPI panel (3-hourly, 12-hour window)

Status: **approved for build, round 28.** Synthetic, domain-neutral data only. Shared Live and Offline path
(`AGENTS.md` rule 6). The panel reads only application-owned facts; no model is involved.

## 1. What the user sees

A workspace panel, **Station KPIs**, that shows for each selected station the KPIs of each **3-hour bucket** in a
selected **12-hour window** (four buckets per window).

- **Station filter:** multi-select over all stations on all floors, with search, *All*, and *None*. The filter is
  per-viewer and not saved to the room. Default: all stations.
- **Window selector:** the window is 12 hours, aligned to 3-hour boundaries (00, 03, 06, … UTC). Controls: *Latest*,
  *Previous 12 h*, *Next 12 h* (disabled at *Latest*), and a select of recent windows. The default is the latest
  complete 12-hour window ending at or before the simulation clock.
- **Per bucket, per station:**
  - **Quantity processed** (units), the actual output.
  - **Expected output** (units), the plan for the bucket.
  - **Attainment** = actual ÷ expected, as a percentage. Show "—" when expected is 0.
  - **Downtime** (minutes) and **issues raised** in the bucket.
- Totals row per bucket across the selected stations.
- Phone width: stations as cards with the four buckets stacked. No horizontal page scroll. Touch targets ≥ 44 px.

## 2. Definitions (the contract)

- **Rated throughput:** each station has `ratedUnitsPerHour` (integer, 40–120). It is a plan parameter, not a
  simulation outcome. Existing rooms are migrated with a deterministic value derived from the station ID (a hash,
  not an RNG stream), so existing seeds and tests keep their behaviour.
- **Bucket:** `[start, end)` of 180 minutes, aligned to UTC 3-hour boundaries.
- **Expected output** = `ratedUnitsPerHour × bucketMinutes / 60`. There are no planned stops in this version.
- **Downtime minutes** = the union of each issue's downtime interval (`downtimeStartedAt ?? raisedAt` until
  `resolvedAt`, or the `asOf` clock while open), intersected with the bucket. Overlapping issues on one station count once.
  Interval rules match `backend/src/analytics-service.mjs` (`unionDowntime`), so the two views agree.
- **Actual output** = `ratedUnitsPerHour × (bucketMinutes − downtimeMinutes) / 60`, rounded down.
  **This is derived from uptime, not a production counter.** The response marks it `source: "DERIVED_FROM_UPTIME"`
  so the UI can say so, and a later live-maintenance source replaces it with `source: "COUNTER"` without changing
  the shape.
- **Issues raised** = issues whose `raisedAt` falls in the bucket.
- **Cutoff:** every value uses only facts at or before `asOf` (the window end, capped at the simulation clock).
  Future issues are never returned.
- **Retention:** windows whose start is earlier than retained history return `status: "PARTIAL"` with the buckets
  that are available, and each bucket carries `available: false` where no data exists. Archived issues are read
  through the compact facts, the same way analytics reads them.

## 3. API

`GET /api/control-rooms/:roomId/station-kpis`

Query parameters:
- `windowEnd` (optional, ISO-8601 UTC, must be a 3-hour boundary, default latest). Must be ≤ the simulation clock.
  Otherwise `400 INVALID_WINDOW`.
- `stations` (optional, comma-separated station IDs, max 200 IDs, each matching the existing equipment ID pattern).
  Unknown IDs → `400 UNKNOWN_STATION`. Default: all stations.

Response (200):

```json
{
  "roomId": "plant-1",
  "asOf": "2026-09-01T08:00:00.000Z",
  "window": { "start": "2026-08-31T20:00:00.000Z", "end": "2026-09-01T08:00:00.000Z", "hours": 12, "bucketHours": 3 },
  "status": "READY",
  "earliestAvailable": "2026-08-25T00:00:00.000Z",
  "buckets": [
    { "start": "...", "end": "...", "available": true }
  ],
  "stations": [
    {
      "stationId": "EQ-01",
      "name": "Station 1",
      "floor": 1,
      "ratedUnitsPerHour": 72,
      "buckets": [
        {
          "start": "...", "end": "...", "available": true,
          "expectedUnits": 216, "actualUnits": 180, "attainmentPercent": 83.3,
          "downtimeMinutes": 24, "issuesRaised": 1, "source": "DERIVED_FROM_UPTIME"
        }
      ]
    }
  ],
  "totals": [ { "start": "...", "end": "...", "expectedUnits": 0, "actualUnits": 0, "downtimeMinutes": 0, "issuesRaised": 0 } ]
}
```

Rules:
- `stations` is ordered as the equipment list. `totals` sums the stations in the response, not the whole room.
- `attainmentPercent` is `null` when expected is 0. Numbers are integers except attainment (one decimal).
- Responses carry only these fields. No hidden responder skill, no simulation truth, no internal IDs beyond station IDs.
- The endpoint is a read. It does not advance or change the simulation, and it is allowed in Offline mode.

## 4. Build split

| Agent | Scope |
|---|---|
| codex | Backend: `ratedUnitsPerHour` in the schema, validation, and migration; `backend/src/station-kpis.mjs` (pure, no I/O); the route; hermetic tests; project-state backend page. |
| gemini | Frontend: the panel, its registration in the workspace, the filter and window controls, the phone layout, and the loading, empty and error states. Uses the API contract above with route stubs until the backend lands. Its own E2E file. |
| claude (main) | This spec, the contract and the shared synthetic response fixture (`fixtures/station-kpis/`), review, merge, deploy, and the final `project-state` pages. |

Files are disjoint: codex owns `backend/`, gemini owns `frontend/` and `e2e/station-kpi*.spec.mjs`, and main owns
`docs/` and `fixtures/station-kpis/`. Shared files (`handover.md`, `project-state/log.md`) are edited only per the protocol.

## 5. Acceptance

- Backend: hermetic tests for bucket alignment, downtime spanning buckets, overlapping issues counted once, open
  issues at `asOf`, the cutoff (future issue never returned), archived issue read, PARTIAL windows, invalid window and
  station errors, and migration determinism. `npm test` passes.
- Frontend: panel visible in the workspace; filter and window controls work; 375 px and 1280 px layouts have no
  horizontal scroll; "DERIVED_FROM_UPTIME" is labelled; loading, empty and error states render.
- E2E: the panel renders from the live endpoint, filter and window changes update it, and a forced endpoint failure
  shows the error state. Forced-provider E2E passes.

## 6. Open items, decided here

- Actual output is derived until a production counter source exists. The label is part of the contract.
- No planned stops or shift calendar in this version. Planned stops are a later addition and would reduce expected output.
- Windows are UTC. Local time display is a later change once the plant's time zone is confirmed.
