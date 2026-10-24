/** Serialized manual calibration entry and explicit room ledger projection. */
import { validateCalibrations } from './calibration-readiness.mjs';
import { cloneDraftValue } from './live-draft.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';
const invalid = () => Object.assign(new Error('Invalid calibration request'), { statusCode: 400, code: 'INVALID_CALIBRATION_REQUEST' });
const canonical = row => ({ calibrationId: row.calibrationId, cellId: row.cellId, instrumentId: row.instrumentId,
  calibratedAt: new Date(row.calibratedAt).toISOString(), dueAt: new Date(row.dueAt).toISOString() });
export function createCalibrationService(store) {
  return { async enter(input) {
    try { validateCalibrations([input]); assertNoResponderSkill(input); } catch { throw invalid(); }
    const row = canonical(input);
    const transaction = await store.mutate('calibration-entry', state => {
      const rows = state.calibrations === undefined ? [] : cloneDraftValue(state.calibrations);
      validateCalibrations(rows);
      try { validateCalibrations([...rows, row]); } catch { throw invalid(); }
      const prior = rows.find(item => item.calibrationId === row.calibrationId);
      if (prior) return { decision: 'UNCHANGED', reasons: [] };
      if (state.calibrations === undefined) state.calibrations = [row];
      else state.calibrations.push(row);
      return { decision: 'RECORDED', reasons: [] };
    });
    return transaction.result;
  } };
}
export function buildCalibrations(state, { roomId = null } = {}) {
  const rows = state.calibrations === undefined ? [] : state.calibrations;
  validateCalibrations(rows);
  const asOf = state.simulationState.simulationTime, instant = Date.parse(asOf);
  if (!Number.isFinite(instant)) throw new TypeError('Invalid calibration snapshot time');
  const calibrations = rows.map(source => {
    const row = canonical(source);
    return { ...row, state: Date.parse(row.calibratedAt) > instant ? 'FUTURE' : Date.parse(row.dueAt) <= instant ? 'EXPIRED' : 'CURRENT' };
  }).sort((a, b) => a.cellId < b.cellId ? -1 : a.cellId > b.cellId ? 1 : a.instrumentId < b.instrumentId ? -1 : a.instrumentId > b.instrumentId ? 1 : a.calibratedAt < b.calibratedAt ? -1 : a.calibratedAt > b.calibratedAt ? 1 : a.calibrationId < b.calibrationId ? -1 : a.calibrationId > b.calibrationId ? 1 : 0);
  const result = { roomId, asOf, calibrations }; assertNoResponderSkill(result); return result;
}
