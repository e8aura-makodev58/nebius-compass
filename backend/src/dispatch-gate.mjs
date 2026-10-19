/** Single application-owned authorization check shared by every assignment writer. */
import { fixById } from './fix-catalog.mjs';
export function approvedInvestigation(state, issue) {
  return (state.investigations ?? []).findLast((row) => row.issueId === issue?.id && ['APPROVED','OVERRIDDEN','AUTO_APPROVED'].includes(row.status));
}
export function assertDispatchAuthorized(state, issue, responderId, purpose = 'INITIAL_ASSIGNMENT') {
  if (issue?.dispatchGate !== 'INVESTIGATION') return true;
  const investigation = approvedInvestigation(state, issue);
  const decision = investigation?.decision;
  const responder = state.responders.find((row) => row.id === responderId);
  const fix = fixById(issue.issueClass, decision?.authorizedFixId);
  if (!decision || !['APPROVED','OVERRIDDEN','AUTO_APPROVED'].includes(decision.status) || decision.authorizedResponderId !== responderId || decision.responderId !== responderId || decision.fixId !== decision.authorizedFixId || !fix) return false;
  if (!fix.requiredCertifications.every((cert) => responder?.certifications?.includes(cert)) ||
      !fix.prerequisites.every((step) => decision.confirmedPrerequisites?.includes(step))) return false;
  // Authorization is for one initial attempt, never a support slot or failed-attempt rematch.
  if (purpose === 'ASSISTANCE' || purpose === 'SUPPORT' || purpose === 'TRANSFER' || decision.attemptId) return false;
  return true;
}
export function gatedResult() { return { status: 'GATED', reason: 'INVESTIGATION_APPROVAL_REQUIRED' }; }
