# Index — page catalog

The catalog of every page in this knowledge base. Start at [README.md](README.md) for the
conventions and the maintenance workflow, and [architecture.md](architecture.md) for the
whole system on one page. When you add or remove a page, update this list.

## Top level

| Page | What it covers |
|------|----------------|
| [README.md](README.md) | The schema: how this wiki is organized, page conventions, and the maintenance workflow you follow on every code change. |
| [architecture.md](architecture.md) | The entire system on one page: the load-bearing boundary, the data-flow diagram, the major pieces, and the process shape. |
| [log.md](log.md) | Append-only change history. |
| [llm-wiki.md](llm-wiki.md) | The knowledge-base pattern this folder implements (reference). |

## Backend

| Page | What it covers |
|------|----------------|
| [backend/overview.md](backend/overview.md) | Every module under `backend/src/`, grouped by subsystem, with links to the deep-dive pages. |
| [backend/investigation.md](backend/investigation.md) | Investigation DTOs, read-only tools, cutoff, cases, certifications and narratives. |
| [backend/domain-model.md](backend/domain-model.md) | The persisted state schema, every core entity, the issue lifecycle, and the hidden-`ResponderSkill` invariant. |
| [backend/live-runtime.md](backend/live-runtime.md) | Live mode: what a tick does, persistence/concurrency, agent activity, deferred work. |
| [backend/offline-runtime.md](backend/offline-runtime.md) | Offline mode: the API-free fixture path through the same UI and dispatch math. |
| [backend/control-rooms.md](backend/control-rooms.md) | Multi-instance isolation, the single process scheduler, room health, and migration. |
| [backend/model-providers.md](backend/model-providers.md) | The AMD Token Factory provider, model choice, selection/discovery, and inference modes. |
| [backend/simulation.md](backend/simulation.md) | Clock, scheduler, context engine, attempt/resolution engines, workforce continuity, responder location. |
| [backend/http-api.md](backend/http-api.md) | Every HTTP route: deployment-global, room-scoped, and static/SPA. |

## Frontend

| Page | What it covers |
|------|----------------|
| [frontend/overview.md](frontend/overview.md) | The vanilla-JS single-page app: files, `roomApi`/`globalApi`, the map, the tabs, diagnostics. |

## Operations

| Page | What it covers |
|------|----------------|
| [operations/running-and-config.md](operations/running-and-config.md) | How to run it and every environment variable, with defaults. |
| [operations/testing.md](operations/testing.md) | The two test suites, how to run them, and the test discipline. |

## Concepts

| Page | What it covers |
|------|----------------|
| [concepts/agent-boundary.md](concepts/agent-boundary.md) | The deterministic-vs-model invariant — the most important rule to preserve. |
| [concepts/analytics-and-ethics.md](concepts/analytics-and-ethics.md) | Statistical-honesty and fairness rules for analytics and ranking. |

## Quick "where do I look?"

| I'm changing… | Read first | Also update |
|---------------|-----------|-------------|
| A model/provider integration | [backend/model-providers.md](backend/model-providers.md), [concepts/agent-boundary.md](concepts/agent-boundary.md) | this page if a provider list changes, [operations/running-and-config.md](operations/running-and-config.md) for env vars |
| The state shape or an entity | [backend/domain-model.md](backend/domain-model.md) | [backend/live-runtime.md](backend/live-runtime.md) if the tick changes |
| An HTTP route | [backend/http-api.md](backend/http-api.md) | [frontend/overview.md](frontend/overview.md) if the client call changes |
| Simulation behavior | [backend/simulation.md](backend/simulation.md), [concepts/agent-boundary.md](concepts/agent-boundary.md) | — |
| Multi-room behavior | [backend/control-rooms.md](backend/control-rooms.md) | [backend/http-api.md](backend/http-api.md) |
| The UI | [frontend/overview.md](frontend/overview.md) | — |
| How to run or configure | [operations/running-and-config.md](operations/running-and-config.md) | — |
