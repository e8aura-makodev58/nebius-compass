# Public documentation factual review (N7)

Reviewed **master `9b2a76e`**, 2026-10-19. All eight assigned files were read in full.
This is a repository/code/history review, not a new provider measurement, remote deployment
inspection, external licensing verification or exhaustive secret scan. No suites or live
calls were run. The reviewed files are unchanged. Locations below refer to this baseline.

Each finding supplies exact proposed text. Where a code/package fix is needed to make a
promise true, the proposed documentation instead states the current limitation; the main
agent can fix the implementation and then remove that limitation. No URLs, consent or
measurement results have been invented.

## Numbered findings

### 1. blocker — Docker quickstart lacks its mandatory Nebius secret prerequisite

**Locations:** `README.md:155`, `README.md:160`, `.env.example:36`.

**Evidence:** `compose.yaml` requires `NEBIUS_TOKEN_FACTORY_API_KEY_FILE` with a `:?`
interpolation and mounts that host file. A direct API-key value alone, allowed by the local
instructions, does not satisfy this requirement. AMD's file is now optional (`/dev/null`
default). The example comment saying Docker cannot see host key files omits the production
secret mounts. Thus a fresh reader can follow the instructions and fail before app startup.

**Exact replacement for README lines 160–162:**

> Before running production Compose, create a readable host file containing the Nebius key
> and set `NEBIUS_TOKEN_FACTORY_API_KEY_FILE` in `.env` to its absolute host path. This file
> is required by `compose.yaml`, even if a direct API-key variable is set. Compose mounts it
> read-only at `/run/secrets/nebius_token_factory_key`. An AMD key file is optional; set
> `AMD_TOKEN_FACTORY_API_KEY_FILE` to enable its secret mount. Do not put credential values
> in committed files or the image. For an API-free fallback-only container, use
> `/dev/null` as the Nebius host file path instead of a key file.

**Exact replacement for .env.example lines 36–37:**

```text
# Production compose.yaml mounts the host files named by the *_API_KEY_FILE variables
# as read-only secrets. Its Nebius file path is required; the AMD file is optional.
# The separate development docker-compose.yml does not define these secret mounts.
```

### 2. major — Local provider instructions contradict the implemented default

**Locations:** `README.md:147`, `README.md:149`, `docs/evaluation.md:98`.

**Evidence:** `model-provider.mjs:70` defines the four Nebius defaults;
`provider-settings.mjs` defaults fresh settings to Nebius and preserves saved AMD settings.
Both providers exist. The README and legacy evaluation paragraph still say AMD is the
only provider. This misdirects first-time judges configuring the Nebius entry.

**Exact replacement for README lines 147–149:**

> Fresh installs select Nebius Token Factory. Set `NEBIUS_TOKEN_FACTORY_API_KEY` or
> `NEBIUS_TOKEN_FACTORY_API_KEY_FILE`; the default roles are Super/off for ranking,
> Ultra/provider-default thinking for investigation, and Lightning/off for planning and
> narration. Existing saved AMD configurations are preserved. Settings → API can save a
> server-side key and select either provider's models, thinking settings and timeouts.
> Missing credentials or failed inference use the applicable deterministic fallback.

**Exact replacement for evaluation line 98:**

> This archived ten-run Scenario A measurement used the removed OpenAI provider and is not
> a measurement of either current provider. Fresh installs now use Nebius Token Factory;
> AMD remains selectable. The recorded legacy result was 10/10 READY, with Engr028 ranked
> first and latencies of 7.486–13.011 seconds. It does not establish current provider
> accuracy or satisfy an outstanding live 100-opportunity responder-ranking gate.

### 3. major — Docker's fixture-backed Offline promise is unsupported by its image contents

**Locations:** `README.md:39`, `README.md:151`, `README.md:155`.

**Evidence:** `Dockerfile:11–13` copies `backend/src`, `backend/seed` and `frontend`, but
neither root `fixtures/` nor `backend/fixtures/`. `agent.mjs:90,250` reads the root Scenario A
fixture; `investigator.mjs:52,108` reads root investigation fixtures; `fix-ranking.mjs:37`
and `staffing-ranking.mjs:36` read backend fixtures. Missing files trigger unavailable or
deterministic fallback. This does **not** prove the Docker Live server cannot start; it
means the committed fixture behavior promised for Offline cannot be reproduced in that image.

