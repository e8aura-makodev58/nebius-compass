import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scenarioState,memoryInvestigationStore} from '../src/investigation-eval.mjs';
import {createInvestigationService,finishInvestigationDeadline,registerSimulatedInvestigation,updateInvestigationPolicy} from '../src/investigation-service.mjs';
import {claimInvestigationDeadlines,sampleInvestigation} from '../src/investigation-policy.mjs';
import {createScheduler} from '../src/scheduler.mjs';
import {createLiveStore} from '../src/live-store.mjs';
import {createLiveRuntime} from '../src/live-runtime.mjs';
import {createObservableDTO} from '../src/investigation-dto.mjs';
import {narrateIssue,validateNarrative} from '../src/narrator.mjs';
import {buildInvestigationAnalytics} from '../src/investigation-analytics.mjs';
import {buildAnalytics,buildPeriodAnalytics} from '../src/analytics-service.mjs';
import {compactHistory} from '../src/history-retention.mjs';
import {writeHistoryArchive} from '../src/history-archive.mjs';
import {assertNoResponderSkill,createIssueAuditRecord,createPublicLiveSnapshot} from '../src/live-schema.mjs';
import {generateDemoHistory} from '../../scripts/generate-demo-history.mjs';
const {scenarios}=JSON.parse(await readFile(new URL('../../fixtures/investigation/scenarios.json',import.meta.url)));
const scenario=scenarios[0];
const repository=fileURLToPath(new URL('../../',import.meta.url));
async function scratch(t){await mkdir(join(repository,'.cache'),{recursive:true});const dir=await mkdtemp(join(repository,'.cache/n3b-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function ready({initial=scenarioState(scenario),mode='fixture'}={}) {
  const store=memoryInvestigationStore(initial),service=createInvestigationService(store,{investigatorOptions:{mode,now:()=>0},rankingOptions:{mode:'fixture'},narratorOptions:{mode:'fixture'}});
  const {reportId}=await service.submit(scenario.input);await service.runNext();const report=await service.getReport(reportId);
  const ids=await service.confirm(reportId,{...scenario.expected.interpretation,expectedRevision:report.revision});await service.runNext();
  return {store,service,ids,record:await service.getInvestigation(ids.investigationId)};
}
async function claimAtDeadline(store){return (await store.mutate('deadline',(state)=>{const row=state.investigations.find((row)=>row.status==='READY');state.simulationState.status='RUNNING';state.simulationState.simulationTime=row.deadline;return claimInvestigationDeadlines(state);})).result[0];}
test('READY expires at its durable deadline; duplicate token delivery is harmless',async()=>{
  const {store,service,record}=await ready();assert.equal(record.deadline,'2026-10-01T08:30:00.000Z');
  const token=await claimAtDeadline(store);assert.equal((await service.finishDeadline(token)).status,'EXPIRED');
  const before=await store.snapshot();assert.equal((await service.finishDeadline(token)).status,'DUPLICATE_OR_STALE');
  assert.deepEqual((await store.snapshot()).assignments,before.assignments);assert.equal((await service.getInvestigation(record.id)).status,'EXPIRED');
});
test('claimed expiry survives restart and scheduler replay consumes it exactly once',async(t)=>{
  const {store,record}=await ready();const trigger=await claimAtDeadline(store);
  const dir=await scratch(t),path=join(dir,'room.json');await writeFile(path,JSON.stringify(await store.snapshot()));
  const restarted=createLiveStore({filePath:path}),service=createInvestigationService(restarted);
  const scheduler=createScheduler(restarted,{onInvestigationDeadline:(token)=>service.finishDeadline(token)});
  await scheduler.reconcileClaimedTriggers();assert.equal((await service.getInvestigation(record.id)).status,'EXPIRED');
  await scheduler.reconcileClaimedTriggers();assert.equal((await service.finishDeadline(trigger)).status,'DUPLICATE_OR_STALE');
  assert.equal((await restarted.snapshot()).operationalEvents.filter((row)=>row.eventType==='INVESTIGATION_EXPIRED').length,1);
});
test('late operator approval cannot win after the deadline, before the next scheduler tick',async()=>{
  const {store,service,record}=await ready();await store.mutate('time',(state)=>{state.simulationState.simulationTime=record.deadline;});
  await assert.rejects(service.decide(record.id,{responderId:record.responders[0].responderId,fixId:record.fixes[0].fixId,confirmedPrerequisites:[],expectedRevision:record.revision},'approve'),{code:'STALE'});
});
test('AUTO_APPROVE_SAFE only acts at the deadline and records its actor and prerequisite confirmations',async()=>{
  const {store,service,record}=await ready();await service.updatePolicy({investigationApproval:'AUTO_APPROVE_SAFE',expectedRevision:0});
  assert.equal((await store.snapshot()).assignments.length,0);
  const token=await claimAtDeadline(store);assert.equal((await service.finishDeadline(token)).status,'AUTO_APPROVED');
  const state=await store.snapshot(),row=state.investigations[0];assert.equal(row.decision.actor,'policy:AUTO_APPROVE_SAFE');assert.equal(row.status,'AUTO_APPROVED');
  assert.deepEqual(row.decision.confirmedPrerequisites,row.fixes[0].prerequisites);assert.equal(state.resolutionAttempts[0].fixApplied.id,row.fixes[0].fixId);
  assertNoResponderSkill(createPublicLiveSnapshot(state));
});
test('policy cannot approve abstained, escalated, thin, hazardous or newly unavailable/uncertified responders',async()=>{
  for(const condition of ['ABSTAINED','ESCALATED','THIN','HAZARD','BUSY','UNCERTIFIED','MISSING_REPORT']) {
    const {store,service}=await ready();await service.updatePolicy({investigationApproval:'AUTO_APPROVE_SAFE',expectedRevision:0});
    await store.mutate('change',(state)=>{const row=state.investigations[0];
      if(['ABSTAINED','ESCALATED'].includes(condition)){row.status=condition;row.resultOutcome=condition;row.deadlineToken=null;}
      if(condition==='THIN'){row.evidenceGrade='THIN';row.fixes[0].grade='THIN';}
      if(condition==='HAZARD')state.fieldReports[0].flags.hazard=['smoke'];
      if(condition==='MISSING_REPORT')state.fieldReports=[];
      if(condition==='BUSY')state.responders.forEach((r)=>r.availability='UNAVAILABLE');
      if(condition==='UNCERTIFIED'){row.fixes[0]={...row.fixes[0],fixId:'FIX-A-03'};state.responders.forEach((r)=>r.certifications=[]);}
      state.simulationState.status='RUNNING';state.simulationState.simulationTime=row.deadline;
    });
    const triggers=(await store.mutate('claim',claimInvestigationDeadlines)).result;
    for(const token of triggers)await service.finishDeadline(token);
    assert.equal((await store.snapshot()).assignments.length,0,condition);
  }
});
test('safe policy confirms required isolation prerequisites explicitly and rechecks current certification',async()=>{
  const {store,service}=await ready();await service.updatePolicy({investigationApproval:'AUTO_APPROVE_SAFE',expectedRevision:0});
  await store.mutate('isolation',(state)=>{const row=state.investigations[0];row.fixes[0].fixId='FIX-A-03';row.fixes[0].grade='MODERATE';row.evidenceGrade='MODERATE';});
  const token=await claimAtDeadline(store);await service.finishDeadline(token);const row=(await store.snapshot()).investigations[0];
  assert.equal(row.status,'AUTO_APPROVED');assert.deepEqual(row.decision.confirmedPrerequisites,['STATION_ISOLATED','LOCKOUT_CONFIRMED']);
});
test('override is a distinct audited path with the same safety rules',async()=>{
  const {store,service,record}=await ready();await store.mutate('abstain',(s)=>{s.investigations[0].status='ABSTAINED';s.investigations[0].deadlineToken=null;});
  const input={responderId:record.responders[0].responderId,fixId:'FIX-A-03',confirmedPrerequisites:['STATION_ISOLATED','LOCKOUT_CONFIRMED'],expectedRevision:record.revision,reason:'Operator verified the procedure.'};
  await assert.rejects(service.decide(record.id,{...input,reason:''},'override'),{code:'STALE'});
  await assert.rejects(service.decide(record.id,{...input,confirmedPrerequisites:[]},'override'),{code:'STALE'});
  assert.equal((await service.decide(record.id,input,'override')).status,'OVERRIDDEN');
  assert.equal((await service.getInvestigation(record.id)).decision.reason,input.reason);
  assert.equal((await service.decide(record.id,input,'override')).status,'OVERRIDDEN');
});
test('re-investigation supersedes old work, clears its deadline/token and takes a fresh cutoff',async()=>{
  const {store,service,record}=await ready();await store.mutate('time',(s)=>{s.simulationState.simulationTime='2026-10-01T08:10:00.000Z';});
  const next=await service.reinvestigate(record.id,{expectedRevision:record.revision});await service.runNext();
  const old=await service.getInvestigation(record.id),current=await service.getInvestigation(next.investigationId);
  assert.equal(old.status,'SUPERSEDED');assert.equal(current.asOf,'2026-10-01T08:10:00.000Z');assert.equal(current.supersedes,old.id);assert.equal(current.status,'READY');
  const state=await store.snapshot();assert.equal(state.investigations[0].deadlineToken,null);assert.equal(state.investigations[0].requestToken,undefined);
  await assert.rejects(service.reinvestigate(record.id,{expectedRevision:record.revision}),{code:'STALE'});
});
test('sampling is deterministic, independent of hidden truth and uses a separate stream',()=>{
  const a=scenarioState(scenario),b=structuredClone(a),other=structuredClone(a.simulationState.rngStreams);
  b.responderSkills.forEach((r)=>r.trueMedianMinutes=30);b.faultTruth.causes={unused:'SECRET'};
  const first=Array.from({length:100},()=>sampleInvestigation(a));assert.deepEqual(first,Array.from({length:100},()=>sampleInvestigation(b)));assert.ok(first.some(Boolean));assert.ok(first.some((value)=>!value));
  const {investigation,...streams}=a.simulationState.rngStreams;const {investigation:old,...prior}=other;assert.deepEqual(streams,prior);
  a.investigationPolicy.investigationShare=0;assert.ok(Array.from({length:10},()=>sampleInvestigation(a)).every((value)=>!value));
  a.investigationPolicy.investigationShare=1;assert.equal(sampleInvestigation(a),true);
});
test('ObservableDTO is canary-safe, independent of skill/cause/effectiveness and future data',()=>{
  const state=scenarioState(scenario),issue={id:'TARGET',equipmentId:'EQ-04',issueClass:'A',symptom:{text:'Output drifts from the operating reference.'}};
  state.operationalEvents.push({id:'old',eventType:'ISSUE_RESOLVED',equipmentId:'EQ-04',issueId:'PAST',simulationTimestamp:'2026-09-30T08:00:00Z',payload:{renamed:'SECRET'}});
  const original=JSON.stringify(createObservableDTO(state,issue,state.simulationState.simulationTime));
  state.responderSkills=[{renamed:'SECRET'}];state.faultTruth={cause:'SECRET',effectiveness:'SECRET'};issue.renamed='SECRET';
  state.equipment.find((row)=>row.id==='EQ-04').renamed='SECRET';
  for(let i=0;i<200;i++)state.operationalEvents.push({id:`future-${i}`,eventType:'ISSUE_RESOLVED',equipmentId:'EQ-04',simulationTimestamp:'2027-01-01T00:00:00Z',payload:{renamed:'SECRET'}});
  assert.equal(JSON.stringify(createObservableDTO(state,issue,state.simulationState.simulationTime)),original);assert.ok(!original.includes('SECRET'));
});
test('narrator rejects causes, procedure titles, skill claims and invented digits; valid global-fetch response is observable only',async(t)=>{
  const state=scenarioState(scenario),issue={id:'TARGET',equipmentId:'EQ-04',issueClass:'A',symptom:{text:'Output drifts from the operating reference.'}};
  const observable=createObservableDTO(state,issue,state.simulationState.simulationTime);
  for(const narrative of ['The hidden-cause-A-0 is known.','The cause is an expert skill issue.','Verify reference settings to resolve this issue.','Station 9 output is drifting again.','There are 99 cases already.','Smoke from Station 4.'])assert.equal(validateNarrative(narrative,observable),false,narrative);
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);assert.deepEqual(input,observable);assert.equal(body.chat_template_kwargs.enable_thinking,false);return new Response(JSON.stringify({usage:{prompt_tokens:5,completion_tokens:7},choices:[{message:{content:JSON.stringify({narrative:'Station 4 output drifts from the operating reference.'})}}]}),{status:200});};
  const result=await narrateIssue(state,issue,{mode:'live',apiKey:'synthetic-key'});assert.equal(result.narrativeSource,'simulated');assert.equal(result.model.usage.promptTokens,5);
  const fallback=await narrateIssue(state,issue,{mode:'live',apiKey:'synthetic-key',timeoutMs:10,callTurn:()=>new Promise(()=>{})});assert.equal(fallback.narrativeSource,'template');
});
test('sampled simulated reports skip interpretation confirmation and preserve engine-owned facts',async()=>{
  const state=scenarioState(scenario);state.investigationPolicy.investigationShare=1;
  const issue={id:'ISS-010',equipmentId:'EQ-05',issueClass:'A',symptom:{code:'A-DRIFT',text:'Output drifts from the operating reference.'},reportNarrative:'Output drifts from the operating reference.',narrativeSource:'template',status:'PENDING',complexity:'STANDARD',existingPriority:'UNSPECIFIED',raisedAt:state.simulationState.simulationTime};
  // Use a real field-report-created issue so private engine validation remains authoritative.
  const {store,service,ids}=await ready({initial:state});
  await store.mutate('sample',(s)=>{const target=s.issues.find((r)=>r.id===ids.issueId);s.investigations=[];s.fieldReports=[];registerSimulatedInvestigation(s,target);});
  await service.runNext();await service.runNext();
  const after=await store.snapshot(),target=after.issues.find((r)=>r.id===ids.issueId);
  assert.equal(after.fieldReports[0].status,'CONFIRMED');assert.equal(after.fieldReports[0].origin,'SIMULATION');assert.equal(target.symptom.code,'A-DRIFT');assert.equal(target.issueClass,'A');assert.equal(after.investigations[0].status,'READY');
});
test('analytics keep denominators, suppress thin samples and never fabricate baseline counterfactuals',()=>{
  const state=scenarioState(scenario);state.investigations=[];
  for(let i=0;i<3;i++) {
    const id=`INV-${i}`,issueId=`ISS-TEST-${i}`,attemptId=`attempt-test-${i}`,fixId=i===2?'FIX-A-02':'FIX-A-01';
    state.investigations.push({id,issueId,status:i===0?'APPROVED':'AUTO_APPROVED',resultOutcome:'READY',asOf:state.simulationState.simulationTime,createdAt:state.simulationState.simulationTime,updatedAt:state.simulationState.simulationTime,fixes:[{fixId}],baselineFixId:'FIX-A-01',decision:{status:i===0?'APPROVED':'AUTO_APPROVED',at:state.simulationState.simulationTime,fixId,attemptId}});
    state.resolutionHistory.push({issueId,attemptId,fixApplied:{id:fixId},fixAttemptNumber:1,success:i!==1,resolvedAt:state.simulationState.simulationTime});
  }
  let stats=buildInvestigationAnalytics(state);assert.equal(stats.firstFixComparison.investigator.rate,2/3);assert.equal(stats.firstFixComparison.classFrequencyBaseline.rate,null);assert.equal(stats.firstFixComparison.classFrequencyBaseline.status,'COUNTERFACTUAL_NOT_OBSERVED');assert.equal(stats.firstFixComparison.classFrequencyBaseline.denominator,3);assert.equal(stats.approvalRate.rate,1);
  state.investigations.pop();stats=buildInvestigationAnalytics(state);assert.equal(stats.firstFixComparison.investigator.rate,null);assert.equal(stats.firstFixComparison.investigator.denominator,2);
});
test('retention preserves investigation analytics, all period denominators, narrator facts and archived detail lookups',async(t)=>{
  const initial=scenarioState(scenario),store=memoryInvestigationStore(initial);
  const service=createInvestigationService(store,{investigatorOptions:{mode:'fixture',now:()=>0},rankingOptions:{mode:'fixture'}});
  const {createResolutionEngine}=await import('../src/resolution-engine.mjs');
  const engine=createResolutionEngine(store),scheduler=createScheduler(store,{onResolutionDue:(token)=>engine.handleResolutionDue(token)});
  const ids=[];
  for(let i=0;i<3;i++) {
    const submitted=await service.submit(scenario.input);await service.runNext();const report=await service.getReport(submitted.reportId);
    const created=await service.confirm(report.id,{...scenario.expected.interpretation,expectedRevision:report.revision});await service.runNext();const row=await service.getInvestigation(created.investigationId);
    await service.decide(row.id,{responderId:row.responders[0].responderId,fixId:row.fixes[0].fixId,confirmedPrerequisites:[],expectedRevision:row.revision},'approve');
    await store.mutate('fixture-success-draw',(state)=>{state.resolutionAttempts.find((r)=>r.issueId===created.issueId&&r.status==='ACTIVE').successDraw=0;});
    await scheduler.forceResolve(created.issueId);ids.push({...created,reportId:report.id});
  }
  await store.mutate('retention-time',(state)=>{state.simulationState.simulationTime='2026-10-10T08:00:00.000Z';state.workforceContinuity.temporaryRepairs=[];});
  const full=await store.snapshot(),retained=structuredClone(full);
  const issue=full.issues.find((row)=>row.id===ids[0].issueId);
  const observable=createObservableDTO(full,issue,full.simulationState.simulationTime);
  const bundles=compactHistory(retained,1,{force:true});assert.equal(retained.investigations.length,0);assert.equal(retained.historyRetention.facts.investigations.length,3);
  assert.deepEqual(buildInvestigationAnalytics(retained),buildInvestigationAnalytics(full));
  assert.deepEqual(buildAnalytics(retained),buildAnalytics(full));
  for(const level of ['HOUR','DAY','WEEK','MONTH'])assert.deepEqual(buildPeriodAnalytics(retained,{level}),buildPeriodAnalytics(full,{level}));
  assert.deepEqual(createObservableDTO(retained,issue,retained.simulationState.simulationTime),observable);
  const dir=await scratch(t),path=join(dir,'retained.json'),archiveRoot=join(dir,'archive');
  await writeHistoryArchive(archiveRoot,retained,bundles);await writeFile(path,JSON.stringify(retained));
  const durable=createLiveStore({filePath:path,archiveRoot,historyRetentionDays:1}),archivedService=createInvestigationService(durable);
  assert.equal((await archivedService.getInvestigation(ids[0].investigationId)).status,'APPROVED');assert.equal((await archivedService.getReport(ids[0].reportId)).status,'CONFIRMED');
  assert.deepEqual(await durable.issueAudit(ids[0].issueId),createIssueAuditRecord(full,ids[0].issueId));
  assertNoResponderSkill(await durable.issueAudit(ids[0].issueId));
});
test('policy and re-investigate/override routes use the same room service and revision guards',async()=>{
  const {createRequestHandler}=await import('../src/server.mjs');
  const {store,ids,record}=await ready();
  const runtime=createLiveRuntime({store,agentOptions:{mode:'fixture'},plannerOptions:{mode:'force-failure'},investigatorOptions:{mode:'force-failure',now:()=>0},narratorOptions:{mode:'fixture'}});
  const handler=createRequestHandler({getRoom:(id)=>({id,health:'READY',applicationRuntime:runtime})});
  async function request(method,path,body){let result;const response={writeHead(code){this.code=code;},end(data){result={code:this.code,body:JSON.parse(data)};}};await handler({url:`/api/control-rooms/plant-1${path}`,headers:{host:'localhost','content-type':'application/json'},method,async *[Symbol.asyncIterator](){yield JSON.stringify(body);}},response);return result;}
  const policy=await request('PATCH','/demo/investigation-policy',{expectedRevision:0,investigationShare:0,investigationApproval:'AUTO_APPROVE_SAFE'});assert.equal(policy.code,200);assert.equal(policy.body.revision,1);
  assert.equal((await request('PATCH','/demo/investigation-policy',{expectedRevision:0,investigationShare:1})).code,409);
  const next=await request('POST',`/investigations/${record.id}/reinvestigate`,{expectedRevision:record.revision});assert.equal(next.code,200);await runtime.agentWorkIdle();
  const current=await runtime.getInvestigation(next.body.investigationId);await store.mutate('escalate-fixture',(state)=>{state.investigations.find((row)=>row.id===current.id).status='ESCALATED';});
  const overridden=await request('POST',`/investigations/${current.id}/override`,{expectedRevision:current.revision,responderId:current.responders[0].responderId,fixId:current.fixes[0].fixId,confirmedPrerequisites:[],reason:'Operator reviewed the procedure.'});
  assert.equal(overridden.code,200);assert.equal(overridden.body.status,'OVERRIDDEN');assert.ok(ids.issueId);
});
test('generator repeats byte-for-byte with investigation sampling, safe policy and narrator fallback',async(t)=>{
  const dir=await scratch(t),from=join(dir,'from.json');await writeFile(from,JSON.stringify(scenarioState(scenario)));
  const options={from,until:'2026-10-01T10:00:00Z',retentionDays:0,investigationShare:1};
  const a=join(dir,'a.json'),b=join(dir,'b.json');
  const first=await generateDemoHistory({...options,out:a}),second=await generateDemoHistory({...options,out:b});
  assert.equal(first.fetchCalls+second.fetchCalls,0);assert.equal(first.credentialReads+second.credentialReads,0);assert.equal(await readFile(a,'utf8'),await readFile(b,'utf8'));
  const state=JSON.parse(await readFile(a,'utf8'));assert.equal(state.investigationPolicy.investigationApproval,'AUTO_APPROVE_SAFE');assert.equal(state.investigationPolicy.investigationShare,1);assert.ok(state.investigations.length);
  assert.ok(state.fieldReports.some((row)=>row.origin==='SIMULATION'&&row.narrationStatus==='READY'));
});
test('committed investigation datasets are synthetic, loadable, bounded and reproducible',async(t)=>{
  const {createInvestigationDataset}=await import('../seed/create-investigation-dataset.mjs');
  const dir=await scratch(t),out=join(dir,'dataset.json');
  const report=await createInvestigationDataset(out);
  assert.equal(report.label,'synthetic');assert.equal(report.fetchCalls,0);assert.equal(report.credentialReads,0);
  assert.equal(await readFile(out,'utf8'),await readFile(new URL('../seed/investigation-lifecycle.json',import.meta.url),'utf8'));
  const monthPath=fileURLToPath(new URL('../seed/investigation-month/plant-1.json',import.meta.url));
  const month=JSON.parse(await readFile(monthPath));assert.equal(month.investigationPolicy.investigationApproval,'AUTO_APPROVE_SAFE');assert.equal(month.investigationPolicy.investigationShare,0.2);
  assert.equal(buildInvestigationAnalytics(month).byOutcome.AUTO_APPROVED,23);
  const {copyHistoryArchive}=await import('../src/history-archive.mjs');
  const scratchArchive=join(dir,'month-history');await copyHistoryArchive(`${monthPath}.history`,scratchArchive);
  const readonly=createLiveStore({filePath:join(dir,'month.json'),archiveRoot:scratchArchive});
  // Copy only to a scratch store; tests never write into the committed seed directory.
  await writeFile(join(dir,'month.json'),JSON.stringify(month));
  assertNoResponderSkill(await readonly.publicSnapshot());
  const {stat,readdir}=await import('node:fs/promises');
  async function check(path){const info=await stat(path);if(info.isDirectory())for(const file of await readdir(path))await check(join(path,file));else assert.ok(info.size<20000000,path);}
  await check(fileURLToPath(new URL('../seed/investigation-month/',import.meta.url)));
});

test('feedback does not move an outcome into a different analytics period',async()=>{
  const {store,service,record}=await ready();
  const before=(await store.snapshot()).investigations[0].updatedAt;
  await store.mutate('time',(state)=>{state.simulationState.simulationTime='2026-10-02T08:00:00.000Z';});
  await service.decide(record.id,{useful:true},'feedback');
  assert.equal((await store.snapshot()).investigations[0].updatedAt,before);
});
