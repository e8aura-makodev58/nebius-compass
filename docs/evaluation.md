# Reliability and evaluation

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
