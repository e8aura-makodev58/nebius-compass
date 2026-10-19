import { mkdir as ensureScratchDirectory } from "node:fs/promises";
import {buildStaffingPacket} from '../src/staffing-service.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDemoHistory } from "../../scripts/generate-demo-history.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { createLiveStore } from "../src/live-store.mjs";
import { buildAnalytics, buildPeriodAnalytics } from "../src/analytics-service.mjs";
import { assertNoResponderSkill, createIssueAuditRecord } from "../src/live-schema.mjs";
import { HISTORY_COLLECTIONS, compactHistory, analyticHistory, retentionDays } from "../src/history-retention.mjs";
import { buildEventPlannerPacket } from "../src/event-planner.mjs";
import { buildFixPacket } from '../src/fix-evidence.mjs';
import { assertNoFaultTruth } from '../src/fault-truth.mjs';
import { buildCandidatePacket } from "../src/context-engine.mjs";
import { bootstrapDemoSeed } from "../src/demo-seed-bootstrap.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
async function files(root) {
  const result = [];
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory()) result.push(...await files(join(root, entry.name)));
      else if (entry.name.endsWith(".json")) result.push(join(root, entry.name));
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return result.sort();
}
async function bundles(root) {
  return (await Promise.all((await files(root)).map(async (file) => Object.values(JSON.parse(await readFile(file, "utf8")).issues)))).flat();
}
const sorted = (rows) => rows.toSorted((a, b) => a.id.localeCompare(b.id));

