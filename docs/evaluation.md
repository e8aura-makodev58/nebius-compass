# Reliability and evaluation

## Compass Investigator on Nebius Token Factory (2026-10-19, run 2, after the ESCALATE fix)

Same command, scenarios and models as run 1, after the validator change described below.
This is one sample per scenario, not a general accuracy measure.

| Metric | Result |
|---|---|
| Outcome class matches expected | 24/24 |
| Abstention precision / recall | 8/8 / 8/8 |
| Citation validity of accepted outputs | 64/64 |
| Safety violations in accepted outputs | 0 in 12 |
| Hazard and input policy decided without a model call | 6/6 |
| Interpretation agreement (operator-confirmed option) | 15/15 |
| Accepted / repaired / deterministic / raw invalid | 12 / 4 / 13 / 4 |
| Latency p50 / p95 (model runs) | 8.9 s / 29.4 s (15 runs) |
| Tokens per investigation p50 / p95 | 11.0k / 24.2k |

The 13 deterministic results break down as follows:
- **Policy decisions with zero model calls (6):** hazard (3) and bad input (3).
- **Simulated provider failure (2):** forced outage (SC-22) and the deadline scenario
  (SC-23).
- **Hazard during an outage (1):** SC-24, decided by policy.
- **Never reached the investigator (2):**
  - SC-07: no station could be matched, so the report stayed unconfirmed (0 calls);
  - SC-08: the ambiguous-interpretation path (1 call).
- **Genuine model fallbacks (2):**
  - SC-05: two invalid final answers, `validation-failed`;
  - SC-06: the six-step tool cap.

  Both still ended in the expected outcome class. In the 4 runs where the model's first
  final answer was invalid, the repair was accepted twice.

## Compass Investigator on Nebius Token Factory (2026-10-19, run 1)

Command: `npm run eval:investigator -- --mode live` (24 synthetic scenarios in
`fixtures/investigation/scenarios.json`, one sample each; investigator
`nvidia/Nemotron-3-Ultra-550b-a55b`, interpretation ranking `nvidia/nemotron-3-super-120b-a12b`).
Scoring: `scripts/eval/score.mjs`. This is one small run and is not a general accuracy measure.

| Metric | Result |
|---|---|
| Outcome class matches expected | 16/24 |
| Abstention precision / recall | 8/8 / 8/8 |
| Citation validity of accepted outputs | 18/18 |
| Safety violations in accepted outputs | 0 in 4 |
| Hazard and input policy decided without a model call | 6/6 |
| Interpretation agreement (operator-confirmed option) | 15/15 |
| Accepted / repaired / deterministic fallback / raw invalid | 4 / 3 / 13 / 3 |
| Latency p50 / p95 (model runs) | 14.6 s / 22.5 s (15 runs) |
| Tokens per investigation p50 / p95 | 13.9k / 20.9k |

**What failed and why.** All eight misses expected `READY` and got `ESCALATED`. The diagnosis
reran three of them. In each, Ultra ranked a supported, qualified fix and also set
`proposedOutcome: ESCALATE`, with a reason such as "Strong historical evidence supports the
fix…". The model read "escalate" as "hand to the operator", and the code accepted
model-proposed escalation unconditionally. The output was safe: nothing auto-dispatches,
and escalation sends the issue to a person. But it is wrong, because the recommendation
was good. Fix assigned to codex (round 15): restrict `ESCALATE` to safety concerns in the
prompt, and have code reject an `ESCALATE` that accompanies a supported, safe
recommendation (one repair). Run 1 did not record the 13 fallbacks' reasons; the harness
now prints source, fallback reason and stated reason per scenario.

**Live end-to-end on e8aura-deploy** (month seed, same date): a field report about Station 12
was ranked to `B-STOP` by Super. Ultra then made 7 calls in 15.7 s (≈ 23k input /
2.4k output tokens) and returned `READY`, grade `STRONG`:
- the specialist-only fix `FIX-B-02`, citing ten same-symptom cases;
- one qualified responder.

Approval with both prerequisites confirmed dispatched exactly that responder through the
dispatch gate.


## Deterministic gate results

Run on 2026-09-04 with `npm test` and the versioned synthetic seed:

- 117 unit/integration tests passed.
- 100 recommendation opportunities completed in the deterministic accelerated soak.
- 75/100 recommendations differed from the naive weighted baseline.
- 75/75 disagreements were classified from structured evidence as evidence-strength-driven.
- 149 total observed records remained after the pre-warmed attempt plus 100 soak attempts.
- 397 operational events persisted.
- 0 duplicate active-responder assignments.
- 0 leaked active assignments at completion.
- 0 active issues remained; the ceiling of three was never exceeded.
- latent convergence over 2,000 independent samples moved the misleading Tech216/Class B estimate toward its hidden success and median parameters.

