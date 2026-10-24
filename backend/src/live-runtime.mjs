import { createCalibrationService, buildCalibrations } from './calibration-service.mjs';
import { buildCellReadiness } from './cell-readiness.mjs';
import { createLoadboardService } from './loadboard-service.mjs';
import { buildConsumableObligations } from './consumable-obligations.mjs';
import { buildLoadboards } from './loadboards.mjs';
import { reconcileRoomConsumables } from './consumable-life-service.mjs';
import { createAskService } from './assistant.mjs';
import { createInvestigationService } from './investigation-service.mjs';
import {cloneDraftValue} from './live-draft.mjs';
import { createStaffingService, createStaffingReview, finishStaffingDeadline, decideStaffing, updateStaffingPolicy } from './staffing-service.mjs';
import { createFixRecommendationService } from './fix-recommendation-service.mjs';
import { AsyncLocalStorage } from "node:async_hooks";
import { createEventPlanningService } from "./event-planner.mjs";
import { createLiveAssignmentService } from "./live-assignment-service.mjs";
import { createLiveRecommendationService } from "./live-recommendation-service.mjs";
import { createLiveStore } from "./live-store.mjs";
import { createResolutionEngine } from "./resolution-engine.mjs";
import { createScheduler } from "./scheduler.mjs";
import { createSimulationClock } from "./simulation-clock.mjs";
import { buildAnalytics, buildPeriodAnalytics } from "./analytics-service.mjs";
import { buildStationKpis } from './station-kpis.mjs';
import { buildParetoAnalytics } from "./pareto-analytics.mjs";
import { createIssueAuditRecord } from "./live-schema.mjs";
import { applyWorkforceTrigger, selectNextQueuedIssue, priorityForIssue, requestStaffingRecheck } from "./workforce-continuity.mjs";

