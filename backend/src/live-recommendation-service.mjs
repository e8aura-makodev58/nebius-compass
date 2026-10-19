import { safeModelMetadata } from "./model-provider.mjs";
import { requestAgentRecommendation, validateAgentResult } from "./agent.mjs";
import { buildCandidatePacket, getNaiveScoreBaseline, getNearestAvailableBaseline } from "./context-engine.mjs";
import { BASELINE_CONFIG, assertNoResponderSkill } from "./live-schema.mjs";

function nextRecommendationId(state) {
  const highest = state.recommendations.reduce((max, entry) => Math.max(max, Number(/^live-rec-(\d+)$/.exec(entry.id)?.[1] ?? 0)), state.historyRetention?.highWater?.recommendations ?? 0);
  return `live-rec-${String(highest + 1).padStart(4, "0")}`;
}

function nextOperationalEventId(state) {
  const highest = state.operationalEvents.reduce((max, event) => Math.max(max, Number(/^event-(\d+)$/.exec(event.id)?.[1] ?? 0)), state.historyRetention?.highWater?.operationalEvents ?? 0);
  return `event-${String(highest + 1).padStart(3, "0")}`;
}

function candidateStateMatches(state, recommendation) {
  try {
    const current = buildCandidatePacket(state, recommendation.issueId, recommendation.id);
    return JSON.stringify(current.candidates) === JSON.stringify(recommendation.candidateEvidenceSnapshot);
  } catch {
    return false;
  }
}

function disagreementFor(recommendation, agentResult) {
  const compassWinner = agentResult.topRecommendation.responderId;
  const nearestWinner = recommendation.nearestWinner;
  const naiveWinner = recommendation.naiveWinner;
  const top = recommendation.candidateEvidenceSnapshot.find((candidate) => candidate.responderId === compassWinner);
  const naive = recommendation.candidateEvidenceSnapshot.find((candidate) => candidate.responderId === naiveWinner);
  const topStructured = agentResult.rankedCandidates.find((candidate) => candidate.rank === 1);
  const evidenceStrengthDriven = compassWinner !== naiveWinner
    && topStructured.evidenceReferences.includes("evidenceStrength")
    && top?.evidenceStrengthLabel !== naive?.evidenceStrengthLabel;
  const firstReference = topStructured.evidenceReferences[0];
  const dimension = evidenceStrengthDriven ? "EVIDENCE_STRENGTH" : ({ travelTime: "TRAVEL_TIME", sameIssuePerformance: "OBSERVED_PERFORMANCE", evidenceStrength: "EVIDENCE_STRENGTH" }[firstReference] ?? "QUALITATIVE_TRADEOFF");
  return {
    nearestWinner,
    naiveWinner,
    compassWinner,
    nearestAgreement: compassWinner === nearestWinner,
    naiveAgreement: compassWinner === naiveWinner,
    primaryTradeoffDimension: dimension,
    evidenceStrengthDriven,
  };
}

