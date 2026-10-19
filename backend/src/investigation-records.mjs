/** Public synthetic records; independent, id-seeded RNG streams never inspect skill. */
export const CERTIFICATIONS = Object.freeze(['ISOLATION', 'SPECIALIST-A', 'SPECIALIST-B', 'SPECIALIST-C']);
function seeded(id, namespace) {
  let value = 2166136261;
  for (const char of `${namespace}:${id}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 0x100000000);
}
export function certificationsFor(responderId) {
  const draw = seeded(responderId, 'public-certifications-v1');
  return CERTIFICATIONS.filter(() => draw() < 0.6);
}
export function templateNarrative(issue, { noisy = false } = {}) {
  const symptom = issue.symptom?.text || 'An intermittent operating deviation was reported.';
  if (!noisy) return symptom;
  const draw = seeded(issue.id, 'public-narrative-v1');
  const variant = Math.floor(draw() * 4);
  return [symptom, `Operator notes: ${symptom} The screen said transfer; that may be unrelated.`,
    symptom.replace(/intermittent/gi, 'intermitent').replace(/during/gi, 'durng'),
    `Observed: ${symptom.split(' ').slice(0, 5).join(' ')}… Details not recorded.`][variant];
}
export function ensureIssueNarrative(issue, { noisy = false } = {}) {
  if (typeof issue.reportNarrative !== 'string') {
    issue.reportNarrative = templateNarrative(issue, { noisy });
    issue.narrativeSource = noisy ? 'simulated' : 'template';
  }
  if (!['operator', 'simulated', 'template'].includes(issue.narrativeSource)) issue.narrativeSource = 'template';
}
export function migrateInvestigationRecords(state) {
  for (const responder of state.responders) responder.certifications ??= certificationsFor(responder.id);
  for (const issue of [...state.issues, ...(state.historyRetention?.facts?.issues ?? [])]) ensureIssueNarrative(issue);
  return state;
}
