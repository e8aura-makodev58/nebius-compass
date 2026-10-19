import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProviderSettingsService, reasoningEffortsForModel } from "../src/provider-settings.mjs";
import { createRequestHandler } from "../src/server.mjs";
import { AMD_DEFAULT_MODEL_ID, defaultReasoningEffortFor } from "../src/model-provider.mjs";

async function scratchPath() {
  const directory = await mkdtemp(join(tmpdir(), "compass-provider-settings-"));
  const filePath = join(directory, "provider-settings.json");
  await writeFile(filePath, JSON.stringify({ provider: "amd" }));
  return filePath;
}

/** A stubbed AMD /models catalog, shaped like the live one. */
function stubAmdModelList(models) {
  return async (url) => {
    assert.match(String(url), /\/models$/);
    return { ok: true, status: 200, json: async () => ({ data: models }) };
  };
}

const chatModel = (id) => ({ id, architecture: { output_modalities: ["text"] } });
const AMD_CATALOG = [chatModel("GLM-5.3-Flash"), chatModel("DeepSeek-V4-Flash"), { id: "MinerU2.5-Pro", architecture: { output_modalities: ["ocr"] } }];

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

test("reasoningEffortsForModel maps documented AMD model families and falls back to default", () => {
  assert.deepEqual(reasoningEffortsForModel("DeepSeek-V4-Flash"), ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(reasoningEffortsForModel("GLM-5.3-Flash"), ["default", "low", "medium", "high"]);
  assert.deepEqual(reasoningEffortsForModel("Qwen3.8-Flash-Next"), ["default", "none", "low", "medium", "xhigh"]);
  assert.deepEqual(reasoningEffortsForModel("Qwen3.8-27B"), ["default", "low", "medium", "xhigh"]);
  assert.deepEqual(reasoningEffortsForModel("Gemma-4-31B-IT"), ["default"]);
});

test("saved AMD provider retains MiMo defaults with reasoning off and never returns either key", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {} });
  const snapshot = await service.snapshot();
  assert.equal(snapshot.provider, "amd");
  assert.equal(snapshot.modelId, "MiMo-V2.6-Flash");
  assert.equal(snapshot.reasoningEffort, "none");
  assert.equal(snapshot.credentialConfigured, true);
  assert.equal(JSON.stringify(snapshot).includes("rc-test-key"), false);
  assert.deepEqual(snapshot.providers, [
    { id: "amd", label: "AMD Token Factory", enabled: true, credentialConfigured: true, credentialSource: "environment", credentialHint: "••••-key" },
    { id: "nebius", label: "Nebius Token Factory", enabled: true, credentialConfigured: false, credentialSource: null, credentialHint: null },
  ]);
});

test("the environment seeds the model and reasoning effort on a fresh install", async () => {
  const service = createProviderSettingsService({
    filePath: await scratchPath(),
    apiKeys: { amd: "rc-test-key" },
    environment: { AMD_TOKEN_FACTORY_MODEL: "GLM-5.3-Flash", AMD_TOKEN_FACTORY_REASONING_EFFORT: "low" },
  });
  const options = await service.requestOptions();
  assert.equal(options.modelId, "GLM-5.3-Flash");
  assert.equal(options.reasoningEffort, "low");
});

test("a Settings API key is persisted separately with owner-only permissions, is write-only in snapshots, and can be removed", async () => {
  const filePath = await scratchPath();
  const credentialsFilePath = join(filePath, "..", "provider-credentials.json");
  const service = createProviderSettingsService({ filePath, credentialsFilePath, apiKeys: { amd: "" }, environment: {} });

  const saved = await service.updateCredential({ provider: "amd", apiKey: "rc-secret-9876" });
  assert.equal(saved.providers[0].credentialConfigured, true);
  assert.equal(saved.providers[0].credentialSource, "settings");
  assert.equal(saved.providers[0].credentialHint, "••••9876");
  assert.equal(JSON.stringify(saved).includes("rc-secret-9876"), false);
  assert.equal((await service.requestOptions()).apiKey, "rc-secret-9876");
  assert.match(await readFile(credentialsFilePath, "utf8"), /rc-secret-9876/);
  assert.equal((await stat(credentialsFilePath)).mode & 0o777, 0o600);

  const removed = await service.removeCredential("amd");
  assert.equal(removed.providers[0].credentialConfigured, false);
  assert.equal((await service.requestOptions()).apiKey, "");
  await assert.rejects(() => service.updateCredential({ provider: "openai", apiKey: "sk-x" }), /Select an available provider/);
});

