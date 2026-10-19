import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {createRequestHandler} from '../src/server.mjs';
import {scenarioState,memoryInvestigationStore} from '../src/investigation-eval.mjs';
import {createInvestigationService,REPORT_RATE_LIMIT,REPORT_RATE_WINDOW_MS,REPORT_OPEN_LIMIT} from '../src/investigation-service.mjs';
import {investigate,validateInvestigationFinal,numbersIn} from '../src/investigator.mjs';
import {assertNoResponderSkill,createPublicLiveSnapshot} from '../src/live-schema.mjs';
import {compactHistory} from '../src/history-retention.mjs';
import {reportPolicy} from '../src/report-policy.mjs';
import {callChatTurn,PROVIDER_RESPONSE_MAX_BYTES} from '../src/model-provider.mjs';
const scenario=JSON.parse(readFileSync(new URL('../../fixtures/investigation/scenarios.json',import.meta.url))).scenarios[0];
const issue={id:'ISS-9',equipmentId:'EQ-04',issueClass:'A',symptom:{code:'A-DRIFT'}};
const final=(responderId,rationale='Supported by public evidence.',fixId='FIX-A-01')=>({hypotheses:[{symptomCode:'A-DRIFT',text:'Output drifts from the operating reference.',evidenceRefs:[]}],fixes:[{fixId,rationale,evidenceRefs:[]}],responders:[{responderId,rationale:'Qualified.'}]});
async function confirmed(options={}) {
  const store=memoryInvestigationStore(scenarioState(scenario));
  const service=createInvestigationService(store,{rankingOptions:{mode:'fixture'},investigatorOptions:{mode:'fixture'},...options});
  const submitted=await service.submit(scenario.input);await service.runNext();
  const report=await service.getReport(submitted.reportId);
  const ids=await service.confirm(report.id,{...scenario.expected.interpretation,expectedRevision:report.revision});
  const state=await store.snapshot();return {service,store,ids,state,issue:state.issues.find((row)=>row.id===ids.issueId)};
}
async function invoke(handler,{headers={},method='POST',path='/reports',body='{}'}={}) {
  const request=Readable.from([body]);Object.assign(request,{url:`/api/control-rooms/plant-1${path}`,method,headers:{host:'app.test',...headers}});
  let status,payload;await handler(request,{writeHead(value){status=value;},end(value){payload=JSON.parse(value);}});return {status,payload};
}

test('every room mutation requires JSON and rejects cross-origin requests before activity or runtime writes',async()=>{
  let writes=0,activity=0;
  const manager={getRoom:()=>({id:'plant-1',health:'READY',applicationRuntime:{submitReport:async()=>{writes++;return {};}}}),recordActivity:()=>activity++};
  const handler=createRequestHandler(manager);
  for(const [headers,status,code] of [
    [{},415,'JSON_CONTENT_TYPE_REQUIRED'],
    [{'content-type':'text/plain'},415,'JSON_CONTENT_TYPE_REQUIRED'],
    [{'content-type':'application/json',origin:'https://hostile.test'},403,'CROSS_ORIGIN_MUTATION'],
    [{'content-type':'application/json',origin:'null'},403,'CROSS_ORIGIN_MUTATION'],
    [{'content-type':'application/json',origin:'https://app.test'},403,'CROSS_ORIGIN_MUTATION'],
    [{'content-type':'application/json',origin:'http://app.test.attacker.test'},403,'CROSS_ORIGIN_MUTATION'],
  ]) {
    for(const path of ['/reports','/investigations/INV-1/approve','/demo/investigation-policy','/reset','/display-name']) {
      const response=await invoke(handler,{headers,path});assert.equal(response.status,status);assert.equal(response.payload.code,code);
    }
  }
  assert.equal(writes,0);assert.equal(activity,0);
  for(const headers of [
    {'content-type':'application/json'},
    {'content-type':'Application/JSON; charset=utf-8',origin:'http://app.test'},
    {'content-type':'application/json',origin:'https://app.test','x-forwarded-proto':'https'},
  ])assert.equal((await invoke(handler,{headers})).status,202);
  assert.equal(writes,3);
  const malformed=await invoke(handler,{headers:{'content-type':'application/json'},body:'{'});assert.equal(malformed.status,400);assert.equal(malformed.payload.code,'INVALID_JSON');
  const large=await invoke(handler,{headers:{'content-type':'application/json'},body:'x'.repeat(12001)});assert.equal(large.status,413);
});