export function createLiveRuntime({
  store = createLiveStore(),
  plannerOptions = { mode: process.env.COMPASS_EVENT_PLANNER_MODE ?? "live" },
  agentOptions = { mode: process.env.COMPASS_LIVE_COMPASS_MODE ?? "live" },
  narratorOptions = { mode: process.env.COMPASS_NARRATOR_MODE ?? process.env.COMPASS_LIVE_COMPASS_MODE ?? "live" },
  requestRecommendation,
  requestFixRecommendation,
  requestStaffingRecommendation,
  investigatorOptions = { mode: process.env.COMPASS_INVESTIGATOR_MODE ?? process.env.COMPASS_LIVE_COMPASS_MODE ?? "live" },
  assistantOptions = { mode: process.env.COMPASS_ASSISTANT_MODE ?? process.env.COMPASS_LIVE_COMPASS_MODE ?? "live" },
  logger = null,
} = {}) {
  const clock = createSimulationClock(store);
  const planner = createEventPlanningService(store, { plannerOptions });
  const resolution = createResolutionEngine(store);
  const recommendations = createLiveRecommendationService(store, { agentOptions, ...(requestRecommendation ? { requestRecommendation } : {}) });
  const assignments = createLiveAssignmentService(store);
  const fixRecommendations = createFixRecommendationService(store, { agentOptions, ...(requestFixRecommendation ? { requestRanking: requestFixRecommendation } : {}) });
  const staffingService = createStaffingService(store, { agentOptions, ...(requestStaffingRecommendation ? { requestRanking: requestStaffingRecommendation } : {}) });
  const investigations = createInvestigationService(store, { investigatorOptions, rankingOptions: agentOptions, narratorOptions });
  const assistant = createAskService(store,{assistantOptions});
  const calibrationService = createCalibrationService(store);
  const loadboardService = createLoadboardService(store);
  let investigationWork = null;
  let investigationQueued = false;
  function scheduleInvestigationWork() {
    if (investigationWork || investigationQueued) return;
    investigationQueued = true;
    agentQueue.push(() => {
      investigationQueued = false;
      let failed = false;
      investigationWork = (async () => { while (await investigations.runNext()) {} })()
        .catch(() => { failed = true; /* Persisted claims recover on restart; never log model text. */ })
        .finally(async () => {
          const snapshot = await store.snapshot();
          investigationWork = null;
          if (!failed && (snapshot.investigations?.some((row)=>row.status==='QUEUED') || snapshot.fieldReports?.some((row)=>(row.status==='UNRESOLVED'&&row.interpretation.status==='QUEUED')||row.narrationStatus==='QUEUED'))) scheduleInvestigationWork();
        });
    });
    startAgentLane();
  }
  let staffingWork = null;
  let staffingWorkQueued = false;
  let fixWork = null;
  let fixWorkQueued = false;
  let loop = null;
  let lastRealTick = null;
  let tickRunning = false;
  let autonomousDispatchRunning = false;
  const deferredAgentWork = [];
  // Model-bound work started by the real-time loop runs in this serialized lane
  // so a slow provider never holds the clock. Every other caller (API actions,
  // tests, offline history generation) runs it inline, which keeps their
  // ordering, and generated history, exactly as before.
  const loopContext = new AsyncLocalStorage();
  const agentQueue = [];
  let agentLane = null;
  let dispatchQueued = false;

  function inLoop() { return loopContext.getStore() === true; }
  // With a live provider, the planner and each ranking take tens of seconds. Rooms pass
  // their options as functions over the saved provider settings, so resolve them per call.
  async function liveProviderCalls() {
    const resolveOptions = async (options) => (typeof options === "function" ? await options() : options);
    const [planner, compass] = await Promise.all([resolveOptions(plannerOptions), resolveOptions(agentOptions)]);
    return [planner?.mode, compass?.mode].includes("live");
  }

  function startAgentLane() {
    if (agentLane) return;
    agentLane = loopContext.exit(async () => {
      try {
        while (agentQueue.length) {
          try { await agentQueue.shift()(); }
          catch (error) { logger?.log(JSON.stringify({ timestamp: new Date().toISOString(), event: "live_agent_work_error", error: error.message })); }
        }
      } finally { agentLane = null; }
    });
  }

  function runAgentWork(work) {
    if (!inLoop()) return work();
    agentQueue.push(work);
    startAgentLane();
  }
  const agentActivity = {
    staffing: { agent: "STAFFING_RANKING", status: "IDLE", detail: "Waiting for staffing review." },
    fixes: { agent: "FIX_RANKING", status: "IDLE", detail: "Waiting for fix evidence.", startedAtRealTime: null, completedAtRealTime: null },
    eventPlanner: { agent: "EVENT_PLANNER", status: "IDLE", detail: "Waiting for the next event opportunity.", startedAtRealTime: null, completedAtRealTime: null },
    compass: { agent: "COMPASS", status: "IDLE", detail: "Waiting for a recommendation request.", startedAtRealTime: null, completedAtRealTime: null },
  };

  async function trackAgent(agentName, detail, operation, describeResult) {
    const activity = agentActivity[agentName];
    activity.status = "RUNNING";
    activity.detail = detail;
    activity.startedAtRealTime = new Date().toISOString();
    activity.completedAtRealTime = null;
    try {
      const result = await operation();
      activity.status = "COMPLETED";
      activity.detail = describeResult(result);
      activity.completedAtRealTime = new Date().toISOString();
      return result;
    } catch (error) {
      activity.status = "FAILED";
      activity.detail = error.message;
      activity.completedAtRealTime = new Date().toISOString();
      throw error;
    }
  }

  function recommendWithActivity(issueId, options = {}) {
    return trackAgent(
      "compass",
      `Generating a responder recommendation for ${issueId}.`,
      () => recommendations.recommend(issueId, options),
      (outcome) => {
        const status = outcome?.result?.status ?? outcome?.status ?? "COMPLETED";
        return status === "READY"
          ? `Recommendation ready for ${issueId}.`
          : `Recommendation request for ${issueId} completed with status ${status}.`;
      },
    );
  }

  async function matchAndOffer(issueId, options = {}, retriesRemaining = 2) {
    const recommended = await recommendWithActivity(issueId, options);
    const recommendationResult = recommended?.result ?? recommended;
    if (["STALE_CANDIDATES", "STALE_REQUEST"].includes(recommendationResult.status) && retriesRemaining > 0) {
      return matchAndOffer(issueId, options, retriesRemaining - 1);
    }
    if (!["READY", "UNAVAILABLE"].includes(recommendationResult.status)) return recommended;
    return assignments.offerNextCandidate(recommendationResult.recommendationId);
  }

  async function recommendPending() {
    // Dispatch is deliberately queue-first: candidate ranking is only invoked
    // after deterministic application code has selected the next issue.
    const snapshot = await store.snapshot();
    if (!snapshot.responders.some((responder) => responder.availability === "AVAILABLE")) return;
    const next = selectNextQueuedIssue(snapshot);
    if (!next) return;
    await store.mutate("workforce-priority-band", (state) => {
      const issue = state.issues.find((row) => row.id === next.issue.id);
      if (issue?.status === "PENDING") issue.priorityBand = priorityForIssue(issue, state.simulationState.simulationTime);
    });
    await matchAndOffer(next.issue.id);
  }

  async function drainDeferredAgentWork() {
    while (deferredAgentWork.length) await runAgentWork(deferredAgentWork.shift());
  }

  async function requestComplexAssistanceIfNeeded(issueId, { defer = false } = {}) {
    const snapshot = await store.snapshot();
    const issue = snapshot.issues.find((row) => row.id === issueId);
    if (issue?.complexity !== "COMPLEX" || activeRosterCount(snapshot, issueId) !== 1) return;
    const requested = await assignments.requestAssistance(issueId, "COMPLEX_ISSUE");
    if (requested.result.status !== "REQUESTED") return;
    const work = () => matchAndOffer(issueId, { purpose: "ASSISTANCE", trigger: "COMPLEX_ISSUE" });
    if (defer) deferredAgentWork.push(work);
    else await work();
  }

  const scheduler = createScheduler(store, {
    onInvestigationDeadline: (trigger) => investigations.finishDeadline(trigger),
    onEventDue: (trigger) => runAgentWork(async () => {
      const planned = await trackAgent(
        "eventPlanner",
        "Generating and validating the next operational event.",
        () => planner.handleEventDue(trigger),
        (outcome) => {
          const result = outcome.result ?? outcome;
          if (result.status !== "PERSISTED") return `Event attempt completed with status ${result.status}.`;
          return result.source === "EVENT_PLANNER" ? `New event ${result.issueId} generated.` : `New event ${result.issueId} created by deterministic fallback.`;
        },
      );
      const result = planned.result ?? planned;
      if (result.status === "PERSISTED") {
        await store.mutate('issue-staffing-recheck', (state) => requestStaffingRecheck(state, 'ISSUE_RAISED'));
        scheduleInvestigationWork();
        await recommendPending();
      }
    }),
    onResolutionDue: async (trigger) => {
      const resolved = await resolution.handleResolutionDue(trigger);
      if (["RESOLVED", "REOPENED"].includes(resolved.result.status)) {
        await store.mutate('release-staffing-recheck', (state) => requestStaffingRecheck(state, 'ASSIGNMENT_RELEASED'));
        deferredAgentWork.push(() => recommendPending());
      }
    },
    onOfferDue: async (trigger) => {
      const responded = await assignments.handleOfferDue(trigger);
      if (responded.result.status === "REJECTED") await assignments.offerNextCandidate(responded.result.recommendationId);
      if (responded.result.status === "ASSIGNED" && responded.result.role === "PRIMARY") {
        await requestComplexAssistanceIfNeeded(responded.result.issueId, { defer: true });
      }
    },
    onAssistanceReviewDue: async (trigger) => {
      const reviewed = await assignments.handleAssistanceReview(trigger);
      if (reviewed.result.status === "REQUESTED") deferredAgentWork.push(() => matchAndOffer(reviewed.result.issueId, { purpose: "ASSISTANCE", trigger: reviewed.result.trigger }));
    },
    onWorkforceDue: async (trigger) => {
      await store.mutate(`workforce-${trigger.kind.toLowerCase()}`, (state) => ['STAFFING_REVIEW_DUE','STAFFING_RECHECK'].includes(trigger.kind) ? createStaffingReview(state, trigger) : trigger.kind === 'STAFFING_DEADLINE_DUE' ? finishStaffingDeadline(state, trigger) : applyWorkforceTrigger(state, trigger));
      deferredAgentWork.push(() => recommendPending());
    },
  });

  async function ensureAutonomousDispatch() {
    if (autonomousDispatchRunning) return;
    autonomousDispatchRunning = true;
    try {
      const snapshot = await store.snapshot();
      if (snapshot.simulationState.status !== "RUNNING") return;
      const now = Date.parse(snapshot.simulationState.simulationTime);
      const available = snapshot.responders.some((responder) => responder.availability === "AVAILABLE");
      if (!available) return;
      await recommendPending();
      for (const issue of snapshot.issues) {
        if (issue.status !== "ASSIGNED" || activeRosterCount(snapshot, issue.id) !== 1) continue;
        const attempt = snapshot.resolutionAttempts.find((row) => row.issueId === issue.id && row.status === "ACTIVE");
        if (!attempt || !["WAITING", "EXHAUSTED"].includes(attempt.assistance?.status)) continue;
        if (attempt.assistance.cooldownUntil && Date.parse(attempt.assistance.cooldownUntil) > now) continue;
        const requested = await assignments.requestAssistance(issue.id, attempt.assistance.trigger ?? "BEHIND_PLAN");
        if (requested.result.status === "REQUESTED") await matchAndOffer(issue.id, { purpose: "ASSISTANCE", trigger: attempt.assistance.trigger ?? "BEHIND_PLAN" });
      }
    } finally {
      autonomousDispatchRunning = false;
    }
  }

  async function rankNextFix() {
    const select = (state) => state.simulationState.status !== 'RUNNING' ? null : state.issues.find((row) => row.dispatchGate !== 'INVESTIGATION' && row.status !== 'RESOLVED' && row.fixRecommendation?.status !== 'PENDING_MODEL' && !row.fixRecommendation?.modelAttempted)?.id;
    const issueId = store.project ? await store.project(select) : select(await store.snapshot());
    if (!issueId) return;
    return trackAgent('fixes', `Ranking supplied fixes for ${issueId}.`, () => fixRecommendations.recommend(issueId),
      (outcome) => `Fix ranking for ${issueId}: ${outcome?.result?.status ?? outcome?.status ?? 'complete'}.`);
  }

  async function scheduleFixWork() {
    if (!inLoop()) { await rankNextFix(); return; }
    if (fixWork || fixWorkQueued) return;
    fixWorkQueued = true;
    runAgentWork(async () => {
      fixWorkQueued = false;
      if (fixWork) return;
      // Initiated by the live agent lane, but the tracked provider wait yields
      // that lane to responder dispatch. At most one fix request per room.
      fixWork = rankNextFix().catch(() => { /* trackAgent records bounded failure status */ }).finally(() => { fixWork = null; });
    });
  }

  async function withState(action) {
    return { mode: "LIVE", action: action?.result ?? action ?? null, agentActivity: structuredClone(agentActivity), ...(await store.publicSnapshot()), askHistory: assistant.history() };
  }

  // Shared engine cycle without a UI projection. Offline history generation
  // drives this sequentially; interactive callers still receive withState.
  async function advanceSimulation(realElapsedMilliseconds) {
    const transaction = await scheduler.tick(realElapsedMilliseconds);
    await drainDeferredAgentWork();
    if (!inLoop()) await ensureAutonomousDispatch();
    else if (!dispatchQueued) {
      // One queued dispatch pass at a time: it re-reads state when it runs.
      dispatchQueued = true;
      runAgentWork(async () => { dispatchQueued = false; await ensureAutonomousDispatch(); });
    }
    if (!inLoop()) await staffingService.rankNext();
    else if (!staffingWork && !staffingWorkQueued) {
      staffingWorkQueued = true;
      runAgentWork(async () => {
        staffingWorkQueued = false;
        if (!staffingWork) staffingWork = trackAgent('staffing', 'Ranking lawful staffing options.', () => staffingService.rankNext(), () => 'Staffing ranking checked.').catch(() => {}).finally(() => { staffingWork = null; });
      });
    }
    await scheduleFixWork();
    if (!inLoop()) {
      scheduleInvestigationWork();
      while (agentLane || investigationWork || investigationQueued) { if (agentLane) await agentLane; if (investigationWork) await investigationWork; }
    }
    if ((await store.snapshot()).investigations?.some((row)=>row.status==='QUEUED')) scheduleInvestigationWork();
    return transaction.result;
  }

  /**
   * One real-time-driven scheduler cycle: what `startLoop`'s own interval used
   * to run inline. A closure function (not a method depending on `this`) so a
   * Control Room manager driving N rooms from one process-level interval can
   * call it directly per room, without each room owning its own `setInterval`
   * — see Control_Rooms_SOW_v1_DRAFT.md §4.1. Self-arms `lastRealTick` on
   * first call so it also works with no prior `startLoop()` call.
   */
  async function runScheduledTick() {
    if (tickRunning) return;
    tickRunning = true;
    const now = performance.now();
    if (lastRealTick === null) lastRealTick = now;
    const elapsed = now - lastRealTick;
    lastRealTick = now;
    try {
      const snapshot = await store.snapshot();
      await reconcileRoomConsumables(store, snapshot);
      if (snapshot.simulationState.status === "RUNNING") {
        await loopContext.run(true, () => advanceSimulation(elapsed));
      }
    } catch (error) {
      logger?.log(JSON.stringify({ timestamp: new Date().toISOString(), event: "live_scheduler_error", error: error.message }));
    } finally { tickRunning = false; }
  }

  return {
    mode: "LIVE",
    store,
    reconcileConsumables: () => reconcileRoomConsumables(store),
    ask:(input)=>assistant.ask(input),
    getAsk:(id)=>assistant.get(id),
    async snapshot() { return withState(null); },
    async updateInvestigationPolicy(input) { return investigations.updatePolicy(input); },
    async reinvestigate(id,input) { const result=await investigations.reinvestigate(id,input);scheduleInvestigationWork();return result; },
    async submitReport(input) { const result = await investigations.submit(input); scheduleInvestigationWork(); return result; },
    async confirmReport(id,input) { const result = await investigations.confirm(id,input); scheduleInvestigationWork(); return result; },
    closeReport: (id,input) => investigations.close(id,input),
    getReport: (id) => investigations.getReport(id),
    getInvestigation: (id) => investigations.getInvestigation(id),
    getCase: (id) => investigations.getCase(id),
    decideInvestigation: (id,input,action) => investigations.decide(id,input,action),
    async analytics() { return { mode: "LIVE", ...(store.project ? await store.project(buildAnalytics) : buildAnalytics(await store.snapshot())) }; },
    async analyticsPeriod(query) { return { mode: "LIVE", ...(store.project ? await store.project((state) => buildPeriodAnalytics(state, query)) : buildPeriodAnalytics(await store.snapshot(), query)) }; },
    enterCalibration: input => calibrationService.enter(input),
    async calibrations(query) { return store.project ? store.project(state => buildCalibrations(state, query)) : buildCalibrations(await store.snapshot(), query); },
    enterLoadboard: input => loadboardService.enterBoard(input),
    checkoutLoadboard: input => loadboardService.checkout(input),
    releaseLoadboard: input => loadboardService.release(input),
    async consumableObligations(query) { return store.project ? store.project(state => buildConsumableObligations(state, query)) : buildConsumableObligations(await store.snapshot(), query); },
    async cellReadiness(query) { return store.project ? store.project(state => buildCellReadiness(state, query)) : buildCellReadiness(await store.snapshot(), query); },
    async loadboards(query) { return store.project ? store.project(state => buildLoadboards(state, query)) : buildLoadboards(await store.snapshot(), query); },
    async stationKpis(query) { return store.project ? store.project(state => buildStationKpis(state, query)) : buildStationKpis(await store.snapshot(), query); },
    async analyticsPareto(query) { return { mode: "LIVE", ...(store.project ? await store.project((state) => buildParetoAnalytics(state, query)) : buildParetoAnalytics(await store.snapshot(), query)) }; },
    async reset() {
      await store.reset();
      assistant.clear();
      Object.assign(agentActivity.eventPlanner, { status: "IDLE", detail: "Waiting for the next event opportunity.", startedAtRealTime: null, completedAtRealTime: null });
      Object.assign(agentActivity.compass, { status: "IDLE", detail: "Waiting for a recommendation request.", startedAtRealTime: null, completedAtRealTime: null });
      return withState({ status: "RESET" });
    },
    async start() { return withState(await clock.start()); },
    async pause(payload) { return withState(await clock.pause(payload)); },
    async resume() { return withState(await clock.resume()); },
    async setSpeed(speed) { return withState(await clock.setSpeed(speed)); },
    async forceNextEvent() {
      // "Trigger Next Event" claims the event at once. With a live provider the
      // planner and the dispatch ranking then run in the agent lane, so the
      // operator's request returns in milliseconds instead of minutes; the new
      // issue appears on the next poll. Offline-style modes stay inline.
      if (await liveProviderCalls()) return withState(await loopContext.run(true, () => scheduler.forceNextEvent()));
      return withState(await scheduler.forceNextEvent());
    },
    async forceResolve(issueId) { const result = await scheduler.forceResolve(issueId); await drainDeferredAgentWork(); return withState(result); },
    async decideStaffing(id, {decision,optionId,reason,expectedRevision}) { return withState(await store.mutate('staffing-decision', (state) => decideStaffing(state, id, {decision,optionId,reason,expectedRevision}))); },
    async updateStaffingPolicy(input) { return withState(await store.mutate('staffing-policy', (state) => updateStaffingPolicy(state, input))); },
    async updateWorkforceScenario({ scenario, expectedRevision }) {
      const result = await store.mutate("workforce-scenario-update", (state) => {
        const config = state.workforceContinuity;
        if (!config || !["NORMAL", "ELEVATED_DEMAND", "PERSONNEL_SHORTAGE", "RECURRING_TEMPORARY_REPAIRS", "AUTO"].includes(scenario)) return { status: "INVALID_SCENARIO" };
        if (!Number.isInteger(expectedRevision) || expectedRevision !== config.scenario.revision) return { status: "CONFLICT", reason: "WORKFORCE_SCENARIO_CONFLICT", current: cloneDraftValue(config.scenario) };
        config.scenario.selected = scenario;
        config.scenario.activeScenario = null;
        config.scenario.lastAutoTransitionAt = null;
        config.scenario.revision += 1;
        return { status: "UPDATED", scenario: cloneDraftValue(config.scenario) };
      });
      return withState(result);
    },
    async recommend(issueId) { return withState(await matchAndOffer(issueId)); },
    async issueAudit(issueId) { return store.issueAudit ? store.issueAudit(issueId) : createIssueAuditRecord(await store.snapshot(), issueId); },
    async stationHistory(equipmentId, query) { return store.stationHistory(equipmentId, query); },
    async decide({ recommendationId, responderId, decision }) {
      const decided = await assignments.decideRecommendation({ recommendationId, responderId, decision });
      if (decided.result.status === "ASSIGNED" && decided.result.role === "PRIMARY") await requestComplexAssistanceIfNeeded(decided.result.issueId);
      if (decided.result.status === "STALE") {
        const snapshot = await store.snapshot();
        const recommendation = snapshot.recommendations.find((entry) => entry.id === recommendationId);
        if (recommendation && ["PENDING", "RECOMMENDATION_READY"].includes(snapshot.issues.find((issue) => issue.id === recommendation.issueId)?.status)) {
          await matchAndOffer(recommendation.issueId);
        }
      }
      return withState(decided);
    },
    async requestAssistance(issueId) {
      const requested = await assignments.requestAssistance(issueId, "OPERATOR_REQUEST");
      if (requested.result.status !== "REQUESTED") return withState(requested);
      return withState(await matchAndOffer(issueId, { purpose: "ASSISTANCE", trigger: "OPERATOR_REQUEST" }));
    },
    async releaseResponder(input) {
      const result = await assignments.releaseResponder(input);
      if (result.result.status === 'RELEASED') await store.mutate('operator-release-staffing-recheck', (state) => requestStaffingRecheck(state, 'ASSIGNMENT_RELEASED'));
      return withState(result);
    },
    async transferResponder(input) {
      const moved = await assignments.transferResponder(input);
      if (moved.result.status === "TRANSFERRED") await requestComplexAssistanceIfNeeded(moved.result.targetIssueId);
      return withState(moved);
    },
    advanceSimulation,
    async tick(realElapsedMilliseconds) { return withState(await advanceSimulation(realElapsedMilliseconds)); },
    async reconcileStartup() { const result = await scheduler.reconcileClaimedTriggers(); await drainDeferredAgentWork(); scheduleInvestigationWork(); return result; },
    runScheduledTick,
    /** Resolves once model-bound work started by the real-time loop has finished. */
    async agentWorkIdle() { while (agentLane || fixWork || staffingWork || investigationWork || investigationQueued) { if (agentLane) await agentLane; if (fixWork) await fixWork; if (staffingWork) await staffingWork; if (investigationWork) await investigationWork; } },
    // Retained as a standalone capability (e.g. a single-runtime test or a
    // consumer with no Control Room manager) — never called from the
    // production boot path, which drives every room from one shared
    // process-level interval instead. See runScheduledTick above.
    startLoop(intervalMilliseconds = 1_000) {
      if (loop) return loop;
      lastRealTick = performance.now();
      loop = setInterval(runScheduledTick, intervalMilliseconds);
      return loop;
    },
    stopLoop() {
      if (loop) clearInterval(loop);
      loop = null;
      lastRealTick = null;
    },
  };
}

