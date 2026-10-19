import { recoverInvestigations } from './investigation-service.mjs';
import { migrateInvestigationRecords } from './investigation-records.mjs';
import { initializeFaults } from './fault-truth.mjs';
import { LIVE_SCHEMA_VERSION, validateLiveState } from "./live-schema.mjs";
import { createBuildingEquipment } from "../seed/floor-layout.mjs";
import { createWorkforceConfig, provisionWorkforce, reconcileWorkforceDuty, WORKFORCE_POLICY_VERSION } from "./workforce-continuity.mjs";
import { reconcileResponderLocations } from "./responder-location.mjs";

/**
 * Lift a single-floor state into the three-floor building.
 *
 * Persisted states written before the building existed hold six ground-floor
 * machines and no floor coordinate at all, which the current schema rejects.
 * Without this step an upgrade would leave the server unable to start on any
 * existing state file. Issues and assignments reference EQ-01..EQ-06, and the
 * building layout pins those six to their original coordinates, so the existing
 * machines are kept as they are and the rest of the building is added around them.
 */
function migrateToBuilding(state) {
  const building = createBuildingEquipment();
  const existing = new Map(state.equipment.map((item) => [item.id, item]));
  state.equipment = building.map((item) => {
    const previous = existing.get(item.id);
    // Keep live status and any operator-visible fields; only add the floor.
    return previous ? { ...previous, floor: item.floor } : item;
  });
  const seededFloors = { "R-ENGR104": 1, "R-ENGR028": 1, "R-TECH216": 2, "R-OPER088": 2, "R-TECH073": 3, "R-OPER142": 3 };
  for (const responder of state.responders) responder.floor ??= seededFloors[responder.id] ?? 1;
  return state;
}

function deterministicComplexity(issue) {
  const total = [...issue.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return total % 3 === 0 ? "COMPLEX" : "STANDARD";
}

function repairProjectionCaches(state) {
  const pendingOffers = (state.dispatchOffers ?? []).filter((offer) => offer.status === "PENDING");
  for (const responder of state.responders) {
    const active = state.assignments.find((assignment) => assignment.responderId === responder.id && assignment.status === "ACTIVE");
    const offer = pendingOffers.find((entry) => entry.responderId === responder.id);
    delete responder.currentIssueId;
    delete responder.currentOfferId;
    if (active) {
      responder.availability = "ASSIGNED";
      responder.currentIssueId = active.issueId;
    } else if (offer) {
      responder.availability = "OFFERED";
      responder.currentOfferId = offer.id;
    } else if (["ASSIGNED", "OFFERED"].includes(responder.availability)) {
      responder.availability = "AVAILABLE";
    }
  }
  for (const issue of state.issues) {
    const active = state.assignments.filter((assignment) => assignment.issueId === issue.id && assignment.status === "ACTIVE");
    const offer = pendingOffers.find((entry) => entry.issueId === issue.id);
    delete issue.assignedResponderId;
    delete issue.pendingOfferId;
    delete issue.offeredResponderId;
    if (active.length) {
      const primary = active.find((assignment) => assignment.role === "PRIMARY");
      issue.status = "ASSIGNED";
      issue.assignedResponderId = primary?.responderId;
    }
    if (offer) {
      issue.pendingOfferId = offer.id;
      issue.offeredResponderId = offer.responderId;
      if (!active.length && offer.purpose !== "ASSISTANCE") issue.status = "OFFER_PENDING";
    }
  }
  return state;
}

function legacyAttempt(state, assignment, index) {
  const issue = state.issues.find((row) => row.id === assignment.issueId);
  const skill = state.responderSkills.find((row) => row.responderId === assignment.responderId && row.issueClass === issue?.issueClass);
  const median = skill?.trueMedianMinutes ?? assignment.pendingResolutionMinutes ?? 15;
  const duration = assignment.pendingResolutionMinutes ?? median;
  const startedAt = assignment.createdAt ?? state.simulationState.simulationTime;
  const dueAt = assignment.resolutionDueAt;
  const totalElapsed = dueAt ? Math.max(0.01, (Date.parse(dueAt) - Date.parse(startedAt)) / 60_000) : duration;
  const factor = Math.max(0.70, Math.min(1.30, totalElapsed / median));
  const hash = [...`${assignment.id}:v2`].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16_777_619) >>> 0, 2_166_136_261);
  return {
    id: `attempt-${String(index + 1).padStart(3, "0")}`, issueId: assignment.issueId,
    modelVersion: "team-resolution-v1", status: "ACTIVE", startedAt, completedAt: null,
    durationFactor: factor, successDraw: hash / 0x1_0000_0000, workTotal: factor, completedWork: 0,
    participantWork: {}, rosterVersion: 1, scheduleGeneration: 1,
    resolutionDueAt: assignment.resolutionDueAt, resolutionDueToken: assignment.resolutionDueToken,
    resolutionDispatchToken: assignment.resolutionDispatchToken, reviewDueAt: null, reviewDueToken: null, reviewDispatchToken: null,
    resolutionDispatchForced: false,
    initialPlannedCompletionAt: assignment.resolutionDueAt,
    assistance: { status: "NONE", generation: 0, trigger: null, cooldownUntil: null },
    segments: [{ id: `attempt-${String(index + 1).padStart(3, "0")}-segment-1`, startedAt, endedAt: null,
      roster: [{ responderId: assignment.responderId, role: "PRIMARY", effectiveRate: 1 / median }],
      teamRate: 1 / median, successProbability: skill?.trueSuccessProbability ?? 0.5, workCompleted: 0 }],
  };
}

