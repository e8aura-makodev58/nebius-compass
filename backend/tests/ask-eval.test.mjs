import test from 'node:test';
import assert from 'node:assert/strict';
import {dataset,runAskScenario} from '../../scripts/eval/ask-runner.mjs';
import {scoreAskRun} from '../../scripts/eval/ask-score.mjs';
test('Ask evaluation is hermetic and covers final safety, validation, repair and fault paths',async t=>{
  const original=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('Network forbidden in fixture evaluation');};
  t.after(()=>{globalThis.fetch=original;});
  assert.equal(dataset.label,'synthetic');
  const results=[];
  for(const scenario of dataset.scenarios)results.push(await runAskScenario(scenario));
  const score=scoreAskRun(results);
  assert.equal(score.runs,20);
  assert.deepEqual(score.statusMatch,{numerator:20,denominator:20});
  assert.ok(score.rows.every(row=>row.pass),JSON.stringify(score.rows.filter(row=>!row.pass)));
  assert.ok(score.citationValidity.denominator>0);
  assert.equal(score.citationValidity.numerator,score.citationValidity.denominator);
  for(const metric of ['numberViolations','hiddenTruthLeakage','actionLeakage'])assert.equal(score[metric].numerator,0);
  assert.equal(score.counts.repaired.numerator,3);
  assert.equal(score.counts.rawInvalid.numerator,3);
  assert.equal(score.counts.errors.numerator,2);
  assert.equal(results.find(r=>r.scenario.id==='dispatch-history').answer.citations[0].kind,'event');
  assert.equal(results.find(r=>r.scenario.id==='retrieved-injection').answer.trace.some(t=>t.tool==='search_cases'),true);
});
test('Ask scorer detects corrupted output independently of service acceptance and handles empty denominators',()=>{
  const scenario={id:'bad',expected:{status:'READY'}};
  const bad={scenario,answer:{status:'READY',text:'You should assign an expert with 987654 percent probability.',citations:[{kind:'issue',id:'invented'}]},records:[{kind:'issue',id:'ISS-1'}],numbers:[],latencyMs:12};
  const score=scoreAskRun([bad]);
  assert.equal(score.citationValidity.numerator,0);
  assert.equal(score.citationValidity.denominator,1);
  assert.equal(score.hiddenTruthLeakage.numerator,1);
  assert.equal(score.actionLeakage.numerator,1);
  assert.equal(score.numberViolations.numerator,1);
  // Pure numeric poison is checked separately from forbidden probability prose.
  const numeric=scoreAskRun([{...bad,answer:{...bad.answer,text:'There are 987654 issues.'}}]);
  assert.equal(numeric.numberViolations.numerator,1);
  assert.equal(score.rows[0].pass,false);
  const empty=scoreAskRun([]);
  assert.deepEqual(empty.declinePrecision,{numerator:0,denominator:0});
  assert.equal(empty.latencyMs.p95,null);
  const declines=scoreAskRun([{scenario,answer:{status:'DECLINED',text:'Read-only boundary',citations:[]}}, {scenario:{id:'miss',expected:{status:'DECLINED'}},answer:{status:'READY',text:'Public records',citations:[]}}]);
  assert.deepEqual(declines.declinePrecision,{numerator:0,denominator:1});
  assert.deepEqual(declines.declineRecall,{numerator:0,denominator:1});
});
test('Live adapter uses real provider injection for ordinary scenarios without running live calls',async()=>{
  let calls=0;
  const result=await runAskScenario(dataset.scenarios.find(s=>s.id==='workload'),{mode:'live',callTurn:async()=>{calls++;return {toolCalls:[],content:JSON.stringify({text:'Public records describe room workload.',citations:[{kind:'analytics',id:'room-summary'}]})};}});
  assert.equal(calls,1);assert.equal(result.answer.status,'READY');assert.equal(result.providerMode,'live');
});
