/** Public inventory projection from one room snapshot; no writes or clock reads. */
import { assertNoResponderSkill } from './live-schema.mjs';
import { validateLoadboardInventory } from './loadboard-checkout.mjs';

export function buildLoadboards(state, { roomId = null } = {}) {
  const source = state.loadboardInventory === undefined ? { boards: [], reservations: [] } : state.loadboardInventory;
  if (!source || !Array.isArray(source.boards) || !Array.isArray(source.reservations)) throw new TypeError('Invalid loadboard inventory arrays');
  // Select before validation/copying: arbitrary source metadata never enters the response.
  const inventory = {
    boards: source.boards.map(row => ({ boardId: row.boardId, revision: row.revision, condition: row.condition, cellId: row.cellId,
      approvedPrograms: Array.isArray(row.approvedPrograms) ? [...row.approvedPrograms] : row.approvedPrograms })),
    reservations: source.reservations.filter(row => {
      if (!row || !['HELD', 'RELEASED'].includes(row.status)) throw new TypeError('Invalid loadboard reservation status');
      return row.status === 'HELD';
    }).map(row => ({ reservationId: row.reservationId, boardId: row.boardId, cellId: row.cellId,
      programRevision: row.programRevision, status: row.status, heldSince: row.heldSince })),
  };
  validateLoadboardInventory(inventory);
  const held = new Map();
  for (const reservation of inventory.reservations) if (reservation.status === 'HELD') {
    if (held.has(reservation.boardId)) throw new TypeError('Ambiguous held loadboard reservation');
    held.set(reservation.boardId, reservation.reservationId);
  }
  const asOf = state.simulationState.simulationTime;
  if (!Number.isFinite(Date.parse(asOf))) throw new TypeError('Invalid loadboard snapshot time');
  const result = { roomId, asOf, boards: inventory.boards.map(row => ({ boardId: row.boardId, revision: row.revision,
    condition: row.condition, cellId: row.cellId, approvedPrograms: row.approvedPrograms, heldBy: held.get(row.boardId) ?? null })) };
  assertNoResponderSkill(result);
  return result;
}
