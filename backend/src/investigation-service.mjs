import { ensureInvestigationPolicy, sampleInvestigation, scheduleInvestigationDeadline, clearInvestigationDeadline } from './investigation-policy.mjs';
import { classFrequencyBaseline } from './investigation-analytics.mjs';
import { narrateIssue } from './narrator.mjs';
import { assertNoResponderSkill } from './live-schema.mjs';
/** Persisted reports, gated issue creation and atomic operator decisions. No model mutations. */
import { randomUUID } from 'node:crypto';
import { ensureIssueFault } from './fault-truth.mjs';
import { fixesFor, fixById, PREREQUISITES } from './fix-catalog.mjs';
import { casesBefore } from './investigation-dto.mjs';
import { reportPolicy, equipmentMatches, interpretationOptions, validInterpretation, SYMPTOMS } from './report-policy.mjs';
import { investigate, rankInterpretations } from './investigator.mjs';
import { assignInState } from './live-assignment-service.mjs';
import { priorityForIssue } from './workforce-continuity.mjs';

import { reportDTO, investigationDTO } from './investigation-public.mjs';
export { reportDTO, investigationDTO, publicInvestigationState } from './investigation-public.mjs';
const terminal = new Set(['APPROVED','OVERRIDDEN','AUTO_APPROVED','REJECTED','EXPIRED','SUPERSEDED']);
const string = (value,max=600) => {
  const text=typeof value==='string'?value.slice(0,max):'';
  try { assertNoResponderSkill(text); } catch { throw investigationError('RESTRICTED_REPORT_CONTENT',400); }
  return text;
};
function inputObject(value,keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key)=>!keys.includes(key))) throw investigationError('INVALID_INPUT',400); }

