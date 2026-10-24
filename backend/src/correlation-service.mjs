/** Shared room entry path; correlation facts do not authorize readiness. */
import { validateCorrelationRecords } from './correlation-records.mjs';
import { cloneDraftValue } from './live-draft.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';
const invalid = () => Object.assign(new Error('Invalid or duplicate correlation record'), { statusCode: 400, code: 'INVALID_CORRELATION_RECORD' });
export function createCorrelationService(store) {
  return { async enter(input) {
    try { validateCorrelationRecords([input]); assertNoResponderSkill(input); } catch { throw invalid(); }
    const row = { ...input, observedAt: new Date(input.observedAt).toISOString() };
    const transaction = await store.mutate('correlation-record-entry', state => {
      const previous = state.correlationRecords === undefined ? [] : cloneDraftValue(state.correlationRecords);
      validateCorrelationRecords(previous);
      try { validateCorrelationRecords([...previous, row], previous); } catch { throw invalid(); }
      if (state.correlationRecords === undefined) state.correlationRecords = [row];
      else state.correlationRecords.push(row);
      return { decision: 'RECORDED', reasons: [] };
    });
    return transaction.result;
  } };
}
