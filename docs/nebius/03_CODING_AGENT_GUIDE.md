# ResponseCompass — Nebius x NVIDIA Hackathon Coding Agent Guide

**Status:** Implementation brief / agent working context  
**Date:** 2026-10-18 (Singapore)  
**Target track:** Best Apps and Agents  
**Submission deadline:** 2026-10-31 01:00 SGT  
**Authoritative companion files:** `01_HACKATHON_BRIEF.md`, `02_OFFICIAL_RULES.md`

## 0. Instructions to the coding agent

You are modifying an **existing project**, ResponseCompass, for the Nebius x NVIDIA Global AI Hackathon. **Do not rebuild from scratch.** Begin with a repository audit, preserve working functionality, then implement material new functionality that genuinely uses an NVIDIA open-source model running through Nebius Token Factory (or qualifying Nebius AI Cloud compute). Implement a **working, testable, reproducible** product, not a mocked AI demonstration. Your task includes integration, tests, documentation, evaluation, and packaging for submission.

**Treat this guide as a plan, not a statement that features already exist.** Inspect the real source, APIs, data model, frontend, tests, deployment and commit history before deciding specific implementation details. Avoid inventing architecture, test metrics, endpoints, credentials, model IDs, or feature completeness. Record decisions and their rationale. Ask only if a blocker cannot be resolved through the codebase or official documentation.

## 1. Project concept

**ResponseCompass** is an AI dispatch and resolution assistant for industrial operations control rooms. Given an equipment incident, it should recommend:

1. **Which qualified and available responder to dispatch**, based on skills, availability, assignments, constraints and relevant prior experience.
2. **Which corrective action to attempt first**, based on similar historical failures, outcomes, equipment context and safety/operational constraints.
3. **Why** these suggestions are made, with traceable supporting incident records, uncertainty and alternatives.

The control room **supervises**, reviews recommendations, and explicitly **approves dispatch, escalation and overtime**. There must be no covert autonomous personnel assignment or overtime approval.

This can be demonstrated with **synthetic incident, technician, availability and repair-history data**. Do not include company-confidential information.

## 2. What must be new for this hackathon

Official rule: a project existing before the submission period must have been **significantly updated after August 26, 2026, 09:00 Pacific Time**. Simply forking, renaming, changing visual branding, or replacing an LLM provider is **not** guaranteed to be significant.

Aim for a demonstrable, integrated feature such as:

- A **tool-using incident investigation agent** powered by an NVIDIA Nemotron model through Nebius Token Factory.
- Case retrieval and evidence-linked reasoning, turning unstructured incident symptoms into structured hypotheses and safe corrective-action recommendations.
- Responders ranked by deterministic qualification/availability and validated operational policies, with LLM explanations grounded in returned tool results.
- A human approval/override workflow with audit and feedback.
- A replay/evaluation harness comparing recommendations against held-out historical cases, including where the system should abstain.

These are **proposed enhancements**, not assumed existing features. First identify what is already implemented, then define a concrete subset that constitutes a significant functional update. Implement completely rather than partially scattering work across all ideas.

## 3. Repository and ownership baseline — first task

1. Inventory modules, dependencies, routes, schemas, database, services, deployed components, feature flags, sample data, tests, CI/CD and secrets handling.
2. Identify current incident ingestion, historical lookup, responder matching, recommendation, approval and overtime capabilities. Mark each **implemented / partial / absent** with file references.
3. Record provenance: original repository URL, original/default branch, baseline commit SHA, fork creation date, and dated commits inside Submission Period. If history is not preserved, record and archive the original SHA and repository relationship clearly.
4. Confirm ownership and right to publish **all** code, dependencies, assets and data; remove organization-specific secrets/IP/personal data before opening repository.
5. Preserve clean functionality. Maintain a separate hackathon branch/repo (suggested `responsecompass-nebius`) if appropriate, with preserved history.
6. Produce `docs/BASELINE_AND_CHANGES.md` with **before**, **after**, **dates**, **code links**, **tests**, and **demo proof**. Do not claim changes that have not been committed.

## 4. Non-negotiable architectural principles

### Deterministic authority vs probabilistic interpretation

| Responsibility | Owner |
|---|---|
| Parse narrative symptoms and classify likely issue types | Nemotron, constrained/validated |
| Search similar repair cases | Deterministic retrieval tool (semantic search optional) |
| Evaluate responder skills, certification, shift and availability | Deterministic backend |
| Apply safety, conflict, shift, overtime and policy constraints | Deterministic backend; fail closed |
| Recommend action order and explain evidence | Nemotron with tool evidence; validate against allowed actions |
| Final dispatch/overtime authorization | Human control-room operator |
| Persist approvals, overrides, sources, costs and model usage | Audit/event store |

