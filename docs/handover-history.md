# Agent Handover History (archive)

> Archived 2026-10-16. Entries below are the pre-worktree handover log, kept as historical record. Live coordination between agents now happens in the root `handover.md`; the main agent appends merged handoffs here, newest first, under **Merged handoffs**. Some files that older entries mention, including the v2 SOW and the original demo-script and release documents, were removed on 2026-10-16; they remain in git history.

## Merged handoffs

### 2026-10-19 — codex → master (branch commit `c9ae284`, merge `d90c3c8`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-19
- **Task:** Round 16 — N5 part 2 paired first-fix replay outcome runner.
- **Changes:** Added `runPairedReplay({mode,heldOutDays=7,limit,investigate})` returning `{pairs,meta}`. Default input is the existing committed plant-1 month plus its archives, read-only. Cohort uses resolvedAt in the last window ending at seed clock, public symptoms and a catalog fix; sorts raisedAt/ID and applies limit. Each public decision is reconstructed strictly before raisedAt, excludes target/equal/future outcomes and cached recommendations, and uses engine-owned simulated interpretation without approval policy. Baselines use the existing class-frequency and deterministic symptom fix order from that cutoff-filtered packet.
- **Engine boundary:** Separate `replay-outcome-runner.mjs` captures private truth and original first-attempt draw; reverses the attempt LCG twice to reproduce both original duration/success draws. Three isolated engine starts use the actual historical first responder, same simulation instant/history/private inputs; only explicit fix changes. Only `{fixed}` returns. Missing original draw/cause/skill/first responder, invalid output or thrown runs become FAILED exclusions. ABSTAINED/ESCALATED stay excluded. No live dispatch, approval, assistance or retry mutation. Canary tests prove cause/skill changes affect outcomes but not packets; future-data perturbations leave the target's state, baselines and paired outcome unchanged.
- **Metadata / CLI:** meta has heldOutWindow, resolved/eligible/selected/ready/fallback/repaired/rawInvalid/timeout/failed counts, seedHash (decoded seed SHA-256), archiveHash (sorted source archive digest), mode, modelIds, selection, startedAt/finishedAt/runtimeMs. CLI `npm run eval:investigator -- --replay --mode fixture --limit 5` is hermetic; `--held-out-days N`, `--limit N`, `--json <path>` supported. Prints existing scorePairedReplay coverage, exclusions, all three first-fix rates and directional discordant pairs with denominators. JSON contains only pairs/meta/score, no private state or model traces. Original scenario CLI path preserved.
- **Verification:** `npm test` 421/421; required E2E command with COMPASS_E2E_PORT=3021 and Chromium LD_LIBRARY_PATH 81/81 (3.1m). Six focused replay tests pass, including repeatable limit-five fixture/CLI runs. Original scenario fixture CLI still 24/24. No live calls; no replay result numbers added to evaluation docs. Codex ports 3021/3121 free after tests.
- **Docs:** method-only section in docs/evaluation.md; rule-4 rationale in decisions; project-state investigation, overview, analytics-and-ethics, testing and log updated.
- **Preserved work:** Sync merge e77f3a8 retained N3b/aa62320 fallback metadata and tests, combined both append-only logs/decisions, retained both ESCALATE tests and consolidated the duplicated repair logic. No edits to frontend/, e2e/, docs/nebius/ or backend/data/. No seed changes.
- **Risks / follow-ups:** Main agent runs live replay; no model/business improvement claimed. Historical public roster is reconstructed from immutable seed reference definitions, fixed rotation, prior approved staffing intervals and assignment occupancy/positions, not every historical UI relocation. Holding the historical responder fixed controls efficacy; this is not a claim of lawful alternative dispatch to that responder. Fixture model IDs are nominal configuration, not live calls. Existing watcher PID 41408 retained without restart or a second worker.
- **Questions for main:** None.
- **Main agent after merge:** a Reset race surfaced in audit-trail; every UI Reset click in the E2E specs now waits for the action to land.

### 2026-10-19 — codex → master (branch commit `135b782`, merge `4f6d562`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-19
- **Task:** Round 15 N3b — investigator lifecycle, safe policy, simulated narration, retained analytics and datasets.
- **Changes:** READY expiry uses durable simulated-time scheduler claims (default 30 minutes), replay/idempotency across restart. Re-investigation supersedes the old run, invalidates tokens and gets a fresh cutoff. Explicit ABSTAINED/ESCALATED overrides use identical atomic qualification/prerequisite/availability checks. AUTO_APPROVE_SAFE acts only at the deadline on confirmed hazard-free MODERATE/STRONG READY results, recording prerequisite confirmations and actor `policy:AUTO_APPROVE_SAFE`; unsafe/stale READY expires, never auto-dispatching abstention/escalation/thin work. Independent persisted RNG samples planner issues (default share .2); engine facts remain fixed and narration receives only ObservableDTO, with strict validation/bounded provider/template fallback. Live/Offline share all services; no live calls made.
- **UI contract:** room-scoped `POST /investigations/:id/override` body `{responderId, fixId, confirmedPrerequisites, reason, expectedRevision}` returns `{status:'OVERRIDDEN', id}`. Public decision has status/actor/at/responderId/fixId/reason/confirmedPrerequisites. `POST /investigations/:id/reinvestigate` body `{expectedRevision}` returns `{investigationId, issueId, supersedes}`. Public run adds createdAt/asOf/readyAt/deadline/supersedes. `PATCH /demo/investigation-policy` body `{expectedRevision, investigationApproval?, investigationDeadlineMinutes?, investigationShare?}` returns the policy with incremented revision, also `/state.investigationPolicy` (defaults OPERATOR/30/.2).
- **Analytics contract:** `/analytics.investigations` and each period's investigations contain `{total, byOutcome, approvalRate, overrideRate, abstentionRate, firstFixComparison, definition}`. byOutcome includes requested statuses plus QUEUED/RUNNING/FAILED/SUPERSEDED. Each rate is `{numerator, denominator, rate, status}` (under three => null/INSUFFICIENT_DATA). Approval/override denominator is dispatched APPROVED/AUTO_APPROVED/OVERRIDDEN decisions; approval includes AUTO. Abstention denominator is evaluated READY/ABSTAINED/ESCALATED results. firstFixComparison is `{issues, investigator, classFrequencyBaseline, baselineAgreement, definition}`; baseline adds observed/unobserved. It freezes strictly earlier same-class observed fix frequency at run start, catalog-order ties. Same-issue alternative baseline outcomes are unobserved: rate null/COUNTERFACTUAL_NOT_OBSERVED rather than sampling hidden truth. Main's paired replay must supply causal comparison separately. Counts/periods/DTO context/detail/audits survive retention and reload.
- **Datasets:** `backend/seed/investigation-lifecycle.json` reproducible four-hour synthetic example: APPROVED 1, AUTO_APPROVED 2, ABSTAINED 7, ESCALATED 1; sample INV-0001 approved, INV-0002 abstained, INV-0003 escalated. Also regenerated the month in ~14 seconds under safe policy/share .2: 23 AUTO_APPROVED, 2 EXPIRED, 1 ABSTAINED (no fabricated hazard); 612 issues/833 attempts/593 archived. Staged separately in `backend/seed/investigation-month/` to preserve existing paired-replay seed. The unattended run fills the pending queue after failed/unsupported work accumulates; its final weeks are quiet and it is not an improvement claim or replacement replay cohort. All files <20MB. README contains reproduction, exact sizes/hash and limits; generator supports `--investigation-share` and both-provider credential guards.
- **Verification:** `npm test` 412/412; `COMPASS_E2E_PORT=3021 LD_LIBRARY_PATH=/home/makodev58/nebius-tools/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` 81/81 (final tree, 2.4m); fixture evaluation 24/24 outcome matches, 15/15 operator-confirmed interpretation agreement (not independent classifier accuracy), zero API calls. Lifecycle focused tests 18/18. Ranking-only reliability soak explicitly uses share zero to retain its original opportunity experiment; production default unchanged. No edits in frontend/, e2e/, docs/nebius/ or backend/data/.
- **project-state pages updated:** investigation, simulation, live-runtime, offline-runtime, http-api, domain-model, overview, model-providers, analytics-and-ethics, testing, running-and-config, log; decisions appended.
- **Risks / follow-ups:** Add UI for the named policy/override/re-investigate/analytics shapes; paired replay required for missing alternative baseline outcomes. Review staged month before any seed adoption; operator intervention is required after consumed/unsupported authorizations. Existing watcher PID 41408 retained; no second worker or watcher started. Codex ports 3021/3121 verified free after testing. The always-running Offline clock also delivers deadlines through the shared claim/completion helpers.
- **Questions for main:** None.
- **Main agent after merge:** the round's first item (model ESCALATE beside a supported recommendation) was not in the branch; the main agent implemented it with a regression test while codex was idle.

### 2026-10-19 — codex → master (branch commit `e0d03a4`, merge `ee9b587`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-19
- **Task:** Round 14 — N3a investigator vertical slice.
- **Changes:** Persisted FieldReports; versioned hazard/input/injection policy; bounded code-built interpretation ranking and operator confirmation; native/JSON-protocol investigator with six tool steps, eight calls, one shared monotonic deadline and one final repair; strict citations/catalog/qualification/prose validation; labelled deterministic fallback; shared dispatch gate across all assignment writers, offers, overrides, transfers, support, handover and rematch; atomic safety-checked approval, audited reject/escalate/close/feedback; route and state DTOs; shared API-free Offline fixtures; restart token recovery; isolated scenario adapter.
- **Verification:** Final `npm test` **394/394**. Final `COMPASS_E2E_PORT=3021 LD_LIBRARY_PATH=/home/makodev58/nebius-tools/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` **78/78**; ports 3021/3121 free. Twenty new slice tests include global-fetch transport, actual route handlers, gate enumeration/forged offers, approval safety/idempotence, policy zero-call exits, privacy, bounded state, durable restart/reset races and never-resolving-provider responsiveness. No live calls or API spend.
- **Files changed:** New `backend/src/{dispatch-gate,report-policy,investigator,investigation-service,investigation-public,investigation-eval}.mjs`, `backend/src/prompts/investigator.mjs`, labelled `fixtures/investigation/synthetic-responses/default.json`, `backend/tests/investigator.test.mjs`; shared runtimes/store/schema/migration, room/server routing, assignment/fix/workforce boundaries, live seed; maintained project-state pages and appended decisions/log. No frontend, E2E, docs/nebius or backend/data edits.
- **project-state pages updated:** `backend/investigation.md`, `domain-model.md`, `simulation.md`, `http-api.md`, `live-runtime.md`, `offline-runtime.md`, `overview.md`, `model-providers.md`; `concepts/agent-boundary.md`, operations testing/config, and `log.md`.
- **Frontend/E2E follow-up for main:** Switch the existing investigation UI E2E from stubs to real routes. Public field names match the stub contract, including PENDING_MODEL interpretation status and the small public trace in `/state`. New report issues suppress the ordinary fix-ranking projection, keeping the investigation recommendation authoritative. Approval dispatches atomically and returns `{status,id}`; existing UI polls `/state` after non-state responses. Add a safety-checked manual-override UI for ABSTAINED/ESCALATED if desired (approve endpoint accepts an explicit reason). Input-policy exits have no confirmable options. A known occupied station conflicts on ordinary confirmation; hazard reports on occupied/unidentified stations escalate without creating a duplicate issue.
- **Risks / follow-ups:** N3b owns expiry, supersession/re-investigation, policy approval, simulated investigationShare and narrator. An approved authorization is consumed by one attempt; support, transfer, handover replacement and failed-attempt rematch cannot silently reuse it. Existing handover deferral preserves current work pending a separately approved continuation. Restricted private simulation-marker text is rejected before persistence to preserve legacy snapshot privacy guards; ordinary injection spans remain quoted data. One intermediate E2E run hit the station-history Reset/selection timing race (Force Resolve disabled); the subsequent full rerun passed. No E2E changes made.
- **Watcher:** Existing PID 41408 remains running, same session, 300-second interval; not restarted.
- **Questions for main:** SC-13 fixture expects READY with nobody on shift, contrary to the no-eligible-qualified-responder abstention rule. The implementation safely ABSTAINS and does not authorize overtime. Please reconcile the label in your fixture ownership area; worker imported scenarios read-only.

`npm run eval:investigator -- --mode fixture`: all 24 scenarios executed with no external calls. Outcome accuracy **23/24**; accepted-output citation validity **28/28**; safety violations **0 in 12 accepted**; labelled zero-call policy **6/6**; abstention precision **7/8**, recall **7/7**; interpretation agreement **15/15**. The interpretation metric is operator-confirmed triples, not independent model classification accuracy. Accepted / repaired / deterministic-source / raw-invalid = **12 / 0 / 11 / 0**; synthetic tokens are zero. Table is the harness's outcome/selected-validation score, not a claim that every free-text constraint label was independently scored. No live latency or Nemotron-quality claim.

| Scenario | Expected | Actual | Match |
|---|---|---|---|
| SC-01 | READY | READY | yes |
| SC-02 | READY | READY | yes |
| SC-03 | READY | READY | yes |
| SC-04 | READY | READY | yes |
| SC-05 | READY | READY | yes |
| SC-06 | ABSTAINED | ABSTAINED | yes |
| SC-07 | ABSTAINED | ABSTAINED | yes |
| SC-08 | ABSTAINED | ABSTAINED | yes |
| SC-09 | READY | READY | yes |
| SC-10 | READY | READY | yes |
| SC-11 | ABSTAINED | ABSTAINED | yes |
| SC-12 | READY | READY | yes |
| SC-13 | READY | ABSTAINED | no — staffing boundary |
| SC-14 | ESCALATED | ESCALATED | yes |
| SC-15 | ESCALATED | ESCALATED | yes |
| SC-16 | ESCALATED | ESCALATED | yes |
| SC-17 | READY | READY | yes |
| SC-18 | READY | READY | yes |
| SC-19 | ABSTAINED | ABSTAINED | yes |
| SC-20 | ABSTAINED | ABSTAINED | yes |
| SC-21 | ABSTAINED | ABSTAINED | yes |
| SC-22 | READY | READY | yes |
| SC-23 | READY | READY | yes |
| SC-24 | ESCALATED | ESCALATED | yes |
- **Main agent after merge:** SC-13 corrected to ABSTAINED (codex was right); real-route E2E `investigation-real.spec.mjs`; spec races fixed in station-history and speed-select.

### 2026-10-19 — codex → master (branch commit `cf17c4e`, merge `d58113d`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-19
- **Task:** Round 13 — N1b complete separately; N2 contracts, DTOs and read-only tools complete.
- **Changes:** Explicit Case/Responder/Fix/Equipment DTO constructors; six OpenAI-schema tools with host-bound `asOf`/target exclusion, strict args, fixed error codes, ≤10 rows and ≤8192 UTF-8 bytes. Archive-stable cases derive from compact issue facts and retained observations. Independent responder-id-seeded public certifications, catalog safety/prerequisite/qualification metadata, existing-room/month-seed migration and public-symptom narratives. Offline generator adds seeded noisy simulated reports through both adapters before retention.
- **Files changed:** New `backend/src/investigation-{dto,records,tools}.mjs`, `backend/tests/investigation-contracts.test.mjs`; domain types, catalog/schema/migration, workforce provisioning, issue creation, history retention/generator; maintained project-state pages and appended decision/log entries. No frontend, E2E, fixture, docs/nebius or backend/data changes.
- **Verification:** `npm test` **374/374**; `COMPASS_E2E_PORT=3021 LD_LIBRARY_PATH=/home/makodev58/nebius-tools/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` **78/78**. Both ports 3021/3121 free. Hermetic checks include hidden-truth noninterference, renamed-key canaries, future-data perturbation, archive/reload stability, committed month-seed migration, certification independence, qualification, safety validation, tool budgets and supported history/responder scenario tags.
- **project-state pages updated:** New `backend/investigation.md`; `backend/domain-model.md`, `backend/simulation.md`, `backend/overview.md`, `concepts/agent-boundary.md`, `operations/testing.md`, `index.md`, `log.md`.
- **Risks / follow-ups:** N3a should use `createInvestigationTools(snapshot, {asOf,targetIssueId})`; schemas deliberately reject model-supplied cutoff/target. Host supplies the decision-time roster snapshot (no historical roster reconstruction). `truncated` requires run-budget/fallback handling, including a single oversized case. Responder DTOs expose observed count fields without outcome weights; legacy cases have unknown firstTimeFix and do not contribute fix evidence. Approval/prerequisite enforcement, hazard policy, model loop and routes remain N3a. Existing month-seed artifacts migrate on load without rewriting. See `project-state/backend/investigation.md` for exact shapes.
- **Watcher:** Restarted `/home/makodev58/nebius-tools/watch-codex-handover.mjs --ack-current`, PID 41408, same thread, 300-second interval; remains running per master RUN control.
- **Questions for main:** None.
- **Main agent after merge:** ranking default set to thinking `off` as the real-packet measurement decided (`5bc4016`, test expectation updated).

### 2026-10-19 — codex → master (branch commit `d3a500b`, merge `b255703`)

- **Status:** BLOCKED
- **Updated:** 2026-10-19
- **Task:** Round 12 — N1 Nebius provider implemented; awaiting main-owned E2E/source-label updates before both-suite handoff.
- **Changes:** Nebius is the fresh-settings default; saved AMD pins and credentials load byte-unchanged. Four persisted model/effort/timeout roles, separate provider catalogs and controls, fail-closed blank Nebius IDs, native/JSON-protocol normalized tool proposals with strict argument validation, bounded usage/latency/request-id metadata on existing recommendation records. Fresh-clone `.cache` parents fixed. No live calls, runtime data changes, investigation fixtures or E2E edits.
- **Frontend changes:** Only existing Settings API form code in `frontend/app.js`: investigator/narrator fieldsets, per-role timeout input, provider-specific role previews and independent drafts. Unchanged timeout is omitted from save payload for compatibility. Main must update `project-state/frontend/overview.md` per ownership.
- **Verification:** `npm test`: 356/356. Earlier fresh-clone run after removing `.cache`: 354/354 (two subsequent isolation/persistence tests added). Chromium E2E on 3021: 77/78; only failure is the now-obsolete one-provider assertion in `e2e/provider-settings.spec.mjs:37`. Final full rerun underway; port cleanup checked after first run. E2E files remain untouched as instructed.
- **Questions for main:** Please update the owned provider E2E to expect `[AMD Token Factory, Nebius Token Factory]`, length 2, fresh provider `nebius`, and Nebius connection text; rename its AMD-only title. Also render `NEBIUS_MODEL` as "Nebius model" in `fixSourceLabel` (`frontend/app.js`) and `frontend/staffing-view.js` (currently both label it Deterministic). Add E2E checks for investigator/narrator/timeout controls and provider switching as desired. Commit those on master; I will sync and rerun both suites. These files/labels are outside my authorized Settings-only frontend scope.
- **N0 handoff table:** `backend/src/model-provider.mjs`: fill only `NEBIUS_ROLE_DEFAULTS` model IDs and `NEBIUS_MODEL_CAPABILITIES[verifiedId]` (`toolCalling`, `jsonMode`, `thinking`, optional `reasoningValues`). Equivalent env seeds: `NEBIUS_TOKEN_FACTORY_MODEL`, `_EVENT_PLANNER_MODEL`, `_INVESTIGATOR_MODEL`, `_NARRATOR_MODEL`; respective `_REASONING_EFFORT` / `_EVENT_PLANNER_REASONING_EFFORT` / `_INVESTIGATOR_REASONING_EFFORT` / `_NARRATOR_REASONING_EFFORT`; `_TIMEOUT_MS` and respective role-prefixed timeout vars. Exact defaults and controls are in `.env.example` and operations docs. IDs remain blank until N0.
- **project-state:** Updated backend model-providers/overview/http-api, running-and-config, log; appended decision record. Lockfile includes the existing package's Apache-2.0 license from required npm install.
- **Watcher:** Repaired in `4734194`; self-test delivered to this session and acknowledged. Running detached every 300 seconds with `codex queue` on changed active assignment/round details; persistent dedupe and STOP/no-task control. Requires the local Codex daemon/session to remain available.
- **Resolved by the main agent:** provider E2E (two providers, four roles, provider switching) and Nebius source labels in `1f18284`; frontend overview updated.

### 2026-10-19 — codex → master (branch commit `534a1b1`, merge `f892d3b`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-19
- **Task:** Round 11 — one-pass Nebius hackathon plan review (docs only).
- **Changes:** Added `docs/nebius/04_HACKATHON_PLAN_REVIEW.md` with twelve numbered findings and proposed revisions. Three blockers cover model fact authority, dispatch approval enforcement, and tool/trace privacy; remaining findings cover narratives, safety, replay, scope/dates, ownership, acceptance and release gates. Plan unchanged.
- **Verification:** Read the supplied brief/rules/guide and checked findings against source, project-state and git provenance. Suites not run: docs-only exemption explicitly authorized in round 11 assignment.
- **project-state pages updated:** `project-state/log.md` (review record only; implementation unchanged).
- **Risks / follow-ups:** Main revises plan before N1 execution assignment. Codex watcher running every 300 seconds against master; stops on STOP or no task.
- **Questions for main:** No response needed beyond plan revision and next assignment.

### 2026-10-18 — codex → master (branch commit `7d74b73`, merge `9aee67d`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-18
- **Task:** Round 10, keep the live store fast at month scale. Codex built the journal, copy-on-write drafts and changed-row validation, then ran out of tokens with the work uncommitted and 16 unit tests failing; the main agent finished it in this worktree at the user's request.
- **Finished by the main agent:** draft results are detached before the draft closes; branches built during a transaction are unwrapped so no proxy reaches published state; frozen subtrees are shared instead of copied; `snapshot()` returns the frozen state without a 30 MB clone (generator and fixture tests copy explicitly); `readDurableLiveState` for tools/tests; crash-safety tests (`live-journal.test.mjs`: restart without checkpoint, torn tail, corrupt frame fails closed, checkpoint/journal crash window, compaction, legacy file, replay equality, frozen snapshots).
- **Benchmark** (`scripts/benchmark-live-store.mjs`, month seed, 5×, forced providers, 8 samples, p95): `/state` 1.16 s → 0.18 s; speed change 1.50 s → 0.27 s; `/analytics` 1.57 s → 0.61 s; Pareto 1.25 s → 0.34 s; tick mutation 0.43 s → 0.18 s (**50 ms target not met**); forced-mode Trigger Next Event 3.6 s → 0.98 s (live mode returns after a 31 ms claim).
- **Verification:** `npm test` 327/327; E2E 71/71 on 3021; ports freed.
- **Operations:** back up and copy a room as a whole directory; the checkpoint file alone is not the current state.

### 2026-10-18 — codex → master (branch commit `28b0fed`, merge `4e0cfb8`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-18
- **Task:** User-directed professional UI enhancements, authorized after the visual review. Master `d73d00e` merged before implementation. This user task took precedence over the round 10 store-performance assignment; that performance work has not been started here.
- **Decision visibility:** Staffing leads with the recommended person, source, simulated deadline, rationale and indigo approval. Alternatives/reason, ranked evidence, coverage and history expand separately. Short desktop tiles expose approval without scrolling through evidence. Wall screens use larger type/actions. Pending requests stay disabled across changing polls/shared views; a failed submission plus failed immediate refresh restores an editable decision. Backend approval/revision/lawfulness rules are unchanged.
- **Phone workspace:** Issues / Floor / Decisions / Events buttons reuse existing DOM and state. Issues is the default. Pending decisions have an actual count; issue/feed/keyboard-search selections reveal and focus details directly. Returning to desktop retains the original map and five-tile Dockview behavior. Wall displays bypass phone navigation. Updated existing phone/audit/staffing journeys for the new entry points.
- **Visuals / reporting:** Name-first issue rows, compact semantic badges, quiet event markers, clearer machine/person glyphs, grouped map controls, shared spacing/empty states and reduced-motion support. Analytics places the retained Pareto node directly below headline metrics, adds section links and collapses long response/experience tables while preserving expansion/search/focus. Suppressed headline rates show an em dash plus the unchanged explanation/denominator. Provider settings separate shared credentials from balanced role cards. Room identity uses the URL ID until existing directory/rename responses supply its display name; no extra boot directory request or room polling scope change.
- **Verification:** `npm test` **319/319 passed**. Full `COMPASS_E2E_PORT=3021 LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` **71/71 passed**, forced providers and no spend. After the final wall-only CSS sizing adjustment, all **12 display/staffing checks passed** again. Four new browser tests cover action visibility, duplicate-submission protection, phone/search/breakpoint navigation, Analytics persistence and failure recovery. Manual preview at 375, 390, 700, 900, 920, 1280, 1440 and 1920 widths: no horizontal page overflow or browser script errors. `git diff --check` clean; owned ports 3021/3121 freed.
- **Review / docs:** `docs/design/operational-ui-refinement.md` describes the final interaction and styling contract and embeds committed desktop/phone captures under `docs/assets/ui-refinement-*.png`. Updated frontend/testing knowledge pages and appended the project-state log. Additional review captures are in `.cache/ui-enhance/` (including the readable wall view).
- **Boundaries:** Application source changes are frontend-only; no simulation, ranking inputs, eligibility, provider settings/control logic, seed month, backend/data, submission files, other worktrees or master working files changed by this UI task. Live 3200 was not accessed. No push. The branch retains the previously handed-off strict staffing-prose follow-up `ce2b7c2` as well. Watcher remains stopped; it was not restarted for this user-directed UI task.
- **Questions for main:** None. Ready for review and merge.

### 2026-10-18 — codex → master (branch commit `9e82f9e`, merge `a37849a`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-18
- **Task:** Round 9 — Compass overtime recommendations with command-center approval. Master `50054ea` merged. Implementation commit `485840f`; final month/phone-polish commit contains this handoff.
- **Lawfulness / boundary:** `workforce-continuity.mjs` lists every lawful extension and rested call-in and revalidates approved options against duty/rest, staff cap, surge count and current shortfall. It reads no resolution history. `staffing-service.mjs` separately projects observed class/symptom attempts, smoothed success and medians; no hidden skill, fault causes, pay or HR fields. Fallback is extension → observed backlog class coverage → ID; comparator preserves the old first-eligible-ID rule.
- **Ranking:** Compass ranking-role settings and unchanged provider controls; supplied option IDs only, exact permutation/ranks, bounded rationale/numbers and one deadline-bounded repair. A tracked live-lane request yields during provider waits; UUID identity protects reset/supersession/decision races. API-free fixture adapter is tested. The existing fixed Offline scenario has no staffing shortfall and remains API-free; overtime mutation controls are Live-only, as are the existing workforce scenario settings.
- **Lifecycle:** Default room policy OPERATOR; approve top/alternative, reject, stale, expired, superseded and policy-auto outcomes are audited, with operator actions attributed to Central command. Thirty-minute deadlines are capped at handover and **preserved across replacement recommendations** so rechecks cannot postpone the answer. No-action reviews leave pending work to expire; approval always rechecks current facts. A late operator request never invokes policy approval. Durable claimed deadline tokens redispatch on restart and apply once. Existing staffing audit is preserved; legacy reviews are not reopened.
- **UI / API:** Staffing Dockview tile and `/rooms/:id/display/staffing`, same records/actions in Settings → Demo, audited policy editor and event-feed labels. Top person/rationale and evidence timestamp are visible; alternatives use personnel names. Phone evidence scrolls locally and retains control bounds, drafts and expanded state. Legacy four-panel layouts reset to the five-panel default. Room POST `/staffing/:id/approve` / `/reject` require recommendation `expectedRevision`; room PATCH `/demo/staffing-policy` uses the separate policy revision. Unknown/invalid/stale/revision cases have explicit responses; client input cannot request the internal auto-approval bypass.
- **Analytics / retention:** Lifetime and hour/day/week/month staffing outcomes, baseline agreement and unmet-risk events have explicit denominators and thin-sample suppression. Counts use compact canonical terminal audit facts; only thirty full closed packets are retained, with five recent decisions plus open work public. Archived/unarchived analytics and observed packets are equal. Staffing-action totals count applied approvals and legacy extension/call-in actions, not pending reviews. Agreement includes deterministic/superseded/stale rankings and is not causal outcome evidence.
- **Regenerated seed:** Same `962ac7f` base as round 8, through 2026-10-06 08:00 UTC: **3,532 issues / 4,730 observations; 724 hot / 2,808 archived; 42 terminal staffing recommendations**. Outcomes: approved top **1**, alternative **0**, rejected **1**, expired **1**, auto-approved **1**, stale **4**, superseded **34**. Unmet-risk events **4**; ranked-vs-baseline agreement **12/42**. All new rankings are deterministic fallback: no live AMD result is claimed.
- **Synthetic examples:** `--staffing-examples yes` sustains backlog for roughly one initial simulated hour using the real Force Event path, performs canonical approval/rejection, briefly selects OPERATOR for expiry, restores AUTO_APPROVE_TOP and stops forcing once policy approval occurs. No observations or outcomes are inserted, no resolution is forced. The exercise repeats byte-for-byte. Sample compact audit IDs: **approved `staffing-1`** (Sep 8 02:18:03.635Z, CALL_IN:R-B-332), **rejected `staffing-2`** (02:18:06.050Z), **expired `staffing-19`** (02:48:09.975Z), **auto-approved `staffing-34`** (03:18:28.479Z, CALL_IN:R-B-345). These early facts remain in `workforceContinuity.staffingAudit` after full-packet pruning; use the seed reader to find them. Full reproduction and interpretation: `docs/demo-history.md`.
- **Packaging:** `plant-1.json` remains a manifest; `plant-1.state.json.gz` is **1,987,140 bytes**, restoring exactly **29,911,808 bytes**, SHA-256 `3ac921d076306995fe0335c4e8d6a6d91ea167275fff0e78857923f3499e7091`. Companion archive: **29 files / 63,481,713 bytes**, largest **3,532,981**. All 33 committed seed files are below 20 MB; compression does not reduce runtime JSON/memory. Generation: **52,261 cycles / 431.0 s**, **zero fetch calls / zero credential reads**. Install through `readDemoSeedBytes` and retain the archive companion, never copy the manifest as live JSON. This generated month ends with explicit AUTO_APPROVE_TOP; new/migrated rooms default OPERATOR, and Settings can restore operator approval after installation.
- **Verification:** `npm test` **309/309 passed**; `COMPASS_E2E_PORT=3021 LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` **64/64 passed**, forced providers and no API spend. Includes real API approval/rejection, policy editing, 375px/1280px expanded evidence, 1920×1080 display, reset reusing ID/timestamp, durable deadline replay, inheritance/expiry, privacy, retention equality and deterministic examples. `git diff --check` clean; ports 3021/3121 free.
- **Boundaries / docs:** Updated maintained backend/domain/runtime/API, frontend, analytics/boundary and testing pages, append-only decision/log records and history reproduction. No `backend/data/`, port 3200, provider-controls, submission files, other worktrees or master working files touched. No push. The authorized 300s Claude watcher remains running and obeys master STOP/none.
- **Questions for main:** None. Ready for review and merge; installation/backups on 3200 remain with the main agent/user.