export function investigationError(code, statusCode=409) { return Object.assign(new Error(code),{code,statusCode}); }
function idFor(state,collection,prefix) {
  state.investigationSequences??={};
  const highest=(state[collection]??[]).reduce((n,row)=>Math.max(n,Number(new RegExp(`^${prefix}-(\\d+)$`).exec(row.id)?.[1]??0)),state.investigationSequences[collection]??0);
  state.investigationSequences[collection]=highest+1;
  return `${prefix}-${String(highest+1).padStart(4,'0')}`;
}
export function investigationEvent(state,type,row,detail={}) {
  const highest=state.operationalEvents.reduce((n,event)=>Math.max(n,Number(/^event-(\d+)$/.exec(event.id)?.[1]??0)),state.historyRetention?.highWater?.operationalEvents??0);
  if (row.id?.startsWith('INV-') && type!=='INVESTIGATION_FEEDBACK') row.updatedAt=state.simulationState.simulationTime;
  state.operationalEvents.push({id:`event-${String(highest+1).padStart(3,'0')}`,eventType:type,simulationTimestamp:state.simulationState.simulationTime,issueId:row.issueId??null,source:row.decision?.actor==='policy:AUTO_APPROVE_SAFE'?'INVESTIGATION_POLICY':'CENTRAL_COMMAND',payload:{reportId:row.reportId??row.id,investigationId:row.issueId?row.id:null,...detail},createdAtRealTime:new Date().toISOString()});
}
function createRun(state, report, issue, status='QUEUED', reason='Waiting for read-only investigation.') {
  const row={id:idFor(state,'investigations','INV'),issueId:issue?.id??null,reportId:report.id,status,source:'DETERMINISTIC',model:null,
    createdAt:state.simulationState.simulationTime,updatedAt:state.simulationState.simulationTime,asOf:state.simulationState.simulationTime,baselineFixId:issue?classFrequencyBaseline(state,issue,state.simulationState.simulationTime):null,resultOutcome:['ABSTAINED','ESCALATED'].includes(status)?status:null,revision:0,reason,warnings:report.flags.injection.length?['Instruction-like report spans are quoted untrusted data.']:[],
    hypotheses:[],fixes:[],responders:[],trace:[],evidenceGrade:'NONE',interpretation:issue?{equipmentId:issue.equipmentId,issueClass:issue.issueClass,symptomCode:issue.symptom.code}:null};
  ensureInvestigationPolicy(state);
  state.investigations.push(row); return row;
}
function createReportedIssue(state,report,interpretation) {
  const equipment=state.equipment.find((row)=>row.id===interpretation.equipmentId);
  if(!equipment||!validInterpretation(state,interpretation))throw investigationError('INVALID_INTERPRETATION',400);
  if(state.issues.some((row)=>row.equipmentId===equipment.id&&row.status!=='RESOLVED'))throw investigationError('EQUIPMENT_HAS_OPEN_ISSUE');
  const highest=state.issues.reduce((n,row)=>Math.max(n,Number(/^ISS-(\d+)$/.exec(row.id)?.[1]??0)),state.historyRetention?.highWater?.issues??0);
  const at=state.simulationState.simulationTime;
  const issue={id:`ISS-${String(highest+1).padStart(3,'0')}`,equipmentId:equipment.id,issueClass:interpretation.issueClass,status:'PENDING',existingPriority:'UNSPECIFIED',raisedAt:at,createdAt:at,downtimeStartedAt:at,
    origin:'FIELD_REPORT',dispatchGate:'INVESTIGATION',fieldReportId:report.id,complexity:interpretation.issueClass==='C'?'COMPLEX':'STANDARD',description:report.narrative,reportNarrative:report.narrative,narrativeSource:'operator'};
  ensureIssueFault(state,issue);
  // Operator-confirmed public facts are authoritative; latent cause assignment cannot overwrite them.
  const [code,text]=SYMPTOMS[interpretation.issueClass].find(([code])=>code===interpretation.symptomCode);
  issue.symptom={code,text};issue.priorityBand=priorityForIssue(issue,at);
  state.issues.push(issue);equipment.status='ISSUE_ACTIVE';
  report.status='CONFIRMED';report.revision++;report.issueId=issue.id;
  investigationEvent(state,'ISSUE_RAISED',{id:report.id,issueId:issue.id,reportId:report.id},{origin:'FIELD_REPORT'});
  return issue;
}
export function recoverInvestigations(state) {
  ensureInvestigationPolicy(state);
  state.fieldReports??=[];state.investigations??=[];
  for (const row of state.investigations) {
    row.createdAt ??= row.asOf ?? state.simulationState.simulationTime;
    row.updatedAt ??= row.readyAt ?? row.createdAt;
    row.resultOutcome ??= ['READY','ABSTAINED','ESCALATED'].includes(row.status)?row.status:['APPROVED','AUTO_APPROVED'].includes(row.status)?'READY':null;
    if (row.status==='READY') scheduleInvestigationDeadline(state,row);
  }
  for(const row of state.investigations) if(row.status==='RUNNING'){row.status='QUEUED';row.revision++;delete row.requestToken;}
  for (const report of state.fieldReports) if (report.narrationStatus==='PENDING_MODEL') {report.narrationStatus=report.status==='CLOSED'?'CANCELLED':'QUEUED';delete report.narratorToken;}
  for(const report of state.fieldReports) if(report.status==='UNRESOLVED'&&['RUNNING','PENDING_MODEL'].includes(report.interpretation.status)){report.interpretation.status='QUEUED';report.revision++;delete report.requestToken;}
}
export function createInvestigationService(store,{ investigatorOptions={}, rankingOptions={}, narratorOptions={} }={}) {
  const resolve=async(value)=>typeof value==='function'?await value():value;
  const mutate=async(label,fn)=>(await store.mutate(label,fn)).result;
  return {
    async submit(input) {
      inputObject(input,['narrative','equipmentId','reporter']);
      if ((input.equipmentId !== undefined && typeof input.equipmentId !== 'string') || (input.reporter !== undefined && (typeof input.reporter !== 'string' || input.reporter.length > 120))) throw investigationError('INVALID_REPORT',400);
      if(!input||typeof input!=='object'||typeof input.narrative!=='string'||Object.keys(input).some((k)=>!['narrative','equipmentId','reporter'].includes(k))||input.narrative.length>10000)throw investigationError('INVALID_REPORT',400);
      try { assertNoResponderSkill(input.narrative); } catch { throw investigationError('RESTRICTED_REPORT_CONTENT',400); }
      return mutate('field-report-create',(state)=>{
        state.fieldReports??=[];state.investigations??=[];
        if(input.equipmentId&&!state.equipment.some((r)=>r.id===input.equipmentId))throw investigationError('EQUIPMENT_NOT_FOUND',404);
        const flags=reportPolicy(input.narrative);
        const report={id:idFor(state,'fieldReports','FR'),status:'UNRESOLVED',narrative:input.narrative.slice(0,601),flags,revision:0,equipmentId:input.equipmentId??null,
          interpretation:{status:'QUEUED',source:'DETERMINISTIC',model:null,options:interpretationOptions(state,input.narrative,input.equipmentId)}};
        state.fieldReports.push(report);
        investigationEvent(state,'FIELD_REPORT_CREATED',report);
        if(flags.hazard.length||flags.input) {
          const equipment=equipmentMatches(state,input.narrative,input.equipmentId)[0];
          let issue=null;
          if(flags.hazard.length&&equipment&&!state.issues.some((r)=>r.equipmentId===equipment.id&&r.status!=='RESOLVED')) {
            const option=report.interpretation.options[0];issue=createReportedIssue(state,report,option);
          }
          // An occupied or unidentified station is escalated without creating a duplicate incident.
          if(flags.hazard.length)report.status='CONFIRMED';
          report.interpretation.status='READY';
          if(flags.input)report.interpretation.options=[];
          const row=createRun(state,report,issue,flags.hazard.length?'ESCALATED':'ABSTAINED',flags.hazard.length?'Hazard policy requires operator escalation.':`Input policy: ${flags.input}.`);
          investigationEvent(state,'INVESTIGATION_COMPLETED',row,{status:row.status});
          return {reportId:report.id,issueId:issue?.id??null,investigationId:row.id};
        }
        return {reportId:report.id};
      });
    },
    async confirm(id,input) {
      inputObject(input,['expectedRevision','optionId','equipmentId','issueClass','symptomCode']);
      return mutate('field-report-confirm',(state)=>{
        const report=state.fieldReports?.find((row)=>row.id===id);if(!report)throw investigationError('REPORT_NOT_FOUND',404);
        if(!Number.isInteger(input.expectedRevision)||input.expectedRevision!==report.revision||report.status!=='UNRESOLVED'||report.flags.input||report.flags.hazard.length||report.interpretation.status!=='READY')throw investigationError('STALE');
        if(Object.keys(input).some((k)=>!['expectedRevision','optionId','equipmentId','issueClass','symptomCode'].includes(k)))throw investigationError('INVALID_CONFIRMATION',400);
        const option=input.optionId?report.interpretation.options.find((row)=>row.optionId===input.optionId):input;
        const issue=createReportedIssue(state,report,option);
        const run=createRun(state,report,issue);investigationEvent(state,'INVESTIGATION_QUEUED',run);
        return {issueId:issue.id,investigationId:run.id};
      });
    },
    async close(id,input={}) {
      inputObject(input,['reason','expectedRevision']);
      return mutate('field-report-close',(state)=>{
        const report=state.fieldReports?.find((row)=>row.id===id);if(!report)throw investigationError('REPORT_NOT_FOUND',404);
        if(input.expectedRevision!==undefined&&input.expectedRevision!==report.revision)throw investigationError('STALE');
        if(state.investigations.some((r)=>r.reportId===id&&['APPROVED','OVERRIDDEN','AUTO_APPROVED'].includes(r.status)))throw investigationError('STALE');
        report.status='CLOSED';report.revision++;delete report.requestToken;delete report.narratorToken;if(report.narrationStatus)report.narrationStatus='CANCELLED';
        for(const row of state.investigations.filter((r)=>r.reportId===id&&!terminal.has(r.status))){clearInvestigationDeadline(row);row.updatedAt=state.simulationState.simulationTime;row.status='REJECTED';row.revision++;delete row.requestToken;row.decision={status:'REJECTED',actor:'Central command',at:state.simulationState.simulationTime,reason:string(input.reason,360),confirmedPrerequisites:[]};}
        investigationEvent(state,'FIELD_REPORT_CLOSED',report,{reason:string(input.reason,360)});return {reportId:id};
      });
    },
    async getReport(id){if(store.reportRecord){const row=await store.reportRecord(id);if(!row)throw investigationError('REPORT_NOT_FOUND',404);return row;}const state=await store.snapshot();const row=state.fieldReports?.find((r)=>r.id===id);if(!row)throw investigationError('REPORT_NOT_FOUND',404);return reportDTO(row);},
    async getInvestigation(id){if(store.investigationRecord){const row=await store.investigationRecord(id);if(!row)throw investigationError('INVESTIGATION_NOT_FOUND',404);return row;}const state=await store.snapshot();const row=state.investigations?.find((r)=>r.id===id);if(!row)throw investigationError('INVESTIGATION_NOT_FOUND',404);return investigationDTO(row);},
    async getCase(id){const state=await store.snapshot();const row=casesBefore(state,{asOf:new Date(Date.parse(state.simulationState.simulationTime)+1).toISOString()}).find((r)=>r.caseId===id);if(!row)throw investigationError('CASE_NOT_FOUND',404);return row;},
    async decide(id,input,action) {
      inputObject(input,action==='feedback'?['useful','note']:['responderId','fixId','confirmedPrerequisites','expectedRevision','reason']);
      return mutate('investigation-decision',(state)=>{
        const row=state.investigations?.find((r)=>r.id===id);if(!row)throw investigationError('INVESTIGATION_NOT_FOUND',404);
        if(action==='feedback') {if(typeof input.useful!=='boolean')throw investigationError('INVALID_FEEDBACK',400);row.feedback={useful:input.useful};row.revision++;investigationEvent(state,'INVESTIGATION_FEEDBACK',row,{useful:input.useful});return {status:'RECORDED'};}
        if (['approve','override'].includes(action) && ['APPROVED','OVERRIDDEN','AUTO_APPROVED'].includes(row.status)) {
          const wanted=action==='override'?'OVERRIDDEN':'APPROVED';
          if(row.decision.status===wanted && row.decision.responderId===input.responderId && row.decision.fixId===input.fixId && JSON.stringify([...row.decision.confirmedPrerequisites].sort())===JSON.stringify([...(input.confirmedPrerequisites??[])].sort()) && input.expectedRevision===row.decision.revision && (action!=='override'||row.decision.reason===string(input.reason,360))) return {status:row.status,id};
          throw investigationError('STALE');
        }
        if (!Number.isInteger(input.expectedRevision)||input.expectedRevision!==row.revision||terminal.has(row.status)||['QUEUED','RUNNING'].includes(row.status)) throw investigationError('STALE');
        if (action==='approve'||action==='override') return authorizeInvestigation(state,row,input,{manual:action==='override'});
        if(!['reject','escalate'].includes(action))throw investigationError('INVALID_ACTION',400);
        clearInvestigationDeadline(row);
        row.status=action==='reject'?'REJECTED':'ESCALATED';row.revision++;delete row.requestToken;
        row.decision={status:row.status,actor:'Central command',at:state.simulationState.simulationTime,reason:string(input.reason,360),confirmedPrerequisites:[]};
        investigationEvent(state,`INVESTIGATION_${row.status}`,row,{actor:'Central command',reason:row.decision.reason});return {status:row.status};
      });
    },
    async reinvestigate(id,input) {
      inputObject(input,['expectedRevision']);
      return mutate('investigation-supersede',(state)=>{
        const previous=state.investigations?.find((row)=>row.id===id);
        if (!previous) throw investigationError('INVESTIGATION_NOT_FOUND',404);
        const issue=state.issues.find((row)=>row.id===previous.issueId);
        if (input.expectedRevision!==previous.revision || previous.status==='SUPERSEDED' || !issue || !['PENDING','RECOMMENDATION_READY'].includes(issue.status) || state.assignments.some((row)=>row.issueId===issue.id&&row.status==='ACTIVE')) throw investigationError('STALE');
        const report=state.fieldReports.find((row)=>row.id===previous.reportId);
        if (!report || report.status==='CLOSED') throw investigationError('STALE');
        previous.status='SUPERSEDED';previous.revision++;delete previous.requestToken;clearInvestigationDeadline(previous);
        investigationEvent(state,'INVESTIGATION_SUPERSEDED',previous);
        const next=createRun(state,report,issue);next.supersedes=previous.id;
        investigationEvent(state,'INVESTIGATION_QUEUED',next);
        return {investigationId:next.id,issueId:issue.id,supersedes:previous.id};
      });
    },
    async updatePolicy(input) {
      inputObject(input,['expectedRevision','investigationApproval','investigationDeadlineMinutes','investigationShare']);
      return mutate('investigation-policy',(state)=>updateInvestigationPolicy(state,input));
    },
    async finishDeadline(trigger) {return mutate('investigation-deadline',(state)=>finishInvestigationDeadline(state,trigger));},
    async runNext() {
      const claim=await mutate('investigation-work-claim',(state)=>{
        const report=state.fieldReports?.find((r)=>r.status==='UNRESOLVED'&&r.interpretation.status==='QUEUED');
        if(report){report.interpretation.status='PENDING_MODEL';report.revision++;report.requestToken=randomUUID();return {kind:'report',id:report.id,token:report.requestToken};}
        const narration=state.fieldReports?.find((r)=>r.status!=='CLOSED'&&r.narrationStatus==='QUEUED');
        if(narration){narration.narrationStatus='PENDING_MODEL';narration.narratorToken=randomUUID();return {kind:'narration',id:narration.id,token:narration.narratorToken};}
        const row=state.investigations?.find((r)=>r.status==='QUEUED'&&!['QUEUED','PENDING_MODEL'].includes(state.fieldReports.find((f)=>f.id===r.reportId)?.narrationStatus));if(!row)return null;
        row.status='RUNNING';row.revision++;row.requestToken=randomUUID();row.asOf=state.simulationState.simulationTime;row.updatedAt=row.asOf;row.baselineFixId=classFrequencyBaseline(state,state.issues.find((issue)=>issue.id===row.issueId),row.asOf);return {kind:'investigation',id:row.id,token:row.requestToken};
      });
      if(!claim)return false;
      const state=await store.snapshot();
      if(claim.kind==='narration') {
        const report=state.fieldReports.find((row)=>row.id===claim.id),issue=state.issues.find((row)=>row.id===report.issueId);
        if(!issue)return false;
        const output=await narrateIssue(state,issue,await resolve(narratorOptions));
        await mutate('simulation-report-narrated',(draft)=>{
          const report=draft.fieldReports?.find((row)=>row.id===claim.id),issue=draft.issues.find((row)=>row.id===report?.issueId);
          if(report?.narratorToken!==claim.token || !issue || report.status==='CLOSED')return;
          delete report.narratorToken;report.narrationStatus='READY';report.narrative=output.narrative;report.narrativeSource=output.narrativeSource;report.narratorModel=output.model;report.revision++;
          issue.reportNarrative=output.narrative;issue.narrativeSource=output.narrativeSource;
          investigationEvent(draft,'SIMULATION_REPORT_NARRATED',{id:report.id,issueId:issue.id,reportId:report.id},{narrativeSource:output.narrativeSource,reason:output.reason});
        });
      } else if(claim.kind==='report') {
        const report=state.fieldReports.find((r)=>r.id===claim.id);const output=await rankInterpretations(report,await resolve(rankingOptions));
        await mutate('interpretation-ranked',(draft)=>{const report=draft.fieldReports?.find((r)=>r.id===claim.id);if(report?.requestToken!==claim.token||report.status!=='UNRESOLVED')return;delete report.requestToken;report.interpretation={status:'READY',source:output.source,model:output.model,options:output.options};report.revision++;});
      } else {
        const run=state.investigations.find((r)=>r.id===claim.id);const issue=state.issues.find((r)=>r.id===run.issueId);
        if(!issue)return false;
        const output=await investigate(state,issue,{...await resolve(investigatorOptions),asOf:run.asOf});
        await mutate('investigation-completed',(draft)=>{const row=draft.investigations?.find((r)=>r.id===claim.id);const issue=draft.issues.find((r)=>r.id===run.issueId);if(row?.requestToken!==claim.token||row.status!=='RUNNING'||!issue||issue.status==='RESOLVED')return;delete row.requestToken;Object.assign(row,output);row.resultOutcome=output.status;row.revision++;if(row.status==='READY')scheduleInvestigationDeadline(draft,row);investigationEvent(draft,'INVESTIGATION_COMPLETED',row,{status:row.status,source:row.source});});
      }
      return true;
    },
  };
}

