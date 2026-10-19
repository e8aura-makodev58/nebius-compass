#!/usr/bin/env node
/**
 * Compass Investigator evaluation (plan v2 §4, N5). Outside `npm test`.
 *
 *   npm run eval:investigator -- --mode fixture            # hermetic, recorded/synthetic responses
 *   npm run eval:investigator -- --mode live --samples 1   # spends Nebius credit (main agent only)
 *   npm run eval:investigator -- --json results.json       # also write raw rows
 *
 * The scenario runner comes from the investigator module (N3a). It must export
 * `runScenario(scenario, { mode, samples })` → `[{ scenario, record, modelCalls }]` that
 * builds the scenario's setup tags as state, submits the report, confirms the expected
 * interpretation as an operator would, and returns the investigation record (plan §3.2).
 * Scoring is `scripts/eval/score.mjs`; numbers are reported with denominators only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { formatRatio, scoreScenarioRun, scorePairedReplay } from './eval/score.mjs';

const { values } = parseArgs({ options: {
  mode: { type: 'string', default: 'fixture' },
  samples: { type: 'string', default: '1' },
  only: { type: 'string' },
  json: { type: 'string' },
  replay: { type: 'boolean', default: false },
  'held-out-days': { type: 'string', default: '7' },
  limit: { type: 'string' },
} });
if (!['fixture', 'live'].includes(values.mode)) { console.error('--mode must be fixture or live'); process.exit(2); }

if (values.replay) {
  const { runPairedReplay } = await import('../backend/src/replay-runner.mjs');
  const result = await runPairedReplay({mode:values.mode,heldOutDays:Number(values['held-out-days']),...(values.limit!==undefined?{limit:Number(values.limit)}:{})});
  const score = scorePairedReplay(result.pairs);
  console.log(`\nPaired first-fix replay · mode ${values.mode} · ${result.meta.heldOutWindow.start} through ${result.meta.heldOutWindow.end}\n`);
  console.log('| Metric | Result |\n|---|---|');
  console.log(`| Eligible / selected | ${result.meta.counts.eligible} / ${score.heldOut} |`);
  console.log(`| Coverage | ${formatRatio(score.coverage)} |`);
  for (const [reason,count] of Object.entries(score.excluded)) console.log(`| Excluded ${reason} | ${count}/${score.heldOut} |`);
  for (const [arm,rate] of Object.entries(score.firstTimeFix)) console.log(`| First-time fix: ${arm} | ${formatRatio(rate)} |`);
  for (const [source,rate] of Object.entries(score.investigatorBySource)) console.log(`| Investigator first-time fix by source: ${source} | ${formatRatio(rate)} |`);
  for (const [name,counts] of Object.entries({baseline:score.discordantVsBaseline,deterministic:score.discordantVsDeterministic})) console.log(`| Discordant vs ${name} | ${JSON.stringify(counts)} (${score.coverage.numerator} pairs) |`);
  console.log(`| Fallback / timeout / repaired / raw invalid | ${result.meta.counts.fallback} / ${result.meta.counts.timeouts} / ${result.meta.counts.repaired} / ${result.meta.counts.rawInvalid} (of ${score.heldOut}) |`);
  console.log(`| Seed SHA-256 | ${result.meta.seedHash} |`);
  console.log(`| Runtime | ${(result.meta.runtimeMs/1000).toFixed(2)} s |`);
  if(values.json) writeFileSync(values.json,JSON.stringify({...result,score},null,2));
} else {
const { scenarios, version } = JSON.parse(readFileSync(new URL('../fixtures/investigation/scenarios.json', import.meta.url), 'utf8'));
const selected = values.only ? scenarios.filter((s) => values.only.split(',').includes(s.id)) : scenarios;

let runner;
try { runner = await import('../backend/src/investigation-eval.mjs'); }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  console.error(`The investigator is not built yet (plan N3a): backend/src/investigation-eval.mjs is missing.\n${selected.length} scenarios from ${version} are ready to run once it exists.`);
  process.exit(3);
}

const samples = Math.max(1, Number.parseInt(values.samples, 10) || 1);
const results = [];
for (const scenario of selected) {
  for (const result of await runner.runScenario(scenario, { mode: values.mode, samples })) results.push(result);
  console.error(`${scenario.id} done`);
}
const score = scoreScenarioRun(results);
const line = (label, value) => console.log(`| ${label} | ${value} |`);
console.log(`\nInvestigator evaluation · ${new Date().toISOString()} · mode ${values.mode} · ${version} · ${score.scenarios} runs\n`);
console.log('| Metric | Result |\n|---|---|');
line('Outcome class matches expected', formatRatio(score.outcomeAccuracy));
line('Abstention precision', formatRatio(score.abstentionPrecision));
line('Abstention recall', formatRatio(score.abstentionRecall));
line('Citation validity (accepted outputs)', formatRatio(score.citationValidity));
line('Safety violations (accepted outputs)', `${score.safetyViolations.count} in ${score.safetyViolations.acceptedOutputs}`);
line('Interpretation agreement', formatRatio(score.interpretationAgreement));
line('Hazard/input policy decided without a model call', formatRatio(score.policyWithoutModel));
line('Accepted / repaired / deterministic fallback / raw invalid', `${score.counts.accepted} / ${score.counts.repaired} / ${score.counts.fallback} / ${score.counts.rawInvalid}`);
line('Latency p50 / p95', score.latencyMs.samples ? `${(score.latencyMs.p50 / 1000).toFixed(1)} s / ${(score.latencyMs.p95 / 1000).toFixed(1)} s (${score.latencyMs.samples})` : 'n/a');
line('Tokens per investigation p50 / p95', score.tokensPerInvestigation.samples ? `${score.tokensPerInvestigation.p50} / ${score.tokensPerInvestigation.p95}` : 'n/a');
console.log('\n| Scenario | Category | Expected | Actual | Pass | Source (fallback) | Calls | Notes |\n|---|---|---|---|---|---|---|---|');
for (const r of score.rows) console.log(`| ${r.id} | ${r.category} | ${r.expected} | ${r.actual} | ${r.pass ? 'yes' : 'no'} | ${r.source ?? '—'}${r.fallbackReason ? ` (${r.fallbackReason})` : ''} | ${r.calls ?? '—'} | ${r.notes.join('; ').replaceAll('|', '/') || '—'} |`);
if (values.json) writeFileSync(values.json, JSON.stringify({ mode: values.mode, version, score }, null, 2));

}
