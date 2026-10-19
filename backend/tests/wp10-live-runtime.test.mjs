import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveStore } from "../src/live-store.mjs";
import { createTempAuditStore } from "./helpers/temp-audit-store.mjs";
import { createApplicationRuntime, createLiveRuntime } from "../src/live-runtime.mjs";
import { createDemoRuntime, createRequestHandler } from "../src/server.mjs";
import { roomUrl, wrapRuntimeAsSingleRoomManager } from "./helpers/single-room-manager.mjs";

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "compass-live-runtime-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  const liveRuntime = createLiveRuntime({ store, plannerOptions: { mode: "force-failure" }, agentOptions: { mode: "force-failure" } });
  const app = createApplicationRuntime({ liveRuntime, offlineRuntime: createDemoRuntime({ mode: "fixture" }, createTempAuditStore()) });
  return { store, liveRuntime, app };
}

function responseCapture() {
  const capture = {};
  return { capture, writeHead(status) { capture.status = status; }, end(body) { capture.body = body; } };
}

async function invoke(handler, method, url, body = null) {
  const response = responseCapture();
  const request = {
    method,
    url,
    headers: { host: "localhost" },
    async *[Symbol.asyncIterator]() { if (body !== null) yield Buffer.from(JSON.stringify(body)); },
  };
  await handler(request, response);
  return { status: response.capture.status, json: JSON.parse(response.capture.body) };
}

test("one live runtime composes forced event, fallback planning, and recommendation failure", async () => {
  const { app } = await createFixture();
  const initial = await app.snapshot();
  assert.equal(initial.mode, "LIVE");
  assert.equal("responderSkills" in initial, false);
  assert.equal("rngStreams" in initial.simulationState, false);
  const forced = await app.forceNextEvent();
  assert.equal(forced.issues.length, 3);
  assert.equal(forced.recommendations.length, 1);
  assert.equal(forced.recommendations[0].status, "UNAVAILABLE");
  assert.equal(forced.dispatchOffers.length, 1);
  assert.equal(forced.issues.find((issue) => issue.id === forced.dispatchOffers[0].issueId).status, "OFFER_PENDING");
  assert.equal(forced.operationalEvents.some((event) => event.source === "DETERMINISTIC_FALLBACK"), true);
  assert.equal(forced.agentActivity.eventPlanner.status, "COMPLETED");
  assert.equal(forced.agentActivity.compass.status, "COMPLETED");
});

test("runtime processes an asynchronous rejection and offers the next match", async () => {
  const { store, liveRuntime } = await createFixture();
  await liveRuntime.resume();
  const matched = await liveRuntime.recommend("ISS-104");
  const firstOffer = matched.dispatchOffers.find((offer) => offer.status === "PENDING");
  await store.mutate("force-offer-rejection", (state) => {
    const offer = state.dispatchOffers.find((entry) => entry.id === firstOffer.id);
    offer.acceptanceProbability = 0;
    offer.responseDueAt = state.simulationState.simulationTime;
  });
  await liveRuntime.tick(1);
  const after = await liveRuntime.snapshot();
  assert.equal(after.dispatchOffers.find((offer) => offer.id === firstOffer.id).status, "REJECTED");
  assert.equal(after.dispatchOffers.filter((offer) => offer.status === "PENDING").length, 1);
  assert.notEqual(after.dispatchOffers.find((offer) => offer.status === "PENDING").responderId, firstOffer.responderId);
});

test("runtime automatically reruns Compass when a recommendation becomes stale", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-live-stale-rematch-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  let releaseFirst;
  let firstStarted;
  let calls = 0;
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const requestRecommendation = async (packet) => {
    calls += 1;
    if (calls === 1) {
      firstStarted();
      await gate;
    }
    const rankedCandidates = packet.candidates.map((candidate, index, candidates) => ({
      rank: index + 1,
      responderId: candidate.responderId,
      recommendationSummary: "Grounded issue specific match.",
      evidenceReferences: ["sameIssuePerformance", "evidenceStrength", "travelTime"],
      tradeoff: {
        comparedToResponderId: candidates[(index + 1) % candidates.length].responderId,
        explanation: "The supplied operational evidence supports this relative placement.",
      },
    }));
    return {
      status: "ok",
      modelInfo: { provider: "test", modelId: "test", mode: "fixture" },
      result: {
        schemaVersion: "1.0",
        recommendationRequestId: packet.recommendationRequestId,
        rankedCandidates,
        topRecommendation: { responderId: rankedCandidates[0].responderId, rationale: "The supplied evidence provides the strongest current match." },
        uncertaintyNote: "Future operating-state changes may alter the ordering.",
      },
    };
  };
  const runtime = createLiveRuntime({ store, requestRecommendation, agentOptions: { mode: "fixture" } });
  const matching = runtime.recommend("ISS-104");
  await started;
  await store.mutate("change-candidates-during-inference", (state) => {
    state.responders.find((responder) => responder.id === "R-ENGR104").availability = "UNAVAILABLE";
  });
  releaseFirst();
  const rematched = await matching;
  assert.equal(calls, 2);
  assert.equal(rematched.recommendations.filter((entry) => entry.status === "STALE").length, 1);
  assert.equal(rematched.recommendations.filter((entry) => entry.status === "READY").length, 1);
  assert.equal(rematched.dispatchOffers.filter((entry) => entry.status === "PENDING").length, 1);
});

