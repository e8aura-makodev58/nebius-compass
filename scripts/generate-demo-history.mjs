/** Offline, deterministic history generation. No server, settings or provider credentials. */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFile, writeFile, mkdir, rename, realpath } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repository = fileURLToPath(new URL("../", import.meta.url));

export function generateDemoHistory(options, onProgress = () => {}) {
  // A worker owns its Date/fetch/environment guards; importing this module
  // cannot replace globals in the application or the hermetic test runner.
  return new Promise((resolveResult, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { demoHistory: true, options }, env: { NODE_ENV: "test", COMPASS_HISTORY_RETENTION_DAYS: process.env.COMPASS_HISTORY_RETENTION_DAYS ?? "7" },
    });
    let result;
    worker.on("message", (message) => {
      if (message.progress) onProgress(message.progress);
      else result = message.result;
    });
    worker.on("error", reject);
    worker.on("exit", (code) => code === 0 && result ? resolveResult(result) : reject(new Error(`History generation exited with code ${code}`)));
  });
}

async function generate(options) {
  const startedReal = performance.now();
  const room = options.room ?? "plant-1";
  if (!["plant-1", "plant-2"].includes(room)) throw new Error("Unknown room; use plant-1 or plant-2");
  const from = resolve(options.from ?? join(repository, "backend/seed/demo-control-rooms", `${room}.json`));
  const out = resolve(options.out ?? join(repository, ".cache/generated-demo-history", `${room}.json`));
  const until = Date.parse(options.until);
  if (!Number.isFinite(until) || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(options.until ?? "")) throw new Error("--until requires an ISO timestamp with a timezone");
  // Explicit output paths are supported, but never target live data, even
  // through a symlink. Generation and installation are separate operations.
  let existingDirectory = dirname(out);
  const missingDirectories = [];
  while (true) {
    try { existingDirectory = await realpath(existingDirectory); break; }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      missingDirectories.unshift(relative(dirname(existingDirectory), existingDirectory));
      existingDirectory = dirname(existingDirectory);
    }
  }
  const outputDirectory = resolve(existingDirectory, ...missingDirectories);
  const dataDirectory = join(repository, "backend/data");
  const insideData = relative(dataDirectory, outputDirectory);
  if (insideData === "" || (!insideData.startsWith("..") && !isAbsolute(insideData))) throw new Error("Refusing to write backend/data; use a scratch output or a committed seed");
  await mkdir(dirname(out), { recursive: true });
  const { readDemoSeedState } = await import('../backend/src/demo-seed-reader.mjs');
  let state = await readDemoSeedState(from);
  let fetchCalls = 0;
  let credentialReads = 0;
  globalThis.fetch = () => { fetchCalls += 1; throw new Error("Network is forbidden during history generation"); };
  process.env = new Proxy(process.env, { get(target, name) {
    if (/^(AMD|NEBIUS)_TOKEN_FACTORY_API_KEY(?:_FILE)?$/.test(name)) { credentialReads += 1; throw new Error("Credential reads are forbidden during history generation"); }
    return target[name];
  } });
  const RealDate = Date;
  let auditTime = state.simulationState.simulationTime;
  // Audit wall timestamps are pinned to the engine's simulated time. Explicit
  // date parsing/construction is unchanged, and existing input rows are retained.
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [auditTime])); }
    static now() { return RealDate.parse(auditTime); }
  };
  const { migrateLiveState } = await import("../backend/src/live-migration.mjs");
  const { validateLiveState, createPublicLiveSnapshot, assertNoResponderSkill } = await import("../backend/src/live-schema.mjs");
  const { createLiveRuntime } = await import("../backend/src/live-runtime.mjs");
  const { createSimulationClock } = await import("../backend/src/simulation-clock.mjs");
  const { ensureIssueNarrative } = await import("../backend/src/investigation-records.mjs");
  const { compactHistory, retentionDays } = await import("../backend/src/history-retention.mjs");
  const { writeHistoryArchive, copyHistoryArchive, assertHistoryArchivePresent } = await import("../backend/src/history-archive.mjs");
  const days = retentionDays(options.retentionDays ?? process.env.COMPASS_HISTORY_RETENTION_DAYS);
  const archiveRoot = `${out}.history`;
  if (`${from}.history` !== archiveRoot) await copyHistoryArchive(`${from}.history`, archiveRoot);
  state = migrateLiveState(state);
  const narrate = (draft) => {
    for (const issue of draft.issues) if (issue.narrativeSource === 'template' || !issue.reportNarrative) {
      delete issue.reportNarrative;
      ensureIssueNarrative(issue, { noisy: true });
    }
  };
  narrate(state);
  // Explicit history-generation policy: retain autonomous surge behavior with audit.
  const { updateStaffingPolicy, decideStaffing } = await import('../backend/src/staffing-service.mjs');
  const { updateInvestigationPolicy } = await import('../backend/src/investigation-service.mjs');
  updateInvestigationPolicy(state,{investigationApproval:'AUTO_APPROVE_SAFE',investigationShare:Number(options.investigationShare ?? state.investigationPolicy.investigationShare),expectedRevision:state.investigationPolicy.revision});
  updateStaffingPolicy(state, { staffingApproval: 'AUTO_APPROVE_TOP', expectedRevision: state.workforceContinuity.staffingPolicyRevision });
  await assertHistoryArchivePresent(archiveRoot, state);
  await writeHistoryArchive(archiveRoot, state, compactHistory(state, days, { force: true }));
  const started = Date.parse(state.simulationState.simulationTime);
  if (until <= started) throw new Error("--until must be later than the input simulation time");

  // Borrowed read views are safe only in this isolated sequential worker. All
  // records/mutations come from the real engine. A failure aborts without an
  // output commit; production's rollback, locking and disk store are unchanged.
  const memoryStore = {
    async snapshot() { return state; },
    async publicSnapshot() { return createPublicLiveSnapshot(state); },
    async mutate(label, mutation) {
      const result = await mutation(state);
      narrate(state);
      state.revision += 1;
      await writeHistoryArchive(archiveRoot, state, compactHistory(state, days));
      return { label, revision: state.revision, result: structuredClone(result) };
    },
  };
  // The durable variant is a test seam for checking adapter equivalence.
  let store = memoryStore;
  if (options.durableStorePath) {
    const { createLiveStore } = await import("../backend/src/live-store.mjs");
    await writeFile(options.durableStorePath, `${JSON.stringify(state, null, 2)}\n`);
    const durable = createLiveStore({ filePath: options.durableStorePath, historyRetentionDays: days, archiveRoot });
    store = { ...durable, mutate: (label, mutation) => durable.mutate(label, async (draft) => {
      const result = await mutation(draft);
      narrate(draft);
      return result;
    }) };
  }
  const offline = { mode: "force-failure" };
  const runtime = createLiveRuntime({ store, plannerOptions: offline, agentOptions: offline, investigatorOptions:{mode:'force-failure',now:()=>0},narratorOptions:{mode:'force-failure',noisy:true,now:()=>0} });
  const clock = createSimulationClock(store);
  await runtime.reconcileStartup();
  await runtime.agentWorkIdle();
  await clock.setSpeed(60);
  await clock.resume();
  if (options.durableStorePath) state = await store.snapshot();
  let ticks = 0;
  // Optional, disclosed synthetic central-command examples use canonical actions.
  // Normal generation keeps AUTO_APPROVE_TOP throughout.
  let staffingExamplePhase = options.staffingExamples === 'yes' ? 0 : 4;

  let nextProgress = started + 86_400_000;
  while (Date.parse(state.simulationState.simulationTime) < until) {
    const now = Date.parse(state.simulationState.simulationTime);
    // Cap idle gaps at one simulated minute, and stop exactly on earlier due
    // events/offers/resolutions/handovers. Never force a completion or insert a row.
    const due = [state.simulationState.nextEventAt,
      ...(state.investigations ?? []).filter((row)=>row.status==='READY').map((row)=>row.deadline),
      ...state.resolutionAttempts.filter((row) => row.status === "ACTIVE").flatMap((row) => [row.resolutionDueAt, row.reviewDueAt, row.assistance?.cooldownUntil]),
      ...(state.dispatchOffers ?? []).filter((row) => row.status === "PENDING").map((row) => row.responseDueAt),
      ...state.workforceContinuity.staffingRecommendations.filter((r) => r.status === 'PENDING').map((r) => r.deadline),
      state.workforceContinuity.nextStaffingReviewAt, state.workforceContinuity.nextHandoverAt,
      ...state.workforceContinuity.temporaryRepairs.filter((row) => row.status === "SCHEDULED").map((row) => row.dueAt),
      ...state.responders.map((row) => row.extensionExpiryClaimedAt ? null : row.extensionEndsAt),
    ].filter(Boolean).map(Date.parse).filter((time) => Number.isFinite(time) && time > now);
    const next = Math.min(until, now + 60_000, ...due);
    auditTime = new RealDate(next).toISOString();
    await runtime.advanceSimulation((next - now) / 60);
    if (options.durableStorePath) state = await store.snapshot();
    if (staffingExamplePhase < 4) {
      const rec = state.workforceContinuity.staffingRecommendations.find((r) => r.status === 'PENDING');
      if (rec && staffingExamplePhase < 2) {
        const example = await store.mutate('synthetic-central-command-example', (draft) => decideStaffing(draft, rec.id, {decision: staffingExamplePhase === 0 ? 'approve' : 'reject', optionId: rec.rankedOptions[0].optionId, expectedRevision: rec.revision, ...(staffingExamplePhase === 1 ? {reason:'Synthetic command-center example: retain current coverage.'} : {})}));
        if (['APPROVED_TOP','APPROVED_ALTERNATIVE','REJECTED'].includes(example.result.status)) staffingExamplePhase++;
        if (staffingExamplePhase === 2) await store.mutate('example-expiry-policy', (draft) => updateStaffingPolicy(draft, {staffingApproval:'OPERATOR',expectedRevision:draft.workforceContinuity.staffingPolicyRevision}));
      } else if (staffingExamplePhase === 2 && state.workforceContinuity.staffingAudit.some((r) => r.outcome === 'EXPIRED')) {
        await store.mutate('restore-history-auto-policy', (draft) => updateStaffingPolicy(draft, {staffingApproval:'AUTO_APPROVE_TOP',expectedRevision:draft.workforceContinuity.staffingPolicyRevision}));
        staffingExamplePhase=3;
      }
      if (staffingExamplePhase === 3 && state.workforceContinuity.staffingAudit.some((r)=>r.outcome==='AUTO_APPROVED')) staffingExamplePhase=4;
      if (options.durableStorePath) state = await store.snapshot();
      // A disclosed synthetic backlog window uses the actual Force Event action,
      // never inserted observations or forced resolution outcomes. Stop as soon
      // as the approval, rejection, expiry and policy example have all occurred.
      if (staffingExamplePhase < 4 && state.issues.filter((i)=>['PENDING','RECOMMENDATION_READY','OFFER_PENDING','ASSIGNED'].includes(i.status)).length < state.simulationConfig.maxActiveIssues) {
        await runtime.forceNextEvent();
        if (options.durableStorePath) state = await store.snapshot();
      }
    }
    ticks += 1;
    if (Date.parse(state.simulationState.simulationTime) >= nextProgress) {
      validateLiveState(state);
      parentPort.postMessage({ progress: { simulationTime: state.simulationState.simulationTime, issues: state.issues.length, ticks } });
      nextProgress += 86_400_000;
    }
  }
  if (options.staffingExamples === 'yes' && staffingExamplePhase !== 4) throw new Error('Generation interval did not include the requested approval, rejection, expiry and policy examples');
  await clock.pause();
  // Store snapshots are frozen; final compaction needs a private copy.
  if (options.durableStorePath) state = structuredClone(await store.snapshot());
  await writeHistoryArchive(archiveRoot, state, compactHistory(state, days, { force: true }));
  validateLiveState(state);
  const { responderSkills, ...nonSkillState } = state;
  if (/responderSkills|trueMedianMinutes|trueSuccessProbability/.test(JSON.stringify(nonSkillState))) throw new Error("Hidden skill leaked outside responderSkills");
  assertNoResponderSkill(createPublicLiveSnapshot(state));
  if (fetchCalls || credentialReads) throw new Error(`Offline boundary violated: ${fetchCalls} fetch calls, ${credentialReads} credential reads`);
  const bytes = `${JSON.stringify(state)}\n`;
  const temporary = `${out}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, out);
  return { room, from, out, startedAt: new RealDate(started).toISOString(), until: state.simulationState.simulationTime,
    bytes: Buffer.byteLength(bytes), ticks, issues: state.issues.length + (state.historyRetention?.facts.issues.length ?? 0), resolutions: state.resolutionHistory.length,
    archiveRoot, archivedIssues: Object.keys(state.historyRetention?.archives ?? {}).length,
    sha256: createHash("sha256").update(bytes).digest("hex"), elapsedMs: performance.now() - startedReal,
    fetchCalls, credentialReads, memory: process.memoryUsage() };
}

if (!isMainThread && workerData?.demoHistory) {
  parentPort.postMessage({ result: await generate(workerData.options) });
} else if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (let index = 2; index < process.argv.length; index += 2) {
      const name = process.argv[index];
      if (!["--room", "--until", "--from", "--out", "--retention-days", "--staffing-examples", "--investigation-share"].includes(name) || !process.argv[index + 1]) throw new Error("Usage: npm run generate:history -- --room plant-1 --until <ISO> [--from <seed.json>] [--out <file.json>] [--retention-days N] [--staffing-examples yes] [--investigation-share 0..1]");
      options[name === "--investigation-share" ? "investigationShare" : name === "--retention-days" ? "retentionDays" : name === "--staffing-examples" ? "staffingExamples" : name.slice(2)] = process.argv[index + 1];
    }
    console.log(JSON.stringify(await generateDemoHistory(options, (progress) => console.error(JSON.stringify(progress))), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
