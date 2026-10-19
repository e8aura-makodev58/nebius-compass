import { buildInvestigationAnalytics } from './investigation-analytics.mjs';
import { ISSUE_CLASSES, assertNoResponderSkill } from "./live-schema.mjs";
import { analyticHistory } from "./history-retention.mjs";

const ACTIVE_STATUSES = new Set(["PENDING", "RECOMMENDATION_READY", "OFFER_PENDING", "ASSIGNED"]);

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function weightedMedian(entries) {
  const usable = entries.filter(({ value, weight }) => Number.isFinite(value) && Number.isFinite(weight) && weight > 0).sort((a, b) => a.value - b.value);
  if (!usable.length) return null;
  const midpoint = usable.reduce((sum, entry) => sum + entry.weight, 0) / 2;
  let accumulated = 0;
  return usable.find((entry) => ((accumulated += entry.weight) >= midpoint))?.value ?? null;
}

function minutesBetween(start, end) {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 60_000);
}

function staffingApplied(row) {
  return ['EXTENSION','CALL_IN'].includes(row.action) || ['APPROVED_TOP','APPROVED_ALTERNATIVE','AUTO_APPROVED'].includes(row.outcome);
}

export function rateWithDenominator(numerator, denominator) {
  return {
    numerator,
    denominator,
    rate: denominator >= 3 ? numerator / denominator : null,
    status: denominator >= 3 ? "AVAILABLE" : "INSUFFICIENT_DATA",
  };
}

function simulationStart(state) {
  const timestamps = state.operationalEvents.filter((event) => event.eventType === "SIMULATION_STARTED").map((event) => event.simulationTimestamp).sort();
  return timestamps[0] ?? state.simulationState.simulationTime;
}

function equipmentAnalytics(state, snapshotTime) {
  const worldStart = simulationStart(state);
  const totalMinutes = Math.max(0, minutesBetween(worldStart, snapshotTime));
  return state.equipment.map((equipment) => {
    const issues = state.issues.filter((issue) => issue.equipmentId === equipment.id);
    const completedDowntimes = issues.filter((issue) => issue.status === "RESOLVED" && issue.resolvedAt).map((issue) => minutesBetween(issue.downtimeStartedAt ?? issue.raisedAt, issue.resolvedAt));
    const openIssue = issues.find((issue) => ACTIVE_STATUSES.has(issue.status));
    const currentOngoingDowntimeMinutes = openIssue ? minutesBetween(openIssue.downtimeStartedAt ?? openIssue.raisedAt, snapshotTime) : null;
    const downtimeMinutes = completedDowntimes.reduce((sum, value) => sum + value, 0) + (currentOngoingDowntimeMinutes ?? 0);
    return {
      equipmentId: equipment.id,
      displayName: equipment.name,
      currentStatus: equipment.status,
      issueCount: issues.length,
      uptimePercent: totalMinutes === 0 ? 1 : Math.max(0, totalMinutes - downtimeMinutes) / totalMinutes,
      uptimeDenominatorMinutes: totalMinutes,
      completedDowntimeMedianMinutes: median(completedDowntimes),
      completedDowntimeCount: completedDowntimes.length,
      currentOngoingDowntimeMinutes,
    };
  });
}

function issueAnalytics(state) {
  const runtimeAttempts = state.resolutionHistory.filter((record) => record.issueId);
  const reopenCount = runtimeAttempts.filter((record) => record.reopened).length;
  return {
    total: state.issues.length,
    byClass: Object.fromEntries(ISSUE_CLASSES.map((issueClass) => [issueClass, state.issues.filter((issue) => issue.issueClass === issueClass).length])),
    byEquipment: Object.fromEntries(state.equipment.map((equipment) => [equipment.id, state.issues.filter((issue) => issue.equipmentId === equipment.id).length])),
    active: state.issues.filter((issue) => ACTIVE_STATUSES.has(issue.status)).length,
    resolved: state.issues.filter((issue) => issue.status === "RESOLVED").length,
    reopenRate: rateWithDenominator(reopenCount, runtimeAttempts.length),
  };
}

