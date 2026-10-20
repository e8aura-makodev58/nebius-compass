# Reliability and evaluation

## Compass Investigator on Nebius Token Factory (2026-10-19, run 3, after the security fixes)

Run 3 used the same command and scenarios as run 2, after codex's round 21 security fixes
(numeric metric allowlist, probability ban, hazard lexicon v2, unsupported-READY abstention).
It ran before the precise repair-feedback follow-up.

| Metric | Run 3 |
|---|---|
| Outcome class matches expected | 24/24 |
| Abstention precision / recall | 8/8 / 8/8 |
| Citation validity of accepted outputs (returned-reference) | 60/60 |
| Certification inconsistencies in accepted outputs (post-validation) | 0 in 12 |
| Hazard and input policy decided without a model call | 6/6 |
| Accepted / repaired / deterministic / raw invalid | 12 / 2 / 11 / 2 |
| Investigation-record latency p50 / p95 (includes deterministic/injected-provider cases) | 10.5 s / 32.9 s (15) |

The same caveats as run 2 apply (see "How to read these tables" below).

## Compass Investigator on Nebius Token Factory (2026-10-19, run 2, after the ESCALATE fix)

Same command, scenarios and models as run 1, after the validator change described below.
This is one sample per scenario, not a general accuracy measure.

| Metric | Result |
|---|---|
| Outcome class matches expected | 24/24 |
| Abstention precision / recall | 8/8 / 8/8 |
| Citation validity of accepted outputs | 64/64 |
| Certification inconsistencies in accepted outputs (post-validation) | 0 in 12 |
| Hazard and input policy decided without a model call | 6/6 |
| Confirmed interpretation round-trip agreement (expected facts supplied by operator adapter) | 15/15 |
| Accepted / repaired / deterministic / raw invalid | 12 / 4 / 13 / 4 |
| Investigation-record latency p50 / p95 (includes deterministic/injected-provider cases) | 8.9 s / 29.4 s (15 runs) |
| Recorded investigator tokens p50 / p95 (includes zero-token injected-provider cases) | 11.0k / 24.2k |

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

**How to read these tables.**
- **Timing and tokens:** the percentiles use all investigation records with those fields,
  including the forced-failure and injected-deadline scenarios. They are not live-only
  provider latency or token estimates, and they exclude interpretation-ranking latency
  and tokens.
- **Interpretation agreement:** the harness supplies each labelled expected interpretation
  to the confirmation endpoint, so agreement verifies that those confirmed facts are
  preserved. It does not measure whether Super's top interpretation was independently
  correct.
- **Safety and citations:** the scenario runner does not approve assignments, so the zero
  counts do not measure approval-time prerequisite enforcement or every possible safety
  failure; separate integration tests exercise those controls. Citation counts measure
  returned-reference validity, not proof that a rationale follows from a case.
- **Reproducibility:** these are historical measurements reported by the main agent. The
  repository contains their summaries and harnesses, not complete per-run output artifacts
  from which all totals can be recomputed. A new live run may differ and spends provider
  credit, and fixture runs do not reproduce live measurements.

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
| Certification inconsistencies in accepted outputs (post-validation) | 0 in 4 |
| Hazard and input policy decided without a model call | 6/6 |
| Confirmed interpretation round-trip agreement (expected facts supplied by operator adapter) | 15/15 |
| Accepted / repaired / deterministic fallback / raw invalid | 4 / 3 / 13 / 3 |
| Investigation-record latency p50 / p95 (includes deterministic/injected-provider cases) | 14.6 s / 22.5 s (15 runs) |
| Recorded investigator tokens p50 / p95 (includes zero-token injected-provider cases) | 13.9k / 20.9k |

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

The recorded round-17 browser gate on 2026-10-19 passed 83 Chromium tests with forced provider failures and no API spend. The older 32-test gate described here is a historical checkpoint, not the current suite size. Coverage includes Live reset, immediate Compass/event-workflow activity indicators, the dedicated Demo view, Trigger Next Event, event feed, Force Resolve, Analytics, mode switching, Offline fixed winners, Offline confirmation, and Live/Offline assignment overrides held across multiple polling intervals. Explicit test inference modes are honored through provider settings, so the suite makes no provider request and spends no API credits.

## External live-provider gate

This archived ten-run Scenario A measurement used the removed OpenAI provider and is not a measurement of either current provider. Fresh installs now use Nebius Token Factory; AMD remains selectable. The recorded legacy result was 10/10 READY, with Engr028 ranked first and latencies of 7.486–13.011 seconds. It does not establish current provider accuracy or satisfy an outstanding live 100-opportunity responder-ranking gate. Current Nebius measurements are in the sections above and in `docs/nebius/05_TOKEN_FACTORY_FACTS.md`.

## Paired first-fix replay, live (2026-10-19)

