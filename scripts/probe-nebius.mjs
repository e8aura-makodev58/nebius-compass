#!/usr/bin/env node
/**
 * Live Nebius Token Factory capability probe (plan v2 N0). Manual only: it spends API
 * credit and is never part of `npm test`. Reads the key from NEBIUS_TOKEN_FACTORY_API_KEY
 * or the file named by NEBIUS_TOKEN_FACTORY_API_KEY_FILE; never prints it.
 *
 * Usage: node scripts/probe-nebius.mjs [--models id,id] [--checks json,json-nothink,tools,tools-nothink,thinking] [--repeat N]
 * Prints one Markdown row per (model, check).
 */
import { readFileSync } from 'node:fs';

const BASE = process.env.NEBIUS_TOKEN_FACTORY_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1';
const key = (process.env.NEBIUS_TOKEN_FACTORY_API_KEY || (process.env.NEBIUS_TOKEN_FACTORY_API_KEY_FILE ? readFileSync(process.env.NEBIUS_TOKEN_FACTORY_API_KEY_FILE, 'utf8') : '')).trim();
if (!key) { console.error('No key: set NEBIUS_TOKEN_FACTORY_API_KEY or NEBIUS_TOKEN_FACTORY_API_KEY_FILE'); process.exit(2); }
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1].split(',') : fallback; };
const models = arg('models', ['nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B', 'nvidia/Nemotron-3_5-Lightning', 'nvidia/nemotron-3-super-120b-a12b', 'nvidia/Nemotron-3-Ultra-550b-a55b']);
const checks = arg('checks', ['json', 'tools', 'thinking']);
const repeat = Number(arg('repeat', ['1'])[0]);
const NO_THINK = { chat_template_kwargs: { enable_thinking: false } };

