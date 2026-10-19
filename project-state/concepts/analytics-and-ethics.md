# Concept: analytics & fairness rules

Analytics are computed by `analytics-service.mjs` as a **fixed snapshot** over Live state,
and rendered in the Analytics tab. The rules below are deliberate and must be preserved —
they keep the metrics honest and prevent the analytics from becoming an employee-ranking
tool.

## Statistical honesty

- **Rates always carry denominators.** A rate is never shown without the count it was
  computed from.
- **Thin samples are suppressed.** A rate computed from fewer than three observations is
  shown as **Insufficient data**, not as a misleadingly precise number.
- **Snapshots are fixed.** A snapshot is computed at a point in time with stable
  denominators, so a figure does not shift underneath the reader mid-view.

## Fairness

- **Issue-Class Experience is not a leaderboard.** It is alphabetically ordered, emphasizes
  cases handled, and is explicitly not a ranking of employees.
- **No history is not a penalty.** A responder with no prior history in an issue class
  remains fully eligible; absence of data is not treated as poor performance.
- **Excluded from Compass entirely:** compensation, seniority, demographics, biometrics,
  personality, fatigue, disciplinary data, and general HR scoring. Compass ranks on
  operational evidence (proximity/travel time, same-class success and reopen history,
  evidence strength and sample size) only.

## Relationship to hidden truth

Analytics select **observed operational facts** from canonical state and compact retained
facts. They never load archives on a request. Exact weighted evidence, reduction order,
coverage boundaries, issue downtime intervals and disagreement facts survive archiving;
retained/unretained engine runs are tested for exact analytics equality. The hidden `ResponderSkill` and the
per-attempt hidden numbers never reach the analytics layer, exactly as they never reach the
UI or the models. See
[../backend/domain-model.md](../backend/domain-model.md#invariant-responderskill-is-hidden-truth)
and [agent-boundary.md](agent-boundary.md).

## Baseline comparison

Analytics also surface where Compass **disagreed** with the deterministic baselines
(nearest-available and the `naive-score-v1` formula in `BASELINE_CONFIG`), and along which
dimension (travel time, observed performance, evidence strength, or a qualitative
tradeoff). This is what makes the agent's added value auditable rather than assumed.

## Fix analytics

First-time fix rate is successful **first completed attempts** divided by all completed
first attempts with an applied catalog fix. A prior legacy attempt prevents a later try
being counted as first-time; legacy outcomes are excluded from fix evidence. Agreement
compares each completed recommendation's first proposed fix with the most frequently
applied fix for its class (catalog tie order). It is not a causal comparison of outcomes;
a late recommendation can differ from the fix already applied. Rates retain denominators
and the fewer-than-three suppression rule. Period membership uses observed completion
or recommendation timestamps and the existing UTC boundaries. Canonical observations and
compact issue recommendation facts preserve exact archived/unarchived equality.

## Issue Pareto

`buildParetoAnalytics` (`backend/src/pareto-analytics.mjs`) ranks where the issues,
downtime and failed attempts in one period come from: issue class (shown with a readable
name, e.g. "Material transfer (Class B)") → public observed symptom → applied catalog fix,
or floor → station. Issues count by `raisedAt` in the period; downtime is each issue's
downtime inside the period, **summed per issue** (overlapping issues on one station each
count, unlike the union used for period downtime); failed attempts and the applied-fix
level count completed attempts by `resolvedAt`. Issues and attempts from before symptoms
existed fall into "Symptom not recorded (earlier records)". It reads only public records
through `analyticHistory`, so archived and unarchived history give the same result
(tested); the private fault cause and `ResponderSkill` are never read. It is a
description of recorded work, not a ranking of people or a causal claim about fixes.

## Staffing decisions

`workforce.recommendations` counts approved-top, approved-alternative, rejected, expired,
auto-approved, stale and superseded recommendations from compact terminal `staffingAudit`
facts. Each outcome uses all terminal decisions as denominator; baseline agreement uses
terminal decisions with a supplied top and comparator, including deterministic fallback
rankings (it is agreement, not evidence that AMD caused better outcomes). Unmet risk is an
event count, not unique incidents. Every rate uses the shared fewer-than-three suppression.
These canonical compact facts survive hot-detail pruning and issue archiving exactly.
Observed staffing experience is contextual backlog evidence, never an employee leaderboard;
no skill, hidden causes, HR fields or pay enter packets or analytics.

Every hour/day/week/month period also contains `staffingRecommendations`, grouped by the
terminal decision or risk timestamp with the existing UTC half-open period boundaries.
The shared period selector drives a locally scrolling outcome-count/denominator table;
period baseline rates use the same thin-sample suppression. Staffing-action totals now
count applied approvals plus legacy extension/call-in actions, not pending review rows.


## Investigation analytics

`/analytics.investigations` (also each period) contains `total`, `byOutcome`, `approvalRate`,
`overrideRate`, `abstentionRate`, `firstFixComparison` and a human-readable `definition`.
Counts include QUEUED/RUNNING/FAILED/READY/APPROVED/OVERRIDDEN/REJECTED/EXPIRED/ABSTAINED/
ESCALATED/AUTO_APPROVED/SUPERSEDED. Outcomes use current status at snapshot; period cohorts
use last status transition, unaffected by feedback. Decision rates use their decision time;
first-fix observations use completion time. Future observations are excluded.

Each rate is `{numerator, denominator, rate, status}`; fewer than three observations yields
null/INSUFFICIENT_DATA. Approval and override share the denominator of dispatched decisions
(APPROVED/AUTO_APPROVED/OVERRIDDEN); approval includes automatic approval. Abstention uses
all evaluated READY/ABSTAINED/ESCALATED results, preserving the original result after decisions.

`firstFixComparison` contains `issues`, `investigator`, `classFrequencyBaseline`,
`baselineAgreement`, `definition`. Its cohort is completed first attempts using an approved
investigator first choice (excluding overrides/alternatives/legacy attempts). Class-frequency
baseline is frozen at run start from strictly earlier nonlegacy same-class fix observations,
catalog order breaking ties. Baseline uses the same issue denominator, with `observed` and
`unobserved` counts. An alternative fix's outcome is not observed: any such missing outcome
suppresses its rate with COUNTERFACTUAL_NOT_OBSERVED. No hidden fault/skill data is consulted
and no improvement claim follows from this descriptive comparison. Paired replay must provide
counterfactual evidence separately. Compact facts preserve every count/rate and period across
retention; full archived run/report detail remains available for audits.