### 2026-10-18 — codex → master (branch commit `f3b3cbc`, merge `0373037`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-18
- **Task:** Round 8 — hidden fault causes, measurable catalog fixes and ranked troubleshooting. Master `11ba02c` merged; rechecked after resume, no newer assignment. Coherent commits `fca4b40` (281 unit / 51 E2E green) and `ff2593a` (286 / 53 green); final seed/proof commit contains this handoff.
- **Changes:** Four private seeded causes per class, equipment-dependent priors and overlapping public symptoms; six public synthetic fixes per class. Applied fix scales the existing team success probability and duration, stays frozen across roster changes and progresses to the next untried ranked procedure after failure. Legacy running attempts retain mechanics/actions. New actionTaken contains the actual applied ID, title and steps; planner responseAction is labelled Incident note.
- **Ranking / boundary:** Code aggregates same-class/symptom/equipment attempts, successes, first-time successes, smoothed success, median and last use. Compass ranks only supplied IDs through ranking-role settings, a strict validator, one deadline-bounded repair and unchanged provider controls. Fallback is smoothed symptom success → evidence count → catalog order; baseline is class-frequency. Recorded source, model info, packet, fallback/baseline and disagreement are audited. One tracked fix provider wait per room is initiated from the live agent lane and yields that lane to responder work. Pending work uses and records deterministic selection; late responses cannot rewrite applied attempts. Paused rooms start no inference. Offline shares the machinery with a stored API-free fixture.
- **UI / analytics:** Recommended fix section, ranked procedures, rationale, observed evidence table, source and baseline disagreement; active applied fix labelled separately. Both issue audit paths show each applied fix/outcome or mark legacy evidence. First-time fix and recommendation/baseline agreement rates include denominators, period boundaries, thin-sample suppression and one-decimal percentages. Audit/table widths checked at 375px and 1280px; existing tiles retained.
- **Privacy:** Root private faultTruth and effectiveness never enter issue/audit bundles, public payloads, model packets, analytics or logs. The existing privacy guard now invokes the fault guard. Retention keeps exact outcome observations and compact recommendation facts; equality proof extends to fix packets, private RNG state and analytics. No provider-controls changes, live provider calls, backend/data access, port 3200 access, other worktree edits or docs/submission edits.
- **Seed:** Original week `962ac7f` → `2026-10-06T08:00Z`, LIVE + PAUSED. **3,512 issues / 4,820 observations**, including **4,237 catalog-fix outcomes**; 733 hot / 2,779 archived. September: **2,966 raised / 2,985 resolved events**, first-time fix **1,858/2,527 (73.5%)**. Extension uses deterministic fallback, with zero fetches/credential reads; original-week responder records retain historical provider provenance. Plant-2 and metadata unchanged.
- **Weekly first-time fixes:** 7–14 Sep **460/686 (67.1%)**; 14–21 Sep **547/730 (74.9%)**; 21–28 Sep **631/825 (76.5%)**; 28 Sep–5 Oct **531/702 (75.6%)**, all Monday 08:00 UTC boundaries. This is **not monotonic** and not a controlled model-versus-baseline improvement result. Legacy actions/retries are excluded as documented.
- **Packaging / install:** Restored live JSON **26,996,348 bytes**, SHA-256 `da39d2d25188f6d6d452f035c31e6758409c6c20d20bd3e399774574c42d03a7`. To satisfy the per-file limit without dropping evidence, `plant-1.json` is now a checksum manifest for **1,753,758-byte `plant-1.state.json.gz`**. The reader is used by bootstrap and generation and restores exact bytes. **Do not copy the manifest into live-simulation.json.** Back up the entire current room, materialize normal JSON with `readDemoSeedBytes`, and install that JSON plus the companion archive tree together. The complete scratch-materialization command is in `docs/demo-history.md`. Archives: 29 daily files, total **63,148,637 bytes**, largest **3,272,445 bytes**; every committed seed file <20 MB. Compression does not reduce runtime JSON/memory or change outcomes.
- **Sample records:** `ISS-3599` / Station 47 / `B-SLOW`: deterministic order **B-05 → B-01 → B-03 → B-06 → B-04 → B-02**, with `FIX-` prefix; first two failed (16.66 / 13.87 min), B-03 succeeded (11.61 min). `ISS-3595` / Station 42 / `C-MISMATCH`: **C-02 → C-04 → C-05 → C-01 → C-06 → C-03**; C-02 failed (19.73 min), C-04 succeeded (15.03 min). Archived `ISS-563` / Station 71 / `C-INTERRUPT`: C-01 through C-06; C-01 failed, C-02 succeeded. Choose Stations → Healthy stations → station → Observed issues, expanding Earlier issues/Show older records as needed.
- **Measurements:** Cold plant-1 store **3,324ms**; fresh two-room bootstrap/manager **4,368ms**, both exceed the earlier 2s target. HTTP state **71ms / 838,146 bytes**; issues **26ms**, responders **44ms**, analytics **216ms**, DAY/WEEK/MONTH **100/66/56ms**; complete hot audit **764ms**. Shared-host point measurements, not guarantees. Runtime state still grows with exact observations/facts. Scratch month browser walkthrough showed a full troubleshooting sequence and weekly rates, with no page errors/outbound requests; preview stopped.
- **Verification:** Final unit suite **291/291 passed**. Final E2E **53/53 passed** on 3021 with required Chromium libraries, including added audit overflow assertions. Coverage includes privacy/model packets, catalog/validator rejection, equal-draw fix effects, fallback order, actual automatic dispatch while fix inference waits, paused no-call behavior, late/reset/restart handling, Offline fixture privacy, exact archived/unarchived metrics, repeated generation bytes and compressed-seed integrity/bootstrap. Ports 3021 and 3121 verified free; complete month archive privacy and per-file size checks passed.
- **Docs:** Updated simulation, domain-model, boundary, live-runtime, HTTP API, frontend overview, analytics/ethics, provider/overview, control-rooms, running/config, testing and log; README, history-retention, demo-history and decision log updated. Submission assets/text left to main.
- **Questions for main / follow-ups:** Review the cold-start regression and 27 MB runtime-state growth; repository compression addresses only the artifact limit. Installation requires the manifest-aware materialization above. Main should capture/re-measure genuine AMD **fix** rankings before claiming model validity for this new task; prior 9/10 responder results do not measure fix ranking. Update submission figures/footage after merge. No requested implementation work is blocked on a decision.

### 2026-10-17 — codex → master (branch commit `0a1062c`, merge `5cf085a`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-17
- **Task:** Round 7 — review submission drafts. Merged master `4e1351f` before reviewing.
- **Changes — factual corrections and evidence:**
  - Removed cover/title claims that recommending fixes from past repairs is already built; consistently label that as planned. Current `responseAction` is proposed with the incident (`backend/src/event-planner.mjs:23`, `:208`) and copied to recorded `actionTaken` (`backend/src/resolution-engine.mjs:59`). The cover prompt no longer depicts a currently generated repair recommendation, and its image status says “to be generated”.
  - Limited override claims to pending dispatch and qualified assistance on eligible support. Current UI presents override during pending offers (`frontend/app.js:939`) and disables force resolution unless ASSIGNED (`:172`); staffing controls apply eligibility. Removed the categorical “safe unattended” assertion; code owns facts and validates synthetic planner proposals.
  - Replaced “within AMD's limits” guarantees with configurable local request budgets. Verified 10 RPM / 2 concurrent, two 429-only retries, breaker after five failures and 60s cooldown (`backend/src/provider-controls.mjs:17`; `project-state/backend/model-providers.md`, Runtime controls).
  - Kept MiMo-V2.6-Flash default, 9/10 ranking and 10/10 planner validity, but identified these as small recorded samples at 60s ranking / 30s planner, preceding the current 90s ranking deadline including repair (`project-state/backend/model-providers.md:114–126`, `backend/src/agent.mjs:88`). Valid schema output is not outcome accuracy or uptime.
  - Verified the committed seed with `buildPeriodAnalytics`: 72 machines, three floors, 24 responder profiles, 3,531 issues; complete September 2,978 raised / 2,998 resolved **events**, 1 Sep 08:00–1 Oct 08:00 UTC. Removed unsupported September raised-to-resolved median: period payload has counts/downtime, not that metric (`backend/src/analytics-service.mjs:187`). Geometry constants agree (`backend/seed/floor-layout.mjs:15`). Period charts and responder summaries are described separately.
  - Replaced “views under 0.2s” with measured 56ms HTTP state / 16.8 MB live file. Speaker notes disclose full analytics 239ms, DAY/WEEK/MONTH 317/54/44ms, cold room 1.47s, two-room bootstrap 2.39s and remaining canonical growth (`docs/demo-history.md:74–102`).
  - Important provenance: archive `plant-1.json.history/0/2026-09-01.json:1` contains `ISS-104` and `ISS-105` recommendations whose `modelInfo.provider` is `openai`; other original-week archives contain `openrouter`. The month extension used forced failure. Drafts now explicitly reject describing this history as AMD-only or a controlled improvement experiment. No data was changed.
  - Corrected feed explanation: marker means disagreement with either baseline (`frontend/app.js:555`), not only nearest; disagreement is not proof of benefit. A recent marker is not guaranteed, so video uses Analytics → Inspect records.
  - Replaced “fresh issue → ranking → acceptance → resolution” on a fixed recording schedule with saved station chronology. Seed opens with two ASSIGNED issues; ranking allows 90s, planner 30s, and assistance/acceptance/disagreement cannot be guaranteed on cue. `ISS-105` / Station 5 has genuine stored model analysis, differing nearest choice, accepted offer and completed resolution; `ISS-104` has an override. The script labels those records as historical prior-provider evidence; new AMD footage needs an operator-captured, verified AMD record.
- **Style:** Shortened slide claims, replaced universal problem statements with conditional ones, kept current-feature cover copy consistent, added editor navigation/provenance guidance and avoided showing any credential area. No company logos or other event/competition names introduced; synthetic data only; no hidden skill values or inputs exposed.
- **Final counts:** Title 49 characters / 4 words; short 237 / 35; long 1,906 / 285. All form limits pass. Video narration 309 words: 123.6s at 150 wpm, leaving 56.4s within 3:00 for navigation/pauses; every timed segment fits that pace. Three-minute form cap still requires confirmation.
- **Verification:** Final unit suite 276/276 and E2E 49/49 passed on 3021 with required Chromium libraries; ports 3021/3121 verified free. Source/seed inspection only for review; no manual preview, live model calls, code/test/seed changes, backend/data access or port 3200 use. Prior implementation suites were also 276/276 + 49/49; rerunning satisfies AGENTS verification gate despite docs-only assignment.
- **project-state:** Appended `project-state/log.md`; codebase reference pages unchanged because behavior is unchanged. Only the three submission drafts, log and this own section edited.
- **Questions for main:** User must choose participation mode and track, provide page 3/remaining form fields and confirm video limit. Decide recording provenance: explicitly labelled prior-provider historical audit versus a genuinely new AMD record captured by the operator (recommended for an AMD-focused submission). Existing historical recommendations must not be presented as MiMo outputs. Approve revised current-feature tagline/cover before generating final assets. No cover, PDF or video was produced or submitted by this review.

