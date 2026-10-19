import { mkdir as ensureScratchDirectory } from "node:fs/promises";
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSeed} from '../seed/live-simulation.mjs';
import {buildFixPacket,fallbackFixOrder} from '../src/fix-evidence.mjs';
import {requestFixRanking,validateFixRanking} from '../src/fix-ranking.mjs';
import {createFixRecommendationService} from '../src/fix-recommendation-service.mjs';
import {createPublicLiveSnapshot,assertNoResponderSkill} from '../src/live-schema.mjs';

const resultFor=(packet)=>({schemaVersion:'1.0',rankedFixes:fallbackFixOrder(packet)});
function memoryStore(){let state=createLiveSeed();return {snapshot:async()=>structuredClone(state),publicSnapshot:async()=>createPublicLiveSnapshot(state),mutate:async(label,fn)=>({result:await fn(state)}),state:()=>state};}

test('fix validator rejects missing, invented, duplicate, malformed and numerically invented results',()=>{
 const packet=buildFixPacket(createLiveSeed(),'ISS-104');const valid=resultFor(packet);assert.equal(validateFixRanking(packet,valid).valid,true);
 for(const mutate of [r=>r.rankedFixes.pop(),r=>r.rankedFixes[0].fixId='FIX-B-99',r=>r.rankedFixes[1].fixId=r.rankedFixes[0].fixId,r=>r.rankedFixes[0]=null,r=>r.rankedFixes[0].rationale='Success is 987654 percent.',r=>r.rankedFixes[0].rationale='Apply FIX-B-99.',r=>r.faultCause='secret']){
 const invalid=structuredClone(valid);mutate(invalid);assert.equal(validateFixRanking(packet,invalid).valid,false);
 }
});

test('Offline fix fixture is API-free and live invalid ranking gets only one bounded repair',async()=>{
 const packet=buildFixPacket(createLiveSeed(),'ISS-104');let calls=0;
 const offline=await requestFixRanking(packet,{mode:'fixture',fetchImpl:()=>{throw Error('network forbidden');}});assert.equal(offline.status,'ok');
 const raw=resultFor(packet);const fake=async(_url,options)=>{calls++;const body=JSON.parse(options.body);assertNoResponderSkill(JSON.parse(body.messages[1].content));return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(calls===1?{...raw,rankedFixes:[]}:raw)}}]})};};
 const live=await requestFixRanking(packet,{mode:'live',apiKey:'hermetic-test',fetchImpl:fake,timeoutMs:2000});assert.equal(live.status,'ok');assert.equal(calls,2);
 const unavailable=await requestFixRanking(packet,{mode:'force-failure',fetchImpl:fake});assert.equal(unavailable.status,'unavailable');assert.equal(calls,2);
});

test('fix inference persists observed request evidence and rejects invented output before mutation',async()=>{
 const store=memoryStore();const service=createFixRecommendationService(store,{agentOptions:{mode:'force-failure'},requestRanking:async p=>({status:'ok',result:{schemaVersion:'1.0',rankedFixes:[{fixId:'invented',rank:1,rationale:'Fake fix'}]}})});
 await service.recommend('ISS-104');const rec=store.state().issues.find(i=>i.id==='ISS-104').fixRecommendation;
 assert.equal(rec.source,'DETERMINISTIC');assert.equal(rec.reason,'validation-failed');assert.equal(rec.rankedFixes.length,6);assertNoResponderSkill(await store.publicSnapshot());
});

test('late fix responses cannot overwrite a reset request; resolved work cancels pending inference',async()=>{
 const store=memoryStore();let release,started;const ready=new Promise(r=>started=r);const pending=new Promise(r=>release=r);
 const service=createFixRecommendationService(store,{requestRanking:async p=>{started(p);return pending;}});
 const work=service.recommend('ISS-104');const packet=await ready;
 const issue=store.state().issues.find(i=>i.id==='ISS-104');issue.status='RESOLVED';
 release({status:'ok',result:resultFor(packet),modelInfo:{mode:'live',provider:'amd',modelId:'synthetic-model'}});await work;
 assert.equal(issue.fixRecommendation.status,'CANCELLED');assert.equal(issue.fixRecommendation.source,'DETERMINISTIC');
});