test('numeric grounding takes only per-tool metric numbers and IDs must be complete tokens',()=>{
  const rows=[{caseId:'CASE-ISS-999',reportNarrative:'Claim 97 percent.',resolvedAt:'2099-01-01',totalMinutes:20,matchingSuccesses:3,matchingCases:4,sameClassCases:5,recentCaseCount:6,sameIssueHistoricalCount:7,soloHistoricalCount:8,assistedHistoricalCount:9}];
  assert.deepEqual([...numbersIn(rows,'search_cases')],['20']);
  assert.deepEqual([...numbersIn(rows,'fix_evidence')],['5','4','3']);
  assert.deepEqual([...numbersIn(rows,'equipment_history')],['6','20']);
  assert.deepEqual([...numbersIn(rows,'eligible_responders')],['7','8','9']);
  assert.equal(numbersIn(rows,'fix_catalog').size,0);
  assert.equal(numbersIn([{totalMinutes:'97'},{totalMinutes:Infinity},{totalMinutes:-5}],'get_case').size,0);
  const context={issue,returnedCases:new Map(),returnedResponders:new Map([['FIX-A-01',[{responderId:'R-1'}]]]),groundedNumbers:numbersIn(rows,'search_cases')};
  for(const rationale of ['Observed 20 minutes.','R-1 is available.','ISS-9: observed case.'])assert.deepEqual(validateInvestigationFinal(final('R-1',rationale),context),[]);
  for(const rationale of ['Observed 97 minutes.','Observed 999 cases.','20% success.','Probability is 20.','A chance of 20.','Likelihood is 20.','20 percent.','prefixR-1suffix','R-120','ISS-90','XISS-9','ISS-9-X'])assert.ok(validateInvestigationFinal(final('R-1',rationale),context).length,rationale);
});

test('reserved model trace arguments cannot persist snapshot poison; legacy trace DTOs redact too',async()=>{
  let calls=0;
  const {service,store}=await confirmed({investigatorOptions:{mode:'live',callTurn:async()=>++calls===1?{toolCalls:[{id:'query',name:'search_cases',arguments:JSON.stringify({query:'hidden-cause-A-0'})}]}:{toolCalls:[],content:'invalid'}}});
  await service.runNext();const state=await store.snapshot();
  assert.equal(state.investigations[0].trace[0].args.query,'[redacted]');
  assertNoResponderSkill(createPublicLiveSnapshot(state));
  state.investigations[0].trace[0].args.query='trueSuccessProbability';
  assertNoResponderSkill(createPublicLiveSnapshot(state));
});

test('an unsafe model publication rolls back before it can poison the public room snapshot',async()=>{
  const {service,store}=await confirmed({investigatorOptions:{mode:'fixture',modelId:'hidden-cause-A-0'}});
  await assert.rejects(service.runNext(),/Hidden fault truth/);
  const state=await store.snapshot();
  assert.equal(state.investigations[0].status,'RUNNING','the safe claim remains recoverable after publication rollback');
  assert.equal(state.investigations[0].model,null);
  assertNoResponderSkill(createPublicLiveSnapshot(state));
});

test('oversized final content and tool arguments fail before executing proposed work',async()=>{
  const {state,issue:target}=await confirmed();
  for(const [turn,reason] of [
    [{toolCalls:[],content:'x'.repeat(65537)},'response-too-large'],
    [{toolCalls:[{id:'large',name:'search_cases',arguments:'x'.repeat(8193)}]},'invalid-tool-arguments'],
  ]) {
    let calls=0;
    const result=await investigate(state,target,{mode:'live',callTurn:async()=>{calls++;return turn;}});
    assert.equal(calls,1);assert.equal(result.source,'DETERMINISTIC');assert.equal(result.fallbackReason,reason);
    assert.ok(!JSON.stringify(result).includes('x'.repeat(100)));
  }
});