The soak uses `evidence-policy-v1`, a deterministic test policy that produces schema-valid Compass-shaped output. It validates seed disagreement capacity, scheduler/mutation integrity, history growth, and analytics consistency. It is not represented as a live-model quality result.

## Browser gate

`npm run test:e2e` covers all 32 Chromium E2E tests after exposing the already-present local browser-library bundle through `LD_LIBRARY_PATH`. Coverage includes Live reset, immediate Compass/event-workflow activity indicators, the dedicated Demo view, Trigger Next Event, event feed, Force Resolve, Analytics, mode switching, Offline fixed winners, Offline confirmation, and Live/Offline assignment overrides held across multiple polling intervals. Explicit test inference modes are honored through provider settings, so the suite makes no provider request and spends no API credits.

## External live-provider gate

The ten-run Scenario A gate below was run under the since-removed OpenAI provider (`gpt-5.6-terra` / `medium`); AMD Token Factory is now the only provider and has no equivalent recorded gate here. Before the synthetic-code migration, the genuine ten-run Scenario A gate completed 10/10 READY with the responder now identified as Engr028 ranked first on every run; the recorded latencies were 7.486–13.011 seconds, with every tradeoff grounded and no numeric leakage. The live 100-opportunity provider evaluation (now against AMD Token Factory) remains outstanding and must confirm the SOW disagreement thresholds. Do not substitute the fixture or deterministic evaluation policy for that claim.

## Paired replay method

`npm run eval:investigator -- --replay --mode fixture --limit 5` exercises the replay
hermetically. The main agent can run `--replay --mode live [--held-out-days N] [--limit N]`
for measured model results; `--json <path>` writes only public pairs, metadata and scores.
This section records the method, not replay result numbers or a live improvement claim.

`backend/src/replay-runner.mjs` reads the existing committed plant-1 month and its archives,
verifies the compressed seed checksum, and selects resolved issues in the last held-out
window ending at the seed clock. Eligible issues have a public symptom and a nonlegacy
catalog fix in their observed attempts. Missing first-attempt engine inputs are reported as FAILED exclusions. Window membership uses resolution time;
decisions use each issue's raisedAt. Ordering is raisedAt then issue ID; a limit takes the
first entries in that order. Metadata separates resolved, eligible, selected and included
counts, identifies seed/archive hashes and model IDs, and records wall timestamps/runtime.
Fixture model IDs are nominal configured metadata, not evidence of live calls.

Each investigator sees a fresh public projection with the target's engine-owned
interpretation, no approval policy, no cached target recommendation and no target outcome.
Completed observations and resolved cases must precede raisedAt strictly; equal-time and
future outcomes are excluded before constructing evidence and baseline packets. Earlier
held-out outcomes become visible at later origins: this is rolling-origin evaluation,
not a single frozen training cutoff. Immutable equipment/responder reference definitions
come from the synthetic seed. Duty is reconstructed from the fixed crew rotation and
previously approved staffing intervals; occupancy and position use assignment intervals
at the origin, otherwise the duty station. This is a documented public roster
reconstruction, not a replay of every historical UI tick or manual relocation.

Only READY results enter the paired comparison. ABSTAINED, ESCALATED and FAILED (including
missing engine inputs or a thrown run) appear as exclusions and in coverage denominators.
Fallback, timeout, repaired and raw-invalid counts are also reported, so a deterministic
fallback is not presented as live-model success. The first investigator fix is compared
with same-class observed fix frequency (catalog-order ties) and the existing deterministic
symptom-based fix ordering, frozen from the same cutoff-filtered packet.

`replay-outcome-runner.mjs` alone captures the engine's private cause, skill and original
first-attempt draw. It restores the engine RNG immediately before those recorded draws
and creates three isolated first attempts through the existing attempt engine. All arms
start at the same simulated instant with identical engine inputs and the historical first
responder; only the fix changes. Engine effects can change completion times, but only the
boolean fixed outcome leaves the runner. No assistance, retries, staffing changes, dispatch
or approval mutation occurs. Holding the historical responder fixed is an efficacy control,
not a claim that each alternative fix would be lawfully assigned to that responder today.

The scorer receives only issue IDs, three `{fixed}` arms or an exclusion reason. It prints
coverage, exclusions by reason, first-fix rates with the same paired denominator and
positive/negative discordant-pair counts against each baseline. Hidden causes, skills,
probabilities, draws and internal traces never enter score inputs, model packets or logs.
Perturbation tests prove hidden truth can affect outcomes without affecting packets and
future observations cannot affect an earlier decision. This is a controlled synthetic
first-attempt comparison, not real-world accuracy or a whole-floor time/cost benefit.
