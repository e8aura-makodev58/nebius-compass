# Baseline and changes — Nebius x NVIDIA Global AI Hackathon

This file separates what ResponseCompass was before the Nebius entry from what was built for
it. Only committed work is listed under **After**; each row links its commits, tests and
demo proof once they exist. Plan: [`docs/nebius/04_HACKATHON_PLAN.md`](nebius/04_HACKATHON_PLAN.md).

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

Rows are added as packages N1–N9 merge.