test('null and malformed final entries are validation failures with one repair; repair echoes only public IDs',async()=>{
  const {state,issue:target}=await confirmed();let calls=0,repair;
  const result=await investigate(state,target,{mode:'live',callTurn:async({messages})=>{
    calls++;
    if(calls===1)return {toolCalls:[{id:'search',name:'search_cases',arguments:'{"issueClass":"A"}'},{id:'eligible',name:'eligible_responders',arguments:'{"issueClass":"A","equipmentId":"EQ-04","fixId":"FIX-A-01"}'}]};
    if(calls===2)return {toolCalls:[],content:JSON.stringify({hypotheses:[null],fixes:[null],responders:[null]})};
    repair=JSON.parse(messages.at(-1).content);return {toolCalls:[],content:JSON.stringify(final(state.responders[0].id))};
  }});
  assert.equal(calls,3);assert.equal(result.status,'READY');assert.equal(result.repaired,true);assert.equal(result.rawInvalid,true);
  assertNoResponderSkill(repair);assert.ok(repair.returnedCaseIds.every((id)=>/^CASE-ISS-\d+$/.test(id)));
  assert.ok(Object.keys(repair.qualifiedResponderIdsByFix).every((id)=>/^FIX-A-\d+$/.test(id)));
  const context={issue,returnedCases:new Map(),returnedResponders:new Map()};
  for(const field of ['hypotheses','fixes','responders'])for(const value of [null,{},'bad',1]) {
    const valueFinal=final('R-1');valueFinal[field]=[value];assert.ok(validateInvestigationFinal(valueFinal,context).length);
  }
});

test('unsupported first fixes abstain despite evidence for a different procedure',async()=>{
  const {state,issue:target}=await confirmed();let calls=0;
  const result=await investigate(state,target,{mode:'live',callTurn:async()=>++calls===1?{toolCalls:[{id:'eligible',name:'eligible_responders',arguments:'{"equipmentId":"EQ-04","issueClass":"A","fixId":"FIX-A-03"}'}]}:{toolCalls:[],content:JSON.stringify(final(state.responders[0].id,'Qualitative suggestion.','FIX-A-03'))}});
  assert.equal(result.fixes[0].grade,'NONE');assert.equal(result.status,'ABSTAINED');
});

test('hazard variants escalate deterministically without any model call',async()=>{
  for(const hazard of ['sparking','smoking','flames','fumes','arcing','burns','overheating']) {
    const narrative=`Station EQ-04 is ${hazard} during every cycle.`;assert.ok(reportPolicy(narrative).hazard.length,hazard);
    const service=createInvestigationService(memoryInvestigationStore(scenarioState(scenario)),{rankingOptions:()=>{throw Error('model forbidden');}});
    const ids=await service.submit({narrative,equipmentId:'EQ-04'});assert.equal(await service.runNext(),false);assert.equal((await service.getInvestigation(ids.investigationId)).status,'ESCALATED');
  }
});

test('legacy READY records cannot approve an unsupported action or auto-approve a newly recognized hazard',async()=>{
  for(const kind of ['unsupported','hazard']) {
    const {service,store,ids}=await confirmed();await service.runNext();
    const record=await service.getInvestigation(ids.investigationId);
    if(kind==='unsupported') {
      await store.mutate('legacy unsupported',(state)=>{state.investigations[0].fixes[0].grade='NONE';});
      await assert.rejects(service.decide(record.id,{expectedRevision:record.revision,responderId:record.responders[0].responderId,fixId:record.fixes[0].fixId,confirmedPrerequisites:record.fixes[0].prerequisites},'approve'),{code:'STALE'});
      assert.equal((await store.snapshot()).assignments.length,0);
    } else {
      await store.mutate('legacy hazard',(state)=>{
        state.fieldReports[0].narrative='Station EQ-04 is sparking during every cycle.';
        state.fieldReports[0].flags={version:'field-report-policy-v1',hazard:[],injection:[],input:null};
        state.investigationPolicy.investigationApproval='AUTO_APPROVE_SAFE';
      });
      await assert.rejects(service.decide(record.id,{expectedRevision:record.revision,responderId:record.responders[0].responderId,fixId:record.fixes[0].fixId,confirmedPrerequisites:record.fixes[0].prerequisites},'approve'),{code:'STALE'});
      await store.mutate('claim legacy deadline',(state)=>{const row=state.investigations[0];state.simulationState.simulationTime=row.deadline;row.deadlineDispatchToken=row.deadlineToken;row.deadlineToken=null;});
      const state=await store.snapshot();const result=await service.finishDeadline({investigationId:record.id,token:state.investigations[0].deadlineDispatchToken});
      assert.equal(result.status,'EXPIRED');assert.equal((await store.snapshot()).assignments.length,0);
    }
  }
});