test("multi-day retention preserves decisions, exact analytics, audits, and crash recovery", { timeout: 60_000 }, async (t) => {
  const directory = await ensureScratchDirectory(join(repository, ".cache"), { recursive: true }).then(() => mkdtemp(join(repository, ".cache/retention-test-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const from = join(directory, "from.json");
  await writeFile(from, JSON.stringify(createLiveSeed()));
  const retained = join(directory, "retained.json"), unretained = join(directory, "unretained.json"), repeated = join(directory, "repeated.json");
  const options = { from, until: "2026-09-04T08:00:00Z" };
  await generateDemoHistory({ ...options, out: unretained, retentionDays: 0 });
  await generateDemoHistory({ ...options, out: retained, retentionDays: 1 });
  await generateDemoHistory({ ...options, out: repeated, retentionDays: 1 });
  assert.equal(await readFile(retained, "utf8"), await readFile(repeated, "utf8"));
  const firstFiles = await files(`${retained}.history`), secondFiles = await files(`${repeated}.history`);
  assert.equal(firstFiles.length, secondFiles.length);
  for (let i = 0; i < firstFiles.length; i += 1) assert.equal(await readFile(firstFiles[i], "utf8"), await readFile(secondFiles[i], "utf8"));
  const full = JSON.parse(await readFile(unretained, "utf8"));
  const live = JSON.parse(await readFile(retained, "utf8"));
  const archived = await bundles(`${retained}.history`);
  assert.ok(archived.length > 20);
  for (const bundle of archived) assertNoFaultTruth(bundle);
  assert.deepEqual(live.faultTruth, full.faultTruth);
  for (const issue of live.issues.filter((row) => row.status !== "RESOLVED")) assert.deepEqual(buildFixPacket(live, issue.id), buildFixPacket(full, issue.id));
  for (const collection of HISTORY_COLLECTIONS) {
    const moved = collection === "issues" ? archived.map((bundle) => bundle.issue) : archived.flatMap((bundle) => bundle[collection]);
    assert.deepEqual(sorted([...live[collection], ...moved]), sorted(full[collection]), collection);
  }
  assert.deepEqual(live.resolutionHistory, full.resolutionHistory);
  assert.deepEqual(live.simulationState, full.simulationState);
  assert.deepEqual(live.responders, full.responders);
  assert.deepEqual(live.equipment, full.equipment);
  assert.deepEqual(live.responderSkills, full.responderSkills);
  for (const issue of live.issues.filter((row) => row.status !== "RESOLVED")) assert.deepEqual(buildCandidatePacket(live, issue.id, "equivalence"), buildCandidatePacket(full, issue.id, "equivalence"));
  assert.deepEqual(live.workforceContinuity, full.workforceContinuity);
  assert.deepEqual(buildStaffingPacket(live, "retention-proof"), buildStaffingPacket(full, "retention-proof"));
  assert.deepEqual(buildAnalytics(live).workforce.recommendations, buildAnalytics(full).workforce.recommendations);
  assert.deepEqual(buildEventPlannerPacket(live), buildEventPlannerPacket(full));
  assert.equal(live.revision, full.revision);
  assert.deepEqual(buildAnalytics(live), buildAnalytics(full));
  for (const level of ["HOUR", "DAY", "WEEK", "MONTH"]) assert.deepEqual(buildPeriodAnalytics(live, { level }), buildPeriodAnalytics(full, { level }));
  assert.deepEqual(analyticHistory(live).issues.map((row) => row.id), full.issues.map((row) => row.id));

  const store = createLiveStore({ filePath: retained, archiveRoot: `${retained}.history`, historyRetentionDays: 1 });
  const id = archived[0].issue.id;
  assert.deepEqual(await store.issueAudit(id), createIssueAuditRecord(full, id));
  assertNoResponderSkill(await store.issueAudit(id));
  const page = await store.stationHistory(archived[0].issue.equipmentId, { limit: 1 });
  assert.equal(page.issues.length, 1);
  assert.ok(page.next);
  const second = await store.stationHistory(archived[0].issue.equipmentId, { limit: 1, before: page.next });
  assert.notEqual(second.issues[0].id, page.issues[0].id);
  const publicState = await store.publicSnapshot();
  assertNoResponderSkill(publicState);
  assert.equal(publicState.historyRetention, undefined);
  assert.ok(publicState.issues.length <= 210);
  assert.ok(publicState.assignments.every((row) => row.status === "ACTIVE"));

  // Crash after durable archive write but before live rename: the original
  // file still owns all rows. A retry reuses identical immutable bundles.
  const crashFile = join(directory, "crash.json");
  const original = await readFile(unretained, "utf8");
  await writeFile(crashFile, original);
  const crashRoot = join(directory, "crash-history");
  const crashing = createLiveStore({ filePath: crashFile, archiveRoot: crashRoot, historyRetentionDays: 1,
    beforeCommit: () => { throw new Error("simulated crash before live commit"); },
  });
  await assert.rejects(crashing.snapshot(), /simulated crash/);
  assert.equal(await readFile(crashFile, "utf8"), original);
  const countBefore = (await bundles(crashRoot)).length;
  const recovered = createLiveStore({ filePath: crashFile, archiveRoot: crashRoot, historyRetentionDays: 1 });
  const recoveredState = await recovered.snapshot();
  assert.equal((await bundles(crashRoot)).length, countBefore);
  assert.deepEqual(buildAnalytics(recoveredState), buildAnalytics(full));
  assert.deepEqual(await recovered.issueAudit(id), createIssueAuditRecord(full, id));
  await recovered.reset();
  assert.equal((await recovered.snapshot()).historyRetention.epoch, 1);
  assert.equal((await bundles(crashRoot)).length, countBefore, "reset preserves old epoch files");

  // A seed + its archives are published together into a fresh room root.
  const seedRoot = join(directory, "seed");
  const { mkdir, copyFile, cp } = await import("node:fs/promises");
  await mkdir(seedRoot);
  await copyFile(retained, join(seedRoot, "plant-1.json"));
  await copyFile(unretained, join(seedRoot, "plant-2.json"));
  await writeFile(join(seedRoot, "room-metadata.json"), "{}");
  await cp(`${retained}.history`, join(seedRoot, "plant-1.json.history"), { recursive: true });
  const dataRoot = join(directory, "bootstrap");
  assert.equal((await bootstrapDemoSeed({ dataRoot, seedRoot, enabled: true })).status, "SEEDED");
  const booted = createLiveStore({ filePath: join(dataRoot, "control-rooms/plant-1/live-simulation.json"), historyRetentionDays: 1 });
  assert.deepEqual(await booted.issueAudit(id), createIssueAuditRecord(full, id));
  assert.equal((await bootstrapDemoSeed({ dataRoot, seedRoot, enabled: true })).status, "EXISTING_RUNTIME_DATA");
});

test("retention protects pending work and rejects invalid windows", () => {
  assert.throws(() => retentionDays("invalid"), /non-negative/);
  assert.throws(() => retentionDays(-1), /non-negative/);
  const state = createLiveSeed();
  const issue = state.issues[0];
  issue.status = "RESOLVED"; issue.resolvedAt = "2026-08-01T08:00:00Z";
  state.resolutionAttempts.push({ issueId: issue.id, status: "ACTIVE" });
  compactHistory(state, 7);
  assert.ok(state.issues.some((row) => row.id === issue.id));
});
