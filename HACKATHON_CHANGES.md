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
| Secrets in history | None found for `.env`, `*.key`, `provider-credentials.json` (full secret scan before publishing: plan N7) |
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
| Nebius Token Factory verified live: five Nemotron models, JSON, native tool calls, thinking control | `8ff664d` | `scripts/probe-nebius.mjs` (manual, live) | `docs/nebius/05_TOKEN_FACTORY_FACTS.md` |
| Nebius Token Factory provider (default), four model roles, per-provider controls, tool turns, call metadata | `d3a500b`, `1f18284` | `backend/tests/nebius-provider.test.mjs`, `e2e/provider-settings.spec.mjs` | — |

| Investigation contracts: explicit DTOs, public certifications, catalog safety classes and prerequisites, case records, report narratives, six bounded read-only tools with a host-owned decision cutoff (N2) | `cf17c4e` | `backend/tests/investigation-contracts.test.mjs` (noninterference, canary, future-data perturbation) | — |
| Evaluation scoring and harness (N5 part 1) | `3a445ca` | `backend/tests/eval-score.test.mjs` | `npm run eval:investigator` |
| **Compass Investigator vertical slice (N3a):** field reports, code-owned hazard/input/injection policy, Nemotron-ranked interpretations confirmed by the operator, Ultra tool loop with citation/catalog/qualification/prose validation and deterministic fallback, one dispatch gate on every assignment path, safety-checked approval | `e0d03a4` | `backend/tests/investigator.test.mjs`, `e2e/investigation-real.spec.mjs` | Live run on e8aura-deploy and first live eval: `docs/evaluation.md` |
| Deployment server e8aura-deploy (Docker, Nebius key secret, deploy script) | `40e7a6a` | — | `scripts/deploy/README.md` |
| Real-packet Nebius measurement; ranking default Super with thinking off | `see log 2026-10-19` | `npm run measure:amd -- --provider nebius` (manual, live) | `docs/nebius/05_TOKEN_FACTORY_FACTS.md` |
| Git history secret scan: no keys, tokens or private keys in any commit | — | scan patterns in `project-state/log.md` | — |

Rows are added as packages N1–N9 merge.
