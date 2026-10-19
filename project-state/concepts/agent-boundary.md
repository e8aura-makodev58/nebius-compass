# Concept: the deterministic / model boundary

This is the single most important invariant in ResponseCompass. Every change must preserve it.

> **Application code owns facts; models only propose or rank within bounds, and are never
> trusted as authoritative.**

It is also binding governance in the repo-root `AGENTS.md` (rules 3 and 4).

## What application code owns

Time, facts, eligibility, geometry, metrics, baselines, validation, simulation outcomes,
issue priority, staffing, and **every state mutation**. These are deterministic and
reproducible from the persisted RNG streams. A model never computes any of them.

## What a model may do

Two model roles, with four bounded jobs:

1. **Event planner** (`event-planner.mjs`) — propose **one** plausible next `ISSUE_RAISED`
   event for an eligible equipment item and an allowed issue class, as industry-neutral
   narrative. Validated against `EVENT_PLANNER_JSON_SCHEMA` before anything is persisted.
2. **Compass agent** (`agent.mjs`) — **rank the eligible candidates it is handed**, with a
   qualitative summary and a tradeoff per candidate. Validated against
   `AGENT_RESULT_JSON_SCHEMA`: contiguous ranks, known candidate ids only, the top pick
   consistent with rank 1, and **no numeric leakage** in the prose. The only digits allowed in
   prose are the supplied candidates' own `responderId` / `displayName` (user decision,
   2026-10-17).

3. **Fix ranking** (`fix-ranking.mjs`) — the Compass ranking role ranks only supplied
   catalog fix IDs from code-built observed evidence. Titles and steps are authoritative
   catalog text, never generated procedures. Strict validation requires every supplied ID
   exactly once, contiguous ranks, bounded rationale and numeric tokens present in the
   packet. One repair shares the ranking deadline. It cannot diagnose latent causes or
   set effectiveness. Deterministic fallback orders smoothed same-symptom success,
   evidence count and catalog order; the comparator is class-frequency, not hidden truth.

4. **Staffing ranking** (`staffing-ranking.mjs`) — ranks only code-built lawful overtime
   option IDs with observed backlog class/symptom experience, duty and rest facts. Strict
   ID/rank/prose validation requires digit-free qualitative rationales (only supplied option
   IDs may contain digits). One repair shares the original deadline and provider
   controls. It cannot approve staffing, change legal endpoints or supply employee truth.
   Default approval belongs to Central command; an explicitly audited room policy can
   approve the top option after the simulated deadline. Eligibility and mutations never
   consult outcome history. This supersedes only the earlier overtime evidence/ranking
   prohibition recorded on 2026-09-08 (see `docs/decisions.md`, 2026-10-18).

## Never trust the model

Every model result passes through a strict validator. A live ranking rejected by validation
may be re-requested once using the same packet and bounded validator feedback, within the
original deadline; the replacement must pass the same full validator. On a remaining
failure — missing credential, HTTP error, timeout, invalid or malformed output — the caller resolves to an explicit
`{ status: "unavailable" }` and the system falls back to a **deterministic baseline**
(nearest-available and the auditable naive score). Dispatch always continues. A model
outage degrades explanation quality, never correctness or availability.

## Two hard exclusions

- **Hidden `ResponderSkill`.** The simulation's ground-truth skill is never an input to a
  model, the planner packet, a public snapshot, the normal UI/API, or analytics — directly
  or through responder-specific or skill-shaped inputs. See
  [../backend/domain-model.md](../backend/domain-model.md#invariant-responderskill-is-hidden-truth).
- **Hidden fault truth.** Causes, cause-dependent effectiveness and the private fault RNG
  are never model, UI/API, analytics or log inputs. Only public overlapping symptoms and
  observed fix outcomes enter fix evidence. Guards apply to archive-backed audits too.
- **Priority and staffing are application-owned.** Queue/demand triage and workforce
  continuity are deterministic; models retain only the bounded ranking/qualitative role
  above. See [../backend/simulation.md](../backend/simulation.md).

## Why it matters for changes

If you are tempted to let a model decide *whether* to act, *what* the outcome is, or *who
is eligible*, stop — that belongs in application code. The model's role is to choose among
already-established options and explain the choice. Keeping this line is what makes ResponseCompass
auditable and safe to run unattended.

## Investigation evidence boundary

`investigation-dto.mjs` constructs explicit public Case/Responder/Fix/Equipment fields;
`investigation-tools.mjs` exposes six read-only schema-validated tools, bounded to ten
rows and eight KiB per result. The host binds `asOf` and the excluded target issue;
completed evidence must precede the cutoff strictly, including archive-backed cases.
Tools use public qualifications, never skill or outcome weights, for eligibility.
Narratives are untrusted data. Canary, hidden-truth noninterference and future-data
perturbation tests cover these contracts. See [../backend/investigation.md](../backend/investigation.md).

## Investigator vertical slice (N3a)

Field reports are not facts until code supplies interpretation options and the operator
confirms a catalog triple. The Compass role ranks only those option IDs. The investigator
uses read-only DTO tools, class-scoped catalog IDs, allowlisted observable hypothesis text
and references to cases actually returned in that run. Code computes evidence grades,
qualifications and outcome precedence; model text cannot provide procedure steps, staffing,
priority or approval. Raw invalid content is discarded and never persisted in traces.

A versioned code-owned hazard/input policy runs before any model call, including during
outage. Report and retrieved injection spans remain untrusted quoted evidence. Every
assignment writer invokes the same gate, including support, transfers and handovers.
Operator approval atomically rechecks revision, availability, certifications and each
prerequisite before assigning the approved procedure. Fallback, abstention and escalation
never open the gate; an explicit safety-checked manual override needs an audit reason.
See [../backend/investigation.md](../backend/investigation.md) for exact budgets and lifecycle scope.