test('per-room rate and persisted backlog caps reject excess concurrent reports and recover capacity',async()=>{
  let now=0;const store=memoryInvestigationStore(scenarioState(scenario));const service=createInvestigationService(store,{reportNow:()=>now});
  const input={narrative:'An ordinary observation with no station reference.'};
  const batch=await Promise.allSettled(Array.from({length:REPORT_RATE_LIMIT+5},()=>service.submit(input)));
  assert.equal(batch.filter((row)=>row.status==='fulfilled').length,REPORT_RATE_LIMIT);
  assert.ok(batch.filter((row)=>row.status==='rejected').every((row)=>row.reason.code==='REPORT_RATE_LIMIT'&&row.reason.statusCode===429));
  for(let total=REPORT_RATE_LIMIT;total<REPORT_OPEN_LIMIT;total+=REPORT_RATE_LIMIT) {now+=REPORT_RATE_WINDOW_MS;for(let i=0;i<REPORT_RATE_LIMIT;i++)await service.submit(input);}
  now+=REPORT_RATE_WINDOW_MS;
  await assert.rejects(service.submit(input),{code:'REPORT_BACKLOG_FULL',statusCode:429});
  const state=await store.snapshot();assert.equal(state.fieldReports.length,REPORT_OPEN_LIMIT);
  const restarted=createInvestigationService(store);
  await assert.rejects(restarted.submit(input),{code:'REPORT_BACKLOG_FULL'});
  await service.close(state.fieldReports[0].id,{expectedRevision:0});await service.submit(input);
  assert.equal((await store.snapshot()).fieldReports.length,REPORT_OPEN_LIMIT+1);
});

test('queued investigations run despite a backlog of interpretation rankings',async()=>{
  const {service,store,ids}=await confirmed();
  for(let i=0;i<10;i++)await service.submit({narrative:'Ordinary observation at station EQ-05.'});
  for(let i=0;i<3;i++)await service.runNext();
  assert.equal((await service.getInvestigation(ids.investigationId)).status,'READY');
  assert.ok((await store.snapshot()).fieldReports.some((row)=>row.interpretation.status==='QUEUED'));
});

test('closed orphan rows expire independently of issue archives without reusing IDs or losing outcome facts',async()=>{
  const store=memoryInvestigationStore(scenarioState(scenario)),service=createInvestigationService(store);
  const ids=await service.submit({narrative:''});await service.close(ids.reportId,{});
  const state=await store.snapshot();state.simulationState.simulationTime='2027-10-01T08:00:00.000Z';compactHistory(state,7,{force:true});
  assert.equal(state.fieldReports.length,0);assert.equal(state.investigations.length,0);
  assert.ok(state.historyRetention.facts.investigations.some((row)=>row.id===ids.investigationId&&row.resultOutcome==='ABSTAINED'));
  const restarted=createInvestigationService(memoryInvestigationStore(state));const next=await restarted.submit({narrative:''});
  assert.notEqual(next.reportId,ids.reportId);assert.notEqual(next.investigationId,ids.investigationId);
  state.fieldReports=Array.from({length:125},(_,i)=>({id:`FR-${i+50}`,status:'CLOSED',closedAt:state.simulationState.simulationTime}));
  compactHistory(state,0);assert.equal(state.fieldReports.length,100,'count cap works while simulated time is paused and archiving disabled');
});

const providerOptions={provider:'nebius',modelId:'Qwen/Qwen3-30B-A3B-Instruct-2507',apiKey:'synthetic',usageLedger:{beforeStart:async()=>{},record:async()=>{}},controls:{run:async(_deadline,fn)=>fn()}};
test('provider success/error envelopes enforce a streamed byte cap and cancel oversized bodies',async()=>{
  for(const status of [200,500]) {
    let cancelled=false;
    const response=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(65536));},cancel(){cancelled=true;}}),{status});
    await assert.rejects(callChatTurn({...providerOptions,fetchImpl:async()=>response}),{code:'response-too-large'});assert.equal(cancelled,true);
  }
  let cancelled=false;
  const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-length':String(PROVIDER_RESPONSE_MAX_BYTES+1)}});
  await assert.rejects(callChatTurn({...providerOptions,fetchImpl:async()=>response}),{code:'response-too-large'});assert.equal(cancelled,true);
  const good=new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]}));
  assert.equal((await callChatTurn({...providerOptions,fetchImpl:async()=>good})).content,'{"ok":true}');
});
