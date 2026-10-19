// Live model measurement (AMD or Nebius Token Factory, --provider). Opt-in and manual: it spends the
// shared team quota, so it is never part of `npm test`.
//
//   npm run measure:amd -- --models MiMo-V2.6-Flash,GLM-5.3-Flash:low --samples 3
//   npm run measure:amd -- --provider nebius --models nvidia/nemotron-3-super-120b-a12b:default,nvidia/Nemotron-3_5-Lightning:off
//
// Timeouts default to the app's own: 90s for a ranking (COMPASS_AGENT_TIMEOUT_MS)
// and 30s for a planner proposal (COMPASS_EVENT_PLANNER_TIMEOUT_MS).
//
// Each model is "<id>" or "<id>:<reasoning effort>". Calls go through the same
// request functions the app uses (requestAgentRecommendation and
// requestEventProposal), so they pass through the provider's own limits and
// validators. Calls run one at a time. The key comes from
// AMD_TOKEN_FACTORY_API_KEY or AMD_TOKEN_FACTORY_API_KEY_FILE and is never
// printed.
import { parseArgs } from "node:util";
import { createInitialDemoState } from "../backend/src/demo-state.mjs";
import { buildCandidatePacket } from "../backend/src/context-engine.mjs";
import { requestAgentRecommendation } from "../backend/src/agent.mjs";
import { buildEventPlannerPacket, requestEventProposal, validateEventProposal } from "../backend/src/event-planner.mjs";
import { createLiveSeed } from "../backend/seed/live-simulation.mjs";
import { AMD_DEFAULT_MODEL_ID, NEBIUS_ROLE_DEFAULTS, defaultReasoningEffortFor, readProviderApiKey } from "../backend/src/model-provider.mjs";

const { values } = parseArgs({
  options: {
    provider: { type: "string", default: "amd" },
    models: { type: "string" },
    samples: { type: "string", default: "3" },
    "skip-planner": { type: "boolean", default: false },
    "skip-ranking": { type: "boolean", default: false },
    "timeout-ms": { type: "string", default: "90000" },
    "planner-timeout-ms": { type: "string", default: "30000" },
  },
});

const provider = values.provider === "nebius" ? "nebius" : "amd";
const apiKey = readProviderApiKey(provider);
if (!apiKey) {
  const prefix = provider === "nebius" ? "NEBIUS" : "AMD";
  console.error(`No ${prefix} key: set ${prefix}_TOKEN_FACTORY_API_KEY or ${prefix}_TOKEN_FACTORY_API_KEY_FILE.`);
  process.exit(1);
}
const samples = Math.max(1, Number.parseInt(values.samples, 10) || 1);
const timeoutMs = Number.parseInt(values["timeout-ms"], 10) || 90000;
const plannerTimeoutMs = Number.parseInt(values["planner-timeout-ms"], 10) || 30000;
const models = (values.models ?? (provider === "nebius" ? NEBIUS_ROLE_DEFAULTS.compass.modelId : AMD_DEFAULT_MODEL_ID)).split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
  const [modelId, effort] = entry.split(":");
  return { modelId, reasoningEffort: effort || (provider === "nebius" ? "default" : defaultReasoningEffortFor(modelId)) };
});

const state = createInitialDemoState();
const packet = buildCandidatePacket(state, state.activeIssueId, "rec-measure");
const expectedTop = "R-ENGR028";
const seed = createLiveSeed();
const plannerPacket = buildEventPlannerPacket(seed);

const median = (list) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const seconds = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);

const rows = [];
for (const { modelId, reasoningEffort } of models) {
  const options = { mode: "live", provider, apiKey, modelId, reasoningEffort, timeoutMs };
  const agent = { valid: 0, expectedTop: 0, latencies: [], failures: [] };
  for (let i = 0; i < (values["skip-ranking"] ? 0 : samples); i++) {
    const started = Date.now();
    const outcome = await requestAgentRecommendation(packet, options);
    const elapsed = Date.now() - started;
    if (outcome.status === "ok") {
      agent.valid += 1;
      agent.latencies.push(elapsed);
      if (outcome.result.topRecommendation?.responderId === expectedTop) agent.expectedTop += 1;
    } else {
      agent.failures.push(outcome.reason === "validation-failed" ? `invalid: ${(outcome.errors ?? []).slice(0, 2).join("; ")}` : `${outcome.reason}: ${String(outcome.message ?? "").slice(0, 120)}`);
    }
    console.error(`${modelId} agent ${i + 1}/${samples}: ${outcome.status} ${outcome.reason ?? ""} ${seconds(elapsed)}`);
  }
  const planner = { valid: 0, latencies: [], failures: [] };
  if (!values["skip-planner"]) {
    for (let i = 0; i < samples; i++) {
      const started = Date.now();
      const outcome = await requestEventProposal(plannerPacket, { ...options, timeoutMs: plannerTimeoutMs });
      const elapsed = Date.now() - started;
      const check = outcome.status === "ok" ? validateEventProposal(seed, outcome.output) : null;
      if (check?.valid) {
        planner.valid += 1;
        planner.latencies.push(elapsed);
      } else {
        planner.failures.push(check ? `invalid: ${check.errors.slice(0, 2).join("; ")}` : `${outcome.reason}: ${String(outcome.message ?? "").slice(0, 120)}`);
      }
      console.error(`${modelId} planner ${i + 1}/${samples}: ${check?.valid ? "valid" : "failed"} ${seconds(elapsed)}`);
    }
  }
  rows.push({ modelId, reasoningEffort, agent, planner });
}

console.log(`\nMeasured ${new Date().toISOString()} · ${provider} · ${samples} sample(s) per model · timeouts ${seconds(timeoutMs)} ranking / ${seconds(plannerTimeoutMs)} planner · expected top pick ${expectedTop}\n`);
console.log("| Model (reasoning) | Ranking valid | Expected top | Ranking median | Planner valid | Planner median | Failures |");
console.log("|---|---|---|---|---|---|---|");
for (const { modelId, reasoningEffort, agent, planner } of rows) {
  const plannerCells = values["skip-planner"] ? ["—", "—"] : [`${planner.valid}/${samples}`, seconds(median(planner.latencies))];
  const rankingCells = values["skip-ranking"] ? ["—", "—", "—"] : [`${agent.valid}/${samples}`, `${agent.expectedTop}/${samples}`, seconds(median(agent.latencies))];
  const counts = new Map();
  for (const failure of [...agent.failures.map((f) => `ranking ${f}`), ...planner.failures.map((f) => `planner ${f}`)]) counts.set(failure, (counts.get(failure) ?? 0) + 1);
  const failures = [...counts].map(([text, n]) => (n > 1 ? `${text} ×${n}` : text)).join(" · ").replaceAll("|", "/") || "—";
  console.log(`| ${modelId} (${reasoningEffort}) | ${rankingCells[0]} | ${rankingCells[1]} | ${rankingCells[2]} | ${plannerCells[0]} | ${plannerCells[1]} | ${failures} |`);
}
