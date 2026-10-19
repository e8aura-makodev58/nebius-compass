import { mkdir as ensureScratchDirectory } from "node:fs/promises";
import { readDemoSeedState } from '../src/demo-seed-reader.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { generateDemoHistory } from "../../scripts/generate-demo-history.mjs";
import { createLiveStore } from "../src/live-store.mjs";
import { migrateLiveState } from "../src/live-migration.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { assertNoResponderSkill } from "../src/live-schema.mjs";
import { buildAnalytics, buildPeriodAnalytics } from "../src/analytics-service.mjs";
import { originalLength } from "../src/history-retention.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
async function scratch(t) {
  const directory = await ensureScratchDirectory(join(repository, ".cache"), { recursive: true }).then(() => mkdtemp(join(repository, ".cache/history-test-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("one day from the committed seed is byte-identical, offline, loadable and skill-safe", { timeout: 60_000 }, async (t) => {
  const directory = await scratch(t);
  const from = join(repository, "backend/seed/demo-control-rooms/plant-1.json");
  const input = await readDemoSeedState(from);
  const until = new Date(Date.parse(input.simulationState.simulationTime) + 86_400_000).toISOString();
  const outputs = [join(directory, "first.json"), join(directory, "second.json")];
  for (const out of outputs) {
    const report = await generateDemoHistory({ from, until, out });
    assert.equal(report.fetchCalls, 0);
    assert.equal(report.credentialReads, 0);
  }
  const first = await readFile(outputs[0], "utf8");
  assert.equal(first, await readFile(outputs[1], "utf8"));
  const store = createLiveStore({ filePath: outputs[0], archiveRoot: `${outputs[0]}.history` });
  const state = await store.snapshot();
  assert.deepEqual(migrateLiveState(state), state);
  assert.equal(state.simulationState.simulationTime, until);
  assert.equal(state.simulationState.status, "PAUSED");
  assert.deepEqual(state.responderSkills, input.responderSkills);
  assert.ok(originalLength(state, "operationalEvents") > originalLength(input, "operationalEvents"));
  const { responderSkills, ...nonSkillState } = state;
  assert.doesNotMatch(JSON.stringify(nonSkillState), /responderSkills|trueMedianMinutes|trueSuccessProbability/);
  assertNoResponderSkill(await store.publicSnapshot());
  assertNoResponderSkill(buildAnalytics(state));
  for (const level of ["DAY", "WEEK", "MONTH"]) assertNoResponderSkill(buildPeriodAnalytics(state, { level }));
});

test("the sequential generator adapter produces the same state as the normal durable store", { timeout: 30_000 }, async (t) => {
  const directory = await scratch(t);
  const from = join(directory, "seed.json");
  await writeFile(from, JSON.stringify(createLiveSeed()));
  const options = { from, until: "2026-09-01T09:00:00.000Z" };
  const memory = join(directory, "memory.json");
  const durable = join(directory, "durable.json");
  await generateDemoHistory({ ...options, out: memory });
  await generateDemoHistory({ ...options, out: durable, durableStorePath: join(directory, "live-store.json") });
  assert.equal(await readFile(memory, "utf8"), await readFile(durable, "utf8"));
  const state = JSON.parse(await readFile(memory, "utf8"));
  assert.ok(state.dispatchOffers.length > 0);
  assert.ok(state.resolutionHistory.length > 48);
});

test("history generation rejects live data output paths and invalid horizons", async (t) => {
  const directory = await scratch(t);
  await assert.rejects(generateDemoHistory({ until: "invalid", out: join(directory, "invalid.json") }), /ISO timestamp/);
  await assert.rejects(generateDemoHistory({ until: "2026-12-01T08:00:00Z", out: join(repository, "backend/data/must-not-create/history.json") }), /Refusing to write/);
});

test('synthetic staffing examples use canonical actions, complete all four paths and repeat byte-for-byte', {timeout:60000}, async(t)=>{
  const directory=await scratch(t), from=join(directory,'example-seed.json');
  await writeFile(from,JSON.stringify(createLiveSeed()));
  const options={from,until:'2026-09-01T12:00:00.000Z',staffingExamples:'yes'};
  const first=join(directory,'examples-first.json'),second=join(directory,'examples-second.json');
  for(const out of [first,second]){const report=await generateDemoHistory({...options,out});assert.equal(report.fetchCalls,0);assert.equal(report.credentialReads,0);}
  assert.equal(await readFile(first,'utf8'),await readFile(second,'utf8'));
  const state=JSON.parse(await readFile(first,'utf8')),decisions=state.workforceContinuity.staffingAudit.filter((r)=>r.action==='STAFFING_DECISION');
  for(const kind of ['REJECTED','EXPIRED','AUTO_APPROVED'])assert.ok(decisions.some((r)=>r.outcome===kind),kind);
  assert.ok(decisions.some((r)=>['APPROVED_TOP','APPROVED_ALTERNATIVE'].includes(r.outcome)));
  assert.equal(state.workforceContinuity.staffingApproval,'AUTO_APPROVE_TOP');
  assert.ok(state.issues.length>10); // real work accumulated behind the actionable cap
  assert.ok(state.resolutionHistory.length>createLiveSeed().resolutionHistory.length);
  assertNoResponderSkill(buildAnalytics(state));
});
