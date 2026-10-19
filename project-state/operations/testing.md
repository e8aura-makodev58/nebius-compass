# Testing

Two suites gate every change. **Both must pass before a handoff.**

## Unit / integration — `npm test`

```sh
npm test
```

Runs `node --test backend/tests/*.test.mjs`. This suite is **hermetic**: no network calls,
no API spend, and no writes to real `backend/data/` (test state goes to isolated temp
paths via `COMPASS_LIVE_STATE_PATH` / `COMPASS_CONTROL_ROOMS_DATA_ROOT` with `NODE_ENV=test`).
Never add a live provider call to `npm test`.

Coverage spans contracts and persistence, the clock/scheduler idempotency, planner
generation and fallback, multi-issue races, the resolution/attempt engines, live
recommendations and assignments, analytics, Offline reset, the model-provider abstraction
and provider settings, Control Rooms (migration, manager, health, metadata), workforce
continuity, the map/label layout, render lifecycle, store-failure recovery, and a
100-opportunity deterministic reliability soak. Tests are named by work package
(`wpNN-*.test.mjs`) plus a few feature-named files.

`demo-history-generator.test.mjs` generates one simulated day twice from the committed
plant-1 seed and compares bytes, checks normal-store migration/loading and private/public
skill boundaries, and compares a short engine run against the normal durable store. Worker
guards reject fetch and credential reads; tests also reject live-data output paths. Only
short spans run in `npm test`; month-long regeneration is a separate manual script.

`design-tokens-contrast.test.mjs` parses the CSS tokens and checks every paper-facing
text colour at 4.5:1 against all five light surfaces (including selection/alert washes), including tokens used by the linked
area stylesheets. It also checks white primary-button text against both accent backgrounds. It uses
local file reads and WCAG sRGB luminance calculations only.

`tiling-layout.test.mjs` validates persisted layouts without a DOM or network: accepted
panels, schema/version/size limits, injected parameters/constraints, duplicate/missing
regions and forbidden floating/pop-out layouts. The contrast test resolves Dockview's
text-variable aliases to the shared inks, retaining the 4.5:1 gate for vendor text.

`provider-settings.test.mjs` uses fake catalogs to cover nonblocking boot discovery,
missing/valid saved models, runtime default fallback with byte-for-byte preservation of
the saved file, failed/malformed discovery, recovery, fallback during pending refresh,
and stale credential responses.
Role-specific settings tests cover legacy-file loading without writes, independent and
concurrent role saves, unknown-role rejection, planner environment overrides, and boot
fallback/logging for just the missing role. Credentials remain byte-for-byte unchanged.
Services do not implicitly discover at initialization; boot tests explicitly enable
`checkModelsOnBoot` with fake fetch. The server disables boot discovery in `NODE_ENV=test`.

## End-to-end — Playwright

```sh
LD_LIBRARY_PATH=/home/makodev58/nebius-tools/libs/usr/lib/x86_64-linux-gnu npm run test:e2e
```

Runs `playwright test` (Chromium). The E2E suite **forces provider failure** so it proves
the deterministic fallback still dispatches — it makes no real provider call and spends
nothing. It runs against an isolated `/tmp` data root, not real `backend/data/`. The
`LD_LIBRARY_PATH` prefix supplies Chromium's system libraries in this environment; plain
`npm run test:e2e` works where those libraries are already present.

**Fresh machine setup (2026-10-19).** `npx playwright install chromium-headless-shell`
(downloads to `~/.cache/ms-playwright`). Without sudo, the missing libraries are extracted
from Ubuntu 24.04 packages: `apt-get download libatk1.0-0t64 libatk-bridge2.0-0t64
libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libatspi2.0-0t64
libxrender1 libxi6` in `/home/makodev58/nebius-tools/debs`, then `dpkg -x <deb>
/home/makodev58/nebius-tools/libs` for each. A fresh clone also needs a `.cache/`
directory for several unit tests until those tests create it themselves.

**Port.** The server binds `COMPASS_E2E_PORT` (default `3012`), and its data root is
`/tmp/compass-playwright-control-rooms-<port>`, so several worktrees can run the suite at
the same time. Worker agents use their own port from the **Ports** table in `handover.md`.
Playwright stops the server when the run ends; any manual preview server must be stopped
right after use. Never bind 3000 or 3200 on this host (other running apps).

E2E journeys cover the audit trail, the building/floor view and camera, the control-room
search palette, the live floor and staffing actions, the room picker and multi-room state
isolation, the override dropdown, and the provider-settings form.
`e2e/provider-settings.spec.mjs` uses mocked settings/catalog/save responses for two-role
editing and reloads at 375px and 1280px, verifies draft preservation and separate status,
and checks horizontal overflow and zero outbound requests without writing real settings.

