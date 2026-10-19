# ResponseCompass for Nebius x NVIDIA — Hackathon Plan

**Status:** v2 (main agent, 2026-10-19). Revised from codex's review
(`04_HACKATHON_PLAN_REVIEW.md`, findings R1–R12, all accepted); each change cites its finding.
**Track:** Best Apps and Agents.
**Deadline:** 2026-10-30 10:00 PT = **2026-10-31 01:00 SGT**. Submission-build cutoff
**2026-10-28 23:59 SGT**; form filed by **2026-10-30 12:00 SGT**. The cutoff fixes what the
submission shows. It does not freeze product development (`AGENTS.md` rule 8) (R12).
**Inputs:** `01_HACKATHON_BRIEF.md`, `02_OFFICIAL_RULES.md` (a transcription; the live rules
page is authoritative), `03_CODING_AGENT_GUIDE.md`, `AGENTS.md`. Rules 3 and 4 win over
the guide, and every conflict goes in `docs/decisions.md`.

## 1. Audit summary

**Repository facts.** Node.js ≥ 22, no framework: `backend/src/*.mjs` (HTTP server,
simulation, model roles) and a vanilla-JS frontend in `frontend/` (Dockview tiling, vendored
fonts). Tests: `node --test` over 54 files in `backend/tests/` (support files included) and
Playwright over 17 files in `e2e/`. Docker Compose with an optional Cloudflare Tunnel.
Synthetic, domain-neutral data: issue classes A/B/C, responders `R-…`, equipment on
**three** floors (`context-engine.mjs:20–21`) (R12).

**Provenance.** Root commit `083fcd3` (2026-10-16), seeded from
`github.com/e8aura-makodev58/amd-compass` (remote `upstream`, push disabled), which was built
for an AMD hackathon. **Nebius baseline = `1e1c69c`.** We disclose the AMD-era work as
pre-existing. Whether any public remote exists is **unverified** until an authorised
`gh` check. Details: `docs/BASELINE_AND_CHANGES.md`.

| Capability | State at baseline | Where |
|---|---|---|
| Model provider | AMD Token Factory only, OpenAI-compatible, JSON mode | `model-provider.mjs`, `provider-settings.mjs` |
| Rate limit / 429 retry / circuit breaker | Implemented | `provider-controls.mjs` |
| Incident narratives | Partial: the event planner already generates bounded symptom/action prose (`event-planner.mjs:17`). **Absent:** operator free-text intake and investigation (R12) | `event-planner.mjs` |
| Historical lookup | Partial: aggregate fix evidence per symptom/class/equipment. **No case-level retrieval or citations** | `fix-evidence.mjs` |
| Responder eligibility | Eligibility = **availability only** (`context-engine.mjs:52–54`). No certifications (R5, R12) | `context-engine.mjs` |
| Responder ranking | Implemented (model ranks the eligible set) | `agent.mjs` |
| Fix recommendation | Implemented (ranks catalog fixes from aggregate evidence) | `fix-ranking.mjs` |
| Overtime with human approval | Implemented | `staffing-*.mjs` |
| Dispatch approval | **Absent**: offers go out automatically, and the operator can only override | `live-assignment-service.mjs` |
| Action safety data | **Absent**: catalog rows are `id/title/steps` only (`fix-catalog.mjs:29–40`) | `fix-catalog.mjs` |
| Abstain / escalate | **Absent**. A fallback is not an abstention | — |
| Tool-using agent | **Absent**: single-shot ranking calls only | — |
| Evaluation | Partial: `evaluation.mjs:41–91` is a deterministic assignment soak/baseline comparison, not a fix counterfactual; `measure-amd-models.mjs` checks validity only (R12) | `backend/src/evaluation.mjs`, `scripts/` |
| LICENSE | Added 2026-10-19 (Apache-2.0, ownership confirmed by the user) | `LICENSE` |
| HACKATHON_CHANGES, public README sections | **Absent** | — |

## 2. The significant new feature

**Compass Investigator.** A Nemotron tool-using investigation of free-text field reports,
with evidence citations, a code-owned safety gate, abstention, and operator-approved dispatch.

A field report arrives as untrusted text. Code resolves what it can (equipment, priority,
allowed interpretations). Nemotron on Nebius Token Factory investigates with read-only,
allowlisted tools and returns a structured investigation:
- the supplied interpretation options, ranked;
- observable hypotheses with evidence references;
- the catalog fixes, ranked, with their procedure text quoted verbatim;
- the eligible, qualified responders, ranked.

