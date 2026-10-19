# Investigation contracts and read-only tools

N2 supplies the public evidence boundary. N3a adds field reports, interpretation ranking,
the bounded tool loop, operator decisions and gated assignment through shared Live/Offline
services. N3b adds restart-safe deadlines, supersession, explicit overrides, safe policy approval, simulated reports and retained analytics.

## DTO boundary

`backend/src/investigation-dto.mjs` builds explicit fields without spreading state rows:

- Case: `caseId`, `equipmentId`, `issueClass`, `symptomCode`, `symptomText`,
  `reportNarrative`, `narrativeSource`, `fixesTried` (`fixId`, `order`, `outcome`),
  `resolvedAt`, `firstTimeFix`, `totalMinutes`, `legacy`.
- Responder: `responderId`, `displayName`, `certifications`, `availability`,
  `shiftEndsAt`, `distanceBand`, `sameIssueHistoricalCount`, `soloHistoricalCount`,
  `assistedHistoricalCount`. Counts are observed completed attempts, without latent
  rates or participation weights. Distance is NEAR (same floor, ≤50 m), FAR,
  OTHER_FLOOR or UNKNOWN. Normal shift endpoints use the rotation anchor; call-ins
  and explicit extensions use their public duty endpoints.
- Fix: `fixId`, `title`, `steps`, `safetyClass`, `prerequisites`, `requiredCertifications`.
  Procedure text is verbatim catalog text.
- Equipment: `equipmentId`, `name`, `floor`, `issueClasses` (A/B/C), `recentCaseCount`.
  The count covers the supplied cutoff-filtered cases; no implicit wall-clock window.

**No skill, cause, effectiveness, draws, probabilities or simulation work enter these
constructors.** Report text remains untrusted evidence, including injection-like text.

## Cases and cutoff

`casesBefore(state, {asOf, targetIssueId})` derives stable `CASE-<issueId>` identities
from resolved issues and compact archived issue facts. Resolution observations remain in
canonical `resolutionHistory` after archiving. Facts retain symptoms, narrative/source,
raised/resolved timestamps and identifiers, so case DTOs survive retention/reload without
archive I/O. Old compact facts missing narrative use the public-symptom template fallback.

Every evidence tool requires a host-owned `asOf`; outcomes must complete **strictly
before** it, and the target issue is excluded. The host supplies the decision snapshot
for current availability, qualifications and equipment geometry; this is not a historical
roster reconstruction service. `createInvestigationTools` binds cutoff/target in a closure;
they are absent from model schemas and rejected as model arguments.

Cases list valid catalog fixes in completion order, with FIXED/NOT_FIXED outcomes.
Any missing/legacy procedure makes `legacy: true`, `firstTimeFix: null`; such cases remain
searchable but are excluded from fix evidence. Otherwise first-time fix means one
successful completed attempt. Total minutes is elapsed raised-to-resolved time.

## Tool surface and limits

`backend/src/investigation-tools.mjs` exports `INVESTIGATION_TOOLS` (OpenAI function
schemas), `executeInvestigationTool` and the bound `createInvestigationTools` adapter.

| Tool | Arguments | Result rows |
|---|---|---|
| `search_cases` | optional equipmentId, issueClass, symptomCode, query, limit | Case DTOs, newest first, ID tie-break |
| `get_case` | caseId | One Case DTO; unknown/excluded cases return CASE_NOT_FOUND |
| `equipment_history` | equipmentId | Equipment DTO plus up to nine Case DTOs |
| `fix_catalog` | issueClass | Fix DTOs in catalog order |
| `fix_evidence` | issueClass, fixId; optional equipmentId, symptomCode | Same-class/matching case counts, matching successes and deterministic grade |
| `eligible_responders` | equipmentId, issueClass, fixId | Available responder DTOs holding every required certification, ID order |

Results are `{ok:true, rows, truncated}` with ≤10 total top-level rows and ≤8192 UTF-8
bytes, including the envelope. Whole rows are dropped to meet the byte budget, never
partial procedures. The loop can use the bounded subset of a truncated result and cite only returned cases.
A single oversized row producing no usable result triggers deterministic fallback. Errors are `{ok:false,error:{code}}` with
fixed codes, never exception messages or echoed arguments/state. Argument objects and
JSON strings are validated strictly; unknown keys/tools, malformed JSON and missing
cutoffs return errors. Tools perform no writes or provider calls.

