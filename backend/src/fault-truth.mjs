import { ensureIssueNarrative } from './investigation-records.mjs';
/** Engine-only latent fault model. Never put these rows in an issue or audit bundle. */
import { fixesFor } from './fix-catalog.mjs';
const symptoms = {
  A: [['A-DRIFT', 'Output drifts from the operating reference.'], ['A-UNSTABLE', 'Output readings fluctuate during a cycle.'], ['A-INTERRUPT', 'Output is interrupted intermittently.']],
  B: [['B-SLOW', 'Transfer progresses intermittently.'], ['B-STOP', 'Transfer stops before the expected endpoint.'], ['B-IRREGULAR', 'Transfer spacing becomes irregular.']],
  C: [['C-UNSTABLE', 'The mechanism moves inconsistently.'], ['C-MISMATCH', 'Movement and detection disagree during a cycle.'], ['C-INTERRUPT', 'The cycle is interrupted intermittently.']],
};
const privateCauses = Object.fromEntries(['A', 'B', 'C'].map((kind) => [kind, [0, 1, 2, 3].map((i) => `hidden-cause-${kind}-${i}`)]));
// Rows are causes; columns are the public catalog order. Only this engine module reads them.
const effectiveness = [
  [[1.12, .80], [.40, 1.40], [.55, 1.20], [.70, 1.10], [.75, 1.05], [.65, 1.15]],
  [[.45, 1.35], [1.15, .78], [.60, 1.20], [.70, 1.10], [.55, 1.30], [.80, 1.00]],
  [[.55, 1.25], [.55, 1.30], [1.12, .82], [.80, 1.05], [.65, 1.15], [.65, 1.15]],
  [[.65, 1.15], [.60, 1.20], [.70, 1.15], [1.10, .85], [.90, 1.00], [.95, .95]],
];
function draw(state) {
  state.simulationState.rngStreams.fault ??= 0x4fa17;
  const next = (Math.imul(1664525, state.simulationState.rngStreams.fault) + 1013904223) >>> 0;
  state.simulationState.rngStreams.fault = next;
  return next / 0x100000000;
}
export function ensureIssueFault(state, issue) {
  if (!issue || issue.status === 'RESOLVED') return;
  state.faultTruth ??= { version: 1, causes: {} };
  if (Object.hasOwn(state.faultTruth.causes, issue.id)) return;
  const hash = [...issue.equipmentId].reduce((v, c) => v + c.charCodeAt(0), 0);
  const weights = [4, 3, 2, 1].map((w, i, all) => all[(i + hash % 4) % 4]);
  let selected = draw(state) * weights.reduce((a, b) => a + b, 0), causeIndex = 0;
  while (causeIndex < 3 && (selected -= weights[causeIndex]) >= 0) causeIndex++;
  state.faultTruth.causes[issue.id] = privateCauses[issue.issueClass][causeIndex];
  // Observable symptoms overlap: informative but never a unique diagnosis.
  const symptomIndex = draw(state) < .78 ? causeIndex % 3 : (causeIndex + 1) % 3;
  const [code, text] = symptoms[issue.issueClass][symptomIndex];
  issue.symptom = { code, text };
  ensureIssueNarrative(issue);
}
export function initializeFaults(state, { recover = false } = {}) {
  for (const issue of state.issues) {
    ensureIssueFault(state, issue);
    if (recover && issue.fixRecommendation?.status === 'PENDING_MODEL') {
      issue.fixRecommendation.status = 'INTERRUPTED'; issue.fixRecommendation.modelAttempted = false; delete issue.fixRecommendation.requestToken;
    }
  }
  return state;
}
export function faultEffect(state, issue, fixId) {
  const index = privateCauses[issue.issueClass].indexOf(state.faultTruth?.causes[issue.id]);
  const fixIndex = fixesFor(issue.issueClass).findIndex((r) => r.id === fixId);
  if (index < 0 || fixIndex < 0) throw new Error('Missing private fault model or applied fix');
  const [successMultiplier, durationMultiplier] = effectiveness[index][fixIndex];
  return { successMultiplier, durationMultiplier };
}
export function validateFaultTruth(state) {
  if (!state.faultTruth) return;
  const rng = state.simulationState.rngStreams.fault;
  if (!Number.isInteger(rng) || rng < 0 || rng > 0xffffffff) throw new Error('Invalid fault RNG stream');
  if (state.faultTruth.version !== 1 || typeof state.faultTruth.causes !== 'object') throw new Error('Invalid private fault state');
  for (const issue of state.issues.filter((i) => i.status !== 'RESOLVED')) {
    if (!privateCauses[issue.issueClass].includes(state.faultTruth.causes[issue.id]) || !symptoms[issue.issueClass].some(([code]) => code === issue.symptom?.code)) throw new Error('Invalid private fault assignment');
  }
}
export function assertNoFaultTruth(value) {
  const text = JSON.stringify(value);
  if (/"(?:faultTruth|faultCause|causeId|hiddenEffectiveness|successMultiplier|durationMultiplier)"|hidden-cause-/i.test(text)) throw new Error('Hidden fault truth crossed a public boundary');
}
