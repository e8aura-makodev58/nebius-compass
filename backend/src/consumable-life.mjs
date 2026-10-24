/** Counter-policy balances only. No imports, clock reads, I/O or lifecycle persistence. */
function requireValue(condition, message) {
  if (!condition) throw new TypeError(`Invalid consumable-life input: ${message}`);
}
function exact(value, keys, label) {
  requireValue(value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `${label} fields`);
}
function identifier(value, label) {
  // Keep obligation delimiters unambiguous; lifecycle IDs may include replacement '#'.
  requireValue(typeof value === 'string' && /^[A-Za-z0-9_#-]{1,120}$/.test(value), label);
}
function count(value, label, { positive = false } = {}) {
  requireValue(Number.isSafeInteger(value) && value >= (positive ? 1 : 0), label);
}
function timestamp(value, label) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), label);
  const ms = Date.parse(value);
  requireValue(Number.isFinite(ms) && new Date(ms).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z')), label);
  return ms;
}
function rejectConflictingTimes(rows, field, label) {
  for (let index = 1; index < rows.length; index++) {
    requireValue(rows[index].at !== rows[index - 1].at || rows[index][field] === rows[index - 1][field], `${label} conflict at same timestamp`);
  }
}

export function evaluateConsumableLife(input) {
  exact(input, ['policy', 'asset', 'readings', 'cleanings'], 'input');
  const { policy, asset, readings, cleanings } = input;
  exact(policy, ['policyId', 'version', 'componentFamily', 'counterUnit', 'cleanEvery', 'lifetimeLimit', 'warnFraction'], 'policy');
  exact(asset, ['assetId', 'lifecycleId', 'policyId', 'installedAt'], 'asset');
  for (const [value, label] of [[policy.policyId, 'policyId'], [policy.componentFamily, 'componentFamily'], [policy.counterUnit, 'counterUnit'], [asset.assetId, 'assetId'], [asset.lifecycleId, 'lifecycleId']]) identifier(value, label);
  requireValue(asset.policyId === policy.policyId, 'asset policy mismatch');
  count(policy.version, 'policy version');
  count(policy.cleanEvery, 'cleanEvery', { positive: true });
  count(policy.lifetimeLimit, 'lifetimeLimit', { positive: true });
  requireValue(Number.isFinite(policy.warnFraction) && policy.warnFraction >= 0 && policy.warnFraction <= 1, 'warnFraction');
  const installed = timestamp(asset.installedAt, 'installedAt');
  requireValue(Array.isArray(readings) && Array.isArray(cleanings), 'reading/cleaning arrays');
  const ordered = readings.map(reading => {
    exact(reading, ['observedAt', 'lifetimeCount', 'unit'], 'reading');
    const at = timestamp(reading.observedAt, 'observedAt');
    requireValue(at >= installed, 'reading precedes lifecycle installation');
    if (reading.lifetimeCount !== null) count(reading.lifetimeCount, 'lifetimeCount');
    identifier(reading.unit, 'reading unit');
    return { at, lifetimeCount: reading.lifetimeCount, unit: reading.unit };
  }).sort((a, b) => a.at - b.at);
  const cleans = cleanings.map(cleaning => {
    exact(cleaning, ['cleanedAt', 'lifetimeCountAtClean'], 'cleaning');
    const at = timestamp(cleaning.cleanedAt, 'cleanedAt');
    requireValue(at >= installed, 'cleaning precedes lifecycle installation');
    count(cleaning.lifetimeCountAtClean, 'lifetimeCountAtClean');
    return { at, lifetimeCountAtClean: cleaning.lifetimeCountAtClean };
  }).sort((a, b) => a.at - b.at);
  rejectConflictingTimes(ordered, 'lifetimeCount', 'readings');
  rejectConflictingTimes(cleans, 'lifetimeCountAtClean', 'cleanings');

  const reasons = new Set();
  let previous = null;
  for (const reading of ordered) {
    if (reading.unit !== policy.counterUnit) reasons.add('UNIT_MISMATCH');
    // Null is not zero; retain the preceding known baseline across unknown readings.
    if (reading.lifetimeCount !== null) {
      if (previous !== null && reading.lifetimeCount < previous) reasons.add('COUNTER_DECREASED');
      previous = reading.lifetimeCount;
    }
  }
  const latest = ordered.at(-1), latestCount = latest?.lifetimeCount ?? null;
  let status, sinceCleanCount = null, remainingCleanCount = null, remainingLifeCount = null;
  if (reasons.size) status = 'RECONCILE';
  else if (!latest) { status = 'NO_DATA'; reasons.add('NO_READINGS'); }
  else if (latestCount === null) { status = 'UNKNOWN'; reasons.add('OPENING_COUNT_UNKNOWN'); }
  else {
    const lastClean = cleans.filter(cleaning => cleaning.at <= latest.at).at(-1);
    const baseline = lastClean?.lifetimeCountAtClean ?? 0;
    requireValue(baseline <= latestCount, 'cleaning counter exceeds latest reading');
    sinceCleanCount = latestCount - baseline;
    remainingCleanCount = policy.cleanEvery - sinceCleanCount;
    remainingLifeCount = policy.lifetimeLimit - latestCount;
    if (remainingLifeCount <= 0) reasons.add('LIFETIME_EXCEEDED');
    else if (latestCount >= policy.warnFraction * policy.lifetimeLimit) reasons.add('LIFETIME_WARNING');
    if (remainingCleanCount <= 0) reasons.add('CLEAN_INTERVAL_EXCEEDED');
    else if (sinceCleanCount >= policy.warnFraction * policy.cleanEvery) reasons.add('CLEAN_INTERVAL_WARNING');
    if (remainingLifeCount <= 0) status = 'REPLACE_DUE';
    else if (remainingCleanCount <= 0) status = 'CLEAN_DUE';
    else if (reasons.size) status = 'WARN';
    else { status = 'OK'; reasons.add('WITHIN_LIMITS'); }
  }
  return { assetId: asset.assetId, lifecycleId: asset.lifecycleId, policyId: policy.policyId, policyVersion: policy.version,
    status, latestCount, sinceCleanCount, remainingCleanCount, remainingLifeCount,
    obligationKey: `${asset.lifecycleId}:${policy.policyId}@${policy.version}:${status}`, reasons: [...reasons].sort() };
}
