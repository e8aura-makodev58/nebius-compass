import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runPairedReplay,buildReplayDecisionState} from '../src/replay-runner.mjs';
import {createReplayOutcomeRunner} from '../src/replay-outcome-runner.mjs';
import {scenarioState} from '../src/investigation-eval.mjs';
import {ensureIssueFault} from '../src/fault-truth.mjs';
import {createAttempt,settleAttempt,attemptProbability} from '../src/attempt-engine.mjs';
import {assertNoResponderSkill} from '../src/live-schema.mjs';
import {casesBefore} from '../src/investigation-dto.mjs';
import {buildFixPacket,baselineFix,fallbackFixOrder} from '../src/fix-evidence.mjs';
import {scorePairedReplay} from '../../scripts/eval/score.mjs';
const {scenarios}=JSON.parse(await readFile(new URL('../../fixtures/investigation/scenarios.json',import.meta.url)));
function seed() {
  const state=scenarioState(scenarios[0]);
  const issue={id:'ISS-900',equipmentId:'EQ-04',issueClass:'A',status:'PENDING',raisedAt:'2026-10-01T08:00:00.000Z',complexity:'STANDARD',dispatchGate:'OPEN'};
  state.issues.push(issue);ensureIssueFault(state,issue);
  issue.symptom={code:'A-DRIFT',text:'Output drifts from the operating reference.'};issue.reportNarrative=issue.symptom.text;
  issue.fixRecommendation={status:'READY',source:'TEST',createdAt:issue.raisedAt,baselineFixId:'FIX-A-01',rankedFixes:[{fixId:'FIX-A-01'}]};
  state.simulationState.simulationTime=issue.raisedAt;state.resolutionAttempts=[];
  const responderId=state.responders[0].id;
  state.assignments=[{id:'assignment-900',issueId:issue.id,responderId,role:'PRIMARY',status:'ACTIVE',createdAt:issue.raisedAt,joinedAt:issue.raisedAt}];
  const attempt=createAttempt(state,issue.id);state.assignments[0].attemptId=attempt.id;
  state.simulationState.simulationTime=attempt.resolutionDueAt;settleAttempt(state,attempt);
  const fixed=attempt.successDraw<attemptProbability(attempt);
  const history={id:'H-900',issueId:issue.id,attemptId:attempt.id,responderId,issueClass:'A',equipmentId:issue.equipmentId,symptomCode:issue.symptom.code,fixAttemptNumber:1,fixApplied:{id:'FIX-A-01'},legacyFix:false,resolvedAt:attempt.resolutionDueAt,resolutionMinutes:20,success:fixed,participants:[{responderId,contributionShare:1}]};
  state.resolutionHistory.push(history);issue.status='RESOLVED';issue.resolvedAt=history.resolvedAt;
  state.assignments[0].endedAt=history.resolvedAt;state.assignments[0].status='COMPLETED';
  state.simulationState.simulationTime=new Date(Date.parse(history.resolvedAt)+60000).toISOString();
  return {state,issue,responderId,attempt,history};
}
const options={mode:'fixture',heldOutDays:1/24};
const recommend=async()=>({status:'READY',source:'FIXTURE',fixes:[{fixId:'FIX-A-01'}],responders:[{responderId:'R-UNUSED'}]});

test('isolated arms reuse actual first responder and recorded engine draws; changing only fix is paired',()=>{
  const {state,issue,responderId,attempt,history}=seed();
  const decision=buildReplayDecisionState(state,issue);
  const outcome=createReplayOutcomeRunner(state)({decision,issueId:issue.id,responderId,attemptId:attempt.id,fixes:['FIX-A-01','FIX-A-01','FIX-A-01']});
  assert.deepEqual(outcome,[{fixed:history.success},{fixed:history.success},{fixed:history.success}]);
  assertNoResponderSkill(outcome);
});

test('hidden cause and skill perturbations change outcomes, never public decision states or packets',async()=>{
  const {state,issue}=seed();state.resolutionAttempts[0].successDraw=Math.floor(.6*0x100000000)/0x100000000;
  for(const row of state.responderSkills)if(row.issueClass==='A')row.trueSuccessProbability=.99;
  state.faultTruth.causes[issue.id]='hidden-cause-A-0';
  const controlled=createReplayOutcomeRunner(state)({decision:buildReplayDecisionState(state,issue),issueId:issue.id,responderId:state.responders[0].id,attemptId:state.resolutionAttempts[0].id,fixes:['FIX-A-01','FIX-A-02','FIX-A-03']});
  assert.deepEqual(controlled,[{fixed:true},{fixed:false},{fixed:false}]);
  const packets=[];
  const run=async(input)=>runPairedReplay({...options,seed:input,investigate:async(decision,target,config)=>{
    assertNoResponderSkill(decision);assert.equal(config.asOf,issue.raisedAt);assert.equal(target.origin,'SIMULATION');assert.equal(decision.investigationPolicy,undefined);
    packets.push(JSON.stringify({decision,packet:buildFixPacket(decision,target.id),cases:casesBefore(decision,{asOf:config.asOf,targetIssueId:target.id})}));
    return recommend();
  }});
  const high=await run(state),changed=structuredClone(state);changed.faultTruth.causes[issue.id]='hidden-cause-A-1';
  const low=await run(changed);assert.notEqual(high.pairs[0].investigator.fixed,low.pairs[0].investigator.fixed);
  const unskilled=structuredClone(state);for(const row of unskilled.responderSkills)row.trueSuccessProbability=.01;
  const other=await run(unskilled);assert.notEqual(high.pairs[0].investigator.fixed,other.pairs[0].investigator.fixed);
  assert.equal(packets[0],packets[1]);assert.equal(packets[0],packets[2]);assertNoResponderSkill(high);assertNoResponderSkill(low);
});

