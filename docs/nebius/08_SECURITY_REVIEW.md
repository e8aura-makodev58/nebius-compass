# Investigator security and correctness review — round 20

Reviewed commit `194da5f` on 2026-10-19, including the investigator changes from
`8a76993`. This is a findings-only review; no application code changed.

Scope: `report-policy.mjs`, `investigator.mjs`, `prompts/investigator.mjs`,
`investigation-service.mjs`, `investigation-public.mjs`, `dispatch-gate.mjs`, the
investigation routes in `server.mjs`, and `frontend/investigation-view.js`.
Adjacent store, DTO, tool, retention, provider and assignment code was followed
where necessary to establish impact.

Verification used synthetic scenario state, the transactional in-memory store,
stubbed model turns, and direct request-handler invocation. No live providers,
runtime data writes, external hosts or running application servers were used.
Full suites were not run, as authorized for this docs-only assignment. These
checks confirm acceptance/failure paths, not that a real model will obey a
particular injection. Deployment proxy authentication was not inspected.

## 1. High — any reachable client can exercise operator authority

**Locations:** `backend/src/server.mjs:133`, `:140`, `:147`, `:393`;
`backend/src/investigation-service.mjs:224`.

The room routes do not authenticate callers or authorize operator actions.
`publicSettingsEditable` guards provider settings, not investigation decisions
or the room approval policy. An untrusted client can read the current revision,
choose a public fix/responder and submit an approval or override, or switch the
room to `AUTO_APPROVE_SAFE`. The audit actor is always `Central command` for
operator decisions, so it does not establish who actually authorized dispatch.

**Confirmed:** direct handler invocation with no credentials, a hostile Origin
and `Content-Type: text/plain` returned HTTP 200 / `APPROVED` and assigned the
fixture issue. The JSON body parser accepts text/plain, allowing a browser
cross-origin simple POST to reach the mutation without needing a successful
CORS preflight. A browser exploit was not run. Actual public reachability and
any upstream access controls remain **unconfirmed**. The gate still records a
decision; this is impersonation of an operator, not dispatch with no record.

**Proposed fix:** enforce authenticated operator authorization for decisions and
policy mutations, keep report submission a separately scoped permission, and
record the authenticated actor. Reject unexpected Origin and non-JSON mutation
bodies; add CSRF protection if authentication uses cookies. Treat an accessible
unprotected deployment as unsafe even when provider settings are read-only.

## 2. High — a model-supplied tool query can poison persisted public snapshots

**Locations:** `backend/src/investigator.mjs:138`, `:142`, `:109`;
`backend/src/investigation-service.mjs:204`;
`backend/src/investigation-public.mjs:20`;
`backend/src/live-schema.mjs:66`, `:356`.

A valid `search_cases` query is stored verbatim in the trace. Argument validation
checks its type/length, but does not reject reserved hidden-truth markers.
Fallback retains the trace. State validation checks investigation trace size,
not whether its public projection passes the hidden-truth guard.

**Confirmed:** a stubbed model called `search_cases` with
`{"query":"hidden-cause-A-0"}`, then supplied invalid final JSON. The deterministic
fallback committed successfully through the in-memory service and state
validator. `createPublicLiveSnapshot` subsequently threw
`Hidden fault truth crossed a public boundary`. The individual investigation DTO
also retains the query. Thus an injection that induces this tool argument, or a
malformed model response on its own, can persist a room `/state` outage. This is
an attacker-supplied marker, **not evidence that actual private truth was read**.

**Proposed fix:** sanitize or reject reserved strings in model-origin public
trace fields and validate the complete public projection before committing a
result. A rejected result must fall back using a safe trace. Also provide safe
handling for already persisted poisoned records. Keep the public guard intact.

## 3. High — numeric “grounding” trusts untrusted narrative and unrelated IDs

**Locations:** `backend/src/investigator.mjs:13`, `:16`, `:144`;
`backend/src/prompts/investigator.mjs:4`.

`numbersIn(result.rows)` harvests digits from the entire serialized tool result:
operator-authored historical narratives, identifiers, timestamps and numeric
facts all enter one global set. The prose validator checks only token membership,
without preserving the source field, metric, responder or unit. Removing supplied
IDs before checking prose also does not enforce token boundaries.

**Confirmed:** with grounding extracted solely from
`{reportNarrative:'Observed reference is 97 units.'}`, the final validator accepts
`Success probability is 97%.` With grounding from `{caseId:'CASE-ISS-001'}` alone,
it accepts `Success probability is 001%.` Both returned zero validation errors.
An author who gets a narrative into a completed retrieved case can seed such
numbers; actual model compliance with that instruction is **unconfirmed**.
Even legitimate tool numbers can be relabeled into invented probabilities.