test("refreshModels is explicit-unavailable without a credential, never guessing a model list", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "" }, environment: {}, fetchImpl: async () => { throw new Error("must not be called"); } });
  const result = await service.refreshModels();
  assert.equal(result.modelDiscovery.status, "UNAVAILABLE");
  assert.match(result.modelDiscovery.reason, /AMD Token Factory credential is not configured/);
  assert.deepEqual(result.models, []);
});

test("refreshModels keeps chat models only, sorts by ID, and attaches per-model reasoning efforts", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  const result = await service.refreshModels();
  assert.equal(result.modelDiscovery.status, "READY");
  assert.equal(result.modelDiscovery.provider, "amd");
  assert.deepEqual(result.models.map((model) => model.id), ["DeepSeek-V4-Flash", "GLM-5.3-Flash"]);
  assert.deepEqual(result.models.find((model) => model.id === "GLM-5.3-Flash").reasoningEfforts, ["default", "low", "medium", "high"]);
});

test("refreshModels fails closed on a provider HTTP error or a timeout rather than guessing", async () => {
  const httpError = createProviderSettingsService({
    filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {},
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  });
  const errorResult = await httpError.refreshModels();
  assert.equal(errorResult.modelDiscovery.status, "UNAVAILABLE");
  assert.match(errorResult.modelDiscovery.reason, /401/);

  const hangs = createProviderSettingsService({
    filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {},
    timeoutMs: 10,
    fetchImpl: (url, init) => new Promise((_, reject) => { init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); }),
  });
  const timeoutResult = await hangs.refreshModels();
  assert.equal(timeoutResult.modelDiscovery.status, "UNAVAILABLE");
  assert.match(timeoutResult.modelDiscovery.reason, /timed out/);
});

test("update rejects a removed provider, an unselectable or undiscovered model, and an unsupported reasoning level", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  await assert.rejects(() => service.update({ provider: "openai", modelId: "gpt-5.1-mini", reasoningEffort: "low" }), /Select an available provider/);
  await assert.rejects(() => service.update({ provider: "amd", modelId: "not a model", reasoningEffort: "default" }), /Select an available/);
  await service.refreshModels();
  await assert.rejects(() => service.update({ provider: "amd", modelId: "MinerU2.5-Pro", reasoningEffort: "default" }), /not available to this AMD Token Factory credential/);
  await assert.rejects(() => service.update({ provider: "amd", modelId: "GLM-5.3-Flash", reasoningEffort: "xhigh" }), /Reasoning level/);
});

