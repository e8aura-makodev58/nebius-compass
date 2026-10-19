# Backend module map

Every module under `backend/src/`, grouped by the subsystem it belongs to. Each entry
links to the page that covers it in depth. The backend is plain ES modules (`.mjs`) with
one TypeScript type file; there is no build step.

## Entry point & HTTP

| Module | Responsibility |
|--------|----------------|
| `server.mjs` | Node `http` server. Boots the logger, provider-settings service, and control-room manager, then routes every request: room-scoped `/api/control-rooms/:id/...`, deployment-global `/api/settings*` and `/api/logs*`, and static frontend files (with an SPA fallback for `/rooms/:id`). See [http-api.md](http-api.md). |
| `offline-runtime.mjs` | The API-free Offline demo runtime and its request-handling body, extracted from `server.mjs` to break a circular import with the manager. `server.mjs` re-exports `createDemoRuntime`. See [offline-runtime.md](offline-runtime.md). |
| `application-log-store.mjs` | Persistent structured application log (request lifecycle, model calls, errors). Exports `createApplicationLogStore`, `createApplicationLogger`, `createControlRoomLogger`, `logEvent`. Keeps up to 1,000 events under `backend/data/`. |

## Control Rooms (multi-instance) — see [control-rooms.md](control-rooms.md)

| Module | Responsibility |
|--------|----------------|
| `control-room-registry.mjs` | The frozen, hardcoded list of rooms (`plant-1` / `e8-aura-p1`, `plant-2` / `e8-aura-p2`) and the reserved-id guard against real route segments. |
| `control-room-manager.mjs` | The **sole boundary** for room-scoped runtime access. Composes one Live + Offline + application runtime per room, shares one logger/settings/planner/agent config, and owns the one process-level scheduler that ticks every `READY` room concurrently. |
| `control-room-migration.mjs` | Idempotent one-time move of legacy single-instance data into the per-room layout, with an explicit `CONFLICT` state that never silently picks a winner. |
| `control-room-metadata-store.mjs` | Revisioned display-name storage shared across rooms (`room-metadata.json`), with optimistic-concurrency renames. |

## Live simulation — see [live-runtime.md](live-runtime.md) and [simulation.md](simulation.md)

| Module | Responsibility |
|--------|----------------|
| `live-runtime.mjs` | Orchestrates a room's Live simulation: scheduler tick → event planning → assignment lifecycle → resolution, plus agent-activity status and deferred-work tracking. Also exports `createApplicationRuntime` (the Live/Offline mode wrapper). |
| `live-store.mjs` | Atomic retained JSON state, serialized mutation/read projections, archive-first commits and on-demand historical audits. `OperationalEvent`s remain audit-only. |
| `history-retention.mjs` | Pure closed-issue retention planning, exact analytic facts, ID/token floors, recent-event context and protection of open/claimed work. |
| `history-archive.mjs` | Insert-only daily issue bundles by reset epoch, durable atomic writes, portable archive copying and on-demand lookup. |
| `live-schema.mjs` | Live state validation, migration entry, public-snapshot construction, and audit-record generation. Owns `LIVE_SCHEMA_VERSION`, `ISSUE_CLASSES`, `BASELINE_CONFIG`, and the `ResponderSkill` stripping. See [domain-model.md](domain-model.md). |
| `live-migration.mjs` | Version-to-version migrations of persisted Live state. |
| `live-assignment-service.mjs` | Assignment lifecycle in Live: offer/confirm, override, transfer, release — all roster-versioned. |
| `live-recommendation-service.mjs` | Builds the candidate packet, calls the Compass agent, validates the result, computes baseline disagreement, and persists the recommendation. |
| `mode-service.mjs` | The Live/Offline adapter seam: routes `getState`/`reset` to the active runtime. |
| `simulation-clock.mjs` | Simulation time advancement with pause/resume and 1×/5×/10×/60× speed. |
| `scheduler.mjs` | Process-level scheduler: one interval for the whole deployment, dispatching each room's tick concurrently at a fixed cadence. |

## Deterministic engines — see [simulation.md](simulation.md)

| Module | Responsibility |
|--------|----------------|
| `context-engine.mjs` | The deterministic fact layer. Owns eligibility, geometry (distance, floor transit, travel time), historical summaries, and candidate-packet construction. **Contains no model calls.** Owns `SCHEMA_VERSION`, `WALKING_SPEED_METRES_PER_SECOND`, `FLOOR_TRANSIT_MINUTES`. |
| `resolution-engine.mjs` | Finalizes completed resolution attempts, writes history, returns responders to duty, and reopens issues on failure. |
| `attempt-engine.mjs` | Simulates the work itself: segments, team synergy, success draw. Owns `TEAM_SYNERGY`, `TEAM_SUCCESS_CAP`, history-weighting constants. |
| `assignment-service.mjs` | Lower-level assignment record creation and participation history (shared math). |
| `workforce-continuity.mjs` | Four-crew rotation, shift availability, rest/duty limits, queue-first priority, and synthetic responder provisioning. Owns `WORKFORCE_POLICY_VERSION`, `CREW_IDS`, `MIN_REST_HOURS`, `MAX_DUTY_HOURS`. |
| `responder-location.mjs` | Deterministic responder positioning: move to an issue's equipment (role-seeded offset) or back to the duty station. |
| `analytics-service.mjs` | Fixed-snapshot analytics over Live state: success rates, resolution times, utilization, distributions, Compass-vs-baseline disagreement. See [../concepts/analytics-and-ethics.md](../concepts/analytics-and-ethics.md). |
| `audit-store.mjs` | Persistent audit-trail store for Offline recommendations. |
| `evaluation.mjs` | Deterministic soak/evaluation utilities (e.g. the 100-opportunity reliability run). |
| `demo-state.mjs` | The Offline seed state (issues, responders, equipment). |

