/** Explicit append-only handler input facts, independent of runtime and models. */
export const HANDLER_BUCKET_MS = 10_800_000;
export function emptyHandlerJam() { return { alarms: [], runs: [], plannedStops: [], handlerContext: [] }; }
function check(ok, label) { if (!ok) throw new TypeError(`Invalid handler input: ${label}`); }
function fields(row, keys, optional = []) { check(row && (Object.getPrototypeOf(row) === Object.prototype || Object.getPrototypeOf(row) === null) && keys.every(key => Object.hasOwn(row, key)) && Reflect.ownKeys(row).every(key => keys.includes(key) || optional.includes(key)), 'fields'); }
function id(value) { check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value), 'identifier'); }
export function handlerTime(value) {
  check(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), 'timestamp');
  const at = Date.parse(value); check(Number.isFinite(at) && new Date(at).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')), 'timestamp'); return at;
}
export const HANDLER_FIELDS = {
  alarms: ['alarmId', 'reasonCode', 'occurredAt', 'ingestedAt'], runs: ['runId', 'start', 'end', 'acceptedUnits'],
  plannedStops: ['stopId', 'start', 'end', 'reasonCode'], handlerContext: ['observedAt', 'programRevision', 'activeSiteCount', 'referenceUnitsPerHour'],
};
export function validateHandlerJam(value, previous = emptyHandlerJam()) {
  fields(value, Object.keys(HANDLER_FIELDS));
  for (const [kind, keys] of Object.entries(HANDLER_FIELDS)) {
    const rows = value[kind]; check(Array.isArray(rows), 'arrays'); const identities = new Set();
    for (const row of rows) {
      fields(row, keys, kind === 'handlerContext' ? [] : ['handlerContext']);
      if (kind !== 'handlerContext' && row.handlerContext !== undefined) {
        const probe = emptyHandlerJam(); probe.handlerContext = [row.handlerContext]; validateHandlerJam(probe);
      }
      if (kind === 'handlerContext') {
        handlerTime(row.observedAt);
        if (row.programRevision !== null) id(row.programRevision);
        check(row.activeSiteCount === null || (Number.isSafeInteger(row.activeSiteCount) && row.activeSiteCount > 0), 'site count');
        check(row.referenceUnitsPerHour === null || (Number.isFinite(row.referenceUnitsPerHour) && row.referenceUnitsPerHour >= 0), 'reference');
      } else {
        id(row[keys[0]]);
        if (kind === 'alarms') { if (row.occurredAt !== null) handlerTime(row.occurredAt); handlerTime(row.ingestedAt); }
        else {
          const start = handlerTime(row.start), end = handlerTime(row.end); check(start < end, 'interval order');
          if (kind === 'runs') {
            check(Number.isSafeInteger(row.acceptedUnits) && row.acceptedUnits >= 0, 'accepted units');
            check(Math.floor(start / HANDLER_BUCKET_MS) === Math.floor((end - 1) / HANDLER_BUCKET_MS), 'run crosses aligned window boundary');
          }
        }
        if (kind !== 'runs') check(typeof row.reasonCode === 'string' && /^[A-Z][A-Z0-9_]*$/.test(row.reasonCode), 'reason code');
      }
      const identity = kind === 'handlerContext' ? handlerTime(row.observedAt) : row[keys[0]];
      check(!identities.has(identity), 'duplicate identity'); identities.add(identity);
    }
    const old = previous[kind]; check(Array.isArray(old) && rows.length >= old.length, 'append-only history');
    for (let i = 0; i < old.length; i++) check(keys.every(key => rows[i][key] === old[i][key]) && JSON.stringify(HANDLER_FIELDS.handlerContext.map(key => rows[i].handlerContext?.[key])) === JSON.stringify(HANDLER_FIELDS.handlerContext.map(key => old[i].handlerContext?.[key])), 'append-only history');
  }
  const runs = [...value.runs].sort((a, b) => handlerTime(a.start) - handlerTime(b.start));
  for (let i = 1; i < runs.length; i++) check(handlerTime(runs[i].start) >= handlerTime(runs[i - 1].end), 'overlapping runs');
}
