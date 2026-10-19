import { safeModelMetadata } from "./model-provider.mjs";
import { randomUUID } from 'node:crypto';
import { deterministicFixRecommendation } from './fix-evidence.mjs';
import { requestFixRanking, validateFixRanking } from './fix-ranking.mjs';

export function createFixRecommendationService(store, { agentOptions = {}, requestRanking = requestFixRanking } = {}) {
  return { async recommend(issueId) {
    const token = randomUUID();
    const prepared = await store.mutate('fix-ranking-request', (state) => {
      const issue = state.issues.find((row) => row.id === issueId);
      if (!issue || issue.status === 'RESOLVED' || issue.fixRecommendation?.status === 'PENDING_MODEL' || issue.fixRecommendation?.modelAttempted) return null;
      const fallback = deterministicFixRecommendation(state, issue);
      issue.fixRecommendation = { ...fallback, status: 'PENDING_MODEL', modelAttempted: true, requestToken: token };
      return fallback.packet;
    });
    const packet = prepared.result;
    if (!packet) return { status: 'SKIPPED' };
    const options = typeof agentOptions === 'function' ? await agentOptions() : agentOptions;
    let outcome;
    try { outcome = await requestRanking(packet, options); } catch { outcome = { status: 'unavailable', reason: 'provider-error' }; }
    // Never persist transport exceptions or credentials. Accept only the bounded public model metadata.
    const modelInfo = outcome.modelInfo ? safeModelMetadata(outcome.modelInfo) : null;
    const valid = outcome.status === 'ok' && validateFixRanking(packet, outcome.result).valid;
    return store.mutate('fix-ranking-result', (state) => {
      const issue = state.issues.find((row) => row.id === issueId);
      if (!issue || issue.fixRecommendation?.requestToken !== token) return { status: 'STALE' };
      const rec = issue.fixRecommendation;
      delete rec.requestToken;
      if (issue.status === 'RESOLVED') { rec.status = 'CANCELLED'; rec.reason = 'issue-completed-during-ranking'; return { status: 'CANCELLED' }; }
      Object.assign(rec, { status: valid ? 'READY' : 'FALLBACK', source: valid ? (modelInfo?.mode === 'fixture' ? 'FIXTURE' : (outcome.modelInfo?.provider === 'nebius' ? 'NEBIUS_MODEL' : 'AMD_MODEL')) : 'DETERMINISTIC', modelInfo,
        reason: valid ? null : (outcome.reason ?? 'validation-failed'), ...(valid ? { rankedFixes: outcome.result.rankedFixes } : {}) });
      rec.disagreement = rec.rankedFixes[0].fixId !== rec.baselineFixId;
      return { status: rec.status, issueId };
    });
  } };
}
