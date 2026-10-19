import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { runDeterministicSoak, runLatentConvergence } from "../src/evaluation.mjs";
import { createLiveStore } from "../src/live-store.mjs";

test("latent observations converge toward hidden success and median parameters", () => {
  const skill = createLiveSeed().responderSkills.find((entry) => entry.responderId === "R-TECH216" && entry.issueClass === "B");
  const result = runLatentConvergence(skill);
  assert.ok(Math.abs(result.observedSuccessRate - skill.trueSuccessProbability) < 0.04);
  assert.ok(Math.abs(result.observedMedian - skill.trueMedianMinutes) / skill.trueMedianMinutes < 0.05);
  assert.ok(Math.abs(result.observedSuccessRate - skill.trueSuccessProbability) < Math.abs(1 - skill.trueSuccessProbability));
  assert.ok(Math.abs(result.observedMedian - skill.trueMedianMinutes) < Math.abs(7 - skill.trueMedianMinutes));
});

// The soak is a deterministic, CPU-bound computation; its wall-clock time
// scales with the host's single-core speed and shared load, so the timeout is
// only a guard against a true hang, not a performance assertion.
test("one-hundred-opportunity deterministic soak meets seed disagreement and integrity gates", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-soak-"));
  const store = createLiveStore({ filePath: join(directory, "live.json"), seedFactory: () => {
    const state=createLiveSeed();
    // This experiment isolates the existing responder-ranking path, not investigation approval.
    state.investigationPolicy.investigationShare=0;
    return state;
  } });
  const report = await runDeterministicSoak(store, 100);
  assert.equal(report.opportunities, 100);
  assert.ok(report.disagreementRate >= 0.25, JSON.stringify(report));
  assert.ok(report.evidenceDrivenShare >= 0.10, JSON.stringify(report));
  assert.equal(report.duplicateActiveResponderCount, 0);
  assert.equal(report.activeAssignmentCount, 0);
  assert.ok(report.activeIssueCount <= 3);
  assert.ok(report.resolutionHistoryCount >= 148);
});