test("update persists a valid selection atomically and it survives a reload", async () => {
  const filePath = await scratchPath();
  const service = createProviderSettingsService({ filePath, apiKeys: { amd: "rc-test-key" }, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  await service.refreshModels();
  const saved = await service.update({ provider: "amd", modelId: "GLM-5.3-Flash", reasoningEffort: "medium" });
  assert.equal(saved.modelId, "GLM-5.3-Flash");
  assert.equal(saved.reasoningEffort, "medium");

  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  const onDisk = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(onDisk.provider, "amd");
  assert.equal(onDisk.models.amd.compass.modelId, "GLM-5.3-Flash");

  const reloaded = createProviderSettingsService({ filePath, apiKeys: { amd: "rc-test-key" }, environment: {} });
  const snapshot = await reloaded.snapshot();
  assert.equal(snapshot.modelId, "GLM-5.3-Flash");
  assert.equal(snapshot.reasoningEffort, "medium");
});

test("a settings file naming a removed provider loads as AMD with its default model, never sending the old pin", async () => {
  const filePath = await scratchPath();
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, JSON.stringify({
    provider: "gpt-oss",
    models: { openai: { modelId: "gpt-5.6-terra", reasoningEffort: "medium" }, "gpt-oss": { modelId: "openai/gpt-oss-20b", reasoningEffort: "low" } },
    updatedAt: "2026-09-15T00:00:00.000Z",
  }));
  const service = createProviderSettingsService({ filePath, apiKeys: { amd: "rc-test-key" }, environment: {} });
  const options = await service.requestOptions();
  assert.equal(options.provider, "amd");
  assert.equal(options.modelId, "MiMo-V2.6-Flash");
  assert.equal(options.reasoningEffort, "none");
});

test("requestOptions returns a live-mode call configuration and omits a 'default' reasoning level", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  assert.deepEqual(await service.requestOptions(), { mode: "live", provider: "amd", apiKey: "rc-test-key", modelId: "MiMo-V2.6-Flash", reasoningEffort: "none", timeoutMs: 90000 });
  await service.refreshModels();
  await service.update({ provider: "amd", modelId: "DeepSeek-V4-Flash", reasoningEffort: "default" });
  assert.deepEqual(await service.requestOptions(), { mode: "live", provider: "amd", apiKey: "rc-test-key", modelId: "DeepSeek-V4-Flash", timeoutMs: 90000 });
});

test("requestOptions preserves independent explicit inference modes for hermetic runs", async () => {
  const service = createProviderSettingsService({
    filePath: await scratchPath(),
    apiKeys: { amd: "rc-test-key" },
    environment: { COMPASS_LIVE_COMPASS_MODE: "force-failure", COMPASS_EVENT_PLANNER_MODE: "fixture" },
  });
  assert.equal((await service.requestOptions("compass")).mode, "force-failure");
  assert.equal((await service.requestOptions("event-planner")).mode, "fixture");
});

async function savedModelPath() {
  const filePath = await scratchPath();
  await writeFile(filePath, JSON.stringify({
    provider: "amd", models: { amd: { modelId: "DeepSeek-V4-Flash", reasoningEffort: "high" } },
    updatedAt: "2026-10-17T00:00:00.000Z",
  }));
  return filePath;
}

