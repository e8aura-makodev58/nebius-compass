import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialDemoState } from "../src/demo-state.mjs";
import { buildCandidatePacket } from "../src/context-engine.mjs";
import { AGENT_RESULT_JSON_SCHEMA, SYSTEM_INSTRUCTION, requestAgentRecommendation } from "../src/agent.mjs";
import { buildEventPlannerPacket, requestEventProposal } from "../src/event-planner.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { AMD_DEFAULT_BASE_URL, AMD_DEFAULT_MODEL_ID, PROVIDER_IDS, amdBaseUrl, callChatCompletion, providerDef, readAmdApiKey } from "../src/model-provider.mjs";

/**
 * Coverage for the AMD Token Factory provider, the only provider Compass
 * uses. Every test stubs fetch: nothing here calls the live service.
 */

const CHAT_URL = `${AMD_DEFAULT_BASE_URL}/chat/completions`;

function scenarioAPacket() {
  const state = createInitialDemoState();
  return buildCandidatePacket(state, state.activeIssueId, "rec-amd-test");
}

function validAgentResult(packet) {
  return {
    schemaVersion: "1.0",
    recommendationRequestId: packet.recommendationRequestId,
    rankedCandidates: packet.candidates.map((candidate, index) => ({
      rank: index + 1,
      responderId: candidate.responderId,
      recommendationSummary: "A qualitative summary with no numbers.",
      evidenceReferences: ["sameIssuePerformance"],
      ...(index === 0 ? { tradeoff: { comparedToResponderId: packet.candidates[1].responderId, explanation: "A qualitative tradeoff." } } : {}),
    })),
    topRecommendation: { responderId: packet.candidates[0].responderId, rationale: "A qualitative rationale." },
    uncertaintyNote: "A qualitative uncertainty note.",
  };
}

function okResponse(content, extra = {}) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content, ...extra.message }, finish_reason: extra.finishReason ?? "stop" }] }) };
}

const baseCall = {
  modelId: AMD_DEFAULT_MODEL_ID, apiKey: "rc-test", timeoutMs: 5000,
  systemInstruction: "system", userContent: "user", jsonSchemaName: "schema", jsonSchema: { type: "object" }, errorLabel: "Test provider",
};

test("AMD remains selectable beside Nebius and resolves its OpenAI-compatible endpoint", () => {
  assert.deepEqual([...PROVIDER_IDS], ["amd", "nebius"]);
  assert.equal(providerDef("amd").chatCompletionsUrl, CHAT_URL);
  assert.equal(providerDef("amd").apiKeyEnv, "AMD_TOKEN_FACTORY_API_KEY");
  // A removed provider id recorded in old state still resolves to AMD rather than nowhere.
  assert.equal(providerDef("openai").id, "amd");
});

test("amdBaseUrl defaults to the documented endpoint and honors an override, stripping any trailing slash", () => {
  assert.equal(amdBaseUrl({}), AMD_DEFAULT_BASE_URL);
  assert.equal(amdBaseUrl({ AMD_TOKEN_FACTORY_BASE_URL: "https://example.test/v1/" }), "https://example.test/v1");
});

test("readAmdApiKey prefers the environment value, then a key file, and yields no key for an unreadable file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-amd-key-"));
  const keyFile = join(directory, "amd.token");
  await writeFile(keyFile, "rc-from-file\n");
  assert.equal(readAmdApiKey({ AMD_TOKEN_FACTORY_API_KEY: " rc-from-env ", AMD_TOKEN_FACTORY_API_KEY_FILE: keyFile }), "rc-from-env");
  assert.equal(readAmdApiKey({ AMD_TOKEN_FACTORY_API_KEY_FILE: keyFile }), "rc-from-file");
  assert.equal(readAmdApiKey({ AMD_TOKEN_FACTORY_API_KEY_FILE: join(directory, "missing") }), "");
  assert.equal(readAmdApiKey({}), "");
});

