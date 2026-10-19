/** Observed investigation facts only. No simulation truth or counterfactual sampling. */
import { fixesFor } from './fix-catalog.mjs';
const outcomes = ['QUEUED','RUNNING','FAILED','READY','APPROVED','OVERRIDDEN','REJECTED','EXPIRED','ABSTAINED','ESCALATED','AUTO_APPROVED','SUPERSEDED'];
const approved = new Set(['APPROVED','AUTO_APPROVED']);
const dispatched = new Set([...approved,'OVERRIDDEN']);
const rate = (numerator, denominator) => ({numerator,denominator,rate:denominator>=3?numerator/denominator:null,status:denominator>=3?'AVAILABLE':'INSUFFICIENT_DATA'});
export function classFrequencyBaseline(state, issue, asOf) {
  const counts = new Map(fixesFor(issue.issueClass).map((fix)=>[fix.id,0]));
  for (const row of state.resolutionHistory ?? []) if (row.issueId !== issue.id && row.issueClass === issue.issueClass && !row.legacyFix && Date.parse(row.resolvedAt) < Date.parse(asOf) && counts.has(row.fixApplied?.id)) counts.set(row.fixApplied.id,counts.get(row.fixApplied.id)+1);
  return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? null;
}
export function compactInvestigationFact(row) {
  return {id:row.id,issueId:row.issueId,reportId:row.reportId,status:row.status,resultOutcome:row.resultOutcome ?? (['READY','ABSTAINED','ESCALATED'].includes(row.status)?row.status:null),
    createdAt:row.createdAt ?? row.asOf,updatedAt:row.updatedAt ?? row.readyAt ?? row.asOf,
    firstFixId:row.fixes?.[0]?.fixId ?? row.firstFixId ?? null,baselineFixId:row.baselineFixId ?? null,
    decision:row.decision?{status:row.decision.status,at:row.decision.at,fixId:row.decision.fixId,attemptId:row.decision.attemptId ?? null}:null};
}
export function investigationFacts(state) {
  const rows = new Map((state.historyRetention?.facts?.investigations ?? []).map((row)=>[row.id,row]));
  for (const row of state.investigations ?? []) rows.set(row.id,compactInvestigationFact(row));
  return [...rows.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
export function buildInvestigationAnalytics(state, bounds=null, snapshotMs=Date.parse(state.simulationState.simulationTime)) {
  const all=investigationFacts(state);
  const within=(at)=>{const value=Date.parse(at);return Number.isFinite(value) && (bounds ? value>=bounds.start&&value<Math.min(bounds.end,snapshotMs) : value<=snapshotMs);};
  const rows=all.filter((row)=>within(row.updatedAt));
  const byOutcome=Object.fromEntries(outcomes.map((status)=>[status,rows.filter((row)=>row.status===status).length]));
  const decisions=all.filter((row)=>row.decision && within(row.decision.at));
  const applied=decisions.filter((row)=>dispatched.has(row.decision.status));
  const evaluated=rows.filter((row)=>['READY','ABSTAINED','ESCALATED'].includes(row.resultOutcome));
  const attempts=new Map((state.resolutionHistory ?? []).map((row)=>[row.attemptId,row]));
  const observations=[];
  for (const row of all) {
    const decision=row.decision, attempt=attempts.get(decision?.attemptId);
    if (!decision || !approved.has(decision.status) || decision.fixId!==row.firstFixId || !attempt || attempt.fixAttemptNumber!==1 || attempt.legacyFix || attempt.fixApplied?.id!==decision.fixId || !within(attempt.resolvedAt)) continue;
    observations.push({success:attempt.success===true,baselineObserved:decision.fixId===row.baselineFixId});
  }
  const successes=observations.filter((row)=>row.success).length;
  const shared=observations.filter((row)=>row.baselineObserved);
  const complete=shared.length===observations.length;
  const baseline=rate(shared.filter((row)=>row.success).length,observations.length);
  if (!complete) { baseline.rate=null; baseline.status='COUNTERFACTUAL_NOT_OBSERVED'; }
  return {total:rows.length,byOutcome,
    approvalRate:rate(applied.filter((row)=>approved.has(row.decision.status)).length,applied.length),
    overrideRate:rate(applied.filter((row)=>row.decision.status==='OVERRIDDEN').length,applied.length),
    abstentionRate:rate(evaluated.filter((row)=>row.resultOutcome==='ABSTAINED').length,evaluated.length),
    firstFixComparison:{issues:observations.length,investigator:rate(successes,observations.length),classFrequencyBaseline:{...baseline,observed:shared.length,unobserved:observations.length-shared.length},
      baselineAgreement:rate(shared.length,observations.length),
      definition:'Same issues with a completed first attempt using an approved investigator first choice. Baseline frozen at run start. Alternative baseline outcomes are unobserved, not simulated; paired replay is separate.'},
    definition:'Current run outcomes at the snapshot (periods use last transition); approval/override rates use dispatched decisions; abstention uses evaluated runs. Rates under three observations are suppressed.'};
}
