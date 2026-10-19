/** Deterministic retention planning. No I/O, wall clock, RNG or model inputs. */
export const HISTORY_COLLECTIONS = ["issues", "recommendations", "operationalEvents", "dispatchOffers", "resolutionAttempts", "assignments"];
const prefixes = { issues: "ISS", recommendations: "live-rec", operationalEvents: "event", dispatchOffers: "offer", resolutionAttempts: "attempt", assignments: "assignment" };
const lifecycle = new Set(["ISSUE_RAISED", "ISSUE_RESOLVED", "ISSUE_REOPENED", "SIMULATION_STARTED"]);
const expanded = Symbol("analytic history expanded");

export function retentionDays(value = process.env.COMPASS_HISTORY_RETENTION_DAYS ?? 7) {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0) throw new Error("COMPASS_HISTORY_RETENTION_DAYS must be a non-negative number (zero disables archiving)");
  return days;
}

export function retainedFloor(state, collection) { return state.historyRetention?.highWater?.[collection] ?? 0; }
export function originalLength(state, collection) { return state[collection].length + (state.historyRetention?.removed?.[collection] ?? 0); }

function metadata(epoch = 0) {
  return { version: 1, epoch, lastDay: null, highWater: {}, removed: {}, archives: {}, eventTokens: [], order: { issues: {}, recommendations: {} },
    facts: { issues: [], events: [], recommendations: [], earliestEventAt: null } };
}
export function resetRetention(state, epoch) { state.historyRetention = metadata(epoch); }

export function recentHistoryEvents(state, limit = 100) {
  const tail = state.historyRetention?.eventTail;
  return tail ? [...tail.events, ...state.operationalEvents.slice(tail.liveStart)].slice(-limit) : state.operationalEvents.slice(-limit);
}

