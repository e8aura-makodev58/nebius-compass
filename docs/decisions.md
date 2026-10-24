# Implementation decisions

## 2026-10-16 — Restore generic simulation rooms and remove MES feature

- Decision: Per user direction, remove the MES evidence adapter, lexical case retrieval, case-guided schema/validation and snapshots, feature-only tests, and the MES SOW. This supersedes the three September 10 MES phase decisions below, retained as history.
- Behavior: Compass again ranks supplied eligible responders using direct aggregate simulation history. Room IDs/storage are `plant-1` and `plant-2`, with default names `e8-aura-p1` and `e8-aura-p2`, matching the portable paused seeds.
- Compatibility: Keep `plant1` as a route alias; move its known state files without overwrites and fail the room on conflicts. Preserve metadata revisions and normalize saved suggestion fields to generic response actions. Existing runtime history and operator renames remain authoritative.
- Verification: Add regression coverage for evidence boundaries and saved-state/room compatibility. Fix an inherited GPT-OSS test's stale credential expectations and stub its model discovery to maintain the required hermetic suite.

## 2026-09-15 — Self-hosted GPT-OSS provider and configurable model timeouts

- Decision: Add `gpt-oss` as a third model provider through the existing `model-provider.mjs` / `provider-settings.mjs` abstraction — a vLLM server exposing an OpenAI-compatible API on an internal host (`openai/gpt-oss-20b`). Its base URL is deployment-configurable (`COMPASS_GPT_OSS_BASE_URL`, default `http://10.58.122.75:8000/v1`), it needs no real credential (`dummy-key`), and `COMPASS_DEFAULT_PROVIDER` selects the active provider. Make the Compass-agent and event-planner request timeouts configurable (`COMPASS_AGENT_TIMEOUT_MS`, `COMPASS_EVENT_PLANNER_TIMEOUT_MS`).
- Reason: The deployment uses an internally hosted open model. It reuses every existing guarantee — strict `json_schema` output, output validation, and deterministic fallback — so no boundary changes are needed. The self-hosted 20B reasoning model has more variable latency than a hosted API, so the previously fixed timeouts had to be tunable to avoid unnecessary fallbacks.
- Impact: The model reasons in a separate `reasoning_content` field the parser ignores; the strict answer arrives in `message.content` exactly like the other providers. No change to the deterministic/agent boundary or hidden `ResponderSkill`. `npm test` 234/234; live calls validated end to end for both model roles. Tracked in `project-state/backend/model-providers.md` and `project-state/operations/running-and-config.md`.

## 2026-09-11 — Portable paused demo seed never overwrites runtime state

- Decision: Track compact, synthetic paused room snapshots in `backend/seed/demo-control-rooms/`. Docker enables a one-time bootstrap only when `/app/data/control-rooms/` does not exist.
- Reason: A fresh clone can demonstrate meaningful accumulated history, while an existing local folder or Docker volume remains the authoritative writable runtime state after pulls, restarts, and upgrades.
- Boundaries: The seed excludes provider settings, application logs, backup files, and credentials. It is copied once with exclusive file creation; it is never merged into or allowed to overwrite existing runtime state.

## 2026-09-10 — Phase 3 case-guided outputs are strict and packet-grounded

- Decision: Use a second strict structured-output schema only when an application-built bounded `caseEvidence` packet is present. It requires a complete ranking plus a non-nullable `caseGuidedResponse` selecting a supplied response-plan option or `NO_CASE_SPECIFIC_PLAN`, supporting/counterevidence case citations, evidence-strength label, and bounded uncertainty. Persist an immutable evidence snapshot with the recommendation and treat a changed snapshot as stale.
- Reason: The model may select among factual options but cannot compose a repair procedure, cite unknown records, or use evidence that changed during inference. Keeping the original result contract for packets without usable case evidence preserves established fixture ranking and deterministic fallback behavior.
- Boundaries: No UI, clarification workflow, external retrieval, embedding/provider call, dispatch change, or outcome mutation is added. Response-plan and case IDs are mechanically validated against the saved packet; hidden skill remains excluded.
- Impact: A case-guided provider result with missing/extra fields, null-like shape, duplicate citations, unknown case IDs, wrong evidence role, or unknown option fails closed to the existing deterministic dispatch path.

## 2026-09-10 — Phase 2 uses deterministic, bounded comparable-case retrieval

- Decision: Add a lexical/structured retrieval projection over normalized MES cases only. It filters to complete same-class observed cases, ranks reproducibly by incident/action token overlap, same-equipment context, observed time, and stable case ID, then bounds personally handled cases to three per eligible candidate, de-identified organization cases to three, and all cases to twelve / 12 KB.
- Reason: The future case-guided Compass contract needs comparable factual evidence without unbounded history, embeddings, provider calls, or free-form model retrieval. A deterministic first stage remains inspectable and works identically Offline/Live.
- Boundaries: The projection remains internal in this phase. It does not change `agent.mjs`, model prompts/results, UI, dispatch, matching eligibility, outcomes, or simulation learning weights. Organization cases exclude every supplied eligible responder and are de-identified. Supporting actions become factual response-plan options only; failed, reopened, and temporary cases remain counterevidence.
- Impact: Runtime observed cases now retain equipment and incident description so later retrieval has factual context. Existing history remains valid with sparse legacy fields and simply has less retrieval evidence.

## 2026-09-10 — Phase 1 establishes a normalized simulated-MES evidence boundary

- Decision: Translate canonical `resolutionHistory` only through `mes-case-adapter.mjs` before Compass candidate evidence is calculated. Normalized cases carry explicit `SIMULATED` provenance; legacy rows are migrated idempotently with `legacyMapped: true`. Event-planner `responseAction` is persisted as `suggestedResponseAction`, while the resolution engine independently emits the simulator-observed `actionTaken`.
- Reason: Compass must reason over observed MES facts without mistaking an event-planner suggestion for a responder action or outcome. The boundary creates a testable production-MES replacement seam while preserving hidden `ResponderSkill` and outcome behavior inside the simulator.
- Boundaries: Phase 1 does not add semantic retrieval, case narratives to the model, response-plan selection, off-shift knowledge evidence, clarification prompts, or an expanded Compass result schema. The adapter's factual redaction helper removes participant attribution for future model packets; current Compass packets remain aggregate-only.
- Impact: Existing persisted states upgrade without a schema-version break, newly completed simulated cases record source/action provenance, and deterministic matching uses normalized cases. The original records remain canonical and are never mutated by Compass.

## 2026-09-10 — Live issue arrivals are scenario-shaped deterministic demand, not a fixed cadence

- Decision: Replace the single 8–25-minute Live issue-arrival cadence with bounded, deterministic pseudo-random cadence ranges per Demo scenario. Normal uses 6–45 minutes, Elevated Demand 3–22 minutes, Personnel Shortage 5–35 minutes, and Recurring Temporary Repairs 6–35 minutes plus its separately scheduled recurrence obligations. Auto selects one of those modes deterministically and changes it every four simulated hours.
- Reason: A narrow global cadence produces visually repetitive hourly totals—typically four arrivals—even though individual delays are generated from a seeded stream. It also meant the selected demand scenario did not alter ordinary issue occurrence.
- Boundaries: This applies only to the persistent Live synthetic simulator. Offline remains a fixed, API-free deterministic fallback. The scheduler RNG remains canonical and persisted; no model output, hidden responder skill, or real-world data controls issue arrivals. Recurrent temporary repairs now append their own observed `ISSUE_RAISED` record, so analytics counts them.

## 2026-09-10 — Analytics uses three bar charts and four bounded ranges, not a drill-down hierarchy

- Decision: Keep the lifecycle dashboard to three observed metrics—issues raised, issues resolved, and aggregate downtime—and render each as bars for one selected range: Hour (twelve clock hours), Day (seven operational days, default), Week (four operational weeks), or Month (three operational months). Remove shift selection and 15-minute chart drill-down from the dashboard and period contract.
- Reason: The operator needs a clear high-level operational readout before any additional analytic complexity. The shift-first hierarchy did not make its purpose clear in the primary dashboard.
- Semantics: Periods are room-scoped UTC intervals, half-open `[start,end)`: hours begin on the UTC clock hour; day begins 08:00, week begins Monday 08:00, and month begins on the first day at 08:00. Current intervals are explicitly `PARTIAL`; time before observed activity is `INSUFFICIENT_HISTORY`. Counts are persisted lifecycle events; downtime is the union of observed downtime intervals per equipment item.
- Impact: The retained API accepts only the four bounded display levels. No hidden responder skills, RNG draws, model output, or priority recommendation data enters the projections.

## 2026-09-08 — Control Room display names are revisioned metadata

- Decision: Keep fixed registry IDs, labels, routes, storage paths, and simulation state authoritative. Persist only operator-facing `displayName` plus a per-room revision in one atomic metadata document.
- Reason: Presentation edits must not become lifecycle administration or disturb independent simulation namespaces. Per-room optimistic concurrency makes concurrent rename attempts explicit rather than silently overwriting an operator's change.
- Impact: Corrupt metadata never blocks room runtimes or gets overwritten; directory reads fall back to registry labels while rename returns unavailable. No model, operational, or hidden-truth data enters the metadata document.

## 2026-09-07 — Desktop Control Room is a bounded workstation

- Decision: At desktop widths of 901px or more and usable heights of 800px or more, the Live Control Room uses the available `100dvh` as a fixed workstation. The floor map, current issue/event columns, and dispatch context are bounded regions; only the dense issue feed, event feed, and dispatch context scroll locally. Narrow, mobile, and vertically resized windows retain the existing stacked document flow and page scrolling.
- Reason: An operator should be able to inspect the live floor and dispatch context without losing either to document scrolling on a desktop-sized workstation. Keeping dense evidence locally scrollable preserves access to the complete record without expanding the map beyond the viewport.
- Interaction safety: Ordinary wheel movement and double-clicking do not alter the floor map. Zoom uses the visible controls or existing keyboard `+`/`−` controls. Panning requires Space plus primary-mouse drag on an empty map background; touch drag remains native vertical page navigation. Panning arming is cleared on key release, blur, and hidden-document transitions.
- Scope: Presentation and client interaction only. No API, persisted state, simulation timing, selection, search, audit, analytics, agent, or hidden-truth behavior changes.

## 2026-09-04 — v4 migration plan reviewed before implementation

- Date: 2026-09-04
- Decision: Treat `Compass_ResponseCompass_SOW_v4_FINAL.md` as authoritative and migrate the existing single-issue implementation into v4 Offline Demo support while adding Live through a shared, persistent state/service layer. Use a versioned, serialized, atomic JSON live store appropriate to this single-process MVP.
- Reason: v4 explicitly supersedes the prior scripted single-issue plan and requires a persistent multi-issue live control room, but also requires an API-free Offline fallback without maintaining two separate applications.
- Affected SOW section: §1, §4–§5, WP0–WP1, §35, §43.
- Impact: The reviewed plan is recorded in `docs/v4-implementation-plan.md`. Persistent assignment moves ahead of multi-issue acceptance; Offline adapter work and every required v4 fixture are part of WP1; model calls will be revision-safe and outside the mutation lock. No live behavior is changed by this documentation-only WP0 slice.

## 2026-09-04 — v4 WP1 shared JSON persistence foundation

- Date: 2026-09-04
- Decision: Use a versioned, bounded JSON live-state document with a serialized mutation queue and temp-file/rename writes as the v4 single-process persistence layer. Introduce a shared mode service now, preserving the existing fixture runtime as Offline while Live uses the new store.
- Reason: Every later v4 package needs atomic canonical state, persistent hidden simulation truth, and a common seam rather than separate Live/Offline applications. Adding a database/ORM would add setup and operational risk without improving this small-scale simulation.
- Affected SOW section: §4–§5, §7, §10–§11, §35, WP1.
- Impact: Live seed data contains 6 equipment, 6 responders, 48 observed records, and exactly 18 `ResponderSkill` rows. Public live snapshots omit all hidden skill fields. The store is deliberately single-process and does not yet drive routes/UI/scheduling; all state-changing future services must use its mutation queue.

## 2026-09-04 — Explicit-tick persistent simulation clock

- Date: 2026-09-04
- Decision: Advance simulation time only through an explicit elapsed-time tick applied to persisted `SimulationState`; never derive advancement from elapsed wall time at store load. Persist start/pause/resume events and restrict speed to the four v4 values.
- Reason: v4 requires simulation time to resume exactly on restart without backdated catch-up, while later scheduler tests need deterministic, controllable time advancement.
- Affected SOW section: §11–§13, §34, WP2.
- Impact: The WP2 service is intentionally route-free and scheduler-free. WP3 will supply the runtime loop, due-token firing, cadence RNG, and force controls through this clock rather than introducing another time source.

## 2026-09-04 — Atomic one-shot scheduler triggers

- Date: 2026-09-04
- Decision: Use one scheduler service over the WP2 explicit clock. Each event or resolution trigger is claimed by consuming its persisted unique token inside the live-store transaction; bounded event cadence uses a versioned uint32 LCG and only the scheduler RNG stream. Trigger handlers run after the transaction releases the store lock.
- Reason: v4 requires deterministic timing without duplicate firing across speed changes, restarts, or demo controls, while later event-planner model calls must never run under the state lock.
- Affected SOW section: §13–§14, WP2–WP3, §56, Risk 8.
- Impact: `Force Next Event` uses the same ceiling-checked event claim as ordinary due events and works while paused. `Force Resolve` and ordinary resolution timing use the same one-shot resolution token. WP3 emits bounded descriptors only; WP4 will attach the validated planner/fallback and WP6 will attach the latent-skill outcome mutation. No HTTP/UI route is added before those backend outcomes exist.

## 2026-09-04 — Revision-safe contextual event planning

- Date: 2026-09-04
- Decision: Build a bounded planner packet from a live snapshot, await the planner outside the store lock, then validate against current canonical state inside one persistence mutation. Invalid, stale, malformed, or unavailable planner output is replaced by a deterministic recurrence-weighted proposal using only the fallback RNG stream.
- Reason: The planner may propose narrative evolution but application code must own eligibility, the active-issue ceiling, legal state transitions, and mutations. Revalidation prevents a proposal that became stale during inference from corrupting live state.
- Affected SOW section: §15–§18, §48.1, WP4.
- Impact: Persisted issues and `ISSUE_RAISED` events record their trigger token and source. Duplicate trigger delivery is idempotent. The planner packet excludes responders, performance evidence, and hidden skill. The existing fixture is allowed to fail canonical validation and then exercises the same production fallback path.

## 2026-09-04 — Persistent per-issue assignment boundary

- Date: 2026-09-04
- Decision: Reuse the deterministic context engine against live snapshots and perform every live assignment in the serialized store mutation. Availability is revalidated at write time; an eligible-ID snapshot may further constrain but never override canonical truth.
- Reason: Multiple issues may independently recommend the same person, so only the canonical transaction can prevent double assignment. This preserves Compass's per-issue scope without introducing global workforce optimization.
- Affected SOW section: §19–§21, §32–§33, WP5.
- Impact: Assignment immediately changes later candidate packets, stale attempts do not mutate, and zero-candidate issues remain `PENDING`. New assignment rows initially carry a claimed/pending resolution schedule; WP6 attaches deterministic hidden-skill timing and outcomes. Live seed timestamps/statuses were normalized into a chronological pre-warmed state for valid downtime calculations.

## 2026-09-04 — Latent-skill resolution attempts

- Date: 2026-09-04
- Decision: At assignment, sample a bounded completion duration from the matching hidden `ResponderSkill` median using only the resolution RNG stream. At due-token consumption, sample success from the hidden probability and atomically append the observed attempt, release the responder, and resolve or reopen the issue.
- Reason: Runtime evidence must be generated independently from the observed history Compass sees, while restart-safe resolution timing requires a persisted due timestamp and one-shot dispatch token.
- Affected SOW section: §7–§9, §22–§25, WP6.
- Impact: Failed attempts preserve the original downtime interval and become new observed history; successful attempts close downtime and restore equipment. Pending outcome details and resolution tokens are stripped from public snapshots. Runtime history is unbounded beyond the required seed minimum so soak runs do not fail schema validation.

## 2026-09-04 — Revision-bound live Compass workflow

- Date: 2026-09-04
- Decision: Persist a complete recommendation request snapshot and both configured baselines before awaiting Compass. Accept a result only when the candidate evidence still exactly matches canonical state, then derive disagreement fields from IDs, evidence labels, and structured evidence references. Confirm/override updates the recommendation and assignment atomically.
- Reason: Model latency and concurrent decisions can stale a recommendation. Auditability requires the original evidence/configuration, while assignment truth must never be split across separate writes.
- Affected SOW section: §26–§33, §44, WP7–WP9.
- Impact: Live Compass uses seed plus runtime observed history, never latent skill. Provider failure retains baselines and permits human override. Stale confirmations record `STALE` but cannot create an assignment. A `COMPASS_RECOMMENDATION` operational event carries explicit disagreement markers for the later feed.

## 2026-09-04 — One composed live runtime and shared control room

- Date: 2026-09-04
- Decision: Compose the persistent store, explicit clock, scheduler, planner, recommendation, assignment, and resolution services in one live runtime. Only the server entrypoint starts one interval; browser state uses 1.5-second polling. A mode adapter switches the same route/UI shell between Live and the preserved Offline runtime.
- Reason: v4 requires shared-mode paths, one timer source, simple reconnect behavior, and a control room that changes from persisted backend state.
- Affected SOW section: §4–§6, §36–§37, §41–§43, WP10.
- Impact: Live routes now cover clock state/speed, Force Next Event, Force Resolve, Compass, assignments, and bounded collections. Public snapshots strip latent truth, RNG state, and one-shot tokens. Live defaults to real provider modes and fails safely without credentials; Offline remains the deterministic fixture path.

## 2026-09-04 — Fixed-snapshot operational analytics

- Date: 2026-09-04
- Decision: Derive every P0 analytics panel from one live-state snapshot and its single simulation timestamp. Represent outcome rates as numerator/denominator/status objects, suppressing the rate when the denominator is below three.
- Reason: Analytics must be reproducible from canonical rows, avoid moving-clock inconsistencies, keep open downtime out of completed medians, and not overstate thin samples.
- Affected SOW section: §38–§41, WP11–WP12.
- Impact: Equipment, issue, responder, stable alphabetical Issue-Class Experience, and Compass-vs-baselines projections share one service. The UI emphasizes case counts and labels experience as context rather than employee ranking; latent truth is mechanically excluded.

## 2026-09-04 — Offline inference mode is hard-pinned to fixture

