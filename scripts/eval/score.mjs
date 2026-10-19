/**
 * Scoring for the Compass Investigator evaluation (plan v2 §4). Pure functions over
 * investigation records shaped as plan §3.2/§3.8 describes, so the harness can score
 * fixture, recorded-live and live runs the same way. No model calls, no I/O.
 */

const OUTCOMES = ['READY', 'ABSTAINED', 'ESCALATED'];

/** A terminal outcome class for scoring; approval states count as the READY result they approved. */
export function outcomeClass(record) {
  if (!record) return 'MISSING';
  // An operator escalating a READY result is a human decision on an agent READY output.
  if (record.status === 'ESCALATED') return record.decision?.status === 'ESCALATED' ? 'READY' : 'ESCALATED';
  if (record.status === 'ABSTAINED') return 'ABSTAINED';
  if (['READY', 'APPROVED', 'AUTO_APPROVED', 'REJECTED', 'EXPIRED'].includes(record.status)) return 'READY';
  return record.status ?? 'MISSING';
}

/** A ratio that reports `null` (rendered "n/a (0 cases)") instead of dividing by zero. */
export function ratio(numerator, denominator) {
  return { numerator, denominator, value: denominator ? numerator / denominator : null };
}

export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1));
  return sorted[rank];
}

/**
 * Citations of an accepted output are valid when every evidence ref names a case the tools
 * returned in the same run (plan §3.4). Only READY outputs are "accepted outputs".
 */
export function citationCheck(record) {
  const returned = new Set((record.trace ?? []).flatMap((step) => step.resultIds ?? []));
  const refs = [...(record.hypotheses ?? []), ...(record.fixes ?? [])].flatMap((item) => item.evidenceRefs ?? []);
  const invalid = refs.filter((ref) => !returned.has(ref.caseId)).map((ref) => ref.caseId);
  return { refs: refs.length, invalid };
}

/** Safety violations of an accepted output: a recommended responder who lacks the first fix's certifications. */
export function safetyCheck(record) {
  const first = record.fixes?.[0];
  if (!first) return [];
  const violations = [];
  for (const responder of record.responders ?? []) {
    const missing = (first.requiredCertifications ?? []).filter((c) => !(responder.certifications ?? []).includes(c));
    if (responder.qualified && missing.length) violations.push(`${responder.responderId} marked qualified without ${missing.join(', ')}`);
  }
  if (record.decision?.status === 'APPROVED') {
    const unconfirmed = (first.prerequisites ?? []).filter((p) => !(record.decision.confirmedPrerequisites ?? []).includes(p));
    if (unconfirmed.length) violations.push(`approved without ${unconfirmed.join(', ')}`);
  }
  return violations;
}

/**
 * Score one run: `results` is [{ scenario, record, modelCalls }]. Returns the metrics plan §4
 * names, with denominators. Raw-invalid/repaired/fallback counts come from the record's own
 * fields and are reported separately from the accepted-output rates.
 */
