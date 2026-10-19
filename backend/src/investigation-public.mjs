import { INVESTIGATION_TOOLS } from './investigation-tools.mjs';
/** Explicit public report, investigation and trace constructors. */
const terminal = new Set(['APPROVED','REJECTED','EXPIRED','SUPERSEDED']);
const string = (value,max=600) => typeof value==='string'?value.slice(0,max):'';
function publicArgs(tool,args) {
  const properties = INVESTIGATION_TOOLS.find((row)=>row.function.name===tool)?.function.parameters.properties ?? {};
  return Object.fromEntries(Object.entries(properties).flatMap(([key,spec])=>{
    const value = args?.[key];
    if (!Object.hasOwn(args??{},key)) return [];
    if (spec.type === 'integer') return Number.isSafeInteger(value) ? [[key,value]] : [];
    return typeof value === 'string' ? [[key,value.slice(0,spec.maxLength??120)]] : [];
  }));
}
function copyRefs(rows) { return (rows??[]).map((row) => ({caseId:row.caseId,field:row.field})); }
export function investigationDTO(row, {summary=false}={}) {
  return { id:row.id,issueId:row.issueId,reportId:row.reportId,status:row.status,source:row.source,
    model:row.model ? {modelId:row.model.modelId,calls:row.model.calls,latencyMs:row.model.latencyMs,promptTokens:row.model.promptTokens,completionTokens:row.model.completionTokens}:null,
    fallbackReason:row.fallbackReason ?? null,evidenceGrade:row.evidenceGrade,reason:row.reason,warnings:(row.warnings??[]).map((v)=>string(v,400)),
    hypotheses:(row.hypotheses??[]).map((h)=>({symptomCode:h.symptomCode,text:h.text,evidenceRefs:copyRefs(h.evidenceRefs)})),
    fixes:(row.fixes??[]).map((f)=>({fixId:f.fixId,title:f.title,steps:f.steps,safetyClass:f.safetyClass,prerequisites:[...f.prerequisites],requiredCertifications:[...f.requiredCertifications],grade:f.grade,rationale:f.rationale,evidenceRefs:copyRefs(f.evidenceRefs)})),
    responders:(row.responders??[]).map((r)=>({responderId:r.responderId,displayName:r.displayName,qualified:r.qualified,certifications:[...r.certifications],rationale:r.rationale})),
    trace:(row.trace??[]).map((t)=>({tool:t.tool,args:publicArgs(t.tool,t.args),resultIds:[...t.resultIds],ms:t.ms,...(t.error?{error:t.error}:{})})),
    decision:row.decision ? {status:row.decision.status,actor:row.decision.actor,at:row.decision.at,responderId:row.decision.responderId,fixId:row.decision.fixId,reason:row.decision.reason,confirmedPrerequisites:[...(row.decision.confirmedPrerequisites??[])]}:null,
    feedback:row.feedback?{useful:row.feedback.useful}:null,revision:row.revision,
    interpretation:row.interpretation ? {equipmentId:row.interpretation.equipmentId,issueClass:row.interpretation.issueClass,symptomCode:row.interpretation.symptomCode}:null,
    repaired:row.repaired??false,rawInvalid:row.rawInvalid??false };
}
export function reportDTO(row) {
  return {id:row.id,status:row.status,narrative:row.narrative,flags:{hazard:[...row.flags.hazard],injection:[...row.flags.injection],input:row.flags.input},revision:row.revision,
    interpretation:{status:row.interpretation.status,source:row.interpretation.source,model:row.interpretation.model?{modelId:row.interpretation.model.modelId}:null,
      options:row.interpretation.options.map((o)=>({optionId:o.optionId,equipmentId:o.equipmentId,equipmentName:o.equipmentName,issueClass:o.issueClass,symptomCode:o.symptomCode,symptomText:o.symptomText,rationale:o.rationale}))}};
}
export function publicInvestigationState(state) {
  const records=state.investigations??[], reports=state.fieldReports??[];
  const retained=[...records.filter((row)=>!terminal.has(row.status)),...records.filter((row)=>terminal.has(row.status)).slice(-20)];
  const linked=new Set(retained.map((row)=>row.reportId));
  return {fieldReports:reports.filter((row)=>row.status==='UNRESOLVED'||linked.has(row.id)).map(reportDTO),investigations:retained.map((row)=>investigationDTO(row,{summary:true}))};
}
