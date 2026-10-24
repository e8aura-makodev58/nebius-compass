# Loadboard inventory and checkout, slice 1 (F3)

Status: **approved for build, round 30.** Slice 1 of candidate F3 in `docs/product/ate-feature-proposal.md`.
Synthetic, domain-neutral data only. Pure domain module: no route, no UI, no store, no clock and no model.
Application code owns every decision.

## 1. Why

A changeover or repair stalls when the recorded spare is already installed, under repair, incompatible or
missing. Slice 1 makes checkout a deterministic decision: a board is allocated to one ATE setup at a time, and
only for a program revision that is explicitly approved for that board.

## 2. Inputs

```json
{
  "boards": [
    {
      "boardId": "LB-0412",
      "revision": "C",
      "condition": "SERVICEABLE",
      "cellId": "ATE-1",
      "approvedPrograms": ["SR1260-P3", "CX4820-P1"]
    }
  ],
  "reservations": [
    {
      "reservationId": "RES-0007",
      "boardId": "LB-0398",
      "cellId": "ATE-2",
      "programRevision": "PM0096-P2",
      "status": "HELD",
      "heldSince": "2026-10-24T08:00:00.000Z"
    }
  ]
}
```

- `condition` is one of `SERVICEABLE`, `UNDER_REPAIR`, `QUARANTINED`. Only `SERVICEABLE` boards can be checked out.
- `cellId` is the board's current location (an ATE setup) or `null` when it is in the store.
- `approvedPrograms` is the explicit compatibility list for that board revision. A program not in the list is never
  compatible, including programs with similar names. There is no inference from names.
- `reservations` with status `HELD` are the current allocations. `RELEASED` rows are history and are ignored.

## 3. Request and decision

`checkoutBoard(inventory, request)` where `request` is `{ requestId, boardId, cellId, programRevision, requestedAt }`.

Returns `{ decision, reasons, inventory, reservation }`:
- `decision` is `ALLOCATED` or `REJECTED`.
- `reasons` is a sorted list of stable codes. Allowed codes: `BOARD_UNKNOWN`, `CONDITION_BLOCKED`,
  `BOARD_NOT_IN_STORE`, `BOARD_HELD`, `PROGRAM_NOT_APPROVED`, `CELL_ALREADY_HOLDING`.
- `inventory` is a **new** object. On `REJECTED` it equals the input. On `ALLOCATED` it adds one `HELD` reservation
  and sets the board's `cellId` to the requested cell.
- `reservation` is the new row on `ALLOCATED`, otherwise `null`.

Rules:
- A board is allocated only if it is `SERVICEABLE`, its `cellId` is `null` (in store), no `HELD` reservation names it,
  `programRevision` is in `approvedPrograms`, and the requested cell holds no other `HELD` reservation.
- Every failing rule is reported, not only the first.
- `reservationId` is derived deterministically from `requestId` (for example `RES-` + `requestId`). No random IDs.

## 4. Concurrency

The module has no locking. Concurrency is handled by **ordering**: the caller applies requests one at a time in
the order of `requestedAt`, then `requestId`. `checkoutBatch(inventory, requests)` sorts and applies them in that
order, threading the inventory through. Two requests for the same board in one batch therefore yield exactly one
`ALLOCATED` and one `REJECTED` with `BOARD_HELD`. The store layer (a later slice) must provide the same serial order.

## 5. Release

`releaseBoard(inventory, { reservationId, releasedAt, cellId })` marks the matching `HELD` reservation `RELEASED`,
sets `releasedAt`, sets the board's `cellId` to `null` (returned to store) and returns the new inventory. It rejects
(unchanged input, reason `NO_HELD_RESERVATION`) when no matching `HELD` row exists or `cellId` does not match the
reservation's cell.

## 6. Acceptance (hermetic tests in `backend/tests/loadboard-checkout.test.mjs`)

- Compatible, serviceable, in-store board → `ALLOCATED`, one new `HELD` row, board `cellId` set.
- Program not in `approvedPrograms` → `REJECTED` with `PROGRAM_NOT_APPROVED`; a similarly named program is also rejected.
- `UNDER_REPAIR` and `QUARANTINED` boards → `CONDITION_BLOCKED`.
- Board in a cell or already `HELD` → `BOARD_NOT_IN_STORE` / `BOARD_HELD`.
- Cell already holding a board → `CELL_ALREADY_HOLDING`; several failures are all reported.
- Batch of two requests for one board at the same `requestedAt` → one `ALLOCATED` (lower `requestId`), one `BOARD_HELD`.
- Batch order is independent of input array order (deterministic).
- Release then re-request → `ALLOCATED`. Release with the wrong cell → `NO_HELD_RESERVATION`, input unchanged.
- Rejected checkout returns the input object content unchanged (deep-equal), and no input object is mutated.
- Unknown board → `BOARD_UNKNOWN`.
- The module imports nothing from `simulation`, `responder`, `analytics` or any store, and it reads no clock.

## 7. Open items

- Real board, compatibility and custody sources are unknown. Slice 1 uses manual or synthetic input only.
- Calibration and inspection gates (F8) are not part of this slice.
- Changeover kits and FT socket membership (F3 full scope) are later slices.
