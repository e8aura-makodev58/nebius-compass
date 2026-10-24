/** Fixed-window station plan/uptime projection. No clock writes, RNG, I/O or model calls. */
import { analyticHistory } from './history-retention.mjs';
import { observedHistoryStart, unionDowntime } from './analytics-service.mjs';

const HOUR_MS = 3_600_000;
const BUCKET_MS = 3 * HOUR_MS;
const WINDOW_MS = 12 * HOUR_MS;
const iso = value => new Date(value).toISOString();
const invalid = code => Object.assign(new Error(code), { code, statusCode: 400 });

function windowEndMs(value, clock) {
  if (value === undefined) return Math.floor(clock / BUCKET_MS) * BUCKET_MS;
  // Round-trip validation rejects Date.parse's normalization of impossible dates.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw invalid('INVALID_WINDOW');
  const end = Date.parse(value);
  if (!Number.isFinite(end) || iso(end) !== value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z') || end % BUCKET_MS !== 0 || end > clock || !Number.isFinite(new Date(end - WINDOW_MS).getTime())) throw invalid('INVALID_WINDOW');
  return end;
}

function selectedEquipment(equipment, stations) {
  if (stations === undefined) return equipment;
  if (typeof stations !== 'string') throw invalid('UNKNOWN_STATION');
  const ids = stations === '' ? [] : stations.split(',');
  const known = new Set(equipment.map(row => row.id));
  if (ids.length > 200 || ids.some(id => !/^EQ-\d{2,3}$/.test(id) || !known.has(id))) throw invalid('UNKNOWN_STATION');
  const selected = new Set(ids);
  return equipment.filter(row => selected.has(row.id));
}

export function buildStationKpis(rawState, { roomId = null, windowEnd, stations } = {}) {
  const state = analyticHistory(rawState);
  const clock = Date.parse(state.simulationState.simulationTime);
  const end = windowEndMs(windowEnd, clock), start = end - WINDOW_MS;
  // Coverage metadata describes retained history at the frozen room snapshot.
  const cutoffState = { operationalEvents: state.operationalEvents.filter(row => Date.parse(row.simulationTimestamp) <= clock) };
  const earliest = observedHistoryStart(cutoffState, clock);
  const equipment = selectedEquipment(state.equipment, stations);
  const buckets = Array.from({ length: 4 }, (_, index) => {
    const left = start + index * BUCKET_MS;
    // A whole-bucket KPI needs coverage of its whole denominator.
    return { start: iso(left), end: iso(left + BUCKET_MS), available: left >= earliest };
  });
  const byStation = new Map();
  for (const issue of state.issues) {
    if (Date.parse(issue.raisedAt) > end) continue;
    if (!byStation.has(issue.equipmentId)) byStation.set(issue.equipmentId, []);
    byStation.get(issue.equipmentId).push(issue);
  }
  const rows = equipment.map(row => {
    const issues = byStation.get(row.id) ?? [];
    return { stationId: row.id, name: row.name, floor: row.floor, ratedUnitsPerHour: row.ratedUnitsPerHour,
      buckets: buckets.map(bucket => {
        const left = Date.parse(bucket.start), right = Date.parse(bucket.end);
        const downtime = bucket.available ? unionDowntime({ issues }, left, right, end) : 0;
        const expectedUnits = bucket.available ? row.ratedUnitsPerHour * 3 : 0;
        const actualUnits = bucket.available ? Math.floor(row.ratedUnitsPerHour * Math.max(0, 180 - downtime) / 60) : 0;
        return { ...bucket, expectedUnits, actualUnits, attainmentPercent: expectedUnits ? Math.round(actualUnits / expectedUnits * 1000) / 10 : null,
          downtimeMinutes: Math.round(downtime), issuesRaised: bucket.available ? issues.filter(issue => Date.parse(issue.raisedAt) >= left && Date.parse(issue.raisedAt) < right).length : 0,
          source: 'DERIVED_FROM_UPTIME' };
      }) };
  });
  return { roomId, asOf: iso(end), window: { start: iso(start), end: iso(end), hours: 12, bucketHours: 3 },
    status: buckets.every(bucket => bucket.available) ? 'READY' : 'PARTIAL', earliestAvailable: iso(earliest), buckets, stations: rows,
    totals: buckets.map((bucket, index) => ({ start: bucket.start, end: bucket.end,
      ...Object.fromEntries(['expectedUnits', 'actualUnits', 'downtimeMinutes', 'issuesRaised'].map(key => [key, rows.reduce((sum, row) => sum + row.buckets[index][key], 0)])) })) };
}
