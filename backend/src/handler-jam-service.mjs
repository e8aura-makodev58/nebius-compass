/** Shared serialized handler inputs and read-only episode projection. */
import { emptyHandlerJam, validateHandlerJam, HANDLER_FIELDS, HANDLER_BUCKET_MS, handlerTime } from './handler-jam-records.mjs';
import { buildHandlerJamEpisodes } from './handler-jam-episodes.mjs';
import { cloneDraftValue } from './live-draft.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';
const invalid = () => Object.assign(new Error('Invalid or conflicting handler input'), { statusCode: 400, code: 'INVALID_HANDLER_INPUT' });
function canonical(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, ['start', 'end', 'observedAt', 'occurredAt', 'ingestedAt'].includes(key) && value !== null ? new Date(value).toISOString() : value]));
}
function same(a, b, keys) { return keys.every(key => a[key] === b[key]) && HANDLER_FIELDS.handlerContext.every(key => a.handlerContext?.[key] === b.handlerContext?.[key]); }
export function createHandlerJamService(store) {
  return { async enter(kind, input) {
    let row, context;
    try {
      if (!Object.hasOwn(HANDLER_FIELDS, kind) || kind === 'handlerContext' || !input || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) throw invalid();
      const { handlerContext, ...body } = input;
      const probe = emptyHandlerJam(); probe[kind] = [body];
      if (handlerContext !== undefined) probe.handlerContext = [handlerContext];
      validateHandlerJam(probe); assertNoResponderSkill(input);
      row = canonical(body); context = handlerContext === undefined ? undefined : canonical(handlerContext);
      if (context) row.handlerContext = context;
    } catch { throw invalid(); }
    const unchanged = new Error('Handler input unchanged');
    const transaction = await store.mutate(`handler-${kind}-entry`, state => {
      const before = state.handlerJam === undefined ? emptyHandlerJam() : cloneDraftValue(state.handlerJam);
      validateHandlerJam(before);
      const next = structuredClone(before), key = HANDLER_FIELDS[kind][0], prior = before[kind].find(item => item[key] === row[key]);
      let added = false;
      if (prior) { if (!same(prior, row, HANDLER_FIELDS[kind])) throw invalid(); }
      else { next[kind].push(row); added = true; }
      if (context) {
        const existing = before.handlerContext.find(item => handlerTime(item.observedAt) === handlerTime(context.observedAt));
        if (existing) { if (!same(existing, context, HANDLER_FIELDS.handlerContext)) throw invalid(); }
        else { if (prior) throw invalid(); next.handlerContext.push(context); added = true; }
      }
      // A retry must not change its original context association either.
      if (prior && context && !before.handlerContext.some(item => same(item, context, HANDLER_FIELDS.handlerContext))) throw invalid();
      try { validateHandlerJam(next, before); } catch { throw invalid(); }
      if (!added) throw unchanged; // Abort before revision/journal changes on an identical retry.
      if (added) {
        if (state.handlerJam === undefined) state.handlerJam = next;
        else {
          if (!prior) state.handlerJam[kind].push(row);
          if (next.handlerContext.length > before.handlerContext.length) state.handlerJam.handlerContext.push(context);
        }
      }
      return { decision: 'RECORDED', reasons: [] };
    }).catch(error => {
      if (error === unchanged) return { result: { decision: 'UNCHANGED', reasons: [] } };
      throw error;
    });
    return transaction.result;
  } };
}
export function buildRoomHandlerEpisodes(state) {
  const data = state.handlerJam === undefined ? emptyHandlerJam() : state.handlerJam; validateHandlerJam(data);
  const end = Math.floor(handlerTime(state.simulationState.simulationTime) / HANDLER_BUCKET_MS) * HANDLER_BUCKET_MS, start = end - HANDLER_BUCKET_MS;
  const initial = [...data.handlerContext].filter(row => handlerTime(row.observedAt) <= start).sort((a, b) => handlerTime(a.observedAt) - handlerTime(b.observedAt)).at(-1);
  const result = buildHandlerJamEpisodes({ policy: { policyId: 'JAM-POLICY-A', version: 2, episodeGapMinutes: 10, minimumJamsPerEpisode: 2 },
    window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
    station: { stationId: 'HANDLER-A', programRevision: initial?.programRevision ?? null, activeSiteCount: initial?.activeSiteCount ?? null, referenceUnitsPerHour: initial?.referenceUnitsPerHour ?? null },
    alarms: data.alarms.map(({ alarmId, reasonCode, occurredAt, ingestedAt }) => ({ alarmId, reasonCode, occurredAt, ingestedAt })),
    runIntervals: data.runs.map(({ start, end, acceptedUnits }) => ({ start, end, acceptedUnits })),
    plannedStops: data.plannedStops.map(({ start, end, reasonCode }) => ({ start, end, reasonCode })),
    contextObservations: data.handlerContext.map(({ observedAt, programRevision, activeSiteCount }) => ({ observedAt, programRevision, activeSiteCount })) });
  assertNoResponderSkill(result); return result;
}
