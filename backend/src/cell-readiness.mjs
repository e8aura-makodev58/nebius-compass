/** Explicit room read projection; no reconciliation, writes or clock advancement. */
import { cellReadiness, validateCalibrations } from './calibration-readiness.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';
export function buildCellReadiness(state, { roomId = null } = {}) {
  const rows = state.calibrations === undefined ? [] : state.calibrations;
  validateCalibrations(rows);
  const asOf = state.simulationState.simulationTime;
  // Validate the clock even for an empty room without manufacturing a cell.
  cellReadiness([], 'VALIDATE-CLOCK', asOf);
  const cells = [...new Set(rows.map(row => row.cellId))].sort().map(cellId => {
    const { readiness, reasons, instruments } = cellReadiness(rows, cellId, asOf);
    return { cellId, readiness, reasons, instruments };
  });
  const result = { roomId, asOf, cells }; assertNoResponderSkill(result); return result;
}
