# Calibration readiness gate for ATE setups, slice 1 (F8)

Status: **approved for build, round 35.** Slice 1 of candidate F8 in `docs/product/ate-feature-proposal.md`
("an explicit readiness gate before broader yield comparisons"). Synthetic, domain-neutral data only. Pure domain
module: no route, no UI, no store, no clock and no model. Application code owns every decision.

## 1. Why

A loadboard can be checked out to an ATE setup whose tester calibration has lapsed, and the run then produces
results nobody can trust. Slice 1 adds one deterministic question, "is this cell ready?", and makes the existing
loadboard checkout refuse a cell that is not ready. Correlation evidence (comparing a cell's results with a
reference) is a **separate record** and does not change readiness in this slice.

## 2. Inputs

```json
{
  "calibrations": [
    {
      "calibrationId": "CAL-0031",
      "cellId": "ATE-1",
      "instrumentId": "PS-07",
      "calibratedAt": "2026-09-20T08:00:00.000Z",
      "dueAt": "2026-10-20T08:00:00.000Z"
    }
  ]
}
```

- One row per instrument calibration in a cell. A cell can have several instruments; each must be current.
- `dueAt` is the expiry instant. A calibration is current when `at < dueAt`.
- A later row for the same `cellId` and `instrumentId` supersedes the earlier one by `calibratedAt`. Rows with
  `calibratedAt` after `at` are ignored, so a future calibration never makes a cell ready early.

## 3. Readiness

`cellReadiness(calibrations, cellId, at)` returns:

```json
{ "cellId": "ATE-1", "at": "2026-10-24T08:00:00.000Z", "readiness": "READY", "reasons": [], "instruments": [
  { "instrumentId": "PS-07", "calibrationId": "CAL-0031", "dueAt": "2026-11-20T08:00:00.000Z", "state": "CURRENT" }
] }
```

- `readiness` is one of `READY`, `EXPIRED`, `NO_CALIBRATION`.
- A cell is `READY` only when every instrument it has a calibration row for is `CURRENT` and it has at least one instrument.
- Any instrument whose latest calibration has `dueAt ≤ at` makes the cell `EXPIRED` (reason `CALIBRATION_EXPIRED`).
- A cell with no calibration rows at all is `NO_CALIBRATION` (reason `NO_CALIBRATION_RECORD`). **Missing is never ready.**
- Reasons are sorted; `instruments` is sorted by `instrumentId`.

## 4. Gate on loadboard checkout

`checkoutBoard` in `backend/src/loadboard-checkout.mjs` takes an optional `readiness` argument (the result of
`cellReadiness` for the requested cell at `requestedAt`). When it is supplied and `readiness !== 'READY'`, the request
is rejected with the new reason code `CELL_NOT_READY`, added to the existing reasons (all failing rules are still
reported). When `readiness` is not supplied, the behaviour is unchanged, so existing tests and callers keep working.

The round 35 route wiring (a later round) must always supply the readiness argument for the requested cell.

## 5. Acceptance (hermetic tests)

- Current calibration on every instrument → `READY`, with the due date shown.
- One instrument past `dueAt` → `EXPIRED` with `CALIBRATION_EXPIRED`; the other instruments are still listed.
- `at` exactly equal to `dueAt` → expired (the boundary is conservative).
- No rows for the cell → `NO_CALIBRATION` with `NO_CALIBRATION_RECORD`; a row for another cell does not count.
- A later calibration supersedes an earlier one; an earlier-expired row followed by a current row → `READY`.
- A calibration with `calibratedAt` after `at` is ignored.
- `checkoutBoard` with `readiness` not `READY` → `REJECTED` with `CELL_NOT_READY` plus any other failing reasons,
  inventory unchanged.
- `checkoutBoard` with `readiness` `READY` → behaviour identical to before (existing loadboard tests still pass).
- Determinism: input order does not change the output; no clock read.
- The module imports nothing from `simulation`, `responder`, `analytics` or any store.

## 6. Separate correlation record (not in this gate)

Tester correlation evidence (for example, a reference-part comparison with its date, instrument and result) is stored
as its own record type and is **not** read by `cellReadiness` in slice 1. It becomes a gate only after an
engineering decision recorded in `docs/decisions.md`.

## 7. Open items

- Which instruments are required for each cell is an approved configuration, not inferred. Slice 1 takes it from
  the calibration rows themselves; a required-instrument list is a later addition.
- Calibration sources (manual entry first) and the time zone of `dueAt` are not confirmed.
- Whether a cell may run a non-production (engineering) checkout while expired is not decided here; the gate rejects it.
