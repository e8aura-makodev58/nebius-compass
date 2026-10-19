import { assertDispatchAuthorized, approvedInvestigation, gatedResult } from './dispatch-gate.mjs';
import { originalLength } from "./history-retention.mjs";
import { buildCandidatePacket } from "./context-engine.mjs";
import { activeRoster, createAttempt, replanAttempt, settleAttempt } from "./attempt-engine.mjs";
import { moveResponderToIssue, returnResponderToDutyStation } from "./responder-location.mjs";

function nextId(entries, prefix, highWater = 0) {
  const highest = entries.reduce((max, entry) => Math.max(max, Number(new RegExp(`^${prefix}-(\\d+)$`).exec(entry.id)?.[1] ?? 0)), highWater);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

function appendAssignmentEvent(state, issue, responder, decision) {
  state.operationalEvents.push({
    id: nextId(state.operationalEvents, "event", state.historyRetention?.highWater?.operationalEvents ?? 0),
    simulationTimestamp: state.simulationState.simulationTime,
    eventType: decision === "OVERRIDDEN" ? "ASSIGNMENT_OVERRIDDEN" : "RESPONDER_ASSIGNED",
    equipmentId: issue.equipmentId,
    issueId: issue.id,
    responderId: responder.id,
    source: decision === "AUTO_ACCEPTED" ? "AUTO_DISPATCH" : "HUMAN_DECISION",
    payload: { decision },
    createdAtRealTime: new Date().toISOString(),
  });
}

function nextDispatchRandom(state) {
  const current = state.simulationState.rngStreams.dispatch ?? 5772;
  const next = (Math.imul(1_664_525, current) + 1_013_904_223) >>> 0;
  state.simulationState.rngStreams.dispatch = next;
  return next / 0x1_0000_0000;
}

function appendOfferEvent(state, eventType, issue, offer, payload = {}) {
  state.operationalEvents.push({
    id: nextId(state.operationalEvents, "event", state.historyRetention?.highWater?.operationalEvents ?? 0),
    simulationTimestamp: state.simulationState.simulationTime,
    eventType,
    equipmentId: issue.equipmentId,
    issueId: issue.id,
    responderId: offer.responderId,
    source: "AUTO_DISPATCH",
    payload: { offerId: offer.id, recommendationId: offer.recommendationId, ...payload },
    createdAtRealTime: new Date().toISOString(),
  });
}

function cancelPendingOffer(state, issue, reason) {
  const offer = (state.dispatchOffers ?? []).find((entry) => entry.id === issue.pendingOfferId && entry.status === "PENDING");
  if (!offer) return;
  offer.status = "CANCELLED";
  offer.completedAt = state.simulationState.simulationTime;
  offer.responseDueAt = null;
  offer.responseDueToken = null;
  offer.responseDispatchToken = null;
  const offeredResponder = state.responders.find((entry) => entry.id === offer.responderId);
  if (offeredResponder?.availability === "OFFERED" && offeredResponder.currentOfferId === offer.id) {
    offeredResponder.availability = "AVAILABLE";
    delete offeredResponder.currentOfferId;
  }
  appendOfferEvent(state, "ASSIGNMENT_OFFER_CANCELLED", issue, offer, { reason });
  delete issue.pendingOfferId;
  delete issue.offeredResponderId;
}

function deterministicFallbackOrder(recommendation) {
  return [...recommendation.candidateEvidenceSnapshot]
    .sort((left, right) => {
      const score = (candidate) =>
        100 * (candidate.successRate ?? 0.5)
        + 2 * Math.min(candidate.sameIssueHistoricalCount, 8)
        - (candidate.medianResolutionMinutes ?? 60)
        - 4 * candidate.travelTimeMinutes;
      return score(right) - score(left) || left.responderId.localeCompare(right.responderId);
    })
    .map((candidate) => candidate.responderId);
}

function rankedResponderIds(recommendation) {
  return recommendation.agentResult?.rankedCandidates
    ? [...recommendation.agentResult.rankedCandidates].sort((left, right) => left.rank - right.rank).map((entry) => entry.responderId)
    : deterministicFallbackOrder(recommendation);
}

function appendRosterEvent(state, eventType, issue, responderId, payload = {}) {
  state.operationalEvents.push({ id: nextId(state.operationalEvents, "event", state.historyRetention?.highWater?.operationalEvents ?? 0), simulationTimestamp: state.simulationState.simulationTime,
    eventType, equipmentId: issue.equipmentId, issueId: issue.id, responderId, source: "STAFFING_ENGINE", payload,
    createdAtRealTime: new Date().toISOString() });
}

export function assignInState(state, { issueId, responderId, decision, eligibleResponderIds, acceptedOfferId = null, purpose = "INITIAL_ASSIGNMENT" }) {
  const issue = state.issues.find((entry) => entry.id === issueId);
  if (!issue) return { status: "INVALID", reason: "ISSUE_NOT_FOUND" };
  if (!assertDispatchAuthorized(state, issue, responderId, purpose)) return gatedResult();
  const assistance = purpose === "ASSISTANCE";
  if (assistance ? issue.status !== "ASSIGNED" : !["PENDING", "RECOMMENDATION_READY", "OFFER_PENDING"].includes(issue.status)) return { status: "INVALID", reason: "ISSUE_NOT_ASSIGNABLE" };
  const responder = state.responders.find((entry) => entry.id === responderId);
  if (!responder) return { status: "INVALID", reason: "RESPONDER_NOT_FOUND" };
  if (Array.isArray(eligibleResponderIds) && !eligibleResponderIds.includes(responderId)) return { status: "INVALID", reason: "RESPONDER_NOT_IN_RECOMMENDATION" };
  const responderAcceptingOwnOffer = acceptedOfferId && responder.availability === "OFFERED" && responder.currentOfferId === acceptedOfferId;
  if (responder.availability !== "AVAILABLE" && !responderAcceptingOwnOffer) return { status: "STALE", reason: "RESPONDER_NOT_AVAILABLE", responderId };

  if (issue.pendingOfferId && issue.pendingOfferId !== acceptedOfferId) cancelPendingOffer(state, issue, decision === "OVERRIDDEN" ? "CENTRAL_OVERRIDE" : "SUPERSEDED");

  const roster = activeRoster(state, issue.id);
  if (roster.length >= 2) return { status: "CONFLICT", reason: "TARGET_FULL" };
  if (assistance && roster.length !== 1) return { status: "CONFLICT", reason: "ASSISTANCE_SLOT_UNAVAILABLE" };
  let attempt = state.resolutionAttempts.find((row) => row.issueId === issue.id && row.status === "ACTIVE");
  if (attempt) settleAttempt(state, attempt);
  issue.status = "ASSIGNED";
  responder.availability = "ASSIGNED";
  delete responder.currentOfferId;
  responder.currentIssueId = issue.id;
  moveResponderToIssue(state, responder, issue, roster.length === 0 ? "PRIMARY" : "SUPPORT", assistance ? "ASSISTANCE_JOINED" : "ASSIGNMENT_ACCEPTED");
  delete issue.pendingOfferId;
  delete issue.offeredResponderId;
  delete issue.rematchNotBefore;
  const assignment = {
    id: nextId(state.assignments, "assignment", state.historyRetention?.highWater?.assignments ?? 0),
    issueId: issue.id,
    responderId: responder.id,
    createdAt: state.simulationState.simulationTime,
    status: "ACTIVE", attemptId: attempt?.id ?? null, role: roster.length === 0 ? "PRIMARY" : "SUPPORT",
    joinedAt: state.simulationState.simulationTime, endedAt: null, endReason: null,
    roleHistory: [{ role: roster.length === 0 ? "PRIMARY" : "SUPPORT", startedAt: state.simulationState.simulationTime, endedAt: null }],
  };
  state.assignments.push(assignment);
  if (!attempt) {
    attempt = createAttempt(state, issue.id);
    assignment.attemptId = attempt.id;
  } else {
    assignment.attemptId = attempt.id;
    attempt.rosterVersion += 1;
    attempt.assistance.status = "STAFFED";
    replanAttempt(state, attempt);
    appendRosterEvent(state, "RESPONDER_JOINED", issue, responder.id, { attemptId: attempt.id, role: "SUPPORT", rosterVersion: attempt.rosterVersion });
    appendRosterEvent(state, "RESOLUTION_REPLANNED", issue, responder.id, { attemptId: attempt.id, reason: "RESPONDER_JOINED", qualitativeImpact: "ACCELERATED" });
  }
  issue.assignedResponderId = activeRoster(state, issue.id).find((row) => row.role === "PRIMARY")?.responderId;
  if (issue.dispatchGate === 'INVESTIGATION') approvedInvestigation(state, issue).decision.attemptId = attempt.id;
  appendAssignmentEvent(state, issue, responder, decision);
  return { status: "ASSIGNED", issueId: issue.id, responderId: responder.id, assignmentId: assignment.id, attemptId: attempt.id, role: assignment.role, decision };
}

export function createLiveAssignmentService(store) {
  return {
    async candidatePacket(issueId, recommendationRequestId, purpose = "INITIAL_ASSIGNMENT") {
      const state = await store.snapshot();
      const issue = state.issues.find((entry) => entry.id === issueId);
      if (!issue) return { status: "ISSUE_NOT_FOUND", packet: null };
      if (purpose === "ASSISTANCE" ? issue.status !== "ASSIGNED" || activeRoster(state, issueId).length !== 1 : !["PENDING", "RECOMMENDATION_READY"].includes(issue.status)) return { status: "ISSUE_NOT_ASSIGNABLE", packet: null };
      const packet = buildCandidatePacket(state, issueId, recommendationRequestId);
      packet.purpose = purpose;
      if (purpose === "ASSISTANCE") packet.currentRoster = activeRoster(state, issueId).map(({ responderId, role }) => ({ responderId, role }));
      return packet.candidates.length === 0
        ? { status: "WAITING_FOR_RESPONDER", packet }
        : { status: "READY", packet };
    },
    async markRecommendationReady(issueId) {
      return store.mutate("live-recommendation-ready", (state) => {
        const issue = state.issues.find((entry) => entry.id === issueId);
        if (!issue) return { status: "ISSUE_NOT_FOUND" };
        if (issue.status !== "PENDING") return { status: "ISSUE_NOT_PENDING" };
        const available = state.responders.some((responder) => responder.availability === "AVAILABLE");
        if (!available) return { status: "WAITING_FOR_RESPONDER" };
        issue.status = "RECOMMENDATION_READY";
        return { status: "READY" };
      });
    },
    async assign({ issueId, responderId, decision = "CONFIRMED", eligibleResponderIds = null, purpose = "INITIAL_ASSIGNMENT" }) {
      return store.mutate("live-assignment", (state) => assignInState(state, { issueId, responderId, decision, eligibleResponderIds, purpose }));
    },
    async offerNextCandidate(recommendationId) {
      return store.mutate("auto-dispatch-offer", (state) => {
        state.dispatchOffers ??= [];
        const recommendation = state.recommendations.find((entry) => entry.id === recommendationId);
        if (!recommendation) return { status: "INVALID", reason: "RECOMMENDATION_NOT_FOUND" };
        if (!["READY", "UNAVAILABLE"].includes(recommendation.status) || recommendation.decision) return { status: "INVALID", reason: "RECOMMENDATION_NOT_OFFERABLE" };
        const purpose = recommendation.purpose ?? "INITIAL_ASSIGNMENT";
        const issue = state.issues.find((entry) => entry.id === recommendation.issueId);
        if (!issue || (purpose === "ASSISTANCE" ? issue.status !== "ASSIGNED" || activeRoster(state, issue.id).length !== 1 : !["PENDING", "RECOMMENDATION_READY"].includes(issue.status))) return { status: "STALE", reason: "ISSUE_NOT_OFFERABLE" };
        if (issue.pendingOfferId) return { status: "CONFLICT", reason: "OFFER_ALREADY_PENDING" };
        const attempted = new Set(state.dispatchOffers.filter((offer) => offer.recommendationId === recommendationId).map((offer) => offer.responderId));
        const responderId = rankedResponderIds(recommendation).find((candidateId) =>
          !attempted.has(candidateId) && state.responders.find((responder) => responder.id === candidateId)?.availability === "AVAILABLE");
        if (!responderId) {
          recommendation.dispatchStatus = "EXHAUSTED";
          if (purpose === "INITIAL_ASSIGNMENT") issue.status = "PENDING";
          else {
            const attempt = state.resolutionAttempts.find((row) => row.issueId === issue.id && row.status === "ACTIVE");
            attempt.assistance = { ...attempt.assistance, status: "EXHAUSTED", cooldownUntil: new Date(Date.parse(state.simulationState.simulationTime) + 2 * 60_000).toISOString() };
          }
          if (purpose === "INITIAL_ASSIGNMENT") issue.rematchNotBefore = new Date(Date.parse(state.simulationState.simulationTime) + 2 * 60_000).toISOString();
          return { status: "EXHAUSTED", issueId: issue.id, recommendationId };
        }
        if (!assertDispatchAuthorized(state, issue, responderId, purpose)) return gatedResult();
        const responder = state.responders.find((entry) => entry.id === responderId);
        const evidence = recommendation.candidateEvidenceSnapshot.find((entry) => entry.responderId === responderId);
        const rank = rankedResponderIds(recommendation).indexOf(responderId) + 1;
        const acceptanceProbability = Math.max(0.35, Math.min(0.95, 0.83 - 0.06 * evidence.travelTimeMinutes + 0.03 * Math.max(0, 4 - rank)));
        const responseMinutes = 0.1 + nextDispatchRandom(state) * 0.15;
        const offer = {
          id: nextId(state.dispatchOffers, "offer", state.historyRetention?.highWater?.dispatchOffers ?? 0), recommendationId, issueId: issue.id, responderId, rank,
          status: "PENDING", purpose, slot: purpose === "ASSISTANCE" ? "SUPPORT" : "PRIMARY", createdAt: state.simulationState.simulationTime,
          responseDueAt: new Date(Date.parse(state.simulationState.simulationTime) + responseMinutes * 60_000).toISOString(),
          responseDueToken: `offer-response-${originalLength(state, "dispatchOffers") + 1}`,
          responseDispatchToken: null,
          acceptanceProbability,
        };
        state.dispatchOffers.push(offer);
        if (purpose === "INITIAL_ASSIGNMENT") issue.status = "OFFER_PENDING";
        issue.pendingOfferId = offer.id;
        issue.offeredResponderId = responder.id;
        responder.availability = "OFFERED";
        responder.currentOfferId = offer.id;
        recommendation.dispatchStatus = "OFFER_PENDING";
        appendOfferEvent(state, "ASSIGNMENT_OFFERED", issue, offer, { rank });
        return { status: "OFFERED", issueId: issue.id, recommendationId, offerId: offer.id, responderId, rank };
      });
    },
    async handleOfferDue(trigger) {
      return store.mutate("auto-dispatch-response", (state) => {
        const offer = (state.dispatchOffers ?? []).find((entry) => entry.id === trigger.offerId);
        if (!offer || offer.status !== "PENDING") return { status: "DUPLICATE_OR_STALE" };
        if (offer.responseDispatchToken !== trigger.token) return { status: "TOKEN_MISMATCH" };
        const issue = state.issues.find((entry) => entry.id === offer.issueId);
        const responder = state.responders.find((entry) => entry.id === offer.responderId);
        const recommendation = state.recommendations.find((entry) => entry.id === offer.recommendationId);
        if (issue?.pendingOfferId !== offer.id || responder?.currentOfferId !== offer.id || recommendation?.decision) {
          if (issue?.pendingOfferId === offer.id) cancelPendingOffer(state, issue, "OPERATING_STATE_CHANGED");
          else {
            offer.status = "CANCELLED";
            offer.completedAt = state.simulationState.simulationTime;
            offer.responseDispatchToken = null;
          }
          return recommendation && !recommendation.decision
            ? { status: "REJECTED", reason: "OPERATING_STATE_CHANGED", issueId: offer.issueId, recommendationId: recommendation.id, offerId: offer.id, responderId: offer.responderId }
            : { status: "DUPLICATE_OR_STALE" };
        }
        if (!assertDispatchAuthorized(state, issue, offer.responderId, offer.purpose)) { cancelPendingOffer(state, issue, "INVESTIGATION_GATE"); if (offer.purpose !== "ASSISTANCE") issue.status = "PENDING"; return gatedResult(); }
        const accepted = nextDispatchRandom(state) < offer.acceptanceProbability;
        offer.status = accepted ? "ACCEPTED" : "REJECTED";
        offer.completedAt = state.simulationState.simulationTime;
        offer.responseDispatchToken = null;
        responder.availability = "AVAILABLE";
        delete responder.currentOfferId;
        if ((offer.purpose ?? "INITIAL_ASSIGNMENT") === "INITIAL_ASSIGNMENT") issue.status = "RECOMMENDATION_READY";
        delete issue.pendingOfferId;
        delete issue.offeredResponderId;
        appendOfferEvent(state, accepted ? "ASSIGNMENT_OFFER_ACCEPTED" : "ASSIGNMENT_OFFER_REJECTED", issue, offer, { rank: offer.rank });
        if (!accepted) return { status: "REJECTED", issueId: issue.id, recommendationId: recommendation.id, offerId: offer.id, responderId: responder.id };
        const assigned = assignInState(state, {
          issueId: issue.id,
          responderId: responder.id,
          decision: "AUTO_ACCEPTED",
          eligibleResponderIds: recommendation.candidateEvidenceSnapshot.map((candidate) => candidate.responderId),
          acceptedOfferId: offer.id,
          purpose: offer.purpose ?? "INITIAL_ASSIGNMENT",
        });
        recommendation.decision = assigned.status === "ASSIGNED" ? "AUTO_ACCEPTED" : "STALE";
        recommendation.decisionResponderId = responder.id;
        recommendation.acceptedResponderId = assigned.status === "ASSIGNED" ? responder.id : null;
        recommendation.decisionAt = state.simulationState.simulationTime;
        return { ...assigned, recommendationId: recommendation.id, offerId: offer.id, response: "ACCEPTED" };
      });
    },
    async requestAssistance(issueId, trigger = "OPERATOR_REQUEST") {
      return store.mutate("assistance-request", (state) => {
        const issue = state.issues.find((row) => row.id === issueId);
        const attempt = state.resolutionAttempts.find((row) => row.issueId === issueId && row.status === "ACTIVE");
        if (!issue || !attempt) return { status: "INVALID", reason: "ACTIVE_ATTEMPT_NOT_FOUND" };
        if (!assertDispatchAuthorized(state, issue, null, "ASSISTANCE")) return gatedResult();
        if (activeRoster(state, issueId).length !== 1) return { status: "CONFLICT", reason: "SUPPORT_SLOT_UNAVAILABLE" };
        if (attempt.assistance.status === "REQUESTED") return { status: "CONFLICT", reason: "ASSISTANCE_ALREADY_REQUESTED" };
        if (attempt.assistance.cooldownUntil && Date.parse(attempt.assistance.cooldownUntil) > Date.parse(state.simulationState.simulationTime)) return { status: "CONFLICT", reason: "ASSISTANCE_COOLDOWN" };
        attempt.assistance = { status: "REQUESTED", generation: attempt.assistance.generation + 1, trigger, cooldownUntil: null };
        appendRosterEvent(state, "ASSISTANCE_REQUESTED", issue, null, { attemptId: attempt.id, trigger, generation: attempt.assistance.generation });
        return { status: "REQUESTED", issueId, trigger, rosterVersion: attempt.rosterVersion };
      });
    },
    async handleAssistanceReview(trigger) {
      return store.mutate("assistance-review", (state) => {
        const attempt = state.resolutionAttempts.find((row) => row.id === trigger.attemptId);
        if (!attempt || attempt.status !== "ACTIVE" || attempt.scheduleGeneration !== trigger.generation || attempt.reviewDispatchToken !== trigger.token) return { status: "STALE" };
        attempt.reviewDispatchToken = null;
        if (!assertDispatchAuthorized(state, state.issues.find((row) => row.id === attempt.issueId), null, "ASSISTANCE")) return gatedResult();
        settleAttempt(state, attempt); replanAttempt(state, attempt);
        const baseline = Date.parse(attempt.initialPlannedCompletionAt) - Date.parse(attempt.startedAt);
        const projected = Date.parse(attempt.resolutionDueAt) - Date.parse(attempt.startedAt);
        if (projected <= baseline * 1.15 || activeRoster(state, attempt.issueId).length !== 1) return { status: "ON_PLAN", issueId: attempt.issueId };
        const issue = state.issues.find((row) => row.id === attempt.issueId);
        attempt.assistance = { status: "REQUESTED", generation: attempt.assistance.generation + 1, trigger: "BEHIND_PLAN", cooldownUntil: null };
        appendRosterEvent(state, "ASSISTANCE_REQUESTED", issue, null, { attemptId: attempt.id, trigger: "BEHIND_PLAN", generation: attempt.assistance.generation });
        return { status: "REQUESTED", issueId: attempt.issueId, trigger: "BEHIND_PLAN" };
      });
    },
    async releaseResponder({ issueId, responderId, expectedRosterVersion, reason = "CENTRAL_RELEASE" }) {
      return store.mutate("responder-release", (state) => {
        const issue = state.issues.find((row) => row.id === issueId);
        const attempt = state.resolutionAttempts.find((row) => row.issueId === issueId && row.status === "ACTIVE");
        const roster = activeRoster(state, issueId);
        if (!attempt || !issue) return { status: "INVALID", reason: "ACTIVE_ATTEMPT_NOT_FOUND" };
        if (attempt.rosterVersion !== expectedRosterVersion) return { status: "CONFLICT", reason: "STALE_ROSTER_VERSION" };
        if (roster.length !== 2) return { status: "CONFLICT", reason: "SOLE_SOURCE_REMOVAL" };
        const removed = roster.find((row) => row.responderId === responderId);
        if (!removed) return { status: "CONFLICT", reason: "RESPONDER_NOT_ON_ROSTER" };
        settleAttempt(state, attempt); removed.status = "RELEASED"; removed.endedAt = state.simulationState.simulationTime; removed.endReason = reason; removed.roleHistory.at(-1).endedAt = state.simulationState.simulationTime;
        const responder = state.responders.find((row) => row.id === responderId); responder.availability = "AVAILABLE"; delete responder.currentIssueId; returnResponderToDutyStation(state, responder, "CENTRAL_RELEASE");
        const remaining = roster.find((row) => row.id !== removed.id);
        if (removed.role === "PRIMARY") { remaining.roleHistory.at(-1).endedAt = state.simulationState.simulationTime; remaining.roleHistory.push({ role: "PRIMARY", startedAt: state.simulationState.simulationTime, endedAt: null }); remaining.role = "PRIMARY"; issue.assignedResponderId = remaining.responderId; appendRosterEvent(state, "PRIMARY_CHANGED", issue, remaining.responderId, { attemptId: attempt.id, previousResponderId: responderId }); }
        attempt.rosterVersion += 1; attempt.assistance = { status: "NONE", generation: attempt.assistance.generation + 1, trigger: null, cooldownUntil: new Date(Date.parse(state.simulationState.simulationTime) + 2 * 60_000).toISOString() };
        replanAttempt(state, attempt); appendRosterEvent(state, "RESPONDER_RELEASED", issue, responderId, { attemptId: attempt.id, reason, rosterVersion: attempt.rosterVersion });
        appendRosterEvent(state, "RESOLUTION_REPLANNED", issue, remaining.responderId, { attemptId: attempt.id, reason: "RESPONDER_RELEASED", qualitativeImpact: "SLOWED" });
        return { status: "RELEASED", issueId, responderId, rosterVersion: attempt.rosterVersion };
      });
    },
    async transferResponder({ responderId, sourceIssueId, targetIssueId, sourceRosterVersion, targetRosterVersion = null }) {
      return store.mutate("responder-transfer", (state) => {
        const source = state.issues.find((row) => row.id === sourceIssueId); const target = state.issues.find((row) => row.id === targetIssueId);
        const sourceAttempt = state.resolutionAttempts.find((row) => row.issueId === sourceIssueId && row.status === "ACTIVE");
        let targetAttempt = state.resolutionAttempts.find((row) => row.issueId === targetIssueId && row.status === "ACTIVE");
        if (!source || !target || !sourceAttempt) return { status: "INVALID", reason: "ISSUE_OR_ATTEMPT_NOT_FOUND" };
        if (sourceAttempt.rosterVersion !== sourceRosterVersion || (targetAttempt && targetAttempt.rosterVersion !== targetRosterVersion)) return { status: "CONFLICT", reason: "STALE_ROSTER_VERSION" };
        if (activeRoster(state, sourceIssueId).length !== 2) return { status: "CONFLICT", reason: "SOLE_SOURCE_REMOVAL" };
        if (target.status === "RESOLVED" || activeRoster(state, targetIssueId).length >= 2) return { status: "CONFLICT", reason: target.status === "RESOLVED" ? "TARGET_RESOLVED" : "TARGET_FULL" };
        const moving = activeRoster(state, sourceIssueId).find((row) => row.responderId === responderId);
        if (!moving) return { status: "CONFLICT", reason: "RESPONDER_NOT_ON_SOURCE" };
        if (!assertDispatchAuthorized(state, target, responderId, "TRANSFER")) return gatedResult();
        settleAttempt(state, sourceAttempt); if (targetAttempt) settleAttempt(state, targetAttempt);
        moving.status = "RELEASED"; moving.endedAt = state.simulationState.simulationTime; moving.endReason = "TRANSFERRED"; moving.roleHistory.at(-1).endedAt = state.simulationState.simulationTime;
        const sourceRemaining = activeRoster(state, sourceIssueId)[0];
        if (moving.role === "PRIMARY") { sourceRemaining.roleHistory.at(-1).endedAt = state.simulationState.simulationTime; sourceRemaining.roleHistory.push({ role: "PRIMARY", startedAt: state.simulationState.simulationTime, endedAt: null }); sourceRemaining.role = "PRIMARY"; source.assignedResponderId = sourceRemaining.responderId; appendRosterEvent(state, "PRIMARY_CHANGED", source, sourceRemaining.responderId, { attemptId: sourceAttempt.id, previousResponderId: responderId }); }
        sourceAttempt.rosterVersion += 1; sourceAttempt.assistance = { status: "NONE", generation: sourceAttempt.assistance.generation + 1, trigger: null, cooldownUntil: new Date(Date.parse(state.simulationState.simulationTime) + 2 * 60_000).toISOString() }; replanAttempt(state, sourceAttempt);
        cancelPendingOffer(state, target, "CENTRAL_TRANSFER");
        const targetRoster = activeRoster(state, targetIssueId);
        const joined = { id: nextId(state.assignments, "assignment", state.historyRetention?.highWater?.assignments ?? 0), issueId: targetIssueId, responderId, createdAt: state.simulationState.simulationTime,
          status: "ACTIVE", attemptId: targetAttempt?.id ?? null, role: targetRoster.length ? "SUPPORT" : "PRIMARY", joinedAt: state.simulationState.simulationTime, endedAt: null, endReason: null,
          roleHistory: [{ role: targetRoster.length ? "SUPPORT" : "PRIMARY", startedAt: state.simulationState.simulationTime, endedAt: null }] };
        state.assignments.push(joined); target.status = "ASSIGNED";
        if (!targetAttempt) { targetAttempt = createAttempt(state, targetIssueId); joined.attemptId = targetAttempt.id; } else { joined.attemptId = targetAttempt.id; targetAttempt.rosterVersion += 1; targetAttempt.assistance.status = "STAFFED"; replanAttempt(state, targetAttempt); }
        const responder = state.responders.find((row) => row.id === responderId); responder.availability = "ASSIGNED"; responder.currentIssueId = targetIssueId; moveResponderToIssue(state, responder, target, joined.role, "TRANSFERRED");
        target.assignedResponderId = activeRoster(state, targetIssueId).find((row) => row.role === "PRIMARY")?.responderId;
        const transferId = `transfer-${state.revision + 1}-${responderId}`;
        appendRosterEvent(state, "RESPONDER_TRANSFERRED", source, responderId, { transferId, attemptId: sourceAttempt.id, targetIssueId, rosterVersion: sourceAttempt.rosterVersion });
        appendRosterEvent(state, "RESPONDER_JOINED", target, responderId, { transferId, attemptId: targetAttempt.id, sourceIssueId, role: joined.role, rosterVersion: targetAttempt.rosterVersion });
        appendRosterEvent(state, "RESOLUTION_REPLANNED", source, sourceRemaining.responderId, { transferId, attemptId: sourceAttempt.id, reason: "RESPONDER_TRANSFERRED", qualitativeImpact: "SLOWED" });
        appendRosterEvent(state, "RESOLUTION_REPLANNED", target, responderId, { transferId, attemptId: targetAttempt.id, reason: "RESPONDER_TRANSFERRED", qualitativeImpact: targetRoster.length ? "ACCELERATED" : "STARTED" });
        return { status: "TRANSFERRED", transferId, responderId, sourceIssueId, targetIssueId, sourceRosterVersion: sourceAttempt.rosterVersion, targetRosterVersion: targetAttempt.rosterVersion };
      });
    },
    async decideRecommendation({ recommendationId, responderId, decision }) {
      return store.mutate("live-recommendation-decision", (state) => {
        const recommendation = state.recommendations.find((entry) => entry.id === recommendationId);
        if (!recommendation) return { status: "INVALID", reason: "RECOMMENDATION_NOT_FOUND" };
        if (recommendation.decision) return { status: "INVALID", reason: "RECOMMENDATION_ALREADY_DECIDED" };
        const allowedStatus = decision === "OVERRIDDEN"
          ? ["READY", "UNAVAILABLE"].includes(recommendation.status)
          : recommendation.status === "READY";
        if (!allowedStatus) return { status: "INVALID", reason: "RECOMMENDATION_NOT_DECIDABLE" };
        if (decision === "CONFIRMED" && recommendation.agentResult?.topRecommendation.responderId !== responderId) {
          return { status: "INVALID", reason: "CONFIRMATION_MUST_USE_COMPASS_WINNER" };
        }
        if (!["CONFIRMED", "OVERRIDDEN"].includes(decision)) return { status: "INVALID", reason: "DECISION_UNSUPPORTED" };
        if (!assertDispatchAuthorized(state, state.issues.find((row) => row.id === recommendation.issueId), responderId, recommendation.purpose)) return gatedResult();
        const assigned = assignInState(state, {
          issueId: recommendation.issueId,
          responderId,
          decision,
          eligibleResponderIds: recommendation.candidateEvidenceSnapshot.map((candidate) => candidate.responderId),
          purpose: recommendation.purpose ?? "INITIAL_ASSIGNMENT",
        });
        recommendation.decision = assigned.status === "STALE" ? "STALE" : assigned.status === "ASSIGNED" ? decision : null;
        recommendation.decisionResponderId = responderId;
        recommendation.acceptedResponderId = assigned.status === "ASSIGNED" ? responderId : null;
        recommendation.decisionAt = state.simulationState.simulationTime;
        if (assigned.status === "STALE") recommendation.staleReason = assigned.reason;
        return { ...assigned, recommendationId };
      });
    },
  };
}