function responderAnalytics(state) {
  return [...state.responders].sort((a, b) => a.name.localeCompare(b.name)).map((responder) => {
    const records = state.resolutionHistory.flatMap((record) => {
      const participant = record.participants?.find((row) => row.responderId === responder.id);
      if (participant) return [{ ...record, weight: participant.contributionShare }];
      return record.responderId === responder.id ? [{ ...record, weight: 1 }] : [];
    });
    const evidenceWeight = records.reduce((sum, record) => sum + record.weight, 0);
    const successes = records.reduce((sum, record) => sum + (record.success ? record.weight : 0), 0);
    const reopens = records.reduce((sum, record) => sum + (record.reopened ? record.weight : 0), 0);
    return {
      responderId: responder.id,
      displayName: responder.name,
      issuesAttended: records.length,
      soloIssuesAttended: records.filter((record) => !record.assisted).length,
      assistedIssuesAttended: records.filter((record) => record.assisted).length,
      effectiveEvidenceWeight: evidenceWeight,
      successfulResolutions: successes,
      successRate: rateWithDenominator(successes, evidenceWeight),
      medianResolutionMinutes: weightedMedian(records.map((record) => ({ value: record.resolutionMinutes, weight: record.weight }))),
      reopenRate: rateWithDenominator(reopens, evidenceWeight),
      currentStatus: responder.availability,
      currentAssignment: responder.currentIssueId ?? null,
    };
  });
}

function experienceMatrix(state) {
  return [...state.responders].sort((a, b) => a.name.localeCompare(b.name)).map((responder) => ({
    responderId: responder.id,
    displayName: responder.name,
    classes: Object.fromEntries(ISSUE_CLASSES.map((issueClass) => {
      const records = state.resolutionHistory.filter((record) => record.issueClass === issueClass && (record.responderId === responder.id || record.participants?.some((row) => row.responderId === responder.id)));
      const effectiveEvidenceWeight = records.reduce((sum, record) => sum + (record.participants?.find((row) => row.responderId === responder.id)?.contributionShare ?? 1), 0);
      return [issueClass, { cases: records.length, effectiveEvidenceWeight, soloCases: records.filter((record) => !record.assisted).length, assistedCases: records.filter((record) => record.assisted).length, medianResolutionMinutes: weightedMedian(records.map((record) => ({ value: record.resolutionMinutes, weight: record.participants?.find((row) => row.responderId === responder.id)?.contributionShare ?? 1 }))) }];
    })),
  }));
}

function compassAnalytics(state) {
  const completed = state.recommendations.filter((recommendation) => recommendation.agentResult && recommendation.disagreement);
  const nearest = completed.filter((recommendation) => recommendation.disagreement.nearestAgreement).length;
  const naive = completed.filter((recommendation) => recommendation.disagreement.naiveAgreement).length;
  const differsNaive = completed.length - naive;
  const differsBoth = completed.filter((recommendation) => !recommendation.disagreement.nearestAgreement && !recommendation.disagreement.naiveAgreement).length;
  const evidence = completed.filter((recommendation) => recommendation.disagreement.evidenceStrengthDriven).length;
  return {
    totalRecommendations: completed.length,
    agreementWithNearest: rateWithDenominator(nearest, completed.length),
    agreementWithNaive: rateWithDenominator(naive, completed.length),
    disagreementWithNaive: rateWithDenominator(differsNaive, completed.length),
    disagreementWithBoth: rateWithDenominator(differsBoth, completed.length),
    evidenceStrengthDrivenDisagreements: { count: evidence, disagreementDenominator: differsNaive, rate: differsNaive >= 3 ? evidence / differsNaive : null, status: differsNaive >= 3 ? "AVAILABLE" : "INSUFFICIENT_DATA" },
  };
}

const ROLLING_WINDOW_MINUTES = 24 * 60;
const BIN_MINUTES = 15;
export const MAX_PERIODS_BY_LEVEL = { HOUR: 12, DAY: 7, WEEK: 4, MONTH: 3 };

// Analytics periods are UTC operational periods, deliberately independent of
// the browser's locale. Hours use UTC clock boundaries; days start at 08:00,
// weeks on Monday 08:00, and months on the first day at 08:00. Every interval
// is [start,end).
export function periodBounds(timestamp, level) {
  const date = new Date(timestamp);
  const ms = date.getTime();
  if (level === "HOUR") {
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
    return { start, end: start + 60 * 60 * 1000 };
  }
  if (level === "DAY") {
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (date.getUTCHours() < 8 ? 1 : 0), 8);
    return { start, end: start + 24 * 60 * 60 * 1000 };
  }
  if (level === "WEEK") {
    const shifted = new Date(ms - 8 * 60 * 60 * 1000);
    const mondayOffset = (shifted.getUTCDay() + 6) % 7;
    const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - mondayOffset, 8);
    return { start, end: start + 7 * 24 * 60 * 60 * 1000 };
  }
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - (date.getUTCHours() < 8 ? 1 : 0), 1, 8);
  const next = new Date(start); next.setUTCMonth(next.getUTCMonth() + 1);
  return { start, end: next.getTime() };
}

