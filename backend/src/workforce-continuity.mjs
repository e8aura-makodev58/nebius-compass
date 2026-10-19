import { assertDispatchAuthorized } from './dispatch-gate.mjs';
import { certificationsFor } from './investigation-records.mjs';
import { ensureIssueFault } from './fault-truth.mjs';
/**
 * Deterministic Workforce Continuity primitives.  This module intentionally
 * does not inspect resolution history or ResponderSkill: staffing and queue
 * decisions must remain application-owned and independent of employee truth.
 */
import { ISSUE_CLASSES } from "./live-schema.mjs";
import { moveResponderToIssue, returnResponderToDutyStation } from "./responder-location.mjs";
import { replanAttempt, settleAttempt } from "./attempt-engine.mjs";

export const WORKFORCE_POLICY_VERSION = "wc-2";
export const ROTATION_ANCHOR = "2026-08-31T08:00:00.000Z";
export const CREW_IDS = ["A", "B", "C", "D"];
export const MIN_REST_HOURS = 12;
export const MAX_DUTY_HOURS = 16;
export const NORMAL_SHIFT_HOURS = 12;
export const MAX_ACTIVE_STAFF = 8;
export const MAX_ACTIONABLE_ISSUES = 10;

// A genuine four-crew 2-2-3 rotation. A/C cover days and B/D cover nights;
// the two pairs are complementary.  Do not collapse this to a single `find`
// over all crews: that was the wc-1 bug that made two nominal crews match.
const DAYS_ON = {
  A: [true, true, false, false, true, true, true, false, false, true, true, false, false, true],
  B: [true, true, false, false, true, true, true, false, false, true, true, false, false, true],
  C: [false, false, true, true, false, false, false, true, true, false, false, true, true, false],
  D: [false, false, true, true, false, false, false, true, true, false, false, true, true, false],
};

function uint32Step(value) { return (Math.imul(1664525, value >>> 0) + 1013904223) >>> 0; }
function hoursSince(a, b) { return (Date.parse(a) - Date.parse(b)) / 3_600_000; }

export function createWorkforceConfig(seed = 424242) {
  return {
    version: WORKFORCE_POLICY_VERSION,
    workforceProvisioningSeed: seed >>> 0,
    rotationAnchor: ROTATION_ANCHOR,
    minimumRestHours: MIN_REST_HOURS,
    normalShiftHours: NORMAL_SHIFT_HOURS,
    maximumDutyHours: MAX_DUTY_HOURS,
    maximumActiveStaff: MAX_ACTIVE_STAFF,
    maxActionableIssues: MAX_ACTIONABLE_ISSUES,
    scenario: { selected: "NORMAL", revision: 0, lastAutoTransitionAt: null, activeScenario: null },
    deferredDemand: [],
    staffingAudit: [],
    staffingApproval: "OPERATOR",
    staffingPolicyRevision: 0,
    staffingDeadlineMinutes: 30,
    staffingSequence: 0,
    staffingRecommendations: [],
    handovers: [],
    temporaryRepairs: [],
    staffingRechecks: [],
    nextStaffingReviewAt: "2026-09-01T18:00:00.000Z",
    nextHandoverAt: "2026-09-01T20:00:00.000Z",
    staffingReviewToken: "staffing-review-1",
    handoverToken: "handover-1",
  };
}

export function crewForTime(simulationTime) {
  const hours = hoursSince(simulationTime, ROTATION_ANCHOR);
  const shiftIndex = Math.floor(hours / NORMAL_SHIFT_HOURS);
  const day = ((Math.floor(shiftIndex / 2) % 14) + 14) % 14;
  const isDay = ((shiftIndex % 2) + 2) % 2 === 0;
  const candidates = isDay ? ["A", "C"] : ["B", "D"];
  return candidates.find((crew) => DAYS_ON[crew][day]) ?? candidates[0];
}

function publicNameFor(responder, index) {
  const legacy = /^R-(ENGR|TECH|OPER)(\d{3})$/.exec(responder.id);
  if (legacy) return `${legacy[1] === "OPER" ? "Optr" : legacy[1][0] + legacy[1].slice(1).toLowerCase()}${legacy[2]}`;
  const suffix = /(?:-|^)(\d{3})$/.exec(responder.id)?.[1] ?? String(300 + index).padStart(3, "0");
  return `${["Engr", "Tech", "Optr"][index % 3]}${suffix}`;
}