**Exact replacement for README line 151 until packaging is corrected:**

> Offline mode makes no provider calls. In a source checkout it uses the committed
> fixtures. The current Dockerfile omits `fixtures/` and `backend/fixtures/`, so its
> fixture-based rankings and investigation scripts are unavailable and can fall back.
> Include both directories in the image before claiming parity with the source Offline demo.

### 4. major — Development Compose does not persist the directory the image actually uses

**Location:** `README.md:172`.

**Evidence:** `docker-compose.yml` mounts `./backend/data:/app/backend/data`, while
`Dockerfile:18` sets `COMPASS_DATA_DIR=/app/data`. The development service does not override
that variable. The production named volume is correct, but calling the other setup an
alternative without this distinction risks losing state when its container is recreated.

**Exact replacement for the final sentence of README line 172:**

> `docker-compose.yml` is a separate development setup on port 3100. Its current volume
> target is `/app/backend/data`, while the image writes to `/app/data`; correct that mount
> or override `COMPASS_DATA_DIR` before relying on persistence across container recreation.

### 5. major — A person does not approve every dispatch

**Locations:** `README.md:70`, `docs/nebius/06_SUBMISSION_DRAFT.md:19`,
`docs/DEMO_SCRIPT.md:14`.

**Evidence:** `finishInvestigationDeadline` in `investigation-service.mjs:232` can authorize
READY results under explicit `AUTO_APPROVE_SAFE`, using actor `policy:AUTO_APPROVE_SAFE`.
It is not restricted to simulation-origin reports. Ordinary OPEN-gate assignment also
uses automatic responder offers. A model never approves, but an application policy can.

**Exact replacement for README step 5:**

> 5. **Approval.** Operator approval is the default for investigated issues. Central command
>    confirms the required safety prerequisites before dispatch, or rejects/escalates.
>    An explicitly enabled safe policy may approve a hazard-free, supported READY result
>    at its deadline after the same current qualification checks. The dispatch gate
>    requires the recorded authorization; the model cannot approve or dispatch.

**Exact replacement for the submission short description's second sentence:**

> Nemotron on Nebius Token Factory investigates it with read-only tools; code validates
> the structured result. Investigated issues require operator approval by default, or
> authorization from an explicitly enabled safe application policy.

**Exact replacement for the demo row's narration at 1:40:**

> Code grades the evidence and checks certifications. In this recording the room uses
> operator approval, so I must confirm each prerequisite before dispatch. The gate
> enforces that authorization; the model never authorizes an assignment.

Add this exact checklist item to `docs/DEMO_SCRIPT.md:19`:

> - Set the room's investigation approval policy to OPERATOR before recording this flow.

### 6. major — “Code checks every claim” overstates semantic verification

**Locations:** `README.md:63`, `docs/nebius/06_SUBMISSION_DRAFT.md:19`.

**Evidence:** `validateInvestigationFinal` (`investigator.mjs:20–35`) checks schemas, allowed
hypothesis strings, IDs, returned case/field references and bounded prose. It does not prove
that a free-text rationale follows from a cited case. `score.mjs:35` checks returned case
membership, not entailment. Catalog text and grades are code-owned, which is a narrower,
well-supported claim.

**Exact replacement for README line 63:**

> 4. **Validation.** Code checks the structured result's IDs, citations, catalog membership,
>    qualifications and bounded prose; it does not prove every free-text explanation true:

Use the replacement short description in finding 5 instead of “code checks every claim.”

### 7. major — Fallback does not guarantee uninterrupted dispatch or automatic retries

**Locations:** `README.md:28`, `README.md:260`, `docs/nebius/06_SUBMISSION_DRAFT.md:56`.

**Evidence:** Unsupported investigations abstain; READY runs can expire; the gate remains
closed. `dispatch-gate.mjs` consumes authorization for one attempt. Failure does not permit
another automatic attempt under that approval. The N3b unattended month reaches its pending
queue cap, documented in `backend/seed/INVESTIGATION_DATASETS.md`. OPEN-gate retries and
investigation-gated retries must not be described as identical.