export function migrateLiveState(input) {
  if (!["1.0", "2.0", "2.1"].includes(input?.schemaVersion)) throw new Error(`Unsupported live schema version ${input?.schemaVersion ?? "missing"}`);
  // Accept snapshots saved with the former suggestion field name.
  input = structuredClone(input);
  for (const issue of input.issues ?? []) {
    issue.responseAction ??= issue.suggestedResponseAction;
    delete issue.suggestedResponseAction;
  }
  // Version 2.0 was exercised during development before role-history tracking
  // became mandatory. Keep this branch idempotent while repairing those rows.
  if (["2.0", "2.1"].includes(input.schemaVersion)) {
    const upgraded = structuredClone(input);
    for (const assignment of upgraded.assignments ?? []) {
      assignment.roleHistory ??= [{
        role: assignment.role ?? "PRIMARY",
        startedAt: assignment.joinedAt ?? assignment.createdAt,
        endedAt: assignment.endedAt ?? null,
      }];
    }
    migrateToBuilding(upgraded);
    repairProjectionCaches(upgraded);
    upgraded.simulationConfig ??= {};
    upgraded.simulationState.rngStreams.durability ??= 6_113;
    upgraded.simulationConfig.maxActiveIssues = 10;
    const needsWorkforceReconciliation = upgraded.workforceContinuity?.version !== WORKFORCE_POLICY_VERSION;
    upgraded.workforceContinuity ??= createWorkforceConfig(424242);
    upgraded.workforceContinuity.scenario ??= createWorkforceConfig(424242).scenario;
    upgraded.workforceContinuity.scenario.activeScenario ??= null;
  upgraded.workforceContinuity.staffingApproval ??= "OPERATOR";
  upgraded.workforceContinuity.staffingPolicyRevision ??= 0;
  upgraded.workforceContinuity.staffingDeadlineMinutes ??= 30;
  upgraded.workforceContinuity.staffingSequence ??= 0;
  upgraded.workforceContinuity.staffingRecommendations ??= [];
  for (const rec of upgraded.workforceContinuity.staffingRecommendations) if (rec.status === 'PENDING' && rec.rankingStatus === 'PENDING_MODEL') rec.rankingStatus = 'WAITING';
    if (needsWorkforceReconciliation) upgraded.workforceContinuity = { ...createWorkforceConfig(upgraded.workforceContinuity.workforceProvisioningSeed ?? 424242), ...upgraded.workforceContinuity, version: WORKFORCE_POLICY_VERSION };
    provisionWorkforce(upgraded);
    if (needsWorkforceReconciliation) reconcileWorkforceDuty(upgraded);
    reconcileResponderLocations(upgraded);
    upgraded.schemaVersion = LIVE_SCHEMA_VERSION;
    initializeFaults(upgraded, { recover: true });
    migrateInvestigationRecords(upgraded);
    recoverInvestigations(upgraded);
    validateLiveState(upgraded);
    return upgraded;
  }
  const state = structuredClone(input);
  state.schemaVersion = LIVE_SCHEMA_VERSION;
  state.simulationState.rngStreams.attempt ??= 9_973;
  state.simulationState.rngStreams.durability ??= 6_113;
  state.simulationConfig.maxActiveIssues = 10;
  state.workforceContinuity ??= createWorkforceConfig(424242);
  state.workforceContinuity.scenario ??= createWorkforceConfig(424242).scenario;
  state.workforceContinuity.scenario.activeScenario ??= null;
  state.workforceContinuity.staffingApproval ??= "OPERATOR";
  state.workforceContinuity.staffingPolicyRevision ??= 0;
  state.workforceContinuity.staffingDeadlineMinutes ??= 30;
  state.workforceContinuity.staffingSequence ??= 0;
  state.workforceContinuity.staffingRecommendations ??= [];
  for (const rec of state.workforceContinuity.staffingRecommendations) if (rec.status === 'PENDING' && rec.rankingStatus === 'PENDING_MODEL') rec.rankingStatus = 'WAITING';
  state.issues.forEach((issue) => { issue.complexity ??= deterministicComplexity(issue); });
  state.resolutionAttempts = state.assignments.filter((row) => row.status === "ACTIVE").map((row, index) => legacyAttempt(state, row, index));
  // Establish one canonical historical attempt identity before assignments are
  // linked. Legacy history's assignmentId identifies the assignment, not the
  // attempt, and must not be reused as the attempt id.
  state.resolutionHistory = state.resolutionHistory.map((record) => record.participants ? record : ({
    ...record,
    attemptId: record.attemptId ?? `legacy-${record.id}`,
    participants: [{ responderId: record.responderId, roleIntervals: [{ role: "PRIMARY", joinedAt: null, endedAt: record.resolvedAt ?? null }], participationMinutes: record.resolutionMinutes, contributionShare: 1 }],
    assisted: false,
  }));
  for (const assignment of state.assignments) {
    const activeAttempt = assignment.status === "ACTIVE" ? state.resolutionAttempts.find((row) => row.issueId === assignment.issueId) : null;
    const historicalOutcome = assignment.status !== "ACTIVE" ? state.resolutionHistory.find((record) => record.assignmentId === assignment.id) : null;
    assignment.attemptId = activeAttempt?.id ?? historicalOutcome?.attemptId ?? (historicalOutcome ? `legacy-${historicalOutcome.id}` : assignment.attemptId ?? null);
    assignment.role ??= "PRIMARY";
    assignment.joinedAt ??= assignment.createdAt;
    assignment.endedAt ??= assignment.completedAt ?? null;
    assignment.endReason ??= assignment.status === "ACTIVE" ? null : "LEGACY_COMPLETION";
    assignment.roleHistory ??= [{ role: assignment.role, startedAt: assignment.joinedAt, endedAt: assignment.endedAt }];
    delete assignment.pendingResolutionMinutes;
    delete assignment.resolutionDueAt;
    delete assignment.resolutionDueToken;
    delete assignment.resolutionDispatchToken;
  }
  migrateToBuilding(state);
  repairProjectionCaches(state);
  provisionWorkforce(state);
  reconcileWorkforceDuty(state);
  reconcileResponderLocations(state);
  initializeFaults(state, { recover: true });
  migrateInvestigationRecords(state);
  recoverInvestigations(state);
  validateLiveState(state);
  return state;
}