Fix evidence uses completed nonlegacy cases where the fix was tried: same-equipment OR
same-symptom matches form S, same-class forms C. STRONG requires S≥3 and smoothed matching
success≥0.6; MODERATE requires S≥1 or C≥3; THIN requires C≥1; otherwise NONE.

## Public synthetic records

`investigation-records.mjs` seeds certifications from responder ID in the independent
`public-certifications-v1` RNG namespace. The enum is ISOLATION / SPECIALIST-A/B/C.
Provisioning and migration populate missing arrays, preserving existing public records;
no engine RNG stream advances and no skill table is read. Existing rooms and the compressed
month seed go through the same `migrateLiveState` path. No seed artifact rewrite is needed.

Missing issue narratives get public-symptom-only templates (`narrativeSource: template`),
including retained compact facts. New simulation issues also have templates. The offline
history generator wraps both store adapters to write repeatable `simulated` templates
with misleading keywords, typos and omissions using a separate id-seeded namespace,
before retention. Operator narratives are preserved. Live sampled reports use the bounded narrator described below.

Safety catalog metadata and validation live in `fix-catalog.mjs`. `investigation-service.mjs`
revalidates qualification and confirmed prerequisites atomically at operator approval.

Tests: `backend/tests/investigation-contracts.test.mjs` covers canaries/noninterference,
cutoffs, archive identities, migration (including the committed month seed), safety,
qualification, budgets, noisy templates, and read-only scenario setup tags.

## Field reports and interpretation

`report-policy.mjs` owns the versioned hazard/injection lexicons and the public symptom
registry shared with the fault engine. Hazards (heat, smoke, sparks, injury, fire,
burning, bypass, override interlock) take precedence over input rejection, and create an
ESCALATED investigation without resolving provider settings or calling a model. A known,
unoccupied station creates a gated issue directly; an occupied/unidentified station is
recorded as an escalation without inventing a duplicate incident. Input that is empty,
over 600 characters, under three words or mostly nonletters gets ABSTAINED without calls.
Overlength reports retain at most 601 characters, sufficient to show the policy violation.
Injection spans remain quoted strings in public flags and model input; retrieved narrative
is wrapped as untrusted tool data. Neither narrative path can dispatch or approve overtime.

Ordinary submissions persist UNRESOLVED FieldReports. Code builds at most twelve options
from explicit equipment or lexical station/ID matches crossed with public symptom pairs.
The Compass ranking role may only order these option IDs with bounded qualitative prose;
invalid output/outage uses the deterministic lexical order. While ranking, the interpretation
status is PENDING_MODEL, matching the existing UI's disabled confirmation state. No matched
equipment leaves the report unresolved for an explicit manual triple or closure.

The operator confirms an option or a valid equipment/class/symptom triple, guarded by the
report revision. Code creates the issue, priority band, origin FIELD_REPORT and gate
INVESTIGATION. Latent fault assignment never overwrites the confirmed public symptom.
An already occupied station rejects ordinary confirmation with a conflict.

## Investigator and validation

`investigator.mjs` uses the investigator role, `callChatTurn` and the host-bound N2 tools.
Native and JSON-protocol turns use the same loop. JSON-protocol history is encoded as
ordinary assistant/user JSON messages; native histories serialize function arguments as
strings. Live transport defaults to global fetch and uses the existing provider controls.
Prompts live in `backend/src/prompts/investigator.mjs`.

Each run has a shared monotonic deadline (maximum 120 seconds), at most six proposed tool
executions and eight inference calls, including at most one final-output repair. Each
provider promise is raced against the remaining deadline, so a transport that ignores its
own timeout still cannot pin the work lane. Persisted traces contain only schema-validated
arguments, returned IDs, elapsed times and fixed errors, with a 64 KiB limit. Invalid raw
model text is discarded; `rawInvalid` is a boolean, not stored prose.

Final hypotheses use class symptom codes and an allowlist of public observable phrases.
Fixes are catalog IDs; responder IDs must have been returned by eligible_responders for
the first fix. Citations name only CaseDTO fields and cases actually returned in this run.
Unknown keys, invented IDs, duplicate rankings and prose over 400 characters or containing
digits outside supplied IDs fail validation. One repair shares the original budget and
cannot execute further tools. Procedures always come verbatim from the catalog.

