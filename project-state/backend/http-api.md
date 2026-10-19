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