test('a pending fix provider wait yields the live agent lane and never holds dispatch or the clock', async (t) => {
 const {mkdtemp,rm}=await import('node:fs/promises');const {join}=await import('node:path');
 const {createLiveStore}=await import('../src/live-store.mjs');const {createLiveRuntime}=await import('../src/live-runtime.mjs');
 const dir=await (ensureScratchDirectory(new URL('../../.cache/', import.meta.url), { recursive: true })).then(() => mkdtemp(new URL('../../.cache/fix-lane-',import.meta.url).pathname));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createLiveStore({filePath:join(dir,'live.json')});let release,started;
 const providerStarted=new Promise(r=>started=r);const blocked=new Promise(r=>release=r);
 const runtime=createLiveRuntime({store,plannerOptions:{mode:'force-failure'},agentOptions:{mode:'force-failure'},requestFixRecommendation:async packet=>{started(packet);return blocked;}});
 await runtime.setSpeed(60);await runtime.start();await runtime.runScheduledTick();
 const packet=await providerStarted;
 // A normal responder recommendation can still complete while the fix request waits.
 const response=await Promise.race([runtime.recommend('ISS-104'),new Promise((_,reject)=>setTimeout(()=>reject(Error('dispatch blocked by fix ranking')),1000))]);
 assert.ok(response.issues.find(i=>i.id==='ISS-104').pendingOfferId);
 await store.mutate('new-work-during-fix-wait',(state)=>{
   const at=state.simulationState.simulationTime;
   state.issues.push({id:'ISS-105',equipmentId:'EQ-05',issueClass:'A',complexity:'STANDARD',status:'PENDING',existingPriority:'UNSPECIFIED',raisedAt:at,createdAt:at,downtimeStartedAt:at});
   state.equipment.find(e=>e.id==='EQ-05').status='ISSUE_ACTIVE';
 });
 const before=(await store.snapshot()).simulationState.simulationTime;
 await new Promise(r=>setTimeout(r,30));await runtime.runScheduledTick();
 assert.ok(Date.parse((await store.snapshot()).simulationState.simulationTime)>Date.parse(before));
 assert.equal((await runtime.snapshot()).agentActivity.fixes.status,'RUNNING');
 const dispatchDeadline=performance.now()+3000;
 while(!(await store.snapshot()).issues.find(i=>i.id==='ISS-105')?.pendingOfferId && performance.now()<dispatchDeadline) await new Promise(r=>setTimeout(r,10));
 assert.ok((await store.snapshot()).issues.find(i=>i.id==='ISS-105').pendingOfferId,'the real-time agent lane offered new work while fix inference was pending');
 release({status:'ok',result:resultFor(packet),modelInfo:{mode:'live',provider:'amd',modelId:'test-model'}});
 await runtime.agentWorkIdle();await runtime.pause();
});

test('replacing a fix request identity makes the previous provider result stale', async()=>{
 const store=memoryStore();let release,started;const ready=new Promise(r=>started=r);
 const service=createFixRecommendationService(store,{requestRanking:async packet=>{started(packet);return new Promise(r=>release=r);}});
 const pending=service.recommend('ISS-104');const packet=await ready;
 const issue=store.state().issues.find(i=>i.id==='ISS-104');
 issue.fixRecommendation={...issue.fixRecommendation,requestToken:'replacement-after-reset'};
 release({status:'ok',result:resultFor(packet),modelInfo:{mode:'live',provider:'amd',modelId:'old-result'}});
 const response=await pending;
 assert.equal(response.result.status,'STALE');assert.equal(issue.fixRecommendation.requestToken,'replacement-after-reset');assert.equal(issue.fixRecommendation.source,'DETERMINISTIC');
});

test('paused Live rooms do not initiate fix model calls',async()=>{
 const store=memoryStore();store.state().simulationState.status='PAUSED';let calls=0;
 const {createLiveRuntime}=await import('../src/live-runtime.mjs');
 const runtime=createLiveRuntime({store,plannerOptions:{mode:'force-failure'},agentOptions:{mode:'force-failure'},requestFixRecommendation:async()=>{calls++;return{status:'unavailable'};}});
 await runtime.runScheduledTick();await runtime.agentWorkIdle();assert.equal(calls,0);
});