**Exact replacement for README lines 27–29:**

> Application code validates model output and supplies deterministic fallbacks when
> inference is slow, invalid or unavailable. Investigations may still abstain, escalate
> or expire and need operator action; fallback never bypasses the dispatch gate. AMD
> Token Factory remains selectable in Settings.

**Exact replacement for README lines 259–261:**

> The applied procedure is frozen when work begins and affects the seeded simulated
> outcome. OPEN-gate work can try the next untried procedure after failure. An investigated
> issue needs a fresh authorization before another attempt; its previous approval is
> consumed. Audit entries record the fix actually applied.

**Exact replacement for submission lines 56–57:**

> - If inference is slow or invalid, a labelled deterministic path remains available.
>   Unsupported or expired investigated work still requires operator action; no fallback
>   bypasses the approval gate.

### 8. major — The three-issue ceiling is stale

**Location:** `README.md:85`.

**Evidence:** `live-schema.mjs:128` requires `maxActiveIssues === 10`;
`event-planner.mjs:93,118` enforces that planner ceiling. Workforce demand/staffing replaced
the earlier three-issue system. This is a planner limit, not proof that every possible
manual field-report path caps unresolved issues at ten.

**Exact replacement:**

> - a planner ceiling of ten unresolved issues, one or two exclusive responders per
>   assigned issue, waiting behavior, and stale protection;

### 9. major — Fresh local setup does not reproduce the month-backed investigator example

**Locations:** `README.md:130`, `docs/nebius/06_SUBMISSION_DRAFT.md:97`.

**Evidence:** `demo-seed-bootstrap.mjs:22` enables the month only when
`COMPASS_BOOTSTRAP_DEMO_SEED=true`, and preserves an existing `control-rooms` directory.
The local README command does not enable it. Production Compose does. A fresh default seed
can legitimately lack supported catalog cases; “confirm, then approve” is not guaranteed.
`e2e/investigation-real.spec.mjs` explicitly tests fresh-room abstention.

**Exact addition after the local setup block:**

```sh
# Optional month-backed demonstration, using a new isolated data directory.
COMPASS_DATA_DIR="$PWD/.cache/judge-demo" COMPASS_BOOTSTRAP_DEMO_SEED=true npm run dev
```

> Use a data directory that has not created `control-rooms`; bootstrap never replaces
> existing rooms. Configure a Nebius key for live model output. Without enough public case
> evidence an investigation may abstain, which is expected behavior rather than a failed demo.

**Exact addition to the judge instructions:**

> The approval example assumes a month-seeded room with supported case evidence and an
> available qualified responder. An occupied station or an abstaining investigation needs
> a different station or operator follow-up; approval is not guaranteed for arbitrary text.

### 10. major — Hosted judge access and submission links are still placeholders

**Locations:** `README.md:37`, `docs/nebius/06_SUBMISSION_DRAFT.md:90–103`.

**Evidence:** No public working demo, video or final public repository URL is supplied in
these instructions. The operations guide describes private-network access, not a public
judge URL. The draft explicitly acknowledges blanks; this is an unresolved pre-filing
requirement, not evidence that a deployed demo is public.

**Exact replacement for README line 37:**

> Public judge access has not yet been published. Until a verified public URL is added,
> use the local setup below; the private deployment address is not a judge-access link.

**Exact interim replacement for the three submission link bullets:**

> - Working demo: not yet published; supply and verify a public judge-access URL before filing.
> - Demo video: not yet published; supply the final video URL before filing.
> - Public repository: final URL not yet recorded; supply the published repository URL before filing.

The author must replace these interim disclosures with verified links; this review cannot
invent those URLs. Keep the judge-instruction paragraph marked draft until then.

### 11. major — Evaluation “model runs” latency/token denominators include injected providers

**Locations:** `docs/evaluation.md:17–18`, `docs/evaluation.md:51–52`.

**Evidence:** `score.mjs:96–97` collects every finite `record.model` latency/token value,
without filtering source or excluding stubs. `investigation-eval.mjs:47` deliberately injects
forced failure and a never-resolving provider with a 10 ms deadline. `investigator.mjs:105`
returns model counters for deterministic fallbacks as well. These are pipeline record
percentiles, not exclusively successful or even live provider latency. Raw rows are needed
to recompute live-only percentiles.

