# Hackathon changes — Nebius x NVIDIA Global AI Hackathon

This file separates what ResponseCompass was before the Nebius entry from what was built for
it. Only committed work is listed under **After**; each row links its commits, tests and
demo proof once they exist. Plan: [`docs/nebius/04_HACKATHON_PLAN.md`](docs/nebius/04_HACKATHON_PLAN.md).

## Provenance

| Fact | Value |
|---|---|
| Submission Period | 2026-08-26 09:00 PT – 2026-10-30 10:00 PT |
| Origin repository | `github.com/e8aura-makodev58/amd-compass` (git remote `upstream`, push disabled) |
| First commit in this history | `083fcd3`, 2026-10-16T09:15Z, "Initial commit: ResponseCompass control rooms" |
| Origin head shared with this repo | `50c634c` (2026-10-18), an ancestor of `master` — history is preserved |
| **Nebius baseline** | **`1e1c69c`** (2026-10-19): everything after it is Nebius-entry work |
| Commits from first commit to baseline | 119 (built for the AMD hackathon, disclosed as pre-existing) |
| Secrets in history | No matches were reported by the 2026-10-19 selected-pattern scan; this is not an exhaustive guarantee. Re-run and record a sanitized publication scan at the final public revision. |
| Commit author | `e8.aura@gmail.com` on all commits; the user approved publishing it (2026-10-19) |
| Licence | Apache-2.0 (`LICENSE`); the user owns the application and confirmed the licence (2026-10-19) |

The AMD-era commits fall inside the Submission Period, but they were made for, and
submitted to, a different hackathon. We treat them as the pre-existing project and claim only
work after `1e1c69c` as the significant update.

## Before (baseline `1e1c69c`)

A persistent simulated industrial control room with deterministic eligibility, metrics and
outcomes. Models on **AMD Token Factory** (MiMo-V2.6-Flash) rank eligible responders, rank
catalog fixes from aggregate evidence, rank lawful overtime options for operator approval,
and propose simulation events. Deterministic fallback for every model call; Offline mode;
hidden responder skill and fault cause; analytics; wall-display screens. Full capability
table with file references: plan §1.

## After (Nebius entry)

| Change | Commits | Tests | Demo proof |
|---|---|---|---|
| _Hackathon plan and baseline audit_ | `2e21beb` | — | — |
| Plan v2 after independent review | `a2d8373` | — | — |
| Field reports tile (UI for the investigator, on the API contract) | `90f0638` | `e2e/investigation-ui.spec.mjs` (stubbed routes until N3a) | — |
| Nebius catalog records five NVIDIA model IDs; the published JSON/tool probe tables cover four models | `76e1e6a` | `scripts/probe-nebius.mjs` (manual, live) | `docs/nebius/05_TOKEN_FACTORY_FACTS.md` |
| Nebius Token Factory provider (default), four model roles, per-provider controls, tool turns, call metadata | `d3a500b`, `1f18284` | `backend/tests/nebius-provider.test.mjs`, `e2e/provider-settings.spec.mjs` | — |
| Investigation contracts: explicit DTOs, public certifications, catalog safety classes and prerequisites, case records, report narratives, six bounded read-only tools with a host-owned decision cutoff (N2) | `cf17c4e` | `backend/tests/investigation-contracts.test.mjs` (noninterference, canary, future-data perturbation) | — |
| Evaluation scoring and harness (N5 part 1) | `3a445ca` | `backend/tests/eval-score.test.mjs` | `npm run eval:investigator` |
| **Compass Investigator vertical slice (N3a):** field reports, code-owned hazard/input/injection policy, Nemotron-ranked interpretations confirmed by the operator, Ultra tool loop with citation/catalog/qualification/prose validation and deterministic fallback, one dispatch gate on every assignment path, safety-checked approval | `e0d03a4` | `backend/tests/investigator.test.mjs`, `e2e/investigation-real.spec.mjs` | Live run on the deployment host and first live eval: `docs/evaluation.md` |
| Investigator lifecycle (N3b): deadline expiry, re-investigation, audited override, safe auto-approval policy, simulated narrated reports, retained analytics; model ESCALATE repair | `71c7d8d`, `e264ce1` | `backend/tests/investigator.test.mjs` | Live eval run 2: 24/24 (`docs/evaluation.md`) |
| UI for override, re-investigate, deadline, policy and investigation analytics | `7fff2db` | `e2e/investigation-real.spec.mjs` | Deployed |
| Deployment to a separate Docker host (Nebius key secret, deploy script) | `40e7a6a` | — | `scripts/deploy/README.md` |
| Real-packet Nebius measurement; ranking default Super with thinking off | `4bd0dae` | `npm run measure:amd -- --provider nebius` (manual, live) | `docs/nebius/05_TOKEN_FACTORY_FACTS.md` |
| Selected-pattern Git history credential scan reported no matches (2026-10-19); retain method and sanitized output for the publication revision | — | scan patterns in `project-state/log.md` | — |
| Paired rolling-origin first-fix replay with an isolated private outcome engine | `c9ae284` | `backend/tests/replay-runner.test.mjs` | `npm run eval:investigator -- --replay --mode fixture --limit 5`; live replay results not yet recorded here |
| Deployment-global daily usage ledger, estimated budget and read-only Settings usage | `4538dfd` | `backend/tests/provider-usage.test.mjs` | `GET /api/settings` exposes usage; budget defaults unlimited |
| Public docs factual review (27 findings) applied | `a624e64` (review) | — | `docs/nebius/07_PUBLIC_DOCS_REVIEW.md` |

Rows are added as packages N1–N9 merge.
