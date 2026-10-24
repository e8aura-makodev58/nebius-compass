import { createSeedCalibrations } from './calibrations.mjs';
import { initializeFaults } from '../src/fault-truth.mjs';
import { createInitialDemoState } from "../src/demo-state.mjs";
import { BASELINE_CONFIG, LIVE_SCHEMA_VERSION } from "../src/live-schema.mjs";
import { createWorkforceConfig, provisionWorkforce } from "../src/workforce-continuity.mjs";

const skillRows = [
  ["R-ENGR104", "A", 12, 0.84], ["R-ENGR104", "B", 16, 0.79], ["R-ENGR104", "C", 19, 0.76],
  ["R-ENGR028", "A", 10, 0.9], ["R-ENGR028", "B", 10, 0.91], ["R-ENGR028", "C", 16, 0.87],
  ["R-TECH216", "A", 14, 0.73], ["R-TECH216", "B", 13, 0.72], ["R-TECH216", "C", 20, 0.7],
  ["R-OPER088", "A", 15, 0.78], ["R-OPER088", "B", 15, 0.8], ["R-OPER088", "C", 18, 0.77],
  ["R-TECH073", "A", 17, 0.74], ["R-TECH073", "B", 18, 0.71], ["R-TECH073", "C", 21, 0.7],
  ["R-OPER142", "A", 13, 0.82], ["R-OPER142", "B", 14, 0.81], ["R-OPER142", "C", 17, 0.8],
];

