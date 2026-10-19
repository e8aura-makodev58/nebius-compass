# Running & configuration

## Run it

Requires Node.js ≥ 22.

```sh
npm ci
npm run dev
```

If the system Node is older than 22, a user-local runtime works without root. Install
Node 22 with [nvm](https://github.com/nvm-sh/nvm) (`nvm install 22 && nvm use 22`); nvm
puts the selected version's `bin/` first on `PATH` for the shell session. Re-run
`nvm use 22` in any new shell before `npm ci`, `npm test`, or `npm run dev`.

`npm run dev` runs `node --env-file-if-exists=.env backend/src/server.mjs`. Open
`http://127.0.0.1:3000`. The server binds `0.0.0.0` by default for LAN access. `npm start`
is identical. Live state persists under the git-ignored `backend/data/` tree; simulation
time does not advance while the process is stopped.

Copy the example env file to configure the Nebius (default) or AMD Token Factory provider:

```sh
cp .env.example .env
```

`.env` is git-ignored — credentials stay server-side and are never sent to the browser.
Without a key the app still runs; Live model calls fail closed to the deterministic
baselines.

## Environment variables

### Server

| Variable | Default | Purpose |
|----------|---------|---------|
| `COMPASS_PORT` (or `PORT`) | `3000` | HTTP listen port. |
| `COMPASS_HOST` | `0.0.0.0` | HTTP listen host. |
| `NODE_ENV` | — | `test` gates the test-only data-root override. |
| `COMPASS_PUBLIC_SETTINGS` | `read-only` | `read-only`: requests through the Cloudflare Tunnel (they carry `Cf-Connecting-IP`) may read provider settings but not change them or run model discovery; host/LAN requests are unaffected. `editable` lifts this, only for a tunnel behind Cloudflare Access. Any other value fails startup. |
| `COMPASS_IDLE_PAUSE_MINUTES` | `10` | Pause a RUNNING room after this many real minutes without operator activity (room mutations or the browser heartbeat; GET polling does not count), so an unattended room stops placing model calls. `0` disables it, e.g. for an unattended wall display. Rejects negative or non-numeric values at startup. |
| `COMPASS_HISTORY_RETENTION_DAYS` | `7` | Archive closed detail at daily simulated boundaries, plus on load. `0` disables new archiving; existing archives/facts remain readable. Open/pending work and exact outcome evidence remain live. |
| `COMPASS_CONTROL_ROOMS_DATA_ROOT` | — | **Test-only** multi-room data dir; requires `NODE_ENV=test`. Not a production relocation setting. |
| `COMPASS_LIVE_STATE_PATH` | `backend/data/live-simulation.json` | Test-only single-room state path override. |

### Inference modes

| Variable | Default | Purpose |
|----------|---------|---------|
| `COMPASS_LIVE_COMPASS_MODE` | `live` | Compass-agent mode: `live` / `fixture` / `force-failure`. |
| `COMPASS_EVENT_PLANNER_MODE` | `live` | Event-planner mode. |
| `COMPASS_DEMO_INFERENCE_MODE` | `fixture` | Default agent mode when not otherwise set (the Offline path). |
| `COMPASS_AGENT_TIMEOUT_MS` | `90000` | Compass-agent budget (ms) covering queueing, the ranking and its one repair attempt. An AMD ranking takes about 25–60s. |
| `COMPASS_EVENT_PLANNER_TIMEOUT_MS` | `30000` | Event-planner request timeout (ms). |

### Nebius Token Factory

Fresh installs select Nebius. Existing persisted AMD selections remain AMD.
Role defaults use the verified N0 models; an explicitly empty transport model ID causes
`model-not-configured` and deterministic fallback. No runtime model IDs are guessed.

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEBIUS_TOKEN_FACTORY_BASE_URL` | `https://api.tokenfactory.nebius.com/v1` | OpenAI-compatible base URL. |
| `NEBIUS_TOKEN_FACTORY_API_KEY` / `_API_KEY_FILE` | unset | Server-side key or key-file path; direct value wins; unreadable file fails closed. |
| `NEBIUS_TOKEN_FACTORY_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | Ranking role model seed. |
| `NEBIUS_TOKEN_FACTORY_EVENT_PLANNER_MODEL` | `nvidia/Nemotron-3_5-Lightning` | Event planner model seed. |
| `NEBIUS_TOKEN_FACTORY_INVESTIGATOR_MODEL` | `nvidia/Nemotron-3-Ultra-550b-a55b` | Investigator model seed (N3a tool loop). |
| `NEBIUS_TOKEN_FACTORY_NARRATOR_MODEL` | `nvidia/Nemotron-3_5-Lightning` | Narrator model seed (runtime added in later packages). |
| `NEBIUS_TOKEN_FACTORY_REASONING_EFFORT` | `default` | Ranking thinking seed: default/on/off; explicit on/off require a verified capability entry. |
| `NEBIUS_TOKEN_FACTORY_{EVENT_PLANNER,INVESTIGATOR,NARRATOR}_REASONING_EFFORT` | `off` / `default` / `off` | Independent role thinking seeds; shared effort inherits only for the same configured model. |
| `NEBIUS_TOKEN_FACTORY_TIMEOUT_MS` | `90000` | Ranking timeout seed (ms). |
| `NEBIUS_TOKEN_FACTORY_EVENT_PLANNER_TIMEOUT_MS` | `30000` | Planner timeout seed (ms). |
| `NEBIUS_TOKEN_FACTORY_INVESTIGATOR_TIMEOUT_MS` | `120000` | Investigator timeout seed (ms). |
| `NEBIUS_TOKEN_FACTORY_NARRATOR_TIMEOUT_MS` | `30000` | Narrator timeout seed (ms). |
| `NEBIUS_TOKEN_FACTORY_APP_RPM` | `20` | Request starts per rolling minute across this provider's roles/rooms. |
| `NEBIUS_TOKEN_FACTORY_APP_CONCURRENCY` | `2` | Requests in flight; queue cap 32. |
| `NEBIUS_TOKEN_FACTORY_MAX_RETRIES` | `2` | 429 retries within the caller deadline. |
| `NEBIUS_TOKEN_FACTORY_BREAKER_THRESHOLD` | `5` | Consecutive service failures before opening. |
| `NEBIUS_TOKEN_FACTORY_BREAKER_COOLDOWN_MS` | `60000` | Cooldown before one probe. |

Persisted role settings take precedence over environment seeds. Generic
`COMPASS_AGENT_TIMEOUT_MS` / `COMPASS_EVENT_PLANNER_TIMEOUT_MS` remain fallback seeds when
provider-specific timeout variables are absent. `COMPASS_INVESTIGATOR_MODE` and
`COMPASS_NARRATOR_MODE` default to the live Compass mode; fixture and force-failure remain
API-free. Their optional `COMPASS_*_TIMEOUT_MS` fallback seeds default to 120000/30000.
`NEBIUS_ROLE_DEFAULTS` and `NEBIUS_MODEL_CAPABILITIES` in
`backend/src/model-provider.mjs` contain the verified N0 IDs, native tool protocol, JSON support and
`chat_template_kwargs.enable_thinking` mapping (2026-10-19). The capability table supports optional on/off `reasoningValues` for a
verified `reasoning_effort` mapping. A discovered model alone grants no thinking capability.

### AMD Token Factory

| Variable | Default | Purpose |
|----------|---------|---------|
| `AMD_TOKEN_FACTORY_BASE_URL` | `https://developer.amd.com.cn/radeon/api/v1` | OpenAI-compatible base URL. |
| `AMD_TOKEN_FACTORY_API_KEY` | — | Team key (`rc-…`). Wins over the key file. |
| `AMD_TOKEN_FACTORY_API_KEY_FILE` | — | Path to a file containing only the key. In Docker, `compose.yaml` mounts the host file named here as a read-only secret and overrides the variable to `/run/secrets/amd_token_factory_key`. |
| `AMD_TOKEN_FACTORY_MODEL` | `MiMo-V2.6-Flash` | Seeds the model on a fresh install. |
| `AMD_TOKEN_FACTORY_REASONING_EFFORT` | `none` for MiMo, else `default` | Seeds the reasoning level; `default` omits the field. |
| `AMD_TOKEN_FACTORY_EVENT_PLANNER_MODEL` | shared model seed | Optional model seed override for the event planner only. |
| `AMD_TOKEN_FACTORY_EVENT_PLANNER_REASONING_EFFORT` | the shared effort when the planner uses the shared model, otherwise the planner model's default | Optional reasoning seed override for the event planner only. |
| `AMD_TOKEN_FACTORY_MAX_OUTPUT_TOKENS` | `4096` | `max_tokens` per call; a truncated reply fails closed. |
| `AMD_TOKEN_FACTORY_APP_RPM` | `10` | Local limit on AMD request starts per rolling minute, shared by every caller in the process. |
| `AMD_TOKEN_FACTORY_APP_CONCURRENCY` | `2` | Local limit on AMD requests in flight. Up to 32 more wait in a queue. |
| `AMD_TOKEN_FACTORY_MAX_RETRIES` | `2` | HTTP 429 retries per call, honouring `Retry-After` within the call's deadline. |
| `AMD_TOKEN_FACTORY_BREAKER_THRESHOLD` | `5` | Consecutive service failures (429, 5xx, network, timeout) that open the circuit breaker. |
| `AMD_TOKEN_FACTORY_BREAKER_COOLDOWN_MS` | `60000` | How long the breaker stays open before one probe request is allowed. |

The model and reasoning level can be chosen independently for Ranking (Compass), Event
planner, Investigator and Narrator at runtime from the Settings → API tab, which
persists to `backend/data/provider-settings.json`. A persisted selection takes precedence
over the env seeds on subsequent boots. See
[../backend/model-providers.md](../backend/model-providers.md).

## Ports, data, and persistence

`npm run generate:history -- --room plant-1 --until <ISO> [--from <seed.json>] [--out <file.json>]`
generates real-engine history entirely offline, resuming the input clock. It writes to
`.cache/generated-demo-history/<room>.json` by default, refuses runtime `backend/data/`
output, and never installs into a running app. Both roles use deterministic fallbacks;
no server, settings/key load or provider calls are involved. See
[docs/demo-history.md](../../docs/demo-history.md) for reproduction and performance notes.

- One process serves both the API and the static frontend.
- State lives under `backend/data/` — one subtree per control room
  (`backend/data/control-rooms/<id>/`), plus the shared `provider-settings.json`,
  `room-metadata.json`, and the application log. The whole `backend/data/` tree is
  git-ignored.
- Operational diagnostics: `GET /api/logs?limit=N` returns recent structured events.

Retained generator outputs have a companion `<output>.history/` tree. Keep it alongside
the JSON when resuming generation; install it as the room's `history-archive/` directory
alongside `live-simulation.json`. `--retention-days` overrides the default seven simulated
days; zero disables new archiving but does not restore already archived detail.
See [demo-history.md](../../docs/demo-history.md) for reproduction and operator handoff.

The committed plant-1 seed is now a gzip manifest plus payload. Bootstrap and
`generate:history` decode it automatically. Manual installation must materialize ordinary
JSON and copy its archives; use the command in `docs/demo-history.md`, after backing up the
whole target room. The compressed artifact does not compress runtime storage or memory.

## Deployment server (e8aura-deploy, Nebius build)

Since 2026-10-19 (user): all development happens on `e8aura-dev` and all deployments on
`e8aura-deploy` (private Tailscale address), both on the Proxmox host. `scripts/deploy/deploy.sh`
pushes a commit to a bare repo on the server and rebuilds the Compose project there; see
[scripts/deploy/README.md](../../scripts/deploy/README.md) for the server layout. `compose.yaml`
mounts the Nebius key as the required secret `nebius_token_factory_key`; the AMD key is an
optional secret (`/dev/null` when unset, so AMD fails closed). `COMPASS_BIND` and
`COMPASS_HOST_PORT` choose the published address; on the server the app listens on the
Tailscale address only, until the public URL is set up after the AMD hackathon 3.

## Production container (m920, AMD build)

Since 2026-10-18 ResponseCompass runs on m920 as the Docker Compose project
`responsecompass` (container `responsecompass`, host port 3200, volume
`responsecompass-data`, `restart: unless-stopped`, so it starts with Docker after a reboot).
The earlier non-container process on 3200 is retired; its data was copied into the volume
and the pre-switchover backup is `.cache/backups/data-pre-docker-20261018T042107Z`. See
the README's Docker section for switchover and rollback.

Public access is through a Cloudflare Tunnel: the `cloudflared` service in `compose.yaml`
(profile `tunnel`, token from the host file in `RESPONSECOMPASS_TUNNEL_TOKEN_FILE`, mounted as
a read-only secret) forwards the public hostname to `http://responsecompass:3000`. No host
port is opened for it. The app has no authentication; provider settings are read-only for
tunnel visitors (`COMPASS_PUBLIC_SETTINGS`), so the shared key can only be changed from the
host or LAN at port 3200.


Blank Nebius model/effort environment values use the built-in N0 defaults; an explicitly empty model ID supplied directly to the transport fails closed. Ultra (investigator) uses provider-default thinking; Super (ranking) and Lightning (planner, narrator) send `enable_thinking: false`.


## Room investigation settings

Use the revision-guarded `/demo/investigation-policy` PATCH endpoint for OPERATOR (default)
or AUTO_APPROVE_SAFE, investigationDeadlineMinutes (30) and investigationShare (0.2).
These are persisted room settings, not environment variables. The offline history generator
sets safe approval explicitly and accepts `--investigation-share`. The staged synthetic datasets
are not installed into existing rooms automatically; see `backend/seed/INVESTIGATION_DATASETS.md`.

`COMPASS_NARRATOR_MODE` overrides the narrator execution mode; absent it, the runtime uses
`COMPASS_LIVE_COMPASS_MODE`, then live. Forced failure/fixture paths use templates without API calls.

## Judge-period daily token budget

`COMPASS_DAILY_BUDGET_USD` is unset/0 by default (unlimited). Set a positive USD estimate in
the server environment and restart to limit new live inference after known spend reaches
that amount per UTC day. Negative/non-finite values fail configuration. In-flight work
finishes, then calls resume next UTC day; budget rejection uses deterministic fallback.
Prices come from the fixed Nebius table; unknown prices and missing usage cannot provide a
complete cost cap. Settings → API reports known estimated spend and unpriced calls explicitly.

Deployment-global `provider-usage.json` is persisted in the data root with 120-day retention
and atomic owner-only writes. Back it up with other deployment state; do not edit it through
public settings. No prompt/response text is retained. GET /api/settings usage is readable by
tunnel visitors, while budget configuration remains server-managed. See model-providers.md.
