import { registerSimulatedInvestigation } from './investigation-service.mjs';
import { ensureIssueFault } from './fault-truth.mjs';
import { readFileSync } from "node:fs";
import { ISSUE_CLASSES, assertNoResponderSkill } from "./live-schema.mjs";
import { analyticHistory, recentHistoryEvents } from "./history-retention.mjs";
import { callChatCompletion, defaultReasoningEffortFor, readProviderApiKey, roleDefaults, safeModelMetadata } from "./model-provider.mjs";

export const EVENT_PLANNER_SCHEMA_VERSION = "1.0";
const ACTIVE_ISSUE_STATUSES = new Set(["PENDING", "RECOMMENDATION_READY", "OFFER_PENDING", "ASSIGNED"]);
// The shared AMD endpoint took about 8s for one small proposal; this bounds
// a hung connection without discarding a valid-but-slow reply.
const DEFAULT_TIMEOUT_MS = 30_000;
const fixtureUrl = new URL("../../fixtures/event-planner-output.json", import.meta.url);

export const EVENT_PLANNER_SYSTEM_INSTRUCTION = `You propose one plausible next operational issue using only the supplied bounded simulation context.

Return one ISSUE_RAISED event for an eligible equipment item and an allowed issue class.
Generate an industry-neutral manufacturing symptom and a concise response action that could plausibly apply in automotive, semiconductor, electronics assembly, food processing, or another production environment. Use generic concepts such as process drift, material flow, sensing, motion, alignment, inspection, isolation, adjustment, cleaning, restart, and verification. Do not mention a specific industry, product, proprietary machine, hazardous procedure, or regulated process.
Descriptions and response actions are narrative only. Do not invent equipment, alter priority, assign responders, determine the resolution outcome, or include responder performance.
Return only the required structured output.`;

export const EVENT_PLANNER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "eventType", "equipmentId", "issueClass", "description", "responseAction", "contextReason"],
  properties: {
    schemaVersion: { type: "string" },
    eventType: { type: "string", enum: ["ISSUE_RAISED"] },
    equipmentId: { type: "string" },
    issueClass: { type: "string", enum: ISSUE_CLASSES },
    description: { type: "string" },
    responseAction: { type: "string" },
    contextReason: { type: "string" },
  },
};

function activeIssues(state) {
  return state.issues.filter((issue) => ACTIVE_ISSUE_STATUSES.has(issue.status));
}

function eligibleEquipment(state) {
  const occupied = new Set(activeIssues(state).map((issue) => issue.equipmentId));
  return state.equipment.filter((equipment) => equipment.status === "NORMAL" && !occupied.has(equipment.id));
}

export function buildEventPlannerPacket(state) {
  const recentEvents = recentHistoryEvents(state, 12).map((event) => ({
    eventType: event.eventType,
    ...(event.equipmentId ? { equipmentId: event.equipmentId } : {}),
    ...(event.payload?.issueClass ? { issueClass: event.payload.issueClass } : {}),
  }));
  const recurrence = {};
  for (const issue of analyticHistory(state).issues) {
    const key = `${issue.equipmentId}:${issue.issueClass}`;
    recurrence[key] = (recurrence[key] ?? 0) + 1;
  }
  const packet = {
    schemaVersion: EVENT_PLANNER_SCHEMA_VERSION,
    simulationTime: state.simulationState.simulationTime,
    equipment: state.equipment.map((equipment) => ({ equipmentId: equipment.id, status: equipment.status })),
    activeIssues: activeIssues(state).map((issue) => ({
      issueId: issue.id,
      equipmentId: issue.equipmentId,
      issueClass: issue.issueClass,
      status: issue.status,
    })),
    recentEvents,
    recentRecurrenceSummary: recurrence,
    allowedIssueClasses: [...ISSUE_CLASSES],
    constraints: { maxActiveIssues: state.simulationConfig.maxActiveIssues },
  };
  assertNoResponderSkill(packet);
  return packet;
}

function outputShapeErrors(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return ["planner output must be an object"];
  const errors = [];
  const keys = ["schemaVersion", "eventType", "equipmentId", "issueClass", "description", "responseAction", "contextReason"];
  for (const key of keys) if (typeof output[key] !== "string" || output[key].trim() === "") errors.push(`${key} must be a non-empty string`);
  if (typeof output.description === "string" && output.description.length > 180) errors.push("description must not exceed 180 characters");
  if (typeof output.responseAction === "string" && output.responseAction.length > 240) errors.push("responseAction must not exceed 240 characters");
  if (Object.keys(output).some((key) => !keys.includes(key))) errors.push("planner output has unsupported fields");
  return errors;
}

