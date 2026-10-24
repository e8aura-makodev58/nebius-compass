import { reconcileRoomConsumables } from './consumable-life-service.mjs';
import { buildStationKpis } from './station-kpis.mjs';
import { createAskService } from './assistant.mjs';
import { claimInvestigationDeadlines } from './investigation-policy.mjs';
import { finishInvestigationDeadline } from './investigation-service.mjs';
import { createInvestigationService } from './investigation-service.mjs';
import { publicInvestigationState } from './investigation-public.mjs';
import { migrateInvestigationRecords } from './investigation-records.mjs';
import { assertDispatchAuthorized } from './dispatch-gate.mjs';
import { initializeFaults } from './fault-truth.mjs';
import { deterministicFixRecommendation, buildFixPacket } from './fix-evidence.mjs';
import { requestFixRanking } from './fix-ranking.mjs';
/**
 * The API-free Offline Demo runtime. Extracted from server.mjs unchanged so
 * the Control Room manager (control-room-manager.mjs) can construct one of
 * these per room without importing from server.mjs and creating a circular
 * dependency (server.mjs itself imports the manager to compose the boot
 * sequence). See Control_Rooms_SOW_v1_DRAFT.md §4.1.
 */
import { createInitialDemoState } from "./demo-state.mjs";
import { buildCandidatePacket, getNaiveScoreBaseline, getNearestAvailableBaseline } from "./context-engine.mjs";
import { requestAgentRecommendation } from "./agent.mjs";
import { createAuditStore } from "./audit-store.mjs";
import { logEvent } from "./application-log-store.mjs";
import { createAttempt, redactAttempt, replanAttempt, settleAttempt } from "./attempt-engine.mjs";
import { finalizeResolutionAttemptState } from "./resolution-engine.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { moveResponderToIssue, returnResponderToDutyStation } from "./responder-location.mjs";

