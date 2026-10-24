# Agent Handover Board

This file is how the agents working on Compass talk to each other. Every agent works in
its own git worktree and branch, edits **only its own section** of its own copy of this
file, and commits that change with its work. The main agent reads each worktree's copy,
merges finished work into `master`, and archives merged handoffs to
[`docs/handover-history.md`](docs/handover-history.md).

| Agent | Worktree | Branch |
|---|---|---|
| Main agent (Claude, user 2026-10-19): session and own work | `/home/makodev58/nebius-compass-claude` | `claude` |
| Main agent: integration checkout (merges, assignments, merge log) | `/home/makodev58/nebius-compass` | `master` |
| Codex | `/home/makodev58/nebius-compass-codex` | `codex` |
| Gemini (back 2026-10-19, Gemini 3.8 Flash, light tasks) | `/home/makodev58/nebius-compass-gemini` | `gemini` |
| CodeBuddy (**excluded from tasks** since 2026-10-17) | `/home/makodev58/nebius-compass-codebuddy` | `codebuddy` |

## Protocol

**All agents (`AGENTS.md` rule 11):** stay inside `nebius` folders. Work only in
`/home/makodev58/nebius-compass` and the `nebius-compass-<agent>` worktrees. Never read, create,
edit, move, or delete anything in a folder without `nebius` in its name (for example
`/home/makodev58/amd-compass`, `/home/makodev58/compass` or `/home/makodev58/ResponseCompass`) unless the user explicitly
asks. Exceptions: installed tooling and the read-only Chromium library path in rule 9.

**Worker agents (codex; gemini and codebuddy are excluded and the claude worker is unused
since 2026-10-17):**

> Your **task** is your bullet under **Main agent → Assignments**. Your own section further
> down (`## codex`, `## gemini`, …) is the empty report form you fill in when you hand back.

1. Before you start a task, run `git merge master` in your worktree to pick up merged work
   and the latest assignments.
2. Read your assignment in **Main agent → Assignments** below. Work only in your own
   worktree, on your own branch. Do not commit to `master`, merge other agents' branches,
   or edit files in another agent's worktree.
3. Edit **only your own section** below. Replace its contents at each handoff; don't add a
   running log, because the main agent archives your previous handoff when it merges.
   Don't touch the main agent's section or any other agent's section.
4. Commit your work and your section update to your branch. The main agent merges commits
   only, so uncommitted changes are not merged. Don't push unless you are told to.
5. Set **Status** to `READY FOR MERGE` only after both suites pass (see `AGENTS.md` rule 9)
   and the relevant `project-state/` pages and `project-state/log.md` are updated. If you
   are stuck or need a decision, set `BLOCKED` and write the question under
   **Questions for main**.

**Main agent:**

0. Run your session in `/home/makodev58/nebius-compass-claude` and do your own tasks on the
   `claude` branch, like a worker. Touch `/home/makodev58/nebius-compass` (`master`) only to
   integrate: `git -C /home/makodev58/nebius-compass …`, and the suites run there.
1. Write and update assignments in **Main agent → Assignments**, on `master`.
2. To merge, read each agent's section with `git show <agent>:handover.md`. For each `READY FOR MERGE` branch,
   review the diff against `master`, merge it into `master` (your own `claude` branch goes
   through the same review and merge), rerun both suites on `master`,
   then record the merge in **Merge log**.
3. Copy the agent's handoff into `docs/handover-history.md` under **Merged handoffs**,
   newest first. Then reset that agent's section on `master` to `IDLE`.
4. When this file conflicts during a merge, keep the agent branch's version of that agent's
   own section and `master`'s version of every other section.

### Status values

`IDLE` · `IN PROGRESS` · `READY FOR MERGE` · `BLOCKED`

---

## Main agent

### Ports

Each agent tests on **its own ports only** and frees them **immediately** after testing.