export function priorPeriod(bounds, level) {
  if (level === "MONTH") return periodBounds(new Date(bounds.start - 1).toISOString(), level);
  const span = level === "WEEK" ? 7 * 86400000 : level === "DAY" ? 86400000 : 60 * 60 * 1000;
  return { start: bounds.start - span, end: bounds.start };
}

function unionDowntime(state, start, end, snapshotMs) {
  const byEquipment = new Map();
  for (const issue of state.issues) {
    const left = Math.max(start, Date.parse(issue.downtimeStartedAt ?? issue.raisedAt));
    const right = Math.min(end, snapshotMs, Date.parse(issue.resolvedAt ?? new Date(snapshotMs).toISOString()));
    if (Number.isFinite(left) && right > left) (byEquipment.get(issue.equipmentId) ?? byEquipment.set(issue.equipmentId, []).get(issue.equipmentId)).push([left, right]);
  }
  let total = 0;
  for (const intervals of byEquipment.values()) {
    intervals.sort((a, b) => a[0] - b[0]); let endSeen = -Infinity;
    for (const [left, right] of intervals) { if (right > endSeen) { total += Math.max(0, right - Math.max(left, endSeen)) / 60000; endSeen = Math.max(endSeen, right); } }
  }
  return total;
}

export function observedHistoryStart(state, snapshotMs) {
  const timestamps = state.operationalEvents.map((event) => Date.parse(event.simulationTimestamp)).filter(Number.isFinite);
  return timestamps.length ? Math.min(...timestamps) : snapshotMs;
}

function fixMetrics(state, bounds = null, snapshotMs = Date.parse(state.simulationState.simulationTime)) {
  const first = state.resolutionHistory.filter((r) => r.fixApplied?.id && !r.legacyFix && r.fixAttemptNumber === 1 && (!bounds || (Date.parse(r.resolvedAt) >= bounds.start && Date.parse(r.resolvedAt) < Math.min(bounds.end, snapshotMs))));
  const recommendations = state.issues.map((r) => r.fixRecommendation).filter((r) => r?.modelAttempted && ['READY', 'FALLBACK'].includes(r.status) && (!bounds || (Date.parse(r.createdAt) >= bounds.start && Date.parse(r.createdAt) < Math.min(bounds.end, snapshotMs))));
  return { firstTimeFixRate: rateWithDenominator(first.filter((r) => r.success).length, first.length),
    recommendedVsBaselineAgreement: rateWithDenominator(recommendations.filter((r) => !r.disagreement).length, recommendations.length),
    modelRecommendations: recommendations.filter((r) => r.source === 'AMD_MODEL').length,
    deterministicRecommendations: recommendations.filter((r) => r.source === 'DETERMINISTIC').length,
    definition: 'Successful first completed fix attempts / all completed first fix attempts; legacy actions excluded. Agreement compares proposed first fixes, not causal outcome improvements.' };
}

function periodSummary(state, level, bounds, snapshotMs, historyStartMs = observedHistoryStart(state, snapshotMs)) {
  const startIso = new Date(bounds.start).toISOString(), endIso = new Date(bounds.end).toISOString();
  const eventCount = (type) => state.operationalEvents.filter((event) => event.eventType === type && Date.parse(event.simulationTimestamp) >= bounds.start && Date.parse(event.simulationTimestamp) < Math.min(bounds.end, snapshotMs)).length;
  const activeAt = (at) => state.issues.filter((issue) => Date.parse(issue.raisedAt) <= at && Date.parse(issue.resolvedAt ?? new Date(snapshotMs + 1).toISOString()) > at).length;
  const staffingActions = (state.workforceContinuity?.staffingAudit ?? []).filter((entry) => Date.parse(entry.simulationTimestamp) >= bounds.start && Date.parse(entry.simulationTimestamp) < Math.min(bounds.end, snapshotMs) && staffingApplied(entry)).length;
  const status = bounds.start < historyStartMs ? "INSUFFICIENT_HISTORY" : bounds.end > snapshotMs ? "PARTIAL" : "COMPLETE";
  return { level, start: startIso, end: endIso, status, investigations: buildInvestigationAnalytics(state,bounds,snapshotMs), staffingRecommendations: staffingAnalytics(state, bounds, snapshotMs), fixes: fixMetrics(state, bounds, snapshotMs), raised: eventCount("ISSUE_RAISED"), resolved: eventCount("ISSUE_RESOLVED"), reopened: eventCount("ISSUE_REOPENED"), backlogStart: activeAt(bounds.start), backlogEnd: activeAt(Math.min(bounds.end, snapshotMs)), downtimeMinutes: unionDowntime(state, bounds.start, bounds.end, snapshotMs), staffingActions };
}