**Do not let the LLM fabricate responder availability, repair outcomes, source citations, certifications, overtime policy, or repair actions.** All specific factual claims require trusted records or validated structured tool output. For missing data, abstain or escalate.

### Proposed flow

```text
Incident arrives
  → Normalize/validate incident fields
  → Invoke Nemotron on Nebius Token Factory for investigation plan
  → Retrieve structured equipment context and similar resolved cases
  → Run deterministic responder eligibility/ranking and safety checks
  → Invoke Nemotron for grounded action recommendation/explanation
  → Schema validation + evidence validation + safety guardrails
  → Control-room review (approve / reject / edit / escalate)
  → Persist audit, recommendation, human action, feedback
```

Do not require two inference calls if a simpler single model invocation produces verified results. Choose based on actual engineering trade-offs and evidence.

## 5. Nebius + NVIDIA integration (mandatory)

- Implement **real runtime inference** via Nebius **Token Factory API** with an available **NVIDIA open source model**, preferably an appropriate Nemotron model for this track.
- Verify the **current model names, endpoint, authentication, request format, token limits, price/rate limits, tool/function calling behavior and structured output support** from current Nebius documentation before coding; never hardcode guessed IDs.
- Put model configuration and API keys in environment variables; example `.env.example` must contain **no real secrets**.
- Build a provider adapter with clear request/response schemas, timeouts, bounded retries/backoff, structured logs, error handling, and graceful UI failures.
- If using tool calling, validate arguments before invoking tools; provide only narrowly scoped, read-only data tools unless an action is separately authorized. Defend against prompt injection in stored incident narratives.
- Track provider model ID, latency, token counts and errors when offered by API, without logging sensitive incident contents unnecessarily.
- Distinguish **real inference**, **replay fixtures**, and **local mocks** in UI and tests. Demo must show real qualifying inference.
- Nebius Serverless is optional for Best Apps and Agents; an application hosted elsewhere can qualify if it makes runtime Token Factory inference calls. Confirm actual infrastructure usage in README.
- Do not add Tavily solely for an award. If meaningful external search is added, the Tavily prize specifically requires a functional **runtime Tavily API call**.

## 6. Data and tool contracts

Prefer minimal typed objects compatible with the current codebase; examples below are conceptual, not required exact schemas:

```text
Incident: id, equipment_id, occurred_at, symptoms, severity, status, metadata
HistoricalCase: case_id, equipment_id/type, symptom_summary, fix_steps, outcome, timestamp, source_ref
Responder: id, competencies, certifications, shift, availability, location/assignment, constraints
CandidateAction: id, description, prerequisite, safety_flag, evidence_case_ids
Recommendation: incident_id, responder_candidates, action_candidates, evidence_refs,
                confidence_or_uncertainty, warnings, requires_approval, model_metadata
DecisionEvent: recommendation_id, operator_action, operator_id, timestamp, reason, overtime_approved
```

Use stable case IDs and show them in UI as evidence links. Separately mark historical facts, inferred hypotheses, and recommendations. Confidence must not be an arbitrary LLM self-reported percentage portrayed as calibrated probability.

**Synthetic data:** Provide realistic but fictitious incidents, equipment, schedules and technicians; avoid reproducing real workplace data. Cover normal, ambiguous, insufficient-evidence, unqualified-responder, conflicting-shift, overtime-required, and unsafe-action cases.

## 7. Suggested minimum viable demo

Show one end-to-end scenario:

1. Operator opens an incoming intermittent equipment fault with a realistic symptom narrative.
2. Agent calls Nebius-hosted NVIDIA Nemotron and tools to investigate.
3. UI shows retrieved historical cases and exact source evidence.
4. System recommends **first safe corrective action** with reasoning and alternatives.
5. System ranks **qualified available responders**, with eligibility explained using deterministic records.
6. Operator reviews recommendation and authorizes dispatch; if overtime is relevant, it is explicitly separately approved or rejected.
7. Decision, override, and feedback are recorded in audit history.
8. Show a negative/ambiguous case where the system **abstains or escalates**, demonstrating constraints rather than polished hallucinations.

Optimize for a compelling, complete walkthrough under **three minutes**. Public video on YouTube is required.

## 8. Evaluation and tests

Build an honest repeatable evaluation, not fabricated business outcome claims:

- **Unit tests:** eligibility and overtime constraints, matching, evidence integrity, request validation, schema parsing, approval rules.
- **Integration tests:** real Token Factory API (only in an opt-in environment with valid credentials) and recorded-fixture path for CI.
- **Scenario tests:** historical analog, misleading keyword, missing record, conflicting responder availability, contradictory repair cases, harmful action, unqualified responder, and model/API outage.
- **Regression tests:** existing ResponseCompass functionality remains working.
- **Review artifacts:** exact synthetic test cases, expected behavior, actual run results and limitations. No unsupported time-saved or accuracy percentages.

