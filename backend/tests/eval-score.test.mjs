import assert from 'node:assert/strict';
import test from 'node:test';
import { citationCheck, formatRatio, outcomeClass, percentile, ratio, safetyCheck, scorePairedReplay, scoreScenarioRun } from '../../scripts/eval/score.mjs';

// Main-agent owned (plan v2 §5, N5): scoring for scripts/eval-investigator.mjs.
const scenario = (id, outcome, extra = {}) => ({ id, category: 'test', expected: { outcome, ...extra } });
const ready = (extra = {}) => ({ status: 'READY', trace: [{ tool: 'search_cases', resultIds: ['CASE-1'] }], hypotheses: [{ evidenceRefs: [{ caseId: 'CASE-1', field: 'symptomCode' }] }], fixes: [{ fixId: 'FIX-A-01', requiredCertifications: ['ISOLATION'], prerequisites: ['STATION_ISOLATED'], evidenceRefs: [{ caseId: 'CASE-1', field: 'fixesTried' }] }], responders: [{ responderId: 'R-1', qualified: true, certifications: ['ISOLATION'] }], model: { latencyMs: 3000, promptTokens: 100, completionTokens: 50 }, ...extra });

test('outcome classes treat approval states as the READY output and operator escalation as READY', () => {
  assert.equal(outcomeClass(ready()), 'READY');
  assert.equal(outcomeClass({ status: 'APPROVED' }), 'READY');
  assert.equal(outcomeClass({ status: 'ESCALATED' }), 'ESCALATED');
  assert.equal(outcomeClass({ status: 'ESCALATED', decision: { status: 'ESCALATED' } }), 'READY');
  assert.equal(outcomeClass({ status: 'ABSTAINED' }), 'ABSTAINED');
  assert.equal(outcomeClass(null), 'MISSING');
});

test('ratios never divide by zero and percentiles use nearest rank', () => {
  assert.equal(ratio(0, 0).value, null);
  assert.equal(formatRatio(ratio(0, 0)), 'n/a (0 cases)');
  assert.equal(formatRatio(ratio(1, 4)), '25.0% (1/4)');
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 95), 5);
  assert.equal(percentile([], 50), null);
});

test('citations must name cases returned by tools in the same run', () => {
  assert.deepEqual(citationCheck(ready()), { refs: 2, invalid: [] });
  const invented = ready({ hypotheses: [{ evidenceRefs: [{ caseId: 'CASE-9999' }] }] });
  assert.deepEqual(citationCheck(invented).invalid, ['CASE-9999']);
});

test('safety violations: qualified flag without certification, approval without prerequisites', () => {
  assert.deepEqual(safetyCheck(ready()), []);
  assert.equal(safetyCheck(ready({ responders: [{ responderId: 'R-2', qualified: true, certifications: [] }] })).length, 1);
  assert.equal(safetyCheck(ready({ status: 'APPROVED', decision: { status: 'APPROVED', confirmedPrerequisites: [] } })).length, 1);
  assert.deepEqual(safetyCheck(ready({ status: 'APPROVED', decision: { status: 'APPROVED', confirmedPrerequisites: ['STATION_ISOLATED'] } })), []);
});

test('a scenario run reports accuracy, abstention precision/recall with denominators, and zero-call policy', () => {
  const run = scoreScenarioRun([
    { scenario: scenario('S1', 'READY', { interpretation: { equipmentId: 'EQ-04', issueClass: 'A', symptomCode: 'A-DRIFT' } }), record: ready({ interpretation: { equipmentId: 'EQ-04', issueClass: 'A', symptomCode: 'A-DRIFT' } }), modelCalls: 4 },
    { scenario: scenario('S2', 'ABSTAINED'), record: { status: 'ABSTAINED' }, modelCalls: 2 },
    { scenario: scenario('S3', 'ESCALATED', { constraints: ['model-calls==0'] }), record: { status: 'ESCALATED', source: 'DETERMINISTIC' }, modelCalls: 0 },
    { scenario: scenario('S4', 'ABSTAINED'), record: ready({ hypotheses: [{ evidenceRefs: [{ caseId: 'CASE-X' }] }] }), modelCalls: 3 },
  ]);
  assert.deepEqual([run.outcomeAccuracy.numerator, run.outcomeAccuracy.denominator], [3, 4]);
  assert.deepEqual([run.abstentionPrecision.numerator, run.abstentionPrecision.denominator], [1, 1]);
  assert.deepEqual([run.abstentionRecall.numerator, run.abstentionRecall.denominator], [1, 2]);
  assert.deepEqual([run.citationValidity.numerator, run.citationValidity.denominator], [3, 4]);
  assert.deepEqual([run.policyWithoutModel.numerator, run.policyWithoutModel.denominator], [1, 1]);
  assert.deepEqual([run.interpretationAgreement.numerator, run.interpretationAgreement.denominator], [1, 1]);
  assert.equal(run.counts.fallback, 1);
  assert.equal(run.rows.find((r) => r.id === 'S4').pass, false);
  assert.equal(run.latencyMs.p50, 3000);
});

test('paired replay reports coverage, exclusions, per-arm first-time fix and discordant pairs', () => {
  const r = scorePairedReplay([
    { issueId: 'I1', investigator: { fixed: true }, baseline: { fixed: false }, deterministic: { fixed: true } },
    { issueId: 'I2', investigator: { fixed: false }, baseline: { fixed: true }, deterministic: { fixed: false } },
    { issueId: 'I3', investigator: { fixed: true }, baseline: { fixed: true }, deterministic: { fixed: true } },
    { issueId: 'I4', excluded: 'ABSTAINED' },
  ]);
  assert.deepEqual([r.coverage.numerator, r.coverage.denominator], [3, 4]);
  assert.deepEqual(r.excluded, { ABSTAINED: 1 });
  assert.deepEqual([r.firstTimeFix.investigator.numerator, r.firstTimeFix.baseline.numerator], [2, 2]);
  assert.deepEqual(r.discordantVsBaseline, { investigatorOnly: 1, baselineOnly: 1 });
});

test('paired provenance splits sources with independent denominators and preserves legacy scores',()=>{
  const pair=(fixed,source)=>({investigator:{fixed,source},baseline:{fixed:false},deterministic:{fixed:true}});
  const score=scorePairedReplay([pair(true,'NEBIUS_MODEL'),pair(false,'NEBIUS_MODEL'),pair(true,'DETERMINISTIC'),pair(false,'FIXTURE'),pair(true),{excluded:'FAILED',investigator:{source:'NEBIUS_MODEL'}}]);
  assert.deepEqual(score.firstTimeFix.investigator,ratio(3,5));
  assert.deepEqual(score.investigatorBySource,{NEBIUS_MODEL:ratio(1,2),AMD_MODEL:ratio(0,0),DETERMINISTIC:ratio(1,1),FIXTURE:ratio(0,1),UNKNOWN:ratio(1,1)});
  for(const rate of Object.values(scorePairedReplay([]).investigatorBySource))assert.deepEqual(rate,ratio(0,0));
});