/** Shared operator/policy mutation. All checks precede the assignment write. */
export function authorizeInvestigation(state,row,input,{manual=false,policy=false}={}) {
  const issue=state.issues.find((item)=>item.id===row.issueId);
  const fix=fixById(issue?.issueClass,input.fixId),responder=state.responders.find((item)=>item.id===input.responderId);
  const prerequisites=input.confirmedPrerequisites;
  const validStatus=manual?['ABSTAINED','ESCALATED'].includes(row.status):row.status==='READY';
  const reason=string(input.reason,360);
  if (!validStatus || input.expectedRevision!==row.revision || (!manual&&!policy&&row.deadline&&Date.parse(state.simulationState.simulationTime)>=Date.parse(row.deadline)) ||
      !issue || issue.dispatchGate!=='INVESTIGATION' || !['PENDING','RECOMMENDATION_READY'].includes(issue.status) || !fix || !responder || responder.availability!=='AVAILABLE' ||
      state.assignments.some((item)=>item.status==='ACTIVE'&&(item.responderId===responder.id||item.issueId===issue.id)) || state.resolutionAttempts.some((item)=>item.issueId===issue.id&&item.status==='ACTIVE') ||
      !fix.requiredCertifications.every((cert)=>responder.certifications?.includes(cert)) || !Array.isArray(prerequisites) || prerequisites.some((value)=>!PREREQUISITES.includes(value)) || new Set(prerequisites).size!==prerequisites.length || !fix.prerequisites.every((value)=>prerequisites.includes(value)) ||
      (manual&&!reason.trim()) || (!manual&&!row.fixes.some((item)=>item.fixId===fix.id))) throw investigationError('STALE');
  const status=policy?'AUTO_APPROVED':manual?'OVERRIDDEN':'APPROVED';
  const actor=policy?'policy:AUTO_APPROVE_SAFE':'Central command';
  row.decision={status,authorizedResponderId:responder.id,authorizedFixId:fix.id,responderId:responder.id,fixId:fix.id,actor,at:state.simulationState.simulationTime,revision:row.revision,confirmedPrerequisites:[...prerequisites],reason,manualOverride:manual,attemptId:null};
  row.status=status;row.revision++;clearInvestigationDeadline(row);
  const result=assignInState(state,{issueId:issue.id,responderId:responder.id,decision:manual?'OVERRIDDEN':'CONFIRMED',purpose:'INITIAL_ASSIGNMENT'});
  if(result.status!=='ASSIGNED')throw investigationError('ASSIGNMENT_INVARIANT',500);
  investigationEvent(state,`INVESTIGATION_${status}`,row,{responderId:responder.id,fixId:fix.id,actor,confirmedPrerequisites:[...prerequisites],manualOverride:manual});
  return {status,id:row.id};
}
export function finishInvestigationDeadline(state,trigger) {
  const row=state.investigations?.find((item)=>item.id===trigger.investigationId);
  if(!row || row.status!=='READY' || !trigger.token || row.deadlineDispatchToken!==trigger.token || Date.parse(row.deadline)>Date.parse(state.simulationState.simulationTime)) return {status:'DUPLICATE_OR_STALE'};
  const config=ensureInvestigationPolicy(state),report=state.fieldReports.find((item)=>item.id===row.reportId);
  const first=row.fixes[0];
  if(config.investigationApproval==='AUTO_APPROVE_SAFE' && ['MODERATE','STRONG'].includes(row.evidenceGrade) && ['MODERATE','STRONG'].includes(first?.grade) && report?.status==='CONFIRMED' && Array.isArray(report.flags?.hazard) && report.flags.hazard.length===0 && !report.flags.input) {
    const issue=state.issues.find((item)=>item.id===row.issueId),fix=fixById(issue?.issueClass,first.fixId);
    const responder=row.responders.find((candidate)=>candidate.qualified && state.responders.some((item)=>item.id===candidate.responderId&&item.availability==='AVAILABLE'&&fix?.requiredCertifications.every((cert)=>item.certifications?.includes(cert))));
    if(fix&&responder) {
      try{return authorizeInvestigation(state,row,{fixId:fix.id,responderId:responder.responderId,confirmedPrerequisites:[...fix.prerequisites],expectedRevision:row.revision,reason:'Approved at deadline by explicit safe investigation policy.'},{policy:true});}
      catch(error){if(error.code!=='STALE')throw error;}
    }
  }
  row.status='EXPIRED';row.revision++;clearInvestigationDeadline(row);
  row.decision={status:'EXPIRED',actor:'system:deadline',at:state.simulationState.simulationTime,reason:'Investigation deadline elapsed without a lawful approval.',confirmedPrerequisites:[]};
  investigationEvent(state,'INVESTIGATION_EXPIRED',row);
  return {status:'EXPIRED',id:row.id};
}
export function updateInvestigationPolicy(state,input) {
  const current=ensureInvestigationPolicy(state);
  if(!Number.isInteger(input.expectedRevision)||input.expectedRevision!==current.revision)throw investigationError('STALE');
  if(input.investigationApproval!==undefined&&!['OPERATOR','AUTO_APPROVE_SAFE'].includes(input.investigationApproval))throw investigationError('INVALID_POLICY',400);
  if(input.investigationDeadlineMinutes!==undefined&&(!Number.isFinite(input.investigationDeadlineMinutes)||input.investigationDeadlineMinutes<=0||input.investigationDeadlineMinutes>720))throw investigationError('INVALID_POLICY',400);
  if(input.investigationShare!==undefined&&(!Number.isFinite(input.investigationShare)||input.investigationShare<0||input.investigationShare>1))throw investigationError('INVALID_POLICY',400);
  for(const key of ['investigationApproval','investigationDeadlineMinutes','investigationShare'])if(input[key]!==undefined)current[key]=input[key];
  current.revision++;
  investigationEvent(state,'INVESTIGATION_POLICY_CHANGED',{id:'investigation-policy'},{actor:'Central command',investigationApproval:current.investigationApproval,investigationDeadlineMinutes:current.investigationDeadlineMinutes,investigationShare:current.investigationShare});
  return {investigationApproval:current.investigationApproval,investigationDeadlineMinutes:current.investigationDeadlineMinutes,investigationShare:current.investigationShare,revision:current.revision};
}
export function registerSimulatedInvestigation(state,issue) {
  if(!sampleInvestigation(state)) {issue.dispatchGate='OPEN';return null;}
  state.fieldReports??=[];state.investigations??=[];
  issue.dispatchGate='INVESTIGATION';issue.origin='SIMULATION';
  const report={id:idFor(state,'fieldReports','FR'),issueId:issue.id,equipmentId:issue.equipmentId,status:'CONFIRMED',origin:'SIMULATION',narrationStatus:'QUEUED',narrative:issue.reportNarrative,flags:{hazard:[],injection:[],input:null},revision:0,
    interpretation:{status:'READY',source:'DETERMINISTIC',model:null,options:[]}};
  state.fieldReports.push(report);issue.fieldReportId=report.id;
  const row=createRun(state,report,issue);
  investigationEvent(state,'SIMULATION_INVESTIGATION_QUEUED',row);
  return row.id;
}