Tests should confirm that no auto-dispatch/overtime approval occurs and that outputs unsupported by tools are rejected or qualified.

## 9. Security, privacy and public release

- No production credentials, employee rosters, customer names, internal equipment logs, real incident narratives, private URLs or personally identifiable data.
- Use synthetic/publicly licensed datasets and redistributable assets only.
- Review whether employer or third parties have any IP claim on inherited project files.
- Exclude `.env`, secrets, DB dumps, artifacts containing private information; inspect **Git history** for previous leaks before publishing.
- Secure public demo with synthetic sample data; permit judges to use it **for free and without restrictions through December 15, 2026**. If authentication is required, include working test credentials in private judging instructions (not in public source).
- Explicit approval before irreversible actions; audit and role-based access where feasible.

## 10. Required public repository content

```text
README.md                      # project, setup, run, architecture, demo, NVIDIA/Nebius details
LICENSE                        # MIT/Apache-2.0/MPL-2.0, only with adequate rights
.env.example                   # placeholders only
HACKATHON_CHANGES.md           # dated substantial updates and baseline references
src/...                        # actual code (respect existing layout)
tests/...                      # tests and repeatable scenario fixtures
sample_data/...                # synthetic data only
docs/ARCHITECTURE.md            # model/tools/decision boundaries
docs/EVALUATION.md              # reproducible results and limitations
docs/DEMO_SCRIPT.md            # under-three-minute walkthrough
```

Adapt names/paths to the actual repository, and avoid duplicate documents. Include steps for installation, environment variables, database setup/seed, development run, test run and production/demo run. Clearly state which functions require paid Nebius inference.

## 11. Hackathon submission checklist

- [ ] Existing project was materially enhanced **during Submission Period**; written before/after explanation supported by commits.
- [ ] Runtime call to Nebius Token Factory inference API **or** actual deployment on qualifying Nebius AI Cloud compute.
- [ ] At least **one NVIDIA open source model** genuinely used by the working product.
- [ ] Category: **Best Apps and Agents Track** (unless explicitly changed).
- [ ] Full end-to-end demo and reliable hosted/testable URL, free access through Judging Period.
- [ ] Public GitHub/GitLab/Bitbucket repository; license visible; dependencies/assets licensable.
- [ ] Reproducible README, setup, tests and clear Nebius/NVIDIA model usage.
- [ ] Public YouTube demo **less than three minutes**; shows live functioning application.
- [ ] Submit project description, demo link, video, repo, track and service/model feedback.
- [ ] Disclosure of pre-existing project and substantial updates.
- [ ] No secrets/third-party IP/confidential workplace data in source or presentation.
- [ ] All submissions completed before **2026-10-31 01:00 SGT**; don't assume post-deadline edits accepted.

## 12. Prioritized execution plan

**P0 — Audit and eligibility:** Inspect code and Git baseline; confirm IP rights and live Nebius model capabilities; document scope and changes.

**P1 — Small vertical slice:** One real Token Factory Nemotron call, one incident, evidence retrieval, validated recommendation response and visible provider metadata.

**P2 — Operational workflow:** Deterministic responder eligibility, human review and approval, audit; safety and abstention.

**P3 — Verification:** Scenario tests, graceful failures, synthetic dataset and reproducible setup.

**P4 — Submission:** Public repo and license, README, `HACKATHON_CHANGES.md`, hosted app, short demo video script and feedback.

Cut low-value extras before cutting the complete core scenario. Prefer a smaller truthful end-to-end system over a large collection of nonfunctional UI screens.

## 13. Initial agent deliverable

Before editing implementation, produce a short audit report with:

1. Repository facts, actual stack, baseline SHA, existing features and gaps (with filenames).
2. Recommended **substantial new feature** within timeline and why it passes Stage One.
3. Proposed design and minimum changes needed (files/modules, model integration, tests).
4. Risks/blockers including model availability, ownership, data, deployment and deadline.
5. Ordered implementation tasks and objective acceptance criteria.

Then implement iteratively, running tests and validating working end-to-end behavior. Do not claim completed features without proof.

## 14. Rules interpretation and escalation

The official text allows **pre-existing projects with significant updates**. It does **not** define a required percentage of new code. It explicitly warns that superficial rebrands are not genuine fit. A fork/copy alone does not establish significant updates. The Sponsor/Administrator have final discretion. If eligibility is materially ambiguous, request written clarification from **support@devpost.com** before the deadline. Official Rules supersede this guide.
