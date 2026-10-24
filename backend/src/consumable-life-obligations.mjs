/** Pure obligations over public counter evaluations; no clock, models or persistence. */
const kinds = { CLEAN_DUE: 'CLEANING', REPLACE_DUE: 'REPLACEMENT', RECONCILE: 'RECONCILIATION', UNKNOWN: 'RECONCILIATION' };
const statuses = ['OK', 'WARN', 'NO_DATA', ...Object.keys(kinds)];
const closeReasons = ['CLEANED', 'REPLACED', 'SUPERSEDED', 'RESOLVED_BY_READING'];
const rowFields = ['obligationId', 'obligationKey', 'assetId', 'lifecycleId', 'policyId', 'policyVersion', 'kind', 'status', 'openedAt', 'closedAt', 'closeReason', 'supersededBy'];
const evaluationFields = ['assetId', 'lifecycleId', 'policyId', 'policyVersion', 'status', 'latestCount', 'sinceCleanCount', 'remainingCleanCount', 'remainingLifeCount', 'obligationKey', 'reasons'];
const fail = message => { throw new TypeError(`Invalid consumable obligation: ${message}`); };
const check = (condition, message) => { if (!condition) fail(message); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function exact(value, keys) {
  check(value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'fields');
}
function id(value) { check(typeof value === 'string' && /^[A-Za-z0-9_#-]{1,120}$/.test(value), 'identity'); }
function text(value) { check(typeof value === 'string' && value.length > 0 && value.length <= 600, 'identifier'); }
function timestamp(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), 'UTC timestamp');
  const ms = Date.parse(value);
  check(Number.isFinite(ms) && new Date(ms).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')), 'UTC timestamp');
  return ms;
}
function identity(row) {
  for (const key of ['assetId', 'lifecycleId', 'policyId']) id(row[key]);
  check(Number.isSafeInteger(row.policyVersion) && row.policyVersion >= 0, 'policy version');
}
const logicalKey = row => JSON.stringify([row.lifecycleId, row.kind]);
const samePolicy = (a, b) => a.policyId === b.policyId && a.policyVersion === b.policyVersion;
function obligationId(row, kind) {
  // Length-prefixed identity segments avoid delimiter collisions without UUIDs or time.
  return `OBL-${row.lifecycleId.length}-${row.lifecycleId}-${row.policyId.length}-${row.policyId}-${row.policyVersion}-${kind}`;
}

export function validateConsumableObligationRows(rows, previous = []) {
  check(Array.isArray(rows), 'rows array');
  const ids = new Map(), active = new Set(), owners = new Map();
  for (const row of rows) {
    exact(row, rowFields); identity(row); text(row.obligationId); text(row.obligationKey);
    check(!ids.has(row.obligationId), 'duplicate obligationId'); ids.set(row.obligationId, row);
    check(Object.values(kinds).includes(row.kind) && ['OPEN', 'CLOSED'].includes(row.status), 'kind/status');
    check(Object.entries(kinds).some(([status, kind]) => kind === row.kind && row.obligationKey === `${row.lifecycleId}:${row.policyId}@${row.policyVersion}:${status}`), 'obligationKey');
    const opened = timestamp(row.openedAt);
    if (row.status === 'OPEN') {
      check(row.closedAt === null && row.closeReason === null && row.supersededBy === null, 'open terminal fields');
      check(!active.has(logicalKey(row)), 'duplicate open lifecycle/kind'); active.add(logicalKey(row));
    } else {
      check(timestamp(row.closedAt) >= opened && closeReasons.includes(row.closeReason), 'closed fields');
      check(row.closeReason !== 'CLEANED' || row.kind === 'CLEANING', 'cleaning close kind');
      check(row.supersededBy === null || row.closeReason === 'SUPERSEDED', 'supersession reason');
      if (row.supersededBy !== null) text(row.supersededBy);
    }
    check(!owners.has(row.lifecycleId) || owners.get(row.lifecycleId) === row.assetId, 'lifecycle owner'); owners.set(row.lifecycleId, row.assetId);
  }
  for (const row of rows) if (row.supersededBy !== null) {
    const target = ids.get(row.supersededBy);
    check(target && target !== row && target.assetId === row.assetId && target.lifecycleId === row.lifecycleId, 'supersession target');
  }
  for (const old of previous) {
    const next = ids.get(old.obligationId);
    const immutable = old.status === 'CLOSED' ? rowFields : rowFields.filter(key => !['status', 'closedAt', 'closeReason', 'supersededBy'].includes(key));
    check(next && immutable.every(key => next[key] === old[key]), 'obligation history is immutable');
  }
  // Reject cycles without recursion or quadratic scans over long episode histories.
  const complete = new Set();
  for (const row of rows) {
    const path = new Set(); let next = row;
    while (next && !complete.has(next.obligationId)) {
      check(!path.has(next.obligationId), 'supersession cycle'); path.add(next.obligationId);
      next = ids.get(next.supersededBy);
    }
    for (const key of path) complete.add(key);
  }
  return rows;
}

export function reconcileConsumableObligations({ open, evaluations, observedAt }) {
  timestamp(observedAt); validateConsumableObligationRows(open);
  check(open.every(row => row.status === 'OPEN') && Array.isArray(evaluations), 'open/evaluations');
  const current = new Map(), owners = new Map(open.map(row => [row.lifecycleId, row.assetId]));
  for (const evaluation of evaluations) {
    exact(evaluation, evaluationFields); identity(evaluation);
    check(statuses.includes(evaluation.status), 'evaluation status');
    check(evaluation.obligationKey === `${evaluation.lifecycleId}:${evaluation.policyId}@${evaluation.policyVersion}:${evaluation.status}`, 'evaluation key');
    check(Array.isArray(evaluation.reasons) && evaluation.reasons.every(reason => typeof reason === 'string' && /^[A-Z_]+$/.test(reason)), 'reasons');
    for (const key of ['latestCount', 'sinceCleanCount', 'remainingCleanCount', 'remainingLifeCount']) {
      check(evaluation[key] === null || Number.isSafeInteger(evaluation[key]), 'counter');
    }
    check(evaluation.latestCount === null || evaluation.latestCount >= 0, 'latest count');
    check(evaluation.sinceCleanCount === null || evaluation.sinceCleanCount >= 0, 'since-clean count');
    const uncertain = ['UNKNOWN', 'RECONCILE', 'NO_DATA'].includes(evaluation.status);
    check(uncertain || ['latestCount', 'sinceCleanCount', 'remainingCleanCount', 'remainingLifeCount'].every(key => evaluation[key] !== null), 'known evaluation counters');
    if (!uncertain) {
      check(evaluation.sinceCleanCount <= evaluation.latestCount, 'cleaning baseline');
      check(evaluation.status === 'REPLACE_DUE' ? evaluation.remainingLifeCount <= 0
        : evaluation.status === 'CLEAN_DUE' ? evaluation.remainingLifeCount > 0 && evaluation.remainingCleanCount <= 0
        : evaluation.remainingLifeCount > 0 && evaluation.remainingCleanCount > 0, 'evaluation balances/status');
    }
    check(!owners.has(evaluation.lifecycleId) || owners.get(evaluation.lifecycleId) === evaluation.assetId, 'lifecycle owner'); owners.set(evaluation.lifecycleId, evaluation.assetId);
    check(!current.has(evaluation.assetId), 'ambiguous current asset lifecycle/policy');
    current.set(evaluation.assetId, evaluation);
  }
  const result = { open: [], close: [], keep: [] }, required = new Map();
  for (const evaluation of [...current.values()].sort((a, b) => compare(a.assetId, b.assetId))) {
    const kind = kinds[evaluation.status];
    if (!kind) continue;
    const existing = open.find(row => row.assetId === evaluation.assetId && row.lifecycleId === evaluation.lifecycleId && row.kind === kind && samePolicy(row, evaluation));
    const row = existing ?? { obligationId: obligationId(evaluation, kind), obligationKey: evaluation.obligationKey,
      assetId: evaluation.assetId, lifecycleId: evaluation.lifecycleId, policyId: evaluation.policyId, policyVersion: evaluation.policyVersion,
      kind, status: 'OPEN', openedAt: observedAt, closedAt: null, closeReason: null, supersededBy: null };
    required.set(evaluation.assetId, row);
    if (!existing) result.open.push(row);
  }
  for (const row of open) {
    const evaluation = current.get(row.assetId), target = required.get(row.assetId);
    let reason = null;
    if (!evaluation) { result.keep.push(row.obligationId); continue; }
    if (evaluation.lifecycleId !== row.lifecycleId) reason = 'REPLACED';
    else if (target?.obligationId === row.obligationId) { result.keep.push(row.obligationId); continue; }
    else if (['UNKNOWN', 'RECONCILE', 'NO_DATA'].includes(evaluation.status)) {
      // A policy supersession may transfer the same required work, never discharge it.
      if (target?.kind === row.kind && !samePolicy(row, evaluation)) reason = 'SUPERSEDED';
      else { result.keep.push(row.obligationId); continue; }
    }
    else if (!samePolicy(row, evaluation) || (target && target.kind !== row.kind)) reason = 'SUPERSEDED';
    else if (row.kind === 'CLEANING' && evaluation.sinceCleanCount !== null && evaluation.latestCount !== null && evaluation.sinceCleanCount < evaluation.latestCount) reason = 'CLEANED';
    else reason = 'RESOLVED_BY_READING';
    result.close.push({ obligationId: row.obligationId, reason, observedAt, supersededBy: reason === 'SUPERSEDED' ? target?.obligationId ?? null : null });
  }
  result.open.sort((a, b) => compare(a.obligationId, b.obligationId));
  result.close.sort((a, b) => compare(a.obligationId, b.obligationId)); result.keep.sort(compare);
  return result;
}

/** Append episode history; recurring cleaning can reuse its semantic key, never its row ID. */
export function applyConsumableObligationChanges(rows, changes) {
  validateConsumableObligationRows(rows);
  exact(changes, ['open', 'close', 'keep']);
  check(Array.isArray(changes.open) && Array.isArray(changes.close) && Array.isArray(changes.keep), 'change arrays');
  validateConsumableObligationRows(changes.open); check(changes.open.every(row => row.status === 'OPEN'), 'new open rows');
  const active = new Set(rows.filter(row => row.status === 'OPEN').map(row => row.obligationId)), seen = new Set();
  for (const change of changes.close) {
    exact(change, ['obligationId', 'reason', 'observedAt', 'supersededBy']);
    check(active.has(change.obligationId) && !seen.has(change.obligationId), 'invalid closure'); seen.add(change.obligationId);
  }
  for (const id of changes.keep) { check(active.has(id) && !seen.has(id), 'invalid keep'); seen.add(id); }
  check(seen.size === active.size, 'unaccounted open rows');
  const ids = new Set(rows.map(row => row.obligationId)), remap = new Map();
  const additions = changes.open.map(row => {
    let candidate = row.obligationId, generation = 1;
    while (ids.has(candidate)) candidate = `${row.obligationId}~${++generation}`;
    ids.add(candidate); remap.set(row.obligationId, candidate);
    return { ...row, obligationId: candidate };
  });
  const closures = new Map(changes.close.map(change => [change.obligationId, change]));
  const result = rows.map(row => {
    const change = closures.get(row.obligationId);
    return change ? { ...row, status: 'CLOSED', closedAt: change.observedAt, closeReason: change.reason,
      supersededBy: remap.get(change.supersededBy) ?? change.supersededBy } : { ...row };
  });
  result.push(...additions); validateConsumableObligationRows(result, rows);
  return result;
}