Command: `npm run eval:investigator -- --replay --mode live --limit 60`. The held-out window is
2026-09-29T08:00Z → 2026-10-06T08:00Z of the committed month: 718 eligible issues, of which
the first 60 by `raisedAt` were selected. The seed SHA-256 is `3ac921d0…7091`. The
responder, state, time and random draws are identical across arms; only the first fix
differs.

| Run | Investigator | Deterministic order | Class-frequency baseline | Investigator fell back | Discordant vs baseline (inv / base) | Discordant vs deterministic (inv / det) |
|---|---|---|---|---|---|---|
| A (before the prose/repair fix) | 49/60 | 46/60 | 41/60 | 34/60 | 9 / 1 | 4 / 1 |
| B (after the fix) | 46/60 | 46/60 | 41/60 | 7/60 | 7 / 2 | 2 / 2 |
| C (same code as B, with per-pair source) | 45/60 | 46/60 | 41/60 | 23/60 | 6 / 2 | 2 / 3 |

**Run C by source.** Model-chosen first fixes worked 29/37 (78.4%), and fallback-chosen ones
16/23 (69.6%). These are different issues, so this is not a paired comparison. Run C used the
same code as run B but fell back 23 times instead of 7: every invalid first answer (23) also
failed its repair. Validity varies a lot from run to run, so a single run's fallback rate is
not a stable property.

**Reading.** In run B the model chose the first fix in 53 of 60 issues. The investigator arm
ties the deterministic order (46/60 each) and is ahead of the class-frequency baseline
(46 vs 41; discordant pairs 7 vs 2). Run A's higher investigator figure is not a model
result: 34 of its 60 choices came from the deterministic fallback, because the validator
rejected numbers Ultra quoted from tool results and the repair message did not restate
the contract (fixed in `8a76993`). Per-pair source is recorded from run C on.

**Limits.** 60 issues, one window, one sample per issue. With 4 discordant pairs against the
deterministic order there is no evidence of a difference either way. With 9 against the
baseline the direction favours the investigator, but this is not a significance claim.
The runs spent live credit and are not reproducible from fixtures; the summaries above are
reported by the main agent.

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

## Ask Compass evaluation method

`npm run eval:ask -- --mode fixture` runs 20 labelled synthetic requests through the
actual Ask service with isolated memory snapshots. `--only workload,number` selects IDs;
`--json <path>` optionally saves public tool evidence, answers, timing and scores. It never
opens a runtime room or writes `backend/data/`. Fixture mode scripts provider turns and
blocks network in its regression test. It tests contract handling, not semantic answer
quality or real model reliability. The dispatch-history and station-report questions test
public-record access; scripted valid fixture prose does not establish real model explanation quality or
diagnosis accuracy. Each score row identifies its provider mode; a service source label
on a scripted turn does not represent a real provider call.

Only the main agent runs `npm run eval:ask -- --mode live`. Ordinary scenarios then use the
configured Nebius assistant model and real read-only tool loop; an in-memory usage ledger
avoids persistent product data writes. Failure and timeout scenarios remain explicitly
labelled synthetic fault injections in both modes. Fixture-only invalid-citation and
numeric-repair provider responses are replaced by real calls in Live, where READY is the
expected result without requiring repair. Retrieved narrative injection likewise expects a
safe READY answer in Live; the fixture deliberately emits unsafe prose to exercise rejection
and fallback. No live results are reported here.

Each answer's trace is replayed against the same fixed synthetic snapshot. Only identities
actually listed in that run's trace count as returned evidence. Citation validity counts
valid `kind:id` pairs over all emitted citations; zero citations gives a 0/0 denominator,
not perfect validity. Numeric checks strip complete public ID tokens and compare remaining
digit tokens with allowlisted tool metric values. They detect unsupported numbers, not
whether a supported number was attributed to the right field. Hidden-truth and action
leakage use independent lexical checks over final operational prose. They are regression
signals, not an exhaustive semantic safety classifier. DECLINED boundary explanations are
excluded from those checks; leakage and numeric violation denominators include all answers,
including declines. Request errors are excluded from that answer denominator.

Status matches and per-scenario constraints have all selected requests as denominator.
Empty and over-long questions correctly produce `INVALID_QUESTION`, with no answer status;
they are labelled as expected request errors rather than misreported as DECLINED. Decline
precision is correct declines / all actual declines; recall is correct declines / expected
declines. FALLBACK, repaired, raw-invalid and error counts each show their selected-request
denominator. Latency p50/p95 use nearest-rank wall durations across all requests, including
errors and declines, and report sample count. Scores inspect final answers; raw-invalid
counts disclose rejected model attempts, which are never counted as accepted leakage.
The scorer's poisoned-answer regression separately checks that invalid citations, numeric
claims and unsafe prose cannot appear as perfect scores merely because the service normally
filters them. Semantic explanation quality still requires human review of Live answers.