export function buildPeriodAnalytics(state, { level = "DAY" } = {}) {
  state = analyticHistory(state);
  if (!new Set(["HOUR", "DAY", "WEEK", "MONTH"]).has(level)) throw Object.assign(new Error("Invalid analytics period level"), { statusCode: 400 });
  const snapshotMs = Date.parse(state.simulationState.simulationTime);
  const historyStartMs = observedHistoryStart(state, snapshotMs);
  let bounds = periodBounds(state.simulationState.simulationTime, level);
  const maxPeriods = MAX_PERIODS_BY_LEVEL[level];
  const periods = []; for (let index = 0; index < maxPeriods; index += 1) { periods.unshift(periodSummary(state, level, bounds, snapshotMs, historyStartMs)); bounds = priorPeriod(bounds, level); }
  const available = periods.filter((period) => period.status === "COMPLETE").length;
  return { level, snapshotSimulationTime: state.simulationState.simulationTime, periodDefinition: level === "HOUR" ? "UTC clock hour, [start,end)" : level === "DAY" ? "UTC operational day 08:00–08:00, [start,end)" : level === "WEEK" ? "UTC week Monday 08:00–Monday 08:00, [start,end)" : "UTC month first day 08:00–first day 08:00, [start,end)", periods, availability: available ? "AVAILABLE" : "INSUFFICIENT_HISTORY", maxPeriods };
}

function floorToBin(timestamp) {
  const date = new Date(timestamp);
  date.setUTCMinutes(Math.floor(date.getUTCMinutes() / BIN_MINUTES) * BIN_MINUTES, 0, 0);
  return date.toISOString();
}

/**
 * A bounded, persisted-event projection for charts.  It intentionally never
 * uses simulation truth or model reasoning: counts come from the operational
 * log and downtime is the observed issue interval intersected with each bin.
 */
function operationalTimeline(state, snapshotTime) {
  const snapshotMs = Date.parse(snapshotTime);
  const windowStartMs = snapshotMs - ROLLING_WINDOW_MINUTES * 60_000;
  const binLengthMs = BIN_MINUTES * 60_000;
  // Align bins to wall-clock quarter hours, while retaining every instant in
  // the requested range. A non-aligned snapshot therefore has a short final
  // bin; it must end at the snapshot, never at the next quarter hour.
  const firstBinMs = Date.parse(floorToBin(new Date(windowStartMs).toISOString()));
  const bins = [];
  for (let rawStartMs = firstBinMs; rawStartMs < snapshotMs; rawStartMs += binLengthMs) {
    const rawEndMs = rawStartMs + binLengthMs;
    const startMs = Math.max(rawStartMs, windowStartMs);
    const endMs = Math.min(rawEndMs, snapshotMs);
    if (endMs > startMs) bins.push({ start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), raised: 0, resolved: 0, reopened: 0, downtimeMinutes: 0 });
  }
  const binBounds = bins.map((bin) => ({ bin, start: Date.parse(bin.start), end: Date.parse(bin.end) }));
  const eventToMetric = { ISSUE_RAISED: "raised", ISSUE_RESOLVED: "resolved", ISSUE_REOPENED: "reopened" };
  for (const event of state.operationalEvents) {
    const metric = eventToMetric[event.eventType];
    const eventMs = Date.parse(event.simulationTimestamp);
    if (!metric || !Number.isFinite(eventMs) || eventMs < windowStartMs || eventMs > snapshotMs) continue;
    const entry = binBounds.find((entry, index) => eventMs >= entry.start && (eventMs < entry.end || (index === binBounds.length - 1 && eventMs === entry.end)));
    if (entry) entry.bin[metric] += 1;
  }
  for (const issue of state.issues) {
    const start = Date.parse(issue.downtimeStartedAt ?? issue.raisedAt);
    const end = Math.min(Date.parse(issue.resolvedAt ?? snapshotTime), snapshotMs);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (const bounds of binBounds) bounds.bin.downtimeMinutes += Math.max(0, (Math.min(end, bounds.end) - Math.max(start, bounds.start)) / 60_000);
  }
  return {
    window: { kind: "ROLLING", durationMinutes: ROLLING_WINDOW_MINUTES, binMinutes: BIN_MINUTES, maxBins: bins.length, start: new Date(windowStartMs).toISOString(), end: snapshotTime, partial: windowStartMs < Date.parse(simulationStart(state)), finalBinPartial: Date.parse(bins.at(-1)?.end ?? snapshotTime) - Date.parse(bins.at(-1)?.start ?? snapshotTime) < binLengthMs },
    bins,
  };
}

