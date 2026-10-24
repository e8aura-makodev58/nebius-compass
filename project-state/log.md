# Change log

Append-only history of meaningful changes to the Compass codebase, newest at the bottom.
See [README.md](README.md#logmd-entry-format) for the entry format. `<type>` is one of
`feature`, `fix`, `refactor`, `docs`, `chore`.

---

## [2026-09-15] docs — Established the project-state knowledge base

- Created this `project-state/` wiki as the source of truth for the Compass codebase,
  adapting the pattern in [llm-wiki.md](llm-wiki.md). Documented the architecture, backend
  subsystems, domain model, HTTP API, frontend, simulation mechanics, model-provider
  abstraction, operations, and the core boundaries — describing the system as a production
  application.
- Pages updated: all initial pages (see [index.md](index.md)).

## [2026-09-15] feature — Added the self-hosted GPT-OSS provider

- Added `gpt-oss` as a third model provider (a vLLM server exposing an OpenAI-compatible
  API on an internal host, serving `openai/gpt-oss-20b`) alongside OpenAI and OpenRouter.
  New `gptOssBaseUrl()` helper and a configurable base URL; the credential defaults to
  `dummy-key` (the server has no real auth); model discovery and the strict `json_schema`
  path reuse the shared abstraction unchanged. `COMPASS_DEFAULT_PROVIDER` selects the
  active provider (this deployment sets it to `gpt-oss` via `.env`).
- Made the Compass-agent and event-planner request timeouts configurable
  (`COMPASS_AGENT_TIMEOUT_MS`, `COMPASS_EVENT_PLANNER_TIMEOUT_MS`) and raised them for the
  self-hosted model, whose latency varies more than a hosted API. Failures still fall back
  to the deterministic baseline.
- Verified: `npm test` 234/234; live end-to-end calls to the model succeed for both the
  event planner and the Compass agent (validated output), with safe fallback when the
  shared model is slow.
- Pages updated: [backend/model-providers.md](backend/model-providers.md),
  [operations/running-and-config.md](operations/running-and-config.md).

## [2026-10-16] refactor — Remove MES feature and restore generic rooms
- Removed the MES adapter, comparable-case retrieval, case-guided outputs, and their SOW; restored direct aggregate-history ranking and generic response-action fields.
- Restored canonical `plant-1` / `plant-2` paths and `e8-aura-p1` / `e8-aura-p2` defaults with saved-state compatibility and conflict protection. Stubbed inherited provider-discovery test networking.
- Pages updated: architecture, backend/overview, backend/control-rooms, backend/http-api, backend/live-runtime, backend/domain-model, frontend/overview, operations/testing.
- Verification: `npm test` passed (37 test files); forced-provider Chromium E2E passed 32/32; `git diff --check` passed.

## [2026-10-16] docs — Multi-agent worktrees and handover board
- Set up separate worktrees and branches for Codex, Gemini, CodeBuddy, and Claude; the main agent merges into `master`.
- Replaced root `handover.md` with a per-agent handover board and protocol; moved the previous handover log to `docs/handover-history.md`. Added `AGENTS.md` rule 10 and updated `README.md` links.
- Pages updated: none (process change only; no code behaviour changed).

## [2026-10-16] docs — Removed superseded documents; added AMD integration guide
- Deleted the superseded v2 SOW, the older rebuild specification, `docs/demo-script.md`, and the release copy/checklist documents, and removed the related wording from the v4 SOW, `README.md`, `AGENTS.md`, `docs/assets/README.md`, and `docs/v4-implementation-plan.md`.
- Added `Compass_AMD_Token_Factory_Integration_Guide.md` (AMD Token Factory provider plan) and referenced it from `AGENTS.md` rule 1.
- Pages updated: none (documentation only; no code behaviour changed).

## [2026-10-16] feature — AMD Token Factory is the only model provider
- Removed the OpenAI, OpenRouter, and GPT-OSS providers; added AMD Token Factory (`json_object` output with the schema in the system message, key from env or key file, `max_tokens` cap, truncation and AMD error-wrapper handling). Default model `MiMo-V2.6-Flash` with reasoning `none`, chosen by live measurement; agent/planner timeouts raised to 60s/30s.
- Replaced `gpt-oss-provider` and `wp21-openrouter-provider` tests with `amd-provider.test.mjs`; rewrote the settings tests and the Settings E2E spec for the single provider.
- Pages updated: backend/model-providers.md, operations/running-and-config.md, operations/testing.md, index.md.

## [2026-10-16] refactor — Split the stylesheet for the redesign
- Split `frontend/styles.css` into `tokens.css`, `base.css`, `floor.css`, `panel.css`, `ops.css`, `analytics.css`, and `layout.css` (linked in that order; no visual change, E2E 32/32). Added the "Engineering print" design spec at `docs/design/engineering-print.md` and its tokens.
- Pages updated: frontend/overview.md.

## [2026-10-16] feature — "Engineering print" redesign of the shell, Live Floor, panel, and Settings; ResponseCompass brand
- Restyled `base.css`, `floor.css`, `panel.css`, `ops.css`, and `layout.css` onto the design tokens: paper/ink palette, square corners, hairline rules, mono data and labels, outlined default buttons with solid-ink primaries, accent underline on the active tab, neutral machines so only issues carry the accent. Analytics (`analytics.css`) is assigned separately.
- Header and page title now read **ResponseCompass** (Compass remains the recommendation agent's name). E2E expectations updated for the brand heading and the new hover colour.
- Layout fixes revealed by the light theme: non-floor views scroll inside their frame on the bounded desktop layout, and the search palette is sized to the viewport rather than the opener's column.
- Pages updated: none beyond frontend/overview.md (already lists the per-area files).

## [2026-10-16] refactor — Analytics Engineering print restyle
- Restyled Analytics with token-only paper/ink colours, ruled KPI cells and tables, monospaced figures, square controls, and visible keyboard focus. Charts use ink with orange for downtime; long period series scroll locally so dates and completeness labels remain readable at narrow widths.
- Kept report backgrounds at full content height within the shared desktop grid. Application behavior and analytics calculations are unchanged; app.js changes are limited to three chart colour arguments.
- Pages updated: log.md (frontend/overview.md unchanged because behavior is unchanged).

## [2026-10-16] docs — Product-facing rename to ResponseCompass
- Naming pass only: where "Compass" meant the application/product it now reads "ResponseCompass"; where it means the recommendation agent it stays "Compass". No file, env var (`COMPASS_*`), identifier, or data-path renames; nothing under `frontend/` or `backend/` touched.
- Pages updated: README.md, architecture.md, concepts/agent-boundary.md, backend/model-providers.md (plus the repo-level README, defense guide, rebuild SOW).

## [2026-10-16] fix — Merged the Analytics restyle and docs rename; desktop header fit
- Merged `codex` (Analytics restyle) and `gemini` (product-facing ResponseCompass rename in docs) into `master`; renamed two further product-meaning occurrences gemini flagged.
- Desktop header no longer clips: tabs are compact on desktop, the activity wording collapses to its dot below 1360px (was 1280px; Offline's third mode button clipped it), and at 901–1179px the view tabs move to a second header row instead of scrolling out of sight (`layout.css`).
- Regenerated `docs/assets/*.png` in the new look; corrected `docs/assets/README.md`, which claimed the E2E suite captures them.
- Pages updated: none beyond this log (frontend/overview.md already describes `layout.css` as the responsive layer).

## [2026-10-16] chore — Rewrote git history to drop the removed documents
- Folded the first four commits into one new initial commit (the cleaned tree), so the removed documents no longer exist anywhere in the history; later commits and merges were replayed unchanged. Commit IDs from before the rewrite no longer resolve; references in `handover.md` and `docs/handover-history.md` were updated.
- Pages updated: none (history only; no code behaviour changed).

## [2026-10-16] docs — Agents stay inside `amd` folders
- Added `AGENTS.md` rule 11 and a matching note at the top of the `handover.md` protocol: agents work only in `amd-compass` and its `amd-compass-<agent>` worktrees and never touch folders without `amd` in the name (such as the other Compass folders) unless the user explicitly asks.
- Pages updated: none (process change only).

## [2026-10-16] feature — Map/idle polish; live model measurement script
- Issue nodes on the map are now filled with the accent, so the one orange mark on the floor is unmistakable. The idle agent-activity ring no longer shows a dark arc (it read as a stalled spinner); the arc and spin appear only while an agent works, and stop under `prefers-reduced-motion`.
- Added `scripts/measure-amd-models.mjs` (`npm run measure:amd -- --models <id[:effort],…> --samples N`): opt-in live measurement through the app's own agent/planner request functions and validators, run one call at a time; prints a Markdown table. Never part of `npm test`. First run (MiMo, 1 sample): ranking rejected for digits in prose after 47s; planner valid in 8s — MiMo is 6/7 valid across all live runs so far.
- Pages updated: none yet (backend/model-providers.md and operations/testing.md have other owners this round; the main agent documents the script there with the re-measurement).

## [2026-10-16] docs — Documentation accuracy pass
- `operations/running-and-config.md`: replaced the stale `~/opt/node22` tarball advice with general nvm guidance. `frontend/overview.md`: corrected the `app.js` size and the provider-dropdown note (AMD only). `docs/evaluation.md` and `README.md`: updated test counts (230 unit/integration, 32 E2E) and marked the ten-run live gate as run under the removed OpenAI provider. Added the Engineering print / ResponseCompass entry to `docs/decisions.md`.
- Pages updated: operations/running-and-config.md, frontend/overview.md.

## [2026-10-16] fix — Text contrast and Analytics period labels
- Darkened tertiary/muted tokens and routed warning, green and accent text through AA-safe inks; preserved brighter status marks. Added hermetic contrast coverage for paper-facing text tokens on all three paper backgrounds.
- Analytics uses full-width chart rows, nonbreaking dates and whole-word completeness labels so seven Day bars fit at 1280px; long series retain local scrolling on mobile.
- Pages updated: frontend/overview.md, operations/testing.md; design token table and docs/decisions.md also updated.

## [2026-10-16] chore — Per-agent test ports; shared vendoring script
- `playwright.config.mjs` reads `COMPASS_E2E_PORT` (default 3012) and uses a per-port data folder, so agents can run E2E in parallel. `handover.md` gains a **Ports** table (E2E and manual-preview port per agent; free them right after testing) and `AGENTS.md` rule 9 points to it.
- Added `npm run vendor` (`scripts/vendor-frontend.mjs` + one module per library in `scripts/vendor/`), pinned `dockview-core@8.3.1` and `@fontsource-variable/{inter,jetbrains-mono}@5.3.0` as devDependencies, and taught the static server `.mjs` and `.woff2`, ahead of the round-3 tiling and theme work.
- Pages updated: none beyond this log (operations/testing.md is owned by codebuddy this round; the main agent adds the port note there at merge).

## [2026-10-16] chore — Live AMD model measurement (service busy, rankings mostly invalid)
- `npm run measure:amd`, 3 samples each, sequential:
  - **MiMo-V2.6-Flash (none):** rankings 1/3, median 28.5s; planner 3/3, 4.5s.
  - **GLM-5.3-Flash (low):** rankings 0/3, planner 0/3; timeouts and HTTP 429 "at its concurrency limit (16)".
  - **Qwen3.8-Flash-Next (none):** rankings 0/3, all timed out at 90s; planner 3/3, 27.5s.
  - **DeepSeek-V4-Flash (none):** rankings 0/3; planner 3/3, 6.7s.
  - **MiniCPM5-2B:** rankings 0/3, planner 0/3; schema and eligibility errors.
- Dominant ranking rejection: digits in rationale prose (responder IDs or numbers), which `containsNumericLeakage` forbids. Not an outage: every request was answered or rate-limited, so the model work stays active. Queued for claude: prompt hardening plus one bounded, revalidated repair attempt. The deterministic fallback kept dispatch working throughout.
- Pages updated: none yet (backend/model-providers.md is owned by claude/codebuddy this round; the main agent updates its model table after their merges).

## [2026-10-16] feature — Desktop Live Floor tiling with Dockview
- Added pinned, locally vendored Dockview 8.3.1 and reproducible browser asset extraction. The existing map, issue list, event feed and context nodes become four constrained, movable desktop tiles with keyboard resizing, maximise/restore, validated local layout persistence and reset; narrow screens retain the original flow.
- Added persisted-layout validation tests and six browser journeys; the contrast gate now resolves vendor text aliases to the shared tested inks without lowering AA thresholds. Repaired the existing activity-indicator test delay to match the current room-scoped force-event route, removing a timing race without changing assertions.
- Pages updated: frontend/overview.md, operations/testing.md; docs/decisions.md and vendor provenance also updated.

## [2026-10-16] feature — Modern light theme and local UI fonts
- Completed Gemini's theme WIP: cool-grey/white surfaces, indigo controls, clear status inks, rounded cards and restrained elevation. Isolated dashboard stacking so tile dividers stay behind the search palette. Added reproducible Latin Inter/JetBrains Mono font vendoring, normal/italic faces and the current design spec.
- Contrast checks retain AA 4.5:1 across all five light surfaces and inverse button backgrounds. Updated the responder hover/selection colour expectations and made the tiling outbound-request check use the configured agent test origin.
- Pages updated: frontend/overview.md, operations/testing.md; docs/design/modern-light.md and docs/decisions.md added/updated, Engineering print marked superseded.

## [2026-10-17] process — Theme merged; Gemini excluded from tasks
- Merged the modern light theme (`gemini` branch, finished by Codex after Gemini ran out of tokens) as `87b3a77`. `npm test` 234/234, E2E 38/38, vendored fonts and Dockview regenerate byte-for-byte.
- By user direction, Gemini gets no further tasks: watcher set to STOP, ports retired, noted in `AGENTS.md` rule 10 and `handover.md`.

## [2026-10-17] docs — Model measurement and E2E ports recorded
- `backend/model-providers.md`: added the `npm run measure:amd` tool and its 2026-10-16 three-sample results (rankings mostly rejected for digits in prose; planner reliable on MiMo and DeepSeek).
- `operations/testing.md`: documented `COMPASS_E2E_PORT`, the per-port data root, and that `measure:amd` is the only live-calling script.

## [2026-10-17] behavior — Candidate names allowed in Compass prose
- `agent.mjs`: the no-digits prose check now ignores the supplied candidates' `responderId` / `displayName`; the system instruction allows naming candidates that way. Other digits and unsupplied IDs are still rejected. Test added in `wp5-agent.test.mjs`.
- Pages updated: concepts/agent-boundary.md, backend/model-providers.md; `docs/decisions.md` entry.
- Live re-check after the change (rankings only, 3 samples): MiMo-V2.6-Flash 3/3 valid (was 1/3); DeepSeek-V4-Flash 1/3, now failing on incomplete rankings rather than digits.

## [2026-10-17] fix — Bounded revalidated ranking repair
- Hardened ranking instructions with qualitative alternatives and a compliant example. A validation-failed live ranking can be re-requested once through the shared provider path with bounded validator feedback and the same packet, using only the original deadline's remaining budget. All validators and offline behavior are preserved.
- Added hermetic fake-fetch/clock/timer coverage for successful repair, repeat rejection, feedback bounds, skipping near-expired deadlines, and shared-deadline abort/late-result rejection. Live quality re-measurement belongs to the main agent.
- Pages updated: backend/model-providers.md, concepts/agent-boundary.md; docs/decisions.md records the policy and one-second minimum repair window.

## [2026-10-17] process — Agent roster narrowed
- By user direction: CodeBuddy is excluded from tasks; its header E2E and boot catalog check go to Codex. The main agent (Claude) builds the AMD provider controls itself on master; the separate Claude worker is no longer used.

## [2026-10-17] feature — AMD rate limiting, 429 retry, circuit breaker
- New `backend/src/provider-controls.mjs`; `callChatCompletion` runs every request under it with one deadline covering queueing and retries. Only 429 is retried (guide §9). Five new `AMD_TOKEN_FACTORY_*` env vars.
- Tests: `backend/tests/provider-controls.test.mjs` (fake clock and timers).
- Pages updated: backend/model-providers.md, backend/overview.md, operations/running-and-config.md; `.env.example`; `docs/decisions.md` entry.

## [2026-10-17] measurement — AMD models after repair retry and provider controls
- `npm run measure:amd`, 3 samples: MiMo rankings 2/3 (planner 3/3), DeepSeek rankings 3/3 (planner 1/3), Qwen3.8-Flash-Next and GLM-5.3-Flash rankings timed out. No digit-in-prose failures; every valid ranking picked `R-ENGR028`. The circuit breaker opened during GLM's failures as designed. Recorded in backend/model-providers.md.

## [2026-10-17] fix — Validate saved model at boot and guard header layout
- Added background boot catalog validation with snapshot status and application logging. Confirmed missing saved models use the default model/effort for requests without rewriting the saved pin; failed discovery retains the saved selection. Test-mode boot stays API-free, and stale responses after credential changes are ignored.
- Added eight header geometry checks across Live/Offline and four desktop widths, plus hermetic settings coverage for boot concurrency, fallback (including pending refresh), persistence, outage, malformed catalogs and recovery.
- Pages updated: backend/model-providers.md (Selection & discovery), operations/testing.md.

## [2026-10-17] measurement — 10-sample model choice at app timeouts
- MiMo-V2.6-Flash (none): rankings 9/10, planner 10/10. DeepSeek-V4-Flash: rankings 8/10, planner 3/10 (default or none). MiMo stays the default for both roles. Remaining failures are ranking timeouts (MiMo median 42s vs 60s timeout). Recorded in backend/model-providers.md.

## [2026-10-17] config — Compass agent timeout 90s
- `COMPASS_AGENT_TIMEOUT_MS` default 60000 → 90000 (user decision). `measure:amd` ranking timeout default follows. Pages updated: operations/running-and-config.md, backend/model-providers.md; `docs/decisions.md` entry.

## [2026-10-17] feature — Separate ranking and event-planner models
- Added per-role model/effort persistence, backward-compatible single-pin loading without writes, role-specific validation/fallback/logging and planner-only environment seeds. Credential storage and the provider call path are unchanged.
- Settings now has two independently saved pickers with individual status and draft preservation; mocked browser coverage checks 375px/1280px without API spend or real settings writes.
- Pages updated: backend/model-providers.md (Selection & discovery), backend/http-api.md, frontend/overview.md, operations/running-and-config.md, operations/testing.md; docs/decisions.md and .env.example also updated.

## [2026-10-17] fix — planner seed effort for a different planner model
- A planner-only `AMD_TOKEN_FACTORY_EVENT_PLANNER_MODEL` no longer inherits the shared `AMD_TOKEN_FACTORY_REASONING_EFFORT` (e.g. `none` with GLM would be rejected with HTTP 422); it uses that model's default unless `_EVENT_PLANNER_REASONING_EFFORT` is set. Pages updated: backend/model-providers.md, operations/running-and-config.md.

## [2026-10-17] feature — Reproducible month of offline plant-1 history
- Added `generate:history`, an isolated, guarded offline generator using the real runtime cycle, seeded RNG and deterministic audit timestamps. Short hermetic tests check byte identity, normal-store equivalence/migration, privacy and live-data path rejection; production persistence and retention are unchanged.
- Extended only the plant-1 seed through 6 October 08:00 UTC: September plus four complete operational weeks, 669 issues / 844 history rows, LIVE + PAUSED. Two full generations matched SHA-256. Benchmarked cold load (1.82s), analytics, memory and browser loading; no live data or other seeds touched.
- Pages updated: backend/control-rooms.md, operations/running-and-config.md, operations/testing.md; docs/demo-history.md and docs/decisions.md document reproduction, engine seam and performance/backlog follow-ups.

## [2026-10-17] fix — resolution stall on a short due event; month seed withdrawn
- `attempt-engine.mjs`: resolution due times round up to the next ms. `resolution-engine.mjs`: a `NOT_COMPLETE` finalize replans instead of stalling until the next roster change. Regression test added.
- plant-1 seed restored to the original week; the merged month seed had been built on the defect. A fixed month is 74 MB and too slow to load (~21s room load, ~4.5s `/state`), so it is not committed. Pages updated: backend/control-rooms.md; `docs/decisions.md` entry.

## [2026-10-17] feature — Archive closed Live history and regenerate corrected month
- Added deterministic seven-day retention, durable archive-first recovery, retained exact decision/analytics evidence, bounded public state and paginated station history with archived audits. Regenerated plant-1 to 6 October with companion archives and staged bootstrap; plant-2 and metadata unchanged. Documented residual growth and measured target misses.
- Pages updated: backend/control-rooms.md, backend/domain-model.md, backend/live-runtime.md, backend/overview.md, backend/http-api.md, frontend/overview.md, concepts/analytics-and-ethics.md, operations/running-and-config.md, operations/testing.md. Reader inventory and reproduction: docs/history-retention.md, docs/demo-history.md.

## [2026-10-17] docs — submission drafts
- Added `docs/submission/` with the form answers (page 1 text, technologies, cover image prompt), pitch deck content (10 slides with notes) and a 3:00 demo video script. Drafts by the main agent, sent to codex for factual review (round 7).

## [2026-10-17] docs — Review submission form, deck and video against implementation
- Corrected fix-recommendation scope, dispatch/assistance guarantees, model-measurement context, month event counts, retention/latency claims and historical provider provenance. Replaced timing-dependent video steps with a saved-history walkthrough; verified form limits and narration budget.
- Pages updated: docs/submission/form-answers.md, docs/submission/pitch-deck.md, docs/submission/demo-video-script.md; own handover section records evidence and remaining user choices. Application, seeds and running deployment unchanged.

## [2026-10-17] docs — submission tagline kept; live AMD capture for the video
- User kept "The right responder. The right fix. Learned from every past repair." as the cover/deck tagline (vision); deck slide 1 notes and the video close present fix recommendations as next. Codex's factual corrections otherwise stand.
- The month data holds no successful AMD ranking (month extension ran with models forced off; the original week used earlier providers). By user decision the main agent runs plant-1 live on AMD in the 3200 app to capture genuine MiMo rankings for the video.

## [2026-10-17] ui — speed menu capped at 5×
- Header speed menu offers 1×/5× only; a faster room shows its speed as a disabled "above recommended" option. API unchanged. New `e2e/speed-select.spec.mjs` (2 tests). Pages updated: frontend/overview.md, backend/http-api.md; README; `docs/decisions.md` entry (also records the open clock-blocking defect).

## [2026-10-17] fix — model calls no longer hold the live clock
- `live-runtime.mjs`: real-time loop runs model-bound work in a serialized agent lane (AsyncLocalStorage marks the loop context; other callers stay inline). New `agentWorkIdle()`. Regression test in wp10. Pages updated: backend/live-runtime.md; `docs/decisions.md` entry.

## [2026-10-17] docs — pitch deck built
- `docs/submission/ResponseCompass-deck.pptx` + `.pdf` (10 slides, speaker notes) generated by `docs/submission/build/build-deck.py`; native-shape architecture diagram with 16 glued connectors. Screenshots from a scratch preview (`build/screenshots.mjs`). Build notes in `docs/submission/build/README.md`.

## [2026-10-17] ui — evidence counts rounded
- Evidence tables showed fractional confidence weights unrounded ("n=9.4997…"); `formatPercent` now shows them to one decimal. E2E check added in control-room.spec.

## [2026-10-17] docs — demo video recorded; deck slide 7 uses a live AMD record
- Captured live MiMo rankings on the 3200 app at 5× (7 of 11 valid). `docs/submission/ResponseCompass-demo.webm` (1:40, burned-in captions) recorded by `build/record-video.mjs` from a paused scratch copy, featuring ISS-3642; deck slide 7 now shows that record. Video script doc rewritten to match.

## [2026-10-17] ui — analytics denominators rounded
- `analyticsRate` showed fractional evidence weights unrounded (e.g. "n=511.4537…"); it now uses the shared `formatCount` (one decimal). E2E check added to the analytics journey.

## [2026-10-17] docs — demo video extended to 2:17
- Added search palette, tiles, the Offline dispatch loop (offer, override control, support, reopen), Compass-vs-baseline and issue-class analytics, and the Settings Demo tab. A slot remains for the round-8 fix recommendation segment (cap 3:00).

## [2026-10-17] feature — Latent faults and measurable catalog fixes
- Added engine-only seeded fault truth, overlapping public symptoms, public synthetic procedures, observed fix evidence and deterministic troubleshooting. Applied fixes scale attempt duration and success; legacy running attempts retain mechanics. Added privacy/migration/outcome tests and updated direct workforce test setup for the new invariant.
- Pages updated: backend/simulation.md, backend/domain-model.md; own handoff records staged implementation.

## [2026-10-17] feature — Rank fixes from observed evidence without blocking dispatch
- Added strict model/fixture ranking with the ranking role's settings and deterministic fallback, tracked non-blocking runtime work, per-attempt applied audit, responsive Recommended fix/evidence UI and period first-time fix/agreement analytics. Retention preserves exact fix evidence and recommendation facts; tests extend lane, validation, archive and browser coverage.
- Pages updated: backend/live-runtime.md, backend/http-api.md, backend/overview.md, backend/model-providers.md, frontend/overview.md, concepts/agent-boundary.md, concepts/analytics-and-ethics.md, operations/testing.md; docs/history-retention.md and docs/decisions.md explain the boundary.

## [2026-10-18] feature — Ship fix-enabled month with lossless seed packaging
- Generated 3,512 issues / 4,820 observations to 6 October, including 4,237 catalog-fix outcomes; published honest weekly first-time rates and review IDs. Added checksum-verified compressed seed loading for bootstrap/generation, retaining exact runtime JSON and complete archives. Strengthened privacy/restart/lane tests and prevented paused inference.
- Pages updated: backend/control-rooms.md, backend/overview.md, backend/live-runtime.md, operations/running-and-config.md, operations/testing.md; README, docs/demo-history.md and docs/decisions.md document packaging, installation and cold-start limitations.

## [2026-10-18] fix — Keep fix audits inside the context tile
- Constrained audit grid/heading widths and checked both document and panel overflow at 375px/1280px. Fix rates show one decimal so the measured final-week decrease remains visible; added explicit thin-sample and legacy-retry metric coverage.
- Pages updated: frontend/overview.md; docs/demo-history.md records HTTP and cold-start measurements.

## [2026-10-18] feature — Wall-display screens, one panel per monitor
- Added `/rooms/:id/display/:screen` (map, issues, events, dispatch, analytics) and a console Screens menu, so a control room can show each panel on its own monitor while the app runs autonomously. Same page and state; console controls hidden; tiling not started.
- Pages updated: frontend/overview.md, backend/http-api.md.

## [2026-10-18] feature — Issue Pareto panel and display screen
- Added `GET /analytics/pareto` (issue class → observed symptom → applied fix, or floor → station; issues, downtime, failed attempts; per period) and an Analytics panel with a Pareto bar chart, donut, drill-down and table; also the `pareto` wall-display screen. Public records only; archived/unarchived equality tested.
- Pages updated: backend/http-api.md, concepts/analytics-and-ethics.md, frontend/overview.md.

## [2026-10-18] fix — Live fix rankings never reached AMD
- `requestFixRanking` passed no transport, so the provider controls threw ("Invalid value used as weak map key") before any request, and every live fix ranking fell back deterministically as `provider-error`. It now defaults to the global `fetch` like the responder and planner calls (regression test `fix-ranking-transport.test.mjs`). Hermetic tests had always injected a fake fetch.
- Hardened the fix-ranking prompt to qualitative, digit-free rationales (MiMo quoted rates such as "0.692 over 261 attempts", which the validator correctly rejects); two live probes on AMD then validated first time.
- Pages updated: none (behaviour now matches backend/model-providers.md).

## [2026-10-18] fix — Trigger Next Event no longer blocks on live model calls
- With a live provider, `forceNextEvent` now claims the event and queues the planner and dispatch ranking in the agent lane, so the request returns at once (it took about four minutes on AMD, past the UI's 45 s timeout). Fixture and forced-failure modes stay inline. Regression test in `wp10-live-runtime.test.mjs`.
- Pages updated: backend/live-runtime.md, backend/http-api.md.

## [2026-10-18] feature — ranked overtime with central-command approval
- Added code-owned lawful staffing options, observed evidence and bounded Compass ranking;
  operator approval/rejection, durable deadlines, explicit audited policy, compact analytics,
  shared Staffing console/display/Settings UI and API-free regenerated month examples.
- Pages updated: backend simulation, live-runtime, http-api, domain-model, overview;
  frontend overview; concepts agent-boundary, analytics-and-ethics; operations testing.


## [2026-10-18] feature — ship the approval-enabled retained month
- Regenerated plant-1 from the same round 8 base through 6 October 08:00 UTC with a
  disclosed synthetic Force Event exercise and canonical approval/rejection/expiry/policy
  actions. Retained 3,532 issues, 4,730 observations and 42 compact staffing decisions;
  packaged losslessly as 1,987,140 bytes, with all committed seed files below 20 MB.
- Added phone evidence bounds, visible top-person rationale and frozen-evidence time;
  verified stale policy boundaries, deadline replacement behavior, byte-repeated examples
  and request identity across a reset reusing the same recommendation ID/timestamp.
- Pages updated: docs/demo-history.md; handover.md (codex).

## [2026-10-18] fix — Live overtime rankings reach AMD
- `requestStaffingRanking` had the same missing transport as the fix ranking (round 9 started before the round 8 lesson landed); it now defaults to the global `fetch`, with a regression test, and the prompt asks for qualitative rationales.
- Pages updated: none.

## [2026-10-18] fix — staffing ranking transport and qualitative prose
- Applied the round 8 transport lesson to staffing ranking: live calls and their bounded
  repair default to global fetch. Rationales reject all digits except supplied option IDs,
  even when a number appears in the packet; authoritative numbers stay in the UI tables.
- Pages updated: backend/live-runtime.md, concepts/agent-boundary.md, operations/testing.md, operations/running-and-config.md.
## [2026-10-18] fix — Busy responders stay lawful extension options
- `lawfulStaffingOptions` only offered an extension to a responder who was idle at that moment, so a recommendation made while the top option was between jobs went STALE when central command approved it a minute later, after the responder had picked up work. Found in a live AMD check on 3200. Extensions now require only that the responder is on duty, on the current crew and within the duty limits; the 16 h duty, 12 h rest, staff-cap and surge rules are unchanged. Regression test in `staffing.test.mjs`; the stale-approval test now uses a responder who has gone off duty.
- Pages updated: none (rules unchanged in backend/simulation.md).

## [2026-10-18] feature — professional operational UI refinement
- User-authorized decision-first staffing, direct phone workspace navigation, consistent
  task rows/map chrome, Analytics overview/detail composition and balanced provider settings.
  Existing simulation, lawfulness, approval, metric and Offline boundaries are preserved.
- Pages updated: frontend/overview.md, operations/testing.md; design/operational-ui-refinement.md.

## [2026-10-18] perf — Journaled live store, frozen snapshots (round 10)
- Copy-on-write drafts, changed-row validation, an fsynced checksummed journal with periodic checkpoints, and frozen published state returned by `snapshot()` without cloning. Month-seed benchmark: `/state` p95 1.16 s → 0.18 s, speed change 1.50 s → 0.27 s, tick mutation 0.43 s → 0.18 s (50 ms target not met). Crash/torn-write/corruption/legacy-load/replay tests in `live-journal.test.mjs`. Finished by the main agent after Codex ran out of tokens.
- Pages updated: backend/live-runtime.md, backend/control-rooms.md, architecture.md; docs/decisions.md.

## [2026-10-18] fix — Trigger Next Event queues model work in real rooms too
- Rooms pass provider options as functions over the saved settings, so the earlier "is the provider live?" check (which read `.mode` on a plain object) never matched on a real server and Trigger Next Event still waited for the AMD planner (7–42 s on 3200). The check now resolves the options per call. The regression test covers both option shapes.
- Pages updated: none (behaviour now matches backend/live-runtime.md).

## [2026-10-18] ops — ResponseCompass deployed as the `responsecompass` container
- `compose.yaml` now deploys project `responsecompass` on host port 3200 with its own `responsecompass-data` volume (the old file pointed at `compass-data`, which belongs to the separate Compass deployment) and mounts the AMD key as a read-only Compose secret. The 3200 process's data was backed up, verified and copied into the empty volume; the container is healthy with both rooms READY and the credential configured.
- Pages updated: operations/running-and-config.md; README Docker section.

## [2026-10-18] feature — Idle auto-pause
- A RUNNING room now pauses after `COMPASS_IDLE_PAUSE_MINUTES` (default 10, `0` disables) of real time without operator activity, so a visitor or judge who resumes a room and leaves stops spending AMD tokens. Activity is any non-GET room request plus a throttled browser heartbeat on real input; GET polling never counts. The pause records `SIMULATION_PAUSED` with `reason: OPERATOR_INACTIVITY` and logs `simulation_auto_paused`.
- Pages updated: backend/control-rooms.md, backend/http-api.md, frontend/overview.md, operations/running-and-config.md.

## [2026-10-18] ops — Cloudflare Tunnel service
- `compose.yaml` gains a `cloudflared` service (pinned 2026.10.1, profile `tunnel`, starts after the app is healthy, read-only, no capabilities). The tunnel token is a Compose secret read with `--token-file`, like the AMD key. Public hostname service: `http://responsecompass:3000`.
- Pages updated: operations/running-and-config.md; README Docker section.

## [2026-10-18] security — Provider settings read-only through the tunnel
- Requests carrying `Cf-Connecting-IP` (every Cloudflare Tunnel request) get `editable: false` from `GET /api/settings`, and all other `/api/settings*` routes return `403 SETTINGS_READ_ONLY`; the API settings tab shows a note and disables every control. Host/LAN access on 3200 is unchanged. `COMPASS_PUBLIC_SETTINGS=editable` lifts it. Tests: `public-settings.test.mjs`, a tunnel case in `e2e/provider-settings.spec.mjs`.
- Pages updated: backend/http-api.md, frontend/overview.md, operations/running-and-config.md; README.

## [2026-10-18] fix — Static files revalidate instead of caching for 4 hours
- With no Cache-Control from the origin, Cloudflare gave `app.js` and the page a 4-hour browser TTL, so visitors kept the pre-deploy UI (the read-only settings page still showed enabled controls). Pages, scripts and styles now send `no-cache`; `/vendor/` (fonts, libraries) sends a 7-day immutable cache. Tests: `static-cache.test.mjs`.
- Pages updated: backend/http-api.md.

## [2026-10-18] fix — Versioned asset URLs; locked settings read clearly as unavailable
- Cloudflare's zone Browser Cache TTL overrode `no-cache` and its edge kept old CSS, so the server now appends a content hash (`?v=`) to every app stylesheet/script in `index.html` and to relative module imports; each deploy uses URLs no cache has seen, unchanged deploys keep theirs. `/vendor/` is untouched. The read-only settings tab adds `.settings-locked`, which greys every control, including the accent Save buttons. Tests: `static-cache.test.mjs`.
- Pages updated: backend/http-api.md.

## [2026-10-19] docs — Agents stay inside `nebius` folders
- By user direction the `amd` folder rules are obsolete. `AGENTS.md` rules 10–11, the `handover.md` role table and protocol, and `~/aura-harness/aura-harness.md` now name `/home/makodev58/nebius-compass` (master) and `/home/makodev58/nebius-compass-<agent>` worktrees (e.g. `nebius-compass-claude`, `nebius-compass-codex`); agents never touch folders without `nebius` in the name, including `~/amd-compass`.
- Pages updated: none (agent protocol only).

## [2026-10-19] docs — Main agent runs from its own worktree
- The user named Claude the main agent and runs its session in `/home/makodev58/nebius-compass-claude` (branch `claude`). `/home/makodev58/nebius-compass` stays on `master` as the integration checkout, used by the main agent only via `git -C` and suite runs, for assignments, merges (its own `claude` branch included) and the merge log. `AGENTS.md` rule 10, the `handover.md` role table, main-agent protocol, Ports/Watcher/Current-task rows, and `~/aura-harness/aura-harness.md` updated.
- Pages updated: none (agent protocol only).

## [2026-10-19] docs — Nebius hackathon plan
- `docs/nebius/04_HACKATHON_PLAN.md` (draft v1): audit of the baseline `1e1c69c`, the new feature (Compass Investigator: Nemotron tool-using investigation with citations, safety gate, abstention and operator-approved dispatch), model tiering, evaluation harness, work packages N0–N9 with owners, risks and user blockers. Out for codex review.
- Pages updated: none (plan only).

## [2026-10-19] docs — Apache-2.0 licence; plan risks updated
- `LICENSE` (Apache-2.0) and `package.json` `license` added after the user confirmed ownership. Plan §6 and `docs/BASELINE_AND_CHANGES.md` record the user's answers (licence, AMD exclusivity not a concern, Nebius key later, GitHub login in progress); decision entry in `docs/decisions.md`.
- Pages updated: none.

## [2026-10-19] docs — Codex review of Nebius hackathon plan
- Added a one-pass, evidence-backed review covering authority/privacy, approval, safety, replay isolation, scope, ownership and objective acceptance criteria. No implementation behavior changed.
- Pages updated: `docs/nebius/04_HACKATHON_PLAN_REVIEW.md`, Codex section of `handover.md`; no component wiki changes required.

## [2026-10-19] docs — Nebius plan v2
- `docs/nebius/04_HACKATHON_PLAN.md` v2 accepts codex's twelve review findings: field reports stay unresolved until code-built interpretations are confirmed by the operator; one dispatch gate on every assignment path; allowlisted DTOs with noninterference/canary/perturbation tests; public synthetic certifications; code-owned hazard/injection policy and safety prerequisites; explicit evidence grades, budgets and `asOf` cutoff; paired first-fix replay; file ownership, go/no-go gates and cut order.
- Pages updated: none (plan only).

## [2026-10-19] fixtures — Investigation scenarios (N5, part 1)
- `fixtures/investigation/scenarios.json`: 24 synthetic field reports with expected outcome (`READY`/`ABSTAINED`/`ESCALATED`), the operator-confirmed interpretation where one exists, setup tags and constraint names; `fixtures/investigation/README.md` defines the tags and constraint vocabulary. Codex imports them read-only for N2/N3 tests.
- Pages updated: none (fixtures only; no code reads them yet).

## [2026-10-19] feature — Field reports tile (N4, on the §3.8 contract)
- `frontend/investigation-view.js` + `investigation.css`: report form, interpretation confirmation, investigation detail with case citations, safety class, qualified responders, prerequisite checkboxes, approve/escalate/reject, feedback, tool trace and a case dialog. Sixth Dockview tile (right column: context, Field reports, Staffing; frame min-height 560px), display screen `/rooms/:id/display/investigation`, phone Decisions view and count include open reports and investigations.
- `e2e/investigation-ui.spec.mjs` stubs the not-yet-built routes exactly to plan §3.8; replaced by a real-API spec when N3a merges. Tile-count assertions updated in tiling, display-screen and workspace specs; `tiling-layout.test.mjs` covers the five-tile reset.
- Pages updated: frontend/overview.md.

## [2026-10-19] ops — Chromium libraries moved to `/home/makodev58/nebius-tools`
- The old `rendertest` library folder is gone on this machine. Playwright's headless shell is installed in `~/.cache/ms-playwright` and its missing system libraries are extracted (no sudo) into `/home/makodev58/nebius-tools/libs`. `AGENTS.md` rules 9 and 11, `handover.md`, README and the testing page now name that path.
- Pages updated: operations/testing.md.


## [2026-10-19] measurement — Nebius Token Factory N0 probe
- Team key verified (HTTP 200). `docs/nebius/05_TOKEN_FACTORY_FACTS.md` records catalog facts (five Nemotron models with context, price, limits), JSON mode, thinking control via `chat_template_kwargs.enable_thinking`, native tool calling on every Nemotron model, 5-run validity tables, and role defaults: investigator Ultra (thinking on), ranking Super (on), planner/narrator Lightning (off). `scripts/probe-nebius.mjs` is the manual, credit-spending probe (never in `npm test`).
- Pages updated: none yet (codex updates model-providers.md in N1).

## [2026-10-19] fix — Wake Codex on changed handover assignments
- Replaced log-only polling with a 300-second watcher that queues a follow-up to the existing Codex session, deduplicates accepted delivery, retries errors and obeys STOP/no task. Added hermetic parser/delivery tests.
- Pages updated: `operations/running-and-config.md`, Codex section of `handover.md`.

## [2026-10-19] feature — N1 Nebius provider and normalized tool turns
- Added Nebius as the fresh-settings default, preserving AMD selections/credentials; introduced four independent model roles, capability-driven thinking/tools, provider-isolated controls and bounded usage/latency metadata. Fixed cache-parent creation for fresh-clone unit tests.
- Pages updated: `backend/model-providers.md`, `backend/overview.md`, `backend/http-api.md`, `operations/running-and-config.md`, `.env.example`, `docs/decisions.md`; frontend changes limited to Settings API role fields.

## [2026-10-19] measurement — Nebius Token Factory N0 probe
- Team key verified (HTTP 200). `docs/nebius/05_TOKEN_FACTORY_FACTS.md` records catalog facts (five Nemotron models with context, price, limits), JSON mode, thinking control via `chat_template_kwargs.enable_thinking`, native tool calling on every Nemotron model, 5-run validity tables, and role defaults: investigator Ultra (thinking on), ranking Super (on), planner/narrator Lightning (off). `scripts/probe-nebius.mjs` is the manual, credit-spending probe (never in `npm test`).
- Pages updated: none yet (codex updates model-providers.md in N1).

## [2026-10-19] feature — Adopt verified N0 Nemotron defaults
- Filled the centralized role/capability tables from the main agent's live probes: Ultra investigator, Super ranking, Lightning planner/narrator; native tools, explicit thinking mapping and 4096-token cap. Retained fail-closed explicit blanks and env overrides.
- Pages updated: `backend/model-providers.md`, `operations/running-and-config.md`, `.env.example`, `docs/decisions.md`.

## [2026-10-19] fix — Serialize provider credential saves
- Model and credential updates now share the settings save queue; concurrent AMD/Nebius key updates cannot collide on one temporary file or lose a provider's credential. In-memory credentials change only after persistence succeeds. Added a simultaneous-save/reload/remove regression.
- Pages updated: `backend/model-providers.md`, Codex handoff in `handover.md`.


## [2026-10-19] chore — N1b defaults and agent tooling
- Applied round-13 defaults (Super/Ultra default thinking, Lightning off; blank env seeds use built-ins); moved the running agent watcher and its tests to `/home/makodev58/nebius-tools/` without restarting it. Updated provider/configuration pages.
## [2026-10-19] measurement — Nebius ranking and planner on the real Compass packets
- `scripts/measure-amd-models.mjs` gains `--provider nebius` (defaults to the Nebius ranking model). Five samples per setting on the Scenario A ranking packet and the planner packet: Super with thinking off was 5/5 valid with the expected top pick 5/5 at 3.2 s; Super with thinking on was 4/5, 2/5, 17.6 s with one truncation. The ranking default becomes Super / off (codex applies it in N1b). Table in `docs/nebius/05_TOKEN_FACTORY_FACTS.md`.
- Pages updated: none (codex updates model-providers.md in N1b).

## [2026-10-19] docs — README Nebius section; HACKATHON_CHANGES.md at the root; history secret scan
- `docs/BASELINE_AND_CHANGES.md` moved to `HACKATHON_CHANGES.md` (guide §10 name, one record). README gains "Nebius Token Factory and NVIDIA Nemotron" (roles, models, thinking, why Token Factory, credentials) and a Live demo section that defers the Nebius URL to N8 and points to the AMD-era media. The ranking default it states (Super / off) lands with codex's N1b.
- Secret scan of all git history (`rc-…`, `sk-…`, `v1.…`, JWT, AWS, GitHub tokens, private keys) found nothing; the Nebius key string appears in no file or commit in either worktree.
- Pages updated: none.

## [2026-10-19] tooling — Investigator evaluation harness (N5 part 1)
- `scripts/eval/score.mjs`: pure scoring over §3.2 records — outcome class, abstention precision/recall with "n/a (0 cases)", citation validity and safety violations of accepted outputs, interpretation agreement, zero-model-call policy, repaired/fallback/raw-invalid counts, latency and token percentiles, paired first-fix replay with coverage and discordant pairs. Tests: `backend/tests/eval-score.test.mjs`.
- `scripts/eval-investigator.mjs` / `npm run eval:investigator -- --mode fixture|live`: runs the 24 scenarios through `backend/src/investigation-eval.mjs` `runScenario` (contract in plan §4, built in N3a) and prints a Markdown report; exits 3 with a clear message until that module exists.
- Pages updated: none.

## [2026-10-19] ui — Field reports tile fits the desktop right column
- Inside Dockview the tile drops its duplicate heading and shows investigations as one horizontally scrolling strip; the default layout sizes it to 42% of the frame height (min 240px), so the selected investigation's detail starts in view. Phone and display-screen layouts are unchanged.
- Pages updated: none (frontend/overview.md already describes the right column).

## [2026-10-19] feature — N2 investigation evidence contracts
- Added allowlisted DTOs and six bounded, read-only tools with host-owned cutoffs, archive-stable cases, public certifications, safety catalog data, and template/noisy synthetic narratives. Added hermetic contract, noninterference, cutoff, migration and scenario-tag coverage.
- Pages updated: backend/investigation.md (new), backend/domain-model.md, backend/simulation.md, backend/overview.md, concepts/agent-boundary.md, operations/testing.md, index.md.

## [2026-10-19] config — Nebius ranking default thinking off
- `NEBIUS_ROLE_DEFAULTS.compass.reasoningEffort` is now `off`, as the real-packet measurement decided (Super off: 5/5 valid, 5/5 expected top, 3.2 s; on: 4/5, 2/5, 17.6 s). `.env.example` comment and `model-providers.md` updated.
- Pages updated: backend/model-providers.md.

## [2026-10-19] ops — Deployment server e8aura-deploy
- New architecture (user): develop on e8aura-dev, deploy on e8aura-deploy (Ubuntu 24.04, private Tailscale address). Installed Docker Engine 29.9.1 and Compose v5.6.0 from Docker's apt repository; `makodev58` is in the `docker` group. Nebius key at `~/secrets/nebius.token` (mode 600); runtime `.env` at `~/nebius-compass-env/.env` (no secrets).
- `compose.yaml`: required Nebius key secret, optional AMD key (`/dev/null` when unset), `COMPASS_BIND`/`COMPASS_HOST_PORT` for the published address. `scripts/deploy/deploy.sh` pushes a commit to the server's bare repo, rebuilds, and waits for health; layout in `scripts/deploy/README.md`.
- Pages updated: operations/running-and-config.md.

## [2026-10-19] feature — N3a investigator vertical slice
- Added persisted field reports, interpretation ranking/confirmation, bounded investigator tools and repair, deterministic policy/fallback, shared dispatch authorization, atomic safety-checked approval, routes, Offline fixtures and the scenario adapter. Added native/JSON-protocol transport, gate/offer, policy, privacy, restart, race and responsiveness coverage.
- Pages updated: backend/investigation.md, backend/domain-model.md, backend/simulation.md, backend/http-api.md, backend/live-runtime.md, backend/offline-runtime.md, backend/overview.md, backend/model-providers.md, concepts/agent-boundary.md, operations/testing.md, operations/running-and-config.md.

## [2026-10-19] tests — Field reports E2E against the real N3a routes; SC-13 corrected
- `e2e/investigation-real.spec.mjs` (forced provider failure, 375/1280px): a confirmed report in a fresh room abstains with no dispatch controls and the issue stays gated and unassigned; hazard and garbled reports are decided by policy with zero model calls. `investigation-ui.spec.mjs` stays as the stubbed UI contract for the approve flow (needs case history), documented as such.
- `fixtures/investigation/scenarios.json` SC-13 now expects ABSTAINED: nobody on shift means no eligible qualified responder (plan §3.5); overtime stays with staffing approval. Flagged by codex in round 14.
- Pages updated: none.


## [2026-10-19] feature — N3b investigation lifecycle and observed analytics
- Added durable expiry/supersession, audited override/safe policy, sampled ObservableDTO-only narration, retained analytics and repeatable synthetic small/month seeds. Alternative baseline outcomes remain explicitly unobserved; the separately staged month exposes unattended queue saturation.
- Pages updated: backend investigation, simulation, live-runtime, offline-runtime, http-api, domain-model, overview, model-providers; concepts analytics-and-ethics; operations testing and running-and-config.
## [2026-10-19] measurement — First live investigator evaluation and live end-to-end run
- Live eval (24 scenarios, one sample): 16/24 outcome match; abstention 8/8 both ways; citations 18/18; 0 safety violations; hazard/input policy 6/6 with no model call; p50 14.6 s. All misses were READY→ESCALATED, because Ultra sets `proposedOutcome: ESCALATE` alongside a good recommendation and code accepted it; fix assigned to codex in round 15. Results and diagnosis in `docs/evaluation.md`.
- On e8aura-deploy (month seed), a live report → Super interpretation → Ultra investigation (7 calls, 15.7 s, STRONG, specialist fix, qualified responder) → approval dispatched through the gate.
- Harness rows now show source, fallback reason, calls and the stated reason for misses; latency in seconds.
- Pages updated: none.

## [2026-10-19] docs — README investigator section; submission draft; demo script
- README: "New for Nebius: Compass Investigator" (flow, boundary, fallback, eval pointer), diagram gains the field-report path, boundary sentence updated, test counts refreshed.
- `docs/nebius/06_SUBMISSION_DRAFT.md`: track, descriptions, Nebius/NVIDIA usage, pre-existing disclosure, judge testing instructions and feedback, with ⟨…⟩ blanks for URLs, the city event and one claim that waits for the ESCALATE fix to merge.
- `docs/DEMO_SCRIPT.md`: a 2:45 walkthrough recorded on a live run, with a recording checklist.
- Pages updated: none.


## [2026-10-19] fix — Validate contradictory model escalation before outcome selection
- Live-eval follow-up: a MODERATE/STRONG first fix plus a qualified responder cannot also propose ESCALATE. Request one bounded repair inside existing budgets; preserve unsupported and code-owned hazard escalation. Clarified prompt, labelled every deterministic public/eval result, and extended hermetic flags/repair/policy tests. Refreshed the small synthetic seed for persisted policy reasons; counts unchanged.
- Pages updated: backend/investigation.md; live results still require a separate measurement.
## [2026-10-19] fix — Model ESCALATE beside a supported recommendation is repaired
- `investigator.mjs`: a model `ESCALATE` with a supported (MODERATE/STRONG) first fix and a qualified responder is a validation error (one repair, then `validation-failed` fallback); prompt reserves ESCALATE for blocking safety concerns. Test in `investigator.test.mjs`. Main agent did this right after merging N3b, with codex idle.
- Pages updated: backend/investigation.md.

## [2026-10-19] measurement — Live investigator evaluation run 2
- After the ESCALATE repair: 24/24 outcome classes, citations 64/64, 0 safety violations in 12 accepted outputs, abstention 8/8 both ways, hazard/input 6/6 without a model call, p50 8.9 s / p95 29.4 s. Two genuine model fallbacks (validation-failed, tool-step-cap) still ended in the expected class. `docs/evaluation.md`.
- Pages updated: none.

## [2026-10-19] ui — Override, re-investigate, deadline, policy and analytics for investigations
- Field reports tile: decision deadline line, Re-investigate (supersedes, follows the new run), audited manual dispatch for ABSTAINED/ESCALATED (certification-filtered responders, prerequisites, required reason; state kept across polls). Settings → Demo: field report policy (approval mode, deadline, share). Analytics: "Field report investigations" (outcomes, approval/override/abstention rates, first-fix comparison with the counterfactual caveat).
- E2E (real routes): re-investigate → override dispatch with exact decision fields and assignment; policy save; analytics panel.
- Pages updated: frontend/overview.md.

## [2026-10-19] feature — Paired rolling-origin first-fix replay runner
- Added public cutoff-filtered decisions and an isolated engine-only three-arm outcome runner using the historical first responder and common recorded draws. CLI --replay reports paired coverage/exclusions, rates and discordance through the existing scorer; hermetic tests cover a five-issue fixture replay, future/hidden-truth invariance and reproducibility. No live run or result claims.
- Pages updated: backend/investigation.md, backend/overview.md, operations/testing.md, concepts/analytics-and-ethics.md; method in docs/evaluation.md.

## [2026-10-19] feature — Deployment usage ledger and UTC daily inference budget
- Added per-provider/model/role token and estimated-cost accounting at the HTTP-attempt boundary, 120-day atomic persistence, pre-fetch/queued/retry budget enforcement, durable daily exhaustion log, exact reason propagation and public settings aggregates. Settings API includes a read-only Usage table/status; unknown costs remain explicit and live work already in flight finishes.
- Pages updated: backend model-providers, http-api, overview; operations running-and-config/testing; frontend overview; .env.example documents env-only budget.


## [2026-10-19] docs — N7 factual public documentation review
- Reviewed eight assigned public documents at master 9b2a76e against implementation, tests and Git history; added docs/nebius/07_PUBLIC_DOCS_REVIEW.md with numbered severities, source locations/evidence and exact replacement text. Reviewed files unchanged; no suites or live calls (round-18 docs-only instruction).
- Pages updated: this log only; review artifact is in docs/nebius/.

## [2026-10-19] docs — Public docs review applied; private deploy details moved out of the repo
- Applied 25 of codex's 27 findings (`docs/nebius/07_PUBLIC_DOCS_REVIEW.md`, status section) across README, `.env.example`, `HACKATHON_CHANGES.md`, `docs/evaluation.md`, `05_TOKEN_FACTORY_FACTS.md`, `06_SUBMISSION_DRAFT.md`, `DEMO_SCRIPT.md` and `scripts/deploy/README.md`. These cover:
  - claims narrowed to what the code and evidence support (approval policy, validation scope, fallback limits, four probed models, eval metric labels and caveats);
  - Nebius-first setup;
  - a portable Playwright install;
  - stale counts and hashes.
- Findings 3–4 are code fixes in codex's round 19.
- `scripts/deploy/deploy.sh` requires `DEPLOY_HOST` (env or private `DEPLOY_ENV` file); deployment addresses are redacted from current files.
- Pages updated: operations/running-and-config.md (addresses redacted).

## [2026-10-19] measurement — Live paired first-fix replay, 60 held-out issues
- Run A (before the prose/repair fix): investigator 49/60, deterministic 46/60, baseline 41/60, but 34/60 investigator choices were deterministic fallbacks. Run B (after `8a76993`): investigator 46/60, deterministic 46/60, baseline 41/60, 7/60 fallbacks; discordant vs baseline 7/2, vs deterministic 2/2. Recorded with limits in `docs/evaluation.md`; per-pair source provenance is codex's round 19.
- Pages updated: none.

## [2026-10-19] fix — Docker fixture packaging and replay provenance (round 19)
- Included both fixture directories in the runtime image and aligned dev Compose persistence with `/app/data`; verified a local Docker build and read-only, network-disabled fixture smoke check.
- Replay pairs retain public investigator source/fallback labels; scoring and CLI add source-specific first-fix rates with denominators while preserving aggregate and legacy scoring.
- Pages updated: backend/investigation.md, operations/running-and-config.md, operations/testing.md.

## [2026-10-19] ui — Nebius color palette
- By user direction the theme follows the Nebius website palette, sampled from a user-supplied screenshot (kept outside the repo; colors only, no logo or artwork): navy `#0F2B43` text and actions, lime `#E1FE3C` brand fills (brand mark, active tab, selection wash), pale blue-grey surfaces. Token-only change plus two rules in `base.css`; all text tokens stay WCAG AA (lowest 5.1:1). `docs/design/nebius-theme.md`.
- Pages updated: frontend/overview.md (design reference).

## [2026-10-19] docs — Investigator security and correctness review (round 20)
- Reviewed untrusted reports/cases/model replies, repair/public boundaries, dispatch authorization, revision races, UI escaping and resource bounds at `194da5f`; recorded ten findings with verification limits and proposed fixes in `docs/nebius/08_SECURITY_REVIEW.md`.
- Synthetic in-memory and direct-handler checks reproduced operator impersonation, persisted trace poisoning, numeric claim acceptance, unsupported READY fixes, backlog/retention gaps and malformed-final classification. No application code changed; suites omitted under the round's explicit docs-only instruction.
- Pages updated: log.md; component behavior is unchanged.

## [2026-10-19] docs — Codex input to Gemini's Nebius theme review
- Added `docs/design/nebius-theme-codex-notes.md` at the user's request: brand/semantic token roles, accessible inverse text and focus, Field reports/Staffing consistency, phone actions and shared-view validation. Recommendations only; no UI behavior or CSS changed.
- Pages updated: log.md.

## [2026-10-19] fix — Investigator security boundaries (round 21)
- Hardened room mutation media type/Origin checks, per-tool numeric grounding and public traces; model publications validate their complete public projection before commit. Expanded deterministic hazard policy, required evidence for the selected first fix, and routed malformed finals through bounded repair.
- Added 20/min room-service admission and a persistent 100-open-report cap, fair work scheduling, closed-orphan full-row reclamation with compact facts/monotonic IDs, and streamed provider response byte limits. Regenerated the synthetic lifecycle fixture (only report policy version/creation timestamps changed).
- Added security regressions and updated JSON mutation headers in unit helpers and shared Playwright setup. Frontend/e2e source untouched; main agent must add JSON headers to production bodyless room requests before integration/deployment. Authentication remains a user decision.
- Pages updated: backend/investigation.md, backend/domain-model.md, backend/model-providers.md, backend/http-api.md, operations/testing.md. Decision recorded in docs/decisions.md; review status appended to docs/nebius/08_SECURITY_REVIEW.md.
- Verification: final hermetic unit suite 448/448; forced-provider Chromium E2E 83/83 on Codex port 3021. Test ports released; existing watcher preserved.

## [2026-10-19] measurement — Replay run C with per-pair source
- Same code as run B: investigator 45/60, deterministic 46/60, baseline 41/60; 23/60 fallbacks (every raw-invalid answer also failed repair). By source: model 29/37 (78.4%), deterministic 16/23 (69.6%), on different issues, so not paired. Fallback rate varies strongly between runs; recorded in `docs/evaluation.md`.
- Pages updated: none.

## [2026-10-19] ui — Recovery after a failed approved attempt (security review #9)
- An approved/overridden/auto-approved run whose issue is pending again and unassigned is shown with the open items as "Attempt failed — re-investigate", explains that its one-attempt authorization is consumed, offers Re-investigate with the latest revision, and counts toward the phone Decisions badge. No Approve control appears; the gate's one-attempt rule and the audit record are unchanged. Test in `e2e/investigation-ui.spec.mjs`.
- Pages updated: none (frontend/overview.md already lists Re-investigate).

## [2026-10-19] ui — Theme enhancements E1, E2, E4–E7 (round 21g)
- Implemented CSS-only theme enhancements from the round 20g plan:
  - E1: Harmonized tile empty-state styling with `--paper-sunk`, `--rule-strong` dashed borders, 10px radius, and docked header action in the Field reports tile.
  - E2: Hardened microcopy typography scale and contrast, shifting secondary labels and chips to `--ink-2` (`#3B5064`, >4.9:1) and bumping sizes to `.74rem`–`.78rem`.
  - E4: Compacted mobile 375px header and navigation bar; hid desktop-only keyboard shortcuts (`⌘K`, `/`) on touchscreens.
  - E5: Restyled field incident narratives with solid navy left borders and non-italic layout; updated cited case chips (`.inv-case`) with Nebius palette (raised surface, lime hover/wash `#F2FAD0`, lime focus halo, dark text).
  - E6: Right-aligned numeric columns in the Settings Usage table with `font-variant-numeric: tabular-nums` and row dividers.
  - E7: Enforced universal `:focus-visible` styling with `--focus-ring` (Nebius lime halo) across all buttons, case chips, summary disclosures, and option cards.
- Pages updated: frontend/overview.md, log.md.


## [2026-10-19] fix — Frontend sends JSON on bodyless room commands (security #1 companion)
- With codex's round 21 guard, room mutations need `Content-Type: application/json`. `app.js` `api()` now sends it for every POST/PUT/PATCH/DELETE, including bodyless pause/resume/reset/activity. `e2e/mutation-headers.spec.mjs` turns off the config's default JSON header (`test.use({ extraHTTPHeaders: {} })`) and drives the real UI; it fails without this fix and passes with it, and checks that text/plain gets 415.
- Pages updated: frontend/overview.md.

## [2026-10-19] fix — Precise investigator repair feedback (round 21 follow-up)
- Synced master, preserving both sides of the append-only log conflict and all authorized security/theme work. Updated final validation to report exact item/field paths, bounded non-echoing error categories, and qualitative fallback guidance; repair echoes only public IDs, allowed hypothesis texts and allowlisted metric numbers.
- Hermetic fixture evaluation: 24/24 outcomes, 0 repaired / 0 raw-invalid. Adversarial fixtures exercised shape, array bounds, disallowed numbers, probability claims, restricted/overlength prose, catalog text, unknown/duplicate IDs, qualification, citation case/field and outcome enum. Stubbed numeric-invalid output repaired to qualitative prose; no live-model claim.
- Pages updated: backend/investigation.md, operations/testing.md; decision and review Status follow-up appended.
- Verification: final unit suite 450/450, forced-provider Chromium E2E 84/84 on 3021, fixture evaluator 24/24. Test ports released; watcher preserved.

## [2026-10-19] measurement — Live investigator evaluation run 3 (after security fixes)
- 24/24 outcome classes, citations 60/60, 0 certification inconsistencies, abstention 8/8, policy 6/6; raw invalid 2 (run 2: 4); p50 10.5 s. `docs/evaluation.md`.
- Pages updated: none.

## [2026-10-19] ui — Wall display layout (E3) and provisional charts (E8) (round 22g)
- Implemented CSS-only theme enhancements E3 and E8:
  - E3: In `.display-mode` at wide viewports (≥1440px and ≥2200px), restructured Field reports, Staffing, Issues, and Event feed displays into balanced multi-column grids or constrained reading containers with enlarged typography (`1.05rem`–`1.35rem`) to eliminate excessive line measure while guaranteeing zero horizontal scroll (`overflow <= 0`).
  - E8: Distinctly styled provisional/in-progress simulated period chart bars (`.period-bar.partial`) in Operational Analytics using reduced opacity (0.55), a diagonal hatched pattern (`repeating-linear-gradient`), a dashed rule border, and an explicit legend entry (`■ Complete   □ In-progress (provisional)`).
- Verification: WCAG AA design-tokens-contrast test passed (2/2); hermetic `npm test` passed (448/448); full Chromium E2E suite passed (84/84) on port 3022. Captured 4 representative after-screenshots (256 KB total) in `docs/design/theme-review-2026-10/after/`. Preview and test ports released.
- Pages updated: frontend/overview.md, log.md.



## [2026-10-19] ui/docs — Judge walkthrough fixes
- New investigations from a policy-decided report or a confirmed interpretation are selected automatically in the Field reports tile. README: port note for the month-backed run; what a keyless judge sees. Submission draft: clearer room and approval steps. Status recorded in `docs/nebius/09_JUDGE_WALKTHROUGH.md` (issue 6 not applied: E2E uses port 3012).
- Pages updated: none.

## [2026-10-19] feature — Ask Compass public tools and role (round 22, step 1)
- Added seven bounded public-only read projections, explicit numeric metric allowlists and noninterference/canary tests; shared grounded-prose validation with the investigator. Added the assistant role to provider settings, env defaults, usage accounting and the existing Settings role pattern.
- Pages updated: backend/assistant.md (new), backend/overview.md, backend/model-providers.md, index.md. The Q&A service/routes follow in step 2.
- Step 1 verification: unit suite 452/452; forced-provider Chromium E2E 85/85 on port 3021.

## [2026-10-19] feature — Ask Compass service and route (round 22, completed by the main agent)
- `assistant.mjs`: `POST/GET /ask`, code-owned decline patterns, bounded tool loop on the `assistant` role, citation/number/action validation with one repair, deterministic fallback, per-room rate limit and in-memory history (`askHistory` in `/state`), Offline fixture. Live and Offline runtimes wired; E2E forces the assistant to fail. Codex ran out of credits; the main agent finished it in the codex worktree, fixing the assistant test's usage ledger (it persisted to `backend/data/`) and adding `publicSnapshot()` to the in-memory store.
- Pages updated: backend/assistant.md, backend/http-api.md.

## [2026-10-19] ui — Ask Compass dialog
- Header button **Ask Compass** opens `frontend/ask-view.js`: question box (opt-in selected-issue context), answer history with status/source badges, and citations that navigate to the cited issue, responder, event, investigation, analytics or case. E2E `e2e/ask-compass.spec.mjs` (real `/ask`, assistant forced to fail): decline, record-summary fallback with citation navigation, issue-context citation, escaping, 375/1280.
- Pages updated: frontend/overview.md.

## [2026-10-20] docs — Removed the AMD integration guide
- Deleted `Compass_AMD_Token_Factory_Integration_Guide.md` (the user's instruction: AMD documents removed, AMD provider code retained as a selectable provider). Dropped the guide references from `AGENTS.md` rule 1, `.env.example` and the `provider-controls.mjs` header comment.
- Historical log and handover entries that name the guide are left as written (append-only records).
- Pages updated: none (no page links the guide).

## [2026-10-20] feature — Ask Compass evaluation harness
- Added 20 labelled synthetic Ask scenarios, a hermetic real-service runner, optional main-agent Live mode, and independent final-answer scoring with evidence/number, safety, decline, fallback/repair and latency denominators. Invalid requests retain their actual error contract; no product behavior changed or live calls made.
- Pages updated: backend/assistant.md, operations/testing.md; method and limits in docs/evaluation.md.

## [2026-10-20] backend — Ask evaluation: narrowed the action-leak check
- `scripts/eval/ask-score.mjs` no longer counts everyday verbs (set, change, start, stop, move, send, apply, pause, resume, perform, recommend, activate, deactivate) as action leaks; directive verbs and "you/we should|must|can|may|will" still count. Regression test added to `backend/tests/ask-eval.test.mjs`.
- Reason: the lexical check would fail ordinary read-only prose in live answers. Not yet checked against live answers; the live run was not completed.
- Pages updated: none beyond this log entry.

## [2026-10-20] backend — Ask Compass live evaluation (first run)
- Ran `eval:ask --mode live` once in a one-off container on the local deploy VM with the server's Nebius key file mounted. Model: the configured assistant model. Result: 18/20 status matches; 20/20 constraint matches; citations 10/10 valid; numbers, hidden-truth and action leaks 0 across 18 scored answers; decline precision and recall 7/7; fallback 5, repaired 4, raw-invalid 4, errors 2 (2 are synthetic fault injections). Latency p95 4.6 s; p50 is not meaningful because most scenarios decline or fall back without a model call.
- Misses: `retrieved-injection` and `responder` both fell back after two validation failures (raw, then repair). The answer does not record which validation rule failed, so the cause is unknown. Next step: record validation errors on the answer trace, then rerun those two.
- Pages updated: this entry only.

## [2026-10-20] backend — Ask fallbacks now record the rejected rule family
- Fallback answers carry `rejectedBy`: the rule families (`final`, `text`, `citations`) rejected on each attempt. The model's wording is not stored. Deployed as `e850684`.
- Rerun of `retrieved-injection` and `responder` live: `retrieved-injection` passed this time (READY), so the first failure was run-to-run variation. `responder` fell back with `rejectedBy: ["final","text"]`: the model added fields beyond `text` and `citations`, and its repaired prose was rejected by the text rule too.
- Open: decide whether to relax the exact-shape check (`final`) or tighten the instruction to the model. Not changed here.
## [2026-10-20] ui — Ask Compass dialog CSS improvements (round 25)
- Implemented Improvements 1–5 from `docs/design/ask-compass-review.md` in `frontend/investigation.css`:
  - 1. Flex container containment (`.ask-dialog[open]`, `.ask-dialog > [data-ask-body]`) with fixed header/form and dedicated scrollable answer history (`.ask-history, .ask-case { flex: 1 1 auto; overflow-y: auto; }`).
  - 2. Semantic left-border signals across answer classifications (`.ask-answer.ask-declined` with `--warn` amber, `.ask-answer.ask-fallback` with `--rule-strong`, `.ask-answer.ask-ready` with `--accent`).
  - 3. Interactive polish and high-contrast focus rings for `#open-ask` launcher button with Nebius brand lime.
  - 4. Interactive citation chip elevation and tactile hover/focus states (`.ask-answer .inv-case`).
  - 5. Mobile responsive scaling and touch-target sizing (`@media (max-width: 600px)`: ≥44px touch targets on close button, submit button, and `#open-ask`; 16px textarea font size to prevent mobile auto-zoom).
- Added comprehensive E2E assertions to `e2e/ask-compass.spec.mjs` verifying flex display, scroll containment, semantic left border colors, mobile touch target heights (375px), and citation styles.
- Verification: unit suite 466/466 passed; full Chromium E2E suite 88/88 passed on port 3022.
- Pages updated: frontend/overview.md, log.md.

## [2026-10-20] docs — ATE/FT/WS feature candidates
- Added a proposal with eight candidates, a ranked top five, data/authority boundaries, relative sizes, risks and user assumptions. Prioritizes consumable care and asset readiness; yield, retest and guardband changes remain engineering review workflows. No implementation or policy changed.
- Pages updated: docs/product/ate-feature-proposal.md; this log. Existing architecture pages remain descriptions of implemented behavior.

## [2026-10-21] ui — Per-tile Open in window; console status bar
- Each desktop tile header has **Open in window**, which opens its panel's wall-display page in a separate window (`tiling.js` `displayHref`; mapping in `PANELS[*].screen`). The tile stays in the workspace.
- The console view ends with a status bar (room, clock, run state, speed, last poll result). The workspace now has a bottom margin instead of running to the viewport edge.
- E2E: `e2e/status-bar.spec.mjs` (desktop margin, phone width, failed-poll recovery) and a new case in `e2e/tiling.spec.mjs`.
- Pages updated: frontend/overview.md.

## [2026-10-21] docs — Ask Compass decline investigation
- Reproduced the user's ordinary obstruction questions being classified as hidden-truth requests by `caus` word matching, plus descriptive stop/transfer false positives. Documented the advice/status mismatch, unsupported-claim validation reproduction and bounded fix/regression handoff for Claude; did not change implementation or UI.
- Pages updated: backend/assistant.md, docs/product/ask-compass-decline-findings.md; this log. Original deployed answer evidence was not fetched; synthetic validation-gap proof is explicitly separate from incident truth.

## [2026-10-21] a11y — Status bar and tile controls accessibility pass
- Accessible live region for status bar poll state: separated visual timestamp updates in `#status-bar-sync` from screen-reader live announcements (`#status-bar-live`, `.sr-only`, `role="status"`, `aria-live="polite"`), preventing update floods on poll ticks and announcing only result transitions (connected, failed, restored).
- Non-color visual cues: bold weight on failed status bar text, and inset accent bar (`box-shadow`) on Dockview active tabs so state is never conveyed by colour alone.
- Mobile touch target sizing: enforced 44px minimum height for `.status-bar` and tile action buttons under mobile media queries, guaranteeing zero horizontal scroll.
- Named toolbars and controls: labelled `.tiling-actions` as `role="toolbar"` (`aria-label="Tile actions"`), set panel-specific accessible names and titles on "Open in window" and "Maximise" / "Restore" buttons, and labelled the layout reset button.
- Extended `e2e/status-bar.spec.mjs` (polite live region, state change announcements, 44px phone height) and `e2e/tiling.spec.mjs` (toolbars, accessible names, non-color active tab cues).
- Pages updated: frontend/overview.md, log.md.

## [2026-10-22] fix — Ask public question policy and protected factual claims
- Round 27 distinguishes descriptive public cause/stop/transfer questions from private truth and commands, explains declines, routes procedure questions to recorded catalog options, and requires code-owned cited assignment/timing/retained-event statements. Repair retains the exact two-key schema; extra-field repair is rejected.
- Expanded hermetic Ask evaluation to 28 cases, preserving private-truth probes. No UI/provider changes or live calls.
- Pages updated: backend/assistant.md; docs/evaluation.md.

## [2026-10-24] docs — Investigator history at scale (design note)
- Added `docs/design/investigation-history-at-scale.md`: how the investigator retrieves and grades history, what breaks at hundreds of testers over years, and the storage and retrieval design to settle before integrating with a live maintenance record.
- Recommendation: a relational case store with indexed structured retrieval and full-text search on narratives first; vector search only if a measured narrative-recall benchmark shows the gap. Docs only; no code changed.
- Pages updated: docs/design/investigation-history-at-scale.md; this log.


## [2026-10-24] feature — Station KPI backend (round 28)
- Added deterministic station-ID-hashed rated throughput, validation and load migration, plus a pure shared Live/Offline twelve-hour station KPI projection and room route. Reuses analytics downtime union and compact archived facts; reads never advance either runtime.
- Regenerated the small investigation lifecycle dataset; verified its only change is the new equipment plan field, with outcomes and RNG unchanged. Removed the analytics coverage helper's spread-argument limit for long event histories.
- Hermetic coverage checks alignment, overlap/spanning/open downtime, cutoff, archives, missing coverage, selection/totals, errors, migration/RNG stability and read-only mode isolation. Written UTC boundaries take precedence over the illustrative unaligned fixture; main owns that fixture.
- Pages updated: backend/domain-model.md, backend/overview.md, backend/http-api.md.


## [2026-10-24] feature — Device-based station KPI plan (round 28 follow-up)
- Added an immutable twenty-device module catalog, deterministic station-to-device seeds/migration, device/rate validation, and `deviceId` in station KPI rows. Rates now come from devices; all other KPI contracts remain unchanged.
- Regenerated the small lifecycle dataset and verified only equipment device/plan fields changed. Targeted coverage checks fixture parity, plan-cache nonauthority, device preservation and unchanged RNG.
- Pages updated: backend/domain-model.md, backend/overview.md, backend/http-api.md.


## [2026-10-24] feature — Consumable life pure policy evaluator (round 29, F1 slice 1)
- Added a standalone import-free evaluator with separate lifetime/since-clean balances, exact status precedence, sorted reasons and lifecycle/policy/version/status obligation keys. Unknown counts remain null; reconciliation blocks derived balances. No store, route, UI, clock or simulation integration.
- Added hermetic tests for every acceptance item, including cleaning/replacement independence, equality boundaries, reordered data, future cleaning cutoff, unknown/decreasing counters, determinism and rejection of hidden/invalid input fields.
- Pages updated: backend/domain-model.md, backend/overview.md.
## [2026-10-24] feature — Station KPI panel frontend (Round 28)
- Implemented the Station KPI panel (`frontend/station-kpis-view.js`, `frontend/station-kpis.css`) according to `docs/design/station-kpi-panel.md`.
- Displays 3-hour bucket metrics in a 12-hour window (actual output, planned expected units, attainment percentage, downtime minutes, issues raised) and totals row/card across selected stations.
- Registered workspace panel in Dockview (`frontend/tiling.js`) and phone workspace navigation (`frontend/workspace-nav.js`).
- Added per-viewer in-memory station filter (search, All, None, checkbox selection) and window navigation (Latest, Previous 12 h, Next 12 h disabled at Latest, recent windows select).
- Displayed explicit "DERIVED_FROM_UPTIME" source label and provided loading, empty, and forced-failure error states with retry affordance.
- Responsive views: desktop table (≥901px / 1280px) and phone cards (≤900px / 375px with 4 stacked buckets per card) with zero horizontal scroll and touch targets ≥ 44px.
- Verified in dedicated test suite `e2e/station-kpi.spec.mjs` against synthetic fixture `fixtures/station-kpis/response-12h.json`.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] feature — Station KPI panel ATE and device rate labels (Round 28 follow-up)
- Updated Station KPI panel headers and cards to display ATE setup name, `deviceId`, and rated throughput (`ATE 1 · SR1260 · 1,260 UPH` and `ATE 2 · PM0096 · 96 UPH`) per spec section 2.
- Updated synthetic fallback stubs (`DEVICE_CATALOG`, ATE equipment mapping, and UPH formatting helper).
- Updated `e2e/station-kpi.spec.mjs` with assertions for ATE setup names, device IDs, rated throughput strings, and refreshed metric fixture values.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Station KPI rates per ATE device, consumable life and loadboard specs (main agent)
- Stations are ATE setups; units are semiconductor devices with alphanumeric names. Rated UPH belongs to the device (1–10,000, synthetic catalog `fixtures/station-kpis/device-catalog.json`), not the station. `docs/design/station-kpi-panel.md` sections 1, 2, 3, 6 updated; fixture `response-12h.json` now carries `deviceId`.
- Added `docs/design/consumable-life-slice-1.md` (F1 slice 1) and `docs/design/loadboard-checkout-slice-1.md` (F3 slice 1, round 30).
- Merged codex round 28 follow-up and round 29 (`5f9ce57`, merge of codex branch): device catalog in station KPIs, consumable life evaluator. Merged gemini round 28 follow-up. Verification on master: `npm test` 497/497; E2E 98/98 on port 3024; deployed `5f9ce57` healthy; `/api/control-rooms/plant-1/station-kpis` returns READY on the deploy server.
- Pages updated: this log; docs/design specs; handover.md merge log and round 30 assignments.


## [2026-10-24] feature — Loadboard checkout pure transitions (round 30, F3 slice 1)
- Added import-free checkout, timestamp/request-ID-ordered batches, and release with copied inventories. All failing eligibility rules are returned; exact program compatibility and HELD board/cell conflicts are deterministic, and release preserves history.
- Added hermetic acceptance coverage for competing requests, compatibility/condition/location gates, every failure code, release/re-checkout, determinism, input isolation and invalid/hidden field rejection. No route, store, clock, model, UI or runtime integration.
- Pages updated: backend/domain-model.md, backend/overview.md.
## [2026-10-24] quality — Phone and desktop audit of existing panels (Round 29)
- Audited all eight existing panels (staffing, investigation, map, issues, events, context, analytics, and station KPIs) at 375px (phone) and 1280px (desktop) viewports.
- Enforced zero horizontal scroll across page and panel containers at 375px and 1280px.
- Upgraded interactive controls to satisfy >= 44px touch targets on phone (<= 900px) in `frontend/layout.css` across topbar tabs, simulation controls, search buttons, staffing summaries/inputs, investigation buttons/overrides, map controls, event feed buttons, context panel tabs/summaries/selects, analytics section nav/summaries, and station KPI filter checkboxes.
- Verified all interactive controls across panels have valid accessible names (aria-label, labelledby, or text).
- Verified all text content across panels satisfies WCAG AA contrast ratio >= 4.5:1.
- Added comprehensive audit test suite `e2e/phone-audit.spec.mjs` (5/5 tests passing).
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] test — Station KPI panel E2E hardening (Round 30)
- Hardened `e2e/station-kpi.spec.mjs` against spec section 5 of `docs/design/station-kpi-panel.md`.
- Added test verifying live Station KPIs rendering directly from real backend endpoint `GET /api/control-rooms/:roomId/station-kpis` without route mocking.
- Added test verifying keyboard-only filter interaction (`Enter` to open, `Tab` traversal, search input, `Space` toggle, `Escape` dismissal to summary).
- Fixed grammatical pluralization in totals row and cards (`1 station` vs `N stations`) in `frontend/station-kpis-view.js`.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 30 merge and round 31 assignment (main agent)
- Merged codex round 30 (loadboard checkout slice 1) and gemini rounds 29–30 (phone audit, Station KPI E2E hardening) as `ffd7eb7`. Verification: `npm test` 511/511; E2E 105/105 on port 3024; deployed `ffd7eb7` healthy; `/station-kpis` returns 200 on the deploy server.
- Approved `docs/design/consumable-life-slice-2.md` for round 31 (codex) and assigned a read-only loadboards panel (gemini, stub-first).
- Pages updated: this log; handover.md merge log and round 31 assignments.

## [2026-10-24] feature — Loadboards inventory panel and E2E suite (Round 31, F3 UI)
- Created read-only Loadboards panel (`frontend/loadboards-view.js`, `frontend/loadboards.css`) registered as a workspace Dockview tile and phone workspace view (`Boards`).
- Lists loadboards with `boardId`, `revision`, `condition` (`SERVICEABLE`, `UNDER_REPAIR`, `QUARANTINED`), location (`cellId` or `In store`), approved programs pills (`approvedPrograms`), and held status (`heldBy` or `Available`).
- Implemented real-time text search filtering across board ID, revision, cell location, programs, and reservations, plus condition dropdown filtering.
- Implemented responsive desktop table layout (≥901px) and mobile stacked card layout (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px.
- Built stub-first against read contract `GET /api/control-rooms/:roomId/loadboards` with deterministic synthetic fallback, empty/reset state, and forced-failure error/retry state.
- Registered panel in Dockview layout (`frontend/tiling.js`), phone navigation (`frontend/workspace-nav.js`), responsive styles (`frontend/layout.css`), and SPA controller (`frontend/app.js`, `frontend/index.html`).
- Added full E2E test suite in `e2e/loadboards.spec.mjs` (7/7 tests passing). Verified against `npm test` (511/511) and full E2E suite (112/112).
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 31 gemini merge, deploy and round 32 assignment (main agent)
- Merged gemini `73ce39f`: read-only Loadboards panel on route stubs (the endpoint is round 32 codex work). Verification: `npm test` 511/511; E2E 112/112 on port 3024. Deployed `73ce39f` healthy; the root page and `/station-kpis` return 200 on the deploy server.
- Assigned round 32: codex loadboards read endpoint; gemini obligations panel (stub-first) and loadboards accessibility tightening. Codex's round 31 (consumable slice 2) is still in progress in its worktree, not yet READY.
- Pages updated: this log; handover.md merge log and assignments.


## [2026-10-24] feature — Durable consumable obligation episodes (round 31)
- Added pure reconciliation, strict immutable obligation history, deterministic empty-array migration and a counter-source-change runtime hook through normal room journal writes. Missing/uncertain readings never discharge due work; repeated cleaning episodes preserve closed history.
- Added private current counter input packets and a persisted digest because the design did not name a source field; no ingest route, ordinary Issue/dispatch mapping or UI was invented. Shared internal operation remains API-free in Offline. Source/state contract choices are recorded in docs/decisions.md.
- Pages updated: backend/domain-model.md, backend/live-runtime.md, backend/overview.md.


## [2026-10-24] feature — Read-only loadboards room endpoint (round 32)
- Added a pure public inventory builder and GET /api/control-rooms/:roomId/loadboards, shared across Live/Offline without advancing clocks or writing state. Missing private inventory returns an empty list; only current HELD reservation IDs are linked, with unrelated metadata excluded.
- Reused the pure checkout inventory validator and added hermetic empty/held/room-error, projection privacy, immutable read and Offline API-free checks. No frontend/E2E files or mutation routes changed.
- Pages updated: backend/http-api.md, backend/domain-model.md, backend/overview.md.
## [2026-10-24] feature — Consumable obligations panel and loadboards tightening (Round 32, F1 slice 2 UI)
- Created read-only **Obligations** panel (`frontend/obligations-view.js`, `frontend/obligations.css`) registered as a Dockview tile docked alongside staffing, station KPIs, and loadboards, plus phone workspace view (`Life`).
- Displays consumable obligations rows (`docs/design/consumable-life-slice-2.md` §5) with `obligationId`, `kind` (`CLEANING`, `REPLACEMENT`, `RECONCILIATION`), `status` (`OPEN`, `CLOSED`), `lifecycleId`, `policyId@version` (e.g. `probe-card-clean@v1`), `openedAt` timestamp, and `closeReason` (`CLEANED`, `REPLACED`, `SUPERSEDED`, `RESOLVED_BY_READING`).
- Implemented real-time search filtering across obligation ID, kind, lifecycle, policy, and reason with input focus retention, status dropdown filtering (`ALL`, `OPEN`, `CLOSED`), expandable inspection details drawer (`.obl-detail-drawer`), and manual refresh.
- Built stub-first against read contract `GET /api/control-rooms/:roomId/consumable-obligations` with room state sync (`state.consumableObligations`), deterministic synthetic fallback, and robust loading, empty, and forced-failure error/retry states.
- Implemented responsive desktop table layout (≥901px) and mobile stacked card layout (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px.
- Tightened **Loadboards** panel: added keyboard-reachable inspect action buttons, expandable drawer (`.lb-detail-drawer`), and focus preservation across typing and condition dropdown changes (`e2e/loadboards.spec.mjs`).
- Added full E2E test suite in `e2e/obligations.spec.mjs` (8/8 tests passing). Verified against `npm test` (511/511) and full E2E suite (121/121 passing).
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 31–32 merge, deploy and round 33 assignment (main agent)
- Merged codex rounds 31–32 (`4699195`, `5837170`: consumable obligations reconciler and loadboards read endpoint) and gemini round 32 (`0e8cbf7`: Obligations panel on stubs) as `192b682`. Verification: `npm test` 535/535; E2E 121/121 on port 3024. Deployed `192b682` healthy; `/api/control-rooms/:id/loadboards` and `/station-kpis` return 200 on the deploy server.
- Round 33 assigned: codex loadboard checkout write routes (serialised writes, concurrency tests) and the consumable-obligations read endpoint; gemini check-out and release actions on stubs.
- Pages updated: this log; handover.md merge log and assignments.

## [2026-10-24] docs — Handler jam episodes slice 1 proposal (F4, main agent)
- Added `docs/design/handler-jam-episodes-slice-1.md`: grouping jam alarms into episodes, unplanned stopped time, and a reference-rate deficit gated on matching context. Proposal for round 34; not yet approved.
- Pages updated: this log; the design spec.

## [2026-10-24] feature — Serialized loadboard command routes and obligations read (round 33)
- Added shared Live/Offline checkout/release services and room POST routes through normal store mutations. Timestamps are host-owned, all eligibility reads occur inside the serial queue, replies expose only decision/reasons/reservation, and consumed request identities cannot create duplicate reservations.
- Added the explicit read-only consumable-obligations GET with private source/digest exclusion. Hermetic tests cover concurrent board/cell requests, restart retries, wrong-cell releases, client-body/header guards, rollback/recovery, mode parity, room isolation and read-only public history. Commands journal only changed custody rows; a large-history replay regression checks bounded frames.
- Pages updated: backend/http-api.md, backend/domain-model.md, backend/overview.md.
## [2026-10-24] feature — Loadboard check-out and release actions (Round 33, F3 slice 2 UI)
- Added interactive **Check out** and **Release** actions to the Loadboards panel (`frontend/loadboards-view.js`, `frontend/loadboards.css`) against write contracts `POST /api/control-rooms/:roomId/loadboards/checkout` and `POST /api/control-rooms/:roomId/loadboards/release`.
- For available boards (`cellId === null` and `heldBy === null`), added Check out button with inline/drawer checkout form featuring Station picker (`ATE-1`, `ATE-2`, etc.) and Program picker from board's `approvedPrograms`.
- For held boards, added Release button (`.lb-release-btn`).
- Displays returned `reasons` as plain text next to the row (`.lb-row-reasons`), and refreshes inventory after each action.
- Added polite live region announcement (`#lb-live-announcer`) for checkout/release allocations, rejections, and releases.
- Hardened view event lifecycle: guarded `bindEvents()` in both `loadboards-view.js` and `obligations-view.js` with `setHtml` write status to prevent event listener pileup and toggle bouncing across poll ticks.
- Added comprehensive E2E test suite in `e2e/loadboard-actions.spec.mjs` (6/6 tests passing, verified across 30 repeated runs).
- Verification: `npm test` 535/535 passed; full Chromium E2E suite 127/127 passed on port 3022; ports 3022 and 3122 free.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 33 merge, deploy and round 34 assignment (main agent)
- Merged codex round 33 (serialised loadboard checkout and release routes, obligations read endpoint) and gemini round 33 (check-out and release UI) as `5d8054d`. Verification: `npm test` 546/546; E2E 127/127 on port 3024. Deployed `5d8054d` healthy; loadboards, obligations and station-kpi endpoints return 200 on the deploy server; an empty checkout body returns 400.
- Known: the checkout route has no per-user authentication, consistent with the existing mutation routes. Open for the user to decide.
- Approved F4 slice 1 (`docs/design/handler-jam-episodes-slice-1.md`) for round 34; codex builds the pure module, gemini the stub-first episodes panel.
- Pages updated: this log; handover.md merge log and assignments.


## [2026-10-24] feature — Pure handler jam episodes (round 34)
- Added deterministic alarm episodes, union-based unplanned stopped time, accepted-unit running rate and context-gated reference-rate deficit estimates. Strict validation, immutable inputs and complete trails preserve application-owned evidence without causal claims or runtime dependencies.
- Pages updated: backend/overview.md, backend/domain-model.md; boundary/rounding decisions recorded in docs/decisions.md.
## [2026-10-24] feature — Handler jam episodes and throughput deficit panel (Round 34, F4 slice 1 UI)
- Built the **Handler episodes** panel (`frontend/handler-episodes-view.js`, `frontend/handler-episodes.css`) in the workspace, registered across Dockview tiling (`frontend/tiling.js`), phone workspace navigation (`frontend/workspace-nav.js`, `frontend/layout.css`), and SPA boot controller (`frontend/app.js`).
- Data contract: lists jam episodes with `episodeId`, `reasonCode`, `jamCount`, `unplannedStoppedMinutes`, `classification` (`PATTERN` or `SINGLE_EVENT`), and alarm IDs trail chips (`alarmIds`).
- Deficit display contract:
  - When `deficitStatus === "ESTIMATE"`, displays `Estimate: N units` alongside basis (`referenceUnitsPerHour`, `windowMinutes`, `denominator`).
  - When `deficitStatus === "SUPPRESSED"`, displays `Suppressed:` with suppression reason codes (`PROGRAM_CHANGED`, `SITE_COUNT_CHANGED`, etc.) explaining comparison gate requirements.
  - Strict compliance: never calls deficit "measured" or "measured recoverable production", and avoids causal attribution language.
- Window metrics banner: displays window UTC interval, unplanned stopped minutes, planned stop minutes, running minutes, and accepted units/min.
- Interactive controls: instant search input filtering (preserving focus and selection range across keystrokes), classification select dropdown (`ALL`, `PATTERN`, `SINGLE_EVENT`), manual refresh, reset filters button, and keyboard-reachable episode inspection drawer (`.he-detail-drawer`).
- Responsive layouts: desktop table (≥901px) and phone cards (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px.
- Deterministic synthetic fallback for offline/unmounted state (404), with robust loading, empty, and forced-failure error/retry states.
- Added comprehensive E2E test suite in `e2e/handler-episodes.spec.mjs` (9/9 tests passing).
- Verification: `npm test` 546/546 passed; full Chromium E2E suite 136/136 passed on port 3022; ports 3022 and 3122 verified free.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 34 merge, deploy and round 35 assignment (main agent)
- Merged codex round 34 (handler jam episodes pure module) and gemini round 34 (Handler episodes panel on stubs) as `8b4fa83`. Verification: `npm test` 559/559; E2E 136/136 on port 3024. Deployed `8b4fa83` healthy; loadboards, obligations and station-KPI endpoints return 200 on the deploy server.
- Added `docs/design/calibration-readiness-slice-1.md` (F8 slice 1), approved for round 35: a deterministic cell readiness function and a checkout gate. Correlation evidence stays a separate record.
- Pages updated: this log; the design spec; handover.md merge log and assignments.


## [2026-10-24] feature — Calibration readiness and optional checkout gate (round 35)
- Added import-free calibration selection and conservative readiness, an optional pure checkout gate preserving legacy callers, and a shared read-only room GET at the simulation clock. Private source history stays outside ordinary snapshots; no checkout POST integration or ingestion is added in this slice.
- Pages updated: backend/overview.md, backend/domain-model.md, backend/http-api.md; source ambiguity rules recorded in docs/decisions.md.
## [2026-10-24] feature — Setup calibration readiness chips and checkout gate on Loadboards panel (Round 35, F8 slice 1 UI)
- Implemented setup calibration readiness gate on the **Loadboards** panel (`frontend/loadboards-view.js`, `frontend/loadboards.css`) stub-first against `docs/design/calibration-readiness-slice-1.md`.
- Calibration readiness strip (`.lb-readiness-bar`): displays readiness chips per ATE setup (`READY`, `EXPIRED`, `NO_CALIBRATION`) with clear status text and reasons (`CALIBRATION_EXPIRED`, `NO_CALIBRATION_RECORD`). Clicking a chip opens an expandable instrument calibration details drawer (`.lb-readiness-detail-drawer`) displaying instrument ID, calibration ID, due date, and state.
- Location column mini chip: boards located on an ATE setup display a mini readiness chip (`.lb-cell-chip-mini`) alongside the cell ID.
- Check-out availability gate:
  - For boards whose current cell is not `READY`, the row Check out action is disabled with `aria-disabled="true"` and displays plain text unavailable reason (`Check-out unavailable: <cellId> is <readiness> (<reasons>)`).
  - In the checkout form drawer, selecting an expired or non-calibrated station dynamically surfaces a visible warning notice (`.lb-checkout-station-warning`) and disables the checkout submission button.
- Built stub-first against read contract `GET /api/control-rooms/:roomId/cell-readiness` with decoupled async fetching and deterministic synthetic fallback so missing endpoints never hang rendering.
- WCAG AA accessibility: all chips use text plus status badge styling (no color-only meaning) with verified contrast $\ge 4.5:1$ against light background tokens and keyboard reachability across all interactive elements. Touch targets $\ge 44\text{px}$ on mobile.
- Added dedicated E2E test suite in `e2e/cell-readiness.spec.mjs` (6/6 tests passing).
- Verification: `npm test` 559/559 passed; full Chromium E2E suite 142/142 passed on port 3022; ports 3022 and 3122 verified free.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] feature — Calibration records panel and entry form (Round 36, F8 slice 2 UI)
- Built the **Calibrations** panel (`frontend/calibrations-view.js`, `frontend/calibrations.css`) in the workspace, registered across Dockview tiling (`frontend/tiling.js`), phone workspace navigation (`frontend/workspace-nav.js`, `frontend/layout.css`), and SPA boot controller (`frontend/app.js`).
- Data contract:
  - Table of calibration records with `calibrationId`, `cellId`, `instrumentId`, `calibratedAt`, `dueAt`, and status badge (`CURRENT` / `EXPIRED`).
  - Expandable add calibration drawer (`.cal-add-drawer`) with fields for `calibrationId`, `cellId`, `instrumentId`, `calibratedAt`, and `dueAt`.
  - Client-side validation: verifies non-empty alphanumeric identifiers and checks that expiration deadline `dueAt >= calibratedAt`. Surfaces client-side error before network call if invalid.
  - Plain text server reason display: surfaces server rejection reasons (`res.reasons`) in `.cal-form-error` on `REJECTED` outcomes without closing form.
  - Live region announcement: updates `#cal-live-announcer` with polite status messages upon successful addition, rejection, or refresh.
- Filtering & controls:
  - Instant text search across calibration ID, cell, instrument, and state, retaining input focus across keystrokes.
  - State filter dropdown (`ALL`, `CURRENT`, `EXPIRED`).
  - Empty state with "Reset filters" affordance.
  - Manual refresh button.
- Responsive layout: desktop table (≥901px) and mobile cards list (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px.
- Built stub-first against read contract `GET /api/control-rooms/:roomId/calibrations` and write contract `POST /api/control-rooms/:roomId/calibrations` with deterministic synthetic fallback and offline parity.
- Added dedicated E2E test suite in `e2e/calibrations.spec.mjs` (7/7 tests passing).
- Verification: `npm test` 571/571 passed; full Chromium E2E suite 149/149 passed on port 3022; ports 3022 and 3122 verified free.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 35 merge, deploy and round 36 assignment (main agent)
- Merged codex round 35 (calibration readiness module, read endpoint, optional checkout gate) and gemini round 35 (readiness chips and client-side gate) as `79655af`. A test fix `59529e4` stubs ready cell readiness in the loadboard action E2E flows. Verification: `npm test` 571/571; E2E 142/142 on port 3024. Deployed `59529e4` healthy.
- Gap recorded: the server does not enforce the readiness gate yet; round 36 wires it. Live rooms have no calibration rows yet.
- Assigned round 36: codex wires the server gate, adds the calibration entry route and seeds calibrations; gemini builds the Calibrations panel on stubs.
- Pages updated: this log; handover.md merge log and assignments.


## [2026-10-24] feature — Enforced checkout readiness and manual calibration entry (round 36)
- Checkout now evaluates calibration readiness inside the serialized transaction in both modes. Added strict journaled calibration entry with conflict validation and idempotent retries, read-only explicit ledger GET, and independent synthetic ATE-1/ATE-2 calibration seeds. Regenerated the deterministic investigation lifecycle fixture; only the new calibration seed field changed.
- Pages updated: backend/domain-model.md, backend/http-api.md, backend/overview.md; entry response and existing-room policy recorded in docs/decisions.md.

## [2026-10-24] docs — Round 36 merge, deploy and round 37 assignment (main agent)
- Merged codex round 36 (server-side `CELL_NOT_READY` gate in `loadboard-service.mjs`, serialised calibration entry) and gemini round 36 (Calibrations panel) as `ab2d15f`. Verification: `npm test` 577/577; E2E 149/149 on port 3024. Deployed `ab2d15f` healthy.
- Verified on the server: checkout to ATE-1 is rejected with `CELL_NOT_READY`. Live rooms have no calibration rows, so checkout is blocked until rows exist.
- Assigned round 37: codex seeds calibration rows into existing live rooms by migration; gemini links a blocked checkout to the calibration form.
- Pages updated: this log; handover.md merge log and assignments.


## [2026-10-24] fix — Provision missing existing-room calibrations (round 37)
- Added the explicitly authorized idempotent Live migration for absent/empty calibration history, using room-relative synthetic ATE-1/ATE-2 dates. Nonempty history and expiry remain untouched; persisted-room checkout and restart are covered.
- Pages updated: backend/domain-model.md, backend/live-runtime.md; authorization superseding the round-36 existing-room policy recorded in docs/decisions.md.
## [2026-10-24] feature — Linked blocked checkout to calibration form (round 37, gemini)
- Linked rejected loadboard checkout (`CELL_NOT_READY`) to the Calibrations entry form:
  - When checkout is rejected with `CELL_NOT_READY` or when a board is stationed at an unready cell, displays the readiness reason next to the row along with a keyboard-reachable, labelled action "Add calibration for <cellId>" (`.lb-add-cal-action`).
  - Activating the action opens the Calibrations panel (switching workspace on mobile; activating Dockview panel on desktop), expands the Add Calibration drawer with `cellId` pre-filled, and moves focus to the first form field (`#cal-input-id`) without auto-submitting.
  - Added custom event bridge `compass:open-add-calibration` and controller method `openAddForm({ cellId })` in `calibrations-view.js`.
  - Responsive design with touch targets ≥ 44px on mobile and zero horizontal scroll at 375px and 1280px.
- Added dedicated E2E test suite in `e2e/calibration-link.spec.mjs` (4/4 tests passing).
- Verification: `npm test` 577/577 passed; targeted E2E suites 31/31 passed; full Chromium E2E suite verified on port 3022.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 37 merge, deploy and round 38 assignment (main agent)
- Merged codex round 37 (calibration seeding migration for existing live rooms) and gemini round 37 (blocked checkout links to the calibration form) as `b98629e`. Verification: `npm test` 581/581; E2E 153/153 on port 3024. Deployed `b98629e` healthy.
- Verified on the server: ATE-1 and ATE-2 are READY in plant-1. A checkout to ATE-1 is no longer blocked by calibration; it is rejected only with BOARD_UNKNOWN, because live rooms have no loadboards.
- Assigned round 38: codex adds a board entry route and seeds synthetic boards into existing rooms; gemini adds an Add board form.
- Pages updated: this log; handover.md merge log and assignments.


## [2026-10-24] feature — Manual board entry and existing-room inventory (round 38)
- Added strict shared-mode serialized board entry with duplicate/cell checks, plus idempotent synthetic board provisioning for absent/boardless persisted Live inventory. Existing rows/history are preserved. Regenerated the reproducible investigation fixture; only loadboardInventory changed.
- Pages updated: backend/domain-model.md, backend/http-api.md, backend/overview.md, backend/live-runtime.md; cell registry and reservation-preservation decisions recorded in docs/decisions.md.
## [2026-10-24] feature — Loadboard entry form (round 38, gemini)
- Added an **Add board** drawer (`.lb-add-drawer`) on the Loadboards panel:
  - Toggled via `.lb-toggle-add-btn` with accessible `aria-expanded` and clear focus transitions.
  - Form fields: `boardId` (required text), `revision` (required text), `condition` (select dropdown: `SERVICEABLE`, `UNDER_REPAIR`, `QUARANTINED`), `cellId` (optional text with datalist suggestions), and `approvedPrograms` (comma-separated list).
  - Client-side validation: validates required fields, identifier formats, and program tokens before network calls. Surfaces plain text validation errors in `.lb-form-error` and polite live region.
  - Server interaction: posts payload `{ boardId, revision, condition, cellId, approvedPrograms }` against `POST /api/control-rooms/:roomId/loadboards/boards` returning `{ decision, reasons }`.
  - Plain text rejection display: surfaces server rejection reasons (`res.reasons`) in `.lb-form-error` and keeps drawer open.
  - Stub-first deterministic fallback: gracefully checks duplicate boardId and falls back to local rejection (`DUPLICATE_BOARD_ID`) or acceptance (`ADDED`) when route returns 404 before Codex's backend lands.
  - Live region announcement: updates `#lb-live-announcer` with polite status messages.
- Responsive layout: desktop table (≥901px) and mobile cards list (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px.
- Added dedicated E2E test suite in `e2e/board-entry.spec.mjs` (6/6 tests passing).
- Verification: `npm test` 581/581 passed; targeted E2E suites 37/37 passed; full Chromium E2E suite verified on port 3022.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 38 merge, deploy, smoke-test note and round 39 assignment (main agent)
- Merged codex round 38 (board entry route, board seed migration) and gemini round 38 (Add board drawer) as `51aa694`. Verification: `npm test` 588/588; E2E 159/159 on port 3024. Deployed `51aa694` healthy.
- Smoke test: plant-1 lists the three seeded boards. A checkout of LB-0398 to ATE-1 was ALLOCATED because my smoke test wrote a real reservation to live state. I released it immediately (RELEASED; board back in store). Recorded so the live state history is understood.
- Review follow-ups assigned to codex in round 39: the migration edge case with orphaned reservations, the obligation reconciler wiring check, and the F8 correlation record (separate, not gating). Gemini: audit of the panels from rounds 31–38.
- Pages updated: this log; handover.md merge log and assignments.


## [2026-10-24] fix — Orphan custody safeguard and independent correlation facts (round 39)
- Migration now refuses orphan HELD reservations before seeding; the shared inventory validator also rejects them. Confirmed the existing scheduled server obligation hook and its hermetic changed-counter regression. Added pure append-only correlation validation and shared-mode serialized entry, with no readiness effect.
- Pages updated: backend/domain-model.md, backend/overview.md, backend/http-api.md, backend/live-runtime.md; correlation packet contract recorded in docs/decisions.md.
## [2026-10-24] fix — Audit and harden rounds 31–38 panels at 375px and 1280px (round 39, gemini)
- Audited the five panels added in rounds 31–38 (Obligations, Loadboards with Add board drawer, Calibrations, Handler episodes, Station KPIs) across mobile (375px) and desktop (1280px):
  - Verified zero horizontal scroll across all 5 panels at 375px mobile and 1280px desktop.
  - Verified touch targets >= 44px across all interactive controls in all 5 panels on mobile (resolving clickable label boundaries for station KPI selection checkboxes).
  - Verified accessible names across all interactive controls (buttons, links, inputs, selects, textareas).
  - Fixed WCAG AA text contrast: darkened `.he-deficit-tag` background from `#22c55e` to `#166534`, lifting contrast with white text from 2.28:1 to 8.01:1 (well above the 4.5:1 threshold).
  - Added Escape key dismiss handlers returning focus to their respective triggers:
    - `.lb-checkout-form` dismisses and focuses `.lb-checkout-btn[data-board-id]`.
    - `.lb-readiness-detail-drawer` dismisses and focuses `.lb-readiness-chip[data-readiness-cell-id]`.
    - `.lb-detail-drawer` dismisses and focuses `.lb-action-btn[data-board-id]`.
    - `.cal-add-form` dismisses and focuses `.cal-toggle-add-btn`.
    - `.obl-detail-drawer` dismisses and focuses `.obl-action-btn[data-obligation-id]`.
    - `.he-detail-drawer` dismisses and focuses `.he-action-btn[data-episode-id]`.
  - Added dedicated E2E audit suite in `e2e/panel-audit-r39.spec.mjs` (6/6 tests passing).
- Verification: `npm test` 588/588 passed; full Chromium E2E suite 165/165 passed on port 3022; port 3022 cleanly released.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 39 merge, deploy and round 40 assignment (main agent)
- Merged codex round 39 (migration refuses orphaned HELD reservations; append-only correlation records) and gemini round 39 (375/1280 px audit of rounds 31–38 panels) as `b2f6228`. Verification: `npm test` 594/594; E2E 165/165 on port 3024. Deployed `b2f6228` healthy. GET-only smoke test: all endpoints 200, no live-state writes.
- Codex confirmed the obligation reconciler runs in `runScheduledTick`, covered by an existing test.
- Assigned round 40: codex correlation read endpoint; gemini correlation records section in the Calibrations panel.
- Pages updated: this log; handover.md merge log and assignments.


## [2026-10-24] feature — Correlation read path and migration-refusal review (round 40)
- Added explicit shared-mode correlation GET in append arrival order, with empty/append-prefix/read-only/readiness and invalid-result POST regressions. Added a persisted-store refusal test proving repeated migration failures leave bytes unchanged and another room can load independently.
- Pages updated: backend/domain-model.md, backend/http-api.md, backend/overview.md, backend/live-runtime.md.
## [2026-10-24] feature — Correlation records section and append form (round 40, gemini)
- Added a **Correlation records** section below the calibration table in the Calibrations panel (`frontend/calibrations-view.js`, `frontend/calibrations.css`):
  - Displays comparison observation rows (`correlationId`, `cellId`, `instrumentId`, `referencePartId`, `observedAt`, `result` with PASS/FAIL/INCONCLUSIVE badges) with WCAG AA compliant contrast.
  - Features prominent plain-text notice: "Evidence only: Reference-part comparison observations compare instrument measurements against golden standards. These records provide diagnostic evidence only and do not affect cell calibration readiness."
  - Implemented append-only form drawer (`.cal-add-corr-drawer`) toggled by `.cal-toggle-add-corr-btn`, containing client-side validation for required identifiers, timestamp, and result, with polite live region announcements (`#cal-live-announcer`) and plain text error displays on 400 rejection.
  - Strictly no edit or delete controls provided across rows or cards.
  - Full keyboard accessibility: Escape key dismisses form and returns focus to `.cal-toggle-add-corr-btn`; Cancel and Close buttons return focus to toggle button.
  - Built stub-first against read contract `GET /api/control-rooms/:roomId/correlation-records` and write contract `POST /api/control-rooms/:roomId/correlation-records`, with deterministic synthetic fallback for offline/404 mode.
  - Responsive layout adapts between desktop table (≥901px) and mobile cards list (≤900px) with ≥44px touch targets and zero horizontal scroll at 375px and 1280px.
- Added dedicated E2E test suite in `e2e/correlation-records.spec.mjs` (6/6 tests passing).
- Verification: `npm test` 594/594 passed; calibrations & panel audit E2E suites 13/13 passed; full Chromium E2E suite 171/171 passed on port 3022. Port 3022 cleanly released.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 40 merge, deploy and round 41 assignment (main agent)
- Merged codex round 40 (correlation records read endpoint) and gemini round 40 (correlation section in the Calibrations panel) as `08c3b58`. Verification: `npm test` 597/597; E2E 171/171 on port 3024. Deployed `08c3b58` healthy. GET-only smoke test: all endpoints 200.
- Assigned round 41: codex handler jam inputs (append-only alarm, run and planned-stop entry) and the handler episodes read route; gemini ATE terminology pass on the new panels.
- Pages updated: this log; handover.md merge log and assignments.


## [2026-10-24] feature — Handler jam input routes and aligned episode projection (round 41)
- Added private append-only handler facts, deterministic empty migration, shared serialized alarm/run/planned-stop entries with atomic optional context, exact no-op retries and read-only three-hour episode GET. The pure calculator remains unchanged. Regenerated the reproducible fixture; only handlerJam changed.
- Pages updated: backend/domain-model.md, backend/http-api.md, backend/overview.md, backend/live-runtime.md; context packet and interval boundaries recorded in docs/decisions.md.
## [2026-10-24] refactor — ATE terminology pass on Station KPIs and Handler episodes panels (round 41, gemini)
- Performed terminology pass in visible labels only across Station KPIs and Handler episodes panels, matching `docs/design/station-kpi-panel.md` §1 where "station" refers to a physical ATE setup:
  - In `frontend/station-kpis-view.js`:
    - Updated eyebrow from "Station throughput" to "ATE setup throughput".
    - Updated filter summary and trigger aria-label to "ATE setups (N of M)" and "Filter ATE setups".
    - Updated station search input placeholder and aria-label to "Search ATE setups…" and "Search ATE setups".
    - Updated options list aria-label and empty search label to "ATE setup list" and "No matching ATE setups".
    - Updated empty state text to "No ATE setups selected" / "Select at least one ATE setup using the filter above…".
    - Updated table column header from "Station" to "ATE setup".
    - Updated desktop table footer and mobile totals card headers from "Totals (N station[s])" to "Totals (N ATE setup[s])".
    - Kept panel title "Station KPIs", DOM IDs (`#station-kpi-heading`), data attributes (`data-station-id`, `data-kpi-station`), and CSS classes unchanged.
  - In `frontend/handler-episodes-view.js`:
    - Updated header eyebrow from "Station Operations · F4" to "ATE Setup Operations · F4".
    - Preserved raw identifier rendering (`HANDLER-A`), `.he-station-badge`, and data attributes.
  - In `e2e/station-kpi.spec.mjs`:
    - Updated assertions matching visible text for totals summaries ("Totals (2 ATE setups)", "Totals (1 ATE setup)") and empty state ("No ATE setups selected").
- Verification: `npm test` 597/597 passed; targeted E2E suites (`e2e/station-kpi.spec.mjs`, `e2e/handler-episodes.spec.mjs`, `e2e/panel-audit-r39.spec.mjs`, `e2e/phone-audit.spec.mjs`) 27/27 passed; full Chromium E2E suite 171/171 passed on port 3022. Port 3022 cleanly released.
- Pages updated: project-state/frontend/overview.md; this log.

## [2026-10-24] docs — Round 41 merge, deploy and round 42 assignment (main agent)
- Merged codex round 41 (append-only handler jam inputs, handler episodes read route) and gemini round 41 (ATE terminology pass) as `d6587a6`. Verification: `npm test` 604/604; E2E 171/171 on port 3024. Deployed `d6587a6` healthy. GET-only smoke test: all endpoints 200.
- Added `docs/design/changeover-readiness-slice-1.md` (F5 slice 1, the M precursor): a deterministic per-changeover readiness check that reuses F3 and F8, with kit and crew reported as unknown. Approved for round 42.
- Assigned round 42: codex pure changeover readiness module; gemini changeover readiness panel, stub-first.
- Pages updated: this log; the design spec; handover.md merge log and assignments.
