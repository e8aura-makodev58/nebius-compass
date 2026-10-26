import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createProviderUsageLedger,dailyBudget} from '../src/provider-usage.mjs';
import {createProviderControls} from '../src/provider-controls.mjs';
import {callChatTurn,callChatCompletion,NEBIUS_ROLE_DEFAULTS} from '../src/model-provider.mjs';
import {requestAgentRecommendation} from '../src/agent.mjs';
import {requestEventProposal,createEventPlanningService} from '../src/event-planner.mjs';
import {requestFixRanking} from '../src/fix-ranking.mjs';
import {requestStaffingRanking} from '../src/staffing-ranking.mjs';
import {buildFixPacket} from '../src/fix-evidence.mjs';
import {investigate,rankInterpretations} from '../src/investigator.mjs';
import {narrateIssue} from '../src/narrator.mjs';
import {scenarioState,memoryInvestigationStore} from '../src/investigation-eval.mjs';
import {createProviderSettingsService} from '../src/provider-settings.mjs';
import {createRequestHandler} from '../src/server.mjs';
const {scenarios}=JSON.parse(await readFile(new URL('../../fixtures/investigation/scenarios.json',import.meta.url)));
const ultra=NEBIUS_ROLE_DEFAULTS.investigator.modelId,superModel=NEBIUS_ROLE_DEFAULTS.compass.modelId;
const controls={run:async(_deadline,attempt)=>attempt()};
const envelope=(usage={prompt_tokens:1e6,completion_tokens:0},extra={})=>({ok:true,headers:{get:()=>null},json:async()=>({usage,choices:[{message:{content:'{}'},finish_reason:'stop'}],...extra})});
const args=(ledger,more={})=>({provider:'nebius',modelId:ultra,apiKey:'synthetic',usageLedger:ledger,controls,timeoutMs:1000,...more});
async function scratch(t){const root=new URL('../../.cache/',import.meta.url);await mkdir(root,{recursive:true});const path=await mkdtemp(new URL('usage-',root));t.after(()=>rm(path,{recursive:true,force:true}));return path;}

test('ledger aggregates provider/model/role with explicit pricing, unknown costs and no prompt storage',async(t)=>{
  const filePath=join(await scratch(t),'usage.json');const now=()=>Date.parse('2026-10-19T12:00:00Z');
  const ledger=createProviderUsageLedger({filePath,now});
  await Promise.all(['compass','investigator','narrator','event-planner'].map((role)=>callChatTurn(args(ledger,{role,modelId:role==='compass'?superModel:ultra,userContent:'PRIVATE PROMPT CANARY',systemInstruction:'DO NOT STORE THIS',fetchImpl:async()=>envelope({prompt_tokens:1e6,completion_tokens:2e6})}))));
  await callChatCompletion(args(ledger,{modelId:'unknown-new-model',role:'compass',fetchImpl:async()=>envelope({prompt_tokens:12,completion_tokens:7})}));
  await callChatTurn(args(ledger,{provider:'amd',modelId:'MiMo-V2.6-Flash',fetchImpl:async()=>envelope({prompt_tokens:11,completion_tokens:3})}));
  const usage=await ledger.snapshot();assert.equal(usage.today.calls,6);assert.equal(usage.today.byRole.length,4);assert.equal(usage.today.byModel.length,6);
  assert.equal(usage.today.byModel.find((row)=>row.model===superModel).estimatedCostUsd,2.1);assert.equal(usage.today.byModel.find((row)=>row.role==='investigator').estimatedCostUsd,7);
  assert.equal(usage.today.byModel.find((row)=>row.model==='unknown-new-model').estimatedCostUsd,null);assert.equal(usage.today.estimatedCostUsd,null);assert.equal(usage.today.unpricedCalls,2);assert.equal(usage.today.knownCostUsd,23.1);
  const stored=await readFile(filePath,'utf8');assert.doesNotMatch(stored,/PRIVATE PROMPT|DO NOT STORE|synthetic|choices|content|apiKey|reasoning/);assert.equal((await stat(filePath)).mode&0o777,0o600);
  const restarted=createProviderUsageLedger({filePath,now});assert.deepEqual(await restarted.snapshot(),usage);
});

