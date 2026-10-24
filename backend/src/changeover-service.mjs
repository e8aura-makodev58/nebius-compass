/** Shared serialized entry and read-only readiness over one room snapshot. */
import { CHANGEOVER_FIELDS, validateChangeovers } from './changeover-records.mjs';
import { checkChangeoverReadiness } from './changeover-readiness.mjs';
import { cellReadiness } from './calibration-readiness.mjs';
import { cloneDraftValue } from './live-draft.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';
const invalid = () => Object.assign(new Error('Invalid or conflicting changeover'), { statusCode: 400, code: 'INVALID_CHANGEOVER' });
export function createChangeoverService(store) {
  return { async enter(input) {
    try { validateChangeovers([input]); cellReadiness([], input.cellId, input.startsAt); assertNoResponderSkill(input); } catch { throw invalid(); }
    const row = { ...input, startsAt: new Date(input.startsAt).toISOString() }, unchanged = new Error('Changeover unchanged');
    const transaction = await store.mutate('changeover-entry', state => {
      const previous = state.changeovers === undefined ? [] : cloneDraftValue(state.changeovers);
      validateChangeovers(previous);
      const prior = previous.find(item => item.changeoverId === row.changeoverId);
      if (prior) {
        if (!CHANGEOVER_FIELDS.every(key => prior[key] === row[key])) throw invalid();
        throw unchanged;
      }
      if (state.changeovers === undefined) state.changeovers = [row];
      else state.changeovers.push(row);
      return { decision: 'RECORDED', reasons: [] };
    }).catch(error => {
      if (error === unchanged) return { result: { decision: 'UNCHANGED', reasons: [] } };
      throw error;
    });
    return transaction.result;
  } };
}
export function buildChangeoverReadiness(state, changeoverId) {
  const rows = state.changeovers === undefined ? [] : state.changeovers; validateChangeovers(rows);
  const changeover = rows.find(row => row.changeoverId === changeoverId);
  if (!changeover) throw Object.assign(new Error('Unknown changeover'), { statusCode: 404, code: 'CHANGEOVER_NOT_FOUND' });
  const inventory = state.loadboardInventory === undefined ? { boards: [], reservations: [] } : state.loadboardInventory;
  const readiness = cellReadiness(state.calibrations === undefined ? [] : state.calibrations, changeover.cellId, changeover.startsAt);
  const result = checkChangeoverReadiness({ changeover, inventory, readiness, kitFacts: null, crewFacts: null });
  assertNoResponderSkill(result); return result;
}
