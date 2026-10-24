/** Pure alarm episode and reference-rate estimate calculation. No runtime dependencies. */
function requireValue(ok, label) { if (!ok) throw new TypeError(`Invalid handler-jam input: ${label}`); }
function fields(row, required, optional = []) {
  requireValue(row && (Object.getPrototypeOf(row) === Object.prototype || Object.getPrototypeOf(row) === null)
    && required.every(key => Object.hasOwn(row, key))
    && Reflect.ownKeys(row).every(key => required.includes(key) || optional.includes(key)), 'fields');
}
function id(value) { requireValue(typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value), 'identifier'); }
function count(value, positive = false) { requireValue(Number.isSafeInteger(value) && value >= (positive ? 1 : 0), 'count'); }
function time(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), 'timestamp');
  const at = Date.parse(value);
  requireValue(Number.isFinite(at) && new Date(at).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')), 'timestamp');
  return at;
}
const iso = at => new Date(at).toISOString();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function union(intervals) {
  const result = [];
  for (const [start, end] of intervals.filter(([a, b]) => a < b).sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
const duration = intervals => intervals.reduce((total, [a, b]) => total + b - a, 0);
function unplanned(intervals, planned) {
  const merged = union(intervals);
  let overlap = 0;
  for (const [a, b] of merged) for (const [c, d] of planned) overlap += Math.max(0, Math.min(b, d) - Math.max(a, c));
  return duration(merged) - overlap;
}
const minutes = ms => Math.round(ms / 60_000);

export function buildHandlerJamEpisodes(input) {
  fields(input, ['policy', 'window', 'station', 'alarms', 'runIntervals', 'plannedStops', 'contextObservations']);
  const { policy, window, station } = input;
  fields(policy, ['policyId', 'version', 'episodeGapMinutes', 'minimumJamsPerEpisode']);
  id(policy.policyId); count(policy.version); count(policy.episodeGapMinutes); count(policy.minimumJamsPerEpisode, true);
  fields(window, ['start', 'end']); const start = time(window.start), end = time(window.end);
  requireValue(start < end, 'window order');
  fields(station, ['stationId', 'programRevision', 'activeSiteCount'], ['referenceUnitsPerHour']);
  id(station.stationId); if (station.programRevision !== null) id(station.programRevision);
  if (station.activeSiteCount !== null) count(station.activeSiteCount, true);
  requireValue(station.referenceUnitsPerHour == null || (Number.isFinite(station.referenceUnitsPerHour) && station.referenceUnitsPerHour >= 0), 'reference rate');
  for (const key of ['alarms', 'runIntervals', 'plannedStops', 'contextObservations']) requireValue(Array.isArray(input[key]), key);
  const runs = input.runIntervals.map(row => {
    fields(row, ['start', 'end', 'acceptedUnits']); count(row.acceptedUnits);
    const a = time(row.start), b = time(row.end); requireValue(a < b, 'run order');
    // Counts belong to an entire interval; no invented prorating across window edges.
    requireValue(b <= start || a >= end || (a >= start && b <= end), 'run crosses window boundary');
    return { start: a, end: b, acceptedUnits: row.acceptedUnits };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < runs.length; i++) requireValue(runs[i].start >= runs[i - 1].end, 'overlapping run counts');
  const planned = union(input.plannedStops.map(row => {
    fields(row, ['start', 'end', 'reasonCode']); requireValue(typeof row.reasonCode === 'string' && /^[A-Z][A-Z0-9_]*$/.test(row.reasonCode), 'reason code');
    const a = time(row.start), b = time(row.end); requireValue(a < b, 'planned order');
    return [Math.max(start, a), Math.min(end, b)];
  }));
  const alarms = new Map();
  for (const row of input.alarms) {
    fields(row, ['alarmId', 'reasonCode'], ['occurredAt', 'ingestedAt']); id(row.alarmId);
    requireValue(typeof row.reasonCode === 'string' && /^[A-Z][A-Z0-9_]*$/.test(row.reasonCode), 'reason code');
    const at = row.occurredAt == null ? null : time(row.occurredAt);
    if (row.ingestedAt != null) time(row.ingestedAt);
    const prior = alarms.get(row.alarmId);
    requireValue(!prior || (prior.at === at && prior.reasonCode === row.reasonCode), 'conflicting alarm identity');
    alarms.set(row.alarmId, { alarmId: row.alarmId, reasonCode: row.reasonCode, at });
  }
  const ordered = [...alarms.values()].filter(row => row.at !== null && row.at >= start && row.at < end)
    .sort((a, b) => a.at - b.at || compare(a.alarmId, b.alarmId));
  const groups = [];
  for (const row of ordered) {
    const last = groups.at(-1);
    if (last && last.at(-1).reasonCode === row.reasonCode && row.at - last.at(-1).at <= policy.episodeGapMinutes * 60_000) last.push(row);
    else groups.push([row]);
  }
  const jamWindow = row => [row.at, Math.min(end, runs.find(run => run.start >= row.at)?.start ?? end)];
  const episodes = groups.map(rows => ({ episodeId: `EP-${rows[0].alarmId}`, reasonCode: rows[0].reasonCode,
    firstOccurredAt: iso(rows[0].at), lastOccurredAt: iso(rows.at(-1).at), jamCount: rows.length,
    alarmIds: rows.map(row => row.alarmId), unplannedStoppedMinutes: minutes(unplanned(rows.map(jamWindow), planned)),
    classification: rows.length >= policy.minimumJamsPerEpisode ? 'PATTERN' : 'SINGLE_EVENT' }));
  const stopped = unplanned(ordered.map(jamWindow), planned), plannedMs = duration(planned), windowMs = end - start;
  const running = windowMs - stopped - plannedMs;
  const observations = input.contextObservations.map(row => {
    fields(row, ['observedAt', 'programRevision', 'activeSiteCount']);
    if (row.programRevision !== null) id(row.programRevision);
    if (row.activeSiteCount !== null) count(row.activeSiteCount, true);
    return { at: time(row.observedAt), programRevision: row.programRevision, activeSiteCount: row.activeSiteCount };
  }).sort((a, b) => a.at - b.at);
  for (let i = 1; i < observations.length; i++) {
    const a = observations[i - 1], b = observations[i];
    requireValue(a.at !== b.at || (a.programRevision === b.programRevision && a.activeSiteCount === b.activeSiteCount), 'conflicting context');
  }
  const initial = observations.filter(row => row.at <= start).at(-1);
  const context = [...(initial ? [initial] : []), ...observations.filter(row => row.at > start && row.at < end)];
  const suppressionReasons = [];
  if (!initial || station.programRevision === null || station.activeSiteCount === null || context.some(row => row.programRevision === null || row.activeSiteCount === null)) suppressionReasons.push('CONTEXT_MISSING');
  if (context.some(row => row.programRevision !== null && station.programRevision !== null && row.programRevision !== station.programRevision)) suppressionReasons.push('PROGRAM_CHANGED');
  if (context.some(row => row.activeSiteCount !== null && station.activeSiteCount !== null && row.activeSiteCount !== station.activeSiteCount)) suppressionReasons.push('SITE_COUNT_CHANGED');
  if (!(station.referenceUnitsPerHour > 0)) suppressionReasons.push('REFERENCE_MISSING');
  if (running < 60_000) suppressionReasons.push('NO_RUNNING_TIME');
  const estimate = suppressionReasons.length === 0;
  const units = runs.filter(row => row.start >= start && row.end <= end).reduce((sum, row) => sum + row.acceptedUnits, 0);
  requireValue(Number.isSafeInteger(units), 'accepted unit total');
  const estimated = estimate ? Math.round(station.referenceUnitsPerHour * stopped / 3_600_000) : null;
  requireValue(estimated === null || Number.isSafeInteger(estimated), 'estimated unit total');
  return { stationId: station.stationId, window: { start: iso(start), end: iso(end) }, policyId: policy.policyId,
    policyVersion: policy.version, episodes, excludedAlarms: [...alarms.values()].filter(row => row.at === null).length,
    unplannedStoppedMinutes: minutes(stopped), plannedStopMinutes: minutes(plannedMs), runningMinutes: minutes(running),
    acceptedUnitsPerRunningMinute: running > 0 ? Math.round(units / (running / 60_000) * 100) / 100 : null,
    deficitStatus: estimate ? 'ESTIMATE' : 'SUPPRESSED', estimatedDeficitUnits: estimated,
    deficitBasis: estimate ? { referenceUnitsPerHour: station.referenceUnitsPerHour, windowMinutes: minutes(windowMs), denominator: 'UNPLANNED_STOPPED_MINUTES' } : null,
    suppressionReasons };
}