test("legacy settings apply to both roles without rewriting until one role is saved", async () => {
  const filePath = await savedModelPath();
  const before = await readFile(filePath, "utf8");
  const credentialsFilePath = join(filePath, "..", "provider-credentials.json");
  const credentialBytes = '{"amd":"test-saved-secret"}\n';
  await writeFile(credentialsFilePath, credentialBytes, { mode: 0o600 });
  const service = createProviderSettingsService({ filePath, apiKeys: {}, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  const snapshot = await service.snapshot();
  for (const role of ["compass", "event-planner"]) {
    assert.equal(snapshot.roles[role].modelId, "DeepSeek-V4-Flash");
    assert.equal((await service.requestOptions(role)).reasoningEffort, "high");
  }
  assert.equal(await readFile(filePath, "utf8"), before);
  await service.refreshModels();
  await service.update({ provider: "amd", role: "compass", modelId: "GLM-5.3-Flash", reasoningEffort: "low" });
  const disk = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(disk.models.amd.compass.modelId, "GLM-5.3-Flash");
  assert.equal(disk.models.amd["event-planner"].modelId, "DeepSeek-V4-Flash");
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  assert.equal(await readFile(credentialsFilePath, "utf8"), credentialBytes);
  assert.equal((await stat(credentialsFilePath)).mode & 0o777, 0o600);
  const reloaded = createProviderSettingsService({ filePath, apiKeys: {}, environment: {} });
  assert.equal((await reloaded.requestOptions("compass")).modelId, "GLM-5.3-Flash");
  assert.equal((await reloaded.requestOptions("event-planner")).modelId, "DeepSeek-V4-Flash");
});

test("role saves are independent, serialized, and validate roles, models and reasoning", async () => {
  const filePath = await scratchPath();
  const service = createProviderSettingsService({ filePath, apiKeys: { amd: "test-key" }, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  await service.refreshModels();
  await assert.rejects(service.update({ provider: "amd", role: "unknown", modelId: "GLM-5.3-Flash", reasoningEffort: "low" }), /model role/);
  await assert.rejects(service.requestOptions("unknown"), /model role/);
  await assert.rejects(service.update({ provider: "amd", role: "event-planner", modelId: "missing", reasoningEffort: "default" }), /not available/);
  await assert.rejects(service.update({ provider: "amd", role: "event-planner", modelId: "GLM-5.3-Flash", reasoningEffort: "max" }), /Reasoning level/);
  await Promise.all([
    service.update({ provider: "amd", role: "compass", modelId: "DeepSeek-V4-Flash", reasoningEffort: "high" }),
    service.update({ provider: "amd", role: "event-planner", modelId: "GLM-5.3-Flash", reasoningEffort: "low" }),
  ]);
  const reloaded = createProviderSettingsService({ filePath, apiKeys: {}, environment: {} });
  assert.equal((await reloaded.requestOptions("compass")).modelId, "DeepSeek-V4-Flash");
  assert.equal((await reloaded.requestOptions("compass")).reasoningEffort, "high");
  assert.equal((await reloaded.requestOptions("event-planner")).modelId, "GLM-5.3-Flash");
  assert.equal((await reloaded.requestOptions("event-planner")).reasoningEffort, "low");
});

test("planner environment overrides seed only the planner, while defaults stay MiMo for both roles", async () => {
  for (const environment of [
    {},
    { AMD_TOKEN_FACTORY_MODEL: "DeepSeek-V4-Flash", AMD_TOKEN_FACTORY_REASONING_EFFORT: "high" },
    { AMD_TOKEN_FACTORY_MODEL: "DeepSeek-V4-Flash", AMD_TOKEN_FACTORY_REASONING_EFFORT: "high", AMD_TOKEN_FACTORY_EVENT_PLANNER_MODEL: "GLM-5.3-Flash", AMD_TOKEN_FACTORY_EVENT_PLANNER_REASONING_EFFORT: "low" },
    { AMD_TOKEN_FACTORY_EVENT_PLANNER_REASONING_EFFORT: "default" },
    { AMD_TOKEN_FACTORY_REASONING_EFFORT: "none", AMD_TOKEN_FACTORY_EVENT_PLANNER_MODEL: "GLM-5.3-Flash" },
  ]) {
    const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: {}, environment });
    const snapshot = await service.snapshot();
    const sharedModel = environment.AMD_TOKEN_FACTORY_MODEL || AMD_DEFAULT_MODEL_ID;
    assert.equal(snapshot.roles.compass.modelId, sharedModel);
    assert.equal(snapshot.roles.compass.reasoningEffort, environment.AMD_TOKEN_FACTORY_REASONING_EFFORT || defaultReasoningEffortFor(sharedModel));
    const plannerModel = environment.AMD_TOKEN_FACTORY_EVENT_PLANNER_MODEL || sharedModel;
    assert.equal(snapshot.roles["event-planner"].modelId, plannerModel);
    const inheritedEffort = plannerModel === sharedModel ? snapshot.roles.compass.reasoningEffort : defaultReasoningEffortFor(plannerModel);
    assert.equal(snapshot.roles["event-planner"].reasoningEffort, environment.AMD_TOKEN_FACTORY_EVENT_PLANNER_REASONING_EFFORT || inheritedEffort);
    assert.ok(reasoningEffortsForModel(plannerModel).includes(snapshot.roles["event-planner"].reasoningEffort));
  }
});

for (const missingRole of ["compass", "event-planner"]) {
  test(`boot fallback affects only the missing ${missingRole} model and logs its role`, async () => {
    const filePath = await scratchPath();
    const otherRole = missingRole === "compass" ? "event-planner" : "compass";
    await writeFile(filePath, JSON.stringify({ provider: "amd", models: { amd: {
      [missingRole]: { modelId: "Retired-Model", reasoningEffort: "default" },
      [otherRole]: { modelId: "DeepSeek-V4-Flash", reasoningEffort: "high" },
    } } }));
    const before = await readFile(filePath, "utf8");
    const logs = [];
    const service = createProviderSettingsService({
      filePath, apiKeys: { amd: "test-key" }, environment: {}, checkModelsOnBoot: true,
      fetchImpl: stubAmdModelList(AMD_CATALOG), logger: { log: (line) => logs.push(JSON.parse(line)) },
    });
    await service.initialize();
    await new Promise(setImmediate);
    const snapshot = await service.snapshot();
    assert.equal(snapshot.roles[missingRole].modelValidation.status, "MISSING");
    assert.equal(snapshot.roles[otherRole].modelValidation.status, "VALID");
    assert.equal((await service.requestOptions(missingRole)).modelId, AMD_DEFAULT_MODEL_ID);
    assert.equal((await service.requestOptions(otherRole)).modelId, "DeepSeek-V4-Flash");
    assert.equal((await service.requestOptions(otherRole)).reasoningEffort, "high");
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event, "provider_saved_model_missing");
    assert.equal(logs[0].role, missingRole);
    assert.equal(await readFile(filePath, "utf8"), before);
  });
}

test("boot discovery never blocks initialization, reports a missing pin and falls back without rewriting it", async () => {
  const filePath = await savedModelPath();
  const before = await readFile(filePath, "utf8");
  const logs = [];
  let calls = 0;
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const service = createProviderSettingsService({
    filePath, apiKeys: { amd: "test-secret" }, environment: {}, checkModelsOnBoot: true,
    logger: { log: (line) => logs.push(JSON.parse(line)) },
    fetchImpl: async () => { calls += 1; return response; },
  });
  await Promise.all([service.initialize(), service.initialize(), service.snapshot()]);
  assert.equal(calls, 1, "concurrent initialization starts only one boot check");
  assert.equal((await service.snapshot()).modelValidation.status, "CHECKING");
  assert.equal((await service.requestOptions()).modelId, "DeepSeek-V4-Flash");
  release({ ok: true, json: async () => ({ data: [chatModel(AMD_DEFAULT_MODEL_ID)] }) });
  await new Promise(setImmediate);
  const snapshot = await service.snapshot();
  assert.equal(snapshot.modelId, "DeepSeek-V4-Flash", "the UI retains the saved selection");
  assert.equal(snapshot.modelValidation.status, "MISSING");
  assert.equal(snapshot.modelValidation.savedModelId, "DeepSeek-V4-Flash");
  assert.equal(snapshot.modelValidation.effectiveModelId, AMD_DEFAULT_MODEL_ID);
  for (const purpose of ["compass", "event-planner"]) {
    const options = await service.requestOptions(purpose);
    assert.equal(options.modelId, AMD_DEFAULT_MODEL_ID);
    assert.equal(options.reasoningEffort, defaultReasoningEffortFor(AMD_DEFAULT_MODEL_ID));
  }
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map((event) => event.role), ["compass", "event-planner"]);
  assert.equal(logs[0].event, "provider_saved_model_missing");
  assert.equal(logs[0].savedModelId, "DeepSeek-V4-Flash");
  assert.equal(logs[0].effectiveModelId, AMD_DEFAULT_MODEL_ID);
  assert.equal(JSON.stringify({ snapshot, logs }).includes("test-secret"), false);
  assert.equal(await readFile(filePath, "utf8"), before);
  const reloaded = createProviderSettingsService({ filePath, apiKeys: {}, environment: {} });
  assert.equal((await reloaded.requestOptions()).modelId, "DeepSeek-V4-Flash");
});