## Models — see [model-providers.md](model-providers.md)

| Module | Responsibility |
|--------|----------------|
| `agent.mjs` | The Compass agent: sends the bounded candidate packet, validates the ranked result against the strict contract, never trusts it. Owns `AGENT_RESULT_JSON_SCHEMA`, `SYSTEM_INSTRUCTION`, `requestAgentRecommendation`. |
| `event-planner.mjs` | Proposes one plausible next `ISSUE_RAISED` event from bounded context; validates and falls back deterministically. Owns `EVENT_PLANNER_SYSTEM_INSTRUCTION`, `requestEventProposal`. |
| `model-provider.mjs` | Nebius and AMD transport, explicit model capabilities and normalized tool turns. Owns `PROVIDER_IDS`, `callChatCompletion`, `callChatTurn`, `providerDef`. |
| `provider-controls.mjs` | Provider-isolated runtime controls for Nebius and AMD: limiter (RPM, concurrency, queue), 429 retry, circuit breaker. See [model-providers.md](model-providers.md#controls-and-fallback). |
| `provider-settings.mjs` | Operator-selectable provider/model/reasoning configuration, persisted and env-seeded, plus live model discovery. Owns `createProviderSettingsService`, `reasoningEffortsForModel`. |

## Types

| Module | Responsibility |
|--------|----------------|
| `domain.ts` | TypeScript type definitions and status enums for the domain model. Types only; not imported at runtime by the `.mjs` code. |

## Troubleshooting modules

- `fix-catalog.mjs`: public synthetic procedures and catalog validation.
- `fault-truth.mjs`: engine-only seeded diagnosis/effectiveness; public-boundary guard.
- `fix-evidence.mjs`: observed aggregate packets, deterministic order, class-frequency
  comparator and immutable applied selection for new attempts.
- `fix-ranking.mjs`: bounded structured model/fixture request and strict validator.
- `fix-recommendation-service.mjs`: request/result persistence, fallback and late/reset guards.

`demo-seed-reader.mjs` reads ordinary seed JSON or a checksum-verified compressed seed
manifest. Bootstrap and generation use it; live persistence remains plain JSON.

## Staffing approval modules

- `staffing-service.mjs`: observed class/symptom evidence, deterministic fallback and legacy
  baseline, pending review/approval/rejection/expiry/supersession, audited room policy and
  request identity. Canonical mutations always revalidate `workforce-continuity.mjs` options.
- `staffing-ranking.mjs`: Compass ranking-role transport, strict bounded option contract,
  one deadline-bounded repair, API-free stored fixture and deterministic unavailability.
- `backend/fixtures/staffing-ranking.json`: API-free qualitative fixture over the supplied
  deterministic option order. No fixed responder assumptions or simulation truth.

## Investigation evidence contracts

- `investigation-dto.mjs`: explicit Case/Responder/Fix/Equipment allowlists and cutoff-filtered,
  archive-backed case derivation.
- `investigation-records.mjs`: independent id-seeded public certifications, symptom templates,
  noisy synthetic report templates and public-record migration.
- `investigation-tools.mjs`: six read-only OpenAI function schemas, strict argument validation,
  host-bound cutoff/target, qualification and evidence counts, bounded tool envelopes.

See [investigation.md](investigation.md) for contracts; loop/routes/approval follow in N3a.

N3a adds `report-policy.mjs` (public symptoms, lexical interpretation options and hazard/input
policy), `investigator.mjs` (budgeted read-only loop and deterministic fallback),
`prompts/investigator.mjs` (model instructions), `investigation-service.mjs` (persisted
report/run/approval mutations), `investigation-public.mjs` (explicit public projections),
`dispatch-gate.mjs` (shared authorization boundary), and `investigation-eval.mjs` (isolated
scenario adapter). Both runtimes and room routes share the services; model waiting does
not hold the Live agent lane. See [investigation.md](investigation.md).


## Investigation lifecycle modules

`investigation-policy.mjs` owns defaults, independent sampling and scheduler deadline claims;
`narrator.mjs` validates ObservableDTO-only prose with bounded provider/template execution;
`investigation-analytics.mjs` owns observed rate cohorts and compact retained facts.
`investigation-service.mjs` coordinates explicit override, supersession and policy decisions.

`replay-runner.mjs` builds public rolling-origin evaluation states and paired cohorts;
`replay-outcome-runner.mjs` is the engine-only private counterfactual boundary. Neither
writes runtime state. See investigation.md and docs/evaluation.md for the first-fix method.

`provider-usage.mjs` owns the deployment-global daily provider/model/role token and estimated
cost ledger, 120-day atomic persistence, UTC budget gate and one-per-day exhaustion audit.
All chat transports share it; see model-providers.md for accounting boundaries and settings API.

`assistant-tools.mjs` supplies Ask Compass’s seven public-only read-only projections and per-tool numeric metrics; see [assistant.md](assistant.md).