test('budget blocks before fetch, survives restart/logs once daily, resumes at next UTC day and counts in-flight completions',async(t)=>{
  const filePath=join(await scratch(t),'usage.json'),logs=[];let clock=Date.parse('2026-10-19T23:59:00Z'),calls=0;
  const config={filePath,now:()=>clock,environment:{COMPASS_DAILY_BUDGET_USD:'1'},logger:{log:(line)=>logs.push(JSON.parse(line))}};
  let ledger=createProviderUsageLedger(config);const fetchImpl=async()=>{calls++;return envelope();};
  await callChatTurn(args(ledger,{fetchImpl}));assert.equal((await ledger.snapshot()).exhausted,true);
  for(let i=0;i<2;i++)await assert.rejects(callChatTurn(args(ledger,{fetchImpl})),{code:'budget-exhausted'});
  ledger=createProviderUsageLedger(config);await assert.rejects(callChatTurn(args(ledger,{fetchImpl})),{code:'budget-exhausted'});
  assert.equal(calls,1);assert.equal(logs.length,1);assert.equal(logs[0].event,'provider_budget_exhausted');
  clock=Date.parse('2026-10-20T00:00:00Z');assert.equal((await ledger.snapshot()).exhausted,false);await callChatTurn(args(ledger,{fetchImpl}));assert.equal(calls,2);assert.equal(logs.length,2);
  const flight=createProviderUsageLedger({filePath:null,environment:{COMPASS_DAILY_BUDGET_USD:'1'},logger:null});let ready,release;const started=new Promise((resolve)=>{ready=resolve;});const wait=new Promise((resolve)=>{release=resolve;});
  const inFlight=callChatTurn(args(flight,{fetchImpl:async()=>{ready();await wait;return envelope();}}));await started;
  await flight.record({provider:'nebius',model:ultra,role:'compass',usage:{prompt_tokens:1e6,completion_tokens:0}});release();await inFlight;
  assert.equal((await flight.snapshot()).today.calls,2);await assert.rejects(callChatTurn(args(flight,{fetchImpl})),{code:'budget-exhausted'});
});

test('queued and retried attempts recheck the budget immediately before fetch',async()=>{
  const ledger=createProviderUsageLedger({filePath:null,environment:{COMPASS_DAILY_BUDGET_USD:'1'},logger:null});let calls=0;
  const delayed={run:async(_deadline,attempt)=>{await ledger.record({provider:'nebius',model:ultra,usage:{prompt_tokens:1e6,completion_tokens:0}});return attempt();}};
  await assert.rejects(callChatTurn(args(ledger,{controls:delayed,fetchImpl:async()=>{calls++;return envelope();}})),{code:'budget-exhausted'});assert.equal(calls,0);
  const retryLedger=createProviderUsageLedger({filePath:null,environment:{COMPASS_DAILY_BUDGET_USD:'1'},logger:null});
  const retryControls=createProviderControls({rpm:100,concurrency:2,maxRetries:1});
  await assert.rejects(callChatTurn(args(retryLedger,{controls:retryControls,fetchImpl:async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '0'},text:async()=>JSON.stringify({usage:{prompt_tokens:1e6,completion_tokens:0},error:'retry later'})};}})),{code:'budget-exhausted'});
  assert.equal(calls,1);assert.equal((await retryLedger.snapshot()).today.calls,1);
});

test('usage on truncated, malformed, tool and HTTP-error replies is counted before caller validation',async()=>{
  const ledger=createProviderUsageLedger({filePath:null});
  for(const extra of [{choices:[{message:{content:'{}'},finish_reason:'length'}]},{choices:[]},{choices:[{message:{tool_calls:[{id:'x',type:'function',function:{name:'invalid',arguments:'{}'}}]},finish_reason:'tool_calls'}]}]){
    try{await callChatCompletion(args(ledger,{fetchImpl:async()=>envelope({prompt_tokens:5,completion_tokens:2},extra)}));}catch{}
  }
  await assert.rejects(callChatTurn(args(ledger,{fetchImpl:async()=>({ok:false,status:400,headers:{get:()=>null},text:async()=>JSON.stringify({usage:{prompt_tokens:5,completion_tokens:2},error:'invalid request'})})})));assert.equal((await ledger.snapshot()).today.calls,4);
});

