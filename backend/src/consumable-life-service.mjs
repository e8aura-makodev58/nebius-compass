/** Server-side counter-change hook. Writes only through the room's serialized store. */
import { createHash } from 'node:crypto';
import { evaluateConsumableLife } from './consumable-life.mjs';
import { reconcileConsumableObligations, applyConsumableObligationChanges } from './consumable-life-obligations.mjs';

const pending = new WeakMap(), digestCache = new WeakMap();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const iso = value => new Date(Date.parse(value)).toISOString();
export function consumableInputDigest(inputs) {
  const canonical = inputs.map(({ policy, asset, readings, cleanings }) => ({
    policy: { policyId: policy.policyId, version: policy.version, componentFamily: policy.componentFamily, counterUnit: policy.counterUnit,
      cleanEvery: policy.cleanEvery, lifetimeLimit: policy.lifetimeLimit, warnFraction: policy.warnFraction },
    asset: { assetId: asset.assetId, lifecycleId: asset.lifecycleId, policyId: asset.policyId, installedAt: iso(asset.installedAt) },
    readings: readings.map(row => ({ observedAt: iso(row.observedAt), lifetimeCount: row.lifetimeCount, unit: row.unit }))
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || compare(a.unit, b.unit)),
    cleanings: cleanings.map(row => ({ cleanedAt: iso(row.cleanedAt), lifetimeCountAtClean: row.lifetimeCountAtClean }))
      .sort((a, b) => Date.parse(a.cleanedAt) - Date.parse(b.cleanedAt)),
  })).sort((a, b) => compare(a.asset.assetId, b.asset.assetId));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function reconcileRoomConsumables(store, snapshot) {
  if (pending.has(store)) return pending.get(store);
  const work = (async () => {
    const state = snapshot ?? await store.snapshot(), inputs = state.consumableInputs ?? [];
    if (!inputs.length && !state.consumableReconciliation) { digestCache.delete(store); return { result: { changed: false } }; }
    let cached = digestCache.get(store);
    if (!Object.isFrozen(inputs) || !cached || cached.inputs !== inputs) {
      cached = { inputs, digest: consumableInputDigest(inputs) }; digestCache.set(store, cached);
    }
    if (state.consumableReconciliation?.inputDigest === cached.digest) return { result: { changed: false } };
    return store.mutate('consumable-obligations-reconcile', draft => {
      // Re-read inside the normal mutation queue; a newer counter transaction may have won.
      const current = draft.consumableInputs ?? [], inputDigest = consumableInputDigest(current);
      if (draft.consumableReconciliation?.inputDigest === inputDigest) return { changed: false };
      const evaluations = current.map(evaluateConsumableLife);
      const changes = reconcileConsumableObligations({ open: draft.consumableObligations.filter(row => row.status === 'OPEN'),
        evaluations, observedAt: draft.simulationState.simulationTime });
      if (changes.open.length || changes.close.length) draft.consumableObligations = applyConsumableObligationChanges(draft.consumableObligations, changes);
      draft.consumableReconciliation = { inputDigest };
      return { changed: true, opened: changes.open.length, closed: changes.close.length };
    });
  })().finally(() => pending.delete(store));
  pending.set(store, work); return work;
}
