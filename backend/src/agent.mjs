/**
 * Compass agent integration (WP5).
 *
 * Owns the model call boundary only: it sends a bounded candidate packet,
 * validates the structured result against the SOW §23/§24 contract, and
 * never trusts model output as authoritative. It never ranks, scores, or
 * derives evidence itself — that remains context-engine.mjs's job.
 */

import { readFileSync } from "node:fs";
import { SCHEMA_VERSION } from "./context-engine.mjs";
import { callChatCompletion, defaultReasoningEffortFor, readProviderApiKey, roleDefaults } from "./model-provider.mjs";

export const SYSTEM_INSTRUCTION = `You are Compass, a responder recommendation agent.

Rank only the supplied eligible candidates.

Use the supplied evidence to weigh:
- proximity / travel time,
- same-issue resolution performance,
- success and reopen history,
- evidence strength and sample size.

Do not invent facts or candidates.
Do not change issue priority.
Do not treat tiny samples as equally trustworthy evidence.
Prefer stronger evidence when apparently superior performance is based on too little history.
Explain why the top candidate is preferred over meaningful alternatives.

Do not repeat numeric evidence in generated prose.
Refer to evidence qualitatively because the UI renders authoritative numbers.
You may name a supplied candidate by its exact displayName or responderId; those are the only digits allowed in prose.
Every ranked candidate must include a tradeoff that compares it to a different supplied candidate.
Apart from supplied candidate names, write recommendationSummary, every tradeoff explanation, topRecommendation.rationale, and uncertaintyNote using no digits at all: no counts, percentages, minutes, distances, sample sizes, or numerals of any kind. Spell any ordinal as a word.
Do not copy numeric evidence from the packet into prose, even in parentheses or written out as words. Say nearer, longer trip, stronger evidence, or limited history instead. Numeric rank fields and supplied identifiers in structured fields are still required.
Compliant prose example: "Stronger observed evidence supports this candidate, while the nearer alternative offers a shorter trip. Limited history makes the alternative less certain."

Return only the required structured output.`;

export const AGENT_RESULT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "recommendationRequestId", "rankedCandidates", "topRecommendation", "uncertaintyNote"],
  properties: {
    schemaVersion: { type: "string" },
    recommendationRequestId: { type: "string" },
    rankedCandidates: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rank", "responderId", "recommendationSummary", "evidenceReferences", "tradeoff"],
        properties: {
          rank: { type: "integer", minimum: 1 },
          responderId: { type: "string" },
          recommendationSummary: { type: "string" },
          evidenceReferences: { type: "array", items: { type: "string" } },
          tradeoff: {
            type: "object",
            additionalProperties: false,
            required: ["comparedToResponderId", "explanation"],
            properties: {
              comparedToResponderId: { type: "string" },
              explanation: { type: "string" },
            },
          },
        },
      },
    },
    topRecommendation: {
      type: "object",
      additionalProperties: false,
      required: ["responderId", "rationale"],
      properties: {
        responderId: { type: "string" },
        rationale: { type: "string" },
      },
    },
    uncertaintyNote: { type: "string" },
  },
};

// Bounds a hung connection, not normal latency. Measured on AMD Token Factory
// with the Scenario A packet (10 samples, 2026-10-17): 24s to 60s end to end,
// median 42s, including any repair attempt. 90s leaves room for the repair;
// AMD's own ten-minute server timeout is far too long for interactive dispatch.
const DEFAULT_TIMEOUT_MS = 90_000;
const MIN_REPAIR_TIME_MS = 1_000;
const scenarioAFixtureUrl = new URL("../../fixtures/agent-result-scenario-a.json", import.meta.url);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural contract check (SOW §23). Deliberately hand-rolled rather than
 * a JSON-schema library, matching this repo's dependency-free convention.
 */
