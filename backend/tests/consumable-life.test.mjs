import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateConsumableLife } from '../src/consumable-life.mjs';

const installedAt = '2026-08-01T00:00:00.000Z';
const at = day => `2026-08-${String(day).padStart(2, '0')}T06:00:00.000Z`;
const reading = (lifetimeCount, day = 10, unit = 'ACTUATIONS') => ({ observedAt: at(day), lifetimeCount, unit });
const clean = (lifetimeCountAtClean, day = 10) => ({ cleanedAt: at(day), lifetimeCountAtClean });
function fixture() {
  return { policy: { policyId: 'CARE-POLICY-A', version: 3, componentFamily: 'FT_SOCKET', counterUnit: 'ACTUATIONS', cleanEvery: 50_000, lifetimeLimit: 2_000_000, warnFraction: .9 },
    asset: { assetId: 'SOCKET-A', lifecycleId: 'SOCKET-A#1', policyId: 'CARE-POLICY-A', installedAt }, readings: [reading(20_000)], cleanings: [] };
}

test('consumable under-threshold counts produce exact policy balances and a stable obligation', () => {
  const result = evaluateConsumableLife(fixture());
  assert.deepEqual(result, { assetId: 'SOCKET-A', lifecycleId: 'SOCKET-A#1', policyId: 'CARE-POLICY-A', policyVersion: 3, status: 'OK',
    latestCount: 20_000, sinceCleanCount: 20_000, remainingCleanCount: 30_000, remainingLifeCount: 1_980_000,
    obligationKey: 'SOCKET-A#1:CARE-POLICY-A@3:OK', reasons: ['WITHIN_LIMITS'] });
});

test('cleaning resets only the since-clean balance and preserves lifetime counts, including equality and overdue', () => {
  const input = fixture();
  input.readings = [reading(120_000)]; input.cleanings = [clean(60_000, 9)];
  const due = evaluateConsumableLife(input);
  assert.equal(due.status, 'CLEAN_DUE'); assert.equal(due.sinceCleanCount, 60_000); assert.equal(due.remainingCleanCount, -10_000);
  input.cleanings.push(clean(120_000));
  const cleaned = evaluateConsumableLife(input);
  assert.equal(cleaned.status, 'OK'); assert.equal(cleaned.sinceCleanCount, 0); assert.equal(cleaned.remainingCleanCount, 50_000);
  assert.equal(cleaned.latestCount, due.latestCount); assert.equal(cleaned.remainingLifeCount, due.remainingLifeCount);
  input.readings = [reading(170_000, 11)];
  const boundary = evaluateConsumableLife(input);
  assert.equal(boundary.status, 'CLEAN_DUE'); assert.equal(boundary.remainingCleanCount, 0);
});

test('lifetime replacement wins over cleaning and warning even when freshly cleaned', () => {
  for (const count of [2_000_000, 2_000_001]) {
    const input = fixture(); input.readings = [reading(count)];
    assert.equal(evaluateConsumableLife(input).status, 'REPLACE_DUE');
    input.cleanings = [clean(count)];
    const result = evaluateConsumableLife(input);
    assert.equal(result.status, 'REPLACE_DUE'); assert.equal(result.sinceCleanCount, 0);
    assert.equal(result.remainingLifeCount, 2_000_000 - count); assert.deepEqual(result.reasons, ['LIFETIME_EXCEEDED']);
  }
});

test('warning thresholds include exact clean and lifetime boundaries and do not warn just below', () => {
  for (const [count, status] of [[44_999, 'OK'], [45_000, 'WARN'], [49_999, 'WARN'], [50_000, 'CLEAN_DUE']]) {
    const input = fixture(); input.readings = [reading(count)]; assert.equal(evaluateConsumableLife(input).status, status);
  }
  for (const [count, status] of [[1_799_999, 'OK'], [1_800_000, 'WARN']]) {
    const input = fixture(); input.readings = [reading(count)]; input.cleanings = [clean(count)];
    assert.equal(evaluateConsumableLife(input).status, status);
  }
});

test('mismatched units require reconciliation and never convert or release uncertain balances', () => {
  const input = fixture(); input.readings = [reading(1, 9, 'CYCLES'), reading(20_000)];
  const result = evaluateConsumableLife(input);
  assert.equal(result.status, 'RECONCILE'); assert.deepEqual(result.reasons, ['UNIT_MISMATCH']);
  assert.equal(result.latestCount, 20_000);
  assert.equal(result.sinceCleanCount, null); assert.equal(result.remainingCleanCount, null); assert.equal(result.remainingLifeCount, null);
});

test('counter decreases require reconciliation in timestamp order, including across unknown readings', () => {
  for (const rows of [[reading(100_000, 8), reading(100, 10)], [reading(100_000, 8), reading(null, 9), reading(100, 10)]]) {
    const input = fixture(); input.readings = rows.reverse();
    const result = evaluateConsumableLife(input);
    assert.equal(result.status, 'RECONCILE'); assert.equal(result.latestCount, 100); assert.ok(result.reasons.includes('COUNTER_DECREASED'));
  }
});

test('unknown lifetime stays null and blocks OK; no readings produce NO_DATA rather than zero', () => {
  const input = fixture(); input.readings = [reading(null)]; input.cleanings = [clean(0)];
  const unknown = evaluateConsumableLife(input);
  assert.equal(unknown.status, 'UNKNOWN'); assert.deepEqual(unknown.reasons, ['OPENING_COUNT_UNKNOWN']);
  for (const key of ['latestCount', 'sinceCleanCount', 'remainingCleanCount', 'remainingLifeCount']) assert.equal(unknown[key], null);
  input.readings = [];
  const missing = evaluateConsumableLife(input);
  assert.equal(missing.status, 'NO_DATA'); assert.deepEqual(missing.reasons, ['NO_READINGS']);
  assert.equal(missing.latestCount, null); assert.equal(missing.remainingLifeCount, null);
  input.readings = [reading(0)];
  const zero = evaluateConsumableLife(input); assert.equal(zero.status, 'OK'); assert.equal(zero.latestCount, 0);
});

