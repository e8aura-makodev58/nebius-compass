/** Deterministic facts for one planned changeover; no scheduling or mutations. */
import { validateLoadboardInventory } from './loadboard-checkout.mjs';
function requireValue(ok, label) { if (!ok) throw new TypeError(`Invalid changeover readiness: ${label}`); }
function fields(row, keys) {
  requireValue(row && (Object.getPrototypeOf(row) === Object.prototype || Object.getPrototypeOf(row) === null)
    && Reflect.ownKeys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key)), 'fields');
}
function text(value) { requireValue(typeof value === 'string' && value.length > 0 && value.length <= 120 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value), 'identifier'); }
function time(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), 'timestamp');
  const at = Date.parse(value);
  requireValue(Number.isFinite(at) && new Date(at).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')), 'timestamp');
  return at;
}
function validateReadiness(readiness, changeover) {
  fields(readiness, ['cellId', 'at', 'readiness', 'reasons', 'instruments']);
  requireValue(readiness.cellId === changeover.cellId && time(readiness.at) === time(changeover.startsAt), 'readiness cell/time mismatch');
  requireValue(['READY', 'EXPIRED', 'NO_CALIBRATION'].includes(readiness.readiness), 'readiness status');
  requireValue(Array.isArray(readiness.reasons) && readiness.reasons.every(reason => typeof reason === 'string' && /^[A-Z][A-Z0-9_]*$/.test(reason)), 'readiness reasons');
  requireValue(Array.isArray(readiness.instruments), 'instruments');
  const ids = new Set();
  for (const row of readiness.instruments) {
    fields(row, ['instrumentId', 'calibrationId', 'dueAt', 'state']); text(row.instrumentId); text(row.calibrationId); time(row.dueAt);
    requireValue(['CURRENT', 'EXPIRED'].includes(row.state) && !ids.has(row.instrumentId), 'instrument state/identity'); ids.add(row.instrumentId);
  }
}
export function validateChangeoverRecord(changeover) {
  fields(changeover, ['changeoverId', 'cellId', 'targetProgramRevision', 'startsAt']);
  for (const key of ['changeoverId', 'cellId', 'targetProgramRevision']) text(changeover[key]);
  time(changeover.startsAt);
}
export function checkChangeoverReadiness(input) {
  fields(input, ['changeover', 'inventory', 'readiness', 'kitFacts', 'crewFacts']);
  const { changeover, inventory, readiness, kitFacts, crewFacts } = input;
  validateChangeoverRecord(changeover);
  validateLoadboardInventory(inventory); validateReadiness(readiness, changeover);
  requireValue(kitFacts === null && crewFacts === null, 'kitFacts/crewFacts must be null in slice 1');
  const heldByBoard = new Map();
  for (const reservation of inventory.reservations) if (reservation.status === 'HELD') {
    if (!heldByBoard.has(reservation.boardId)) heldByBoard.set(reservation.boardId, []);
    heldByBoard.get(reservation.boardId).push(reservation);
  }
  const board = inventory.boards.filter(row => {
    if (row.condition !== 'SERVICEABLE' || !row.approvedPrograms.includes(changeover.targetProgramRevision)) return false;
    const holds = heldByBoard.get(row.boardId) ?? [];
    if (row.cellId === null) return holds.length === 0;
    return row.cellId === changeover.cellId && holds.length > 0 && holds.every(hold => hold.cellId === changeover.cellId);
  }).sort((a, b) => a.boardId < b.boardId ? -1 : a.boardId > b.boardId ? 1 : 0)[0];
  const checks = [
    { check: 'LOADBOARD_AVAILABLE', result: board ? 'PASS' : 'FAIL', reasons: board ? [] : ['NO_COMPATIBLE_LOADBOARD'], ...(board ? { boardId: board.boardId } : {}) },
    { check: 'CELL_READY', result: readiness.readiness === 'READY' ? 'PASS' : 'FAIL', reasons: readiness.readiness === 'READY' ? [] : ['CELL_NOT_READY'] },
    { check: 'KIT_AVAILABLE', result: 'UNKNOWN', reasons: ['KIT_FACTS_NOT_RECORDED'] },
    { check: 'CREW_QUALIFIED', result: 'UNKNOWN', reasons: ['CREW_FACTS_NOT_RECORDED'] },
  ];
  return { changeoverId: changeover.changeoverId, cellId: changeover.cellId, startsAt: changeover.startsAt,
    status: checks.every(row => row.result === 'PASS') ? 'READY' : 'BLOCKED', checks,
    reasons: [...new Set(checks.flatMap(row => row.reasons))].sort() };
}