`e2e/header-layout.spec.mjs` measures the header at 920, 1024, 1280 and 1440px in Live
and Offline (with Reset Offline visible). Bounding rectangles and scroll widths assert
that all four view tabs and the activity indicator/dot are fully contained, the topbar
stays within the viewport without horizontal overflow, and no tab-bar scrolling is needed.

`e2e/tiling.spec.mjs` covers desktop frame coverage, pointer and keyboard resizing,
minimum sizes, reload and view-switch persistence, reset, edge moves, maximise/restore,
invalid/unavailable storage, zero outbound requests, and desktop/mobile transitions
that preserve the original DOM nodes and handlers. The shared control-room journey delays
the room-scoped force-event route so its transient activity-indicator assertion is stable.

## Discipline

- Adapt a test's *setup* when an interface changes; do not weaken or delete its assertions
  to make a change pass.
- When you add a provider, route, entity, env var, or engine behavior, add matching
  coverage and update the relevant page under `project-state/` (see
  [../README.md](../README.md#maintenance-workflow)).
- `git diff --check` should be clean (no whitespace errors) before a handoff.

Cleanup regression coverage checks generic room names, restored room paths and
conflict handling, saved metadata/suggestion compatibility, and aggregate-only
recommendation packets even when detailed historical actions exist. The AMD Token
Factory provider and settings tests stub every fetch, so `npm test` never contacts AMD.

**Live measurement is separate.** `npm run measure:amd` (see
[../backend/model-providers.md](../backend/model-providers.md)) is the only script that
calls AMD. Run it by hand, with a key, when model quality needs checking.

## History retention regression coverage

`backend/tests/history-retention.test.mjs` generates three simulated days with archiving
disabled, enabled and repeated. It reconstructs every moved collection, compares exact
observations, candidate/planner inputs, decisions, RNG and full/period analytics, and
checks byte-identical live/archive output. It also checks archived audit privacy,
pagination, pending-work protection, reset epochs, fresh-root archive bootstrap and
recovery after an injected failure between archive durability and live-file commit.
`e2e/station-issue-history.spec.mjs` includes an archived issue absent from `/state`,
loaded through station history and inspected through audit. Generator tests use scratch
roots and throwing network/credential guards, never the running deployment.

## Troubleshooting coverage

`fix-troubleshooting.test.mjs` checks catalogs, seeded/private fault migration, every public
and model packet, fix-dependent outcomes with identical draws, next-fix sequencing and
observed fallback evidence. `fix-ranking.test.mjs` checks strict output validation,
fixture isolation, one repair, stale/completed results and non-blocking clock/dispatch
under an unresolved provider request. Retention tests also compare fix evidence and
analytics and scan raw bundles for latent fault fields. Browser fix tests exercise forced
provider failure, expandable evidence and applied audit at 375px and 1280px.

`demo-seed-reader.test.mjs` verifies exact decompressed bytes, deterministic packaging,
fresh-root bootstrap with archives, checksum failure and payload-path rejection. Additional
fix tests cover Offline payload privacy, interrupted request recovery, replaced request
identity, paused-room no-call behavior and automatic dispatch while fix inference waits.

## Staffing approval coverage

`staffing.test.mjs` checks every lawful option, duty/rest/cap/surge, observed class/symptom
packets and hidden-field scans, fallback/comparator ordering, validated ranking and one
repair, explicit policy, operator revisions, invalid/stale choices, supersession, durable
deadline claims/restart/idempotency, late/reset-safe model work and a non-blocking live
clock. Closed packet pruning preserves exact compact outcome counts. Retention tests compare
staffing packets and analytics between archived/unarchived deterministic runs.
`e2e/staffing.spec.mjs` creates a real backlog with forced provider failure, approves and
rejects through the actual room API, saves policy in Settings, preserves rejection drafts,
and checks 375px, 1280px and the 1920×1080 staffing display. Existing tiling/layout tests
require five tiles and explicitly reset legacy four-panel stored layouts.


The synthetic staffing generator exercise also repeats byte-for-byte and proves all four
terminal paths (approved, rejected, expired, auto-approved) with zero fetch/credential
reads. A staffing reset test deliberately reuses both recommendation ID and timestamp;
only the new UUID-tagged model response may update the replacement record. Phone staffing
journeys expand the full evidence and verify that approval controls stay within the tile.

Staffing ranking also tests the live path with only a stubbed global `fetch`, including
a bounded repair for digit-bearing prose. Packet-supplied numbers are still forbidden
in qualitative rationales; only supplied option IDs are exempt.

## Operational UI refinement coverage

`e2e/workspace-refinement.spec.mjs` checks that the short desktop Staffing tile exposes its
primary approval without scrolling, a delayed decision cannot be submitted twice through
changing polls, and failed submission plus failed immediate refresh restores an actionable
control. Phone checks navigate directly to Decisions, use keyboard search from Floor to
reveal the issue, and preserve the map node through the desktop breakpoint. Analytics
checks Pareto placement, collapsed detail tables, expanded-state persistence, search focus
and explicit insufficient-data denominators. Existing staffing, fix-audit and tiling
journeys use the new phone/disclosure entry points and retain their canonical API assertions.

## Investigation contracts (N2)

`backend/tests/investigation-contracts.test.mjs` runs hermetically inside `npm test`.
It checks explicit DTO keys, hidden-truth noninterference and renamed-key canaries,
archive-stable case IDs, strict cutoff/target exclusion, qualification, catalog safety,
id-seeded certification independence, migration (including the compressed month seed),
noisy report templates, strict arguments (including prototype-property keys), read-only
execution and ≤10 rows / ≤8192 UTF-8 bytes. It imports investigation scenarios read-only
and builds the currently supported history/responder setup tags. No investigator inference
or public routes exist yet; existing history-generation adapter/equivalence tests exercise
the new pre-retention report hook with no fetch or credential reads.

## Investigator slice (N3a)

`backend/tests/investigator.test.mjs` exercises the real report/confirmation/investigation/
approval service, native and JSON-protocol history with stubbed global fetch, actual route
handlers, policy zero-call exits, strict final validation/repair, tool/deadline caps,
qualification and prerequisite failures, manual override, idempotence and stale safety,
assignment-writer enumeration and forged offer acceptance, privacy noninterference, bounded
public retention, interrupted durable reload and reset races. A never-resolving provider
must leave snapshots, the agent lane, ticks and operator actions responsive. Offline uses
the same fixture flow without network/credential access.

`npm run eval:investigator -- --mode fixture` uses the N3a `runScenario` adapter for all
24 synthetic scenarios, without touching runtime rooms or spending API calls. It confirms
the specified interpretation as an operator would; the agreement metric does not measure
independent model classification. The overtime-only setup safely abstains without an
eligible responder, despite its fixture's READY expectation. Live evaluation is separate
and explicitly initiated by the main agent; it is never part of `npm test`.


## Investigation lifecycle coverage

`backend/tests/investigation-lifecycle.test.mjs` covers durable expiry/restart/idempotency,
supersession, override and policy safety, independent RNG sampling, ObservableDTO canaries,
narrator validation/timeouts, route revisions, retained/archived analytics equality and
byte-repeatable offline seeds. The responder-ranking soak explicitly sets investigationShare
zero to preserve its original 100-opportunity experiment; production defaults remain 0.2.

`backend/tests/replay-runner.test.mjs` exercises a fixture `--replay --limit 5`, public-state
canaries, hidden-truth outcome perturbations, future-data invariance, common recorded engine
draws, exclusion denominators and deterministic repeated pairs. `eval-investigator.mjs
--replay --mode fixture` makes no API calls; live replay is a separate explicit measurement.

`backend/tests/provider-usage.test.mjs` uses fake fetch/clock and scratch or memory ledgers
for role/model aggregation, unknown/partial costs, pre-fetch/queued budget rejection, UTC
rollover, in-flight completion, restart/log idempotency, 120-day retention, exact small-cost
increments, original deadline preservation, content-free files and ranking/planner/investigator/narrator fallback propagation.
Node test workers never use the production ledger file; no live provider is added to npm test.

`backend/tests/docker-fixtures.test.mjs` scans runtime fixture URL literals and checks
that each existing fixture is covered by a Dockerfile COPY at its expected relative path.
Replay tests cover public provenance labels and sanitization; `eval-score.test.mjs` checks
source-specific denominators, excluded cases, zero-case sources and legacy pairs.

`investigation-security.test.mjs` covers room Origin/media-type guards, numeric metric
allowlisting and ID boundaries, trace poison/legacy redaction, total final validation and
public repair IDs, unsupported-first-fix abstention, hazard variants, concurrent rate/backlog
limits, fair work claims, orphan reclamation/ID continuity, and streamed provider byte caps.
Playwright's shared config supplies JSON headers for bodyless mutation setup commands;
request-guard rejection tests explicitly omit/override those headers in unit handler tests.
The synthetic lifecycle fixture is regenerated with `node backend/seed/create-investigation-dataset.mjs`
when policy/report schema changes, and the lifecycle suite checks byte reproducibility.

Repair diagnostic regressions exercise precise array/item/field paths and privacy-safe
messages for shape/bounds, numeric/probability/restricted/overlength prose, catalog text,
unknown/duplicate IDs, qualification, citation case/field and outcome-enum failures. A
stubbed numeric-invalid final repairs to qualitative prose within the original budget;
this establishes contract handling, not real-model repair success.