Code validates the output, applies safety and abstention rules, and the operator approves,
escalates or rejects. Nothing is dispatched for a field report without an approval record.

**Why it is meant to satisfy Stage One** (the judges decide) (R12):
- It is new user-visible behaviour: intake, multi-step tool use, citations, safety, abstention, approval and evaluation.
- The investigation, ranking and explanation steps run on NVIDIA Nemotron through Token Factory at runtime.
- Validators and the deterministic fallback are application code. We say so plainly: we do not claim that "every step runs on NVIDIA".

### Model tiering

| Role | Default tier | Calls per use |
|---|---|---|
| Investigator (tool loop) | Nemotron 3 **Ultra** (Super if N0 shows Ultra too slow) | ≤ 6 tool steps + 1 final + 1 repair = **≤ 8 inference calls**, one shared deadline (§3.6) |
| Responder / fix / staffing ranking, interpretation ranking | Nemotron **Super** | existing roles, 1 call + ≤ 1 repair |
| Event planner, simulated narrative writer | Nemotron **Nano** | existing role + new |

There is no separate Nano "triage" role. Hazard and injection screening are code-owned
(§3.4), and interpretation ranking is a Super ranking call (R5, R8). Model IDs, licences, context
and rate limits, prices, tool-calling and structured-output support, and the thinking toggle
come from **official Nebius documentation plus live `/v1/models` and probe calls**, recorded
with links in `docs/nebius/05_TOKEN_FACTORY_FACTS.md` (N0) before any default is committed
(R11). Until then, defaults are env-required, never guessed.

## 3. Contracts (frozen before N2; codex owns their code, main consumes them)

### 3.1 Authority over facts (R1)

- **Operator field report** → a persisted `FieldReport` (`FR-…`, status `UNRESOLVED`). It is
  **not** an issue yet. Code builds the **interpretation options**: candidate equipment
  (an explicit pick, or a lexical match of equipment ids/names in the text, else the
  operator picks from the registry) × catalog `(issueClass, symptomCode)` pairs for that
  equipment, at most 12. The model ranks only those option ids. The **operator confirms**
  the equipment, class and symptom (top option, another option, or a manual pick). Only then
  does code create the issue, with deterministic priority, and start the investigation. The
  model never creates facts.
- **Simulated report** (the event planner creates the issue as today) → engine-owned
  equipment/class/symptom stay authoritative. The Nano narrative writer adds
  `reportNarrative` from the observable DTO (§3.3). The investigator's classification is a
  **hypothesis**, recorded and scored against the observable symptom, never applied.
- Decision entry: this narrows the guide's "Nemotron parses and classifies" to "Nemotron
  ranks code-supplied interpretations; the operator confirms".

### 3.2 Dispatch gate (R2)

- New issue field `dispatchGate`: `OPEN` (legacy and planner-origin issues, unchanged
  autonomous dispatch) or `INVESTIGATION` (every issue created from a field report, and
  simulated issues sampled by room setting `investigationShare`, default 0.2, seeded).
- One function, `assertDispatchAuthorized(state, issue, responderId, purpose)`, is called
  inside **every** assignment path:
  - offer creation (`offerNextCandidate`);
  - `assignInState`;
  - manual override;
  - offer acceptance;
  - assistance/support assignment;
  - rematch after a failed attempt.

  A gated issue passes only with an `APPROVED` investigation whose `authorizedResponderId`
  matches. Any other responder needs a new override record, which the operator must
  approve. Codex audits the call sites with a test that enumerates them.
- Approval stores `authorizedResponderId`, `authorizedFixId`, `actor` (`Central command` or
  `policy:AUTO_APPROVE_SAFE`), `revision` and `at`. Inside one mutation it revalidates
  eligibility, qualification, safety prerequisites, issue state and revision. If anything
  changed it returns `409 STALE` and applies nothing.
