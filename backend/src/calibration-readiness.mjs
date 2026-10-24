/** Pure calibration readiness. The caller owns the query instant and calibration facts. */
function requireValue(ok, label) { if (!ok) throw new TypeError(`Invalid calibration readiness: ${label}`); }
function fields(row, keys) {
  requireValue(row && (Object.getPrototypeOf(row) === Object.prototype || Object.getPrototypeOf(row) === null)
    && Reflect.ownKeys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key)), 'fields');
}
function id(value) { requireValue(typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value), 'identifier'); }
function time(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), 'timestamp');
  const result = Date.parse(value);
  requireValue(Number.isFinite(result) && new Date(result).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')), 'timestamp');
  return result;
}
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function validateCalibrations(calibrations) {
  requireValue(Array.isArray(calibrations), 'rows');
  const identities = new Map(), instants = new Map();
  for (const row of calibrations) {
    fields(row, ['calibrationId', 'cellId', 'instrumentId', 'calibratedAt', 'dueAt']);
    for (const key of ['calibrationId', 'cellId', 'instrumentId']) id(row[key]);
    const calibrated = time(row.calibratedAt), due = time(row.dueAt);
    requireValue(due >= calibrated, 'expiry precedes calibration');
    const signature = JSON.stringify([row.cellId, row.instrumentId, calibrated, due]);
    requireValue(!identities.has(row.calibrationId) || identities.get(row.calibrationId) === signature, 'conflicting calibration identity');
    identities.set(row.calibrationId, signature);
    const instant = JSON.stringify([row.cellId, row.instrumentId, calibrated]);
    requireValue(!instants.has(instant) || instants.get(instant) === row.calibrationId, 'ambiguous latest calibration');
    instants.set(instant, row.calibrationId);
  }
}
export function cellReadiness(calibrations, cellId, at) {
  validateCalibrations(calibrations); id(cellId); const instant = time(at), latest = new Map();
  for (const row of calibrations) {
    if (row.cellId !== cellId || time(row.calibratedAt) > instant) continue;
    const prior = latest.get(row.instrumentId);
    if (!prior || time(row.calibratedAt) > time(prior.calibratedAt)) latest.set(row.instrumentId, row);
  }
  const instruments = [...latest.values()].sort((a, b) => compare(a.instrumentId, b.instrumentId)).map(row => ({
    instrumentId: row.instrumentId, calibrationId: row.calibrationId, dueAt: new Date(time(row.dueAt)).toISOString(), state: time(row.dueAt) <= instant ? 'EXPIRED' : 'CURRENT',
  }));
  const readiness = !instruments.length ? 'NO_CALIBRATION' : instruments.some(row => row.state === 'EXPIRED') ? 'EXPIRED' : 'READY';
  return { cellId, at, readiness, reasons: readiness === 'READY' ? [] : [readiness === 'EXPIRED' ? 'CALIBRATION_EXPIRED' : 'NO_CALIBRATION_RECORD'], instruments };
}
