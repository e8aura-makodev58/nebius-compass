/**
 * Provider-specific chat-completion mechanics, shared by the Compass agent and
 * the event planner. Both send one JSON-output request and parse one JSON
 * result. Everything else — validation, fallback, never trusting the model —
 * stays in the caller, not here.
 *
 * Nebius and AMD use separate credentials, capability tables and process controls.
 */

import { readFileSync } from "node:fs";
import { parseRetryAfter, providerControlsFor } from "./provider-controls.mjs";

export const PROVIDER_IDS = Object.freeze(["amd", "nebius"]);

export const AMD_DEFAULT_BASE_URL = "https://developer.amd.com.cn/radeon/api/v1";
// Chosen by measurement, not by the guide's suggestion: on Compass's own
// candidate packet, MiMo-V2.6-Flash with reasoning off returned contract-valid
// rankings on every trial, while DeepSeek-V4-Flash and Qwen3.8-Flash-Next
// repeatedly broke the no-IDs/no-digits prose rule. See docs/decisions.md.
export const AMD_DEFAULT_MODEL_ID = "MiMo-V2.6-Flash";
// MiMo thinks by default, which is slower and spends output tokens on a trace
// Compass never uses; "none" turns that off.
export const AMD_DEFAULT_REASONING_EFFORT = "none";

/** The reasoning effort to use when none is configured for a model. */
export function defaultReasoningEffortFor(modelId) {
  return modelId === AMD_DEFAULT_MODEL_ID ? AMD_DEFAULT_REASONING_EFFORT : "default";
}
// Bounds output size (and shared team quota). Reasoning tokens count against
// this budget, so it is deliberately generous; a truncated reply fails closed.
const AMD_DEFAULT_MAX_OUTPUT_TOKENS = 4_096;