test('status precedence is deterministic and reasons are sorted when conditions overlap', () => {
  const input = fixture(); input.readings = [reading(2_000_001, 8, 'CYCLES'), reading(100, 9), reading(null, 10)];
  const result = evaluateConsumableLife(input);
  assert.equal(result.status, 'RECONCILE'); assert.deepEqual(result.reasons, ['COUNTER_DECREASED', 'UNIT_MISMATCH']);
  input.readings = [reading(2_000_001, 8), reading(null, 10)];
  assert.equal(evaluateConsumableLife(input).status, 'UNKNOWN');
  input.readings = [reading(2_000_001)];
  const exhausted = evaluateConsumableLife(input);
  assert.equal(exhausted.status, 'REPLACE_DUE'); assert.deepEqual(exhausted.reasons, ['CLEAN_INTERVAL_EXCEEDED', 'LIFETIME_EXCEEDED']);
});

test('out-of-order readings and cleanings are evaluated without mutation; later cleaning cannot reset an earlier reading', () => {
  const input = fixture(); input.readings = [reading(120_000, 10), reading(10_000, 8), reading(60_000, 9)];
  input.cleanings = [clean(120_000, 12), clean(10_000, 8), clean(60_000, 9)];
  const before = structuredClone(input), result = evaluateConsumableLife(input);
  assert.equal(result.status, 'CLEAN_DUE'); assert.equal(result.latestCount, 120_000); assert.equal(result.sinceCleanCount, 60_000);
  assert.deepEqual(input, before);
  assert.deepEqual(evaluateConsumableLife({ ...input, readings: [...input.readings].reverse(), cleanings: [...input.cleanings].reverse() }), result);
});

test('evaluations are clock-free and deterministic; obligations distinguish policy revisions and statuses', () => {
  const input = fixture(), before = structuredClone(input), expected = evaluateConsumableLife(input), original = Date.now;
  try { Date.now = () => { throw Error('clock forbidden'); }; assert.deepEqual(evaluateConsumableLife(input), expected); }
  finally { Date.now = original; }
  assert.deepEqual(input, before);
  input.policy.version++;
  assert.notEqual(evaluateConsumableLife(input).obligationKey, expected.obligationKey);
  input.readings = [reading(50_000)];
  assert.match(evaluateConsumableLife(input).obligationKey, /:CLEAN_DUE$/);
});

test('replacement lifecycle is evaluated independently and supports contactors without sharing prior lifetime', () => {
  const old = fixture(); old.readings = [reading(2_000_100)];
  const exhausted = evaluateConsumableLife(old);
  const replacement = fixture(); replacement.asset.lifecycleId = 'SOCKET-A#2'; replacement.readings = [reading(100)];
  const fresh = evaluateConsumableLife(replacement);
  assert.equal(exhausted.status, 'REPLACE_DUE'); assert.equal(fresh.status, 'OK'); assert.equal(fresh.remainingLifeCount, 1_999_900);
  assert.notEqual(fresh.obligationKey, exhausted.obligationKey); assert.deepEqual(evaluateConsumableLife(old), exhausted);
  replacement.policy.componentFamily = 'FT_CONTACTOR'; replacement.asset.assetId = 'CONTACTOR-A'; replacement.asset.lifecycleId = 'CONTACTOR-A#1';
  assert.equal(evaluateConsumableLife(replacement).status, 'OK');
});

test('consumable module imports no runtime or truth modules and rejects hidden fields instead of projecting them', () => {
  const source = readFileSync(new URL('../src/consumable-life.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\b|\bimport\s*\(|\brequire\s*\(|Date\.now\s*\(|\bfetch\s*\(/m);
  for (const target of ['root', 'policy', 'asset', 'reading', 'cleaning']) {
    const input = fixture(); input.cleanings = [clean(0)];
    const row = target === 'root' ? input : target === 'reading' ? input.readings[0] : target === 'cleaning' ? input.cleanings[0] : input[target];
    row.ResponderSkill = { trueSuccessProbability: .9, hiddenCanary: 'never-public' };
    assert.throws(() => evaluateConsumableLife(input), TypeError);
  }
  assert.doesNotMatch(JSON.stringify(evaluateConsumableLife(fixture())), /ResponderSkill|responderSkills|trueSuccessProbability|trueMedianMinutes|never-public/);
});

test('malformed or ambiguous policy/counter facts fail explicitly instead of producing OK', () => {
  for (const change of [
    input => { input.policy.cleanEvery = 0; }, input => { input.policy.warnFraction = NaN; },
    input => { input.policy.warnFraction = 1.1; }, input => { input.policy.lifetimeLimit = Infinity; },
    input => { input.asset.policyId = 'OTHER'; }, input => { input.asset.lifecycleId = 'SOCKET-A:OTHER'; },
    input => { input.readings[0].lifetimeCount = -1; }, input => { input.readings[0].lifetimeCount = 1.5; },
    input => { delete input.readings[0].lifetimeCount; }, input => { input.readings[0].observedAt = '2026-02-30T00:00:00Z'; },
    input => { input.asset.installedAt = at(11); }, input => { input.cleanings = [clean(30_000)]; },
    input => { input.readings.push(reading(30_000)); }, input => { input.cleanings = [clean(0), clean(1)]; },
  ]) {
    const input = fixture(); change(input); assert.throws(() => evaluateConsumableLife(input), TypeError);
  }
});