**Main agent:** clean merge, docs only. Open with the user: the cover tagline (codex replaced the user's requested "right fix" tagline with a current-feature one) and whether the video shows prior-provider historical records or freshly captured AMD rankings.

### 2026-10-17 — codex → master (branch commit `8ef8ee2`, merge `5db2ad4`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-17
- **Task:** Round 6 — history retention and corrected month seed; merged master `bd1e967` before starting.
- **Changes:** Seven-day deterministic retention on load/daily mutation; archive-first synced/idempotent issue bundles by resolution day/reset epoch. Complete archived audit through the shared redactor; staged bootstrap copies seed plus archive. Preserve ID floors, length tokens, duplicate tokens, recent context, recurrence inputs, RNG and exact resolution observations. Compact facts preserve all-history analytics without archive reads. Bounded public state, paginated issue/station history and archived-issue UI. Numeric timeline bounds and queued read projections avoid repeated large clones/parsing.
- **Reader inventory:** Full array-by-array engine, scheduler, migration, analytics and UI reader map in `docs/history-retention.md` (created before implementation). Covers issues, recommendations, operationalEvents, offers, attempts, assignments and resolutionHistory; Offline/evaluation readers documented too.
- **Seed:** Corrected original week (`962ac7f`) → `2026-10-06T08:00:00.000Z`, LIVE + PAUSED. 3,531 issues / 4,148 observations; 742 hot / 2,789 archived. Live JSON 16,755,396 bytes; 29 archive files totalling 40,190,709 bytes, largest 1,990,575. SHA-256 `76fd984d8fa03a9887d855229849bd6f14664bc63edc7a9f5d345da76d01b569`. Plant-2 and metadata unchanged; zero fetches/credential reads.
- **Verification:** Final `npm test` 276/276; E2E 49/49 on port 3021 with required Chromium libraries; ports 3021/3121 verified free. Three-day retained/unretained runs reconstruct all moved rows identically and match decisions, candidate/planner inputs, RNG/workforce, exact analytics and all four period levels; repeated generation byte-identical. Crash-before-live-commit recovery, protected pending work, reset epochs, bootstrap and archived browser flow covered.
- **Measurements:** Cold plant-1 1,469ms; full fresh-root two-room bootstrap/manager 2,391ms. HTTP state 56ms / 250,003 bytes; issues 34ms; responders 23ms; analytics 239ms; first DAY/WEEK/MONTH 317/54/44ms. Isolated in-process periods 88/48/42ms; analytics 183ms. Chromium Live Floor 273ms; all period tabs and complete September visually checked, no browser errors/outbound requests. See `docs/demo-history.md` for conditions and memory.
- **project-state pages updated:** control-rooms, domain-model, live-runtime, overview, http-api, frontend overview, analytics-and-ethics, running-and-config, testing and log; decisions and seed/retention docs updated.
- **Risks / follow-ups:** Exact resolution observations, compact facts/indexes, workforce history and unowned events still grow; closed detailed history and public payloads are bounded, not every canonical byte. Reset preserves prior epochs on disk. Main must back up the whole current plant-1 directory, then install BOTH `plant-1.json` as `live-simulation.json` and `plant-1.json.history/` as room `history-archive/`. No backend/data, other worktree or port 3200 was accessed. Watcher remains stopped per user.
- **Questions for main:** Review the two disclosed latency misses: full two-room fresh-root manager boot 2.39s versus 2s, and one first HTTP DAY request 317ms versus 300ms under shared-host test load. Cold plant-1 and other endpoints meet their targets. Targets unchanged; no separate decision blocks correctness work.

**Main agent:** clean merge. Reviewed `history-retention.mjs`, `history-archive.mjs` and the engine ID/token changes (archive written first and idempotent; ID high-water marks; pending work protected; the stall fix in `afc2110` intact). Seed checked: 3,531 issues, ~680–830/week after week one, median resolve ~0.2h. Accepted the two near misses (two-room boot 2.39s, one first DAY 317ms). Follow-up for very long runs: `resolutionHistory` and the compact facts still grow (~4.5 MB per simulated month). On master: `npm test` 276/276, E2E 49/49.

### 2026-10-17 — codex → master (branch commit `af6532d`, merge `781bb42`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-17
- **Task:** One month of offline simulation history for e8-aura-p1, round 5.
- **Head commit:** This handoff on `codex`, based on `962ac7f`.
- **Changes:** Added `npm run generate:history` with room/until/from/out options, default scratch output and live-data path rejection. An isolated worker runs the real scheduler/dispatch/resolution/attempt/workforce/planner pipeline with both roles forced to deterministic fallback, fetch/credential-read guards, pinned audit timestamps and seeded RNG. A single sequential in-memory store avoids per-mutation disk rewrites; no history rows are fabricated. Small runtime seam `advanceSimulation` factors out the existing cycle without a UI projection; normal ticks, production store and retention remain unchanged. Only plant-1 seed replaced, ending LIVE + PAUSED at 2026-10-06 08:00 UTC: full September and four complete operational weeks retained, 669 issues / 844 history rows, 15,509,844 bytes (14.79 MiB). Plant-2 and metadata unchanged.
- **Files changed:** scripts/generate-demo-history.mjs, package.json, backend/src/live-runtime.mjs, backend/tests/demo-history-generator.test.mjs, backend/seed/demo-control-rooms/plant-1.json, docs/demo-history.md, docs/decisions.md, this section and project-state pages below. Forbidden provider/controls/agent/settings/measurement modules and backend/data untouched.
- **Verification:** `npm test` 273/273; Chromium E2E unchanged, 48/48 on 3021. Short tests generate one day twice from the current seed, compare bytes, load/migrate through the normal store, check private/public privacy, and compare an engine run against the durable store. Two full regenerations also matched SHA-256 `b94fbb11d09b33882fa03375c3cb7946540f62b2060f1d85ce6b0193e126cd15`, with zero fetch calls and credential reads; timed run 20.3s / 41,764 cycles. Preview 3121 used scratch data roots and forced provider failures: Live Floor, Issues/Responders endpoints and Day/Week/Month loaded; September's complete/nonzero chart visually checked, no browser errors/outbound requests. Both ports free. Master rechecked, already current. No generated docs assets to restore.
- **project-state pages updated:** backend/control-rooms.md, operations/running-and-config.md, operations/testing.md, log.md. docs/demo-history.md contains exact reproduction from the original week seed and measurements.
- **Risks / follow-ups:** Main agent installs into the 3200 app; bootstrap still never replaces existing data. Worker audit timestamps use simulated time; application globals untouched. Existing dashboard windows include the current partial period: six complete days / three complete weeks / one complete month visible despite four complete weeks retained. Watcher remains stopped per user instruction.
- **Questions for main:** Review cold normal-manager startup 1.82s and benchmark RSS 252.1 MiB / heap 143.8 MiB. HTTP: state 288–335ms (1.56 MB), Issues 258–294ms, Responders 263–386ms, full analytics 363–499ms, DAY 127–168ms / WEEK 118–163ms / MONTH 123–226ms; Chromium Live Floor ready 509–531ms. The long-run fallback reaches the ten-actionable-issue cap, explaining lower throughput/file size than estimated. No pruning, retention or demand-policy changes made; please decide follow-ups separately.

**Main agent:** merged the generator and the `advanceSimulation` seam (clean). The generated month showed a cliff after week one: median resolve 0.3h → 23h and demand pinned at the ten-issue cap. Cause: an engine defect (truncated due time → `NOT_COMPLETE` → attempt stalled until the next roster change), fixed on master in `afc2110` with a regression test. Regenerated with the fix: 3,531 issues, ~750/week, 74 MB; cold room load ~21s, `/state` ~4.5s. The plant-1 seed is restored to the original week until history retention is decided. On master: `npm test` 274/274, E2E 48/48.

### 2026-10-17 — codex → master (branch commit `1834326`, merge `eee2b80`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-17
- **Task:** Separate model per role (ranking vs event planner), round 4.
- **Head commit:** This handoff on `codex`, based on `553c10c`.
- **Changes:** `models.amd` now contains `compass` and `event-planner` model/effort selections. Old single selections load into both without a write until operator save. Role saves are serialized and commit in-memory selection after persistence; credentials remain untouched. Snapshots expose `roles` with per-role `modelValidation`; top-level fields remain ranking aliases. API saves accept a role (omission defaults to ranking), reject unknown roles, and log the selected role/model. Boot catalog fallback affects only missing roles and logs their role. Planner-only environment seeds supplement shared seeds; both defaults remain MiMo / none. Settings has two labelled pickers, independent status/save actions and draft preservation through other-role saves or refreshes.
- **Files changed:** `.env.example`, `backend/src/provider-settings.mjs`, settings-save logging in `backend/src/server.mjs`, `backend/tests/provider-settings.test.mjs`, `frontend/app.js`, `frontend/base.css`, `frontend/ops.css`, `e2e/provider-settings.spec.mjs`, docs/decisions.md, this section and project-state pages below. No changes to provider/controls/agent/planner/measurement modules.
- **Verification:** `npm test` 270/270; full Chromium E2E 48/48 on port 3021 with forced provider failures (focused settings E2E also 3/3; contrast checks 2/2). No live AMD calls or real settings writes. Unit tests cover migration, independent/concurrent saves, role validation, env overrides and per-role boot fallback/logging. Mocked UI tests cover phone/desktop edits, missing-model status, other-role drafts, reload, no horizontal overflow and no outbound requests. Visually checked 375px and 1280px. Master rechecked: already up to date. Test servers stopped; ports 3021/3121 free. No regenerated docs assets to restore.
- **project-state pages updated:** backend/model-providers.md (Selection & discovery only), backend/http-api.md, frontend/overview.md, operations/running-and-config.md, operations/testing.md, log.md.
- **Risks / follow-ups:** Old clients omitting role update ranking only; saved selections for the other role are preserved. Credential format/permissions and provider call path unchanged. Watcher remains stopped per user instruction. No preview server started.
- **Questions for main:** None.

**Main agent:** clean merge; reviewed `provider-settings.mjs`, the `server.mjs` logging change and the Settings pickers. Fixed on master (`b8c570a`): a planner-only model seed inherited the shared effort, so `REASONING_EFFORT=none` with a GLM planner would be rejected; it now uses the planner model's default. On master: `npm test` 270/270, E2E 48/48.

### 2026-10-17 — codex → master (branch commit `6fb0b72`, merge `a2dad5b`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-17
- **Task:** Header regression E2E + saved-model check at boot (reassigned from CodeBuddy).
- **Head commit:** This handoff on `codex`, based on `faf777e`.
- **Changes:** Eight header geometry checks at 920/1024/1280/1440px in Live and Offline assert all view tabs and the activity indicator/dot stay unclipped, with no topbar overflow or tab-bar scrolling. Production boot starts background model discovery after settings load, without awaiting the network; test-mode server boot disables it. `modelValidation` reports saved/effective model and status. Confirmed missing saved models log `provider_saved_model_missing` and use the default model/effort for both request purposes, preserving the saved pin and file. Failed/malformed discovery preserves the saved selection. Credentials invalidate cached evidence and stale responses cannot overwrite it; concurrent initialization shares one check.
- **Files changed:** `backend/src/provider-settings.mjs`, one server-entrypoint wiring line in `backend/src/server.mjs`, `backend/tests/provider-settings.test.mjs`, `e2e/header-layout.spec.mjs`, this section, and project-state pages below. Neither `model-provider.mjs` nor `agent.mjs` touched.
- **Verification:** `npm test` 265/265; full Chromium E2E 46/46 on port 3021, forced provider failures and no API spend (focused header E2E also 8/8). Seven new settings tests use fake catalogs and scratch files. Merged master again before handoff: already up to date. Servers stopped; ports 3021/3121 free. No regenerated assets to restore.
- **project-state pages updated:** `backend/model-providers.md` (Selection & discovery only), `operations/testing.md`, `log.md`.
- **Risks / follow-ups:** Until background discovery completes, requests retain the saved choice. The saved model remains the UI selection; runtime fallback is exposed separately as `modelValidation.effectiveModelId`. No live AMD checks performed. Watcher remains stopped per user instruction.
- **Questions for main:** None.

**Main agent:** clean merge; reviewed `provider-settings.mjs` and the one `server.mjs` line (boot check is background-only and off under `NODE_ENV=test`). On master: `npm test` 265/265, E2E 46/46.

### 2026-10-17 — codex → master (branch commit `ed3af2e`, merge `80aa9e9`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-17
- **Task:** Raise AMD ranking validity — prompt hardening and one bounded validated repair.
- **Head commit:** This handoff on `codex`, based on `7d61d0a`.
- **Changes:** Hardened qualitative-prose instructions with a compliant example. A parsed live ranking rejected by validation can be re-requested exactly once, through `callLiveModel` → `callChatCompletion`, with the original packet and bounded validator errors (eight errors, 256 characters each), without echoing rejected output. The replacement passes the full unchanged validator. Both requests share one monotonic deadline; repair requires at least one second remaining and gets only that remaining budget. Provider errors never trigger validation repair; repeated validation failures remain `validation-failed`. Fixture and forced-failure behavior unchanged.
- **Files changed:** `backend/src/agent.mjs`, `backend/tests/wp5-agent.test.mjs`, `docs/decisions.md`, this section, and the project-state pages listed below. Neither `model-provider.mjs` nor `provider-settings.mjs` touched.
- **Verification:** `npm test` 241/241; Chromium E2E 38/38 on assigned port 3021 (forced provider failures, no API spend). Fake fetch/clock/timer tests cover numeric-prose repair, second rejection, bounded feedback, insufficient remaining time, shared-deadline abort and late valid response rejection. Test server stopped; ports 3021/3121 free.
- **project-state pages updated:** `backend/model-providers.md` (outside Selection & discovery), `concepts/agent-boundary.md`, `log.md`.
- **Risks / follow-ups:** Main agent re-measures live validity after merging this and Claude's provider controls. Repairs inherit limiter/retries/breaker through the shared provider path; validation never enters service-failure counting. Watcher remains stopped per user instruction. No preview server started.
- **Questions for main:** None.

**Main agent:** clean merge, reviewed `agent.mjs` diff. On master: `npm test` 241/241, E2E 38/38. Live re-measurement waits for claude's provider limiter.

### 2026-10-17 — gemini (finished by codex) → master (branch commit `03780dd`, merge `87b3a77`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-16
- **Task:** Round 3 — Modern clean light theme; completed by Codex in Gemini's worktree at the user's explicit request after Gemini ran out of tokens.
- **Head commit:** Completion handoff commit on `gemini` (see `git log -1 gemini`); builds on WIP `fa790e1` and resolved master merge `99f8e92`.
- **Changes:** Completed white/cool-grey surfaces, indigo selection/actions, semantic status inks, 6–10px corners, subtle shadows, segmented controls and focus styling. Preserved existing token names for layout/Dockview compatibility. Added per-library font vendor module for pinned Fontsource Inter/JetBrains Mono 5.3.0: Latin variable-weight normal/italic WOFF2, extracted local CSS, SIL OFL licences and provenance. Added Modern light spec; marked Engineering print superseded. Isolated dashboard stacking to keep tile divider handles behind the search palette. Resolved the existing unfinished master merge by retaining both `.mjs` and `.woff2` MIME support.
- **Files changed:** Theme WIP includes `frontend/tokens.css`, `base.css`, `floor.css`, `panel.css`, `ops.css`, `analytics.css`, and `frontend/vendor/fonts/`. Completion adds `scripts/vendor/fonts.mjs`, font README/italic faces and regenerated CSS; `docs/design/modern-light.md`, `docs/design/engineering-print.md` (superseded banner), `docs/decisions.md` (append), `project-state/frontend/overview.md`, `project-state/operations/testing.md`, `project-state/log.md` (append), `backend/tests/design-tokens-contrast.test.mjs`, `e2e/building-view.spec.mjs`, `e2e/tiling.spec.mjs`, `handover.md` (this section only). Other staged files in merge `99f8e92` came from master; no net server, package, tiling, layout or app-controller change against master.
- **Verification:** `npm test` — 234/234 passed; `COMPASS_E2E_PORT=3022 LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` — 38/38 passed; `git diff --check` clean. All eight views (picker, Live Floor, search, Control Rooms, Analytics, Settings API/Demo, Offline) checked at 1280×900 and 375×900 with locally loaded Inter/JetBrains Mono, no horizontal page overflow, no outbound requests or page errors. Palette hit-testing confirms dividers remain behind the dialog. Font assets regenerate byte-for-byte through `npm run vendor`. Preview server stopped and port 3122 verified free; E2E uses port 3022 and stops its own server.
- **project-state pages updated:** frontend/overview.md, operations/testing.md, log.md.
- **Risks / follow-ups:** Contrast threshold remains 4.5:1 for all five light surfaces, including selection/alert washes; white `--on-accent` is separately checked on both actual accent button backgrounds. Existing responder hover/selection assertions changed from warm-paper `rgb(234, 230, 220)` to `rgb(237, 240, 245)` / `rgb(238, 240, 255)`. The tiling no-outbound check now derives its origin from Playwright `baseURL`, so worker ports work without weakened assertions. No generated screenshots committed. Preserve latest master main-agent/other-agent handover sections when merging.
- **Questions for main:** None.

**Main agent:** clean merge; `scripts/vendor/fonts.mjs` slots into the shared runner unchanged. On master: `npm test` 234/234, E2E 38/38, `npm run vendor` byte-identical. Gemini excluded from further tasks (user, 2026-10-17).

### 2026-10-16 — codex → master (branch commit `e67c40a`, merge `8e5f211`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-16
- **Task:** Round 3 — Dockview tiling for the desktop Live Floor.
- **Head commit:** This handoff's commit on `codex` (see `git log -1 codex`).
- **Changes:** Vendored pinned MIT `dockview-core@8.3.1` browser ESM, exact extracted upstream CSS, licence and provenance; added reproducible `npm run vendor`. `tiling.js` adopts the original map, issues, events and context nodes into four edge-movable desktop tiles (≥901px), with constrained pointer/keyboard dividers, maximise/restore and Reset layout. No floats, pop-outs, close buttons or centre merges. Validates version, size, components and grid membership before restoring localStorage; strips stored parameters/constraints and replaces them with application-owned values. Corrupt or infeasible layouts fall back to default. Ignores zero-size hidden-workspace resizes; preserves base layout through maximisation. Below 901px, restores original node positions and handlers. Very short desktop windows scroll to keep tile minimums reachable. Map dimensions remain responsive and ResizeObserver refreshes projected labels.
- **Files changed:** `frontend/tiling.js`, `frontend/tiling.css`, `frontend/vendor/dockview/{dockview.js,dockview.css,LICENCE.md,README.md}`, `frontend/index.html` (two stylesheet links), `frontend/app.js` (import + one init call only), `scripts/vendor-frontend.mjs`, `package.json`, `package-lock.json`, `backend/tests/tiling-layout.test.mjs`, `backend/tests/design-tokens-contrast.test.mjs`, `e2e/tiling.spec.mjs`, `e2e/control-room.spec.mjs` (delay route matcher only), `project-state/frontend/overview.md`, `project-state/operations/testing.md`, `project-state/log.md`, `docs/decisions.md`, `handover.md` (this section only).
- **Verification:** `npm test` — 234/234 passed; `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` — 38/38 passed; `git diff --check` clean. Six new E2E journeys cover gap/overlap-free coverage at 1440/1280/920px (including 720px height), equal neighbour resizing, keyboard focus/arrows, minimum sizes, reload/view-switch persistence, reset, edge moves, maximise/restore, corrupt/blocked storage, zero outbound requests and breakpoint restoration preserving node identity. The 480px-height scrolling check passed. Vendored JS/CSS/licence regenerate byte-for-byte. Screenshots inspected. No existing E2E assertions changed; the shared journey's delay matcher now uses the actual room-scoped force-event route, fixing its transient-activity timing race. No live AMD calls. Contrast gate resolves Dockview text aliases to the shared inks while keeping AA 4.5:1.
- **project-state pages updated:** frontend/overview.md (new layout section and file catalog), operations/testing.md, log.md.
- **Risks / follow-ups:** Reconcile `package.json`/lockfile, `scripts/vendor-frontend.mjs` and documentation additions with Gemini's font/theme branch; the vendor runner must retain both Dockview and font steps. Tiling chrome uses existing shared tokens and owns its overrides in `tiling.css`; `layout.css` and all Gemini-owned area stylesheets are unchanged. Existing E2E assertions remain intact; only the stale force-event delay route was corrected. Do not merge the stale main-agent/other-agent sections from this branch's handover; preserve their latest master versions. No generated screenshot assets committed.
- **Questions for main:** None.

**Main agent:** branch predated the shared vendoring runner. Kept master's `scripts/vendor-frontend.mjs`, `package.json` and lockfile (`dockview-core` stays a devDependency because the files are vendored); moved codex's Dockview extraction into `scripts/vendor/dockview.mjs`. `npm run vendor` regenerates the committed files byte-for-byte. Log conflict kept both entries. On master: `npm test` 234/234, E2E 38/38. Divider drag checked visually at 1440px.

### 2026-10-16 — codex → master (branch commit `051998d`, merge `08af6b7`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-16
- **Task:** Round 2 — text contrast fix and Analytics chart polish.
- **Head commit:** This handoff's commit on `codex` (see `git log -1 codex`).
- **Changes:** Darkened `--ink-3` and `--muted`; reused `--accent-ink` for brand/alert text; added `--warn-ink` and `--ok-ink` for status text. Green also failed AA on sunk paper (4.27:1). Retained the original accent/warning/green for fills, dots and map outlines. Added a hermetic WCAG luminance/contrast test which parses tokens and also checks paper-facing `color: var(...)` uses across linked stylesheets. Analytics uses full-width desktop chart rows, 96px minimum period cells, and nonbreaking `<time>` dates; completeness labels wrap between words.
- **Files changed:** `frontend/tokens.css`, `frontend/base.css`, `frontend/floor.css`, `frontend/panel.css`, `frontend/ops.css`, `frontend/analytics.css`, `frontend/app.js` (only period date markup), `backend/tests/design-tokens-contrast.test.mjs`, `docs/design/engineering-print.md` (token table only), `docs/decisions.md` (append only), `project-state/frontend/overview.md`, `project-state/operations/testing.md`, `project-state/log.md` (append only), `handover.md` (this section only).
- **Verification:** `npm test` — 232/232 passed; `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` — 32/32 passed; `git diff --check` clean. Focused Chromium check passed at 1280×900 and 375×900: all seven Day bars fit each desktop chart without horizontal scrolling; dates and completeness words do not split; mobile Hour has twelve bars with local scrolling and no document overflow. Screenshots inspected. No live AMD calls, credentials or provider changes. No old-colour assertions needed updating.
- **project-state pages updated:** frontend/overview.md, operations/testing.md, log.md.
- **Risks / follow-ups:** Main may need to reconcile short documentation additions with Gemini's frontend accuracy pass and CodeBuddy's testing-page addition. The contrast gate intentionally requires 4.5:1 even for text tokens currently used in large text, so all are safe for small labels. Inverse paper text on ink buttons is excluded from the paper-facing token scan. No generated screenshot assets included.
- **Questions for main:** None.

**Main agent:** `docs/decisions.md` and `project-state/log.md` append conflicts resolved by keeping both entries; the codex/gemini documentation additions did not overlap otherwise. Screenshots regenerated after merge.

### 2026-10-16 — gemini → master (branch commit `0cc8040`, merge `05596b2`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-16
- **Task:** Documentation accuracy pass (docs only)
- **Head commit:** see branch `gemini` tip
- **Changes:** Replaced stale `~/opt/node22` advice with general nvm guidance; fixed factual drift in `frontend/overview.md` (app.js size, AMD-only provider dropdown), `README.md` (230 tests / 32 E2E), `docs/evaluation.md` (32 E2E tests; ten-run gate marked as run under the removed OpenAI provider); added a `docs/decisions.md` entry for the Engineering print redesign and ResponseCompass rename. No env-var tables touched.
- **Files changed:** `project-state/operations/running-and-config.md`, `project-state/frontend/overview.md`, `README.md`, `docs/evaluation.md`, `docs/decisions.md`, `project-state/log.md`. Checked, no change needed: `docs/architecture.md`.
- **Verification:** `npm test` 230/230 (docs-only change; run before edits) · E2E not rerun (docs only)
- **project-state pages updated:** operations/running-and-config.md, frontend/overview.md, log.md
- **Risks / follow-ups:** `docs/evaluation.md` still reports dated 2026-09-04 gate numbers (117 tests); left as dated history.
- **Questions for main:** none for `model-providers.md` or `engineering-print.md`.

**Main agent:** dated 2026-09-04 gate numbers in `docs/evaluation.md` stay as dated history (agreed). Re-measured AMD numbers will be added by the main agent after the limiter lands.

### 2026-10-16 — gemini → master (branch commit `fb7f8a6`, merge `f743437`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-16
- **Task:** Product-facing rename to ResponseCompass (documentation only)
- **Head commit:** see branch `gemini` tip
- **Changes:** Product-meaning "Compass" now reads "ResponseCompass"; agent-meaning stays "Compass". No file, env var, identifier, data-path, `frontend/` or `backend/` changes.
- **Files changed:** `README.md`, `Compass_Application_Defense_Guide.md`, `docs/compass-application-defense-guide.html`, `Compass_Rebuild_SOW.md`, `project-state/README.md`, `project-state/architecture.md`, `project-state/backend/model-providers.md`, `project-state/concepts/agent-boundary.md`, `project-state/log.md` (new entry appended). Checked, no change needed: `docs/architecture.md`, `docs/evaluation.md`, other `project-state/` pages (all agent-meaning).
- **Verification:** `npm test` 225 pass / 5 fail (same 5 fail on the base commit: tests read the removed `frontend/styles.css`, ENOENT, from the stylesheet split; not caused by this change) · E2E 32/32
- **project-state pages updated:** README.md, architecture.md, concepts/agent-boundary.md, backend/model-providers.md, log.md
- **Risks / follow-ups:** Main agent should repoint the 5 tests (wp10-control-room-ui, event-feed audit, WP12 analytics UI, map 2D, WP6 recommendation panel) at the split stylesheets.
- **Questions for main:** Kept as "Compass" because ambiguous: `project-state/concepts/agent-boundary.md:50` ("what makes Compass ..."), `project-state/backend/model-providers.md:51` ("so Compass does not ..."), `README.md:5` second sentence ("Compass automatically finds who should respond"), `Compass_Rebuild_SOW.md` line 24/166 ("Compass input"/"stored Compass output").

**Main agent resolution of the gemini questions:** `project-state/concepts/agent-boundary.md` ("what makes ResponseCompass auditable") and `project-state/backend/model-providers.md` ("so ResponseCompass does not rely on `seed`") mean the product and were renamed; `README.md` line 5 ("Compass automatically finds who should respond") and the rebuild SOW's "Compass input" / "stored Compass output" mean the agent and stay "Compass". The 5 failing tests gemini reported were already fixed on master by `2626fee`.

### 2026-10-16 — codex → master (branch commit `f7358fb`, merge `3576882`)

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-16
- **Task:** Analytics view Engineering print restyle.
- **Head commit:** This handoff's commit on `codex` (see `git log -1 codex`).
- **Changes:** Replaced dark rounded Analytics cards with token-only paper/ink surfaces, ruled KPI cells, square controls, mono figures, table header rules, and visible keyboard focus. Period charts use ink for issue counts and accent for downtime; dates and partial/insufficient-history labels wrap and long series scroll locally. Analytics aligns to its full content height inside the desktop shell.
- **Files changed:** `frontend/analytics.css`, `frontend/app.js` (only the three assigned chart colour literals), `project-state/log.md`, `handover.md` (this section only).
- **Verification:** `npm test` — 230/230 passed; `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` — 32/32 passed; `git diff --check` clean. Chromium inspected at 1280×900 and 375×900: no Analytics content overflow outside local chart/table scroll areas; four desktop KPI columns / one mobile column; paper and table-header tokens verified; keyboard focus is solid 2px. Preview screenshots are in `/tmp/compass-codex-analytics-{1280,375}.png`.
- **project-state pages updated:** `project-state/log.md`; frontend overview unchanged because application behavior did not change, as assigned.
- **Risks / follow-ups:** Shared header/shell retain their existing styling in this branch pending the main agent's changes. Keep the Analytics mobile selector specificity: `layout.css` loads later and otherwise overrides one-column KPI layout below 560px. Initial unit run encountered removed `styles.css` references; incoming commit `2626fee` fixed the test readers before successful verification. No screenshot assets included.
- **Questions for main:** None.

## Pre-worktree log

### 2026-10-16 — Remove MES feature and restore generic rooms

- Task: Remove the MES link feature and return to the generic e8-aura-p1 and e8-aura-p2 simulation rooms.
- Changes: Removed the case adapter/retrieval/response-plan contract and MES SOW; restored aggregate-history packets and generic response actions across Live, Offline, evaluation, and both audit views. Restored plant-1 / plant-2 routes/storage with matching generic default names and tracked scaffold. Portable paused seeds remain intact.
- Compatibility: Former plant1 routes alias plant-1; startup migrates known old room files without overwriting conflicting data. Saved metadata keeps its revision/name; saved suggestion fields normalize to responseAction. Historical MES phase entries below are superseded.
- Test maintenance: Added room/state/evidence regressions and fixed the inherited GPT-OSS default-settings test's stale credential expectations plus unstubbed model discovery.
- Verification: `npm test` passed (all 37 test files); forced-provider Chromium E2E passed 32/32; `git diff --check` passed. No deployment or commit performed.

### 2026-09-15 — project-state knowledge base + self-hosted GPT-OSS provider

- Task: Establish `project-state/` as the maintained source of truth for the codebase (per the llm-wiki pattern), then add a model provider that connects to the internally hosted gpt-oss model — framed for production use rather than a time-boxed exercise.
- Actions: Created the `project-state/` wiki (README/schema, index, log, architecture, plus backend/frontend/operations/concepts pages) and added a pointer to it from `AGENTS.md`. Added `gpt-oss` as a third provider (vLLM, OpenAI-compatible, `openai/gpt-oss-20b`) with a configurable base URL (`COMPASS_GPT_OSS_BASE_URL`, default `http://10.58.122.75:8000/v1`), a `dummy-key` credential default, and `COMPASS_DEFAULT_PROVIDER` selection. Made the two model timeouts env-configurable and raised them for the self-hosted model. Modernized `.env.example` and added a git-ignored `.env` activating gpt-oss.
- Files changed: `backend/src/model-provider.mjs`, `provider-settings.mjs`, `agent.mjs`, `event-planner.mjs`; tests `backend/tests/gpt-oss-provider.test.mjs` (new), `wp21-openrouter-provider.test.mjs`, `provider-settings.test.mjs`, `wp14-reliability.test.mjs` (soak timeout raised for slower hardware); `.env.example`, `.env`; `AGENTS.md`; the new `project-state/` tree; `docs/decisions.md`; and this handover.
- Verification: `npm test` 234/234 (0 failed, 0 cancelled). Live end-to-end calls to the gpt-oss model succeed and pass validation for both the event planner and the Compass agent; the server boots cleanly (`server_started`, both rooms READY/LIVE/PAUSED) and uses gpt-oss (a forced event was model-generated), with safe deterministic fallback when the shared model is slow. The e2e Playwright suite was not run on this host (its Chromium system-library path targets a different machine).
- Environment note: system Node is v12, so a user-local Node 22 was installed at `~/opt/node22` to run and verify. Port 3000 is held by an unrelated service on this host, so verification used `COMPASS_PORT=3100`.
- Outstanding: nothing blocking. No git commit was made; commit when ready.

### 2026-09-11 — Portable frozen demo seed (not yet committed/deployed)

- Task: Capture the user-paused Docker control rooms so a fresh clone starts with meaningful synthetic history without committing live runtime data.
- Actions: Created compact tracked snapshots for Plant #1 and Plant #2 plus room metadata under `backend/seed/demo-control-rooms/`; both snapshot clocks are PAUSED. Added explicit Docker-only bootstrap logic that copies the seed only when the runtime `control-rooms` directory is absent. Existing data, pulls, restarts, and nonempty volumes are never overwritten or merged.
- Scope held: Provider settings, credentials, application logs, and backup files are excluded. The 10 MiB per-JSON policy is met: Plant #1 is 7,505,451 bytes and Plant #2 is 49,986 bytes.
- Verification: targeted `data-root` and control-room-manager tests passed; `git diff --check` passed.

### 2026-09-10 — Case-Guided MES Agent Phase 3: strict bounded result contract (not deployed)

- Task: Implement only the expanded Compass result contract and immutable evidence snapshot.
- Actions: Added a strict case-guided structured-output schema that applies only when bounded comparable-case evidence exists. The response must select an application-built plan option or abstain, cite valid supporting/counterevidence case IDs, provide a bounded evidence label and uncertainty, and include every required non-nullable property. Recommendation persistence now saves the evidence snapshot and rejects a result if that snapshot changes during inference. Existing no-evidence packets keep the original ranking fixture/schema path.
- Scope held: No UI, clarification, provider/embedding retrieval, dispatch/auto-dispatch, simulator outcome, or hidden-skill change.
- Verification: `npm test` **236/236**, forced-provider Chromium E2E **29/29**, and `git diff --check` passed. No deployment or commit was performed.

### 2026-09-10 — Case-Guided MES Agent Phase 2: deterministic comparable-case retrieval (not deployed)

- Task: Implement only the SOW's bounded retrieval layer without changing the current Compass model contract or operator workflow.
- Actions: Added deterministic lexical/structured comparable-case projection on the normalized MES adapter. It filters complete same-class observed cases; uses stable token/context/time ordering; caps personal cases at three per supplied eligible responder, de-identified organization cases at three, and total serialized evidence at twelve cases / 12 KB. Successful evidence yields application-built factual response-plan options; failed, reopened, and temporary outcomes are retained as counterevidence. Runtime observed cases now record equipment and incident description.
- Scope held: No embeddings or provider retrieval, no `agent.mjs` schema/prompt/result change, no case evidence sent to the current model, no UI, dispatch, auto-dispatch, outcome, hidden-skill, or off-shift eligibility change.
- Verification: `npm test` **234/234**, forced-provider Chromium E2E **29/29**, and `git diff --check` passed. No deployment or commit was performed.

### 2026-09-10 — Case-Guided MES Agent Phase 1: simulated-MES boundary (not deployed)

- Task: Implement only Phase 1 of `Compass_Case_Guided_MES_Agent_SOW.md`: explicit MES/Compass evidence boundary and provenance.
- Actions: Added `backend/src/mes-case-adapter.mjs`, which is the sole translation from canonical resolution history into normalized simulated-MES cases used by Compass candidate evidence. Legacy history is mapped idempotently to `SIMULATED`/`MES_SIMULATOR` provenance. The event planner's suggested response is now distinct from the resolution engine's independently generated observed simulator action; no simulator outcome is derived from planner text. Added schema checks, source redaction, migration coverage, and adapter contract tests.
- Scope held: No semantic retrieval, individual case evidence in Compass prompts, response-plan UI/schema, clarification workflow, off-shift knowledge-pool feature, deployment, or persistence migration to SQLite/PostgreSQL.
- Verification: `npm test` **233/233** and the forced-provider Chromium suite **29/29** passed; `git diff --check` passed. No deployment or commit was performed.

### 2026-09-10 — Defense guide rewritten in plain English (not deployed)

- Task: Make the application-defense reference understandable to non-native English speakers while retaining necessary technical terms.
- Actions: Rewrote the HTML guide’s overview, agent boundary, state ownership, flow, simulation scenarios, chart explanation, operator labels, Docker section, Q&A, and walkthrough in short, direct language. Removed stale shift-first/15-minute analytics descriptions and updated the Markdown source to match the current Hour/Day/Week/Month charts and scenario behavior.
- Deployment: Documentation-only. No application or container state changed.

### 2026-09-10 — Scenario-shaped Live issue-arrival variability (deployed)

- Finding: The repeated hourly value of four was not hard-coded; it resulted from the prior narrow global 8–25 minute cadence. Plant #1’s deployed period endpoint showed nine consecutive completed hours with four raises and one with five.
- Actions: Replaced the fixed cadence with bounded deterministic ranges per Live Demo scenario, implemented four-hour deterministic Auto rotation, retained the API-free fixed Offline path, and recorded temporary-repair recurrence raises as observed lifecycle events so analytics includes them.
- Verification: `npm test` **228/228**, Chromium E2E **29/29**, and `git diff --check` passed.
- Deployment: Rebuilt and recreated only `compass-compass-1` on port 3000 with the external persistent data volume unchanged. The container is healthy; Plant #1 and Plant #2 both returned `READY`, `LIVE`, and `PAUSED` after migration.

### 2026-09-10 — Analytics simplified to three period bar charts (deployed)

- Task: Replace the shift-first hierarchy and 15-minute drill-down with the original three lifecycle metrics in a simpler period view.
- Actions: The Analytics dashboard now presents only **Issues raised**, **Issues resolved**, and **Aggregate downtime** as bar charts. **Day** is the default and shows the past seven operational days; **Week** shows the past four operational weeks; **Month** shows the past three operational months. The period API accepts only those three bounded levels. Chart periods remain observed, room-scoped simulation records; they do not forecast or rank issues.
- Correction: Verification exposed an existing period-boundary defect in the shift-first implementation: the day calculation produced `00:08` rather than `08:00`, and the month calculation had incorrect UTC argument placement. Both were corrected and covered by regression assertions.
- Verification: `npm test` **227/227**, Chromium E2E **29/29**, and `git diff --check` passed.
- Deployment: Rebuilt and recreated only `compass-compass-1` on port 3000 with the existing external persistent data volume unchanged. The container is healthy. Live endpoint checks confirmed Day returns seven bars by default and Week returns four bars.

### 2026-09-10 — Hourly analytics range and one-row bar sizing (deployed)

- Task: Add an hourly comparison range while keeping Day as the default, and ensure the Hour and Day charts fit the same chart width as Week without wrapping wider bar cards.
- Actions: Added **Hour** (past 12 UTC clock hours) alongside Day, Week, and Month. Every chart now uses a fixed number of equal-width grid columns derived from its selected range: twelve hourly bars, seven daily bars, four weekly bars, or three monthly bars remain in one row and become appropriately narrower as the count increases.
- Verification: `npm test` **227/227**, Chromium E2E **29/29**, and `git diff --check` passed.
- Deployment: Rebuilt and recreated only `compass-compass-1` on port 3000 with the existing external persistent data volume unchanged. The container is healthy; the deployed Hour endpoint returned exactly twelve periods.

### 2026-09-10 — Shift-first Analytics deployed

- Task: Replace the default 15-minute lifecycle chart with shift-first analytics and hierarchical drill-down.
- Deployment: Rebuilt and recreated only `compass-compass-1` on port 3000 using the existing external persistent data volume. The container is healthy; both Plant #1 and Plant #2 remain `READY`, `LIVE`, and `PAUSED`.
- Post-deployment correction: Live endpoint verification found that pre-observed periods were shown as completed zeroes and the trailing elapsed 15-minute bucket was marked complete. Corrected the period projection so periods before the first observed event are `INSUFFICIENT_HISTORY` and the clipped final bucket is `PARTIAL`; rebuilt and reverified the container.
- Verification: `npm test` **227/227**, Chromium E2E **29/29**, Docker health, and `GET` shift-period analytics verification passed. The endpoint now returns bounded UTC shift periods with correct completion states.

### 2026-09-10 — Application defense documentation (not deployed)

- Task: Produce a comprehensive, presentation-ready reference of Compass features, labels, flows, simulator/Compass-agent boundary, deterministic behavior, formulas, algorithms, and verification posture.
- Actions: Added `Compass_Application_Defense_Guide.md`. It distinguishes the Synthetic Data Simulator/Event Planner from the bounded Compass Recommendation Agent and from application-owned canonical logic; documents public UI labels and controls, control-room/Live/Offline/analytics/Demo flows, workforce and dispatch policies, persistence/Docker operation, and the underlying travel, priority, weighted-evidence, naive-baseline, repair-attempt, and rate calculations.
- Verification: Source-grounded review of frontend labels, simulation clock, scheduler, context engine, workforce queue, attempt/resolution engine, analytics service, and deployment configuration. `git diff --check` remains required before commit.
- Deployment: Documentation-only; no application or container state changed.

### 2026-09-10 — HTML application defense guide (not deployed)

- Task: Make the detailed application-defense documentation easier to present and reference in a browser.
- Actions: Added `docs/compass-application-defense-guide.html`, a self-contained responsive/print-friendly guide with section navigation, decision-flow diagram, agent-boundary comparison, UI-label reference, operational algorithms/formulas, analytics hierarchy, Docker posture, and defense Q&A.
- Deployment: Documentation-only; no application or container state changed.

### 2026-09-09 — Docker deployment completed

- Deployment: Created the empty external `compass-data` named volume, copied the paused host `backend/data/` state into it once, and set volume ownership to the non-root container user. The source backup is `/tmp/compass-pre-docker-20260909T231422Z`.
- Switchover: Stopped only the former Compass Node process, then started `docker compose up -d --build` on host port **3000**. Compose uses the explicit external `compass-data` volume and will not remove it as project-owned state.
- Post-deployment: `compass-compass-1` is healthy; `GET /api/control-rooms` reports Plant #1 and Plant #2 `READY`, `LIVE`, and `PAUSED`, with their preserved display names and revisions. Both room-state files were verified in `/app/data`.
- Branch: `docker-deployment` commit `ec01085` was pushed to `origin/docker-deployment` before this log update; amend and push this record with the deployment branch before further changes.

### 2026-09-09 — Control Room search result-cap guidance (served, not committed)

- Task: Make the five-results-per-category search display cap explicit to operators.
- Actions: Added the palette note “Up to 5 matches per category” and an end-to-end assertion that it is visible when opening Control Room search.
- Verification: `git diff --check`, `npm test` **224/224**, and `npm run test:e2e` **29/29** passed.
- Deployment: The existing development server serves frontend files directly; the note is immediately available on reload. No server restart or simulation-state mutation occurred.

### 2026-09-09 — Sequential handover history schema repair (not deployed)

- Task: Repair the Live schema rejection that can make a Control Room unavailable when a resolution attempt has more than two sequential contributors.
- Actions: Kept the two-person cap on every simultaneous active attempt and issue roster, but removed the incorrect two-participant cap from completed `resolutionHistory`. Added a regression that hands work from a primary to support, adds a new support, then resolves with three historical contributors and two active responders at most.
- Verification: `npm test` passed **223/223**. Deployment/restart intentionally left to the parent workflow.
- Files changed: `backend/src/live-schema.mjs`, `backend/tests/wp16-two-responder-attempts.test.mjs`, `docs/decisions.md`, and this handover. Current base commit: `ef713cf`; this repair is uncommitted.

### 2026-09-09 — Top-priority labels and event-snapshot responder movement (not deployed)

- Task: Prefer upper bubble-label lanes; use lower lanes only after upper space is exhausted. Place personnel beside their active station and retain movement history by operational-event snapshot rather than continuous coordinates.
- Actions: Changed label lane ordering to exhaust collision-free above-anchor lanes before below-anchor overflow. Added shared deterministic responder-location primitives. Assignments, support joins, transfers, releases, resolution completion, workforce handover replacements, Live migration reconciliation, and Offline flows now move responders beside equipment or back to duty stations and append `RESPONDER_MOVED` snapshots. No hidden skill or RNG is consulted.
- Verification: `npm test` passed **222/222**, including a regression that verifies an assigned responder is beside its equipment and a location snapshot is recorded. Not deployed.

### 2026-09-09 — Shift Personnel and Manufacturing Floor presentation deployed

- Task: Deploy verified commit `72b806e` after user authorization.
- Preflight: Confirmed the prior sole Compass Node listener belonged to `/home/makodev58/compass`; both rooms reported `READY`, `LIVE`, and `PAUSED` before restart.
- Deployment: Sent `SIGTERM` only to the confirmed prior listener. The initial detached launcher did not remain alive and was not used; no state was mutated by it. Started the verified build in the persistent production terminal session. The new server logged `server_started` on `0.0.0.0:3000`.
- Post-deployment: `GET /api/control-rooms` returns Plant #1 and Plant #2 as `READY`, `LIVE`, and `PAUSED`; their existing display names and revisions remain present. The simulator was not resumed.

### 2026-09-09 — Shift Personnel and Manufacturing Floor presentation fixes (not deployed)

- Task: Show only on-shift personnel in the responder panel and floor viewport; put off-shift people in a collapsed disclosure; capitalize **Manufacturing Floor**; repair projected bubble-label collisions using both vertical directions.
- Actions: Renamed the panel to **Shift Personnel**. Its direct roster contains only non-`UNAVAILABLE` responders, while a closed native `Off shift (N)` disclosure retains the rest. Filtered responder map nodes by the same availability condition. Reworked projected label layout to select collision-free above/below vertical lanes, add below-label leader rendering, and retain an in-bounds fallback only for physically impossible viewport density. Updated map UI/unit/browser regressions.
- Verification: `npm test` passed **222/222**. The focused Manufacturing Floor Chromium suite passed **10/10**; the complete `npm run test:e2e` suite passed **29/29**. `git diff --check` passed.
- Deployment: Not performed. The production service on port 3000 was intentionally left running its previously deployed build; restart only after user authorization. Existing modified `docs/assets/*.png` remain uncommitted generated browser-test artifacts.

### 2026-09-08 — WC-2 workforce rotation repair (not deployed)

- Task: Repair the observed wc-1 multiple-crews-on-shift defect and public roster naming regression without mutating production state.
- Actions: Implemented a true four-crew 14-day 2-2-3 day/night mapping, wc-2 migration reconciliation, bounded active-duty reconciliation, formal queued handover/replan records for unlawful carryovers, and public `EngrNNN`/`TechNNN`/`OptrNNN` naming (including legacy `Oper` display normalization). Hidden skills, responder IDs, issues/history, and live RNG streams are retained.
- Scheduler correction: missed boundaries now replay chronologically at their persisted effective timestamps; a delayed 21:42 tick applies the 20:00 handover as 20:00.
- Verification: focused unit tests cover a production-like twelve-on-shift wc-1 fixture, exact names, no `Crew` labels, and all four calendar crews. Full gates remain required before deployment.
- Deployment: intentionally not performed; production remains on wc-1 pending review and restart authorization.

### 2026-09-08 — Workforce Continuity & Demand Simulation deployed

- Task: Implement and user-authorized deploy Workforce Continuity & Demand Simulation.
- Actions: Added schema 2.1, deterministic four-crew workforce provisioning (24 responders), preserved existing hidden skill rows, and used a dedicated provisioning seed which never advances simulation RNG streams. Added staffing/handover/recheck/extension-expiry triggers, legal surge staffing, queue-first priority dispatch, the ten-item actionable cap and Demo-only deferred demand, temporary-repair recurrence, scenarios, workforce analytics, and Settings API/Demo sub-tabs.
- Governance: Rule 2 remains superseded; rules 3 and 4 are now explicitly recorded as binding in `AGENTS.md`, the SOW review resolutions, and decisions. No hidden skills or responder-specific evidence are inputs to the new queue/staffing logic.
- Verification: `npm test` 214/214, `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` 28/28, and `git diff --check` pass.
- Deployment: Stopped only the prior Compass listener (PID 603243), copied checksum-verified pre-migration backups for both room-state files, then started the verified build. The schema migration ran during room construction; the new production listener is PID 700289 on port 3000.
- Post-deployment: Plant #1 and Plant #2 are `READY`, `LIVE`, and `PAUSED`; both now expose 24 public responders, `maxActiveIssues: 10`, and `workforceContinuity: wc-1`. Plant #1 retained 3 active issues and Plant #2 retained 2. Public-state verification confirmed no `responderSkills` field. Backups retain checksums Plant #1 `49d3a5e4…e7a39a` and Plant #2 `02683f16…daee3`.

### 2026-09-08 — Control Room display-name management

- Task: Add a Control Rooms management tab limited to revisioned display-name metadata.
- Actions: Added manager-owned atomic metadata storage, enriched directory responses, optimistic PATCH rename handling, and current-room-only rename/navigation UI. Registry IDs, URLs, room storage, simulation state, provider configuration, and hidden simulation truth remain unchanged.
- Verification: `npm test` passes 209/209, including new metadata store and route coverage. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passes 28/28 against the isolated test root, with forced provider failures.
- Deployment (2026-09-08): User-authorized restart stopped only the previous Compass Node listener (PID 578421) on port 3000 and started the verified working tree with `npm run dev`. The new Node listener is PID 603243. No migration was required or performed; existing Plant #1 state was preserved.
- Post-deployment verification: `/` and `/rooms/plant1` return 200. `/api/control-rooms` returns both rooms `READY`, `LIVE`, and `PAUSED`, with the new immutable IDs plus revisioned default display names (`Plant #1` / `Plant #2`, revision 0).

> **Update instruction for every agent:** Before handing work to another agent or completing a task, update this file. Add a dated entry under **Handover entries** that states the task, exact actions taken, files changed, verification performed, outstanding work/risks, and the current Git commit hash. Do not overwrite prior entries; append a new one. If a commit has not yet been made, explicitly say so and provide the intended commit action.

## Current handover state

- Project: Compass / ResponseCompass
- Remote: **git@github.com:makoantz/compass.git** (private, default branch `master`) — added 2026-09-04.
- Current implementation/deployment commits include `ec52b4f` (`feat: manage control room display names`), `1c8d39b`, `b108bf8`, and `e3b4d98` on local `master`; none are pushed. The running Control Rooms server is Node PID `603243` on port 3000.
- The four previously-uncommitted slices — analytics dashboard, Control Room search palette, analytics clarification + equipment directory, bounded desktop layout with deliberate map gestures — are committed as **one** implementation commit. They were built separately but their frontend changes interleave in `app.js`/`styles.css` and were only ever verified as the cumulative tree, so splitting them would have produced commits that were never tested in isolation. Gates at that commit: `npm test` 169/169, Chromium 18/18.
- Search tooling caveat: a source file containing literal control bytes reads as binary, and `grep`/`ripgrep` then return **nothing** for every pattern in it with no error. `frontend/app.js` and `handover.md` were both in that state on 2026-09-07 and are fixed; if a search comes back suspiciously empty, run `file` on the target before trusting the result.
- Map direction (2026-09-06): the manufacturing map is now split into world geometry inside the CSS 3D scene and readable text in a screen-space overlay layer. This is **step one toward a full 3D floor** at the user's explicit direction; keep that split when extending it.
- Source of truth: `Compass_ResponseCompass_SOW_v4_FINAL.md` (v4-FINAL supersedes v2; `AGENTS.md`, README, and `docs/v4-implementation-plan.md` are aligned to it).
- **Parallel workstream integrated (2026-09-05):** the three-floor, 72-machine layout is merged with the two-responder implementation and verified as one build.
- Current phase: **active development, no freeze.** v4 WP0–WP15 repository work is complete, and the project has moved past its first release milestone into ongoing production hardening for real use at the user's company. Development continues until the user is satisfied. Earlier entries in this file describe a core freeze; that policy was removed from `AGENTS.md` on 2026-09-05 and those entries are historical record only.
- Current implementation boundary:
  - Live is a persistent multi-issue control room with simulation controls, bounded model proposals, runtime-visible agent activity, deterministic fallbacks, automatic Primary/Support offers, at-most-two staffing, release/transfer controls, fixed-draw segmented resolution attempts, event feed, and analytics.
  - Offline is an API-free fixture path through the same server and UI, using the shared two-responder attempt math with scripted asynchronous offer acceptance plus real support/release/reset behavior.
  - `ResponderSkill` is hidden simulation truth and is mechanically excluded from planner/Compass packets, public snapshots, normal UI payloads, and analytics.
  - Provider/model/thinking-level is now operator-configurable via a Settings tab. **Two providers are enabled: OpenAI and OpenRouter (added 2026-09-07).** Each keeps its own persisted model and reasoning-effort pin; switching providers to compare them does not discard either pin. OpenRouter's default model is `deepseek/deepseek-v4-flash`.
- **Control Rooms: deployed (2026-09-08).** `plant1` contains the migrated accumulated legacy state; `plant-2` is a fresh, paused Live room. The first boot migration and post-deployment room/API/log verification are recorded in the latest 2026-09-08 entry below. Both required gates passed at 206/206 and 27/27 before migration.
- Next required work: no implementation blocker remains in the requested two-responder scope. The live 100-opportunity provider evaluation remains optional operator work.
- Known external caveat, updated: a secured credential and `gpt-5.6-terra` / `medium` setting are present locally, and the live ten-run Scenario A gate passed 10/10. The live 100-opportunity provider evaluation has not been run; do not claim its threshold from the deterministic soak.

## Handover entries

### 2026-09-08 — Control Rooms compliance fix and production migration deployed

- Task: Validate the completed Control Rooms implementation against `Control_Rooms_SOW_v1_DRAFT.md`, close the two identified gaps, then perform the user-authorized first production migration and deployment.
- Compliance fixes: Renamed the primary view to **Live Floor** while preserving stable `control-room-*` identifiers and top-level Control Room terminology. Added a room-owned logger facade that appends authoritative `controlRoomId` values to Live, Offline, scheduler-backstop, and room-scoped request lifecycle events. Restricted `COMPASS_CONTROL_ROOMS_DATA_ROOT` to `NODE_ENV=test`; Playwright explicitly supplies that mode, preserving hermetic E2E isolation without creating a production relocation setting.
- Verification before migration: `npm test` passed **206/206**. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passed **27/27** against the isolated `/tmp/compass-playwright-control-rooms` root; forced provider failures made no provider call. `git diff --check` passed. Compliance implementation commit: `3afdf74` (`fix: harden Control Rooms deployment boundary`).
- Migration preflight: no Compass listener or competing writer was present; the three legacy sources existed with captured checksums (`live-simulation.json` `b6376e01…fd6e2f`, backup `3c180834…0ca43cd8`, audit `94383a92…5b046e03`); all Plant #1 destinations were absent. No migration conflict, temporary state file, or source/destination mismatch was found.
- Deployment: Started the verified build with the normal production `npm run dev` command from `/home/makodev58/compass`, without the test-only data-root override. Boot performed the authorized same-filesystem move of all three legacy files into `backend/data/control-rooms/plant1/`. Serving Node PID is `578421` (launcher `578409`), cwd `/home/makodev58/compass`, on port 3000.
- Post-deployment verification: `GET /` and direct `/rooms/plant1` SPA route both return 200. `GET /api/control-rooms` reports Plant #1 and Plant #2 `READY`, both `LIVE + PAUSED`. Plant #1 preserves its accumulated operational state at revision `48165`, `PAUSED`, with 61 issues; Plant #2 is fresh at revision `1`, `PAUSED`, with 2 seeded issues. Both scoped state endpoints returned 200. Room request logs carry `controlRoomId: plant1` / `plant-2`; deployment-global `server_started` has no room ID. No `server_start_failed`, `live_scheduler_error`, `ENOENT`, or migration-conflict signal occurred. The clock was left paused exactly as persisted.
- Working tree: only regenerated `docs/assets/*.png` screenshots remain modified; they are expected browser-test artifacts and were not included in the compliance commit. No push was performed.

### 2026-09-08 — Control Rooms compliance fix, ready for authorized migration/deployment

- Task: Close the pre-deployment Control Rooms compliance findings: distinguish the Live Floor UI from the Control Room entity, stamp room-owned logs, and prevent the E2E-only data root from being used in a non-test boot.
- Actions: Changed only user-visible tab/title text to `Live Floor` while retaining stable `control-room-*` IDs. Added `createControlRoomLogger`, injected it into each room's Live and Offline runtimes, and applied it to room request lifecycle logs with an authoritative final `controlRoomId`. The data-root override now requires `NODE_ENV=test`; Playwright provides it. Added regressions for runtime/lifecycle room IDs and refusal of a non-test override.
- Verification: `npm test` 206/206. Required Chromium suite 27/27 against its isolated `/tmp/compass-playwright-control-rooms` root with forced provider failures. `git diff --check` passed. Generated screenshots are intentionally left unstaged.
- Deployment status: No migration/restart has occurred at the time of this entry. Before deployment, repeat the strict live preflight: confirm no listener/second writer, capture source stats/checksums and Plant #1 revision/status, verify every Plant #1 destination is absent and no temp files exist. Stop immediately on any mismatch or conflict.

### 2026-09-08 — Control Rooms implemented end to end: hermetically verified, deliberately not deployed

- Task: Implement `Control_Rooms_SOW_v1_DRAFT.md` (the SOW committed 2026-09-07, already revised per Sol's review) while Sol was out of tokens. User explicitly authorized proceeding with implementation directly, without a further plan-mode pass, given the SOW was already a fully reviewed and approved spec.
- **Scope: all six work packages, matching the SOW's own CR-WP1–CR-WP6 breakdown exactly.**
  - **CR-WP1 — Migration.** New `backend/src/control-room-migration.mjs`. Idempotent, per-file, one of exactly four states per file (absent/absent, present/absent, absent/present, present/present-as-`CONFLICT`). A conflict touches neither file and leaves that room `FAILED` with an explicit reason — never a silent guess about which file is authoritative.
  - **CR-WP2 — Registry + manager + process-level scheduler.** New `backend/src/control-room-registry.mjs` (frozen, hardcoded `plant1`/`plant-2` list, `RESERVED_ROOM_IDS` collision guard against real route segments) and `backend/src/control-room-manager.mjs` (composes one `liveRuntime`+`offlineRuntime`+`applicationRuntime` triple per room, one shared `logger`/`settingsService`/`plannerOptions`/`agentOptions` across all rooms, and — the corrected design from Sol's Required 1 — **one process-level `setInterval`** dispatching every `READY` room's tick **concurrently**, never sequentially). `live-runtime.mjs`'s old `startLoop` interval body was extracted into a standalone `runScheduledTick()` closure function so the manager can call it directly per room without each room owning its own timer; `startLoop`/`stopLoop` are retained unchanged as a standalone capability for anything that isn't going through the manager (e.g. a bare single-runtime test).
  - **CR-WP3 — Route scoping.** `server.mjs`'s `createRequestHandler` now takes a manager instead of a single `runtime`. New `/api/control-rooms` (list, with health) and `/api/control-rooms/:id/...` in front of the ~26 previously-unscoped route branches; an unknown id 404s immediately, a non-`READY` id returns a distinct 503 before any route body runs. `/api/settings*` and `/api/logs*` stay unscoped and deployment-global, matching the SOW's explicit call. The Offline runtime (`createDemoRuntime`) and its full request-handling body were extracted verbatim into new `backend/src/offline-runtime.mjs` to break a circular import between `server.mjs` and the manager; `server.mjs` re-exports it so every existing test importing `createDemoRuntime` from `server.mjs` needed no import-path changes.
  - **CR-WP4 — Room health.** `READY`/`FAILED` tracked independently of a room's own `RUNNING`/`PAUSED` clock state, exactly as the SOW specifies. A corrupted state file, a migration conflict, or any other per-room startup failure leaves that one room `FAILED` while every other room boots and serves normally.
  - **CR-WP5 — Frontend picker + URL scoping.** New pre-boot picker screen (`#room-picker-view` in `frontend/index.html`, styled in `frontend/styles.css`) gating the entire `.app-shell` until a room is chosen at `/`; `/rooms/:id` parsed once from `location.pathname` at the top of `app.js`, before any other module state. Implemented Sol's explicit `roomApi()`/`globalApi()` split (recommendation #4) rather than a single auto-prefixing helper with an opt-out list — every one of the ~16 network call sites in `app.js` now states its own scoping intent. `perform()`'s convention changed from full `/api/...` URLs to room-relative tail paths. `server.mjs`'s `serveStatic` gained a narrow SPA-fallback rule so `/rooms/:id` serves `index.html` on direct navigation/reload instead of 404ing. Room switching is full-page navigation only, exactly as the SOW settles (§4.6, §9) — no in-page teardown/restart logic was written, deliberately.
  - **CR-WP6 — Verification.** See below.
- **A defect found during implementation, not anticipated by the SOW.** The manager's fresh-room-default logic originally checked `descriptor.id !== "plant1"` to decide whether to apply the LIVE+PAUSED default — i.e. it assumed "named plant1" means "has real migrated data behind it". On a genuinely fresh install with nothing to migrate at all (a new dev environment, or literally the first boot ever), plant1 is exactly as freshly-seeded as plant-2 and was being silently exempted from the default by virtue of its id alone. This is currently **unobservable** in practice — `createLiveSeed()` already defaults to `PAUSED`, so the bug never produced a wrong result today — but the *condition* was wrong and would misbehave the moment that seed default ever changes. Fixed to check whether migration actually moved or found real prior data (`hasMigratedData`), not the room's literal id. The regression test's own comment says plainly that it guards the correct condition going forward rather than claiming to have caught a live behavioral bug — found via manual smoke-testing against a real browser, not by the automated suite, which is exactly why the smoke pass was worth doing before calling this finished.
- **A pre-existing test-harness gap the SOW didn't anticipate, and how it was closed.** The existing Playwright config kept the hermetic e2e suite off real `backend/data/` via `COMPASS_LIVE_STATE_PATH`; the manager has no equivalent by design, since the SOW explicitly defers a *production* configurable data root (an admin-facing relocation feature) as out of scope. Conflating that non-goal with test isolation would have meant running `npm run test:e2e` writes into real production data — a regression against `AGENTS.md` rule 9, which is a harder, pre-existing constraint than the SOW's scope note. Added a narrowly-scoped `COMPASS_CONTROL_ROOMS_DATA_ROOT` env var, read only in `server.mjs`'s boot block (not the manager's public API, which still hardcodes `backend/data/` by default per the SOW), mirroring `COMPASS_LIVE_STATE_PATH`'s exact precedent. `playwright.config.mjs` sets it to `/tmp/compass-playwright-control-rooms` and its readiness probe moved from the now-removed unscoped `/api/state` to the still-unscoped `/api/control-rooms`.
- **Every existing test's setup was adapted; no test's assertions were weakened or rewritten to fit.** ~20 backend tests across `wp3-wp4-server`, `wp8-audit`, `wp10-live-runtime`, `provider-settings`, and `wp10-control-room-ui` needed their route-construction convention updated (a manager-shaped wrapper instead of a bare runtime; room-relative or room-prefixed URLs instead of bare `/api/...`) via a new shared test helper, `backend/tests/helpers/single-room-manager.mjs` (`wrapRuntimeAsSingleRoomManager`, `roomUrl`). Two of `provider-settings.test.mjs`'s assertions did genuinely change: the `/api/settings/models` route's per-room Offline-mode 409 gate was removed, because with N independently-moded rooms sharing one deployment-global settings surface, no single room's mode can be authoritative over whether model discovery is allowed — documented inline in both the route and the test. Every existing e2e spec's `page.goto("/")` became `page.goto("/rooms/plant1")`, since `/` now shows the picker by design; zero e2e assertions changed.
- Files changed: new `backend/src/control-room-registry.mjs`, `control-room-manager.mjs`, `control-room-migration.mjs`, `offline-runtime.mjs`; modified `backend/src/server.mjs` (~600 lines touched — the route table restructure), `live-runtime.mjs`, `application-log-store.mjs` (exported `logEvent` as a shared helper); new backend tests `wp22-control-room-migration`, `wp23-control-room-manager`, `wp24-control-room-health`, `helpers/single-room-manager.mjs`; adapted `wp3-wp4-server`, `wp8-audit`, `wp10-live-runtime`, `wp10-control-room-ui`, `provider-settings`; frontend `app.js`, `index.html`, `styles.css`; new `e2e/control-rooms.spec.mjs`; adapted `audit-trail`, `building-view`, `control-room-search`, `control-room`, `override-dropdown`, `provider-settings` e2e specs (navigation only); `playwright.config.mjs`; `docs/decisions.md`; this handover; `Control_Rooms_SOW_v1_DRAFT.md`'s status header.
- Verification:
  - `npm test`: **204/204** (181 prior + 23 new).
  - `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e`: **27/27** (20 prior + 7 new in `control-rooms.spec.mjs`), run twice against a freshly-emptied `/tmp/compass-playwright-control-rooms` — once as the new spec file standalone (which surfaced a real test-isolation gap: a prior test can leave a room in Offline mode, hiding the Live-only Reset button behind `hidden` and hanging a `.click()` — fixed by resetting via a direct `page.request.post` call instead of the UI, and forcing mode to LIVE explicitly first since `reset()` does not itself touch mode) and once as the complete suite in its normal alphabetical ordering.
  - A **manual browser smoke pass against a fully isolated scratch copy of the entire repository** (`cp -r backend frontend package.json` to a scratch dir, symlinked `node_modules`, empty `backend/data/`, run on port 3099) — never touching real `backend/data/` at any point, confirmed independently before and after each check by comparing `stat` mtimes. Confirmed visually: the picker renders both rooms as `LIVE · PAUSED`; clicking a room navigates and boots the existing Control Room UI unchanged; a direct navigation to `/rooms/plant1` (no picker visit) boots correctly via the new SPA-fallback rule. Confirmed with two real, separate Playwright browser contexts hitting that same isolated server: resuming Plant #1's simulation clock in context 1 is invisible to context 2, which remains `Paused` on Plant #2 throughout — the single property this entire feature exists to prove.
  - Real production untouched, checked repeatedly throughout, not just once at the end: the serving process (PID `310187`) is the same PID from before this task started, still running the pre-Control-Rooms build (confirmed via its still-200-on-the-old-unscoped-`/api/state` behavior). `backend/data/live-simulation.json`'s mtime (`2026-09-07 10:51:38`) predates this entire implementation session, at revision `48164`, `PAUSED` — byte-identical to how it was left before this task began.
- Outstanding work / risks:
  - **Nothing is deployed.** No code has been committed to the running process; no restart has happened. Deploying is a distinct, separate, deliberately-not-yet-taken step.
  - **Deploying requires running CR-WP1's migration against real data** — a one-way move of `backend/data/live-simulation.json` (+ `.pre-v2.bak`) and `backend/data/recommendation-events.json` into `backend/data/control-rooms/plant1/`. This is exactly the kind of action this repo's own operating rules require explicit confirmation before taking (see the top-level system guidance on hard-to-reverse actions), and it was correctly deferred rather than bundled into this implementation pass.
  - **The deployment sequence, when authorized:** (1) stop the confirmed Compass PID on port 3000 with `SIGTERM`, verify it exits; (2) confirm no other process holds port 3000 or writes to `backend/data/`; (3) start the server normally (`npm run dev` or equivalent) — the boot sequence runs CR-WP1's migration automatically on that first boot, before the manager constructs any room; (4) verify `GET /api/control-rooms` reports `plant1` as `READY` (not `FAILED` from a migration conflict — there should be none, since this is the first migration attempt) and its state matches the pre-migration revision/status; (5) verify `plant-2` is freshly seeded at `LIVE`+`PAUSED`; (6) verify the picker and both rooms render correctly in a real browser before considering this live. A migration conflict at step 4 must not be worked around by deleting or force-overwriting either file — resolve it by hand, matching the SOW's explicit "ambiguous provenance must not be silently repaired" principle.
  - **`Control_Rooms_SOW_v1_DRAFT.md` is still named `_DRAFT`** despite being fully implemented; consider renaming to a `_FINAL` or dropping the draft qualifier once deployed and confirmed stable, matching this repo's `_v4_FINAL` convention for the parent SOW. Left as-is for now since the document's own status header already states its real state precisely.
  - `docs/architecture.md` and `README.md` do not yet mention Control Rooms at all — both still describe the single-instance shape. Worth a pass once deployed; not done here to keep this change reviewable as "the feature" rather than "the feature plus a docs sweep".
- Current Git commit: pending — commit this exact implementation next.

### 2026-09-07 — Control Rooms SOW drafted, reviewed by Sol, revised, and committed (no implementation)

- Task: The user asked to brainstorm a multi-instance feature ("Control Rooms" — run several fully independent simulations, e.g. Plant #1/Plant #2, in one deployment, as the first step toward an eventual multi-domain platform). After the brainstorm converged on four architecture decisions (via AskUserQuestion), the user asked to pause implementation and instead produce a dedicated SOW document for Sol to review — matching this repo's existing `Compass_ResponseCompass_SOW_v4_FINAL.md` convention.
- Process: Entered plan mode explicitly for this. Two Explore agents (backend routing/runtime composition; frontend structure/API call sites) plus one Plan agent (architecture design) ran to ground the SOW in the actual codebase rather than assumption — every non-obvious claim carries a file:line citation. Two claims were independently re-verified directly against source before being trusted: `createAuditStore` is wired only into the Offline runtime, not Live (this changes why each room needs its own audit file); and `createLiveStore`'s exact constructor signature. Wrote the draft (`Control_Rooms_SOW_v1_DRAFT.md`) via `ExitPlanMode`, then wrote it to the repo — deliberately not committed yet, pending the user's own read-through.
- The user then supplied Sol's independent review (`Control_Rooms_SOW_Sol_Review.md`, uploaded, moved into the repo root). Assessed every point of the review on its own merits rather than accepting it wholesale — found nothing to push back on. Four required corrections, all real:
  1. **Scheduler must be process-level, not one `setInterval` per room.** The original draft treated "one writer per file" as satisfying the codebase's existing "one timer source" invariant; Sol correctly pointed out the invariant is about concurrency-surface discipline, not just file collisions, and N independent intervals would have quietly discarded the reason it exists. Revised design: one process-level scheduler dispatches ticks to every room *concurrently* (never sequentially awaiting one room before the next), each room keeping its own re-entry guard and error containment.
  2. **Migration had no explicit conflict state.** The original design only handled "source exists, destination doesn't" — silent on "both exist," which risked discarding real accumulated deployment state by silently trusting one file. Revised to a 4-state table with an explicit `MIGRATION_CONFLICT` that touches neither file and fails that room loudly, matching this codebase's established "don't silently repair ambiguous provenance" principle.
  3. **Room failure isolation promoted to an architecture invariant.** Was buried in a work-package acceptance line with no mechanism. Now `READY`/`FAILED` (manager health), kept explicitly separate from `RUNNING`/`PAUSED` (clock state) — conflating the two was a category error.
  4. **The verification plan had an actually-invalid test**, caught during my own re-review, not just accepted from Sol's text: "assert each room contains only its own entity IDs" fails on a *correct* implementation, since both rooms share the same Manufacturing seed and legitimately contain identical entity IDs (e.g. `R-ENGR104` in both) — the Control Room boundary is the namespace, not the ID. Replaced with a behavioral test (mutate room 1 only, confirm room 2 unchanged; advance room 1's clock, confirm room 2's doesn't move).
  - Also incorporated all ten non-blocking refinements: explicit `roomApi()`/`globalApi()` frontend split instead of a prefix-with-escape-hatch (removes a footgun for a future global route), `controlRoomId` tagging on shared logs, audit-store rationale reordered to lead with provenance over reset-safety, and all four of the SOW's original open questions resolved (new rooms default `LIVE + PAUSED` — conflating runtime mode with clock state was the bug in my own framing of that question; registry stays hardcoded for v1; "Live Control Room" tab renames to "Live Floor" to stop colliding with the new top-level Control Room concept; full-page room navigation settled as the actual design, not a placeholder).
- Files changed: `Control_Rooms_SOW_v1_DRAFT.md` (new, full rewrite incorporating the review), `Control_Rooms_SOW_Sol_Review.md` (new, the review itself, kept as a permanent record of why the SOW reads the way it does), and this handover.
- Verification: this is a documentation-only change. Confirmed no application code was touched (`git diff --stat` against everything but the two new files is empty) and both files are clean UTF-8 text (re-verified after last week's control-byte lesson). Cross-checked every `§N.M` reference in the revised document against its actual section headers by hand — found and fixed one stale reference (a resolved-question citation pointed at §8 instead of §9) before committing.
- Outstanding work / risks:
  - **Nothing has been implemented.** No new backend modules (`control-room-registry.mjs`, `control-room-manager.mjs`, `control-room-migration.mjs`), no route changes, no frontend picker. The SOW is the complete next-work-package definition; read it before starting.
  - The SOW's own §9 records four decisions that were genuinely open at draft time and are now resolved — do not re-litigate them without a new reason: new-room default is `LIVE + PAUSED`, registry stays hardcoded for v1, the Live Floor rename is in-scope for this pass, full-page room navigation is the settled design.
  - This feature will restructure `server.mjs`'s boot sequence and its entire route table (§4.1, §4.5 of the SOW) — coordinate before touching either area for an unrelated reason.
- Current Git commit: `be45812` — `docs: add Control Rooms SOW, revised per Sol's architecture review`. Commit this exact-hash handover refresh as the documentation checkpoint immediately following it. Not pushed.

### 2026-09-07 — OpenRouter added as a second, fully enabled provider

- Task: Add OpenRouter as a provider alongside OpenAI. Move the operator-supplied API key (left at `/home/makodev58/openrouter_compass_key.txt`) into the repo's env file. Default OpenRouter's model to `deepseek-v4-flash`. Result: an operator can select between OpenAI and OpenRouter from the Settings tab, both fully enabled — not the prior "coming soon" placeholder.
- Credential handling: the key was moved with shell redirection that never printed its value to any tool output (verified structurally — byte count, `sk-or-` prefix check — never by printing content), appended to `.env` as `OPENROUTER_API_KEY`, and the source file was deleted once the write was confirmed present. `.env` is gitignored; nothing sensitive is committed. `.env.example` documents the new variable with a placeholder only.
- Actions taken:
  - New `backend/src/model-provider.mjs` centralizes the one place OpenAI and OpenRouter actually differ for a chat-completion call: endpoint, credential env var name, and reasoning-effort request shape (OpenAI: top-level `reasoning_effort`; OpenRouter: nested `reasoning: { effort }`, its unified field across every model it hosts). `agent.mjs` and `event-planner.mjs` both now call through this one dispatcher instead of each hand-rolling an OpenAI-specific `fetch`; their validation, fallback, and never-trust-the-model behavior is untouched.
  - Rewrote `backend/src/provider-settings.mjs` for two providers with independently persisted pins. `backend/data/provider-settings.json` moves from a flat `{provider, modelId, reasoningEffort}` shape to `{provider, models: {openai: {...}, openrouter: {...}}}`. A file written by the pre-OpenRouter build still loads — verified with a dedicated migration test — its flat fields become the OpenAI entry, OpenRouter seeds from its coded default.
  - Model discovery reads OpenRouter's `supported_parameters` per model to decide whether reasoning-effort levels are offered, rather than guessing from the model's name — a `deepseek-v4-flash`-shaped "fast" model correctly gets no reasoning levels unless the live catalog says otherwise.
  - `GET /api/settings/models` accepts an optional `?provider=` so the Settings UI can preview a provider's catalog before switching to it. The frontend's provider dropdown is enabled (was `disabled`, single-provider only); switching it client-side is a pure re-render with no request, so an operator can browse either provider's cached model list before committing via Save.
  - `deepseek/deepseek-v4-flash` (vendor-prefixed, matching OpenRouter's `vendor/slug` ID convention) is the coded default for a fresh OpenRouter selection. It is only ever a starting point — a real Save still validates against the live OpenRouter catalog via model discovery, same as every other model on either provider.
- Files changed: new `backend/src/model-provider.mjs`, `backend/src/provider-settings.mjs`, `backend/src/agent.mjs`, `backend/src/event-planner.mjs`, `backend/src/server.mjs`, rewritten `backend/tests/provider-settings.test.mjs`, new `backend/tests/wp21-openrouter-provider.test.mjs`, `frontend/app.js`, new `e2e/provider-settings.spec.mjs`, `.env` (not committed), `.env.example`, `README.md`, `docs/decisions.md`, and this handover.
- **Hazard for the next agent, worth its own line:** `backend/data/provider-settings.json` has **no per-test isolation** — the service resolves it from the module's own file location, not from `COMPASS_LIVE_STATE_PATH` or any test-scoped path — so it is the *same file* a real deployment on this machine reads. The new `e2e/provider-settings.spec.mjs` is deliberately read-only: it never clicks "Refresh available models" (a real network call to the provider, forbidden in the hermetic e2e suite regardless of `COMPASS_LIVE_COMPASS_MODE`, since model discovery is gated only by whether a credential is configured) or "Save settings" (would persist to that same shared file). This was already true before OpenRouter existed; it just had no test to trip over it. Confirmed the file's mtime was unchanged after the full e2e run.
- Verification: `npm test` 181/181 (169 prior + 4 in the rewritten `provider-settings` suite + 8 in the new `wp21` suite). `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` 20/20 with forced provider failures and no API spend. `git diff --check` clean. `node --check` on every touched backend/frontend file.
- **2026-09-07, operator-confirmed live**: the operator tested the live OpenRouter path themselves and confirmed it works. Grounded, not taken on faith — checked `backend/data/provider-settings.json` and the application log directly: `provider_settings_updated` shows the operator saved `deepseek/deepseek-v4-flash` on `openrouter` (the coded default slug resolved cleanly against the live catalog, so no correction was needed), the active provider is now `openrouter`, the OpenAI pin (`gpt-5.6-terra`) is untouched, and fresh `COMPASS_RECOMMENDATION` operational events are present in state — meaning a real OpenRouter call round-tripped through full schema validation and produced a usable recommendation, not just an HTTP 200 with unusable content. This resolves both risks below.
- Outstanding work / risks (historical — both resolved by the confirmation above, kept for the record):
  - ~~The active provider on this deployment is still OpenAI (unchanged)~~ — operator has since switched it to OpenRouter via the Settings tab, as designed.
  - ~~`deepseek/deepseek-v4-flash` has not been confirmed against a live OpenRouter catalog fetch~~ — confirmed; it is a real, selectable model on this credential.
  - ~~`OPENROUTER_API_KEY` has not been exercised against the real OpenRouter API~~ — confirmed working end to end, including structured-output parsing and full recommendation validation.
- Deployment (2026-09-07): stopped confirmed Compass PID `294592` (cwd `/home/makodev58/compass`) with `SIGTERM`; exited cleanly. Restarted from the repository root with `nohup npm run dev`, which loads the refreshed `.env` (including the new `OPENROUTER_API_KEY`). Serving PID is now `310187`. State preserved across the restart — revision 48050 → 48051 (the single `reconcileStartup` write), still `PAUSED`.
- Post-deployment verification: `/`, `/api/state`, `/api/settings` all 200. `GET /api/settings` confirms both providers `enabled: true` with `credentialConfigured: true`, active provider unchanged at `openai` (this deploy did not switch anyone's live configuration — an operator does that from the Settings tab), and a key-pattern scan of the full response found no leaked credential. Zero `live_scheduler_error`, `ENOENT`, or `server_start_failed` in the new log.
- Current Git commit: `79e91a8` — `feat: add OpenRouter as a second, fully enabled provider`. Not pushed.

### 2026-09-07 — Header compaction was gated on height and made short windows worse; corrected

- Task: The operator reported that after the previous entry's work their header looked *worse* — the mode buttons had moved onto a left-aligned row of their own. They supplied a screenshot of their actual view and a mockup of the layout they wanted.
- **The previous entry's headline number was true only for tall windows, and that is the lesson.** Compaction was gated on `min-width: 901px` **and `min-height: 800px`**. Measured on the operator's viewport (~1729×760, below the height gate): **361px of chrome across five rows**, versus 257px across four *before any of that work*. The change was a regression for them, not an improvement, and the entry above did not say so because every size I measured was ≥ 800px tall.
- Two distinct defects:
  1. **Wrong gate.** A short window is precisely the case that can least afford tall chrome, so gating compaction on height excluded the users who needed it most. Header compaction is a **width** concern; only the bounded `100dvh` workstation — which trades page scrolling for locally scrolling panes — legitimately needs the height. The two are now separate media queries.
  2. **Stranded mode buttons.** Moving the tab bar into the header made the mode controls wrap to their own left-aligned row below the brand. Root cause: the tab bar needs `flex-basis: 100%` when it sits on its own row, and that basis makes flex wrap the mode buttons off the brand row even with ~110px to spare. Header placement is now an explicit **grid**, which is deterministic instead of depending on how flex resolves hypothetical main sizes.
- Also fixed: in the cramped 901–1279px range the view names wrapped to three lines. Labels no longer wrap, the tab strip scrolls if it must, and the activity wording gives way to its dot while the live-region text stays available to assistive technology.
- Result, measured across ten viewports from 390×844 to 1920×1010: every width ≥ 901px is **two rows** regardless of height. The operator's ~1729×760 reads **130px, down from 361px**. Tablet and mobile keep their existing stacked header deliberately.
- Regression guard added: a browser test at **1440×720** — deliberately below the old height gate — asserting brand, tabs and mode share one row, simulation and search share the next, and total chrome stays under 180px. The existing desktop test only ever ran at 900px tall, which is exactly why this was invisible.
- **Method note worth keeping:** the earlier verification measured five viewports and all five were ≥ 800px tall, so the gate's own boundary was never crossed. When a change is gated on a threshold, measure on **both sides of that threshold**, not just across a range that happens to sit on one side of it.
- Files changed: `frontend/styles.css`, `e2e/building-view.spec.mjs`, and this handover.
- Verification: `npm test` 169/169. Chromium **19/19** with forced provider failures and no API spend. `git diff --check` clean. Screenshots inspected at 1920×1010, 1729×760, 950×700 and 390×844.
- Deployment: stopped confirmed Compass PID `277904` (cwd `/home/makodev58/compass`) with `SIGTERM`; exited cleanly. Restarted from the repository root; serving PID is now `294592`. State preserved — revision 48049 → 48050 (the single `reconcileStartup` write), still `PAUSED`. `/`, `/api/state`, `/api/analytics` all 200; the served stylesheet was checked to confirm it carries the width-only header rules. Zero `live_scheduler_error`, `ENOENT` or `server_start_failed`.
- Current Git commit: `c75de3a` — `fix: compact the header on short windows too, and stop stranding mode buttons`.

### 2026-09-07 — Header chrome halved after operator feedback on wasted vertical space

- Task: The operator accepted the Space+drag gesture but reported the top of the page still wasting too much room, asking for a layout that minimises row usage.
- Measured before changing anything: four stacked rows consumed **257px of a 1010px viewport (25%)** — topbar 77px, tab bar 40px, simulation bar 68px, and a 34px row occupied by the search opener alone.
- Actions: Moved the view tabs **inside** the header element so brand, tabs, agent activity and mode controls share one row. Placed the search opener in the simulation row via grid areas rather than its own row. Hid the eyebrow and tagline on desktop — they are marketing, not operational — and restored the tagline inline above 1500px where it costs no extra height. Made simulation time, state and speed read inline instead of stacking their labels.
- Result: **257px → 112px** at every desktop width tested (1920×1010, 1440×900, 1100×850), both rows a balanced 47px. The map grows 446px → 549px and the issue/event feeds gain 40px at 1920×1010. Narrow and short windows keep the stacked header and normal document scrolling; the tab bar wraps to its own full-width row there.
- Defect found and fixed along the way: on a narrower desktop the map control bar wraps leftward into the bottom-left corner and was **covering the map help pill**, hiding the 2D/2.5D buttons behind it. Moved the help pill to the map's top-right, the only corner that stays free — floor signage is painted top-left and the control bar owns bottom-right. Verified clear in both 2D and 2.5D at three widths.
- Guarded structurally, not by pixel budget: the browser suite asserts the tabs share the brand row's vertical centre and the search opener shares the simulation row's, plus that the map help and control bar never intersect. These survive copy and font changes but fail if either element is given back a row of its own.
- Files changed: `frontend/index.html` (tab bar moved into the header), `frontend/styles.css`, `e2e/building-view.spec.mjs`, and this handover.
- Verification: `npm test` 169/169. Chromium 18/18 with forced provider failures and no API spend. `git diff --check` clean. Screenshots inspected at 1920×1010, 1440×900, 1100×850 and 390×844, plus map-corner checks in both view modes.
- Deployment: stopped confirmed Compass PID `264477` (cwd `/home/makodev58/compass`) with `SIGTERM`; it exited cleanly. Restarted from the repository root; serving PID is now `277904`. State preserved across the restart — revision 48048 → 48049 (the single `reconcileStartup` write), still `PAUSED`, still 60 issues. `/`, `/api/state` and `/api/analytics` all 200; the served HTML and stylesheet were checked to confirm they carry the new header and the relocated help pill. Zero `live_scheduler_error`, `ENOENT` or `server_start_failed` in the new log.
- Current Git commit: `b872d8c` — `feat: halve the Control Room header chrome`.

### 2026-09-07 — Completed Sol's pending verification: desktop layout signed off, plus two defects found in it

- Task: GPT-5.6 "Sol" hit its usage limit partway through the browser suite for the bounded desktop Control Room, leaving the entry below marked `Verification: Pending`. This entry completes that verification. **The entry below is left untouched as the historical record; read both together.**
- Where Sol stopped: implementation complete, `npm test` 169/169 green, Chromium suite started but never reported. Nothing committed.
- Verification now complete: `npm test` 169/169. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` **18/18** with forced provider failures and no API spend. `node --check frontend/app.js` and `git diff --check` pass.
- Desktop fit measured directly, not assumed. Document height versus viewport height, and horizontal overflow, at five sizes:
  - `1920×1010` (the 19:10 case the user asked for): doc 1010 = viewport 1010, no page scroll, no horizontal scroll, map 446px. **Requirement met.**
  - `1680×884` (19:10): fits, map 358px. `1440×900`: fits, map 369px.
  - `1366×768`: falls back to the normal scrolling document, because the desktop rule is gated on `min-height: 800px`. This is the documented graceful fallback, but it does mean a 768px-tall viewport — a common laptop — does **not** get the bounded layout. Flagged rather than changed; lowering the gate would squeeze the map below usable height.
  - `390×844`: stacked mobile flow, no horizontal scroll.
  - The 19:10, laptop-fallback and mobile screenshots were visually inspected.
- **Defect 1 found and fixed — `frontend/app.js` was not a text file.** The label-signature builder in `renderProjectedLabels` used raw `0x00` and `0x01` bytes embedded literally in the source as field delimiters. The delimiter choice is sound; writing them as literal control bytes is not. `file` reported the source as `data`, and **`grep`/`ripgrep` silently returned nothing for every pattern in that file** — they treat it as binary and suppress output. This is how it was caught: a grep for `mapSpacePressed` returned nothing while `git diff` plainly showed it. Replaced with `\u0000` / `\u0001` escapes: byte-identical at runtime, and the file is text again. Anyone searching `app.js` before this fix was getting false negatives with no error.
- **Defect 2 found and fixed — pan was dead in Offline.** Space-arming was gated on `currentState?.mode === "LIVE"`, so in Offline the zoom buttons worked and the pan gesture did nothing. Nothing in the plan or the decision record asks for that, and it breaks `AGENTS.md` rule 6 (Live and Offline are one shared renderer, not two applications). Removed the mode gate and added a browser regression covering both the negative (plain drag does not pan) and positive (Space + drag does) cases in Offline.
- **Hazard worth knowing before you add any browser test: application mode is server-side global state, not per-browser-context.** The new Offline test initially broke three unrelated Live specs, because `building-view.spec.mjs` sorts before `control-room-search.spec.mjs` and `control-room.spec.mjs` and left the server in Offline. All three passed in isolation, which is exactly what makes this confusing. Any spec that switches mode must switch back; the new test now does, and says why.
- Files changed beyond Sol's set: `frontend/app.js` (control bytes, Offline pan gate), `e2e/building-view.spec.mjs` (Offline pan regression), and this handover.
- Outstanding work / risks:
  - `docs/assets/*.png` are regenerated by the browser suite on every run; that churn is expected, not a change anyone authored.
  - The rebuild specification documents commit `8a779f2`. Its header needs refreshing to `2c12a87` on the next pass; the substance is unaffected because this slice changed presentation and analytics projection only.
  - `analytics.compassRecords` is unbounded — it returns every completed recommendation. Analytics is not on the 1.5s poll, so this is not urgent, but it grows with the same uncapped arrays already recorded in the rebuild spec's "Not built" section.
- Deployment (2026-09-07, operator handed over ownership): pre-flight confirmed exactly one Compass process on port 3000, PID `101534`, `/proc/101534/cwd` = `/home/makodev58/compass`, `/api/state` 200, state parsing at revision 48047 (`PAUSED`, 60 issues) with no stray `.tmp` files. Sent `SIGTERM` to that PID only; it exited cleanly and freed the port. Restarted with `nohup npm run dev` from the repository root, preserving `.env`, provider settings and `backend/data/`. Serving PID is now `264477`.
- Post-deployment verification: `/` 200 (8,190 bytes), `/api/state` 200, `/api/analytics` 200 (54,334 bytes). State preserved across the restart — revision 48047 → 48048 (the single `reconcileStartup` write), still `PAUSED`, still 60 issues; the simulator was left paused exactly as persisted, so resume it from the UI if automatic issue generation is wanted. Analytics serves the new projection (`operationalTimeline` 97 bins, `compassRecords` 85) and a string search of the payload confirms no `responderSkills` or `trueSuccessProbability`. Zero `live_scheduler_error`, `ENOENT` or `server_start_failed` in the new log. The **served** assets were checked rather than assumed: the HTML carries the search opener and the updated map instructions, `app.js` is served as UTF-8 text with the Offline pan gate absent, and the stylesheet carries the `100dvh` desktop rules.
- Note for whoever tightens the docs next: `operationalTimeline` returns **97** bins, not the 96 the earlier decision entry states. That is correct behaviour, not a defect — aligning the window start down to a quarter-hour boundary yields a partial first bin and a partial final bin that together total exactly 1440 minutes. The response's own `maxBins` field is authoritative; the prose is what drifted.
- Current Git commits: `2c12a87` (implementation), `feb4b88` (rebuild specification), and this handover refresh on local `master`. Nothing pushed.

### 2026-09-07 — Bounded desktop Control Room and deliberate map interaction

- Task: Make the Live Control Room fit a desktop workstation viewport without document scrolling, while preventing accidental floor-map zooming and panning.
- Actions: Added a desktop-only (`min-width: 901px`) `100dvh` grid with bounded map, independently scrollable issue/event feeds, and a scrollable dispatch context. Mobile and narrow windows retain the normal stacked page layout. Removed wheel zoom and double-click reset; retained explicit control and keyboard zoom; limited panning to Space + primary-mouse drag on an empty map background; and clear the armed/drag state on key release, window blur, and document visibility loss. Updated on-screen and accessible map instructions.
- Files changed: `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `backend/tests/wp18-map-camera.test.mjs`, `e2e/building-view.spec.mjs`, `docs/decisions.md`, and this handover.
- Verification: Pending final `npm test`, Chromium E2E suite, and visual desktop/mobile inspection. Not deployed.
- Current Git commit: unchanged; implementation is uncommitted.

### 2026-09-07 — Analytics activity clarification and equipment directory

- Task: Correct the ambiguous/non-actionable analytics activity chart and replace the full equipment table with operator-scale navigation.
- Actions: Corrected canonical timeline boundaries so bins are clipped to the requested 24 simulated-hour range and a final partial bucket ends at the snapshot; future persisted records and future downtime cannot enter the projection. Reframed the chart as **Recorded simulated activity** with its exact simulated-time range, units, source semantics, and non-forecast/non-priority boundary. Each measure opens its own persisted-bucket detail directly below the chart, receives focus, and restores focus to the chart on close. Replaced the 72-row equipment table with an accessible directory: Needs attention/All filters, name-or-ID search, stable ID order, twelve-item pagination, and a selected-equipment fact panel.
- Files: `backend/src/analytics-service.mjs`, `backend/tests/wp11-analytics.test.mjs`, `backend/tests/wp12-analytics-ui.test.mjs`, `e2e/control-room.spec.mjs`, `frontend/app.js`, `frontend/styles.css`, and this handover.
- Verification: `npm test` 169/169 passed; `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` 16/16 passed with forced provider failures and no API spend. No deployment was performed. Commit: not yet made; preserve existing unrelated dirty/untracked work.

### 2026-09-06 — Analytics operational dashboard deployment

- Task: Deploy the verified KPI/chart-first Live Analytics dashboard after the user approved the planning-to-coding-to-deployment handoff.
- Pre-deployment safeguards: Host inspection confirmed that port 3000 was served by exactly one Compass Node process, PID `19198` (parent `19197`), and both `/proc/<pid>/cwd` values resolved to `/home/makodev58/compass`. `GET /api/state` returned HTTP 200 at revision `42107`. No stale PID was trusted and no unrelated process was stopped. `git diff --check` was clean. Used the implementation handoff's completed gates: `npm test` 168/168 and `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` 16/16, with forced provider failures and no API spend.
- Deployment: Sent `SIGTERM` only to confirmed Compass PID `19198`, waited for it to exit, then launched the existing configuration from the repository root with `nohup npm run dev >/tmp/compass-analytics-dashboard-20260906.log 2>&1 &`. This preserves `.env`, provider configuration, and `backend/data/`; no provider call, schema migration, or data reset was performed. The fresh launcher PID was `100863`; serving Node PID is `100878` and its cwd is `/home/makodev58/compass`.
- Post-deployment verification: port 3000 is listening on `0.0.0.0` as PID `100878`; `GET /` returned HTTP 200 (8,109 bytes), `GET /api/state` returned HTTP 200 at revision `42108`, and `GET /api/analytics` returned HTTP 200 with the expected Live analytics projection, including `operationalTimeline` (96 15-minute bins, rolling 24-hour window metadata), Compass comparison records, equipment, issue-class experience, and responder/issue records. The persisted simulation state is `PAUSED`, so the revision and simulation time correctly remained unchanged over a three-second probe. The fresh log contains `server_started` and successful 200 requests with no `live_scheduler_error`.
- Outstanding work / risks: None from deployment. The simulator remains paused exactly as persisted; resume it through the normal UI if automatic issue generation is desired.
- Current Git commit: `8a779f2` before the uncommitted search/dashboard work; deployment intentionally serves the verified working tree and nothing was pushed.

### 2026-09-06 — Permanent HTTP 500 on `/api/state`: poisoned promise chain plus orphaned writer processes

- Task: The user reported the map viewport showing an internal server error. Requested flow was a dedicated diagnosis agent, an independent verification agent, then the fix. That is what happened, and the verifier materially corrected the first diagnosis — record that, because the correction is the load-bearing part.
- Symptom: `GET /` returned 200 while `GET /api/state` returned a permanent HTTP 500 `{"error":"Internal server error"}`. Not caused by the map work; the affected process predates those commits and they are frontend/docs/tests only.
- Root cause, three defects that were each harmless alone:
  1. `live-store.mjs` `writeAtomically` renamed from a fixed `${filePath}.tmp`. That is not atomic across processes: a second writer overwrites the first's temp file, the first rename consumes it, the second fails `ENOENT`.
  2. `mutationQueue = mutationQueue.then(operation, operation)` left the shared chain rejected after a failed write, and both `snapshot()` and `publicSnapshot()` awaited it — so a write error surfaced on every later read, which `server.mjs` mapped to the generic 500.
  3. **The permanence mechanism, which the first agent missed and the verifier found:** `live-runtime.mjs`'s tick reads before it writes. Once the chain was poisoned the tick threw at the read and never queued another mutation, so the chain was never reassigned. In isolation the store recovers on the next successful write, which predicts an *intermittent* 500; combined with the read-first tick it is *terminal*. Production showed 968 consecutive `live_scheduler_error` with zero interleaved success.
- Why there were multiple writers: `server.mjs` started the simulation loop before binding the port, and `server.on("error")` only logged with no exit. Every `npm run dev` started while port 3000 was occupied failed to bind silently and stayed alive as a headless writer on the same default state path. Four had accumulated.
- Verifier's corrections to the first diagnosis, worth keeping: only one orphan was actually still writing state (two were emitting a log line per tick and writing no state at all, two were doing effectively nothing); `provider-settings.mjs` was already pid-unique and did **not** need fixing; and the rename race is *not* the only trigger — any rejection inside `mutate`, including a `validateLiveState` throw, bricks the process identically. Killing the orphans alone would have removed today's trigger and left the loaded gun.
- Actions taken: made the stored chain never stay rejected while still propagating each caller's own error; routed reads through the queue as operations; made temp names unique per writer in `live-store.mjs`, `audit-store.mjs`, and `application-log-store.mjs`; applied the same queue fix to `application-log-store.mjs`; made a bind failure fatal and moved `startLoop()` into the `listen` callback, scoped so a post-bind socket error cannot tear down a serving process. Both fixes port patterns the codebase already had — `audit-store.mjs` for the queue, `provider-settings.mjs` for the temp name.
- Files changed: `backend/src/live-store.mjs`, `backend/src/application-log-store.mjs`, `backend/src/audit-store.mjs`, `backend/src/server.mjs`, new `backend/tests/wp20-store-failure-recovery.test.mjs`, `docs/decisions.md`, and this handover.
- Verification: 166/166 unit and integration cases pass. Two of the three new `wp20` cases were confirmed to FAIL against pre-fix code and pass after, so they are genuine regressions; the third (log store) passes both ways and is a guard, not a proof — stated plainly rather than counted as evidence. The bind fix was verified empirically against an occupied port: `server_start_failed`, exit 1, no surviving writer. 14/14 Chromium journeys pass with forced provider failure and no API spend.
- Outstanding work / risks:
  - **The running process on port 3000 (PID 4104636) is permanently poisoned and cannot recover.** The code fix does not heal a live process. It must be restarted, and the four repo-cwd non-listening orphans (4070889, 4075263, 4103995, 4104091) must be killed, or they will keep competing for the state file. Left for the user to authorise; nothing was killed or restarted by this agent.
  - PID 4000438 belongs to a different tree (`/tmp/compass-two-responder`, playwright state path) and is **not** a participant. A blanket `pkill -f "backend/src/server.mjs"` would take it down too.
  - No data repair is needed; `backend/data/live-simulation.json` is healthy.
  - Latent and unaddressed: the state file has grown from 160 KB to over 1 MB with no cap on `recommendations` or `operationalEvents`, and the whole file is rewritten every tick. That is what made the race window wide enough to lose consistently. It is a separate performance/retention problem and was deliberately not fixed here.
- Deployment (2026-09-06, operator-authorised): stopped the poisoned port-3000 server (`4104636`) and the four repo-cwd orphan writers (`4070889`, `4075263`, `4103995`, `4104091`) with `SIGTERM`; all five exited cleanly. `4000438` was deliberately left running — it belongs to `/tmp/compass-two-responder`, not this tree. `backend/data/` was not modified: the state file parsed at revision 39028 with no stray `.tmp` files immediately before restart. One fresh server was started on the fixed code as PID `19198`.
- Post-deployment verification: `GET /` and `GET /api/state` both 200; `/api/state` returned 200 on ten consecutive one-second probes; the persisted revision advanced 39061 → 39065, so the scheduler is ticking and writing; zero `live_scheduler_error` or `ENOENT` entries in the new server's log. The bind guard was exercised in production: a second `npm run dev` against the occupied port logged `server_start_failed` and exited 1 without creating an orphan or disturbing the listener.
- Current Git commit: `32e4835` — `fix: stop a failed write bricking the server`. Not pushed.

### 2026-09-06 — Took over Sol's 2.5D viewport work: in-plane geometry and a screen-space label layer

- Task: The user reported that GPT-5.6 "Sol" ran out of tokens partway through improving the 2.5D viewport rendition, and asked this agent to find where it stopped and continue. **This entry records a handover *from* Sol *to* Claude Opus 5 — Sol, if you pick this up again, the working tree you left is now committed and extended; read this entry before re-deriving anything.**
- Where Sol stopped: the working tree held a complete, green but uncommitted and undocumented slice — new `frontend/map-label-layout.js` (pure lane-packing label placement), a `.map-label-layer` screen-space overlay with `renderProjectedLabels`/`scheduleProjectedLabelLayout` in `frontend/app.js`, `.map-overlay-label` styling with leader lines, inline `.node-copy` suppressed in 2.5D, new `backend/tests/wp19-map-label-layout.test.mjs`, extended `wp18` greps, and one new browser journey. Both suites already passed. Missing were the visual pass, the docs, and the commit.
- Defect found in the visual pass, invisible to the tests as written: labels are measured from live projected geometry, but `applyCamera` scheduled a single `requestAnimationFrame`, so every layout pass was taken while `.building` (.55s) or `.building-stage` (.18s) was still animating. After a zoom, both leader lines visibly ended in empty space several dozen pixels from their nodes. Fixed by re-measuring each frame until `CAMERA_SETTLE_MS` after the last camera change, and covered by a new geometric browser assertion on leader-line endpoints.
- Operator direction taken mid-task, and the reason it changed the shape of the work: "rendering the equipment as 2D when we are on perspective view is just plain wrong — we should just render it on the same xyz axis as the floor", and "this is our first step before we eventually move towards full 3d". Every node previously counter-rotated by `-yaw`/`-pitch` to stay square to the camera. That counter-rotation existed only to keep node *text* legible, so moving text into the overlay is precisely what made removing it possible.
- Actions taken:
  - Removed node counter-rotation. Machines, responders, and floor signage now lie in the floor plane and share its axes. 2D is unchanged, because at `--yaw: 0deg`/`--pitch: 0deg` the removed transform was already the identity.
  - Made `.floor-tag` in-plane signage sized to survive foreshortening, and moved `.map-help` to the bottom-left so it no longer sits on top of that signage.
  - Made overlay rebuilds conditional on the labelled set and its copy changing, so the per-frame path during a camera move is measure-and-position rather than re-create.
  - Extended labelling to hovered/focused nodes on any floor. Suppressing `.node-copy` in 2.5D had otherwise left inactive-floor nodes — which are still clickable — with no label at all on hover.
  - Stopped the lane search retesting an identical clamped rectangle once the column is full; removed the unused `data-world-x/y/z` attributes Sol emitted on all 72 nodes but never read, and repointed the `wp18` grep at `data-overlay-label`.
- Files changed: `frontend/app.js`, `frontend/styles.css`, new `frontend/map-label-layout.js`, `e2e/building-view.spec.mjs`, `backend/tests/wp18-map-camera.test.mjs`, new `backend/tests/wp19-map-label-layout.test.mjs`, `docs/architecture.md`, `docs/decisions.md`, `2p5buildingplan.md`, regenerated `docs/assets/live-control-room.png` and `docs/assets/offline-fallback.png`, and this handover.
- Verification: `npm test` passes 163/163. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passes 14/14 with both providers forced to fail, so no API credits were used. Screenshot-inspected 2.5D floor 1, 2.5D floor 3, a zoomed 2.5D view, a rotated view, and the 2D plan; the leader-line detachment was confirmed present before the fix and absent after. `node --check` passes on both frontend modules.
- Outstanding work / risks:
  - **Not yet deployed.** The server on port 3000 (PID `4104636`) is still running the previous commit. Restart it to pick this up.
  - `2p5buildingplan.md` §WI-3's floating info card remains unimplemented. Its rejection of leader lines, collision avoidance and `requestAnimationFrame` is now explicitly superseded for *persistent projected labels* and recorded as such in the plan's status header — but it still stands for a click-placed card that deliberately does not track its node. Do not "restore" it as a rule over this code.
  - Screenshot-only judgements that cannot be asserted: whether in-plane wireframes read well at the 0.53× vertical foreshortening of `BUILDING_PITCH`, and whether responder ellipses stay distinguishable from machine rhombi at low zoom. Both were judged acceptable at zoom 1 and 1.44; neither has been checked at `ZOOM_MIN`.
  - The 2.5D composition still leaves a large empty band on the side of the viewport away from the inactive floors, because centring is on the active plane rather than on the whole stack's bounding box. Deliberately untouched — it is a framing decision, not a defect, and it likely dissolves in the move to full 3D.
- Current Git commit: `db11fb0` — `feat: put map geometry in the floor plane`. Commit this exact-hash handover refresh as the documentation checkpoint immediately following it. Nothing was pushed.

### 2026-09-06 — Recent Event Feed now drives event-specific detail

- Task: Fix the right pane appearing unchanged when an operator clicks different Recent Event Feed rows, following an independent reviewer reproduction and planning pass.
- Root cause: `selectedEventId` was written but never consumed by `renderIssueAuditTrail`; the cached payload and visible content were issue-scoped. The async completion guard checked only `issueId`, so rapid clicks between events for one issue were not independently owned.
- Actions taken:
  - Made every visible operational-event row interactive, including `SIMULATION_*` entries without an issue.
  - Added an event-specific summary at the top of the context pane using only allowlisted public fields: event type, simulation timestamp, source, and relevant issue/equipment/responder/narrative context.
  - Kept the complete server-fetched issue chronology below the summary for issue-bearing events and resolve the selected event from the full audit record with a captured public-snapshot fallback.
  - Added request-sequence, issue-ID, and event-ID ownership checks. A delayed response can no longer overwrite a newer selection, including two different events for the same issue.
  - Added an issue-scoped public-state signature so an open chronology refreshes after assignment, staffing, or resolution lifecycle changes while event selection persists across polling. Existing `setHtml` dirty checks preserve stable DOM, focus, and controls.
  - Active issue-card clicks, reset, mode changes, and Return to current view invalidate event-detail state and outstanding reads.
  - Added current/pressed/focus semantics, `aria-busy`, and a compact refresh indicator.
- Files changed: `frontend/app.js`, `frontend/index.html`, `frontend/styles.css`, `backend/tests/wp10-control-room-ui.test.mjs`, `e2e/audit-trail.spec.mjs`, `docs/decisions.md`, and this handover.
- Verification: `npm test` passes all 161 unit/integration cases. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passes 12/12 with both providers forced to fail, so no API credits were used. Browser acceptance covers `event-002` (`ISSUE_RAISED`) versus `event-003` (`RESPONDER_ASSIGNED`) on `ISS-103`, two poll ticks, system event `event-001`, stale response reordering, and resolved issue history. `git diff --check` passes.
- Deployment: Committed as `47f0513` (`fix: show selected event details`) and cleanly replaced only the identified Compass process on port 3000, preserving `.env` and `backend/data/`. The restarted server is PID `4104636`; both `/` and `/api/state` returned successfully. Test at `http://127.0.0.1:3000` locally or `http://192.168.80.193:3000` on the LAN. No provider calls were made and nothing was pushed.

### 2026-09-05 — Default 2D map, floor selection, pan, and zoom

- Task: Confirm whether Claude's `2p5buildingplan.md` was deployed, then replace the poor default 2.5D experience with a 2D-first, fully mouse-navigable manufacturing-floor viewport.
- Actions taken: Confirmed that the prior deployment contained the plan only. Implemented one shared Live/Offline renderer with default 2D, optional 2.5D, explicit Floor 1/2/3 selection, cursor-centred wheel zoom, zoom buttons and keyboard controls, bounded background drag/touch pan, camera reset, reduced-motion handling, accessible map/node labels, and poll-safe imperative camera state. Updated the planning document to distinguish implemented camera work from the still-unimplemented floating info card.
- Files changed: `frontend/app.js`, `frontend/styles.css`, `frontend/index.html`, `e2e/building-view.spec.mjs`, `backend/tests/wp15-render-lifecycle.test.mjs`, new `backend/tests/wp18-map-camera.test.mjs`, README, architecture, decisions, the camera plan, screenshots, and this handover.
- Verification: JavaScript syntax and `git diff --check` pass; 161/161 unit/integration cases pass; 10/10 Chromium journeys pass with forced provider failures and no API spend. The final 2D control-room screenshot was visually inspected.
- Outstanding work / risks: The plan's floating selected-node info card remains intentionally unimplemented. 2.5D is retained only as an optional overview; 2D is the default operational view. Camera state is browser-local and does not affect canonical simulation state.
- Current Git commit: `e8c538e` — `feat: add interactive 2d floor viewport`. Commit this exact-hash handover refresh as the documentation checkpoint.

### 2026-09-05 — Two-responder resolution attempts and integrated three-floor control room

- Task: Allow one or two responders to attend an issue, improve duration and success when support joins, and permit mid-issue release, promotion, addition, and explicit cross-issue transfer. Complete the user-requested planner → independent reviewer → coder chain, then integrate the parallel three-floor workstream.
- Actions taken: Added schema-v2 `ResolutionAttempt` records, Primary/Support assignment roles, fixed-draw segmented work settlement, contribution-weighted learning, automatic complex/delay assistance, asynchronous support offer fallback and retry, roster-versioned release and atomic transfer, startup reconciliation, public/audit redaction, analytics weighting, shared Offline attempt math, staffing controls, and chronology in issue audit records. Merged `feat/multi-floor-layout`, resolved no code conflicts, closed its temporary ownership boundary, and hardened migration for early-v2, pre-building, and stale legacy cache states. The real persisted developer state was upgraded in place with a `.pre-v2.bak` recovery copy. An independent review initially rejected lifecycle/privacy/migration gaps; every reproduced blocker was corrected and regression-covered before this handoff.
- Files changed: attempt, assignment, recommendation, resolution, runtime, migration, schema, store, context, analytics, and server backend modules; shared frontend and browser journey; WP6/WP9/WP13/WP16 tests; README, architecture, decisions, floor-layout status, AGENTS guidance, screenshots, and this handover.
- Verification: `npm test` passes 160/160. Chromium Playwright passes 9/9 with forced provider failures and no paid API calls. `git diff --check` is part of the final merge gate. The integration includes 72 machines across three floors and floor-aware travel time.
- Outstanding work / risks: The stochastic model is deliberately synthetic and calibrated for simulation, not a validated prediction of real maintenance performance. Cross-issue transfer remains manual by design; introducing automated global prioritization would violate project scope. The live 100-opportunity provider evaluation remains out-of-band and paid.
- Current Git commit: `690c403` — `fix: repair legacy projection caches`, following merge commit `9f168e3` (`merge: integrate two-responder operations`). Commit this exact-hash handover refresh as the final documentation checkpoint.

### 2026-09-05 — Merged audit trail and completed production cleanup

- Task: Merge `feat/issue-audit-trail` into local `master` and continue the concrete production-hardening items in the Opus takeover briefing.
- Actions taken: Fast-forwarded the complete eight-commit audit-trail chain into `master`. Normalized application-runtime mode errors so wrong-mode routes return 409 and invalid mode selection returns 400, including route-local handlers. Comprehensively updated `backend/src/domain.ts` to describe current Live equipment/issue states, recommendation lifecycle and diagnostics, baselines, model metadata, disagreement, dispatch offers, assignments, and operational events. Audited the other takeover notes: provider settings already preserve independent Compass/Event Planner environment modes and Offline is intentionally fixture-only; the active-offer override list intentionally contains only currently available responders, so the offered responder cannot be mislabeled as an override.
- Files changed after merge: `backend/src/live-runtime.mjs`, `backend/src/server.mjs`, `backend/src/domain.ts`, `backend/tests/wp10-live-runtime.test.mjs`, `README.md`, `docs/architecture.md`, `docs/decisions.md`, and this handover.
- Verification: `npm test` passes 129/129 including the deterministic soak. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passes 6/6 Chromium journeys in 29.1 seconds. `git diff --check` passes. Both suites remain hermetic and made no provider calls.
- Outstanding work / risks: The live 100-opportunity provider evaluation remains a paid, out-of-band operational gate rather than part of the hermetic suite. No core implementation blocker remains from the takeover briefing.
- Current Git commit: `be45e94` — `fix: normalize runtime mode contracts`. Commit this exact-hash handover refresh as the documentation checkpoint immediately following it.

### 2026-09-05 — Dedicated Demo view and visible background agent activity

- Task: Make Event Planner and Compass work visibly observable, and place the presentation overrides in a dedicated Demo window before larger product changes continue.
- Actions taken: Added a **Demo** navigation view with an accessible live activity banner, separate Event Planner and Compass status cards, and both Trigger Next Event / Force Resolve controls. Added a compact activity indicator that remains visible in the navigation bar on every view. Wrapped the live runtime's automatic and manually requested planner/recommendation calls with transient activity tracking, so polling browsers see background work even when another client or the scheduler initiated it. Added immediate browser-local status for the initiating click so there is no wait for the next poll. Offline reports API-free fixture mode and disables Live-only overrides. Removed override controls from the Control Room simulation bar and refreshed current docs/screenshots.
- Files changed: `backend/src/live-runtime.mjs`, `backend/tests/wp10-live-runtime.test.mjs`, `backend/tests/wp10-control-room-ui.test.mjs`, `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `e2e/control-room.spec.mjs`, README/current architecture/demo/evaluation/decision docs, and four screenshots including new `docs/assets/demo-controls.png`.
- Verification: JavaScript syntax checks passed; all 117 unit/integration tests passed; a delayed-provider test proved that `GET /api/state` reports the Event Planner as `RUNNING`; all four Chromium journeys passed in 16.8 seconds with forced inference failures and zero provider spend; the captured Demo view was visually inspected; `git diff --check` passed.
- Outstanding work / risks: Activity state is intentionally transient runtime presentation state and resets on process restart; canonical operational events/recommendations remain the durable audit trail. The initiating browser labels Trigger Next Event as a combined event workflow because successful event planning immediately chains into Compass; other browsers can see the exact runtime stage through polling. Major updates requested by the user have not begun yet.
- Current Git commit: `9a7579e` — `feat: add demo activity monitor`. Commit this handover refresh as the documentation checkpoint immediately following it.

### 2026-09-05 — Stochastic outcome learning, override menu, and synthetic responder identities

- Task: Clarify and reorganize the manual simulation controls, make resolution outcomes reflect both responder capability and observed record plus variability, and remove human-style responder names.
- Actions taken: Renamed the visible event shortcut to **Trigger Next Event** and moved it with **Force Resolve** into a collapsed **Simulation overrides** menu. Kept Force Resolve as a wait bypass only; it still uses the normal outcome sampler. Added an internal confidence-bounded outcome profile: latent per-class skill retains seventy to one hundred percent weight, same-class observed history ramps from zero to at most thirty percent by eight cases, duration varies from seventy to one hundred thirty percent of the blended median, and success is sampled from the blended probability using the persisted RNG. Migrated all runtime seeds, fixtures, tests, UI mappings, and current demo material to fixed-format synthetic identifiers (`Engr104`, `Engr028`, `Tech216`, `Oper088`, `Tech073`, `Oper142`). Hardened model instructions so numeric responder codes are not repeated in prose, rewrote the Offline fixture prose accordingly, and recorded the explicit v4 outcome-policy deviation in `docs/decisions.md`.
- Files changed: `backend/src/resolution-engine.mjs`, `backend/src/agent.mjs`, live and Offline seed/fixture files, affected backend tests, `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, both E2E specs, README/current architecture/evaluation/demo docs, refreshed screenshots, `docs/decisions.md`, and this handover.
- Verification: JavaScript syntax checks passed; all 116 unit/integration tests passed; all four Chromium E2E journeys passed in 14.7 seconds with forced inference failures and no provider spend; screenshots were regenerated and visually inspected; `git diff --check` passed; runtime/fixture/frontend/E2E scans found no old human-style responder names.
- Outstanding work / risks: The persisted developer state was reset after launch and verified to contain only the new responder IDs; the app was left running on port 3000. The new blend deliberately differs from SOW §8/Definition of Done item 14 at the user's explicit direction; the cap and confidence ramp reduce, but do not eliminate, feedback-loop risk. Historical source SOWs and earlier decision/handover entries retain the original Scenario A aliases as archival records. The external live 100-opportunity provider evaluation remains outstanding.
- Current Git commit: `3380354` — `feat: add stochastic outcome learning and override menu`. Commit this handover refresh as the documentation checkpoint immediately following it.

### 2026-09-04 — v4 WP15 documentation package and core freeze

- Task: Complete the documentation/demo package, perform the public-data and repository freeze audit, and leave an exact operator handoff.
- Actions taken: Rewrote the README around the finished v4 product; added architecture, two-minute Live and Offline fallback scripts, release copy and checklist, asset guidance, and three browser-captured screenshots. Added automatic optional `.env` loading, a combined test command, and pinned Playwright configuration. Improved Offline presentation with a dedicated reset control and display-only responder offsets. Audited tracked files, credential placeholders, hidden-skill references, RNG/timer ownership, and proprietary-context references; no secret, generated runtime data, browser report, or hidden truth is present at a public boundary. Recorded the freeze decision while preserving the live-provider disclosure.
- Files changed: `.env.example`, `README.md`, `e2e/control-room.spec.mjs`, `frontend/app.js`, `frontend/index.html`, `frontend/styles.css`, `package.json`, `docs/architecture.md`, `docs/demo-script.md`, the release copy and checklist documents, `docs/assets/README.md`, `docs/assets/live-control-room.png`, `docs/assets/analytics.png`, `docs/assets/offline-fallback.png`, `docs/evaluation.md`, `docs/decisions.md`, and this log.
- Verification: `git diff --check` passes; tracked-file and source scans find only the empty `.env.example` key placeholder, intentional hidden-truth implementation/validation sites, one backend scheduler interval plus browser polling, and the public-safety declarations in AGENTS/README. The latest full unit/integration run passes 91/91, including deterministic convergence and the 100-opportunity soak. Chromium E2E passes the full shared Live/Analytics/Offline journey in under three seconds, and all three final screenshots were visually inspected.
- Outstanding work / risks: No repository work package remains. External operator actions are deliberately unchecked: configure uncommitted credentials and pinned models, record live-provider Scenario A and 100-opportunity results, and narrate/capture the demo video. The private branch has not been pushed by this handoff.
- Current Git commit: `858dd84` — `docs: complete v4 documentation package`. This exact-hash handover refresh is the final documentation-only checkpoint.

### 2026-09-04 — v4 WP14 reliability and evaluation gates

- Task: Validate latent convergence, accelerated state integrity, disagreement capacity, and the actual browser journey.
- Actions taken: Added a deterministic schema-valid evaluation policy and 100-opportunity 60×/10× soak, latent convergence harness, pinned Playwright E2E setup, and a full Live controls → Analytics → Offline confirm browser journey. Added a configurable live-state path for isolated tests and bounded public state payloads. The browser run discovered and drove a fix for an awaited shared-runtime Offline confirmation snapshot.
- Files changed: `backend/src/evaluation.mjs`, `backend/src/live-store.mjs`, `backend/src/live-schema.mjs`, `backend/src/server.mjs`, `backend/tests/wp14-reliability.test.mjs`, `backend/tests/wp10-live-runtime.test.mjs`, `backend/tests/wp1-live-store.test.mjs`, `e2e/control-room.spec.mjs`, `playwright.config.mjs`, `package.json`, `package-lock.json`, `.gitignore`, `docs/evaluation.md`, `docs/decisions.md`, and this log.
- Verification: 91 tests pass. Deterministic soak: 100 opportunities, 75% naive disagreement, 100% evidence-driven disagreement share, 149 observed records, 397 events, zero duplicate active responders, zero leaked active assignments, zero final active issues. Chromium E2E passes in 2.2 seconds.
- Outstanding work / risks: WP15 documentation artifacts and final scans remain. Genuine live-provider validation still requires credentials and pinned models; deterministic evaluation is explicitly not a substitute.
- Current Git commit: pending — commit the validated WP14 slice next.

### 2026-09-04 — v4 WP13 API-free Offline fallback

- Task: Complete and verify Offline as a presentation-ready shared-mode fallback.
- Actions taken: Hard-pinned Offline construction to the validated fixture even when Live environment settings exist; added shared-UI confirmation, override selection, assignment success, reset, and explicit API-free messaging; retained persistent Live state across mode switching.
- Files changed: `backend/src/server.mjs`, `frontend/app.js`, `backend/tests/wp13-offline-mode.test.mjs`, `docs/decisions.md`, and this log.
- Verification: Full `npm test`, frontend syntax check, and `git diff --check` passed. Tests prove fixed Alex/Chen/Priya winners, fixture-only inference, real confirm/override mutations, and byte-equivalent operational reset state.
- Outstanding work / risks: WP14 reliability/evaluation and browser inspection remain. Live model/provider quality cannot be claimed from Offline fixture tests.
- Current Git commit: pending — commit the validated WP13 slice next.

### 2026-09-04 — v4 WP11/WP12 analytics backend and UI

- Task: Build the complete trimmed P0 analytics projection and tab.
- Actions taken: Added fixed-snapshot equipment uptime/downtime, issue counts/reopen rate, responder summaries, alphabetical Issue-Class Experience, and Compass-vs-baselines metrics. Every outcome rate includes numerator/denominator and suppresses `n < 3`; open downtime stays separate from completed medians. Added the live analytics route and rendered KPI, comparator, equipment, responder, and experience panels.
- Files changed: `backend/src/analytics-service.mjs`, `backend/src/live-runtime.mjs`, `backend/src/server.mjs`, `frontend/app.js`, `frontend/styles.css`, `backend/tests/wp11-analytics.test.mjs`, `backend/tests/wp12-analytics-ui.test.mjs`, `docs/decisions.md`, and this log.
- Verification: Full `npm test`, frontend/backend syntax checks, and `git diff --check` passed. Tests cover fixed timestamps, open intervals, sample suppression, stable ordering, runtime deltas, and explicit disagreement derivation.
- Outstanding work / risks: WP13 needs final Offline UI parity, then WP14 must run convergence/evaluation/soak and browser-level reliability. Live provider acceptance still depends on credentials/network.
- Current Git commit: pending — commit the validated WP11/WP12 slice next.

### 2026-09-04 — v4 WP10 live runtime and shared control room

- Task: Integrate all persistent live services into the running application and visible control room.
- Actions taken: Added a composed live runtime with one optional scheduler interval, post-trigger planner/recommendation/resolution chaining, shared Live/Offline mode adapter, full live HTTP control surface, bounded collection routes, and public stripping of internal RNG/tokens. Rebuilt the frontend as a polling multi-issue control room with clock/speed/pause, force controls, floor/responder state, issue selection, recommendations, confirm/override, Force Resolve, event feed, and visible disagreement markers.
- Files changed: `backend/src/live-runtime.mjs`, `backend/src/live-schema.mjs`, `backend/src/server.mjs`, `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `backend/tests/wp10-live-runtime.test.mjs`, `backend/tests/wp10-control-room-ui.test.mjs`, `docs/decisions.md`, and this log.
- Verification: Full `npm test`, JavaScript syntax checks, and `git diff --check` passed. An approved host-level server start returned a public Live snapshot from port 3011 with no hidden skill/RNG fields.
- Outstanding work / risks: Analytics currently shows a placeholder until WP11/WP12. Offline override/success polish is completed in WP13. Browser visual inspection remains part of the final reliability gate.
- Current Git commit: pending — commit the validated WP10 slice next.

### 2026-09-04 — v4 WP7–WP9 live Compass and human decision workflow

- Task: Complete live candidate context, model/audit handling, disagreement instrumentation, and assignment decisions.
- Actions taken: Added persistent revision-bound request snapshots with both baselines/config, bounded live Compass invocation and revalidation, unavailable/stale outcomes, structured disagreement fields and feed events, and atomic confirm/override/stale assignment decisions. Manual override remains available when Compass fails.
- Files changed: `backend/src/live-recommendation-service.mjs`, `backend/src/live-assignment-service.mjs`, `backend/tests/wp7-wp8-live-recommendation.test.mjs`, `backend/tests/wp9-live-assignment-workflow.test.mjs`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed all 77 tests; `git diff --check` passed. Tests prove runtime-history inclusion, hidden-skill exclusion, model-time staleness, complete audit fields, disagreement derivation, confirm/override, stale rejection, and manual fallback.
- Outstanding work / risks: Persistent live services are ready but not exposed through the running server. WP10 must compose one live runtime/timer and shared-mode UI; analytics follows in WP11/WP12.
- Current Git commit: pending — commit the validated WP7–WP9 slice next.

### 2026-09-04 — v4 WP6 latent-skill resolution and reopen engine

- Task: Implement deterministic runtime resolution outcomes and feedback into observed history.
- Actions taken: Added hidden-skill duration/success sampling using only the persisted resolution RNG stream, assignment-time due scheduling, one-shot dispatch validation, observed history append, success/resolve and failure/reopen paths, responder release, downtime preservation/closure, and public stripping of pending outcome fields.
- Files changed: `backend/src/resolution-engine.mjs`, `backend/src/live-assignment-service.mjs`, `backend/src/scheduler.mjs`, `backend/src/live-schema.mjs`, `backend/seed/live-simulation.mjs`, `backend/tests/wp6-resolution-engine.test.mjs`, `docs/decisions.md`, and this log.
- Verification: Full `npm test` regression, syntax checks, and `git diff --check` passed. Tests force deterministic success/failure at the hidden boundary and prove new observed evidence changes later candidate context without mutating latent truth.
- Outstanding work / risks: The resolution engine returns pending issue IDs for later runtime reevaluation; WP7/WP8 must create new revision-safe recommendation workflows. Live runtime routes and UI remain unintegrated.
- Current Git commit: pending — commit the validated WP6 slice next.

### 2026-09-04 — v4 WP5 persistent multi-issue assignment

- Task: Implement canonical live assignment behavior for concurrent issues.
- Actions taken: Added store-backed candidate/ready/assignment services, write-time responder revalidation, responder exclusivity, optional recommendation candidate constraints, assignment and operational-event persistence, and safe pending behavior when no responder is eligible. Corrected the live seed's issue/equipment chronology and added stricter live-state entity/status validation.
- Files changed: `backend/src/live-assignment-service.mjs`, `backend/src/live-schema.mjs`, `backend/seed/live-simulation.mjs`, `backend/tests/wp5-multi-issue.test.mjs`, `docs/decisions.md`, and this log.
- Verification: Full `npm test` regression, syntax checks, and `git diff --check` passed. Coverage proves candidate-set change after assignment, stale same-responder races, no-eligible waiting, and canonical event persistence.
- Outstanding work / risks: New live assignments have no resolution token until WP6 schedules their hidden-skill attempt. Persistent services remain route-free until the live runtime integration package.
- Current Git commit: pending — commit the validated WP5 slice next.

### 2026-09-04 — v4 WP4 contextual event planner and fallback

- Task: Attach safe contextual event creation to WP3 scheduler triggers.
- Actions taken: Added bounded planner packets and output contracts, optional structured OpenAI invocation, canonical proposal validation, revision-safe post-model persistence, deterministic recurrence-weighted fallback on all planner failures, duplicate-token idempotency, and synthetic issue/event mutation. Corrected live equipment seed statuses to derive from unresolved issues.
- Files changed: `.env.example`, `backend/src/event-planner.mjs`, `backend/seed/live-simulation.mjs`, `backend/tests/wp4-event-planner.test.mjs`, `docs/decisions.md`, and this log.
- Verification: Full `npm test` regression passed; planner/schema syntax checks and `git diff --check` passed. Tests cover hidden-skill exclusion, malformed/unknown/occupied proposals, out-of-lock calls, stale revalidation, duplicate delivery, and forced provider failure fallback.
- Outstanding work / risks: The live server/runtime is still not wired to the new persistent services. WP5 must implement shared persistent assignment and multi-issue candidate behavior before UI integration. A genuine live provider check still requires configured credentials/network.
- Current Git commit: pending — commit the validated WP4 slice next.

### 2026-09-04 — v4 WP3 deterministic scheduler and demo-control semantics

- Task: Continue the v4 critical backend path with deterministic scheduler timing, unique due-token consumption, active-issue ceiling enforcement, and Force Next Event / Force Resolve plumbing.
- Actions taken:
  - Added one scheduler service over the existing explicit simulation clock. Ordinary ticks advance the clock and claim due event/resolution triggers atomically; pause prevents ordinary scheduling.
  - Added a bounded 8–25 simulated-minute cadence using a versioned persisted uint32 LCG. Only the scheduler RNG stream changes when scheduling; fallback and resolution streams remain independent.
  - Made scheduled and forced triggers one-shot by consuming persisted event/assignment tokens within the live-store mutation. Trigger callbacks run after the state lock releases, preserving the later model-call boundary.
  - Enforced the configured three-active-issue ceiling for both ordinary and forced event triggers. Force Next Event remains usable while paused; Force Resolve uses the same assignment token as ordinary due resolution.
  - Extended live-state validation and the seed with versioned RNG and initial resolution-schedule contracts. Added acceptance coverage for due timing, speed changes, force controls, ceiling behavior, ordinary resolution timing, restart persistence, and the post-lock callback boundary.
- Files changed: `backend/src/scheduler.mjs`, `backend/src/live-schema.mjs`, `backend/seed/live-simulation.mjs`, `backend/tests/wp3-scheduler.test.mjs`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed all 54 individual tests; `node --check` passed for the scheduler/schema; `git diff --check` passed.
- Outstanding work / risks: WP3 intentionally emits trigger descriptors rather than inventing WP4/WP6 behavior. WP4 must attach the contextual planner plus deterministic fallback and canonical revalidation; WP6 must attach hidden-skill resolution outcomes. Live routes/timer/UI remain deliberately deferred.
- Current Git commit: `4791667` — `feat: add deterministic live scheduler`. The handover-only state refresh that records this hash is the next documentation commit.

### 2026-09-04 — New-chat v4 status checkpoint

- Task: Record the exact implementation state before the owner starts a new chat.
- Actions taken: Refreshed the top-level current-state block to v4 source-of-truth, latest WP0/WP1/WP2 commits, current Offline-vs-Live boundary, tested hidden-skill guarantee, next package, and external live-provider caveat.
- Files changed: this log only.
- Verification: `git log` confirms HEAD `219e044`; the previous WP2 verification recorded 47 passing tests and a clean worktree.
- Outstanding work / risks: Resume at v4 WP3 Scheduler / Demo Controls exactly as described in the current-state block. The active browser experience is still Offline until later live-route/control-room packages deliberately integrate the tested services.
- Current Git commit: pending — commit this handover-only checkpoint next.

### 2026-09-04 — v4 WP0 planning and independent review

- Task: Read the new v4-FINAL SOW, obtain a dedicated implementation plan, and independently review it before coding.
- Actions taken:
  - Read all 2,228 lines of `Compass_ResponseCompass_SOW_v4_FINAL.md`, which supersedes v2 and changes the product target from a single scripted issue to a persistent Live Control Room plus an API-free Offline Demo.
  - Delegated a no-edit v4 plan to a planning agent and a separate no-edit review to a reviewer. The reviewer approved the direction with mandatory corrections: shared Offline work in WP1, persistent assignment before multi-issue acceptance, full fixture validation, one atomic transaction boundary, revision-safe model calls outside that lock, persisted PRNG streams, and early test gates.
  - Recorded the reviewed gap assessment/architecture/delivery order in `docs/v4-implementation-plan.md`; updated `AGENTS.md` and README source-of-truth pointers to v4.
- Files changed: `AGENTS.md`, `README.md`, `docs/v4-implementation-plan.md`, `docs/decisions.md`, and this log.
- Verification: Documentation and planning only; no runtime behavior changed. The next coding slice is deliberately limited to v4 WP1 shared-store/fixtures/hidden-skill contracts.
- Outstanding work / risks: Current UI/runtime remains the old single-issue Offline foundation until WP1 migrates it through the shared interface. Do not start scheduler, live routes, or a UI rewrite before the WP1 store/fixture contract tests exist.
- Current Git commit: pending — commit the reviewed WP0 documentation slice next.

### 2026-09-04 — v4 WP1 schema, fixtures, hidden skill, and atomic store

- Task: Begin the reviewed v4 implementation with only the shared persistence/fixture foundation; preserve current Offline behavior and defer scheduler, live routes, and UI migration.
- Actions taken:
  - Added v4 live-state validation/public projection contracts and a separate fixed synthetic live seed. It includes the required 6 equipment/6 responders/3 classes/48 observed records and 18 hidden `ResponderSkill` rows, which are asserted absent from public state.
  - Added a single-process serialized JSON live store using validate → mutate clone → atomic temporary-file rename. It persists revisions and supports exact live reset; no OperationalEvent reconstruction is introduced.
  - Added a shared mode service for Live public state/reset and the existing API-free Offline runtime/reset. This establishes the shared application seam without changing existing UI endpoints yet.
  - Added required v4 fixture categories: Offline scenario mapping, event-planner input/output, analytics response; validated existing Compass packet/result fixtures alongside them.
  - Added WP1 tests for live seed shape, non-leakage, serialized persistence, exact reset, fixture contract presence, and shared-mode Offline reset.
- Files changed: `backend/src/live-schema.mjs`, `backend/src/live-store.mjs`, `backend/src/mode-service.mjs`, `backend/seed/live-simulation.mjs`, `backend/tests/wp1-live-store.test.mjs`, `fixtures/offline-scenario.json`, `fixtures/event-planner-input.json`, `fixtures/event-planner-output.json`, `fixtures/analytics-response.json`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed all 44 individual tests; `git diff --check` passed.
- Outstanding work / risks: The live store is not yet attached to HTTP routes or the UI by design. WP2 next must implement persistent simulation clock semantics (including no catch-up) using the persisted state and deterministic PRNG streams before any scheduler/control-room work.
- Current Git commit: pending — commit the validated WP1 slice next.

### 2026-09-04 — v4 WP2 persistent simulation clock

- Task: Implement and test persistent simulation time before scheduler/control work.
- Actions taken:
  - Added an explicit-tick simulation clock service over the v4 live store. It supports start, pause, resume, 1×/5×/10×/60× speed selection, and an explicit elapsed-real-time tick that converts to simulation time only while running.
  - Persisted `SIMULATION_STARTED`, `SIMULATION_PAUSED`, and `SIMULATION_RESUMED` operational events; clock operations all use the live store's serialized atomic mutation boundary.
  - Added tests proving pause freezes time, all speed changes preserve exact ordering, invalid speeds are rejected, and reopening the persisted store does not advance time without an explicit tick.
- Files changed: `backend/src/simulation-clock.mjs`, `backend/tests/wp2-simulation-clock.test.mjs`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed all 47 individual tests; `git diff --check` passed.
- Outstanding work / risks: WP3 must add a single deterministic scheduler loop, persisted due-token/idempotency, cadence RNG, active ceiling, and Force Next Event / Force Resolve. Do not add a second independent timer source.
- Current Git commit: pending — commit the validated WP2 slice next.

### 2026-09-03 — WP6 recommendation UI

- Task: Implement the in-situ recommendation UI after the prior WP5 agent-integration handoff.
- Actions taken:
  - Reviewed the clean worktree at `6498e25` and the WP6/WP7 acceptance sections before changing behavior; confirmed WP5 is implemented but its live-provider 10-run sign-off remains external to this sandbox.
  - Added a recommendation panel to the operational dashboard. After a raised issue is recommended, it renders both deterministic baselines, the validated Compass winner, qualitative rationale and rank-1 tradeoff, plus an evidence table for every eligible candidate.
  - Kept numeric facts application-owned: counts, evidence strength, median time, success rate, distance, and travel time all come from `workflow.candidatePacket`; canonical responder IDs resolve names from `state.responders`. The model result is used only for the validated rank order and qualitative prose.
  - Added an explicit loading label while the model request is in flight and an unavailable panel with a re-run action while retaining usable baselines.
  - Added disabled confirm/override affordances with the required labels. They are intentionally non-mutating until WP7 supplies candidate revalidation and a successful canonical assignment write-back.
  - Added a dependency-free UI contract test and documented the data-ownership decision.
- Files changed: `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `backend/tests/wp6-recommendation-ui.test.mjs`, `README.md`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed (all five test modules, including the new WP6 UI contract); `git diff --check` passed.
- Outstanding work / risks:
  - WP7 must activate confirm/override, revalidate availability against live canonical state, mark stale recommendations without assigning, and update the floor only after success.
  - WP8 must persist and retrieve the recommendation audit event, including both baselines and subsequent human decision.
  - WP5 remains not fully signed off until the documented 10-run live, pinned-model check is performed with a configured API key/network.
- Current Git commit: `3e69613741e2551f09a2b7d314f1a56141bbb77f` — `feat: add Compass recommendation panel`.

### 2026-09-04 — WP7 human decision and state mutation

- Task: Continue after WP6 with the required human confirmation/override loop and grounded assignment state write-back.
- Actions taken:
  - Added `backend/src/assignment-service.mjs`, a deterministic mutation boundary that finds canonical issue/responder records, verifies assignment eligibility, and changes issue and responder state atomically in memory only after validation.
  - Added runtime and HTTP routes for confirm and explicit override. Confirmation can only use the validated `topRecommendation.responderId`; override remains a human-selected candidate.
  - Implemented stale-candidate handling: a no-longer-available responder creates a `STALE` decision with no state mutation. The recommendation UI now has active confirm and override controls, a stale message, and an assignment-success state that appears only after server success.
  - Added WP7 tests for direct canonical mutation, unavailable-candidate no-mutation behavior, fixture-backed confirmation of Priya, and override to Alex.
- Files changed: `backend/src/assignment-service.mjs`, `backend/src/server.mjs`, `frontend/app.js`, `frontend/styles.css`, `backend/tests/wp7-assignment.test.mjs`, `README.md`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed (all six test modules); `git diff --check` passed.
- Outstanding work / risks:
  - WP8 still needs persistent, retrievable audit events covering candidate snapshot, both baselines, model outcome, decision, and resulting assignment.
  - WP5's real-provider acceptance remains outstanding: this environment lacks the API key/network required for the 10-consecutive-run pinned-model check.
- Current Git commit: `4b3b5a5f85893d561640dcc04e3d943c957f0b15` — `feat: add grounded assignment workflow`.

### 2026-09-04 — WP8 persistent recommendation audit

- Task: Add P0 recommendation provenance after WP7's canonical assignment write-back.
- Actions taken:
  - Added a small JSON-file audit store with atomic write/rename behavior. It is persistent across process lifetime and reset, local-only, and ignored from version control; tests inject temporary paths rather than sharing demo artifacts.
  - Recommendation requests now create an event keyed by the generated request ID with timestamp, issue ID, candidate evidence snapshot, nearest and naive baselines, model metadata/output, and empty decision fields. Confirm/override/stale outcomes update the same event with decision data and resulting assignment.
  - Added `GET /api/audit/:requestId` for backend/developer retrieval; no audit viewer was added because the SOW classifies that UI as P1.
  - Added audit integration tests that reconstruct Scenario A before and after confirmation and verify retrieval through the route.
- Files changed: `.gitignore`, `backend/src/audit-store.mjs`, `backend/src/server.mjs`, `backend/tests/wp7-assignment.test.mjs`, `backend/tests/wp8-audit.test.mjs`, `README.md`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed (35 individual assertions); `git diff --check` passed.
- Outstanding work / risks:
  - WP9/WP10 should add the full repeated Scenario A → recommend → confirm → reset reliability path and a browser/demo inspection before freeze.
  - WP11 documentation artifacts remain.
  - WP5's live-provider 10-run pinned-model acceptance remains impossible to sign off in this sandbox without network/credentials.
- Current Git commit: `b116aaae6ec89ac6874357d13a3d8813769f1352` — `feat: persist Compass recommendation audits`.

### 2026-09-04 — WP9/WP10 core reliability check

- Task: Verify the full Scenario A workflow can be repeated and reset after the P0 audit package.
- Actions taken:
  - Added a three-cycle integration test: raise Scenario A, request the fixture-backed validated recommendation, confirm Priya, verify canonical assignment, reset, and compare the full returned operational snapshot with the original seed state.
  - Verified that the reset distinction is intentional: operational workflow state returns to seed while persistent audit history remains retrievable outside the main UI.
- Files changed: `backend/tests/wp8-audit.test.mjs`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed all 35 individual tests; `git diff --check` passed.
- Outstanding work / risks:
  - The core is ready to freeze pending the SOW-required live pinned-model verification; no further product behavior should be added without a demonstrated benefit.
  - WP11 artifacts such as architecture/demo script can be completed without changing the core. A two-minute recording and live-provider 10-run log still require an operator with credentials and capture tooling.
- Current Git commit: `704548282af9d58426b996130f130e0c5b86aac3` — `test: verify repeated Compass demo reset`.

### 2026-09-04 — GitHub remote handover

- Task: Publish the Compass repository to GitHub as a private remote and record the handover state.
- Actions taken:
  - Created `github.com/makoantz/compass` (private) via the GitHub API using the `~/.git-credentials` token.
  - Added `origin = git@github.com:makoantz/compass.git` and pushed the full `master` history (head `c1f22ed`); set the GitHub default branch to `master`.
  - Refreshed the stale top "Current handover state" block (was pointing at the WP5-era `6498e25`) to the actual HEAD and current phase, and inserted this entry.
- Files changed: this log (no source changes — pure repository publishing).
- Verification: `git ls-remote origin` returns `c1f22ed`; API reports default branch `master`; local tree clean.
- Outstanding work / risks: unchanged — WP5 live 10-run sign-off and WP11 artifacts still require an operator with credentials/network.
- Current Git commit: `8d5cd43` — `docs: record GitHub remote handover entry`.


### 2026-09-04 — SOW v4-FINAL committed

- Task: Commit the superseding detailed Statement of Work v4-FINAL (post-Claude-review implementation specification) to the repository.
- Actions taken:
  - Copied `Compass_ResponseCompass_SOW_v4_FINAL.md` (2,228 lines) into the repo root next to the superseded v2 SOW; md5-verified byte-identical to the source.
  - v4 defines the final product: persistent live control room + API-free Offline Demo sharing one state model; hidden `ResponderSkill` simulation truth (never sent to Compass/UI); persistent simulation clock with no wall-clock catch-up; 1×/5×/10×/60× speeds; deterministic scheduler with Force Next Event / Force Resolve; contextual event-planning agent + deterministic weighted fallback; multi-issue concurrency (max 3); latent-skill resolution engine with reopen path; Compass context engine over observed history with evidence-strength labels; nearest + naive weighted baselines (auditable); human confirm/override with stale revalidation; event feed with disagreement markers; trimmed P0 Analytics (denominators, n<3 safeguards, Issue-Class Experience not performance-ranked, Compass-vs-baselines panel); WP0-WP15 work packages; 100-case disagreement soak gate; two-minute demo script; offline fallback.
  - Updated this log's Source of truth pointer to v4-FINAL.
- Files changed: `Compass_ResponseCompass_SOW_v4_FINAL.md` (new), this log.
- Verification: md5 match on copy; file committed; tree clean after push.
- Outstanding work / risks:
  - README.md still points at the v2 SOW — reconcile the source-of-truth link on the next content pass.
  - The v2 SOW file remains at the root for history; v4 §1 supersedes it — next agent should follow v4 (WP0 requires a current-repo-vs-v4 gap assessment before any rewrite).
- Current Git commit: `0120956` — `docs: add ResponseCompass SOW v4-FINAL`.
### 2026-09-04 — Network listener configuration

- Task: Make the local demo accessible to devices on the same network.
- Actions taken:
  - Changed the Node listener default from loopback-only to `0.0.0.0`, with `COMPASS_HOST` and `COMPASS_PORT` overrides.
  - Updated the README with local and LAN access instructions and documented the operational constraint that firewall/routing still controls reachability.
  - Ran the complete automated suite successfully. A host-level startup check printed `Compass floor view running on http://0.0.0.0:3005`; this tool runner terminates the foreground process after the verification command, so it does not leave a server running.
- Files changed: `backend/src/server.mjs`, `README.md`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed all 35 individual tests; startup was verified at `0.0.0.0:3005` with host-level permission; `git diff --check` passed.
- Outstanding work / risks: Start the process from the host terminal for sustained access, and ensure port 3000 (or chosen `COMPASS_PORT`) is allowed through the host firewall. Live pinned-model verification remains outstanding.
- Current Git commit: pending — commit the listener change next.

### 2026-09-04 — Runtime logs and UI timeout diagnostics

- Task: Investigate a user-reported apparent hang after context/recommendation/assignment and add observability where no historic request logs existed.
- Actions taken:
  - Confirmed no current Compass server process was visible to this session and the original implementation had only a startup `console.log`, so no historic request-level diagnosis was recoverable.
  - Added structured terminal logs for each HTTP request start/completion/error and each grounded workflow milestone: context prepared, recommendation completed, and assignment completed.
  - Added a 15-second abort timeout to browser state requests. On timeout the UI reports the issue and directs the operator to terminal logs rather than retaining a permanent spinner.
  - Added tests for HTTP lifecycle log shape and canonical workflow outcome logs.
- Files changed: `backend/src/server.mjs`, `frontend/app.js`, `backend/tests/wp3-wp4-server.test.mjs`, `README.md`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed all 38 individual tests; `git diff --check` passed.
- Outstanding work / risks: Restart the user-run server to load these diagnostics. The prior apparent hang cannot be diagnosed retrospectively because no request logs were retained; if it recurs, capture the JSON line(s) around the affected request.
- Current Git commit: pending — commit the diagnostics slice next.

### 2026-09-04 — Built-in persistent application logging

- Task: Replace terminal-only logs after the owner correctly required application-owned logging.
- Actions taken:
  - Added a bounded (1,000-event), persistent, serialized JSON runtime-log store under ignored local application data.
  - Added an application logger that persists every server lifecycle and workflow event while optionally mirroring it to stdout.
  - Added `GET /api/logs` with an optional bounded `limit` query for built-in developer retrieval, and `POST /api/logs/client` for browser error reports. Browser failure paths now attempt to record the action/error automatically.
  - Added integration coverage proving lifecycle and grounded workflow events persist and can be retrieved through the application endpoint.
- Files changed: `backend/src/application-log-store.mjs`, `backend/src/server.mjs`, `frontend/app.js`, `backend/tests/wp8-audit.test.mjs`, `README.md`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed all 39 individual tests; `git diff --check` passed.
- Outstanding work / risks: Restart the running server after this commit. The old run cannot be reconstructed because it predated application logging; future failures can be retrieved at `/api/logs`.
- Current Git commit: pending — commit the persistent logging slice next.

### 2026-09-04 — Resolved false loading cursor

- Task: Investigate the reported continuous hourglass on the disabled “Issue context prepared” control.
- Actions taken:
  - Correlated the persisted workflow logs: context, recommendation, and assignment all completed successfully in milliseconds with no server/client errors.
  - Identified the actual UI defect: a global `button:disabled { cursor: wait }` rule applied an endless busy cursor to all disabled controls, including the settled context-prepared state.
  - Changed disabled controls to `not-allowed` and added an explicit `.is-loading` class only during network requests; added UI contract checks for both cursor states.
- Files changed: `frontend/styles.css`, `frontend/app.js`, `backend/tests/wp6-recommendation-ui.test.mjs`, `docs/decisions.md`, and this log.
- Verification: `npm test` passed all 39 individual tests; `git diff --check` passed.
- Outstanding work / risks: Browser must refresh to receive the updated CSS/JS; no backend fault was present in the captured run.
- Current Git commit: pending — commit the cursor-fix slice next.

### 2026-09-03 — Initial handover setup

- Task: Establish the shared agent handover record requested by the project owner.
- Actions taken:
  - Created this `handover.md` file with durable update instructions for all future agents.
  - Identified the authoritative Compass specification: `compass-responsecompass-detailed-sow-v2-final.md`.
  - Verified that the workspace contains an empty `.git` directory but is not yet an initialized Git worktree; no commit hash exists yet.
- Files changed: `handover.md`.
- Verification: Confirmed the SOW exists and is 2,578 lines long; `git rev-parse --is-inside-work-tree` reports that no repository is initialized.
- Outstanding work / risks:
  - Initialize Git and make the initial tracked commit so handovers can reference a real commit hash.
  - Read the full SOW, then begin implementation planning and coding according to its authoritative requirements.
- Current Git commit: None (Git repository not initialized).

### 2026-09-03 — Git tracking established

- Task: Create the initial Git baseline required for traceable agent handovers.
- Actions taken:
  - Initialized the previously empty `.git` directory as a Git repository.
  - Committed the authoritative SOW and the initial handover log.
- Files changed: Git metadata; tracked `compass-responsecompass-detailed-sow-v2-final.md` and `handover.md`.
- Verification: Initial commit completed successfully.
- Outstanding work / risks: Read the full SOW and create implementation plan before coding.
- Commit hash: `138ade8002e68be3fcaa70a1b677bcce573384b7` — `docs: add Compass SOW and agent handover`.

### 2026-09-03 — SOW review and agent delegation

- Task: Read the approved Compass SOW and prepare the next implementation handoff.
- Actions taken:
  - Read all 2,578 lines of `compass-responsecompass-detailed-sow-v2-final.md`.
  - Started a planning agent to return a WP0–WP11/P0 implementation plan and acceptance-test sequence without editing files.
  - Started a coding agent restricted to safe WP0 bootstrap and WP1 contracts/fixtures, with an explicit instruction to update this log on completion.
- Files changed: `handover.md`.
- Verification: SOW review completed; both delegated agents were launched successfully.
- Outstanding work / risks:
  - Await the planning recommendation before choosing the final implementation stack.
  - Review and validate the coding agent's bootstrap/domain changes before moving to WP2.
- Baseline commit hash: `138ade8002e68be3fcaa70a1b677bcce573384b7`.

### 2026-09-03 — WP0 bootstrap and WP1 canonical Scenario A contracts

- Task: Implement the safe repository bootstrap and domain/seed/fixture slice without expanding into UI, deterministic ranking, assignment mutation, or LLM integration.
- Actions taken:
  - Added project hygiene and bootstrap files: `README.md`, `.gitignore`, `.env.example`, `AGENTS.md`, `package.json`, `frontend/.gitkeep`, and `docs/decisions.md`.
  - Added canonical TypeScript domain contracts in `backend/src/domain.ts` for equipment, responders, issues, resolution history, candidate evidence, versioned packets/results, and recommendation records.
  - Added a fixed synthetic Scenario A state in `backend/seed/scenario-a-state.json`: six equipment items, six responders, three issue classes, one active issue, and 48 resolution records. It preserves the mandatory availability roles: Alex/Priya/Chen/Morgan available; Sam unavailable; Jordan assigned.
  - Added a fresh-copy reset helper at `backend/src/demo-state.mjs`; it never exposes the mutable module seed.
  - Added the stable WP1 collaboration fixtures required by the SOW: `fixtures/candidate-packet-scenario-a.json` and `fixtures/agent-result-scenario-a.json`. The packet contains only eligible candidates and excludes availability/coordinates; the result ranks Priya first and contains qualitative-only model prose.
  - Added dependency-free WP1 tests in `backend/tests/wp1-contracts.test.mjs` that verify dataset shape, fixture-to-history metric derivation, bounded packet fields, grounded agent-result IDs, qualitative prose, and reset isolation.
- Files changed: `README.md`, `.gitignore`, `.env.example`, `AGENTS.md`, `package.json`, `docs/decisions.md`, `frontend/.gitkeep`, `backend/src/domain.ts`, `backend/src/demo-state.mjs`, `backend/seed/scenario-a-state.json`, `backend/tests/wp1-contracts.test.mjs`, `fixtures/candidate-packet-scenario-a.json`, `fixtures/agent-result-scenario-a.json`, and this log.
- Verification: `npm test` passed (all WP1 contract assertions); `git diff --check` passed.
- Outstanding work / risks:
  - WP2 must implement and test the deterministic context engine, including Euclidean distance/travel derivation, aggregation services, nearest baseline (Alex), and a documented fixed naive-score formula that selects Chen without evidence-strength adjustment.
  - The initial fixed seed uses exact rates derivable from its discrete records (Alex 5/6 and Morgan 3/4), a documented adjustment from the SOW's illustrative decimal rates. The mandatory winners and evidence-strength roles are unchanged.
  - UI, model provider integration, output validation, assignment mutation, audit persistence, and end-to-end workflow remain unimplemented.
- Current Git commit: `138ade8002e68be3fcaa70a1b677bcce573384b7` — no commit was made for this slice per the coding-agent instruction; the next owner should review and make a logically scoped commit before WP2.

### 2026-09-03 — Review of WP0/WP1 implementation against SOW

- Task: Audit the prior agent's WP0 (bootstrap) and WP1 (canonical Scenario A contracts/fixtures) work against `compass-responsecompass-detailed-sow-v2-final.md`. Read-only review; no code or file changes were made except this log entry.
- Actions taken:
  - Read the full 2,578-line SOW end to end (WP breakdown, data model, agent input/output contracts, Scenario A spec, test matrices, README/decision-log requirements).
  - Read `README.md`, `.gitignore`, `.env.example`, `AGENTS.md`, `package.json`, `docs/decisions.md`.
  - Read `backend/src/domain.ts`, `backend/src/demo-state.mjs`, `backend/seed/scenario-a-state.json`, `backend/tests/wp1-contracts.test.mjs`, both fixtures, and confirmed `frontend/` contains only `.gitkeep`.
  - Manually recomputed Scenario A distances, medians, success/reopen rates, and evidence-strength labels from the raw `resolutionHistory` records and cross-checked them against the fixtures.
  - Ran `npm test` (Node v22.23.1) — all 5 tests pass.
  - Compiled `backend/src/domain.ts` with `tsc --noEmit --strict` (via `npx -p typescript`) — no errors.
  - Ran `git status` / `git add -A -n` — confirmed nothing from this slice is committed.
- Findings (most severe first):
  - **Major** — Nothing from the WP0/WP1 slice is committed (`git status` shows all new files untracked, `handover.md` modified). SOW §5 recommends "Commit 1 — SOW; Commit 2+ — new ResponseCompass implementation," and WP0 acceptance requires "project history clearly begins as ResponseCompass." With only the original SOW/handover commit present, this acceptance criterion is not actually met yet, contrary to the impression that WP0 is signed off. (Log already flags this as outstanding — confirmed accurate, not fixed.)
  - **Minor** — `backend/seed/scenario-a-state.json`: `R-JORDAN.currentIssueId = "ISS-103"`, but the seed's `issues[]` array only contains `ISS-104`. This is a dangling reference; no issue object backs Jordan's assignment.
  - **Minor** — `docs/decisions.md` does not follow the SOW §62 decision-log template (`Date / Decision / Reason / Affected SOW section / Impact`); it uses freeform bullets instead. Content is accurate but format diverges from spec.
  - **Minor** — `backend/src/domain.ts` is TypeScript but the repo has no `tsconfig.json` and `package.json` has no TypeScript dependency or typecheck script; `npm test` never compiles it. Verified independently via ad hoc `tsc --strict` that it compiles cleanly, but this isn't automated/repeatable in-repo.
  - **Nit** — Seed history is exactly 48 records, the low end of the SOW §31 "approximately 48–72" range, rather than comfortably inside it.
  - **Nit** — The SOW's suggested `docs/SOW.md` copy (§58) doesn't exist; the SOW stays at repo root under its long original filename, referenced by that name in `AGENTS.md`/README. Allowed under "or equivalent" (§WP0 deliverables) but slightly awkward.
  - Confirmed and not a deviation: the discrete historical rates (Alex 5/6 = 83.3% vs SOW's illustrative 78%; Morgan 3/4 = 75% vs illustrative 80%) are explicitly permitted by SOW §32 ("Final exact numbers may be adjusted... but these invariants are mandatory"), and Priya/Chen's rates match the SOW's illustrative numbers exactly. All mandatory Scenario A invariants hold: distances (Alex 8, Priya 85, Chen 45, Morgan 35), medians (16/10/7/15), evidence-strength labels (STRONG/STRONG/WEAK/MODERATE), and eligibility roles (Alex/Priya/Chen/Morgan available, Sam unavailable, Jordan assigned) all match the SOW's mandated Scenario A target exactly.
- Verified correct / faithful to the SOW:
  - Seed dataset counts match SOW §31 (6 equipment, 6 responders, 3 issue classes) and WP1 acceptance criteria; all mechanically checked by the test suite, not just asserted.
  - `backend/src/domain.ts` types match the SOW's data model almost field-for-field: Equipment (§17.1), Responder (§17.2), Issue (§17.3), ResolutionHistory (§17.4), Recommendation (§17.5), CandidateEvidence (§11), CandidatePacket (§21), AgentResult (§23) — including correctly omitting `availability`/`x`/`y` from the model-facing candidate type and using nullable historical fields for zero-history support (§20/§38). One forward-looking gap worth tracking for WP8: SOW §39's audit record wants both `nearestBaseline` and `naiveScoreBaseline`, but `Recommendation` (matching §17.5 exactly) only has one `baselineResponderId` — a SOW-internal §17.5/§39 mismatch, not a defect introduced by this agent.
  - `demo-state.mjs` uses `structuredClone()` for every read — genuinely returns an independent deep copy each call; verified by the reset-isolation test mutating a returned copy and confirming a fresh fetch is unaffected.
  - Both fixtures (`fixtures/candidate-packet-scenario-a.json`, `fixtures/agent-result-scenario-a.json`) match the SOW's §21/§23 contracts: bounded/typed/versioned, only the 4 eligible candidates, no `availability`/`x`/`y`, correct un-rounded `travelTimeMinutes = distance/1.4/60`, Priya ranked first, rank-1 tradeoff references Chen by ID, and all generated prose is fully qualitative (verified with a digit-regex scan across every prose field — no numeric leakage).
  - `backend/tests/wp1-contracts.test.mjs` is genuinely substantive, not vacuous: it independently recomputes medians/success/reopen rates/evidence-strength from raw history and asserts equality against the fixtures, checks forbidden-field absence, checks ID grounding, checks qualitative-only prose via regex, and exercises reset isolation via actual mutation. All 5 tests pass under `npm test`.
  - `.env.example`, `.gitignore`, `AGENTS.md` are reasonable and consistent with SOW §53/§59/WP0 (placeholders only, `.env` excluded, pinned-model-ID reminder present, no scope-creep guidance omitted).
  - No premature reach into WP2+ scope: the candidate packet/agent result are hand-authored fixtures, not computed by any engine; no ranking/baseline/mutation/audit logic exists yet, consistent with the log's stated exclusion.
- Outstanding work / risks: same as the prior entry (WP2 deterministic context engine, evidence-strength computation, naive baseline formula, WP3+ UI, agent integration, assignment mutation, audit persistence all remain unimplemented), plus the new findings above — most importantly that this slice is still fully uncommitted and the dangling `Jordan.currentIssueId` reference should be fixed (add an `ISS-103` issue record or drop the field) before WP2 builds on this seed.
- Current Git commit: `138ade8002e68be3fcaa70a1b677bcce573384b7` — this review made no code changes; only this handover entry was added, and it too remains uncommitted along with the entire WP0/WP1 slice. No commit was made by this review.

### 2026-09-03 — WP2 deterministic context engine

- Task: Implement the authoritative context layer that establishes the evidence before any agent reasoning.
- Actions taken:
  - Added `backend/src/context-engine.mjs` with deterministic availability filtering, Euclidean distance, travel-time conversion at 1.4 m/s, same-class historical aggregation, evidence-strength labels, bounded candidate-packet construction, and both required baseline selectors.
  - Added the fixed, documented naive formula `(100 × successRate) − (2 × medianResolutionMinutes) − (3 × travelTimeMinutes)`. It intentionally omits sample strength and returns Chen in Scenario A.
  - Added WP2 test coverage for geometry, travel time, all evidence-strength boundaries, same-class/even/zero history, packet grounding, deterministic baseline winners, and no-eligible-responder behavior.
  - Corrected fixture floating-point travel values to match the SOW-prescribed calculation order and added the otherwise dangling assigned `ISS-103` seed issue for Jordan.
  - Converted `docs/decisions.md` to the required decision-log structure and documented the fixed baseline.
- Files changed: `backend/src/context-engine.mjs`, `backend/tests/wp2-context-engine.test.mjs`, `backend/seed/scenario-a-state.json`, `fixtures/candidate-packet-scenario-a.json`, `docs/decisions.md`, `README.md`, and repository bootstrap/contract files staged by the prior WP0/WP1 task.
- Verification: `npm test` passed (WP1 and WP2 suites); `git diff --check` passed before commit.
- Outstanding work / risks: WP3–WP4 floor/issue workflow, WP5 model integration and validation, WP6 recommendation UI, WP7 state mutation, WP8 audit persistence, and full integration tests are still outstanding. The next implementation should preserve this engine as the sole authority for numeric evidence and eligibility.
- Commit hash: `0a9f8213dbeaf10cc39198396d219d88408eb1b1` — `feat: add Compass deterministic context engine`.

### 2026-09-03 — Validation of WP2 commit (0a9f8213)

- Task: Independently re-verify the WP2 handover entry's claims against the actual committed code, since the prior review (the "Review of WP0/WP1 implementation against SOW" entry above) had flagged the whole slice as uncommitted and found a dangling `ISS-103` reference. Read-only validation; no code changes.
- Actions taken:
  - Confirmed `git log` contains commit `0a9f8213dbeaf10cc39198396d219d88408eb1b1` with exactly the 16 files the WP2 entry lists; `git show --stat` matches the claimed diff.
  - Ran `npm test`: 11/11 tests pass (5 WP1 + 6 new WP2 tests for geometry, evidence-strength boundaries, aggregation with same/odd/even/zero-sample history, packet grounding, deterministic baselines, and no-eligible-responder behavior).
  - Read `backend/src/context-engine.mjs` in full and hand-recomputed Scenario A (issue `ISS-104`, equipment at (50,50)) independently of the code: distances Alex 8 / Priya 85 / Chen 45 / Morgan 35; medians 16 / 10 / 7 / 15; naive scores Alex 51.05, Priya 67.87, Chen 84.39 (winner), Morgan 43.75 — all match `fixtures/candidate-packet-scenario-a.json` and the code's own baseline selectors exactly.
  - Cross-checked `getEvidenceStrengthLabel` boundaries (0→NONE, 1–2→WEAK, 3–5→MODERATE, 6+→STRONG) against SOW §11 — verbatim match.
  - Confirmed the previously-flagged dangling reference is fixed: `backend/seed/scenario-a-state.json` now has an `ISS-103` issue object with `assignedResponderId: "R-JORDAN"` backing `R-JORDAN.currentIssueId`.
  - Confirmed `docs/decisions.md` now follows the SOW §62 template (Date/Decision/Reason/Affected SOW section/Impact) for all three logged decisions, resolving the prior review's format finding.
  - Confirmed the prior review's top blocker (nothing committed) is resolved: commit `0a9f8213` is the first real ResponseCompass commit and includes the full WP0+WP1+WP2 slice, not just WP2.
- Findings: none outstanding from this validation pass. Every claim in the WP2 entry checked out against the actual repository state; no discrepancies found between the log, the code, the fixtures, and the SOW.
- Verification: `npm test` (11/11 pass), manual recomputation of all Scenario A numeric outputs, `git log`/`git show --stat` against the claimed commit, direct file reads of `context-engine.mjs`, `scenario-a-state.json`, `wp2-context-engine.test.mjs`, `fixtures/candidate-packet-scenario-a.json`, and `docs/decisions.md`.
- Outstanding work / risks (cleared to proceed): WP3–WP4 floor/issue workflow, WP5 model provider integration and output validation, WP6 recommendation UI, WP7 assignment-state mutation, WP8 audit persistence, and end-to-end/integration tests remain unimplemented. `backend/src/context-engine.mjs` is validated as the sole authority for numeric evidence, eligibility, and both baselines — the next implementation should call into it rather than re-deriving any of this logic (distance, travel time, medians, success/reopen rates, evidence-strength labels, nearest/naive baselines) elsewhere. No blockers remain from WP0–WP2; the next agent may proceed directly to WP3.
- Current Git commit: `0a9f8213dbeaf10cc39198396d219d88408eb1b1` — no new commit was made by this validation pass (read-only); this handover entry itself is uncommitted pending the next commit.

### 2026-09-03 — Opus 5 review consumed and WP3 floor view

- Task: Read the handover's Opus 5 validation review, then continue with the next SOW task (WP3 Floor View).
- Actions taken:
  - Read the review entry `Validation of WP2 commit (0a9f8213)`. It found no remaining WP0–WP2 discrepancies and directed the next implementation to reuse `backend/src/context-engine.mjs` rather than duplicate deterministic logic.
  - Added a dependency-free Node HTTP server with canonical `GET /api/state` and deterministic `POST /api/reset` routes.
  - Added the responsive in-situ operational floor view. It renders all six equipment items, all six responders, visible AVAILABLE/UNAVAILABLE/ASSIGNED state, active E4 marker, active equipment name, issue class, external priority, and reset control.
  - Kept recommendation calculation and model behavior out of the browser. The UI displays only canonical state returned by the server.
  - Documented the dependency-free floor-delivery decision and runnable startup instructions.
- Files changed: `backend/src/server.mjs`, `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `package.json`, `README.md`, `docs/decisions.md`, and this log.
- Verification:
  - `npm test` passed: 11/11 deterministic contract and context-engine tests.
  - `git diff --check` passed before commit.
  - With the local loopback server running, `GET /api/state` returned the expected active issue and six equipment/responders; `GET /` served the Compass floor page; `POST /api/reset` restored the active issue to `PENDING`.
- Outstanding work / risks:
  - WP4 must activate the issue workflow and expose the two deterministic baselines before model reasoning.
  - WP5–WP8 (model integration/output validation, recommendation UI, assignment mutation, audit persistence) remain unimplemented.
  - The server intentionally runs on loopback only. It requires standard local port-binding permission in this sandbox.
- Commit hash: `68d4164bd96461097dd41a4682eb0d247024f618` — `feat: add Compass operational floor view`.

### 2026-09-03 — Review of WP3 floor view (commit 68d4164) against SOW

- Task: Independently check the "Opus 5 review consumed and WP3 floor view" entry's WP3 (Floor View) work against SOW §WP3 acceptance criteria and the §14 reference architecture. Read-only review; no code changes.
- Actions taken:
  - Read SOW WP3 (Objective/Tasks/Acceptance) and §14 Reference Architecture to confirm the floor view is meant to be a pure rendering of canonical state with no model/ranking logic yet.
  - Confirmed `git log` contains commit `68d4164bd96461097dd41a4682eb0d247024f618` with exactly the 7 files the entry lists (`backend/src/server.mjs`, `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `package.json`, `README.md`, `docs/decisions.md`).
  - Ran `npm test`: still 11/11 pass — no regression from WP3.
  - Read `backend/src/server.mjs`, `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `package.json`, updated `README.md`, and the new decision-log entry in `docs/decisions.md` in full.
  - Manually exercised the running server: `GET /api/state` returns full canonical Scenario A state; `POST /api/reset` restores it; `GET /` serves the floor page with HTTP 200.
  - Checked static file serving in `server.mjs` for path-traversal safety (`normalize(join(frontendRoot, requestedPath))` gated by `filePath.startsWith(`${frontendRoot}/`)`) — sound.
- Findings (most severe first): none rise to blocker or major; all WP3 acceptance items are met.
  - **Minor** — `README.md`'s "Current bootstrap" bullet list still says "This repository currently contains the WP0–WP2 foundation" even though this is the post-WP3 commit; the WP3 floor view is only mentioned in a separate paragraph below, so the header line is stale and should say WP0–WP3.
  - **Minor** — No automated test file was added for `backend/src/server.mjs` (routes `/api/state`, `/api/reset`, static serving, 404/405 handling). WP3's own acceptance criteria are visual/rendered-screen based ("No subjective viewer-comprehension criterion is used for WP3 sign-off" implies manual check is acceptable), so this isn't a spec violation, but it breaks the otherwise-consistent pattern of every prior WP shipping with dependency-free `node --test` coverage. Worth adding lightweight route tests before WP4 adds more server logic on top.
  - **Nit** — On the floor and in the legend, `ASSIGNED` and `UNAVAILABLE` responders share the same gray tone (`#8c9da7` / `#81909b`); they're differentiated only by their text status label, not by color. Acceptance only requires the screen to "contain and label" each state, which is satisfied, but the color reuse slightly weakens the "differentiate availability state" visual intent.
- Verified correct / faithful to the SOW:
  - All WP3 acceptance items present and labeled: all 6 responders (floor markers + side list), at least one `UNAVAILABLE` (Sam) and one `ASSIGNED` (Jordan) responder, all 6 equipment items, an active-issue marker (pulsing ring + "Active issue" label) on the correct equipment (EQ-04 "Station 4"), active equipment name, issue class ("B"), external priority ("HIGH priority" badge), and a working reset control — confirmed both by reading the code and by live server interaction.
  - No recommendation/ranking/model logic leaked into the browser — the UI only renders canonical state fetched from the server, matching §14's architecture ordering (floor view precedes the context engine/agent/recommendation stages, which remain server-side and unbuilt).
  - `docs/decisions.md`'s new "Dependency-free floor delivery" entry follows the SOW §62 template and accurately documents the static-frontend-over-Node-HTTP choice and the constraint that future UI work must keep consuming backend-provided evidence rather than duplicating business logic client-side.
  - Server correctly reuses `createInitialDemoState()` from `demo-state.mjs` (the already-validated deep-clone reset helper) rather than re-deriving state, and confines static file serving to `frontend/` with a traversal guard.
- Outstanding work / risks: same as the WP3 entry above (WP4 issue-workflow activation, WP5 model integration/output validation, WP6 recommendation UI, WP7 assignment mutation, WP8 audit persistence, integration tests) — no new blockers found. Recommend the next agent fix the stale README bullet and add minimal server route tests as low-cost cleanup alongside WP4, but neither blocks starting WP4.
- Current Git commit: `68d4164bd96461097dd41a4682eb0d247024f618` — this review made no code changes; only this handover entry was added and remains uncommitted pending the next commit.

### 2026-09-03 — WP4 issue workflow (continued and completed after handoff interruption)

- Task: Continue WP4 (Issue Workflow) where the prior agent ("gpt sol" / Codex, referenced in earlier entries) left off after going offline mid-task with the work implemented but uncommitted and undocumented.
- Starting state found: working tree had unstaged, uncommitted changes to `README.md`, `backend/src/server.mjs`, `frontend/app.js`, `frontend/index.html`, `frontend/styles.css`, plus an untracked `backend/tests/wp3-wp4-server.test.mjs` — all implementing WP4 — with no corresponding `docs/decisions.md` entry and no handover entry for this work.
- Actions taken:
  - Read SOW WP4 (Objective/Tasks/Acceptance: "Issue can be raised from the interface and both deterministic baselines appear without manual text input or an LLM call") and §17.3's recommended issue states (`PENDING`/`RECOMMENDATION_READY`/`ASSIGNED`/`RESOLVED`) to validate the in-progress work against spec rather than assuming it was correct.
  - Reviewed the uncommitted diff in full: `server.mjs` was refactored into `createDemoRuntime()` (holds `demoState` + transient `workflow`), a pure `createRequestHandler(runtime)`, and `createCompassServer(runtime)`, plus a new `POST /api/issues/:id/raise` route that transitions an eligible issue to `RECOMMENDATION_READY`, builds the candidate packet via the existing `context-engine.mjs`, and computes both baselines; `GET /api/state` now returns `{ ...demoState, workflow }`; `frontend/app.js`/`index.html`/`styles.css` add a "Raise Scenario A issue" control and a baseline panel; `README.md` bumped its bootstrap claim to WP0–WP3 and documented `COMPASS_PORT`.
  - Confirmed `IssueStatus` already included `RECOMMENDATION_READY` from the WP0/WP1 domain contracts (`backend/src/domain.ts`), so no domain-model gap existed.
  - Ran `npm test`: all 13 tests pass (11 prior + 2 new in `wp3-wp4-server.test.mjs` covering the state/raise/reset happy path and 404/405 error handling).
  - Manually exercised the running server on a scratch port (`COMPASS_PORT=3010`): `GET /api/state` starts `PENDING`/`workflow: null`; `POST /api/issues/ISS-104/raise` returns status `RECOMMENDATION_READY` with a 4-candidate packet (no leaked `availability`) and baselines `nearestBaseline.responderId = R-ALEX`, `naiveScoreBaseline.responderId = R-CHEN`, matching the WP2-validated Scenario A winners; `POST /api/reset` returns to `PENDING`/`null`; raising an unknown issue ID returns 404; `GET /` still serves the floor page (200).
  - Filled the two gaps left by the interrupted handoff: bumped `README.md`'s bootstrap bullet from WP0–WP3 to WP0–WP4 and described the raise control; added a `docs/decisions.md` entry ("In-memory issue-raise workflow with testable server runtime") documenting the runtime/handler refactor, the `RECOMMENDATION_READY` transition, and that `workflow` stays server-computed only (no ranking/business logic in the browser), per SOW §17.3/WP4.
- Files changed: `README.md`, `backend/src/server.mjs`, `frontend/app.js`, `frontend/index.html`, `frontend/styles.css`, `docs/decisions.md`, `backend/tests/wp3-wp4-server.test.mjs` (new), and this log.
- Verification: `npm test` (13/13 pass); manual end-to-end exercise of `/api/state`, `/api/issues/ISS-104/raise`, `/api/reset`, `/api/issues/UNKNOWN/raise`, and `/` against a live server instance; re-derived that the raise-triggered baselines match the already-validated WP2 Scenario A math (Alex nearest, Chen naive-score winner).
- Outstanding work / risks: WP5 (model integration: system instruction, structured output schema, server-side model call, timeout/schema/candidate-ID/request-ID validation, 10/10 Scenario A run recorded in `docs/decisions.md`) is the next work package and remains unimplemented, along with WP6 recommendation UI, WP7 assignment mutation, and WP8 audit persistence. The `workflow.candidatePacket.recommendationRequestId` (currently `rec-ISS-104-<n>`) is available for WP5 to thread into the model request/response validation. No known defects in the WP4 slice.
- Commit hash: `f62e306b9c18a9dcc3846b2e56b9e7ae385380f4` — `feat: add Compass issue-raise workflow (WP4)`. This commit includes the WP4 implementation files and both previously-queued handover entries (the WP3 review and this one).

### 2026-09-03 — WP5 agent integration (implemented and unit-tested; live-model check outstanding)

- Task: Implement WP5 (Agent Integration) since Codex/"gpt sol" remained offline. Codex's earlier WP3/WP4 work is done and committed; this entry starts from that clean state (commit `f62e306`, plus a follow-up handover-only commit `6f0914f`) rather than continuing an in-progress handoff.
- Actions taken:
  - Read SOW §21–§25 (agent input/output contracts, output validation, grounding rule), §36 (agent failure behavior), §39 (audit record), §45 (agent validation test matrix), §46 (Scenario A: 10 consecutive runs, Priya rank-1 = 10/10, schema-valid = 10/10), §53 (security: secrets server-side only, no API key in frontend bundle), and §15 (technology posture, which lists "OpenAI API / Responses API" as an example, not a mandate).
  - Added `backend/src/agent.mjs`: the SOW §22 system instruction verbatim; a hand-rolled (dependency-free) structural checker for the SOW §23 output contract; `validateAgentResult(candidatePacket, result)` implementing every SOW §24/§45 rule — schema shape, `schemaVersion` match, request-ID match, every `responderId` grounded in the actual candidate packet (rejects unknown/ineligible/duplicate IDs), full and non-duplicated ranking coverage, rank-1 `tradeoff` required and must reference a different eligible candidate, and rejection of any generated prose containing a digit (numeric-evidence leakage per §23/§24 rule 8); and `requestAgentRecommendation(candidatePacket, options)`, which never throws — every failure (missing config, provider HTTP error, timeout, invalid output) resolves to an explicit `{ status: "unavailable", reason }` per SOW §36.
  - Implemented two inference modes selected by `COMPASS_DEMO_INFERENCE_MODE` (already scaffolded in `.env.example` from the WP0 bootstrap): `live` calls OpenAI Chat Completions with `response_format: json_schema`, `COMPASS_MODEL_ID`, `OPENAI_API_KEY`, and an `AbortController`-based timeout (default 8s); `fixture` (the default) returns the committed `fixtures/agent-result-scenario-a.json` with `recommendationRequestId` substituted to match the live request, but only when the fixture's candidate-ID set exactly matches the current packet — otherwise it fails closed (`no-fixture-for-packet`) rather than guessing. Also added a `force-failure` mode as an explicit test hook for SOW §36's "forced provider failure" acceptance item.
  - Wired `POST /api/issues/:id/recommend` into `backend/src/server.mjs`: extended `createDemoRuntime(agentOptions)` with `requestRecommendation(issueId)`, which requires a prior `raiseIssue` call (409 if the workflow doesn't match), calls `requestAgentRecommendation`, and stores the outcome as `workflow.agentOutcome` in the snapshot. No UI was added for this route — WP4's acceptance was UI-facing ("raised from the interface"), but WP5's acceptance is entirely about the backend/test matrix, so the recommendation panel is left for WP6 per the established sequencing in `AGENTS.md` item 5.
  - Added `backend/tests/wp5-agent.test.mjs` (14 tests): system-instruction content check; the Scenario A fixture-mode path run **10 consecutive times** — Priya ranks first and every result validates 10/10; confirmed the packet excludes Sam/Jordan and Chen stays `WEAK` vs. Priya's `STRONG`; every §24/§45 rejection path (unknown candidate, mismatched request ID, missing/self-referencing rank-1 tradeoff, numeric-prose leakage, incomplete/duplicated ranking); forced-failure; live-mode without an API key; live-mode timeout (via an injected `fetchImpl` that honors `AbortSignal`, mirroring real `fetch` semantics — no real network call); live-mode request-shape capture (asserts the exact system instruction, JSON-encoded packet, model ID, and `json_schema` response format sent); and live-mode rejecting an invalid provider response.
  - Extended `backend/tests/wp3-wp4-server.test.mjs` with two server-layer tests: the full raise→recommend lifecycle (409 before raise, 200 with `agentOutcome.status: "ok"` and Priya on top after), and a forced-failure recommend that still returns 200 with an explicit `unavailable` outcome and the nearest baseline intact (proving the server itself never crashes on agent failure).
  - Manually exercised the live server end-to-end on a scratch port: raise → recommend returned a fixture-backed, schema-valid result with Priya on top, `modelInfo.mode: "fixture"`.
  - Updated `README.md` (WP0–WP5 bootstrap summary, WP5 description, `.env` instructions for enabling live mode) and added a `docs/decisions.md` entry ("Agent integration: OpenAI Chat Completions with a deterministic fixture fallback") documenting the provider choice, the validation pipeline, and — explicitly — the outstanding gap below.
- Files changed: `backend/src/agent.mjs` (new), `backend/tests/wp5-agent.test.mjs` (new), `backend/src/server.mjs`, `backend/tests/wp3-wp4-server.test.mjs`, `README.md`, `docs/decisions.md`, and this log.
- Verification: `npm test` — 29/29 pass (13 prior + 14 new agent tests + 2 new server tests); `git diff --check` passed; manual raise→recommend exercise against a live server instance.
- **Outstanding work / risks — read before claiming WP5 sign-off**:
  - **This is the single most important caveat in this entry.** This sandboxed environment has no network access and no `OPENAI_API_KEY`, so the "10 consecutive runs, Priya rank-1 = 10/10, schema-valid = 10/10" acceptance check has only been run against the deterministic `fixture` fallback — it proves the validation/rejection engine and API surface are correct, but it is **not** the live-pinned-model run the SOW WP5 acceptance section literally requires. Before relying on the live model: set `COMPASS_MODEL_ID` (pinned, not a floating alias), `OPENAI_API_KEY`, `COMPASS_DEMO_INFERENCE_MODE=live`, run Scenario A 10 consecutive times against the real provider, and record that run log in `docs/decisions.md` per SOW §46. Until then, treat WP5 as implemented and unit-tested, not signed off.
  - WP6 (Recommendation UI: display nearest baseline, Compass recommendation, candidate evidence, rationale, alternatives) is the next work package and can build directly on `workflow.agentOutcome` from the `/recommend` route.
  - WP7 (assignment mutation) and WP8 (audit persistence) remain unimplemented; `Recommendation.modelInfo`/`agentResult` in `backend/src/domain.ts` already anticipate the shape `agentOutcome` produces, so WP8 should be able to persist it directly rather than re-deriving a shape.
  - No known defects in the WP5 slice itself; the only blocker is the live-model verification gap above, which requires credentials/network this agent does not have.
- Commit hash: `6498e25df4d92e475fa9a9e79dc504e5b0298cb1` — `feat: add Compass agent integration (WP5)`.

### 2026-09-04 — Secured the OpenAI key and shipped a provider/model/thinking-level settings menu (Codex offline)

- Task: The user reported Codex ran out of tokens mid-task, in the middle of applying an OpenAI API key that had been left in plaintext at `~/compass_openai_key.txt`. The user asked to (1) move that key into a proper, secure `.env`, and (2) build a settings menu in the app for the user to pick provider/model/thinking level — OpenAI only, for now. Note: this session found the repository already migrated to v4 (SOW v4-FINAL, 91 tests, 21 commits ahead of the last v2 handover entry above) — that migration is Codex's work from a separate span not narrated in this log; this entry covers only the key/settings task.
- Starting state found: `git status` showed unstaged modifications to `.env.example`, `backend/src/agent.mjs`, `backend/src/event-planner.mjs`, `backend/src/live-recommendation-service.mjs`, `backend/src/server.mjs`, plus an untracked, already-complete `backend/src/provider-settings.mjs` — Codex had built the entire backend settings service (model discovery, validation, atomic `0600` persistence, `reasoningEffortsForModel` per model family) and wired `GET/POST /api/settings` + `GET /api/settings/models` into `server.mjs` and threaded `reasoningEffort` through `agent.mjs`/`event-planner.mjs`, but had not yet built any frontend UI, had not added tests, and had not moved the key.
- Actions taken:
  - **Key migration**: read `/home/makodev58/compass_openai_key.txt` (single line, `sk-proj-…`, 164 chars), copied `.env.example` to `.env`, substituted the real key into `OPENAI_API_KEY=`, set `.env` to mode `600`, confirmed `git check-ignore -v .env` reports it excluded (via the existing `.env`/`.env.*` `.gitignore` rules), confirmed `node --env-file-if-exists=.env` (the exact flag `npm run dev`/`start` already use) loads it, then securely deleted the original file (`shred -u`, falling back to `rm`) and confirmed it no longer exists. The literal key value briefly appeared in this session's own terminal output while inspecting the source file — it was never sent anywhere external, but flagging this for the record since the user should treat that specific key as having touched more surfaces than ideal; rotating it is the user's call, not something this agent did unilaterally.
  - Read Codex's uncommitted backend diff in full before building on it, rather than assuming it was correct: confirmed `provider-settings.mjs`'s `createProviderSettingsService()` never serializes the API key into its public snapshot, persists via temp-file-then-rename with mode `0600`, and that `update()` validates provider/model-selectability/reasoning-effort-per-model before persisting.
  - Built the frontend Settings tab (`frontend/index.html`, `frontend/app.js`, `frontend/styles.css`): a new `#settings-tab`/`#settings-view` alongside the existing Control Room/Analytics tabs. Renders credential status (configured yes/no, key never displayed), a provider `<select>` driven by the server's `providers` list (OpenAI enabled, any future provider would show "(coming soon)" and be `disabled` automatically — no frontend change needed to add one later), a "Refresh available models" button (disabled with an explanatory label when in Offline mode, since Offline must stay API-free per `AGENTS.md` rule 6) that calls `GET /api/settings/models`, a model `<select>` populated from discovery, and a thinking-level `<select>` whose options are recomputed from the chosen model's `reasoningEfforts` (supplied by the server, not duplicated client-side) whenever the model selection changes. Save posts to `POST /api/settings` and re-renders from the server's response.
  - Added `backend/tests/provider-settings.test.mjs` (10 tests, zero real network calls — everything via injected `fetchImpl`/`filePath`/`environment`): `reasoningEffortsForModel` family mapping; credential-status reporting confirms the key string never appears in `JSON.stringify(snapshot)`; `refreshModels` fails closed (not guesses) with no credential, on an HTTP error, and on timeout; `refreshModels` filters non-text/audio/embedding/fine-tuned models and attaches per-model reasoning efforts; `update()` rejects a non-OpenAI provider, an unselectable model ID, an unsupported reasoning level for the chosen model, and a model outside the last-discovered list; a valid update persists atomically at mode `0600` and reloads correctly in a fresh service instance pointed at the same file; `requestOptions()`'s shape (and that it omits `reasoningEffort` when unset); and the settings HTTP routes end to end including the Offline-mode 409 gate and the 503 when no settings service is wired in.
  - Ran `npm test`: **101/101 pass** (91 pre-existing + 10 new).
  - Manually verified against the real key on a scratch port (`COMPASS_PORT=3031 COMPASS_MODE=LIVE`): `GET /api/settings` reports `credentialConfigured: true`; `GET /api/settings/models` hit the real OpenAI `/v1/models` endpoint and returned 71 selectable models (confirming the live-catalog families the `reasoningEffortsForModel` table already anticipates, including `gpt-5.1`–`gpt-5.6` and `o1`/`o3`/`o4`); `POST /api/settings` with a real model saved and round-tripped through `backend/data/provider-settings.json`; `GET /` served the page with the Settings tab present in the HTML. Deleted the test `backend/data/provider-settings.json` afterward — deliberately left no model/thinking-level pinned, so the user's own first choice in the UI isn't pre-empted by a value this agent picked (see `docs/decisions.md`).
  - Added a `docs/decisions.md` entry ("Secured the OpenAI credential and shipped the provider/model/thinking-level settings menu") recording the same rationale.
- Files changed: `backend/src/provider-settings.mjs` (Codex's, verified and built upon — not authored fresh by this entry), `backend/tests/provider-settings.test.mjs` (new), `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `docs/decisions.md`, `.env` (new, git-ignored, not part of any commit), and this log. Codex's pre-existing uncommitted backend changes (`.env.example`, `backend/src/agent.mjs`, `backend/src/event-planner.mjs`, `backend/src/live-recommendation-service.mjs`, `backend/src/server.mjs`) are included in the same commit since they were correct and this task's frontend/tests build directly on them.
- Verification: `npm test` — 101/101 pass; `git diff --check` passed; live manual exercise against the real OpenAI credential (model discovery + a save round-trip), described above.
- Outstanding work / risks:
  - **No model or thinking level is pinned.** The user must open the Settings tab, click "Refresh available models," and save a choice before any Live Compass recommendation or event-planner call can succeed — until then, live calls fail closed to `unpinned-model` (an explicit provider error, not a crash, consistent with SOW §36) and Live mode's baselines/manual override remain usable regardless.
  - The `~/compass_openai_key.txt` key was displayed once in this session's terminal transcript while being read for migration (not sent anywhere else). Consider it slightly more exposed than a key that was never displayed; rotating it is optional and the user's call.
  - This session's environment has real network access and the real key, which resolves the *external* half of the caveat left by the prior entry above — but the actual ten-pinned-model Scenario A soak and the live 100-opportunity evaluation from the release checklist were not re-run here (out of scope for what was asked) and should be run after a model is pinned via Settings.
  - No known defects in the settings slice itself.
- Commit hash: `5d19ea64c2442b59a6b36aa3938e3cedfc32f915` — `feat: add provider/model/thinking-level settings menu`. `.env` was not added (git-ignored, verified).

### 2026-09-05 — Fixed the two live-demo blockers: "Recommendation unavailable" and the unusable override dropdown

- Task: Execute an implementation plan produced by a debug agent and independently verified by a reviewer agent (which ran real API probes) for two separately-reported bugs: (1) Live Compass returned "Recommendation unavailable" on every attempt, and (2) the override dropdown was unusable — a selection would revert and its confirm button would re-disable itself.
- Actions taken:
  - **Bug 1, root cause:** `AGENT_RESULT_JSON_SCHEMA`'s ranked-candidate items declared five properties but required only four, omitting `tradeoff`. OpenAI strict Structured Outputs requires every declared property to appear in `required`, so **every** live call was rejected with HTTP 400 and failed closed. Live Compass had never once succeeded. Fixed by adding `tradeoff` to `required` — a one-line change.
  - Deliberately did **not** make `tradeoff` a nullable union: that is API-valid but reintroduces the identical outage via a different path (the validator's `!== undefined` guard passes `null` through, `isPlainObject(null)` is false, every nulled candidate fails validation, same unavailable screen) with the whole suite still green.
  - Extended `validateAgentResult` to ground *every* candidate's `tradeoff.comparedToResponderId`, not just rank one's, since mandating N tradeoffs pushes N−1 new model-supplied responder IDs into the persisted audit record (SOW §29). Hardened `SYSTEM_INSTRUCTION` against numeric leakage, which now applies to five tradeoff explanations per response instead of one. The three instruction lines the test matrix asserts on are preserved byte-for-byte.
  - Left the hand-rolled validator permissive about a missing tradeoff on purpose: the API-free Offline fixture path shares it and its fixture candidates carry none. The wire schema now guarantees the field on the live path, which is where it was missing.
  - Added a hermetic schema walker asserting OpenAI strict-mode object rules over both structured-output schemas. **Confirmed it fails on the pre-fix tree** with exactly the production error before applying the fix, then passes after — so this bug class cannot silently return.
  - **Bug 1 had a second, independent cause the plan did not anticipate.** With the schema fixed, the required ten-run live gate came back **0/10, every run `timeout`** at ~8,012ms. Measured actual latency with a generous ceiling: six consecutive calls all succeeded, in 8,457–12,383 ms. Every successful call exceeded the 8s budget, so the gate could never have passed. Raised the agent budget to 30s and the browser abort to 45s (they are one budget — at 15s the fetch aborts before a 30s-budgeted call can return). Measured the event planner rather than changing it by analogy: 1,739–2,139 ms, comfortably inside its existing budget, so it was left alone. Recorded as a material deviation in `docs/decisions.md`.
  - **Diagnostics:** both live call sites threw the HTTP status and discarded the response body one line before it would have named the problem, which is why this took a full diagnostic session to find. Both now append the provider's own error text, bounded to 500 characters, and `live-recommendation-service.mjs` persists it as `failureMessage`. The body is the provider's error object and never echoes the request body, headers, or credential. `failureMessage` is persisted and returned but deliberately **not** rendered — raw provider text does not belong on the recommendation card in front of a demo audience.
  - **Bug 2, root cause:** `render()` runs every 1.5s and reassigned panel `innerHTML` unconditionally, destroying the `<select>` mid-interaction. The residual click window was 0–1500ms, which is why it was intermittent rather than total. **Independent of Bug 1** — the same destruction happens in the READY branch, so fixing Compass did not fix the dropdown, and the same root cause also broke the Offline override panel.
  - Fixed with one shared `setHtml()` helper in a new DOM-free `frontend/render-lifecycle.js`: it skips the write when the markup is byte-identical and otherwise preserves select values and restores focus. Converted every polled binding from `addEventListener` to property assignment — necessary because skipped writes would otherwise stack a duplicate handler every tick, and it keeps the closure fresh so no handler captures a stale `recommendation.id`. Derived both override buttons' `disabled` state from the surviving select value. Added a pointer-interaction poll guard (1s self-clearing) for the mousedown-to-mouseup window that was swallowing clicks across the whole control room. `setInterval` itself is untouched.
- Files changed: `backend/src/agent.mjs`, `backend/src/event-planner.mjs`, `backend/src/live-recommendation-service.mjs`, `frontend/app.js`, `frontend/render-lifecycle.js` (new), `backend/tests/wp5-agent.test.mjs`, `backend/tests/wp7-wp8-live-recommendation.test.mjs`, `backend/tests/wp15-render-lifecycle.test.mjs` (new), `e2e/control-room.spec.mjs`, `e2e/override-dropdown.spec.mjs` (new), `docs/decisions.md`, and this log.
- Verification:
  - **`npm test` — 114/114 pass** (101 baseline + 13 new). Re-run after every phase and after each individual frontend edit, because several tests are literal string greps over `frontend/app.js`.
  - **Live ten-run reliability gate (SOW §46) — 10/10 READY, zero UNAVAILABLE, Priya rank one on all ten**, latencies 7,486–13,011 ms. Run out-of-band against the real provider on a scratch port and scratch state file, never inside `npm test`. Full run table in `docs/decisions.md`. All ten persisted results carried tradeoffs on 4 of 4 candidates, every compared-to ID grounded, zero numeric leakage. Gate output and persisted state scanned for `sk-` before being recorded: no matches.
  - Verified `GET /render-lifecycle.js` returns 200 as `text/javascript` on a running server — a 404 on that module would blank the entire app.
  - Verified every element id `app.js` queries exists in `index.html` or in markup it writes: no null-dereference risk introduced.
  - `e2e/control-room.spec.mjs:14` previously asserted "Recommendation unavailable" as the *expected* outcome, so it **passed because of the bug**. Replaced with an assertion true whether or not the live call succeeds.
- **Outstanding work & risks — read before claiming these bugs closed:**
  - **Playwright was NOT run.** Its bundled Chromium cannot launch in this environment (`libgbm.so.1` missing; independently confirmed, not assumed). The specs parse and list correctly — 4 tests across 2 files — but `e2e/override-dropdown.spec.mjs` is **authored but unexecuted**, and the updated `control-room.spec.mjs` assertion is likewise unexecuted. Treat both as unverified until someone runs them on a machine with the browser libraries.
  - **The browser-visible dropdown behaviour is unverified.** Bug 2's fix is covered by unit tests of the helper and static assertions over `app.js`, but nothing here rendered an actual page. Manual recipe: open the Live Control Room, click "Ask Compass", wait for the recommendation (expect eight to thirteen seconds of in-flight state — that is normal reasoning latency, not a hang), choose someone in "Choose someone else", then **wait ten seconds without touching anything**. The selection must still be there and "Confirm override" must still be enabled. Repeat in Offline Demo with `#offline-override-select`. Also confirm in DevTools that the listener count on `#live-override-button` stays at one after sixty idle seconds, and that pressing a button and dragging off-window lets the clock resume within about two seconds.
  - The e2e suite makes **real, paid** model calls: `playwright.config.mjs` sets `COMPASS_LIVE_COMPASS_MODE: "force-failure"`, but that variable is dead — `server.mjs` always uses the saved provider settings and `provider-settings.mjs` hardcodes `mode: "live"`. Restoring a working force-failure escape hatch was left out of scope; it is recorded in `docs/decisions.md`.
  - A 30s agent ceiling means a genuinely hung provider connection now occupies a recommendation slot for 30s rather than 8s before falling closed to the deterministic baselines. That is the accepted cost of the model being able to answer at all.
  - Known pre-existing defect, recorded but deliberately not fixed: a recommendation in `PENDING_MODEL` status — visible only if a poll lands between the two `store.mutate` calls in `live-recommendation-service.mjs` — is neither `UNAVAILABLE` nor `STALE`, so `renderLiveDecision` dereferences `rankedCandidates` on a null `agentResult` and throws. Marginally more reachable in wall-clock terms now that the model call legitimately takes eight to thirteen seconds. Do not mistake it for a regression from this work.
  - `backend/src/domain.ts` remains stale (no `status`, `failureReason`, `failureMessage`, `nearestWinner`, `disagreement`, `baselineConfig`). Left alone deliberately: a partial update would make it *look* current while still being wrong.
  - Not re-run here: the live 100-opportunity evaluation from the release checklist.
- Commit hashes: `3d1f259` (schema fix), `2b669d6` (provider error diagnostics), `3d4d4c4` (timeout budget — the unplanned second cause), `bc76aa5` (render lifecycle), plus this docs commit. Branch `fix/live-recommendation-and-override-dropdown`, not pushed.

### 2026-09-05 — Hermetic E2E and final recommendation-state hardening

- Task: Continue from the Opus 5/coder handoff, execute the previously blocked browser suite, and close its remaining recorded risks.
- Actions taken: Restored explicit environment inference modes through `provider-settings.mjs`, independently routing Compass and event-planner modes while keeping production defaults live. Added a `PENDING_MODEL` progress branch before any model-result dereference. Removed the recommended responder from the Live override choices so confirmation and override stay semantically distinct. Corrected two invalid authored Playwright selectors and made the Live regression test switch back from the prior test's persisted Offline mode. Updated reliability/release documentation and test counts.
- Files changed: `backend/src/provider-settings.mjs`, `backend/src/server.mjs`, `backend/tests/provider-settings.test.mjs`, `backend/tests/wp15-render-lifecycle.test.mjs`, `frontend/app.js`, `frontend/styles.css`, `e2e/override-dropdown.spec.mjs`, `README.md`, `docs/evaluation.md`, the release checklist, `docs/decisions.md`, and this log.
- Verification: JavaScript syntax checks passed. `npm test` passed all 115 unit/integration tests, including the deterministic 100-opportunity soak. With the existing local browser-library bundle exposed through `LD_LIBRARY_PATH`, `npm run test:e2e` passed all 4/4 Chromium journeys in 14.8 seconds. The browser configuration used forced provider failures through the repaired settings boundary, so the run made no OpenAI request and spent no API credits. `git diff --check` passed.
- Outstanding work / risks: No known repository blocker remains from this chain. The live 100-opportunity provider evaluation and narrated demo video remain external operator actions. The 30-second live-agent timeout is an accepted measured tradeoff. `backend/src/domain.ts` remains a known stale documentation-facing contract and should only be updated comprehensively, not piecemeal.
- Current Git commit: `28e7c80` — `fix: harden live recommendation test paths`. This exact-hash refresh is the final documentation-only checkpoint.
- Integration state: local `master` was fast-forwarded through documentation checkpoint `950c922`; nothing was pushed.
### 2026-09-05 — Automatic taxi-hailing-style responder dispatch completed

- Task: Implement the user’s clarified operating model: fully automatic per-issue matching, asynchronous responder accept/reject, automatic stale reruns and rejection fall-through, with central command override racing safely against responder acceptance.
- Actions taken:
  - Added persisted `dispatchOffers`, `OFFER_PENDING` issue state, `OFFERED` responder state, an isolated dispatch RNG stream, one-shot scheduled offer-response tokens, and public redaction of acceptance probability/tokens.
  - Live now ranks eligible responders through Compass, or through a deterministic application-owned fallback when Compass is unavailable; sends the strongest match an offer; advances after rejection; rematches after candidate exhaustion; and atomically assigns on acceptance. Candidate changes during inference trigger an automatic Compass rerun instead of asking an operator to repair stale state.
  - Central override remains available while an offer is pending. The same serialized store mutation cancels the pending offer and claims the selected available responder, so whichever mutation wins is authoritative.
  - Offline remains API-free and shares the same visible offer/accept/override interaction: raising Scenario A automatically loads the validated fixture, offers Engr028, and completes a scripted asynchronous acceptance unless central command overrides first.
  - Updated the canonical TypeScript domain contract, UI/status styling, E2E journeys, README, architecture, demo script, release copy, and `docs/decisions.md`. The decision entry explicitly records that this user-directed behavior supersedes the v4 human-confirmation/out-of-scope clauses without expanding into global workforce optimization or issue-priority logic.
- Verification: `npm test` — 123/123 pass. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` — 4/4 Chromium journeys pass with forced provider failures and zero OpenAI calls. JavaScript syntax checks and `git diff --check` pass. Live and Offline screenshots were visually inspected.
- Outstanding work / risks: The acceptance simulation intentionally represents only responder willingness/availability; actual issue resolution remains a separate later stochastic outcome using hidden skill, observed history, and bounded variability. No global scheduling was introduced. No known implementation blocker remains. The app should be restarted on port 3000 after the commit; preserve the existing persisted Live state.
- Current Git commit: `23f075f` — `feat: automate responder dispatch marketplace`. This entry is the documentation checkpoint immediately following it.

### 2026-09-05 — Issue audit trail and response playbook completed from mid-implementation handoff

- Task: Continue a handoff that stopped partway through implementation. The in-progress work made the operational feed a navigable audit trail and added an industry-neutral response playbook to the event planner. The working tree was uncommitted, one test was failing, the feature had no browser coverage, and the required decision/handover records were missing.
- Actions taken:
  - Reviewed the full uncommitted diff and verified every identifier it depended on (`formatMinutes`, `dispatchOffers`, `acceptedResponderId`, public-state truncation of events to 100 and recommendations to 30) before extending it.
  - Fixed the failing `wp6` resolution test. It asserted the generic fallback action while the same change gave `ISS-103` a real seeded `responseAction`, so it contradicted the feature and would still have passed if propagation broke entirely. It now asserts `actionTaken` equals the issue's `responseAction`, and a new test covers the fallback branch it had been accidentally exercising.
  - Added the missing validation coverage for the new bounds: empty `responseAction`, over-long `description` and `responseAction`, and the exact-limit boundary. Added a test proving the deterministic fallback yields a bounded, non-empty narrative for every issue class, which guards the class-keyed narrative map against a future class being added without one.
  - Added static UI coverage for the audit trail in the existing `wp10` convention, and two new Chromium journeys in `e2e/audit-trail.spec.mjs`: a feed event opens the trail, it survives the polling re-render, it returns to the current view, and a resolved issue remains reachable through its outcome event.
  - Scoped two `control-room.spec.mjs` locators to `#issue-list`. Making feed entries `<button>` elements meant `getByRole("button", { name: /ISS-105/ })` resolved to three elements and failed Playwright strict mode — a real regression introduced by the feature, caught only because the browser suite was run.
- Files changed: `backend/tests/wp4-event-planner.test.mjs`, `backend/tests/wp6-resolution-engine.test.mjs`, `backend/tests/wp10-control-room-ui.test.mjs`, `e2e/control-room.spec.mjs`, `e2e/audit-trail.spec.mjs` (new), `docs/decisions.md`, and this log — on top of the inherited changes to `backend/seed/live-simulation.mjs`, `backend/src/domain.ts`, `backend/src/event-planner.mjs`, `backend/src/resolution-engine.mjs`, `fixtures/event-planner-output.json`, `frontend/app.js`, and `frontend/styles.css`.
- Verification: `npm test` passes 126/126, up from the inherited 123 with one failure. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passes 6/6 Chromium journeys in 29s, with forced provider failures so the run made no OpenAI request and spent no credits. `git diff --check` passes.
- Outstanding work / risks:
  - `chooseIssue` falls back to an active issue when `showingAuditTrail` is set but the selected issue is absent from state. Issues are never deleted, so this is currently unreachable; if it ever triggers it would render the audit trail for a different issue rather than crash. Recorded, not fixed.
  - Public state truncates recommendations to the last 30, so a sufficiently old issue's audit trail will show "No recommendation audit exists" rather than its analysis. The offer and outcome sections are unaffected. Acceptable for a demo-scale environment.
  - The audit trail is Live-only. `render` returns early for Offline before the feed is drawn, so Offline keeps the existing panel behavior.
  - Not re-run here: the live 100-opportunity provider evaluation, which remains an external operator action.
- Current Git commit: `9086eb4` — `feat: make the event feed a navigable issue audit trail`, on branch `feat/issue-audit-trail`. Not pushed. This entry is the documentation checkpoint immediately following it.

### 2026-09-05 — Production-quality pass on the audit trail and test isolation

- Task: The user stated Compass will be used at their company beyond the demo and that demo readiness is their least concern, superseding `AGENTS.md` rule 8. Two items previously recorded as accepted demo-scale risk were reassessed and fixed on that basis.
- Actions taken:
  - Added `GET /api/issues/:id/audit`, backed by `createIssueAuditRecord` in `live-schema.mjs` so the "what may leave the backend" rules stay in one module. It reuses the public-snapshot redaction (dispatch tokens and acceptance probability stripped) and asserts `assertNoResponderSkill` on its output. The control room now fetches the record once per opened issue and renders from cache, with a loading state, an error state, and a late-response guard for when the operator has navigated away.
  - Fixed the audit trail's dependence on the truncated polled snapshot. Recommendations were capped at thirty and offers at thirty, so a long run silently lost an issue's analysis. Retaining more in the snapshot was rejected: those records carry `candidateEvidenceSnapshot` and `agentResult`, so it would push hundreds of kilobytes onto a 1.5-second poll to serve an occasionally opened panel.
  - Gave every test fixture its own audit store. `createDemoRuntime` defaults to the real `backend/data/recommendation-events.json`, and ten fixtures across five files used that default, so the suite mutated application data and contended on one file across processes. This was the cause of the intermittent `wp10-live-runtime` failure.
  - Guarded `chooseIssue` so the audit trail closes rather than rendering another issue's record when its own issue is absent from state.
- Files changed: `backend/src/live-schema.mjs`, `backend/src/live-runtime.mjs`, `backend/src/server.mjs`, `backend/tests/helpers/temp-audit-store.mjs` (new), `backend/tests/wp1-live-store.test.mjs`, `backend/tests/wp10-live-runtime.test.mjs`, `backend/tests/wp13-offline-mode.test.mjs`, `backend/tests/wp3-wp4-server.test.mjs`, `backend/tests/wp7-assignment.test.mjs`, `frontend/app.js`, `docs/decisions.md`, and this log.
- Verification: `npm test` passes 128/128, and six consecutive full-suite runs were clean where the flake previously appeared roughly once in nine. Test hermeticity was verified by byte-comparing `backend/data/recommendation-events.json` across a full run — unchanged. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passes 6/6 Chromium journeys, which exercise the new asynchronous fetch path. `git diff --check` passes.
- Outstanding work / risks:
  - `/api/issues/:id/audit` returns HTTP 500 when the application is in Offline mode, because the runtime throws and the handler maps any throw to 500. This matches how every other mode-guarded route behaves, so it was left consistent rather than made a special case; a deliberate pass over mode-guard status codes would be the right way to change it.
  - The audit trail remains Live-only by construction: Offline has no event feed, only a single scripted Scenario A issue, so there is no click target. Not a gap.
  - `backend/src/domain.ts` remains deliberately stale and should only be updated comprehensively.
- Current Git commits: `004b34e` (audit-trail guard), `463540f` (test audit-store isolation), `9b3ef6b` (on-demand audit records). Branch `feat/issue-audit-trail`, not pushed. This entry is the documentation checkpoint immediately following them.

---

## 2026-09-05 — Takeover briefing for the next agent

This section is written to orient an incoming agent, not to log completed work. The entries above are the chronological record; read this first, then the two entries immediately preceding it.

### Repository state right now

- **Working branch: `feat/issue-audit-trail`** (6 commits ahead of `master`, working tree clean, **nothing pushed**).
  - `9086eb4` feat: make the event feed a navigable issue audit trail
  - `ed4fe78` docs: record the issue audit trail handover
  - `004b34e` fix: drop the audit trail when its issue is absent from state
  - `463540f` test: give every fixture its own audit store
  - `9b3ef6b` fix: serve issue audit records from untruncated state
  - `086658e` docs: record the production-quality audit and test isolation pass
- `master` is at `d2a7f7b` and is **33 commits ahead of `origin/master`** — this project has a remote (`git@github.com:makoantz/compass.git`) but nothing has been pushed to it. Do not push without asking.
- Branch `fix/live-recommendation-and-override-dropdown` is fully merged into `master` and is now a stale label. Safe to delete when convenient.
- Decide with the user whether `feat/issue-audit-trail` merges to `master` before starting new work, so the next change does not stack on an unmerged branch.

### The single most important context

**Compass is going into real use at the user's company. Demo day is far off and is explicitly their least concern.** They asked for a polished application, "not just a dog and pony show".

`AGENTS.md` rule 8 has been **rewritten** to say this outright: there is no core freeze, and development continues until the user says otherwise. It previously instructed you to freeze the core after the Definition of Done. The SOW, the README, and most of the older entries in this file are still written in demo framing. If you reason from those documents alone you will reach the wrong conclusion and defer real defects as acceptable demo-scale risk — that mistake was already made once in this chain and had to be corrected by the user.

Judge changes on production correctness, behaviour under long runs, and maintainability. Record material deviations in `docs/decisions.md` per rule 7; the rule 8 deviation is already recorded there under the 2026-09-05 on-demand audit entry.

The rules that are **not** superseded and still bind: the deterministic/agent boundary (application code owns facts, eligibility, metrics, baselines, outcomes and mutations; models only propose bounded events or rank supplied candidates), `ResponderSkill` is hidden simulation truth and must never reach a model, the UI, or analytics, Offline must stay API-free, and synthetic domain-neutral data only.

### How to verify your work

```bash
npm test          # 128/128 expected, ~9s, fully hermetic
LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e   # 6/6, ~29s
```

- **Playwright works here.** Earlier notes in this file claim Chromium cannot launch for want of `libgbm.so.1`/`libasound.so.2`; that is stale. The `LD_LIBRARY_PATH` prefix above supplies them. Run the browser suite — it has caught regressions the unit tests could not see, including a strict-mode locator break introduced by turning feed entries into buttons.
- The e2e config forces provider failures (`COMPASS_EVENT_PLANNER_MODE`/`COMPASS_LIVE_COMPASS_MODE` = `force-failure`), so browser runs are deterministic and **spend no API credits**.
- `npm test` is hermetic and must stay that way: no network, no writes to `backend/data/`. Never add live provider calls to it. A live provider check is an out-of-band run against a scratch port and scratch state path.
- Several tests are literal string greps over `frontend/app.js` (`wp6-recommendation-ui` requires `top.tradeoff`, `Confirm assignment —`, `Choose someone else`; `wp10-control-room-ui` requires `setInterval`). Re-run `npm test` after each frontend edit rather than once at the end.

### Invariants that are easy to break

- **`frontend/render-lifecycle.js` / `setHtml`.** The control room polls every 1.5s and rewrites panels. `setHtml` skips a write when the HTML is byte-identical, which is what keeps an open `<select>` and its enabled button alive mid-interaction. Two consequences: every panel write must go through `setHtml` (an out-of-band `innerHTML =` leaves the cache stale and freezes the panel), and handlers must be **re-assigned on every render pass even when the write was skipped** — do not early-return on `setHtml() === false`, or a handler will close over a stale recommendation id. Bindings use `.onclick`/`.onchange` property assignment, not `addEventListener`, so they stay idempotent.
- **The strict structured-output schemas.** `AGENT_RESULT_JSON_SCHEMA` and `EVENT_PLANNER_JSON_SCHEMA` are sent with `strict: true`. OpenAI requires every key in `properties` to appear in `required` and `additionalProperties: false` on every object. A missing key returns HTTP 400 on *every* call and surfaces in the UI as "Recommendation unavailable" — this caused a total outage once. `wp5-agent.test.mjs` now walks both schemas and asserts the rule; do not weaken that test. Making a field a nullable union to keep it optional is a trap: it passes the API and the whole suite, then fails `validateAgentResult` at `agent.mjs:117-119` and reproduces the same outage.
- **The live agent timeout is 30s** (`agent.mjs`), with a 45s browser abort. Measured successful calls take 8–13s. It was 8s, which made every call time out even after the schema was fixed. Do not lower it.
- **Audit records are fetched, not polled.** The polled snapshot truncates recommendations/offers to 30 and events to 100 deliberately, to keep the 1.5s poll small. The audit trail therefore reads from `GET /api/issues/:id/audit`, cached per opened issue in `auditRecord`. Do not "simplify" it back to reading `state.recommendations`, and do not raise the snapshot caps to fix a truncation symptom — those records carry `candidateEvidenceSnapshot` and `agentResult` and would bloat every poll.
- **Test fixtures must pass `createTempAuditStore()`.** `createDemoRuntime`'s default audit store is the real `backend/data/recommendation-events.json`; using the default makes the suite mutate application data and race across test processes.

### Known open items, none blocking

- `GET /api/issues/:id/audit` returns **500** in Offline mode rather than a 409/400. Every mode-guarded route in the codebase behaves this way, so it was left consistent rather than special-cased. A deliberate pass over mode-guard status codes is the right fix if the user wants it.
- `backend/src/domain.ts` is knowingly stale — its `Recommendation` interface lacks `status`, `failureReason`, `failureMessage`, `nearestWinner`, `disagreement`, `baselineConfig`. Update it comprehensively or not at all; a partial update makes it look current while still being wrong.
- Live and Offline build their override candidate lists differently (`app.js` includes vs. excludes the recommended responder). In Live this lets an operator "override" *to* the recommendation, recorded as `OVERRIDDEN`, which skews SOW §31 agreement analytics. Product decision, unresolved.
- Dead configuration: `provider-settings.mjs`'s hard-coded `mode` and `server.mjs`'s literal `createDemoRuntime({ mode: "fixture" })` mean some environment variables do not reach the paths their names imply. Partially repaired earlier in the chain; worth an audit if you touch settings.
- The audit trail is Live-only by construction — Offline has no event feed, only one scripted Scenario A issue. This is not a gap and does not need parity work.
- The live 100-opportunity provider evaluation remains an external operator action and has not been re-run.

### What the user said next

They have **"a lot of things"** they want changed and will supply the list. Expect production-hardening work rather than demo polish. Ask for the list, sequence it, and confirm the `feat/issue-audit-trail` merge question before building on top of it.

### 2026-09-05 — Freeze policy removed, and the floor expanded into a three-floor building

- Task: Two user-directed changes. First, remove the core-freeze instruction, because Compass is going into real use at the user's company and development continues until they are satisfied. Second, replace the single floor holding six machines with a three-floor building holding 20-30 per floor, drawn as simplified wireframes, while a second agent worked personnel assignment logic in parallel.
- Actions taken:
  - **Freeze removal.** Rewrote `AGENTS.md` rule 8 to state that there is no core freeze and that changes are judged on production correctness rather than demo likelihood, and added a rule naming both verification suites. Updated the "Current phase" line above. Left rules 1-7, the SOW documents, and all dated entries untouched: removing the freeze widens what may be built, not what may be violated, and rewriting the record would falsify history. The old freeze instruction had already caused genuine defects to be deferred as acceptable demo-scale risk.
  - **Parallel-work boundary.** Published `docs/floor-layout/README.md` to `master` (not only to the feature branch, where the other agent would never have seen it) claiming the files the spatial rework owns, with pointers from `AGENTS.md` and the current-state block above.
  - **The building.** 72 machines across three floors, 24 each, from a deterministic no-randomness generator in `backend/seed/floor-layout.mjs`. The six original ground-floor machines keep their exact coordinates so Scenario A's committed evidence and expected winner stay valid. `Position` gains `floor`; `distanceToIssue` stays a planar same-floor walk; a new `floorsToIssue` accompanies it; `travelTimeMinutes` now adds `FLOOR_TRANSIT_MINUTES` (1.5) per floor changed. The nearest-available baseline switched from planar distance to travel time, because in a three-floor building the closest responder on paper can be two floors up.
  - **Renderer.** `renderFloor` rewritten as an isometric CSS 3D scene of three stacked wireframe planes, rotatable by control and auto-turning to face a selected machine or responder, with labels limited to the active floor plus hover and focus. No new dependencies.
  - **Migration.** A state persisted before the building carries no floor coordinate, fails validation, and would have left the server unable to start on any existing state file. Extended the existing migrate-and-back-up path to lift such a state into the building, preserving coordinates, live status, and the issues that reference them.
  - **Integration handoff.** Trial-merged `feat/multi-floor-layout` into `agent/two-responder-build` at `9e300ac` in a throwaway worktree: clean, no conflicts, 142/142 unit and 9/9 browser on the merged result. Recorded that outcome, the commands, and the semantic changes as integration instructions in `docs/floor-layout/README.md`. The probe worktree was deleted and the other agent's worktree was never touched.
- Files changed: `AGENTS.md`, `docs/decisions.md`, `docs/floor-layout/README.md` (new), and this log on `master`; on `feat/multi-floor-layout` additionally `backend/seed/floor-layout.mjs` (new), `backend/seed/scenario-a-state.json`, `backend/src/context-engine.mjs`, `backend/src/demo-state.mjs`, `backend/src/domain.ts`, `backend/src/live-migration.mjs`, `backend/src/live-schema.mjs`, `backend/src/live-store.mjs`, `backend/tests/wp17-building-migration.test.mjs` (new), `e2e/building-view.spec.mjs` (new), four existing test files, `fixtures/candidate-packet-scenario-a.json`, `frontend/app.js`, `frontend/styles.css`, and the regenerated `docs/assets` screenshots.
- Verification: `npm test` 142/142 (from 137 before the migration tests). Chromium 9/9 with `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu`, including three new building journeys. `git diff --check` clean. The browser run also caught two defects the unit tests could not see: floor planes intercepting clicks meant for machines on other floors, and the pre-building state file stopping the server from booting.
- Outstanding work / risks:
  - **The building has not been merged.** It sits on `feat/multi-floor-layout`; `agent/two-responder-build` should merge it using the instructions in `docs/floor-layout/README.md`, then set that file's Status to COMPLETE and delete the boundary rule from `AGENTS.md`.
  - `buildEventPlannerPacket` now carries all 72 machines to the model — a real prompt-size increase that may deserve bounding. Left alone because `event-planner.mjs` belonged to the parallel workstream.
  - The isometric view is a first pass. Structure is right; pitch, floor spacing, and label placement are one-line tunings, and labels still collide where a responder stands beside a machine.
  - Still unpushed: `master` is 45+ commits ahead of `origin/master`. Every commit in this chain exists only on this machine.
- Current Git commits: `03007d2` (ownership boundary) and `64726ed` (integration instructions) on `master`; `0bbdce9` (the building) and `3b3aa37` (its decision record) on `feat/multi-floor-layout`. Nothing pushed.

### 2026-09-06 — Unified Live Control Room search palette

- Task: Implement the user-approved combined navigation search for current issues, equipment, and personnel, after a planning-agent-to-coding-agent handoff.
- Actions taken: Added a visible “Find in Control Room” opener plus `/` and Ctrl/Cmd+K shortcuts; a grouped, capped, filterable client-side palette backed only by the public Live snapshot; empty-state quick access; keyboard result navigation; and focus restoration on Escape. Issue results clear the event audit and focus their linked equipment. Equipment and personnel results focus the relevant map/floor while preserving the selected issue and audit context. The palette and its query live outside the polled render panels, so polling refreshes results without wiping typing or open state. Global shortcuts explicitly ignore inputs, selects, textareas, and editable content.
- Files changed: `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, new `e2e/control-room-search.spec.mjs`, and this handover.
- Verification: `npm test` passed 166/166. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passed 16/16 Chromium journeys, including both new search journeys. `node --check frontend/app.js` and `git diff --check` passed.
- Decisions / deviations: No backend/API/schema/model changes and no hidden simulation truth exposed. No material deviation from the approved UX, so `docs/decisions.md` was not changed.
- Current Git commit: `8a779f2` before these uncommitted search changes. Intended next action: commit the verified implementation after final browser-suite completion.

### 2026-09-06 — Analytics operational dashboard

- Task: Convert the Live Analytics raw-data page into a KPI/chart-first dashboard with drill-down evidence.
- Actions taken: Added a canonical backend `operationalTimeline` projection: fixed rolling 24 simulated hours, 15-minute bins (96 maximum), explicit partial-window metadata, persisted issue-flow events, and observed issue-interval downtime. The frontend now shows overview KPIs, accessible native SVG flow/downtime charts, Compass comparison metrics including disagreement with both, and click-to-drill panels for the timeline, equipment, issue class, and Compass recommendation records. Existing equipment, responder, and experience tables remain as the evidence layer.
- Safety: The endpoint remains Live-only; Offline remains API-free. The projection is checked with `assertNoResponderSkill`; no hidden simulation truth, model rationale, responder leaderboard, workforce optimization, or priority logic is exposed or added. Polling reloads Analytics only while its tab is open and keeps drill-down selection intact.
- Files changed: `backend/src/analytics-service.mjs`, `backend/tests/wp11-analytics.test.mjs`, `backend/tests/wp12-analytics-ui.test.mjs`, `frontend/app.js`, `frontend/styles.css`, `e2e/control-room.spec.mjs`, `docs/decisions.md`, and this handover. The Analytics screenshot is regenerated by the existing Chromium journey.
- Deployment: Not deployed. Before any deployment, run the documented Live service build/test gates in the target environment, ensure the target process has write access to its configured Live state path, and restart only after the verified artifact is present. No schema migration or provider configuration change is required.
- Verification: `npm test` passed 168/168 hermetic unit/integration tests. `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` passed 16/16 forced-provider-failure Chromium journeys with no API spend; the updated Analytics screenshot was visually inspected and shows the dashboard and an equipment drill-down. `node --check frontend/app.js` and `git diff --check` passed.

### 2026-09-08 — AGENTS.md rule 2 superseded; rules 3/4 delegated to Sol, unresolved

- Task: Documentation/governance only, no application code. The user reviewed `workforce_continuity_and_demand_simulation_SOW.md` (my inline annotated review flagged that its issue-priority/demand-triage design directly conflicted with `AGENTS.md` rule 2, which banned "global workforce optimization or issue-priority logic"). The user then said explicitly they want the project's scope expanded and no longer constrained by that rule.
- Action taken: Marked `AGENTS.md` rule 2 superseded in place (original text preserved, same pattern already used for rule 8's demo-freeze removal on 2026-09-05) — issue-priority logic, queue/demand triage, and staffing/workforce-continuity simulation are now explicitly in scope.
- **Open question, explicitly not resolved by me — read this before building on the expanded scope.** I asked the user directly whether rules 3 (deterministic/agent boundary: application code owns facts/eligibility/mutations, models only rank or propose bounded events) and 4 (hidden `ResponderSkill` never leaks) were also meant to be lifted, since workforce-continuity logic touching staffing/skill data would sit close to both. The user's answer was **"let Sol decide."** This is an explicit delegation of that specific decision to Sol, not an answer either way, and not something I should decide unilaterally.
- **Whoever picks this up next (Sol or otherwise): rules 3 and 4 remain fully binding until Sol makes and records a call, in both `AGENTS.md` (rule 2's superseded-note) and `docs/decisions.md`.** Until then, any new priority/staffing logic built under the expanded scope must stay application-owned and deterministic, keep models to bounded ranking/qualitative-explanation roles only, and must not let hidden skill leak into it — including indirectly, e.g. through a historical-evidence aggregate shaped by which specific responder produced a given data point (flagged as a real risk in my workforce SOW review, since a per-issue-class success-rate aggregate can reconstruct per-responder skill if not anonymized).
- Files changed: `AGENTS.md` (rule 2), `docs/decisions.md` (new entry, appended after Sol's own concurrent "Control Rooms compliance and hermetic-root hardening" entry — both coexist correctly), this log. `workforce_continuity_and_demand_simulation_SOW.md` itself carries my 12 inline review annotations plus a summary-disposition section, still untracked (not committed) as of this entry.
- Verification: Documentation-only change; no test suite affected. `docs/decisions.md` tail-checked after edit to confirm no corruption from concurrent editing.
- Current Git state: Not yet committed as of this entry — `AGENTS.md`, `docs/decisions.md` changes and this handover entry are pending a commit.

### 2026-09-08 — WC-2 workforce rotation fix reviewed, corrected, and deployed

- Task: The user reported two production bugs from Sol's already-deployed Workforce Continuity feature — too many crews visibly on shift at once, and new synthetic responders not following the `EngrNNN`/`TechNNN`/`OptrNNN` convention. Sol spawned its own finder/planner/fixer agents, root-caused the rotation-table bug (crews A and D had identical day/night patterns, so more than one crew could match as "on duty"), and built a `wc-2` fix — but ran out of API credits mid-verification with the fix uncommitted.
- I picked up Sol's in-progress work, ran the full test suites, found and fixed one leftover stale e2e assertion Sol's fixer had missed (`e2e/audit-trail.spec.mjs` still expected `"Oper142"` where every sibling assertion had already moved to `"Optr142"`), and committed the result as `bfad4d3`. Both gates passed (218/218 unit, 28/28 e2e).
- **Per the user's explicit instruction to delegate review to a dedicated agent before proceeding to migration and deployment, I ran two independent review agents in sequence, each reviewing the current commit against real, read-only copies of production Plant #1/#2 data (not just the test suite) — not a formality, both found real, production-data-reproducible bugs:**
  - **First review → `365253c`.** `reconcileWorkforceDuty`'s per-assignment release loop unconditionally set `issue.status = "PENDING"` whenever any active assignment was released, even when a second active assignment (a lawful SUPPORT) remained active on the same issue — proven against Plant #1's real `ISS-163` (a genuine PRIMARY-off-duty/SUPPORT-on-duty pair). While fixing this I found the true root cause was broader: releasing an issue's entire roster also violated a second `live-schema.mjs` invariant (a `RELEASED` assignment whose attempt has gone terminal needs a matching `resolutionHistory` record, which this path never created). Since an attempt may only leave `ACTIVE` by drawing a genuine resolution outcome, the fix never fabricates one — it now does a three-case per-issue reconciliation: promote a surviving lawful SUPPORT to PRIMARY; auto-transfer the whole issue to a free lawful on-duty responder when no roster survivor exists but a replacement does; otherwise defer the roster untouched and audited (`HANDOVER_DEFERRED_NO_REPLACEMENT`) rather than crash or invent an outcome.
  - **Second review → `ed49a98`.** A second, unrelated latent bug in the same function's dispatch-offer cancellation loop: it force-set `issue.status = "PENDING"` for a cancelled off-duty `ASSISTANCE` offer too, even though an `ASSISTANCE` offer only ever exists on an issue that's already `ASSIGNED` with an active PRIMARY. This wouldn't hit today's one-time migration (neither production file has a pending offer right now) but would surface live at any future shift boundary landing while an assistance offer is pending — reintroducing the exact "crew stuck" failure class through an unreviewed path. Fixed to only reset `issue.status` for unstaffed `INITIAL_ASSIGNMENT` offers.
  - Each fix was re-verified against read-only copies of the real Plant #1 (63 issues, three genuine PRIMARY+SUPPORT pairs) and Plant #2 files, confirmed byte-unchanged on disk via sha256 after every check, before being trusted.
- **Deployed.** Checksum-verified pre-migration backups taken for both rooms (`live-simulation.pre-wc2-20260908T2214Z.json`, sha256-matched). Stopped the confirmed sole port-3000 listener (PID `700289`) with `SIGTERM`; exited cleanly. Restarted (`nohup npm run dev`); serving PID is now `853672`. The migration ran automatically on boot: Plant #1 revision `48599 → 48600`, Plant #2 `3 → 4` (each the single `reconcileStartup` write), both still `PAUSED` exactly as persisted, issue counts preserved (63/2).
- Post-deployment verification: `GET /api/control-rooms` reports both rooms `READY`/`LIVE`/`PAUSED`. Both rooms now show exactly six active staff, single crew (Plant #1 crew B, Plant #2 crew A), `workforceContinuity.version: "wc-2"`. Zero responders with a non-convention public name. A string scan of both rooms' public API responses found no `responderSkills`/`trueSuccessProbability`/`trueMedianMinutes`. No `server_start_failed`, `ENOENT`, or error lines in the fresh log; port 3000 stayed single-listener across three consecutive probes.
- Files changed: `backend/src/workforce-continuity.mjs`, `backend/tests/wp25-workforce-continuity.test.mjs`, `backend/src/live-migration.mjs`, `backend/src/live-schema.mjs`, `backend/tests/wp11-analytics.test.mjs`, `e2e/audit-trail.spec.mjs`, `docs/decisions.md`, this log.
- Verification: 221/221 backend unit tests, 28/28 Chromium e2e tests (both suites re-run after each of the three fix commits). Real production data re-checked clean after every fix, immediately before deployment.
- Current Git commits: `bfad4d3`, `365253c`, `ed49a98` on `master`. Deployed and verified as above.
# 2026-09-09 — Station Status sidebar

- Implemented tabbed Shift Personnel / Stations navigation. Station rows and personnel rows focus their corresponding map entity; affected stations are first and healthy stations are collapsed.
- The former Selected Issue presentation is now Station Status. Active stations retain the existing dispatch detail; healthy stations render safe server-derived uptime, MTBF, and observed issue count.
- Verification: `npm test` passed (223 tests). Browser regression suite was started after the existing search-context regression was corrected; do not deploy or restart as part of this change.

# 2026-09-09 — Docker deployment branch (not deployed)

- Added `Dockerfile`, `compose.yaml`, and `.dockerignore` for a Node 22 Bookworm Slim production container. The Compose service owns host port 3000, uses named volume `compass-data` at `/app/data`, receives `.env` only at runtime, runs non-root with a read-only root filesystem, `/tmp` tmpfs, dropped capabilities, and no-new-privileges.
- `COMPASS_DATA_DIR` is the shared runtime root for every persistent store: room Live state and Offline audit, control-room metadata, provider settings, application events, plus the legacy single-room defaults. It defaults to `backend/data/` for local use. `COMPASS_CONTROL_ROOMS_DATA_ROOT` is unchanged and remains test-only.
- Deployment checklist: (1) stop the current non-Docker Compass listener before binding port 3000; (2) back up the entire existing `backend/data/` directory and verify it; (3) for continuity, manually copy the verified directory's contents into a confirmed-empty `compass-data` volume—never merge/copy into a nonempty volume; (4) run `docker compose up -d --build`; (5) inspect `docker compose ps` and `GET /api/control-rooms`, requiring all rooms `READY`; (6) preserve source backup and volume. Rollback means stopping Compose and restarting the former process against its retained verified data; do not delete the Docker volume.
- This branch has not stopped, restarted, or otherwise changed the existing port-3000 process.

# 2026-09-10 — Shift-first Analytics implementation (not deployed)

- Added deterministic UTC period aggregation and `/analytics/period` for bounded room-scoped Shift, Daily, Weekly, and Monthly requests. Default Analytics now renders latest 12 shifts as interactive raised/resolved bars; selecting a period reveals bounded 15-minute buckets plus period backlog, downtime, staffing action, and partial-state facts.
- No Docker action was taken by this implementation. Before handoff, run both required test suites and verify the room-scoped endpoint against an active container after deployment.

# 2026-09-11 — Write-only provider credential Settings

- Added deployment-wide API-key management in Settings for OpenAI and OpenRouter. The key input is always blank and password-typed; save/replace and remove are explicit actions. The Settings response displays only configured state, source (`settings` or `environment`), and a masked ending.
- Saved keys live in `provider-credentials.json`, separately from `provider-settings.json`, with mode `0600`; raw keys are never returned by API or logged. An environment key remains a fallback after a saved override is removed.
- Added service/route tests and a read-only browser assertion. Run both required test suites before deployment.
