import { readFile } from 'node:fs/promises';
import { callChatCompletion, defaultReasoningEffortFor, readProviderApiKey, roleDefaults } from './model-provider.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';

const keysEqual = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();
export function validateStaffingRanking(packet, result) {
  const errors = [];
  if (!keysEqual(result, ['schemaVersion', 'rankedOptions']) || result.schemaVersion !== '1.0' || !Array.isArray(result.rankedOptions)) return { valid: false, errors: ['Invalid staffing ranking envelope'] };
  const ids = packet.candidates.map((c) => c.optionId), seen = new Set();
  if (result.rankedOptions.length !== ids.length) return { valid: false, errors: ['Rank every supplied option exactly once'] };
  for (const [i, row] of result.rankedOptions.entries()) {
    if (!keysEqual(row, ['optionId', 'rank', 'rationale'])) { errors.push('Invalid ranked option fields'); continue; }
    if (!ids.includes(row.optionId) || seen.has(row.optionId) || row.rank !== i + 1) errors.push('Unknown option, duplicate or invalid rank');
    seen.add(row.optionId);
    if (typeof row.rationale !== 'string' || !row.rationale.trim() || row.rationale.length > 360) errors.push('Rationale must be short and nonempty');
    else {
      if ((row.rationale.match(/\b(?:EXTENSION|CALL_IN):[\w-]+\b/g) ?? []).some((id) => !ids.includes(id))) errors.push('Rationale invented an option');
      const prose = ids.reduce((s, id) => s.replaceAll(id, ''), row.rationale);
      if (/\d/.test(prose)) errors.push('Rationale must use no digits apart from supplied option IDs');
    }
  }
  try { assertNoResponderSkill(result); } catch { errors.push('Private fields are forbidden'); }
  return { valid: !errors.length, errors };
}
const instruction = 'Rank every supplied staffing option ID exactly once, using only observed backlog coverage and legal duty/rest evidence. Return JSON with schemaVersion "1.0", rankedOptions of optionId, contiguous rank and short qualitative rationale. Write every rationale with no digits at all: no counts, rates, percentages, decimals, hours, minutes or sample sizes, not even in parentheses; the UI renders the authoritative numbers. Say stronger backlog coverage, larger sample, thin evidence or longer duty instead. Supplied option IDs are the only digit-bearing prose allowed; numeric rank fields remain required. Do not invent HR facts or hidden skill. You cannot approve staffing or alter legality; Central command or explicit room policy decides.';
export async function requestStaffingRanking(packet, options = {}) {
  assertNoResponderSkill(packet);
  const mode = options.mode ?? 'fixture';
  const provider = options.provider ?? 'amd';
  const modelId = options.modelId ?? roleDefaults(provider, 'compass').modelId;
  const modelInfo = { provider, modelId, mode, reasoningEffort: options.reasoningEffort ?? (provider === 'nebius' ? roleDefaults(provider, 'compass').reasoningEffort : (process.env.AMD_TOKEN_FACTORY_REASONING_EFFORT || defaultReasoningEffortFor(modelId))) };
  if (mode === 'force-failure') return { status: 'unavailable', reason: 'forced-failure', modelInfo };
  try {
    let result;
    if (mode === 'fixture') {
      const fixture = JSON.parse(await readFile(new URL('../fixtures/staffing-ranking.json', import.meta.url), 'utf8'));
      result = { schemaVersion: fixture.schemaVersion, rankedOptions: packet.candidates.map((row, i) => ({ optionId: row.optionId, rank: i + 1, rationale: fixture.rationale })) };
    } else if (mode === 'live') {
      const now = options.now ?? (() => performance.now()), deadline = now() + (options.timeoutMs ?? (Number.parseInt(process.env.COMPASS_AGENT_TIMEOUT_MS, 10) || 90_000));
      const request = (feedback) => callChatCompletion({ ...options, ...modelInfo, apiKey: options.apiKey ?? readProviderApiKey(provider), onMetadata: metadata => Object.assign(modelInfo, metadata), fetchImpl: options.fetchImpl ?? fetch,
        timeoutMs: Math.max(0, deadline - now()), systemInstruction: instruction,
        userContent: JSON.stringify(feedback ? { packet, validationErrors: feedback.slice(0,8) } : packet),
        jsonSchemaName: 'compass_staffing_ranking', jsonSchema: { type: 'object', required: ['schemaVersion', 'rankedOptions'] }, errorLabel: 'Compass staffing ranking' });
      result = await request();
      const checked = validateStaffingRanking(packet, result);
      if (!checked.valid && deadline - now() >= 1_000) result = await request(checked.errors);
      if (now() >= deadline) return { status: 'unavailable', reason: 'timeout', modelInfo };
    } else return { status: 'unavailable', reason: 'unsupported-mode', modelInfo };
    const checked = validateStaffingRanking(packet, result);
    return checked.valid ? { status: 'ok', result, modelInfo } : { status: 'unavailable', reason: 'validation-failed', modelInfo };
  } catch (error) { return { status: 'unavailable', reason: error.code === 'model-not-configured' ? 'model-not-configured' : error.name === 'AbortError' ? 'timeout' : 'provider-error', modelInfo }; }
}
