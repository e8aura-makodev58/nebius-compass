# Ask Compass: ordinary issue questions declined, broad advice question accepted

2026-10-21. User-requested investigation for Claude; code inspected at `87868d3`.
Findings only: no implementation, UI, provider configuration or running-room data changed.
No live inference calls. The quoted incident was supplied by the user; all reproduction
records below are synthetic and are not a reconstruction of that incident's actual state.

## Finding and impact

The first two questions are rejected by application keyword rules before any tool read or
provider call. They are not Nebius refusals or provider failures. Ask conflates asking about
public observations with requesting hidden simulation truth. Its action rule also confuses
equipment nouns and descriptions with commands. The third question avoids those keywords,
but Ask is explicitly instructed not to recommend procedures; it returns a status summary
instead. The validator does not establish that the summary answers the question or that
each sentence is supported by its cited records.

### 1. Exact decline trigger, reproduced

[`assistant.mjs`](../../backend/src/assistant.mjs), lines 11–20:
`forbiddenFacts` includes `caus\w*`; `declineQuestion` checks it before `actions`.
That matches ordinary words such as `cause`, `caused` and `causing`, regardless of intent.

| Question | Reproduced classification | Why |
|---|---|---|
| was anything stuck on the transfer causing it to stop repeatedly? | HIDDEN_TRUTH_REQUEST | `causing` matches `caus\w*` |
| was something stuck that cause the issue? | HIDDEN_TRUTH_REQUEST | `cause` matches `caus\w*` |
| What is the best approach to this issue | Allowed to reach model | No forbidden/action keyword matches |
| Was anything stuck? | Allowed to reach model | `stuck` is not blocked |
| Was anything stuck on the transfer? | ACTION_REQUEST | `transfer` matches the action list, even as an equipment noun |
| Why did it stop repeatedly? | ACTION_REQUEST | `stop` matches the action list, even as a historical observation |
| What caused the problem according to the public report? | HIDDEN_TRUTH_REQUEST | Explicit public-record qualification does not override `caused` |
| What do the public reports say about the obstruction? | Allowed to reach model | No blocked keyword; not a guarantee that supporting evidence exists |

The early return in `createAskService.ask` (`assistant.mjs`, lines 73–74) sets
`status: DECLINED`, `source: DETERMINISTIC`, `model: null`, `trace: []` and
`reason: HIDDEN_TRUTH_REQUEST`. Both user questions reproduced exactly that shape with
**zero provider-option reads**. The UI simply renders those fields as “Declined” and
“Deterministic” (`frontend/ask-view.js`, lines 8–24). The boundary message is generic for
hidden-truth and injection requests, so the user is not told which wording triggered it.

This overreach also exists on answers: `validateAskFinal` reuses the same word filters
(`assistant.mjs`, lines 26–28), while the system instruction bans discussion of causes
altogether (line 13). Changing only the request regex would still reject a sourced sentence
such as “The report records a transfer stop” or “The technician reported the cause as…”.

### 2. Why “best approach” yields a status summary

The question passes the lexical gate; it is not recognized as a request for advice.
The system prompt then forbids acting, authorizing and recommending procedures. A generic
status answer can satisfy the response schema and word restrictions without addressing
“best approach”. This is a mismatch between accepted question intent and product capability,
not evidence that the model chose an approved best fix.

The quoted answer uses `assigned`, which is not the blocked exact word `assign`, and
`completed quickly (within minutes)`, which contains no digit token. These forms bypass
those particular filters. There is no semantic relevance check, no general claim-to-field
validation, and no requirement to retrieve an investigation before saying it was completed.
Only recorded approval claims have a dedicated supporting-record check (line 39).

A local validator reproduction used the user's quoted answer, two correctly identified
citations, and deliberately non-supporting synthetic records:

```js
const records = new Map([
  ['issue:ISS-3635', {kind:'issue', id:'ISS-3635', status:'PENDING'}],
  ['event:event-48137', {
    kind:'event', id:'event-48137', eventType:'ISSUE_RAISED', responderId:'R-C-374'
  }]
]);
const output = {
  text: 'The investigation was completed quickly (within minutes) and responder R-C-374 has been assigned. No further events are recorded yet.',
  citations: [{kind:'issue',id:'ISS-3635'}, {kind:'event',id:'event-48137'}]
};
validateAskFinal(output, {records, numbers:new Set()}); // []: accepted
```