test("a valid boot catalog preserves the saved model and its reasoning level", async () => {
  const logs = [];
  const service = createProviderSettingsService({
    filePath: await savedModelPath(), apiKeys: { amd: "test-key" }, environment: {}, checkModelsOnBoot: true,
    logger: { log: (line) => logs.push(line) }, fetchImpl: stubAmdModelList(AMD_CATALOG),
  });
  await service.initialize();
  await new Promise(setImmediate);
  assert.equal((await service.snapshot()).modelValidation.status, "VALID");
  const options = await service.requestOptions();
  assert.equal(options.modelId, "DeepSeek-V4-Flash");
  assert.equal(options.reasoningEffort, "high");
  assert.deepEqual(logs, []);
});

test("failed boot discovery keeps the saved choice and does not prevent startup", async () => {
  const service = createProviderSettingsService({
    filePath: await savedModelPath(), apiKeys: { amd: "test-key" }, environment: {}, checkModelsOnBoot: true,
    fetchImpl: async () => { throw new Error("catalog offline"); },
  });
  await service.initialize();
  await new Promise(setImmediate);
  assert.equal((await service.snapshot()).modelValidation.status, "UNAVAILABLE");
  assert.equal((await service.requestOptions()).modelId, "DeepSeek-V4-Flash");
});