**Exact replacement for both latency row labels:**

> Investigation-record latency p50 / p95 (includes deterministic/injected-provider cases)

**Exact replacement for both token row labels:**

> Recorded investigator tokens p50 / p95 (includes zero-token injected-provider cases)

**Exact addition below each table:**

> Timing and token percentiles use all investigation records with those fields, including
> forced-failure and injected-deadline scenarios; they are not live-only provider latency
> or token estimates. Interpretation-ranking latency/tokens are not included in these
> investigator-record percentiles.

Do not silently relabel the existing numeric values as newly recomputed live-only results.

### 12. major — The interpretation-agreement score measures supplied operator facts

**Locations:** `docs/evaluation.md:15`, `docs/evaluation.md:49`.

**Evidence:** `investigation-eval.mjs:53` confirms `scenario.expected.interpretation` directly,
not the model's top ranked option. `score.mjs:82–86` compares the resulting record with that
same expected triple. The table already says operator-confirmed, but the metric's causal
limitation needs to be explicit to prevent interpreting 15/15 as classifier accuracy.

**Exact replacement for both metric labels:**

> Confirmed interpretation round-trip agreement (expected facts supplied by operator adapter)

**Exact addition:**

> The harness supplies each labelled expected interpretation to the confirmation endpoint.
> Agreement therefore verifies preservation of those confirmed facts, not whether Super's
> top interpretation was independently correct. Model interpretation-ranking accuracy is
> not measured by this score.

### 13. major — “Safety violations” is a narrow post-validation check, not broad safety evidence

**Locations:** `docs/evaluation.md:13`, `docs/evaluation.md:47`,
`docs/nebius/06_SUBMISSION_DRAFT.md:85`.

**Evidence:** `safetyCheck` (`score.mjs:43–55`) checks certification membership for responders
marked qualified and missing prerequisites only on APPROVED decisions. The scenario adapter
ends before approval. Thus the headline zero measures certification consistency of accepted
records; it is not an exhaustive hazard assessment or an exercised approval/prerequisite rate.
Citation validity likewise means returned-reference membership, not semantic support (finding 6).

**Exact replacement for both safety row labels:**

> Certification inconsistencies in accepted outputs (post-validation)

**Exact addition below the tables:**

> The scenario runner does not approve assignments. These zero counts do not measure
> approval-time prerequisite enforcement or all possible safety failures; separate
> integration tests exercise those controls. Citation counts measure returned-reference
> validity, not proof that a rationale is entailed by a case.

**Exact replacement for the submission evaluation bullet at line 85:**

> - an evaluation harness and a reported second live-mode run: 24/24 end-to-end outcome
>   classes including policy and deterministic paths, 64/64 returned-reference citations,
>   zero post-validation certification inconsistencies in accepted outputs, and 6/6 labelled
>   hazard/input decisions without a model call; these are small scenario checks, not a
>   general accuracy or safety certification;

### 14. major — Historical live totals lack committed per-scenario evidence for recomputation

**Locations:** `docs/evaluation.md:3`, `docs/evaluation.md:35`,
`docs/nebius/05_TOKEN_FACTORY_FACTS.md:60`, `docs/nebius/05_TOKEN_FACTORY_FACTS.md:78`.

**Evidence:** Commits `1ec3b9d`, `b40711c`, `76e1e6a` and `4bd0dae` contain summaries/scripts,
not a committed raw run artifact with all rows required to recompute the tables. Tracked
fixtures are synthetic, not recordings of these live runs. The summaries agree with the
project log, but that is not independent reproduction. Do not replace their numbers with
fixture results or claim this review freshly verified live observations.

**Exact addition to the evaluation and N0 measurement sections:**

> These are historical measurements reported by the main agent. The repository currently
> contains their summaries and harnesses, not complete per-run output artifacts from which
> all totals can be recomputed. A new live run may differ and spends provider credit;
> fixture runs do not reproduce these live measurements. Publish a sanitized run artifact
> with command, code revision, model settings, source/fallback counts and per-scenario
> results before presenting these totals as independently auditable.

