# Model providers

`backend/src/model-provider.mjs` supports **Nebius Token Factory** and **AMD Token Factory**.
Fresh deployments select `nebius`; saved AMD deployments keep their provider, credentials,
model pins and reasoning settings without rewriting files on load. Removed legacy provider
pins still migrate to AMD defaults. No model gets authority over facts, eligibility,
outcomes or mutations; validators and deterministic fallback remain in the callers.

## Configuration and discovery

`provider-settings.mjs` persists four independent roles: `compass`, `event-planner`,
`investigator`, and `narrator`. Fix and staffing ranking reuse `compass`. Investigator and
narrator settings are transport preparation; the investigation runtime is a later package.
Each role stores model ID, reasoning effort and timeout; API saves accept 1000–120000 ms.
Legacy flat AMD selections populate the two existing roles. Model and credential saves share a serialized queue for
atomic owner-only writes; in-memory credentials change only after persistence succeeds; a model save does not rewrite the separate credential file.

Nebius has **no guessed model defaults**. `NEBIUS_ROLE_DEFAULTS` is the single role-default
table, populated from the main agent’s N0 probes on 2026-10-19; `roleDefaults` applies environment overrides. Explicitly empty transport IDs or
catalog-confirmed-missing Nebius models fail closed as `model-not-configured`; the live
ranking/planner callers use deterministic fallback. AMD retains measured
`MiMo-V2.6-Flash` / `none` defaults. Those AMD measurements are historical evidence, not
measurements of Nebius or of new investigation behavior.

`NEBIUS_MODEL_CAPABILITIES` is the per-model capability table populated from N0. It selects `native` or `json-protocol` tool calling, JSON mode, and thinking
mapping (`omit`, `reasoning_effort`, or `chat_template_kwargs.enable_thinking`). For unverified model IDs, thinking controls are omitted and tool proposals use a JSON protocol. Explicit
unsupported thinking controls fail closed. Nebius UI efforts are `default` and, only for
verified thinking-capable models, `on`/`off`; optional `reasoningValues` maps on/off to the
verified wire values. No live capability or license claim follows from discovery alone.

Credentials come from provider-specific env/key files or owner-only
`provider-credentials.json`; unreadable key files return no key. Saved credentials override
environment bootstrap keys. API snapshots expose only configuration status and masked
hints. Both providers discover text models at `/models` via their own credential and URL.
Catalog status, cached models and stale-response revisions are isolated per provider.
Boot checks run in the background when enabled; `NODE_ENV=test` disables them. A confirmed
missing AMD role falls back to its measured default without changing the saved pin.

`GET /api/settings` exposes current-provider role settings and validation, plus
`modelsByProvider` for switching forms without copying model pins across providers.
`GET /api/settings/models?provider=…` refreshes a catalog; `POST /api/settings` saves
`{provider, role, modelId, reasoningEffort, timeoutMs?}`. Role omission means `compass`.
`requestOptions(role)` returns mode, provider, private API key, model ID, timeout and optional
effort; it is server-internal. Settings → API adds investigator/narrator role fieldsets and
per-role timeout fields. Public-demo settings retain existing read-only enforcement.

## Transport and tools

`callChatCompletion` retains the existing parsed-JSON return contract and optionally
reports metadata via `onMetadata`. It rejects unexpected tool calls. Existing responder,
fix, staffing and planner callers retain their bounded validators and fallback behavior.
Responder/fix/staffing recommendations persist only allowlisted model metadata; planner
events carry the same bounded metadata. Separate model reasoning traces are discarded.

`callChatTurn` returns `{content, toolCalls, finishReason, usage, modelId, latencyMs,
providerRequestId?}`. Tool calls normalize to `{id, name, arguments}` with parsed arguments.
Native requests send OpenAI-style function schemas and omit JSON response format. The JSON
protocol encodes read-only tools in the system instruction and parses `action: tool|final`
into the same result shape. Transport errors still throw to the caller's fallback handler;
malformed/unknown tool calls return a bounded `error` with no raw model text and execute
nothing. This module never executes tools.

Tool validation supports the documented restricted JSON Schema subset implemented in
`matchesSchema`: typed objects/arrays/scalars, properties, required keys, enum, numeric and
length/item bounds. Unknown schema keywords fail closed. Extra object keys require
explicit `additionalProperties: true`; arguments must be JSON objects matching the supplied
schema. At most six unique calls per turn, 8192 argument characters per call. Later tool
runners must also enforce run-level deadlines, evidence authorization and output-byte caps.

Usage contains only nonnegative safe integer token counts when supplied. Latency uses a
monotonic clock and includes queueing/retries for that turn; metadata describes the last
completed call when a ranking makes a repair. IDs are bounded strings. Prompts, credentials
and reasoning text are never added to metadata.

## Controls and fallback

`provider-controls.mjs` owns controls keyed by **transport and provider**. Production fetch
shares a provider's limiter across roles and rooms; AMD and Nebius have independent
queues, RPM windows and breakers. Injected transports remain isolated for tests.

Nebius defaults: 20 starts/minute, concurrency 2, up to 32 queued, two 429 retries,
breaker threshold 5 and cooldown 60000 ms. AMD retains 10 RPM and otherwise the existing
semantics. Only 429 retries, honoring Retry-After or bounded exponential jitter within the
caller's original deadline. Other failures return promptly; service failures affect only
that provider's breaker. Application validation happens outside controls.

Offline fixture paths remain API-free; forced failure remains deterministic. Live validation belongs to the main agent, never the unit suite or worker worktree.
Hermetic coverage: `amd-provider.test.mjs`, `nebius-provider.test.mjs`,
`provider-controls.test.mjs`, `provider-settings.test.mjs`, and existing ranking tests.
See [running and configuration](../operations/running-and-config.md) for env variables.

## Verified N0 role defaults (2026-10-19)

- Compass: `nvidia/nemotron-3-super-120b-a12b`, thinking `off` (real-packet measurement 2026-10-19: 5/5 valid at 3.2 s; thinking on was 4/5 at 17.6 s).
- Investigator: `nvidia/Nemotron-3-Ultra-550b-a55b`, provider-default thinking.
- Event planner and narrator: `nvidia/Nemotron-3_5-Lightning`, thinking off.

All use native tool calling and `chat_template_kwargs.enable_thinking`; output cap 4096.
`reasoning_content` is discarded alongside other separate reasoning fields. The capability
table also includes the verified Super-VL and Nano models for operator selection.
Unknown replacement model IDs default to omitted thinking unless explicitly configured.
Source: `docs/nebius/05_TOKEN_FACTORY_FACTS.md`; no worker live calls were made.

Blank model/effort env seeds use built-in defaults (N1b); direct empty transport IDs still fail closed. Agent-only watcher code and its tests live under `/home/makodev58/nebius-tools/`, outside the product repository.
