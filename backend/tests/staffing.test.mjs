import {initializeFaults} from '../src/fault-truth.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSeed} from '../seed/live-simulation.mjs';
import {lawfulStaffingOptions,claimWorkforceDueTriggers} from '../src/workforce-continuity.mjs';
import {buildStaffingPacket,createStaffingReview,decideStaffing,finishStaffingDeadline,updateStaffingPolicy,createStaffingService} from '../src/staffing-service.mjs';
import {validateStaffingRanking,requestStaffingRanking} from '../src/staffing-ranking.mjs';
import {assertNoResponderSkill,assertNoFaultTruth,createPublicLiveSnapshot} from '../src/live-schema.mjs';
import {migrateLiveState} from '../src/live-migration.mjs';
import {createScheduler} from '../src/scheduler.mjs';
import {buildAnalytics} from '../src/analytics-service.mjs';
import {compactHistory} from '../src/history-retention.mjs';
function seed(){
 const s=createLiveSeed();s.simulationState.status='RUNNING';
 const template=s.issues.find((i)=>i.status==='PENDING');
 for(const [i,e] of s.equipment.filter((e)=>e.status==='NORMAL').slice(0,6).entries())s.issues.push({...template,id:`ISS-${200+i}`,equipmentId:e.id,status:'PENDING',issueClass:'A'});
 for(const e of s.equipment)if(s.issues.some((i)=>i.equipmentId===e.id&&i.status!=='RESOLVED'))e.status='ISSUE_ACTIVE';
 return initializeFaults(s);
}
function review(s,token='test-1'){createStaffingReview(s,{kind:'STAFFING_RECHECK',token});return s.workforceContinuity.staffingRecommendations.at(-1);}
const ranked=(packet)=>({schemaVersion:'1.0',rankedOptions:packet.candidates.map((c,i)=>({optionId:c.optionId,rank:i+1,rationale:'Observed backlog coverage with uncertain thin evidence.'}))});
function memory(s){return {snapshot:async()=>structuredClone(s),project:async(f)=>f(s),mutate:async(label,f)=>({result:structuredClone(await f(s))})};}
test('all lawful options respect rest, duty, cap and surge; evidence excludes all hidden truth',()=>{
 const s=seed();const options=lawfulStaffingOptions(s);assert.ok(options.filter((o)=>o.kind==='EXTENSION').length>1);assert.ok(options.some((o)=>o.kind==='CALL_IN'));
 const r=s.responders.find((r)=>r.availability==='UNAVAILABLE');r.lastDutyEndedAt='2026-09-01T00:00:00.000Z';assert.ok(!lawfulStaffingOptions(s).some((o)=>o.responderId===r.id));r.lastDutyEndedAt='2026-08-31T20:00:00.000Z';assert.ok(lawfulStaffingOptions(s).some((o)=>o.responderId===r.id));
 const on=s.responders.find((r)=>r.availability==='AVAILABLE');on.dutyStartedAt='2026-08-31T16:00:00.000Z';assert.ok(!lawfulStaffingOptions(s).some((o)=>o.responderId===on.id));
 const packet=buildStaffingPacket(s,'test');assertNoResponderSkill(packet);assertNoFaultTruth(packet);assert.ok(!/responderSkills|faultTruth|trueMedian|trueSuccess|salary|seniority/.test(JSON.stringify(packet)));
 for(const c of packet.candidates) assert.ok(c.experience.every((e)=>Number.isFinite(e.classEvidence.smoothedSuccess)));
 for(const r of s.responders.filter((r)=>r.availability!=='UNAVAILABLE').slice(0,2))r.surgeKind='EXTENSION';assert.equal(lawfulStaffingOptions(s).length,0);
 for(const r of s.responders.slice(0,8)) {r.availability='AVAILABLE';delete r.surgeKind;}assert.equal(lawfulStaffingOptions(s).length,0);
});
test('fallback prefers extension then observed class coverage then ID, baseline preserves first ID',()=>{
 const s=seed();s.resolutionHistory=[];const on=s.responders.filter((r)=>r.availability==='AVAILABLE').sort((a,b)=>a.id.localeCompare(b.id));
 s.resolutionHistory=[{responderId:on.at(-1).id,issueClass:'A',success:true,resolutionMinutes:10,symptomCode:s.issues.find((i)=>i.issueClass==='A').symptom.code}];
 const p=buildStaffingPacket(s,'test');assert.equal(p.candidates[0].responderId,on.at(-1).id);assert.equal(p.baselineOptionId,`EXTENSION:${on[0].id}`);assert.ok(p.candidates[0].experience.some((e)=>e.symptomEvidence.attempts===1));
});
test('review does not mutate staffing; approve alternative and reject are audited, revisions conflict',()=>{
 const s=seed(),before=structuredClone(s.responders),rec=review(s);assert.deepEqual(s.responders,before);
 assert.equal(decideStaffing(s,rec.id,{decision:'approve',optionId:rec.rankedOptions[0].optionId}).status,'CONFLICT');
 assert.equal(decideStaffing(s,rec.id,{decision:'approve',optionId:'invented',expectedRevision:0}).status,'INVALID_OPTION');
 assert.equal(decideStaffing(s,rec.id,{decision:'approve',optionId:rec.rankedOptions[1].optionId,expectedRevision:0}).status,'APPROVED_ALTERNATIVE');
 assert.equal(s.workforceContinuity.staffingAudit.at(-1).actor,'Central command');
 const next=review(s,'test-2');const beforeReject=structuredClone(s.responders);
 assert.equal(decideStaffing(s,next.id,{decision:'reject',reason:'Hold coverage',expectedRevision:0}).status,'REJECTED');assert.deepEqual(s.responders,beforeReject);
 assert.equal(decideStaffing(s,next.id,{decision:'reject',expectedRevision:next.revision}).status,'CONFLICT');
});
test('stale approvals apply nothing; newer reviews supersede; deadlines never cross handover',()=>{
 const s=seed(),r=review(s),newer=review(s,'test-2');assert.equal(r.status,'SUPERSEDED');
 const selected=newer.packet.candidates.find((c)=>c.optionId===newer.rankedOptions[0].optionId);s.responders.find((r)=>r.id===selected.responderId).availability='UNAVAILABLE';const before=structuredClone(s.responders);
 assert.equal(decideStaffing(s,newer.id,{decision:'approve',optionId:selected.optionId,expectedRevision:0}).status,'STALE');assert.deepEqual(s.responders,before);
 const late=seed();late.simulationState.simulationTime='2026-09-01T19:50:00.000Z';const last=review(late);assert.equal(last.deadline,'2026-09-01T20:00:00.000Z');
});
test('deadline claims are idempotent, restart redispatches durable claim, expiry preserves staff and risk',async()=>{
 const s=seed(),rec=review(s),before=structuredClone(s.responders);s.simulationState.simulationTime=rec.deadline;
 const trigger=claimWorkforceDueTriggers(s).find((t)=>t.kind==='STAFFING_DEADLINE_DUE');assert.ok(trigger);assert.ok(!claimWorkforceDueTriggers(s).some((t)=>t.kind==='STAFFING_DEADLINE_DUE'));
 const resumed=migrateLiveState(s);const staffingBefore=structuredClone(resumed.responders.map(({id,availability,dutyStartedAt,surgeKind,extensionEndsAt})=>({id,availability,dutyStartedAt,surgeKind,extensionEndsAt})));const scheduler=createScheduler(memory(resumed),{onWorkforceDue:async(t)=>finishStaffingDeadline(resumed,t)});await scheduler.reconcileClaimedTriggers();
 assert.equal(resumed.workforceContinuity.staffingRecommendations[0].status,'EXPIRED');assert.deepEqual(resumed.responders.map(({id,availability,dutyStartedAt,surgeKind,extensionEndsAt})=>({id,availability,dutyStartedAt,surgeKind,extensionEndsAt})),staffingBefore);assert.equal(finishStaffingDeadline(resumed,trigger).status,'ALREADY_APPLIED');assert.ok(resumed.workforceContinuity.staffingAudit.some((a)=>a.action==='UNMET_STAFFING_RISK'));
});
test('auto-approve policy is explicit and audited and revalidates at deadline; policy revisions conflict',()=>{
 const s=seed();assert.equal(s.workforceContinuity.staffingApproval,'OPERATOR');assert.equal(updateStaffingPolicy(s,{staffingApproval:'AUTO_APPROVE_TOP',expectedRevision:4}).status,'CONFLICT');
 assert.equal(updateStaffingPolicy(s,{staffingApproval:'AUTO_APPROVE_TOP',expectedRevision:0}).status,'UPDATED');const rec=review(s);s.simulationState.simulationTime=rec.deadline;
 const t=claimWorkforceDueTriggers(s).find((t)=>t.kind==='STAFFING_DEADLINE_DUE');assert.equal(finishStaffingDeadline(s,t).status,'AUTO_APPROVED');assert.equal(s.workforceContinuity.staffingAudit.at(-1).actor,'Room policy');assert.equal(s.operationalEvents.at(-1).payload.label,'Auto-approved by policy');
});
test('staffing validator rejects unknown, duplicate, missing, extra and invented numeric evidence; API-free fixture and bounded repair',async()=>{
 const p=buildStaffingPacket(seed(),'test'),valid=ranked(p);assert.ok(validateStaffingRanking(p,valid).valid);
 for(const mutate of [r=>r.rankedOptions.pop(),r=>r.rankedOptions[0].optionId='alien',r=>r.rankedOptions[1].optionId=r.rankedOptions[0].optionId,r=>r.rankedOptions[0]=null,r=>r.rankedOptions[0].rationale='Exactly 987654 successes',r=>r.ResponderSkill=1]){const copy=structuredClone(valid);mutate(copy);assert.equal(validateStaffingRanking(p,copy).valid,false);}
 assert.equal((await requestStaffingRanking(p,{mode:'fixture',fetchImpl:()=>{throw Error('no network');}})).status,'ok');
 let calls=0;const fetchImpl=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(++calls===1?{}:valid)}}]})});
 assert.equal((await requestStaffingRanking(p,{mode:'live',apiKey:'hermetic',fetchImpl,timeoutMs:2000})).status,'ok');assert.equal(calls,2);
});
test('live staffing ranking defaults to global fetch and repairs numeric prose once', async (t) => {
 const packet=buildStaffingPacket(seed(),'test'),valid=ranked(packet),requests=[];
 t.mock.method(globalThis,'fetch',async (_url, options)=>{
  const request=JSON.parse(options.body);requests.push(request);
  const result=structuredClone(valid);
  if(requests.length===1)result.rankedOptions[0].rationale='A sample of 1 supports coverage.';
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]})};
 });
 const outcome=await requestStaffingRanking(packet,{mode:'live',apiKey:'hermetic-test',timeoutMs:2000});
 assert.equal(outcome.status,'ok');assert.equal(requests.length,2);assert.equal(outcome.modelInfo.provider,'amd');
 assert.match(requests[0].messages[0].content,/no digits at all/);
 assert.match(requests[1].messages[1].content,/Rationale must use no digits/);
});
test('staffing prose rejects even packet-supplied numbers and only exempts exact supplied option IDs',()=>{
 const packet=buildStaffingPacket(seed(),'test');packet.backlogCount=42;
 for(const rationale of ['Coverage from 42 attempts.','Success is 0.5.','About 12 hours remain.','Rank 1 has stronger coverage.']){
  const result=ranked(packet);result.rankedOptions[0].rationale=rationale;
  assert.equal(validateStaffingRanking(packet,result).valid,false,rationale);
 }
 const result=ranked(packet);result.rankedOptions[0].rationale=`${packet.candidates[0].optionId} has stronger backlog coverage.`;
 assert.equal(validateStaffingRanking(packet,result).valid,true);
 result.rankedOptions[0].rationale+=' 42';assert.equal(validateStaffingRanking(packet,result).valid,false);
});
test('late staffing ranking cannot change a decided or reset recommendation; migration preserves legacy audit',async()=>{
 const s=seed(),r=review(s);let release;const wait=new Promise((resolve)=>release=resolve);const svc=createStaffingService(memory(s),{requestRanking:async()=>wait});
 const work=svc.rankNext();await new Promise((resolve)=>setImmediate(resolve));decideStaffing(s,r.id,{decision:'reject',expectedRevision:0});release({status:'ok',result:ranked(r.packet)});await work;assert.equal(r.status,'REJECTED');
 const old=createLiveSeed();old.workforceContinuity.staffingAudit.push({id:'legacy',action:'EXTENSION'});delete old.workforceContinuity.staffingApproval;delete old.workforceContinuity.staffingRecommendations;
 const migrated=migrateLiveState(old);assert.equal(migrated.workforceContinuity.staffingApproval,'OPERATOR');assert.equal(migrated.workforceContinuity.staffingRecommendations.length,0);assert.deepEqual(migrated.workforceContinuity.staffingAudit,old.workforceContinuity.staffingAudit);
});
test('staffing analytics retain exact decision counts and denominators across archive compaction',()=>{
 const s=seed();for(let n=0;n<4;n++){const r=review(s,`r-${n}`);decideStaffing(s,r.id,{decision:'reject',expectedRevision:0});}
 const before=buildAnalytics(s).workforce.recommendations;assert.equal(before.totalDecisions,4);assert.equal(before.outcomes.REJECTED.denominator,4);
 compactHistory(s,1,{force:true});assert.deepEqual(buildAnalytics(s).workforce.recommendations,before);assertNoResponderSkill(createPublicLiveSnapshot(s));
});
test('pending staffing model waits yield the live lane and clock; expired responses do not mutate staff',async()=>{
 const {createLiveRuntime}=await import('../src/live-runtime.mjs');
 const s=seed(),rec=review(s),store=memory(s);store.publicSnapshot=async()=>createPublicLiveSnapshot(s);
 let release,started;const seen=new Promise((r)=>started=r),wait=new Promise((r)=>release=r);
 const runtime=createLiveRuntime({store,plannerOptions:{mode:'force-failure'},agentOptions:{mode:'force-failure'},requestStaffingRecommendation:async(p)=>{started(p);return wait;}});
 await runtime.runScheduledTick();const packet=await seen;
 const before=Date.parse(s.simulationState.simulationTime);await new Promise((r)=>setTimeout(r,20));await runtime.runScheduledTick();assert.ok(Date.parse(s.simulationState.simulationTime)>before);
 // An explicit operator action must be unable to claim the internal policy bypass.
 const bypass=await runtime.decideStaffing(rec.id,{decision:'approve',optionId:rec.rankedOptions[0].optionId,automatic:true});assert.equal(bypass.action.status,'CONFLICT');
 const result=await runtime.decideStaffing(rec.id,{decision:'reject',expectedRevision:rec.revision});assert.equal(result.action.status,'REJECTED');
 release({status:'ok',result:ranked(packet)});await runtime.agentWorkIdle();assert.equal(rec.status,'REJECTED');
});
test('closed packet retention is bounded while compact outcome facts and public history remain exact',()=>{
 const s=seed();for(let n=0;n<45;n++){const r=review(s,`bounded-${n}`);decideStaffing(s,r.id,{decision:'reject',expectedRevision:r.revision});}
 assert.equal(s.workforceContinuity.staffingRecommendations.length,30);assert.equal(buildAnalytics(s).workforce.recommendations.outcomes.REJECTED.numerator,45);
 const pub=createPublicLiveSnapshot(s);assert.equal(pub.workforceContinuity.staffingRecommendations.length,5);assertNoResponderSkill(pub);
});
test('call-in approval starts legal duty; extension end respects sixteen hours and remains lawful through handover',()=>{
 const s=seed(),r=review(s);const option=r.packet.candidates.find((o)=>o.kind==='CALL_IN');
 assert.equal(decideStaffing(s,r.id,{decision:'approve',optionId:option.optionId,expectedRevision:0}).status,'APPROVED_ALTERNATIVE');
 const called=s.responders.find((p)=>p.id===option.responderId);assert.equal(called.availability,'AVAILABLE');assert.equal(called.dutyStartedAt,s.simulationState.simulationTime);assert.equal(called.lastDutyEndedAt,null);
 const late=seed();late.simulationState.simulationTime='2026-09-01T18:00:00.000Z';const ext=review(late);const row=ext.packet.candidates.find((o)=>o.kind==='EXTENSION');
 assert.equal((Date.parse(row.legalEndsAt)-Date.parse(late.responders.find((r)=>r.id===row.responderId).dutyStartedAt))/3600000,16);
 assert.equal(decideStaffing(late,ext.id,{decision:'approve',optionId:row.optionId,expectedRevision:0}).status,'APPROVED_TOP');
});
test('room staffing HTTP routes reject policy bypass, map revisions/stale/invalid IDs, and approve/reject real state',async()=>{
 const {createRequestHandler}=await import('../src/server.mjs');const {wrapRuntimeAsSingleRoomManager,roomUrl}=await import('./helpers/single-room-manager.mjs');const {createLiveRuntime}=await import('../src/live-runtime.mjs');
 const s=seed(),rec=review(s),store=memory(s);store.publicSnapshot=async()=>createPublicLiveSnapshot(s);
 const handler=createRequestHandler(wrapRuntimeAsSingleRoomManager(createLiveRuntime({store,plannerOptions:{mode:'force-failure'},agentOptions:{mode:'force-failure'}})));
 const invoke=async(method,path,body)=>{let raw;const response={status:0,writeHead(status){this.status=status;},end(value){raw=value;}};await handler({method,url:roomUrl(path),headers:{host:'localhost','content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body??{}));}},response);return {status:response.status,body:JSON.parse(raw)};};
 assert.equal((await invoke('POST',`/staffing/${rec.id}/approve`,{optionId:rec.rankedOptions[0].optionId,automatic:true})).status,409);
 assert.equal((await invoke('POST',`/staffing/${rec.id}/approve`,{optionId:'invented',expectedRevision:0})).status,400);
 assert.equal((await invoke('POST','/staffing/missing/reject',{expectedRevision:0})).status,404);
 const approved=await invoke('POST',`/staffing/${rec.id}/approve`,{optionId:rec.rankedOptions[0].optionId,expectedRevision:0});assert.equal(approved.status,200);assert.equal(approved.body.action.status,'APPROVED_TOP');
 assert.equal((await invoke('POST',`/staffing/${rec.id}/reject`,{expectedRevision:0})).status,409);
 const next=review(s,'http-next');const rejected=await invoke('POST',`/staffing/${next.id}/reject`,{reason:'Wait for review',expectedRevision:0});assert.equal(rejected.body.action.status,'REJECTED');
 const stale=review(s,'http-stale');s.simulationState.simulationTime=stale.deadline;
 assert.equal((await invoke('POST',`/staffing/${stale.id}/approve`,{optionId:stale.rankedOptions[0].optionId,expectedRevision:0})).status,409);assert.equal(stale.status,'PENDING');
 const deadline=claimWorkforceDueTriggers(s).find((t)=>t.kind==='STAFFING_DEADLINE_DUE');finishStaffingDeadline(s,deadline);assert.equal(stale.status,'EXPIRED');
 assert.equal((await invoke('PATCH','/demo/staffing-policy',{staffingApproval:'AUTO_APPROVE_TOP',expectedRevision:0})).status,200);
 assertNoResponderSkill((await invoke('GET','/state')).body);
});

test('late operator action never invokes policy auto-approval or changes staff',()=>{
 const s=seed();updateStaffingPolicy(s,{staffingApproval:'AUTO_APPROVE_TOP',expectedRevision:0});const r=review(s);s.simulationState.simulationTime=r.deadline;const before=structuredClone(s.responders);
 assert.equal(decideStaffing(s,r.id,{decision:'approve',optionId:r.rankedOptions[0].optionId,expectedRevision:0}).status,'STALE');assert.deepEqual(s.responders,before);
 assert.equal(r.status,'PENDING');const t=claimWorkforceDueTriggers(s).find((t)=>t.kind==='STAFFING_DEADLINE_DUE');assert.equal(finishStaffingDeadline(s,t).status,'AUTO_APPROVED');
});

test('replacement reviews preserve the original deadline and no-action rechecks cannot cancel expiry',()=>{
 const s=seed(),first=review(s);s.simulationState.simulationTime=new Date(Date.parse(first.createdAt)+60000).toISOString();const newer=review(s,'deadline-replacement');assert.equal(first.status,'SUPERSEDED');assert.equal(newer.deadline,first.deadline);
 const pending=structuredClone(newer);s.issues.forEach((i)=>i.status='RESOLVED');createStaffingReview(s,{kind:'STAFFING_RECHECK',token:'cleared-backlog'});assert.equal(newer.status,'PENDING');assert.equal(newer.deadline,pending.deadline);
 s.simulationState.simulationTime=newer.deadline;const trigger=claimWorkforceDueTriggers(s).find((t)=>t.kind==='STAFFING_DEADLINE_DUE');assert.equal(finishStaffingDeadline(s,trigger).status,'EXPIRED');
 assert.ok(!s.workforceContinuity.staffingAudit.some((r)=>r.id===`risk-${newer.id}`));
});
test('reset reusing a recommendation ID and timestamp cannot accept an old model response',async()=>{
 const s=seed();review(s);const store=memory(s);let releaseOld,releaseNew;
 const oldWait=new Promise((r)=>releaseOld=r),newWait=new Promise((r)=>releaseNew=r);
 const oldService=createStaffingService(store,{requestRanking:async()=>oldWait});
 const oldWork=oldService.rankNext();await new Promise((r)=>setImmediate(r));
 const old=s.workforceContinuity.staffingRecommendations[0],oldToken=old.requestToken;
 s.workforceContinuity=createLiveSeed().workforceContinuity;
 const replacement=review(s);assert.equal(replacement.id,old.id);assert.equal(replacement.createdAt,old.createdAt);
 const newService=createStaffingService(store,{agentOptions:{mode:'fixture'},requestRanking:async()=>newWait});
 const newWork=newService.rankNext();await new Promise((r)=>setImmediate(r));const currentToken=replacement.requestToken;assert.notEqual(currentToken,oldToken);
 releaseOld({status:'ok',result:ranked(old.packet)});await oldWork;
 assert.equal(replacement.requestToken,currentToken);assert.equal(replacement.rankingStatus,'PENDING_MODEL');
 releaseNew({status:'ok',result:ranked(replacement.packet)});await newWork;
 assert.equal(replacement.rankingStatus,'READY');assert.equal(replacement.source,'FIXTURE');
});

test('an on-duty responder who is busy on a job remains a lawful extension, so approval does not go stale', () => {
  const s = seed();
  const busy = s.responders.find((r) => r.availability === 'AVAILABLE' && lawfulStaffingOptions(s).some((o) => o.responderId === r.id && o.kind === 'EXTENSION'));
  assert.ok(busy, 'fixture has an extension candidate');
  busy.availability = 'ASSIGNED';
  assert.ok(lawfulStaffingOptions(s).some((o) => o.optionId === `EXTENSION:${busy.id}`));
});