### 15. major — The native-tool summary mixes four tested models with five catalog models

**Locations:** `README.md:25`, `HACKATHON_CHANGES.md:41`,
`docs/nebius/05_TOKEN_FACTORY_FACTS.md:41,53`,
`docs/nebius/06_SUBMISSION_DRAFT.md:111`.

**Evidence:** The N0 catalog lists five IDs including Super-VL, but its JSON/tool tables and
`probe-nebius.mjs` defaults cover four models. The tool table reports 20/20 thinking-on and
19/20 thinking-off calls; “19 of 20 runs” without the setting is not the total of both
columns. The code's five native capability entries are configuration, not five live probe
records. Broad “every Nemotron model” language goes beyond this small sample.

**Exact replacement for the README native-tool clause:**

> native tool calls were observed on the four Nemotron models in the recorded probe table

**Exact replacement for the HACKATHON_CHANGES row's Change cell:**

> Nebius catalog records five NVIDIA model IDs; the published JSON/tool probe tables cover four models

**Exact replacement for N0's JSON-mode first sentence:**

> **JSON mode.** The four tabulated models returned JSON-mode responses in the probe;
> truncation and task-invalid output remain failures, so JSON mode alone is not validation.

**Exact replacement for N0 lines 53–58 and submission lines 111–112:**

> The published four-model native-tool table reports 20/20 thinking-on and 19/20
> thinking-off runs returning tool calls, with one thinking-off timeout. These small
> historical samples do not establish reliability for all Nemotron models or Super-VL.
> The application separately validates tool names, arguments and final citations.

### 16. major — The demo requires an unqualified recommendation that accepted runs cannot emit

**Location:** `docs/DEMO_SCRIPT.md:14`.

**Evidence:** `investigator.mjs:32–34` rejects recommended responders not in the first fix's
returned eligible list; line 163 constructs every accepted responder with `qualified:true`.
The UI can render a disabled unqualified row for stubbed contracts, but it is not produced
by this normal live pipeline. A live video must not fabricate that proof with a UI stub.

**Exact replacement for the 1:40 screen direction:**

> Recommended first action and its safety class; show the qualified responder's
> certifications, leave a required prerequisite unchecked to show Approve disabled,
> then confirm prerequisites and approve. Do not require a “Not qualified” recommendation.

### 17. major — Fresh-checkout browser verification is missing browser installation

**Locations:** `README.md:224`, `README.md:231`.

**Evidence:** `package.json` installs Playwright but has no browser-install postinstall;
`playwright.config.mjs` launches Chromium. The hard-coded author library path is outside
this repository and cannot be reproduced by another judge from npm ci alone. The local
team command is historical environment information, not a portable setup recipe.

**Exact replacement for the verification command block and library-path paragraph:**

```sh
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:e2e
```

> Playwright's dependency installation may need system-package privileges. On a system
> with Chromium dependencies already installed, `npx playwright install chromium` is
> sufficient. The test server uses port 3012 by default; set `COMPASS_E2E_PORT` if needed.

### 18. major — Public deployment guide exposes private operations details

**Locations:** `scripts/deploy/README.md:3–19`, `scripts/deploy/README.md:34`,
`docs/nebius/05_TOKEN_FACTORY_FACTS.md:14`.

**Evidence:** The guide publishes tailnet addresses, a login name and the key-file location;
those are private operations details, not public judge access. `deploy.sh:10` also embeds the
private default destination, so documentation redaction alone does not remove it from the
repo. This review found no actual key value in the eight files. The author email has an
explicit publication-approval record in HACKATHON_CHANGES and is not being treated as a leak.

**Exact replacement for deployment README lines 3–19:**

> Deployment uses a development machine and a separate Docker host reached by SSH.
> Set `DEPLOY_HOST` to your authorized `user@host`; provision the host's environment and
> server-side key files before deployment. Keep machine addresses, account names and
> actual credential paths in private operator notes. The deployment checkout is
> `~/nebius-compass`, its environment file is maintained separately, and runtime state
> lives in the `responsecompass-data` Docker volume.

