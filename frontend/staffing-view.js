import { setHtml } from './render-lifecycle.js';
const pendingDecisions = new Set();
const labels = {APPROVED_TOP:'Approved by central command',APPROVED_ALTERNATIVE:'Approved alternative by central command',REJECTED:'Rejected',EXPIRED:'Expired',AUTO_APPROVED:'Auto-approved by policy',STALE:'Stale',SUPERSEDED:'Superseded',PENDING:'Awaiting central command'};
export function staffingMarkup(state, escape) {
  const c = state.workforceContinuity;
  if (!c || state.mode !== 'LIVE') return '<div class="empty-state"><h3>Staffing</h3><p>Staffing approval is available in Live mode. Offline remains API-free.</p></div>';
  const recs = c.staffingRecommendations ?? [], rec = recs.find((r)=>r.status==='PENDING');
  const active = state.responders.filter((r)=>r.availability!=='UNAVAILABLE').length;
  const backlog = state.issues.filter((i)=>['PENDING','RECOMMENDATION_READY','OFFER_PENDING','ASSIGNED'].includes(i.status));
  const groups = new Map();
  for (const b of c.backlog ?? []) { const k=`Class ${b.issueClass} · ${b.priorityBand}`; groups.set(k,(groups.get(k)??0)+b.count); }
  const time = (v)=>escape(v ? v.replace('T',' ').slice(0,16)+' UTC':'—');
  const minute = (v)=>v===null?'—':Number(v).toFixed(1);
  const recent = recs.filter((r)=>r.status!=='PENDING').slice(-5).reverse().map((r)=>`<li><strong>${escape(labels[r.status]??r.status)}</strong> · ${escape(r.id)}<br>${time(r.decidedAt)} · ${escape(r.actor??'Application')}${r.selectedOptionId?` · ${escape(r.selectedOptionId)}`:''}${r.reason?`<br>${escape(r.reason)}`:''}</li>`).join('');
  let recommendation = '<div class="empty-state"><strong>No staffing decision pending</strong><p>Reviews run when demand exceeds active staff and lawful options exist.</p></div>';
  if(rec){
    const optionLabel = (id) => { const c=rec.packet.candidates.find((c)=>c.optionId===id); return c ? `${c.displayName} · ${c.kind==='EXTENSION'?'Extend shift':'Call in'}` : id; };
    const minutes=Math.max(0,(Date.parse(rec.deadline)-Date.parse(state.simulationState.simulationTime))/60000);
    const rows=rec.rankedOptions.map((r)=>{const option=rec.packet.candidates.find((c)=>c.optionId===r.optionId);return `<li><strong>${r.rank}. ${escape(option.displayName)} · ${option.kind==='EXTENSION'?'Extend shift':'Call in'}</strong><p>${escape(r.rationale)}</p><p>Duty ${minute(option.dutyHours)} h · rest ${option.restHours===null?'No prior duty recorded':minute(option.restHours)+' h'} · legal end ${time(option.legalEndsAt)}</p><div class="evidence-scroll"><table><caption>Observed backlog experience</caption><thead><tr><th>Class / symptom</th><th>Class attempts</th><th>Smoothed success</th><th>Median min</th><th>Symptom attempts / success / median</th></tr></thead><tbody>${option.experience.map((e)=>`<tr><td>${escape(e.issueClass)} / ${escape(e.symptom??'Legacy')}</td><td>${e.classEvidence.attempts}</td><td>${(e.classEvidence.smoothedSuccess*100).toFixed(1)}%${e.classEvidence.attempts<3?' · thin sample':''}</td><td>${minute(e.classEvidence.medianResolutionMinutes)}</td><td>${e.symptomEvidence.attempts} / ${(e.symptomEvidence.smoothedSuccess*100).toFixed(1)}% / ${minute(e.symptomEvidence.medianResolutionMinutes)}</td></tr>`).join('')}</tbody></table></div></li>`;}).join('');
    recommendation=`<section class="staffing-open" data-recommendation-id="${escape(rec.id)}">
      <div class="staffing-decision-heading"><h3>Staffing recommendation ready</h3><span class="status-badge">${rec.source==='NEBIUS_MODEL'?'Nebius model':rec.source==='AMD_MODEL'?'AMD model':rec.source==='FIXTURE'?'Offline fixture':'Deterministic'}</span></div>
      <div class="staffing-pick"><strong>${escape(optionLabel(rec.rankedOptions[0].optionId))}</strong><span class="staffing-countdown">${minutes.toFixed(1)} sim min left</span></div>
      <p class="staffing-rationale">${escape(rec.rankedOptions[0].rationale)}</p>
      <div class="staffing-primary-actions"><button type="button" data-staffing-action="approve" data-option="${escape(rec.rankedOptions[0].optionId)}">Approve top option</button><button type="button" class="secondary-button" data-staffing-action="reject">Reject</button></div>
      <p class="staffing-policy-note">${c.staffingApproval==='AUTO_APPROVE_TOP'?'Auto-approved by policy after deadline if still lawful.':'Central command approval required; unanswered recommendations expire.'}</p>
      <details data-staffing-detail="alternatives"><summary>Alternatives and rejection reason</summary><div class="staffing-form"><label>Alternative option<select data-staffing-alternative>${rec.rankedOptions.slice(1).map((r)=>`<option value="${escape(r.optionId)}">${escape(optionLabel(r.optionId))}</option>`).join('')}</select></label><button type="button" class="secondary-button" data-staffing-action="alternative" ${rec.rankedOptions.length<2?'disabled':''}>Approve alternative</button><label>Rejection reason (optional)<input data-staffing-reason maxlength="360" /></label></div></details>
      <details data-staffing-detail="evidence"><summary>Ranked options and evidence (${rec.rankedOptions.length})</summary><p>Evidence as of ${time(rec.createdAt)}. Approval checks current coverage, duty and rest.</p><p>${escape({WAITING:'Waiting for ranking',PENDING_MODEL:'Ranking in progress',READY:'Validated ranking',FALLBACK:'Fallback ranking'}[rec.rankingStatus]??rec.rankingStatus)} · ${rec.disagreement?'Disagrees with baseline':'Agrees with baseline'} (${escape(optionLabel(rec.baselineOptionId))})</p><p>${escape(rec.id)} · Deadline ${time(rec.deadline)}</p><ol>${rows}</ol></details>
    </section>`;
  }
  return `${recommendation}<div class="staffing-coverage"><span><strong>${backlog.length}</strong> actionable issues</span><span><strong>${active} / ${c.maximumActiveStaff}</strong> active staff</span></div><details data-staffing-detail="coverage"><summary>Coverage and handover</summary><p>Next handover ${time(c.nextHandoverAt)}</p><ul>${[...groups].map(([k,n])=>`<li>${escape(k)}: ${n}</li>`).join('')}</ul></details><details data-staffing-detail="recent"><summary>Recent decisions${recent?' · '+recs.filter((r)=>r.status!=='PENDING').length:''}</summary>${recent?`<ol class="staffing-decisions">${recent}</ol>`:'<p>No decisions yet.</p>'}</details><p class="staffing-feedback" role="status"></p>`;
}
export function renderStaffing(state, {escape, request, onState}) {
  const targets=[document.querySelector('#staffing-tile'),document.querySelector('#demo-staffing-outlook')].filter(Boolean);
  for(const target of targets){
    const priorId = target.querySelector('[data-recommendation-id]')?.dataset.recommendationId;
    if (pendingDecisions.has(priorId)) continue;
    const chosen = target.querySelector('[data-staffing-alternative]')?.value;
    const reason = target.querySelector('[data-staffing-reason]')?.value;
    const openDetails = [...target.querySelectorAll('[data-staffing-detail]')].filter((d)=>d.open).map((d)=>d.dataset.staffingDetail);
    const scrollTop = target.scrollTop;
    const activeElement = target.contains(document.activeElement) ? document.activeElement : null;
    const focused = activeElement?.matches('[data-staffing-reason]') ? 'reason' : activeElement?.matches('[data-staffing-alternative]') ? 'alternative' : null;
    const selection = focused === 'reason' ? [activeElement.selectionStart, activeElement.selectionEnd] : null;
    setHtml(target,staffingMarkup(state,escape));
    if (priorId === target.querySelector('[data-recommendation-id]')?.dataset.recommendationId) {
      const select = target.querySelector('[data-staffing-alternative]');
      if (select && [...select.options].some((o)=>o.value===chosen)) select.value=chosen;
      if (reason !== undefined && target.querySelector('[data-staffing-reason]')) target.querySelector('[data-staffing-reason]').value=reason;
      target.querySelectorAll('[data-staffing-detail]').forEach((d)=>d.open=openDetails.includes(d.dataset.staffingDetail));
      if (focused) { const field=target.querySelector(`[data-staffing-${focused}]`); field?.focus({preventScroll:true}); if(selection && field) field.setSelectionRange(...selection); }
    }
    target.scrollTop = priorId === target.querySelector('[data-recommendation-id]')?.dataset.recommendationId ? scrollTop : 0;
    const rec=state.workforceContinuity?.staffingRecommendations?.find((r)=>r.status==='PENDING');
    for(const button of target.querySelectorAll('[data-staffing-action]')) {
      button.disabled = button.dataset.staffingAction === 'alternative' && (!rec || rec.rankedOptions.length < 2);
      button.onclick=async()=>{
      const decision=button.dataset.staffingAction==='reject'?'reject':'approve';
      const optionId=button.dataset.staffingAction==='alternative'?target.querySelector('[data-staffing-alternative]').value:button.dataset.option;
      if (pendingDecisions.has(rec.id)) return;
      pendingDecisions.add(rec.id);
      targets.forEach((node)=>node.querySelectorAll('[data-staffing-action]').forEach((b)=>b.disabled=true));
      let next, feedback;
      try {
        next=await request(`/staffing/${encodeURIComponent(rec.id)}/${decision}`,{method:'POST',body:JSON.stringify({optionId,reason:target.querySelector('[data-staffing-reason]').value,expectedRevision:rec.revision})});
        feedback=next.action?.status==='STALE'?'Option is stale; nothing applied.':labels[next.action?.status]??next.action?.status??'Updated';
      } catch(error) {
        feedback=error.message;
        try { next=await request('/state'); } catch { /* Keep the decision editable if refresh also fails. */ }
      } finally { pendingDecisions.delete(rec.id); }
      if(next) onState(next); else renderStaffing(state,{escape,request,onState});
      const message=target.querySelector('.staffing-feedback');
      if(message) message.textContent=feedback;
      };
    }
  }
}