export function checkAgentResultShape(value) {
  const errors = [];
  if (!isPlainObject(value)) return ["result must be an object"];

  if (typeof value.schemaVersion !== "string") errors.push("schemaVersion must be a string");
  if (typeof value.recommendationRequestId !== "string") errors.push("recommendationRequestId must be a string");
  if (typeof value.uncertaintyNote !== "string") errors.push("uncertaintyNote must be a string");

  if (!Array.isArray(value.rankedCandidates) || value.rankedCandidates.length === 0) {
    errors.push("rankedCandidates must be a non-empty array");
  } else {
    value.rankedCandidates.forEach((candidate, index) => {
      if (!isPlainObject(candidate)) {
        errors.push(`rankedCandidates[${index}] must be an object`);
        return;
      }
      if (!Number.isInteger(candidate.rank) || candidate.rank < 1) {
        errors.push(`rankedCandidates[${index}].rank must be a positive integer`);
      }
      if (typeof candidate.responderId !== "string") {
        errors.push(`rankedCandidates[${index}].responderId must be a string`);
      }
      if (typeof candidate.recommendationSummary !== "string") {
        errors.push(`rankedCandidates[${index}].recommendationSummary must be a string`);
      }
      if (!Array.isArray(candidate.evidenceReferences) || !candidate.evidenceReferences.every((entry) => typeof entry === "string")) {
        errors.push(`rankedCandidates[${index}].evidenceReferences must be an array of strings`);
      }
      if (candidate.tradeoff !== undefined) {
        if (!isPlainObject(candidate.tradeoff)) {
          errors.push(`rankedCandidates[${index}].tradeoff must be an object`);
        } else {
          if (typeof candidate.tradeoff.comparedToResponderId !== "string") {
            errors.push(`rankedCandidates[${index}].tradeoff.comparedToResponderId must be a string`);
          }
          if (typeof candidate.tradeoff.explanation !== "string") {
            errors.push(`rankedCandidates[${index}].tradeoff.explanation must be a string`);
          }
        }
      }
    });
  }

  if (!isPlainObject(value.topRecommendation)) {
    errors.push("topRecommendation must be an object");
  } else {
    if (typeof value.topRecommendation.responderId !== "string") {
      errors.push("topRecommendation.responderId must be a string");
    }
    if (typeof value.topRecommendation.rationale !== "string") {
      errors.push("topRecommendation.rationale must be a string");
    }
  }

  return errors;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Names of the supplied candidates (responderId and displayName) are the only
 * digit-bearing tokens allowed in prose. They are matched whole and
 * case-insensitively, and removed before the digit check, so any other number,
 * or an ID that was not supplied, is still rejected.
 */
function candidateNamePattern(candidatePacket) {
  const names = candidatePacket.candidates
    .flatMap((candidate) => [candidate.responderId, candidate.displayName])
    .filter((name) => typeof name === "string" && name.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  return names.length ? new RegExp(`(?<!\\w)(?:${names.join("|")})(?!\\w)`, "gi") : null;
}

function containsNumericLeakage(namePattern, ...prose) {
  return prose.some((text) => typeof text === "string" && /\d/.test(namePattern ? text.replace(namePattern, " ") : text));
}

/**
 * Full SOW §24 validation pipeline. The model is never trusted: every ID is
 * checked against the candidate packet that was actually sent, and any
 * generated prose that leaks numeric evidence is rejected, never edited into
 * compliance. Supplied candidate names are the one allowed exception.
 */
export function validateAgentResult(candidatePacket, result) {
  const errors = checkAgentResultShape(result);
  if (errors.length > 0) return { valid: false, errors };

  if (result.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion ${result.schemaVersion} does not match ${SCHEMA_VERSION}`);
  }
  if (result.recommendationRequestId !== candidatePacket.recommendationRequestId) {
    errors.push("recommendationRequestId does not match the candidate packet's request");
  }

  const eligibleIds = new Set(candidatePacket.candidates.map((candidate) => candidate.responderId));
  const namePattern = candidateNamePattern(candidatePacket);
  const seenIds = new Set();
  for (const candidate of result.rankedCandidates) {
    if (!eligibleIds.has(candidate.responderId)) {
      errors.push(`rankedCandidates references unknown or ineligible candidate ${candidate.responderId}`);
    }
    if (seenIds.has(candidate.responderId)) {
      errors.push(`rankedCandidates references ${candidate.responderId} more than once`);
    }
    seenIds.add(candidate.responderId);
    if (containsNumericLeakage(namePattern, candidate.recommendationSummary, candidate.tradeoff?.explanation)) {
      errors.push(`rankedCandidates[${candidate.responderId}] prose introduces numeric evidence`);
    }
    if (candidate.tradeoff) {
      if (candidate.tradeoff.comparedToResponderId === candidate.responderId) {
        errors.push(`rankedCandidates[${candidate.responderId}].tradeoff must reference a different candidate`);
      } else if (!eligibleIds.has(candidate.tradeoff.comparedToResponderId)) {
        errors.push(`rankedCandidates[${candidate.responderId}].tradeoff references an unknown or ineligible candidate`);
      }
    }
  }
  if (result.rankedCandidates.length !== candidatePacket.candidates.length) {
    errors.push("rankedCandidates must rank every supplied candidate exactly once");
  }
  const ranks = result.rankedCandidates.map((candidate) => candidate.rank).sort((a, b) => a - b);
  const expectedRanks = candidatePacket.candidates.map((_, index) => index + 1);
  if (JSON.stringify(ranks) !== JSON.stringify(expectedRanks)) {
    errors.push("rankedCandidates ranks must form a contiguous sequence starting at 1");
  }

  const rankOne = result.rankedCandidates.find((candidate) => candidate.rank === 1);
  if (!rankOne) {
    errors.push("no rank-1 candidate present");
  } else if (!rankOne.tradeoff) {
    errors.push("rank-1 candidate is missing a required tradeoff");
  } else if (rankOne.tradeoff.comparedToResponderId === rankOne.responderId) {
    errors.push("rank-1 tradeoff must reference a different candidate");
  } else if (!eligibleIds.has(rankOne.tradeoff.comparedToResponderId)) {
    errors.push("rank-1 tradeoff references an unknown or ineligible candidate");
  }

  if (!eligibleIds.has(result.topRecommendation.responderId)) {
    errors.push("topRecommendation references an unknown or ineligible candidate");
  } else if (rankOne && result.topRecommendation.responderId !== rankOne.responderId) {
    errors.push("topRecommendation must match the rank-1 candidate");
  }
  if (containsNumericLeakage(namePattern, result.topRecommendation.rationale, result.uncertaintyNote)) {
    errors.push("topRecommendation or uncertaintyNote prose introduces numeric evidence");
  }

  return { valid: errors.length === 0, errors };
}

function buildFixtureResult(candidatePacket) {
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(scenarioAFixtureUrl, "utf8"));
  } catch {
    return null;
  }
  const fixtureIds = new Set(fixture.rankedCandidates.map((candidate) => candidate.responderId));
  const packetIds = new Set(candidatePacket.candidates.map((candidate) => candidate.responderId));
  if (fixtureIds.size !== packetIds.size || [...fixtureIds].some((id) => !packetIds.has(id))) {
    return null;
  }
  return { ...fixture, recommendationRequestId: candidatePacket.recommendationRequestId };
}

async function callLiveModel(candidatePacket, { provider, modelId, apiKey, reasoningEffort, timeoutMs, fetchImpl, onMetadata, usageLedger }, validationErrors) {
  return callChatCompletion({
    role: 'compass', usageLedger,
    provider,
    modelId,
    apiKey,
    reasoningEffort,
    timeoutMs,
    fetchImpl,
    onMetadata,
    systemInstruction: SYSTEM_INSTRUCTION,
    // Re-ask from authoritative inputs, without echoing the rejected output.
    // Bound feedback even if a malformed result generated many/large errors.
    userContent: validationErrors ? JSON.stringify({
      candidatePacket,
      repair: {
        instruction: "The previous response failed validation. Return a complete replacement using only this candidate packet and the required output contract. Correct these errors; keep all prose qualitative.",
        validationErrors: validationErrors.slice(0, 8).map((error) => error.slice(0, 256)),
      },
    }) : JSON.stringify(candidatePacket),
    jsonSchemaName: "compass_agent_result",
    jsonSchema: AGENT_RESULT_JSON_SCHEMA,
    errorLabel: "Compass agent provider",
  });
}

/**
 * Request a Compass recommendation for a candidate packet. Never throws:
 * every failure mode (missing config, provider error, timeout, invalid
 * output) resolves to an explicit `{ status: "unavailable" }` outcome per
 * SOW §36, so the caller can always fall back to the deterministic baseline.
 */
export async function requestAgentRecommendation(candidatePacket, options = {}) {
  const mode = options.mode ?? process.env.COMPASS_DEMO_INFERENCE_MODE ?? "fixture";
  const provider = options.provider ?? "amd";
  const modelId = options.modelId ?? roleDefaults(provider, "compass").modelId;
  const reasoningEffort = options.reasoningEffort ?? (provider === "nebius" ? (modelId === roleDefaults(provider, "compass").modelId ? roleDefaults(provider, "compass").reasoningEffort : "default") : (process.env.AMD_TOKEN_FACTORY_REASONING_EFFORT || defaultReasoningEffortFor(modelId)));
  const modelInfo = { provider, modelId, mode, ...(reasoningEffort ? { reasoningEffort } : {}) };

  if (mode === "force-failure") {
    return { status: "unavailable", reason: "forced-failure", modelInfo };
  }

  if (mode === "live") {
    try {
      // A monotonic clock (injectable for hermetic tests) owns one budget for
      // both requests, including provider queueing/retries and validation.
      const now = options.now ?? (() => performance.now());
      const timeoutMs = options.timeoutMs ?? (Number.parseInt(process.env.COMPASS_AGENT_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS);
      const deadline = now() + timeoutMs;
      const callOptions = {
        usageLedger: options.usageLedger,
        provider,
        modelId,
        apiKey: options.apiKey ?? readProviderApiKey(provider),
        onMetadata: metadata => Object.assign(modelInfo, metadata),
        reasoningEffort,
        fetchImpl: options.fetchImpl ?? fetch,
      };
      let raw = await callLiveModel(candidatePacket, { ...callOptions, timeoutMs: Math.max(0, deadline - now()) });
      let { valid, errors } = validateAgentResult(candidatePacket, raw);
      const remainingMs = deadline - now();
      if (!valid && remainingMs >= MIN_REPAIR_TIME_MS) {
        raw = await callLiveModel(candidatePacket, { ...callOptions, timeoutMs: remainingMs }, errors);
        ({ valid, errors } = validateAgentResult(candidatePacket, raw));
      }
      if (now() >= deadline) return { status: "unavailable", reason: "timeout", modelInfo };
      if (!valid) return { status: "unavailable", reason: "validation-failed", errors, modelInfo };
      return { status: "ok", result: raw, modelInfo };
    } catch (error) {
      const reason = error.code === "budget-exhausted" ? "budget-exhausted" : error.code === "model-not-configured" ? "model-not-configured" : error.name === "AbortError" ? "timeout" : "provider-error";
      return { status: "unavailable", reason, message: error.message, modelInfo };
    }
  }

  const fixtureResult = buildFixtureResult(candidatePacket);
  if (!fixtureResult) return { status: "unavailable", reason: "no-fixture-for-packet", modelInfo };
  const { valid, errors } = validateAgentResult(candidatePacket, fixtureResult);
  if (!valid) return { status: "unavailable", reason: "validation-failed", errors, modelInfo };
  return { status: "ok", result: fixtureResult, modelInfo: { ...modelInfo, mode: "fixture" } };
}