export function validateEventProposal(state, output) {
  const errors = outputShapeErrors(output);
  if (errors.length > 0) return { valid: false, errors };
  if (output.schemaVersion !== EVENT_PLANNER_SCHEMA_VERSION) errors.push("schemaVersion is unsupported");
  if (output.eventType !== "ISSUE_RAISED") errors.push("eventType is unsupported");
  if (!ISSUE_CLASSES.includes(output.issueClass)) errors.push("issueClass is unsupported");
  if (activeIssues(state).length >= state.simulationConfig.maxActiveIssues) errors.push("active issue ceiling reached");
  if (!eligibleEquipment(state).some((equipment) => equipment.id === output.equipmentId)) errors.push("equipment is unknown or ineligible");
  return { valid: errors.length === 0, errors };
}

function nextFallbackRandom(state) {
  const next = (Math.imul(1_664_525, state.simulationState.rngStreams.fallback) + 1_013_904_223) >>> 0;
  state.simulationState.rngStreams.fallback = next;
  return next;
}

function weightedPick(state, choices, weightFor) {
  const weighted = choices.map((choice) => ({ choice, weight: Math.max(1, weightFor(choice)) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = nextFallbackRandom(state) % total;
  for (const entry of weighted) {
    if (cursor < entry.weight) return entry.choice;
    cursor -= entry.weight;
  }
  return weighted.at(-1).choice;
}

export function createFallbackEventProposal(state) {
  state = analyticHistory(state);
  const equipmentChoices = eligibleEquipment(state);
  if (equipmentChoices.length === 0 || activeIssues(state).length >= state.simulationConfig.maxActiveIssues) return null;
  const recurrenceFor = (equipmentId, issueClass = null) => state.issues.filter((issue) => issue.equipmentId === equipmentId && (!issueClass || issue.issueClass === issueClass)).length;
  const equipment = weightedPick(state, equipmentChoices, (item) => 1 + recurrenceFor(item.id));
  const issueClass = weightedPick(state, ISSUE_CLASSES, (candidate) => 1 + recurrenceFor(equipment.id, candidate));
  const recurrent = recurrenceFor(equipment.id, issueClass) > 0;
  const narratives = {
    A: {
      description: recurrent ? "Recurring process-output drift detected" : "Process-output drift detected",
      responseAction: "Inspect operating parameters, correct the deviation, and verify stable output through a controlled check.",
    },
    B: {
      description: recurrent ? "Recurring material-flow interruption detected" : "Material-flow interruption detected",
      responseAction: "Isolate the affected station, inspect and clear the flow path, then verify normal movement before restart.",
    },
    C: {
      description: recurrent ? "Recurring motion or sensing inconsistency detected" : "Motion or sensing inconsistency detected",
      responseAction: "Inspect the mechanism and sensing path, make the required adjustment, and complete a controlled restart verification.",
    },
  };
  return {
    schemaVersion: EVENT_PLANNER_SCHEMA_VERSION,
    eventType: "ISSUE_RAISED",
    equipmentId: equipment.id,
    issueClass,
    ...narratives[issueClass],
    contextReason: recurrent ? "Recent environment history includes a similar issue" : "Current equipment state permits a new issue",
  };
}

async function callLivePlanner(packet, { provider, modelId, apiKey, reasoningEffort, timeoutMs, fetchImpl, onMetadata, usageLedger }) {
  return callChatCompletion({
    role: 'event-planner', usageLedger,
    provider,
    modelId,
    apiKey,
    reasoningEffort,
    timeoutMs,
    fetchImpl,
    onMetadata,
    systemInstruction: EVENT_PLANNER_SYSTEM_INSTRUCTION,
    userContent: JSON.stringify(packet),
    jsonSchemaName: "event_planner_result",
    jsonSchema: EVENT_PLANNER_JSON_SCHEMA,
    errorLabel: "Event planner provider",
  });
}

export async function requestEventProposal(packet, options = {}) {
  const mode = options.mode ?? process.env.COMPASS_EVENT_PLANNER_MODE ?? process.env.COMPASS_DEMO_INFERENCE_MODE ?? "fixture";
  const provider = options.provider ?? "amd";
  const modelId = options.modelId ?? roleDefaults(provider, "event-planner").modelId;
  const reasoningEffort = options.reasoningEffort ?? (provider === "nebius" ? (modelId === roleDefaults(provider, "event-planner").modelId ? roleDefaults(provider, "event-planner").reasoningEffort : "default") : (process.env.AMD_TOKEN_FACTORY_REASONING_EFFORT || defaultReasoningEffortFor(modelId)));
  const modelInfo = { provider, modelId, mode, ...(reasoningEffort ? { reasoningEffort } : {}) };
  if (mode === "force-failure") return { status: "unavailable", reason: "forced-failure", modelInfo };
  try {
    const output = mode === "live"
      ? await callLivePlanner(packet, {
          usageLedger: options.usageLedger,
          provider,
          modelId,
          apiKey: options.apiKey ?? readProviderApiKey(provider),
          onMetadata: metadata => Object.assign(modelInfo, metadata),
          reasoningEffort,
          timeoutMs: options.timeoutMs ?? (Number.parseInt(process.env.COMPASS_EVENT_PLANNER_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS),
          fetchImpl: options.fetchImpl ?? fetch,
        })
      : JSON.parse(readFileSync(fixtureUrl, "utf8"));
    return { status: "ok", output, modelInfo };
  } catch (error) {
    return { status: "unavailable", reason: error.code === "budget-exhausted" ? "budget-exhausted" : error.code === "model-not-configured" ? "model-not-configured" : error.name === "AbortError" ? "timeout" : "provider-error", message: error.message, modelInfo };
  }
}

function nextIssueId(state) {
  const highest = state.issues.reduce((max, issue) => Math.max(max, Number(/^ISS-(\d+)$/.exec(issue.id)?.[1] ?? 0)), state.historyRetention?.highWater?.issues ?? 0);
  return `ISS-${String(highest + 1).padStart(3, "0")}`;
}

function nextOperationalEventId(state) {
  const highest = state.operationalEvents.reduce((max, event) => Math.max(max, Number(/^event-(\d+)$/.exec(event.id)?.[1] ?? 0)), state.historyRetention?.highWater?.operationalEvents ?? 0);
  return `event-${String(highest + 1).padStart(3, "0")}`;
}

function persistProposal(state, proposal, trigger, source) {
  const issueId = nextIssueId(state);
  const timestamp = state.simulationState.simulationTime;
  state.issues.push({
    id: issueId,
    equipmentId: proposal.equipmentId,
    issueClass: proposal.issueClass,
    existingPriority: "UNSPECIFIED",
    status: "PENDING",
    createdAt: timestamp,
    raisedAt: timestamp,
    downtimeStartedAt: timestamp,
    description: proposal.description,
    responseAction: proposal.responseAction,
    contextReason: proposal.contextReason,
    complexity: proposal.issueClass === "C" ? "COMPLEX" : "STANDARD",
  });
  ensureIssueFault(state, state.issues.at(-1));
  registerSimulatedInvestigation(state, state.issues.at(-1));
  state.equipment.find((equipment) => equipment.id === proposal.equipmentId).status = "ISSUE_ACTIVE";
  state.operationalEvents.push({
    id: nextOperationalEventId(state),
    simulationTimestamp: timestamp,
    eventType: "ISSUE_RAISED",
    equipmentId: proposal.equipmentId,
    issueId,
    source,
    payload: { issueClass: proposal.issueClass, description: proposal.description, responseAction: proposal.responseAction, contextReason: proposal.contextReason, dueEventToken: trigger.token },
    createdAtRealTime: new Date().toISOString(),
  });
  return { status: "PERSISTED", source, issueId, proposal };
}

export function createEventPlanningService(store, { requestProposal = requestEventProposal, plannerOptions = {} } = {}) {
  return {
    async handleEventDue(trigger) {
      const snapshot = await store.snapshot();
      if (snapshot.historyRetention?.eventTokens?.includes(trigger.token) || snapshot.operationalEvents.some((event) => event.payload?.dueEventToken === trigger.token)) return { status: "DUPLICATE", token: trigger.token };
      const packet = buildEventPlannerPacket(snapshot);
      const resolvedPlannerOptions = typeof plannerOptions === "function" ? await plannerOptions() : plannerOptions;
      const planned = await requestProposal(packet, resolvedPlannerOptions);
      return store.mutate("event-planner-persist", (state) => {
        if (state.historyRetention?.eventTokens?.includes(trigger.token) || state.operationalEvents.some((event) => event.payload?.dueEventToken === trigger.token)) return { status: "DUPLICATE", token: trigger.token };
        let proposal = planned.status === "ok" ? planned.output : null;
        let source = "EVENT_PLANNER";
        if (!proposal || !validateEventProposal(state, proposal).valid) {
          proposal = createFallbackEventProposal(state);
          source = "DETERMINISTIC_FALLBACK";
        }
        if (!proposal) return { status: "BLOCKED", reason: "NO_ELIGIBLE_EQUIPMENT" };
        const validation = validateEventProposal(state, proposal);
        if (!validation.valid) return { status: "BLOCKED", reason: validation.errors.join("; ") };
        const persisted = persistProposal(state, proposal, trigger, source);
        const event = state.operationalEvents.at(-1);
        if(event && source==='DETERMINISTIC_FALLBACK' && planned.reason==='budget-exhausted'){event.payload.fallbackReason='budget-exhausted';persisted.fallbackReason='budget-exhausted';}
        if (event && planned.modelInfo) event.payload.modelInfo = safeModelMetadata(planned.modelInfo);
        return persisted;
      });
    },
  };
}