test('budget reason propagates through ranking, planner record, investigator, interpretation and narration',async()=>{
  const ledger=createProviderUsageLedger({filePath:null,environment:{COMPASS_DAILY_BUDGET_USD:'1'},logger:null});await ledger.record({provider:'nebius',model:ultra,usage:{prompt_tokens:1e6,completion_tokens:0}});
  let calls=0;const options={...args(ledger,{fetchImpl:async()=>{calls++;throw Error('must not fetch');}}),mode:'live'};
  assert.equal((await requestAgentRecommendation({},options)).reason,'budget-exhausted');assert.equal((await requestEventProposal({},options)).reason,'budget-exhausted');
  const state=scenarioState(scenarios[0]),issue={id:'TARGET',equipmentId:'EQ-04',issueClass:'A',status:'PENDING',raisedAt:state.simulationState.simulationTime,symptom:{code:'A-DRIFT',text:'Output drifts from the operating reference.'},reportNarrative:'Output drifts from reference.'};state.issues.push(issue);
  assert.equal((await investigate(state,issue,options)).fallbackReason,'budget-exhausted');
  assert.equal((await rankInterpretations({narrative:issue.reportNarrative,interpretation:{options:[{optionId:'OPTION-1'}]}},options)).fallbackReason,'budget-exhausted');
  assert.equal((await narrateIssue(state,issue,options)).reason,'budget-exhausted');
  assert.equal((await requestFixRanking(buildFixPacket(state,issue.id),options)).reason,'budget-exhausted');
  assert.equal((await requestStaffingRanking({candidates:[]},options)).reason,'budget-exhausted');
  const plannerState=scenarioState(scenarios[0]);plannerState.investigationPolicy.investigationShare=0;const store=memoryInvestigationStore(plannerState);
  await createEventPlanningService(store,{plannerOptions:options}).handleEventDue({token:'budget-event'});
  assert.equal((await store.snapshot()).operationalEvents.at(-1).payload.fallbackReason,'budget-exhausted');assert.equal(calls,0);
});

test('retention persists at most 120 UTC days; partial usage never erases known spend',async(t)=>{
  const filePath=join(await scratch(t),'usage.json');let clock=Date.parse('2026-01-01T00:00:00Z');const ledger=createProviderUsageLedger({filePath,now:()=>clock});
  for(let i=0;i<125;i++){await ledger.record({provider:'nebius',model:ultra,usage:{prompt_tokens:1,completion_tokens:1}});clock+=86400000;}
  const stored=JSON.parse(await readFile(filePath,'utf8'));assert.equal(stored.days.length,120);assert.equal(stored.days[0].day,'2026-01-06');
  clock-=86400000;await ledger.record({provider:'nebius',model:ultra,usage:{prompt_tokens:100}});const today=(await ledger.snapshot()).today;
  assert.equal(today.estimatedCostUsd,null);assert.equal(today.knownCostUsd,.000004);assert.equal(today.unpricedCalls,1);assert.equal((await ledger.snapshot()).last7Days.length,7);
});

test('usage API is deployment-global and readable on tunnel requests; budget is env-only',async(t)=>{
  const dir=await scratch(t),usageLedger=createProviderUsageLedger({filePath:null,environment:{COMPASS_DAILY_BUDGET_USD:'2'}});
  await usageLedger.record({provider:'nebius',model:ultra,role:'investigator',usage:{prompt_tokens:100,completion_tokens:50}});
  const service=createProviderSettingsService({filePath:join(dir,'settings.json'),usageLedger,apiKeys:{},environment:{}});
  const handler=createRequestHandler({},null,service);const response={writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body);}};
  await handler({method:'GET',url:'/api/settings',headers:{host:'localhost','cf-connecting-ip':'203.0.113.1'}},response);
  assert.equal(response.status,200);assert.equal(response.body.editable,false);assert.equal(response.body.usage.budgetUsd,2);assert.equal(response.body.usage.today.byRole[0].role,'investigator');
  await assert.rejects(service.update({budgetUsd:100}),/Select|model|provider/i);
});

