/** Explicit immutable planned-changeover facts; no reservation or scheduling. */
import { validateChangeoverRecord } from './changeover-readiness.mjs';
export const CHANGEOVER_FIELDS = ['changeoverId', 'cellId', 'targetProgramRevision', 'startsAt'];
export function validateChangeovers(rows, previous = []) {
  if (!Array.isArray(rows) || !Array.isArray(previous)) throw new TypeError('Invalid changeovers: arrays');
  const ids = new Set();
  for (const row of rows) {
    validateChangeoverRecord(row);
    if (ids.has(row.changeoverId)) throw new TypeError('Invalid changeovers: duplicate changeoverId');
    ids.add(row.changeoverId);
  }
  if (rows.length < previous.length || previous.some((row, index) => CHANGEOVER_FIELDS.some(key => row[key] !== rows[index][key]))) throw new TypeError('Invalid changeovers: append-only history');
}
