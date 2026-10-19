import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProviderSettingsService } from "../src/provider-settings.mjs";
import { createRequestHandler, publicSettingsEditableFromEnv } from "../src/server.mjs";

const TUNNEL = { "cf-connecting-ip": "203.0.113.7" };

async function settingsService() {
  const fetchImpl = async () => { throw new Error("no provider call is expected"); };
  return createProviderSettingsService({
    filePath: join(await mkdtemp(join(tmpdir(), "compass-public-settings-")), "provider-settings.json"),
    apiKeys: { amd: "rc-environment-key" },
    environment: {},
    fetchImpl,
  });
}

async function invoke(handler, method, url, { headers = {}, body = null } = {}) {
  const capture = {};
  const response = { writeHead(status) { capture.status = status; }, end(text) { capture.body = text; } };
  const request = {
    method, url, headers: { host: "localhost", ...headers },
    async *[Symbol.asyncIterator]() { if (body !== null) yield Buffer.from(JSON.stringify(body)); },
  };
  await handler(request, response);
  return { status: capture.status, json: JSON.parse(capture.body) };
}

test("tunnel visitors can read provider settings but every change and model discovery is refused", async () => {
  const service = await settingsService();
  const handler = createRequestHandler(null, null, service);
  const before = await service.snapshot();

  const snapshot = await invoke(handler, "GET", "/api/settings", { headers: TUNNEL });
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.json.editable, false);
  assert.equal(snapshot.json.provider, "nebius");

  const attempts = [
    ["GET", "/api/settings/models?provider=amd"],
    ["POST", "/api/settings", { provider: "amd", role: "compass", modelId: "GLM-5.3-Flash", reasoningEffort: "low" }],
    ["POST", "/api/settings/credentials", { provider: "amd", apiKey: "rc-attacker-key" }],
    ["DELETE", "/api/settings/credentials?provider=amd"],
  ];
  for (const [method, url, body = null] of attempts) {
    const refused = await invoke(handler, method, url, { headers: TUNNEL, body });
    assert.equal(refused.status, 403, `${method} ${url}`);
    assert.equal(refused.json.code, "SETTINGS_READ_ONLY");
  }
  assert.deepEqual(await service.snapshot(), before);
});

test("requests from the host or LAN, without the tunnel header, keep full settings access", async () => {
  const service = await settingsService();
  const handler = createRequestHandler(null, null, service);
  assert.equal((await invoke(handler, "GET", "/api/settings")).json.editable, true);
  const saved = await invoke(handler, "POST", "/api/settings/credentials", { body: { provider: "amd", apiKey: "rc-operator-key" } });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.providers[0].credentialSource, "settings");
});

test("COMPASS_PUBLIC_SETTINGS=editable opens settings to tunnel requests", async () => {
  const handler = createRequestHandler(null, null, await settingsService(), { publicSettingsEditable: true });
  assert.equal((await invoke(handler, "GET", "/api/settings", { headers: TUNNEL })).json.editable, true);
  assert.equal((await invoke(handler, "POST", "/api/settings/credentials", { headers: TUNNEL, body: { provider: "amd", apiKey: "rc-operator-key" } })).status, 200);
});

test("COMPASS_PUBLIC_SETTINGS defaults to read-only and rejects unknown values", () => {
  assert.equal(publicSettingsEditableFromEnv(undefined), false);
  assert.equal(publicSettingsEditableFromEnv("read-only"), false);
  assert.equal(publicSettingsEditableFromEnv("editable"), true);
  assert.throws(() => publicSettingsEditableFromEnv("open"), /read-only/);
});
