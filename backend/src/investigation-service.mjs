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
const terminal = new Set(['APPROVED','REJECTED','EXPIRED','SUPERSEDED']);
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
  state.operationalEvents.push({id:`event-${String(highest+1).padStart(3,'0')}`,eventType:type,simulationTimestamp:state.simulationState.simulationTime,issueId:row.issueId??null,source:'CENTRAL_COMMAND',payload:{reportId:row.reportId??row.id,investigationId:row.issueId?row.id:null,...detail},createdAtRealTime:new Date().toISOString()});
}
function createRun(state, report, issue, status='QUEUED', reason='Waiting for read-only investigation.') {
  const row={id:idFor(state,'investigations','INV'),issueId:issue?.id??null,reportId:report.id,status,source:'DETERMINISTIC',model:null,
    asOf:state.simulationState.simulationTime,revision:0,reason,warnings:report.flags.injection.length?['Instruction-like report spans are quoted untrusted data.']:[],
    hypotheses:[],fixes:[],responders:[],trace:[],evidenceGrade:'NONE',interpretation:issue?{equipmentId:issue.equipmentId,issueClass:issue.issueClass,symptomCode:issue.symptom.code}:null};
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
  state.fieldReports??=[];state.investigations??=[];
  for(const row of state.investigations) if(row.status==='RUNNING'){row.status='QUEUED';row.revision++;delete row.requestToken;}
  for(const report of state.fieldReports) if(report.status==='UNRESOLVED'&&['RUNNING','PENDING_MODEL'].includes(report.interpretation.status)){report.interpretation.status='QUEUED';report.revision++;delete report.requestToken;}
}
export function createInvestigationService(store,{ investigatorOptions={}, rankingOptions={} }={}) {
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
        if(state.investigations.some((r)=>r.reportId===id&&r.status==='APPROVED'))throw investigationError('STALE');
        report.status='CLOSED';report.revision++;delete report.requestToken;
        for(const row of state.investigations.filter((r)=>r.reportId===id&&!terminal.has(r.status))){row.status='REJECTED';row.revision++;delete row.requestToken;row.decision={status:'REJECTED',actor:'Central command',at:state.simulationState.simulationTime,reason:string(input.reason,360),confirmedPrerequisites:[]};}
        investigationEvent(state,'FIELD_REPORT_CLOSED',report,{reason:string(input.reason,360)});return {reportId:id};
      });
    },
    async getReport(id){const state=await store.snapshot();const row=state.fieldReports?.find((r)=>r.id===id);if(!row)throw investigationError('REPORT_NOT_FOUND',404);return reportDTO(row);},
    async getInvestigation(id){const state=await store.snapshot();const row=state.investigations?.find((r)=>r.id===id);if(!row)throw investigationError('INVESTIGATION_NOT_FOUND',404);return investigationDTO(row);},
    async getCase(id){const state=await store.snapshot();const row=casesBefore(state,{asOf:new Date(Date.parse(state.simulationState.simulationTime)+1).toISOString()}).find((r)=>r.caseId===id);if(!row)throw investigationError('CASE_NOT_FOUND',404);return row;},
    async decide(id,input,action) {
      inputObject(input,action==='feedback'?['useful','note']:['responderId','fixId','confirmedPrerequisites','expectedRevision','reason']);
      return mutate('investigation-decision',(state)=>{
        const row=state.investigations?.find((r)=>r.id===id);if(!row)throw investigationError('INVESTIGATION_NOT_FOUND',404);
        if(action==='feedback') {if(typeof input.useful!=='boolean')throw investigationError('INVALID_FEEDBACK',400);row.feedback={useful:input.useful};row.revision++;investigationEvent(state,'INVESTIGATION_FEEDBACK',row,{useful:input.useful});return {status:'RECORDED'};}
        if(action==='approve'&&row.status==='APPROVED') {
          if(row.decision.responderId===input.responderId&&row.decision.fixId===input.fixId&&JSON.stringify([...row.decision.confirmedPrerequisites].sort())===JSON.stringify([...(input.confirmedPrerequisites??[])].sort())&&input.expectedRevision===row.decision.revision)return {status:'APPROVED',id};
          throw investigationError('STALE');
        }
        if(!Number.isInteger(input.expectedRevision)||input.expectedRevision!==row.revision||terminal.has(row.status)||['QUEUED','RUNNING'].includes(row.status))throw investigationError('STALE');
        const issue=state.issues.find((r)=>r.id===row.issueId);
        if(action==='approve') {
          const fix=fixById(issue?.issueClass,input.fixId),responder=state.responders.find((r)=>r.id===input.responderId);
          const prerequisites=input.confirmedPrerequisites;
          const manual=row.status!=='READY';
          if(!issue||issue.dispatchGate!=='INVESTIGATION'||!['PENDING','RECOMMENDATION_READY'].includes(issue.status)||!fix||!responder||responder.availability!=='AVAILABLE'||state.assignments.some((a)=>a.responderId===responder.id&&a.status==='ACTIVE')||
            !fix.requiredCertifications.every((cert)=>responder.certifications?.includes(cert))||!Array.isArray(prerequisites)||prerequisites.some((p)=>!PREREQUISITES.includes(p))||new Set(prerequisites).size!==prerequisites.length||!fix.prerequisites.every((p)=>prerequisites.includes(p))||
            (manual&&!string(input.reason,360).trim())||(!manual&&!row.fixes.some((r)=>r.fixId===fix.id)))throw investigationError('STALE');
          row.decision={status:'APPROVED',authorizedResponderId:responder.id,authorizedFixId:fix.id,responderId:responder.id,fixId:fix.id,actor:'Central command',at:state.simulationState.simulationTime,revision:row.revision,confirmedPrerequisites:[...prerequisites],reason:string(input.reason,360),manualOverride:manual,attemptId:null};
          row.status='APPROVED';row.revision++;
          const result=assignInState(state,{issueId:issue.id,responderId:responder.id,decision:'CONFIRMED',purpose:'INITIAL_ASSIGNMENT'});
          if(result.status!=='ASSIGNED')throw investigationError('STALE');
          investigationEvent(state,'INVESTIGATION_APPROVED',row,{responderId:responder.id,fixId:fix.id,actor:'Central command',confirmedPrerequisites:[...prerequisites],manualOverride:manual});return {status:'APPROVED',id};
        }
        if(!['reject','escalate'].includes(action))throw investigationError('INVALID_ACTION',400);
        row.status=action==='reject'?'REJECTED':'ESCALATED';row.revision++;delete row.requestToken;
        row.decision={status:row.status,actor:'Central command',at:state.simulationState.simulationTime,reason:string(input.reason,360),confirmedPrerequisites:[]};
        investigationEvent(state,`INVESTIGATION_${row.status}`,row,{actor:'Central command',reason:row.decision.reason});return {status:row.status};
      });
    },
    async runNext() {
      const claim=await mutate('investigation-work-claim',(state)=>{
        const report=state.fieldReports?.find((r)=>r.status==='UNRESOLVED'&&r.interpretation.status==='QUEUED');
        if(report){report.interpretation.status='PENDING_MODEL';report.revision++;report.requestToken=randomUUID();return {kind:'report',id:report.id,token:report.requestToken};}
        const row=state.investigations?.find((r)=>r.status==='QUEUED');if(!row)return null;
        row.status='RUNNING';row.revision++;row.requestToken=randomUUID();row.asOf=state.simulationState.simulationTime;return {kind:'investigation',id:row.id,token:row.requestToken};
      });
      if(!claim)return false;
      const state=await store.snapshot();
      if(claim.kind==='report') {
        const report=state.fieldReports.find((r)=>r.id===claim.id);const output=await rankInterpretations(report,await resolve(rankingOptions));
        await mutate('interpretation-ranked',(draft)=>{const report=draft.fieldReports?.find((r)=>r.id===claim.id);if(report?.requestToken!==claim.token||report.status!=='UNRESOLVED')return;delete report.requestToken;report.interpretation={status:'READY',source:output.source,model:output.model,options:output.options};report.revision++;});
      } else {
        const run=state.investigations.find((r)=>r.id===claim.id);const issue=state.issues.find((r)=>r.id===run.issueId);
        if(!issue)return false;
        const output=await investigate(state,issue,{...await resolve(investigatorOptions),asOf:run.asOf});
        await mutate('investigation-completed',(draft)=>{const row=draft.investigations?.find((r)=>r.id===claim.id);const issue=draft.issues.find((r)=>r.id===run.issueId);if(row?.requestToken!==claim.token||row.status!=='RUNNING'||!issue||issue.status==='RESOLVED')return;delete row.requestToken;Object.assign(row,output);row.revision++;investigationEvent(draft,'INVESTIGATION_COMPLETED',row,{status:row.status,source:row.source});});
      }
      return true;
    },
  };
}
