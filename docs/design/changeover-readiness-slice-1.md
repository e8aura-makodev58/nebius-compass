# Changeover readiness check, slice 1 (F5)

Status: **approved for build, round 42.** Slice 1 of candidate F5 in `docs/product/ate-feature-proposal.md`. The full
F5 is size L (scheduling, crew, kits, replanning). This slice is the **M precursor** the proposal describes: a
deterministic readiness check for one planned changeover. It does **not** schedule, reserve, move work or rank crew.
Synthetic, domain-neutral data only. Pure domain module: no route, no UI, no store, no clock and no model.

## 1. Why

A changeover reaches its start time without the parts it needs. Slice 1 answers one question before the start:
"is this changeover ready, and if not, which requirement is missing?" It reuses the facts that already exist:
loadboard inventory (F3) and cell readiness (F8). Kit and crew facts do not exist yet, so the check reports them
as **unknown** rather than assuming them ready.

## 2. Input

```json
{
  "changeover": {
    "changeoverId": "CO-0031",
    "cellId": "ATE-1",
    "targetProgramRevision": "SR1260-P3",
    "startsAt": "2026-10-24T14:00:00.000Z"
  },
  "inventory": { "boards": [], "reservations": [] },
  "readiness": { "cellId": "ATE-1", "at": "2026-10-24T14:00:00.000Z", "readiness": "READY", "reasons": [], "instruments": [] },
  "kitFacts": null,
  "crewFacts": null
}
```

- `inventory` is the F3 loadboard inventory shape (`backend/src/loadboard-checkout.mjs`), validated by the existing validator.
- `readiness` is the F8 `cellReadiness` result. It must be for the same cell and for `startsAt`; a mismatch is an input error.
- `kitFacts` and `crewFacts` are `null` in slice 1. They are reserved fields; any other value is an input error.

## 3. Checks

Each check yields `PASS`, `FAIL` (with a stable reason code) or `UNKNOWN`. The results are listed in a fixed order.

| Check | PASS when | FAIL reason | UNKNOWN when |
|---|---|---|---|
| `LOADBOARD_AVAILABLE` | a board exists that is `SERVICEABLE`, whose `approvedPrograms` include `targetProgramRevision`, and which is **either** already at `cellId` with a `HELD` reservation for `cellId` **or** in store (`cellId: null`) with no `HELD` reservation | `NO_COMPATIBLE_LOADBOARD` | never |
| `CELL_READY` | `readiness.readiness === 'READY'` | `CELL_NOT_READY` | never |
| `KIT_AVAILABLE` | never in slice 1 | — | always, reason `KIT_FACTS_NOT_RECORDED` |
| `CREW_QUALIFIED` | never in slice 1 | — | always, reason `CREW_FACTS_NOT_RECORDED` |

Rules:
- A board already held by a **different** cell does not count, even if approved.
- `LOADBOARD_AVAILABLE` with a board in another cell is `FAIL` with `NO_COMPATIBLE_LOADBOARD`, not `UNKNOWN`.
- An `UNKNOWN` check never becomes `PASS`. It blocks the overall status from being `READY`.

## 4. Output

```json
{
  "changeoverId": "CO-0031",
  "cellId": "ATE-1",
  "startsAt": "2026-10-24T14:00:00.000Z",
  "status": "BLOCKED",
  "checks": [
    { "check": "LOADBOARD_AVAILABLE", "result": "PASS", "reasons": [], "boardId": "LB-0412" },
    { "check": "CELL_READY", "result": "PASS", "reasons": [] },
    { "check": "KIT_AVAILABLE", "result": "UNKNOWN", "reasons": ["KIT_FACTS_NOT_RECORDED"] },
    { "check": "CREW_QUALIFIED", "result": "UNKNOWN", "reasons": ["CREW_FACTS_NOT_RECORDED"] }
  ],
  "reasons": ["CREW_FACTS_NOT_RECORDED", "KIT_FACTS_NOT_RECORDED"]
}
```

- `status` is `READY` only when every check is `PASS`. Otherwise it is `BLOCKED`. A `FAIL` also gives `BLOCKED`.
- `reasons` is the sorted union of all failing and unknown reason codes.
- `boardId` is shown only for `LOADBOARD_AVAILABLE` when `PASS`. The board choice is the first match in `boardId` order, so the output is deterministic.
- The output has no recommendation and no schedule. It is a check, not a plan.

## 5. Acceptance (hermetic tests in `backend/tests/changeover-readiness.test.mjs`)

- A compatible board in store, with the cell READY, `kitFacts` and `crewFacts` present as `null` → `BLOCKED` with the two `UNKNOWN` reasons, and `LOADBOARD_AVAILABLE` `PASS` with `boardId`.
- No approved program match → `LOADBOARD_AVAILABLE` `FAIL` `NO_COMPATIBLE_LOADBOARD`.
- An approved board held by another cell → `FAIL`, not `PASS`.
- A board already held by this cell with `cellId` set and a `HELD` reservation for `cellId` → `PASS`.
- A non-`SERVICEABLE` board (`UNDER_REPAIR`, `QUARANTINED`) → `FAIL`.
- `readiness` not `READY` → `CELL_READY` `FAIL` with `CELL_NOT_READY`.
- A readiness result for another cell or time → input error (throws `TypeError`).
- Non-null `kitFacts` or `crewFacts` → input error (slice 1 does not accept them).
- No `status` of `READY` is possible while any check is `UNKNOWN`.
- Determinism: the same input gives the same output; board choice does not depend on the input array order.
- The module imports nothing from `simulation`, `responder`, `analytics` or any store, and it reads no clock.
- No output field contains a schedule, a start time that was moved, or a recommended crew member.

## 6. Open items

- Kit compatibility and kit custody facts (not yet recorded). `KIT_AVAILABLE` stays `UNKNOWN` until they are.
- Crew qualification and duty/rest. The public certification rule applies; no skill data is read.
- Scheduling, slot enumeration, atomic reservation and replanning (the rest of F5) need their own specs.