export function compactHistory(state, days = retentionDays(), { force = false } = {}) {
  if (!days) return [];
  const day = state.simulationState.simulationTime.slice(0, 10);
  if (!force && state.historyRetention?.lastDay === day) return [];
  const retention = state.historyRetention ??= metadata();
  retention.lastDay = day;
  for (const collection of HISTORY_COLLECTIONS) {
    const pattern = new RegExp(`^${prefixes[collection]}-(\\d+)$`);
    retention.highWater[collection] = state[collection].reduce((max, row) => Math.max(max, Number(pattern.exec(row.id)?.[1] ?? 0)), retention.highWater[collection] ?? 0);
  }
  for (const collection of ["issues", "recommendations"]) {
    const order = retention.order[collection];
    let next = Object.keys(order).length;
    for (const row of state[collection]) if (!Object.hasOwn(order, row.id)) order[row.id] = next++;
  }
  const cutoff = Date.parse(state.simulationState.simulationTime) - days * 86_400_000;
  const protectedIds = new Set([
    ...state.resolutionAttempts.filter((row) => row.status === "ACTIVE" || row.resolutionDueToken || row.resolutionDispatchToken || row.reviewDueToken || row.reviewDispatchToken).map((row) => row.issueId),
    ...state.assignments.filter((row) => row.status === "ACTIVE").map((row) => row.issueId),
    ...(state.dispatchOffers ?? []).filter((row) => row.status === "PENDING" || row.responseDueToken || row.responseDispatchToken).map((row) => row.issueId),
    ...state.recommendations.filter((row) => row.status === "PENDING_MODEL").map((row) => row.issueId),
    ...state.issues.filter((row) => row.fixRecommendation?.status === "PENDING_MODEL").map((row) => row.id),
    ...(state.workforceContinuity?.temporaryRepairs ?? []).filter((row) => ["SCHEDULED", "CLAIMED"].includes(row.status)).map((row) => row.issueId),
  ]);
  const selected = state.issues.filter((issue) => issue.status === "RESOLVED" && Date.parse(issue.resolvedAt) < cutoff && !protectedIds.has(issue.id));
  if (!selected.length) return [];
  const ids = new Set(selected.map((issue) => issue.id));
  const eventTail = recentHistoryEvents(state);
  const bundles = new Map(selected.map((issue) => [issue.id, {
    issue, recommendations: [], operationalEvents: [], dispatchOffers: [], resolutionAttempts: [], assignments: [], resolutionHistory: [],
  }]));
  for (const collection of [...HISTORY_COLLECTIONS.filter((key) => key !== "issues"), "resolutionHistory"]) {
    for (const row of state[collection] ?? []) if (ids.has(row.issueId)) bundles.get(row.issueId)[collection].push(row);
  }
  for (const event of state.operationalEvents) {
    if (!retention.facts.earliestEventAt || event.simulationTimestamp < retention.facts.earliestEventAt) retention.facts.earliestEventAt = event.simulationTimestamp;
  }
  for (const issue of selected) {
    const { id, equipmentId, issueClass, raisedAt, resolvedAt, downtimeStartedAt } = issue;
    retention.facts.issues.push({ id, equipmentId, issueClass, status: "RESOLVED", raisedAt, resolvedAt,
      description: issue.description, responseAction: issue.responseAction,
      reportNarrative: issue.reportNarrative, narrativeSource: issue.narrativeSource,
      ...(issue.symptom ? { symptom: issue.symptom } : {}),
      ...(issue.fixRecommendation ? { fixRecommendation: { source: issue.fixRecommendation.source, status: issue.fixRecommendation.status,
        baselineFixId: issue.fixRecommendation.baselineFixId, disagreement: issue.fixRecommendation.disagreement,
        modelAttempted: issue.fixRecommendation.modelAttempted ?? false, createdAt: issue.fixRecommendation.createdAt,
        recommendedFixId: issue.fixRecommendation.rankedFixes[0].fixId } } : {}),
      ...(downtimeStartedAt ? { downtimeStartedAt } : {}) });
    retention.archives[id] = resolvedAt.slice(0, 10);
  }
  for (const row of state.recommendations) if (ids.has(row.issueId) && row.agentResult && row.disagreement) {
    retention.facts.recommendations.push({ id: row.id, issueId: row.issueId, createdAt: row.createdAt ?? row.updatedAt ?? null, agentResult: true, disagreement: row.disagreement });
  }
  for (const row of state.operationalEvents) if (ids.has(row.issueId) && lifecycle.has(row.eventType)) {
    retention.facts.events.push({ eventType: row.eventType, simulationTimestamp: row.simulationTimestamp });
  }
  const tokens = new Set(retention.eventTokens);
  for (const row of state.operationalEvents) if (ids.has(row.issueId) && row.payload?.dueEventToken) tokens.add(row.payload.dueEventToken);
  retention.eventTokens = [...tokens];
  for (const collection of HISTORY_COLLECTIONS) {
    const before = state[collection];
    state[collection] = before.filter((row) => !ids.has(collection === "issues" ? row.id : row.issueId));
    retention.removed[collection] = (retention.removed[collection] ?? 0) + before.length - state[collection].length;
  }
  retention.eventTail = { events: eventTail, liveStart: state.operationalEvents.length };
  return [...bundles.values()];
}

/** Facts keep original reduction order, including floating-point sums. */
export function analyticHistory(state) {
  if (state[expanded]) return state;
  const retention = state.historyRetention;
  if (!retention?.facts.issues.length) return state;
  const ordered = (collection, rows) => rows.sort((a, b) => (retention.order[collection][a.id] ?? Infinity) - (retention.order[collection][b.id] ?? Infinity));
  return { ...state, [expanded]: true,
    issues: ordered("issues", [...retention.facts.issues, ...state.issues]),
    recommendations: ordered("recommendations", [...retention.facts.recommendations, ...state.recommendations]),
    operationalEvents: [...retention.facts.events, ...state.operationalEvents,
      ...(retention.facts.earliestEventAt ? [{ eventType: "HISTORY_COVERAGE", simulationTimestamp: retention.facts.earliestEventAt }] : [])],
  };
}
