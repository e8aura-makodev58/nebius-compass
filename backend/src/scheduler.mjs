import { claimInvestigationDeadlines } from './investigation-policy.mjs';
import { advanceSimulationTime } from "./simulation-clock.mjs";
import { claimWorkforceDueTriggers } from "./workforce-continuity.mjs";

const EVENT_CADENCE_BY_SCENARIO = Object.freeze({
  NORMAL: { minMinutes: 6, maxMinutes: 45 },
  ELEVATED_DEMAND: { minMinutes: 3, maxMinutes: 22 },
  PERSONNEL_SHORTAGE: { minMinutes: 5, maxMinutes: 35 },
  RECURRING_TEMPORARY_REPAIRS: { minMinutes: 6, maxMinutes: 35 },
});
const AUTO_SCENARIOS = Object.freeze(Object.keys(EVENT_CADENCE_BY_SCENARIO));
const AUTO_TRANSITION_MINUTES = 4 * 60;
const ACTIVE_ISSUE_STATUSES = new Set(["PENDING", "RECOMMENDATION_READY", "OFFER_PENDING", "ASSIGNED"]);

function timestampMilliseconds(value, label) {
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) throw new Error(`${label} is invalid`);
  return milliseconds;
}

function nextToken(token, prefix) {
  const match = new RegExp(`^${prefix}-([1-9]\\d*)$`).exec(token);
  if (!match) throw new Error(`${prefix} token is invalid`);
  return `${prefix}-${Number(match[1]) + 1}`;
}

// Numerical Recipes LCG. Math.imul keeps the transition exactly uint32.
function nextSchedulerRandom(state) {
  const next = (Math.imul(1_664_525, state.simulationState.rngStreams.scheduler) + 1_013_904_223) >>> 0;
  state.simulationState.rngStreams.scheduler = next;
  return next;
}

function activeDemandScenario(state) {
  const scenario = state.workforceContinuity?.scenario;
  if (!scenario || scenario.selected !== "AUTO") return scenario?.selected ?? "NORMAL";
  const now = Date.parse(state.simulationState.simulationTime);
  const lastTransition = Date.parse(scenario.lastAutoTransitionAt ?? "");
  if (!AUTO_SCENARIOS.includes(scenario.activeScenario) || !Number.isFinite(lastTransition) || now - lastTransition >= AUTO_TRANSITION_MINUTES * 60_000) {
    scenario.activeScenario = AUTO_SCENARIOS[nextSchedulerRandom(state) % AUTO_SCENARIOS.length];
    scenario.lastAutoTransitionAt = state.simulationState.simulationTime;
  }
  return scenario.activeScenario;
}

function scheduleNextEvent(state) {
  const scenario = activeDemandScenario(state);
  const cadence = EVENT_CADENCE_BY_SCENARIO[scenario] ?? EVENT_CADENCE_BY_SCENARIO.NORMAL;
  const range = cadence.maxMinutes - cadence.minMinutes + 1;
  const delayMinutes = cadence.minMinutes + (nextSchedulerRandom(state) % range);
  const now = timestampMilliseconds(state.simulationState.simulationTime, "Simulation time");
  state.simulationState.nextEventAt = new Date(now + delayMinutes * 60_000).toISOString();
  return delayMinutes;
}

function activeIssueCount(state) {
  return state.issues.filter((issue) => ACTIVE_ISSUE_STATUSES.has(issue.status)).length;
}

function claimEventTrigger(state, { forced }) {
  if (!forced && state.simulationState.status !== "RUNNING") return { status: "PAUSED", trigger: null };
  const now = timestampMilliseconds(state.simulationState.simulationTime, "Simulation time");
  const dueAt = timestampMilliseconds(state.simulationState.nextEventAt, "Next event time");
  if (!forced && now < dueAt) return { status: "NOT_DUE", trigger: null };
  if (activeIssueCount(state) >= state.simulationConfig.maxActiveIssues) {
    const token = state.simulationState.dueEventToken;
    state.simulationState.dueEventToken = nextToken(token, "due");
    const delayMinutes = scheduleNextEvent(state);
    const deferredDemand = state.workforceContinuity?.deferredDemand;
    if (Array.isArray(deferredDemand)) {
      deferredDemand.push({ id: `deferred-${token}`, simulationTimestamp: state.simulationState.simulationTime, reason: "ACTIONABLE_ISSUE_DEMO_CAP", token, forced: Boolean(forced) });
      // Keep the persisted demo ledger bounded; it is not the normal event feed.
      if (deferredDemand.length > 100) deferredDemand.splice(0, deferredDemand.length - 100);
    }
    return { status: "ACTIVE_ISSUE_CEILING", trigger: null, nextDelayMinutes: delayMinutes };
  }

  const token = state.simulationState.dueEventToken;
  state.simulationState.dueEventToken = nextToken(token, "due");
  const delayMinutes = scheduleNextEvent(state);
  return {
    status: "TRIGGERED",
    trigger: {
      kind: "EVENT_DUE",
      token,
      forced,
      simulationTimestamp: state.simulationState.simulationTime,
      nextEventAt: state.simulationState.nextEventAt,
      nextDelayMinutes: delayMinutes,
    },
  };
}

