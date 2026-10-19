# Investigation contracts and read-only tools

N2 supplies the public evidence boundary for the future investigator. It does not run a
model loop, create routes, approve procedures or dispatch responders.

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
partial procedures. A caller must handle `truncated` (including a single oversized case)
under the future run's budget/fallback policy. Errors are `{ok:false,error:{code}}` with
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
before retention. Operator narratives are preserved; the live narrator is not used yet.

Safety catalog metadata and validation live in `fix-catalog.mjs`. Qualification filters
are available now; prerequisite confirmation and approval enforcement belong to N3a.

Tests: `backend/tests/investigation-contracts.test.mjs` covers canaries/noninterference,
cutoffs, archive identities, migration (including the committed month seed), safety,
qualification, budgets, noisy templates, and read-only scenario setup tags.