/** Generate additional synthetic responders without advancing live RNG. */
export function provisionWorkforce(state) {
  const config = state.workforceContinuity ??= createWorkforceConfig();
  const original = state.responders.slice(0, 6);
  original.forEach((responder, index) => { responder.crewId ??= "A"; responder.name = publicNameFor(responder, index); responder.dutyStartedAt ??= state.simulationState.simulationTime; responder.lastDutyEndedAt ??= null; });
  state.responders.slice(6).forEach((responder, index) => { responder.name = publicNameFor(responder, index + 6); });
  let value = config.workforceProvisioningSeed;
  const known = new Set(state.responders.map((r) => r.id));
  for (let crewIndex = 0; crewIndex < CREW_IDS.length; crewIndex += 1) {
    const crewId = CREW_IDS[crewIndex];
    const have = state.responders.filter((r) => r.crewId === crewId).length;
    for (let position = have; position < 6; position += 1) {
      value = uint32Step(value);
      const serial = String(300 + crewIndex * 30 + position * 3 + (value % 3)).padStart(3, "0");
      let id = `R-${crewId}-${serial}`;
      while (known.has(id)) { value = uint32Step(value); id = `R-${crewId}-${String(300 + (value % 600)).padStart(3, "0")}`; }
      known.add(id);
      const floor = (value % 3) + 1;
      const responder = { id, x: 45 + ((value >>> 8) % 100), y: 45 + ((value >>> 16) % 30), floor, crewId, availability: "UNAVAILABLE", dutyStartedAt: null, lastDutyEndedAt: null };
      responder.name = publicNameFor(responder, state.responders.length);
      state.responders.push(responder);
      for (const issueClass of ISSUE_CLASSES) {
        value = uint32Step(value);
        state.responderSkills.push({ id: `skill-${id}-${issueClass}`, responderId: id, issueClass, trueMedianMinutes: 10 + (value % 13), trueSuccessProbability: Number((0.70 + ((value >>> 8) % 23) / 100).toFixed(2)) });
      }
    }
  }
  for (const responder of state.responders) responder.certifications ??= certificationsFor(responder.id);
  // Preserve the seed itself as a provenance value, not a mutable live stream.
  return state;
}

function releaseFromRoster(state, assignment, now, reason) {
  assignment.status = "RELEASED"; assignment.endedAt = now; assignment.endReason = reason;
  const interval = assignment.roleHistory?.at(-1); if (interval && !interval.endedAt) interval.endedAt = now;
  returnResponderToDutyStation(state, state.responders.find((entry) => entry.id === assignment.responderId), reason);
}

function promoteToPrimary(state, assignment, now) {
  const interval = assignment.roleHistory.at(-1);
  if (interval && !interval.endedAt) interval.endedAt = now;
  assignment.roleHistory.push({ role: "PRIMARY", startedAt: now, endedAt: null });
  assignment.role = "PRIMARY";
}

function nextAssignmentId(state) {
  const highest = state.assignments.reduce((max, entry) => Math.max(max, Number(/^assignment-(\d+)$/.exec(entry.id)?.[1] ?? 0)), state.historyRetention?.highWater?.assignments ?? 0);
  return `assignment-${String(highest + 1).padStart(3, "0")}`;
}

function nextOperationalEventId(state) {
  const highest = state.operationalEvents.reduce((max, event) => Math.max(max, Number(/^event-(\d+)$/.exec(event.id)?.[1] ?? 0)), state.historyRetention?.highWater?.operationalEvents ?? 0);
  return `event-${String(highest + 1).padStart(3, "0")}`;
}