This **proves a validation gap**, not that the actual quoted answer was false. We did not
fetch its deployed answer, original snapshot or tool trace. “2 model calls” alone cannot
distinguish a tool round-trip from a validation repair. “Within minutes” needs appropriate
recorded timestamps and deterministic duration calculation; “No further events” needs a
bounded completeness statement. Event tools return at most ten retained events and the
answer does not establish archive-wide absence (`assistant-tools.mjs`, lines 78–79).

### 3. Context and available evidence can compound the mismatch

Ask receives only the current question, current context and current tool results; past
`askHistory` is not included in the provider messages (`assistant.mjs`, line 106).
Follow-up pronouns such as “it” and “this issue” therefore do not inherit the preceding
question's issue automatically.

The selected-issue checkbox is initially unchecked (`frontend/ask-view.js`, line 42).
Only when checked does the request include `context.issueId` (lines 75–78). With no context
or explicit ID, the backend seeds `analytics_summary`, not a specific issue (lines 85–91).
We cannot tell from the supplied transcript whether the box was checked. The quoted
citations show some issue/event evidence was returned, not how that context was selected.
This does not cause the two declines: their filter runs first, regardless of context.

Public evidence is deliberately limited. `get_issue` returns symptom/narrative/status and
elapsed open minutes (`assistant-tools.mjs`, lines 59–63), not latent causes or sensor truth.
`get_investigation` returns recorded status, fix titles and decision facts (lines 64–67);
it requires an investigation ID. Issue context does not automatically seed the linked
investigation. No read-only tool here establishes that a physical obstruction actually
existed unless an observable public record says so.

## Recommended implementation handoff

1. **Fix the deterministic intent boundary at both input and output.** Distinguish public
   observations/recorded engineering findings from requests to reveal private simulation
   truth. Distinguish imperative mutation requests from descriptive `stop`, `transfer`,
   `change` and similar words. Keep explicit private-field requests, skill inference,
   probabilities, injection and mutation requests blocked. Do not replace the host policy
   with an unrestricted model classifier or expose private cause fields to make answers
   easier. A broad exception for “according to the report” would be an injection bypass;
   use a bounded host-owned record-answer route and retain all private-data guards.
2. **Make the answer match the evidence and question.** For an obstruction question,
   retrieve the issue's public report and relevant recorded observations, then distinguish
   “reported obstruction”, “reported no obstruction” and “not recorded”. Absence of a
   record is not proof nothing was stuck. Example target wording, only when true of the
   returned evidence: “The report describes repeated stopping; it does not record whether
   anything was stuck.” Never infer hidden physical cause from the synthetic engine.
3. **Handle advice requests explicitly.** For “best approach”, show the existing recorded
   investigation/catalog choice and its approval status if available, or explain that a
   new procedural recommendation belongs in the investigation/decision workflow. No
   invented steps, new diagnosis, model-owned eligibility/priority or Ask action writes.
   Distinguish a recorded option from authority to carry it out. Include the linked
   investigation through a bounded public lookup if issue context is the intended entry.
4. **Ground concrete claims with code-owned evidence.** Require matched assignment events
   or decision fields for assignment assertions, lifecycle timestamps for durations, and
   explicit retrieval scope for event-absence statements. Prefer validated structured
   claim types with deterministic rendering for these facts over another free-text regex.
   Treat valid citation identity as necessary but insufficient. Keep metric computation
   and all mutations in application code; do not loosen the existing private-data DTOs.
5. **Coordinate context/message changes with Claude's UI work.** Explain the missing-evidence
   state rather than calling an ordinary operational question “outside the boundary”. Show
   the effective issue context and offer a useful public-record question when a request
   truly asks for hidden truth. Do not silently broaden context across rooms or reuse stale
   state. Backend policy changes need their own review; CSS cannot fix the classification.

Suggested regressions: all user questions above; quoted public finding vs hidden-cause ask;
reported/no-reported/unknown obstruction; historical `stop`/`transfer` vs imperative commands;
no linked investigation vs recorded approved option; the synthetic unsupported answer above;
ambiguous follow-up without issue context; complete vs truncated/retained event windows;
malicious report text; hidden-truth noninterference; identical policy in Live and Offline
with provider outage. Extend the evaluation labels as needed so improved public cause
questions are not accidentally scored as privacy failures by the scorer's parallel `caus`
lexical check (`scripts/eval/ask-score.mjs`). Keep truly private-cause and skill tests intact.

## Verification and limits

Directly executed `declineQuestion` for the eight-row matrix, the real Ask service for all
rejected rows with provider access forbidden, and the synthetic `validateAskFinal` example.
All reproduced as described. No diagnosis of the real issue, no deployed-state verification,
no live model calls, and no UI or implementation changes are part of this handoff.