function compassRecords(state) {
  return state.recommendations.filter((recommendation) => recommendation.agentResult && recommendation.disagreement).map((recommendation) => ({
    recommendationId: recommendation.id,
    issueId: recommendation.issueId,
    simulationTimestamp: recommendation.createdAt ?? recommendation.updatedAt ?? null,
    nearestAgreement: recommendation.disagreement.nearestAgreement,
    naiveAgreement: recommendation.disagreement.naiveAgreement,
    evidenceStrengthDriven: recommendation.disagreement.evidenceStrengthDriven,
  }));
}

function staffingAnalytics(state, bounds = null, snapshotMs = null) {
  const audit = (state.workforceContinuity?.staffingAudit ?? []).filter((row) => !bounds || (Date.parse(row.simulationTimestamp) >= bounds.start && Date.parse(row.simulationTimestamp) < Math.min(bounds.end, snapshotMs)));
  const decisions = audit.filter((row) => row.action === 'STAFFING_DECISION');
  const compared = decisions.filter((r) => r.baselineOptionId && r.topOptionId);
  return { totalDecisions: decisions.length,
    outcomes: Object.fromEntries(['APPROVED_TOP','APPROVED_ALTERNATIVE','REJECTED','EXPIRED','AUTO_APPROVED','STALE','SUPERSEDED'].map((status)=>[status,rateWithDenominator(decisions.filter((r)=>r.outcome===status).length,decisions.length)])),
    baselineAgreement: rateWithDenominator(compared.filter((r)=>!r.disagreement).length,compared.length),
    unmetRiskCount: audit.filter((r)=>r.action==='UNMET_STAFFING_RISK').length };
}
function workforceAnalytics(state) {
  const active = state.issues.filter((issue) => ACTIVE_STATUSES.has(issue.status));
  const bands = ["CRITICAL", "HIGH", "STANDARD", "DEFERRED"];
  const continuity = state.workforceContinuity ?? {};
  return {
    activeBacklogByPriority: Object.fromEntries(bands.map((band) => [band, active.filter((issue) => issue.priorityBand === band || (band === "STANDARD" && !issue.priorityBand)).length])),
    actionableIssueCap: continuity.maxActionableIssues ?? state.simulationConfig.maxActiveIssues,
    deferredDemandCount: continuity.deferredDemand?.length ?? 0,
    recommendations: staffingAnalytics(state),
    staffingActions: rateWithDenominator((continuity.staffingAudit ?? []).filter(staffingApplied).length, (continuity.staffingAudit ?? []).filter((entry)=>entry.token).length),
    handoverCount: continuity.handovers?.length ?? 0,
  };
}

export function buildAnalytics(state) {
  state = analyticHistory(state);
  const snapshotTime = state.simulationState.simulationTime;
  const analytics = {
    schemaVersion: "1.0",
    snapshotSimulationTime: snapshotTime,
    equipment: equipmentAnalytics(state, snapshotTime),
    issues: issueAnalytics(state),
    responders: responderAnalytics(state),
    issueClassExperience: experienceMatrix(state),
    compassVsBaselines: compassAnalytics(state),
    operationalTimeline: operationalTimeline(state, snapshotTime),
    compassRecords: compassRecords(state),
    workforce: workforceAnalytics(state),
    fixes: fixMetrics(state),
    investigations: buildInvestigationAnalytics(state),
    periodAnalytics: buildPeriodAnalytics(state, { level: "DAY" }),
  };
  assertNoResponderSkill(analytics);
  return analytics;
}
