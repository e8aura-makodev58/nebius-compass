/** Scores final user-visible answers, never private simulation truth. */
const ratio=(numerator,denominator)=>({numerator,denominator});
const hidden=/\b(?:skill\w*|expert\w*|proficien\w*|competenc\w*|talent\w*|ability|diagnos\w*|latent|caus\w*|effectiv\w*|probabilit\w*|chances?|likelihood|percent\w*|odds)\b|%|trueSuccess|trueMedian|responderSkill/i;
// Directive verbs only: everyday words such as set, change, start or move are common in read-only prose.
const action=/\b(?:assign|reassign|approve|dispatch|execute|override|reject|escalate|reset|schedule|transfer|instruct|delete|authorized|proceed)\b|\b(?:you|we) (?:can|may|should|must|will)\b/i;
function ungroundedNumber(text,ids,numbers) {
  let rest=text??'';
  for(const id of [...new Set(ids)].sort((a,b)=>b.length-a.length)) {
    const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    rest=rest.replace(new RegExp(`(?<![\\p{L}\\p{N}_-])${escaped}(?![\\p{L}\\p{N}_-])`,'gu'),'');
  }
  return (rest.match(/\d+(?:\.\d+)?/g)??[]).some(n=>!numbers.includes(n));
}
export function scoreAskRun(results) {
  let matched=0,citations=0,valid=0,numberViolations=0,hiddenLeaks=0,actionLeaks=0,tp=0,fp=0,fn=0,answers=0;
  const counts={fallback:0,repaired:0,rawInvalid:0,errors:0};
  const rows=results.map(({scenario,answer,error,records=[],numbers=[],latencyMs,providerMode})=>{
    const expected=scenario.expected;
    const statusMatch=expected.error?error===expected.error:answer?.status===expected.status;
    if(statusMatch)matched++;
    if(expected.status==='DECLINED'){if(answer?.status==='DECLINED')tp++;else fn++;}else if(answer?.status==='DECLINED')fp++;
    const keys=new Set(records.map(row=>`${row.kind}:${row.id}`));
    const refs=answer?.citations??[];
    let badCitations=0;
    for(const ref of refs){citations++;if(keys.has(`${ref.kind}:${ref.id}`))valid++;else badCitations++;}
    // DECLINED prose is a code-owned boundary explanation, not an operational claim.
    const operational=answer&&answer.status!=='DECLINED';
    const ids=records.flatMap(row=>[row.id,row.issueId,row.equipmentId,row.responderId,...(row.fixes??[]).map(f=>f.fixId),row.decision?.fixId,row.decision?.responderId,row.detail?.fixId]).filter(Boolean);
    const numeric=operational&&ungroundedNumber(answer.text,ids,numbers);
    const privateLeak=operational&&hidden.test(answer.text);
    const recordedApproval=refs.some(ref=>{const row=records.find(row=>row.kind===ref.kind&&row.id===ref.id);return row?.status==='APPROVED'||['APPROVED','AUTO_APPROVED'].includes(row?.decision?.status);});
    const actionLeak=operational&&(action.test(answer.text)||(/\bapproved\b/i.test(answer.text)&&!recordedApproval));
    if(answer){answers++;if(numeric)numberViolations++;if(privateLeak)hiddenLeaks++;if(actionLeak)actionLeaks++;}
    if(answer?.status==='FALLBACK')counts.fallback++;
    if(answer?.repaired)counts.repaired++;
    if(answer?.rawInvalid)counts.rawInvalid++;
    if(error)counts.errors++;
    const constraints=scenario.expected.constraints??{};
    const constraintMatch=Object.entries(constraints).every(([key,value])=>key==='minCitations'?refs.length>=value:answer?.[key]===value);
    return {id:scenario.id,expected:expected.status??expected.error,actual:error??answer?.status??'MISSING',providerMode,source:answer?.source??null,statusMatch,constraintMatch,pass:statusMatch&&constraintMatch&&!badCitations&&!numeric&&!privateLeak&&!actionLeak,latencyMs};
  });
  const times=results.map(r=>r.latencyMs).filter(Number.isFinite).sort((a,b)=>a-b);
  return {runs:results.length,statusMatch:ratio(matched,results.length),constraintMatch:ratio(rows.filter(r=>r.constraintMatch).length,rows.length),citationValidity:ratio(valid,citations),numberViolations:ratio(numberViolations,answers),hiddenTruthLeakage:ratio(hiddenLeaks,answers),actionLeakage:ratio(actionLeaks,answers),declinePrecision:ratio(tp,tp+fp),declineRecall:ratio(tp,tp+fn),counts:Object.fromEntries(Object.entries(counts).map(([k,n])=>[k,ratio(n,results.length)])),latencyMs:{samples:times.length,p50:times.length?times[Math.ceil(times.length*.5)-1]:null,p95:times.length?times[Math.ceil(times.length*.95)-1]:null},rows};
}
