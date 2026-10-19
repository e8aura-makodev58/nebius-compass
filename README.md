# ResponseCompass

**Not just who's closest. Who makes the most sense.**

ResponseCompass is a context-aware responder-dispatch agent inside a persistent simulated control room. An existing operational system decides what needs attention; Compass automatically finds who should respond to each issue right now.

The governing boundary is:

> Code establishes the evidence. Compass ranks the match. Responders accept asynchronously. Central command may override.

## Nebius Token Factory and NVIDIA Nemotron

ResponseCompass runs its model roles on **NVIDIA Nemotron models served by Nebius Token
Factory** (OpenAI-compatible API, `https://api.tokenfactory.nebius.com/v1`). Each role has
its own model, thinking setting and timeout, chosen from live measurements on the app's own
requests ([docs/nebius/05_TOKEN_FACTORY_FACTS.md](docs/nebius/05_TOKEN_FACTORY_FACTS.md)):

| Role | Default model | Thinking | What it does |
|---|---|---|---|
| Compass ranking (responders, fixes, overtime options) | `nvidia/nemotron-3-super-120b-a12b` | off | Ranks only the eligible candidates code supplies, with qualitative tradeoffs. |
| Investigator | `nvidia/Nemotron-3-Ultra-550b-a55b` | provider default (observed on in N0) | Investigates reports with read-only tools and cited past cases. |
| Event planner, narrator | `nvidia/Nemotron-3_5-Lightning` | off | Proposes the next simulated event; writes simulated field reports. |

Token Factory made the agent practical to run live: in our measurements a ranking returned
in about 3 s (the previous provider took 20–60 s), native tool calls were observed on the four
Nemotron models in the recorded probe table, and per-model pricing and limits are published
in the model catalog. Application code validates model output and supplies deterministic
fallbacks when inference is slow, invalid or unavailable. Investigations may still abstain,
escalate or expire and need operator action; fallback never bypasses the dispatch gate. AMD
Token Factory remains selectable in Settings. Changes made for this hackathon are listed in [HACKATHON_CHANGES.md](HACKATHON_CHANGES.md).

Set `NEBIUS_TOKEN_FACTORY_API_KEY` (or `NEBIUS_TOKEN_FACTORY_API_KEY_FILE`); see
[.env.example](.env.example). Live mode spends Nebius credit. Offline mode and both test
suites make no model calls.

## Live demo

Public judge access has not yet been published. Until a verified public URL is added,
use the local setup below; the private deployment address is not a judge-access link.

Running rooms pause their simulation clocks after ten idle minutes by default.
In-flight calls can finish, and explicit operator actions can still request inference.
A positive `COMPASS_DAILY_BUDGET_USD` adds an estimated daily limit; its default is
unlimited. **Offline Demo** makes no provider calls.

ResponseCompass was first built for an earlier AMD hackathon; that submission's media
remain in [docs/submission/](docs/submission/). What is new for Nebius is listed in
[HACKATHON_CHANGES.md](HACKATHON_CHANGES.md).

This is a synthetic project. It contains no proprietary facility context, real personnel
data, or production credentials.

## What is implemented

### New for Nebius: Compass Investigator