/** Fixed synthetic seed. Its hidden skills are for resolution simulation only. */
export function createLiveSeed() {
  const base = createInitialDemoState();
  const simulationStart = "2026-09-01T08:00:00.000Z";
  const issues = base.issues.map((issue) => ({
    ...issue,
    description: issue.id === "ISS-103" ? "Process-output drift detected" : "Material-flow interruption detected",
    responseAction: issue.id === "ISS-103"
      ? "Inspect operating parameters, correct the deviation, and verify stable output through a controlled check."
      : "Isolate the affected station, inspect and clear the flow path, then verify normal movement before restart.",
    raisedAt: issue.id === "ISS-103" ? "2026-09-01T07:45:00.000Z" : "2026-09-01T07:50:00.000Z",
    createdAt: issue.id === "ISS-103" ? "2026-09-01T07:45:00.000Z" : "2026-09-01T07:50:00.000Z",
    downtimeStartedAt: issue.id === "ISS-103" ? "2026-09-01T07:45:00.000Z" : "2026-09-01T07:50:00.000Z",
  }));
  const unresolvedEquipmentIds = new Set(issues.filter((issue) => issue.status !== "RESOLVED").map((issue) => issue.equipmentId));
  const equipment = base.equipment.map((item) => ({
    ...item,
    status: unresolvedEquipmentIds.has(item.id) ? "ISSUE_ACTIVE" : "NORMAL",
  }));
  return initializeFaults(provisionWorkforce({
    calibrations: createSeedCalibrations(),
    schemaVersion: LIVE_SCHEMA_VERSION,
    revision: 0,
    consumableObligations: [],
    simulationState: {
      id: "simulation-state",
      simulationTime: simulationStart,
      status: "PAUSED",
      speedMultiplier: 1,
      nextEventAt: "2026-09-01T08:15:00.000Z",
      dueEventToken: "due-1",
      rngVersion: "lcg32-v1",
      rngStreams: { scheduler: 1729, fallback: 2718, resolution: 3141, dispatch: 5772, attempt: 9973, durability: 6113, investigation: 0x19a63 },
    },
    simulationConfig: { maxActiveIssues: 10, baselineConfig: structuredClone(BASELINE_CONFIG) },
    workforceContinuity: createWorkforceConfig(424242),
    equipment,
    responders: base.responders,
    responderSkills: skillRows.map(([responderId, issueClass, trueMedianMinutes, trueSuccessProbability]) => ({
      id: `skill-${responderId}-${issueClass}`,
      responderId,
      issueClass,
      trueMedianMinutes,
      trueSuccessProbability,
    })),
    issues: issues.map((issue) => ({ ...issue, complexity: issue.id === "ISS-104" ? "COMPLEX" : "STANDARD" })),
    assignments: [{
      id: "assignment-ISS-103-R-OPER142",
      issueId: "ISS-103",
      responderId: "R-OPER142",
      createdAt: "2026-09-01T07:46:00.000Z",
      status: "ACTIVE",
      attemptId: "attempt-001",
      role: "PRIMARY",
      joinedAt: "2026-09-01T07:46:00.000Z",
      endedAt: null,
      endReason: null,
      roleHistory: [{ role: "PRIMARY", startedAt: "2026-09-01T07:46:00.000Z", endedAt: null }],
    }],
    resolutionAttempts: [{
      id: "attempt-001",
      issueId: "ISS-103",
      modelVersion: "team-resolution-v1",
      status: "ACTIVE",
      startedAt: "2026-09-01T07:46:00.000Z",
      completedAt: null,
      durationFactor: 1,
      successDraw: 0.5,
      workTotal: 1,
      completedWork: 0,
      participantWork: {},
      rosterVersion: 1,
      scheduleGeneration: 1,
      resolutionDueAt: "2026-09-01T08:02:00.000Z",
      resolutionDueToken: "resolution-1",
      resolutionDispatchToken: null,
      resolutionDispatchForced: false,
      reviewDueAt: null,
      reviewDueToken: null,
      reviewDispatchToken: null,
      initialPlannedCompletionAt: "2026-09-01T08:02:00.000Z",
      assistance: { status: "NONE", generation: 0, trigger: null, cooldownUntil: null },
      segments: [{ id: "attempt-001-segment-1", startedAt: "2026-09-01T07:46:00.000Z", endedAt: null, roster: [{ responderId: "R-OPER142", role: "PRIMARY", effectiveRate: 0.0625 }], teamRate: 0.0625, successProbability: 0.82, workCompleted: 0 }],
    }],
    dispatchOffers: [],
    resolutionHistory: base.resolutionHistory.map((record) => ({ ...record, attemptId: `legacy-${record.id}`, assisted: false, participants: [{ responderId: record.responderId, roleIntervals: [{ role: "PRIMARY", joinedAt: null, endedAt: record.resolvedAt ?? null }], participationMinutes: record.resolutionMinutes, contributionShare: 1 }] })),
    recommendations: [],
    investigationPolicy: {investigationApproval:'OPERATOR',investigationDeadlineMinutes:30,investigationShare:0.2,revision:0},
    fieldReports: [],
    investigations: [],
    operationalEvents: [
      { id: "event-001", simulationTimestamp: "2026-09-01T07:40:00.000Z", eventType: "SIMULATION_STARTED", source: "SEED", payload: {}, createdAtRealTime: simulationStart },
      { id: "event-002", simulationTimestamp: "2026-09-01T07:45:00.000Z", eventType: "ISSUE_RAISED", equipmentId: "EQ-03", issueId: "ISS-103", source: "SEED", payload: { issueClass: "A", description: "Process-output drift detected", responseAction: "Inspect operating parameters, correct the deviation, and verify stable output through a controlled check." }, createdAtRealTime: simulationStart },
      { id: "event-003", simulationTimestamp: "2026-09-01T07:46:00.000Z", eventType: "RESPONDER_ASSIGNED", equipmentId: "EQ-03", issueId: "ISS-103", responderId: "R-OPER142", source: "SEED", payload: {}, createdAtRealTime: simulationStart },
      { id: "event-004", simulationTimestamp: "2026-09-01T07:50:00.000Z", eventType: "ISSUE_RAISED", equipmentId: "EQ-04", issueId: "ISS-104", source: "SEED", payload: { issueClass: "B", description: "Material-flow interruption detected", responseAction: "Isolate the affected station, inspect and clear the flow path, then verify normal movement before restart." }, createdAtRealTime: simulationStart },
    ],
  }));
}
