# Ask Compass — public room Q&A

## Role and tool boundary

`assistant-tools.mjs` constructs seven bounded read-only tools from one room snapshot:
`get_issue`, `get_investigation`, `issue_events`, `responder_public`, `search_cases`,
`recent_events`, and `analytics_summary`. Results are explicit public projections with
`kind`/`id` citation identities, never raw state or spreads of simulation truth. The
host fixes `asOf` to the room's current simulated time; tools cannot override it.
Each result has at most ten complete rows and 8,192 bytes. Unknown arguments fail closed.

Issue/investigation/event tools read retained detail; issue and analytics projections also
use retained public issue facts. Events expose selected public fields and decision/reason
metadata, not arbitrary event payloads. Cases reuse the investigator's completed-case
projection and cutoff. Responder counts require an explicit public issue class; general
roster questions do not silently assume a class. Summary numbers are application-derived
public counts matching the public analytics definitions (never probabilities or latent skill).

**Hidden skills, fault causes, attempt draws/effectiveness and unknown canary fields never
enter tool results.** `assistant-tools.test.mjs` checks every tool for noninterference,
canaries, schema/cutoff enforcement, byte/row limits and unchanged source state.

The `assistant` provider role defaults to Nebius
`nvidia/nemotron-3-super-120b-a12b`, thinking `off`, timeout 45,000 ms. It has separate saved
settings and role-specific provider env overrides, uses shared provider controls and the
usage/budget ledger, and appears as “Assistant (Ask Compass)” in the existing Settings
role fieldset pattern. Numeric prose uses the shared investigator validator and explicit
per-tool count/minute allowlists; narrative, ID and timestamp digits never ground numbers.

## Ask service and route (`assistant.mjs`)

`POST /api/control-rooms/:id/ask` takes `{ question (≤ 400 chars), context?: { issueId?,
investigationId?, responderId? }, expectedRevision? }` (4 KB body limit) and returns
`{ answerId, question, asOf, revision, status, text, citations: [{kind, id}], trace, source,
model, reason?, repaired?, rawInvalid? }`. `GET …/ask/:answerId` returns one stored answer
(404 `ASK_NOT_FOUND`). Room snapshots carry `askHistory`, the last 20 answers, kept in
memory per room and runtime (Live and Offline separately) and cleared by reset. The route
uses the room mutation guard (JSON content type, same-origin), but Ask **never mutates
operational state**: tests compare the room state before and after.

- **DECLINED, before any provider option is read or any model call:**
  - questions about hidden truth (skill, causes, effectiveness, probabilities or
    percentages) → `HIDDEN_TRUTH_REQUEST`;
  - requests to act (assign, approve, dispatch, override, reset…) → `ACTION_REQUEST`;
  - instruction-injection markers → `UNTRUSTED_INSTRUCTION_REQUEST`.

  These are code-owned patterns, not model judgement.
- **Model loop:**
  - initial tool reads are seeded from the context ids, or ids named in the question,
    else `analytics_summary`;
  - then at most 4 tool steps, 6 calls and 45 s (the `assistant` role);
  - the question and every narrative are passed as untrusted data.
- **Final validation (`validateAskFinal`):**
  - exactly `{text, citations}`;
  - 1–10 citations, each a `kind:id` a tool returned in this run;
  - text ≤ 1000 chars that passes the shared prose validator, with numbers only from
    per-tool allowlisted count/minute fields;
  - no hidden-truth, probability, advice or authorization language;
  - "approved" only when a cited record shows an approval.

  One repair with the allowed citations and numbers, then fallback.
- **FALLBACK (`source: DETERMINISTIC`):** a labelled list of the records the tools found,
  with the reason (`forced-failure`, `deadline`, `validation-failed`, `tool-step-cap`,
  `provider-error`, `budget-exhausted`, …).
- **Limits:** 10 questions per room per rolling real minute (`ASK_RATE_LIMIT`, 429), and one
  question at a time per room (`ASK_BUSY`, 429). A reset during a question rejects its
  publication (`ASK_RESET`).
- **Offline/fixture:** reads `fixtures/assistant-response.json` (labelled `synthetic`); no
  network. The E2E suite sets `COMPASS_ASSISTANT_MODE=force-failure`.

## Evaluation

`scripts/eval-ask.mjs` (`npm run eval:ask -- --mode fixture|live`) runs the labelled
20-request `fixtures/assistant/scenarios.json` against isolated synthetic snapshots.
`scripts/eval/ask-runner.mjs` uses the real service and replays returned trace identities
for the independent public-evidence scorer in `scripts/eval/ask-score.mjs`. Fixture turns
probe repair, unsafe retrieved narrative responses, invalid citations and provider faults;
Live uses real assistant calls except labelled synthetic error/timeout probes. Only the
main agent runs Live. The memory usage ledger prevents product data writes. See
`docs/evaluation.md` for denominator definitions, mode-specific expectations and limits:
contract validity does not establish semantic answer quality.