export function createDemoRuntime(agentOptions = {}, auditStore = createAuditStore(), logger = null, runtimeOptions = {}) {
  const now = runtimeOptions.now ?? (() => Date.now());
  const simulatedMinutesPerRealSecond = runtimeOptions.simulatedMinutesPerRealSecond ?? 1;
  let offlineEpochRealTime = now();
  let offlineEpochSimulationTime = 0;

  function initializeOfflineState() {
    const state = createInitialDemoState();
    state.consumableObligations = [];
    state.issues.forEach((issue) => { issue.complexity = issue.id === "ISS-104" ? "COMPLEX" : "STANDARD"; });
    const startedAt = state.issues.map((row) => row.raisedAt).sort().at(-1);
    state.simulationState = { status: "RUNNING", simulationTime: startedAt, rngStreams: { attempt: runtimeOptions.attemptSeed ?? 9_973 } };
    state.responderSkills = structuredClone(createLiveSeed().responderSkills);
    state.operationalEvents = [];
    state.assignments = [{ id: "offline-assignment-001", issueId: "ISS-103", responderId: "R-OPER142", attemptId: null, role: "PRIMARY", status: "ACTIVE", createdAt: startedAt, joinedAt: startedAt, endedAt: null, endReason: null, roleHistory: [{ role: "PRIMARY", startedAt, endedAt: null }] }];
    state.resolutionAttempts = [];
    initializeFaults(state);
    const attempt = createAttempt(state, "ISS-103");
    state.assignments[0].attemptId = attempt.id;
    moveResponderToIssue(state, state.responders.find((row) => row.id === "R-OPER142"), state.issues.find((row) => row.id === "ISS-103"), "PRIMARY", "STATE_RECONCILIATION");
    offlineEpochRealTime = now();
    offlineEpochSimulationTime = Date.parse(startedAt);
    state.fieldReports = []; state.investigations = []; state.dispatchOffers ??= []; state.recommendations ??= [];
    return migrateInvestigationRecords(state);
  }
  let demoState = initializeOfflineState();
  const investigationStore = {
    snapshot: async () => structuredClone(demoState),
    async mutate(label, mutation) {
      const draft = structuredClone(demoState);
      const result = mutation(draft);
      if (result?.then) throw new Error('Offline investigation mutations must be synchronous');
      demoState = draft;
      return {label,result:structuredClone(result)};
    },
  };
  const assistant = createAskService(investigationStore,{mode:'fixture'});
  const investigations = createInvestigationService(investigationStore,{investigatorOptions:{mode:'fixture'},rankingOptions:{mode:'fixture'},narratorOptions:{mode:'fixture'}});
  async function finishInvestigationWork() { while (await investigations.runNext()) {} }
  let workflow = null;
  let requestSequence = 0;
  let offerDueAtRealTime = null;
  let supportOfferDueAtRealTime = null;
  let offlineRematchPromise = null;
  const offerDelayMs = runtimeOptions.offerDelayMs ?? 5_000;
  const supportOfferDelayMs = runtimeOptions.supportOfferDelayMs ?? Math.min(offerDelayMs, 1_000);

  function syncOfflineClock() {
    const elapsedWholeSeconds = Math.floor(Math.max(0, now() - offlineEpochRealTime) / 1_000);
    demoState.simulationState.simulationTime = new Date(offlineEpochSimulationTime + elapsedWholeSeconds * simulatedMinutesPerRealSecond * 60_000).toISOString();
    for (const trigger of claimInvestigationDeadlines(demoState)) finishInvestigationDeadline(demoState, trigger);
  }

  function finalizeOfflineDueAttempts() {
    const outcomes = [];
    for (const attempt of demoState.resolutionAttempts.filter((row) => row.status === "ACTIVE" && Date.parse(row.resolutionDueAt) <= Date.parse(demoState.simulationState.simulationTime))) {
      const outcome = finalizeResolutionAttemptState(demoState, attempt);
      if (["RESOLVED", "REOPENED"].includes(outcome.status)) outcomes.push(outcome);
    }
    return outcomes;
  }

  function offlineRoster(issueId) { return demoState.assignments.filter((row) => row.issueId === issueId && row.status === "ACTIVE"); }
  function offlineAttempt(issueId) { return demoState.resolutionAttempts.find((row) => row.issueId === issueId && row.status === "ACTIVE"); }
  function offlineAssign(issueId, responderId, role = "PRIMARY") {
    syncOfflineClock();
    const issue = demoState.issues.find((row) => row.id === issueId); const responder = demoState.responders.find((row) => row.id === responderId);
    if (!issue || !responder || responder.availability !== "AVAILABLE" || offlineRoster(issueId).length >= 2) return { status: "stale", reason: "responder-not-available" };
    if (!assertDispatchAuthorized(demoState, issue, responderId, role === "SUPPORT" ? "SUPPORT" : "INITIAL_ASSIGNMENT")) return { status: "gated" };
    let attempt = offlineAttempt(issueId);
    if (attempt) settleAttempt(demoState, attempt);
    const joinedAt = demoState.simulationState.simulationTime;
    const assignment = { id: `offline-assignment-${String(demoState.assignments.length + 1).padStart(3, "0")}`, issueId, responderId, attemptId: attempt?.id ?? null, role, status: "ACTIVE", createdAt: joinedAt, joinedAt, endedAt: null, endReason: null, roleHistory: [{ role, startedAt: joinedAt, endedAt: null }] };
    demoState.assignments.push(assignment);
    if (!attempt) { attempt = createAttempt(demoState, issueId); assignment.attemptId = attempt.id; }
    else { attempt.rosterVersion += 1; replanAttempt(demoState, attempt); }
    issue.status = "ASSIGNED"; if (role === "PRIMARY") issue.assignedResponderId = responderId;
    responder.availability = "ASSIGNED"; responder.currentIssueId = issueId; moveResponderToIssue(demoState, responder, issue, role, role === "SUPPORT" ? "ASSISTANCE_JOINED" : "ASSIGNMENT_ACCEPTED");
    if (role === "SUPPORT") attempt.assistance = { status: "STAFFED", trigger: workflow?.assistanceTrigger ?? "COMPLEX_ISSUE" };
    return { status: "assigned", responderId, assignment };
  }

  function startOfflineSupportOffer(trigger = "OPERATOR_REQUEST") {
    const issueId = "ISS-104"; const rosterIds = new Set(offlineRoster(issueId).map((row) => row.responderId));
    if (offlineRoster(issueId).length !== 1) return { status: "CONFLICT", reason: "SUPPORT_SLOT_UNAVAILABLE" };
    const ranked = workflow.agentOutcome?.result?.rankedCandidates ?? [];
    const candidate = ranked.find((row) => !rosterIds.has(row.responderId) && demoState.responders.find((responder) => responder.id === row.responderId)?.availability === "AVAILABLE");
    if (!candidate) return { status: "CONFLICT", reason: "NO_SUPPORT_AVAILABLE" };
    const responder = demoState.responders.find((row) => row.id === candidate.responderId); responder.availability = "OFFERED";
    workflow.assistanceTrigger = trigger; workflow.supportOffer = { status: "PENDING", purpose: "ASSISTANCE", responderId: responder.id, rank: candidate.rank };
    offlineAttempt(issueId).assistance = { status: "REQUESTED", trigger };
    supportOfferDueAtRealTime = now() + supportOfferDelayMs;
    return { status: "OFFERED", responderId: responder.id };
  }

  function prepareOfflineWorkflow(issueId) {
    requestSequence += 1;
    const requestId = `rec-${issueId}-${requestSequence}`;
    workflow = {
      candidatePacket: buildCandidatePacket(demoState, issueId, requestId),
      nearestBaseline: getNearestAvailableBaseline(demoState, issueId),
      naiveScoreBaseline: getNaiveScoreBaseline(demoState, issueId),
      agentOutcome: null,
    };
    return requestId;
  }

  function snapshot() {
    syncOfflineClock();
    const outcomes = finalizeOfflineDueAttempts();
    for (const outcome of outcomes) {
      if (workflow?.candidatePacket?.issue?.issueId === outcome.issueId && workflow.supportOffer?.status === "PENDING") {
        const offeredSupport = demoState.responders.find((row) => row.id === workflow.supportOffer.responderId);
        if (offeredSupport?.availability === "OFFERED") offeredSupport.availability = "AVAILABLE";
        workflow.supportOffer.status = "CANCELLED";
        supportOfferDueAtRealTime = null;
      }
      if (outcome.status === "REOPENED") {
        prepareOfflineWorkflow(outcome.issueId);
        workflow.resolution = { status: outcome.status, responderId: outcome.responderId };
        demoState.issues.find((row) => row.id === outcome.issueId).status = "RECOMMENDATION_READY";
        offlineRematchPromise = completeRecommendation(outcome.issueId)
          .catch((error) => logEvent(logger, "offline_rematch_failed", { issueId: outcome.issueId, error: error.message }))
          .finally(() => { offlineRematchPromise = null; });
      } else if (workflow?.candidatePacket?.issue?.issueId === outcome.issueId) {
        workflow.resolution = { status: outcome.status, responderId: outcome.responderId };
      }
    }
    if (workflow?.offer?.status === "PENDING" && offerDueAtRealTime !== null && now() >= offerDueAtRealTime) {
      const responder = demoState.responders.find((entry) => entry.id === workflow.offer.responderId);
      if (responder?.availability === "OFFERED") responder.availability = "AVAILABLE";
      const assignment = offlineAssign(workflow.candidatePacket.issue.issueId, workflow.offer.responderId);
      workflow.offer.status = assignment.status === "assigned" ? "ACCEPTED" : "CANCELLED";
      workflow.decision = assignment.status === "assigned"
        ? { status: "AUTO_ACCEPTED", responderId: assignment.responderId, assignedResponderId: assignment.responderId }
        : { status: "STALE", responderId: workflow.offer.responderId, reason: assignment.reason };
      offerDueAtRealTime = null;
      void auditStore.updateDecision(workflow.candidatePacket.recommendationRequestId, {
        decision: workflow.decision.status,
        humanDecision: null,
        assignedResponderId: workflow.decision.assignedResponderId ?? null,
        decisionResponderId: workflow.offer.responderId,
        decisionAt: new Date().toISOString(),
      }).catch((error) => logEvent(logger, "audit_update_failed", {
        requestId: workflow.candidatePacket.recommendationRequestId,
        error: error.message,
      }));
      logEvent(logger, "assignment_completed", {
        issueId: workflow.candidatePacket.issue.issueId,
        requestId: workflow.candidatePacket.recommendationRequestId,
        decision: workflow.decision.status,
        requestedResponderId: workflow.offer.responderId,
        assignedResponderId: workflow.decision.assignedResponderId ?? null,
        reason: workflow.decision.reason ?? null,
      });
      if (assignment.status === "assigned" && demoState.issues.find((row) => row.id === workflow.candidatePacket.issue.issueId).complexity === "COMPLEX") startOfflineSupportOffer("COMPLEX_ISSUE");
    }
    if (workflow?.supportOffer?.status === "PENDING" && supportOfferDueAtRealTime !== null && now() >= supportOfferDueAtRealTime) {
      const responder = demoState.responders.find((row) => row.id === workflow.supportOffer.responderId);
      if (responder?.availability === "OFFERED") responder.availability = "AVAILABLE";
      const assignment = offlineAssign("ISS-104", workflow.supportOffer.responderId, "SUPPORT");
      workflow.supportOffer.status = assignment.status === "assigned" ? "ACCEPTED" : "CANCELLED";
      supportOfferDueAtRealTime = null;
      offlineRematchPromise = null;
    }
    const { responderSkills, faultTruth, fieldReports, investigations, investigationSequences, consumableInputs, consumableReconciliation, consumableObligations, ...publicState } = structuredClone(demoState);
    const { rngStreams, ...publicSimulationState } = publicState.simulationState;
    publicState.simulationState = publicSimulationState;
    publicState.resolutionAttempts = publicState.resolutionAttempts.map(redactAttempt);
    publicState.resolutionHistory = publicState.resolutionHistory.map((record) => record.participants ? { ...record, participants: record.participants.map(({ contributionShare, ...participant }) => participant) } : record);
    return structuredClone({ ...publicState, ...publicInvestigationState(demoState), workflow, askHistory:assistant.history() });
  }

  async function completeRecommendation(issueId) {
    const fixIssue = demoState.issues.find((row) => row.id === issueId);
    if (!fixIssue.fixRecommendation?.modelAttempted) {
      const fixOutcome = await requestFixRanking(buildFixPacket(demoState, issueId), { mode: 'fixture' });
      fixIssue.fixRecommendation = { ...deterministicFixRecommendation(demoState, fixIssue), modelAttempted: true,
        ...(fixOutcome.status === 'ok' ? { status: 'READY', source: 'FIXTURE', rankedFixes: fixOutcome.result.rankedFixes, modelInfo: fixOutcome.modelInfo } : {}) };
      fixIssue.fixRecommendation.disagreement = fixIssue.fixRecommendation.rankedFixes[0].fixId !== fixIssue.fixRecommendation.baselineFixId;
    }
    const packet = workflow.candidatePacket;
    const requestId = packet.recommendationRequestId;
    const outcome = await requestAgentRecommendation(packet, agentOptions);
    if (workflow?.candidatePacket?.recommendationRequestId !== requestId) return { status: "STALE" };
    workflow = { ...workflow, agentOutcome: outcome };
    await auditStore.create({
      requestId,
      timestamp: new Date().toISOString(),
      issueId,
      candidateEvidenceSnapshot: packet.candidates,
      nearestBaseline: workflow.nearestBaseline,
      naiveScoreBaseline: workflow.naiveScoreBaseline,
      modelInfo: outcome.modelInfo,
      schemaVersion: packet.schemaVersion,
      structuredAgentOutput: outcome.status === "ok" ? outcome.result : { status: "unavailable", reason: outcome.reason },
      humanDecision: null,
      decision: null,
      assignedResponderId: null,
    });
    logEvent(logger, "recommendation_completed", {
      issueId,
      requestId,
      outcome: outcome.status,
      recommendedResponderId: outcome.status === "ok" ? outcome.result.topRecommendation.responderId : null,
      reason: outcome.status === "unavailable" ? outcome.reason : null,
    });
    const responderId = outcome.status === "ok"
      ? outcome.result.topRecommendation.responderId
      : workflow.naiveScoreBaseline.responderId;
    const responder = demoState.responders.find((entry) => entry.id === responderId);
    responder.availability = "OFFERED";
    demoState.issues.find((entry) => entry.id === issueId).status = "OFFER_PENDING";
    workflow.offer = { status: "PENDING", responderId, rank: 1 };
    offerDueAtRealTime = now() + offerDelayMs;
    logEvent(logger, "assignment_offered", { issueId, requestId, responderId });
    return { status: "OFFERED", requestId, responderId };
  }

  return {
    snapshot,
    reconcileConsumables: () => reconcileRoomConsumables(investigationStore),
    stationKpis:query => buildStationKpis(demoState, query),
    ask:(input)=>assistant.ask(input),
    getAsk:(id)=>assistant.get(id),
    updateInvestigationPolicy:(input)=>investigations.updatePolicy(input),
    async reinvestigate(id,input) {const result=await investigations.reinvestigate(id,input);await finishInvestigationWork();return result;},
    async submitReport(input) { const result=await investigations.submit(input);await finishInvestigationWork();return result; },
    async confirmReport(id,input) { const result=await investigations.confirm(id,input);await finishInvestigationWork();return result; },
    closeReport:(id,input)=>investigations.close(id,input), getReport:(id)=>investigations.getReport(id),
    getInvestigation:(id)=>investigations.getInvestigation(id), getCase:(id)=>investigations.getCase(id),
    decideInvestigation:(id,input,action)=>investigations.decide(id,input,action),
    reset() {
      assistant.clear();
      demoState = initializeOfflineState();
      workflow = null;
      requestSequence = 0;
      offerDueAtRealTime = null;
      supportOfferDueAtRealTime = null;
      offlineRematchPromise = null;
      return snapshot();
    },
    async raiseIssue(issueId) {
      const issue = demoState.issues.find((entry) => entry.id === issueId);
      if (!issue) throw new Error(`Issue ${issueId} was not found`);
      if (issue.status === "ASSIGNED" || issue.status === "RESOLVED") {
        throw new Error(`Issue ${issueId} cannot be raised from ${issue.status}`);
      }
      issue.status = "RECOMMENDATION_READY";
      const requestId = prepareOfflineWorkflow(issueId);
      logEvent(logger, "context_prepared", {
        issueId,
        requestId,
        eligibleCandidateCount: workflow.candidatePacket.candidates.length,
      });
      await completeRecommendation(issueId);
      return snapshot();
    },
    async requestRecommendation(issueId) {
      if (!workflow || workflow.candidatePacket.issue.issueId !== issueId) {
        throw new Error(`Issue ${issueId} has no prepared candidate packet; raise it first`);
      }
      if (!workflow.agentOutcome) await completeRecommendation(issueId);
      return snapshot();
    },
    async decideAssignment(issueId, responderId, decision) {
      if (!workflow || workflow.candidatePacket.issue.issueId !== issueId) {
        throw new Error(`Issue ${issueId} has no recommendation to decide`);
      }
      const recommendation = workflow.agentOutcome?.status === "ok"
        ? workflow.agentOutcome.result.topRecommendation.responderId
        : workflow.naiveScoreBaseline.responderId;
      if (decision === "CONFIRMED" && responderId !== recommendation) {
        throw new Error("Confirmation must use the validated Compass recommendation");
      }
      const offeredResponder = demoState.responders.find((entry) => entry.id === workflow.offer?.responderId);
      if (workflow.offer?.status === "PENDING") {
        workflow.offer.status = "CANCELLED";
        if (offeredResponder?.availability === "OFFERED") offeredResponder.availability = "AVAILABLE";
        offerDueAtRealTime = null;
      }
      const assignment = offlineAssign(issueId, responderId);
      if (assignment.status === "invalid") {
        throw new Error(`Assignment could not be completed: ${assignment.reason}`);
      }
      workflow = {
        ...workflow,
        decision: assignment.status === "assigned"
          ? { status: decision, responderId, assignedResponderId: assignment.responderId }
          : { status: "STALE", responderId, reason: assignment.reason },
      };
      if (assignment.status === "assigned" && demoState.issues.find((row) => row.id === issueId).complexity === "COMPLEX") startOfflineSupportOffer("COMPLEX_ISSUE");
      await auditStore.updateDecision(workflow.candidatePacket.recommendationRequestId, {
        decision: workflow.decision.status,
        humanDecision: workflow.decision.status,
        assignedResponderId: workflow.decision.assignedResponderId ?? null,
        decisionResponderId: responderId,
        decisionAt: new Date().toISOString(),
      });
      logEvent(logger, "assignment_completed", {
        issueId,
        requestId: workflow.candidatePacket.recommendationRequestId,
        decision: workflow.decision.status,
        requestedResponderId: responderId,
        assignedResponderId: workflow.decision.assignedResponderId ?? null,
        reason: workflow.decision.reason ?? null,
      });
      return snapshot();
    },
    getAuditEvent(requestId) {
      return auditStore.get(requestId);
    },
    requestAssistance(issueId) {
      if (issueId !== "ISS-104") return snapshot();
      const result = startOfflineSupportOffer("OPERATOR_REQUEST");
      if (result.status === "CONFLICT") { const error = new Error(result.reason); error.statusCode = 409; error.code = result.reason; throw error; }
      return snapshot();
    },
    releaseResponder({ issueId, responderId, expectedRosterVersion }) {
      syncOfflineClock();
      const attempt = offlineAttempt(issueId); const roster = offlineRoster(issueId);
      if (!attempt || attempt.rosterVersion !== expectedRosterVersion || roster.length !== 2) { const error = new Error("Offline roster changed or has only one responder"); error.statusCode = 409; error.code = "STALE_OR_SOLE_ROSTER"; throw error; }
      const removed = roster.find((row) => row.responderId === responderId); const remaining = roster.find((row) => row.responderId !== responderId);
      settleAttempt(demoState, attempt);
      removed.status = "RELEASED"; removed.endedAt = demoState.simulationState.simulationTime; removed.endReason = "CENTRAL_RELEASE"; removed.roleHistory.at(-1).endedAt = removed.endedAt;
      const responder = demoState.responders.find((row) => row.id === responderId); responder.availability = "AVAILABLE"; delete responder.currentIssueId; returnResponderToDutyStation(demoState, responder, "CENTRAL_RELEASE");
      if (removed.role === "PRIMARY") { remaining.roleHistory.at(-1).endedAt = removed.endedAt; remaining.roleHistory.push({ role: "PRIMARY", startedAt: removed.endedAt, endedAt: null }); remaining.role = "PRIMARY"; demoState.issues.find((row) => row.id === issueId).assignedResponderId = remaining.responderId; }
      attempt.rosterVersion += 1; attempt.assistance = { status: "NONE", generation: (attempt.assistance.generation ?? 0) + 1, trigger: null, cooldownUntil: null }; replanAttempt(demoState, attempt);
      return snapshot();
    },
    transferResponder() {
      const error = new Error("Offline fixture has only one dispatchable issue; cross-issue transfer is unavailable"); error.statusCode = 409; error.code = "OFFLINE_TRANSFER_UNAVAILABLE"; throw error;
    },
  };
}
