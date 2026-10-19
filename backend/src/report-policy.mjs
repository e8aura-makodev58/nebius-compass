/** Versioned deterministic input policy and public symptom registry. No hidden truth. */
export const REPORT_POLICY_VERSION = 'field-report-policy-v1';
export const SYMPTOMS = Object.freeze({
  A: [['A-DRIFT', 'Output drifts from the operating reference.'], ['A-UNSTABLE', 'Output readings fluctuate during a cycle.'], ['A-INTERRUPT', 'Output is interrupted intermittently.']],
  B: [['B-SLOW', 'Transfer progresses intermittently.'], ['B-STOP', 'Transfer stops before the expected endpoint.'], ['B-IRREGULAR', 'Transfer spacing becomes irregular.']],
  C: [['C-UNSTABLE', 'The mechanism moves inconsistently.'], ['C-MISMATCH', 'Movement and detection disagree during a cycle.'], ['C-INTERRUPT', 'The cycle is interrupted intermittently.']],
});
const hazards = /\b(?:heat|hot|overheat\w*|smoke|sparks?|injur\w*|fire|burning|bypass\w*)\b|\boverride\s+(?:the\s+)?interlock\b/gi;
const injections = /ignore\s+(?:all\s+)?previous(?:\s+instructions)?|<\/?(?:system|assistant|tool|user)>|\[\/?INST\]|tool_calls?|\bassign\s+R-[\w-]+/gi;
export function reportPolicy(narrative) {
  const value = typeof narrative === 'string' ? narrative : '';
  const hazard = [...value.matchAll(hazards)].slice(0, 12).map((match) => match[0].slice(0, 80));
  const injection = [...value.matchAll(injections)].slice(0, 12).map((match) => match[0].slice(0, 80));
  const words = value.match(/\p{L}{2,}/gu) ?? [];
  const letters = (value.match(/\p{L}/gu) ?? []).length;
  const input = !value.trim() ? 'empty' : value.length > 600 ? 'over-600-chars' : words.length < 3 || letters / value.length < 0.5 ? 'garbled' : null;
  return { version: REPORT_POLICY_VERSION, hazard, injection, input };
}
export function equipmentMatches(state, narrative, equipmentId) {
  if (equipmentId) return state.equipment.filter((row) => row.id === equipmentId);
  const ids = new Set([...narrative.matchAll(/\b(?:EQ[- ]?|station\s+)(\d{1,3})\b/gi)].map((match) => `EQ-${match[1].padStart(2,'0')}`));
  return state.equipment.filter((row) => ids.has(row.id) || narrative.toLowerCase().includes(row.name.toLowerCase() + ' '));
}
export function interpretationOptions(state, narrative, equipmentId) {
  const tokens = new Set(narrative.toLowerCase().match(/[a-z]+/g) ?? []);
  const options = equipmentMatches(state, narrative, equipmentId).flatMap((equipment) => Object.entries(SYMPTOMS).flatMap(([issueClass, rows]) => rows.map(([symptomCode,symptomText]) => {
    const score = (symptomText.toLowerCase().match(/[a-z]+/g) ?? []).reduce((sum, word) => sum + (tokens.has(word) ? 1 : 0), 0);
    return { optionId: `OPT-${equipment.id}-${symptomCode}`, equipmentId: equipment.id, equipmentName: equipment.name,
      issueClass, symptomCode, symptomText, rationale: 'Ordered by overlap with the reported observations.', score };
  }))).sort((a,b) => b.score-a.score || a.optionId.localeCompare(b.optionId)).slice(0,12);
  return options.map(({score,...row}) => row);
}
export function validInterpretation(state, input) {
  return state.equipment.some((row) => row.id === input?.equipmentId) &&
    (Object.hasOwn(SYMPTOMS, input?.issueClass ?? '') ? SYMPTOMS[input.issueClass] : []).some(([code]) => code === input.symptomCode);
}