| Agent | E2E port (`COMPASS_E2E_PORT`) | Manual preview server |
|---|---|---|
| main agent (integration checkout, `master`) | 3012 (default) | 3013 |
| codex | 3021 | 3121 |
| gemini | 3022 | 3122 |
| codebuddy | 3023 (excluded) | 3123 (excluded) |
| claude (main agent's own work) | 3024 | 3124 |

- **E2E:** run `COMPASS_E2E_PORT=<your port> LD_LIBRARY_PATH=/home/makodev58/nebius-tools/libs/usr/lib/x86_64-linux-gnu npm run test:e2e`.
  Playwright starts the server and stops it when the run ends, using its own
  `/tmp/compass-playwright-control-rooms-<port>` data folder.
- **Manual preview server** (screenshots, visual checks): start it on your preview port with
  `NODE_ENV=test`, a scratch `COMPASS_CONTROL_ROOMS_DATA_ROOT`, and both
  `COMPASS_*_MODE=force-failure`. **Stop it as soon as you have looked**, then check the port
  is free with `ss -ltn | grep :<port>` before handing off. Never leave a server running.
- **Hands off:** never bind 3000 (another app) or 3200 (the user's running ResponseCompass),
  and never stop a process you did not start.

### Watcher control

Agents' watchers read this table from `master` (`git show master:handover.md`) on each tick.
**`STOP` means stop your watcher now and do not restart it** until this says `RUN` again.
A watcher also stops on its own once the **Current task per agent** table shows "none" for you. The main agent sets
`STOP` when an agent has no work, which prevents watchers polling each other forever.

| Agent | Watcher |
|---|---|
| codex | RUN (round 28, 2026-10-24) |
| gemini | RUN (round 28, 2026-10-24) |
| codebuddy | STOP (excluded from tasks) |
| claude | n/a (main agent; runs the main agent watcher) |

Main agent watcher: polls every 300s for `READY FOR MERGE` / `BLOCKED` on each agent's branch
and stops once no agent has an open assignment.

### Assignments

**Current task per agent** (this table is authoritative; details are in the bullets below):

| Agent | Current task | Round |
|---|---|---|
| codex | Round 37: seed calibration rows into existing live rooms (migration, round 37 bullets) | 37 |
| gemini | Round 37: link a blocked checkout to the calibration form (reason, focus move) | 37 |
| codebuddy | none — **excluded from tasks** (user, 2026-10-17) | — |
| claude | none (round 26 closed 2026-10-21; its Ask item moved into round 27) | — |

Finished tasks are recorded in **Merge log** below, never as "none" lines here.

Round 2 (2026-10-16). The redesign and rename are merged. This round fixes text contrast,
adds regression tests for the header, and hardens the AMD Token Factory path now that the
service is back up. Start with `git merge master` (protocol step 1).

**Shared rules for this round**
- Do not commit regenerated `docs/assets/*.png` screenshots: run `git checkout -- docs/assets`
  before committing. The main agent regenerates them after merging.
- Do not touch `AGENTS.md`, `handover.md` outside your section, `docs/handover-history.md`,
  or the dated entries in `docs/decisions.md` / `project-state/log.md`. Those files are
  append-only: add your own new entry at the bottom.
- Stay inside `nebius` folders (`AGENTS.md` rule 11).
- **No live AMD calls.** Worker worktrees have no key and must not get one. Use mocked
  `fetchImpl` / fake clocks. `npm test` stays hermetic (rule 9). The main agent runs any
  live check.
- Run `npm install` once in your worktree. Verify with both suites (`AGENTS.md` rule 9).

**Round 3 (2026-10-16), running alongside round 2.** The user asked for tiling panels and a
new modern light theme. Use maintained open-source libraries rather than writing them from
scratch. Everything ships **inside the repo and is served by our own server**. No CDN, no
web fonts from the internet: the E2E suite asserts zero outbound requests, and the app must
work offline. The frontend has no bundler (plain ES modules served from `frontend/`), so
vendor each library's prebuilt browser build into `frontend/vendor/<name>/`, together with
its LICENSE.

**Already on master, do not recreate (main agent, to avoid conflicts):**
- `npm run vendor` (`scripts/vendor-frontend.mjs`) runs one module per library from
  `scripts/vendor/`; see `scripts/vendor/README.md`.
- codex adds `scripts/vendor/dockview.mjs`; gemini adds `scripts/vendor/fonts.mjs`.
- `package.json` already pins `dockview-core@8.3.1`, `@fontsource-variable/inter@5.3.0`
  and `@fontsource-variable/jetbrains-mono@5.3.0` as devDependencies. Run `npm install`
  after `git merge master`, and don't edit `package.json` unless you truly need another
  package (ask first).
- `backend/src/server.mjs` already serves `.mjs` and `.woff2` (`font/woff2`), so neither of
  you needs to touch it.
- Verified paths: `dockview-core/dist/package/main.esm.min.mjs`,
  `dockview-core/dist/dockview-core.js` (CSS source), and
  `@fontsource-variable/{inter,jetbrains-mono}/files/*-latin-wght-{normal,italic}.woff2`. The same shared rules as
round 2 apply.

- **gemini — Modern clean light theme.** Done: merged `87b3a77` (completed by codex in the
  gemini worktree). Gemini is excluded from further tasks (user, 2026-10-17).
- **main agent (was claude) — AMD rate limiting, 429 retry, circuit breaker.** **Done** on
  master by the main agent (2026-10-17): `backend/src/provider-controls.mjs`. Only 429 is
  retried, following guide §9 rather than this brief (see `docs/decisions.md`).
  - Read `Compass_AMD_Token_Factory_Integration_Guide.md` §2, §5 and §9, and
    `project-state/backend/model-providers.md`.
  - Own `backend/src/model-provider.mjs` and a new module for the controls (for example
    `backend/src/provider-limiter.mjs`). Put the limiter, retries and breaker **inside `callChatCompletion`** so
    every caller gets them. Do **not** edit `agent.mjs` (codex owns it from 2026-10-17); touch
    `event-planner.mjs` only if wiring requires it, keeping its validation/fallback contract. Do not touch
    `provider-settings.mjs` (codex owns it this round).
  - **Local limiter.** One shared limiter for all AMD calls (agent + planner) across all
    control rooms: configurable RPM (default 10) and concurrency (default 2), a bounded wait
    queue, and the caller's deadline still enforced. A request that cannot start before its
    deadline is unavailable, so it falls back.
  - **429 handling.** Honour `Retry-After` (seconds or HTTP date). Retry only if the wait
    fits the remaining deadline and a small retry budget (default 2). Otherwise fail fast so
    the caller falls back. Retry 502/503/network errors with bounded exponential backoff and
    jitter under the same rules. Never retry 400/401/403/404/422.
  - **Circuit breaker.** After N consecutive failures (default 5) open for a cooldown
    (default 60s). While open, calls fail immediately with a clear reason. After the cooldown
    one probe is allowed (half-open). Count only service failures, not validation rejections
    by our validators.
  - Env vars: `AMD_TOKEN_FACTORY_APP_RPM`, `AMD_TOKEN_FACTORY_APP_CONCURRENCY`,
    `AMD_TOKEN_FACTORY_MAX_RETRIES`, `AMD_TOKEN_FACTORY_BREAKER_THRESHOLD`,
    `AMD_TOKEN_FACTORY_BREAKER_COOLDOWN_MS`. Add them to `.env.example` and
    `project-state/operations/running-and-config.md`.
  - Tests in `backend/tests/amd-provider.test.mjs` (or a new file) with fake fetch and an
    injectable clock. No real sleeping beyond a few ms. Cover:
    - 429 with `Retry-After` within / beyond the deadline;
    - the retry budget;
    - 502 backoff;
    - no retry on 4xx;
    - limiter RPM / concurrency / queue-full;
    - breaker open → fail-fast → half-open → close.
  - Update `project-state/backend/model-providers.md` (remove these from "Not yet built")
    and add a `docs/decisions.md` entry.

- **codex — Raise AMD ranking validity.** Done: merged `80aa9e9`. Candidate names allowed in prose
  (main agent, `93272ec`), prompt hardened, one revalidated repair within the same deadline.

- **codex — Header regression E2E + saved-model check at boot.** Done: merged `a2dad5b`.

**Round 4 (2026-10-17).** Measurement showed no model is best at both jobs: DeepSeek-V4-Flash
ranked 3/3 but planned 1/3; MiMo-V2.6-Flash planned 3/3 and ranked 2/3. The user asked the
main agent to choose next work for codex and itself.

- **codex — Separate model per role (ranking vs event planner).** Done: merged `eee2b80`
  (planner seed-effort fix `b8c570a`).

- **main agent — Larger live measurement at the app's real timeouts.** 10 samples per model,
  60s ranking / 30s planner timeouts (the app defaults), through the provider controls, to
  choose the default model per role. **Done:** MiMo-V2.6-Flash / `none` stays the default
  for both roles (rankings 9/10, planner 10/10; DeepSeek 8/10 and 3/10). Codex: keep both
  role defaults at MiMo.

**Round 5 (2026-10-17).** The user is happy with the current feature set and wants demo data:
**at least a month of simulated history on e8-aura-p1 (`plant-1`)**, generated offline, so
Analytics has full periods to show.

- **codex — One month of offline simulation history for e8-aura-p1.** Generator merged
  `781bb42`. The month seed was withdrawn: it exposed an engine stall (fixed by the main
  agent, `afc2110`), and a corrected month is 74 MB and too slow. See round 6.

**Round 6 (2026-10-17).** With the stall fixed, a realistic month on plant-1 is 3,531 issues
in **74 MB**: cold room load ~21s, `/state` ~4.5s (6.5 MB body), Issues ~4.5s, analytics
1.1–2.3s. Size by array: recommendations 21 MB, operationalEvents 15 MB (41,899),
resolutionAttempts 5.9 MB, resolutionHistory 2.8 MB, dispatchOffers 2.5 MB, assignments
2.2 MB, issues 2.0 MB. Real use grows the same way, so the user chose **history
retention** first, then the month seed.

- **codex — History retention for long-running rooms, then the month seed.** Done: merged
  `5db2ad4`. Month seed (1 Sep → 6 Oct) committed with its archive.

- **main agent:** merged round 6 and installed the month into the 3200 app. Done.

**Round 7 (2026-10-17).** Submission materials. The main agent drafted the form answers, the
pitch deck content and the demo video script in `docs/submission/`. The user asked codex to
review them.

- **codex — Review the submission drafts.** Done: merged `5cf085a`.

- **main agent:** reviews and merges, then passes the final text to the user.

**Round 8 (2026-10-17).** The user requires **troubleshooting and fix recommendations** as a
real feature in the submission, and chose the measurable design: the fix applied must change
the simulated outcome, and Compass must rank fixes from evidence. The main agent meanwhile
extends the demo video (other features) and will add the fix segment after this merges.

- **codex — Hidden fault causes, a fix catalog, and ranked fix recommendations.** Start with
  `git merge master` and `npm install`; use port 3021. This is a large change: commit in
  coherent steps on your branch, keep both suites green at each, and read
  `project-state/backend/simulation.md`, `domain-model.md`, `concepts/agent-boundary.md` and
  `docs/history-retention.md` first.
  - **1. Hidden fault truth (like `ResponderSkill`, AGENTS.md rule 4).** Each issue gets a
    hidden **fault cause** drawn with the seeded RNG when it is created: 3–4 causes per
    issue class from an application-owned catalog (synthetic, domain-neutral), with priors
    that may vary by equipment. The cause drives an **observable symptom** (a short symptom
    code/text from the catalog shown on the issue), so similar symptoms carry real signal,
    but the cause itself is never exposed: not to Compass, the event planner, normal UI or
    API payloads, analytics, logs or archives readable by the UI. Add a schema guard in the
    style of `assertNoResponderSkill`, and tests that scan every public payload and model
    packet for it.
  - **2. Fix catalog with hidden effectiveness.** Application-owned fixes per issue class
    (about 5–6 each): id, short title, troubleshooting steps text. A hidden
    effectiveness table per (cause, fix) multiplies the attempt's success probability and
    scales its duration. When work starts, the attempt records the **fix applied**; outcome =
    existing team model × fix effectiveness, still seeded and deterministic. A failed attempt
    reopens the issue and the next attempt tries the next-ranked fix (a troubleshooting
    sequence). `actionTaken` in history becomes the applied fix (id + title + steps). The
    planner's free-text `responseAction` stays accepted for compatibility but is no longer
    the action taken; decide whether to keep showing it as the incident note and document it.
  - **3. Evidence and recommendation (rule 3 boundary).** Code builds the candidate fixes for
    the issue (that class's catalog) with **observed** evidence from history: attempts and
    first-time success for the same symptom, same issue class, same equipment, smoothed
    success, median minutes, last used. Compass (the **ranking role's** model and settings,
    through `callChatCompletion` and the provider controls) ranks **only the supplied fix
    ids** with a short rationale and a troubleshooting order; validate exactly like the
    responder ranking (supplied ids only, no invented fixes, bounded prose, no numbers that
    are not in the packet). **Deterministic fallback** ranks by smoothed same-symptom success,
    then evidence count, then catalog order. **Baseline for comparison:** the most frequently
    applied fix for the class. Store the recommendation on the issue with model info, the
    fallback/baseline picks and any disagreement, in the audit trail.
  - **4. Runtime.** Fix ranking runs as model-bound work in the live agent lane (it must never
    hold the clock; see `live-runtime.md`) and must not block responder dispatch: if it is
    not ready when work starts, use the deterministic pick and record that. Offline mode uses
    the fixture path, API-free. Event planner untouched apart from the catalog link.
  - **5. UI.** Issue panel: a **Recommended fix** section (ranked fixes, rationale,
    troubleshooting steps, evidence table, source: AMD model or deterministic, disagreement
    with the baseline). Audit trail: fix applied per attempt and the outcome. Analytics: a
    **first-time fix rate** by period, and recommended-vs-baseline agreement with
    denominators and the thin-sample rule. Must fit 375px and 1280px; Live Floor tiles keep
    working.
  - **6. History and the month seed.** Existing rooms migrate: open issues get a seeded hidden
    cause and symptom; resolved history keeps its legacy actions (marked legacy, excluded
    from fix evidence). Regenerate plant-1 with `generate:history` from the original week
    (`962ac7f`) to `2026-10-06T08:00Z` so the month shows fix evidence accumulating and the
    first-time fix rate improving week to week **if and only if the engine produces that**;
    report the weekly numbers either way. Retention must carry whatever fix evidence the
    engine and analytics need (compact facts), with archived/unarchived equality tests
    extended. Keep each committed seed file under 20 MB.
  - **7. Tests and docs.** Hermetic unit tests: hidden-cause privacy, catalog validation,
    outcome depends on fix as specified, deterministic fallback order, validator rejects
    unknown/invented fixes, lane non-blocking, migration, retention equality, generator
    determinism. E2E: the Recommended fix section and audit entries with forced provider
    failure. Update `project-state/` (simulation, domain-model, agent-boundary, live-runtime,
    http-api, frontend overview, analytics-and-ethics, log) and add a `docs/decisions.md`
    entry stating how this fits rules 3 and 4. You may now edit `agent.mjs` /
    `model-provider.mjs` as needed for the fix-ranking call; keep `provider-controls.mjs`
    unchanged.
  - **Do not touch:** `backend/data/`, port 3200, `docs/submission/` (the main agent updates
    the deck and video after the merge).
  - In your handoff, include sample IDs of resolved issues whose fix was ranked
    deterministically, with the symptom, the ranked fixes and the outcome, so the main agent
    can find good records quickly.

- **main agent:** extends the demo video to about 2:50 with more features meanwhile; after
  the merge, captures live AMD fix rankings on 3200, adds the fix segment, and updates the
  deck and form text.

**Round 9 (2026-10-18) — codex: Compass overtime recommendations with command-center approval.**
Start with `git merge master` (protocol step 1). The user's product direction: the app runs
the floor autonomously, and the command center monitors and controls it from wall screens
(one panel per monitor; the main agent has added `/rooms/:id/display/:screen`). The original
design had Compass recommend overtime personnel from the backlog, with **command-center
personnel accepting or rejecting** it. Today `applyWorkforceTrigger` in
`backend/src/workforce-continuity.mjs` decides and applies surge staffing itself (first
eligible responder by ID), and the result only appears in Settings → Demo.

- **codex:** turn staffing surge into a ranked recommendation that a human approves.
  - **1. Options built by code (rule 3).** When a staffing review or recheck finds a
    shortfall (today's condition: demand above active staff, under the active-staff cap,
    surge under 2), code lists **every lawful option**, not just the first: each on-shift
    extension candidate and each rested off-shift call-in candidate, with its legal end
    time (16 h duty cap, 12 h minimum rest — reuse the existing guards, do not loosen them).
    Each option carries only **observed** evidence: duty hours so far / rest hours, the
    current backlog by issue class and priority band, and that responder's observed
    experience with the backlog's issue classes and symptoms (attempts, smoothed success,
    median minutes — the same observed-history shape as responder ranking). No
    `ResponderSkill`, no hidden fault cause, no pay/seniority/HR fields. Keep
    `workforce-continuity.mjs` free of resolution history as its header says: put the
    evidence builder in a new module.
  - **2. Compass ranks, code validates.** Compass (ranking-role model and settings, through
    `callChatCompletion` and the unchanged provider controls) ranks **only the supplied
    option ids** with a short rationale; validate like the responder and fix rankings
    (supplied ids only, bounded prose, no invented numbers, one bounded repair).
    **Deterministic fallback:** extension before call-in, then best observed coverage of
    the backlog's classes, then id. **Baseline for comparison:** today's rule (first eligible
    by id). Model-bound work runs in the live agent lane and never holds the clock; Offline
    uses an API-free fixture.
    **Lessons from round 8 (fixed on master):** the live fix ranking passed no transport, so
    `callChatCompletion` threw inside the provider controls and every live call fell back as
    `provider-error` (hermetic tests always injected `fetchImpl`). Pass
    `fetchImpl: options.fetchImpl ?? fetch` and add a test that calls the live path with only
    a stubbed global `fetch`. MiMo also quotes numbers in prose unless told not to: use the
    digit-free rationale rule from `fix-ranking.mjs` / `agent.mjs`.
  - **3. Approval, not auto-apply.** The review now creates a **pending staffing
    recommendation** (ranked options, source, baseline, disagreement, deadline). Nothing
    changes until an operator acts:
    - `approve` (the top option or any other listed option) revalidates legality at that
      moment and then applies exactly today's mutation (`surgeKind`, `extensionEndsAt`,
      availability, duty start); stale → `STALE`, nothing applied.
    - `reject` (optional reason) applies nothing.
    - No answer by the deadline (default 30 simulated minutes, never past the next
      handover) → `EXPIRED`, nothing applied, and the existing `UNMET_STAFFING_RISK` is
      recorded if the shortfall persists. A newer review supersedes an open one.
    - **Room policy** `staffingApproval`: `OPERATOR` (default for every room) or
      `AUTO_APPROVE_TOP` (applies the top option after the deadline instead of expiring).
      Editable in Settings → Demo, audited, labelled "auto-approved by policy" wherever it
      appears. The history generator uses `AUTO_APPROVE_TOP` so generated history keeps
      surge staffing; say so in `docs/demo-history.md`.
    - Every step is an audited operational event with who/what/when (operator actions are
      recorded as "Central command").
    - Use the existing scheduler token claim pattern for the deadline; restart-safe and
      idempotent like the other triggers.
  - **4. API.** `GET` the open recommendation and recent decisions in `/state` (bounded) and
    `POST /api/control-rooms/:id/staffing/:recommendationId/approve` (`{ optionId }`) and
    `/reject` (`{ reason }`), with revision/stale conflict handling like the override route.
  - **5. UI.**
    - A new Dockview tile **Staffing**: backlog (actionable issues by priority band and
      class), active staff vs cap, next handover, the open recommendation (ranked options,
      rationale, evidence table, source AMD/deterministic, baseline disagreement, deadline
      countdown) with **Approve**, **Approve alternative** and **Reject** controls, and the
      last few decisions. Add `staffing` to `PANELS` in `tiling.js` (existing stored layouts
      must still load: treat a missing new tile as "reset to default") and to
      `DISPLAY_SCREENS` in `app.js` so `/rooms/:id/display/staffing` works.
    - Event feed: "Staffing recommendation ready", "Approved by central command",
      "Rejected", "Expired", "Auto-approved by policy".
    - Settings → Demo "Staffing outlook" shows the same records.
    - Must fit 375px and 1280px, and the 1920×1080 display screen.
  - **6. Analytics.** Staffing recommendations by outcome (approved top / approved
    alternative / rejected / expired / auto-approved), Compass-vs-baseline agreement, and
    unmet-risk count, with denominators and the thin-sample rule. Retention: compact facts
    so archived months count exactly (extend the equality tests).
  - **7. Migration and seed.** Existing rooms keep their staffing audit; an open legacy
    review is not reopened. Regenerate plant-1 from the same base as round 8 so the month
    contains staffing recommendations (auto-approved by policy) — keep each committed seed
    file under 20 MB and use the round 8 packaging. Report counts by outcome.
  - **8. Decision record.** Add a `docs/decisions.md` entry that supersedes the overtime part
    of the 2026-09-08 entry ("Models may not … select overtime"): code builds and enforces
    every lawful option; Compass only ranks the supplied options; a human (or an explicit,
    audited room policy) makes the decision. Rules 3 and 4 unchanged.
  - **9. Tests and docs.** Hermetic unit tests: option legality (16 h / 12 h / cap /
    surge), no hidden data in packets (scan like round 8), validator rejects unknown ids,
    fallback order, approve/reject/expire/stale/supersede, deadline token idempotency and
    restart, policy auto-approve, lane non-blocking, migration, retention equality,
    generator determinism. E2E with forced provider failure: tile renders, approve and
    reject work, the display screen renders. Update `project-state/` (workforce/simulation,
    agent-boundary, live-runtime, http-api, frontend overview, analytics-and-ethics, log).
  - **Do not touch:** `backend/data/`, port 3200, `docs/submission/`, `provider-controls.mjs`.
  - In your handoff, list sample recommendation IDs (approved, rejected, expired) in the
    regenerated month so the main agent can find them quickly.

- **main agent (meanwhile):** wall-display screens, an Issue Pareto analytics panel (bar
  with cumulative line, and pie; category → symptom → applied fix; count / downtime /
  failed attempts), live AMD fix-ranking capture on 3200, then the deck/video/form revision.

**Round 10 (2026-10-18) — codex: keep the live store fast at month scale.**
Start with `git merge master`. Measured on 3200 with the round 8/9 month (27 MB live state,
1× and 5×, live AMD): `POST /simulation/speed` 5.5 s, `POST /simulation/force-event`
17–28 s even after it stopped waiting for model calls, `/state` ~0.9 s average and up to
2.3 s. Cause: `live-store.mjs` `mutate` deep-clones the whole state (`structuredClone`
for the draft, again for `result` and again for the returned `state`), runs the full
`validateLiveState`, then `JSON.stringify` + fsync of the full 27 MB file, for every
mutation, and the real-time loop mutates every second. Every read and operator action
queues behind that chain.

- **codex:** make mutation cost independent of history size, without weakening crash safety.
  - **1. Measure first.** Add a reproducible benchmark script (not in `npm test`) that loads
    the shipped month into a scratch root and reports p50/p95 for a scheduler tick, an
    operator action (speed, force-event, override) and `/state`, `/analytics`,
    `/analytics/pareto` while the loop runs at 5× with forced providers. Record before/after
    numbers in `docs/demo-history.md`.
  - **2. Targets on this host** (state ≥ 27 MB, 5×, loop running): tick mutation p95 ≤ 50 ms;
    operator action p95 ≤ 500 ms; `/state` p95 ≤ 300 ms; analytics endpoints p95 ≤ 1 s.
    Report honestly if a target is not met and why.
  - **3. Likely changes (your design, justified in `docs/decisions.md`):** stop returning a
    full `state` clone from `mutate` (audit callers); avoid cloning untouched history for the
    draft (e.g. mutate a draft of the hot sections only, or apply-in-place with a rollback
    journal); validate only what a mutation can change, with the full validation kept for
    load, migration and tests; and persist without rewriting 27 MB per tick: for example an
    append-only, fsynced journal of mutations replayed at load plus periodic compacted
    snapshots, or write coalescing that never acknowledges an operator action before it is
    durable. Crash-safety guarantees in `project-state/backend/` stay true: an acknowledged
    mutation survives a crash; a torn write never corrupts the room. Keep `beforeCommit`,
    history retention/archive semantics and archived/unarchived equality.
  - **4. Tests.** Hermetic: crash/torn-write recovery for the new persistence (kill between
    journal and snapshot, truncated journal tail), replay equality with the current format,
    migration from existing `live-simulation.json` rooms (3200 must load its current file
    unchanged), retention/archive equality, and a bounded-time regression test on a
    synthetic large state. Both suites green.
  - **5. Docs.** `project-state/backend/live-runtime.md` / `control-rooms.md` / operations
    pages and `project-state/log.md`.
  - **Do not touch:** `backend/data/`, port 3200, `docs/submission/`, `provider-controls.mjs`.
    Installing on 3200 stays with the main agent.

- **main agent (meanwhile):** live AMD capture on 3200, deck and video revision.

**Round 11 (2026-10-19) — Nebius x NVIDIA hackathon. codex: review the plan once.**
The user made Claude the manager (main agent) for the Nebius entry. Gemini stays paused;
codex is the only worker. **Start your watcher now** (poll `git show master:handover.md`
every **300 s**; act when your Current task row changes; stop per Watcher control).

- **codex — Review `docs/nebius/04_HACKATHON_PLAN.md` (one review pass, docs only).**
  Start with `git merge master` in `/home/makodev58/nebius-compass-codex`.
  - Read `docs/nebius/01_HACKATHON_BRIEF.md`, `02_OFFICIAL_RULES.md`,
    `03_CODING_AGENT_GUIDE.md`, then the plan, and check it against the real code
    (`backend/src/`, `project-state/`). Do not change implementation code.
  - Write your review to a new file `docs/nebius/04_HACKATHON_PLAN_REVIEW.md`: numbered
    findings, each with severity (blocker / major / minor), the plan section, the evidence
    (file:line or rule quote) and a concrete proposed change. Cover at least: rule
    compliance and Stage One fit; whether the audit table is factually right; feasibility
    of N1–N6 by the dates given; rules 3/4 leaks in the tool layer, narratives, eval replay
    and case records; file-ownership conflicts between your packages and the main agent's
    N4/N5; acceptance criteria that are not objectively testable; anything to cut.
  - Do **not** edit the plan itself; the main agent revises it from your review.
  - Fill your `## codex` section, commit to `codex`, set `READY FOR MERGE`. No suites
    needed for a docs-only change; say so in Verification.
  - After that, keep the watcher running: your execution assignment (N1 first) will appear
    here after the main agent revises the plan.

- **main agent (meanwhile):** N0b baseline/provenance doc; N0 live Nebius probe once the
  user provides a key.

**Round 12 (2026-10-19) — codex: N1, Nebius Token Factory provider.**
Plan v2 (`docs/nebius/04_HACKATHON_PLAN.md`) is the spec. Read §2 (model tiering), §3.6
(budgets), §5 (ownership, N1 row, acceptance) and §6. Start with `git merge master` and
`npm install`; ports 3021/3121. Keep your watcher running (300 s).

- **codex — N1.**
  - **Provider registry.** `PROVIDER_IDS` gains `nebius`, which becomes the default for
    fresh installs; `amd` stays selectable and AMD-era `provider-settings.json` files load
    unchanged (a saved `amd` choice stays `amd`). Base URL `NEBIUS_TOKEN_FACTORY_BASE_URL`
    (default `https://api.tokenfactory.nebius.com/v1`), key `NEBIUS_TOKEN_FACTORY_API_KEY` /
    `_API_KEY_FILE` (fail closed like AMD), per-provider credential storage, masked hints.
  - **No guessed model IDs.** Nebius role defaults come from env
    (`NEBIUS_TOKEN_FACTORY_MODEL`, `_EVENT_PLANNER_MODEL`, `_INVESTIGATOR_MODEL`,
    `_NARRATOR_MODEL`, and matching `_REASONING_*` if needed). With no model configured a
    Nebius call fails closed as `model-not-configured` and callers fall back. Put the
    defaults in one table that the main agent fills after N0. Reasoning/thinking control:
    implement it as a per-model capability in that table (values `on`/`off`/`default`;
    request mapping chosen per entry: omit, `reasoning_effort`, or
    `chat_template_kwargs.enable_thinking`), so N0 only edits data.
  - **Roles.** `compass`, `event-planner` (existing), plus `investigator` and `narrator`,
    each with its own model/effort/timeout, persisted and in Settings → API (main agent
    owns frontend: expose them in the `/api/settings` snapshot and routes; add only the
    minimal Settings form fields needed, following the existing role fieldsets — tell me in
    the handoff what you changed in `frontend/`).
  - **Provider controls per provider.** Same limiter/retry/breaker semantics; separate
    instance and env per provider (`NEBIUS_TOKEN_FACTORY_APP_RPM`, `_APP_CONCURRENCY`,
    `_MAX_RETRIES`, `_BREAKER_THRESHOLD`, `_BREAKER_COOLDOWN_MS`); defaults conservative
    (RPM 20, concurrency 2). You may edit `provider-controls.mjs` only to key it by provider;
    keep its behaviour and tests.
  - **Tool calling.** `callChatCompletion` accepts optional `tools` (OpenAI function
    schema) and returns a normalised result `{ content, toolCalls: [{id,name,arguments}],
    finishReason, usage: {promptTokens, completionTokens}, modelId, latencyMs,
    providerRequestId }` through a new function (e.g. `callChatTurn`); keep
    `callChatCompletion`'s current return contract for existing callers. Behind a per-model
    capability flag `toolCalling: native | json-protocol`; for `json-protocol` provide the
    helper that encodes tools into the system prompt and parses a
    `{ "action": "tool"|"final", ... }` JSON reply into the same normalised shape. Validate
    tool-call JSON arguments strictly (unknown tool, bad JSON → error result, not a throw
    past the loop).
  - **Metadata.** Existing callers record model id, latency and token usage on their
    recommendation records when available (bounded, no prompt contents in logs).
  - **Tests (hermetic, fake fetch, fake clock):** Nebius request shape and auth header; key
    file fail-closed; model-not-configured fallback; provider selection + AMD settings
    migration; per-provider controls isolation; native tool-call round trip; JSON-protocol
    round trip; malformed tool arguments; usage/latency metadata; one live-path test with
    only a stubbed global `fetch` (round 8 lesson). `npm test` stays network-free.
  - **Docs:** `project-state/backend/model-providers.md` (now two providers),
    `operations/running-and-config.md`, `.env.example` (placeholders only), `log.md`, and a
    `docs/decisions.md` entry (Nebius default, AMD retained, no guessed IDs).
  - **Do not touch:** `backend/data/`, port 3200, `docs/submission/`, `docs/nebius/`,
    `fixtures/investigation/`, `e2e/` (tell me if an E2E needs updating), and no live calls.
  - **Also (fresh-clone defect):** several unit tests `mkdtemp` under `.cache/` and fail with
    ENOENT on a fresh clone (judges will clone). Make them create `.cache/` themselves
    (`mkdir(..., { recursive: true })`) and verify by running `npm test` after
    `rm -rf .cache`.
  - **E2E environment changed:** the Chromium library path is now
    `LD_LIBRARY_PATH=/home/makodev58/nebius-tools/libs/usr/lib/x86_64-linux-gnu` (AGENTS.md
    rule 9). If Playwright reports a missing browser, run
    `npx playwright install chromium-headless-shell` once.
  - **Frontend note:** master now has the Field reports tile (`frontend/investigation-view.js`,
    sixth Dockview tile). Keep your Settings changes inside the existing Settings → API role
    fieldsets in `app.js`; do not touch the investigation files or `tiling.js`.
  - **N0 is done (2026-10-19)** — read `docs/nebius/05_TOKEN_FACTORY_FACTS.md`. Use these
    facts directly instead of leaving placeholders:
    - thinking control = `chat_template_kwargs: { enable_thinking: true|false }` (not
      `reasoning_effort`, not `/no_think`);
    - `toolCalling: native` for all Nemotron models;
    - reasoning arrives in `message.reasoning_content` and is ignored like today;
    - role defaults: investigator `nvidia/Nemotron-3-Ultra-550b-a55b` on, compass
      `nvidia/nemotron-3-super-120b-a12b` on, event-planner and narrator
      `nvidia/Nemotron-3_5-Lightning` off;
    - keep `max_tokens` 4096.

    Defaults still go in the one table and stay env-overridable. No live calls from your
    worktree.
  - **Handoff:** both suites green on port 3021; list the exact env table the main agent
    must fill after N0. Next for you after merge: N2.

- **main agent (meanwhile):** N5 scenario fixtures (`fixtures/investigation/`, by 10-21),
  N4 UI on stubs, N0 when the key arrives.

**Round 13 (2026-10-19) — codex: N1b, then N2.** Start with `git merge master`. Ports
3021/3121. Keep your watcher running. Commit N1b separately, then continue straight into N2
in the same round; set `READY FOR MERGE` once at the end, unless N2 needs a decision
(`BLOCKED`).

- **codex — N1b: fill the Nebius defaults from N0** (`docs/nebius/05_TOKEN_FACTORY_FACTS.md`).
  - `NEBIUS_ROLE_DEFAULTS`:
    - compass `nvidia/nemotron-3-super-120b-a12b` / **`off`** (changed 2026-10-19 after the
      real-packet measurement in `05_TOKEN_FACTORY_FACTS.md`: off 5/5 valid at 3.2 s, on 4/5 at
      17.6 s);
    - event-planner `nvidia/Nemotron-3_5-Lightning` / `off`;
    - investigator `nvidia/Nemotron-3-Ultra-550b-a55b` / `default`;
    - narrator `nvidia/Nemotron-3_5-Lightning` / `off`.

    Keep your timeouts.
  - `NEBIUS_MODEL_CAPABILITIES`: those three models plus `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`
    and `nvidia/Nemotron-3.5-Super-VL`, each
    `{ toolCalling: 'native', thinking: 'chat_template_kwargs.enable_thinking', jsonMode: true }`.
  - Update the two tests that assert blank fresh IDs: fresh Nebius now uses the table, and
    blank still fails closed when explicitly configured blank.
  - Leave the `.env.example` model/effort lines **blank**, so built-in defaults apply and a
    copied file cannot silently override the planner's `off`. Comment that blank means
    "built-in default" and name the defaults.
  - Update `model-providers.md` and `running-and-config.md`.
  - Move `scripts/watch-codex-handover.mjs` and its test **out of the product repo** to
    `/home/makodev58/nebius-tools/` (the repo goes public in N7; agent tooling does not
    belong in it). Remove its `running-and-config.md` section, and keep a one-line log entry.
- **codex — N2: contracts §3.3, §3.4 and §3.7 of plan v2.**
  - **`backend/src/investigation-dto.mjs`.** Explicit field-by-field constructors for
    `CaseDTO`, `ResponderDTO`, `FixDTO` and `EquipmentDTO`, exactly the field lists in §3.3.
    Never spread state rows.
  - **Certifications.** Public synthetic certifications per responder, from a **separate
    seeded RNG stream** independent of `ResponderSkill`. Small enum: `ISOLATION`,
    `SPECIALIST-A`, `SPECIALIST-B`, `SPECIALIST-C`. Add migration for existing rooms and
    the month seed (deterministic, seeded by responder id).
  - **Fix catalog.** Add `safetyClass`, `prerequisites[]` (enum: `STATION_ISOLATED`,
    `LOCKOUT_CONFIRMED`, `DRIVE_DE_ENERGISED`) and `requiredCertifications[]`. Update
    `validateFixCatalog`. These are public procedure data, not outcome truth: at least one
    `ROUTINE`, one `ISOLATION_REQUIRED` and one `SPECIALIST_ONLY` fix per class.
  - **Case records.** `CASE-<issueId>`, derived from resolved issues **and the archive's
    compact facts** (extend the compact facts if a `CaseDTO` field is missing). Stable
    across reload/archive. Legacy flag for pre-fix-catalog history.
  - **`reportNarrative` (+ `narrativeSource`) on issues.** Migration: resolved history gets
    a code-generated template narrative from the **public symptom only**, marked
    `template`. The history generator writes seeded templates with noise: misleading
    keywords, typos, omissions. Use templates for now, not the live narrator.
  - **`backend/src/investigation-tools.mjs`.** Read-only tools with JSON schemas for
    `callChatTurn`:
    - `search_cases`;
    - `get_case`;
    - `equipment_history`;
    - `fix_catalog`;
    - `fix_evidence`;
    - `eligible_responders` (eligible = available, plus qualification per fix).

    Each takes `asOf` from the caller, never from the model. Budgets from §3.6: ≤ 10 rows,
    ≤ 8 KB per result. Args are validated, and errors come back as tool results, not
    throws.
  - **Tests** (hermetic):
    - noninterference: randomise skill/cause/effectiveness → byte-identical tool results
      and DTOs;
    - canary scan over every tool result and DTO, including archive-backed cases and
      renamed keys;
    - future-data perturbation: records after `asOf` change nothing;
    - case-id stability across archive;
    - catalog validation;
    - certification determinism and independence;
    - migration;
    - the scenario setup tags in `fixtures/investigation/scenarios.json` that N2 can
      already build (history and responder tags). Import fixtures read-only.
  - **Do not build** the investigator loop, routes or approval yet (N3a). **Do not touch**
    `frontend/`, `e2e/`, `fixtures/investigation/`, `docs/nebius/`, `backend/data/`, port
    3200. No live calls.
  - **Docs:** `domain-model.md`, `simulation.md`, `agent-boundary.md`, a new
    `project-state/backend/investigation.md` (add it to `index.md`), `log.md`, and a
    `docs/decisions.md` entry.

- **main agent (meanwhile):** live re-measure of the Compass ranking roles on Nebius with
  the real Scenario A packet (after N1b merges), N5 eval harness skeleton, N4 polish.

**Round 14 (2026-10-19) — codex: N3a, the investigator vertical slice.** Start with
`git merge master`. Ports 3021/3121; keep your watcher running. This is the **slice gate**
(target 2026-10-24 SGT). Plan v2 §3.1, §3.2, §3.4–§3.6 and §3.8 are the spec, and the
harness contract sits at the end of §4. Commit in coherent steps with both suites green.

- **codex — N3a.**
  - **Field reports (§3.1).**
    - `POST /reports` creates a persisted `FieldReport` (status `UNRESOLVED`).
    - Run the code-owned **input and hazard policy** first (§3.4: a versioned lexicon; the
      injection lexicon flags the report and quotes the spans).
    - Hazard → the report is confirmed against the explicit or matched equipment if there
      is one, and its investigation is created directly as `ESCALATED` with **zero model
      calls**. Garbled, empty or over-length input → `ABSTAINED` with zero calls.
    - Otherwise code builds the interpretation options (≤ 12), and the ranking role ranks
      the option ids. This runs in the agent lane, uses the existing ranking validator
      style, and has a deterministic order as fallback.
    - `POST /reports/:id/confirm` (option id or a manual triple, plus `expectedRevision`)
      creates the issue with deterministic priority, origin `FIELD_REPORT` and
      `dispatchGate: INVESTIGATION`, then queues the investigation.
    - `POST /reports/:id/close` closes the report.
  - **Investigator loop (§3.6 budgets).**
    - Investigator role, `callChatTurn` with native tools and `createInvestigationTools`
      (host `asOf` = investigation start, target excluded).
    - Limits: ≤ 6 tool steps, ≤ 8 inference calls including one bounded repair, a 120 s
      monotonic deadline, ≤ 64 KB stored trace.
    - Final JSON:
      - `hypotheses[{symptomCode, text, evidenceRefs[{caseId, field}]}]`;
      - `fixes[{fixId, rationale, evidenceRefs}]`, ranked;
      - `responders[{responderId, rationale}]`, ranked;
      - optional `proposedOutcome` (`ABSTAIN` | `ESCALATE` + reason).
    - **Validators:**
      - refs only to cases the tools returned in this run, with fields from `CaseDTO`;
      - fix ids from the class catalog;
      - responder ids from `eligible_responders`;
      - prose ≤ 400 chars with no digits except supplied ids.
    - Code computes `evidenceGrade` (§3.5 formula), `qualified` per responder and the
      §3.5 outcome precedence.
    - Procedure text comes from the catalog verbatim, never from the model.
    - Failure or deadline → a labelled deterministic investigation (lexical case match +
      existing fix evidence + baseline responder order), still `READY`/`ABSTAINED` and
      still gated.
  - **Dispatch gate (§3.2).**
    - `assertDispatchAuthorized` is called inside **every** assignment path: offer
      creation, `assignInState`, manual override, offer acceptance, assistance/support and
      rematch.
    - Add a test that enumerates those call sites, so a new path without the gate fails.
    - Approval stores the authorized responder and fix, the actor, the revision and the
      confirmed prerequisites. It revalidates eligibility, qualification, prerequisites,
      issue state and revision in one mutation; anything stale → 409 `STALE`.
    - Implement `reject` and `escalate` (operator) and `feedback`.
    - Expiry, supersede, restart re-queue and the `AUTO_APPROVE_SAFE` policy are **N3b**.
      Keep pending records restart-safe now: on boot, a `RUNNING` run is re-queued and a
      stale token is discarded.
  - **Routes and state (§3.8).** `GET /state` gains bounded `fieldReports` and
    `investigations`; also `GET /investigations/:id` (full DTO trace) and
    `GET /cases/:caseId` (archive-aware, 404 if unknown). **Field names must match the UI
    contract already on master.** `e2e/investigation-ui.spec.mjs` and
    `frontend/investigation-view.js` read:
    - for reports: `id`, `status`, `narrative`, `flags{hazard[], injection[], input}`,
      `revision`, `interpretation{status, source, model, options[{optionId, equipmentId,
      equipmentName, issueClass, symptomCode, symptomText, rationale}]}`;
    - for investigations: `id`, `issueId`, `reportId`, `status`, `source`
      (`NEBIUS_MODEL`/`AMD_MODEL`/`FIXTURE`/`DETERMINISTIC`), `model{modelId, calls,
      latencyMs, promptTokens, completionTokens}`, `fallbackReason`, `evidenceGrade`,
      `reason`, `warnings[]`, `hypotheses`, `fixes[{fixId, title, steps, safetyClass,
      prerequisites, requiredCertifications, grade, rationale, evidenceRefs}]`,
      `responders[{responderId, displayName, qualified, certifications, rationale}]`,
      `trace[{tool, args, resultIds, ms, error?}]`, `decision{status, actor, at,
      responderId, fixId, reason, confirmedPrerequisites}`, `feedback{useful}`,
      `revision`, plus `interpretation`, `repaired` and `rawInvalid` for the harness.

    Route responses may return the new `/state`. The UI accepts either that or
    `{message}` and then polls.
  - **Offline/fixture path.** Fixture mode reads `fixtures/investigation/synthetic-responses/`.
    **You may add files there** (labelled `"label": "synthetic"`, one per scenario you
    need). This is the one exception to the fixtures ownership rule this round. Offline
    mode stays API-free.
  - **Harness module.** `backend/src/investigation-eval.mjs` exports
    `runScenario(scenario, { mode, samples })` per plan §4. Then
    `npm run eval:investigator -- --mode fixture` must run all 24 scenarios. Report its
    table in your handoff; honest failures are fine.
  - **Tests** (hermetic):
    - every §5 N3a acceptance item;
    - the call-site enumeration;
    - hazard input escalates with 0 calls;
    - a never-resolving provider leaves the lane, ticks and `/state` responsive;
    - injection both in the report and in a retrieved case narrative;
    - an invented case id, unknown fix, unqualified responder or unconfirmed prerequisite
      is rejected;
    - digits in prose, step-cap overrun and deadline.

    No live calls.
  - **Docs:** `backend/investigation.md`, `http-api.md`, `live-runtime.md`,
    `agent-boundary.md`, `offline-runtime.md`, `log.md`, and a `decisions.md` entry.
  - **Do not touch:** `frontend/`, `e2e/` (tell me what to change), `docs/nebius/`,
    `backend/data/`, port 3200.

- **main agent (meanwhile):** N5 part 2 (paired replay outcome runner design), N8
  deployment prep, README/HACKATHON_CHANGES upkeep. After N3a merges: switch the UI E2E
  from stubs to the real API and run the first live investigation evaluation.

**Round 15 (2026-10-19) — codex: N3b, the investigator lifecycle.** The slice gate
passed. Start with `git merge master`; ports 3021/3121; keep your watcher. Plan v2 §3.2 and
§5 N3b are the spec.

- **codex — N3b.**
  - **FIRST, a defect found by the live eval (`docs/evaluation.md`, 2026-10-19).** In 8 of
    24 live scenarios, Ultra returned a supported, qualified recommendation **and**
    `proposedOutcome: ESCALATE` with a reason like "Strong historical evidence supports the
    fix…". `investigator.mjs:159` accepts any model escalation, so these became `ESCALATED`.
    - **Prompt** (`prompts/investigator.mjs`): `proposedOutcome` is only for not
      recommending. `ESCALATE` means a safety concern needs a person before any action.
      Omit `proposedOutcome` when recommending; approval is always required anyway.
    - **Code:** if the model proposes `ESCALATE` while its first fix is grade ≥ `MODERATE`
      and has a qualified responder, treat that as a validation error with bounded
      feedback (one repair, inside the existing call/step budget). Keep accepting
      `ESCALATE` when there is no supported fix. The code-owned hazard policy is
      unchanged.
    - Add a hermetic test with that exact output shape.
    - Also put `fallbackReason` on every deterministic run (some live runs had none
      visible) and keep `rawInvalid`/`repaired` accurate.
  - **State machine completion (§3.2).**
    - `READY` → `EXPIRED` at the deadline (default 30 simulated minutes; room setting
      `investigationDeadlineMinutes`). Use the scheduler token-claim pattern, restart-safe
      and idempotent.
    - `SUPERSEDED` by a re-investigation: `POST …/investigations/:id/reinvestigate`
      (operator), which creates a new run with a fresh `asOf`.
    - Restart re-queue is already done; extend the tests to cover expiry across restart.
  - **Abstained/escalated manual path.**
    - `POST …/investigations/:id/override`
      `{ responderId, fixId, confirmedPrerequisites, reason, expectedRevision }`. This is
      the audited operator path for `ABSTAINED`/`ESCALATED`.
    - It applies the same certification and prerequisite checks as approve, and records
      the decision as `OVERRIDDEN` with the reason.
    - Tell me the final field names and I will add the UI.
  - **Room policy `investigationApproval`.** `OPERATOR` (default) or `AUTO_APPROVE_SAFE`:
    - auto-approval happens only at the deadline;
    - only `READY` results with grade ≥ `MODERATE`, no safety escalation and a qualified
      responder;
    - all prerequisites are recorded as confirmed by policy;
    - the actor is `policy:AUTO_APPROVE_SAFE`;
    - **never** `ABSTAINED`, `ESCALATED` or `THIN`.

    Add `PATCH …/demo/investigation-policy` and audit it.
  - **Simulated field reports.**
    - `investigationShare` room setting (default 0.2, seeded draw): planner-created issues
      sampled into `dispatchGate: INVESTIGATION` get a `reportNarrative` from the
      **narrator role**: Lightning/off through `callChatTurn`, fed only the `ObservableDTO`
      from §3.3.
    - The narrator validator rejects cause vocabulary, procedure titles, skill claims and
      digits other than the equipment name.
    - The deterministic template is the fallback.
    - Their facts are engine-owned (§3.1), so no confirmation step: the investigation
      starts directly, and its classification is a recorded hypothesis.
  - **Backend analytics.** Investigations by outcome:
    - READY/APPROVED/OVERRIDDEN/REJECTED/EXPIRED/ABSTAINED/ESCALATED/AUTO_APPROVED;
    - approval vs override rate;
    - abstention rate;
    - first-time-fix rate of approved investigator first fixes vs the class-frequency
      baseline over the same issues.

    Denominators and the thin-sample rule apply as elsewhere. Add compact retention facts so
    archived and unarchived counts are equal (extend the equality tests). Expose this in
    `/analytics` under `investigations`, and tell me the shape for the UI.
  - **History generator.** Run with `AUTO_APPROVE_SAFE` and `investigationShare`, so a
    regenerated plant-1 month contains investigations. Keep each committed seed file under
    20 MB. Report counts by outcome and three sample IDs (approved, abstained, escalated).
    If regeneration would take too long, skip it and say so; a small deterministic
    investigation dataset is acceptable (plan §5 N6).
  - **Tests.** Hermetic:
    - expiry with token idempotency and restart;
    - supersede;
    - override safety checks;
    - auto-approve never on ABSTAINED/ESCALATED/THIN;
    - narrator privacy, using the noninterference/canary pattern on the ObservableDTO;
    - share sampling determinism;
    - analytics denominators;
    - retention equality;
    - generator determinism.

    Both suites green.
  - **Docs:** investigation/simulation/analytics-and-ethics/http-api/live-runtime pages,
    `log.md` and `decisions.md`.
  - **Do not touch:** `frontend/`, `e2e/`, `docs/nebius/`, `backend/data/`, port 3200. No
    live calls.

- **main agent (meanwhile):** deploy master to e8aura-deploy and run the first **live**
  Nebius investigations there (the room bootstraps the month seed), first live eval run,
  UI for override and analytics once N3b names the shapes.

**Round 16 (2026-10-19) — codex: N5 part 2, the paired first-fix replay.** Start with
`git merge master`; ports 3021/3121; keep your watcher. Plan v2 §4 ("Paired first-fix
replay") is the spec. Scoring already exists in `scripts/eval/score.mjs`
(`scorePairedReplay`, which reads `[{ issueId, investigator, baseline, deterministic,
excluded }]` with each arm `{ fixed: boolean }`).

- **codex — Paired replay outcome runner.**
  - **New module `backend/src/replay-runner.mjs`**, exporting
    `runPairedReplay({ mode, heldOutDays = 7, limit, investigate })` → `{ pairs, meta }`.
  - **Held-out set.** Take the committed month seed. The held-out set is the last
    `heldOutDays` of resolved issues that have a public symptom and a catalog fix.
  - **Per held-out issue:**
    - Build the decision state as of the issue's `raisedAt` (rolling origin). Only outcomes
      completed before that instant are visible, and the target is excluded. Reuse the
      `asOf`/`casesBefore` machinery, and assert future-data invariance in a test.
    - Run the investigator in `mode` (`fixture` | `live`) on that state with the
      engine-owned interpretation (§3.1 simulated path). It gets **no** approval policy
      shortcuts.
    - If the result is not `READY`, set `excluded` to its status (`ABSTAINED`,
      `ESCALATED`, `FAILED`) and continue.
    - Otherwise run the **first attempt three times** in an isolated outcome runner with
      the investigator's first fix, the class-frequency baseline fix (as frozen at that
      instant, catalog-order ties) and the existing deterministic fix order's first fix.
    - The responder, engine state, simulated time and **RNG draws are identical** across
      the three arms; only the fix differs. Use the responder the issue actually had
      first, so responder choice cannot confound the comparison.
    - Each arm reports `{ fixed }`.
  - **Hidden truth stays inside the outcome runner.** Cause and effectiveness are used only
    there. Never serialise them into pairs, meta, traces, fixtures or logs. Extend the
    canary/noninterference tests: changing hidden truth changes outcomes, never packets.
  - **`meta`:** held-out window, counts, seed hash, mode, model ids and run time. No hidden
    data.
  - **`scripts/eval-investigator.mjs`:** add a `--replay [--held-out-days N] [--limit N]`
    path that calls the runner and prints `scorePairedReplay` with denominators: coverage,
    exclusions by reason, first-time fix per arm, discordant pairs. You may edit this
    script for that flag only. Fixture mode must run hermetically, and a small
    `--limit 5` fixture replay goes in a test.
  - **Docs:** `docs/evaluation.md` gets a "Paired replay" method section. **No result
    numbers;** the main agent runs it live. Also update `backend/investigation.md`,
    `log.md` and a `decisions.md` entry on why the hidden truth is used here and why that
    is consistent with rule 4 (the engine owns outcomes; the scorer never sees causes).
  - **Do not touch:** `frontend/`, `e2e/`, `docs/nebius/`, `backend/data/`, port 3200. No
    live calls.

- **main agent (meanwhile):** UI for override, re-investigate, policy and investigation
  analytics (N3b shapes); live evaluation run 2; deploy.

**Round 17 (2026-10-19) — codex: judge-period cost ledger and daily budget.** The demo
must stay free and usable for judges through 2026-12-15 without draining credit (plan §6,
judge access). Start with `git merge master`; ports 3021/3121; keep your watcher.

- **codex — cost ledger and budget.**
  - **Ledger.** For every provider call that returns usage, record compact daily
    aggregates per provider, model and role: calls, prompt tokens, completion tokens and
    estimated cost.
    - Price source: a per-model price table in code. Nebius values are from
      `docs/nebius/05_TOKEN_FACTORY_FACTS.md` (USD per 1M tokens: Ultra 1.00/3.00, Super
      0.30/0.90, Lightning and Nano 0.06/0.24); unknown models count tokens with cost null.
    - Persistence: deployment-global, a small JSON file in the data root (not per room),
      atomic writes, bounded to 120 days.
    - Prompt contents are never stored.
  - **Budget.**
    - `COMPASS_DAILY_BUDGET_USD` is unset or 0 by default, meaning unlimited.
    - When today's (UTC) estimated spend reaches the budget, new **live** calls fail closed
      with `code: "budget-exhausted"` before reaching the provider. Callers fall back
      deterministically, exactly like provider errors.
    - In-flight calls finish. Calls resume at the next UTC day. The fallback reason is
      visible on records as `budget-exhausted`.
    - Log `provider_budget_exhausted` once per day.
  - **API.** `GET /api/settings` gains `usage: { today: {...}, last7Days: [...], budgetUsd,
    exhausted }`. It is readable by everyone, including tunnel visitors; changing the
    budget is env-only.
  - **UI.** In Settings → API, add a small read-only "Usage" block: today's spend, calls and
    tokens per role, the budget and status. Keep it inside the existing Settings
    renderer, follow its style, and tell me what you changed.
  - **Tests** (hermetic, fake fetch and clock):
    - aggregation per role and model;
    - unknown-model cost null;
    - the budget blocks before fetch and resumes the next day;
    - fallback reason propagation for ranking, investigator and planner;
    - persistence across restart;
    - the bounded retention;
    - no prompt text in the file.
  - **Docs:** `model-providers.md`, `running-and-config.md`, `.env.example`, `log.md`.
  - **Do not touch:** `e2e/` (tell me if an E2E needs updating), `docs/nebius/`,
    `backend/data/`, port 3200. No live calls.

- **main agent (meanwhile):** live paired replay, N7 repo and docs preparation, demo
  rehearsal on e8aura-deploy.

**Round 18 (2026-10-19) — codex: factual review of the public docs (N7).** The repo goes
public soon. Start with `git merge master`; keep your watcher. Docs only; no suites
needed.

- **codex — review, do not edit the reviewed files.** Check every factual claim in these
  files against the code, tests and git history on master:
  - `README.md`;
  - `HACKATHON_CHANGES.md`;
  - `docs/evaluation.md` (both live runs and the replay method);
  - `docs/nebius/05_TOKEN_FACTORY_FACTS.md`;
  - `docs/nebius/06_SUBMISSION_DRAFT.md`;
  - `docs/DEMO_SCRIPT.md`;
  - `scripts/deploy/README.md`;
  - `.env.example`.

  Look for:
  - claims the code does not support;
  - wrong commit hashes, counts, defaults, env names or route names;
  - "every step runs on NVIDIA"-style overclaims;
  - anything a judge could not reproduce from the README;
  - secrets, private URLs or personal data;
  - rule 3/4 language that misstates the boundary;
  - stale AMD-only wording in user-facing docs.
- **Output:** a new file `docs/nebius/07_PUBLIC_DOCS_REVIEW.md` with numbered findings. Each
  finding gets a severity (blocker / major / minor), file:line, the evidence and the exact
  replacement text. Fill your section, commit, then set `READY FOR MERGE`.

**Round 19 (2026-10-19) — codex: code fixes from the docs review, plus replay provenance.**
Start with `git merge master`; ports 3021/3121; keep your watcher. **The main agent owns
`backend/src/investigator.mjs` and `prompts/investigator.mjs` this round.** It changed them
for grounded numbers in prose and a stricter repair message, after the live replay showed
34/60 fallbacks. Do not edit those two files; tell me if you need a change there.

- **codex.**
  - **Review #3 — Docker image fixtures.** The `Dockerfile` must include `fixtures/` and
    `backend/fixtures/`, so Offline and fixture paths behave the same as in a source
    checkout. Verify with `docker build` locally (Docker is installed on e8aura-dev), and
    add a test that every fixture path the runtime reads lies under a directory the
    Dockerfile copies.
  - **Review #4 — dev compose persistence.** `docker-compose.yml` should mount the
    directory the image actually uses (`/app/data`), or set `COMPASS_DATA_DIR`
    consistently.
  - **Replay provenance.** Each pair in `runPairedReplay` gets
    `investigator: { fixed, source, fallbackReason }`, using public labels only.
    `scorePairedReplay` must not break; a nested field is fine. Add a split of the
    investigator arm by `source` to the replay CLI output (model vs deterministic
    first-fix rates, each with denominators). You may edit `scripts/eval-investigator.mjs`
    and `scripts/eval/score.mjs` for this; extend `eval-score.test.mjs` to match.
  - **Tests and docs:** both suites green; `log.md`; `project-state` pages for what you
    change.
  - **Do not touch:** `investigator.mjs`, `prompts/investigator.mjs`, `README.md`,
    `docs/nebius/`, `docs/evaluation.md`, `docs/DEMO_SCRIPT.md`, `HACKATHON_CHANGES.md`,
    `frontend/`, `e2e/`, `backend/data/`, port 3200. No live calls.

**Round 20 (2026-10-19) — codex: security and correctness review of the investigator path.**
Before the repo goes public. Start with `git merge master`; keep your watcher. Review
only: write findings, change no code.

- **codex — review.** Focus on what a hostile report author, a hostile retrieved case
  narrative, or a malformed model reply could do. Scope:
  - `report-policy.mjs`;
  - `investigator.mjs`, including the main agent's `8a76993`: grounded numbers in prose and
    the repair message, which now echoes allowed ids;
  - `prompts/investigator.mjs`;
  - `investigation-service.mjs`, `investigation-public.mjs`, `dispatch-gate.mjs`;
  - the routes in `server.mjs`;
  - `frontend/investigation-view.js` (escaping and `innerHTML` sinks).

  Check in particular:
  - Can a tool result or narrative smuggle digits or ids that the grounded-number rule then
    lets into prose?
  - Can the repair message leak anything beyond public ids?
  - Any path to dispatch a gated issue without a recorded authorization.
  - Revision races on approve/override/reinvestigate.
  - DTO leaks of hidden truth.
  - XSS in the UI.
  - Unbounded inputs or responses.
  - Denial-of-service via report flooding (no rate limit on `POST /reports`?).
- **Output:** `docs/nebius/08_SECURITY_REVIEW.md` with numbered findings: severity, file:line,
  a concrete exploit or failure scenario, and a proposed fix. Mark anything you could not
  confirm as such. Fill your section, commit, then set `READY FOR MERGE`. Docs only; no
  suites needed.

**Round 20g (2026-10-19) — gemini: review the current theme and plan enhancements.** Welcome
back. The user re-enabled you for light tasks. **Start your own watcher** (poll
`git show master:handover.md` every 300 s; act when your Current task row changes; stop
per Watcher control). Work only in `/home/makodev58/nebius-compass-gemini` on branch
`gemini` (`AGENTS.md` rules 10–11); start with `git merge master` and `npm install`.

- **gemini — theme review and enhancement plan (docs only, no code changes).**
  - **Update (main agent, 2026-10-19):** by user direction the theme now follows the
    **Nebius website palette**: navy `#0F2B43`, lime `#E1FE3C`, pale blue-grey surfaces.
    See `docs/design/nebius-theme.md`. Review the app in this new palette. Judge
    consistency with it, and look for places the old indigo look still shows, lime used
    as text, or contrast problems.
  - **Read first:** `docs/design/nebius-theme.md`, `docs/design/modern-light.md`, `docs/design/operational-ui-refinement.md`,
    `frontend/tokens.css`, `frontend/investigation.css`, `project-state/frontend/overview.md`.
  - **Look at the running app.** Start a preview server on **port 3122 only**:
    `NODE_ENV=test COMPASS_HOST=127.0.0.1 COMPASS_PORT=3122
    COMPASS_CONTROL_ROOMS_DATA_ROOT=/tmp/compass-gemini-preview
    COMPASS_EVENT_PLANNER_MODE=force-failure COMPASS_LIVE_COMPASS_MODE=force-failure
    node backend/src/server.mjs`.
    Screenshot it with Playwright (Chromium needs
    `LD_LIBRARY_PATH=/home/makodev58/nebius-tools/libs/usr/lib/x86_64-linux-gnu`) at 375,
    1280 and 1920 px:
    - Live Floor;
    - the Field reports tile (submit a report, e.g. "Station 7 output keeps drifting",
      confirm it, open the investigation);
    - Analytics;
    - Settings → API and Demo;
    - one wall display (`/rooms/plant-1/display/investigation`).

    **Stop the server when done** and check port 3122 is free. Never bind 3000 or 3200.
  - **Write `docs/design/theme-review-2026-10.md`** containing:
    1. What works, briefly.
    2. Numbered issues, each with severity, screen/width, the selector or file:line, the
       screenshot path and a concrete fix (token, CSS rule or markup change). Look for
       contrast (WCAG AA), hierarchy, density, consistency between the new Field reports tile
       and older tiles, phone usability, focus states and visual noise.
    3. An enhancement plan of 5–10 items, ordered by value/effort. Mark which are CSS-only.
       Keep the existing modern light direction: no new fonts, frameworks or CDNs (the app
       must work offline).
  - Commit the screenshots you reference under `docs/design/theme-review-2026-10/`. Keep
    them few and compressed, under 3 MB total.
  - Fill your `## gemini` section, commit to `gemini` and set `READY FOR MERGE`. No suites
    needed (docs and images only); say so.
  - **Do not touch:** `frontend/`, `backend/`, `e2e/`, `handover.md` outside your section,
    `backend/data/`, other worktrees. No live provider calls.

**Round 21 (2026-10-19).** Start with `git merge master`; keep your watchers.

- **codex — fix `docs/nebius/08_SECURITY_REVIEW.md` findings 1 (partial), 2, 3, 4, 5, 6, 7,
  8 and 10.** You own `investigator.mjs` and `prompts/investigator.mjs` again this round.
  Ports 3021/3121.
  - **#1, partial, no login yet:** room mutations accept only `Content-Type:
    application/json` and reject a cross-origin `Origin` (allow same-origin and a missing
    Origin for CLI/tests); return 403/415 with codes. Real authentication and a recorded
    authenticated actor are a user decision, so do not add login yet.
  - **Watch validity (main agent, replay run C):** with the same code, live replay fallbacks
    went from 7/60 to 23/60, and every invalid first answer failed its repair. Tightening
    prose (#3) can raise invalids again. So in the repair turn, tell the model exactly
    which item and field failed (e.g. `fixes[0].rationale: number 288 not allowed`), and
    let rationale prose drop numbers entirely, which is always valid. Report the
    validation-error categories you see in the fixture tests. The main agent re-measures
    live after merge.
  - **#3:** replace my "grounded numbers" rule (`8a76993`). Prose may quote only numbers
    from an **allowlist of numeric metric fields** in tool results (fix-evidence counts,
    case counts, minutes). Exclude narrative, id and timestamp digits. Strip supplied ids
    with token boundaries. Always reject probability/percentage claims (`%`,
    "probability", "chance", "likelihood"). Keep the repair message's allowed-ids echo, and
    make sure it carries public ids only.
  - **#2, #4–#8, #10:** as proposed in the review, with tests: sanitize model-origin trace
    fields and validate the whole public projection before commit; widen the hazard
    lexicon (`spark*`, etc.); block READY with no supporting evidence for the first fix;
    bound report admission (per-room open-report cap and rate limit) so investigations
    can't starve; reclaim closed orphan state; route malformed array entries through
    repair; bound provider response bytes.
  - **Both suites green.** Record a `docs/decisions.md` entry and update `project-state`
    pages. Do not touch `frontend/`, `e2e/` (tell me what changes) or `docs/nebius/`
    except appending a "Status" section to `08_SECURITY_REVIEW.md`. No live calls.

- **gemini — CSS-only theme enhancements from your plan.** Do E1, E2, E4, E6 and E7 as
  proposed. Do E5 too, but in the **Nebius palette**: navy left border and lime focus/hover
  per `docs/design/nebius-theme.md`, not indigo. Also read
  `docs/design/nebius-theme-codex-notes.md`. Skip E3 and E8 for now.
  - **Files:** `frontend/*.css` only. No JS or HTML changes; tell me if one is needed.
    Never use lime as text.
  - **Verify:**
    - `node --test backend/tests/design-tokens-contrast.test.mjs` passes;
    - the full `npm test` passes;
    - the full E2E suite passes on port 3022 with
      `LD_LIBRARY_PATH=/home/makodev58/nebius-tools/libs/usr/lib/x86_64-linux-gnu`.
  - Commit before/after screenshots (at most 6, under 2 MB) in
    `docs/design/theme-review-2026-10/after/`. Stop any server you start.

- **main agent (meanwhile):** security #9 (UI re-investigate for failed approved attempts),
  the authentication decision with the user, and the live replay with provenance.

**Round 22g (2026-10-19) — gemini: wall display and provisional charts.** Good work on
21g. One note for the future: keep phone touch targets at **44px** minimum; I restored the
navigation buttons you reduced to 40px. Start with `git merge master`; keep your watcher.

- **gemini — E3 and E8 from your plan.**
  - **E3:** in `.display-mode` at widths ≥ 1440px, use a layout that avoids very long text
    lines and enlarges type for wall screens, for the Field reports, Staffing, Issues and
    Event feed displays. Check `/rooms/plant-1/display/{investigation,staffing,issues,events}`
    at 1920×1080 and 2560×1440. No horizontal scroll, and the existing
    `display-screens.spec.mjs` must still pass.
  - **E8:** in Analytics, mark provisional (in-progress) periods distinctly from completed
    ones, for example reduced opacity plus a hatched pattern, and add a legend entry. Find
    the class the period charts already put on provisional periods. If none exists and you
    would need JS or HTML, stop and tell me rather than editing JS.
  - **Files:** `frontend/*.css` only. Verify with the contrast test, `npm test` and the full
    E2E suite on port 3022. Commit at most 4 before/after screenshots under
    `docs/design/theme-review-2026-10/after/`. Stop any server you start.

**Round 22 (2026-10-19) — codex: Ask Compass, a grounded Q&A over the room (backend).** The
user wants more features. This one lets central command ask questions in plain language
and get answers cited to real records. Start with `git merge master`; ports 3021/3121; keep
your watcher. Commit in steps, with both suites green.

- **codex — Ask Compass backend.**
  - **Route:** `POST /api/control-rooms/:id/ask` with
    `{ question (≤ 400 chars), context?: { issueId?, investigationId?, responderId? }, expectedRevision? }`
    returns
    `{ answerId, status: READY|DECLINED|FALLBACK, text, citations: [{kind, id}], trace, source, model, reason? }`.
    Also `GET …/ask/:answerId`, and a bounded `askHistory` (last 20) in `/state`. Same JSON
    and Origin guard as other mutations; the call never mutates operational state.
  - **New role `assistant`:** default `nvidia/nemotron-3-super-120b-a12b` / `off`; settings,
    env and timeout like the other roles, with the Settings fieldset added in the existing
    pattern. Usage ledger and budget apply.
  - **Read-only tools, public DTOs only, host-owned `asOf` = now:**
    - `get_issue`;
    - `get_investigation`;
    - `issue_events` (audit/operational events for an issue);
    - `responder_public`;
    - `search_cases`, reusing the investigation tool;
    - `recent_events` (bounded);
    - `analytics_summary` (public analytics numbers).

    ≤ 4 tool steps, ≤ 6 calls, 45 s deadline, ≤ 10 rows / 8 KB per result.
  - **Validation (rules 3 and 4):**
    - every citation must be an id a tool returned in this run;
    - prose may quote numbers only from allowlisted numeric fields, the same rule as your
      round 21 work;
    - reject probability, skill or cause language;
    - the answer must not recommend an action as if approved;
    - one bounded repair, then fallback.
  - **DECLINED:** questions about hidden truth (responder skill, true fault cause,
    effectiveness), or anything asking it to act ("assign…", "approve…"). Code-owned
    patterns decide this before any model call, and the reason is stated.
  - **FALLBACK:** a deterministic answer listing the relevant records the tools found,
    clearly labelled.
  - **Injection:** question text and every narrative are untrusted data. Test injection in
    the question and in retrieved narratives.
  - **Limits:** a per-room rate limit (e.g. 10 per real minute) and history retention
    bounded like investigations.
  - **Offline:** a fixture path; API-free.
  - **Tests:**
    - citation validation;
    - decline patterns;
    - noninterference and canary on every tool, with hidden truth unchanged;
    - number allowlist;
    - repair then fallback;
    - rate limit;
    - never mutates (compare state before and after);
    - the JSON/Origin guard.
  - **Docs:** `project-state` (a new section in `investigation.md` or a new
    `backend/assistant.md`, plus `http-api.md` and `model-providers.md`), `decisions.md`
    and `log.md`.
  - **Do not touch:** `frontend/` beyond the Settings role fieldset (the main agent builds the
    Ask UI against your response shape; state the final field names in your handoff),
    `e2e/` (tell me what to change), `docs/nebius/`, `backend/data/`, port 3200. No live
    calls.

**Round 23g (2026-10-19) — gemini: fresh-clone judge walkthrough (docs only).** Judges will
clone the public repo and follow the README. Find every place that breaks or confuses them.
Start with `git merge master`; keep your watcher.

- **gemini.**
  - In a scratch directory inside your worktree's ignored `.cache/` (for example
    `.cache/judge-clone`), run `git clone /home/makodev58/nebius-compass judge-clone`
    (that is master) and follow `README.md` **exactly as written**, from "Run locally"
    through "Verification":
    - `npm ci`;
    - the optional month-backed run;
    - `npm test`;
    - the E2E command, on **your port 3022**.

    Use **no** Nebius key, so everything falls back, and no live calls.
  - With the app running from that clone (bind it to port 3122, not 3000), walk the judge
    testing steps in `docs/nebius/06_SUBMISSION_DRAFT.md` and note what happens without a
    key.
  - **Write `docs/nebius/09_JUDGE_WALKTHROUGH.md`.** Number every step you ran, with the
    exact command, what happened, time taken, and any error text. Then add numbered issues,
    each with severity, the README or draft line, and exact replacement text. Also say what
    a judge sees when no Nebius key is set (the labelled deterministic paths): is it clear?
  - Stop every server you start, free ports 3022/3122, and delete the clone when done.
    Commit only the new doc and your section, and set `READY FOR MERGE`. No suites needed
    for the docs commit.
  - **Do not touch** any other files.

**Round 23 (2026-10-19) — codex: Ask Compass evaluation harness.** Welcome back. The main agent
finished round 22 for you (see the merge log); read `backend/src/assistant.mjs` first. Start with
`git merge master`; ports 3021/3121; keep your watcher.

- **codex.**
  - **Scenarios.** Write `fixtures/assistant/scenarios.json`, labelled synthetic: about 20
    questions with expected `status` (READY / DECLINED / FALLBACK) and constraints. Cover:
    - why an issue was dispatched to a responder;
    - what failed on a station;
    - room workload;
    - a question that names an unknown id;
    - hidden-truth asks ("how skilled is…", "what really caused…");
    - action asks ("assign…", "approve…");
    - injection in the question and in a retrieved narrative;
    - a question needing a number;
    - a probability ask;
    - an empty or over-long question;
    - provider failure and timeout.

    You may create `fixtures/assistant/`.
  - **Harness.** `npm run eval:ask -- --mode fixture|live` (`scripts/eval-ask.mjs`, with
    scoring in `scripts/eval/score.mjs` or a sibling module). Score with denominators:
    - status match;
    - citation validity (every citation returned by a tool in that run);
    - number violations;
    - hidden-truth and action leakage (must be 0);
    - decline precision and recall;
    - fallback, repaired and raw-invalid counts;
    - latency.

    Fixture mode is hermetic and goes into a test. **Live mode is run only by the main
    agent.**
  - **Docs:** a method section in `docs/evaluation.md`, with no live numbers, and `log.md`.
  - **Do not touch:** `frontend/`, `e2e/`, `docs/nebius/`, `backend/data/`, port 3200. No
    live calls.

**Round 24g (2026-10-19) — gemini: review the Ask Compass dialog (docs only).** The dialog exists
now (`frontend/ask-view.js`, header button **Ask Compass**). Start with `git merge master`; restart
your watcher.

- **gemini.** On a preview server on **port 3122** (same command as round 20g, plus
  `COMPASS_ASSISTANT_MODE=force-failure`), try the dialog at 375, 1280 and 1920 px:
  - ask an action question;
  - ask a general question;
  - ask about a selected issue (tick the context box);
  - click every citation type you get;
  - use the keyboard only: Tab, Enter, Esc.

  Write `docs/design/ask-compass-review.md` with numbered issues (severity, screen or width,
  selector, screenshot, concrete CSS or markup fix) and up to 5 CSS-only improvements, in the
  Nebius palette with no lime as text. At most 4 screenshots under
  `docs/design/ask-compass-review/`. Stop the server and check 3122 is free. Commit, then set
  `READY FOR MERGE`. Do not change code.

**Round 37 (2026-10-24) — calibrations for existing live rooms; blocked-checkout link.** Start with `git merge master`.

- **codex.** Existing live rooms have no calibration rows, so the gate blocks every checkout on the deployed app. Add an
  idempotent migration (`backend/src/live-migration.mjs`, like the device migration): when a room has no `calibrations`,
  seed `ATE-1` and `ATE-2` rows with `calibratedAt` at the room's current simulation clock minus 7 days and `dueAt` at the
  clock plus 60 days, using synthetic instrument IDs. Rooms that already have rows are left unchanged. Run the migration
  twice in tests and assert identical output. Add tests that a migrated room checks out a ready cell and that an unmigrated
  room with explicit rows is not altered. Use **port 3021**. Run both suites, update `project-state/backend/`, commit, set
  `READY FOR MERGE`. Do not touch `frontend/` or `e2e/`.
- **gemini.** When a checkout is rejected with `CELL_NOT_READY`, show the readiness reason next to the row and an action
  "Add calibration for ATE-1" that opens the Calibrations form with `cellId` filled and moves focus to its first field.
  The action must not be a button that submits anything. Keep it keyboard-reachable and labelled. E2E in
  `e2e/calibration-link.spec.mjs`. Do not change `backend/`. Use **port 3022**. Run both suites, update `project-state/frontend/`,
  commit, set `READY FOR MERGE`.

**Round 36 (2026-10-24) — enforce the readiness gate server-side; calibration entry.** Start with `git merge master`.

- **codex.** (1) Wire the gate: `backend/src/loadboard-service.mjs` computes `cellReadiness` for the requested cell at the
  simulation clock from `state.calibrations` and passes it to `checkoutBoard`. A non-READY cell returns `REJECTED` with
  `CELL_NOT_READY` (HTTP 200, like other rejections). (2) Add `POST /api/control-rooms/:roomId/calibrations` with body
  `{ calibrationId, cellId, instrumentId, calibratedAt, dueAt }`, validated by `validateCalibrations` and written through the store's
  serialised path (`store.mutate`). Malformed bodies are 400; a conflicting calibration identity is rejected. (3) Seed synthetic
  calibration rows for `ATE-1` and `ATE-2` in both demo rooms, with `dueAt` after the seed clock, so the demo can still check out.
  Tests: gated checkout in the route, the entry route, seeded rooms READY. Offline mode uses the same rules. Use **port 3021**. Run
  both suites, update `project-state/backend/`, commit, set `READY FOR MERGE`. Do not touch `frontend/` or `e2e/`.
- **gemini.** Add a **Calibrations** panel: a table of calibration rows (`calibrationId`, `cellId`, `instrumentId`, `calibratedAt`,
  `dueAt`, `state`) and an add form with those fields. Validate dates client-side and show server reasons as plain text. Stub-first
  against `GET /api/control-rooms/:roomId/calibrations` → `{ roomId, asOf, calibrations }` and `POST` with the body above, returning
  `{ decision, reasons }`. Keyboard-reachable, live region for the result, 375 px and 1280 px no-horizontal-scroll checks. E2E in
  `e2e/calibrations.spec.mjs`. Do not change `backend/`. Use **port 3022**. Run both suites, update `project-state/frontend/`,
  commit, set `READY FOR MERGE`.

**Round 35 (2026-10-24) — calibration readiness gate (F8 slice 1).** Start with `git merge master`.

- **codex.** Implement `docs/design/calibration-readiness-slice-1.md` (approved for build). Add the pure function
  `cellReadiness(calibrations, cellId, at)` in `backend/src/calibration-readiness.mjs` (sections 2–3), and the optional
  `readiness` argument to `checkoutBoard` in `backend/src/loadboard-checkout.mjs` that adds `CELL_NOT_READY` (section 4). Keep
  the no-argument behaviour identical. Add `backend/tests/calibration-readiness.test.mjs` for section 5. Expose
  `GET /api/control-rooms/:roomId/cell-readiness` → `{ roomId, asOf, cells: [{ cellId, readiness, reasons, instruments }] }`
  for the cells in the room's calibration rows (read-only, using the room's simulation clock as `at`). Use **port 3021**. Run both
  suites, update `project-state/backend/`, commit, set `READY FOR MERGE`. Do not touch `frontend/` or `e2e/`.
- **gemini.** Add a readiness chip per ATE setup on the Loadboards panel: `READY` (plain), `EXPIRED` and `NO_CALIBRATION`
  (highlighted, with the reason text). A board whose cell is not READY shows its check-out action as unavailable with the
  reason. Stub-first against the response shape above. Keep text contrast at least 4.5:1 and all chips keyboard-reachable
  (no colour-only meaning). E2E in `e2e/cell-readiness.spec.mjs`. Do not change `backend/`. Use **port 3022**. Run both
  suites, update `project-state/frontend/`, commit, set `READY FOR MERGE`.

**Round 34 (2026-10-24) — handler jam episodes (F4 slice 1).** Start with `git merge master`.

- **codex.** Implement `docs/design/handler-jam-episodes-slice-1.md` (approved for build). Build a pure module
  `backend/src/handler-jam-episodes.mjs` with the function in sections 3–6 (episodes, stopped time, planned-stop exclusion,
  reference-rate deficit gate, output shape). No I/O, clock, store, or imports from simulation, responder or analytics. Add
  `backend/tests/handler-jam-episodes.test.mjs` for every item in section 7, including the no-causal-language check. Use
  **port 3021**. Run both suites, update `project-state/backend/`, commit, set `READY FOR MERGE`. Do not touch `frontend/` or `e2e/`.
- **gemini.** Build a **Handler episodes** panel in the workspace, registered like the others. It lists each episode with
  `episodeId`, `reasonCode`, `jamCount`, `unplannedStoppedMinutes`, `classification` (PATTERN or SINGLE_EVENT), the alarm IDs,
  and a deficit line. The deficit reads "Estimate: N units" with its basis when `deficitStatus` is ESTIMATE, and "Suppressed:" with
  the reasons when SUPPRESSED. Never call it measured. Stub-first against the response shape
  `{ stationId, window, episodes, excludedAlarms, unplannedStoppedMinutes, plannedStopMinutes, runningMinutes, acceptedUnitsPerRunningMinute, deficitStatus, estimatedDeficitUnits, deficitBasis, suppressionReasons }`
  (the route `GET /api/control-rooms/:roomId/handler-episodes` comes in a later codex round). Include 375 px and 1280 px no-horizontal-scroll checks,
  loading, empty and error states. E2E in `e2e/handler-episodes.spec.mjs`. Do not change `backend/`. Use **port 3022**. Run both
  suites, update `project-state/frontend/`, commit, set `READY FOR MERGE`.

**Round 33 (2026-10-24) — loadboard checkout routes (F3 slice 2) and check-out UI.** Start with `git merge master`.

- **codex.** Add two routes to `backend/src/server.mjs` that call the pure module (`loadboard-checkout.mjs`) through the store's
  serialised write path (the same path existing mutations use; no direct file writes):
  `POST /api/control-rooms/:roomId/loadboards/checkout` with body `{ requestId, boardId, cellId, programRevision }`, and
  `POST /api/control-rooms/:roomId/loadboards/release` with body `{ reservationId, cellId }`. `requestedAt` and `releasedAt` come from
  the simulation clock, never the client. Responses: `{ decision, reasons, reservation }`; a `REJECTED` decision is HTTP 200
  with the reasons, and a malformed body is 400. Tests: two concurrent checkouts of one board yield one `ALLOCATED`; a retried
  `requestId` does not create a second reservation; release with the wrong cell is rejected; the endpoint works in Offline mode
  with the same rules (`AGENTS.md` rule 6). Also add the consumable-obligations read endpoint
  `GET /api/control-rooms/:roomId/consumable-obligations` → `{ roomId, asOf, obligations: [...] }` (rows from slice 2 section 5),
  which gemini's Obligations panel already stubs. Use **port 3021**. Run both suites, update `project-state/backend/`, commit,
  set `READY FOR MERGE`. Do not touch `frontend/` or `e2e/`.
- **gemini.** Add **Check out** (per available board, with a station picker and program picker from its approved programs) and
  **Release** (per held board) actions to the Loadboards panel. Show the returned `reasons` as plain text next to the row, and
  refresh the list after each action. Use stubs for the POST responses that match `{ decision, reasons, reservation }`. Keep the
  actions keyboard-reachable and announce the result in a live region. E2E in `e2e/loadboard-actions.spec.mjs`. Do not change
  `backend/`. Use **port 3022**. Run both suites, update `project-state/frontend/`, commit, set `READY FOR MERGE`.

**Round 32 (2026-10-24) — loadboards endpoint and obligations panel.** Start with `git merge master`.

- **codex (after round 31 is READY).** Expose the read-only `GET /api/control-rooms/:roomId/loadboards` in
  `backend/src/server.mjs` through a pure builder `backend/src/loadboards.mjs`. Response:
  `{ roomId, asOf, boards: [{ boardId, revision, condition, cellId, approvedPrograms, heldBy }] }`. `heldBy` is the
  reservation ID of the `HELD` row or `null`. Reads only; no store writes. Include hermetic tests (empty room, held board,
  unknown room → existing error shape). Use **port 3021**. Run both suites, update `project-state/backend/`, commit,
  set `READY FOR MERGE`.
- **gemini.** Build an **Obligations** panel for the consumable obligations rows from slice 2 (`docs/design/consumable-life-slice-2.md`
  section 5): each row shows `obligationId`, `kind`, `status` (OPEN or CLOSED), `lifecycleId`, `policyId@version`, `openedAt`,
  and `closeReason` when closed. Filter by status. Route stubs use the same shape until codex exposes the endpoint; the
  stub endpoint is `GET /api/control-rooms/:roomId/consumable-obligations`. Also tighten the Loadboards panel: check that
  row actions are keyboard-reachable and that focus is not lost after a filter change. E2E in `e2e/obligations.spec.mjs`.
  Do not change `backend/`. Use **port 3022**. Run both suites, update `project-state/frontend/`, commit, set `READY FOR MERGE`.

**Round 31 (2026-10-24) — consumable obligations (F1 slice 2) and loadboard panel (F3 UI).** Start with `git merge master`.

- **codex.** Implement `docs/design/consumable-life-slice-2.md` (approved for build): the pure reconciler
  `reconcileConsumableObligations` in `backend/src/consumable-life-obligations.mjs`, the strict `consumableObligations`
  room-state shape in `live-schema.mjs`, the deterministic empty-array migration, and the server hook that runs the reconciler
  only when a room's counter readings change. Add hermetic tests for every item in section 6. Use **port 3021**. Run both suites,
  update `project-state/backend/`, commit, set `READY FOR MERGE`. Do not touch `frontend/` or `e2e/`.
- **gemini.** Build a read-only **Loadboards** panel in the workspace, registered like the other panels. It lists each board
  with `boardId`, `revision`, `condition` (SERVICEABLE, UNDER_REPAIR, QUARANTINED), current cell or "In store", and approved
  programs, and it has a search and a condition filter. Use the contract below with route stubs until codex exposes it:
  `GET /api/control-rooms/:roomId/loadboards` → `{ roomId, asOf, boards: [{ boardId, revision, condition, cellId, approvedPrograms, heldBy }] }`,
  where `heldBy` is a reservation ID or `null`. Include 375 px and 1280 px no-horizontal-scroll checks and states (loading, empty, error).
  Put the E2E in `e2e/loadboards.spec.mjs`. Do not change `backend/`. Use **port 3022**. Run both suites, update
  `project-state/frontend/`, commit, set `READY FOR MERGE`.

**Round 30 (2026-10-24) — loadboard checkout slice 1 (F3).** Start with `git merge master`.

- **codex.** Implement `docs/design/loadboard-checkout-slice-1.md` sections 2–5 in a pure module
  `backend/src/loadboard-checkout.mjs` with `checkoutBoard`, `checkoutBatch` and `releaseBoard`. No I/O, clock, store or
  model imports. Add `backend/tests/loadboard-checkout.test.mjs` for every item in section 6. Use **port 3021**. Run both
  suites, add a `project-state/backend/` section and a `log.md` entry, commit, set `READY FOR MERGE`. Do not touch `frontend/` or `e2e/`.
- **gemini (after round 29 is READY).** Harden the Station KPIs E2E in `e2e/station-kpi.spec.mjs` against spec section 5
  of `docs/design/station-kpi-panel.md`: forced endpoint failure shows the error state; filter and window changes update the
  table; the "DERIVED_FROM_UPTIME" label is visible; keyboard-only filter use works. Fix any frontend gap you find. Do not
  change `backend/`. Use **port 3022**. Run both suites, update `project-state/frontend/`, commit, set `READY FOR MERGE`.

**Round 29 (2026-10-24) — next work.** Start with `git merge master`. Codex does round 28 follow-up first (below),
then round 29. Gemini does the same order. Each part ends with its own `READY FOR MERGE`; the main agent merges each part.

- **codex (round 29, after round 28 follow-up is READY).** Consumable life slice 1 (F1). Spec:
  `docs/design/consumable-life-slice-1.md`. Build a pure module `backend/src/consumable-life.mjs`: no I/O, no clock,
  no route, no UI, no store, and no imports from simulation, responder or analytics. Implement sections 2–6 exactly,
  including the status order in section 4 and the `obligationKey`. Add `backend/tests/consumable-life.test.mjs` for every
  item in section 7. Use **port 3021**. Run both suites, add `project-state/backend/` coverage and a `log.md` entry, commit,
  and set `READY FOR MERGE`. Do not touch `frontend/` or `e2e/`.
- **gemini (round 29, after round 28 follow-up is READY).** Phone and desktop audit of the existing panels (staffing,
  investigation, map, issues, events, context, analytics, and the new station KPIs). Check 375 px and 1280 px for
  horizontal scroll, touch targets under 44 px, missing accessible names, and text contrast below 4.5:1. Fix what fails in
  `frontend/`. Put the new checks in `e2e/phone-audit.spec.mjs`. Do not change `backend/`. Use **port 3022**. Run both
  suites, update `project-state/frontend/overview.md` and `log.md`, commit, and set `READY FOR MERGE`.

**Round 28 follow-up (2026-10-24) — device rates (spec section 2 changed on master).** The station rate now belongs to
the device. Read `docs/design/station-kpi-panel.md` sections 1 and 2 again after `git merge master`.

- **codex.** Add `backend/src/device-catalog.mjs` with the 20 devices in `fixtures/station-kpis/device-catalog.json`
  as a module constant (do not read fixtures at runtime). Every equipment row gets `deviceId`; the station
  `ratedUnitsPerHour` comes from that device. Migration: existing rooms use index = hash(stationId) mod 20, and the
  migration stays deterministic. The response station carries `deviceId`. Update the tests and the project-state
  pages. Make no other contract change. Use **port 3021**. Set `READY FOR MERGE`.
- **gemini.** Show on each station card the ATE setup name, `deviceId` and the device's rated units per hour (for
  example "ATE 1 · SR1260 · 1,260 UPH"). Make the route stubs and the panel's E2E use `fixtures/station-kpis/response-12h.json`
  (`ATE 1`, `SR1260`, 1,260 UPH, `ATE 2`, `PM0096`, 96 UPH). Do not change `backend/`. Use **port 3022**. Set `READY FOR MERGE`.

**Round 28 (2026-10-24) — station KPI panel (spec: `docs/design/station-kpi-panel.md`).** Read the spec
first; it is the contract. Start with `git merge master` (protocol step 1).

- **codex (backend).** Implement section 2 and 3 of the spec: add `ratedUnitsPerHour` to equipment with
  validation and a deterministic migration (hash of station ID, range 40–120) for both rooms; write
  `backend/src/station-kpis.mjs` as a pure function over the same facts analytics uses (reuse the downtime union
  rule from `analytics-service.mjs`; do not copy it); add the `GET /api/control-rooms/:roomId/station-kpis` route
  with the query validation and error codes in section 3; hermetic tests for the acceptance list in section 5. The
  endpoint must not advance or change the simulation. Use **port 3021** for E2E. Run both suites, update
  `project-state/backend/` pages and `log.md`, commit, and set `READY FOR MERGE`. Do not touch `frontend/` or `e2e/`.
- **gemini (frontend).** Build the Station KPIs panel from section 1 of the spec: a workspace tile registered
  like the other panels, the station filter (search, All, None), the window controls (Latest, Previous, Next, and a
  select of recent windows), the bucket table or cards, the totals row, the "DERIVED_FROM_UPTIME" label, and the
  loading, empty and error states. Until codex lands the endpoint, use route stubs that return the exact shape in
  section 3. Write `e2e/station-kpi.spec.mjs` only for the panel's own behaviour; main will extend it at merge.
  Phone (375 px) and desktop (1280 px) must have no horizontal scroll. Use **port 3022** for E2E. Run both suites,
  update `project-state/frontend/overview.md` and `log.md`, commit, and set `READY FOR MERGE`. Do not change `backend/`.

**Round 27 (2026-10-21) — codex: fix Ask Compass decline causes and grounding gaps.** Start with
`git merge master` (protocol step 1). Source: your `docs/product/ask-compass-decline-findings.md`, which
the main agent accepted and merged. Decisions main has made:

- Fix the input gate first: stop `caus\w*`, `stop` and `transfer` from matching public descriptive
  questions, while keeping true hidden-truth requests (skill, hidden causes, probabilities) declined.
  Update the tests and the eval scenarios; do not loosen a true hidden-truth test to make a case pass.
- Give each decline a specific reason in the user-visible text (hidden truth, action request, outside
  the public record boundary), instead of one generic line.
- For the "best approach" gap: route procedure-advice questions to recorded investigation/catalog/decision
  evidence, and decline advice that is not grounded in that evidence.
- Ground assignment, duration and event-absence claims in code-owned evidence. Add a validator check that
  rejects a claim the cited records do not support, and add a test for the status-summary case you reproduced.
- Repair shape (open from Ask live run 2026-10-20): the model adds fields beyond `text` and `citations`.
  Keep the strict `exact` check. Tighten the instruction to the model instead of relaxing the check, and
  add a fixture test that a repaired answer with extra fields is rejected.
- Do not change UI layout (gemini owns the status bar in round 27) and do not change the model provider or
  make live calls. Use **port 3021** for E2E. Run both suites, update `backend/assistant.md` and
  `project-state/log.md`, commit, and set `READY FOR MERGE`.

**Round 27 (2026-10-21) — gemini: accessibility pass on the console status bar and tile controls.** Start with
`git merge master`. Source: `frontend/index.html`, `frontend/tiling.js`, `frontend/layout.css`, and
`e2e/status-bar.spec.mjs`, `e2e/tiling.spec.mjs` (both added on 2026-10-21).

- Check the status bar (room, clock, run state, speed, last poll result) and the tile header buttons,
  including **Open in window**, at 375px and 1280px. Fix what fails: missing accessible names, a status
  that is only colour, touch targets under 44px on phone width, text contrast below 4.5:1, and any
  horizontal scroll.
- Make the last poll result announced to assistive tech without a flood of updates (a polite live region
  that changes only when the result changes).
- CSS, HTML attributes and small JS for the live region only. Do not change backend code or the
  `ask-compass` UI. Extend the two E2E specs for each behaviour you change.
- Use **port 3022** for E2E. Run both suites, update `project-state/frontend/overview.md` and
  `project-state/log.md`, commit, and set `READY FOR MERGE`.

**Round 26 (2026-10-20) — codex: brainstorm ATE/FT/WS features (docs only).** Start with
`git merge master`; restart your watcher. The product is used at a semiconductor test facility with
ATE testers and handlers for final test (FT) and probers for wafer sort (WS). FT uses loadboards with
sockets; WS uses probe cards with sockets and probe pins. Compass today handles per-issue responder
assignment, issue priority, and staffing simulation, all with deterministic code owning facts.

- **codex.** Write `docs/product/ate-feature-proposal.md` (new file). Propose candidate features that fit
  Compass's existing model (issues, responders, events, deterministic eligibility and priority, bounded
  model roles, no hidden `ResponderSkill` leakage). For each: the user problem, the equipment and
  consumable it concerns (tester, handler, prober, loadboard, socket, probe card, probe pin, changeover),
  the data it would need, which part is deterministic and which (if any) is a bounded model role, a
  rough size (S/M/L), and the main risk. Cover at least: socket and contactor life and cleaning cadence,
  probe-card and pin planarity or wear alarms, loadboard inventory and checkout, handler jams and
  throughput loss, device changeover scheduling, yield and bin excursions, retest and guardband
  decisions, and calibration or correlation between testers. Add a short section of assumptions to
  confirm with the user, and a ranked top five. Use synthetic, domain-neutral examples only; no real
  customer, device or site data. Docs only: do not change code. Commit, then set `READY FOR MERGE`.

**Round 25 (2026-10-20) — gemini: implement the Ask Compass dialog CSS improvements.** Start with
`git merge master`; restart your watcher. Source: `docs/design/ask-compass-review.md`, §3 (Improvements
1–5) and the matching issues in §2.

- **gemini.** Implement Improvements 1–5 as CSS only, in `frontend/` styles. Keep the
  Nebius palette, no lime as text, and phone width (375px) with no horizontal scroll. Before changing
  anything, check each proposed selector against the current `frontend/` code: the review was written
  against an earlier snapshot, so any selector that no longer matches must be reported, not forced.
  Add or update E2E coverage for the dialog (`e2e/ask-compass.spec.mjs`) for the behaviour you change.
  Use **port 3022** for E2E, and port 3122 for any manual preview (stop it and check the port is free).
  Run both suites (`npm test` and `npm run test:e2e` with the port set), then commit and set
  `READY FOR MERGE`. Do not change backend code, and do not touch `docs/design/`.

### Merge log

- 2026-10-24 — **codex** `7c7e228`/`03036dc` (branch `codex`, round 36) and **gemini** `c01dd96`/`55e7190` (round 36) → merge `ab2d15f`: server-side readiness gate in `loadboard-service.mjs` (checkout rejects with `CELL_NOT_READY`), serialised calibration entry `POST /api/control-rooms/:roomId/calibrations`, and the Calibrations panel. `npm test` 577/577; E2E 149/149 on port 3024. Deployed `ab2d15f`, healthy.
  **Verified on the server:** a checkout to `ATE-1` returns `REJECTED` with `CELL_NOT_READY` (and `BOARD_UNKNOWN` for the smoke board). **Live rooms have no calibration rows**, so every checkout is blocked until calibration rows are entered. Round 37 seeds the rows into existing rooms.
- 2026-10-24 — **codex** `cc24a9d`…`ecc3a03` (branch `codex`, round 35) and **gemini** `f4c4ac2` (round 35) → merge `79655af`, then `59529e4` (main agent test fix): calibration readiness module (`backend/src/calibration-readiness.mjs`), `GET /api/control-rooms/:roomId/cell-readiness`, the optional readiness argument to `checkoutBoard`, and readiness chips with a client-side checkout gate in the Loadboards panel. `npm test` 571/571. E2E 142/142 on port 3024 after the main agent stubbed cell readiness in `e2e/loadboard-actions.spec.mjs` (its flows assume a ready ATE-1). Deployed `59529e4`, healthy; endpoints return 200.
  **Known gap (open):** the server does not yet enforce the readiness gate. `loadboard-service.mjs` calls `checkoutBoard` without readiness, so the API still allows checkout. The UI blocks it. Round 36 wires it in. Live rooms have no calibration rows yet, so `/cell-readiness` returns `cells: []`.
- 2026-10-24 — **codex** `5571332`…`55ab8da` (branch `codex`, round 34) and **gemini** `49251b2`/`0f37215` (round 34) → merge `8b4fa83`: handler jam episodes pure module (`backend/src/handler-jam-episodes.mjs`) and the Handler episodes panel on stubs. `npm test` 559/559; E2E 136/136 on port 3024. Deployed `8b4fa83`, healthy; loadboards, obligations and station-KPI endpoints return 200. The episodes route is not exposed yet (a later codex round).
- 2026-10-24 — **codex** `e4657c4`…`b30da05` (branch `codex`, round 33) and **gemini** `60b8bbd`/`1a43d02` (round 33) → merge `5d8054d`: loadboard checkout and release routes through the serialised store path (`backend/src/loadboard-service.mjs`), the consumable obligations read endpoint, and the check-out and release UI with live-region results. `npm test` 546/546; E2E 127/127 on port 3024. Deployed `5d8054d`, healthy; `/loadboards`, `/consumable-obligations`, `/station-kpis` return 200; an empty checkout body returns 400. Note: the checkout route follows the existing mutation pattern and has no per-user auth (same as `/ask`, `/reports`); see the open auth question in the round 33 notes.
- 2026-10-24 — **codex** `4699195`/`5837170` (branch `codex`, rounds 31–32) → merge: consumable obligations reconciler and room-state rows (`backend/src/consumable-life-obligations.mjs`, `consumable-life-service.mjs`), and the read-only loadboards endpoint `GET /api/control-rooms/:roomId/loadboards` (`backend/src/loadboards.mjs`). `npm test` 535/535.
- 2026-10-24 — **gemini** `0e8cbf7`/`0542bb5` (branch `gemini`, round 32) → merge: Obligations panel (`frontend/obligations-view.js`) on stubs, Loadboards keyboard and focus tightening. Merged with codex as `192b682`. E2E 121/121 on port 3024. Deployed `192b682`, healthy; `/loadboards` and `/station-kpis` return 200 on the server.
- 2026-10-24 — **gemini** `73ce39f` (branch `gemini`, round 31) → merge: read-only Loadboards panel (`frontend/loadboards-view.js`, `frontend/loadboards.css`, `e2e/loadboards.spec.mjs`) on route stubs until the backend endpoint lands. `npm test` 511/511; E2E 112/112 on port 3024. Deployed `73ce39f`, healthy. Note: on the server the panel shows its error state until the endpoint exists.
- 2026-10-24 — **codex** `f8e8871`/`6656163` (branch `codex`, round 30) → merge: loadboard checkout slice 1 (`backend/src/loadboard-checkout.mjs`): `checkoutBoard`, `checkoutBatch`, `releaseBoard`. `npm test` 511/511.
- 2026-10-24 — **gemini** `71f52bd`/`0414970` (branch `gemini`, rounds 29 and 30) → merge: phone and desktop audit (`e2e/phone-audit.spec.mjs`) and Station KPI E2E hardening, live endpoint rendering and keyboard filter fixes. Merged with codex in one merge commit `ffd7eb7`. E2E 105/105 on port 3024. Deployed `ffd7eb7`, healthy; `/station-kpis` returns 200 on the server.
- 2026-10-24 — **claude** `c4e5705`: consumable life slice 2 proposal (`docs/design/consumable-life-slice-2.md`), approved for round 31.
- 2026-10-24 — **codex** `6ba6c9b`/`2f3b834` (branch `codex`, round 28 follow-up and round 29 slice 1) → merge: station KPI rates from the device catalog (`deviceId`, `ratedUnitsPerHour` 1–10,000) and consumable life slice 1 (`backend/src/consumable-life.mjs`). Both in one merge, not separate. `npm test` 497/497; E2E 98/98 on port 3024. Deployed `5f9ce57`, healthy; `/station-kpis` smoke-tested on the server. Seed `backend/seed/investigation-lifecycle.json` regenerated with device fields.
- 2026-10-24 — **gemini** `3bfa611` (branch `gemini`, round 28 follow-up) → merge: ATE and device labels on the station KPI panel. Round 29 audit still open. Log conflict in `project-state/log.md` resolved by keeping both entries.
- 2026-10-24 — **claude** (docs and fixtures, round 28 spec change): station KPI rates moved from station to device. Process is ATE test; stations are ATE setups; devices are alphanumeric semiconductor chips with `ratedUnitsPerHour` 1–10,000 from the synthetic `fixtures/station-kpis/device-catalog.json`. Spec and `response-12h.json` updated (`deviceId` on each station). **codex and gemini: `git merge master` before continuing round 28.**
- 2026-10-23 — **codex** `350c4fc` (impl `3032d36`) → merge (round 27): Ask public-question policy, code-grounded factual claims, strict two-key repair. Handoff archived.
- 2026-10-22 — **gemini** `d37f5c1` (head `61e5514`) → merge (round 27): status bar and tile controls accessibility pass (live region, 44px touch targets, named toolbar controls). Handoff archived.
- 2026-10-21 — **codex** `bff39c0` → merge (round 26 follow-up, investigation): Ask Compass decline causes and grounding gaps, `docs/product/ask-compass-decline-findings.md` (docs only). On master: `npm test` 467/467. Handoff archived.
- 2026-10-20 — **codex** `0eb2139` → merge (round 26): ATE/FT/WS feature proposal, `docs/product/ate-feature-proposal.md` (eight candidates, ranked top five, assumptions to confirm). Docs only. Handoff archived.
- 2026-10-20 — **gemini** `aeafb08` → merge (round 25): Ask Compass dialog CSS improvements 1–5 in `frontend/investigation.css`, with E2E updates. Handoff archived.
- 2026-10-20 — **gemini** `b229ab6` → merge (round 24g): Ask Compass dialog review (`docs/design/ask-compass-review.md`, 4 screenshots; docs only, 5 CSS-only improvements proposed, none applied). The gemini section reports head `c2c4736`; the branch head is `b229ab6`. Handoff archived.
- 2026-10-20 — **codex** `e8e30d3` → merge (round 23): Ask Compass synthetic evaluation harness (`npm run eval:ask -- --mode fixture|live`, 20 scenarios, docs/evaluation.md). Fixture mode is API-free; no live calls were made. On master: `npm test` 466/466, E2E 88/88, fixture CLI exit 0. Open follow-up: Live answer quality needs a separate main-agent review; not run. Handoff archived.
- 2026-10-19 — **codex** `56af715` → merge `fa94df0`: Ask Compass backend (round 22). Codex ran out of credits after `cb2320a`; the main agent finished the uncommitted service work in the codex worktree at the user's request (fixed a test that wrote `backend/data/provider-usage.json`; in-memory `publicSnapshot()`). On master: `npm test` 463/463, E2E 85/85. Deployed. Handoff archived.
- 2026-10-19 — **gemini** `4d7408d` → merge `64eefff`: fresh-clone judge walkthrough (docs). Main agent applied the fixes (UI auto-select, README/draft). On master: `npm test` 450/450, E2E 85/85. Deployed. Handoff archived.
- 2026-10-19 — **gemini** `3927f02` → merge `be5066e`: wall-display layout (≥1440/2200px) and provisional period charts. On master: `npm test` 450/450, E2E 85/85. Deployed. Handoff archived.
- 2026-10-19 — **codex** `a6e06e4` → merge `8c41c9c`: precise repair feedback (exact item/field paths and bounded reasons). `handover.md`/`log.md` conflicts resolved (codex section reset to round 22). On master: `npm test` 450/450, E2E 85/85. Handoff archived.
- 2026-10-19 — **codex** `bcc1cec` → merge `767fd2c`: security fixes #1 (JSON/Origin guard), #2–#8, #10 with 13 security tests. Main agent added the frontend JSON header and a header-free E2E. On master: `npm test` 448/448, E2E 85/85. Deployed; 415/403 verified on the server. Handoff archived.
- 2026-10-19 — **gemini** `28596c8` → merge `8772c74`: CSS theme enhancements E1, E2, E4–E7 in the Nebius palette. Main agent restored 44px phone touch targets. On master: `npm test` 435/435, E2E 84/84. Deployed. Handoff archived.
- 2026-10-19 — **codex** `c301290` → merge `803792b` (security review, 10 findings; theme notes) and **gemini** `51350ec` → merge `7b913e6` (theme review and plan). Docs only. Master was rewound once to drop a user file swept in by `git add -A`; merges redone with named staging. Handoffs archived.
- 2026-10-19 — **codex** `86dd08d` → merge `8234230`: Docker image ships fixtures, dev compose uses `/app/data`, replay pairs carry public source/fallback provenance with per-source rates. `project-state/log.md` conflict kept both. On master: `npm test` 435/435, E2E 83/83. Handoff archived.
- 2026-10-19 — **codex** `a624e64` → merge `5936de9`: public docs factual review (27 findings, `docs/nebius/07_PUBLIC_DOCS_REVIEW.md`). Docs only. The main agent applies the documentation findings; code findings go to round 19. Handoff archived.
- 2026-10-19 — **codex** `4538dfd` → merge `dafe5a2`: deployment-global provider usage ledger, daily budget fallback (`budget-exhausted`), Settings Usage card. Clean merge. On master: `npm test` 431/431, E2E 83/83. Handoff archived.
- 2026-10-19 — **codex** `c9ae284` → merge `d90c3c8`: paired first-fix replay runner and `--replay` CLI (N5 part 2); ESCALATE check consolidated into the validator path. `project-state/log.md` conflict kept both. Main agent fixed a Reset race across E2E specs. On master: `npm test` 421/421, E2E 83/83. Handoff archived.
- 2026-10-19 — **codex** `135b782` → merge `4f6d562`: N3b investigator lifecycle (expiry, supersede, override, safe auto-approval policy, simulated narration, retained analytics, lifecycle dataset, staged month). Clean merge. Main agent added the ESCALATE repair the branch missed. On master: `npm test` 413/413, E2E 81/81. Staged month `backend/seed/investigation-month/` **not adopted** (unattended run fills the queue; existing month stays). Handoff archived.
- 2026-10-19 — **codex** `e0d03a4` → merge `ee9b587`: N3a investigator vertical slice (field reports, hazard/input policy, interpretation ranking, tool loop with validators and deterministic fallback, shared dispatch gate, approval routes, Offline fixtures, eval adapter). Fixture eval 23/24 (SC-13 label was wrong; fixed). `project-state/log.md` conflict kept both. Main agent added real-route E2E and fixed two spec races. On master: `npm test` 394/394, E2E 81/81. **Slice gate passed on 2026-10-19.** Handoff archived.
- 2026-10-19 — **codex** `cf17c4e` → merge `d58113d`: N1b Nebius defaults (watcher moved out of the repo) and N2 investigation contracts — DTOs, public certifications, catalog safety data, case records, narratives, six bounded read-only tools with host-owned `asOf`. Clean merge. Main agent set the ranking default to thinking off (`5bc4016`). On master: `npm test` 374/374, E2E 78/78. Handoff archived.
- 2026-10-19 — **codex** `d3a500b` → merge `b255703` + main agent `1f18284`: N1 Nebius Token Factory provider (round 12): Nebius default, AMD kept, four roles with timeouts, per-provider controls, native/JSON-protocol tool turns, call metadata; main agent added the provider E2E and Nebius labels. `project-state/log.md` conflict kept both. Combined tree tested before merge: `npm test` 356/356, E2E 78/78. Handoff archived.
- 2026-10-19 — **main agent** `claude` → master (fast-forward to `26fe6db`): plan v2, Apache-2.0 licence, 24 investigation scenarios (N5 part 1), Field reports tile on the §3.8 contract with stubbed-route E2E (N4), Chromium libraries moved to `/home/makodev58/nebius-tools`, override/rooms spec race fix. `npm test` 342/342, E2E 78/78 on master.
- 2026-10-19 — **codex** `534a1b1` → merge `f892d3b`: one-pass review of the Nebius plan (round 11), 12 findings, all accepted into plan v2 `a2d8373`. Docs only; `project-state/log.md` append conflict kept both. Handoff archived.
- 2026-10-18 — **codex** `7d74b73` → merge `9aee67d`: journaled live store, copy-on-write drafts, frozen snapshots (round 10). Codex ran out of tokens mid-task; the main agent finished it in the codex worktree at the user's request (16 failing tests fixed, crash-safety tests added). Clean merge. `npm test` 327/327, E2E 71/71. Tick-mutation 50 ms target not met (p95 0.18 s). Handoff archived.
- 2026-10-18 — **codex** `28b0fed` → merge `4e0cfb8`: user-directed operational UI refinements (decision-first staffing, phone workspace, analytics layout) and strict staffing prose `ce2b7c2`. Clean merge. `npm test` 319/319, E2E 71/71. Handoff archived. Round 10 (store performance) still open.
- 2026-10-18 — **codex** `9e82f9e` → merge `a37849a`: overtime recommendations with command-center approval, Staffing tile and display screen, staffing analytics, regenerated month (round 9). Conflicts with the main agent's Pareto screen resolved by keeping both. Main agent fixed the staffing ranking's missing transport on master. `npm test` 316/316, E2E 67/67. Handoff archived.
- 2026-10-18 — **main agent** on master: wall-display screens, Issue Pareto panel, live fix-ranking transport and prose fix, non-blocking Trigger Next Event.
- 2026-10-18 — **codex** `f3b3cbc` → merge `0373037`: hidden fault causes, fix catalog and ranked fix recommendations, fix-enabled month seed (round 8). Clean merge. `npm test` 291/291, E2E 53/53. Handoff archived.
- 2026-10-17 — **codex** `0a1062c` → merge `5cf085a`: factual review of the submission drafts (round 7). Clean merge. Docs only; codex ran `npm test` 276/276, E2E 49/49. Handoff archived.
- 2026-10-17 — **codex** `8ef8ee2` → merge `5db2ad4`: seven-day history retention with per-room archive, bounded `/state`, compact analytic facts; month-long plant-1 seed and archive (round 6). Clean merge. `npm test` 276/276, E2E 49/49. Handoff archived.
- 2026-10-17 — **codex** `af6532d` → merge `781bb42`: offline history generator (round 5). Main agent found and fixed a resolution-stall engine defect the generator exposed (`afc2110`) and withdrew the month seed (built on the defect; a corrected month is 74 MB and too slow). `npm test` 274/274, E2E 48/48. Handoff archived.
- 2026-10-17 — **codex** `1834326` → merge `eee2b80`: separate model per role, ranking vs event planner (round 4). Clean merge. Main agent fixed the planner-only seed effort on master (`b8c570a`). `npm test` 270/270, E2E 48/48. Handoff archived.
- 2026-10-17 — **codex** `6fb0b72` → merge `a2dad5b`: header layout E2E and saved-model check at boot (round 2, reassigned from codebuddy). Clean merge. `npm test` 265/265, E2E 46/46. Handoff archived.
- 2026-10-17 — **main agent** on master: AMD provider controls (limiter, 429 retry, circuit breaker; round 2, was claude's). `npm test` 258/258, E2E 38/38.
- 2026-10-17 — **codex** `ed3af2e` → merge `80aa9e9`: one bounded, revalidated ranking repair and hardened prose prompt (round 2). Clean merge. `npm test` 241/241, E2E 38/38. Handoff archived.
- 2026-10-17 — **gemini** `03780dd` (finished by codex in the gemini worktree after Gemini ran out of tokens) → merge `87b3a77`: modern light theme and local Inter/JetBrains Mono fonts (round 3). Clean merge. On master: `npm test` 234/234, E2E 38/38; `npm run vendor` regenerates the committed files byte-for-byte. Handoff archived. Gemini excluded from tasks from now on (user).
- 2026-10-16 — **codex** `e67c40a` → merge `8e5f211`: Dockview tiling for the desktop Live Floor (round 3). Vendoring reconciled into `scripts/vendor/dockview.mjs`. `npm test` 234/234, E2E 38/38. Handoff archived.
- 2026-10-16 — **codex** `051998d` → merge `08af6b7`: text contrast fix (AA text inks, contrast test) and Analytics period labels (round 2). Append conflicts in `docs/decisions.md` / `project-state/log.md` kept both. `npm test` 232/232, E2E 32/32; `docs/assets` regenerated. Handoff archived.
- 2026-10-16 — **gemini** `0cc8040` → merge `05596b2`: documentation accuracy pass (round 2). `project-state/log.md` conflict resolved by keeping both entries. Handoff archived.
- 2026-10-16 — **codex** `f7358fb` → merge `3576882`: Analytics Engineering print restyle. `project-state/log.md` conflict resolved by keeping both entries. Handoff archived.
- 2026-10-16 — **gemini** `fb7f8a6` → merge `f743437`: product-facing rename to ResponseCompass in docs. Same log conflict, same resolution. Main agent renamed 2 flagged product-meaning occurrences; the rest stay "Compass" (agent). Handoff archived.
- After both merges on master: `npm test` 230/230, E2E 32/32. Main agent then fixed the desktop header in Offline mode (activity text clipped at 1280px; Settings tab scrolled out of sight at 901–1179px) in `layout.css`, and regenerated `docs/assets/*.png` in the new look.

---

## codex

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-24
- **Task:** Round 36: enforce checkout readiness, calibration entry and seeded READY cells in both modes.
- **Head commit:** `7c7e228` (implementation; this handoff committed separately). Synced master to `911fa18` before implementation; progress acknowledgement `a694647` preserved work during watcher reminders.
- **Changes:** Checkout computes cellReadiness from current private rows at the simulation clock inside the serialized transaction; missing/expired cells reject at HTTP 200 with CELL_NOT_READY plus all other failures. Added strict POST calibrations through the shared mutation adapter, canonical UTC dates, append-only new entries and idempotent retries. Conflicting identity/same-instant records return 400 without modifying history. Added explicit read-only GET calibrations to support the assigned panel contract, exposing per-record FUTURE/CURRENT/EXPIRED time validity. Shared independent ATE-1/ATE-2 seed rows are READY at both mode seed clocks in both rooms. Existing persisted rooms are not silently backfilled.
- **Files changed:** calibration-service and shared calibration seed; checkout service, server/runtime adapters and Live/Offline seed constructors; route/readiness tests; deterministic investigation lifecycle fixture (only calibrations field changed); docs/decisions.md and backend wiki/log. No frontend/E2E edits.
- **Verification:** Final `npm test` **577/577**; forced-provider Chromium E2E **142/142** on 3021; focused readiness/route tests **29/29**. Covers real-route missing/exact-expiry gate, entry enabling checkout, concurrent conflicting entries and ordered entry/checkout, malformed bodies/protected markers/headers, identity retry across restart, failed journal rollback/recovery, immutable room-scoped ledger, Offline parity/no providers and both seeded room instances READY. Initial full unit run detected the expected reproducible fixture mismatch after seed extension; regenerated it, proved all other fields unchanged, and the full rerun passed. `git diff --check` clean; port 3021 free; no live API spend/product-data writes.
- **project-state pages updated:** backend/domain-model.md, backend/overview.md, backend/http-api.md, log.md.
- **Risks / follow-ups:** POST result is {decision:RECORDED|UNCHANGED,reasons:[]}; malformed/conflicting facts are 400. Future entries are allowed but do not authorize early checkout. The ledger state describes each row's temporal validity; cell-readiness remains the effective latest-per-instrument decision. Seeds expire normally as simulation time advances; existing rooms need manual entry or an authorized reset. No calibration provisioning migration, automatic renewal or required-instrument configuration is invented. No implementation blocker.
- **Questions for main:** Please review/merge round 36 or record required revisions, then queue the next concrete Codex task per the user's direction to avoid idle cycles. This committed board handoff is the delivery channel; direct messaging is unavailable. Existing watcher left unchanged; no second worker started.

## gemini

- **Status:** IN PROGRESS
- **Updated:** 2026-10-24 20:10 UTC
- **Task:** Round 37: link a blocked checkout to the calibration form (reason, focus move)
- **Head commit:** `80ca933`
- **Changes:** In progress. Linking rejected checkout (rejection `CELL_NOT_READY`) to the Calibrations entry form: displaying the readiness reason next to the loadboard row and an accessible action "Add calibration for <cellId>" that reveals/opens the Calibrations form with cellId pre-filled and moves focus to its first field without auto-submitting. Testing in `e2e/calibration-link.spec.mjs`.
- **Files changed:** in progress
- **Verification:** in progress
- **project-state pages updated:** in progress
- **Risks / follow-ups:** UI navigation between Loadboards and Calibrations panels must work smoothly across both desktop tiled view and mobile phone workspace views.
- **Questions for main:** None. Actively executing Round 37. Watcher remains active.

## codebuddy

- **Status:** IDLE
- **Updated:** —
- **Task:** —
- **Head commit:** —
- **Changes:** —
- **Files changed:** —
- **Verification:** `npm test` — · E2E —
- **project-state pages updated:** —
- **Risks / follow-ups:** —
- **Questions for main:** —

---

## claude

- **Status:** IDLE
- **Updated:** —
- **Task:** —
- **Head commit:** —
- **Changes:** —
- **Files changed:** —
- **Verification:** `npm test` — · E2E —
- **project-state pages updated:** —
- **Risks / follow-ups:** —
- **Questions for main:** —