test("runtime snapshots expose an event planner while it is working in the background", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-live-activity-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  let releaseProvider;
  let markProviderCalled;
  const providerResponse = new Promise((resolve) => { releaseProvider = resolve; });
  const providerCalled = new Promise((resolve) => { markProviderCalled = resolve; });
  const runtime = createLiveRuntime({
    store,
    plannerOptions: { mode: "live", apiKey: "test-key", modelId: "test-model", fetchImpl: () => { markProviderCalled(); return providerResponse; } },
    agentOptions: { mode: "force-failure" },
  });

  await runtime.snapshot();
  const pendingEvent = runtime.forceNextEvent();
  await providerCalled;
  const whileRunning = await runtime.snapshot();
  assert.equal(whileRunning.agentActivity.eventPlanner.status, "RUNNING");
  assert.match(whileRunning.agentActivity.eventPlanner.detail, /Generating and validating/);

  releaseProvider({ ok: false, status: 503, text: async () => "test provider unavailable" });
  // With a live provider the request returns once the event is claimed; the planner
  // finishes in the agent lane.
  await pendingEvent;
  await runtime.agentWorkIdle();
  const completed = await runtime.snapshot();
  assert.equal(completed.agentActivity.eventPlanner.status, "COMPLETED");
  assert.match(completed.agentActivity.eventPlanner.detail, /deterministic fallback/);
});

test("the real-time loop keeps the clock moving while a model call is in flight", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-live-loop-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  let releaseProvider;
  let markProviderCalled;
  const providerResponse = new Promise((resolve) => { releaseProvider = resolve; });
  const providerCalled = new Promise((resolve) => { markProviderCalled = resolve; });
  const runtime = createLiveRuntime({
    store,
    plannerOptions: { mode: "live", apiKey: "test-key", modelId: "test-model", fetchImpl: () => { markProviderCalled(); return providerResponse; } },
    agentOptions: { mode: "force-failure" },
  });
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await runtime.setSpeed(60);
  await runtime.start();
  // Make the next event due now, so the next loop tick claims it.
  await store.mutate("event-due-now", (state) => { state.simulationState.nextEventAt = state.simulationState.simulationTime; });

  await runtime.runScheduledTick();
  await pause(20);
  await runtime.runScheduledTick();
  await providerCalled;
  const before = (await store.snapshot()).simulationState.simulationTime;

  // The planner's provider call is still pending. Before the fix this tick
  // was skipped (the previous one never returned) and the clock stood still.
  await pause(20);
  const tick = runtime.runScheduledTick().then(() => "returned");
  assert.equal(await Promise.race([tick, pause(1_000).then(() => "blocked")]), "returned");
  const after = (await store.snapshot()).simulationState.simulationTime;
  assert.ok(Date.parse(after) > Date.parse(before), "simulation time advanced while the planner waited");
  assert.equal((await runtime.snapshot()).agentActivity.eventPlanner.status, "RUNNING");

  releaseProvider({ ok: false, status: 503, headers: { get: () => null }, text: async () => "test provider unavailable" });
  await runtime.agentWorkIdle();
  const completed = await runtime.snapshot();
  assert.equal(completed.agentActivity.eventPlanner.status, "COMPLETED");
  assert.match(completed.agentActivity.eventPlanner.detail, /deterministic fallback/);
  const persisted = /New event (ISS-\d+)/.exec(completed.agentActivity.eventPlanner.detail)?.[1];
  assert.ok(completed.issues.some((issue) => issue.id === persisted), "the event was still persisted once the planner finished");
});

test("Live and Offline switch through one application runtime without cross-mode reset", async () => {
  const { app } = await createFixture();
  await app.forceNextEvent();
  await app.setMode("OFFLINE");
  const offline = await app.snapshot();
  assert.equal(offline.mode, "OFFLINE");
  assert.equal(offline.activeIssueId, "ISS-104");
  await app.raiseIssue("ISS-104");
  assert.equal((await app.snapshot()).workflow.candidatePacket.candidates.length, 4);
  await app.reset();
  assert.equal((await app.snapshot()).workflow, null);
  await app.setMode("LIVE");
  assert.equal((await app.snapshot()).issues.length, 3);
});

