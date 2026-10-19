/** Rolling-origin public decisions plus a private, isolated three-arm engine replay. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readDemoSeedBytes } from './demo-seed-reader.mjs';
import { archiveFile } from './history-archive.mjs';
import { investigate as defaultInvestigate } from './investigator.mjs';
import { casesBefore, observationsBefore } from './investigation-dto.mjs';
import { certificationsFor, templateNarrative } from './investigation-records.mjs';
import { buildFixPacket, baselineFix, fallbackFixOrder } from './fix-evidence.mjs';
import { fixById } from './fix-catalog.mjs';
import { crewForTime, ROTATION_ANCHOR } from './workforce-continuity.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';
import { createReplayOutcomeRunner } from './replay-outcome-runner.mjs';
const PUBLIC_SOURCES = new Set(['NEBIUS_MODEL','AMD_MODEL','DETERMINISTIC','FIXTURE']);
const PUBLIC_FALLBACK_REASONS = new Set(['forced-failure','invalid-fixture','missing-fixture','deadline','invalid-tool-call','tool-step-cap','trace-budget','validation-failed','inference-call-cap','tool-result-budget','invalid-tool-arguments','budget-exhausted','provider-error','response-too-large']);
function provenance(result) {
  return {source:PUBLIC_SOURCES.has(result?.source)?result.source:'UNKNOWN',
    fallbackReason:result?.fallbackReason == null ? null : PUBLIC_FALLBACK_REASONS.has(result.fallbackReason)?result.fallbackReason:'unknown'};
}
const seedPath=fileURLToPath(new URL('../seed/demo-control-rooms/plant-1.json',import.meta.url));
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const at=(value)=>Date.parse(value);
const order=(a,b)=>at(a.raisedAt)-at(b.raisedAt)||a.id.localeCompare(b.id);
const unique=(rows)=>[...new Map(rows.map((row)=>[row.id,row])).values()];

async function readSource(injected) {
  if(injected) return {state:injected,seedHash:hash(JSON.stringify(injected)),archiveHash:null};
  const bytes=await readDemoSeedBytes(seedPath),state=JSON.parse(bytes),archiveDigest=createHash('sha256');
  const bundles=[];
  for(const day of [...new Set(Object.values(state.historyRetention?.archives ?? {}))].sort()) {
    const bytes=await readFile(archiveFile(`${seedPath}.history`,state.historyRetention.epoch,day));
    archiveDigest.update(day).update(bytes);
    bundles.push(...Object.values(JSON.parse(bytes).issues));
  }
  for(const key of ['issues','assignments','resolutionAttempts']) state[key]=unique([...bundles.flatMap((bundle)=>bundle[key] ?? []),...(state[key] ?? [])]);
  return {state,seedHash:hash(bytes),archiveHash:archiveDigest.digest('hex')};
}
function publicIssue(issue) {
  return {id:issue.id,equipmentId:issue.equipmentId,issueClass:issue.issueClass,status:issue.status,
    raisedAt:issue.raisedAt,resolvedAt:issue.resolvedAt,symptom:{code:issue.symptom?.code,text:issue.symptom?.text},
    reportNarrative:issue.reportNarrative ?? templateNarrative(issue),narrativeSource:issue.narrativeSource ?? 'template',complexity:issue.complexity ?? 'STANDARD'};
}
/** Pure projection. Future outcomes and all engine truth are removed before invoking any ranker. */
export function buildReplayDecisionState(seed, target) {
  const asOf=target.raisedAt, instant=at(asOf);
  const observations=observationsBefore(seed,{asOf,targetIssueId:target.id});
  const issues=unique([...(seed.historyRetention?.facts?.issues ?? []),...seed.issues]);
  const visible=issues.filter((row)=>row.id!==target.id&&row.status==='RESOLVED'&&at(row.resolvedAt)<instant).map(publicIssue);
  const equipment=seed.equipment.map((row)=>({id:row.id,name:row.name,floor:row.floor,x:row.x,y:row.y}));
  const assignments=(seed.assignments ?? []).filter((row)=>row.issueId!==target.id&&at(row.joinedAt ?? row.createdAt)<instant&&(!row.endedAt||at(row.endedAt)>instant));
  const shiftStart=new Date(at(ROTATION_ANCHOR)+Math.floor((instant-at(ROTATION_ANCHOR))/(12*3600000))*12*3600000).toISOString();
  const responders=seed.responders.map((row)=>{
    const duty=row.dutyStation ?? {x:row.x,y:row.y,floor:row.floor};
    const active=assignments.find((entry)=>entry.responderId===row.id);
    const incident=active&&issues.find((issue)=>issue.id===active.issueId);
    const location=incident&&equipment.find((item)=>item.id===incident.equipmentId) || duty;
    const surge=(seed.workforceContinuity?.staffingRecommendations ?? []).filter((rec)=>['APPROVED','AUTO_APPROVED'].includes(rec.status)&&at(rec.decidedAt)<instant)
      .flatMap((rec)=>(rec.packet?.candidates ?? []).filter((candidate)=>candidate.optionId===rec.selectedOptionId&&candidate.responderId===row.id&&at(candidate.legalEndsAt)>instant).map((candidate)=>({...candidate,startedAt:rec.decidedAt})))
      .sort((a,b)=>at(b.startedAt)-at(a.startedAt))[0];
    return {id:row.id,name:row.name,crewId:row.crewId,x:location.x,y:location.y,floor:location.floor,
      certifications:[...(row.certifications ?? certificationsFor(row.id))],
      availability:active?'ASSIGNED':row.crewId===crewForTime(asOf)||surge?'AVAILABLE':'UNAVAILABLE',
      dutyStartedAt:surge?.startedAt ?? shiftStart,...(surge?{extensionEndsAt:surge.legalEndsAt}:{}),dutyStation:{...duty}};
  });
  const issue={...publicIssue(target),status:'PENDING',origin:'SIMULATION',dispatchGate:'INVESTIGATION'};
  delete issue.resolvedAt;
  const state={simulationState:{simulationTime:asOf},equipment,responders,issues:[...visible,issue],
    resolutionHistory:observations.map((row)=>({id:row.id,issueId:row.issueId,attemptId:row.attemptId,responderId:row.responderId,issueClass:row.issueClass,equipmentId:row.equipmentId,symptomCode:row.symptomCode,
      resolvedAt:row.resolvedAt,resolutionMinutes:row.resolutionMinutes,success:row.success,fixApplied:row.fixApplied?{id:row.fixApplied.id}:null,legacyFix:row.legacyFix,fixAttemptNumber:row.fixAttemptNumber,
      assisted:row.assisted,participants:(row.participants ?? []).map((participant)=>({responderId:participant.responderId}))})),
    assignments:[],operationalEvents:[],resolutionAttempts:[]};
  assertNoResponderSkill(state);
  return state;
}
function firstAttempt(seed, issue) {
  const records=seed.resolutionHistory.filter((row)=>row.issueId===issue.id).sort((a,b)=>at(a.resolvedAt)-at(b.resolvedAt)||a.id.localeCompare(b.id));
  const record=records.find((row)=>row.fixAttemptNumber===1) ?? records[0];
  if(!record) return null;
  const initial=(seed.assignments ?? []).filter((row)=>row.issueId===issue.id&&row.attemptId===record.attemptId)
    .sort((a,b)=>at(a.joinedAt ?? a.createdAt)-at(b.joinedAt ?? b.createdAt)||Number((b.roleHistory?.[0]?.role ?? b.role)==='PRIMARY')-Number((a.roleHistory?.[0]?.role ?? a.role)==='PRIMARY')||a.id.localeCompare(b.id))[0];
  return {attemptId:record.attemptId,responderId:initial?.responderId ?? null};
}
/** Optional seed injection is for hermetic boundary/perturbation tests; default is the committed month. */
export async function runPairedReplay({mode,heldOutDays=7,limit,investigate=defaultInvestigate,seed}={}) {
  if(!['fixture','live'].includes(mode)) throw new Error('Replay mode must be fixture or live');
  if(!Number.isFinite(heldOutDays)||heldOutDays<=0||heldOutDays>366) throw new Error('Invalid held-out days');
  if(limit!==undefined&&(!Number.isInteger(limit)||limit<1)) throw new Error('Invalid replay limit');
  const startedAt=new Date().toISOString(),started=performance.now(),source=await readSource(seed),state=source.state;
  const end=at(state.simulationState.simulationTime),start=end-heldOutDays*86400000;
  const issues=unique([...(state.historyRetention?.facts?.issues ?? []),...state.issues]);
  const eligible=issues.filter((issue)=>issue.status==='RESOLVED'&&at(issue.resolvedAt)>=start&&at(issue.resolvedAt)<=end&&issue.symptom?.code&&issue.symptom?.text&&state.resolutionHistory.some((row)=>row.issueId===issue.id&&!row.legacyFix&&fixById(issue.issueClass,row.fixApplied?.id))).sort(order);
  const selected=eligible.slice(0,limit ?? eligible.length),outcome=createReplayOutcomeRunner(state),pairs=[],modelIds=new Set();
  const counts={resolvedInWindow:issues.filter((row)=>row.status==='RESOLVED'&&at(row.resolvedAt)>=start&&at(row.resolvedAt)<=end).length,eligible:eligible.length,selected:selected.length,ready:0,fallback:0,repaired:0,rawInvalid:0,timeouts:0,failed:0};
  for(const target of selected) {
    const decision=buildReplayDecisionState(state,target),issue=decision.issues.find((row)=>row.id===target.id);
    // Reuse the canonical cutoff machinery, even for an injected investigator.
    casesBefore(decision,{asOf:target.raisedAt,targetIssueId:target.id});
    let result;
    try {result=await investigate(decision,issue,{mode,asOf:target.raisedAt});} catch {result={status:'FAILED'};}
    if(result?.model?.modelId)modelIds.add(result.model.modelId);
    if(result?.source==='DETERMINISTIC')counts.fallback++;
    if(result?.repaired)counts.repaired++;
    if(result?.rawInvalid)counts.rawInvalid++;
    if(result?.fallbackReason==='deadline')counts.timeouts++;
    if(result?.status!=='READY') {
      const excluded=['ABSTAINED','ESCALATED'].includes(result?.status)?result.status:'FAILED';
      if(excluded==='FAILED')counts.failed++;
      pairs.push({issueId:target.id,excluded});continue;
    }
    const packet=buildFixPacket(decision,target.id),first=firstAttempt(state,target);
    const fixes=[result.fixes?.[0]?.fixId,baselineFix(packet),fallbackFixOrder(packet)[0].fixId];
    let arms;
    try {arms=outcome({decision,issueId:target.id,...first,fixes});} catch {arms=null;}
    if(!arms || arms.some((arm)=>!arm)){counts.failed++;pairs.push({issueId:target.id,excluded:'FAILED'});continue;}
    counts.ready++;
    pairs.push({issueId:target.id,investigator:{fixed:arms[0].fixed,...provenance(result)},baseline:arms[1],deterministic:arms[2]});
  }
  const meta={version:'paired-first-fix-v1',mode,heldOutWindow:{start:new Date(start).toISOString(),end:new Date(end).toISOString(),days:heldOutDays,basis:'resolvedAt'},counts,selection:'raisedAt ascending; issue ID tie-break; limit takes the first entries',startedAt,finishedAt:new Date().toISOString(),seedHash:source.seedHash,archiveHash:source.archiveHash,modelIds:[...modelIds].sort(),runtimeMs:Math.max(0,performance.now()-started)};
  assertNoResponderSkill({pairs,meta});
  return {pairs,meta};
}
