import { approvedInvestigation } from './dispatch-gate.mjs';
/** Observed fix evidence only. Does not import or inspect the latent model. */
import { fixesFor, FIX_CATALOG_VERSION, fixById } from './fix-catalog.mjs';
function median(rows) {
  const nums = rows.map((r) => r.resolutionMinutes).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  return nums.length % 2 ? nums[(nums.length - 1) / 2] : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2;
}
function summary(rows) {
  return { attempts: rows.length, successes: rows.filter((r) => r.success).length,
    firstAttempts: rows.filter((r) => r.fixAttemptNumber === 1).length,
    firstTimeSuccesses: rows.filter((r) => r.fixAttemptNumber === 1 && r.success).length,
    smoothedSuccess: (rows.filter((r) => r.success).length + 1) / (rows.length + 2),
    medianMinutes: median(rows), lastUsed: rows.map((r) => r.resolvedAt).filter(Boolean).sort().at(-1) ?? null };
}
export function buildFixPacket(state, issueId) {
  const issue = state.issues.find((i) => i.id === issueId);
  if (!issue?.symptom) return null;
  const observations = state.resolutionHistory.filter((r) => r.fixApplied?.id && !r.legacyFix && r.issueClass === issue.issueClass);
  return { schemaVersion: '1.0', catalogVersion: FIX_CATALOG_VERSION, issueId,
    issueClass: issue.issueClass, equipmentId: issue.equipmentId, symptom: issue.symptom,
    candidates: fixesFor(issue.issueClass).map((fix) => {
      const records = observations.filter((r) => r.fixApplied.id === fix.id);
      return { fixId: fix.id, title: fix.title, steps: fix.steps, sameClass: summary(records),
        sameSymptom: summary(records.filter((r) => r.symptomCode === issue.symptom.code)),
        sameEquipment: summary(records.filter((r) => r.equipmentId === issue.equipmentId)) };
    }) };
}
export function fallbackFixOrder(packet) {
  return [...packet.candidates].sort((a, b) => b.sameSymptom.smoothedSuccess - a.sameSymptom.smoothedSuccess || b.sameSymptom.attempts - a.sameSymptom.attempts || packet.candidates.indexOf(a) - packet.candidates.indexOf(b)).map((row, i) => ({ fixId: row.fixId, rank: i + 1, rationale: 'Ordered by smoothed observed success for this symptom, then evidence count and catalog order.' }));
}
export function baselineFix(packet) { return [...packet.candidates].sort((a, b) => b.sameClass.attempts - a.sameClass.attempts || packet.candidates.indexOf(a) - packet.candidates.indexOf(b))[0].fixId; }
export function deterministicFixRecommendation(state, issue, reason = 'model-not-ready') {
  const packet = buildFixPacket(state, issue.id);
  const rankedFixes = fallbackFixOrder(packet);
  return { status: 'FALLBACK', source: 'DETERMINISTIC', reason, createdAt: state.simulationState.simulationTime,
    packet, rankedFixes, fallbackFixId: rankedFixes[0].fixId, baselineFixId: baselineFix(packet), disagreement: rankedFixes[0].fixId !== baselineFix(packet) };
}
export function selectAttemptFix(state, issue) {
  if (issue.dispatchGate === 'INVESTIGATION') {
    const investigation = approvedInvestigation(state, issue);
    const decision = investigation?.decision;
    const fix = fixById(issue.issueClass, decision?.authorizedFixId);
    if (!fix || decision.attemptId) throw new Error('Investigation approval required');
    return { fixApplied: { ...fix }, fixAttemptNumber: state.resolutionHistory.filter((r) => r.issueId === issue.id).length + 1,
      fixDecision: { source: investigation.source, reason: 'INVESTIGATION_APPROVED', recommendedFixId: fix.id,
        baselineFixId: fix.id, baselineAgreement: true, ranking: [fix.id], rankedAt: decision.at } };
  }
  const recommendation = issue.fixRecommendation ??= deterministicFixRecommendation(state, issue);
  const used = new Set(state.resolutionHistory.filter((r) => r.issueId === issue.id && r.fixApplied).map((r) => r.fixApplied.id));
  const candidates = recommendation.status === 'PENDING_MODEL' ? fallbackFixOrder(recommendation.packet) : recommendation.rankedFixes;
  const selected = candidates.find((r) => !used.has(r.fixId)) ?? candidates[0];
  const fix = fixById(issue.issueClass, selected.fixId);
  const fixAttemptNumber = state.resolutionHistory.filter((r) => r.issueId === issue.id).length + 1;
  return { fixApplied: { ...fix }, fixAttemptNumber,
    fixDecision: { source: recommendation.status === 'PENDING_MODEL' ? 'DETERMINISTIC' : recommendation.source,
      reason: recommendation.status === 'PENDING_MODEL' ? 'model-not-ready' : recommendation.reason ?? null,
      recommendedFixId: candidates[0].fixId, baselineFixId: recommendation.baselineFixId,
      baselineAgreement: candidates[0].fixId === recommendation.baselineFixId,
      ranking: candidates.map((r) => r.fixId), rankedAt: recommendation.createdAt } };
}