- Date: 2026-09-04
- Decision: Construct the Offline runtime with `mode: "fixture"` explicitly, regardless of process environment, and expose full confirm/override/reset feedback through the shared control-room UI.
- Reason: Offline is a contractual API-free fallback and must not silently become network-dependent when Live credentials or inference settings are present.
- Affected SOW section: §4.2, §43, WP13.
- Impact: Offline always preserves the fixed Alex/Chen/Priya scenario and real assignment mutations. Switching/resetting Offline does not reset persistent Live state.

## 2026-09-04 — Deterministic reliability evidence is labeled separately from live-model evidence

- Date: 2026-09-04
- Decision: Use a schema-valid deterministic evidence policy for the 100-opportunity state-integrity/seed-disagreement soak, and explicitly label its results as non-provider evidence. Keep the live-provider quality gate outstanding until credentials and pinned model IDs are supplied.
- Reason: The repository can prove deterministic scheduling, mutation, latent convergence, disagreement capacity, and browser reliability without making an unverifiable claim about external model behavior.
- Affected SOW section: §45–§46, §56–§59, WP14.
- Impact: The deterministic soak achieved 75% naive disagreement and 100% evidence-driven share with no assignment/ceiling corruption. Chromium E2E covers the full Live-to-Offline presentation path. Playwright is pinned as a development dependency; public live snapshots are bounded and exclude raw history/internal RNG/tokens.

## 2026-09-04 — Core freeze after repository delivery gates

- Date: 2026-09-04
- Decision: Freeze the P0 application core after WP15 documentation, public-data review, clean-install verification, the 91-test deterministic suite, and the Chromium journey pass. Treat live-provider evaluation, narration, upload, and event-form completion as explicit operator gates rather than fabricating local substitutes.
- Reason: The repository-level Definition of Done is reproducible and the remaining gates require credentials or external publishing access that are intentionally absent from source control. Further feature work would add demo risk after the required shared Live/Offline product path is stable.
- Affected SOW section: §44–§46, §56–§60, WP15.
- Impact: Core behavior is frozen for release reliability. Only defect fixes, provider-result recording, and documentation assets should change from this point; a genuine pinned-model run must still be completed and recorded before claiming live-provider quality.

## 2026-09-03 — Dependency-light bootstrap

- Date: 2026-09-03
- Decision: Use native Node.js ESM and dependency-free JSON fixtures for the initial backend/domain layer.
- Reason: UI and agent work can begin against stable contracts without waiting for framework or provider installation.
- Affected SOW section: §15, WP0, WP1, §59A.
- Impact: `frontend/` and `backend/` remain separate; TypeScript contracts are documentation-facing until a build step is introduced.

## 2026-09-03 — Exact Scenario A rates

- Date: 2026-09-03
- Decision: Use rates exactly derivable from discrete seed records: Alex `5/6` (83.3%) and Morgan `3/4` (75%).
- Reason: The SOW's `78%` across six cases and `80%` across four cases are not mathematically representable by integer records.
- Affected SOW section: §20, §31, §32.
- Impact: Mandatory roles and winners remain unchanged; fixtures and tests use reproducible values.

## 2026-09-03 — Fixed naive weighted baseline

- Date: 2026-09-03
- Decision: Use `(100 × successRate) − (2 × medianResolutionMinutes) − (3 × travelTimeMinutes)` as the visible naive-score baseline. Candidates without history use success rate `0` and a conservative 60-minute median solely for this comparator.
- Reason: It is deterministic, simple to explain, includes proximity/travel, median resolution, and success rate, deliberately omits sample strength, and returns Chen for Scenario A.
- Affected SOW section: §20A, WP2, §44.4.
- Impact: This baseline is fixed for demos and must never be dynamically tuned by the model. It is a comparator, not Compass's recommendation logic.

## 2026-09-03 — Dependency-free floor delivery

- Date: 2026-09-03
- Decision: Deliver WP3 as a static, native-browser frontend served by the Node built-in HTTP server rather than introducing a frontend framework before P0 behavior is complete.
- Reason: The floor needs no client-side dependency to render canonical state, and this keeps setup, debugging, and the local demo path simple.
- Affected SOW section: §15, §28–§29, WP3, §60.
- Impact: The floor consumes `GET /api/state` and a deterministic `POST /api/reset` endpoint. Any future UI work must continue to use backend-provided evidence rather than duplicating business logic in the browser.

## 2026-09-03 — In-memory issue-raise workflow with testable server runtime

- Date: 2026-09-03
- Decision: Refactor `backend/src/server.mjs` into an injectable `createDemoRuntime()` (holds `demoState` and a transient `workflow` object) plus a pure `createRequestHandler(runtime)`, and add `POST /api/issues/:id/raise`. Raising an eligible issue (not already `ASSIGNED`/`RESOLVED`) sets its status to the SOW-recommended `RECOMMENDATION_READY`, builds the candidate packet via `context-engine.mjs`, and computes both baselines; `GET /api/state` returns `{ ...demoState, workflow }`. `POST /api/reset` clears both.
- Reason: WP4 requires the issue to be raisable from the interface and both deterministic baselines to appear without manual text input or an LLM call, while keeping the server route layer unit-testable without a live socket.
- Affected SOW section: §17.3, WP4.
- Impact: `backend/tests/wp3-wp4-server.test.mjs` exercises the handler directly (state/raise/reset happy path, unknown-issue 404, unsupported-method 405). The `workflow` object (candidate packet + both baselines) is server-computed only; the browser still performs no ranking or business logic, consistent with the WP3 floor-delivery decision above.

## 2026-09-03 — Agent integration: OpenAI Chat Completions with a deterministic fixture fallback

- Date: 2026-09-03
- Decision: Add `backend/src/agent.mjs` (`requestAgentRecommendation`) and wire `POST /api/issues/:id/recommend` on top of the WP4 workflow. It calls OpenAI's Chat Completions endpoint (`model` from `COMPASS_MODEL_ID`, `OPENAI_API_KEY` from the environment, `response_format: { type: "json_schema" }` against the SOW §23 output contract) when `COMPASS_DEMO_INFERENCE_MODE=live`, and otherwise (the default, `fixture`) returns the committed `fixtures/agent-result-scenario-a.json` with `recommendationRequestId` substituted to match the live request — used only when its candidate-ID set exactly matches the current packet, so it never guesses for an unrecognized scenario. Every path (live or fixture) is passed through one `validateAgentResult()` pipeline (SOW §24/§45): schema shape, `schemaVersion`, request-ID match, every `responderId` grounded in the actual candidate packet, no duplicate/omitted candidates, rank-1 `tradeoff` referencing a different eligible candidate, and rejection of any generated prose containing a digit (numeric-evidence leakage). Any failure — missing/invalid config, provider HTTP error, timeout (`AbortController`, default 8s), or a result that fails validation — resolves to an explicit `{ status: "unavailable" }` outcome rather than throwing or guessing, per SOW §36; the deterministic baselines remain visible regardless.
- Reason: WP5 requires a bounded, schema-validated model call that fails closed, plus a way to prove the Scenario A acceptance criteria (10 consecutive runs, Priya first 10/10, schema-valid 10/10, forced-failure produces the explicit unavailable state) without depending on network access during ordinary development, matching `.env.example`'s pre-existing `COMPASS_DEMO_INFERENCE_MODE=fixture` placeholder from the WP0 bootstrap.
- Affected SOW section: §22, §23, §24, §36, §45, WP5.
- Impact: `backend/tests/wp5-agent.test.mjs` (14 tests) runs the fixture-mode Scenario A path 10 consecutive times — Priya ranks first and every result validates 10/10 — and separately exercises every rejection path (unknown candidate, mismatched request ID, missing/self-referencing rank-1 tradeoff, numeric-prose leakage, incomplete/duplicated ranking) plus the live-mode request shape, timeout, and forced-failure behavior against an injected `fetchImpl`, never a real network call.
  - **Outstanding before real WP5 sign-off**: this environment has no network access or `OPENAI_API_KEY`, so the 10/10 Scenario A acceptance run has only been executed against the deterministic `fixture` fallback, not against a live pinned model as SOW WP5 acceptance requires ("At the pinned model and inference configuration: 10 consecutive runs, Priya rank-1 = 10/10, schema-valid = 10/10"). Before relying on the live model, set `COMPASS_MODEL_ID` to a pinned model/version, set `OPENAI_API_KEY`, set `COMPASS_DEMO_INFERENCE_MODE=live`, and re-run the Scenario A 10-consecutive-runs check against the real provider; record that run log here. Until that live run is recorded, WP5 is implemented and unit-tested but not fully signed off per the SOW's own acceptance bar.

## 2026-09-03 — Recommendation UI uses only canonical evidence

- Date: 2026-09-03
- Decision: Render the WP6 recommendation panel from `workflow.candidatePacket` and use the agent result solely for rank order and qualitative prose. Resolve every display name from the canonical responder collection using the validated `responderId`.
- Reason: The model must not become a source of operational facts or generated numeric evidence; the UI needs to make the baseline-versus-recommendation tradeoff inspectable in situ.
- Affected SOW section: §14, §24, §30, WP6, §56.
- Impact: The panel displays both baselines, the Compass winner, all eligible evidence rows (count, strength, median, success, distance/travel), and its rank-1 tradeoff. Confirm and override controls are visually reserved but deliberately disabled until WP7 makes their actions state-grounded.

## 2026-09-04 — Assignment is a deterministic, revalidated state mutation

- Date: 2026-09-04
- Decision: Add `assignResponder()` as the sole WP7 mutation boundary. Confirmation is restricted to the validated top recommendation; an override names another candidate explicitly. Both paths re-check the responder's live canonical availability before writing issue/responder assignment state.
- Reason: A model recommendation is not an assignment. Revalidation prevents a stale recommendation or ineligible override from producing a false success claim.
- Affected SOW section: §26, §27, WP7, §47.
- Impact: Successful mutation changes `issue.assignedResponderId`, `issue.status`, `responder.availability`, and `responder.currentIssueId` together. An unavailable responder yields a `STALE` workflow decision without mutation, and the UI tells the supervisor to re-run Compass.

## 2026-09-04 — Persistent JSON audit events for the resettable demo

- Date: 2026-09-04
- Decision: Persist recommendation events to a local JSON array through `backend/src/audit-store.mjs`, keyed by the generated recommendation request ID. The server creates the event after a model outcome and updates it after confirmation, override, or stale handling; `GET /api/audit/:requestId` exposes developer retrieval.
- Reason: WP8 requires reconstructable provenance without adding a database or a P1 audit viewer. Demo reset must restore operational state without erasing prior audit evidence.
- Affected SOW section: §39, WP8, §42, §48.
- Impact: Local runtime records live under ignored `backend/data/`; tests inject a temporary store. Every event contains the supplied candidate snapshot, both baselines, model metadata/output, human decision, and resulting assignment, while the main UI stays focused on the operational workflow.

## 2026-09-04 — Repeated Scenario A reset coverage

- Date: 2026-09-04
- Decision: Add a full fixture-backed Scenario A → recommend → confirm Priya → reset test that repeats three times and compares every reset snapshot to the untouched seed state.
- Reason: Reset is a P0 demo reliability requirement and must restore assignment, recommendation, and visible operational state without manually repairing the demo.
- Affected SOW section: §35, §48, WP9, WP10.
- Impact: Audit records remain intentionally persistent while operational state resets; the test uses a temporary audit path so it verifies this distinction without contaminating local demo artifacts.

## 2026-09-04 — Network-accessible local demo listener

- Date: 2026-09-04
- Decision: Bind the standalone Node server to `0.0.0.0` by default, with `COMPASS_HOST` and `COMPASS_PORT` environment overrides.
- Reason: The demo must be accessible from another device on the local network when required, while retaining simple local startup.
- Affected SOW section: §54, WP10.
- Impact: Network access is subject to the host firewall and network routing. This is a listener change only; it introduces no authentication or external deployment surface.

## 2026-09-04 — Structured runtime diagnostics and bounded browser waits

- Date: 2026-09-04
- Decision: Emit newline-delimited JSON lifecycle logs to the server terminal for every request and for context preparation, recommendation completion, and assignment completion. Bound each browser state request to 15 seconds with an actionable timeout message.
- Reason: The original lightweight server only logged startup, leaving no evidence when an interactive action appeared to hang.
- Affected SOW section: §54, §55, WP9, WP10.
- Impact: Logs contain timestamps, endpoint/method, status, duration, request ID, grounded responder ID, and failure reason where applicable—never credentials or raw provider payloads. Restart the server after this change to receive them.

## 2026-09-04 — Persistent application-owned runtime event log

- Date: 2026-09-04
- Decision: Replace terminal-only diagnostics with a bounded, persistent JSON event store owned by the application. The server exposes recent events at `GET /api/logs`; terminal output mirrors rather than defines the log. Browser error paths post a bounded client-error event when connectivity permits.
- Reason: Operators need post-incident evidence even if the terminal output was not captured, and a process console is not an application logging system.
- Affected SOW section: §39, §54, §55, WP8, WP9, WP10.
- Impact: The last 1,000 synthetic operational events are atomically persisted under ignored `backend/data/`; writes are serialized and failure to persist a diagnostic never blocks assignment behavior. Events exclude credentials and raw model payloads.

## 2026-09-04 — Disabled controls do not imply active work

- Date: 2026-09-04
- Decision: Apply the wait cursor only to controls explicitly marked as in-flight; use `not-allowed` for a disabled control that represents a completed or unavailable action.
- Reason: The context-prepared control is correctly disabled to prevent duplicate workflow creation, but the previous global wait cursor incorrectly made that settled state look like a hang.
- Affected SOW section: §55, §56, WP10.
- Impact: Raise, recommend, confirm/override, and reset controls add the in-flight class only while awaiting their request. The permanent “Issue context prepared” state no longer presents an hourglass.

## 2026-09-04 — Secured the OpenAI credential and shipped the provider/model/thinking-level settings menu

