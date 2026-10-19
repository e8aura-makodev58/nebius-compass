import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AMD_DEFAULT_MODEL_ID, PROVIDER_IDS, amdBaseUrl, defaultReasoningEffortFor, readAmdApiKey, readNebiusApiKey, nebiusBaseUrl, roleDefaults, modelCapabilities } from "./model-provider.mjs";
import { compassDataPath } from "./data-root.mjs";
import { logEvent } from "./application-log-store.mjs";

const DEFAULT_TIMEOUT_MS = 8_000;
const MODEL_ROLES = ["compass", "event-planner", "investigator", "narrator"];
const defaultModel = () => ({ modelId: AMD_DEFAULT_MODEL_ID, reasoningEffort: defaultReasoningEffortFor(AMD_DEFAULT_MODEL_ID) });

function modelRole(value = "compass") {
  if (!MODEL_ROLES.includes(value)) throw new Error("Select an available model role");
  return value;
}

/**
 * Reasoning-effort levels per AMD Token Factory model family, from the AMD
 * documentation. "default" omits the field so the model uses its own default
 * (for DeepSeek-V4-Flash, no thinking; for MiMo, thinking on). Unknown models only offer "default",
 * since an unsupported value is rejected with HTTP 422.
 */
export function reasoningEffortsForModel(modelId) {
  const id = String(modelId);
  if (/^DeepSeek-V4/i.test(id)) return ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"];
  if (/^GLM-/i.test(id)) return ["default", "low", "medium", "high"];
  if (/^MiMo-/i.test(id)) return ["default", "none"];
  if (/^Qwen3\.8-Flash-Next/i.test(id)) return ["default", "none", "low", "medium", "xhigh"];
  if (/^Qwen3\.8-27B/i.test(id)) return ["default", "low", "medium", "xhigh"];
  return ["default"];
}

/** Chat models only: the catalog also lists OCR-only models such as MinerU. */
function isSelectableAmdModel(model) {
  const id = model?.id;
  if (typeof id !== "string" || !id.trim() || /\s/.test(id)) return false;
  const outputs = model?.architecture?.output_modalities ?? model?.output;
  if (Array.isArray(outputs) && outputs.length > 0 && !outputs.includes("text")) return false;
  return true;
}

const PROVIDER_CATALOG = Object.freeze({
  nebius: {
    id: 'nebius', label: 'Nebius Token Factory', enabled: true,
    get modelsUrl() { return `${nebiusBaseUrl()}/models`; },
    isSelectable: isSelectableAmdModel,
    toOption: model => ({ id: model.id, ownedBy: 'nebius', reasoningEfforts: modelCapabilities('nebius', model.id).thinking === 'omit' ? ['default'] : ['default','on','off'] }),
    fallbackReasoningEfforts: modelId => modelCapabilities('nebius', modelId).thinking === 'omit' ? ['default'] : ['default','on','off'],
  },
  amd: {
    id: "amd",
    label: "AMD Token Factory",
    enabled: true,
    get modelsUrl() { return `${amdBaseUrl()}/models`; },
    isSelectable: isSelectableAmdModel,
    toOption: (model) => ({ id: model.id, ownedBy: "amd", reasoningEfforts: reasoningEffortsForModel(model.id) }),
    fallbackReasoningEfforts: (modelId) => reasoningEffortsForModel(modelId),
  },
});

function normalizeProviderId(value) {
  return PROVIDER_IDS.includes(value) ? value : "nebius";
}

function normalizeModelEntry(value = {}) {
  return {
    modelId: typeof value.modelId === "string" ? value.modelId.trim() : "",
    reasoningEffort: typeof value.reasoningEffort === "string" ? value.reasoningEffort : "default",
    ...(Number.isFinite(value.timeoutMs) && value.timeoutMs > 0 ? { timeoutMs: value.timeoutMs } : {}),
  };
}

/**
 * A settings file written by an older build may name a removed provider
 * (openai, openrouter, gpt-oss). Those pins are dropped rather than sent to
 * AMD, and the AMD defaults apply instead.
 */
