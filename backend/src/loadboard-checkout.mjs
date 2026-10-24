/** Pure inventory transitions. The caller supplies timestamps and serialized request order. */
function requireValue(condition, message, code) {
  if (!condition) {
    const error = new TypeError(`Invalid loadboard-checkout input: ${message}`);
    if (code) error.code = code;
    throw error;
  }
}
function fields(value, required, optional = []) {
  requireValue(value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && required.every(key => Object.hasOwn(value, key))
    && Reflect.ownKeys(value).every(key => required.includes(key) || optional.includes(key)), 'object fields');
}
function text(value) {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 120 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value), 'nonempty bounded identifier');
}
function timestamp(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), 'UTC timestamp');
  const ms = Date.parse(value);
  requireValue(Number.isFinite(ms) && new Date(ms).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')), 'UTC timestamp');
  return ms;
}
function unique(rows, key) {
  requireValue(new Set(rows.map(row => row[key])).size === rows.length, `duplicate ${key}`);
}
export function validateLoadboardInventory(inventory) {
  fields(inventory, ['boards', 'reservations']);
  requireValue(Array.isArray(inventory.boards) && Array.isArray(inventory.reservations), 'inventory arrays');
  for (const board of inventory.boards) {
    fields(board, ['boardId', 'revision', 'condition', 'cellId', 'approvedPrograms']);
    text(board.boardId); text(board.revision);
    requireValue(['SERVICEABLE', 'UNDER_REPAIR', 'QUARANTINED'].includes(board.condition), 'board condition');
    if (board.cellId !== null) text(board.cellId);
    requireValue(Array.isArray(board.approvedPrograms), 'approvedPrograms');
    for (const program of board.approvedPrograms) text(program);
  }
  for (const reservation of inventory.reservations) {
    fields(reservation, ['reservationId', 'boardId', 'cellId', 'programRevision', 'status', 'heldSince'], ['releasedAt']);
    for (const key of ['reservationId', 'boardId', 'cellId', 'programRevision']) text(reservation[key]);
    requireValue(['HELD', 'RELEASED'].includes(reservation.status), 'reservation status');
    const held = timestamp(reservation.heldSince);
    if (Object.hasOwn(reservation, 'releasedAt')) {
      requireValue(reservation.status === 'RELEASED' && timestamp(reservation.releasedAt) >= held, 'release time/status');
    }
  }
  unique(inventory.boards, 'boardId'); unique(inventory.reservations, 'reservationId');
}
function validateRequest(request) {
  fields(request, ['requestId', 'boardId', 'cellId', 'programRevision', 'requestedAt']);
  for (const key of ['requestId', 'boardId', 'cellId', 'programRevision']) text(request[key]);
  // Prefixing is injective; reject too-long IDs rather than truncating identities.
  requireValue(request.requestId.length <= 116, 'requestId length');
  return timestamp(request.requestedAt);
}
function checkout(inventory, request, copyInventory = true) {
  const board = inventory.boards.find(row => row.boardId === request.boardId);
  const held = inventory.reservations.filter(row => row.status === 'HELD');
  const reasons = [];
  if (!board) reasons.push('BOARD_UNKNOWN');
  else {
    if (board.condition !== 'SERVICEABLE') reasons.push('CONDITION_BLOCKED');
    if (board.cellId !== null) reasons.push('BOARD_NOT_IN_STORE');
    if (!board.approvedPrograms.includes(request.programRevision)) reasons.push('PROGRAM_NOT_APPROVED');
  }
  if (held.some(row => row.boardId === request.boardId)) reasons.push('BOARD_HELD');
  if (held.some(row => row.cellId === request.cellId)) reasons.push('CELL_ALREADY_HOLDING');
  const next = copyInventory ? structuredClone(inventory) : inventory;
  if (reasons.length) return { decision: 'REJECTED', reasons: reasons.sort(), inventory: next, reservation: null };
  const reservationId = `RES-${request.requestId}`;
  requireValue(!inventory.reservations.some(row => row.reservationId === reservationId), 'requestId already used', 'REQUEST_ID_ALREADY_USED');
  const reservation = { reservationId, boardId: request.boardId, cellId: request.cellId, programRevision: request.programRevision, status: 'HELD', heldSince: request.requestedAt };
  next.boards.find(row => row.boardId === request.boardId).cellId = request.cellId;
  next.reservations.push(reservation);
  return { decision: 'ALLOCATED', reasons: [], inventory: next, reservation };
}

export function checkoutBoard(inventory, request) {
  validateLoadboardInventory(inventory); validateRequest(request);
  return checkout(inventory, request);
}

export function checkoutBatch(inventory, requests) {
  validateLoadboardInventory(inventory);
  requireValue(Array.isArray(requests), 'requests array');
  const ordered = Array.from(requests, request => ({ request, at: validateRequest(request) }));
  unique(requests, 'requestId');
  ordered.sort((a, b) => a.at - b.at || (a.request.requestId < b.request.requestId ? -1 : a.request.requestId > b.request.requestId ? 1 : 0));
  const next = structuredClone(inventory);
  const decisions = ordered.map(({ request }) => {
    // Mutate only this batch's private copy; do not retain one history copy per request.
    const result = checkout(next, request, false);
    return { requestId: request.requestId, decision: result.decision, reasons: result.reasons, reservation: result.reservation };
  });
  return { inventory: next, decisions };
}

export function releaseBoard(inventory, request) {
  validateLoadboardInventory(inventory);
  fields(request, ['reservationId', 'releasedAt', 'cellId']);
  text(request.reservationId); text(request.cellId);
  const released = timestamp(request.releasedAt);
  const index = inventory.reservations.findIndex(row => row.reservationId === request.reservationId && row.status === 'HELD' && row.cellId === request.cellId);
  const next = structuredClone(inventory);
  if (index === -1) return { decision: 'REJECTED', reasons: ['NO_HELD_RESERVATION'], inventory: next, reservation: null };
  const reservation = next.reservations[index];
  requireValue(released >= timestamp(reservation.heldSince), 'release precedes checkout');
  const board = next.boards.find(row => row.boardId === reservation.boardId);
  requireValue(board, 'held reservation board is absent');
  reservation.status = 'RELEASED'; reservation.releasedAt = request.releasedAt;
  board.cellId = null;
  return { decision: 'RELEASED', reasons: [], inventory: next, reservation };
}