test("callChatCompletion requests json_object with the schema in the system message, a bounded max_tokens, and omits 'default' reasoning", async () => {
  let capturedUrl, capturedBody, capturedAuth;
  const result = await callChatCompletion({
    ...baseCall,
    reasoningEffort: "low",
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedAuth = init.headers.authorization;
      capturedBody = JSON.parse(init.body);
      return okResponse(JSON.stringify({ ok: true }));
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(capturedUrl, CHAT_URL);
  assert.equal(capturedAuth, "Bearer rc-test");
  assert.equal(capturedBody.model, AMD_DEFAULT_MODEL_ID);
  assert.deepEqual(capturedBody.response_format, { type: "json_object" });
  assert.equal(capturedBody.reasoning_effort, "low");
  assert.ok(Number.isInteger(capturedBody.max_tokens) && capturedBody.max_tokens > 0);
  assert.equal(capturedBody.messages.length, 2);
  assert.equal(capturedBody.messages[0].role, "system");
  assert.match(capturedBody.messages[0].content, /^system\n/);
  assert.match(capturedBody.messages[0].content, /"schema"/);
  assert.equal(capturedBody.messages[1].content, "user");

  let defaultBody;
  await callChatCompletion({ ...baseCall, reasoningEffort: "default", fetchImpl: async (url, init) => { defaultBody = JSON.parse(init.body); return okResponse("{}"); } });
  assert.equal(defaultBody.reasoning_effort, undefined);
});

test("callChatCompletion fails closed without a credential, on AMD error wrappers, and on a truncated reply", async () => {
  await assert.rejects(
    () => callChatCompletion({ ...baseCall, apiKey: "", fetchImpl: async () => { throw new Error("must not be called"); } }),
    /AMD_TOKEN_FACTORY_API_KEY is not configured/,
  );
  const errorResponse = (status, body) => async () => ({ ok: false, status, text: async () => JSON.stringify(body) });
  await assert.rejects(
    () => callChatCompletion({ ...baseCall, fetchImpl: errorResponse(400, { error: { message: "Model X does not support JSON schema output mode" } }) }),
    /HTTP 400: Model X does not support JSON schema output mode/,
  );
  await assert.rejects(
    () => callChatCompletion({ ...baseCall, fetchImpl: errorResponse(429, { detail: { error: { message: "rate limited" } } }) }),
    /HTTP 429: rate limited/,
  );
  await assert.rejects(
    () => callChatCompletion({ ...baseCall, fetchImpl: async () => okResponse('{"partial":', { finishReason: "length" }) }),
    /truncated/,
  );
});

test("Compass recommendation live mode dispatches to AMD end to end and ignores any reasoning trace", async () => {
  const packet = scenarioAPacket();
  const expected = validAgentResult(packet);
  let capturedUrl, capturedBody;
  const outcome = await requestAgentRecommendation(packet, {
    mode: "live", modelId: AMD_DEFAULT_MODEL_ID, apiKey: "rc-test", reasoningEffort: "none",
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return okResponse(JSON.stringify(expected), { message: { reasoning: "model chain of thought is ignored" } });
    },
  });
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.modelInfo.provider, "amd");
  assert.equal(outcome.modelInfo.modelId, AMD_DEFAULT_MODEL_ID);
  assert.equal(JSON.stringify(outcome).includes("chain of thought"), false);
  assert.equal(capturedUrl, CHAT_URL);
  assert.equal(capturedBody.reasoning_effort, "none");
  assert.ok(capturedBody.messages[0].content.startsWith(SYSTEM_INSTRUCTION));
  assert.ok(capturedBody.messages[0].content.includes(JSON.stringify(AGENT_RESULT_JSON_SCHEMA)));
});

test("Compass recommendation fails closed when AMD returns an invalid result or non-JSON content", async () => {
  const packet = scenarioAPacket();
  const invalid = validAgentResult(packet);
  invalid.rankedCandidates[0].responderId = "R-UNKNOWN";
  const invalidOutcome = await requestAgentRecommendation(packet, { mode: "live", apiKey: "rc-test", fetchImpl: async () => okResponse(JSON.stringify(invalid)) });
  assert.equal(invalidOutcome.status, "unavailable");
  assert.equal(invalidOutcome.reason, "validation-failed");

  const proseOutcome = await requestAgentRecommendation(packet, { mode: "live", apiKey: "rc-test", fetchImpl: async () => okResponse("Here is my ranking: ...") });
  assert.equal(proseOutcome.status, "unavailable");
  assert.equal(proseOutcome.reason, "provider-error");
});

test("Event planner live mode dispatches to AMD and returns the proposal for application-side validation", async () => {
  const seed = createLiveSeed();
  const packet = buildEventPlannerPacket(seed);
  const validProposal = {
    schemaVersion: "1.0",
    eventType: "ISSUE_RAISED",
    equipmentId: seed.equipment.find((item) => item.status === "NORMAL").id,
    issueClass: "A",
    description: "Process-output drift detected",
    responseAction: "Inspect operating parameters and verify stable output.",
    contextReason: "Current equipment state permits a new issue",
  };
  let capturedUrl;
  const outcome = await requestEventProposal(packet, {
    mode: "live",
    modelId: AMD_DEFAULT_MODEL_ID,
    apiKey: "rc-test",
    fetchImpl: async (url) => { capturedUrl = url; return okResponse(JSON.stringify(validProposal)); },
  });
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.modelInfo.provider, "amd");
  assert.equal(capturedUrl, CHAT_URL);
});