**Exact replacement for deployment README lines 34–36:**

> Before public release the service is reachable only through the operator's private
> network. That address is not a judge URL. Publish a verified public URL separately;
> a Cloudflare deployment uses the `tunnel` profile and a server-side token file.

**Exact replacement for N0 line 14:**

> Credentials remain server-side and outside git; configure NEBIUS_TOKEN_FACTORY_API_KEY
> or NEBIUS_TOKEN_FACTORY_API_KEY_FILE without publishing the key or its private location.

Also neutralize the private default in deploy.sh before publication; this review does not
edit that implementation or private host configuration.

### 19. minor — Current test counts and the browser-gate wording are stale

**Locations:** `README.md:95`, `docs/evaluation.md:94`.

**Evidence:** The round-17 handoff archived by `9b2a76e` records 431 unit and 83 Chromium
tests passing. The README's 394/81 is an earlier same-day checkpoint; evaluation says “all
32” as if current. The legacy 117-test soak section should remain explicitly historical,
not silently be rewritten as a new measurement.

**Exact replacement for README line 95:**

> - hermetic unit/integration tests, including the deterministic soak, and Chromium E2E
>   tests; the recorded round-17 verification on 2026-10-19 passed 431 and 83 respectively.

**Exact replacement for evaluation's first Browser gate sentence:**

> The recorded round-17 browser gate on 2026-10-19 passed 83 Chromium tests with forced
> provider failures and no API spend. The older 32-test gate is a historical checkpoint,
> not the current suite size.

### 20. minor — Default model status/thinking and automatic fallback tier are misstated

**Locations:** `README.md:21`, `docs/nebius/05_TOKEN_FACTORY_FACTS.md:103`.

**Evidence:** N3a/N3b are merged. `NEBIUS_ROLE_DEFAULTS.investigator` has effort `default`,
not explicit `on`; the provider body builder omits the thinking override for that value. Historical
provider-default thinking was observed on. Failure uses deterministic fallback, not an
automatic Super-model tier (`investigator.mjs:105,169`).

**Exact replacement for README's investigator table row:**

> | Investigator | `nvidia/Nemotron-3-Ultra-550b-a55b` | provider default (observed on in N0) | Investigates reports with read-only tools and cited past cases. |

**Exact replacement for N0's investigator table row:**

> | `investigator` | `nvidia/Nemotron-3-Ultra-550b-a55b` | provider default (observed on) | Chosen from the recorded tool probes; failures use deterministic investigation, with no automatic Super tier. |

### 21. minor — Runtime model discovery is confused with the manual verbose catalog probe

**Location:** `docs/nebius/06_SUBMISSION_DRAFT.md:68`.

**Evidence:** `provider-settings.mjs:45,243` fetches `/models`, without `?verbose=true`,
and maps selectable IDs/settings. It does not ingest pricing/limits to configure controls.
N0's verbose call was a manual measurement; the round-17 prices are a fixed code table.

**Exact replacement:**

> - A manual N0 `GET /v1/models?verbose=true` probe informed model, pricing and limit choices.
>   Runtime Settings refreshes `/v1/models`; capabilities, prices and local limits are
>   maintained explicitly in code rather than automatically imported from that catalog.

### 22. minor — Cost and judge-period limiter prose implies more than the control guarantees

**Locations:** `docs/nebius/05_TOKEN_FACTORY_FACTS.md:113–116`,
`docs/nebius/06_SUBMISSION_DRAFT.md:71`, `README.md:38`.

**Evidence:** Input grows with tool history; the eight-call limit is not a fixed token/cost
limit. The documented full seven-call live example has about 23k input plus 2.4k output tokens,
exceeding eight times the illustrative 1–2k tokens per call; no such token envelope is enforced. Rate/concurrency limits do not bound daily dollars. The new budget
defaults unlimited, prices can be unknown, and in-flight calls finish after exhaustion or
clock pause. Idle pause stops the clock, not every possible operator-triggered model action.

**Exact replacement for N0's Cost and limits bullets:**