function claimDueResolutions(state) {
  if (state.simulationState.status !== "RUNNING") return [];
  const now = timestampMilliseconds(state.simulationState.simulationTime, "Simulation time");
  return state.resolutionAttempts.flatMap((attempt) => {
    if (attempt.status !== "ACTIVE" || !attempt.resolutionDueToken || timestampMilliseconds(attempt.resolutionDueAt, "Resolution due time") > now) return [];
    return [claimResolutionTrigger(state, attempt.issueId, false)];
  }).filter((result) => result.status === "TRIGGERED").map((result) => result.trigger);
}

function claimDueReviews(state) {
  if (state.simulationState.status !== "RUNNING") return [];
  const now = timestampMilliseconds(state.simulationState.simulationTime, "Simulation time");
  return state.resolutionAttempts.flatMap((attempt) => {
    if (attempt.status !== "ACTIVE" || !attempt.reviewDueToken || timestampMilliseconds(attempt.reviewDueAt, "Review due time") > now) return [];
    const token = attempt.reviewDueToken; attempt.reviewDueToken = null; attempt.reviewDueAt = null; attempt.reviewDispatchToken = token;
    return [{ kind: "ASSISTANCE_REVIEW_DUE", token, attemptId: attempt.id, issueId: attempt.issueId, generation: attempt.scheduleGeneration, simulationTimestamp: state.simulationState.simulationTime }];
  });
}

function claimDueOffers(state) {
  if (state.simulationState.status !== "RUNNING") return [];
  const now = timestampMilliseconds(state.simulationState.simulationTime, "Simulation time");
  return (state.dispatchOffers ?? []).flatMap((offer) => {
    if (offer.status !== "PENDING" || !offer.responseDueToken || timestampMilliseconds(offer.responseDueAt, "Offer response time") > now) return [];
    const token = offer.responseDueToken;
    offer.responseDueToken = null;
    offer.responseDueAt = null;
    offer.responseDispatchToken = token;
    return [{ kind: "OFFER_RESPONSE_DUE", token, offerId: offer.id, issueId: offer.issueId, responderId: offer.responderId, simulationTimestamp: state.simulationState.simulationTime }];
  });
}

function claimResolutionTrigger(state, issueId, forced) {
  const issue = state.issues.find((entry) => entry.id === issueId);
  if (!issue) return { status: "ISSUE_NOT_FOUND", trigger: null };
  if (issue.status !== "ASSIGNED") return { status: "ISSUE_NOT_ASSIGNED", trigger: null };
  const attempt = state.resolutionAttempts.find((entry) => entry.issueId === issueId && entry.status === "ACTIVE");
  if (!attempt) return { status: "ACTIVE_ATTEMPT_NOT_FOUND", trigger: null };
  // A process can stop after durably claiming a resolution but before its
  // handler completes. Force Resolve is an operator recovery control, so it
  // must redispatch that persisted claim rather than leaving work stranded.
  if (!attempt.resolutionDueToken && attempt.resolutionDispatchToken) {
    return { status: "REDISPATCHED", trigger: {
      kind: "RESOLUTION_DUE", token: attempt.resolutionDispatchToken, forced: true,
      issueId, attemptId: attempt.id, generation: attempt.scheduleGeneration,
      responderId: state.assignments.find((row) => row.attemptId === attempt.id && row.status === "ACTIVE" && row.role === "PRIMARY")?.responderId,
      simulationTimestamp: state.simulationState.simulationTime,
    } };
  }
  if (!attempt.resolutionDueToken) return { status: "ALREADY_TRIGGERED", trigger: null };

  const token = attempt.resolutionDueToken;
  attempt.resolutionDueToken = null;
  attempt.resolutionDueAt = null;
  attempt.resolutionDispatchToken = token;
  attempt.resolutionDispatchForced = forced;
  return {
    status: "TRIGGERED",
    trigger: {
      kind: "RESOLUTION_DUE",
      token,
      forced,
      issueId,
      attemptId: attempt.id,
      generation: attempt.scheduleGeneration,
      responderId: state.assignments.find((row) => row.attemptId === attempt.id && row.status === "ACTIVE" && row.role === "PRIMARY")?.responderId,
      simulationTimestamp: state.simulationState.simulationTime,
    },
  };
}

