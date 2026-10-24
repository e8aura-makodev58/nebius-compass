# Investigator history at scale: design note

Status: **proposal, not implemented.** Written 2026-10-24 before the investigator is connected to a live
maintenance record. Describes the current implementation, what changes at scale, and the storage and retrieval
design to decide before integration. Synthetic and domain-neutral examples only.

## 1. Current implementation

The troubleshooting agent is the **investigator** (`backend/src/investigator.mjs`, prompts in
`backend/src/prompts/investigator.mjs`). It does not learn in the model-training sense. Each run re-reads history
through a bounded set of read-only tools.

- **Trigger:** an operator confirms a field report, which creates an issue gated on an investigation.
- **Tools** (`backend/src/investigation-tools.mjs`): `search_cases`, `get_case`, `equipment_history`,
  `fix_catalog`, `fix_evidence`, `eligible_responders`. Each takes a host-bound cutoff (`asOf`) and returns only
  cases completed strictly before it, excluding the target issue.
- **Budget:** at most six tool executions, eight inference calls (including one repair), and a 120 s deadline per run.
  Results are capped at ten rows and 8 KiB; whole rows are dropped to fit, never partial procedures.
- **Grading in code:** `fix_evidence` counts same-class cases, matching cases (same equipment or same symptom) and
  matching successes. It grades STRONG when there are at least three matches and `(successes + 1) / (matches + 2) >= 0.6`,
  MODERATE for at least one match or three same-class cases, THIN for one same-class case, otherwise NONE.
- **Output:** the model proposes hypotheses, fixes and responders from returned IDs only. Procedure text is verbatim
  from the catalog. Approval is an operator action; nothing is dispatched by the model.
- **Storage:** the room's whole state is one JSON document, rewritten on change (`backend/src/live-store.mjs`).
  Raw issues are retained for `COMPASS_HISTORY_RETENTION_DAYS` (default 7), then written to per-day archive files
  per reset epoch (`backend/src/history-archive.mjs`). Compact case facts stay in state so case lookups survive
  archiving.
- **Feedback:** operator useful / not-useful feedback is stored and audited. It does **not** feed `fix_evidence`.

## 2. What breaks at scale

Assumed scale for planning: hundreds of testers, several years of records, possibly millions of closed
maintenance events. These are analytical expectations, not measurements. Section 6 lists the benchmark that would confirm them.

| # | Issue | Why it matters |
|---|---|---|
| 1 | One JSON document per room, rewritten whole | Memory and write cost grow with all history; a crash mid-write risks the whole room. |
| 2 | Every tool call scans every case | `search_cases` and `fix_evidence` are linear in history; no index by equipment, class or symptom. |
| 3 | Top-ten search, newest first | A rare but relevant case from years ago never reaches the model. Recall is biased to recent records. |
| 4 | No time weighting | A fix that worked in one year counts the same as one from five years later. Equipment ageing and process changes are ignored. |
| 5 | Mixed match definition | "Same equipment" and "same symptom" are OR-ed into one pool, so the grade blends two different signals. |
| 6 | Grades saturate | With large counts, common fixes reach STRONG and the grade stops separating options. |
| 7 | Narrative text is untrusted and noisy | Live maintenance free text has abbreviations, typos and copied templates. Exact field filters miss it. |
| 8 | No feedback loop into evidence | Operator outcomes accumulate but do not change any grade; there is no review process for changing one. |

## 3. Do we need a vector database?

**Not as the first step.** A vector database answers one question well: "which past records read like this text?"
Most of the investigator's decisions are structured questions: same equipment, same issue class, same procedure,
completed before a cutoff, with a recorded outcome. Those are indexed filters and aggregates, which a relational
database does better and more transparently.

Vector search becomes useful for the **narrative** part of the problem (issue 7): finding older records whose free
text describes the same failure in different words. Before adding vectors, use a full-text index (BM25 or
trigram search over the narrative, with synonyms for the domain's abbreviations). It is cheaper, easier to explain
to an operator, and needs no re-embedding when the embedding model changes.

Add vectors only if a measured benchmark (section 6) shows that full-text recall on narratives is too low.
If we do, the costs to plan for are:

- **Re-embedding** when the model changes, which means a full rebuild of the index.
- **Access control:** the index must enforce the same record-level permissions and cutoff as the structured store.
  The cutoff must apply inside the vector query, not after it, or results can leak future records.
- **Explainability:** a similarity score is hard to show an operator. Each cited case still needs its own fields
  (equipment, dates, fixes, outcome) shown, not just a score.
- **Data residency:** narratives may contain personal or site-specific detail, so the embedding service must be
  inside the approved boundary.

**Recommendation:** a relational store with indexed case tables and full-text search on narratives. Keep vectors as
an optional later index, behind the same tool interface, so the investigator's contract does not change.

## 4. Proposed storage design

- **Cases table** (one row per closed issue, append-only, versioned): ID, equipment ID, equipment family, issue class,
  symptom code, raised and resolved timestamps, narrative text, narrative source, outcome, total minutes, legacy flag.
- **Attempts table** (one row per fix attempt): case ID, attempt order, fix ID, outcome, timestamps. Indexed on
  (issue class, fix ID, equipment family, resolved time).
- **Narrative index:** full-text over the narrative, with an abbreviation and synonym table maintained by the domain team.
- **Archive:** keep the operational store bounded (for example the most recent N months). Older rows move to
  immutable partitions by year, queried only by the explicit historical tool, never by default.
- **Cutoff:** every query takes `asOf` and filters on `resolved_at < asOf`. This stays in the store layer, not in the
  caller, so no tool can skip it.

## 5. Proposed retrieval and grading

- **Candidate pool:** structured filters first (class, then equipment family, then symptom), then full-text on
  narrative, then rank.
- **Ranking:** combine recency with a decay (for example a half-life per equipment family, set from data), plus a
  same-equipment bonus. Return the top K with explicit reasons, not a single score.
- **Grades:** keep the same tiers but compute them per equipment family and time window, and show the window
  in the result. Separate "same equipment" and "same symptom" counts instead of OR-ing them.
- **Smoothing:** use a prior from the fleet-wide rate for that fix, so a small local sample cannot grade STRONG alone.
- **Feedback:** operator outcomes go to a review queue. A reviewed change to a grade or weight is versioned and
  recorded, so an outcome can be traced to the rule that used it. No automatic weight changes.
- **Tool contract:** unchanged. The model still sees only returned rows, a byte budget and an `asOf`.

## 6. Benchmark before deciding

1. Generate a synthetic history at target size (for example 500 testers, 10 years, several million events) with
   the existing offline history generator, extended to the new schema.
2. Measure p95 latency for each tool at that size, with and without indexes.
3. Measure narrative recall: for a labelled set of synthetic "same failure, different words" pairs, what fraction
   does full-text retrieve in the top K? Repeat with vectors. Only adopt vectors if the gap is material.
4. Measure grade stability: how often does a fix change grade when one year of data is dropped?
5. Check the cutoff: a test that inserts a future-dated matching case and asserts it is never returned.

## 7. Decisions needed before integration

1. Which system is the source of truth for maintenance records, and is it read-only from Compass?
2. Retention and deletion rules for narrative text that may contain personal or site-specific detail.
3. Who owns the abbreviation and synonym table, and how changes are reviewed.
4. Whether the investigator may see historical cases from other sites, or only its own room.
5. Who reviews feedback-driven changes, and how often.
6. Acceptable latency for an investigation run at the target scale.

## 8. Out of scope here

Model choice, provider changes, the offline fixture mode and the UI. These keep working as they do now while the
storage layer changes behind the same tool interface.