**Proposed fix:** keep free-form model prose qualitative, or permit structured
references to explicitly allowlisted application metrics and render their values
and units in application code. Exclude narrative/ID/timestamp digits from metric
grounding. Reject claims about latent probabilities/skill regardless of whether
the same digits appeared elsewhere. Hypothesis text already has a stronger
catalog constraint; apply a similarly bounded contract where numeric claims matter.

## 4. High — an ordinary spelling of a hazard misses the deterministic safety gate

**Locations:** `backend/src/report-policy.mjs:8`, `:16`;
`backend/src/investigation-service.mjs:92`, `:236`.

The hazard regex recognizes `spark` and `sparks`, but not `sparking`; its trailing
word boundary prevents a match. That leaves a clear electrical hazard eligible
for the ordinary interpretation/investigation path. The safe auto-approval policy
checks these flags, so a missed hazard can reach that policy if the other evidence
and qualification checks pass.

**Confirmed:** `reportPolicy('Station EQ-04 is sparking during every cycle.')`
returns `hazard: []` and `input: null`. The subsequent auto-dispatch chain was
**not executed**; it is conditional on confirmation, a READY result, sufficient
case evidence and the room's explicit auto-approval setting. A real model might
escalate it, but the deterministic hazard policy has already missed it.

**Proposed fix:** cover hazard inflections and maintain regression cases for
common safety phrases. For unattended approval, require an explicit application
safety clearance rather than interpreting absence of regex matches as proof of
no hazard. Retain deterministic ownership of safety decisions.

## 5. Medium — READY can recommend a fix with no supporting evidence

**Locations:** `backend/src/investigator.mjs:31`, `:35`, `:171`, `:175`;
`backend/src/investigation-service.mjs:222`.

Empty citation arrays are valid. Final status checks whether *all* deterministic
fix alternatives have grade NONE, rather than whether the selected first fix has
support. Consequently, evidence for a different procedure can make an unsupported
model first choice READY. Ordinary approval accepts any fix in the returned list
without distinguishing this unsupported recommendation from an audited override.

**Confirmed:** using the committed strong-history scenario, a stubbed model queried
only qualified responders for `FIX-A-03`, then recommended that fix with empty
citations and a qualitative rationale. The result was `READY`, first fix
`FIX-A-03`, grade `NONE`, citations `[]`; the scenario's evidence supports another
fix. This does not bypass certification/prerequisite checks. Safe auto-approval
also checks the selected grade and remains blocked for this result.

**Proposed fix:** derive READY from evidence for the selected action; require
citations relevant to that fix, or attach application-owned supporting evidence.
Unsupported actions should abstain and require an explicit audited override.
Check citation field presence and fix relevance, not just case-ID membership.

## 6. High — report flooding has no admission bound and starves investigation work

**Locations:** `backend/src/server.mjs:133`;
`backend/src/investigation-service.mjs:84`, `:90`, `:175`;
`backend/src/investigation-public.mjs:35`;
`backend/src/live-runtime.mjs:45`.

Each accepted report appends durable state and an event. There is no per-client
rate limit, room backlog cap, deduplication or admission check. Reports without a
station still persist. Valid station reports can also queue paid interpretation
calls without being confirmed. `runNext` always prioritizes queued report ranking
over narrations and investigations, so a continuous stream can starve existing
work. All unresolved reports are included in the polled public payload.

**Confirmed:** 25 identical no-station reports were accepted; both stored and public
report counts were 25. No live spend or load test was performed. Unbounded growth
and the priority order are confirmed by code; real throughput/exhaustion thresholds
are **unmeasured**. Provider concurrency limits and daily budget do not bound the
persistent backlog or public payload; an unset budget does not prevent spend.

**Proposed fix:** add room/client admission limits and a bounded queue, return 429
when full, deduplicate/reuse request IDs, and schedule ranking/investigation work
fairly. Paginate unresolved reports and cap the default polling payload. Keep
application acceptance controls independent of provider throttling.

## 7. Medium — closing orphan reports does not reclaim their persistent state

**Locations:** `backend/src/investigation-service.mjs:121`;
`backend/src/history-retention.mjs:56`, `:66`, `:78`.

Report retention is tied to archiving a resolved linked issue. Unconfirmed reports
and policy outcomes with `issueId:null` have no such issue. Closing them hides
ordinary unresolved report cards but leaves their rows permanently in the store;
null-issue ABSTAINED/ESCALATED investigations can remain publicly retained too.
This persists even if rate limiting is subsequently added.

**Confirmed:** after creating and closing 25 no-station reports, advancing the
synthetic clock by a year and forcing seven-day compaction, all 25 report rows
remained. A paused clock is not required for this retention failure.

**Proposed fix:** define a bounded retention/archive policy for closed reports and
terminal null-issue investigations, independent of issue resolution. Preserve
monotonic IDs and the required audit trail while paging historical detail.