test("malformed catalogs fail discovery; later valid discovery can restore a missing pin", async () => {
  let catalog = {};
  const service = createProviderSettingsService({
    filePath: await savedModelPath(), apiKeys: { amd: "test-key" }, environment: {},
    fetchImpl: async () => ({ ok: true, json: async () => catalog }),
  });
  assert.equal((await service.refreshModels()).modelDiscovery.status, "UNAVAILABLE");
  assert.equal((await service.requestOptions()).modelId, "DeepSeek-V4-Flash");
  catalog = { data: [] };
  assert.equal((await service.refreshModels()).modelValidation.status, "MISSING");
  assert.equal((await service.requestOptions()).modelId, AMD_DEFAULT_MODEL_ID);
  catalog = { data: AMD_CATALOG };
  assert.equal((await service.refreshModels()).modelValidation.status, "VALID");
  assert.equal((await service.requestOptions()).modelId, "DeepSeek-V4-Flash");
});

test("boot checks are opt-in for services so hermetic callers never discover implicitly", async () => {
  let calls = 0;
  const service = createProviderSettingsService({
    filePath: await savedModelPath(), apiKeys: { amd: "test-key" }, environment: {},
    fetchImpl: async () => { calls += 1; throw new Error("must not call"); },
  });
  await service.initialize();
  await service.snapshot();
  await service.requestOptions();
  assert.equal(calls, 0);
});

test("a confirmed missing pin keeps the default while catalog refresh is pending", async () => {
  let pending;
  const service = createProviderSettingsService({
    filePath: await savedModelPath(), apiKeys: { amd: "test-key" }, environment: {},
    fetchImpl: async () => pending ?? { ok: true, json: async () => ({ data: [] }) },
  });
  await service.refreshModels();
  let release;
  pending = new Promise((resolve) => { release = resolve; });
  const refreshing = service.refreshModels();
  await new Promise(setImmediate);
  assert.equal((await service.requestOptions()).modelId, AMD_DEFAULT_MODEL_ID);
  release({ ok: true, json: async () => ({ data: AMD_CATALOG }) });
  await refreshing;
  assert.equal((await service.requestOptions()).modelId, "DeepSeek-V4-Flash");
});

