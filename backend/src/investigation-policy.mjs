/** Room-owned investigation policy, independent sampling and durable deadline claims. */
export const INVESTIGATION_POLICIES = Object.freeze(['OPERATOR', 'AUTO_APPROVE_SAFE']);
export function ensureInvestigationPolicy(state) {
  state.investigationPolicy ??= {};
  const policy = state.investigationPolicy;
  policy.investigationApproval ??= 'OPERATOR';
  policy.investigationDeadlineMinutes ??= 30;
  policy.investigationShare ??= 0.2;
  policy.revision ??= 0;
  state.simulationState.rngStreams.investigation ??= 0x19a63;
  return policy;
}
export function sampleInvestigation(state) {
  const policy = ensureInvestigationPolicy(state);
  const next = (Math.imul(1664525, state.simulationState.rngStreams.investigation) + 1013904223) >>> 0;
  state.simulationState.rngStreams.investigation = next;
  return next / 0x100000000 < policy.investigationShare;
}
export function scheduleInvestigationDeadline(state, row) {
  const policy = ensureInvestigationPolicy(state);
  row.readyAt ??= state.simulationState.simulationTime;
  row.deadline ??= new Date(Date.parse(row.readyAt) + policy.investigationDeadlineMinutes * 60000).toISOString();
  if (!row.deadlineToken && !row.deadlineDispatchToken) row.deadlineToken = `investigation-deadline-${row.id}`;
}
export function clearInvestigationDeadline(row) {
  row.deadlineToken = null;
  row.deadlineDispatchToken = null;
}
export function claimInvestigationDeadlines(state) {
  if (state.simulationState.status !== 'RUNNING') return [];
  const now = Date.parse(state.simulationState.simulationTime);
  const triggers = [];
  for (const row of state.investigations ?? []) {
    if (row.status !== 'READY' || !row.deadlineToken || Date.parse(row.deadline) > now) continue;
    row.deadlineDispatchToken = row.deadlineToken;
    row.deadlineToken = null;
    triggers.push({kind:'INVESTIGATION_DEADLINE_DUE', investigationId:row.id, token:row.deadlineDispatchToken});
  }
  return triggers;
}
