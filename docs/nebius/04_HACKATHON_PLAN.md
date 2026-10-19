# ResponseCompass for Nebius x NVIDIA — Hackathon Plan

**Status:** DRAFT v1 for codex review (main agent, 2026-10-19)
**Track:** Best Apps and Agents
**Deadline:** 2026-10-30 10:00 PT = **2026-10-31 01:00 SGT**. Internal code freeze for the
submission build: **2026-10-28 23:59 SGT**; submission form filed by **2026-10-30 12:00 SGT**.
**Inputs:** `01_HACKATHON_BRIEF.md`, `02_OFFICIAL_RULES.md`, `03_CODING_AGENT_GUIDE.md`,
`AGENTS.md` (rules 3 and 4 win over the guide; conflicts go in `docs/decisions.md`).

## 1. Audit summary (guide §3, §13.1)

**Repository facts.** Node.js ≥ 22, no framework: `backend/src/*.mjs` (HTTP server,
simulation, model roles), vanilla-JS frontend in `frontend/` (Dockview tiling, vendored
fonts), `node --test` hermetic suite (~55 files) and Playwright E2E (17 specs). Docker
Compose deployment with an optional Cloudflare Tunnel. Synthetic, domain-neutral data only
(issue classes A/B/C, responders `R-…`, equipment on two floors).

**Provenance.** This repo's first commit `083fcd3` is dated 2026-10-16, inside the
Submission Period (starts 2026-08-26 09:00 PT). It was seeded from
`github.com/e8aura-makodev58/amd-compass` (remote `upstream`, push disabled), which was
built for an AMD hackathon. **Baseline for the Nebius entry = `1e1c69c` (master,
2026-10-19)**: everything after it is Nebius-entry work. We disclose the AMD-era work as
pre-existing even though its commits are also inside the period, because the AMD submission
used it and a judge must not mistake it for Nebius work.

| Capability | State at baseline | Where |
|---|---|---|
| Model provider | AMD Token Factory only, OpenAI-compatible, JSON mode | `model-provider.mjs`, `provider-settings.mjs` |
| Rate limit / 429 retry / circuit breaker | Implemented | `provider-controls.mjs` |
| Incident ingestion | Partial: model-proposed events with short fixed descriptions; **no free-text narrative intake** | `event-planner.mjs` |
| Historical lookup | Partial: aggregate fix evidence per symptom/class/equipment; **no case-level retrieval or citations** | `fix-evidence.mjs` |
| Responder eligibility + ranking | Implemented (deterministic eligibility, model ranks) | `context-engine.mjs`, `agent.mjs` |
| Fix recommendation | Implemented (rank catalog fixes from aggregate evidence) | `fix-ranking.mjs` |
| Overtime with human approval | Implemented | `staffing-*.mjs` |
| Dispatch approval | **Absent**: offers go out automatically; operator can only override | `live-assignment-service.mjs` |
| Safety constraints on actions | **Absent**: catalog has no safety flags/prerequisites | `fix-catalog.mjs` |
| Abstain / escalate | **Absent** (fallback ≠ abstention) | — |
| Tool-using agent | **Absent**: single-shot ranking calls only | — |
| Replay evaluation harness | Partial: `evaluation.mjs` baselines, `measure-amd-models.mjs` validity only | `scripts/` |
| Public repo, LICENSE, HACKATHON_CHANGES | **Absent** | — |

## 2. The significant new feature (guide §2, §13.2)

**Compass Investigator: a Nemotron tool-using incident investigation agent with evidence
citations, safety gating, abstention, and operator-approved dispatch.**