function activeRosterCount(state, issueId) {
  return state.assignments.filter((row) => row.issueId === issueId && row.status === "ACTIVE").length;
}

export function createApplicationRuntime({ liveRuntime, offlineRuntime, initialMode = "LIVE" }) {
  if (!liveRuntime || !offlineRuntime) throw new Error("Live and Offline runtimes are required");
  let mode = initialMode;
  function active() { return mode === "LIVE" ? liveRuntime : offlineRuntime; }
  function requireMode(requiredMode, message) {
    if (mode === requiredMode) return;
    const error = new Error(message);
    error.statusCode = 409;
    error.code = "MODE_CONFLICT";
    throw error;
  }
  return {
    isApplicationRuntime: true,
    get mode() { return mode; },
    async snapshot() {
      const state = await active().snapshot();
      return mode === "LIVE" ? state : { mode: "OFFLINE", ...state };
    },
    async setMode(nextMode) {
      if (!["LIVE", "OFFLINE"].includes(nextMode)) {
        const error = new Error("Mode must be LIVE or OFFLINE");
        error.statusCode = 400;
        error.code = "INVALID_MODE";
        throw error;
      }
      mode = nextMode;
      return this.snapshot();
    },
    async reconcileConsumables() { return active().reconcileConsumables(); },
    async ask(input) { return active().ask(input); },
    async getAsk(id) { return active().getAsk(id); },
    async updateInvestigationPolicy(input) { return active().updateInvestigationPolicy(input); },
    async reinvestigate(id,input) { return active().reinvestigate(id,input); },
    async submitReport(input) { return active().submitReport(input); },
    async confirmReport(id,input) { return active().confirmReport(id,input); },
    async closeReport(id,input) { return active().closeReport(id,input); },
    async getReport(id) { return active().getReport(id); },
    async getInvestigation(id) { return active().getInvestigation(id); },
    async getCase(id) { return active().getCase(id); },
    async decideInvestigation(id,input,action) { return active().decideInvestigation(id,input,action); },
    async reset() { return mode === "LIVE" ? liveRuntime.reset() : { mode: "OFFLINE", ...offlineRuntime.reset() }; },
    async analytics() { return mode === "LIVE" ? liveRuntime.analytics() : { mode: "OFFLINE", available: false }; },
    async analyticsPeriod(query) { return mode === "LIVE" ? liveRuntime.analyticsPeriod(query) : { mode: "OFFLINE", available: false }; },
    async enterCalibration(input) { return active().enterCalibration(input); },
    async calibrations(query) { return active().calibrations(query); },
    async enterLoadboard(input) { return active().enterLoadboard(input); },
    async checkoutLoadboard(input) { return active().checkoutLoadboard(input); },
    async releaseLoadboard(input) { return active().releaseLoadboard(input); },
    async consumableObligations(query) { return active().consumableObligations(query); },
    async cellReadiness(query) { return active().cellReadiness(query); },
    async loadboards(query) { return active().loadboards(query); },
    async stationKpis(query) { return active().stationKpis(query); },
    async analyticsPareto(query) { return mode === "LIVE" ? liveRuntime.analyticsPareto(query) : { mode: "OFFLINE", available: false }; },
    async startSimulation() { requireMode("LIVE", "Simulation controls require Live mode"); return liveRuntime.start(); },
    async pauseSimulation() { requireMode("LIVE", "Simulation controls require Live mode"); return liveRuntime.pause(); },
    async resumeSimulation() { requireMode("LIVE", "Simulation controls require Live mode"); return liveRuntime.resume(); },
    async setSimulationSpeed(speed) { requireMode("LIVE", "Simulation controls require Live mode"); return liveRuntime.setSpeed(speed); },
    async forceNextEvent() { requireMode("LIVE", "Simulation controls require Live mode"); return liveRuntime.forceNextEvent(); },
    async forceResolve(issueId) { requireMode("LIVE", "Simulation controls require Live mode"); return liveRuntime.forceResolve(issueId); },
    async decideStaffing(id, input) { requireMode("LIVE", "Staffing approval requires Live mode"); return liveRuntime.decideStaffing(id, input); },
    async updateStaffingPolicy(input) { requireMode("LIVE", "Staffing policy requires Live mode"); return liveRuntime.updateStaffingPolicy(input); },
    async updateWorkforceScenario(input) { requireMode("LIVE", "Demo settings require Live mode"); return liveRuntime.updateWorkforceScenario(input); },
    async recommendLive(issueId) { requireMode("LIVE", "Live recommendation requires Live mode"); return liveRuntime.recommend(issueId); },
    async decideLive(input) { requireMode("LIVE", "Live assignment requires Live mode"); return liveRuntime.decide(input); },
    async requestAssistance(issueId) { return mode === "LIVE" ? liveRuntime.requestAssistance(issueId) : offlineRuntime.requestAssistance(issueId); },
    async releaseResponder(input) { return mode === "LIVE" ? liveRuntime.releaseResponder(input) : offlineRuntime.releaseResponder(input); },
    async transferResponder(input) { return mode === "LIVE" ? liveRuntime.transferResponder(input) : offlineRuntime.transferResponder(input); },
    raiseIssue(issueId) { requireMode("OFFLINE", "Fixture issue controls require Offline mode"); return offlineRuntime.raiseIssue(issueId); },
    requestRecommendation(issueId) { requireMode("OFFLINE", "Fixture recommendation requires Offline mode"); return offlineRuntime.requestRecommendation(issueId); },
    decideAssignment(issueId, responderId, decision) { requireMode("OFFLINE", "Fixture assignment requires Offline mode"); return offlineRuntime.decideAssignment(issueId, responderId, decision); },
    getAuditEvent(requestId) { return offlineRuntime.getAuditEvent(requestId); },
    async issueAudit(issueId) {
      requireMode("LIVE", "Issue audit records require Live mode");
      return liveRuntime.issueAudit(issueId);
    },
    async stationHistory(equipmentId, query) { requireMode("LIVE", "Station history requires Live mode"); return liveRuntime.stationHistory(equipmentId, query); },
  };
}