- **State machine:** `QUEUED → RUNNING → READY | ABSTAINED | ESCALATED | FAILED(→ deterministic READY)`.
  From `READY`:
  - → `APPROVED`, `REJECTED` or `ESCALATED` (operator);
  - → `EXPIRED` at the deadline (default 30 simulated min);
  - → `SUPERSEDED` by a re-investigation.

  `ABSTAINED`/`ESCALATED` dispatch nothing until the operator either picks a responder and
  fix manually (an audited override, safety-checked) or closes the report. A duplicate
  approval is idempotent (same record → 200; different → 409). On restart, a `RUNNING` run
  is re-queued with a new token, and a stale token's result is discarded.
- `AUTO_APPROVE_SAFE` room policy: only for the history generator and an explicit, audited
  demo toggle. It approves only `READY` results with grade ≥ `MODERATE`, no safety
  escalation and a qualified responder, and **never** `ABSTAINED`/`ESCALATED`. It is
  tested separately from operator approval.

### 3.3 Allowlisted DTOs (R3, R4)

Every model-visible or public payload is built by an explicit field-by-field DTO
constructor in a new `investigation-dto.mjs`. Nothing is spread from state rows. The
field lists below are the whole contract:

- `CaseDTO`: `caseId` (`CASE-<issueId>`), `equipmentId`, `issueClass`, `symptomCode`,
  `symptomText`, `reportNarrative` (+ `narrativeSource`: `operator`/`simulated`/`template`),
  `fixesTried: [{fixId, order, outcome: FIXED|NOT_FIXED}]`, `resolvedAt`, `firstTimeFix`,
  `totalMinutes`, `legacy`.