async function chat(body, timeoutMs = 120_000) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}/chat/completions`, { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const text = await response.text();
    const ms = Math.round(performance.now() - started);
    let json = null; try { json = JSON.parse(text); } catch { /* keep raw text for the error column */ }
    return { status: response.status, ms, json, error: response.ok ? null : text.slice(0, 160).replace(/\s+/g, ' ') };
  } catch (error) { return { status: 0, ms: Math.round(performance.now() - started), json: null, error: error.name === 'AbortError' ? 'timeout' : error.message }; }
  finally { clearTimeout(timer); }
}

const CANDIDATES = { candidates: [{ id: 'R-A', distanceBand: 'NEAR', sameSymptomFixes: 4, sameSymptomSuccesses: 3 }, { id: 'R-B', distanceBand: 'FAR', sameSymptomFixes: 1, sameSymptomSuccesses: 0 }] };
const JSON_SYSTEM = 'You rank only the supplied candidate ids. Reply with JSON only: {"ranking":[{"id":string,"rank":integer,"rationale":string}]}. Rationale is qualitative, at most 160 characters, and contains no digits.';
const TOOLS = [{ type: 'function', function: { name: 'search_cases', description: 'Read-only search of resolved cases by symptom code.', parameters: { type: 'object', properties: { symptomCode: { type: 'string', enum: ['A-DRIFT', 'A-UNSTABLE', 'A-INTERRUPT'] } }, required: ['symptomCode'], additionalProperties: false } } }];

function usage(json) { const u = json?.usage; return u ? `${u.prompt_tokens}/${u.completion_tokens}` : '—'; }
function reasoningShown(message) { return message?.reasoning_content || message?.reasoning ? 'yes' : 'no'; }

async function checkJson(model, extra = {}) {
  const r = await chat({ model, max_tokens: 1024, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: JSON_SYSTEM }, { role: 'user', content: JSON.stringify(CANDIDATES) }], ...extra });
  if (!r.json?.choices) return { ...r, verdict: `HTTP ${r.status} ${r.error ?? ''}` };
  const message = r.json.choices[0].message;
  let verdict;
  try {
    const parsed = JSON.parse(message.content);
    const ids = parsed.ranking?.map((row) => row.id).sort().join();
    const digits = parsed.ranking?.some((row) => /\d/.test(row.rationale ?? ''));
    verdict = ids === 'R-A,R-B' ? (digits ? 'valid ids; digits in prose' : `valid; top ${parsed.ranking.find((row) => row.rank === 1)?.id}`) : `wrong ids: ${ids}`;
  } catch { verdict = `non-JSON content (${(message.content ?? '').slice(0, 40).replace(/\s+/g, ' ')}…)`; }
  return { ...r, verdict: `${verdict} · finish ${r.json.choices[0].finish_reason} · reasoning ${reasoningShown(message)}` };
}

async function checkTools(model, extra = {}) {
  const messages = [{ role: 'system', content: 'Investigate with the tool before answering. Answer in one sentence without digits.' }, { role: 'user', content: 'Field report: station output drifts from its reference after an hour. Which past cases are relevant?' }];
  const first = await chat({ model, max_tokens: 1024, temperature: 0, tools: TOOLS, tool_choice: 'auto', messages, ...extra });
  const call = first.json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return { ...first, verdict: first.json ? `no tool call (finish ${first.json.choices?.[0]?.finish_reason})` : `HTTP ${first.status} ${first.error ?? ''}` };
  let args; try { args = JSON.parse(call.function.arguments); } catch { return { ...first, verdict: `bad tool arguments: ${call.function.arguments}` }; }
  messages.push(first.json.choices[0].message, { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ cases: [{ caseId: 'CASE-ISSUE-0101', symptomCode: args.symptomCode, firstTimeFix: true }] }) });
  const second = await chat({ model, max_tokens: 1024, temperature: 0, tools: TOOLS, messages, ...extra });
  const final = second.json?.choices?.[0]?.message?.content ?? '';
  return { status: second.status, ms: first.ms + second.ms, json: second.json, verdict: `call ${call.function.name}(${JSON.stringify(args)}) → ${second.json ? `final ${final.includes('CASE-ISSUE-0101') ? 'cites case' : 'no citation'} · finish ${second.json.choices?.[0]?.finish_reason}` : `HTTP ${second.status} ${second.error ?? ''}`}` };
}

const THINKING_VARIANTS = { 'enable_thinking:false': { chat_template_kwargs: { enable_thinking: false } }, 'enable_thinking:true': { chat_template_kwargs: { enable_thinking: true } }, 'reasoning_effort:low': { reasoning_effort: 'low' }, '/no_think system': null };

console.log('| Model | Check | HTTP | ms | Tokens in/out | Result |');
console.log('|---|---|---|---|---|---|');
for (const model of models) {
  const rows = [];
  for (let i = 0; i < repeat; i++) {
    if (checks.includes('json')) rows.push(['json (default)', await checkJson(model)]);
    if (checks.includes('json-nothink')) rows.push(['json enable_thinking:false', await checkJson(model, NO_THINK)]);
    if (checks.includes('tools')) rows.push(['tools (default)', await checkTools(model)]);
    if (checks.includes('tools-nothink')) rows.push(['tools enable_thinking:false', await checkTools(model, NO_THINK)]);
  }
  if (checks.includes('thinking')) for (const [name, extra] of Object.entries(THINKING_VARIANTS)) {
    if (extra) rows.push([`json ${name}`, await checkJson(model, extra)]);
    else {
      const r = await chat({ model, max_tokens: 1024, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: `/no_think\n${JSON_SYSTEM}` }, { role: 'user', content: JSON.stringify(CANDIDATES) }] });
      rows.push([`json ${name}`, { ...r, verdict: r.json?.choices ? `reasoning ${reasoningShown(r.json.choices[0].message)} · finish ${r.json.choices[0].finish_reason}` : `HTTP ${r.status} ${r.error ?? ''}` }]);
    }
  }
  for (const [name, r] of rows) console.log(`| ${model} | ${name} | ${r.status} | ${r.ms} | ${usage(r.json)} | ${String(r.verdict).replaceAll('|', '/')} |`);
}
