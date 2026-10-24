/** Explicit read-only public obligation history; no counter evaluation or clock writes. */
import { validateConsumableObligationRows } from './consumable-life-obligations.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';

export function buildConsumableObligations(state, { roomId = null } = {}) {
  const source = state.consumableObligations === undefined ? [] : state.consumableObligations;
  if (!Array.isArray(source)) throw new TypeError('Invalid consumable obligation rows');
  const obligations = source.map(row => ({ obligationId: row.obligationId, obligationKey: row.obligationKey,
    assetId: row.assetId, lifecycleId: row.lifecycleId, policyId: row.policyId, policyVersion: row.policyVersion,
    kind: row.kind, status: row.status, openedAt: row.openedAt, closedAt: row.closedAt,
    closeReason: row.closeReason, supersededBy: row.supersededBy }));
  validateConsumableObligationRows(obligations);
  const asOf = state.simulationState.simulationTime;
  if (!Number.isFinite(Date.parse(asOf))) throw new TypeError('Invalid obligation snapshot time');
  const result = { roomId, asOf, obligations }; assertNoResponderSkill(result); return result;
}
