import { cloneDraftValue } from './live-draft.mjs';
import { publicInvestigationState, investigationDTO, reportDTO } from './investigation-public.mjs';
import { CERTIFICATIONS } from './investigation-records.mjs';
import { staffingBacklog } from './staffing-service.mjs';
import { deterministicFixRecommendation } from './fix-evidence.mjs';
import { fixById, fixesFor } from './fix-catalog.mjs';
import { assertNoFaultTruth, validateFaultTruth } from './fault-truth.mjs';
export { assertNoFaultTruth } from './fault-truth.mjs';
/**
 * v4 Live Simulation contracts.
 * ResponderSkill is deliberately accepted only by this simulation schema and
 * deliberately removed by createPublicLiveSnapshot before application state
 * reaches any UI or agent-facing boundary.
 */

import { analyticHistory, recentHistoryEvents } from "./history-retention.mjs";

export const LIVE_SCHEMA_VERSION = "2.1";
export const ISSUE_CLASSES = ["A", "B", "C"];
export const BASELINE_CONFIG = {
  version: "naive-score-v1",
  formula: "(100 * successRate) - (2 * medianResolutionMinutes) - (3 * travelTimeMinutes)",
  weights: { successRate: 100, medianResolutionMinutes: -2, travelTimeMinutes: -3 },
  noHistoryPolicy: { successRate: 0, medianResolutionMinutes: 60 },
};

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid live simulation state: ${message}`);
}

function assertUnique(entries, key, label) {
  const ids = entries.map((entry) => entry[key]);
  assert(new Set(ids).size === ids.length, `${label} ${key} values must be unique`);
}

export function validateLiveState(state, { previous = null } = {}) {
  // Full load/migration validation uses no previous state. Published rows are immutable;
  // only their changed replacements need repeated deep checks during a transaction.
  const issuesById = new Map((state?.issues ?? []).map(r=>[r.id,r]));
  const respondersById = new Map((state?.responders ?? []).map(r=>[r.id,r]));
  const attemptsById = new Map((state?.resolutionAttempts ?? []).map(r=>[r.id,r]));
  const group=(rows,key)=>{const map=new Map();for(const row of rows){const id=row[key];if(!map.has(id))map.set(id,[]);map.get(id).push(row);}return map;};
  const activeAssignments=(state?.assignments ?? []).filter(r=>r.status==='ACTIVE');
  const activeByIssue=group(activeAssignments,'issueId'), activeByResponder=group(activeAssignments,'responderId'), activeByAttempt=group(activeAssignments,'attemptId');
  const pendingOffers=(state?.dispatchOffers ?? []).filter(r=>r.status==='PENDING');
  const pendingByIssue=group(pendingOffers,'issueId'),pendingByResponder=group(pendingOffers,'responderId');
  const attemptsByIssue=group((state?.resolutionAttempts ?? []).filter(r=>r.status==='ACTIVE'),'issueId');
  const list=(map,id)=>map.get(id)??[];
  const historyByParticipant=new Map();
  for(const row of state?.resolutionHistory??[])for(const id of new Set([row.responderId,...(row.participants??[]).map(p=>p.responderId)])){
    const key=JSON.stringify([row.attemptId,id]);if(!historyByParticipant.has(key))historyByParticipant.set(key,row);
  }
  const changed=(key)=>{if(!previous)return state[key]??[];if(state[key]===previous[key])return [];const old=new Set(previous[key]??[]);return (state[key]??[]).filter(row=>!old.has(row));};
  assert(state && typeof state === "object", "state must be an object");
  validateFaultTruth(state);
  if(state.investigationPolicy) {
    const policy=state.investigationPolicy;
    assert(['OPERATOR','AUTO_APPROVE_SAFE'].includes(policy.investigationApproval),'Invalid investigation approval policy');
    assert(Number.isFinite(policy.investigationDeadlineMinutes)&&policy.investigationDeadlineMinutes>0&&policy.investigationDeadlineMinutes<=720,'Invalid investigation deadline');
    assert(Number.isFinite(policy.investigationShare)&&policy.investigationShare>=0&&policy.investigationShare<=1,'Invalid investigation share');
    assert(Number.isInteger(policy.revision)&&policy.revision>=0,'Invalid investigation policy revision');
  }
  for (const key of ['fieldReports','investigations']) if (state[key] !== undefined) {
    assert(Array.isArray(state[key]), `Invalid ${key}`);
    assertUnique(state[key], 'id', key);
  }
  for (const row of changed('investigations')) {
    assert(['QUEUED','RUNNING','READY','ABSTAINED','ESCALATED','FAILED','APPROVED','OVERRIDDEN','AUTO_APPROVED','REJECTED','EXPIRED','SUPERSEDED'].includes(row.status), 'Invalid investigation status');
    if(row.status==='READY'&&row.deadline)assert(Number.isFinite(Date.parse(row.deadline))&&Boolean(row.deadlineToken)!==Boolean(row.deadlineDispatchToken),'Invalid investigation deadline token');
    assert(Number.isInteger(row.revision) && row.revision >= 0, 'Invalid investigation revision');
    assert(Buffer.byteLength(JSON.stringify(row.trace ?? [])) <= 65536, 'Investigation trace exceeds budget');
  }
  for (const responder of changed('responders')) if (responder.certifications !== undefined) {
    assert(Array.isArray(responder.certifications) && new Set(responder.certifications).size === responder.certifications.length
      && responder.certifications.every((value) => CERTIFICATIONS.includes(value)), 'Invalid public certifications');
  }
  for (const issue of changed('issues')) if (issue.reportNarrative !== undefined) {
    assert(typeof issue.reportNarrative === 'string' && ['operator', 'simulated', 'template'].includes(issue.narrativeSource), 'Invalid report narrative');
  }
  for (const issue of changed('issues')) if (issue.fixRecommendation) {
    const rows = issue.fixRecommendation.rankedFixes;
    assert(Array.isArray(rows) && rows.length === fixesFor(issue.issueClass).length && new Set(rows.map((r) => r.fixId)).size === rows.length && rows.every((r, i) => fixById(issue.issueClass, r.fixId) && r.rank === i + 1), 'Invalid stored fix ranking');
    assertNoResponderSkill(issue.fixRecommendation);
  }
  for (const attempt of state.resolutionAttempts ?? []) if (attempt.fixApplied) {
    const issue = issuesById.get(attempt.issueId);
    const fix = fixById(issue?.issueClass, attempt.fixApplied.id);
    assert(fix && fix.title === attempt.fixApplied.title && fix.steps === attempt.fixApplied.steps, 'Invalid applied fix');
  }
  assert(state.schemaVersion === LIVE_SCHEMA_VERSION, "schemaVersion is unsupported");
  assert(Number.isInteger(state.revision) && state.revision >= 0, "revision must be a non-negative integer");
  if (state.historyRetention) {
    const history = state.historyRetention;
    assert(history.version === 1 && Number.isInteger(history.epoch) && history.epoch >= 0, "history retention version/epoch is invalid");
    assert(["issues", "events", "recommendations"].every((key) => Array.isArray(history.facts?.[key])), "history analytic facts are invalid");
    assert(Object.values(history.archives).every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)), "history archive address is invalid");
    assert(Object.values(history.highWater).every((value) => Number.isInteger(value) && value >= 0), "history ID floor is invalid");
    assert(Object.values(history.removed).every((value) => Number.isInteger(value) && value >= 0), "history token count is invalid");
    if (!previous || history.facts !== previous.historyRetention?.facts) assertNoResponderSkill(history.facts);
  }
  for (const key of ["equipment", "responders", "responderSkills", "issues", "assignments", "resolutionAttempts", "resolutionHistory", "recommendations", "operationalEvents"]) {
    assert(Array.isArray(state[key]), `${key} must be an array`);
  }
  assert(state.equipment.length >= 60 && state.equipment.length <= 90, "seed must have between sixty and ninety equipment items");
  for (const floor of [1, 2, 3]) {
    const onFloor = state.equipment.filter((item) => item.floor === floor).length;
    assert(onFloor >= 20 && onFloor <= 30, `floor ${floor} must hold between twenty and thirty equipment items`);
  }
  assert(state.responders.length === 24, "workforce must have four six-person crews");
  assert(state.resolutionHistory.length >= 48, "state must retain the seeded observed records");
  assert(state.responderSkills.length === state.responders.length * ISSUE_CLASSES.length, "seed must have one hidden skill per responder and issue class");
  assertUnique(state.equipment, "id", "equipment");
  assertUnique(state.responders, "id", "responders");
  assertUnique(state.issues, "id", "issues");
  assertUnique(state.assignments, "id", "assignments");
  assertUnique(state.responderSkills, "id", "responder skills");
  assert(state.simulationState && typeof state.simulationState.simulationTime === "string", "simulationState.simulationTime is required");
  assert(["PAUSED", "RUNNING"].includes(state.simulationState.status), "simulation state status is invalid");
  assert([1, 5, 10, 60].includes(state.simulationState.speedMultiplier), "simulation speed is invalid");
  assert(typeof state.simulationState.nextEventAt === "string" && !Number.isNaN(Date.parse(state.simulationState.nextEventAt)), "next event timestamp is invalid");
  assert(/^due-[1-9]\d*$/.test(state.simulationState.dueEventToken), "due event token is invalid");
  assert(state.simulationState.rngVersion === "lcg32-v1", "simulation RNG version is unsupported");
  for (const stream of ["scheduler", "fallback", "resolution", "attempt", "durability"]) {
    assert(Number.isInteger(state.simulationState.rngStreams?.[stream]) && state.simulationState.rngStreams[stream] >= 0 && state.simulationState.rngStreams[stream] <= 0xffffffff, `${stream} RNG state is invalid`);
  }
  if (state.simulationState.rngStreams?.dispatch !== undefined) {
    assert(Number.isInteger(state.simulationState.rngStreams.dispatch) && state.simulationState.rngStreams.dispatch >= 0 && state.simulationState.rngStreams.dispatch <= 0xffffffff, "dispatch RNG state is invalid");
  }
  assert(state.simulationConfig?.maxActiveIssues === 10, "max active issue ceiling must be ten");
  assert(state.simulationConfig?.baselineConfig?.version === BASELINE_CONFIG.version, "baseline configuration is missing or unsupported");
  assert(state.workforceContinuity?.version === "wc-2", "workforce continuity configuration is missing or unsupported");
  assert(Number.isInteger(state.workforceContinuity?.workforceProvisioningSeed), "workforce provisioning seed is invalid");
  const staffing = state.workforceContinuity;
  if (staffing.staffingApproval !== undefined) assert(['OPERATOR','AUTO_APPROVE_TOP'].includes(staffing.staffingApproval), 'invalid staffing approval policy');
  if (staffing.staffingDeadlineMinutes !== undefined) assert(Number.isFinite(staffing.staffingDeadlineMinutes) && staffing.staffingDeadlineMinutes > 0 && staffing.staffingDeadlineMinutes <= 720, 'invalid staffing deadline');
  const staffingRecords = staffing.staffingRecommendations ?? [];
  assertUnique(staffingRecords, 'id', 'staffing recommendation');
  assert(staffingRecords.filter((r)=>r.status==='PENDING').length <= 1, 'multiple open staffing recommendations');
  for (const rec of staffingRecords) {
    assert(['PENDING','APPROVED_TOP','APPROVED_ALTERNATIVE','REJECTED','EXPIRED','AUTO_APPROVED','STALE','SUPERSEDED'].includes(rec.status), 'invalid staffing status');
    assert(Number.isInteger(rec.revision) && rec.revision >= 0, 'invalid staffing revision');
    assert(Number.isFinite(Date.parse(rec.deadline)), 'invalid staffing deadline timestamp');
    const ids = rec.packet.candidates.map((c)=>c.optionId);
    assert(ids.length > 0 && new Set(ids).size === ids.length, 'invalid staffing candidates');
    assert(rec.rankedOptions.length === ids.length && rec.rankedOptions.every((r,i)=>ids.includes(r.optionId) && r.rank===i+1) && new Set(rec.rankedOptions.map((r)=>r.optionId)).size===ids.length, 'invalid staffing ranking');
  }
  for (const equipment of state.equipment) {
    assert(Number.isInteger(equipment.ratedUnitsPerHour) && equipment.ratedUnitsPerHour >= 40 && equipment.ratedUnitsPerHour <= 120, `equipment ${equipment.id} rated throughput is invalid`);
    assert(["NORMAL", "ISSUE_ACTIVE"].includes(equipment.status), `equipment ${equipment.id} status is invalid`);
    assert([1, 2, 3].includes(equipment.floor), `equipment ${equipment.id} floor is invalid`);
  }
  for (const responder of state.responders) {
    assert(["AVAILABLE", "UNAVAILABLE", "OFFERED", "ASSIGNED"].includes(responder.availability), `responder ${responder.id} availability is invalid`);
    assert([1, 2, 3].includes(responder.floor), `responder ${responder.id} floor is invalid`);
    assert(["A", "B", "C", "D"].includes(responder.crewId), `responder ${responder.id} crew is invalid`);
    assert(/^(Engr|Tech|Optr)\d{3}$/.test(responder.name), `responder ${responder.id} public name is invalid`);
  }
  assert(state.responders.filter((responder) => responder.availability !== "UNAVAILABLE").length <= 8, "workforce exceeds maximum active staff");
  for (const issue of state.issues) {
    assert(issue.dispatchGate === undefined || ["OPEN","INVESTIGATION"].includes(issue.dispatchGate), "Invalid dispatch gate");
    assert(ISSUE_CLASSES.includes(issue.issueClass), `issue ${issue.id} class is invalid`);
    assert(["PENDING", "RECOMMENDATION_READY", "OFFER_PENDING", "ASSIGNED", "RESOLVED"].includes(issue.status), `issue ${issue.id} status is invalid`);
    assert(["STANDARD", "COMPLEX"].includes(issue.complexity), `issue ${issue.id} complexity is invalid`);
  }
  if (state.dispatchOffers !== undefined) {
    assert(Array.isArray(state.dispatchOffers), "dispatchOffers must be an array when present");
    assertUnique(state.dispatchOffers, "id", "dispatch offers");
    for (const offer of state.dispatchOffers) {
      assert(issuesById.has(offer.issueId), `offer has unknown issue ${offer.issueId}`);
      assert(respondersById.has(offer.responderId), `offer has unknown responder ${offer.responderId}`);
      assert(["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"].includes(offer.status), `offer ${offer.id} status is invalid`);
      if (offer.status === "PENDING") {
        const responseScheduled = typeof offer.responseDueAt === "string"
          && !Number.isNaN(Date.parse(offer.responseDueAt))
          && /^offer-response-[1-9]\d*$/.test(offer.responseDueToken)
          && offer.responseDispatchToken === null;
        const responseDispatched = offer.responseDueToken === null && /^offer-response-[1-9]\d*$/.test(offer.responseDispatchToken);
        assert(responseScheduled || responseDispatched, `offer ${offer.id} response schedule is invalid`);
        const issue = issuesById.get(offer.issueId);
        const responder = respondersById.get(offer.responderId);
        assert(issue.pendingOfferId === offer.id && issue.offeredResponderId === offer.responderId, `offer ${offer.id} disagrees with issue cache`);
        assert(responder.availability === "OFFERED" && responder.currentOfferId === offer.id, `offer ${offer.id} disagrees with responder cache`);
        assert(list(activeByResponder,offer.responderId).length === 0, `offer ${offer.id} targets an assigned responder`);
      }
    }
    const pending = state.dispatchOffers.filter((offer) => offer.status === "PENDING");
    for (const issue of state.issues) assert(list(pendingByIssue,issue.id).length <= 1, `issue ${issue.id} has conflicting pending offers`);
    for (const responder of state.responders) assert(list(pendingByResponder,responder.id).length <= 1, `responder ${responder.id} has conflicting pending offers`);
  }
  for (const assignment of state.assignments) {
    assert(issuesById.has(assignment.issueId), `assignment has unknown issue ${assignment.issueId}`);
    assert(respondersById.has(assignment.responderId), `assignment has unknown responder ${assignment.responderId}`);
    assert(["PRIMARY", "SUPPORT"].includes(assignment.role), `assignment ${assignment.id} role is invalid`);
    assert(["ACTIVE", "RELEASED", "COMPLETED"].includes(assignment.status), `assignment ${assignment.id} status is invalid`);
    assert(Array.isArray(assignment.roleHistory) && assignment.roleHistory.length >= 1, `assignment ${assignment.id} role history is invalid`);
    if (assignment.status === "ACTIVE") {
      const attempt = attemptsById.get(assignment.attemptId);
      assert(attempt, `assignment ${assignment.id} has unknown attempt`);
      assert(attempt.issueId === assignment.issueId && attempt.status === "ACTIVE", `assignment ${assignment.id} is linked to the wrong attempt`);
    } else {
      const attempt = attemptsById.get(assignment.attemptId);
      const history = historyByParticipant.get(JSON.stringify([assignment.attemptId,assignment.responderId]));
      const terminalAttempt = attempt && attempt.issueId === assignment.issueId && attempt.status !== "ACTIVE";
      const activeAttempt = attempt && attempt.issueId === assignment.issueId && attempt.status === "ACTIVE";
      const matchingHistory = history && history.issueId === assignment.issueId;
      if (assignment.status === "COMPLETED") assert(matchingHistory && (!attempt || terminalAttempt), `completed assignment ${assignment.id} has no matching terminal history`);
      if (assignment.status === "RELEASED") assert(activeAttempt || (matchingHistory && (!attempt || terminalAttempt)), `released assignment ${assignment.id} has no matching active attempt or terminal history`);
    }
  }
  const sameResponders = previous && previous.responders.length === state.responders.length && previous.responders.every((r,i)=>r.id===state.responders[i].id);
  for (const record of sameResponders ? changed('resolutionHistory') : state.resolutionHistory) {
    if (!record.participants) continue;
    // A completed attempt retains everyone who contributed over its lifetime.
    // The two-person limit applies only to its simultaneous ACTIVE roster;
    // handovers can legitimately produce more historical contributors.
    assert(Array.isArray(record.participants) && record.participants.length >= 1, `history ${record.id} participants are invalid`);
    assert(new Set(record.participants.map((row) => row.responderId)).size === record.participants.length, `history ${record.id} participant responders must be unique`);
    for (const participant of record.participants) {
      assert(respondersById.has(participant.responderId), `history ${record.id} has unknown participant ${participant.responderId}`);
      assert(Number.isFinite(participant.contributionShare) && participant.contributionShare >= 0 && participant.contributionShare <= 1, `history ${record.id} participant share is invalid`);
      assert(Number.isFinite(participant.participationMinutes) && participant.participationMinutes >= 0, `history ${record.id} participant duration is invalid`);
      assert(Array.isArray(participant.roleIntervals) && participant.roleIntervals.length >= 1, `history ${record.id} participant role intervals are invalid`);
      for (const interval of participant.roleIntervals) {
        assert(["PRIMARY", "SUPPORT"].includes(interval.role), `history ${record.id} participant role is invalid`);
        assert(interval.joinedAt === null || (typeof interval.joinedAt === "string" && !Number.isNaN(Date.parse(interval.joinedAt))), `history ${record.id} participant join time is invalid`);
        assert(typeof interval.endedAt === "string" && !Number.isNaN(Date.parse(interval.endedAt)), `history ${record.id} participant end time is invalid`);
      }
    }
    const shareTotal = record.participants.reduce((sum, row) => sum + row.contributionShare, 0);
    assert(Math.abs(shareTotal - 1) < 1e-6, `history ${record.id} contribution shares must sum to one`);
  }
  assertUnique(state.resolutionAttempts, "id", "resolution attempts");
  for (const issue of state.issues) assert(list(attemptsByIssue,issue.id).length <= 1, `issue ${issue.id} has multiple active attempts`);
  for (const attempt of state.resolutionAttempts) {
    assert(issuesById.has(attempt.issueId), `attempt ${attempt.id} has unknown issue`);
    assert(["ACTIVE", "SUCCEEDED", "FAILED"].includes(attempt.status), `attempt ${attempt.id} status is invalid`);
    assert(attempt.modelVersion === "team-resolution-v1", `attempt ${attempt.id} model is unsupported`);
    assert(Number.isFinite(attempt.durationFactor) && attempt.durationFactor >= 0.7 && attempt.durationFactor <= 1.3, `attempt ${attempt.id} duration factor is invalid`);
    assert(Number.isFinite(attempt.successDraw) && attempt.successDraw >= 0 && attempt.successDraw < 1, `attempt ${attempt.id} success draw is invalid`);
    assert(Number.isFinite(attempt.workTotal) && attempt.workTotal > 0, `attempt ${attempt.id} work total is invalid`);
    assert(Number.isFinite(attempt.completedWork) && attempt.completedWork >= 0 && attempt.completedWork <= attempt.workTotal + 1e-9, `attempt ${attempt.id} completed work is invalid`);
    assert(Number.isInteger(attempt.rosterVersion) && attempt.rosterVersion >= 1, `attempt ${attempt.id} roster version is invalid`);
    assert(Number.isInteger(attempt.scheduleGeneration) && attempt.scheduleGeneration >= 1, `attempt ${attempt.id} schedule generation is invalid`);
    assert(Array.isArray(attempt.segments), `attempt ${attempt.id} segments are invalid`);
    assert(["NONE", "REQUESTED", "WAITING", "STAFFED", "EXHAUSTED"].includes(attempt.assistance?.status), `attempt ${attempt.id} assistance status is invalid`);
    const active = list(activeByAttempt,attempt.id);
    assert(active.length <= 2, `attempt ${attempt.id} exceeds two active responders`);
    if (attempt.status === "ACTIVE") {
      assert(active.length >= 1, `active attempt ${attempt.id} has no roster`);
      assert(active.filter((row) => row.role === "PRIMARY").length === 1, `active attempt ${attempt.id} must have exactly one primary`);
      const scheduled = typeof attempt.resolutionDueAt === "string" && !Number.isNaN(Date.parse(attempt.resolutionDueAt)) && typeof attempt.resolutionDueToken === "string" && attempt.resolutionDispatchToken === null;
      const dispatched = attempt.resolutionDueAt === null && attempt.resolutionDueToken === null && typeof attempt.resolutionDispatchToken === "string";
      assert(scheduled || dispatched, `active attempt ${attempt.id} resolution schedule is invalid`);
    } else {
      assert(attempt.completedAt && !Number.isNaN(Date.parse(attempt.completedAt)), `completed attempt ${attempt.id} completion time is invalid`);
      for (const field of ["resolutionDueAt", "resolutionDueToken", "resolutionDispatchToken", "reviewDueAt", "reviewDueToken", "reviewDispatchToken"]) assert(attempt[field] === null, `completed attempt ${attempt.id} retains ${field}`);
    }
  }
  for (const responder of state.responders) {
    const active = list(activeByResponder,responder.id);
    const pendingOffers = list(pendingByResponder,responder.id);
    assert(active.length <= 1, `responder ${responder.id} has conflicting assignments`);
    if (active.length === 1) assert(responder.availability === "ASSIGNED" && responder.currentIssueId === active[0].issueId, `responder ${responder.id} cache disagrees with active assignment`);
    if (active.length === 0) assert(!responder.currentIssueId, `responder ${responder.id} retains a stale issue cache`);
    if (responder.availability === "ASSIGNED") assert(active.length === 1, `assigned responder ${responder.id} has no active assignment`);
    if (responder.availability === "OFFERED") assert(pendingOffers.length === 1 && responder.currentOfferId === pendingOffers[0].id, `offered responder ${responder.id} has no matching offer`);
    if (responder.availability !== "OFFERED") assert(pendingOffers.length === 0 && !responder.currentOfferId, `responder ${responder.id} retains a stale offer cache`);
  }
  for (const issue of state.issues) {
    const active = list(activeByIssue,issue.id);
    const activeAttempts = list(attemptsByIssue,issue.id);
    const pendingOffers = list(pendingByIssue,issue.id);
    assert(active.length <= 2, `issue ${issue.id} exceeds two active responders`);
    if (active.length) {
      assert(active.filter((row) => row.role === "PRIMARY").length === 1, `issue ${issue.id} must have exactly one primary`);
      assert(issue.status === "ASSIGNED" && issue.assignedResponderId === active.find((row) => row.role === "PRIMARY")?.responderId, `issue ${issue.id} cache disagrees with roster`);
      assert(activeAttempts.length === 1 && active.every((row) => row.attemptId === activeAttempts[0].id), `issue ${issue.id} roster is split across attempts`);
    }
    if (!active.length) assert(!issue.assignedResponderId, `issue ${issue.id} retains a stale assigned responder cache`);
    if (issue.status === "ASSIGNED") assert(active.length >= 1, `assigned issue ${issue.id} has no active roster`);
    if (issue.status === "OFFER_PENDING") assert(active.length === 0 && pendingOffers.length === 1 && pendingOffers[0].purpose !== "ASSISTANCE", `issue ${issue.id} initial offer state is invalid`);
    if (issue.pendingOfferId) assert(pendingOffers.length === 1 && pendingOffers[0].id === issue.pendingOfferId, `issue ${issue.id} retains a stale offer cache`);
    if (!issue.pendingOfferId) assert(pendingOffers.length === 0, `issue ${issue.id} is missing its offer cache`);
  }
  for (const skill of state.responderSkills) {
    assert(respondersById.has(skill.responderId), `skill has unknown responder ${skill.responderId}`);
    assert(ISSUE_CLASSES.includes(skill.issueClass), "skill has invalid issue class");
    assert(Number.isFinite(skill.trueMedianMinutes) && skill.trueMedianMinutes > 0, "skill median must be positive");
    assert(Number.isFinite(skill.trueSuccessProbability) && skill.trueSuccessProbability >= 0 && skill.trueSuccessProbability <= 1, "skill success probability is invalid");
  }
  return state;
}

/** Return the only state shape allowed outside the simulation backend. */
function stationMetrics(state) {
  state = analyticHistory(state);
  const now = Date.parse(state.simulationState.simulationTime);
  const started = Date.parse(state.operationalEvents.find((event) => event.eventType === "SIMULATION_STARTED")?.simulationTimestamp ?? state.simulationState.simulationTime);
  const elapsedMinutes = Math.max(0, (now - started) / 60_000);
  return Object.fromEntries(state.equipment.map((station) => {
    const stationIssues = state.issues.filter((issue) => issue.equipmentId === station.id);
    const issueCount = stationIssues.length;
    const activeDowntime = stationIssues.filter((issue) => issue.status !== "RESOLVED").reduce((total, issue) => total + Math.max(0, (now - Date.parse(issue.downtimeStartedAt ?? issue.raisedAt ?? state.simulationState.simulationTime)) / 60_000), 0);
    const uptimeMinutes = Math.max(0, elapsedMinutes - activeDowntime);
    const rounded = (minutes) => `${Math.round(minutes)} min`;
    return [station.id, { issueCount, uptime: rounded(uptimeMinutes), mtbf: issueCount ? rounded(elapsedMinutes / issueCount) : "No observed failures" }];
  }));
}
export function createPublicLiveSnapshot(state, { validated = false } = {}) {
  if (!validated) validateLiveState(state);
  // Select before cloning. Neither private history nor archived analytic facts
  // belong in the polled payload, even transiently.
  const { responderSkills, resolutionHistory, historyRetention, faultTruth, fieldReports, investigations, investigationSequences, ...base } = state;
  const openIssues = state.issues.filter((row) => row.status !== "RESOLVED");
  const recentIssues = state.issues.filter((row) => row.status === "RESOLVED").sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt)).slice(0, 100);
  const issueIds = new Set([...openIssues, ...recentIssues].map((row) => row.id));
  const eventTail = recentHistoryEvents(state);
  for (const event of eventTail) if (event.issueId) issueIds.add(event.issueId);
  const recommendationIds = new Set(state.recommendations.slice(-30).map((row) => row.id));
  for (const row of state.dispatchOffers ?? []) if (row.status === "PENDING") recommendationIds.add(row.recommendationId);
  for (const issue of openIssues) {
    const latest = state.recommendations.findLast((row) => row.issueId === issue.id && ["READY", "UNAVAILABLE", "PENDING_MODEL"].includes(row.status));
    if (latest) recommendationIds.add(latest.id);
  }
  const publicState = structuredClone(cloneDraftValue({ ...base, ...publicInvestigationState(state),
    issues: [...state.issues.filter((row) => issueIds.has(row.id)), ...(state.historyRetention?.facts.issues ?? []).filter((row) => issueIds.has(row.id))].map((row) => row.dispatchGate !== "INVESTIGATION" && row.status !== "RESOLVED" && row.symptom && !row.fixRecommendation ? { ...row, fixRecommendation: deterministicFixRecommendation(state, row) } : row),
    assignments: state.assignments.filter((row) => row.status === "ACTIVE"),
    resolutionAttempts: state.resolutionAttempts.filter((row) => row.status === "ACTIVE"),
    recommendations: state.recommendations.filter((row) => recommendationIds.has(row.id)),
    dispatchOffers: [...new Map([...(state.dispatchOffers ?? []).slice(-30), ...(state.dispatchOffers ?? []).filter((row) => row.status === "PENDING")].map((row) => [row.id, row])).values()],
    operationalEvents: eventTail,
  }));
  if (publicState.workforceContinuity) {
    delete publicState.workforceContinuity.workforceProvisioningSeed;
    delete publicState.workforceContinuity.rotationAnchor;
    publicState.workforceContinuity.backlog = staffingBacklog(state);
    const staffingRecords = publicState.workforceContinuity.staffingRecommendations ?? [];
    publicState.workforceContinuity.staffingRecommendations = [...staffingRecords.filter((r) => r.status === 'PENDING'), ...staffingRecords.filter((r) => r.status !== 'PENDING').slice(-5)].map(({deadlineToken,deadlineDispatchToken,requestToken,...rec})=>rec);
    publicState.workforceContinuity.staffingAudit = publicState.workforceContinuity.staffingAudit.slice(-30);
    publicState.workforceContinuity.handovers = publicState.workforceContinuity.handovers.slice(-30);
    publicState.workforceContinuity.staffingRechecks = publicState.workforceContinuity.staffingRechecks.slice(-30);
    publicState.workforceContinuity.temporaryRepairs = publicState.workforceContinuity.temporaryRepairs.filter((row) => ["SCHEDULED", "CLAIMED"].includes(row.status));
  }
  const { dueEventToken, rngVersion, rngStreams, ...publicSimulationState } = publicState.simulationState;
  publicState.simulationState = publicSimulationState;
  publicState.operationalEvents = publicState.operationalEvents.slice(-100).map(redactOperationalEvent);
  publicState.dispatchOffers = (publicState.dispatchOffers ?? []).map((offer) => {
    const { responseDueToken, responseDispatchToken, acceptanceProbability, ...publicOffer } = offer;
    return publicOffer;
  });
  publicState.resolutionAttempts = publicState.resolutionAttempts.map((attempt) => {
    const { durationFactor, successDraw, workTotal, completedWork, participantWork, segments, resolutionDueToken, resolutionDispatchToken, resolutionDispatchForced, reviewDueToken, reviewDispatchToken, ...safe } = attempt;
    return safe;
  });
  // Application-owned, station-level observed facts only. These are derived
  // before returning the snapshot and never inspect ResponderSkill or attempts.
  publicState.stationMetrics = stationMetrics(state);
  assertNoResponderSkill(publicState);
  return publicState;
}

/**
 * Return one issue's complete audit record, subject to the same redaction rules
 * as the public snapshot.
 *
 * The polled snapshot truncates recommendations, offers, and events so the 1.5s
 * poll stays small. An audit trail must instead be complete for the issue it
 * describes and must stay reachable for issues that closed long ago, so it is
 * fetched on demand from untruncated state rather than read from that snapshot.
 */
export function createIssueAuditRecord(state, issueId) {
  validateLiveState(state);
  const issue = state.issues.find((entry) => entry.id === issueId);
  if (!issue) return null;
  const record = structuredClone({
    issue,
    ...((state.fieldReports ?? []).some((row)=>row.issueId===issueId)?{fieldReports:state.fieldReports.filter((row)=>row.issueId===issueId).map(reportDTO)}:{}),
    ...((state.investigations ?? []).some((row)=>row.issueId===issueId) ? {investigations:state.investigations.filter((row)=>row.issueId===issueId).map((row)=>investigationDTO(row))} : {}),
    equipment: state.equipment.find((entry) => entry.id === issue.equipmentId) ?? null,
    recommendations: state.recommendations.filter((entry) => entry.issueId === issueId),
    dispatchOffers: (state.dispatchOffers ?? []).filter((entry) => entry.issueId === issueId),
    assignments: state.assignments.filter((entry) => entry.issueId === issueId),
    resolutionAttempts: state.resolutionAttempts.filter((entry) => entry.issueId === issueId),
    resolutionHistory: state.resolutionHistory.filter((entry) => entry.issueId === issueId),
    operationalEvents: state.operationalEvents.filter((entry) => entry.issueId === issueId),
  });
  return redactIssueAuditRecord(record);
}

export function redactIssueAuditRecord(input) {
  const record = structuredClone(input);
  record.dispatchOffers = record.dispatchOffers.map((offer) => {
    const { responseDueToken, responseDispatchToken, acceptanceProbability, ...publicOffer } = offer;
    return publicOffer;
  });
  record.resolutionAttempts = record.resolutionAttempts.map((attempt) => {
    const { durationFactor, successDraw, workTotal, completedWork, participantWork, segments, resolutionDueToken, resolutionDispatchToken, resolutionDispatchForced, reviewDueToken, reviewDispatchToken, ...safe } = attempt;
    return safe;
  });
  record.resolutionHistory = record.resolutionHistory.map(redactResolutionHistory);
  record.operationalEvents = record.operationalEvents.map(redactOperationalEvent);
  assertNoResponderSkill(record);
  return record;
}

export function assertNoResponderSkill(value) {
  assertNoFaultTruth(value);
  const serialized = JSON.stringify(value);
  assert(!serialized.includes("responderSkills"), "ResponderSkill leaked from a public boundary");
  assert(!serialized.includes("trueSuccessProbability"), "hidden success probability leaked from a public boundary");
  assert(!serialized.includes("trueMedianMinutes"), "hidden median leaked from a public boundary");
  for (const hidden of ["successDraw", "durationFactor", "workTotal", "completedWork", "participantWork", "effectiveRate", "teamRate", "successProbability", "contributionShare"]) {
    assert(!serialized.includes(`\"${hidden}\"`), `hidden attempt field ${hidden} leaked from a public boundary`);
  }
}

function redactResolutionHistory(record) {
  const safe = structuredClone(record);
  safe.legacyFix = !safe.fixApplied;
  if (safe.participants) safe.participants = safe.participants.map(({ contributionShare, ...participant }) => participant);
  return safe;
}

function redactOperationalEvent(event) {
  const safe = structuredClone(event);
  if (Array.isArray(safe.payload?.participants)) safe.payload.participants = safe.payload.participants.map(({ contributionShare, ...participant }) => participant);
  return safe;
}