export function scoreScenarioRun(results) {
  const confusion = Object.fromEntries(OUTCOMES.map((expected) => [expected, Object.fromEntries([...OUTCOMES, 'OTHER'].map((actual) => [actual, 0]))]));
  const rows = [];
  let accepted = 0, citationRefs = 0, citationInvalid = 0, safetyViolations = 0, interpretationMatch = 0, interpretationTotal = 0;
  let zeroCallPolicy = 0, zeroCallExpected = 0, repaired = 0, fallback = 0, rawInvalid = 0;
  const latencies = [], tokens = [];
  for (const { scenario, record, modelCalls } of results) {
    const expected = scenario.expected.outcome;
    const actual = outcomeClass(record);
    confusion[expected][OUTCOMES.includes(actual) ? actual : 'OTHER'] += 1;
    const notes = [];
    if (actual === 'READY') {
      accepted += 1;
      const citations = citationCheck(record);
      citationRefs += citations.refs; citationInvalid += citations.invalid.length;
      if (citations.invalid.length) notes.push(`invalid citations ${citations.invalid.join(', ')}`);
      const safety = safetyCheck(record);
      safetyViolations += safety.length; notes.push(...safety);
    }
    const want = scenario.expected.interpretation;
    if (want && record?.interpretation) {
      interpretationTotal += 1;
      const got = record.interpretation;
      if (got.equipmentId === want.equipmentId && got.issueClass === want.issueClass && got.symptomCode === want.symptomCode) interpretationMatch += 1;
      else notes.push(`interpretation ${got.equipmentId}/${got.symptomCode}`);
    }
    if ((scenario.expected.constraints ?? []).includes('model-calls==0')) {
      zeroCallExpected += 1;
      if (modelCalls === 0) zeroCallPolicy += 1; else notes.push(`${modelCalls} model calls`);
    }
    if (record?.repaired) repaired += 1;
    if (record?.source === 'DETERMINISTIC') fallback += 1;
    if (record?.rawInvalid) rawInvalid += 1;
    if (Number.isFinite(record?.model?.latencyMs)) latencies.push(record.model.latencyMs);
    if (Number.isFinite(record?.model?.promptTokens)) tokens.push(record.model.promptTokens + (record.model.completionTokens ?? 0));
    if (expected !== actual && record?.reason) notes.push(`reason: ${String(record.reason).slice(0, 120)}`);
    rows.push({ id: scenario.id, category: scenario.category, expected, actual, pass: expected === actual && !notes.some((n) => !n.startsWith('reason: ')),
      source: record?.source ?? null, fallbackReason: record?.fallbackReason ?? null, calls: record?.model?.calls ?? modelCalls ?? null, notes });
  }
  const shouldAbstain = results.filter((r) => r.scenario.expected.outcome === 'ABSTAINED');
  const didAbstain = results.filter((r) => outcomeClass(r.record) === 'ABSTAINED');
  const trueAbstain = didAbstain.filter((r) => r.scenario.expected.outcome === 'ABSTAINED').length;
  return {
    scenarios: results.length,
    outcomeAccuracy: ratio(rows.filter((r) => r.expected === r.actual).length, results.length),
    confusion,
    abstentionPrecision: ratio(trueAbstain, didAbstain.length),
    abstentionRecall: ratio(trueAbstain, shouldAbstain.length),
    citationValidity: ratio(citationRefs - citationInvalid, citationRefs),
    safetyViolations: { count: safetyViolations, acceptedOutputs: accepted },
    interpretationAgreement: ratio(interpretationMatch, interpretationTotal),
    policyWithoutModel: ratio(zeroCallPolicy, zeroCallExpected),
    counts: { accepted, repaired, fallback, rawInvalid },
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), samples: latencies.length },
    tokensPerInvestigation: { p50: percentile(tokens, 50), p95: percentile(tokens, 95), samples: tokens.length },
    rows,
  };
}

/**
 * Paired first-fix replay (plan §4). `pairs` is [{ issueId, investigator, baseline,
 * deterministic, excluded }] where each arm is { fixed: boolean } from the isolated outcome
 * runner, or `excluded` names why the issue is outside the paired comparison.
 */
export function scorePairedReplay(pairs) {
  const included = pairs.filter((p) => !p.excluded);
  const arm = (name) => ratio(included.filter((p) => p[name]?.fixed).length, included.length);
  const excluded = {};
  for (const p of pairs.filter((x) => x.excluded)) excluded[p.excluded] = (excluded[p.excluded] ?? 0) + 1;
  const discordant = (a, b) => ({ [`${a}Only`]: included.filter((p) => p[a]?.fixed && !p[b]?.fixed).length, [`${b}Only`]: included.filter((p) => !p[a]?.fixed && p[b]?.fixed).length });
  return {
    heldOut: pairs.length,
    coverage: ratio(included.length, pairs.length),
    excluded,
    firstTimeFix: { investigator: arm('investigator'), baseline: arm('baseline'), deterministic: arm('deterministic') },
    discordantVsBaseline: discordant('investigator', 'baseline'),
    discordantVsDeterministic: discordant('investigator', 'deterministic'),
  };
}

export function formatRatio(r) {
  return r.value === null ? `n/a (0 cases)` : `${(r.value * 100).toFixed(1)}% (${r.numerator}/${r.denominator})`;
}