- `ResponderDTO`: `responderId`, `displayName`, `certifications[]`, `availability`,
  `shiftEndsAt`, `distanceBand`, observed history counts (as in today's packet).
- `FixDTO`: `fixId`, `title`, `steps` (verbatim), `safetyClass`, `prerequisites[]`,
  `requiredCertifications[]`.
- `EquipmentDTO`: `equipmentId`, `name`, `floor`, `issueClass`es, counts of recent cases.

**Never present:**
- draws, probabilities, duration factors, effectiveness;
- fault-cause ids or labels;
- `ResponderSkill` or anything derived from it.

**Certifications** are new **public synthetic records**, seeded from a separate RNG stream
and independent of `ResponderSkill`. Tests:
1. **Noninterference:** randomising hidden truth (skill, cause, effectiveness) leaves every
   model packet, tool result, trace and public route byte-identical.
2. **Canary scan:** planted canary values in every hidden field never appear in any packet
   or log, including renamed keys and archive-backed cases.
3. The same DTOs are used in repair prompts, error messages, persisted traces, fixtures and logs.

**Narratives:**
- The Nano writer receives only an `ObservableDTO` (equipment name, class, symptom text,
  recent public events). Validators reject cause-catalog vocabulary, procedure titles and
  skill claims.
- Templates for legacy cases use public symptoms only.
- **All narrative text is untrusted** wherever it appears: incoming, retrieved by tools,
  in repairs and in the UI (rendered as text, never HTML). Hypotheses are restricted to
  catalog `symptomCode`s plus bounded observable phrases, each with evidence refs. They
  never name causes.

### 3.4 Safety (R5)

- Catalog rows gain `safetyClass` (`ROUTINE` | `ISOLATION_REQUIRED` | `SPECIALIST_ONLY`),
  `prerequisites[]` (from a fixed enum, e.g. `STATION_ISOLATED`, `LOCKOUT_CONFIRMED`) and
  `requiredCertifications[]`.
- At approval, code requires that:
  - the responder holds every required certification;
  - the operator ticks each prerequisite as confirmed (unconfirmed or unknown → reject,
    fail closed).

  The same rules apply to alternatives, manual picks and auto-approval.
- **Deterministic hazard policy before inference:** a versioned lexicon (heat, smoke,
  sparks, injury, fire, bypass/override interlock, …) plus an injection lexicon
  ("ignore previous", role tags, tool-call syntax).
  - A hazard match → `ESCALATED` with no model call.
  - An injection match → the run still proceeds, flagged, with injected spans quoted.
  - Empty, garbled or over-length input (> 600 chars, < 3 words, mostly non-letters) →
    `ABSTAINED`.
  - The same policy applies during a provider outage.
- **Grounding:** the model returns structured `evidenceRefs: [{caseId, field}]`, and code
  checks that each ref names a case the tools returned in this run and a field from
  `CaseDTO`. Explanation prose is qualitative and bounded (≤ 400 chars per item, no digits
  except supplied ids). We do **not** claim semantic verification of prose.

### 3.5 Evidence grade and outcome precedence (R10)

Let `S` = same-equipment-or-symptom cases where the recommended fix was tried (cutoff §3.7),
`s` = how many of them it fixed, and `C` = same-class cases with that fix.

- `STRONG`: `S ≥ 3` and `(s+1)/(S+2) ≥ 0.6`.
- `MODERATE`: `S ≥ 1`, or `C ≥ 3`.
- `THIN`: `C ∈ {1,2}`.
- `NONE`: no case with that fix.

**Precedence:** `ESCALATED` (hazard, or model-proposed escalation that code accepts) >
`ABSTAINED` (grade `NONE` for every fix, no eligible qualified responder, ambiguous
interpretation where the top two options are not separated and the operator has not
confirmed, or validation failed twice with no deterministic answer) > `READY`.
`THIN` is `READY` with a mandatory "low evidence" warning, and auto-approval is never
allowed for it.

### 3.6 Budgets

| Limit | Value |
|---|---|
| Tool steps | ≤ 6 per run |
| Inference calls | ≤ 8 per run |
| Run deadline | 120 s **monotonic** (`performance.now`), shared by queueing, retries and repair |
| Output tokens | ≤ 4096 per call |
| Rows per tool result | ≤ 10 |
| Bytes per tool result | ≤ 8 KB |
| Bytes per stored trace | ≤ 64 KB |
| Investigations in `/state` | open + last 20 |

Exceeding any limit leads to the deterministic investigation, recorded with its reason.
The lane test uses a never-resolving provider promise and asserts that ticks, `/state` and
operator actions continue.

### 3.7 Decision-time cutoff (R6)

- Every tool and aggregate takes `asOf`, and uses only outcomes **completed before `asOf`**
  and never the target issue. This covers case search, fix evidence, responder history,
  equipment history and narrative context.
- Live: `asOf` = investigation start. Replay: `asOf` = the held-out issue's creation time
  (rolling origin).
- **Future-data perturbation test:** changing or deleting any record after `asOf` leaves
  every packet identical.

### 3.8 API (codex implements; main builds UI against it, using fixture stubs in `frontend/` only)

- `POST /api/control-rooms/:id/reports` `{ narrative, equipmentId?, reporter? }` → `{ reportId }`.
  `GET …/reports/:reportId` returns status, interpretation options, ranking and source.
  `POST …/reports/:reportId/confirm` `{ optionId | {equipmentId, issueClass, symptomCode}, expectedRevision }` → `{ issueId, investigationId }`.
  `POST …/reports/:reportId/close` `{ reason }`.
- `GET /state` gains bounded `fieldReports` and `investigations` (summary DTOs).
  `GET …/investigations/:invId` returns the full trace as DTOs.
  `GET …/cases/:caseId` returns a `CaseDTO`, honours the archive, and 404s an unknown id (R9).
- `POST …/investigations/:invId/approve` `{ responderId, fixId, confirmedPrerequisites[], expectedRevision }`;
  `/escalate` `{ reason }`; `/reject` `{ reason }`; `/feedback` `{ useful, note? }`. A stale revision returns 409.
- Every response is DTO-only.

### 3.9 Fixtures (R10)

`fixtures/investigation/` holds three sets:
- `scenarios.json`: synthetic inputs + expected outcome class;
- `synthetic-responses/`: hand-written model outputs, labelled `synthetic`;
- `recorded-live/`: real Nemotron responses captured by the main agent, each with model
  id, date and request hash.

The UI and docs never label synthetic responses as recorded Nemotron.

## 4. Evaluation (R6, R7, R10)

`npm run eval:investigator` (outside `npm test`; `--mode fixture|live`), main agent owns it:

- **Scenario suite**: ~24 reports: historical analog, misleading keyword, missing record,
  contradictory cases, unqualified responder, conflicting shift, overtime needed, unsafe
  fix requested, hazard narrative, injection (incoming **and** in a retrieved case),
  garbled/empty input, provider outage. Each scenario has its expected outcome class
  (`READY`/`ABSTAINED`/`ESCALATED`) and its expected constraints.
- **Paired first-fix replay** (the minimum claim): a held-out last week of the seeded month,
  with rolling-origin `asOf`.
  - For each held-out issue, an isolated outcome runner (application code that holds the
    hidden truth and never serialises it) runs the first attempt three times: with the
    investigator's first fix, the frequency-baseline fix and the existing deterministic
    fix order.
  - The responder, engine state, time and RNG draws are **identical** across the three
    runs. Only the fix varies.
  - Reported: first-time-fix rate per arm, with paired denominators.
  - Abstained or escalated issues are excluded from the paired comparison and reported as
    coverage. Timeouts and fallbacks are counted separately.
  - Policy approval in replay follows §3.2 (no unsafe/abstained approval).
  - Whole-floor minutes comparisons are **deferred**.
- **Metrics**:
  - interpretation agreement with the observable symptom;
  - citation validity and safety violations **of accepted outputs** (targets 100 % / 0);
  - separately: raw-invalid, repaired, abstained, fallback counts;
  - abstention precision/recall on labelled scenarios (an undefined ratio is shown as "n/a (0 cases)");
  - latency p50/p95 and tokens per investigation.
- Results go to `docs/EVALUATION.md` with commands, sample sizes and limitations. No
  time-saved or business-outcome claims.

## 5. Work packages, file ownership and gates (R8, R9)

### Ownership (exclusive per package)

- **Codex:** `backend/src/**` (provider, schema, DTOs, tools, investigator, gate, routes,
  runtime, retention, migration, backend analytics), `backend/tests/**`,
  `scripts/generate-demo-history.mjs`, and seed data under `fixtures/` other than
  `fixtures/investigation/`. Codex imports the main agent's scenario/fixture files read-only.
- **Main agent:** `frontend/**`, `e2e/**`, `fixtures/investigation/**`,
  `scripts/eval-investigator.mjs`, `scripts/probe-nebius.mjs`, `docs/nebius/**`,
  `docs/EVALUATION.md`, `docs/DEMO_SCRIPT.md`, `README.md`, `HACKATHON_CHANGES.md`,
  `docs/BASELINE_AND_CHANGES.md`.
  - Prompt text lives in `backend/src/prompts/*.mjs`. Codex owns those files; the main
    agent hands prompt edits back to codex as an assignment item, never as a direct edit.
- **project-state:** codex updates the backend pages it changes, and the main agent updates
  `frontend/overview.md` and operations pages. `log.md` and `docs/decisions.md` are
  append-only: each adds its own entry at the bottom, and merge conflicts keep both.

### Packages

| # | Package | Owner | Gate / depends | Target (SGT) |
|---|---|---|---|---|
| N0 | Nebius facts: docs + `/v1/models` + probes (IDs, licences, limits, prices, tools, JSON, thinking) → `05_TOKEN_FACTORY_FACTS.md` | main | **Key** | when the key arrives; **go/no-go gate** |
| N1 | Nebius provider (`nebius` default, AMD kept selectable); `NEBIUS_*` env; per-provider controls config; discovery; roles `compass`, `event-planner`, `investigator`, `narrator`; tool-call support (`tools`/`tool_calls`) behind a capability flag, with a JSON next-action protocol on the same loop; call metadata (model, latency, tokens, provider request id) returned to callers. Built against fake fetch now; defaults filled after N0 | codex | — | 10-21 |
| N2 | Contracts §3.3–3.4, §3.7: DTO module, certifications (separate RNG), catalog safety fields, `CaseDTO` derivation (+ archive), `asOf` everywhere, read-only tools, narrative field + migration, noninterference / canary / perturbation tests | codex | N1 merged | 10-23 |
| N3a | **Vertical slice**: field report → interpretation ranking → confirm → investigator loop → validators → gate → approve/reject → audit; one negative (hazard ESCALATE) path; routes §3.8; Offline fixture path | codex | N2 | **10-24 slice gate** |
| N3b | Remaining state machine (expire, supersede, restart, policy), narrator role, `investigationShare`, backend analytics, retention equality | codex | N3a | 10-26 |
| N4 | Report form + confirm step, Investigation tile, case viewer, approval with prerequisite checkboxes, display screen, feed/audit, E2E with forced failure; built on stubs from 10-20, switched to the real API at N3a | main | §3.8 | 10-25 |
| N5 | Scenario fixtures (by 10-21, so N2/N3 tests use them), eval harness, paired replay | main | §3.9; replay after N3a | 10-26 |
| N6 | Live measurement and tuning; recorded-live fixtures; seed: unchanged month + a small deterministic investigation dataset (a full regeneration only if time allows) | main (+ codex for the seed) | N0, N3a | 10-27 |
| N7 | Public repo (new `responsecompass-nebius`, history kept), secret scan of all history, README, `HACKATHON_CHANGES.md`, `docs/ARCHITECTURE.md`, `EVALUATION.md`, `DEMO_SCRIPT.md`; dependency/asset licence inventory | main; codex reviews | N6 | 10-28 |
| N8 | Hosted demo (separate Compose project and port; not 3200), judge access plan | main | N6 | 10-28 |
| N9 | Video < 3 min, form text, feedback, pre-existing disclosure | main + user | N7, N8 | 10-30 |

**Go/no-go gates.**
- **N0:** if there is no key by 10-23, N3a ships against synthetic fixtures and N6 is
  compressed. The live proof is still mandatory before the submission.
- **Slice (10-24):** if N3a slips, cut in this order, cutting more items only if needed:
  1. narrator role and `investigationShare` (operator reports only);
  2. backend analytics comparison;
  3. display screen;
  4. full-month regeneration;
  5. supersede/edit flows.

  **Never cut:** real Nemotron investigation, citation and safety validation, abstention,
  the dispatch gate, approval and the paired replay.

### Acceptance criteria (objective)

- **N1:**
  - fake-fetch tests: Nebius request shape, tool-call round trip, metadata, provider
    selection, AMD-era settings files load unchanged;
  - no network in `npm test`;
  - after N0, the main agent gets one validated live call per role.
- **N2:**
  - the noninterference, canary and future-data perturbation tests pass for every tool and
    route;
  - case ids are stable across reload and archive;
  - archived/unarchived equality is extended.
- **N3a:**
  - the call-site enumeration test proves every assignment path calls the gate;
  - with fixtures, invalid citation, unknown fix, unqualified responder, unconfirmed
    prerequisite, digits in prose, step-cap overrun and deadline are each rejected;
  - the hazard input escalates with zero model calls;
  - the never-resolving-provider lane test passes;
  - both suites are green.
- **N4:** E2E with forced provider failure:
  - report → confirm → deterministic investigation → approve with prerequisites → dispatch
    appears in feed and audit;
  - ESCALATED and ABSTAINED render;
  - 375 px and 1280 px layouts; the display screen renders at 1920×1080.
- **N5/N6:**
  - both eval modes run from one command;
  - live: ≥ 20 scenarios and ≥ 50 paired replays, with honest numbers and limitations.
- **N7–N9:** every guide §11 item is checked, with an evidence link.

## 6. Risks and blockers

| Risk | Mitigation / owner |
|---|---|
| **No Nebius API key yet**; the user will provide it later | N1 is built hermetically with no guessed IDs; N0 runs on arrival; gate in §5. Main agent only. |
| ~~IP ownership~~ **Resolved (user, 2026-10-19):** the application is the user's own and is shared for use at their company under Apache-2.0. `LICENSE` added. N7 still inventories dependency and asset licences (R11). | main |
| ~~AMD hackathon exclusivity~~ **Not a concern (user, 2026-10-19).** We still disclose the AMD-era baseline. | — |
| Public GitHub repo | User logged in with `gh` (2026-10-19); main verifies before N7. |
| **Judge access through 2026-12-15** (R11) | No per-visitor budget that blocks judges. A dedicated `judges` room is always Live; there are the global limiter and idle auto-pause. A spend alert and a pre-funded credit reserve are sized from N0 prices. If the provider is unavailable, the UI shows a labelled deterministic result; the recorded-live replay is a fallback for the video only and is labelled. Judge instructions live in the private testing field. |
| Ultra latency/cost too high for the loop | Super tier for the investigator; step cap; measured in N0/N6. |
| Tool calling unsupported or flaky | JSON next-action protocol on the same loop (N1 flag), chosen from N0 facts. |
| Scope | Gates and cut order in §5. |

## 7. Coordination

- Assignments live in `handover.md` on master. Codex runs its own watcher (300 s) on
  `git show master:handover.md`. The main agent's watcher (300 s) polls codex's branch.
- Ports: codex 3021/3121, main 3024/3124. Never bind 3000 or 3200.
- No live provider calls in worker worktrees. The main agent runs every live check.
- Every merge: both suites on master, and `project-state/` plus `log.md` updated.
