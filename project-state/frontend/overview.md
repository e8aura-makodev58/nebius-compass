# Frontend

The frontend is a **vanilla-JavaScript single-page application** served as static files
from `frontend/`. No framework, no bundler, no build step. It polls room state every 1.5s
and re-renders. Node serves these files directly (see [../backend/http-api.md](../backend/http-api.md)).

## Files

| File | Responsibility |
|------|----------------|
| `index.html` | The DOM scaffold: the room-picker view (shown at `/`) and the app shell — tabs (Live Floor, Control Rooms, Analytics, Settings), the floor-map container, sidebar panels, simulation controls, search palette, audit trail, and demo controls. |
| `app.js` | The SPA controller. Parses `/rooms/:id` at boot, polls state, and renders every panel. Handles issue/responder selection, staffing actions, the map (pan/zoom/rotate, floor switching, 2D vs. 2.5D), control-room search, analytics, the audit trail, and the settings forms. |
| `investigation-view.js`, `investigation.css` | The **Field reports** tile (plan v2 §3, N4): report form, interpretation confirmation, investigation detail (cited case chips, verbatim procedure, safety class, qualified responders, prerequisite checkboxes, approve/escalate/reject, feedback, tool trace) and a case viewer dialog. Renders backend DTOs only; narrative text is always escaped. Since N3b it also shows the decision deadline, a **Re-investigate** action, and an audited **manual dispatch (override)** form for ABSTAINED/ESCALATED runs: fix select, responders filtered to available holders of the fix's certifications, prerequisite checkboxes and a required reason. The form survives polling. The module also renders the Settings → Demo field report policy (`PATCH /demo/investigation-policy`) and the Analytics "Field report investigations" panel (`/analytics.investigations`). Real routes are tested in `e2e/investigation-real.spec.mjs`; `investigation-ui.spec.mjs` is the stubbed contract for the approve flow. |
| `ask-view.js` | **Ask Compass** dialog, opened from the header button: a question box with an opt-in "ask about the selected issue" context, and the answer history from `/state.askHistory` (newest first) with status (Answered / Declined / Record summary) and source badges. Each citation navigates to its record: issue/responder via the search selection, event via its detail, investigation via the Field reports tile, analytics via the Analytics tab, and cases open inline. Text is always escaped. Dialog styles in `investigation.css` implement Improvements 1–5: flex column layout with fixed header/form and dedicated scrolling history, semantic left-border status indicators (accent for ready, amber warn for declined, rule-strong for fallback), elevated interactive citation pills (`.inv-case`), mobile touch target compliance (≥44px), and tactile Nebius lime hover/focus states for `#open-ask`. |
| `workspace-nav.js` | Local phone workspace selection (Issues, Floor, Decisions, Events, KPIs, Boards, Life, Jams, Cals, Changeovers), pending-decision counts and selected-task reveal; reuses the existing DOM across the Dockview breakpoint. |
| `station-kpis-view.js`, `station-kpis.css` | The **Station KPIs** panel (Round 28 / 28f / 30, `docs/design/station-kpi-panel.md`): 3-hourly bucket metrics across a 12-hour window (actual output, planned expected units, attainment percentage, downtime minutes, issues raised) and totals summary across selected stations. Displays ATE setup name, `deviceId`, and rated throughput (e.g. `ATE 1 · SR1260 · 1,260 UPH`) per station. Features per-viewer multi-select station filter with instant search, All/None controls, and full keyboard navigation (Enter/Space toggle, Tab traversal, Escape dismissal); 12-hour window navigation controls (Latest, Previous 12 h, Next 12 h, and recent windows dropdown); and explicit "DERIVED_FROM_UPTIME" source indicator. Responsive design supports desktop table layout (≥901px) and phone card layout (≤900px, 4 stacked 3h buckets per card) with 44px touch targets and zero horizontal scroll. Includes robust loading, empty, and forced-failure error states with retry affordances, plus deterministic synthetic fallback when backend routes are pending. In Round 41, performed an ATE terminology pass on visible labels (eyebrow 'ATE setup throughput', filter summary 'ATE setups (N of M)', column header 'ATE setup', totals footer 'Totals (N ATE setups)', search placeholders, aria-labels, and empty states), matching `docs/design/station-kpi-panel.md` §1 while preserving API field names, IDs, CSS classes, and panel title. Tested against both live backend endpoint and synthetic fixtures in `e2e/station-kpi.spec.mjs`. |
| `loadboards-view.js`, `loadboards.css` | The **Loadboards** inventory and checkout panel (Round 31, tightened in Round 32, actions added in Round 33, F3 slice 2 UI, `docs/design/loadboard-checkout-slice-1.md`; cell readiness gate added in Round 35, F8 slice 1 UI, `docs/design/calibration-readiness-slice-1.md`; blocked checkout link added in Round 37; board entry drawer added in Round 38; audited and hardened in Round 39): inventory viewer listing boards with `boardId`, `revision`, `condition` (`SERVICEABLE`, `UNDER_REPAIR`, `QUARANTINED`), current location (`cellId` or `In store`), approved programs pills (`approvedPrograms`), and reservation hold status (`heldBy` or `Available`). Features instant text search, condition dropdown filter (`ALL`, `SERVICEABLE`, `UNDER_REPAIR`, `QUARANTINED`), keyboard-reachable row action buttons (`Inspect`), and expandable inspection drawers (`.lb-detail-drawer`). In Round 33, adds interactive **Check out** (per available board, with station picker and program picker from its approved programs) and **Release** (per held board) actions against write contracts `POST /loadboards/checkout` and `POST /loadboards/release`. Displays returned plain text `reasons` next to the row, refreshes inventory after every action, announces outcomes in an `aria-live="polite"` live region (`#lb-live-announcer`), and deduplicates event bindings on unchanged poll ticks. In Round 35, adds cell calibration readiness gate (F8 slice 1 UI): calibration readiness bar (`.lb-readiness-bar`) with chips per ATE setup (`READY`, `EXPIRED`, `NO_CALIBRATION`) and expandable instrument calibration drawer (`.lb-readiness-detail-drawer`); location column displays mini readiness badges; boards assigned to non-ready cells display check-out action as unavailable with reason; checkout form dynamically disables confirmation and displays warning when an expired or non-calibrated station is selected. In Round 37, when a checkout is rejected with `CELL_NOT_READY` or a stationed board's cell is unready, displays the readiness reason next to the row and a non-submitting action "Add calibration for <cellId>" (`.lb-add-cal-action`) that reveals the Calibrations panel, opens the entry form with `cellId` pre-filled, and moves focus to `#cal-input-id`. In Round 38, adds an **Add board** drawer (`.lb-add-drawer`) toggled via `.lb-toggle-add-btn`: includes inputs for `boardId`, `revision`, `condition` (`SERVICEABLE`, `UNDER_REPAIR`, `QUARANTINED`), optional `cellId` with datalist suggestions, and comma-separated `approvedPrograms` validated client-side. Submits against contract `POST /api/control-rooms/:roomId/loadboards/boards` returning `{ decision: "ADDED" | "REJECTED", reasons: [] }` with stub-first local duplicate fallback when 404. Surfaces plain text rejection reasons in `.lb-form-error`, announces outcomes in `#lb-live-announcer`, and maintains focus transitions. In Round 39, adds Escape key handling on `.lb-checkout-form`, `.lb-readiness-detail-drawer`, and `.lb-detail-drawer` to return focus to triggers. Responsive layout adapts between desktop table (≥901px) and phone cards (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px. Tested in `e2e/loadboards.spec.mjs`, `e2e/loadboard-actions.spec.mjs`, `e2e/cell-readiness.spec.mjs`, `e2e/calibration-link.spec.mjs`, `e2e/board-entry.spec.mjs`, and `e2e/panel-audit-r39.spec.mjs`. |
| `obligations-view.js`, `obligations.css` | The **Obligations** panel (Round 32, consumable life slice 2 UI, `docs/design/consumable-life-slice-2.md` §5; audited and hardened in Round 39): read-only viewer displaying active and resolved consumable obligations with `obligationId`, `kind` (`CLEANING`, `REPLACEMENT`, `RECONCILIATION`), `status` (`OPEN`, `CLOSED`), `lifecycleId`, `policyId@version` (e.g. `probe-card-clean@v1`), `openedAt` timestamp, and `closeReason` (`CLEANED`, `REPLACED`, `SUPERSEDED`, `RESOLVED_BY_READING`). Features status dropdown filtering (`ALL`, `OPEN`, `CLOSED`), real-time search input filtering across ID, kind, lifecycle, policy, and reason with focus retention, keyboard-reachable inspect drawers (`.obl-detail-drawer`), and manual refresh. In Round 39, adds Escape key dismiss on `.obl-detail-drawer` returning focus to row action trigger. Responsive design supports desktop table layout (≥901px) and mobile card layout (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px. Built stub-first against read contract `GET /api/control-rooms/:roomId/consumable-obligations` with room state sync (`state.consumableObligations`), deterministic synthetic fallback, and robust loading, empty, and forced-failure error/retry states. Tested in `e2e/obligations.spec.mjs` and `e2e/panel-audit-r39.spec.mjs`. |
| `handler-episodes-view.js`, `handler-episodes.css` | The **Handler episodes** panel (Round 34, candidate F4 slice 1 UI, `docs/design/handler-jam-episodes-slice-1.md`; audited and hardened in Round 39): lists jam episodes with `episodeId`, `reasonCode`, `jamCount`, `unplannedStoppedMinutes`, `classification` (`PATTERN` or `SINGLE_EVENT`), alarm trail chips (`alarmIds`), and reference-rate throughput deficit display. Deficit reads "Estimate: N units" with basis (`referenceUnitsPerHour`, `windowMinutes`, `denominator`) when `deficitStatus === "ESTIMATE"`, and "Suppressed: reasons" when `deficitStatus === "SUPPRESSED"`, with strict adherence to never calling it "measured" or claiming causal attribution. Features classification dropdown filter (`ALL`, `PATTERN`, `SINGLE_EVENT`), real-time search input filtering across episode, reason, classification, and alarm IDs with focus retention, expandable inspection drawers (`.he-detail-drawer`), summary cards for window minutes, unplanned/planned/running time, and accepted units/min. In Round 39, adds Escape key dismiss on `.he-detail-drawer` returning focus to row action trigger, and darkens `.he-deficit-tag` background (`#166534`) to achieve 8.01:1 contrast ratio against white text (WCAG AA). In Round 41, updated header eyebrow visible label from 'Station Operations · F4' to 'ATE Setup Operations · F4', keeping badge IDs and CSS classes intact. Built stub-first against read contract `GET /api/control-rooms/:roomId/handler-episodes` with room state sync, deterministic synthetic fallback, and loading, empty, and forced-failure error/retry states. Responsive design adapts between desktop table (≥901px) and phone cards (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px. Tested in `e2e/handler-episodes.spec.mjs` and `e2e/panel-audit-r39.spec.mjs`. |
| `calibrations-view.js`, `calibrations.css` | The **Calibrations** panel (Round 36, F8 slice 2 UI, `docs/design/calibration-readiness-slice-1.md`; Round 37 blocked-checkout linkage; audited and hardened in Round 39; correlation records added in Round 40): calibration records manager displaying calibration rows with `calibrationId`, `cellId`, `instrumentId`, `calibratedAt`, `dueAt`, and `state` (`CURRENT`, `EXPIRED`). Includes an expandable add form with client-side date and identifier validation (preventing submission when due date precedes calibration date), server plain text reason display on rejection, and polite live region announcements (`#cal-live-announcer`). Features real-time search filtering across ID, cell, and instrument with input focus retention, state select dropdown (`ALL`, `CURRENT`, `EXPIRED`), manual refresh, and empty state with filter reset. In Round 37, supports `compass:open-add-calibration` and `openAddForm({ cellId })` to prefill `cellId` and move focus to `#cal-input-id` from blocked checkout actions. In Round 39, adds Escape key dismiss on `.cal-add-form` returning focus to `.cal-toggle-add-btn`. In Round 40, adds a **Correlation records** section below the calibration table displaying reference-part comparison observations (`correlationId`, `cellId`, `instrumentId`, `referencePartId`, `observedAt`, `result` PASS/FAIL/INCONCLUSIVE) with a plain-text evidence-only notice explaining it does not affect cell calibration readiness, and an append-only form (`.cal-add-corr-drawer`) without edit or delete affordances, built stub-first against `GET /api/control-rooms/:roomId/correlation-records` and `POST /api/control-rooms/:roomId/correlation-records` with offline fallback. Responsive layout adapts between desktop table (≥901px) and phone cards (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px. Tested in `e2e/calibrations.spec.mjs`, `e2e/calibration-link.spec.mjs`, `e2e/panel-audit-r39.spec.mjs`, and `e2e/correlation-records.spec.mjs`. |
| `changeover-readiness-view.js`, `changeover-readiness.css` | The **Changeover readiness** panel (Round 42, candidate F5 slice 1 UI, `docs/design/changeover-readiness-slice-1.md`): deterministic precursor check for planned changeovers displaying `changeoverId`, cell (`cellId`), target program (`targetProgramRevision`), start time (`startsAt`), overall status (`BLOCKED` or `READY`), and one row/card per requirement check (`LOADBOARD_AVAILABLE`, `CELL_READY`, `KIT_AVAILABLE`, `CREW_QUALIFIED`) with plain text results (`PASS`, `FAIL`, `UNKNOWN`), plain-text reasons, and assigned `boardId` on `PASS`. Adheres to strict accessibility rules (never color alone carries a result; WCAG AA contrast >= 4.5:1). Features changeover dropdown selector (`CO-0031`, `CO-0032`, `CO-0033`), manual refresh, and polite live region announcements (`#co-live-announcer`). Built stub-first against read contract `GET /api/control-rooms/:roomId/changeovers/:changeoverId/readiness` with room state sync, deterministic synthetic fallback, and robust loading, empty, and forced-failure error/retry states. Responsive design adapts between desktop table layout (≥901px) and mobile cards layout (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px. Tested in `e2e/changeover-readiness.spec.mjs`. |
| `login-view.js`, `login.css` | The **Guest workplace login** view (Round 46 / Round 47, `docs/design/guest-workplaces.md` §1, §8): guest workplace authentication controller and view. In Round 47, `frontend/app.js` is hardened to fail closed: when `fetchSession()` encounters a 401, hides the app shell and displays the login view; on any other failure (network drop, 500, non-200), displays an explicit error alert (`#session-boot-error`) rather than booting unauthenticated. Removed legacy fallback branches. E2E test suites authenticate through a shared Playwright fixture (`e2e/helpers/session-fixture.mjs`) stubbing `GET /api/session` for all test rooms while keeping real login UI flow for `e2e/login.spec.mjs`. Renders a login form with username and password fields, accessible labels, full keyboard navigation, clear busy state (`aria-busy="true"`, disabled inputs, 'Signing in…' label), rate-limit feedback (429 wait message), and a single generic error line without username enumeration. On success, boots into the returned guest workplace and displays a visible header Sign out button calling `POST /api/session/logout`. Features phone width (375px) compliance with zero horizontal overflow, Nebius palette without lime as text, focus-visible rings (≥2px outline width), and zero credentials stored in browser storage. Tested in `e2e/login.spec.mjs` and full E2E suite. |
| `focus-trap.js` | Accessible focus trapping utility (`trapFocus(container, event)`) for modal dialogs, drawers, and popups. Traps Tab and Shift+Tab within visible, non-disabled interactive elements inside the active container. |
| `render-lifecycle.js` | An idempotent HTML writer (`setHtml`) that preserves form state (select values, focus) across the 1.5s re-render so polling never clobbers an in-progress interaction. |
| `map-label-layout.js` | Screen-space label layout for the floor map: lane-based collision avoidance for equipment/responder bubbles, measured against projected geometry each frame. |
| `icons/` | The supplied Response Compass branding, kept under its original file names: `Compass_application_logo_icon_20261025201828.jpg` (the logo, shown above the room picker) and `Compass_application_logo_icon.ico` (the browser favicon, linked from `index.html`). Copied from codex's branch (`3ce72bc`). |
| `tokens.css` | Modern light tokens (cool-grey / white surfaces, indigo accent, radii and elevation), plus the local-font CSS import; see `docs/design/modern-light.md` and, for the Nebius palette since 2026-10-19, `docs/design/nebius-theme.md`. |
| `base.css`, `floor.css`, `panel.css`, `ops.css`, `analytics.css` | Per-area styles: shell/header/controls, the map and feeds, the context panel, Settings/Demo/Control Rooms, Analytics. |
| `layout.css` | Responsive and bounded-workstation layout. Linked last so it overrides the area files. In Round 29, includes comprehensive phone touch target compliance (>= 44px min-height/width across tab controls, simulation controls, search, staffing, investigation, map controls, event feed, context panel, analytics nav/summaries, and station KPI options). |
| `tiling.js`, `tiling.css` | Dockview adapter, validated per-browser layout persistence, keyboard splitters and token-based tile chrome. |
| `vendor/fonts/` | Local Latin Inter Variable and JetBrains Mono Variable faces (normal and italic), CSS and SIL OFL licences; generated by `scripts/vendor/fonts.mjs`. |
| `vendor/dockview/` | Pinned Dockview 8.3.1 browser ESM, extracted upstream stylesheet, licence and provenance; reproduced with `npm run vendor` (`scripts/vendor-frontend.mjs`). |

Paper-facing text tokens are checked at WCAG AA normal-text contrast (4.5:1) on
all five light surfaces (page, card, recessed, selection and alert) by `backend/tests/design-tokens-contrast.test.mjs`. Use
`--accent-ink`, `--warn-ink`, and `--ok-ink` for coloured text; the corresponding
base colours remain for marks, rules and fills. White `--on-accent` text is checked
against solid accent and accent-ink button backgrounds. The UI uses locally served
Inter for copy and JetBrains Mono for figures/IDs; `npm run vendor` regenerates
only the Latin normal/italic font faces alongside the Dockview assets.
Soft borders, 6–10px corners, subtle elevation and segmented controls follow
`docs/design/modern-light.md` and `docs/design/nebius-theme.md`. Theme enhancements (E1, E2, E4–E7)
provide standardized empty states (`.empty-state`), hardened microcopy contrast using `--ink-2`,
compact mobile 375px headers, non-italic incident narratives with Nebius navy borders and lime-wash
cited case chips, tabular-aligned Settings usage metrics, and universal keyboard `:focus-visible` states.
In Round 43, completed a workspace-wide keyboard-only accessibility pass across all 13 panels (Staffing, Field reports, Map, Issues, Events, Context, Analytics, Station KPIs, Loadboards, Obligations, Calibrations, Handler episodes, Changeover readiness): verified sequential tab order following logical reading order with zero positive tabindices; enforced ≥2px solid focus rings with compliant contrast across all inputs, buttons, selects, and summary elements (`frontend/base.css`, `station-kpis.css`, `calibrations.css`, `loadboards.css`, `obligations.css`, `handler-episodes.css`, `changeover-readiness.css`, `investigation.css`, `analytics.css`); and wired accessible focus trapping (`trapFocus`) and Escape key dismiss with trigger focus return across search palette (`#control-search-palette`), Ask dialog (`#ask-dialog`), case viewer dialogs (`.inv-case-dialog`), add/inspect drawers in Loadboards, Calibrations, Obligations, and Handler episodes, Station KPIs filter dropdown, Screen launcher menu, and Analytics drilldown.
The dashboard isolates its stacking context so tile dividers stay below the search palette.
Analytics period charts use full-width rows on desktop, with unbroken dates and word-wrapped completeness labels;
long series scroll locally on narrow screens.


## How it talks to the backend

Two explicit helpers, so every call site states its scope (see
[../backend/control-rooms.md](../backend/control-rooms.md)):

- `roomApi(path, options)` → `/api/control-rooms/:id` + `path` (room-scoped).
- `api()` sends `Content-Type: application/json` on every POST/PUT/PATCH/DELETE, even without a body: room mutations reject other types (415) and cross-origin `Origin` headers (403).
- `globalApi(path, options)` → `/api` + `path` (deployment-global: settings, logs).

`currentControlRoomId` is parsed once from `location.pathname` at boot. Room switching is
full-page navigation, not in-page teardown. Real input on a visible page (pointer, key,
wheel, touch, returning to the tab) sends `POST /activity` at most once a minute so the
server's idle auto-pause knows someone is there; the state poll never does
(`startActivityHeartbeat`). Polling pauses while an action is in flight or
a pointer gesture is active, then resumes.

## Live Floor layout

At desktop widths (≥901px), `tiling.js` adopts the existing map section, issue-list
section, event-feed section, Field reports section, Staffing section and dispatch/context aside into six Dockview tiles. It
resolves all nodes before moving any of them, and retains their IDs, ARIA attributes,
listeners and `app.js` references. The default has the map at upper left, issues/events
beneath it, and a right column of context, Field reports and Staffing. The frame's minimum height is 560px so the three stacked tiles keep their minimum sizes. Tiles fill the bounded frame; dividers resize both
neighbours and clamp to panel minimum sizes. Users can drag tiles to edges and
maximise/restore a group. Centre merges, floating groups and pop-outs are disabled. Each tile's header has a labelled action toolbar (`role="toolbar"`, `aria-label="Tile actions"`) containing **Open in window** and **Maximise** / **Restore** buttons with tile-specific accessible names and titles. **Open in window** opens that panel's wall-display page (`/rooms/:id/display/:screen`; the dispatch/context tile opens `dispatch`) in its own window, so it can be moved to another monitor. The tile then shows a notice with **Bring back to this workspace** (see Wall-display screens). The window name is per panel, so pressing the button again focuses the same window. Active tabs feature an inset accent bar indicator (box-shadow) so state is not conveyed by colour alone, and tile action controls enforce a 44px minimum touch target on mobile viewports. Pop-ups must be allowed for the site.
Very short desktop windows scroll the page to keep the minimum-sized frame reachable.

Layout persistence is per browser (`responsecompass.tiling.v1`), debounced and guarded
against blocked/full storage. Stored JSON has a version and a 200,000-character cap;
validation requires exactly the six known panels (a layout saved before Field reports existed resets to the default), one per group, with no detached or
hidden regions. Persisted constraints/parameters are replaced with application-owned
values. Invalid or infeasible geometry falls back to the default; **Reset layout**
restores the default. An owned `ResizeObserver` ignores zero-sized hidden workspaces,
so switching to Analytics or Settings cannot erase the saved proportions. A separate
map observer remeasures projected labels after tile resizing.

Splitters are focusable separators; arrow keys resize by 10px (Shift: 40px) through
Dockview's constrained pointer-resize path, with visible focus. Below 901px, the adapter
restores the original nodes to their original positions and disposes Dockview, keeping
the stacked document flow. Returning to desktop restores the saved layout.

Dockview is locally vendored and imported only by `tiling.js`; no CDN or external
assets are required. `npm run vendor` copies the browser ESM and MIT licence and
extracts the upstream CSS string verbatim without executing the UMD bundle.

## The map

The manufacturing floor is split into **world geometry inside a CSS-3D scene** and
**readable text in a screen-space overlay layer** (`map-label-layout.js`). This split is
deliberate and is the foundation for a fuller 3D floor — keep it when extending the map.
Three floors, ~20–30 machines each; a 2D top view and an optional 2.5D isometric overview.

## Speed menu

The header speed menu offers **1× and 5×** only (`RECOMMENDED_SPEEDS` in `app.js`). A live
AMD ranking takes about 40–90s, so above 5× it arrives long after the simulated dispatch has
moved on. A room already running faster (the API still accepts 10× and 60×) shows its speed
as a disabled "above recommended" option until the operator lowers it.

The status bar's **Run** dot (`#status-bar-dot`) blinks while the simulation is RUNNING, is amber when PAUSED and grey otherwise. The top-bar agent dot is separate and blinks only while an agent is working.

## Wall-display screens

A control room can put each panel on its own monitor. `/rooms/:id/display/:screen` shows
one panel full screen (`DISPLAY_SCREENS` in `app.js`: every workspace panel plus `analytics` and
`pareto`; screen names are camelCase, e.g. `stationKpis`, `handlerEpisodes`), with the room's simulated clock, run state and agent activity,
and none of the console controls (view tabs, mode, speed, pause, reset, search). It is
the same page and state as the console, so panels stay interactive. Tiling is not
started on a display screen. An unknown screen name falls back to the console. The
console's **Screens** menu (next to Find in Control Room) lists all 14 screens. Each choice opens a
chooser: **Split into this workspace** brings a panel's tile back (or activates it), and **Open in its own
window** detaches it. Analytics and Issue Pareto are views, so they offer only the window. On a phone the
chooser offers only the window, since there are no tiles.

**Detached panels** (`frontend/window-panels.js`). A panel is either docked or detached. A detached panel's
tile shows "is open in its own window" with **Bring back to this workspace**, which closes the window. The
state is the set of live display windows, shared over a `BroadcastChannel` named `compass-panels:<roomId>`:
a display window announces `open` on boot, answers `hello`, sends `closed` on `pagehide`, and closes on
`dock`. Nothing is persisted, so a reload keeps the notice only while the window is open. A detached panel's
DOM is kept, hidden, in the workspace so its state survives. Layout rules are in `layout.css` under `.display-mode`; `e2e/display-screens.spec.mjs`
covers each screen at 1920×1080. At wide viewports (≥1440px and ≥2200px), wall displays
for Field reports, Staffing, Issues and Event feed use multi-column grids or constrained containers
with enlarged typography to prevent excessive single-line measures at reading distance while
guaranteeing zero horizontal scroll.

## Status bar

The console view ends with a status bar (`#status-bar`, `renderStatusBar` and `setStatusBarSync` in `app.js`): room, simulated clock, run state, speed, and the last poll result (`Updated HH:MM:SS`, or **Update failed — retrying** in warning colour and bold font weight until the next poll succeeds). Offline demo shows run state "Offline demo" with no clock. It sits in the console grid's third row, with a bottom margin so the workspace no longer reaches the viewport edge. To prevent screen-reader announcement floods on every poll tick, `#status-bar-sync` displays visual timestamps while a dedicated polite live region (`#status-bar-live`, `.sr-only`, `aria-live="polite"`, `role="status"`) announces only state changes ("Room updates connected", "Update failed — retrying", "Room updates restored"). At mobile widths (≤900px), `.status-bar` enforces a 44px touch height with zero horizontal scroll. E2E: `e2e/status-bar.spec.mjs`.

## Issue Pareto

`frontend/pareto.js` renders the **Issue Pareto** panel (`#pareto-panel`, below the
Analytics content and the whole of the `pareto` display screen). Controls: Day / Week /
Month, the period (defaults to the most recent complete one), group by Issue type or
Location, and the measure (Issues, Downtime, Failed attempts). It draws an SVG Pareto bar
chart (sorted bars, cumulative-share line, dashed 80% line; at most 12 bars, the tail
folded into "Other") and a donut of the same breakdown (top 6 and "Other"), a sentence
such as "2 of 3 issue classes account for 80% of issues", and a table with share and
cumulative share. Clicking (or Enter on) a bar, slice or table row drills down; the
breadcrumb goes back up. The panel loads on its own every 15 s while Analytics is visible
and re-renders only when the data changed, so it does not flicker with the 1.5 s poll.
Chart colours are the `--chart-*` tokens.

## Tabs

- **Live Floor** — the map plus the context panel (selected issue: staffing roster, offers,
  Compass recommendation, resolution) and the event feed.
- **Control Rooms** — lists rooms with health/mode/status; renames the current room.
- **Analytics** — KPI grid, issue/equipment/responder tables, Compass-vs-baseline
  disagreement, timeline charts, and a searchable equipment directory. See
  [../concepts/analytics-and-ethics.md](../concepts/analytics-and-ethics.md).
- **Settings** — an **API** sub-tab (read-only with a note and every control disabled when
  `GET /api/settings` reports `editable: false`, i.e. for tunnel visitors; shared provider/credential and four separate role
  pickers (Ranking (Compass), Event planner, Investigator, Narrator), each with model, thinking level and
  timeout, showing the selected provider's own saved roles, with individual validation status,
  saves and preserved unsaved drafts, with live model
  discovery) and a **Demo** sub-tab (workforce scenario, agent activity, deferred-demand
  ledger, handover log). The provider dropdown is rendered dynamically from `/api/settings` (Nebius Token Factory,
  the default, and AMD Token Factory), so a newly added provider would appear with no client change.
  Model-sourced records are labelled "Nebius model" or "AMD model" from their `source`
  (`NEBIUS_MODEL` / `AMD_MODEL`). See
  [../backend/model-providers.md](../backend/model-providers.md).

## Diagnostics

Uncaught browser errors are POSTed to `/api/logs/client` so they land in the same
application log as the backend events.

The picker defaults to `e8-aura-p1` (`/rooms/plant-1`) and `e8-aura-p2`
(`/rooms/plant-2`). Audit and station-history views use the shared `responseAction`
issue field and recorded resolution actions.

## Retained station history

Live Floor polling consumes a bounded operational snapshot. Station history loads
`/equipment/:id/issues` pages on demand, retains the total count, and offers “Show older
records” for the next page. Selecting an archived summary fetches the existing issue audit
endpoint to restore full detail. Cache identity checks prevent delayed responses from
replacing a newer selection; switching modes or resetting clears the history cache.
The current operational search uses the bounded snapshot. Offline remains API-free.

## Recommended fixes

The issue panel shows its observable symptom, recommendation source (AMD model,
deterministic or Offline fixture), recommended procedure and baseline disagreement.
Expandable troubleshooting order includes catalog steps and an observed evidence table
(success/attempts, first-time successes, smoothed same-symptom success, median, class and
equipment counts, last used). The table scrolls locally at phone widths; Live Floor tiles
retain their existing sizing. Active applied fixes are labelled separately from a later
recommendation. Both audit paths show each applied fix and outcome, or label legacy
free-text actions. Analytics adds first-time fix and agreement summaries plus period rows.
The planner's retained free-text response is labelled Incident note.

Fix-rate percentages use one decimal place so small week-to-week decreases remain
visible. Audit grid columns and evidence scroll areas are constrained to their context
tile; mobile tests check overflow after opening the full applied-fix chronology too.

## Staffing recommendations

`staffing-view.js` renders the shared approval interface in the Live Floor **Staffing**
tile, Settings → Demo → Staffing outlook and `/rooms/:id/display/staffing`. It shows
code-built current backlog by priority/class, active staff/cap, handover, open ranked
options with observed class/symptom evidence, source and baseline disagreement, simulated
deadline countdown, top/alternative approval and optional-reason rejection. Recent decisions
explicitly label **Auto-approved by policy**. Selection, rejection drafts, expanded evidence
and focus survive polling. Stale decisions refresh current state and report the conflict.
Settings → Demo saves the audited per-room policy with an independent revision.

Older four-tile layouts fail the existing exact-panel validator and reset to the new
default, so Staffing is always reachable. The new tile uses the same local scroll and
mobile stack rules; the wall screen hides the other panels but retains approval controls.


## Operational visual refinement

`docs/design/operational-ui-refinement.md` defines the user-authorized refinement of Modern
light. Staffing leads with the person, deadline and primary approval; alternatives/reason,
ranked evidence, coverage and recent history expand separately. Phone navigation defaults
to Issues with direct Floor, Decisions and Events views and a pending-decision count.
The same nodes, selection and controls survive the desktop breakpoint; wall screens bypass
this phone presentation. Names lead issue rows, while IDs/status stay in compact metadata.

Analytics links to Overview/Reliability/Staffing/Experience and places the retained Pareto
node after the headline metrics. Response/experience tables expand on demand. Unavailable
headline rates show an em dash with the unchanged explanation and denominator beneath.
API settings separate shared credentials from side-by-side role cards, stacking on narrow
screens. The shell shows the current room identity without extra directory requests and honours reduced motion. Simulation,
approval, metric and API semantics are unchanged.

Settings → API's existing renderer now includes a read-only Usage block: UTC date, today's
known estimated spend/calls, per-role call/input/output token table, daily budget and status.
Unpriced calls mark estimates incomplete. The same block remains visible to tunnel visitors;
it adds no editable controls and reuses settings/evidence-table styles. Usage is loaded with
the settings snapshot; saving a model/credential retains the last displayed usage snapshot.

In Operational Analytics period charts, provisional/in-progress simulated periods (`.period-bar.partial`) are distinguished from completed periods via reduced opacity (0.55), a diagonal hatched pattern (`repeating-linear-gradient`), a dashed rule border, and an explicit legend entry (`■ Complete   □ In-progress (provisional)`).

Settings includes the fifth Assistant (Ask Compass) role through the existing shared
role-card renderer, with independent model, reasoning, timeout and save controls.