export function createLiveRecommendationService(store, { requestRecommendation = requestAgentRecommendation, agentOptions = {} } = {}) {
  return {
    async recommend(issueId, { purpose = "INITIAL_ASSIGNMENT", trigger = null } = {}) {
      const prepared = await store.mutate("live-recommendation-request", (state) => {
        const issue = state.issues.find((entry) => entry.id === issueId);
        if (!issue) return { status: "ISSUE_NOT_FOUND" };
        const activeRoster = state.assignments.filter((row) => row.issueId === issueId && row.status === "ACTIVE");
        if (purpose === "ASSISTANCE" ? issue.status !== "ASSIGNED" || activeRoster.length !== 1 : !["PENDING", "RECOMMENDATION_READY"].includes(issue.status)) return { status: "ISSUE_NOT_ASSIGNABLE" };
        const id = nextRecommendationId(state);
        const packet = buildCandidatePacket(state, issueId, id);
        if (packet.candidates.length === 0) {
          if (purpose === "INITIAL_ASSIGNMENT") issue.status = "PENDING";
          else {
            const attempt = state.resolutionAttempts.find((row) => row.issueId === issueId && row.status === "ACTIVE");
            if (attempt) attempt.assistance = {
              status: "WAITING",
              generation: attempt.assistance.generation,
              trigger,
              cooldownUntil: new Date(Date.parse(state.simulationState.simulationTime) + 2 * 60_000).toISOString(),
            };
          }
          return { status: "WAITING_FOR_RESPONDER", issueId };
        }
        const nearest = getNearestAvailableBaseline(state, issueId);
        const naive = getNaiveScoreBaseline(state, issueId);
        if (purpose === "INITIAL_ASSIGNMENT") issue.status = "RECOMMENDATION_READY";
        packet.purpose = purpose;
        if (purpose === "ASSISTANCE") {
          packet.currentRoster = activeRoster.map(({ responderId, role }) => ({ responderId, role }));
          packet.assistanceTrigger = trigger;
        }
        const recommendation = {
          id,
          issueId,
          purpose,
          assistanceTrigger: trigger,
          createdAt: state.simulationState.simulationTime,
          requestedAtRevision: state.revision,
          status: "PENDING_MODEL",
          candidateEvidenceSnapshot: packet.candidates,
          baselineConfig: structuredClone(BASELINE_CONFIG),
          nearestWinner: nearest.responderId,
          naiveWinner: naive.responderId,
          nearestBaseline: nearest,
          naiveScoreBaseline: naive,
          agentResult: null,
          modelInfo: null,
          disagreement: null,
          decision: null,
        };
        assertNoResponderSkill({ packet, recommendation });
        state.recommendations.push(recommendation);
        return { status: "MODEL_REQUESTED", recommendationId: id, packet };
      });
      if (prepared.result.status !== "MODEL_REQUESTED") return prepared;

      const resolvedAgentOptions = typeof agentOptions === "function" ? await agentOptions() : agentOptions;
      const outcome = await requestRecommendation(prepared.result.packet, resolvedAgentOptions);
      return store.mutate("live-recommendation-result", (state) => {
        const recommendation = state.recommendations.find((entry) => entry.id === prepared.result.recommendationId);
        if (!recommendation || recommendation.status !== "PENDING_MODEL") return { status: "STALE_REQUEST" };
        if (!candidateStateMatches(state, recommendation)) {
          recommendation.status = "STALE";
          return { status: "STALE_CANDIDATES", recommendationId: recommendation.id };
        }
        recommendation.modelInfo = outcome.modelInfo ? safeModelMetadata(outcome.modelInfo) : null;
        if (outcome.status !== "ok") {
          recommendation.status = "UNAVAILABLE";
          recommendation.failureReason = outcome.reason;
          recommendation.failureMessage = outcome.message ?? (outcome.errors ? outcome.errors.join("; ") : null);
          return { status: "UNAVAILABLE", recommendationId: recommendation.id, reason: outcome.reason, message: recommendation.failureMessage };
        }
        const packet = { schemaVersion: "1.0", recommendationRequestId: recommendation.id, issue: prepared.result.packet.issue, candidates: recommendation.candidateEvidenceSnapshot };
        const validation = validateAgentResult(packet, outcome.result);
        if (!validation.valid) {
          recommendation.status = "UNAVAILABLE";
          recommendation.failureReason = "validation-failed";
          recommendation.failureMessage = validation.errors.join("; ");
          return { status: "UNAVAILABLE", recommendationId: recommendation.id, reason: "validation-failed", message: recommendation.failureMessage };
        }
        recommendation.status = "READY";
        recommendation.agentResult = outcome.result;
        recommendation.disagreement = disagreementFor(recommendation, outcome.result);
        state.operationalEvents.push({
          id: nextOperationalEventId(state),
          simulationTimestamp: state.simulationState.simulationTime,
          eventType: "COMPASS_RECOMMENDATION",
          issueId: recommendation.issueId,
          responderId: outcome.result.topRecommendation.responderId,
          source: "COMPASS",
          payload: { recommendationId: recommendation.id, ...recommendation.disagreement },
          createdAtRealTime: new Date().toISOString(),
        });
        assertNoResponderSkill(recommendation);
        return { status: "READY", recommendationId: recommendation.id, topResponderId: outcome.result.topRecommendation.responderId, disagreement: recommendation.disagreement };
      });
    },
  };
}