test("the issue audit route returns a complete record in Live and 404s for unknown issues", async () => {
  const { app } = await createFixture();
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(app));
  const found = await invoke(handler, "GET", roomUrl("/issues/ISS-103/audit"));
  assert.equal(found.status, 200);
  assert.equal(found.json.issue.id, "ISS-103");
  assert.equal(found.json.equipment.id, "EQ-03");
  assert.ok(found.json.operationalEvents.every((event) => event.issueId === "ISS-103"));
  assert.equal("responderSkills" in found.json, false);
  const missing = await invoke(handler, "GET", roomUrl("/issues/ISS-000/audit"));
  assert.equal(missing.status, 404);
  await invoke(handler, "POST", roomUrl("/mode"), { mode: "OFFLINE" });
  const wrongMode = await invoke(handler, "GET", roomUrl("/issues/ISS-103/audit"));
  assert.equal(wrongMode.status, 409);
  assert.equal(wrongMode.json.error, "Issue audit records require Live mode");
});

test("mode-guarded routes return conflicts and invalid mode input returns a client error", async () => {
  const { app } = await createFixture();
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(app));
  const offlineOnly = await invoke(handler, "POST", roomUrl("/issues/ISS-104/raise"));
  assert.equal(offlineOnly.status, 409);
  assert.equal(offlineOnly.json.error, "Fixture issue controls require Offline mode");
  await invoke(handler, "POST", roomUrl("/mode"), { mode: "OFFLINE" });
  const liveOnly = await invoke(handler, "POST", roomUrl("/simulation/resume"));
  assert.equal(liveOnly.status, 409);
  assert.equal(liveOnly.json.error, "Simulation controls require Live mode");
  const invalid = await invoke(handler, "POST", roomUrl("/mode"), { mode: "INVALID" });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error, "Mode must be LIVE or OFFLINE");
});

test("live HTTP routes expose clock, force, mode, and bounded collection controls", async () => {
  const { app } = await createFixture();
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(app));
  assert.equal((await invoke(handler, "POST", roomUrl("/simulation/start"))).json.simulationState.status, "RUNNING");
  assert.equal((await invoke(handler, "POST", roomUrl("/simulation/speed"), { speed: 10 })).json.simulationState.speedMultiplier, 10);
  assert.equal((await invoke(handler, "POST", roomUrl("/simulation/force-event"))).json.issues.length, 3);
  assert.equal((await invoke(handler, "GET", roomUrl("/events"))).json.operationalEvents.length > 0, true);
  assert.equal((await invoke(handler, "POST", roomUrl("/mode"), { mode: "OFFLINE" })).json.mode, "OFFLINE");
  await invoke(handler, "POST", roomUrl("/issues/ISS-104/raise"));
  await invoke(handler, "POST", roomUrl("/issues/ISS-104/recommend"));
  const confirmed = await invoke(handler, "POST", roomUrl("/issues/ISS-104/confirm"));
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.json.issues.find((issue) => issue.id === "ISS-104").assignedResponderId, "R-ENGR028");
});

test("staffing endpoints return structured conflicts in Live and Offline", async () => {
  const { app } = await createFixture();
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(app));
  const requested = await invoke(handler, "POST", roomUrl("/issues/ISS-103/assistance"));
  assert.equal(requested.status, 200);
  const duplicate = await invoke(handler, "POST", roomUrl("/issues/ISS-103/assistance"));
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.code, "ASSISTANCE_ALREADY_REQUESTED");
  await invoke(handler, "POST", roomUrl("/mode"), { mode: "OFFLINE" });
  const transfer = await invoke(handler, "POST", roomUrl("/assignments/transfer"), {});
  assert.equal(transfer.status, 409);
  assert.equal(transfer.json.code, "OFFLINE_TRANSFER_UNAVAILABLE");
});

for (const shape of ["object", "function"]) test(`with a live provider (${shape} options), Trigger Next Event returns before the planner answers and the event still lands`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-force-event-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let plannerCalls = 0;
  let signalStarted;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  // A planner that is slow and then unavailable: the deterministic fallback creates the event.
  const fetchImpl = async () => { plannerCalls += 1; signalStarted(); await gate; throw new TypeError("network unavailable"); };
  // Rooms pass options as functions over the saved settings; both shapes must queue.
  const planner = { mode: "live", apiKey: "hermetic-test", fetchImpl, timeoutMs: 5_000 };
  const runtime = createLiveRuntime({ store, plannerOptions: shape === "function" ? async () => planner : planner, agentOptions: { mode: "force-failure" } });
  const before = (await store.snapshot()).issues.length;
  const forced = await Promise.race([runtime.forceNextEvent().then(() => "returned"), new Promise((resolve) => setTimeout(() => resolve("blocked"), 1_000))]);
  assert.equal(forced, "returned");
  // The durable budget preflight may still be pending when the HTTP action returns.
  assert.equal(await Promise.race([started.then(() => "started"), new Promise((resolve) => setTimeout(() => resolve("blocked"), 1_000))]), "started");
  assert.equal(plannerCalls, 1);
  release();
  await runtime.agentWorkIdle();
  assert.equal((await store.snapshot()).issues.length, before + 1);
});
