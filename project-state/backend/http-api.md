# HTTP API reference

All routing lives in `backend/src/server.mjs` (`createRequestHandler`). There are three
kinds of routes: **deployment-global**, **room-scoped**, and **static**.

The server binds `COMPASS_HOST` (default `0.0.0.0`) on `COMPASS_PORT` (default `3000`).
All request/response bodies are JSON unless noted. A `409` with a `conflict` body is
returned for optimistic-concurrency clashes; a `4xx`/`5xx` with `{ error }` otherwise.

## Deployment-global routes

These are shared across every room (settings and diagnostics are process-wide, not
per-room).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/control-rooms` | List every room with health (`READY`/`FAILED`), mode, and clock state. |
| PATCH | `/api/control-rooms/:id/display-name` | Rename a room; optimistic concurrency returns `409 ROOM_METADATA_CONFLICT` on a revision mismatch. |
| GET | `/api/settings` | Current provider, four `roles` (compass, event-planner, investigator, narrator) with model/effort/timeout selections and validation status, plus `modelsByProvider`, credential status, and provider list. Top-level model fields alias Compass ranking. |
| GET | `/api/settings/models` | Discover the selectable models for a provider. Accepts `?provider=` to preview a provider without switching to it. |
| POST | `/api/settings` | Save `{provider, role, modelId, reasoningEffort, timeoutMs?}` for `compass`, `event-planner`, `investigator` or `narrator` (validated against the discovered catalog). Omitted role defaults to Compass; unknown roles return 400. |
| GET | `/api/logs` | Recent structured application events. Accepts `?limit=`. |
| POST | `/api/logs/client` | Accept a client-side (browser) error report. |

**Public visitors are read-only on settings.** A request carrying `Cf-Connecting-IP` (set by
Cloudflare's edge on every tunnel request) gets `editable: false` in `GET /api/settings`, and
every other `/api/settings*` route (model discovery, saves, credential changes) returns
`403 SETTINGS_READ_ONLY`. Host and LAN requests have no such header and keep full access.
`COMPASS_PUBLIC_SETTINGS=editable` lifts this for a tunnel already behind Cloudflare Access.
Tests: `public-settings.test.mjs`.

## Room-scoped routes

Every path below is addressed as `/api/control-rooms/:id/<path>`. The manager resolves
`:id`, then strips the prefix before matching the tail path shown here. An unknown `:id`
returns `404`; a non-`READY` room returns `503` before any handler body runs.

| Method | Tail path | Purpose |
|--------|-----------|---------|
| GET | `/state` | Bounded public snapshot: open work, recent closed issues/events, responders, equipment and active assignments. |
| POST | `/reset` | Reset the active mode to its seed. |
| GET | `/issues` | LIVE history page, including archived issue summaries; `limit=1..100` (default 100), `before=<previous next>` cursor; returns `issues`, `total`, `next`. Offline retains its scripted list. |
| GET | `/equipment/:equipmentId/issues` | LIVE station history with the same pagination. |
| GET | `/responders`, `/events` | Individual resource lists; events are the recent public feed. |
| GET | `/analytics` | Fixed-snapshot analytics. |
| POST | `/loadboards/boards` | Manual board entry; explicit inventory fields, optional cellId defaulting null. Returns `{decision:"ADDED",reasons:[]}`; malformed, duplicate or unknown-cell entries return 400. |
| POST | `/loadboards/checkout` | `{requestId,boardId,cellId,programRevision}` → `{decision,reasons,reservation}` through the normal serialized room write path. |
| POST | `/loadboards/release` | `{reservationId,cellId}` → the same response envelope. Host supplies the simulation timestamp. |
| GET | `/consumable-obligations` | `{roomId,asOf,obligations}`: explicit persisted slice-2 rows, with no reconciliation on GET. |
| POST | `/handler-alarms`, `/handler-runs`, `/handler-planned-stops` | Append validated handler facts, optional handlerContext; RECORDED or unchanged retry, conflicts/malformed/overlapping runs 400. |
| GET | `/handler-episodes` | Existing pure HANDLER-A episode output for the latest completed aligned three-hour window; read-only. |
| GET | `/correlation-records` | `{roomId,asOf,records}` in append arrival order; shared read-only Live/Offline projection, readiness unaffected. |
| POST | `/correlation-records` | Append explicit correlation facts; returns `{decision:"RECORDED",reasons:[]}`. Invalid/duplicate identities are 400; readiness is unaffected. |
| POST | `/calibrations` | Strict five-field manual entry through the serialized store; returns `{decision:RECORDED\|UNCHANGED,reasons:[]}`. Conflicts/malformed requests return 400. |
| GET | `/calibrations` | `{roomId,asOf,calibrations}`: explicit history with per-record FUTURE/CURRENT/EXPIRED validity at room time. |
| GET | `/cell-readiness` | `{roomId,asOf,cells:[{cellId,readiness,reasons,instruments}]}` for cells in private calibration rows, at the room simulation clock. Shared read-only Live/Offline projection; no clock advancement. |
| GET | `/loadboards` | Read-only public loadboard inventory; empty when the room has no inventory. Shared Live/Offline builder, no clock advancement. |
| GET | `/station-kpis` | Shared Live/Offline four-bucket station throughput/uptime projection. Optional `windowEnd` and comma-separated `stations`; see below. |
| GET | `/analytics/pareto` | Issue Pareto for one period: `level=DAY\|WEEK\|MONTH` (default MONTH), optional `period=<index>` (0 = current; default the most recent complete). Returns the period list, totals and two drill trees: issue class → observed symptom → applied fix, and floor → station, each with issue count, downtime minutes and failed attempts (`pareto-analytics.mjs`). Offline returns `available: false`. |
| POST | `/mode` | Switch the room between `LIVE` and `OFFLINE`. |
| POST | `/simulation/start`, `/pause`, `/resume` | Clock run-state. |
| POST | `/activity` | Browser heartbeat: marks operator activity so the idle auto-pause does not fire (`202 {accepted:true}`). Every non-GET room request also counts; GET does not. See [control-rooms.md](control-rooms.md#idle-auto-pause). |
| POST | `/simulation/speed` | Set 1× / 5× / 10× / 60×. The UI offers only 1× and 5× (recommended maximum for live AMD rankings). |
| POST | `/simulation/reset` | Reset the clock. |
| POST | `/simulation/force-event` | Immediately claim the next event through the validated scheduler path (respects the active-issue ceiling). With a live provider the planner and dispatch ranking run in the agent lane and the response returns at once; the issue appears on a later poll. Fixture and forced-failure modes stay inline. |
| PATCH | `/demo/scenario` | Update the workforce-continuity scenario. |
| GET | `/issues/:issueId/audit` | Full redacted audit trail for a hot or archived issue (Compass analysis, offers, overrides, resolution). |
| POST | `/issues/:issueId/force-resolve` | Consume the selected issue's one-shot resolution token now. |
| POST | `/issues/:issueId/assistance` | Request a second responder for an assigned issue. |
| POST | `/issues/:issueId/responders/:responderId/release` | Release one member of a roster. |
| POST | `/assignments/transfer` | Move a responder from another two-person issue. |
| POST | `/compass/recommend` | Produce a Compass recommendation for an issue. |
| POST | `/assignments/confirm`, `/assignments/override` | Accept the recommendation or override it. |

### Legacy Offline-mode routes

The Offline runtime keeps an older route shape for its scripted flow, also under the room
prefix: `POST /issues/:issueId/raise`, `POST /recommend`, `POST /confirm`,
`POST /override/:responderId`, and `GET /audit/:eventId`.

## Static & SPA

- `GET /` serves `frontend/index.html` (the room picker).
- `GET /rooms/:id` also serves `index.html` — it is a client-side route the frontend
  parses from `location.pathname` at boot, so a direct link or reload does not 404
  (`ROOM_PAGE_PATTERN` in `server.mjs`).
- `GET /rooms/:id/display/:screen` serves the same page for a wall-display screen (see
  `frontend/overview.md`, Wall-display screens).
- Any other `GET` serves a matching file from `frontend/`, constrained to that directory.

See [control-rooms.md](control-rooms.md) for why settings/logs stay global while
everything operational is room-scoped, and [frontend/overview.md](../frontend/overview.md)
for the `roomApi()` / `globalApi()` split on the client.

The generic room paths use `plant-1` and `plant-2`; the directory presents
`e8-aura-p1` and `e8-aura-p2` by default. `plant1` remains a compatibility alias
for the first room, resolving to the same runtime and metadata.

Live `/state` includes all open issues, the latest 100 closed issues and references from
the latest 100 events; active assignments/attempts, recent 30 recommendations/offers plus
pending/current-work references. Retention metadata and canonical observation rows stay
private. History pages return at most 100 summaries; archived detail is fetched only by
issue audit. Invalid page sizes or unknown cursors return 400. Analytics uses retained
compact facts and exact observations, never archive I/O on requests.

## Fix evidence in existing resources

No new mutation endpoint is required. Live issue snapshots and issue audits include the
public symptom and `fixRecommendation` (observed candidate evidence, ranking, rationale,
source, baseline/fallback picks and disagreement). Pending inference displays its usable
deterministic order. Active attempts include `fixApplied` and the frozen `fixDecision`;
audit resolution rows include the procedure, attempt number, outcome and applied source.
Legacy actions have no applied catalog fix and are labelled/excluded from fix evidence.
`/analytics` adds `fixes`; every analytics period also adds `fixes` with first-time fix
rate and recommended-vs-baseline agreement, denominators and the usual thin-sample status.
Hidden fault state and effectiveness never occur in these responses.

## Staffing approval

Live `/state` includes `workforceContinuity.backlog` (code-owned priority/class/symptom
counts), policy and policy revision, one open staffing recommendation and the latest five
closed recommendations. Public records carry ranked lawful options, observed evidence,
source, baseline comparison, deadline and recommendation revision; private scheduler and
request identities are omitted. The existing thirty-row staffing audit tail remains.

- `POST /staffing/:recommendationId/approve`: `{optionId, expectedRevision}`.
- `POST /staffing/:recommendationId/reject`: `{reason?, expectedRevision}` (reason ≤360 chars).
- `PATCH /demo/staffing-policy`: `{staffingApproval: "OPERATOR" | "AUTO_APPROVE_TOP", expectedRevision}`
  uses the policy's independent revision.

These are room-scoped under `/api/control-rooms/:id`. Revision/terminal conflicts and stale
approvals return 409, unknown recommendations 404, invalid options/reasons 400. Approval
revalidates current legal options inside the serialized mutation. No staffing changes on
stale/rejected/expired work. Offline rejects these Live-only mutations with a mode conflict.

`/analytics` includes `workforce.recommendations` outcomes, baseline agreement and unmet-risk
counts. Each `/analytics/period` row includes the same `staffingRecommendations` metrics for
its UTC decision/risk interval; compact canonical audit facts make archived months exact.

**Static caching.** Pages, scripts and styles are served with `Cache-Control: no-cache`, so a deploy is never hidden behind a browser or Cloudflare copy; files under `/vendor/` get `public, max-age=604800, immutable`. Because a CDN may still override that header, `index.html` references and relative module imports also carry `?v=<content hash of frontend/*.html|css|js>`, so each deploy fetches new URLs.

## Field reports and investigations (N3a)

Under `/api/control-rooms/:id`, both modes use the same report/investigation service;
Offline fixes both model roles to the API-free synthetic fixture path.

| Method | Tail path | Contract |
|---|---|---|
| POST | `/reports` | `{narrative,equipmentId?,reporter?}` → 202 `{reportId,issueId?,investigationId?}`; hazard/input policy runs before any model call. |
| GET | `/reports/:id` | Explicit public report, flags, revision and ranked code-built interpretations. |
| POST | `/reports/:id/confirm` | `{optionId,expectedRevision}` or `{equipmentId,issueClass,symptomCode,expectedRevision}` → `{issueId,investigationId}`. |
| POST | `/reports/:id/close` | `{reason?,expectedRevision?}`; closes report and rejects unapproved runs. |
| GET | `/investigations/:id` | Explicit investigation, model metadata, catalog procedures, qualified responders and public tool trace. |
| POST | `/investigations/:id/approve` | `{responderId,fixId,confirmedPrerequisites,expectedRevision,reason?}`; atomic safety check and assignment; manual abstained/escalated override needs a reason. |
| POST | `/investigations/:id/reject`, `/escalate` | `{reason?,expectedRevision}`; no assignment. |
| POST | `/investigations/:id/feedback` | `{useful,note?}`; records useful/not-useful (note is not persisted). |
| GET | `/cases/:caseId` | Public CaseDTO from current or compact archived facts; unknown case → 404. |

Unknown records are 404, malformed inputs or restricted simulation-marker text 400, revision/state/safety conflicts 409 `STALE`.
An occupied equipment item returns 409 `EQUIPMENT_HAS_OPEN_ISSUE` on confirmation.
`/state` includes open plus twenty recent terminal investigation DTOs and their reports;
private run tokens, authorization internals and ID-sequence metadata are excluded. Ordinary
issue audits include the public investigations. Report-created issues stay gated even on
model outage, input abstention, rejection or escalation. Existing legacy/planner-origin
issues retain their autonomous assignment behavior.


## Investigation lifecycle routes (N3b)

All paths below use the existing room-scoped prefix. `POST /investigations/:id/override`
accepts `{responderId, fixId, confirmedPrerequisites, reason, expectedRevision}` for
ABSTAINED/ESCALATED only. It returns `{status:"OVERRIDDEN", id}` and records an audited
Central command decision with reason, exact fix/responder and prerequisite confirmations.
Certification, availability, issue state and prerequisite checks are identical to approval.

`POST /investigations/:id/reinvestigate` accepts `{expectedRevision}` and returns
`{investigationId, issueId, supersedes}`. The old record becomes SUPERSEDED. Public run
fields include `createdAt`, `asOf`, `readyAt`, `deadline`, `supersedes`; private tokens stay hidden.

`PATCH /demo/investigation-policy` accepts `{expectedRevision, investigationApproval?,
investigationDeadlineMinutes?, investigationShare?}`. It returns the updated policy, including
its incremented revision, also exposed at `/state.investigationPolicy`. Defaults are OPERATOR,
30 simulated minutes and 0.2. Unknown fields/invalid values fail; stale revisions conflict.
Policy changes are audited. `/analytics.investigations` and every period's `investigations`
contain outcome counts, rates and first-fix comparison; see analytics-and-ethics.

## Ask Compass (round 22)

| Method | Path | Behaviour |
|---|---|---|
| POST | `/ask` | `{question, context?, expectedRevision?}` → answer `{answerId, status: READY|DECLINED|FALLBACK, text, citations, trace, source, model, reason?}`. Read-only; mutation request guard applies; 429 on rate limit or concurrent question; 409 `STALE` on a revision mismatch. |
| GET | `/ask/:answerId` | One stored answer; 404 `ASK_NOT_FOUND`. |

`/state` includes `askHistory` (last 20). See [assistant.md](assistant.md).

## Provider usage in settings

`GET /api/settings` includes deployment-global `usage:{today,last7Days,budgetUsd,exhausted}`,
readable even with tunnel settings locked. Today/last7Days daily entries carry day, calls,
promptTokens, completionTokens, knownCostUsd, estimatedCostUsd (null if incomplete),
unpricedCalls, byRole and byModel. Role entries have totals; model rows identify provider,
model and role. This exposes aggregates only, never prompts/credentials. Budget is env-only.

## Room mutation request boundary

Every non-GET/HEAD/OPTIONS request under `/api/control-rooms/:id` requires media type
`application/json` (parameters allowed), including commands with no body. Otherwise the
server returns 415 / `JSON_CONTENT_TYPE_REQUIRED`. A supplied Origin must exactly match
the request's scheme and Host; a reverse proxy may supply a single `X-Forwarded-Proto`
value for the external scheme. Cross-origin, null and malformed origins return 403 /
`CROSS_ORIGIN_MUTATION` before recording activity or touching the runtime. Missing Origin
is allowed for CLI/testing. These guards provide no identity authentication or operator
authorization. Report flooding additionally returns 429 / `REPORT_RATE_LIMIT` or
`REPORT_BACKLOG_FULL`; see investigation.md. JSON body limits are byte-based and return
413 / `REQUEST_TOO_LARGE`; malformed JSON returns 400 / `INVALID_JSON`.


## Station KPIs (round 28)

`GET /api/control-rooms/:id/station-kpis` returns exactly `roomId`, `asOf`, `window`,
`status`, `earliestAvailable`, `buckets`, `stations`, and `totals` from
`backend/src/station-kpis.mjs`. It reads one frozen raw state projection; neither mode
advances its clock, finalizes work or calls a provider. Offline deliberately bypasses
its ordinary advancing `snapshot()` method.

- `windowEnd`: optional UTC ISO timestamp with seconds and optional three-digit
  milliseconds, on a 00/03/06/09/12/15/18/21 UTC boundary, no later than the clock.
  Default is the latest such boundary; the window starts twelve hours earlier.
  Invalid, impossible, unaligned, future or repeated values return 400 `INVALID_WINDOW`.
- `stations`: omitted selects all; an explicit empty string selects none. At most 200
  comma-separated `EQ-` equipment IDs; invalid/unknown IDs or repeated query keys return
  400 `UNKNOWN_STATION`. Duplicate IDs are deduplicated; equipment order is preserved.
  Unknown query keys return 400 `INVALID_WINDOW`.
- Each interval is `[start,end)`. Issues raised after the requested end are excluded;
  open or later-resolved downtime is clipped at the end. `unionDowntime`, exported from
  analytics, unions overlapping intervals per station. Archived compact issue facts are
  read through `analyticHistory`, with no archive I/O.
- Station rows include `deviceId`; rates come from the immutable device catalog, not a station-specific setting.
- Expected units are device-rated units/hour × 3. Actual units are floored from precise uptime;
  displayed downtime minutes are rounded to the nearest integer to honor the API's
  integer fields. Attainment has one decimal, or null for zero expected units.
  Actual units are labelled `DERIVED_FROM_UPTIME`, not production-counter readings.
- Coverage uses analytics' retained event boundary (including compact coverage facts)
  at the room snapshot. `earliestAvailable` is coverage metadata, which may be later
  than a historical window. A bucket starting before coverage is unavailable: its
  metrics are zero with null attainment. All four buckets remain in the response;
  any unavailable bucket makes the window `PARTIAL`. This avoids projecting a full
  three-hour plan/actual denominator over a partly unobserved bucket.
- Totals sum only returned stations, including zero totals for an empty selection.
  No issue, responder, assignment, private truth or other internal identifiers appear.

The written UTC-boundary rule is authoritative; the illustrative 08:00-ending fixture
in `docs/design/station-kpi-panel.md` / `fixtures/station-kpis/` is unaligned. Backend
validation follows the written rule; main owns reconciliation of that example.


## Loadboards inventory read (round 32)

`GET /api/control-rooms/:id/loadboards` returns exactly `{roomId,asOf,boards}` from
`backend/src/loadboards.mjs`. Each board has `boardId`, `revision`, `condition`,
`cellId`, `approvedPrograms` and `heldBy` (one HELD reservation ID or null).
Board order follows the inventory list. RELEASED history never occupies a board;
multiple current holds for one board fail rather than selecting an arbitrary owner.

The optional private `loadboardInventory` room field uses the existing checkout
module's `{boards,reservations}` shape. Missing inventory returns `boards:[]`, with
no synthetic fallback or state initialization. Current projected board/HELD facts
reuse `validateLoadboardInventory`; arbitrary source fields are never copied. Raw
inventory stays out of ordinary state polling. Inventory provisioning is separate;
checkout/release commands are described in the round 33 section below.

Live uses the store's serialized read projection; Offline projects its raw state
without calling the advancing snapshot. Neither path advances a clock, writes to
a store or calls a provider. Unknown/unavailable rooms retain the existing 404/503
error shapes. This GET has no server-side filtering or checkout/release action.


## Loadboard commands and consumable obligation reads (round 33)

`POST /loadboards/checkout` and `POST /loadboards/release` use
`loadboard-service.mjs`, shared by both runtime modes. Bodies contain exactly the
fields in the route table: client requestedAt/releasedAt, inventory overrides,
missing/extra fields, invalid identifiers and protected simulation markers return
400 `INVALID_LOADBOARD_REQUEST`. Existing JSON content-type and same-origin guards
apply. Valid domain rejections return HTTP 200 with sorted reasons and null
reservation; successes return ALLOCATED or RELEASED and the public reservation row.
No inventory, room revision or private source fields occur in the response.

The service reads the latest inventory and simulation clock inside the normal store
mutation, detaches COW proxies for the pure checkout/release module, and commits
only successful inventory transitions, patching changed custody rows rather than
rewriting released history into every journal frame. HTTP requests use the store's serial queue
order; the existing pure batch API still sorts a supplied batch by timestamp/ID.
Concurrent requests cannot allocate a board or cell twice. Retrying a held request
returns a domain rejection without another reservation; consumed request IDs remain
unusable after release/restart (400 if all other checkout conditions would pass).
A fresh checkout after release uses a new requestId. Rejected commands may still
advance the normal room transaction revision, but leave inventory unchanged.

Live writes use the existing journal/failure-recovery path; Offline uses its normal
synchronous in-memory mutation adapter and never calls a provider. The timestamp is
the current stored simulation time, not wall time or an encoded client ID. Inventory
provisioning remains separate: an unconfigured room rejects checkout as BOARD_UNKNOWN.

`GET /consumable-obligations` returns every stored slice-2 row, explicitly projected
from the private ledger by `consumable-obligations.mjs`. It validates row/link shape
and applies the hidden-truth guard. The response contains roomId, current simulated
asOf and obligations only; counter packets and reconciliation digests are excluded.
Both modes use raw read projections without advancing the clock, running evaluation
or writing state. Missing history is an empty array. Room 404/503 errors are unchanged.


## Calibration readiness read (round 35)

GET `/api/control-rooms/:roomId/cell-readiness` returns every distinct cell in the
room's optional private `calibrations`, sorted by cellId. Missing rows yield cells: [].
Instrument entries expose instrumentId, calibrationId, dueAt and CURRENT/EXPIRED
state for the latest effective calibration. Future-only cells are NO_CALIBRATION.
Unknown rooms retain the normal 404. All decisions use asOf from simulationTime;
GET does not reconcile, mutate, advance time or call providers. The checkout HTTP adapter now enforces this gate inside the write transaction
(round 36); missing/expired cells reject with CELL_NOT_READY at HTTP 200.


## Calibration entry (round 36)

POST `/api/control-rooms/:roomId/calibrations` accepts exactly calibrationId, cellId,
instrumentId, calibratedAt and dueAt. Dates must be valid UTC, with dueAt not before
calibratedAt. Unknown/protected fields are invalid. New rows return HTTP 200 with
`{decision:"RECORDED",reasons:[]}`; exact identity retries return UNCHANGED. Conflicting
identities or same-instant competing records return 400 and do not alter history.
Future calibration dates are allowed but ignored by readiness until effective.
Normal JSON/origin and room guards apply. GET returns all explicit rows, canonical
UTC dates and their per-record time validity; it does not advance clocks or mutate.
No calibration row is copied into ordinary state/model payloads.


## Board entry (round 38)

POST `/api/control-rooms/:roomId/loadboards/boards` accepts boardId, revision,
condition, approvedPrograms and optional cellId (default null). The existing strict
inventory validator checks fields and values; unknown/protected fields are invalid.
Non-null cellId must appear in the room's calibration rows. Duplicate boardId,
unknown cell or malformed input returns 400; success returns HTTP 200 with
`{decision:"ADDED",reasons:[]}`. Eligibility for later checkout is still evaluated
separately. Entry uses the same serialized store path as checkout and does not add
reservations or rewrite existing rows. Live and Offline share the service.


## Correlation entry (round 39, F8 slice 2)

POST `/api/control-rooms/:roomId/correlation-records` accepts exactly correlationId,
cellId, instrumentId, referencePartId, observedAt and result (PASS/FAIL/INCONCLUSIVE).
Dates are strict UTC and canonicalized to milliseconds; IDs are bounded synthetic
identifiers. The route appends one fact through the shared serialized room mutation
path; it never updates an existing record or changes calibration readiness.
Success is HTTP 200 `{decision:"RECORDED",reasons:[]}`. Duplicate/conflicting IDs,
invalid dates, unsupported/unknown/protected fields return 400. Normal JSON/origin
and room guards apply. Round 40 adds the dedicated read GET; no update or delete route is added. Ordinary
state polling excludes this private history in both modes.


## Correlation read (round 40)

GET `/api/control-rooms/:roomId/correlation-records` returns `{roomId,asOf,records}`.
Records contain exactly the six source fields and retain arrival order even when
observedAt timestamps arrive out of order. Absent history returns records: [].
Reads preserve room revision, clock and readiness; no provider call or write occurs.
Unknown rooms retain the standard 404. Invalid POST result values remain 400 and
do not change subsequent reads. There is no update or delete endpoint.


## Handler inputs and episodes (round 41)

POST handler-alarms accepts alarmId, reasonCode, occurredAt and ingestedAt; explicit
null occurredAt records excluded occurrence evidence. POST handler-runs accepts runId,
start, end and acceptedUnits. POST handler-planned-stops accepts stopId, start, end
and reasonCode. Each body optionally includes handlerContext with observedAt,
programRevision, activeSiteCount and referenceUnitsPerHour; context is atomic with
the entry. No extra fields are allowed. Dates are strict UTC, reasons uppercase,
counts nonnegative integers, and non-null site count positive integer. Runs must
be disjoint and contained in a single aligned UTC three-hour bucket. Planned stops
may overlap and span windows. Conflicting identity/context or malformed input is 400.
Success returns HTTP 200 `{decision:"RECORDED",reasons:[]}`; identical complete retry
returns UNCHANGED without writing. No update/delete endpoint is added.

GET handler-episodes returns the pure episode contract with stationId HANDLER-A and
window ending at floor(simulationTime / three hours), beginning three hours earlier.
It uses the window-start reference/context baseline and complete context trail for
suppression. Missing baseline context/reference suppresses estimates; raw episodes
and minutes remain visible. GET does not mutate state or advance the simulation.
No station/window selector is introduced in this single-handler slice.


Round 42 changeover readiness remains a pure module: no changeover room records or
entry path exist. Per the assignment, no changeovers/:changeoverId/readiness endpoint
is added until there is an actual stored changeover to read.