test('rolling origin excludes target, exact-cutoff and future data before packet baselines and cases',async()=>{
  const {state,issue}=seed(),before=buildReplayDecisionState(state,issue),perturbed=structuredClone(state);
  for(const offset of [0,1]){
    const future={...structuredClone(state.issues[0]),id:`FUTURE-${offset}`,status:'RESOLVED',raisedAt:'2026-09-01T00:00:00Z',resolvedAt:new Date(Date.parse(issue.raisedAt)+offset).toISOString(),symptom:issue.symptom};
    perturbed.issues.push(future);perturbed.resolutionHistory.push({...structuredClone(state.resolutionHistory[0]),id:`F-${offset}`,issueId:future.id,resolvedAt:future.resolvedAt,fixApplied:{id:'FIX-A-02'}});
  }
  perturbed.issues.find((row)=>row.id===issue.id).fixRecommendation={future:'must not enter a packet'};
  perturbed.resolutionHistory.find((row)=>row.issueId===issue.id).success=!perturbed.resolutionHistory.find((row)=>row.issueId===issue.id).success;
  const after=buildReplayDecisionState(perturbed,perturbed.issues.find((row)=>row.id===issue.id));
  assert.deepEqual(after,before);
  assert.deepEqual((await runPairedReplay({...options,seed:state,investigate:recommend})).pairs.find((row)=>row.issueId===issue.id),(await runPairedReplay({...options,seed:perturbed,investigate:recommend})).pairs.find((row)=>row.issueId===issue.id));
  const packet=buildFixPacket(after,issue.id);assert.equal(baselineFix(packet),baselineFix(buildFixPacket(before,issue.id)));
  assert.deepEqual(fallbackFixOrder(packet),fallbackFixOrder(buildFixPacket(before,issue.id)));
  assert.ok(casesBefore(after,{asOf:issue.raisedAt,targetIssueId:issue.id}).every((row)=>row.caseId!==`CASE-${issue.id}`&&Date.parse(row.resolvedAt)<Date.parse(issue.raisedAt)));
});

test('non-READY, thrown investigator and missing outcome records are excluded with honest denominators',async()=>{
  const {state}=seed();
  for(const status of ['ABSTAINED','ESCALATED','FAILED','throws','missing','missing-responder']){
    const input=structuredClone(state);if(status==='missing')input.resolutionAttempts=[];if(status==='missing-responder')input.assignments=[];
    const result=await runPairedReplay({...options,seed:input,investigate:async()=>{if(status==='throws')throw Error('private error must be discarded');return ['missing','missing-responder'].includes(status)?recommend():{status};}});
    const reason=['ABSTAINED','ESCALATED'].includes(status)?status:'FAILED';
    assert.deepEqual(result.pairs,[{issueId:'ISS-900',excluded:reason}]);
    const score=scorePairedReplay(result.pairs);assert.equal(score.coverage.denominator,1);assert.equal(score.coverage.numerator,0);assert.equal(score.firstTimeFix.baseline.value,null);assert.deepEqual(score.excluded,{[reason]:1});
    assertNoResponderSkill(result);
  }
});

test('fixture replay limit five is hermetic, read-only, repeatable and CLI prints paired denominators',async(t)=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('network forbidden');};t.after(()=>{globalThis.fetch=original;});
  const first=await runPairedReplay({mode:'fixture',limit:5});const second=await runPairedReplay({mode:'fixture',limit:5});
  assert.equal(first.pairs.length,5);assert.deepEqual(first.pairs,second.pairs);assert.equal(first.meta.seedHash,second.meta.seedHash);assert.equal(first.meta.archiveHash,second.meta.archiveHash);assert.equal(first.meta.counts.selected,5);
  assertNoResponderSkill(first);for(const pair of first.pairs)if(!pair.excluded)for(const arm of ['investigator','baseline','deterministic'])assert.deepEqual(Object.keys(pair[arm]),arm==='investigator'?['fixed','source','fallbackReason']:['fixed']);
  const {stdout}=await promisify(execFile)(process.execPath,['scripts/eval-investigator.mjs','--replay','--mode','fixture','--limit','5'],{cwd:new URL('../../',import.meta.url)});
  assert.match(stdout,/Coverage.*\(\d\/5\)/);assert.match(stdout,/First-time fix: investigator/);assert.match(stdout,/Discordant vs baseline/);assert.match(stdout,/Investigator first-time fix by source: FIXTURE.*\(\d\/\d\)/);
});

test('replay rejects invalid mode, window and limits',async()=>{
  for(const input of [{mode:'off'},{mode:'fixture',heldOutDays:0},{mode:'fixture',limit:0},{mode:'fixture',limit:1.5}])await assert.rejects(runPairedReplay(input));
});

test('included replay arms retain only public source and fallback reason labels',async()=>{
  for(const [source,fallbackReason,wantSource,wantReason] of [
    ['NEBIUS_MODEL',null,'NEBIUS_MODEL',null],
    ['DETERMINISTIC','deadline','DETERMINISTIC','deadline'],
    ['hidden-cause-A-0','private diagnostic','UNKNOWN','unknown'],
  ]) {
    const result=await runPairedReplay({...options,seed:seed().state,investigate:async()=>({...await recommend(),source,fallbackReason})});
    assert.equal(result.pairs.length,1);
    assert.deepEqual(result.pairs[0].investigator,{fixed:result.pairs[0].baseline.fixed,source:wantSource,fallbackReason:wantReason});
    assertNoResponderSkill(result);
  }
});