Code computes grades and qualification. A model ESCALATE paired with a MODERATE/STRONG
first fix and supplied qualified responder is contradictory final output: bounded validation
feedback requests the existing single repair within the original budget. Repeated contradiction
uses deterministic fallback. ESCALATE remains accepted without a supported qualified action;
code-owned hazard escalation still precedes all model work. Otherwise accepted escalation takes precedence;
otherwise an explicit abstention, no supported fix or no eligible qualified responder
produces ABSTAINED. THIN produces a low-evidence warning and still requires approval.
Code also shows approaching duty endpoints as public facts. Failures use labelled
DETERMINISTIC output: lexical case overlap, observed fix evidence and nearest qualified
responder order. No fallback opens the dispatch gate. Fixture mode reads the labelled
synthetic script in `fixtures/investigation/synthetic-responses/default.json`; no credential
or network access is needed.

## Dispatch and operator decisions

`dispatch-gate.mjs` supplies `assertDispatchAuthorized` to live assignment, offer creation,
offer acceptance, override, assistance/review, transfer, workforce handover/queue rematch,
and the legacy/offline writers. Missing/OPEN gates preserve existing dispatch behavior.
An investigation-gated issue needs an APPROVED, AUTO_APPROVED or OVERRIDDEN record for that exact responder and fix, current
certifications and all prerequisite confirmations. Authorization is consumed by the initial
attempt ID; support, transfers, handover replacements and failed-attempt rematches cannot
reuse it. The existing handover engine defers an unapproved replacement instead of silently
changing the responder. Continuing work requires a new explicit override or re-investigation; no implicit replacement is authorized.

Approval rechecks the issue, responder availability/active assignments, public catalog,
certifications, prerequisite enum/completeness and investigation revision in one store
mutation. It stores Central command, timestamp, revision and authorized IDs, then invokes
the shared assignment engine in that mutation. `selectAttemptFix` uses exactly the approved
fix. A same-record duplicate approval is idempotent; another choice/revision returns 409
STALE with no mutation. An abstained/escalated run uses the separate override route with an
explicit reason and the same safety checks. Reject, operator escalation, report closure
and useful/not-useful feedback are audited and cannot authorize assignment.

## Persistence, modes, API and evaluation

`investigation-service.mjs` persists `fieldReports`, `investigations` and monotone ID
sequences in the room state. Run tokens stay private. On load RUNNING investigations and
interrupted report rankings return to QUEUED with old tokens removed. Late responses cannot
publish after reset, closure or a changed token. The Live agent lane starts a tracked pump
and yields during provider waits; snapshots, ticks and operator actions remain responsive.
Offline wraps the same service and assignment logic in its in-memory store, with fixture
options fixed for both roles.

`investigation-public.mjs` constructs explicit public report/investigation/decision/trace
fields. `/state` contains open investigations plus the last twenty terminal records and
linked/unresolved reports, including the small public trace needed by the existing UI.
Full investigation lookup and case lookup are available separately. Issue audits include
public investigation records, including for archived issues. See [http-api.md](http-api.md).

`investigation-eval.mjs` implements `runScenario(scenario,{mode,samples})` over an isolated
scratch store. History/responder setup tags create disclosed synthetic public observations;
operator confirmation uses the scenario's specified manual interpretation, so interpretation
agreement measures the confirmed facts, not independent model classification. Fixture
inference uses a synthetic script and reports zero tokens. The never-resolving scenario uses
a short injected timeout; it is a deadline test, not a live latency measurement. The
only-via-overtime scenario safely abstains with no eligible responder; its corrected fixture
label is ABSTAINED. No investigator can
approve staffing. Live evaluation is an explicit separate command for the main agent.

N3a tests: `backend/tests/investigator.test.mjs` includes native/global-fetch and
JSON-protocol transport, real route handlers, safety/approval, policy exits, gating call-site
scanner and forged offers, cutoffs/privacy, fixture Offline mode, durable restart and
late-token protection, budgets, repair and a never-resolving-provider responsiveness test.

New report and operator-reason text is checked against the shared privacy guard before
persistence. Restricted simulation-marker content returns 400 RESTRICTED_REPORT_CONTENT,
preserving snapshot readability and the hidden-truth boundary. Ordinary injection-like
spans remain accepted as quoted untrusted data. At a tool-step cap, fallback citations are
restricted to cases already present in the retained trace; no additional cited case is
invented to bypass the step limit.


## Lifecycle, safe policy and simulation reports

`investigation-policy.mjs` persists room `investigationPolicy`: `investigationApproval`
OPERATOR (default) or AUTO_APPROVE_SAFE, `investigationDeadlineMinutes` (default 30),
`investigationShare` (default 0.2), and `revision`. READY deadlines are measured from
`readyAt` in simulated minutes. The scheduler claims durable deadline tokens, replays
claimed work after restart, and clears the token atomically with the terminal decision.
Late normal approvals fail; duplicate completion cannot assign twice. Re-investigation
supersedes the old run, invalidates its tokens and creates a new run with fresh host cutoff.