/** A lawful, currently-free responder who can pick up a vacated roster. */
function findReplacement(state, isLawful) {
  const busy = (candidate) => state.assignments.some((row) => row.responderId === candidate.id && row.status === "ACTIVE")
    || (state.dispatchOffers ?? []).some((offer) => offer.responderId === candidate.id && offer.status === "PENDING");
  return state.responders.filter((candidate) => isLawful(candidate) && !busy(candidate)).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * Reconcile a persisted wc-1 room without inventing work or advancing RNG.
 * An attempt may only leave ACTIVE by drawing a genuine resolution outcome
 * (resolution-engine.mjs), which this must never fabricate. So an issue
 * roster is only ever partially released here -- releasing the last lawful
 * member of a roster (promoting a surviving SUPPORT to PRIMARY as needed)
 * -- and a roster with no lawful survivor at all is deferred untouched
 * rather than forced into an unsupported terminal state.
 */
export function reconcileWorkforceDuty(state, { reason = "WC2_MIGRATION" } = {}) {
  const now = state.simulationState.simulationTime;
  const normalCrew = crewForTime(now);
  const isLawful = (responder) => responder?.crewId === normalCrew
    || (responder?.surgeKind && responder.extensionEndsAt && Date.parse(now) < Date.parse(responder.extensionEndsAt))
    || (responder?.surgeKind === 'CALL_IN' && !responder.extensionEndsAt && responder.dutyStartedAt && hoursSince(now, responder.dutyStartedAt) < NORMAL_SHIFT_HOURS);
  const activeAssignments = state.assignments.filter((entry) => entry.status === "ACTIVE");
  // Preserve at most two lawful carryovers as explicit extensions. Everything
  // else becomes a durable queued handover, never a silently removed issue.
  const keep = activeAssignments.filter((entry) => isLawful(state.responders.find((r) => r.id === entry.responderId))).slice(0, MAX_ACTIVE_STAFF);
  const keepIds = new Set(keep.map((entry) => entry.id));
  for (const offer of state.dispatchOffers ?? []) {
    if (offer.status !== "PENDING") continue;
    const responder = state.responders.find((entry) => entry.id === offer.responderId);
    if (!isLawful(responder)) {
      offer.status = "CANCELLED"; offer.cancelledAt = now; offer.cancelReason = reason;
      const issue = state.issues.find((entry) => entry.id === offer.issueId);
      if (issue && issue.status !== "RESOLVED") {
        delete issue.pendingOfferId; delete issue.offeredResponderId;
        // An ASSISTANCE offer is a SUPPORT candidate for an issue that is
        // already ASSIGNED and actively worked by its PRIMARY -- cancelling
        // it must never disturb that active roster or its issue status.
        // Only an unstaffed INITIAL_ASSIGNMENT offer returns the issue to
        // the queue.
        if (offer.purpose === "ASSISTANCE") {
          const attempt = state.resolutionAttempts.find((row) => row.issueId === issue.id && row.status === "ACTIVE");
          if (attempt) attempt.assistance = { status: "NONE", generation: (attempt.assistance?.generation ?? 0) + 1, trigger: null, cooldownUntil: null };
        } else {
          issue.status = "PENDING";
        }
      }
    }
  }
  // Group by issue: a two-person roster (PRIMARY+SUPPORT) must be reconciled
  // as one unit, not assignment-by-assignment, or a released PRIMARY can
  // leave a SUPPORT-only roster with no primary and an issue cache that
  // disagrees with it.
  const releasingByIssue = new Map();
  for (const assignment of activeAssignments) {
    if (keepIds.has(assignment.id)) continue;
    if (!releasingByIssue.has(assignment.issueId)) releasingByIssue.set(assignment.issueId, []);
    releasingByIssue.get(assignment.issueId).push(assignment);
  }
  let activeStaffCount = keep.length;
  for (const [issueId, releasing] of releasingByIssue) {
    const issue = state.issues.find((entry) => entry.id === issueId);
    const roster = activeAssignments.filter((entry) => entry.issueId === issueId);
    const staying = roster.filter((entry) => keepIds.has(entry.id));
    const attempt = state.resolutionAttempts.find((row) => row.id === releasing[0].attemptId);
    let replacement = null;
    if (staying.length === 0 && activeStaffCount < MAX_ACTIVE_STAFF) replacement = findReplacement(state, isLawful);
    if (replacement && !assertDispatchAuthorized(state, issue, replacement.id, "HANDOVER")) replacement = null;
    if (staying.length === 0 && !replacement) {
      // No lawful survivor and no free lawful responder to hand off to, and
      // an attempt may only become terminal through a genuine drawn
      // resolution outcome. Defer the whole roster untouched -- audited,
      // retried at the next reconciliation -- rather than fabricate an
      // outcome or drop real work.
      state.workforceContinuity.handovers.push({ id: `deferred-${reason}-${issueId}-${releasing[0].id}-${now}`, token: `deferred-${issueId}-${now}`, simulationTimestamp: now, issueId, outgoingResponderIds: releasing.map((entry) => entry.responderId), reason: "HANDOVER_DEFERRED_NO_REPLACEMENT" });
      activeStaffCount += releasing.length;
      continue;
    }
    if (attempt?.status === "ACTIVE") settleAttempt(state, attempt, now);
    const releasingPrimary = releasing.find((entry) => entry.role === "PRIMARY");
    for (const assignment of releasing) releaseFromRoster(state, assignment, now, reason);
    if (replacement) {
      // Nobody stayed on this roster; hand the whole issue to a free,
      // lawful, currently on-duty responder rather than leave it orphaned.
      const joined = { id: nextAssignmentId(state), issueId, responderId: replacement.id, createdAt: now,
        status: "ACTIVE", attemptId: attempt?.id ?? null, role: "PRIMARY",
        joinedAt: now, endedAt: null, endReason: null,
        roleHistory: [{ role: "PRIMARY", startedAt: now, endedAt: null }] };
      state.assignments.push(joined);
      issue.assignedResponderId = replacement.id;
      replacement.availability = "ASSIGNED"; replacement.currentIssueId = issueId;
      moveResponderToIssue(state, replacement, issue, joined.role, "SHIFT_HANDOVER");
      activeStaffCount += 1;
    } else if (releasingPrimary) {
      const promoted = staying.find((entry) => entry.role !== "PRIMARY") ?? staying[0];
      promoteToPrimary(state, promoted, now);
      issue.assignedResponderId = promoted.responderId;
    }
    if (attempt?.status === "ACTIVE") {
      attempt.rosterVersion = (attempt.rosterVersion ?? 1) + 1;
      attempt.assistance = { status: "NONE", generation: (attempt.assistance?.generation ?? 0) + 1, trigger: null, cooldownUntil: null };
      replanAttempt(state, attempt, { at: now });
    }
    for (const assignment of releasing) {
      state.workforceContinuity.handovers.push({ id: `queued-${reason}-${assignment.id}`, token: `queued-${assignment.id}`, simulationTimestamp: now, issueId, outgoingResponderId: assignment.responderId, reason: "QUEUED_HANDOVER" });
    }
  }
  for (const responder of state.responders) {
    const assigned = state.assignments.some((entry) => entry.responderId === responder.id && entry.status === "ACTIVE");
    if (assigned) { responder.availability = "ASSIGNED"; responder.currentIssueId = state.assignments.find((entry) => entry.responderId === responder.id && entry.status === "ACTIVE").issueId; continue; }
    delete responder.currentIssueId; delete responder.currentOfferId;
    const lawfulCallIn = Boolean(responder.surgeKind && responder.extensionEndsAt && Date.parse(now) < Date.parse(responder.extensionEndsAt)) || (responder.surgeKind === "CALL_IN" && responder.dutyStartedAt && hoursSince(now, responder.dutyStartedAt) < NORMAL_SHIFT_HOURS);
    if (responder.crewId === normalCrew || lawfulCallIn) { responder.availability = "AVAILABLE"; responder.dutyStartedAt ??= now; responder.lastDutyEndedAt = null; if (!lawfulCallIn) { delete responder.surgeKind; delete responder.extensionEndsAt; } }
    else { responder.availability = "UNAVAILABLE"; responder.lastDutyEndedAt ??= now; responder.dutyStartedAt = null; delete responder.surgeKind; delete responder.extensionEndsAt; }
  }
  return state;
}

export function activeIssueCount(state) {
  return state.issues.filter((issue) => ["PENDING", "RECOMMENDATION_READY", "OFFER_PENDING", "ASSIGNED"].includes(issue.status)).length;
}

export function priorityForIssue(issue, now) {
  const ageHours = Math.max(0, hoursSince(now, issue.raisedAt ?? issue.createdAt ?? now));
  const production = Number(issue.productionImpact ?? issue.priority ?? 0);
  if (issue.operationalRisk === "SERIOUS" || production >= 80) return "CRITICAL";
  if (issue.complexity === "COMPLEX" || production >= 45 || ageHours >= 8) return "HIGH";
  if (ageHours >= 20) return "HIGH";
  return "STANDARD";
}

const BAND_ORDER = { CRITICAL: 0, HIGH: 1, STANDARD: 2, DEFERRED: 3 };
export function selectNextQueuedIssue(state) {
  const now = state.simulationState.simulationTime;
  return state.issues.filter((issue) => issue.status === "PENDING" && (issue.dispatchGate !== "INVESTIGATION" || state.responders.some((row) => row.availability === "AVAILABLE" && assertDispatchAuthorized(state, issue, row.id, "REMATCH")))).map((issue) => ({ issue, band: priorityForIssue(issue, now) })).sort((a, b) => {
    const band = BAND_ORDER[a.band] - BAND_ORDER[b.band];
    if (band) return band;
    return Date.parse(a.issue.raisedAt ?? a.issue.createdAt) - Date.parse(b.issue.raisedAt ?? b.issue.createdAt) || a.issue.id.localeCompare(b.issue.id);
  })[0] ?? null;
}

function nextToken(token, prefix) { return `${prefix}-${Number(token.split("-").at(-1)) + 1}`; }
function plusHours(value, hours) { return new Date(Date.parse(value) + hours * 3_600_000).toISOString(); }

/** Claimable due tokens, intentionally independent of planner/model work. */
export function claimWorkforceDueTriggers(state) {
  const config = state.workforceContinuity;
  if (!config || state.simulationState.status !== "RUNNING") return [];
  const now = Date.parse(state.simulationState.simulationTime);
  const triggers = [];
  // A delayed scheduler must replay each missed boundary at its persisted
  // effective timestamp, not reinterpret it as "now".  Otherwise a 20:00
  // handover processed at 21:42 selects the wrong outgoing crew.
  while (now >= Date.parse(config.nextStaffingReviewAt)) {
    const effectiveAt = config.nextStaffingReviewAt;
    const token = config.staffingReviewToken;
    config.staffingReviewToken = nextToken(token, "staffing-review");
    config.nextStaffingReviewAt = plusHours(config.nextStaffingReviewAt, 12);
    triggers.push({ kind: "STAFFING_REVIEW_DUE", token, effectiveAt, simulationTimestamp: effectiveAt });
  }
  while (now >= Date.parse(config.nextHandoverAt)) {
    const effectiveAt = config.nextHandoverAt;
    const token = config.handoverToken;
    config.handoverToken = nextToken(token, "handover");
    config.nextHandoverAt = plusHours(config.nextHandoverAt, 12);
    triggers.push({ kind: "SHIFT_HANDOVER_DUE", token, effectiveAt, simulationTimestamp: effectiveAt });
  }
  for (const recheck of config.staffingRechecks.filter((entry) => entry.status === "PENDING")) {
    recheck.status = "CLAIMED";
    triggers.push({ kind: "STAFFING_RECHECK", token: recheck.token, reason: recheck.reason, simulationTimestamp: state.simulationState.simulationTime });
  }
  for (const repair of config.temporaryRepairs.filter((entry) => entry.status === "SCHEDULED" && now >= Date.parse(entry.dueAt))) {
    repair.status = "CLAIMED";
    triggers.push({ kind: "TEMPORARY_REPAIR_RECURRENCE_DUE", token: repair.token, repairId: repair.id, simulationTimestamp: state.simulationState.simulationTime });
  }
  for (const rec of config.staffingRecommendations ?? []) {
    if (rec.status === "PENDING" && rec.deadlineToken && now >= Date.parse(rec.deadline)) {
      rec.deadlineDispatchToken = rec.deadlineToken;
      rec.deadlineToken = null;
      triggers.push({ kind: "STAFFING_DEADLINE_DUE", token: rec.deadlineDispatchToken, recommendationId: rec.id, simulationTimestamp: state.simulationState.simulationTime });
    }
  }
  for (const responder of state.responders.filter((entry) => entry.surgeKind && entry.extensionEndsAt && Date.parse(entry.extensionEndsAt) <= now && !entry.extensionExpiryClaimedAt)) {
    responder.extensionExpiryClaimedAt = state.simulationState.simulationTime;
    triggers.push({ kind: "EXTENSION_EXPIRY_DUE", token: `extension-expiry-${responder.id}-${Date.parse(responder.extensionEndsAt)}`, responderId: responder.id, simulationTimestamp: state.simulationState.simulationTime });
  }
  return triggers.sort((a, b) => Date.parse(a.effectiveAt ?? a.simulationTimestamp) - Date.parse(b.effectiveAt ?? b.simulationTimestamp) || a.token.localeCompare(b.token));
}

export function requestStaffingRecheck(state, reason) {
  const config = state.workforceContinuity;
  if (!config || !["ISSUE_RAISED", "ASSIGNMENT_RELEASED", "ISSUE_ESCALATED", "RESPONDER_AVAILABLE"].includes(reason)) return null;
  const pending = config.staffingRechecks.find((entry) => entry.status === 'PENDING' && entry.reason === reason);
  if (pending) return pending.token;
  const token = `staffing-recheck-${config.staffingRechecks.length + config.staffingAudit.length + 1}`;
  config.staffingRechecks.push({ token, reason, status: "PENDING", requestedAt: state.simulationState.simulationTime });
  return token;
}

export function applyWorkforceTrigger(state, trigger) {
  const config = state.workforceContinuity;
  const now = trigger.effectiveAt ?? state.simulationState.simulationTime;
  // Reviews are handled by staffing-service: this module only builds lawful
  // options and performs explicitly authorized mutations, never reads history.
  if (trigger.kind === "SHIFT_HANDOVER_DUE") {
    const outgoing = crewForTime(new Date(Date.parse(now) - 1).toISOString());
    const incoming = crewForTime(now);
    // Reconcile active work into a recorded, re-plannable handover before
    // making the incoming six-person crew available. This never leaves an
    // off-duty responder assigned merely because the clock crossed a boundary.
    reconcileWorkforceDuty(state, { reason: "SHIFT_HANDOVER_REPLAN" });
    config.handovers.push({ id: `handover-${trigger.token}`, token: trigger.token, simulationTimestamp: now, outgoingCrew: outgoing, incomingCrew: incoming, unresolvedIssueIds: state.issues.filter((issue) => issue.status !== "RESOLVED").map((issue) => issue.id) });
    return { status: "HANDOVER_RECORDED", trigger };
  }
  if (trigger.kind === "TEMPORARY_REPAIR_RECURRENCE_DUE") {
    const repair = config.temporaryRepairs.find((entry) => entry.id === trigger.repairId);
    if (!repair) return { status: "STALE", trigger };
    if (activeIssueCount(state) >= MAX_ACTIONABLE_ISSUES) {
      repair.status = "SCHEDULED"; repair.dueAt = plusHours(now, 15);
      config.deferredDemand.push({ id: `deferred-${trigger.token}`, simulationTimestamp: now, reason: "TEMPORARY_REPAIR_CAP", token: trigger.token });
      return { status: "DEFERRED_DEMAND", trigger };
    }
    const equipment = state.equipment.find((entry) => entry.id === repair.equipmentId);
    if (!equipment || equipment.status !== "NORMAL") { repair.status = "SCHEDULED"; repair.dueAt = plusHours(now, 15); return { status: "DEFERRED", trigger }; }
    const number = state.issues.reduce((max, row) => Math.max(max, Number(/(\d+)$/.exec(row.id)?.[1] ?? 0)), state.historyRetention?.highWater?.issues ?? 0) + 1;
    const id = `ISS-${String(number).padStart(3, "0")}`;
    state.issues.push({ id, equipmentId: repair.equipmentId, issueClass: repair.issueClass, complexity: "STANDARD", status: "PENDING", raisedAt: now, createdAt: now, downtimeStartedAt: now, description: "Temporary repair recurrence detected", responseAction: "Inspect the prior temporary repair and restore stable operation.", recurrenceContext: "TEMPORARY_REPAIR" });
    ensureIssueFault(state, state.issues.at(-1));
    equipment.status = "ISSUE_ACTIVE"; repair.status = "RAISED";
    state.operationalEvents.push({ id: nextOperationalEventId(state), simulationTimestamp: now, eventType: "ISSUE_RAISED", equipmentId: equipment.id, issueId: id, source: "WORKFORCE_CONTINUITY", payload: { issueClass: repair.issueClass, recurrenceContext: "TEMPORARY_REPAIR", dueToken: trigger.token }, createdAtRealTime: new Date().toISOString() });
    requestStaffingRecheck(state, "ISSUE_RAISED");
    return { status: "RECURRENCE_RAISED", issueId: id, trigger };
  }
  if (trigger.kind === "EXTENSION_EXPIRY_DUE") {
    const responder = state.responders.find((entry) => entry.id === trigger.responderId);
    if (!responder || !responder.surgeKind) return { status: "STALE", trigger };
    const activeAssignment = state.assignments.find((entry) => entry.responderId === responder.id && entry.status === "ACTIVE");
    // Never discard an active attempt to satisfy a duty transition. Persist a
    // durable handover obligation and make incoming capacity available; the
    // normal assignment path performs the atomic replacement.
    if (activeAssignment) {
      config.handovers.push({ id: `duty-handover-${trigger.token}`, token: trigger.token, simulationTimestamp: now, outgoingResponderId: responder.id, issueId: activeAssignment.issueId, reason: "MAXIMUM_DUTY_REACHED" });
      requestStaffingRecheck(state, "RESPONDER_AVAILABLE");
      return { status: "HANDOVER_REQUIRED", trigger };
    }
    responder.availability = "UNAVAILABLE";
    responder.lastDutyEndedAt = now;
    responder.dutyStartedAt = null;
    delete responder.surgeKind; delete responder.extensionEndsAt;
    return { status: "EXTENSION_ENDED", trigger };
  }
  return { status: "IGNORED", trigger };
}

/** Code-owned legality; explicit projection prevents private responder fields escaping. */
export function lawfulStaffingOptions(state, now = state.simulationState.simulationTime) {
  const active = state.responders.filter((r) => r.availability !== "UNAVAILABLE");
  const surge = active.filter((r) => r.surgeKind).length;
  if (activeIssueCount(state) <= active.length || active.length >= MAX_ACTIVE_STAFF || surge >= 2) return [];
  const options = [];
  for (const r of state.responders) {
    const dutyHours = r.dutyStartedAt ? hoursSince(now, r.dutyStartedAt) : 0;
    const restHours = r.lastDutyEndedAt ? hoursSince(now, r.lastDutyEndedAt) : null;
    // An on-duty responder can be extended whether idle or mid-job: legality is the duty
    // and rest limits, not whether they happen to be between assignments when approved.
    if (r.availability !== "UNAVAILABLE" && r.crewId === crewForTime(now) && !r.surgeKind && !r.extensionEndsAt && r.dutyStartedAt && dutyHours >= 0 && dutyHours <= NORMAL_SHIFT_HOURS) {
      options.push({ optionId: `EXTENSION:${r.id}`, responderId: r.id, displayName: r.name, kind: "EXTENSION", dutyHours, restHours,
        legalEndsAt: plusHours(now, Math.min(6, MAX_DUTY_HOURS - dutyHours)) });
    }
    if (r.availability === "UNAVAILABLE" && (!r.lastDutyEndedAt || restHours >= MIN_REST_HOURS)) {
      options.push({ optionId: `CALL_IN:${r.id}`, responderId: r.id, displayName: r.name, kind: "CALL_IN", dutyHours: 0, restHours,
        legalEndsAt: plusHours(now, NORMAL_SHIFT_HOURS) });
    }
  }
  return options.sort((a,b) => (a.kind === b.kind ? 0 : a.kind === "EXTENSION" ? -1 : 1) || a.responderId.localeCompare(b.responderId));
}

export function applyStaffingOption(state, option) {
  const legal = lawfulStaffingOptions(state).find((row) => row.optionId === option.optionId);
  if (!legal || Date.parse(option.legalEndsAt) <= Date.parse(state.simulationState.simulationTime) || Date.parse(option.legalEndsAt) > Date.parse(legal.legalEndsAt)) return false;
  const responder = state.responders.find((r) => r.id === option.responderId);
  responder.surgeKind = option.kind;
  responder.extensionEndsAt = option.legalEndsAt;
  delete responder.extensionExpiryClaimedAt;
  if (option.kind === "CALL_IN") {
    responder.availability = "AVAILABLE";
    responder.dutyStartedAt = state.simulationState.simulationTime;
    responder.lastDutyEndedAt = null;
  }
  return true;
}