async function dispatch(triggers, handlers) {
  for (const trigger of triggers) {
    if (trigger.kind === "RESOLUTION_DUE") await handlers.onResolutionDue(trigger);
    if (trigger.kind === "ASSISTANCE_REVIEW_DUE") await handlers.onAssistanceReviewDue(trigger);
    if (trigger.kind === "OFFER_RESPONSE_DUE") await handlers.onOfferDue(trigger);
    if (trigger.kind === "INVESTIGATION_DEADLINE_DUE") await handlers.onInvestigationDeadline(trigger);
    if (trigger.kind === "EVENT_DUE") await handlers.onEventDue(trigger);
    if (["STAFFING_DEADLINE_DUE", "STAFFING_REVIEW_DUE", "SHIFT_HANDOVER_DUE", "STAFFING_RECHECK", "TEMPORARY_REPAIR_RECURRENCE_DUE", "EXTENSION_EXPIRY_DUE"].includes(trigger.kind)) await handlers.onWorkforceDue(trigger);
  }
}

export function createScheduler(store, {
  onEventDue = async () => {},
  onResolutionDue = async () => {},
  onOfferDue = async () => {},
  onAssistanceReviewDue = async () => {},
  onWorkforceDue = async () => {},
  onInvestigationDeadline = async () => {},
} = {}) {
  const handlers = { onEventDue, onResolutionDue, onOfferDue, onAssistanceReviewDue, onWorkforceDue, onInvestigationDeadline };
  return {
    async tick(realElapsedMilliseconds) {
      const transaction = await store.mutate("scheduler-tick", (state) => {
        advanceSimulationTime(state, realElapsedMilliseconds);
        const event = claimEventTrigger(state, { forced: false });
        const triggers = [...claimDueResolutions(state), ...claimDueReviews(state), ...claimDueOffers(state), ...claimWorkforceDueTriggers(state), ...claimInvestigationDeadlines(state)];
        if (event.trigger) triggers.push(event.trigger);
        return { simulationTime: state.simulationState.simulationTime, eventStatus: event.status, triggers };
      });
      await dispatch(transaction.result.triggers, handlers);
      return transaction;
    },
    async forceNextEvent() {
      const transaction = await store.mutate("scheduler-force-event", (state) => claimEventTrigger(state, { forced: true }));
      if (transaction.result.trigger) await dispatch([transaction.result.trigger], handlers);
      return transaction;
    },
    async forceResolve(issueId) {
      const transaction = await store.mutate("scheduler-force-resolve", (state) => claimResolutionTrigger(state, issueId, true));
      if (transaction.result.trigger) await dispatch([transaction.result.trigger], handlers);
      return transaction;
    },
    async reconcileClaimedTriggers() {
      return store.mutate("scheduler-reconcile", (state) => {
        const triggers = [];
        for (const attempt of state.resolutionAttempts) {
          if (attempt.status === "ACTIVE" && attempt.resolutionDispatchToken) triggers.push({ kind: "RESOLUTION_DUE", token: attempt.resolutionDispatchToken, attemptId: attempt.id, issueId: attempt.issueId, generation: attempt.scheduleGeneration, forced: attempt.resolutionDispatchForced === true });
          if (attempt.status === "ACTIVE" && attempt.reviewDispatchToken) triggers.push({ kind: "ASSISTANCE_REVIEW_DUE", token: attempt.reviewDispatchToken, attemptId: attempt.id, issueId: attempt.issueId, generation: attempt.scheduleGeneration });
        }
        for (const rec of state.workforceContinuity?.staffingRecommendations ?? []) if (rec.status === 'PENDING' && rec.deadlineDispatchToken) triggers.push({kind:'STAFFING_DEADLINE_DUE',token:rec.deadlineDispatchToken,recommendationId:rec.id});
        for (const row of state.investigations ?? []) if (row.status==='READY' && row.deadlineDispatchToken) triggers.push({kind:'INVESTIGATION_DEADLINE_DUE',investigationId:row.id,token:row.deadlineDispatchToken});
        for (const offer of state.dispatchOffers ?? []) if (offer.status === "PENDING" && offer.responseDispatchToken) triggers.push({ kind: "OFFER_RESPONSE_DUE", token: offer.responseDispatchToken, offerId: offer.id, issueId: offer.issueId, responderId: offer.responderId });
        return { status: "RECONCILED", triggers };
      }).then(async (transaction) => { await dispatch(transaction.result.triggers, handlers); return transaction; });
    },
  };
}

export const schedulerCadence = Object.freeze({ ...EVENT_CADENCE_BY_SCENARIO.NORMAL });
export const schedulerCadenceByScenario = EVENT_CADENCE_BY_SCENARIO;
