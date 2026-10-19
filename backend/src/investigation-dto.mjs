/** Investigation boundary: explicit public fields only, never state-row spreads. */
import { fixById } from './fix-catalog.mjs';
import { CERTIFICATIONS, certificationsFor, templateNarrative } from './investigation-records.mjs';
import { ROTATION_ANCHOR } from './workforce-continuity.mjs';
import { calculateDistance, calculateFloorDelta } from './context-engine.mjs';

const text = (value, max = 600) => typeof value === 'string' ? value.slice(0, max) : '';
const number = (value) => Number.isFinite(value) ? value : null;
export function cutoffTime(asOf) {
  if (typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf))) throw new Error('Invalid decision cutoff');
  return Date.parse(asOf);
}
export function completedBefore(value, asOf) { return Number.isFinite(Date.parse(value)) && Date.parse(value) < cutoffTime(asOf); }
export function observationsBefore(state, { asOf, targetIssueId } = {}) {
  cutoffTime(asOf);
  return (state.resolutionHistory ?? []).filter((row) => row.issueId !== targetIssueId && completedBefore(row.resolvedAt, asOf));
}
export function createCaseDTO(issue, observations) {
  const records = observations.filter((row) => row.issueId === issue.id).sort((a, b) => Date.parse(a.resolvedAt) - Date.parse(b.resolvedAt) || String(a.id).localeCompare(String(b.id)));
  const fixesTried = [];
  for (const row of records) {
    if (!row.legacyFix && fixById(issue.issueClass, row.fixApplied?.id)) fixesTried.push({
      fixId: row.fixApplied.id, order: fixesTried.length + 1, outcome: row.success === true ? 'FIXED' : 'NOT_FIXED',
    });
  }
  const legacy = !records.length || records.some((row) => row.legacyFix || !fixById(issue.issueClass, row.fixApplied?.id));
  const elapsed = (Date.parse(issue.resolvedAt) - Date.parse(issue.raisedAt)) / 60000;
  return {
    caseId: `CASE-${text(issue.id, Infinity)}`, equipmentId: text(issue.equipmentId, 120), issueClass: text(issue.issueClass, 1),
    symptomCode: text(issue.symptom?.code, 80), symptomText: text(issue.symptom?.text),
    reportNarrative: text(issue.reportNarrative ?? templateNarrative(issue)),
    narrativeSource: ['operator', 'simulated', 'template'].includes(issue.narrativeSource) ? issue.narrativeSource : 'template',
    fixesTried, resolvedAt: text(issue.resolvedAt, 40),
    firstTimeFix: legacy ? null : records.length === 1 && records[0].success === true,
    totalMinutes: number(elapsed >= 0 ? elapsed : NaN), legacy,
  };
}
export function casesBefore(state, { asOf, targetIssueId } = {}) {
  const observations = observationsBefore(state, { asOf, targetIssueId });
  const byIssue = new Map();
  for (const row of observations) {
    if (!byIssue.has(row.issueId)) byIssue.set(row.issueId, []);
    byIssue.get(row.issueId).push(row);
  }
  const issues = new Map();
  for (const row of [...(state.historyRetention?.facts?.issues ?? []), ...(state.issues ?? [])]) {
    if (row.id !== targetIssueId && row.status === 'RESOLVED' && completedBefore(row.resolvedAt, asOf)) issues.set(row.id, row);
  }
  return [...issues.values()].map((row) => createCaseDTO(row, byIssue.get(row.id) ?? []))
    .sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt) || a.caseId.localeCompare(b.caseId));
}
export function createFixDTO(fix) {
  return { fixId: text(fix.id, 80), title: text(fix.title, 80), steps: text(fix.steps, 320),
    safetyClass: fix.safetyClass, prerequisites: fix.prerequisites.map((value) => text(value, 40)),
    requiredCertifications: fix.requiredCertifications.map((value) => text(value, 40)) };
}
export function createResponderDTO(responder, { observations = [], issueClass, equipment, asOf } = {}) {
  const rows = observations.filter((row) => row.issueClass === issueClass &&
    (row.responderId === responder.id || row.participants?.some((participant) => participant.responderId === responder.id)));
  const distance = equipment ? calculateDistance(responder, equipment) : null;
  const shiftMs = 12 * 3600000;
  const anchor = Date.parse(ROTATION_ANCHOR);
  const endsAt = responder.extensionEndsAt ?? (responder.surgeKind === 'CALL_IN' && responder.dutyStartedAt
    ? new Date(Date.parse(responder.dutyStartedAt) + shiftMs).toISOString()
    : asOf ? new Date(anchor + (Math.floor((cutoffTime(asOf) - anchor) / shiftMs) + 1) * shiftMs).toISOString() : null);
  return { responderId: text(responder.id, 120), displayName: text(responder.name, 120),
    certifications: CERTIFICATIONS.filter((cert) => (responder.certifications ?? certificationsFor(responder.id)).includes(cert)),
    availability: ['AVAILABLE', 'OFFERED', 'ASSIGNED', 'UNAVAILABLE'].includes(responder.availability) ? responder.availability : 'UNAVAILABLE',
    shiftEndsAt: endsAt ? text(endsAt, 40) : null,
    distanceBand: distance === null ? 'UNKNOWN' : calculateFloorDelta(responder, equipment) > 0 ? 'OTHER_FLOOR' : distance <= 50 ? 'NEAR' : 'FAR',
    sameIssueHistoricalCount: rows.length, soloHistoricalCount: rows.filter((row) => !row.assisted).length,
    assistedHistoricalCount: rows.filter((row) => row.assisted === true).length };
}
export function createEquipmentDTO(equipment, cases) {
  return { equipmentId: text(equipment.id, 120), name: text(equipment.name, 120), floor: number(equipment.floor),
    issueClasses: ['A', 'B', 'C'], recentCaseCount: cases.filter((row) => row.equipmentId === equipment.id).length };
}
