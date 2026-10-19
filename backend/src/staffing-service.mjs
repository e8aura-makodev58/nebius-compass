import { safeModelMetadata } from "./model-provider.mjs";
import { randomUUID } from 'node:crypto';
/** Observed evidence and approval lifecycle. Never consults simulation truth. */
import { getPerformanceSummary } from './context-engine.mjs';
import { activeIssueCount, priorityForIssue, lawfulStaffingOptions, applyStaffingOption, ROTATION_ANCHOR } from './workforce-continuity.mjs';
import { requestStaffingRanking, validateStaffingRanking } from './staffing-ranking.mjs';

export function initializeStaffing(config) {
  config.staffingApproval ??= 'OPERATOR';
  config.staffingPolicyRevision ??= 0;
  config.staffingDeadlineMinutes ??= 30;
  config.staffingRecommendations ??= [];
  config.staffingSequence ??= 0;
}
export function staffingBacklog(state) {
  const rows = state.issues.filter((i) => ['PENDING','RECOMMENDATION_READY','OFFER_PENDING','ASSIGNED'].includes(i.status));
  const groups = new Map();
  for (const i of rows) {
    const priorityBand = priorityForIssue(i, state.simulationState.simulationTime);
    const symptom = i.symptom?.code ?? null;
    const key = JSON.stringify([i.issueClass, priorityBand, symptom]);
    if (!groups.has(key)) groups.set(key, { issueClass: i.issueClass, priorityBand, symptom, count: 0 });
    groups.get(key).count++;
  }
  return [...groups.values()].sort((a,b) => a.issueClass.localeCompare(b.issueClass) || a.priorityBand.localeCompare(b.priorityBand) || String(a.symptom).localeCompare(String(b.symptom)));
}
function evidence(history, responderId, issueClass) {
  const summary = getPerformanceSummary(history, responderId, issueClass);
  const successes = (summary.successRate ?? 0) * summary.effectiveEvidenceWeight;
  return { ...summary, attempts: summary.sameIssueHistoricalCount, smoothedSuccess: (successes + 1) / (summary.effectiveEvidenceWeight + 2) };
}
export function buildStaffingPacket(state, id, now = state.simulationState.simulationTime) {
  const backlog = staffingBacklog(state);
  const legal = lawfulStaffingOptions(state, now);
  if (!legal.length) return { schemaVersion:'1.0', recommendationId:id, simulationTimestamp:now, backlog, candidates:[], activeStaff:state.responders.filter((r)=>r.availability!=='UNAVAILABLE').length, activeStaffCap:8, baselineOptionId:null };
  const index = new Map(), summaries = new Map();
  for (const h of state.resolutionHistory) {
    for (const responderId of new Set(h.participants?.map((p)=>p.responderId) ?? [h.responderId])) {
      for (const key of [`${responderId}|${h.issueClass}|class`, `${responderId}|${h.issueClass}|${h.symptomCode ?? ''}`]) {
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(h);
      }
    }
  }
  const observed = (id, cls, symptom) => {
    const key = `${id}|${cls}|${symptom}`;
    if (!summaries.has(key)) summaries.set(key, evidence(index.get(key) ?? [],id,cls));
    return summaries.get(key);
  };
  const candidates = legal.map((row) => ({ ...row, experience: backlog.map((b) => ({ ...b,
    classEvidence: observed(row.responderId, b.issueClass, 'class'),
    symptomEvidence: observed(row.responderId, b.issueClass, b.symptom ?? ''),
  })) }));
  // Coverage measures observed familiarity, never latent ability or an employee score.
  const coverage = (c) => c.experience.reduce((sum,b) => sum + b.count * (b.classEvidence.attempts > 0 ? 1 : 0), 0);
  candidates.sort((a,b) => (a.kind === b.kind ? 0 : a.kind === 'EXTENSION' ? -1 : 1) || coverage(b)-coverage(a) || a.responderId.localeCompare(b.responderId));
  return { schemaVersion: '1.0', recommendationId: id, simulationTimestamp: now, backlog, candidates,
    activeStaff: state.responders.filter((r) => r.availability !== 'UNAVAILABLE').length, activeStaffCap: 8,
    baselineOptionId: legal[0]?.optionId ?? null };
}
export function staffingEvent(state, eventType, payload, actor = 'Application') {
  const high = state.operationalEvents.reduce((n,e) => Math.max(n,Number(/(\d+)$/.exec(e.id)?.[1] ?? 0)),state.historyRetention?.highWater?.operationalEvents ?? 0);
  state.operationalEvents.push({ id: `event-${String(high+1).padStart(3,'0')}`, simulationTimestamp: state.simulationState.simulationTime, eventType, source:'WORKFORCE_CONTINUITY', payload:{ actor,...payload }, createdAtRealTime:new Date().toISOString() });
}
function unmet(state, rec) {
  if (activeIssueCount(state) <= state.responders.filter((r) => r.availability !== 'UNAVAILABLE').length) return;
  state.workforceContinuity.staffingAudit.push({ id:`risk-${rec.id}`, simulationTimestamp:state.simulationState.simulationTime, action:'UNMET_STAFFING_RISK', recommendationId:rec.id });
  staffingEvent(state,'UNMET_STAFFING_RISK',{recommendationId:rec.id});
}
function finish(state, rec, status, {optionId=null, reason=null, actor='Application'} = {}) {
  rec.status=status; rec.revision++; rec.decidedAt=state.simulationState.simulationTime;
  rec.actor=actor; rec.selectedOptionId=optionId; rec.reason=reason;
  delete rec.requestToken;
  rec.deadlineToken=null; rec.deadlineDispatchToken=null;
  state.workforceContinuity.staffingAudit.push({id:`decision-${rec.id}`,recommendationId:rec.id,simulationTimestamp:rec.decidedAt,action:'STAFFING_DECISION',outcome:status,source:rec.source,baselineOptionId:rec.baselineOptionId,topOptionId:rec.rankedOptions[0]?.optionId ?? null,disagreement:rec.disagreement,selectedOptionId:optionId,actor,reason});
  const types={ APPROVED_TOP:'STAFFING_APPROVED',APPROVED_ALTERNATIVE:'STAFFING_APPROVED',REJECTED:'STAFFING_REJECTED',EXPIRED:'STAFFING_EXPIRED',AUTO_APPROVED:'STAFFING_AUTO_APPROVED',STALE:'STAFFING_STALE',SUPERSEDED:'STAFFING_SUPERSEDED' };
  staffingEvent(state,types[status],{recommendationId:rec.id,status,optionId,reason,label:status==='AUTO_APPROVED'?'Auto-approved by policy':null},actor);
  // Compact terminal facts remain in staffingAudit for exact lifetime analytics.
  const config=state.workforceContinuity;
  config.staffingRecommendations=config.staffingRecommendations.filter((r) => r.status==='PENDING' || config.staffingRecommendations.filter((x)=>x.status!=='PENDING').slice(-30).includes(r));
  return {status,recommendationId:rec.id};
}
export function createStaffingReview(state, trigger) {
  const config=state.workforceContinuity; initializeStaffing(config);
  if (config.staffingAudit.some((a)=>a.token===trigger.token)) return {status:'ALREADY_APPLIED'};
  const now=state.simulationState.simulationTime;
  const packet=buildStaffingPacket(state,`staffing-${config.staffingSequence+1}`);
  const shortfall=activeIssueCount(state)>packet.activeStaff;
  config.staffingAudit.push({id:`staffing-${trigger.token}`,token:trigger.token,simulationTimestamp:now,action:packet.candidates.length?'RECOMMENDATION':shortfall?'UNMET_STAFFING_RISK':'NO_ACTION',actionableIssues:activeIssueCount(state),activeStaff:packet.activeStaff});
  if (!packet.candidates.length) {
    if(shortfall) staffingEvent(state,'UNMET_STAFFING_RISK',{token:trigger.token});
    return {status:shortfall?'UNMET_STAFFING_RISK':'NO_ACTION'};
  }
  const previous = config.staffingRecommendations.find((r)=>r.status==='PENDING');
  const previousDeadline = previous?.deadline;
  if (previous) finish(state,previous,'SUPERSEDED');
  config.staffingSequence++;
  const anchor=Date.parse(ROTATION_ANCHOR),shiftMs=12*3600000;
  const nextHandover=anchor+(Math.floor((Date.parse(now)-anchor)/shiftMs)+1)*shiftMs;
  const deadline=new Date(Math.min(Date.parse(now)+config.staffingDeadlineMinutes*60000,nextHandover,previousDeadline ? Date.parse(previousDeadline) : Infinity)).toISOString();
  const rankedOptions=packet.candidates.map((c,i)=>({optionId:c.optionId,rank:i+1,rationale:'Extension before call-in, observed backlog class coverage, then responder ID. Thin evidence remains uncertain.'}));
  const rec={id:packet.recommendationId,revision:0,status:'PENDING',createdAt:now,deadline,deadlineToken:`staffing-deadline-${config.staffingSequence}`,deadlineDispatchToken:null,packet,rankedOptions,source:'DETERMINISTIC',rankingStatus:'WAITING',baselineOptionId:packet.baselineOptionId,disagreement:rankedOptions[0].optionId!==packet.baselineOptionId};
  config.staffingRecommendations.push(rec);
  staffingEvent(state,'STAFFING_RECOMMENDATION_READY',{recommendationId:rec.id,deadline,source:rec.source});
  return {status:'PENDING',recommendationId:rec.id};
}
export function decideStaffing(state,id,{decision,optionId,reason,expectedRevision,automatic=false}={}) {
  const rec=state.workforceContinuity.staffingRecommendations?.find((r)=>r.id===id);
  if(!rec) return {status:'NOT_FOUND'};
  if(!automatic && (!Number.isInteger(expectedRevision)||expectedRevision!==rec.revision)) return {status:'CONFLICT',reason:'STAFFING_REVISION_CONFLICT',currentRevision:rec.revision};
  if(rec.status!=='PENDING') return {status:'CONFLICT',reason:'STAFFING_ALREADY_DECIDED'};
  if(typeof reason!=='undefined' && (typeof reason!=='string'||reason.length>360)) return {status:'INVALID_REASON'};
  const past=Date.parse(state.simulationState.simulationTime)>=Date.parse(rec.deadline);
  if(past&&!automatic){ staffingEvent(state,'STAFFING_APPROVAL_STALE',{recommendationId:id,reason:'DEADLINE_PASSED'},'Central command'); return {status:'STALE',reason:'DEADLINE_PASSED'}; }
  const actor=automatic?'Room policy':'Central command';
  if(decision==='reject')return finish(state,rec,'REJECTED',{actor,reason:reason?.trim()||null});
  const option=rec.packet.candidates.find((c)=>c.optionId===optionId);
  if(!option) return {status:'INVALID_OPTION'};
  if(!applyStaffingOption(state,option))return finish(state,rec,'STALE',{actor,optionId,reason:'Option no longer lawful or shortfall cleared'});
  return finish(state,rec,automatic?'AUTO_APPROVED':optionId===rec.rankedOptions[0].optionId?'APPROVED_TOP':'APPROVED_ALTERNATIVE',{actor,optionId});
}
export function finishStaffingDeadline(state,trigger){
  const rec=state.workforceContinuity.staffingRecommendations?.find((r)=>r.id===trigger.recommendationId);
  if(!rec||rec.status!=='PENDING'||rec.deadlineDispatchToken!==trigger.token)return {status:'ALREADY_APPLIED'};
  if(Date.parse(state.simulationState.simulationTime)<Date.parse(rec.deadline))return {status:'NOT_DUE'};
  const result=state.workforceContinuity.staffingApproval==='AUTO_APPROVE_TOP'?decideStaffing(state,rec.id,{decision:'approve',optionId:rec.rankedOptions[0].optionId,automatic:true}):finish(state,rec,'EXPIRED');
  if(['EXPIRED','STALE'].includes(result.status))unmet(state,rec);
  return result;
}
export function updateStaffingPolicy(state,{staffingApproval,expectedRevision}){
  const config=state.workforceContinuity;initializeStaffing(config);
  if(!['OPERATOR','AUTO_APPROVE_TOP'].includes(staffingApproval))return {status:'INVALID_POLICY'};
  if(expectedRevision!==config.staffingPolicyRevision)return {status:'CONFLICT',reason:'STAFFING_POLICY_CONFLICT'};
  config.staffingApproval=staffingApproval;config.staffingPolicyRevision++;
  staffingEvent(state,'STAFFING_POLICY_CHANGED',{staffingApproval,revision:config.staffingPolicyRevision},'Central command');
  return {status:'UPDATED'};
}
export function createStaffingService(store,{agentOptions={},requestRanking=requestStaffingRanking}={}){
  return {async rankNext(){
    const pending = (state) => state.simulationState.status === 'RUNNING' && state.workforceContinuity.staffingRecommendations?.some((r)=>r.status==='PENDING'&&r.rankingStatus==='WAITING');
    if (!(store.project ? await store.project(pending) : pending(await store.snapshot()))) return;
    const prep=await store.mutate('staffing-rank-request',(state)=>{
      if(state.simulationState.status!=='RUNNING')return null;
      const rec=state.workforceContinuity.staffingRecommendations?.find((r)=>r.status==='PENDING'&&r.rankingStatus==='WAITING');
      if(!rec)return null;rec.rankingStatus='PENDING_MODEL';rec.requestToken=randomUUID();return {id:rec.id,requestToken:rec.requestToken,packet:rec.packet};
    });
    if(!prep.result)return;
    const {id,requestToken,packet}=prep.result;
    const options=typeof agentOptions==='function'?await agentOptions():agentOptions;
    let outcome;try{outcome=await requestRanking(packet,options);}catch{outcome={status:'unavailable'};}
    return store.mutate('staffing-rank-result',(state)=>{
      const rec=state.workforceContinuity.staffingRecommendations?.find((r)=>r.id===id&&r.requestToken===requestToken&&r.rankingStatus==='PENDING_MODEL');
      if(!rec||rec.status!=='PENDING')return {status:'STALE'};
      if(Date.parse(state.simulationState.simulationTime)>=Date.parse(rec.deadline))return {status:'STALE'};
      delete rec.requestToken;
      const valid=outcome.status==='ok'&&validateStaffingRanking(packet,outcome.result).valid;
      if(valid)rec.rankedOptions=outcome.result.rankedOptions;
      rec.source=valid?(options.mode==='fixture'?'FIXTURE':(outcome.modelInfo?.provider === 'nebius' ? 'NEBIUS_MODEL' : 'AMD_MODEL')):'DETERMINISTIC';
      rec.rankingStatus=valid?'READY':'FALLBACK';rec.disagreement=rec.rankedOptions[0].optionId!==rec.baselineOptionId;rec.revision++;
      rec.modelInfo=outcome.modelInfo?safeModelMetadata(outcome.modelInfo):null;
      staffingEvent(state,'STAFFING_RANKED',{recommendationId:id,source:rec.source,disagreement:rec.disagreement});return {status:rec.rankingStatus};
    });
  }};
}
