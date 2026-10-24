# Consumable life obligations as issues, slice 2 (F1)

Status: **proposal for round 31, not yet approved for build.** Builds on slice 1
(`docs/design/consumable-life-slice-1.md`, module `backend/src/consumable-life.mjs`, merged). Synthetic,
domain-neutral data only. Application code owns every decision; no model is involved.

## 1. Scope

Turn slice 1 evaluations into **at most one open obligation issue per asset lifecycle and status**, so that a
due counter reaches the existing issue and responder flow once, and resolves when the obligation is met.

In this slice:
- A **pure reconciler** that compares current evaluations with open obligations and returns the changes to make.
- A **persistence rule** for obligations in room state (one row per obligation, keyed by `obligationKey`).
- A **server hook** that runs the reconciler on a read-only evaluation of counter readings already in the room.

Not in this slice: an asset registry UI, counter import from equipment, responder offers (reuses the existing
eligible-responder path later), and any change to the simulation clock.

## 2. Obligation identity

An obligation is identified by `{ lifecycleId, policyId, policyVersion, kind }`, where `kind` is derived from
the slice 1 status:

| Slice 1 status | Obligation kind | Opens an issue? |
|---|---|---|
| `CLEAN_DUE` | `CLEANING` | yes |
| `REPLACE_DUE` | `REPLACEMENT` | yes |
| `RECONCILE` | `RECONCILIATION` | yes (blocks release, no automatic action) |
| `UNKNOWN` | `RECONCILIATION` | yes |
| `WARN`, `OK`, `NO_DATA` | none | no |

`obligationKey` from slice 1 already encodes the status. The reconciler uses the `lifecycleId` plus `kind` as the
identity, so a change from `CLEAN_DUE` to `REPLACE_DUE` on the same lifecycle **closes the cleaning obligation and
opens a replacement obligation**, with the old one linked as superseded. A `policyVersion` change closes and reopens
under the new version (recorded, not silent).

## 3. Reconciler

`reconcileConsumableObligations({ open, evaluations, observedAt })` is pure and returns:

```json
{
  "open": ["<obligation to create>"],
  "close": [{ "obligationId": "...", "reason": "CLEANED | REPLACED | SUPERSEDED | RESOLVED_BY_READING" }],
  "keep": ["<obligationId>"]
}
```

Rules:
- Same identity open and still required → `keep`. No duplicate issue is ever created.
- Required but not open → `open`. The obligation ID is derived deterministically from identity (for example
  `OBL-` + `lifecycleId` + `-` + `kind`), not from a random ID or the clock.
- Open but no longer required → `close`. The reason is the first matching code: `REPLACED` when the lifecycle is
  retired, `SUPERSEDED` when a different kind now applies, `CLEANED` for a cleaning obligation whose since-clean
  count reset, `RESOLVED_BY_READING` otherwise.
- `observedAt` is recorded on each change; it is never used to decide whether an obligation is required.

## 4. Lifecycle rules (must match the spec's ownership rules)

- A cleaning acknowledgement closes only the cleaning obligation. It never changes lifetime, so it never closes a
  replacement obligation.
- Replacing a part closes every open obligation of the old lifecycle with `REPLACED`. The old history is kept.
- An obligation with `RECONCILIATION` kind is closed only by a reconciled counter source, never by a timer.
- No obligation is closed automatically because usage is uncertain.

## 5. Persistence

- Obligations are rows in room state under `consumableObligations`, each with `obligationId`, identity fields,
  `status` (`OPEN` or `CLOSED`), `openedAt`, `closedAt`, `closeReason`, and `supersededBy` when applicable.
- Closed rows are retained as history. The room-state schema validator (`live-schema.mjs`) gains the new array with
  a strict shape check. Existing rooms migrate to an empty array; the migration is deterministic and tested.
- The server hook runs the reconciler on each simulation tick only when the room's counter readings change. It
  writes state through the normal store path, so the existing write-ordering and recovery rules apply.

## 6. Acceptance (hermetic tests)

- A new `CLEAN_DUE` evaluation opens exactly one `CLEANING` obligation; running the reconciler again keeps it (no duplicate).
- A cleaning event that brings the since-clean count back under limit closes it with `CLEANED`; lifetime is unchanged.
- `CLEAN_DUE` changing to `REPLACE_DUE` on the same lifecycle closes the cleaning obligation with `SUPERSEDED` and
  opens a `REPLACEMENT` obligation.
- Replacing the part (new lifecycle) closes old-lifecycle obligations with `REPLACED`; the new lifecycle opens nothing
  until its own evaluation requires it.
- `RECONCILE` opens a `RECONCILIATION` obligation that no later cleaning event closes.
- A `policyVersion` change closes the old obligation and opens a new one under the new version.
- The reconciler is deterministic: input order does not change the output; the same input twice gives the same output.
- Room-state migration adds an empty `consumableObligations` array to an existing room and passes validation.
- No `ResponderSkill` or responder-specific field appears in obligation rows or the reconciler output.

## 7. Open items

- Which obligation kinds open an issue automatically versus a manual review queue (proposal: all four above).
- Responder offers for a `CLEANING` obligation reuse the existing eligible-responder path; the certification rule
  comes from the public certification list, not from skill data.
- How real counter readings enter the room: manual entry first, then an adapter (later, separately approved).