export function amdBaseUrl(environment = process.env) {
  return String(environment.AMD_TOKEN_FACTORY_BASE_URL || AMD_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function amdMaxOutputTokens(environment = process.env) {
  const parsed = Number.parseInt(environment.AMD_TOKEN_FACTORY_MAX_OUTPUT_TOKENS, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : AMD_DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * The team key comes from AMD_TOKEN_FACTORY_API_KEY, or from the file named by
 * AMD_TOKEN_FACTORY_API_KEY_FILE so the secret never has to sit in .env or a
 * process listing. An unreadable file yields no key, so calls fail closed.
 */
export function readAmdApiKey(environment = process.env) {
  if (environment.AMD_TOKEN_FACTORY_API_KEY) return String(environment.AMD_TOKEN_FACTORY_API_KEY).trim();
  if (!environment.AMD_TOKEN_FACTORY_API_KEY_FILE) return "";
  try {
    return readFileSync(environment.AMD_TOKEN_FACTORY_API_KEY_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

export const NEBIUS_DEFAULT_BASE_URL = "https://api.tokenfactory.nebius.com/v1";
export function nebiusBaseUrl(environment = process.env) {
  return String(environment.NEBIUS_TOKEN_FACTORY_BASE_URL || NEBIUS_DEFAULT_BASE_URL).replace(/\/+$/, "");
}
export function readNebiusApiKey(environment = process.env) {
  return readAmdApiKey({ AMD_TOKEN_FACTORY_API_KEY: environment.NEBIUS_TOKEN_FACTORY_API_KEY,
    AMD_TOKEN_FACTORY_API_KEY_FILE: environment.NEBIUS_TOKEN_FACTORY_API_KEY_FILE });
}
export function readProviderApiKey(provider, environment = process.env) {
  return provider === 'nebius' ? readNebiusApiKey(environment) : readAmdApiKey(environment);
}
// N0 fills only this data table after documented live probes. No guessed model IDs.
export const NEBIUS_ROLE_DEFAULTS = Object.freeze({
  compass: { modelId: '', reasoningEffort: 'default', timeoutMs: 90_000 },
  'event-planner': { modelId: '', reasoningEffort: 'default', timeoutMs: 30_000 },
  investigator: { modelId: '', reasoningEffort: 'default', timeoutMs: 120_000 },
  narrator: { modelId: '', reasoningEffort: 'default', timeoutMs: 30_000 },
});
export const NEBIUS_MODEL_CAPABILITIES = Object.freeze({
  // '<verified-id>': { toolCalling: 'native', thinking: 'chat_template_kwargs.enable_thinking', jsonMode: true }
});
export function modelCapabilities(provider, modelId) {
  return provider === 'nebius'
    ? { toolCalling: 'json-protocol', thinking: 'omit', jsonMode: true, ...NEBIUS_MODEL_CAPABILITIES[modelId] }
    : { toolCalling: 'json-protocol', thinking: 'reasoning_effort', jsonMode: true };
}
export function roleDefaults(provider, role, environment = process.env) {
  const prefix = provider === 'nebius' ? 'NEBIUS_TOKEN_FACTORY' : 'AMD_TOKEN_FACTORY';
  const suffix = role === 'compass' ? '' : `_${role.replaceAll('-', '_').toUpperCase()}`;
  const base = provider === 'nebius' ? NEBIUS_ROLE_DEFAULTS[role] : { modelId: AMD_DEFAULT_MODEL_ID, timeoutMs: role === 'compass' ? 90_000 : 30_000 };
  const modelId = environment[`${prefix}${suffix}_MODEL`] || (role === 'compass' ? environment[`${prefix}_MODEL`] : '') || (provider === 'amd' ? environment[`${prefix}_MODEL`] : '') || base.modelId;
  const sharedModel = environment[`${prefix}_MODEL`] || (provider === 'amd' ? AMD_DEFAULT_MODEL_ID : '');
  const sharedEffort = modelId === sharedModel ? environment[`${prefix}_REASONING_EFFORT`] : '';
  const timeout = Number(environment[`${prefix}${suffix}_TIMEOUT_MS`] ?? environment[role === 'compass' ? 'COMPASS_AGENT_TIMEOUT_MS' : role === 'event-planner' ? 'COMPASS_EVENT_PLANNER_TIMEOUT_MS' : `COMPASS_${role.toUpperCase()}_TIMEOUT_MS`]);
  return { modelId, reasoningEffort: environment[`${prefix}${suffix}_REASONING_EFFORT`] || sharedEffort || base.reasoningEffort || defaultReasoningEffortFor(modelId),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : base.timeoutMs };
}
export function safeModelMetadata(value = {}) {
  const result = {};
  for (const key of ['provider','modelId','mode','reasoningEffort','providerRequestId']) if (typeof value[key] === 'string') result[key] = value[key].slice(0, 200);
  if (Number.isFinite(value.latencyMs) && value.latencyMs >= 0) result.latencyMs = value.latencyMs;
  if (value.usage) result.usage = Object.fromEntries(['promptTokens','completionTokens'].filter(k => Number.isSafeInteger(value.usage[k]) && value.usage[k] >= 0).map(k => [k,value.usage[k]]));
  return result;
}

const PROVIDER_DEFS = Object.freeze({
  nebius: {
    id: 'nebius', label: 'Nebius Token Factory', apiKeyEnv: 'NEBIUS_TOKEN_FACTORY_API_KEY',
    get chatCompletionsUrl() { return `${nebiusBaseUrl()}/chat/completions`; },
    buildBody({ modelId, reasoningEffort, messages, capabilities = modelCapabilities('nebius', modelId) }) {
      if (!['on','off','default',undefined].includes(reasoningEffort)) throw new Error('Unsupported Nebius thinking level');
      let thinking = {};
      if (reasoningEffort && reasoningEffort !== 'default') {
        if (capabilities.thinking === 'reasoning_effort') thinking = { reasoning_effort: capabilities.reasoningValues?.[reasoningEffort] ?? reasoningEffort };
        else if (capabilities.thinking === 'chat_template_kwargs.enable_thinking') thinking = { chat_template_kwargs: { enable_thinking: reasoningEffort === 'on' } };
        else throw new Error('Thinking control is not verified for this model');
      }
      return { model: modelId, messages, ...thinking,
        ...(capabilities.jsonMode ? { response_format: { type: 'json_object' } } : {}), max_tokens: 4096 };
    },
  },
  amd: {
    id: "amd",
    label: "AMD Token Factory",
    apiKeyEnv: "AMD_TOKEN_FACTORY_API_KEY",
    get chatCompletionsUrl() { return `${amdBaseUrl()}/chat/completions`; },
    // The shared endpoints reject strict json_schema for the default model, so
    // Compass requests json_object and the caller validates the full contract.
    // "default" means the operator left reasoning effort unset (for
    // MiMo-V2.6-Flash, that means thinking is on).
    buildBody({ modelId, reasoningEffort, messages }) {
      return {
        model: modelId,
        ...(reasoningEffort && reasoningEffort !== "default" ? { reasoning_effort: reasoningEffort } : {}),
        messages,
        response_format: { type: "json_object" },
        max_tokens: amdMaxOutputTokens(),
      };
    },
  },
});

export function providerDef(providerId) {
  return PROVIDER_DEFS[providerId] ?? PROVIDER_DEFS.amd;
}

/**
 * json_object mode guarantees syntactically valid JSON but not its shape, so
 * the contract travels in the system message. It is guidance only: the caller
 * still validates every field before using the result.
 */
function systemMessageWithSchema(systemInstruction, jsonSchemaName, jsonSchema) {
  return `${systemInstruction}

Respond with exactly one JSON object and nothing else (no Markdown). The object must conform to this JSON Schema named "${jsonSchemaName}":
${JSON.stringify(jsonSchema)}`;
}

/** AMD wraps errors as {"error": ...} or {"detail": {"error": ...}}. */
function upstreamErrorDetail(text) {
  try {
    const parsed = JSON.parse(text);
    const error = parsed?.error ?? parsed?.detail?.error ?? parsed?.detail;
    const message = typeof error === "string" ? error : error?.message;
    if (typeof message === "string" && message) return message;
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return text;
}

/**
 * One JSON-output chat-completion call. Never trusts the shape of what comes
 * back — it only parses the response envelope; the caller validates the
 * parsed content against its own contract before using it for anything.
 *
 * Runs under the shared provider controls (provider-controls.mjs): the local
 * limiter, 429 retries and the circuit breaker. `timeoutMs` is the whole
 * budget, including queueing and retries.
 *
 * Throws on every failure (missing credential, HTTP error, timeout, open
 * breaker, full queue, truncated or malformed envelope). Callers already catch
 * broadly and fail closed to a deterministic fallback, so this never needs its
 * own fallback path.
 */
export async function callChatCompletion(options) {
  const turn = await callChatTurn(options);
  options.onMetadata?.(safeModelMetadata(turn));
  if (turn.error) throw Object.assign(new Error(turn.error.message), { code: turn.error.code });
  if (turn.toolCalls.length) throw new Error('Unexpected tool call in JSON completion');
  return JSON.parse(turn.content);
}

/** One bounded turn, retaining the legacy JSON helper above for existing callers. */
export async function callChatTurn({ provider = 'amd', modelId, apiKey, reasoningEffort,
  timeoutMs = 30_000, fetchImpl = fetch, systemInstruction = '', userContent = '',
  jsonSchemaName, jsonSchema, messages, tools = [], capabilities = modelCapabilities(provider, modelId),
  errorLabel = 'Model provider', controls, now = () => performance.now(),
}) {
  const def = providerDef(provider);
  if (provider === 'nebius' && !modelId?.trim()) throw Object.assign(new Error('Nebius model is not configured'), { code: 'model-not-configured' });
  if (!apiKey) throw new Error(`${def.apiKeyEnv} is not configured`);
  const native = tools.length && capabilities.toolCalling === 'native';
  const instruction = jsonSchema ? systemMessageWithSchema(systemInstruction, jsonSchemaName, jsonSchema) : systemInstruction;
  let turnMessages = messages ?? [{ role: 'system', content: instruction }, { role: 'user', content: userContent }];
  if (tools.length && !native) turnMessages = [{ role: 'system', content: jsonToolInstruction(tools) }, ...turnMessages];
  const request = def.buildBody({ modelId, reasoningEffort, messages: turnMessages, capabilities });
  if (native) { request.tools = tools; delete request.response_format; }
  const body = JSON.stringify(request), started = now(), deadline = started + timeoutMs;
  controls ??= providerControlsFor(fetchImpl, process.env, provider);
  try {
    const envelope = await controls.run(deadline, () => attemptChatCompletion({ def, apiKey, body, fetchImpl, errorLabel, timeoutMs: Math.max(0, deadline - now()) }));
    return normalizeChatTurn(envelope.payload, { tools, native, modelId, latencyMs: Math.max(0, now() - started), requestId: envelope.requestId });
  } catch (error) {
    if (error?.code === 'circuit-open' || error?.code === 'queue-full') error.message = `${errorLabel}: ${provider === "nebius" ? error.message.replaceAll("AMD", "Nebius") : error.message}`;
    else if (error?.code === 'deadline') throw Object.assign(new Error(`${errorLabel} call timed out waiting for the request limiter`), { name: 'AbortError', code: 'deadline' });
    throw error;
  }
}

export function jsonToolInstruction(tools) {
  return `Tools are read-only proposals; application code validates and executes them. Return exactly one JSON object: {"action":"tool","id":"call-id","name":"supplied-tool-name","arguments":{...}} or {"action":"final","content":{...}}. Never invent tool names. Tool schemas: ${JSON.stringify(tools)}`;
}
// Deliberately restricted JSON Schema vocabulary for tool contracts. Unknown keywords
// fail closed, rather than silently claiming validation of a schema we cannot enforce.
function matchesSchema(value, schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
  const supported = new Set(['type','properties','required','additionalProperties','items','enum','description','title','minimum','maximum','minLength','maxLength','maxItems','minItems']);
  if (Object.keys(schema).some(k => !supported.has(k))) return false;
  if (schema.enum && !schema.enum.some(v => JSON.stringify(v) === JSON.stringify(value))) return false;
  switch (schema.type) {
    case 'object':
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      if ((schema.required ?? []).some(k => !Object.hasOwn(value,k))) return false;
      return Object.entries(value).every(([k,v]) => schema.properties?.[k] ? matchesSchema(v,schema.properties[k]) : schema.additionalProperties === true);
    case 'array': return Array.isArray(value) && value.length <= (schema.maxItems ?? 10) && value.length >= (schema.minItems ?? 0) && value.every(v => matchesSchema(v,schema.items));
    case 'string': return typeof value === 'string' && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? 8192);
    case 'integer': return Number.isSafeInteger(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
    case 'number': return typeof value === 'number' && Number.isFinite(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return false;
  }
}
export function normalizeChatTurn(payload, { tools = [], native = false, modelId, latencyMs = 0, requestId } = {}) {
  const choice = payload?.choices?.[0], message = choice?.message;
  const base = { content: message?.content ?? null, toolCalls: [], finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason.slice(0, 40) : null,
    ...safeModelMetadata({ modelId: payload?.model ?? modelId, latencyMs, providerRequestId: requestId ?? payload?.id,
      usage: { promptTokens: payload?.usage?.prompt_tokens, completionTokens: payload?.usage?.completion_tokens } }) };
  const invalid = () => ({ ...base, content: null, toolCalls: [], error: { code: 'invalid-tool-call', message: 'Provider returned invalid tool-call arguments or an unknown tool' } });
  try {
    let calls = message?.tool_calls ?? [];
    if (tools.length && !native) {
      const parsed = JSON.parse(message.content);
      if (parsed.action === 'tool') calls = [{ id: parsed.id, type: 'function', function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments) } }];
      else if (parsed.action === 'final' && Object.hasOwn(parsed,'content')) base.content = typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content);
      else return invalid();
    }
    if (!Array.isArray(calls) || calls.length > 6) return invalid();
    const seen = new Set();
    for (const call of calls) {
      const tool = tools.find(t => t.type === 'function' && t.function.name === call.function?.name);
      if (!tool || call.type !== 'function' || typeof call.id !== 'string' || !call.id || call.id.length > 200 || seen.has(call.id) || typeof call.function.arguments !== 'string' || call.function.arguments.length > 8192) return invalid();
      const args = JSON.parse(call.function.arguments);
      if (!matchesSchema(args,tool.function.parameters)) return invalid();
      seen.add(call.id);
      base.toolCalls.push({ id: call.id, name: call.function.name, arguments: args });
    }
    if (!base.toolCalls.length && typeof base.content !== 'string') throw new Error('Missing structured content');
    return base;
  } catch { return invalid(); }
}

async function attemptChatCompletion({ def, apiKey, body, fetchImpl, errorLabel, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reachedService = false;
  try {
    const response = await fetchImpl(def.chatCompletionsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body,
      signal: controller.signal,
    });
    reachedService = true;
    if (!response.ok) {
      // The provider's own words are the only thing that distinguishes a bad
      // parameter from a bad key from a retired model. Bounded, and never
      // includes the request body or headers.
      const detail = upstreamErrorDetail(await response.text().catch(() => ""));
      throw Object.assign(new Error(`${errorLabel} responded with HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`), {
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers?.get?.("retry-after")),
        // 429 and 5xx are the service failing; other 4xx are our configuration.
        serviceFailure: response.status === 429 || response.status >= 500,
      });
    }
    const payload = await response.json();
    const choice = payload?.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error(`${errorLabel} response was truncated at the output-token limit`);
    // Any separate reasoning trace (message.reasoning) is deliberately ignored:
    // only the normal content payload is ever parsed, validated, or stored.
    const content = choice?.message?.content;
    if (typeof content !== "string" && !Array.isArray(choice?.message?.tool_calls)) throw new Error(`${errorLabel} response was missing structured content`);
    return { payload, requestId: response.headers?.get?.("x-request-id") ?? response.headers?.get?.("request-id") };
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error(`${errorLabel} call timed out`), { name: "AbortError", serviceFailure: true });
    }
    // A network error before any response is a service failure; a bad
    // envelope from a reachable service is not.
    if (error && typeof error === "object" && error.serviceFailure === undefined) error.serviceFailure = !reachedService;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
