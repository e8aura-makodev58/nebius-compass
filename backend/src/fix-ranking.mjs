import { readFile } from 'node:fs/promises';
import { callChatCompletion, defaultReasoningEffortFor, readProviderApiKey, roleDefaults } from './model-provider.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';

const keysEqual = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();
export function validateFixRanking(packet, result) {
  const errors = [];
  if (!keysEqual(result, ['schemaVersion', 'rankedFixes']) || result.schemaVersion !== '1.0' || !Array.isArray(result.rankedFixes)) return { valid: false, errors: ['Invalid fix ranking envelope'] };
  const ids = packet.candidates.map((c) => c.fixId), seen = new Set();
  const allowedNumbers = new Set((JSON.stringify(packet).match(/\d+(?:\.\d+)?/g) ?? []));
  if (result.rankedFixes.length !== ids.length) return { valid: false, errors: ['Rank every supplied fix exactly once'] };
  for (const [i, row] of result.rankedFixes.entries()) {
    if (!keysEqual(row, ['fixId', 'rank', 'rationale'])) { errors.push('Invalid ranked fix fields'); continue; }
    if (!ids.includes(row.fixId) || seen.has(row.fixId) || row.rank !== i + 1) errors.push('Unknown fix, duplicate or invalid rank');
    seen.add(row.fixId);
    if (typeof row.rationale !== 'string' || !row.rationale.trim() || row.rationale.length > 360) errors.push('Rationale must be short and nonempty');
    else {
      if ((row.rationale.match(/\bFIX-[A-Z]-\d+\b/g) ?? []).some((id) => !ids.includes(id))) errors.push('Rationale invented a fix');
      const prose = ids.reduce((s, id) => s.replaceAll(id, ''), row.rationale);
      if ((prose.match(/\d+(?:\.\d+)?/g) ?? []).some((n) => !allowedNumbers.has(n))) errors.push('Rationale invented numeric evidence');
    }
  }
  try { assertNoResponderSkill(result); } catch { errors.push('Private fields are forbidden'); }
  return { valid: !errors.length, errors };
}
const instruction = 'Rank only the supplied fix IDs from the observed evidence. Return JSON with schemaVersion "1.0" and rankedFixes, each with fixId, contiguous rank and a short qualitative rationale. Include every supplied fix exactly once. Prefer same-symptom success supported by evidence, discuss uncertainty for thin samples. Do not diagnose a hidden cause, invent procedures, numbers, effectiveness or confidence. Titles, steps, counts and outcomes are application facts; they are not model estimates. Write every rationale with no digits at all: no counts, rates, percentages, decimals, minutes or sample sizes, not even in parentheses; the UI renders the authoritative numbers. Say stronger same-symptom evidence, larger sample, thin sample, lower success or weaker on this station instead. Numeric rank fields and the supplied fixId strings are still required.';
export async function requestFixRanking(packet, options = {}) {
  assertNoResponderSkill(packet);
  const mode = options.mode ?? 'fixture';
  const provider = options.provider ?? 'amd';
  const modelId = options.modelId ?? roleDefaults(provider, 'compass').modelId;
  const modelInfo = { provider, modelId, mode, reasoningEffort: options.reasoningEffort ?? (provider === 'nebius' ? roleDefaults(provider, 'compass').reasoningEffort : (process.env.AMD_TOKEN_FACTORY_REASONING_EFFORT || defaultReasoningEffortFor(modelId))) };
  if (mode === 'force-failure') return { status: 'unavailable', reason: 'forced-failure', modelInfo };
  try {
    let result;
    if (mode === 'fixture') {
      const fixtures = JSON.parse(await readFile(new URL('../fixtures/fix-rankings.json', import.meta.url), 'utf8'));
      const order = fixtures[packet.issueClass];
      result = { schemaVersion: '1.0', rankedFixes: order.map((fixId, i) => ({ fixId, rank: i + 1, rationale: 'Stored Offline troubleshooting order; observed evidence remains visible for comparison.' })) };
    } else if (mode === 'live') {
      const now = options.now ?? (() => performance.now()), deadline = now() + (options.timeoutMs ?? (Number.parseInt(process.env.COMPASS_AGENT_TIMEOUT_MS, 10) || 90_000));
      const request = (feedback) => callChatCompletion({ ...options, ...modelInfo, apiKey: options.apiKey ?? readProviderApiKey(provider), onMetadata: metadata => Object.assign(modelInfo, metadata), fetchImpl: options.fetchImpl ?? fetch,
        timeoutMs: Math.max(0, deadline - now()), systemInstruction: instruction,
        userContent: JSON.stringify(feedback ? { packet, validationErrors: feedback.slice(0,8) } : packet),
        jsonSchemaName: 'compass_fix_ranking', jsonSchema: { type: 'object', required: ['schemaVersion', 'rankedFixes'] }, errorLabel: 'Compass fix ranking' });
      result = await request();
      const checked = validateFixRanking(packet, result);
      if (!checked.valid && deadline - now() >= 1_000) result = await request(checked.errors);
      if (now() >= deadline) return { status: 'unavailable', reason: 'timeout', modelInfo };
    } else return { status: 'unavailable', reason: 'unsupported-mode', modelInfo };
    const checked = validateFixRanking(packet, result);
    return checked.valid ? { status: 'ok', result, modelInfo } : { status: 'unavailable', reason: 'validation-failed', modelInfo };
  } catch (error) { return { status: 'unavailable', reason: error.code === 'model-not-configured' ? 'model-not-configured' : error.name === 'AbortError' ? 'timeout' : 'provider-error', modelInfo }; }
}