- Date: 2026-09-04
- Decision: Move the plaintext OpenAI API key out of the home directory into the git-ignored `.env` (mode `600`), then delete the original file. Complete and wire the in-progress `backend/src/provider-settings.mjs` service that Codex left uncommitted: `GET /api/settings` (current provider/model/reasoning level and whether a credential is configured — never the key itself), `GET /api/settings/models` (live OpenAI `/v1/models` discovery, filtered to selectable text models, blocked with 409 in Offline mode per the API-free rule), and `POST /api/settings` (validates provider/model/reasoning-level and persists atomically to `backend/data/provider-settings.json`, mode `600`). Added a "Settings" tab to the frontend with a locked-to-OpenAI provider selector (rendered from the server's `providers` list so a future provider only requires enabling it server-side), a model dropdown populated by discovery, and a thinking-level dropdown whose options are derived per selected model family (`reasoningEffortsForModel`, already supporting the gpt-5.x/gpt-6/o-series families visible in live discovery). `requestOptions()` feeds the saved selection into both `agent.mjs` and `event-planner.mjs` via the lazy `plannerOptions`/`agentOptions` functions Codex had already added to `live-runtime.mjs`.
- Reason: The user asked for the key to be moved to a secure location and for a settings menu to choose provider/model/thinking level, with only OpenAI available today. A plaintext key file outside `.gitignore`'s reach is a real exposure risk; a hardcoded model ID would remove the flexibility the user asked for and would need to be re-guessed every time the OpenAI catalog changes.
- Affected SOW section: §53 (secrets server-side only, no API key in frontend bundle), §15 (technology posture — OpenAI as the example provider), WP5's original agent-integration boundary.
- Impact: `backend/tests/provider-settings.test.mjs` (10 tests, all using injected `fetchImpl`/`filePath`/`environment` — no real network calls) covers reasoning-effort family mapping, credential-status reporting without ever serializing the key, fail-closed model discovery (no credential, HTTP error, timeout), `update()` rejecting a non-OpenAI provider/unselectable model/unsupported reasoning level/model outside the last-discovered list, atomic `0600` persistence and reload, `requestOptions()` shape, and the settings HTTP routes end to end including the Offline 409 gate. Verified once, separately, against the real OpenAI credential in this environment: credential detected, live discovery returned 71 selectable models, a save round-tripped through the persisted file — then that test artifact was deleted so the user's own first choice in the UI isn't pre-empted. No `COMPASS_MODEL_ID` is pinned in `.env`; the model and thinking level are intentionally left for the user to choose via Settings rather than guessed by this agent.

## 2026-09-04 — Strict structured-output contract requires every declared property

- Date: 2026-09-04
- Decision: Add `tradeoff` to `required` in `AGENT_RESULT_JSON_SCHEMA.properties.rankedCandidates.items` (`backend/src/agent.mjs`), making a tradeoff mandatory on every ranked candidate rather than only rank one. Reject the alternative of making `tradeoff` a nullable union (`type: ["object","null"]` or an `anyOf`). Keep the hand-rolled validator's `candidate.tradeoff !== undefined` guard permissive. Extend `validateAgentResult`'s ID grounding to every candidate's `tradeoff.comparedToResponderId`, not just rank one's. Harden `SYSTEM_INSTRUCTION` with an explicit no-digits-anywhere rule and an explicit every-candidate-needs-a-tradeoff rule. Add a hermetic schema-walker test asserting OpenAI strict-mode object rules over both structured-output schemas.
- Reason: OpenAI strict Structured Outputs requires every key declared in `properties` to also appear in `required`. The shipped schema declared five properties and required four, so **every** live Compass call was rejected with HTTP 400 (`'required' is required to be supplied and to be an array including every key in properties. Missing 'tradeoff'`), which `agent.mjs` mapped to `{status:"unavailable", reason:"provider-error"}` and the UI rendered as "Recommendation unavailable". Live Compass had never once succeeded. Four real API probes confirmed the diagnosis: as-shipped returns 400, and adding `"tradeoff"` to `items.required` with no other change returns 200 — proving `minItems`/`minimum` are accepted and that this was the only strict-mode violation.
  - The nullable-union alternative is API-valid but reintroduces the identical outage through a different door: `agent.mjs`'s guard passes a `null` tradeoff through (`null !== undefined`), `isPlainObject(null)` is then false, so every candidate the model nulls produces a validation error, `validation-failed`, and the same unavailable screen — with the whole test suite still green. It was rejected for that reason, not on style.
  - The validator stays permissive because the Offline/fixture path shares it: `fixtures/agent-result-scenario-a.json` and the Scenario A unit fixtures build candidates without tradeoffs. Requiring a tradeoff there would break the API-free Offline demo and several tests for no benefit — the wire schema now guarantees the field on the live path, which is where it was missing.
  - Grounding every tradeoff ID is completing the fix rather than scope creep: mandating N tradeoffs creates N−1 new model-supplied responder IDs reaching the persisted audit record, and `validateAgentResult`'s own contract is that every ID is checked against the packet actually sent. SOW §29 forbids the agent introducing candidates.
  - The instruction hardening is required, not cosmetic: leak-checking applies to every tradeoff explanation, so mandating five tradeoffs multiplies the numeric-leakage surface roughly fivefold, and a single stray digit fails the whole recommendation closed. The three pre-existing instruction lines the test matrix asserts on are preserved byte-for-byte; the new text is appended.
- Affected SOW section: §23, §24, §29, §30, §36, §46, WP5.
- Impact: Live Compass recommendations function for the first time. The schema-walker test (`backend/tests/wp5-agent.test.mjs`) fails on the pre-fix tree with exactly the production error and passes after, so this bug class cannot silently return — any future property added to either schema without a matching `required` entry now fails `npm test` rather than only failing in production. Tradeoff-for-all is a superset of the SOW's rank-one requirement, not a relaxation of it. Contingency, pre-decided: if live runs show numeric leakage rejections traceable to non-rank-one tradeoff explanations, narrow the leak check to rank one's explanation (only rank one's is ever rendered) and record that narrowing separately — do not weaken the check pre-emptively. The live ten-run reliability gate log is recorded at the end of this entry.
- Known consequence, deliberately not fixed here: `playwright.config.mjs` sets `COMPASS_LIVE_COMPASS_MODE: "force-failure"`, but that variable is dead — `server.mjs` always calls `settingsService.requestOptions()` and `provider-settings.mjs` hardcodes `mode: "live"`. The e2e suite therefore makes real, paid model calls and its recommendation outcome depends on network and credential state. `e2e/control-room.spec.mjs`'s assertion — which previously asserted "Recommendation unavailable" and so *passed because of this bug* — was replaced with one true in both outcomes. Restoring a working force-failure escape hatch is out of scope for this fix.

### Live ten-run reliability gate (SOW §46), run out-of-band against the real provider

Scratch server on port 3031 with a scratch state file, so demo state was not polluted. Pinned configuration confirmed before the run: `openai` / `gpt-5.6-terra` / `medium`. Ten `POST /api/compass/recommend` calls against `ISS-104`. Not part of `npm test` — every test in the suite is hermetic and must stay that way.

**Round one (schema fix only): 0/10 READY.** Every run `UNAVAILABLE`, `failureReason: "timeout"`, `failureMessage: "Compass agent call timed out"`, each at ~8,012ms against the then-current 8s budget. The schema fix had removed the 400 but exposed a second, independent cause; see the timeout entry below for the measurements and the fix.

**Round two (after raising the timeout budget): 10/10 READY, zero UNAVAILABLE.**

| Run | Status | Top responder | Latency |
|---|---|---|---|
| 1 | READY | R-PRIYA | 8,254 ms |
| 2 | READY | R-PRIYA | 9,483 ms |
| 3 | READY | R-PRIYA | 8,166 ms |
| 4 | READY | R-PRIYA | 11,402 ms |
| 5 | READY | R-PRIYA | 13,011 ms |
| 6 | READY | R-PRIYA | 11,524 ms |
| 7 | READY | R-PRIYA | 10,190 ms |
| 8 | READY | R-PRIYA | 10,429 ms |
| 9 | READY | R-PRIYA | 8,687 ms |
| 10 | READY | R-PRIYA | 7,486 ms |

No `failureReason` or `failureMessage` on any run. Independently inspected the ten persisted recommendations: every one carried tradeoffs on 4 of 4 ranked candidates, every `tradeoff.comparedToResponderId` grounded in the candidate packet and never self-referencing, and zero numeric leakage in any generated prose. That is direct evidence that the extended ID grounding and the instruction hardening both hold against the real model, and that the pre-decided numeric-leakage contingency is not needed. Gate output and the persisted state file were scanned for `sk-` before being recorded here: no matches.

## 2026-09-04 — Provider failures now carry the provider's own words

- Date: 2026-09-04
- Decision: On a non-OK provider response, read `response.text()` and append it (truncated to 500 characters) to the thrown error in both `callLiveModel` (`backend/src/agent.mjs`) and `callLivePlanner` (`backend/src/event-planner.mjs`). Persist the resulting message as `recommendation.failureMessage` alongside the existing `failureReason` in `live-recommendation-service.mjs`, on both the model-outcome branch and the service-side validation branch, and return it in the service result. Do **not** render `failureMessage` in the UI. Do not add logger injection. Do not update `backend/src/domain.ts`.
- Reason: The schema bug above took a full diagnostic session to find only because the HTTP status was thrown without the body. `HTTP 400` is indistinguishable between a malformed schema, a revoked key, and an unpinned model ID; the provider's error body says exactly which, and it was being discarded one line before it would have named the problem. The event planner had the identical one-line defect and is equally on the live path, so its 400s are equally invisible; fixing only the agent would leave the same trap armed. Persisting the message makes the cause visible in `GET /api/state`, the persisted live-state file, and the audit record.
  - The 500-character bound and the choice of `response.text()` alone are deliberate: the response body is the provider's own error object and never echoes the request body, the request headers, or the credential. The request body is not included, at any length.
  - `failureMessage` is persisted but not rendered. Raw provider text on the recommendation card would put a provider-internal string in front of a demo audience, and the existing UI copy is asserted by the e2e suite. Operators get it from state and the audit record; the card keeps its calm fail-closed language.
  - Full logger injection into `live-recommendation-service.mjs` stayed out: transport is already logged by the server, `failureReason` was already persisted, and `failureMessage` closes the actual gap. Adding a logging seam would be a larger change than the defect warrants.
  - `backend/src/domain.ts`'s `Recommendation` interface is already stale — it lacks `status`, `failureReason`, `nearestWinner`, `disagreement`, and `baselineConfig`. Adding only `failureMessage` would make it *look* current while remaining wrong, which is worse than visibly stale. It is left alone deliberately and noted here.
- Affected SOW section: §36, §39, §54, §55.
- Impact: A live provider rejection now names itself. `backend/tests/wp5-agent.test.mjs` asserts the message carries both the status code and the provider's text, stays bounded, and never contains the credential, plus that an unreadable error body still fails closed with the status alone. `backend/tests/wp7-wp8-live-recommendation.test.mjs` asserts the message reaches the persisted recommendation while the deterministic baselines stay intact, and that a validation failure carrying only an `errors` array still persists a readable message. Existing test stubs that return `ok: true` are unaffected; any future stub exercising the failure path must provide a `text` method.

## 2026-09-04 — Live model timeout budget raised to match measured reasoning latency

- Date: 2026-09-04
- Decision: Raise `DEFAULT_TIMEOUT_MS` in `backend/src/agent.mjs` from 8s to 30s, and the browser-side `api()` abort in `frontend/app.js` from 15s to 45s (with its user-facing message updated to match). Leave `event-planner.mjs`'s 8s budget unchanged.
- Reason: **This is a deviation from the fix plan, recorded per AGENTS.md rule 7.** The plan diagnosed the strict-schema `required` violation as the sole cause of "Recommendation unavailable" and set a ten-consecutive-live-run gate as the exit criterion. With the schema fixed, that gate came back **0/10 READY — every run `reason: "timeout"`**, at almost exactly 8,012ms each. The schema fix was correct and necessary but not sufficient: it uncovered a second, independent cause that the 400 had been masking, because a call that is rejected in under a second never reveals how long a successful call would have taken.
  - Measured directly against the pinned model on the real Scenario A packet with a deliberately generous ceiling, six consecutive calls returned `ok` with Priya at rank one in **8,457 / 8,551 / 8,754 / 9,568 / 10,576 / 12,383 ms**. Every single successful call exceeds the 8s budget. The old ceiling could not have passed, and no amount of retrying would have helped.
  - 30s is roughly two and a half times the observed maximum. The ceiling exists to bound a hung connection, not to bound normal latency, so it should sit well clear of the working range rather than near it. The re-run gate's slowest call was 13,011ms — already past the earlier observed maximum, which is why the headroom is deliberately generous rather than trimmed to the measurements.
  - The browser timeout had to move with it: at 15s the fetch would abort before a normal 30s-budgeted call could return, so the user would see "Compass did not respond" on calls the server completed successfully. These two numbers are one budget and cannot be set independently. No test pins either literal.
  - The event planner was measured too, rather than changed by analogy: three live calls at **2,139 / 1,747 / 1,739 ms**, comfortably inside its existing 8s budget. It is left alone. Its packet is smaller and its task is far simpler than ranking candidates with comparative tradeoffs, so the two budgets are not required to match.
- Affected SOW section: §36, §46, §55, §56, WP5.
- Impact: The live ten-run gate passes **10/10 READY**, Priya rank one on all ten, zero UNAVAILABLE — run latencies 7,486 to 13,011 ms. All ten results carried tradeoffs on 4 of 4 candidates, every `comparedToResponderId` grounded in the packet, and zero numeric leakage, which confirms both the extended ID grounding and the instruction hardening hold against the real model and that the pre-decided numeric-leakage contingency is not needed. A 30s ceiling means a genuinely hung provider connection now occupies a recommendation slot for 30s instead of 8s before falling closed to the deterministic baselines; that is the accepted cost of the model being able to answer at all. Demo operators should expect roughly eight to thirteen seconds of visible in-flight state on "Ask Compass" — this is normal reasoning latency, not a hang.

## 2026-09-05 — Polling must not destroy in-progress operator input

- Date: 2026-09-05
- Decision: Route every control-room panel write through a new `setHtml(element, html)` helper in `frontend/render-lifecycle.js` that skips the write when the produced markup is byte-identical to what it last wrote, and, when it does write, preserves identified `<select>` values and restores focus. Convert every event binding inside `renderIssues`, `renderLiveDecision` and `renderOffline` from `addEventListener` to property assignment. Derive both override buttons' `disabled` state from the select's surviving value rather than trusting the markup. Add a pointer-interaction guard to the poll alongside the existing `actionInFlight` guard.
- Reason: `render()` runs every 1.5s and reassigned `innerHTML` unconditionally. That destroyed the override `<select>` mid-interaction — value reset to empty, confirm button re-rendered `disabled` — with a residual click window of 0 to 1500ms, which is why the dropdown was intermittently rather than always unusable. This is independent of the schema bug above: the same destruction happens in the READY branch, so fixing Compass did not fix the dropdown.
  - The blast radius was three sites sharing one root cause — the UNAVAILABLE branch, the READY branch, and `renderOffline`. A fix scoped to `renderLiveDecision` alone would have left Offline broken, which is the demo's API-free fallback path. Hoisting one helper covers all three and every other polled panel, and it removes the separate mousedown-to-mouseup click-swallow across the whole control room.
  - The dirty-check is on **content**, not on `state.revision`. A revision check is dead code here: the live store bumps revision on every scheduler mutation and simulation time advances continuously, so equality would almost never hold; making it hold by skipping whole renders would freeze the clock, floor map and event feed, and Offline snapshots carry no meaningful revision. Panel markup, by contrast, is deterministic given state during idle polling — the evidence table reads a frozen candidate snapshot — so a content check is immune to state churn that never reaches the panel.
  - Rejected: skipping the re-render while the panel contains `document.activeElement`. It freezes the entire control room for as long as focus is parked in the panel, and does nothing for a mouse user who clicks without focusing first. Focus *restoration* is kept as a secondary behaviour inside the helper.
  - Rejected: preserve-and-restore at each of the three call sites. It triples the logic and the fourth branch someone adds later silently re-breaks it.
  - Rejected: DOM diffing or component-ising the panel. That is a rewrite of the render layer to fix a bug, against AGENTS.md rule 2, with a large regression surface in a frozen-core demo.
  - Bindings had to become idempotent **because** writes can now be skipped: `addEventListener` against a surviving node would stack a duplicate handler every 1.5s tick, leaking listeners and eventually double-firing `perform`. Property assignment is idempotent and, critically, still refreshes the closure every pass, so a skipped write can never leave a handler capturing a stale `recommendation.id`. Handlers are therefore re-bound on every pass even when the write was skipped; this is load-bearing and must not be "optimised" into an early return.
  - The buttons' `disabled` state is derived because after a preserved-value restore the hardcoded `disabled` in the markup is no longer what is on screen. The expression is the same one the change handler already used.
  - The pointer guard's 1s expiry is deliberate: if a `pointerup` is lost because the button was released outside the window, the guard self-clears rather than stalling polling forever. `setInterval` itself is untouched.
- Affected SOW section: §55, §56, WP6, WP10, WP13.
- Impact: `frontend/render-lifecycle.js` is a separate DOM-free module specifically so `backend/tests/wp15-render-lifecycle.test.mjs` can exercise it under `node --test` against a stub element with no browser — it reaches the document through `element.ownerDocument` and never touches a global. Eight new tests cover skip-on-identical, write-on-change, per-element cache isolation, select-value preservation, correct *non*-preservation when the option has disappeared, focus restoration, the cache-staleness hazard that forces `perform()`'s error path through the helper, and static assertions that the app has no remaining direct panel `innerHTML` writes or `addEventListener` bindings. `#analytics-content` and `#settings-content` are deliberately excluded: analytics re-renders a snapshot timestamp every tick so it would never hit the cache, and settings is never touched by `render()`.
- Known defects recorded but deliberately NOT fixed here, so they are not later mistaken for regressions from this work:
  - A recommendation in `PENDING_MODEL` status — visible only if a poll lands between the two `store.mutate` calls in `live-recommendation-service.mjs` — is neither `UNAVAILABLE` nor `STALE`, so `renderLiveDecision` dereferences `rankedCandidates` on a null `agentResult` and throws a `TypeError`. Pre-existing, and now marginally more reachable in wall-clock terms because the model call legitimately takes eight to thirteen seconds. Out of scope for this fix.
  - Offline excludes the recommended responder from the override list while Live includes them, so a Live operator can "override" *to* the recommendation and have it recorded `OVERRIDDEN`, skewing the SOW §31 agreement analytics. That is a product decision, not a bug fix.

## 2026-09-05 — Hermetic browser inference and complete recommendation states

- Date: 2026-09-05
- Decision: Make provider settings preserve the explicit Compass and event-planner inference modes supplied by the environment, while defaulting both to `live` in ordinary use. Handle `PENDING_MODEL` as a first-class read-only UI state before accessing model output. Exclude the Compass winner from the Live override selector so confirmation and override remain distinct decisions.
- Reason: Settings previously hardcoded `live`, silently defeating Playwright's force-failure configuration and turning a local browser suite into paid, network-dependent traffic. The measured eight-to-thirteen-second provider latency also makes `PENDING_MODEL` observable to another client; dereferencing its null result could blank the decision panel. Offering the winner as an override mislabeled agreement as an override and could distort decision analytics.
- Affected SOW section: §4.2, §26–§33, §36, §43, §45–§46, §55–§56.
- Impact: Production remains live by default, while tests can independently force Compass and planner outcomes without an external call. The decision panel now renders a calm progress state for in-flight recommendations. All 115 unit/integration tests and all four Chromium journeys pass; browser coverage proves Live and Offline override selections survive multiple polling ticks. The live 100-opportunity provider evaluation remains a separate external gate.

## 2026-09-05 — Confidence-bounded outcome learning, simulation override menu, and synthetic responder codes

- Date: 2026-09-05
- Decision: Replace person-like responder aliases and IDs with fixed-format synthetic role codes (`Engr104`, `Engr028`, `Tech216`, `Oper088`, `Tech073`, and `Oper142`). Move the manual event and resolution shortcuts into a collapsed **Simulation overrides** menu, rename **Force Next Event** to **Trigger Next Event**, and retain **Force Resolve**. Change the internal resolution profile so hidden per-class skill contributes at least seventy percent, while observed same-class history contributes from zero to at most thirty percent as its sample grows to eight cases. Sample duration within seventy to one hundred thirty percent of that blended median and sample success from the blended probability using the existing persisted resolution RNG.
- Reason: The operator wants the visible environment to use neutral identifiers and the ordinary control surface to emphasize natural simulation flow. The override controls remain available for demonstrations, but are clearly grouped as clock-bypassing actions. The outcome model must also reflect both underlying capability and the environment's observed record while preserving real-world variability: a weak responder can occasionally succeed or finish quickly, and a strong responder can occasionally fail or take longer.
  - **Deliberate v4 deviation:** SOW §8 and Definition of Done item 14 state that outcomes come from hidden skill rather than observed history. The user's later explicit product direction supersedes that behavior. The history contribution is capped below the latent-skill contribution and ramps with sample count to limit self-reinforcing feedback from thin evidence. Application code still owns the blend and every random draw; neither model receives hidden skill or controls outcomes.
  - The RNG remains seeded and persisted. Runs are stochastic within the simulated world but reproducible from the same state, which preserves auditability, reset behavior, and reliable tests.
  - **Force Resolve** bypasses only the wait until the selected assignment's due time. It still consumes the one-shot resolution token and follows the same blended probability and variability model; it cannot force a successful result.
  - Display codes include digits, so the live model instruction now explicitly forbids repeating responder IDs or display codes in generated prose. The structured ID fields remain available for validation and assignment, while qualitative prose stays free of numeric leakage.
- Affected SOW section: §7–§8, §23–§24, §47, §55–§56, Definition of Done item 14.
- Impact: The public UI, normal data fixtures, tests, and current demo materials no longer present human-style personnel names. Hidden skill remains excluded from public state, planner/Compass packets, UI payloads, and analytics. Unit coverage verifies that a thin history sample influences but cannot outweigh the latent prior; browser coverage exercises both controls through the collapsed menu.

## 2026-09-05 — Dedicated Demo view and runtime-backed agent activity

- Date: 2026-09-05
- Decision: Add a shared-mode **Demo** navigation view containing the presentation overrides and a two-agent activity monitor. Remove the overrides from the simulation bar. Project transient Event Planner and Compass activity from the live runtime in every public snapshot, and supplement it with immediate browser-local activity when the current browser initiates a request. Keep a compact live-region status indicator visible in the navigation bar across all views.
- Reason: A long Compass call can legitimately take several seconds, and event generation can include both planning and an automatic recommendation. The prior busy cursor and issue-card pending state did not make background work visible enough. Runtime-backed state covers automatic scheduler work and work started by another browser; the immediate local state closes the interval before the next poll and remains visible while the initiating request is in flight.
  - Activity is operational presentation state, not simulation truth. It stays in runtime memory, is not written to the canonical live-state file, and contains only agent name, status, bounded detail, and real-time timestamps.
  - Offline remains API-free. The Demo view explicitly reports fixture mode and disables Live-only simulation overrides when Offline is active.
  - The event shortcut reports the combined event workflow because a successful event is immediately followed by Compass recommendation work. Runtime snapshots still distinguish the Event Planner and Compass stages for automatic/background activity.
- Affected SOW section: §4.2, §36, §43, §55–§56, WP10, WP13.
- Impact: Operators now receive an immediate accessible indication for recommendation and event-generation work, can inspect the most recent status of each agent in one dedicated view, and can access both presentation overrides without cluttering normal simulation controls. Unit coverage proves a runtime snapshot exposes a planner while its provider call is unresolved; Chromium coverage proves both immediate indicators and the moved controls.
## 2026-09-05 — Replace the human confirmation gate with ride-hailing-style automatic dispatch

- Date: 2026-09-05
- Decision: Treat each already-prioritized issue as an independent ride request. Compass ranks the bounded eligible set, then application code offers the issue to one responder at a time. Responders accept or reject asynchronously; rejection advances to the next ranked eligible responder, exhaustion returns the issue to an automatic rematch queue, stale model results rerun without operator action, and an accepted offer performs the canonical assignment atomically. Central command retains an explicit override while an offer is pending. When Compass is unavailable, an application-owned deterministic ordering keeps dispatch operating. Offline uses the committed Compass fixture and a scripted delayed acceptance, with no API call.
- Reason: The user explicitly clarified that Compass must be fully agentic and that its operating model is the same as taxi hailing. Requiring a supervisor to confirm every recommendation made “stale” a manual error state and prevented unattended dispatch. The latest product direction therefore supersedes the v4 SOW’s human-confirmation clauses (§32, WP9, §55), while preserving the SOW’s stronger safety boundaries: per-issue only, no global optimization or issue priority, bounded candidate ranking, backend validation, atomic mutation, hidden simulation truth, and central human override.
- Implementation: Added `OFFER_PENDING` issues, `OFFERED` responders, persisted dispatch offers, an independent persisted dispatch RNG, scheduled offer responses, automatic fall-through/rematch, `AUTO_ACCEPTED` decisions, offer audit events, public redaction of response tokens/probability, and first-class Live/Offline UI states. Offer acceptance is a dispatch interaction; resolution duration/success remains a later, separate sample dominated by hidden `ResponderSkill` with bounded observed-history influence.
- Reliability: Pending-offer, rejection cascade, acceptance, override-race, public-redaction, stale-auto-rerun, and API-free Offline auto-accept paths have automated coverage. The audit store now serializes read-modify-write operations per file because automatic Offline recommendation exposed a same-file concurrency race in tests.
- Verification: `npm test` passes 123/123, including the deterministic 100-opportunity soak. Chromium Playwright passes 4/4 with forced provider failures and no paid API calls. Live and Offline screenshots were inspected after the run; both visibly show `Offer Pending`, the offered responder, grounded evidence, and central override.

## 2026-09-05 — Navigable issue audit trail and industry-neutral response playbook

- Date: 2026-09-05
- Decision: Make every issue-bearing event in the operational feed a control that reopens that issue's complete record: the Compass analysis and decision-time ranked evidence, the deterministic baselines, the offer sequence with acceptances and rejections, any control-center override, and the resolution outcome including the action that was taken. Separately, extend the event planner contract with a bounded `responseAction` alongside `description`, and require both to be industry-neutral manufacturing narrative. The resolution engine records the executed `actionTaken` on both resolution history and the emitted `ISSUE_RESOLVED`/`ISSUE_REOPENED` events.
- Reason: The feed previously recorded that something happened without letting an operator ask why it happened that way. Compass is an assignment-justification system, so the audit path from symptom through ranked evidence, offer sequence, and outcome is the product, not a convenience. A resolved issue leaves the active issue list, which made the feed the only remaining route to its record; the audit view is therefore keyed on the selected event rather than on active-issue selection.
  - The deterministic/agent boundary is unchanged. The model proposes only a narrative symptom and a candidate response action within bounded length limits; application code still owns validation, eligibility, persistence, outcome sampling, and every mutation. The planner explicitly may not determine the resolution outcome.
  - Narrative is constrained to generic production concepts — process drift, material flow, sensing, motion, alignment, inspection, isolation, adjustment, cleaning, restart, verification — and forbids naming a specific industry, product, proprietary machine, hazardous procedure, or regulated process. This keeps the demo credible across automotive, semiconductor, electronics, and food processing without asserting domain expertise Compass does not have.
  - `description` is bounded to 180 characters and `responseAction` to 240, validated in `outputShapeErrors` so an over-long model response falls back deterministically rather than distorting the feed or audit layout.
  - `responseAction` is optional on the `Issue` contract. Seeded and pre-existing issues without one resolve through a generic fallback action, so the change is backward compatible with persisted live state.
- Affected SOW section: §4.2, §23–§24, §29, §36, §55–§56, WP4, WP6, WP10.
- Impact: Operators can reconstruct any dispatch decision from the feed, including for issues that have already closed. Unit coverage proves the response action propagates from issue to resolution history and emitted events, that the generic fallback still applies when an issue carries no action, that the deterministic fallback produces a bounded narrative for every issue class, and that over-long narratives are rejected. Browser coverage proves the audit trail opens from a feed event, survives the polling re-render, returns to the current view, and remains reachable for a resolved issue.

## 2026-09-05 — Audit records are fetched on demand, and tests stop writing application data

- Date: 2026-09-05
- Decision: Serve one issue's complete audit record from a new `GET /api/issues/:id/audit` route backed by untruncated server-side state, and have the control room fetch it once per opened issue instead of reading it out of the polled snapshot. Separately, give every test fixture its own throwaway audit store so the suite never writes to `backend/data/`.
- Reason: The polled snapshot deliberately truncates recommendations and offers to the most recent thirty and events to the most recent hundred, so the 1.5-second poll stays small. An audit trail read from that snapshot silently loses its analysis once a run gets long — precisely the long-running case this application is intended for, and the failure is invisible rather than loud. Retaining more history in the snapshot instead was rejected: recommendation records carry `candidateEvidenceSnapshot` and `agentResult`, so keeping a per-issue history would push hundreds of kilobytes onto every poll to serve a panel an operator opens occasionally. Fetching on demand keeps the poll lean and makes the audit record complete and permanently reachable, including for issues that closed long ago.
  - The route reuses the public-snapshot redaction rules and asserts `assertNoResponderSkill` on its output, so hidden simulation truth cannot escape through the new surface.
  - The record is cached per opened issue, so subsequent poll ticks re-render it for free, and a late response is discarded if the operator has already navigated away.
  - This also removes the same truncation exposure from the live decision panel's `offer.recommendationId` lookup, which read from the same truncated list.
- **Deliberate `AGENTS.md` rule 8 deviation:** rule 8 says to freeze the core after the Definition of Done and spend remaining time on demo reliability. The user has stated that Compass will be used at their company beyond the demo and that demo readiness is their least concern, so production correctness under long runs now takes precedence over freeze caution. Recorded here rather than silently applied.
- Test isolation: `createDemoRuntime` defaults its audit store to the real `backend/data/recommendation-events.json`. Ten fixtures across five files relied on that default, so the suite mutated application data and contended on one file. The store serializes read-modify-write per path but only within a process, and `node --test` runs each file in its own process, which produced an intermittent failure in `wp10-live-runtime.test.mjs` observed roughly once in nine full-suite runs. Fixtures now use `backend/tests/helpers/temp-audit-store.mjs`.
- Affected SOW section: §36, §39, §54–§56, WP1, WP8, WP10.
- Impact: Audit trails stay complete and reachable for the life of a run rather than degrading after thirty recommendations. The polled payload is unchanged in size. `npm test` runs are now hermetic with respect to `backend/data/`, verified by byte-comparing the audit file across a full run, and the previously intermittent runtime test passed six consecutive full-suite runs.

## 2026-09-05 — Normalize mode conflicts and restore the canonical domain contract

- Date: 2026-09-05
- Decision: Mark application-runtime mode violations with a `MODE_CONFLICT` error carrying HTTP status 409, mark invalid mode input as HTTP 400, and preserve generic 500 responses for unexpected failures. Update the TypeScript domain declarations comprehensively to match the persisted/public runtime shapes rather than leaving a partial historical contract.
- Reason: The issue-audit endpoint returned 500 in Offline mode even though the request was valid but incompatible with the selected mode. That incorrectly classified an expected client-state conflict as a server defect and made monitoring noisy. The same problem applied to other mode-guarded routes. Separately, `domain.ts` still described pre-Live equipment statuses and omitted recommendation status, baselines, model metadata, disagreement, failure, dispatch, assignment, and operational-event fields; production-facing documentation must not knowingly contradict canonical state.
- Impact: All global and route-local handlers preserve explicit mode status codes, while existing not-found/conflict behavior remains intact. Tests cover both Live-only and Offline-only conflicts plus invalid mode input. No dispatch, inference, simulation, or analytics behavior changed.

## 2026-09-05 — Remove the core-freeze policy

- Date: 2026-09-05
- Decision: Rewrite `AGENTS.md` rule 8 to state that there is no core freeze and that development continues until the user says otherwise, and add a rule 9 naming both verification suites. Update the "Current phase" line in `handover.md` accordingly. Dated entries in `handover.md` and earlier entries in this file are left untouched as historical record.
- Reason: The freeze was written for a release milestone that has passed. Compass is going into real use at the user's company, and the user has stated that development continues until they are satisfied. The freeze instruction was actively harmful in that context: it had already caused one agent in this chain to defer genuine defects — a truncation bug that silently drops an issue's analysis during long runs, and a flaky test that turned out to be the suite writing to application data — as acceptable demo-scale risk, which the user had to correct.
- Not changed: the SOW documents. They are the original contract and are quoted throughout the record; rewriting them would falsify history. Rule 8 now says explicitly that their demo framing, and the older handover and decision entries, are historical record rather than current instruction.
- Also unchanged: rules 1–7. The deterministic/agent boundary, hidden `ResponderSkill`, API-free Offline, synthetic domain-neutral data, per-issue scope, and the decision/handover recording duty all still bind. Removing the freeze widens what may be built, not what may be violated.
- Affected SOW section: supersedes §-level freeze language including the v4 "Freeze the core" guidance and Definition of Done item 14.
- Impact: Agents may now undertake refactors, architectural improvements, and production-hardening work that the freeze forbade, provided each change is justified on production correctness and recorded here.

## 2026-09-05 — Three-floor building, wireframe map, and floor-aware travel time

- Date: 2026-09-05
- Decision: Replace the single 150×100 floor holding six machines with a three-floor building holding 72 (24 per floor), rendered as an isometric CSS 3D scene of stacked wireframe planes that the operator can rotate and that turns to face a selected machine or responder. Add a `floor` coordinate to the shared `Position` contract for both equipment and responders. Keep `distanceToIssue` a planar same-floor distance in metres, add `floorsToIssue`, and charge a fixed `FLOOR_TRANSIT_MINUTES` (1.5) per floor changed inside `travelTimeMinutes`.
- Reason: The operator asked for a building rather than a single floor, at roughly ten times the machine count, and for the map objects to be simplified so that density stays legible.
  - **Fixed transit cost over stairwell routing or 3D distance.** Routing through stairwell nodes is more realistic but makes stairwell placement a hidden determinant of every recommendation and is hard to state plainly in an audit trail. A 3D hypotenuse is tidy mathematically but models walking through ceilings. A flat per-floor cost is explainable in one sentence, which matters because travel time is evidence Compass is asked to justify.
  - **The nearest-available baseline now ranks on travel time, not planar distance.** In a three-floor building the physically closest responder can be two floors up, so distance alone stops meaning "nearest" in any useful sense. This is a deliberate change to a baseline definition and is covered by a test that puts a responder directly above the issue and asserts a farther same-floor responder wins.
  - **The six original ground-floor machines keep their exact coordinates.** Scenario A's committed evidence, baselines, and expected winner derive from them, so regenerating those positions would silently invalidate committed fixtures. The layout generator pins them and builds the rest of the building around them.
  - **Wireframes over icons.** At roughly twenty-four machines per floor, filled icons and always-on labels read as noise. Machines are outlines, labels are limited to the active floor plus hover and focus, and inactive floors are dimmed.
- Migration: a state persisted before the building has no floor coordinate and fails validation, which would leave the server unable to start on any existing state file rather than degrading. The existing migrate-and-back-up path now lifts such a state into the building, preserving machine coordinates, live status, and the issues that reference them. Covered by `wp17-building-migration.test.mjs`, including a test asserting the pre-building state genuinely fails validation, so the migration cannot quietly become dead code.
- Layout determinism: positions are generated, not hand-written, because seventy-two hand-maintained entries invite drift — but the generator uses no randomness, and a test asserts two builds are identical and that no two machines on a floor sit within ten units of each other.
- Interaction defect found and fixed during browser verification: floor planes intercepted clicks meant for machines drawn on other floors, making most of the building unselectable. Planes and grids are now click-through and a browser journey guards it.
- Affected SOW section: §7–§8 (environment), §23–§24 (evidence), §31 (baselines), WP1, WP2, WP10.
- Impact: `npm test` 142/142 and Chromium 9/9, including three new building journeys. The candidate packet fixture is regenerated for the added field and for the upstairs responders' higher travel times. Personnel and assignment logic is untouched; the parallel workstream boundary in `docs/floor-layout/README.md` held.

## 2026-09-05 — Two-responder attempts, support dispatch, and mid-issue roster changes

- Date: 2026-09-05
- Decision: Permit each active issue to have one Primary and at most one Support responder. Keep responder exclusivity across issues. Complex issues request support immediately after primary staffing; standard issues request it only when application-observed progress indicates delay. Support uses the same bounded Compass ranking and asynchronous offer/accept/reject flow as primary dispatch, with automatic issue-local retry after capacity exhaustion. Central command may release either member of a two-person roster or atomically transfer one responder from another two-person issue; application code promotes the remaining Support when the Primary leaves.
- Scope boundary: This remains per-issue dispatch. Compass never sees other issues as a portfolio and never chooses which issue deserves a responder. Cross-issue movement exists only as an explicit, roster-versioned control-center mutation, so no global workforce optimizer or issue-priority policy was introduced.
- Outcome model: `team-resolution-v1` samples a fixed work total from a 0.70–1.30 duration factor and one fixed success draw when an attempt starts. Solo rate is the reciprocal of the responder's blended median. Two-person rate is `max(rateA, rateB) + 0.60 × min(rateA, rateB)`. Segment success uses work-weighted responder probability plus bounded team synergy capped at 0.98. Every join, release, promotion, or transfer first settles elapsed work, records a new roster segment, and replans only remaining work. It never rerolls either hidden draw.
- Learning and privacy: Completed history consolidates multiple stints by responder and weights evidence by contribution. The final Primary is attributed from the active roster, including promotions. Internal contribution shares strengthen or discount later evidence but are redacted from public state, audit records, operational events, model packets, and analytics. `ResponderSkill` remains hidden simulation truth.
- Persistence: Schema version 2 adds canonical role-bearing assignments and resolution attempts with bidirectional invariants among issues, responders, assignments, attempts, and pending offers. Load-time migration is idempotent, writes a `.pre-v2.bak` recovery copy before upgrading pre-v2 files, keeps completed legacy assignments attached to their historical attempt rather than an active reopened attempt, and reconstructs issue/responder cache pointers from canonical active assignments and pending offers. That last repair preserves older long-running states whose terminal issues retained now-invalid assignment caches.
- Offline: Offline remains API-free but uses the shared attempt math for fixed outcome sampling, elapsed-work settlement, replanning, support acceleration, promotion, and history generation. Its public snapshot applies the same hidden-truth and contribution-share redaction.
- SOW deviation: v4 describes a single assigned responder and an earlier confirmation-centric workflow. The user's explicit product direction supersedes that constraint. The implementation preserves the stronger SOW boundaries: deterministic application ownership of facts and outcomes, bounded model ranking only, responder exclusivity, per-issue scope, and hidden simulation truth.
- Floor-layout integration: The parallel three-floor/72-machine workstream was merged before final verification. Staffing evidence uses its floor-aware `travelTimeMinutes`, and the temporary file-ownership rule was removed after integration.
- Verification: 160/160 unit and integration tests pass. Nine Chromium journeys pass with forced provider failure and no API spend, including two-person Offline staffing and the merged three-floor building.

## 2026-09-05 — Default 2D manufacturing-floor viewport with direct navigation

- Date: 2026-09-05
- Decision: Make the manufacturing map a one-floor-at-a-time 2D top view by default. Add explicit Floor 1/2/3 selection, drag-to-pan, wheel/button/keyboard zoom, camera reset, and an optional 2.5D toggle with rotation available only in that view. Use one shared DOM renderer for Live and Offline rather than maintaining separate 2D and 2.5D maps.
- Reason: The stacked 2.5D perspective was visually poor at 72-machine density and made direct navigation harder than a production control-room map should be. A full-size 2D plan removes floor occlusion and makes each floor immediately readable. The operator explicitly requested free panning, superseding the planning document's earlier choice to defer it.
- Rendering lifecycle: Camera state is never embedded in the polled markup string. `setHtml` owns state-derived scene content; `applyCamera` imperatively reapplies view mode, active floor, pan, zoom, yaw, and focus after every render. This preserves the DOM and camera across the 1.5-second state poll and avoids rebuilding 72 node buttons for every wheel or drag event.
- Interaction: Plain wheel zoom is cursor-centred and bounded to 55–300%. Background pointer drag pans within a bounded viewport; buttons and keyboard provide equivalent zoom/reset/pan access. The map uses `role="group"`, exposes every machine/responder as a labelled button, contains overscroll, supports touch pointer panning, and disables animation under reduced-motion preferences.
- Scope: No backend, simulation, assignment, responder evidence, or hidden-truth behavior changed. The optional floating info card in `2p5buildingplan.md` was not implemented because it was not part of the request.
- Verification: 161/161 unit and integration cases pass. Ten Chromium journeys pass with forced provider failure and no API spend, including default 2D, floor switching, wheel zoom, mouse drag pan, poll persistence, and optional 2.5D rotation. The resulting Live screenshot was inspected at 24 machines on the active floor.

## 2026-09-06 — Event-first feed selection with refreshable issue chronology

- Date: 2026-09-06
- Decision: Treat the selected operational event and the selected issue chronology as separate UI state. Every visible feed row, including simulation/system rows without an `issueId`, opens an allowlisted event summary showing its type, simulation timestamp, source, and relevant public context. Issue-bearing events retain the complete on-demand issue chronology underneath.
- Reason: The earlier feed implementation stored `selectedEventId` but never read it while rendering; selecting `ISSUE_RAISED` and `RESPONDER_ASSIGNED` for the same issue therefore produced an apparently unchanged right pane. An issue-only late-response guard also allowed an older request for the same issue to claim ownership after a newer event click.
- Lifecycle: The selected public event snapshot is retained across 1.5-second polls. Issue audit reads are guarded by a monotonically increasing request sequence plus both issue and event identity. An issue-scoped public-state signature triggers a background audit refresh when lifecycle records change, while the existing content dirty-check avoids destructive byte-identical panel rewrites. Reset, mode changes, and active issue-card selection invalidate incompatible event/audit state.
- Privacy and scope: Event prose is composed only from an explicit allowlist of public event fields. Arbitrary payload JSON is never rendered, and hidden `ResponderSkill` remains unavailable to the frontend. No inference, dispatch, simulation, priority, outcome, or analytics behavior changed; Offline remains API-free.
- Accessibility: Feed rows expose pressed/current state, retain focus through keyed dirty-checked rendering, and provide visible focus styling. The chronology exposes `aria-busy` and a bounded refresh status while new lifecycle data is loaded.
- Affected SOW section: §34, §36–§37, §41, WP10.
- Verification: `npm test` passes all 161 existing unit/integration cases. The forced-failure Chromium suite passes 12/12 without provider calls, including distinct detail for `event-002` and `event-003`, selection persistence across two poll ticks, a selectable system event, a deliberately reordered same-issue audit response, and resolved-issue reachability.

## 2026-09-06 — In-plane map geometry with a screen-space label layer

- Date: 2026-09-06
- Decision: Split the manufacturing map into two layers with one rule each. Geometry — machines, responders, and floor signage — lies in the floor plane and shares the plane's axes, so 2.5D foreshortens it with the floor. All readable node text moves out of the 3D scene into a screen-space overlay (`.map-label-layer`) that measures the browser's own projection of each node and places upright labels above it, joined by a leader line.
- Reason: Every node previously counter-rotated by `-yaw`/`-pitch` so its wireframe stayed square to the camera. That kept text legible but made machines read as billboards floating over the floor rather than objects standing on it, which is wrong in a perspective view and is the first thing that has to go before the scene can become genuinely three-dimensional. Moving text to an overlay is what frees the geometry to tilt: legibility no longer constrains orientation.
- Direction: This is deliberately step one toward a full 3D floor, not an end state. The layer split is the part worth keeping — world geometry in the scene, text in screen space — because it is what a real 3D renderer would also require.
- Labels: The active floor's responders and issue-bearing machines are labelled continuously; hovered or focused nodes are labelled on any floor. `frontend/map-label-layout.js` is a pure, separately tested function that packs overlapping labels into upward lanes, clamps them inside the viewport padding, and returns leader geometry. It never moves an anchor, so a label's position is always a function of where its node actually projected.
- Camera settling: Labels are measured from live projected geometry, so a single layout pass taken while `.building` (.55s) or `.building-stage` (.18s) is still animating leaves every leader line ending in empty space. `applyCamera` therefore re-measures each frame until `CAMERA_SETTLE_MS` after the last camera change. Overlay elements are rebuilt only when the labelled set or its copy changes, so the per-frame path is measure-and-position, not re-create.
- Scope: Frontend view only. No backend, schema, simulation, assignment, evidence, analytics, or hidden-truth behavior changed; Offline shares the same renderer and remains API-free. 2D is unaffected by the geometry change, because at `--yaw: 0deg`/`--pitch: 0deg` the removed counter-rotation was already the identity transform.
- Superseded guidance: `2p5buildingplan.md` §WI-3 ruled out leader lines and any collision-avoidance system. That reasoning applied to a single click-placed info card that deliberately did not track its node. These are persistent per-node labels that are recomputed from the projection every time the camera moves, so a leader line is always correct and lane packing is required rather than avoidable.
- Verification: 163/163 unit and integration cases pass, including the new `wp19` layout unit tests. Fourteen Chromium journeys pass with forced provider failure and no API spend, including a new geometric regression asserting that leader-line endpoints still land on their node centres after a zoom. 2.5D floors 1 and 3, a zoomed view, a rotated view, and the 2D plan were screenshot-inspected.

## 2026-09-06 — A failed persistence write must not brick the process

- Date: 2026-09-06
- Decision: The live store serializes reads and writes on one chain, but the *stored* chain is never left rejected: `queue` advances it with `chain.catch(() => {}).then(operation)` and hands the caller a separate promise, so a caller still sees its own error while the next operation starts from a settled chain. Reads enqueue as operations rather than awaiting the write chain's rejection. Temp files for every atomic write are now unique per writer (`${filePath}.${process.pid}.${randomUUID()}.tmp`). A failure to bind the listening port is fatal, and the simulation loop starts only after the port is owned.
- Reason: `GET /api/state` returned a permanent HTTP 500 on the long-running port-3000 server while the state file itself was completely healthy. Root cause was a chain of three defects, each harmless alone. `writeAtomically` renamed from a fixed `${filePath}.tmp`, so concurrent writers clobbered each other and the losing rename failed with `ENOENT`. `mutationQueue = mutationQueue.then(operation, operation)` then left the shared chain rejected, and both `snapshot()` and `publicSnapshot()` awaited it, so a *write* error surfaced on every subsequent *read*. Finally — the part that made it permanent rather than intermittent — `live-runtime`'s tick reads before it writes, so once the chain was poisoned the tick threw at the read and never queued another mutation. The chain could never be reassigned and the process could not recover on its own. 968 consecutive `live_scheduler_error` entries with no interleaved success confirmed this in production.
- Why there were multiple writers: `server.mjs` started the simulation loop *before* binding, and the `server.on("error")` handler only logged. Every `npm run dev` launched while port 3000 was occupied therefore failed to bind silently and stayed alive as a headless writer against the same default state path. Four such processes accumulated over two days.
- Prior art followed: `audit-store.mjs` already used `previous.catch(() => {}).then(operation)` and routed reads through the same queue, which is exactly why the audit store never exhibited this. `provider-settings.mjs` already used a pid-unique temp name. The fix ports both existing patterns to the stores that lacked them (`live-store.mjs`, `application-log-store.mjs`, and the temp name in `audit-store.mjs`).
- Deliberate limit: `reconcileStartup()` still runs before `listen()`, so a failed start performs one reconcile write before exiting. That is a single atomic write from a process that immediately dies, and it preserves the "reconcile before serving" invariant, which is worth more than avoiding one bounded write.
- Scope: Persistence and startup only. No simulation, assignment, evidence, analytics, projection, or hidden-truth behavior changed. No data repair was required — the state file parses, migrates as a no-op, validates, and projects cleanly.
- Verification: 166/166 unit and integration cases pass, including a new `wp20` suite. Two of its three cases were confirmed to FAIL against the pre-fix code and pass after, so they are genuine regressions rather than restatements. The bind fix was verified empirically: a server started against an occupied port now logs `server_start_failed` and exits 1 instead of surviving as a headless writer. 14/14 Chromium journeys pass with forced provider failure and no API spend.

## 2026-09-06 — Analytics becomes a drill-down operational dashboard

- Decision: Expand Analytics beyond the original P0 snapshot/table scope into a Live-only dashboard. It has an overview KPI layer, a fixed rolling 24 simulated-hour timeline in 15-minute bins, native SVG issue-flow and downtime charts, a Compass-vs-baselines comparison including disagreement with both baselines, and click-to-drill evidence panels. The existing tables remain below as evidence layers.
- Reason: The prior layout exposed valid facts but made an operator parse raw tables before they could assess operational state. The dashboard presents the operational story first while preserving inspectable records underneath.
- Data boundary: Timeline counts are projected only from persisted `ISSUE_RAISED`, `ISSUE_RESOLVED`, and `ISSUE_REOPENED` events. Downtime is the observed issue interval intersected with those bins. The response contains explicit window, bin-size, maximum-bin, and partial-window metadata. No model reasoning, hidden draws, `ResponderSkill`, responder ranking, global workforce optimization, or issue-priority logic is added.
- Mode and lifecycle: Offline continues to make no analytics request. Analytics refreshes only while its tab is visible; the client retains the selected drill-down across a poll refresh. No chart dependency was introduced.

## 2026-09-07 — OpenRouter added as a second provider, selectable at runtime

- Date: 2026-09-07
- Decision: Add OpenRouter alongside OpenAI as a fully enabled provider, not a "coming soon" placeholder. An operator chooses between them from the Settings tab; each provider keeps its own persisted model and reasoning-effort pin, so switching to compare providers does not discard either pin. OpenRouter's default model is `deepseek/deepseek-v4-flash`, chosen at the operator's explicit direction; it is only ever a starting point, since a real save still requires model discovery against the live OpenRouter catalog to validate the exact slug.
- Mechanics: A new `backend/src/model-provider.mjs` centralizes the one place providers actually differ — the chat-completions endpoint, the credential env var name, and the request-body shape for reasoning effort (OpenAI: top-level `reasoning_effort`; OpenRouter: nested `reasoning: { effort }`, its unified field across every model it fronts). `agent.mjs` and `event-planner.mjs` both call through this one dispatcher instead of each hand-rolling an OpenAI-specific `fetch`. Neither module's validation, fallback, or never-trust-the-model behavior changed — only which endpoint a live call reaches.
- Settings storage: `backend/data/provider-settings.json` moved from a flat `{provider, modelId, reasoningEffort}` shape to `{provider, models: {openai: {...}, openrouter: {...}}}`, so both providers' pins persist independently. A file written by the pre-OpenRouter build still loads: its flat `modelId`/`reasoningEffort` become the OpenAI entry, and OpenRouter is seeded with its coded default. `GET /api/settings/models` now accepts an optional `?provider=` query so an operator can preview a provider's live catalog before switching to it, without that preview changing the active provider.
- Model discovery: OpenRouter's `/models` response includes a `supported_parameters` array per model, which is used to decide whether reasoning-effort levels are offered for that specific model rather than guessing from its name — a `deepseek-v4-flash`-shaped "fast" model correctly gets no reasoning levels unless the live catalog says it supports the `reasoning` parameter.
- Credential handling: `OPENROUTER_API_KEY` lives in the server-side `.env` only, alongside `OPENAI_API_KEY`, and is never sent to the browser. The key was moved from a plaintext file outside the repository directly into `.env` via shell redirection that never printed its value to any tool output, and the source file was deleted once the move was confirmed.
- Scope: No change to the deterministic/agent boundary, hidden-truth exclusion, or Live/Offline behavior. Offline continues to make zero network calls to either provider. Existing OpenAI-only callers (any test omitting `provider`) are unaffected — the default remains `"openai"` everywhere.
- Verification: 181/181 unit and integration tests pass, including a new `wp21` suite proving the two providers' request shapes actually differ where they must (endpoint, reasoning field) and stay identical where they must (schema validation, fallback-on-failure). 20/20 Chromium journeys pass with forced provider failures and no API spend, including a new read-only Settings journey. That journey deliberately never clicks "Refresh available models" or "Save settings" from the browser suite, because `provider-settings.json` has no per-test isolation and is the same file the real deployment reads — the settings service resolves it from the module's own location, not `COMPASS_LIVE_STATE_PATH` or any test-scoped path. Confirmed the file's mtime was unchanged after the full e2e run.

## 2026-09-08 — Control Rooms implemented: multiple independent simulation instances in one process

- Date: 2026-09-08
- Decision: Implement `Control_Rooms_SOW_v1_DRAFT.md` in full — every one of its six work packages — following the SOW's design as revised after Sol's independent architecture review. Two Control Rooms (`plant1`, `plant-2`) now run as fully independent simulations in one process, selectable by a browser via a pre-boot picker at `/` and a `/rooms/:id` URL. This entry records the implementation; the SOW document itself records the design rationale and is not repeated here.
- **Not deployed.** The real running server (still the pre-Control-Rooms build) was never touched, restarted, or migrated. Deployment — which means running CR-WP1's one-time migration against the real accumulated `backend/data/live-simulation.json` — is a deliberate separate step requiring explicit approval, not bundled into this implementation pass. See `handover.md` for the exact outstanding steps.
- Scheduler correction (Sol's Required 1, implemented as designed): `live-runtime.mjs`'s `startLoop`/interval body was extracted into a standalone `runScheduledTick()` closure function, unchanged in behavior, callable directly. The Control Room manager (`control-room-manager.mjs`) owns exactly one process-level `setInterval` that dispatches every READY room's `runScheduledTick()` **concurrently** each cycle — confirmed via a dedicated hermetic test that a slow/hung tick in one room does not delay another room's tick from starting (`wp23`), and that a thrown error in one room's tick does not prevent another room's tick from completing.
- Migration conflict handling (Sol's Required 3, implemented as designed): `control-room-migration.mjs`'s `migrateLegacyControlRoomData` resolves each legacy file to exactly one of four states (absent/absent, present/absent, absent/present, present/present) per Control_Rooms_SOW_v1_DRAFT.md §4.3's table. The fourth state (`CONFLICT`) is never resolved by preference — both files are left untouched and the room boots `FAILED` with an explicit reason, matching this codebase's existing "ambiguous provenance must not be silently repaired" principle.
- Room health (Sol's Required 4, implemented as designed): the manager tracks `READY`/`FAILED` health independent of a room's own `RUNNING`/`PAUSED` clock state. A migration conflict, a corrupted state file, or any other per-room startup failure leaves that one room `FAILED` while every other room continues booting and serving normally — verified with both conditions independently (`wp24`).
- A defect found during implementation, beyond what the SOW anticipated: the manager's original condition for "does this room need the fresh LIVE+PAUSED default" checked `descriptor.id !== "plant1"` — i.e. it assumed plant1 always has real migrated data. On a genuinely fresh install with nothing to migrate at all (a new dev environment, or the very first boot with no legacy file anywhere), plant1 is exactly as freshly-seeded as plant-2 and was being silently exempted from the default by virtue of its id alone. Currently masked in practice because `createLiveSeed()` already defaults to `PAUSED`, so this was a latent correctness issue rather than an observed behavioral bug — fixed to check whether migration actually moved or found real data (`hasMigratedData`), not the room's literal id, and documented as such in the regression test rather than overclaiming a caught live bug.
- Frontend: `roomApi()`/`globalApi()` implemented exactly as Sol recommended (Sol's refinement #4) rather than a single auto-prefixing helper with an opt-out list — every one of the ~16 network call sites in `app.js` now states its own scoping intent. `perform()`'s convention changed from full `/api/...` URLs to room-relative tail paths (e.g. `/reset`, `/simulation/pause`), since every one of its call sites was already exclusively a room-scoped mutation.
- Test-harness consequence not anticipated by the SOW: the existing Playwright config relied on `COMPASS_LIVE_STATE_PATH` to keep the hermetic e2e suite off real `backend/data/`; the manager has no equivalent by design (the SOW explicitly defers a *production* configurable data root). Added a narrowly-scoped `COMPASS_CONTROL_ROOMS_DATA_ROOT` env var, read only in `server.mjs`'s boot block, mirroring the exact precedent `COMPASS_LIVE_STATE_PATH` already set — this is test/ops isolation, not the admin-facing relocation feature the SOW deferred. Every existing e2e spec's `page.goto("/")` was updated to `page.goto("/rooms/plant1")`, since `/` now shows the picker rather than a control room by design; no spec's actual assertions changed.
- Verification: `npm test` passes 204/204 (181 prior + 23 new across `wp22` migration, `wp23` manager/concurrency, `wp24` health/failure-isolation, plus incidental fixes to pre-existing tests whose literal endpoint-string assertions changed with the new room-relative URL convention). `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passes 27/27 (20 prior + 7 new in `control-rooms.spec.mjs`) against an isolated `/tmp/compass-playwright-control-rooms` data root, run twice — once as a standalone file (which surfaced a real test-isolation gap: a prior test can leave a room in Offline mode, hiding the Live-only Reset button and hanging a click — fixed by resetting via direct API call rather than the UI) and once as the complete suite in its normal ordering. A separate manual smoke pass against a fully isolated scratch copy of the repository (never touching real `backend/data/`) confirmed the picker, direct-URL room boot, and — the property this whole feature exists to deliver — that resuming Plant #1's clock in one browser context is invisible to a second, simultaneous browser context viewing Plant #2.

## 2026-09-08 — Control Rooms compliance and hermetic-root hardening

- Decision: Rename the existing operational tab to **Live Floor**, reserving “Control Room” for the top-level independently selected instance. Keep stable DOM/API identifiers and generic Control Room concepts unchanged.
- Logging: Every room-owned Live or Offline runtime receives a room-scoped logger that stamps the authoritative `controlRoomId` last. Room-scoped HTTP request lifecycle logs use that same façade; deployment-global settings and log endpoints remain unscoped.
- Test isolation: `COMPASS_CONTROL_ROOMS_DATA_ROOT` is accepted only when `NODE_ENV=test`; Playwright sets that explicitly. A production/non-test boot with the override fails before manager construction, preventing accidental redirection of persisted production state.
- Verification: 206/206 hermetic tests and 27/27 Chromium journeys pass with forced provider failures. No provider calls are made by either suite.

## 2026-09-08 — Scope constraint lifted: issue-priority and workforce logic now in scope

- Date: 2026-09-08
- Decision: `AGENTS.md` rule 2 ("Keep Compass focused on per-issue responder assignment; do not add global workforce optimization or issue-priority logic") is superseded by explicit user direction. Cross-issue queue/demand triage, issue-priority bands, and staffing/shift-continuity simulation are now in scope, motivated by `workforce_continuity_and_demand_simulation_SOW.md`. The rule is marked superseded in place in `AGENTS.md` rather than deleted, so its original text and the reason it no longer applies both remain visible to future readers — the same pattern already used for rule 8's demo-freeze supersession on 2026-09-05.
- Reason: The user reviewed feedback flagging that the proposed workforce SOW directly conflicted with rule 2, and responded that `AGENTS.md`'s constraint is obsolete and the project's scope should expand.
- **What is explicitly unaffected, for now.** Rules 3 (deterministic/agent boundary — application code owns facts, eligibility, metrics, and mutations; models may only rank supplied candidates or propose bounded events) and 4 (hidden `ResponderSkill` never leaves the simulation) were not part of what the user asked to lift. Asked directly whether "no longer constrained" also covers rules 3/4, the user's answer was **"let Sol decide"** — an explicit delegation, not a yes or a no. Until Sol makes and records that call, both rules remain fully binding: any new priority/staffing logic built under the expanded scope must still be application-owned and deterministic, and must not let hidden skill leak into it even indirectly (e.g., through a historical-evidence aggregate shaped by which specific responder produced a given data point — flagged as a real risk in the workforce SOW review).
- Scope: Documentation/governance only. No application code changed as part of this entry.

## 2026-09-08 — Workforce Continuity boundary decision

- Decision: Workforce continuity, bounded queue dispatch, shift coverage, and demand triage are in scope, while the deterministic/agent boundary and the hidden-`ResponderSkill` boundary remain binding without exception. Models may not prioritize issues, select overtime, determine staffing, change shifts, or mutate continuity state.
- Evidence boundary: priority and staffing may use only issue facts and responder-anonymized issue-class aggregates. They must not use responder-specific outcome history, hidden skill, or any aggregate shaped by a responder identity. Workforce provisioning uses a dedicated persisted `workforceProvisioningSeed`; it never consumes a live simulation RNG stream, and preserves the original six responders' hidden rows exactly.
- Initial policy: four six-person crews, 14-day 2-2-3 rotation anchored at 2026-08-31T08:00:00Z, 12-hour minimum rest, maximum 16-hour continuous duty, maximum eight active staff, and ten actionable issues. Demand beyond ten is a Demo-only deferred-demand ledger, not an operational issue.

## 2026-09-08 — WC-2 rotation and roster repair

- Decision: Correct the deployed wc-1 rotation defect with a versioned wc-2 migration. The 14-day 2-2-3 calendar now maps A/C to complementary day blocks and B/D to complementary night blocks, so exactly one six-person normal crew is active at every boundary.
- Migration: wc-1 active/off-duty work is converted into explicit `QUEUED_HANDOVER` records and pending work, rather than being silently retained on an unlawful off-duty responder. Original issue records, historical outcomes, responder IDs, hidden-skill rows, and live RNG streams are preserved. No migration consumes live RNG.
- Public roster: every public display name follows `EngrNNN`, `TechNNN`, or `OptrNNN`; legacy `OperNNN` displays are normalized to `OptrNNN`. Crew IDs remain internal simulation metadata and must not be represented as a public employee naming scheme.
- Scheduler catch-up: missed staffing reviews and handovers are claimed in chronological order with immutable persisted `effectiveAt` timestamps. A delayed tick therefore applies the 20:00 handover as 20:00, rather than incorrectly calculating outgoing/incoming crews from the later wall-clock simulation time.

## 2026-09-08 — WC-2 reconciliation corrected and deployed

- Context: Sol's wc-2 fix (`bfad4d3`) was verified with 218/218 unit and 28/28 e2e tests but never deployed before Sol ran out of credits mid-verification. Before deploying, two independent review agents were run in sequence (each reviewing the current commit against real, read-only copies of production Plant #1/#2 data, not just the test suite), per the user's explicit instruction to delegate review before proceeding to migration/deployment.
- Finding 1 (first review, fixed in `365253c`): `reconcileWorkforceDuty`'s per-assignment release loop unconditionally set `issue.status = "PENDING"` whenever any active assignment was released, even when a second active assignment (a lawful SUPPORT) remained on the same issue — violating the "exactly one PRIMARY per active roster" and "issue cache agrees with roster" invariants in `live-schema.mjs`. Reproduced directly against a read-only copy of Plant #1's real `ISS-163` (PRIMARY on an off-duty crew, SUPPORT on the on-duty crew). Broader root cause found while fixing: releasing an issue's *entire* roster also violated a second invariant — a `RELEASED` assignment whose attempt has gone terminal requires a matching `resolutionHistory` record, which this code path never created (unlike `resolution-engine.mjs`'s only other precedent for terminating an attempt). Since an attempt may only leave `ACTIVE` by drawing a genuine resolution outcome, `reconcileWorkforceDuty` must never fabricate one — fixed with a three-case per-issue reconciliation: promote a surviving lawful SUPPORT to PRIMARY when one exists; auto-transfer the whole issue to a free lawful on-duty responder when no roster member survives but a replacement is available; otherwise defer the roster untouched (audited as `HANDOVER_DEFERRED_NO_REPLACEMENT`) rather than crash, drop work, or invent an outcome.
- Finding 2 (second review, fixed in `ed49a98`): the dispatch-offer cancellation loop (present since `bfad4d3`, untouched by the first fix) also force-set `issue.status = "PENDING"` for a cancelled off-duty `ASSISTANCE` offer, even though an `ASSISTANCE` offer only exists on an issue that is already `ASSIGNED` with an active PRIMARY still working it. This wouldn't trigger on the one-time migration (neither production file had a pending offer), but would surface live at any future `SHIFT_HANDOVER_DUE` boundary landing while an assistance offer was pending to a responder rotating off duty — reintroducing the same "crew stuck" failure class through an unreviewed path. Fixed by only resetting `issue.status` for unstaffed `INITIAL_ASSIGNMENT` offers; an `ASSISTANCE` offer's cancellation now resets the attempt's `assistance` state to `NONE` and leaves the issue and its active PRIMARY untouched.
- Both fixes were verified against read-only copies of the real Plant #1 (63 issues, including three genuine PRIMARY+SUPPORT pairs) and Plant #2 production state files before deployment, confirmed byte-unchanged on disk (sha256) after each check, and confirmed to migrate cleanly to exactly six active, single-crew staff with zero fabricated history or deferrals.
- Deployment (2026-09-08, following the two-review gate the user asked for): checksum-verified pre-migration backups taken for both rooms (`live-simulation.pre-wc2-20260908T2214Z.json`, sha256-matched to the live files). Stopped the confirmed sole listener on port 3000 (PID `700289`, cwd `/home/makodev58/compass`) with `SIGTERM`; exited cleanly. Restarted from the repository root (`nohup npm run dev`); serving PID is now `853672`. The boot-time migration ran automatically: Plant #1 `48599 → 48600` (the single `reconcileStartup` write), Plant #2 `3 → 4`, both still `PAUSED` exactly as persisted, both `63`/`2` issues preserved. `GET /api/control-rooms` reports both rooms `READY`/`LIVE`/`PAUSED`; both rooms' active staff is now exactly six, single crew (Plant #1 crew B, Plant #2 crew A), workforce version `wc-2`. Zero responders with a non-`EngrNNN`/`TechNNN`/`OptrNNN` public name. A string scan of both rooms' public state confirmed no `responderSkills`/`trueSuccessProbability`/`trueMedianMinutes` leakage. No `server_start_failed`, `ENOENT`, or error lines in the fresh server's log; the port-3000 listener stayed single across three consecutive probes.

## 2026-09-09 — On-shift personnel presentation and bidirectional map labels

- Decision: The Control Room presents only personnel who are currently on duty (`AVAILABLE`, `OFFERED`, or `ASSIGNED`) in the renamed **Shift Personnel** panel and on the Manufacturing Floor. Off-shift (`UNAVAILABLE`) personnel remain available for inspection in a collapsed `Off shift` disclosure below the current shift, but are not rendered as if physically present on the floor.
- Label placement: Projected 2.5D labels now search collision-free vertical lanes both above and below the anchor. The placement prefers the nearest valid lane and only scans the remaining Y axis when a dense stack exhausts those lanes. Leader lines originate from the correct edge for above- versus below-anchor labels.
- Scope: Presentation only. No responder availability, roster, shift, simulation, assignment, or hidden-truth data changed.

## 2026-09-09 — Event-snapshot responder locations

- Decision: Responder positions are canonical, event-snapshotted operational state. Assignment, assistance, transfer, release, resolution, handover replacement, and startup reconciliation each move personnel once; there is no fabricated continuous or per-second tracking.
- Behavior: An active responder is placed at a deterministic offset beside their assigned equipment. A responder returning from work moves to their persisted duty station. Every actual position change appends a public `RESPONDER_MOVED` operational event with the previous and new coordinates plus the transition reason. This is deterministic and does not consume simulation RNG or inspect hidden skills.

## 2026-09-09 — Resolution-history contributors are lifetime, not roster, membership

- Decision: A resolution-history entry must retain every unique responder who contributed during an attempt, with no artificial maximum. The maximum of two responders remains enforced only for simultaneous active rosters.
- Reason: A legal handover can replace one active responder before completion; that produces three or more sequential contributors without ever exceeding the active-roster cap. Rejecting that persisted outcome makes an otherwise valid Control Room unavailable at boot.

## 2026-09-09 — Station Status and station-level observed metrics

- Decision: The right-side operational panel is **Station Status**, not Selected Issue. Selecting a healthy station presents its public, application-derived uptime, MTBF, and observed issue count; selecting a station with active work presents the established issue/dispatch view for the oldest active issue at that station (timestamp, then id).
- Safety: `stationMetrics` is derived server-side from public equipment, issue, event, and simulation-clock facts only. It does not read responder identity outcomes, resolution internals, or `ResponderSkill`.
- Navigation: Shift Personnel and Stations share tabs. Stations with active issues are listed first; healthy stations remain collapsed. Personnel selection focuses the map but deliberately leaves Station Status on its last station/issue selection.

## 2026-09-09 — Docker runtime and shared persistence root

- Decision: Containerize Compass as a single Node 22 Bookworm Slim runtime with a named Docker volume at `/app/data`. `COMPASS_DATA_DIR` is now the one production persistence root; its local default remains `backend/data/`. The root covers room state, offline audit records, room metadata, provider settings, and deployment-global application events. This removes the prior split where some deployment-global files ignored room-root relocation.
- Safety: `COMPASS_CONTROL_ROOMS_DATA_ROOT` remains a test-only isolation seam and is rejected outside `NODE_ENV=test`; it is not an operational data-relocation control. The image excludes `.env` and all local runtime data, runs as the built-in non-root `node` user, and Compose uses read-only root storage, `/tmp` tmpfs, no-new-privileges, and dropped capabilities.
- Migration: Compose deliberately creates an empty named volume. Operators must take a verified backup and manually copy an entire stopped deployment's data directory into an empty volume before first start when preserving state. No startup copy or nonempty-volume merge is automated because it could overwrite state or defeat the existing conflict-safe legacy migration.

## 2026-09-10 — Shift-first analytics cadence

- Decision: Analytics defaults to the latest twelve UTC 12-hour shifts (08:00–20:00 and 20:00–08:00), with Daily (08:00 boundary), Weekly (Monday 08:00), and Monthly (first day 08:00) roll-ups. Periods are half-open `[start, end)` and current periods are visibly `PARTIAL` rather than silently treated as complete history.
- Evidence: lifecycle and staffing actions are counted from persisted simulation timestamps. Backlog is reconstructed at period boundaries; downtime is the union of observed issue intervals per station so overlapping issue records do not inflate it. The 15-minute view is a bounded selected-period drill-down, not the default chart.
- Safety: period API requests are room-scoped and bounded to canonical, non-future starts. The projection consumes public operational data only and does not expose hidden responder skill or request a provider.

## 2026-09-11 — Deployment-wide write-only provider credentials

- Decision: API Settings may save a separate credential for each supported LLM provider. Credentials are deployment-wide, never control-room-specific, and are only appropriate for an authorized shared-provider administrator.
- Storage and exposure: saved credentials are persisted separately from model settings in an owner-only (`0600`) data file. API responses, logs, and the browser never receive the raw value; the UI receives only configured status, source, and a masked ending. Environment credentials remain valid bootstrap/fallback credentials; a saved key overrides its provider's environment key until removed.
- Scope: this changes provider configuration only. It does not change the deterministic application boundary, candidate eligibility, simulation outcome generation, or Compass's bounded role.

## 2026-10-16 — AMD Token Factory is the only model provider

- Decision: Remove the OpenAI, OpenRouter, and self-hosted GPT-OSS providers. AMD Radeon Cloud Token Factory is the only provider and the default, as the AMD hackathon requires. Configuration moves to `AMD_TOKEN_FACTORY_*` variables; the key may also be read from a file (`AMD_TOKEN_FACTORY_API_KEY_FILE`) so it never sits in `.env`.
- Output mode: requests use `response_format: json_object` with the output schema in the system message, instead of strict `json_schema`, which the shared endpoint rejects for DeepSeek-V4-Flash. Application-side validation (`validateAgentResult`, `validateEventProposal`) was already the authoritative contract and is unchanged, so this weakens no guardrail.
- Default model deviation: the integration guide suggests DeepSeek-V4-Flash. Measured on Compass's own candidate packet, it failed validation 3/3 (responder IDs and numbers in prose, one invented responder ID), while MiMo-V2.6-Flash with reasoning `none` passed 4/4 in 21–30s. MiMo-V2.6-Flash / `none` is therefore the default. The sample is small; re-measure before a demo.
- Timeouts: AMD output runs at roughly 25 tokens/s, so a ranking takes 20–40s. Defaults are raised to 60s (agent) and 30s (planner), instead of the guide's suggested 15s, which would discard nearly every valid reply.
- Compatibility: a persisted settings file naming a removed provider loads as AMD with the default model; old pins and saved credentials for removed providers are dropped, never sent to AMD. Historical recommendation records keep their original `provider` field.
- Not yet built: local rate limiting, bounded 429 retry with `Retry-After`, and a circuit breaker (guide §9).

## 2026-10-16 — Engineering print redesign and ResponseCompass product name

- Decision: The frontend adopts the "Engineering print" look (specified in `docs/design/engineering-print.md`): ink-on-paper tokens, hairline rules, ruled tables and cells instead of rounded cards, and accent colour reserved for what needs attention. The stylesheet is split per area (`tokens.css`, `base.css`, `floor.css`, `panel.css`, `ops.css`, `analytics.css`, `layout.css`, linked in that order with `layout.css` last). The product is renamed **ResponseCompass**.
- Why: a single 2,000-line-class stylesheet made a coordinated restyle impractical across agents; per-area files let owners work in parallel without conflicts, and design tokens keep colour and type in one place. The name ResponseCompass distinguishes the application from the recommendation agent that was previously also called "Compass".
- What stays "Compass": the recommendation agent (Compass ranks eligible candidates, Compass recommendation, Compass vs baselines, `agent.mjs`), plus all identifiers and paths: `COMPASS_*` env vars, the `/compass/recommend` route, the `compass-data` Docker volume, file names such as `Compass_*.md`, and code identifiers. Dated historical entries in docs are not rewritten.
- Scope: presentation and naming only. The deterministic/agent boundary, hidden `ResponderSkill` handling, and all API contracts are unchanged.

## 2026-10-16 — Separate paper-facing text inks from status marks

Darkened tertiary and muted text tokens, reused accent ink for brand/alert text, and
added warning/green text inks. Every paper-facing text token now meets the normal-text
AA threshold (4.5:1) on paper, raised paper and sunk paper; the original warning,
green and orange colours remain for dots, map outlines, rules and fills. Green also
needed an ink variant because its original colour measured 4.27:1 on sunk paper.
A hermetic CSS-token contrast test guards this boundary. Analytics charts use full-width
desktop rows so seven Day bars fit at 1280px, retain dates without line breaks, and wrap
completeness labels only between words; long narrow-screen series scroll locally.

## 2026-10-16 — Dockview for the desktop Live Floor tiling grid

Use the MIT-licensed `dockview-core@8.3.1`, pinned exactly, for shared desktop tiling
rather than implementing a docking engine. Vendor its browser ESM as `.js`, its MIT
licence and the exact CSS string extracted from the UMD build using `npm run vendor`;
this fits the existing plain-module server without a bundler, MIME changes or CDN.
Only `frontend/tiling.js` imports the library. Its tile chrome uses shared CSS tokens.

Adopt the original map, issues, event-feed and context DOM regions, preserving all
application references and handlers. Keep one panel per group; disable floating,
pop-outs and centre merges. Users resize adjoining tiles, drag to edges and maximise
or restore; arrow-key splitters use the same constrained library resize path. Below
901px restore the original nodes and stacked layout. Per-browser persistence validates
version, size, known components and grid membership before deserialisation; application
constraints replace stored values. Corrupt or infeasible layouts fall back to the default.
Ignore zero-size hidden-workspace resize events so non-floor tabs cannot damage saved
proportions; remeasure the map's projected labels when its tile changes size.

## 2026-10-16 — Modern light theme with locally served variable fonts

Replace Engineering print with white/cool-grey surfaces, an indigo selection/action
accent, soft borders, restrained elevation, 6–10px corners and segmented controls.
Keep `--paper*` / `--ink*` token names so layout and Dockview continue to consume the
same theme interface. Status colours retain distinct meanings; their text variants
meet AA across all light surfaces. White inverse button text is checked against its
actual accent backgrounds, with the normal-text 4.5:1 threshold unchanged.

Use pinned Fontsource Inter Variable and JetBrains Mono Variable 5.3.0 under SIL OFL 1.1.
Vendor only Latin variable-weight normal/italic WOFF2 faces, CSS and licences through
`scripts/vendor/fonts.mjs`, loaded by tokens.css from our own server. The existing
`.woff2` MIME support and vendor runner are retained. No CDN, external font request,
app identifiers, ARIA changes or simulation behavior changes are introduced.
The Engineering print spec remains as a superseded historical reference. Codex completed
Gemini's WIP at the user's explicit request, resolving its unfinished master merge first.

## 2026-10-17 — Allow supplied candidate names in Compass prose

- Decision: `validateAgentResult` now removes the supplied candidates' own `responderId`
  and `displayName` (whole-word, case-insensitive) before its no-digits check, and the
  system instruction lets the model name candidates that way. Every other digit, and any
  ID that was not in the candidate packet, is still rejected.
- Reason: User decision. The live measurement of 2026-10-16 showed most ranking rejections
  came from models naming candidates such as `Engr028`, which carry digits. Those names are
  already in the packet and on screen, so they leak no numeric evidence and nothing about
  `ResponderSkill`. This replaces the 2026-09 rule that forbade IDs and display codes in prose.
- Impact: Fewer live rankings fall back for a harmless reason. Rules 3 and 4 are unchanged:
  numbers in prose (distances, counts, rates) are still rejected.

## 2026-10-17 — One ranking repair within the original deadline

- Harden the ranking prompt with explicit bans on copying counts, rates, distances and
  minutes into prose, qualitative alternatives and a short compliant example. The supplied
  candidate-name exception and all validators remain unchanged.
- On a parsed live ranking's validation failure, allow exactly one replacement through
  `callLiveModel` → `callChatCompletion`, preserving the provider controls shared with the
  planner. Send the authoritative packet and the first eight validator errors, each capped
  at 256 characters; omit rejected output so repair input cannot grow with malformed prose.
- Use one monotonic deadline for the complete ranking operation. Skip repair below one
  second remaining (a conservative minimum useful request window); pass only remaining time
  to the replacement and reject even valid late responses. A second rejection remains
  `validation-failed`, without turning validation into a provider service error. No repair
  for provider errors, fixture mode or forced-failure mode.
- Hermetic fake-fetch/clock/timer tests cover repair success, continued numeric leakage,
  candidate validation failure, feedback bounds, insufficient time, and shared-deadline
  abort. Main-agent live re-measurement remains necessary to quantify validity improvement.

## 2026-10-17 — AMD provider controls: limiter, 429 retry, circuit breaker

- Decision: Add `backend/src/provider-controls.mjs` and run every `callChatCompletion` under
  it: 10 RPM / 2 concurrent / 32 queued by default, HTTP 429 retried up to 2 times honouring
  `Retry-After` within the caller's deadline, and a breaker that opens after 5 consecutive
  service failures for 60s, then allows one probe. All five budgets are env-configurable.
  Controls are scoped per transport, so the real `fetch` shares one process-wide set and
  test transports are isolated.
- Deviation from the handover brief: the brief also asked for bounded backoff retries of
  502/503/network errors. The integration guide (§9) says to retry only 429 for the initial
  integration and to fail over promptly on 502/503 and network errors. Per `AGENTS.md`
  rule 1 the guide wins; the 2026-10-16 outages also showed that retrying a down service
  only delays the fallback. Revisit only if AMD's guidance changes.
- Impact: Compass stays within a cautious share of the shared team quota, handles AMD's
  "concurrency limit" 429s instead of failing at once, and stops calling a failing service
  for a minute at a time. Callers and their validation/fallback contract are unchanged.

## 2026-10-17 — Compass agent timeout raised from 60s to 90s

- Decision: `COMPASS_AGENT_TIMEOUT_MS` defaults to 90000 (code, `.env.example`, local `.env`).
  The event planner stays at 30s.
- Reason: User decision after the 10-sample measurement: MiMo-V2.6-Flash rankings took
  24–60s (median 42s, some including the one repair attempt), and every remaining ranking
  failure was a timeout rather than an invalid answer.
- Impact: More live recommendations complete. When AMD is slow or down, the deterministic
  fallback appears up to 30s later than before; the circuit breaker still fails fast after
  repeated service failures.

## 2026-10-17 — Independent AMD model selection per role

- Store `compass` and `event-planner` model/effort selections separately. Both default to
  MiMo-V2.6-Flash with reasoning `none`, retaining the measured default behavior.
  Planner-only environment overrides supplement the shared seeds on fresh installs.
- Load an old single-model file into both roles without writing it; migrate the shape
  only when an operator saves. Queue model saves and publish in-memory selections only
  after atomic persistence succeeds. Leave the owner-only credential file untouched.
- Snapshots expose both roles and their validation status; legacy top-level model fields
  remain aliases for ranking. An omitted API role retains the ranking default; unknown
  roles are rejected. Confirmed missing models fall back only for their own role and log
  `provider_saved_model_missing` with that role. All provider calls continue through the
  existing callers and shared provider controls.
- Settings has two labelled, independently saved pickers and keeps the other role's draft
  through saves and catalog refreshes. Hermetic tests cover migration, role persistence,
  validation, fallback, env seeds and mocked UI interactions at phone/desktop widths.

## 2026-10-17 — Generate portable history through the offline Live engine

- Add `npm run generate:history` and `createLiveRuntime.advanceSimulation(elapsed)`.
  The latter factors out the existing scheduler → deferred work → autonomous dispatch
  cycle without constructing a UI projection; ordinary ticks still return the same
  public result, and the production disk store/retention behavior is unchanged.
- Run generation in an isolated worker with both model roles in forced-failure mode,
  guarded fetch/credential reads and deterministic audit timestamps. Use a single-writer
  in-memory adapter, validate on input/daily/output boundaries, and atomically commit only
  a valid final file. A normal-store equivalence test covers the adapter; a short
  committed-seed test checks byte identity, migration and privacy. Global Date/fetch are
  replaced only in the worker, preserving application/test-runner globals.
- Advance the plant-1 seed through 6 October 08:00 UTC to retain four complete operational
  weeks as well as September. The existing chart windows include the current partial
  period, hence show six complete days / three complete weeks / one complete month.
  No fabricated records, forced resolutions, pruning, retention or chart-limit changes.
- Cold normal-manager startup measured 1.82s, period HTTP responses 118–226ms, full
  analytics 363–499ms, final benchmark RSS 252 MiB. The fallback simulation reaches the
  ten-issue cap. Measurements, exact reproduction and seed SHA-256 are in
  `docs/demo-history.md`; further performance/retention or demand-policy decisions stay
  with the main agent. No running data, plant-2 seed or room metadata was changed.

## 2026-10-17 — Resolution due times round up; a short due event replans (main agent)

- **Defect:** `replanAttempt` computed `resolutionDueAt` from fractional milliseconds and
  `toISOString()` truncated it, so the due event could fire up to 1 ms before the work
  finished. `finalizeResolutionAttemptState` then closed the segment, returned
  `NOT_COMPLETE` and scheduled nothing, so the attempt stalled until the next roster change
  (often a shift handover ~12h later). Real-time ticks usually overshoot the due time, which
  hid it; the offline history generator steps exactly to due times and hit it on most
  attempts after week one (median time to resolve 0.3h → 23h, demand held at the
  ten-actionable-issue cap).
- **Fix:** due times round up to the next millisecond, and a `NOT_COMPLETE` finalize replans
  the attempt (new open segment, new due token) instead of leaving it without one.
  Regression test in `wp16-two-responder-attempts.test.mjs`.
- **Seed:** the month-long plant-1 seed from the same day was built on the defect, so
  plant-1 is restored to the original week. Regenerated with the fix, the month holds
  3,531 issues (~750/week, median resolve 0.2h) in 74 MB; cold room load ~21s, `/state`
  ~4.5s (6.5 MB), analytics 1.1–2.3s. A month-long demo seed needs history retention
  first; that decision is open with the user.

## 2026-10-17 — Archive closed Live detail before committing retention

Closed RESOLVED issue detail older than seven simulated days now moves into per-room,
resolution-day JSON files under a reset epoch. Only rows without active/pending engine,
scheduler or workforce references qualify. Synced immutable/idempotent archive additions
precede the synced atomic live-file replacement; retry after an interrupted commit cannot
lose or duplicate evidence. Missing indexed day files fail startup. Reset preserves earlier
epochs. Bootstrap stages seed and archive together, leaving existing roots untouched.

Keep exact resolution observations canonical, plus compact issue/lifecycle/disagreement
facts in original reduction order. Preserve ID floors, original length-based tokens,
recurrence inputs, duplicate tokens and recent context so pruning cannot change engine
choices. Multi-day archived/unarchived equivalence and repeated-output tests cover these
invariants. Public state selects bounded operational rows before cloning; station history
uses summary pagination and the existing redacted audit for archived detail. Analytics
never reads archive files. Cache numeric timeline bounds and avoid full-state clones for
pure queued analytics projections to reduce month-scale request cost.

Regenerated plant-1 reaches 6 October with 3,531 issues, 2,789 archived and a 16.8 MB live
file; plant-2 and metadata stay unchanged. Detailed reader inventory, recovery contract,
growth limits and tests: `docs/history-retention.md`. Reproduction and measured performance:
`docs/demo-history.md`. Cold plant-1 is 1.47s, but full fresh-root two-room manager boot
is 2.39s and one first HTTP DAY request was 317ms; these target misses are disclosed for
main-agent review. Exact observations, compact indexes/facts, workforce history and
unowned events remain growing canonical evidence, not a constant-space guarantee.

## 2026-10-17 — UI speed menu capped at 5× (main agent, user request)

- A live AMD ranking takes about 40–90s of real time (median 42s measured; 90s limit). At
  5× that is 3.5–7.5 simulated minutes, acceptable next to a ~12-minute median fix; at 10×
  it equals the fix itself, and at 60× it is 40–90 simulated minutes. Throughput (10 RPM, 2
  concurrent) is not the limit until about 20×.
- The UI offers 1× and 5×. The API, schema and clock still accept 10× and 60× (offline
  history generation and the soak evaluation use them). A room already faster shows its
  speed as a disabled "above recommended" option until lowered.
- The live tick then awaited model calls, so the clock stopped while a ranking or event
  plan was in flight and jumped ahead afterwards. Fixed the same day (next entry).

## 2026-10-17 — Model calls no longer hold the live clock (main agent)

- **Defect:** `runScheduledTick` awaited the scheduler's handlers and the dispatch pass,
  which await the event planner and Compass. With AMD taking 40–90s (all three rankings
  timed out at 90s on 2026-10-17), the clock froze for each call and then jumped ahead by
  the whole wait, contradicting the documented "a slow provider never blocks a tick".
- **Fix:** model-bound work started by the real-time loop runs in one serialized agent lane;
  the tick returns at once. `AsyncLocalStorage` marks the loop context, so API actions,
  tests and offline generation keep running the work inline in the original order (the
  committed month seed stays reproducible). Serializing the lane keeps one model call in
  flight per room, as before; the dispatch pass is deduplicated.
- **Accepted trade-off:** event plans queued in the lane are in memory; a restart skips them
  rather than duplicating them (token checks still apply).
- Regression test in `wp10-live-runtime.test.mjs`: the loop advances time while a planner
  call is pending, and the event persists once it completes.

## 2026-10-17 — Applied fixes are measurable; latent diagnosis stays private

Round 8 extends the bounded-ranking role to public catalog fixes. Code creates latent
fault causes with a dedicated seeded stream and equipment-dependent priors, then exposes
only an overlapping symptom. Engine-only cause/fix effectiveness multiplies the existing
team success probability (clamped at the team cap) and scales duration. Roster changes do
not re-roll causes, applied fixes or outcomes. Failed work takes the next untried ranked
procedure; exhausting the catalog restarts the sequence. Six domain-neutral procedures
per class have code-owned titles/steps. Legacy attempts retain their original mechanics
and actions; new attempts record the applied catalog fix as actionTaken. The planner's
free text remains an incident note for compatibility.

This fits AGENTS rules 3 and 4: application code owns truth, eligibility, observed evidence,
metrics and every mutation. The Compass ranking role can only rank supplied fix IDs and
explain observed tradeoffs. It never receives a diagnosis, effectiveness or responder
skill. Private causes live outside issues/audit bundles and the fault guard is invoked by
the existing public-boundary guard. Hidden response parameters are never model evidence.
Catalog and output validation reject invented procedures; fallback uses smoothed observed
same-symptom success, count and catalog order. Baseline is the class's most frequent fix.

Fix work is initiated from the live agent lane, with at most one tracked fix provider wait
per room; that wait yields the lane so it cannot hold responder dispatch or the clock.
Both tasks share unchanged provider rate/concurrency controls. Work beginning before the
model reply uses and records fallback; late replies cannot rewrite applied work. Request
identity prevents reset races and completed issues cancel late rankings. Offline uses a
stored fixture through shared evidence and attempt math, with no API access.

First-time fix rate uses completed first attempts, excluding legacy actions, with explicit
denominators and thin-sample suppression. Recommended/baseline agreement compares choices,
not causal effectiveness. Exact fix observations and compact recommendation facts survive
retention without archive reads on analytics requests. Weekly month-seed results will be
reported as produced; no monotonic-improvement tuning or claims are assumed.

## 2026-10-18 — Package the expanded month losslessly without trimming evidence

The fix-enabled month restores to 26,996,348 bytes, exceeding the 20 MB committed-file
limit. Keep every canonical observation and audit detail; package it as a small JSON
manifest plus a 1,753,758-byte deterministic gzip payload, with uncompressed byte count and
SHA-256 checked by `demo-seed-reader.mjs`. Bootstrap and generation accept both ordinary
JSON and this format. Daily archive JSON files remain below 3.3 MB. Runtime persistence
is still ordinary JSON; compression does not fix its size, cold-load time or memory use.
Operators must materialize the manifest before manual installation and back up the room.

Generated first-time fix rates by complete week were 67.1%, 74.9%, 76.5%, 75.6%: not a
monotonic improvement or a causal model-versus-baseline result. No outcome was rewritten.
New fix requests are gated on RUNNING; their read-only selector avoids full history clones.
Existing running attempts retain legacy actions and are labelled separately in the UI.


## 2026-10-18 — Bounded overtime ranking and central-command approval (round 9)

- Supersedes the overtime-only portion of **2026-09-08 — Workforce Continuity boundary
  decision** ("Models may not … select overtime") and its ban on responder-specific
  observed evidence for overtime. Explicit round 9 product direction permits Compass to
  rank code-built lawful options using observed class/symptom experience. Priority and
  lawful eligibility remain deterministic; `workforce-continuity.mjs` still reads no
  resolution history. Rules 3 and 4 remain binding without exception.
- Code enumerates every lawful extension/call-in, enforces rest/duty/staff/surge caps,
  computes evidence, fallback (extension, observed class coverage, ID) and original-rule
  comparator, and performs all mutations. Compass only ranks supplied IDs through the
  existing ranking role/provider controls. No hidden skill, fault causes, HR or pay fields.
- Default room policy is OPERATOR. Central command approves top/alternative or rejects;
  unanswered work expires after thirty simulated minutes, capped at handover. An explicit
  audited AUTO_APPROVE_TOP policy may apply the top option at deadline. Every application
  revalidates current legality; model completion cannot rewrite an existing decision.
  Delayed reviews assess current facts rather than retroactively authorizing overtime.
- Deadline claim/dispatch state survives restart. Recommendation revision conflicts and
  private inference UUIDs guard concurrent actions and reset races. Ordinary arrivals and
  releases now request coalesced rechecks; previously only recurrence/expiry requested them.
- Full closed recommendation packets retain thirty records; compact outcome/comparison
  facts remain canonical for exact lifetime analytics. Public state returns five recent
  decisions plus open work. The month generator explicitly uses AUTO_APPROVE_TOP; its
  optional, documented synthetic command-center examples use the same canonical actions
  and briefly select OPERATOR to demonstrate expiry, then restore auto policy. They are
  simulated operator examples, not live human or AMD outcome evidence.

- Deadline starvation correction: a replacement recommendation inherits the earlier of
  the open deadline and its own deadline. No-action reviews do not silently cancel an
  unanswered recommendation; expiry still records a terminal fact, and unmet risk is
  recorded only if the shortfall persists. This keeps a continuous staffing review from
  postponing operator response indefinitely. The optional seed examples sustain a bounded
  synthetic backlog via the real Force Event action until all four paths are observed;
  all issues, attempts and outcomes still come from the normal guarded engines.

## 2026-10-18 — Journal mutations instead of rewriting the room file (round 10)

- Context: with the month seed (30 MB state) every mutation deep-cloned the state, fully
  validated it and rewrote and fsynced the whole file; the clock mutates every second, so
  operator actions queued for seconds (speed change 5.5 s, Trigger Next Event 17–28 s on
  3200), and every `store.snapshot()` cloned 30 MB again.
- Decision: copy-on-write drafts that record changed paths; validation of changed rows
  only (full validation stays for load, migration and tests); an fsynced, checksummed
  append-only journal of those paths with periodic checkpoints; published state deeply
  frozen and returned by `snapshot()` without cloning.
- Crash safety is unchanged in substance: a mutation is acknowledged only after its frame
  is fsynced; a torn tail is trimmed; a corrupt complete frame fails closed; a crash
  between checkpoint and journal truncation replays nothing twice (sequence numbers).
- Measured on this host (scripts/benchmark-live-store.mjs, month seed, 5×, forced
  providers, 8 samples): `/state` p95 1.16 s → 0.18 s; speed change 1.50 s → 0.27 s;
  `/analytics` 1.57 s → 0.61 s; Pareto 1.25 s → 0.34 s; scheduler-tick mutation p95
  0.43 s → 0.18 s (target 50 ms not met); forced-mode Trigger Next Event 3.6 s → 0.98 s
  (it runs the planner and dispatch inline in forced mode; with a live provider the
  request returns after the 31 ms claim). Remaining tick cost is draft proxy reads,
  validation and the public projection.
- Operations: back up or copy a room as a whole directory; the checkpoint alone is not
  the current state.


## 2026-10-19 — Nebius entry: ownership, licence and baseline (user)

- The user owns ResponseCompass and shares it for use at their company under
  **Apache-2.0**; `LICENSE` added (copyright e8aura-makodev58) and `package.json` declares it.
  This settles the plan §6 ownership risk; it does not change rule 8.
- AMD hackathon exclusivity is not a concern (user). We still disclose the AMD-era work as the
  pre-existing project and claim only commits after the baseline `1e1c69c`
  (`docs/BASELINE_AND_CHANGES.md`).
- The Nebius API key arrives later. Until then provider work is built against the
  OpenAI-compatible API with hermetic fake-fetch tests, and model IDs are not guessed in code.

## 2026-10-19 — Investigator: models rank interpretations, they do not classify (plan v2, R1)

- Conflict: the hackathon guide (§4) gives "parse narrative symptoms and classify likely issue
  types" to Nemotron. Rule 3 keeps facts with application code.
- Decision: a field report stays an unresolved `FieldReport`. Code builds the allowed
  interpretation options (equipment × catalog class/symptom); the model only ranks those
  option ids; the operator confirms before code creates the issue with deterministic
  priority. For simulated issues the engine's observable facts stay authoritative and the
  investigator's classification is a recorded hypothesis only.
- Also from the review: one dispatch gate on every assignment path for investigated issues;
  explicit allowlisted DTOs (never spread state rows); public synthetic certifications seeded
  independently of `ResponderSkill`; hazard and injection screening are code-owned, not model
  roles. Rules 3 and 4 unchanged.

## 2026-10-19 — N1: Nebius default with AMD compatibility and explicit capabilities

Fresh settings select Nebius Token Factory; saved AMD selections and credentials remain
unchanged on load. AMD remains selectable. Nebius model IDs start blank, with per-role env
seeds and a single role-default table filled only after the main agent's N0 probes. A blank
or confirmed-missing Nebius model fails closed to deterministic fallback, never AMD's model.
Thinking/tool protocol mappings are per-model data, not inferred from model names.

A normalized chat-turn function supports validated native or JSON-protocol tool proposals;
the existing parsed-JSON helper retains its contract. Transport does not execute tools or
mutate operational state. Rules 3/4 remain unchanged: models rank bounded supplied options,
and no hidden truth enters this integration. Limiter, 429-only retries and breaker behavior
remain unchanged, isolated by provider and transport. Metadata is allowlisted and excludes
prompts, secrets and reasoning traces. The guide creates no additional authority exception.

## 2026-10-19 — N1 adopts completed N0 facts

Supersedes the temporary blank Nebius defaults above. N0 verified the Ultra investigator
(thinking on), Super Compass ranker (on), and Lightning planner/narrator (off); exact IDs
and probes are in `docs/nebius/05_TOKEN_FACTORY_FACTS.md`. All verified Nemotron entries
use native tools and `chat_template_kwargs.enable_thinking`, never an inferred reasoning
parameter. Defaults remain in one env-overridable role table; an explicit blank still
fails closed. Unverified replacement IDs omit thinking by default. No worker live calls.

## 2026-10-19 — N2 public investigation contracts and decision-time evidence

Investigation tools construct explicit public DTOs; state-row spreads and private outcome
weights are excluded. Host-bound cutoffs accept only strictly earlier completed evidence
and exclude the target issue. Current roster/geometry come from the host's decision
snapshot; replay must supply that snapshot rather than infer historical availability.
Compact issue facts plus retained observations supply stable CASE-<issueId> records
without archive I/O. Existing room/month-seed loads migrate public certifications and
symptom-only template narratives; historical seed artifacts need no rewrite.

Responder history exposes the existing packet's three observed count fields, without
hidden work/contribution weights. Equipment exposes issueClasses A/B/C and the count of
supplied cutoff-filtered cases (no unstated time window). Legacy/missing-procedure cases
remain searchable, with unknown first-time-fix and no fix-evidence contribution. Fix
safety metadata is authoritative public catalog data; certifications come from a separate
id-seeded RNG namespace independent of skill. N2 filters qualification only: approval,
prerequisite confirmation, hazard policy and the investigator loop remain N3a work.

Tool envelopes enforce ten total top-level rows and 8192 UTF-8 bytes, dropping whole rows
and flagging truncation. The later loop must treat truncation under its fallback policy;
it must never turn omitted case detail into evidence. Narrative text remains untrusted.
Offline history generation adds deterministic noisy reports inside the mutation before
retention, using the same hook for memory and durable stores and no model calls.

## 2026-10-19 — N3a investigator vertical slice and fail-closed dispatch

Operator narrative remains a FieldReport until the operator confirms a code-built
interpretation or a registry-valid manual triple. Code owns priority and confirmed public
symptoms; hidden fault sampling cannot overwrite the confirmed interpretation. A versioned
hazard/input policy runs before provider settings or inference. Hazards auto-escalate;
occupied/unidentified equipment escalates without creating a duplicate issue. Injection
spans are quoted untrusted data, including retrieved reports.

The bounded read-only investigator uses the investigator provider role, six tool steps,
eight calls including one final repair, one monotonic deadline and DTO-only traces. Public
hypothesis text is restricted to supplied observable phrases rather than accepting latent
diagnoses. Tool result subsets can be used only for the cases actually returned; an
oversized unusable result falls back. Deterministic fallback uses lexical public evidence,
observed fix grades and nearest qualified responders. It never dispatches or approves
staffing. Fixture mode reads a labelled synthetic script, not a recorded Nemotron output.

The shared authorization gate is inside all roster writers and assignment entry paths,
including handover, transfers and Offline. A gated approval binds one responder/fix and one
initial attempt, never a silent support addition or failed-attempt rematch. Operator
approval atomically revalidates state/revision, availability, qualifications and every
safety prerequisite, then invokes the shared assignment engine with the approved fix.
Abstained/escalated manual picks require an audit reason and the same safety checks.
Duplicate identical approval is idempotent; changed/stale requests mutate nothing.

RUNNING work and interrupted interpretation ranking requeue on load with old request
identities removed. The agent lane initiates a tracked pump and yields during provider
waits; a raced deadline bounds a transport that never settles. Explicit public projections
supply open plus twenty terminal records, with private tokens and authorization internals
excluded. Offline adapts its existing state to these same services with fixtures fixed.
Expiry, supersession, policy auto-approval, simulated-issue sampling and narrator remain N3b.

The fixture evaluation honestly reports SC-13 as ABSTAINED: its setup has no on-shift
responder while its label expects READY. Matching that label by authorizing overtime would
violate the qualification/outcome and staffing boundaries. Interpretation agreement uses
operator-confirmed expected triples and is not independent model classification accuracy.

The shared privacy guard also validates new report/decision text before persistence.
Restricted private simulation-marker content returns 400 rather than poisoning the room's
public snapshot (whose legacy serialized privacy guard rejects those markers). This is a
privacy-boundary validation exception to ordinary untrusted-narrative handling; normal
instruction-like spans remain quoted data and do not bypass the investigation policy.


## 2026-10-19 — N3b durable policy, narration and honest comparison

READY deadlines use simulated time and durable scheduler claims; policy approval occurs only
at deadline after atomic safety checks. Explicit overrides are separate from normal approval.
An independent seeded stream samples planner issues without perturbing simulation RNGs.
Narrator receives only cutoff-filtered ObservableDTO, never responder/fault truth; code keeps
classification and outcomes fixed. Offline exercises these services without provider calls.

The requested same-issue class-frequency comparison cannot observe a different fix's outcome
from production history. Analytics freezes the public baseline before investigation, counts
the same issues, and returns COUNTERFACTUAL_NOT_OBSERVED with observed/unobserved counts
rather than manufacture alternative outcomes using hidden truth. Paired replay remains the
separate source of causal comparisons. Compact facts preserve these denominators through retention.

Regenerated the month under safe policy/share 0.2 in about 14 seconds; staged it separately at
backend/seed/investigation-month rather than replacing the existing paired-replay seed.
It has 23 AUTO_APPROVED, 2 EXPIRED and 1 ABSTAINED runs and eventually saturates the pending
queue because authorization is consumed on failure and unsupported work needs an operator.
Replacing the baseline would erase its last-week evaluation cohort. A reproducible four-hour
synthetic seed supplies approved/abstained/escalated examples (1/7/1 plus 2 auto-approved).
All files are below 20MB. Dataset README records reproduction and limitations.
The responder-ranking-only reliability soak explicitly disables investigation sampling to keep
its original experiment intact; production sampling remains enabled by default.


## 2026-10-19 — Repair model escalation that contradicts a supported recommendation

The first live evaluation found model ESCALATE alongside MODERATE/STRONG first fixes and
qualified recommended responders, confusing routine approval with safety escalation. Such
finals are now validation failures with bounded feedback and one repair under the existing
six-tool/eight-call/time budgets. The prompt reserves proposedOutcome for not recommending.
Without a supported qualified action, model escalation remains valid; deterministic hazard
policy is unchanged and still makes no model call. Every deterministic public result exposes
a fallback reason, including policy exits and unresolved eval interpretations. This corrects
the contract; no claim of improved live outcome agreement is made without another live run.
## 2026-10-19 — Model ESCALATE is not accepted beside a supported recommendation

- Live evaluation run 1: 8 of 24 scenarios became `ESCALATED` because Ultra returned a
  supported, qualified recommendation together with `proposedOutcome: ESCALATE`, and the
  investigator accepted any model escalation.
- Decision: models may still propose escalation, and code still decides (rule 3). An
  `ESCALATE` beside a `MODERATE`/`STRONG` first fix with a qualified responder is a
  validation error that gets one repair; repeated, it falls back deterministically. The
  prompt reserves `ESCALATE` for safety concerns. Nothing can auto-dispatch either way.

## 2026-10-19 — Engine-only private truth in paired first-fix replay

Rule 4 excludes hidden ResponderSkill and cause/effectiveness inputs from Compass, model
packets, ordinary UI and analytics. Rule 3 assigns deterministic simulation outcomes to
application code. Paired replay uses private truth exclusively inside the isolated
replay-outcome-runner engine, just as the ordinary attempt engine does. Three cloned starts
reuse recorded first-attempt draws, time, history and the actual first responder; only fix
varies. The scorer receives only `{fixed}` arms/exclusions, never private state or traces.
Canary tests require changed hidden truth to change outcomes without changing model packets.
This controlled synthetic comparison is not observed production history; `/analytics`
continues to report alternative outcomes as unobserved.

Public evidence is reconstructed strictly before raisedAt using shared cutoff tools; no
approval policy, cached recommendation or target outcome enters investigation. Public roster
uses immutable seed reference definitions, normal rotation, prior approved staffing intervals
and assignment occupancy; it is not a complete historical UI-location replay. Missing private
inputs or the first responder are FAILED exclusions, not invented observations. Coverage,
fallbacks/timeouts, exclusions, source hashes and paired denominators are retained. Live
measurement belongs to the main agent; no result numbers or improvement claim accompany this
method-only change. The existing month remains the cohort; the unattended policy candidate
from N3b remains separate.

## 2026-10-19 — Daily budget over reported provider usage, with explicit incomplete estimates

Account at the shared HTTP-attempt boundary before validating returned prose/tools, so
billable usage on truncation, invalid outputs, repairs and retries is not omitted. Store
only daily provider/model/role token aggregates in one deployment ledger; no prompts or
responses. Known Nebius prices come from the N0 facts table. Unknown models and partial
usage remain unpriced; known spend is preserved separately, never reset by missing prices.

COMPASS_DAILY_BUDGET_USD is env-only and defaults unlimited. Check before queueing and again
before fetch; in-flight calls finish, then deterministic fallbacks preserve budget-exhausted.
This is an estimate-based application control, not a provider hard cap or a claim that
unknown-model calls cost nothing. UTC completion-day accounting and 120-day retention bound
persistence; serialized atomic writes and a durable daily log flag survive restart. Settings
exposes these aggregates read-only to judges, including tunnel visitors, without granting
budget/configuration authority. Hermetic test workers use memory/scratch ledgers only.

## 2026-10-19 — Round 21 investigator security boundaries

- Room mutations require JSON media type, including bodyless commands, and reject a supplied
  cross-origin/null/malformed Origin. Compare against Host and the external protocol
  (`X-Forwarded-Proto` when present). Missing Origin remains valid for CLI callers. This is
  partial hardening, not authentication: login, authenticated actors and endpoint permissions
  remain an explicit user decision. Frontend bodyless mutation callers must send JSON headers.
- Replaced broad digit harvesting with per-tool numeric metric allowlists (evidence counts,
  case/historical counts, case minutes). Strip supplied IDs only at whole-token boundaries.
  Reject percentage/probability/chance/likelihood claims even when a metric contains those
  digits. Repair retains public catalog/returned IDs and cannot execute further tools.
- Sanitize model-origin trace strings and legacy DTO traces; validate the complete public room
  projection before model results commit. Unsupported first-fix grade NONE yields ABSTAINED;
  normal approvals recheck selected-fix grade and the current report hazard policy, including
  saved legacy READY records. Safe deadline approval rechecks current report hazards too.
  Malformed array elements consume the existing bounded repair instead of becoming provider
  errors. Hazard policy v2 covers common inflections, flames, fumes and arcing.
- Choose conservative room-service admission defaults: 20 submission attempts per rolling
  real minute, process-local, plus 100 open reports checked transactionally and persistent
  across service restarts. Rotate work kinds so rankings cannot starve investigations.
- Closed orphan reports cannot enter issue archives without inventing an issue. Reclaim full
  orphan report/run rows after the simulated retention window or above 100 closed records;
  preserve compact analytic outcomes, operational audit events and monotonic IDs. Full orphan
  detail expires (404); linked issue archives are unchanged. No runtime data migration/write.
- Bound decoded provider envelopes to 256 KiB before parsing, cancel oversized streams, and
  bound investigator content/arguments locally. Retain existing provider timeout/retry and
  usage boundaries. Regenerate only the synthetic lifecycle fixture for reproducibility.

### Round 21 follow-up — actionable repair diagnostics

Per the updated assignment after live replay C, replace generic final validation errors
with exact item/field paths and bounded reasons. Unknown IDs and rejected text are never
echoed; a rejected numeric token is limited to 80 digits/characters. The repair restates
public IDs, allowed hypothesis texts and numeric metric tokens and explicitly permits
dropping numeric rationale claims in favor of qualitative prose. Preserve the original
one-repair deadline/call/tool budget and every acceptance rule. Live repair effectiveness
remains for the main agent to measure after merge.

## 2026-10-19 — Ask Compass: read-only grounded Q&A (round 22)

- Feature: central command asks plain-language questions about the room. Nemotron Super
  (role `assistant`) answers from seven read-only public tools, with citations that must be
  records a tool returned in the same run.
- Boundary (rules 3 and 4):
  - code declines hidden-truth and action requests before any model call;
  - the tools expose explicit public projections only;
  - numbers in prose come only from allowlisted count/minute fields;
  - answers cannot claim approval or give instructions;
  - Ask never mutates operational state (it only appends to its own in-memory history).
- Fallback is a labelled deterministic list of the found records, so the feature degrades
  without inventing text.
- Finished by the main agent in the codex worktree at the user's request (codex ran out of
  credits). The main agent fixed two test problems: a usage ledger that persisted to
  `backend/data/`, and the in-memory store's missing `publicSnapshot`.

## 2026-10-20 — AMD integration guide removed; AMD provider code kept

- The user directed that AMD documents be removed from the repo while the AMD provider code stays in place as a selectable provider. `Compass_AMD_Token_Factory_Integration_Guide.md` is deleted, and its references in `AGENTS.md` rule 1, `.env.example` and `backend/src/provider-controls.mjs` are removed. `AGENTS.md` rules 3 and 4 remain binding for AMD provider code.
- Still present by design: the AMD provider code and tests, the `AMD_TOKEN_FACTORY_*` variables, and `docs/submission/assets/AMDResponseCompass.png`, which the deck build script uses as its cover image.
- Main agent (claude), at the user's direction.


## 2026-10-24 — Round 31 consumable source and obligation-history contract

The round 31 assignment explicitly approves the slice-2 design despite its older proposal
header. The design does not name a room counter source or an asset-to-station/Issue mapping.
This implementation uses private optional `consumableInputs` containing one current slice-1
input packet per asset, and persists only the specified obligation work rows. No ordinary
Issue class, station identity or responder authorization is inferred; that integration and
counter ingestion remain later slices. An optional clarification was requested while work
continued with this bounded contract.

A canonical source digest includes readings, cleaning, policy and lifecycle facts, not the
clock. These other facts must participate so cleaning acknowledgements, policy revision and
replacement can reconcile even before another numeric reading. Digest and row changes commit
atomically through the existing store. Reads/unchanged ticks do no obligation work.

Explicit replacement means a new current lifecycle for the same asset. Missing evaluations
or NO_DATA do not mean retirement and cannot close work. UNKNOWN/RECONCILE share one review
identity and preserve existing cleaning/replacement obligations; policy supersession can
transfer still-required review work without discharging it. A valid slice-1 counter evaluation
is the source evidence for resolution, never a timer or cleaning of invalid counters.

The design's status-based obligationKey recurs across cleaning cycles, while closed rows
must be retained. The pure reconciler returns an identity-derived base ID; the room applicator
assigns deterministic history-based episode suffixes on collision, never using time/randomness.
Only one episode may be OPEN for a lifecycle/kind; closed identities and links are immutable.
Raw sources, digest and obligation history stay outside ordinary public snapshots/models.


## 2026-10-24 — Handler episode slice-1 boundary conventions (round 34)

The approved round-34 board assignment authorizes the spec despite its historical
proposal header. The pure function is named buildHandlerJamEpisodes. Query windows
are half-open; occurrence/reason conflicts for a repeated alarm identity and
conflicting context at one instant are invalid rather than order-dependent.
Missing occurrence counts once per identity; outside-window occurrences are ignored.
Context observations are a carried-forward step function, requiring a fact at or
before the window start. The current program must also match the supplied station
program, just as site count must match. The one-minute estimate gate is evaluated
before display rounding. All failed gates are preserved in documented order.

Exact millisecond durations drive arithmetic; displayed minutes and estimated units
round independently to nearest integer, and rates to two decimals. Episode durations
can overlap, so only the station union is additive with planned/running time (display
rounding can differ by a minute). Counts are accepted only on disjoint run intervals
fully within or outside the query; crossing a boundary is invalid because the spec
supplies no partial-interval count attribution. This avoids inventing prorated units.
A missing/zero reference suppresses the estimate; suppressed deficitBasis is null.
These conventions add no runtime route or mutation and do not infer jam causes.


## 2026-10-24 — Calibration slice-1 source and gate boundaries (round 35)

The board explicitly adds a read endpoint to the approved pure-module spec. Its
source is optional private room calibrations; no default rows or ingestion API are
invented. Cells are listed from all source rows, including future-only cells, whose
readiness is NO_CALIBRATION. Future rows do not introduce effective instruments early.
Strict explicit row fields reject unrelated/correlation facts; exact duplicate
identities count once, conflicting identities and same-instant competing calibration
records are invalid rather than selecting readiness by input order. DueAt must not
precede calibratedAt; equality is a valid immediately-expired record.

The optional checkout argument is the complete cellReadiness result. Its cell and
instant must match the request, preventing accidental stale or cross-cell reuse.
All existing failing rules remain reported. The spec explicitly defers checkout
POST wiring, so this round exposes the read endpoint and optional pure gate only;
legacy HTTP and batch behavior remains unchanged. Raw calibration history is excluded
from ordinary public snapshots in both modes. Provisioning/schema enforcement beyond
reader validation and the required-instrument configuration remain later work.


## 2026-10-24 — Round 36 calibration entry and server enforcement

Round 36 supersedes round 35's deferred checkout wiring: readiness is computed from
current rows at the simulation clock inside the checkout store mutation. Missing
existing-room records fail closed rather than silently injecting calibration facts.
Shared independent synthetic seeds cover both cells/modes/rooms on creation/reset.
POST appends valid facts, returns RECORDED (or UNCHANGED for an exact identity retry),
and rejects identity or same-instant conflicts as 400. Validation occurs before
queueing and against latest history inside the queue. Future entries remain allowed
and ineffective until calibratedAt. No calibration facts are automatically renewed.

The assignment's Calibrations panel contract also requires GET calibrations; the
backend supplies it as an explicit read-only history projection, with per-record
FUTURE/CURRENT/EXPIRED time validity, independent of latest-record readiness selection.
The existing readiness GET remains the authoritative effective cell decision.


## 2026-10-24 — Authorized existing-room synthetic calibration migration (round 37)

The round-37 assignment explicitly supersedes round 36's no-backfill policy for
existing Live rooms. Absent or empty calibrations receive both synthetic cells with
calibratedAt at simulationTime minus seven days and dueAt plus sixty days. Any
nonempty history, including partial/future/expired records, is left unchanged.
This is deterministic migration at normal load, not recurring automatic renewal;
second application has identical output and advancing time cannot refresh records.
The existing Live migration checkpoint path durably installs the new field without
a reset, wall-clock dependency, provider call or operational mutation.


## 2026-10-24 — Board entry cell registry and migration preservation (round 38)

The current cell registry is the room's calibration rows (ATE IDs are distinct from
equipment IDs). Entry validates a supplied non-null cell against those rows inside
the mutation queue; existence is separate from readiness. Omitted cellId means in
store. Duplicate IDs are 400, never upserts; successful entry returns ADDED with no
reservation. Both modes use the same service and input validator.

The authorized Live migration seeds only absent or boardless inventory. It creates
no reservations and preserves any existing reservation history in a boardless
inventory rather than deleting historical facts. Any nonempty board list is left
untouched, including custom/custodied/repair rows. Synthetic program mapping is
LB-0412 and LB-0204 to SR1260-P3, LB-0398 to PM0096-P2. No fresh-mode seed policy is
changed; the assignment targets persisted Live rooms and manual entry.
