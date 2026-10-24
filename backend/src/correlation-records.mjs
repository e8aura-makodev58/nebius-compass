/** Pure, append-only reference-part comparison facts; never a calibration gate. */
const keys = ['correlationId', 'cellId', 'instrumentId', 'referencePartId', 'observedAt', 'result'];
function requireValue(ok, label) { if (!ok) throw new TypeError(`Invalid correlation records: ${label}`); }
export function validateCorrelationRecords(records, previous = []) {
  requireValue(Array.isArray(records) && Array.isArray(previous), 'arrays');
  const ids = new Set();
  for (const row of records) {
    requireValue(row && (Object.getPrototypeOf(row) === Object.prototype || Object.getPrototypeOf(row) === null)
      && Reflect.ownKeys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key)), 'fields');
    for (const key of ['correlationId', 'cellId', 'instrumentId', 'referencePartId']) requireValue(typeof row[key] === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(row[key]), 'identifier');
    requireValue(typeof row.observedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(row.observedAt), 'timestamp');
    const at = Date.parse(row.observedAt);
    requireValue(Number.isFinite(at) && new Date(at).toISOString() === (row.observedAt.includes('.') ? row.observedAt : row.observedAt.replace(/Z$/, '.000Z')), 'timestamp');
    requireValue(['PASS', 'FAIL', 'INCONCLUSIVE'].includes(row.result), 'result');
    requireValue(!ids.has(row.correlationId), 'duplicate correlationId'); ids.add(row.correlationId);
  }
  requireValue(records.length >= previous.length, 'append-only history');
  for (let index = 0; index < previous.length; index++) requireValue(keys.every(key => records[index][key] === previous[index][key]), 'append-only history');
}
