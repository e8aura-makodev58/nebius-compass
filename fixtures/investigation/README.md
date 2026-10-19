# Investigation fixtures

Owned by the main agent (plan v2 §5). Codex imports these files read-only in `npm test`.

| Path | Contents | Label |
|---|---|---|
| `scenarios.json` | Synthetic field reports plus expected behaviour. No model outputs. | `synthetic` |
| `synthetic-responses/` | Hand-written model outputs for hermetic tests (added with N3a). | `synthetic` |
| `recorded-live/` | Real Nemotron responses captured by the main agent, each with model id, date and request hash (added in N6). | `recorded-live` |

The UI and docs never present a `synthetic` response as a recorded Nemotron response.

## `scenarios.json`

Each scenario has `id`, `category`, `input` (`narrative`, optional `equipmentId`), `setup`
tags, and `expected` (`outcome`, optional `interpretation`, `constraints`).

- `expected.outcome` is `READY`, `ABSTAINED` or `ESCALATED` (plan §3.5 precedence).
- `expected.interpretation` is the option the operator would confirm. It is a fact chosen by
  code and the operator, not a model output.

**Setup tags.** Tests build matching state with code. Each tag below states the condition
the test must create:

| Tag | State the test must build |
|---|---|
| `history:same-symptom-strong` | ≥ 3 prior cases with this equipment or symptom where one fix succeeded at least twice as often as it failed (grade `STRONG`) |
| `history:same-symptom-moderate` | 1–2 such cases (`MODERATE`) |
| `history:none-for-equipment`, `history:none-for-symptom` | no prior cases for the equipment / symptom code |
| `history:contradictory-fixes` | prior same-symptom cases where different fixes each worked and failed |
| `history:retrieved-case-narrative-contains-injection` | a prior case whose `reportNarrative` contains instruction-like text |
| `responders:only-uncertified-available` | available responders lack the certifications the specialist fixes require |
| `responders:none-available` | no available responder |
| `responders:top-candidate-shift-ends-in-10min` | the best observed candidate's shift ends in 10 simulated minutes |
| `responders:only-via-overtime` | nobody is on shift; the staffing review path applies |
| `provider:force-failure` | provider mode `force-failure` |
| `provider:never-resolves` | the provider promise never settles (lane/deadline test) |

**Constraint vocabulary.** Constraints are assertion names; tests map each one to a check.

- `model-calls==0`: the hazard or input policy decided before any inference.
- `hazard-lexicon:<word>` and `input-policy:<rule>`: the code-owned policy that fired.
- `cites-only-returned-cases`: every evidence ref names a case returned in this run.
- `no-invented-case`: no evidence ref names a case outside the tool results.
- `grade…`: the evidence grade from plan §3.5.
- `source==deterministic`: the result came from the fallback path.
- `still-requires-approval`, `no-auto-approve`, `no-dispatch-until-confirmed`: gate checks
  from plan §3.2.
- `overtime-via-staffing-approval-only`, `no-overtime-decision`: overtime is never decided
  by the investigator.
- Any other names are self-describing.