> - Estimate Ultra cost as `(inputTokens + 3 * outputTokens) / 1_000_000` USD, and Super
>   cost as `(0.30 * inputTokens + 0.90 * outputTokens) / 1_000_000`, using the dated N0
>   prices. Tool-history size and output length vary; the call cap is not a cost cap.
> - Local provider controls default to 20 starts/minute and concurrency 2 for Nebius.
>   `COMPASS_DAILY_BUDGET_USD` optionally blocks new live calls after known estimated
>   UTC-day spend reaches a positive limit; unset/0 is unlimited. Unpriced usage and
>   in-flight calls mean this is not a hard provider-billing cap.

**Exact replacement for submission lines 70–72:**

> - In the recorded five-sample Scenario A test, Super/off had median ranking latency
>   3.2 s. One full live investigation took 15.7 s and about 23k input/2.4k output tokens
>   (approximately USD 0.0302 at the dated Ultra prices). These are sample measurements,
>   not latency or per-investigation cost guarantees.

**Exact replacement for README lines 37–39 after the public-link sentence in finding 10:**

> Running rooms pause their simulation clocks after ten idle minutes by default.
> In-flight calls can finish, and explicit operator actions can still request inference.
> A positive COMPASS_DAILY_BUDGET_USD adds an estimated daily limit; its default is
> unlimited. Offline mode makes no provider calls.

### 23. minor — Troubleshooting scope and source labels predate the investigator

**Locations:** `README.md:253`, `README.md:258`, `README.md:215`.

**Evidence:** N3a ranks catalog fixes using cited cases; `investigation-view.js:26` renders
Nebius, AMD, deterministic and fixture sources. Nebius is now default, so the old speed
rationale about Live AMD is not the general runtime behavior. Historical latency ranges
must not be presented as universal current provider timings.

**Exact replacement for README line 253:**

> simulated history. MES integration is not implemented; the investigator now uses public
> case records to rank catalog procedures for approval.

**Exact replacement for README lines 257–258:**

> Issues expose a public symptom and catalog procedures with ranked order and observed
> evidence. Source labels distinguish Nebius, AMD, deterministic fallback and Offline fixtures.

**Exact replacement for README's Speed bullet:**

> - **Speed** selects 1× or 5× without replacing the current timer. Live inference runs in
>   wall-clock time and can lag a faster simulation. The API also accepts 10× and 60×;
>   those higher speeds are useful for accelerated fixture/fallback runs.

### 24. minor — Change log formatting and merged-package provenance are incomplete

**Locations:** `HACKATHON_CHANGES.md:43`, `HACKATHON_CHANGES.md:50`.

**Evidence:** A blank line splits the Markdown table before its N2+ rows. “see log” is not
a commit link. Row 41 cites `8ff664d`, which changes only handover.md; `76e1e6a`
actually introduces the N0 facts and probe. `4bd0dae` is the real-packet measurement commit; `c9ae284` (paired replay) and
`4538dfd` (usage/budget) are already merged but absent. The existing listed hashes resolve;
`50c634c` is an ancestor. Baseline history has 119 commits after the initial commit, or 120
including it; that count is not a missing-commit defect.

**Exact replacement:** delete the blank line at 43; replace the `see log 2026-10-19` cell
with `` `4bd0dae` ``. Replace row 41's commit cell with `` `76e1e6a` ``. Append these exact rows inside the same table:

```text
| Paired rolling-origin first-fix replay with an isolated private outcome engine | `c9ae284` | `backend/tests/replay-runner.test.mjs` | `npm run eval:investigator -- --replay --mode fixture --limit 5`; live replay results not yet recorded here |
| Deployment-global daily usage ledger, estimated budget and read-only Settings usage | `4538dfd` | `backend/tests/provider-usage.test.mjs` | `GET /api/settings` exposes usage; budget defaults unlimited |
```

### 25. minor — Licence evidence must distinguish related cards from the served variant

**Locations:** `docs/nebius/05_TOKEN_FACTORY_FACTS.md:36`,
`docs/nebius/06_SUBMISSION_DRAFT.md:127–129`.

**Evidence:** N0 explicitly says the checked Super card is a Base/BF16 variant and that the
instruct card was not found. The draft drops that caveat and assigns the licence to Super
without qualification. Code and catalog IDs do not independently establish the terms of
an exact served weight variant. This is an evidence/scope correction, not a legal opinion
or a claim that the listed licence is wrong.