test("a catalog response for an old credential cannot override the current credential's status", async () => {
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const service = createProviderSettingsService({
    filePath: await savedModelPath(), apiKeys: { amd: "test-key" }, environment: {},
    fetchImpl: async () => response,
  });
  await service.initialize();
  const pending = service.refreshModels();
  await new Promise(setImmediate);
  await service.updateCredential({ provider: "amd", apiKey: "replacement-key" });
  release({ ok: true, json: async () => ({ data: [] }) });
  await pending;
  assert.equal((await service.snapshot()).modelValidation.status, "UNCHECKED");
  assert.equal((await service.requestOptions()).modelId, "DeepSeek-V4-Flash");
});

test("settings routes are wired end to end: snapshot, credentials, model discovery, and save — deployment-global, not gated by any one room's mode", async () => {
  const settingsService = createProviderSettingsService({
    filePath: await scratchPath(),
    apiKeys: { amd: "rc-environment-key" },
    environment: {},
    fetchImpl: stubAmdModelList(AMD_CATALOG),
  });
  // /api/settings and /api/settings/models never touch the manager (see
  // control-room-manager.mjs / server.mjs createRequestHandler) — settings
  // are deployment-global, shared across every Control Room, so `null` here
  // stands in for "manager is irrelevant to this route".
  const events = [];
  const handler = createRequestHandler(null, { log: (line) => events.push(JSON.parse(line)) }, settingsService);

  const snapshot = await invoke(handler, "GET", "/api/settings");
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.json.provider, "amd");
  assert.equal(snapshot.json.providers.length, 2);

  const credentialSaved = await invoke(handler, "POST", "/api/settings/credentials", { provider: "amd", apiKey: "rc-secret-9876" });
  assert.equal(credentialSaved.status, 200);
  assert.equal(credentialSaved.json.providers[0].credentialSource, "settings");
  assert.equal(JSON.stringify(credentialSaved.json).includes("rc-secret-9876"), false);

  const credentialRemoved = await invoke(handler, "DELETE", "/api/settings/credentials?provider=amd");
  assert.equal(credentialRemoved.status, 200);
  // The injected environment key remains available after a saved override is
  // removed, rather than leaving a shared deployment without its credential.
  assert.equal(credentialRemoved.json.providers[0].credentialSource, "environment");

  const models = await invoke(handler, "GET", "/api/settings/models");
  assert.equal(models.status, 200);
  assert.deepEqual(models.json.models.map((model) => model.id), ["DeepSeek-V4-Flash", "GLM-5.3-Flash"]);

  const saved = await invoke(handler, "POST", "/api/settings", { provider: "amd", modelId: "GLM-5.3-Flash", reasoningEffort: "low" });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.modelId, "GLM-5.3-Flash");

  const plannerSaved = await invoke(handler, "POST", "/api/settings", { provider: "amd", role: "event-planner", modelId: "DeepSeek-V4-Flash", reasoningEffort: "none" });
  assert.equal(plannerSaved.status, 200);
  assert.equal(plannerSaved.json.roles.compass.modelId, "GLM-5.3-Flash");
  assert.equal(plannerSaved.json.roles["event-planner"].modelId, "DeepSeek-V4-Flash");
  const logged = events.filter((event) => event.event === "provider_settings_updated").at(-1);
  assert.equal(logged.role, "event-planner");
  assert.equal(logged.modelId, "DeepSeek-V4-Flash");
  assert.equal((await invoke(handler, "POST", "/api/settings", { provider: "amd", role: "unknown", modelId: "DeepSeek-V4-Flash", reasoningEffort: "none" })).status, 400);

  const rejected = await invoke(handler, "POST", "/api/settings", { provider: "openrouter", modelId: "deepseek/deepseek-v4-flash", reasoningEffort: "default" });
  assert.equal(rejected.status, 400);

  const noServiceHandler = createRequestHandler(null, null, null);
  const unavailable = await invoke(noServiceHandler, "GET", "/api/settings");
  assert.equal(unavailable.status, 503);
});
