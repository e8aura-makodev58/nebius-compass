/** Engine-only counterfactual boundary. Never return state, attempts, draws or profiles. */
import { createAttempt, settleAttempt, attemptProbability } from './attempt-engine.mjs';
import { fixById } from './fix-catalog.mjs';

const previousDraw = (value) => Math.imul((value - 1013904223) >>> 0, 4276115653) >>> 0;
/** Capture private inputs once; callers receive only a three-arm boolean evaluator. */
export function createReplayOutcomeRunner(seed) {
  const skills = structuredClone(seed.responderSkills);
  const causes = structuredClone(seed.faultTruth?.causes ?? {});
  const attempts = new Map((seed.resolutionAttempts ?? []).map((row) => [row.id, row]));
  const history = seed.resolutionHistory;
  return ({ decision, issueId, responderId, attemptId, fixes }) => {
    const original = attempts.get(attemptId);
    const target = decision.issues.find((row) => row.id === issueId);
    if (!original || !Number.isFinite(original.successDraw) || original.successDraw<0 || original.successDraw>=1 || !causes[issueId] || !target || !skills?.some((row)=>row.responderId===responderId&&row.issueClass===target.issueClass)) return null;
    // Reverse the engine LCG twice to replay the recorded duration/success draws exactly.
    const attemptSeed = previousDraw(previousDraw(Math.round(original.successDraw * 0x100000000)));
    const before = history.filter((row) => row.issueId!==issueId && Date.parse(row.resolvedAt)<Date.parse(target.raisedAt));
    const initial = { simulationState:{simulationTime:target.raisedAt,rngStreams:{attempt:attemptSeed}},
      responderSkills:skills, faultTruth:{version:1,causes:{[issueId]:causes[issueId]}},
      resolutionHistory:before, resolutionAttempts:[], assignments:[{id:'replay-primary',issueId,responderId,role:'PRIMARY',status:'ACTIVE'}] };
    return fixes.map((fixId) => {
      if (!fixById(target.issueClass,fixId)) return null;
      const state=structuredClone(initial);
      // This is an isolated engine experiment, not an approval or a dispatch mutation.
      state.issues=[{...structuredClone(target),status:'ASSIGNED',dispatchGate:'OPEN',fixRecommendation:{status:'READY',source:'REPLAY',createdAt:target.raisedAt,baselineFixId:fixId,rankedFixes:[{fixId}]}}];
      const attempt=createAttempt(state,issueId);
      state.simulationState.simulationTime=attempt.resolutionDueAt;
      settleAttempt(state,attempt);
      if (attempt.completedWork + 1e-9 < attempt.workTotal) throw new Error('Replay completion invariant');
      return {fixed:attempt.successDraw < attemptProbability(attempt)};
    });
  };
}