test('invalid configuration or corrupt accounting fails closed without rewriting data',async(t)=>{
  for(const value of ['-1','NaN','Infinity'])assert.throws(()=>dailyBudget({COMPASS_DAILY_BUDGET_USD:value}));
  assert.equal(dailyBudget({}),0);assert.equal(dailyBudget({COMPASS_DAILY_BUDGET_USD:'0'}),0);
  const filePath=join(await scratch(t),'usage.json');await writeFile(filePath,'not JSON');const ledger=createProviderUsageLedger({filePath});let calls=0;
  await assert.rejects(callChatTurn(args(ledger,{fetchImpl:async()=>{calls++;return envelope();}})),{code:'usage-ledger-unavailable'});assert.equal(calls,0);assert.equal(await readFile(filePath,'utf8'),'not JSON');
});


test('small priced increments reach an exact budget without floating-point undercount',async()=>{
  const ledger=createProviderUsageLedger({filePath:null,environment:{COMPASS_DAILY_BUDGET_USD:'1'},logger:null});
  for(let i=0;i<10;i++)await ledger.record({provider:'nebius',model:ultra,usage:{prompt_tokens:100000,completion_tokens:0}});
  assert.equal((await ledger.snapshot()).today.knownCostUsd,1);await assert.rejects(ledger.beforeStart(),{code:'budget-exhausted'});
});


test('budget preflight cannot extend the original provider deadline',async()=>{
  let clock=0,checks=0,calls=0;
  const ledger={beforeStart:async()=>{if(++checks===2)clock=20;},record:async()=>{}};
  await assert.rejects(callChatTurn(args(ledger,{now:()=>clock,timeoutMs:10,fetchImpl:async()=>{calls++;return envelope();}})),{code:'deadline'});
  assert.equal(calls,0);
});
test('an empty ranking response falls back with a named reason instead of throwing',async()=>{
  const report={narrative:'Station 12 transfer stops short.',interpretation:{options:[{optionId:'OPTION-1',equipmentId:'EQ-1',equipmentName:'Station 1',issueClass:'B',symptomCode:'B-STOP',symptomText:'Transfer stops.'}]}};
  const fetchImpl=async()=>({ok:true,headers:{get:()=>null},json:async()=>({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:'null'},finish_reason:'stop'}]})});
  const result=await rankInterpretations(report,{provider:'nebius',modelId:'nvidia/nemotron-3-super-120b-a12b',apiKey:'test-key',fetchImpl});
  assert.equal(result.source,'DETERMINISTIC');
  assert.equal(result.fallbackReason,'invalid-output: shape');
});
test('a dropped connection or an unknown option gets one retry before falling back',async()=>{
  const report={narrative:'Station 12 transfer stops short.',interpretation:{options:[{optionId:'OPTION-1',equipmentId:'EQ-1',equipmentName:'Station 1',issueClass:'B',symptomCode:'B-STOP',symptomText:'Transfer stops.'}]}};
  const envelope=(content)=>({ok:true,headers:{get:()=>null},json:async()=>({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content},finish_reason:'stop'}]})});
  const good=envelope(JSON.stringify({rankedOptions:[{optionId:'OPTION-1',rationale:'Matches the reported stopping behaviour.'}]}));
  const bad=envelope(JSON.stringify({rankedOptions:[{optionId:'OPTION-9',rationale:'Matches the reported stopping behaviour.'}]}));
  const scripted=(responses)=>{let i=0;return {provider:'nebius',modelId:'nvidia/nemotron-3-super-120b-a12b',apiKey:'test-key',fetchImpl:async()=>{const r=responses[Math.min(i,responses.length-1)];i+=1;if(r instanceof Error) throw r;return r;}};};
  assert.equal((await rankInterpretations(report,scripted([new TypeError('fetch failed'),good]))).source,'NEBIUS_MODEL');
  assert.equal((await rankInterpretations(report,scripted([bad,good]))).source,'NEBIUS_MODEL');
  assert.equal((await rankInterpretations(report,scripted([bad,bad]))).fallbackReason,'invalid-output: unknown-option "OPTION-9"');
});