## 8. Low — malformed final-array entries skip the repair path and misclassify invalid output

**Locations:** `backend/src/investigator.mjs:33`, `:35`, `:38`, `:153`, `:180`.

The array validators access `row.fixId`/`row.responderId` before establishing that
each element is a valid object. JSON null elements can throw instead of returning
validation errors. The outer catch labels this as `provider-error`, skips the one
repair and leaves `rawInvalid:false`.

**Confirmed:** `{hypotheses:[null],fixes:[null],responders:[null]}` caused one
stubbed model call, fallback reason `provider-error`, and `rawInvalid:false`.
Dispatch still falls back safely, but repair behavior and failure analytics are
incorrect for a common malformed reply.

**Proposed fix:** make the validator total over arbitrary parsed JSON; validate
element shapes before reading properties. Send these errors through the bounded
repair path and count them as raw-invalid output.

## 9. Medium — failed approved attempts have no reinvestigation action in the UI

**Locations:** `frontend/investigation-view.js:110`, `:138`;
`backend/src/dispatch-gate.mjs:15`;
`backend/src/investigation-service.mjs:160`;
`backend/src/resolution-engine.mjs:96`.

A failed first attempt returns its issue to PENDING while its investigation remains
APPROVED/OVERRIDDEN/AUTO_APPROVED with a consumed `attemptId`. The gate correctly
refuses reusing that authorization. The UI offers re-investigation only for READY,
ABSTAINED, ESCALATED and EXPIRED, and treats approved records as recent history.
There is no visible recovery action for the failed attempt; the record can also
fall outside the most recent five displayed decisions.

**Confirmation:** established by tracing the code; a full failed-attempt browser
interaction was **not executed**. The reinvestigation API itself allows an approved
record once the issue is pending and assignments are inactive, so this is a UI
recovery gap, not a backend prohibition or authorization bypass.

**Proposed fix:** show pending gated issues with consumed authorizations as needing
a new investigation and expose that action using the latest revision. Preserve the
one-attempt authorization rule and the prior audit record.

## 10. Medium — provider response bytes are not bounded before parsing

**Locations:** `backend/src/investigator.mjs:126`, `:152`;
`backend/src/model-provider.mjs:304`, `:315`.

Tool outputs and accepted final arrays have bounds, but provider envelopes are
fully read with `response.json()` (or `response.text()` on failure), and final
content is JSON-parsed before its item/character limits apply. The requested output
token limit is a provider instruction, not a local response-byte limit. A faulty or
hostile provider response can allocate and synchronously parse a large payload,
blocking other rooms before deterministic fallback can run.

**Confirmation:** byte-limit absence confirmed by code; large-body exhaustion was
**not attempted**. This requires a malformed upstream reply, not just a large
incoming report; report bodies already have a route-level limit.

**Proposed fix:** enforce a streamed provider envelope byte cap, abort on overflow,
and cap final content/tool argument bytes before JSON parsing or trace construction.
Test oversized chunked success and error responses with local fetch stubs.

## Checks without a confirmed finding

- **Repair-message leakage:** inspected a captured repair after search and eligibility
  calls. Its fix IDs, qualified-responder lists and returned-case IDs came from public
  catalog/DTO results; `assertNoResponderSkill` passed. It did not echo the rejected
  raw final or a private state spread. No actual hidden-truth disclosure confirmed.
- **Dispatch gate:** assignment entry points use the shared gate; authorization binds
  fix/responder, current certifications and prerequisites and is consumed by one
  attempt. No path was confirmed that assigns a gated issue without a recorded
  decision. Finding 1 concerns who can create that decision.
- **Revision races:** an in-memory concurrent approve/reinvestigate returned APPROVED
  and STALE. Store mutations serialize and validate before publishing; completion
  tokens/status checks discard superseded work. No double assignment was confirmed.
  This was a focused check, not exhaustive concurrency exploration.
- **UI XSS:** dynamic narratives, rationale, decision text, case fields and attribute
  values pass through the injected `escape` callback. The application callback at
  `frontend/app.js:104` escapes ampersands, angle brackets and both quote types.
  Reviewed innerHTML sinks use escaped markup or constants; no executable injection
  was confirmed. No browser fuzzing was performed.
- **Private DTO fields:** case/responder/investigation projections enumerate public
  fields and do not spread simulation truth. No actual hidden skill/fault values
  were observed crossing the reviewed DTO boundaries. Finding 2 is a persisted
  attacker-string failure of the guard, not private-state exfiltration.
- **Existing bounds:** report body/read limits, final item limits, six tool steps,
  eight inference turns, tool row/byte limits, trace budget and wall-clock deadline
  exist. They do not address the backlog or upstream byte limits above. Injection
  keyword detection is advisory; JSON quoting and prompts alone do not prove a
  model will ignore hostile text.