At the deadline AUTO_APPROVE_SAFE can approve only a READY result whose overall and first
fix grades are MODERATE/STRONG, with a confirmed report and explicit empty hazard flags.
It rechecks availability, certifications, issue state and prerequisites in the same mutation
as assignment. Policy records prerequisite confirmations and actor `policy:AUTO_APPROVE_SAFE`.
Unsafe, unsupported, unavailable or stale work expires; ABSTAINED/ESCALATED/THIN never auto-approve.
Manual ABSTAINED/ESCALATED overrides record status OVERRIDDEN and an operator reason.

Planner issues use an independent persisted investigation RNG stream to sample the share.
Sampled issues keep engine-owned facts, origin SIMULATION and gate INVESTIGATION; they
start directly without operator classification confirmation. `narrator.mjs` calls the narrator
role through `callChatTurn` with a bounded timeout and only ObservableDTO: equipmentName,
issueClass, symptomText and cutoff-filtered recentPublicEvents (eventType/at). It receives no
responder, outcome, cause or skill data. Procedure titles, causal/skill vocabulary, hidden
markers, malformed content and digits outside the equipment name trigger template fallback.
Narrative publication changes prose only. Offline uses fixtures/template fallback with no API.

`investigation-analytics.mjs` builds compact observed facts retained alongside closed issue
archives. Full reports/runs remain available through archive-aware detail and audit lookups.
See analytics-and-ethics for denominators and the unobserved baseline limitation. Synthetic
small and month datasets, counts, reproduction and unattended queue limits are documented in
`backend/seed/INVESTIGATION_DATASETS.md`. Lifecycle tests live in
`backend/tests/investigation-lifecycle.test.mjs`.


The prompt reserves proposedOutcome for not recommending: routine operator approval is not
an escalation reason. Model recommendations omit that field. Every public deterministic run
has a nonempty fallbackReason, including persisted hazard-policy/input-policy exits, older
records with deterministic-policy fallback, and pending-investigation placeholders. The eval
adapter's unresolved interpretation result is labelled interpretation-unresolved. Invalid
contradictory finals set rawInvalid and consume the same single repair; policy exits remain
rawInvalid/repaired false and make no provider calls. Live accuracy must be remeasured
separately; hermetic repair tests do not establish live model accuracy.
## Model-proposed escalation (2026-10-19)

`proposedOutcome: ESCALATE` is accepted only when the model recommends no supported action.
If the first fix is graded `MODERATE`/`STRONG` and a qualified responder is ranked, an
`ESCALATE` contradicts the recommendation. It is treated as a validation error: one
repair, within the shared call and step budget, then the deterministic fallback
(`validation-failed`). The prompt reserves `ESCALATE` for a safety concern that blocks any
action. Found by the first live evaluation (`docs/evaluation.md`), where Ultra used it to
mean "send to the operator". The code-owned hazard policy is unchanged.

## Paired first-fix replay

`replay-runner.mjs` exports `runPairedReplay({mode,heldOutDays=7,limit,investigate})` returning
`{pairs,meta}`. Default input is the existing committed plant-1 month plus archive bundles;
optional seed injection supports hermetic perturbation tests. `buildReplayDecisionState`
constructs an explicit public rolling-origin projection at target raisedAt, excludes target
and all equal/future completions, reconstructs roster from rotation/approved staffing and
assignment intervals, and never exposes engine truth or approval policy. The shared
casesBefore tools and cutoff-filtered buildFixPacket determine all public evidence and
baseline choices. No interpretation confirmation or policy shortcut is used.

`replay-outcome-runner.mjs` owns private outcome inputs and reproduces the recorded first
attempt's engine draws with the historical first responder, cloning the same start state
for each explicit fix. Only `{fixed}` leaves each arm. Missing original inputs fail closed
into FAILED exclusions. No runtime state is written. Pairs include non-READY exclusions;
meta reports window, source hashes, counts, model IDs and runtime. CLI `--replay` uses the
existing pure scorePairedReplay; see `docs/evaluation.md` for method, assumptions and commands.
`backend/tests/replay-runner.test.mjs` covers future/truth noninterference, identical draws,
fixed-responder controls, coverage, reproducibility and a hermetic limit-five CLI invocation.