function normalizeSettings(value = {}, defaults) {
  const models = {};
  for (const id of PROVIDER_IDS) {
    const legacy = normalizeModelEntry(value.models?.[id]);
    models[id] = Object.fromEntries(MODEL_ROLES.map((role) => {
      const normalized = normalizeModelEntry(value.models?.[id]?.[role]);
      return [role, normalized.modelId ? { ...defaults[id][role], ...normalized } : legacy.modelId && ["compass","event-planner"].includes(role) ? { ...defaults[id][role], ...legacy } : { ...defaults[id][role] }];
    }));
  }
  return { provider: PROVIDER_IDS.includes(value.provider) ? value.provider : value.provider ? "amd" : "nebius", models, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null };
}

function maskCredential(apiKey) {
  if (!apiKey) return null;
  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`;
}

function providerList(apiKeys, storedCredentials = {}) {
  return PROVIDER_IDS.map((id) => ({
    id,
    label: PROVIDER_CATALOG[id].label,
    enabled: PROVIDER_CATALOG[id].enabled,
    credentialConfigured: Boolean(apiKeys[id]),
    credentialSource: storedCredentials[id] ? "settings" : (apiKeys[id] ? "environment" : null),
    credentialHint: maskCredential(apiKeys[id]),
  }));
}

/**
 * The flat shape the frontend and every other caller read: the CURRENTLY
 * SELECTED provider's own model/effort at the top level, plus the full
 * provider list (each with its own credential status) so the UI can render
 * every provider without a round trip per provider.
 */
function previewSettings(settings, apiKeys, storedCredentials, providerId = settings.provider) {
  const id = normalizeProviderId(providerId);
  const current = settings.models[id].compass;
  return {
    provider: id,
    modelId: current.modelId,
    reasoningEffort: current.reasoningEffort,
    updatedAt: settings.updatedAt,
    credentialConfigured: Boolean(apiKeys[id]),
    providers: providerList(apiKeys, storedCredentials),
  };
}

export function createProviderSettingsService({
  filePath = compassDataPath("provider-settings.json"),
  credentialsFilePath = join(dirname(filePath), "provider-credentials.json"),
  apiKeys,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  environment = process.env,
  checkModelsOnBoot = false,
  logger = null,
} = {}) {
  // Environment variables remain a safe deployment bootstrap. A credential
  // saved through Settings takes precedence and is kept in its own owner-only
  // file, never in the model-settings file or API payload.
  const environmentApiKeys = apiKeys ?? { amd: readAmdApiKey(environment), nebius: readNebiusApiKey(environment) };
  let storedCredentials = {};
  // Seeds a fresh install; a persisted settings file, once written, takes
  // precedence over these on later boots.
  const seed = Object.fromEntries(PROVIDER_IDS.map(id => [id, Object.fromEntries(MODEL_ROLES.map(role => [role, roleDefaults(id, role, environment)]))]));
  let settings = normalizeSettings({}, seed);
  // Cached so a save can validate against the list the operator actually saw,
  // without re-fetching.
  let availableModelsByProvider = Object.fromEntries(PROVIDER_IDS.map((id) => [id, []]));
  let initialization;
  let catalogStates = Object.fromEntries(PROVIDER_IDS.map(id => [id, { status: "UNCHECKED" }]));
  let catalogRevisions = Object.fromEntries(PROVIDER_IDS.map(id => [id, 0]));
  let settingsWrite = Promise.resolve();

  function modelValidation(providerId = settings.provider, role = "compass") {
    const catalogState = catalogStates[providerId];
    const savedModelId = settings.models[providerId][role].modelId;
    const missing = catalogState.status === "READY" && !availableModelsByProvider[providerId].some((model) => model.id === savedModelId);
    return {
      ...catalogState,
      status: catalogState.status === "READY" ? (missing ? "MISSING" : "VALID") : catalogState.status,
      savedModelId,
      effectiveModelId: missing ? (providerId === "amd" ? AMD_DEFAULT_MODEL_ID : "") : savedModelId,
    };
  }

  function preview(providerId = settings.provider) {
    return {
      ...previewSettings(settings, currentApiKeys(), storedCredentials, providerId),
      modelValidation: modelValidation(providerId),
      modelsByProvider: Object.fromEntries(PROVIDER_IDS.map(id => [id, Object.fromEntries(MODEL_ROLES.map(role => [role, { ...settings.models[id][role], modelValidation: modelValidation(id, role) }]))])),
      roles: Object.fromEntries(MODEL_ROLES.map((role) => [role, {
        ...settings.models[providerId][role], modelValidation: modelValidation(providerId, role),
      }])),
    };
  }

  function invalidateCatalog() {
    for (const id of PROVIDER_IDS) {
      catalogRevisions[id] += 1;
      catalogStates[id] = { status: 'UNCHECKED' };
      availableModelsByProvider[id] = [];
    }
  }

  function currentApiKeys() {
    return Object.fromEntries(PROVIDER_IDS.map((id) => [id, storedCredentials[id] || environmentApiKeys[id] || ""]));
  }

  function initialize() {
    return initialization ??= loadSettings();
  }

  async function loadSettings() {
    try {
      settings = normalizeSettings(JSON.parse(await readFile(filePath, "utf8")), seed);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      const parsed = JSON.parse(await readFile(credentialsFilePath, "utf8"));
      storedCredentials = Object.fromEntries(PROVIDER_IDS
        .filter((id) => typeof parsed?.[id] === "string" && parsed[id].trim())
        .map((id) => [id, parsed[id].trim()]));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // Never await the network during startup. Production opts in at the server
    // entrypoint; tests must explicitly opt in with a fake fetch.
    if (checkModelsOnBoot) void refreshModels();
  }

  async function persist(nextSettings) {
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(nextSettings, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, filePath);
  }

  async function persistCredentials(nextCredentials) {
    await mkdir(dirname(credentialsFilePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${credentialsFilePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(nextCredentials, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, credentialsFilePath);
  }

  async function refreshModels(providerId) {
    await initialize();
    const id = normalizeProviderId(providerId ?? settings.provider);
    const catalog = PROVIDER_CATALOG[id];
    const apiKeys = currentApiKeys();
    const apiKey = apiKeys[id];
    const revision = ++catalogRevisions[id];
    const base = () => preview(id);
    if (!apiKey) {
      catalogStates[id] = { status: "UNAVAILABLE", reason: `${catalog.label} credential is not configured` };
      return { ...base(), modelDiscovery: { ...catalogStates[id], provider: id }, models: [] };
    }
    // Keep confirmed catalog evidence in force while a refresh is pending;
    // do not briefly resume calls to a model already known to be missing.
    if (catalogStates[id].status !== "READY") catalogStates[id] = { status: "CHECKING" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(catalog.modelsUrl, { headers: { authorization: `Bearer ${apiKey}` }, signal: controller.signal });
      if (!response.ok) throw new Error(`${catalog.label} model discovery responded with HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.data)) throw new Error(`${catalog.label} model discovery returned an invalid catalog`);
      const models = payload.data
        .filter((model) => typeof model?.id === "string" && catalog.isSelectable(model))
        .map((model) => catalog.toOption(model))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (revision === catalogRevisions[id]) {
        availableModelsByProvider[id] = models;
        catalogStates[id] = { status: "READY", checkedAt: new Date().toISOString() };
        for (const role of MODEL_ROLES) {
          const validation = modelValidation(id, role);
          if (validation.status === "MISSING" && validation.savedModelId !== validation.effectiveModelId && validation.savedModelId) {
            logEvent(logger, "provider_saved_model_missing", { provider: id, role, savedModelId: validation.savedModelId, effectiveModelId: validation.effectiveModelId });
          }
        }
      }
      return { ...base(), modelDiscovery: { status: "READY", provider: id, fetchedAt: new Date().toISOString() }, models };
    } catch (error) {
      if (revision === catalogRevisions[id]) catalogStates[id] = { status: "UNAVAILABLE" };
      return { ...base(), modelDiscovery: { status: "UNAVAILABLE", provider: id, reason: controller.signal.aborted ? `${catalog.label} model discovery timed out` : error.message }, models: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  function serializeSave(operation) {
    const saving = settingsWrite.then(operation);
    settingsWrite = saving.catch(() => {});
    return saving;
  }
  function update(input) { return serializeSave(() => updateSelection(input)); }

  async function updateSelection(input) {
    await initialize();
    const role = modelRole(input?.role);
    const providerId = input?.provider;
    const catalog = PROVIDER_IDS.includes(providerId) ? PROVIDER_CATALOG[providerId] : null;
    if (!catalog || !catalog.enabled) throw new Error("Select an available provider");
    const modelId = typeof input.modelId === "string" ? input.modelId.trim() : "";
    const cached = availableModelsByProvider[providerId] ?? [];
    const hasCatalog = catalogStates[providerId].status === "READY";
    const cachedEntry = cached.find((model) => model.id === modelId);
    if (!modelId || (hasCatalog ? !cachedEntry : !catalog.isSelectable({ id: modelId }))) {
      throw new Error(hasCatalog ? `Selected model is not available to this ${catalog.label} credential` : `Select an available ${catalog.label} text model`);
    }
    const supportedEfforts = cachedEntry?.reasoningEfforts ?? catalog.fallbackReasoningEfforts(modelId);
    const reasoningEffort = typeof input.reasoningEffort === "string" ? input.reasoningEffort : "";
    if (!supportedEfforts.includes(reasoningEffort)) throw new Error(`Reasoning level is not supported for ${modelId}`);
    const timeoutMs = input.timeoutMs === undefined ? settings.models[providerId][role].timeoutMs : Number(input.timeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new Error('Timeout must be between 1000 and 120000 milliseconds');
    const nextSettings = { provider: providerId, models: { ...settings.models, [providerId]: { ...settings.models[providerId], [role]: { modelId, reasoningEffort, timeoutMs } } }, updatedAt: new Date().toISOString() };
    await persist(nextSettings);
    settings = nextSettings;
    return preview();
  }

  return {
    initialize,
    async snapshot() { await initialize(); return preview(); },
    refreshModels,
    update,
    updateCredential(input) { return serializeSave(async () => {
      await initialize();
      const providerId = input?.provider;
      if (!PROVIDER_IDS.includes(providerId)) throw new Error("Select an available provider");
      const apiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : "";
      if (!apiKey || apiKey.length > 1_000) throw new Error("Enter a valid API key");
      const next = { ...storedCredentials, [providerId]: apiKey };
      await persistCredentials(next);
      storedCredentials = next;
      invalidateCatalog();
      return preview(providerId);
    }); },
    removeCredential(providerId) { return serializeSave(async () => {
      await initialize();
      if (!PROVIDER_IDS.includes(providerId)) throw new Error("Select an available provider");
      if (storedCredentials[providerId]) {
        const { [providerId]: removed, ...remaining } = storedCredentials;
        await persistCredentials(remaining);
        storedCredentials = remaining;
        invalidateCatalog();
      }
      return preview(providerId);
    }); },
    async requestOptions(purpose = "compass") {
      await initialize();
      const role = modelRole(purpose);
      const mode = purpose === "event-planner"
        ? environment.COMPASS_EVENT_PLANNER_MODE ?? "live"
        : environment[`COMPASS_${purpose.toUpperCase()}_MODE`] ?? environment.COMPASS_LIVE_COMPASS_MODE ?? "live";
      const providerId = settings.provider;
      const current = modelValidation(providerId, role).status === "MISSING"
        ? { ...settings.models[providerId][role], ...(providerId === 'amd' ? defaultModel() : { modelId: '', reasoningEffort: 'default' }) }
        : settings.models[providerId][role];
      return {
        mode,
        provider: providerId,
        apiKey: currentApiKeys()[providerId] ?? "",
        modelId: current.modelId,
        timeoutMs: current.timeoutMs,
        ...(current.reasoningEffort && current.reasoningEffort !== "default" ? { reasoningEffort: current.reasoningEffort } : {}),
      };
    },
  };
}