**Exact replacement for the submission licence bullet:**

> - **Licence provenance is incomplete in the catalog.** N0 recorded licences from related
>   NVIDIA model cards. For Super it checked a Base/BF16 card, not the exact served instruct
>   variant. Verify and link the exact served variant before claiming its licence is
>   established; the application calls hosted APIs and does not redistribute model weights.

### 26. minor — A reported pattern scan is not an absolute secret-free-history guarantee

**Locations:** `HACKATHON_CHANGES.md:17`, `HACKATHON_CHANGES.md:51`.

**Evidence:** `project-state/log.md:393` records a scan for selected token/private-key
patterns. The exact executable scan and sanitized output are not retained there. A history
query found no tracked `.env`, `*.key` or `provider-credentials.json`, but that alone cannot
certify all names, formats and revisions. No actual credential value was found in the
assigned eight documents; private infrastructure details are separately covered in finding 18.

**Exact replacement for the Secrets in history value cell:**

> No matches were reported by the 2026-10-19 selected-pattern scan; this is not an exhaustive guarantee. Re-run and record a sanitized publication scan at the final public revision.

**Exact replacement for row 51's Change cell:**

> Selected-pattern Git history credential scan reported no matches (2026-10-19); retain method and sanitized output for the publication revision

### 27. minor — The industry-wide comparison is unsupported by this synthetic evidence

**Location:** `docs/nebius/06_SUBMISSION_DRAFT.md:34–36`.

**Evidence:** The repository contains synthetic control-room experiments, not a study showing
that most AI assistants are designed always to answer or that real control rooms usually
guess at assignments/fixes. This can be stated as the project's design motivation without
presenting a population-level claim as established fact.

**Exact replacement for the Why paragraph before its bullets:**

> **Why.** A control-room recommendation needs a clear account of its evidence and limits.
> This synthetic project explores bounded troubleshooting and dispatch rather than
> assuming that a confident answer is correct. We limit the assistant's authority by design:

## Coverage and supported claims

| Reviewed file | Findings | Checks with no contrary repository evidence |
|---|---|---|
| README.md | 1–10, 15, 17, 19–20, 22–23 | Provider endpoint and role model IDs; four-role settings; clock controls; shared modes; documented route names for logs; synthetic operational data and hidden-truth payload boundary. |
| HACKATHON_CHANGES.md | 15, 24, 26 | Listed commits resolve; initial commit/date, baseline ancestry, retained AMD origin, Apache-2.0 application licence and single recorded author email match Git. The document records email-publication approval; this review does not invent new consent. |
| docs/evaluation.md | 2, 11–14, 19 | Historical summaries match their committed project-log entries. Replay window, cutoff, public roster reconstruction, common recorded draws, fixed historical responder, boolean-only arms, exclusions and limitations match the runner/tests. READY fallback results remain in the pipeline arm, not a separately measured live-model-only arm. |
| N0 facts | 14–15, 18, 20, 22, 25 | Dated model/price table agrees with capability/default/price code. Historical catalog region/context/limits and probe timings are recorded observations, not freshly verified external facts. |
| Submission draft | 5–7, 9–15, 21–22, 25, 27 | Track/name are author choices; baseline disclosure and named roles/validators/tool budgets match implementation. No “every step runs on NVIDIA” assertion was found; deterministic application work is correctly distinguished. |
| Demo script | 5, 16 | Tool traces/case chips, source badge, interpretation confirmation, prerequisite controls and audited assignment exist. The timeline is a recording plan, not proof of an existing uploaded video. |
| Deployment README | 18 | Script accepts a Git ref, uses DEPLOY_HOST, checks health, preserves the named volume and has tracked seed bootstrap. Remote machine state was not inspected; the private URL is not verified public access. |
| .env.example | 1 | Listed provider URLs/models/efforts/timeouts/limit env names and daily-budget default match code. Shared Live mode supplies investigator/narrator mode unless explicitly overridden; fixture/force-failure remain API-free. |

No reviewed file was edited, no credential/private folder was opened, and no claim of a
new live eval, replay result, secret certification or legal verification is made by this review.