A field report arrives as free text ("line 2 transfer keeps stalling after restart, smells
hot, tried clearing it twice"). Nemotron on Nebius Token Factory investigates it with
read-only tools the application owns, then returns a structured, cited investigation:
classification into the catalog's issue class and symptom, hypotheses tied to case IDs, a
first **safe** corrective action from the catalog with alternatives, and the ranked
eligible responders. Code validates every claim against the tool results. If evidence is
thin, contradictory or unsafe, the agent **abstains or escalates** instead of guessing. The
control room approves, edits, escalates or rejects; the decision and later outcome feed
the audit and the evaluation.

Why it passes Stage One: it is new, user-visible behaviour (narrative intake, multi-step
tool use, citations, safety gate, abstention, dispatch approval, replay evaluation), not a
provider swap; every step runs on NVIDIA Nemotron through Token Factory at runtime; the
deterministic/model boundary the judges score under "Quality of Idea" is the product's
core. Provider migration is a prerequisite, not the claim.

### Model tiering (track text: Ultra for reasoning, Nano/Super for fast calls)

| Role | Default tier | Calls |
|---|---|---|
| Investigator (multi-step tool loop) | Nemotron 3 **Ultra** | 1 per reported incident, ≤ 6 steps |
| Narrative triage (intake normalisation, injection screening) | Nemotron **Nano** | 1 per report |
| Responder / fix / staffing ranking | Nemotron **Super** | existing roles |
| Event planner + synthetic narrative generator | Nemotron **Nano** | existing role + new |

Exact model IDs, context limits, tool-calling and JSON/structured-output support, and the
thinking toggle are **verified live from `GET /v1/models` and probe calls before any ID is
committed** (guide §5). No guessed IDs in code: defaults live in one table in
`model-provider.mjs` filled from the probe, overridable by env and Settings.

## 3. Architecture (guide §4)

```text
Field report (operator form, or simulated report from the narrative generator)
  → intake: length/charset limits, store raw text as untrusted data       [code]
  → triage: Nano → {issueClass?, symptomCode?, equipmentId?, flags}       [model, validated]
  → investigator loop: Ultra + read-only tools                            [model proposes, code executes]
       search_cases · get_case · equipment_history · fix_catalog ·
       fix_evidence · eligible_responders
  → final report: schema + citation + safety + numeric-claim validation   [code]
       fail → one bounded repair → else deterministic investigation / ABSTAIN
  → pending recommendation on the issue: approve · edit · escalate · reject [human]
  → on approve: dispatch the approved responder with the approved fix      [code]
  → outcome from the simulation engine; audit + feedback                    [code]
```

Boundary rules (rules 3 and 4, recorded in `docs/decisions.md`):

- Tools are **read-only**, argument-validated (ids must exist, limits ≤ 10 results, step cap
  6, total deadline), and return only observed facts. No tool exposes `ResponderSkill`,
  the hidden fault cause, or fix effectiveness; the packet scanner from round 8 runs on every
  tool result and every model message.
- The model may only cite case IDs that a tool returned in this run, recommend fix IDs from
  the issue class's catalog, and name responders from `eligible_responders`. Prose carries
  no digits except supplied IDs (existing rule). Confidence is a **categorical evidence
  grade** computed by code (`STRONG` / `MODERATE` / `THIN` / `NONE` from case counts and
  agreement), never a model-reported percentage.
- **Safety gate (new, code-owned):** each catalog fix gains `prerequisites` and
  `safetyClass` (`ROUTINE` / `ISOLATION_REQUIRED` / `SPECIALIST_ONLY`). Code rejects a
  recommendation whose first action is `SPECIALIST_ONLY` for a non-qualified responder, and
  narrative flags (heat, smoke, injury, "bypass") force `ESCALATE`. Safety data is public
  procedure data, not outcome truth.
- **Abstention (code-owned thresholds):** `ABSTAIN` when classification is ambiguous
  (triage and investigator disagree, or no catalog symptom matches), evidence grade `NONE`,
  or no eligible responder; `ESCALATE` on safety flags or prompt-injection detection. The
  model may *propose* abstention; code may *force* it; code never lets a low-evidence
  recommendation through as confident.
- **Prompt injection:** narratives are passed as quoted data in a dedicated field, tools
  never execute narrative content, and output validation is the real contract.
- **Human authority:** reported incidents never auto-dispatch. Room policy
  `investigationApproval: OPERATOR` (default) | `AUTO_APPROVE_SAFE` (only for the history
  generator and an explicit demo toggle; audited, labelled). Overtime stays on the round 9
  approval path.
- **Fallback:** provider down → deterministic investigation (lexical case match + existing
  fix evidence + existing responder baseline), clearly labelled "deterministic", and still
  subject to approval. Dispatch never stops.

### New data

- **Case records** (`HistoricalCase`): derived by code from resolved issues in history
  (+ archive compact facts): `caseId` (stable `CASE-<issueId>`), equipment, class, symptom
  code, report narrative, fixes tried in order, outcome, minutes, timestamps. Legacy issues
  without narratives get a code-generated templated narrative, marked as such.
- **Narratives:** new issues carry a `reportNarrative` (≤ 600 chars). Live: the Nano
  narrative generator writes it from the **observable** symptom, equipment and recent
  context only (never the hidden cause); validator rejects leaked catalog cause text.
  Offline/history generator: seeded templates with noise (misleading keywords, typos,
  omissions).
- **Investigation record** on the issue: triage, tool-call trace (tool, args, result ids,
  ms), final report, validator results, evidence grade, decision (`APPROVED` /
  `EDITED` / `ESCALATED` / `REJECTED` / `EXPIRED`), operator, timestamps, model id, tokens,
  latency, source (`nebius-live` / `fixture` / `deterministic`).

### API (contract for parallel frontend work)

- `POST /api/control-rooms/:id/reports` `{ equipmentId?, narrative, reporter? }` →
  `{ issueId, investigationId }` (creates the issue, enqueues investigation in the agent lane).
- `GET /state` gains bounded `investigations` (open + recent 20) with the record above
  minus raw tool payloads; `GET /api/control-rooms/:id/investigations/:invId` returns the
  full trace.
- `POST …/investigations/:invId/approve` `{ responderId, fixId, expectedRevision }`,
  `/escalate` `{ reason }`, `/reject` `{ reason }`, `/feedback` `{ useful: bool, note? }`.
  Stale revision → 409 like the override route.

### UI

- **Report incident** form (header button + phone layout).
- New Dockview tile **Investigation**: narrative (as quoted untrusted text), triage chips,
  step-by-step tool trace, hypotheses with clickable case IDs (opens the case record),
  recommended first action + alternatives with safety class, evidence grade, responder
  ranking, provider badge (model id, latency, tokens, live/fixture/deterministic), and
  Approve / Edit / Escalate / Reject. ABSTAIN and ESCALATE render as first-class outcomes.
  Display screen `/rooms/:id/display/investigation`. 375 px, 1280 px, 1920×1080.
- Event feed and audit trail entries for every step; Analytics: investigations by outcome,
  approval vs override rate, abstention rate, first-time-fix rate investigator vs baseline
  (thin-sample rule).

## 4. Evaluation (guide §8)

`npm run eval:investigator` (`scripts/eval-investigator.mjs`), outside `npm test`:

- **Scenario set** (`fixtures/investigation/scenarios.json`, ~24 synthetic reports with
  expected behaviour): historical analog, misleading keyword, missing record, contradictory
  cases, conflicting shift, unqualified responder, overtime required, unsafe action
  requested, safety-flag narrative, prompt injection, empty/garbled narrative, provider
  outage.
- **Counterfactual replay:** a held-out week of the seeded month (cases after the split are
  hidden from the tools). For each held-out issue, the investigator's approved-by-policy
  first fix runs through the deterministic engine on a cloned seed; compare first-time-fix
  rate and minutes with the frequency baseline and the existing deterministic fix order.
  Hidden truth is used only by the engine, never by the scorer's inputs to the model.
- Metrics: classification agreement with the observable symptom code, citation validity
  (must be 100 %), safety-gate violations (must be 0), abstention precision/recall on
  scenarios labelled "should abstain", fallback rate, latency p50/p95, tokens per
  investigation. Modes: `--mode fixture` (CI, recorded Nemotron responses) and
  `--mode live` (main agent only). Results go to `docs/EVALUATION.md` with exact run
  commands, sample sizes and limitations. No time-saved or business-outcome claims.

## 5. Work packages and owners

Codex owns backend packages; the main agent owns live/provider verification, UI that
consumes the agreed API, evaluation runs and submission. File ownership is exclusive per
round to avoid conflicts.

| # | Package | Owner | Depends on | Target (SGT) |
|---|---|---|---|---|
| N0 | Live Nebius probe: models, IDs, tool calling, JSON mode, thinking toggle, limits; `docs/nebius/05_TOKEN_FACTORY_FACTS.md` | main | Nebius key | 10-20 |
| N0b | `docs/BASELINE_AND_CHANGES.md`, provenance, decisions entry, IP/licence check | main | — | 10-20 |
| N1 | Nebius provider: `PROVIDER_IDS` gains `nebius` (default); `NEBIUS_*` env; per-provider controls config; model discovery; role table incl. `investigator` and `triage`; reasoning toggle; tool-call support in `callChatCompletion` (`tools`, `tool_calls`) behind a capability flag with a JSON-protocol fallback; metadata (model, latency, tokens) returned to callers; AMD kept as a selectable provider | codex | N0 facts | 10-21 |
| N2 | Case records + read-only tool layer + safety fields in catalog + narrative field + migration + history-generator narratives | codex | N1 merged | 10-23 |
| N3 | Investigator loop, triage, validators, evidence grade, abstention, deterministic fallback, approval state machine, routes, lane integration, Offline fixtures | codex | N2 | 10-25 |
| N4 | Report form, Investigation tile, display screen, feed/audit/analytics UI, E2E with forced failure | main | API contract (§3); stubs until N3 | 10-25 |
| N5 | Scenario fixtures + eval harness + counterfactual replay | main (harness), codex (scenario tests in `npm test`) | N3 | 10-26 |
| N6 | Live measurement on Nebius, prompt/limit tuning, regenerate month seed with narratives + investigations (< 20 MB per file) | main + codex (seed) | N3, N5 | 10-27 |
| N7 | Public repo (new `responsecompass-nebius`, history preserved), LICENSE (Apache-2.0), README (Nebius/NVIDIA usage), `HACKATHON_CHANGES.md`, `docs/ARCHITECTURE.md`, `EVALUATION.md`, `DEMO_SCRIPT.md`, secret scan of history | main; codex reviews | N6 | 10-28 |
| N8 | Hosted demo (Docker + Cloudflare Tunnel, separate project/port from the AMD app on 3200), free access through 2026-12-15, idle auto-pause and per-visitor token budget | main | N6 | 10-28 |
| N9 | Demo video < 3 min (YouTube), submission form text, Nebius/NVIDIA feedback, pre-existing disclosure | main + user | N7, N8 | 10-30 |

Codex review rounds: plan (now), N7 docs, final pre-submission checklist.

### Acceptance criteria

- N1: hermetic tests with fake fetch for Nebius request shape, tool-call parse, metadata,
  provider selection and migration of AMD-era settings files; one main-agent live call
  per role returns validated output; `npm test` stays network-free.
- N2: no hidden data in any tool result or packet (scanner test over every tool); case ids
  stable across reload/archive; archived/unarchived equality extended.
- N3: tests for each scenario class in §4 using fixtures; invalid citation, unknown fix,
  unsafe first action, digits in prose, step-cap overrun and deadline all rejected; no
  path dispatches a reported incident without an approval record; restart-safe pending
  approvals; lane never holds the clock.
- N4: E2E: report → deterministic investigation (forced provider failure) → approve →
  dispatch visible in feed and audit; ABSTAIN renders; display screen renders; 375/1280.
- N5/N6: eval report reproducible from one command per mode; live run ≥ 20 scenarios and
  ≥ 50 held-out replays with honest numbers.
- N7–N9: every item in guide §11 checked with evidence links.

## 6. Risks and blockers (guide §13.4)

| Risk | Mitigation / owner |
|---|---|
| **No Nebius API key in this environment** (blocks N0, N6, live demo) | **User**: provide key as a file (mode 600) outside git; main agent only. |
| **IP ownership:** `AGENTS.md` rule 8 says Compass is built for real use at the user's company; rules require sole ownership and no employer claim | **User** must confirm the right to publish under Apache-2.0, or we publish a cleaned fork without company-specific material. Blocks N7. |
| Same project also entered in the AMD hackathon | **User** checks the AMD event's exclusivity terms; we disclose the AMD-era baseline openly (§1). |
| Public GitHub repo: `gh` not logged in | **User**: `! gh auth login`, or creates the empty repo. |
| Nemotron Ultra latency/cost too high for an interactive loop | Step cap, Super fallback tier for the investigator, cached tool results, measured in N0/N6. |
| Tool calling unsupported or flaky on the chosen model | JSON "next action" protocol on the same loop (N1 flag); decided from N0 facts. |
| Free public demo burns credits | Idle auto-pause (exists), per-room daily token budget, Offline mode default for visitors with a Live toggle; fixture replay for the video's backup. |
| Scope creep | Cut order if late: analytics extras → display screen → triage role (Ultra does it) → edit-approval (keep approve/reject/escalate). Never cut: live Nemotron investigation, citations validation, abstention, approval, eval. |

## 7. Coordination

- Assignments live in `handover.md` on master; codex runs its own watcher (300 s) on
  `git show master:handover.md`; the main agent's watcher (300 s) polls codex's branch for
  `READY FOR MERGE` / `BLOCKED`.
- Ports: codex 3021/3121, main 3024/3124. No one binds 3000 or 3200.
- No live provider calls in worker worktrees; the main agent runs every live check.
- Every merge: both suites on master, `project-state/` and `log.md` updated.
