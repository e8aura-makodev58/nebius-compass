import assert from "node:assert/strict";
import test from "node:test";
import { createDemoRuntime, createRequestHandler } from "../src/server.mjs";
import { createTempAuditStore } from "./helpers/temp-audit-store.mjs";
import { roomUrl, wrapRuntimeAsSingleRoomManager } from "./helpers/single-room-manager.mjs";

function responseCapture() {
  const capture = { status: null, headers: null, body: null };
  return {
    capture,
    writeHead(status, headers) {
      capture.status = status;
      capture.headers = headers;
    },
    end(body) {
      capture.body = body;
    },
  };
}

async function invoke(handler, method, url) {
  const response = responseCapture();
  await handler({ method, url, headers: { host: "localhost", "content-type": "application/json" } }, response);
  return { ...response.capture, json: JSON.parse(response.capture.body) };
}

test("state, raise, and reset routes preserve the deterministic workflow boundary", async () => {
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(createDemoRuntime({}, createTempAuditStore())));
  const initial = await invoke(handler, "GET", roomUrl("/state"));
  assert.equal(initial.status, 200);
  assert.equal(initial.json.issues.find((issue) => issue.id === "ISS-104").status, "PENDING");
  assert.equal(initial.json.workflow, null);

  const raised = await invoke(handler, "POST", roomUrl("/issues/ISS-104/raise"));
  assert.equal(raised.status, 200);
  assert.equal(raised.json.issues.find((issue) => issue.id === "ISS-104").status, "OFFER_PENDING");
  assert.equal(raised.json.workflow.candidatePacket.candidates.length, 4);
  assert.equal(raised.json.workflow.nearestBaseline.responderId, "R-ENGR104");
  assert.equal(raised.json.workflow.naiveScoreBaseline.responderId, "R-TECH216");
  assert.equal("availability" in raised.json.workflow.candidatePacket.candidates[0], false);

  const reset = await invoke(handler, "POST", roomUrl("/reset"));
  assert.equal(reset.status, 200);
  assert.equal(reset.json.issues.find((issue) => issue.id === "ISS-104").status, "PENDING");
  assert.equal(reset.json.workflow, null);
});

test("server returns explicit HTTP errors for unknown methods and issues", async () => {
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(createDemoRuntime({}, createTempAuditStore())));
  const missing = await invoke(handler, "POST", roomUrl("/issues/UNKNOWN/raise"));
  assert.equal(missing.status, 404);
  assert.match(missing.json.error, /not found/);
  const unsupported = await invoke(handler, "PUT", roomUrl("/state"));
  assert.equal(unsupported.status, 405);
});

test("network server handler emits structured request lifecycle logs", async () => {
  const events = [];
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(createDemoRuntime({}, createTempAuditStore())), { log: (entry) => events.push(JSON.parse(entry)) });
  await invoke(handler, "GET", roomUrl("/state"));
  assert.equal(events[0].event, "request_started");
  assert.equal(events[0].path, roomUrl("/state"));
  assert.equal(events[0].controlRoomId, "plant-1");
  assert.equal(events.at(-1).event, "request_completed");
  assert.equal(events.at(-1).controlRoomId, "plant-1");
  assert.equal(events.at(-1).status, "unknown");
  assert.equal(typeof events.at(-1).durationMs, "number");
});

test("runtime emits action logs with grounded workflow outcomes", async () => {
  const events = [];
  const runtime = createDemoRuntime({ mode: "fixture" }, createTempAuditStore(), { log: (entry) => events.push(JSON.parse(entry)) });
  await runtime.raiseIssue("ISS-104");
  await runtime.requestRecommendation("ISS-104");
  await runtime.decideAssignment("ISS-104", "R-ENGR028", "CONFIRMED");
  assert.deepEqual(events.map((event) => event.event), ["context_prepared", "recommendation_completed", "assignment_offered", "assignment_completed"]);
  assert.equal(events[1].recommendedResponderId, "R-ENGR028");
  assert.equal(events[3].assignedResponderId, "R-ENGR028");
});

test("recommend route requires a raised issue and records the agent outcome", async () => {
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(createDemoRuntime({ mode: "fixture" }, createTempAuditStore())));

  const tooEarly = await invoke(handler, "POST", roomUrl("/issues/ISS-104/recommend"));
  assert.equal(tooEarly.status, 409);

  await invoke(handler, "POST", roomUrl("/issues/ISS-104/raise"));
  const recommended = await invoke(handler, "POST", roomUrl("/issues/ISS-104/recommend"));
  assert.equal(recommended.status, 200);
  assert.equal(recommended.json.workflow.agentOutcome.status, "ok");
  assert.equal(recommended.json.workflow.agentOutcome.result.topRecommendation.responderId, "R-ENGR028");
  assert.equal(recommended.json.workflow.agentOutcome.modelInfo.mode, "fixture");
  assert.equal(recommended.json.workflow.nearestBaseline.responderId, "R-ENGR104");

  const reset = await invoke(handler, "POST", roomUrl("/reset"));
  assert.equal(reset.json.workflow, null);
});

test("recommend route surfaces an explicit unavailable outcome without ever crashing the server", async () => {
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(createDemoRuntime({ mode: "force-failure" }, createTempAuditStore())));
  await invoke(handler, "POST", roomUrl("/issues/ISS-104/raise"));
  const recommended = await invoke(handler, "POST", roomUrl("/issues/ISS-104/recommend"));
  assert.equal(recommended.status, 200);
  assert.equal(recommended.json.workflow.agentOutcome.status, "unavailable");
  assert.equal(recommended.json.workflow.agentOutcome.reason, "forced-failure");
  assert.equal(recommended.json.workflow.nearestBaseline.responderId, "R-ENGR104");
});