An operator types a field report in plain language ("Station 12: the transfer keeps
stopping short of the end position…"). The report is handled in five steps:

1. **Screening in code.** Code screens it first. Hazard words (smoke, sparks, injury,
   bypassing an interlock) escalate it to a person with no model call. Garbled, empty or
   over-long text is declined, and instruction-like text is flagged and kept as quoted data.
2. **Interpretation.** Code lists the possible readings (station × catalog symptom).
   Nemotron Super ranks them, and the operator confirms one before any issue exists.
3. **Investigation.** Nemotron Ultra investigates with six read-only tools: case search, case
   lookup, equipment history, fix catalog, fix evidence, and eligible responders. The tools
   see only outcomes completed before the decision time.
4. **Validation.** Code checks the structured result's IDs, citations, catalog membership,
   qualifications and bounded prose; it does not prove every free-text explanation true:
   - cited case ids must have been returned by the tools in this run;
   - fixes must come from the catalog, with procedure text quoted verbatim;
   - responders must be eligible and hold the fix's certifications;
   - evidence grade and outcome are computed by code.

   If evidence is missing or no qualified responder exists, the investigation abstains.
5. **Approval.** Operator approval is the default for investigated issues. Central command
   confirms the required safety prerequisites before dispatch, or rejects/escalates.
   An explicitly enabled safe policy may approve a hazard-free, supported READY result
   at its deadline after the same current qualification checks. The dispatch gate
   requires the recorded authorization; the model cannot approve or dispatch.

If the model is slow or invalid, a labelled deterministic investigation takes over. An
evaluation harness (`npm run eval:investigator`) scores 24 synthetic scenarios; results and
known limits are in [docs/evaluation.md](docs/evaluation.md).

### Earlier platform

- persistent simulation clock with pause/resume; the UI offers 1× and 5× (the API also accepts 10× and 60×);
- deterministic one-shot scheduler with bounded cadence and no restart catch-up;
- a dedicated Demo view with visible agent activity and Trigger Next Event / Force Resolve controls;
- a default 2D manufacturing-floor map with three-floor selection, drag pan, wheel/button/keyboard zoom, and an optional 2.5D overview;
- contextual structured event planner plus deterministic seeded fallback;
- a planner ceiling of ten unresolved issues, one or two exclusive responders per assigned issue, waiting behavior, and stale protection;
- automatic support matching for complex or delayed work, plus roster-versioned central release and cross-issue transfer;
- hidden per-responder/per-class simulation truth blended with confidence-weighted same-class history for stochastic resolution outcomes;
- runtime resolution history, success, failure/reopen, responder release, and downtime tracking;
- bounded live Compass context with nearest and auditable naive-score baselines;
- revision-safe structured Compass results, automatic offer/accept/reject dispatch, central override, and audit records;
- persistent event feed with explicit baseline-disagreement markers;
- clickable, on-demand issue audit trails with complete Compass analysis, offer history, control-center overrides, and resolution actions;
- fixed-snapshot P0 analytics with denominators and thin-sample safeguards;
- API-free deterministic Offline Demo using the same offer/accept and override interaction;
- hermetic unit/integration tests, including the deterministic soak, and Chromium E2E tests; the recorded round-17 verification on 2026-10-19 passed 431 and 83 respectively.

## Architecture

```mermaid
flowchart TD
    Clock[Persistent simulation clock] --> Scheduler[Deterministic scheduler]
    Scheduler --> Planner[Contextual event planner]
    Planner --> Validator[Backend validator]
    Fallback[Deterministic fallback] --> Validator
    Validator --> Store[(Persistent canonical state)]
    Store --> Context[Deterministic context engine]
    Context --> Baselines[Nearest + naive baselines]
    Context --> Compass[Compass agent]
    Baselines --> Dispatch[Automatic ranked offer queue]
    Compass --> Dispatch
    Dispatch --> Response[Primary / support accept or reject]
    Response --> Store
    Override[Central command override] --> Store
    Store --> Resolution[Segmented one/two-person resolution attempt]
    Resolution --> Store
    Store --> UI[Shared Live / Offline control room]
    Store --> Analytics[Fixed-snapshot analytics]
    Report[Field report] --> Policy[Hazard / input policy in code]
    Policy --> Interp[Nemotron Super ranks code-built interpretations]
    Interp --> Confirm[Operator confirms facts]
    Confirm --> Investigator[Nemotron Ultra + read-only tools]
    Investigator --> Checks[Citation, catalog, qualification checks]
    Checks --> Approval[Central command approval]
    Approval --> Gate[Dispatch gate]
    Gate --> Dispatch
```

Application code owns time, facts, eligibility, metrics, baselines, validation, simulation outcomes, and all mutations. Models may only propose one bounded event, rank the eligible candidates or interpretations supplied to them, or investigate with read-only tools whose outputs code validates; they never dispatch, approve, or decide overtime. Neither model sees `ResponderSkill`; the normal UI/API and analytics do not expose it either. See [architecture details](docs/architecture.md).

## Run locally

Requires Node.js 22+.

```sh
npm ci
npm run dev
```

```sh
# Optional month-backed demonstration, using a new isolated data directory.
COMPASS_DATA_DIR="$PWD/.cache/judge-demo" COMPASS_BOOTSTRAP_DEMO_SEED=true npm run dev
```

Use a data directory that has not created `control-rooms`; bootstrap never replaces
existing rooms. Configure a Nebius key for live model output. Without enough public case
evidence an investigation may abstain, which is expected behavior rather than a failed demo.

Open `http://127.0.0.1:3000`. The server binds `0.0.0.0` by default for LAN demos; use `COMPASS_HOST` and `COMPASS_PORT` to override it. Live state persists under ignored `backend/data/` by default; set `COMPASS_DATA_DIR` to relocate all persistent application state. Simulation time does not advance while the process is stopped. A running room pauses itself after 10 minutes with no one using it (`COMPASS_IDLE_PAUSE_MINUTES`; `0` disables), so an unattended tab does not keep spending provider tokens.

The application reads an optional `.env` automatically:

```sh
cp .env.example .env
```

Fresh installs select Nebius Token Factory. Set `NEBIUS_TOKEN_FACTORY_API_KEY` or
`NEBIUS_TOKEN_FACTORY_API_KEY_FILE`; the default roles are Super/off for ranking,
Ultra/provider-default thinking for investigation, and Lightning/off for planning and
narration. Existing saved AMD configurations are preserved. Settings → API can save a
server-side key and select either provider's models, thinking settings and timeouts.
Missing credentials or failed inference use the applicable deterministic fallback. Keys
stay server-side and are never sent to the browser.

Offline Demo is always hard-pinned to the committed fixture, regardless of Live environment settings, and never makes an API request.

## Docker deployment

`compose.yaml` runs ResponseCompass as Compose project **`responsecompass`**: container
`responsecompass`, host port **3200** → container 3000, named volume
**`responsecompass-data`** at `/app/data`, `restart: unless-stopped`. The container runs as
the non-root `node` user with a read-only root filesystem, a `/tmp` tmpfs, all Linux
capabilities dropped and no-new-privileges. `.env` is read at runtime only and excluded
from the image.

Before running production Compose, create a readable host file containing the Nebius key
and set `NEBIUS_TOKEN_FACTORY_API_KEY_FILE` in `.env` to its absolute host path. This file
is required by `compose.yaml`, even if a direct API-key variable is set. Compose mounts it
read-only at `/run/secrets/nebius_token_factory_key`. An AMD key file is optional; set
`AMD_TOKEN_FACTORY_API_KEY_FILE` to enable its secret mount. Do not put credential values
in committed files or the image. For an API-free fallback-only container, use
`/dev/null` as the Nebius host file path instead of a key file.

```sh
docker compose -p responsecompass up -d --build
docker compose -p responsecompass ps
```

The health check calls `GET /api/control-rooms` and passes only when every room reports
`READY`. These names are deliberately distinct from the older Compass deployment on the
same host (project `compass`, volume `compass-data`, port 3000); never point this file at
that volume. `docker-compose.yml` is a separate development setup (port 3100).

### Public access through Cloudflare Tunnel

The `cloudflared` service (container `responsecompass-tunnel`, running as uid 1000 so a mode-600 token file stays readable, pinned
`cloudflare/cloudflared:2026.10.1`) connects outbound to Cloudflare, so no host port is
opened. It runs only under the `tunnel` profile and starts after the app is healthy. The
tunnel token is mounted like the AMD key: a read-only secret from the host file named by
`RESPONSECOMPASS_TUNNEL_TOKEN_FILE`, read with `--token-file`, never placed in an
environment variable. In `.env`:

```sh
COMPOSE_PROFILES=tunnel
RESPONSECOMPASS_TUNNEL_TOKEN_FILE=/absolute/path/to/tunnel.token
```

In the Cloudflare dashboard, set the public hostname's service to
`http://responsecompass:3000` (the app's name on the Compose network, not `localhost:3200`).
The app has no login. Provider settings are therefore read-only for anyone arriving through
the tunnel (Cloudflare adds `Cf-Connecting-IP` to those requests): they see the Settings page
greyed out, and the server refuses changes. Change the key or models from
`http://<host>:3200` on the host or LAN. `COMPASS_PUBLIC_SETTINGS=editable` lifts this, for a
tunnel already behind Cloudflare Access.

### Switchover, data migration, and rollback

A room is a checkpoint file plus a change journal (see
`project-state/backend/live-runtime.md`), so always copy **whole directories**.

1. Pause the rooms and stop the non-container process on 3200; never run two writers
   against the same data.
2. Back up the complete `backend/data/` directory and verify the copy (`diff -rq`).
3. Create `responsecompass-data` and confirm it is **empty**; copy the data in once as root
   with a one-off container, then `chown -R 1000:1000`. Never copy into a non-empty volume.
4. `docker compose -p responsecompass up -d --build`; require `healthy`, every room
   `READY`, and the Settings credential reported as configured.

Rollback: `docker compose -p responsecompass down` (the volume is kept), then restart the
former process against the verified backup. Do not delete the volume as a rollback step.

## Demo controls

- **Resume / Pause** controls simulation time.
- **Speed** selects 1× or 5× without replacing the current timer. Live inference runs in wall-clock time and can lag a faster simulation. The API also accepts 10× and 60×; those higher speeds are useful for accelerated fixture/fallback runs.
- **Demo** opens a dedicated activity monitor and keeps presentation-only shortcuts out of the normal operating controls. The navigation status pill remains visible while an agent is working.
- **Trigger Next Event** immediately executes the validated scheduler path and respects the active-issue ceiling.
- **Force Resolve** immediately consumes the selected assigned issue's one-shot token. The result still uses the normal skill/history probability and variability model; it bypasses waiting, not outcome logic.
- **Issue staffing** can request a second responder, release either member of a two-person roster, or transfer one responder from another two-person issue. Primary promotion is automatic and every roster change replans remaining work without rerolling the outcome.
- **Reset** resets only the active mode; switching to Offline does not erase Live history.

## Verification

```sh
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:e2e
```

Playwright's dependency installation may need system-package privileges. On a system
with Chromium dependencies already installed, `npx playwright install chromium` is
sufficient. The test server uses port 3012 by default; set `COMPASS_E2E_PORT` if needed.

`npm test` includes contracts, persistence, clock/scheduler idempotency, planner fallback, multi-issue races, latent resolution, live recommendations, assignments, analytics, Offline reset, convergence, and a 100-opportunity soak.

See [evaluation results and limitations](docs/evaluation.md). The deterministic policy proves state integrity and seed disagreement capacity; it is deliberately not presented as a live-model quality result. Genuine provider sign-off requires credentials and pinned model IDs.

## Analytics and ethics

Rates always include denominators and are suppressed as **Insufficient data** below three observations. **Issue-Class Experience** is alphabetically ordered, emphasizes cases, and is not an employee ranking. Compass excludes compensation, seniority, demographics, biometrics, personality, fatigue, disciplinary data, and general HR scoring. A responder with no prior issue-class history remains eligible.

## Operational diagnostics

The application persists up to 1,000 structured runtime log events in the ignored local data directory. Retrieve them with `GET /api/logs` or `GET /api/logs?limit=25`. Browser failures are reported to `POST /api/logs/client`.

## Source of truth

[`Compass_ResponseCompass_SOW_v4_FINAL.md`](Compass_ResponseCompass_SOW_v4_FINAL.md) is the product specification. Material implementation decisions are recorded in [docs/decisions.md](docs/decisions.md), agents coordinate through [handover.md](handover.md), and merged handoffs are archived in [docs/handover-history.md](docs/handover-history.md).

The generic control rooms are **e8-aura-p1** (`/rooms/plant-1`) and
**e8-aura-p2** (`/rooms/plant-2`). Compass ranks eligible responders from aggregate
simulated history. MES integration is not implemented; the investigator now uses public
case records to rank catalog procedures for approval.

## Evidence-based troubleshooting

Issues expose a public symptom and catalog procedures with ranked order and observed
evidence. Source labels distinguish Nebius, AMD, deterministic fallback and Offline fixtures.
The applied procedure is frozen when work begins and affects the seeded simulated
outcome. OPEN-gate work can try the next untried procedure after failure. An investigated
issue needs a fresh authorization before another attempt; its previous approval is
consumed. The incident planner's free-text response remains a note, while audit entries
record the fix actually applied.

Models never see latent fault causes, effectiveness tables or hidden responder skill.
First-time fix rates and recommendation/baseline agreement carry denominators; legacy
free-text actions are labelled and excluded from fix evidence. These are simulated
observations, not proof of improvement in a real facility.
