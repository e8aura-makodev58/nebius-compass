/** Host-owned loadboard commands, serialized by the normal room store adapter. */
import { checkoutBoard, releaseBoard } from './loadboard-checkout.mjs';
import { cloneDraftValue } from './live-draft.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';

const invalid = () => Object.assign(new Error('Invalid loadboard request'), { code: 'INVALID_LOADBOARD_REQUEST', statusCode: 400 });
function validateBody(input, keys) {
  if (!input || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
    || Reflect.ownKeys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) throw invalid();
  for (const value of Object.values(input)) {
    if (typeof value !== 'string' || !value.length || value.length > 120 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) throw invalid();
  }
  if (input.requestId?.length > 116) throw invalid();
  try { assertNoResponderSkill(input); } catch { throw invalid(); }
}
function publicResult(result) {
  const row = result.reservation;
  const value = { decision: result.decision, reasons: [...result.reasons], reservation: row ? {
    reservationId: row.reservationId, boardId: row.boardId, cellId: row.cellId, programRevision: row.programRevision,
    status: row.status, heldSince: row.heldSince, ...(row.releasedAt === undefined ? {} : { releasedAt: row.releasedAt }),
  } : null };
  assertNoResponderSkill(value); return value;
}

export function createLoadboardService(store) {
  async function perform(kind, input) {
    const checkout = kind === 'checkout';
    validateBody(input, checkout ? ['requestId', 'boardId', 'cellId', 'programRevision'] : ['reservationId', 'cellId']);
    const request = { ...input };
    try {
      const transaction = await store.mutate(`loadboard-${kind}`, state => {
        // Native structuredClone in the pure domain module cannot accept COW proxies.
        const inventory = state.loadboardInventory === undefined ? { boards: [], reservations: [] } : cloneDraftValue(state.loadboardInventory);
        const at = state.simulationState.simulationTime;
        const result = checkout ? checkoutBoard(inventory, { ...request, requestedAt: at }) : releaseBoard(inventory, { ...request, releasedAt: at });
        const response = publicResult(result);
        if (result.decision === 'ALLOCATED' || result.decision === 'RELEASED') {
          // Keep journal patches bounded as released-reservation history grows.
          const target = state.loadboardInventory, row = result.reservation;
          target.boards.find(board => board.boardId === row.boardId).cellId = result.decision === 'ALLOCATED' ? row.cellId : null;
          if (result.decision === 'ALLOCATED') target.reservations.push(row);
          else {
            const held = target.reservations.find(reservation => reservation.reservationId === row.reservationId);
            held.status = row.status; held.releasedAt = row.releasedAt;
          }
        }
        return response;
      });
      return transaction.result;
    } catch (error) {
      // A consumed request identity is not a new checkout, even after release or restart.
      if (error.code === 'REQUEST_ID_ALREADY_USED') throw invalid();
      throw error;
    }
  }
  return { checkout: input => perform('checkout', input), release: input => perform('release', input) };
}
