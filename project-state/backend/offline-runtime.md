# Offline runtime

Offline is an **API-free path through the same server, UI, and dispatch math** as Live.
It exists so the product can be demonstrated, developed, and tested with zero external
dependency and fully deterministic output. It lives in `backend/src/offline-runtime.mjs`
(`createDemoRuntime`), re-exported from `server.mjs` for backwards-compatible imports.

## What makes it Offline

- **No network calls, ever.** The Compass agent and event planner run in `fixture` mode:
  they load committed JSON from `fixtures/` (e.g. `agent-result-scenario-a.json`,
  `event-planner-output.json`) instead of calling a provider. This is hard-pinned and is
  not affected by the Live provider settings.
- **Deterministic state.** The seed comes from `demo-state.mjs` (`createInitialDemoState`).
  Resetting returns to exactly that seed.
- **Same interaction model.** It uses the shared two-responder attempt math, scripted
  asynchronous offer acceptance, and the real support / release / transfer / reset
  behavior — so what an operator sees and does matches Live.
- **Its own audit store.** Offline recommendations are recorded via `audit-store.mjs`,
  separate from Live's operational events.

## Why it is a shared-mode path, not a separate app

Offline and Live are two runtimes behind one `createApplicationRuntime` wrapper and one
set of HTTP routes. This is a deliberate invariant: the Offline experience must exercise
the same code as Live, or it stops being a faithful preview. Do not fork Offline into a
parallel implementation — extend the shared math and feed it fixtures.

## Relationship to tests

The `fixture` and `force-failure` inference modes are what let `npm test` and the
Playwright suite run hermetically (no credentials, no spend). The E2E suite forces provider
failure to prove the deterministic fallback still dispatches. See
[../operations/testing.md](../operations/testing.md).

## Shared investigation fixture path

Offline exposes the same report, case and investigation service methods as Live through
`createApplicationRuntime`. Its existing in-memory state is adapted to the shared mutation
and assignment functions; reports and investigators use labelled files in
`fixtures/investigation/synthetic-responses/`, never provider settings, keys or fetch.
The normal Offline scripted journey is unchanged, and the current frontend still hides
its field-report form in Offline. Backend contract tests exercise this API-free seam.
See [investigation.md](investigation.md) for the same safety gates and DTOs used in both modes.


## Investigation policy parity

Offline exposes the same policy, override, re-investigation, deadline and analytics services.
Narration and investigator calls use fixed fixture/template paths, with no credentials/network.
The generator sets AUTO_APPROVE_SAFE and supports `--investigation-share` (default 0.2),
advances through READY deadline boundaries and drains queued agent jobs deterministically.
Synthetic examples and the separately staged month are in `backend/seed/INVESTIGATION_DATASETS.md`.

The Offline clock is always RUNNING; each clock synchronization delivers due investigation
claims through the shared synchronous completion helper before rendering or assignment.
