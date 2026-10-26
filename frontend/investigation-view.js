import { setHtml } from './render-lifecycle.js';

/**
 * Field reports and Compass Investigator (plan v2 §3). The backend owns every fact shown
 * here: interpretation options, evidence grade, safety classes, prerequisites and
 * qualification. This view only renders DTOs and sends operator decisions. Narrative text
 * is untrusted and always rendered escaped, as quoted text.
 */
const OPEN_REPORT = new Set(['UNRESOLVED']);
const OPEN_INVESTIGATION = new Set(['QUEUED', 'RUNNING', 'READY', 'ABSTAINED', 'ESCALATED']);
const STATUS = { QUEUED: 'Queued', RUNNING: 'Investigating', READY: 'Awaiting central command', ABSTAINED: 'Abstained — needs a person', ESCALATED: 'Escalated — safety', APPROVED: 'Approved by central command', OVERRIDDEN: 'Overridden by central command', AUTO_APPROVED: 'Auto-approved by policy', REJECTED: 'Rejected', EXPIRED: 'Expired', SUPERSEDED: 'Superseded', FAILED: 'Failed', UNRESOLVED: 'Needs confirmation', CONFIRMED: 'Confirmed', CLOSED: 'Closed' };
const SAFETY = { ROUTINE: 'Routine', ISOLATION_REQUIRED: 'Isolation required', SPECIALIST_ONLY: 'Specialist only' };
const GRADE = { STRONG: 'Strong evidence', MODERATE: 'Moderate evidence', THIN: 'Thin evidence', NONE: 'No evidence' };
const pending = new Set();
const minutesBetween = (later, earlier) => (Date.parse(later) - Date.parse(earlier)) / 60000;
const simClock = (value) => (value ?? '').replace('T', ' ').slice(11, 16);
let selectedId = null;
let reportFormOpen = false;
let lastFeedback = '';

/**
 * An authorization is consumed by one attempt (dispatch gate). If that attempt failed, the
 * issue is pending again and needs a fresh investigation; the old record stays as audit.
 */
export function needsNewAuthorization(inv, state) {
  if (!['APPROVED', 'OVERRIDDEN', 'AUTO_APPROVED'].includes(inv.status) || !inv.issueId) return false;
  const issue = (state.issues ?? []).find((row) => row.id === inv.issueId);
  if (!issue || issue.status !== 'PENDING' || issue.assignedResponderId) return false;
  // Only the newest run for the issue; an older one is already superseded in spirit.
  return !(state.investigations ?? []).some((other) => other.issueId === inv.issueId && other.id !== inv.id && (other.supersedes === inv.id || Date.parse(other.createdAt ?? 0) > Date.parse(inv.createdAt ?? 0)));
}
const isOpen = (inv, state) => OPEN_INVESTIGATION.has(inv.status) || needsNewAuthorization(inv, state);

/** Select an investigation from elsewhere (Ask Compass citations); the next render shows it. */
export function selectInvestigation(id) { selectedId = id; lastFeedback = ''; }

export function openInvestigations(state) {
  return (state.fieldReports ?? []).filter((r) => OPEN_REPORT.has(r.status)).length
    + (state.investigations ?? []).filter((i) => ['READY', 'ABSTAINED', 'ESCALATED'].includes(i.status) || needsNewAuthorization(i, state)).length;
}

function sourceLabel(record) {
  if (record.source === 'NEBIUS_MODEL') return `Nebius · ${record.model?.modelId ?? 'model'}`;
  if (record.source === 'AMD_MODEL') return `AMD · ${record.model?.modelId ?? 'model'}`;
  if (record.source === 'FIXTURE') return 'Offline fixture';
  if (!record.source) return 'Pending';
  return 'Deterministic';
}
function modelFacts(record, escape) {
  const m = record.model;
  if (!m || record.source === 'DETERMINISTIC') return record.fallbackReason ? `<p class="inv-meta">Fallback: ${escape(record.fallbackReason)}</p>` : '';
  const parts = [m.calls != null ? `${m.calls} model calls` : null, m.latencyMs != null ? `${(m.latencyMs / 1000).toFixed(1)} s` : null, m.promptTokens != null ? `${m.promptTokens} in / ${m.completionTokens ?? 0} out tokens` : null].filter(Boolean);
  return parts.length ? `<p class="inv-meta">${escape(parts.join(' · '))}</p>` : '';
}
const quote = (text, escape) => `<blockquote class="inv-narrative" title="Untrusted field text">${escape(text)}</blockquote>`;
const flags = (report, escape) => {
  const f = report.flags ?? {};
  const chips = [...(f.hazard ?? []).map((w) => `<span class="inv-chip warn">Hazard: ${escape(w)}</span>`), ...(f.injection?.length ? ['<span class="inv-chip warn">Instruction-like text quoted as data</span>'] : []), ...(f.input ? [`<span class="inv-chip">${escape(f.input)}</span>`] : [])];
  return chips.length ? `<div class="inv-chips">${chips.join('')}</div>` : '';
};
const caseLinks = (refs, escape) => (refs ?? []).length ? `<span class="inv-refs">${[...new Map(refs.map((r) => [r.caseId, r])).values()].map((r) => `<button type="button" class="inv-case" data-case-id="${escape(r.caseId)}">${escape(r.caseId)}</button>`).join('')}</span>` : '<span class="inv-meta">No cited case</span>';

function reportFormMarkup(state, escape) {
  const equipment = (state.equipment ?? []).map((e) => `<option value="${escape(e.id)}">${escape(e.name)} · ${escape(e.id)}</option>`).join('');
  return `<form class="inv-report-form" data-inv-form ${reportFormOpen ? '' : 'hidden'}><label>What is happening?<textarea data-inv-narrative maxlength="600" rows="4" required placeholder="Describe what you see, where, and what has been tried."></textarea></label><label>Station (optional)<select id="inv-equipment"><option value="">Let Compass suggest from the text</option>${equipment}</select></label><div class="inv-actions"><button type="submit">Submit report</button><button type="button" class="secondary-button" data-inv-action="cancel-report">Cancel</button></div><p class="inv-meta">Reports are investigated by Compass; nothing is dispatched until central command approves.</p></form>`;
}

function reportMarkup(report, escape) {
  const interp = report.interpretation ?? {};
  const options = interp.options ?? [];
  const waiting = interp.status === 'PENDING_MODEL' || interp.status === 'QUEUED';
  const rows = options.map((o, i) => `<li><label class="inv-option"><input type="radio" name="inv-option-${escape(report.id)}" value="${escape(o.optionId)}" ${i === 0 ? 'checked' : ''}/><span><strong>${escape(o.equipmentName ?? o.equipmentId)} · Class ${escape(o.issueClass)} · ${escape(o.symptomCode)}</strong><small>${escape(o.symptomText ?? '')}</small>${o.rationale ? `<small>${escape(o.rationale)}</small>` : ''}</span></label></li>`).join('');
  return `<section class="inv-card" data-report-id="${escape(report.id)}" data-revision="${escape(report.revision)}"><div class="inv-heading"><h4>${escape(report.id)} · ${escape(STATUS[report.status] ?? report.status)}</h4><span class="status-badge">${escape(sourceLabel(interp))}</span></div>${quote(report.narrative, escape)}${flags(report, escape)}${waiting ? '<p class="inv-meta">Ranking interpretations…</p>' : options.length ? `<p class="inv-meta">Confirm what this report is about. Code built these options; Compass only ordered them.</p><ol class="inv-options">${rows}</ol>` : '<p class="inv-meta">No station or symptom could be matched. Close the report or resubmit it with a station.</p>'}<div class="inv-actions">${options.length ? `<button type="button" data-inv-action="confirm" data-report="${escape(report.id)}" ${waiting ? 'disabled' : ''}>Confirm and investigate</button>` : ''}<button type="button" class="secondary-button" data-inv-action="close-report" data-report="${escape(report.id)}">Close report</button></div></section>`;
}

function overrideMarkup(inv, state, escape) {
  if (!inv.issueId || inv.decision || !(inv.fixes ?? []).length) return '';
  const fixOptions = inv.fixes.map((f) => `<option value="${escape(f.fixId)}">${escape(f.fixId)} · ${escape(f.title)} · ${escape(SAFETY[f.safetyClass] ?? f.safetyClass)}</option>`).join('');
  return `<details class="inv-override" data-inv-detail="override"><summary>Manual dispatch (audited override)</summary>
    <label>Fix<select id="inv-override-fix-${escape(inv.id)}" data-inv-override-fix>${fixOptions}</select></label>
    <label>Responder<select id="inv-override-responder-${escape(inv.id)}" data-inv-override-responder></select></label>
    <fieldset class="inv-prereqs" data-inv-override-prereqs><legend>Confirm before dispatch</legend></fieldset>
    <label class="inv-reason">Reason (required)<input data-inv-override-reason maxlength="360"/></label>
    <div class="inv-actions"><button type="button" data-inv-action="override" disabled>Override and dispatch</button></div>
    <p class="inv-meta">Only available responders holding the fix's certifications are listed; the server re-checks qualification and prerequisites.</p></details>`;
}

function bindOverride(detail, inv, state, send, previous, escape) {
  const form = detail.querySelector('.inv-override');
  if (!form) return;
  const fixSelect = form.querySelector('[data-inv-override-fix]');
  const responderSelect = form.querySelector('[data-inv-override-responder]');
  const prereqBox = form.querySelector('[data-inv-override-prereqs]');
  const reason = form.querySelector('[data-inv-override-reason]');
  const button = form.querySelector('[data-inv-action="override"]');
  const sync = () => { button.disabled = pending.has(inv.id) || !responderSelect.value || !reason.value.trim() || [...prereqBox.querySelectorAll('input')].some((p) => !p.checked); };
  const populate = (keep) => {
    const fix = inv.fixes.find((f) => f.fixId === fixSelect.value) ?? inv.fixes[0];
    const qualified = (state.responders ?? []).filter((r) => r.availability === 'AVAILABLE' && (fix.requiredCertifications ?? []).every((c) => (r.certifications ?? []).includes(c)));
    responderSelect.innerHTML = `<option value="">${qualified.length ? 'Choose a qualified responder' : 'No available responder holds the certifications'}</option>` + qualified.map((r) => `<option value="${escape(r.id)}">${escape(r.name ?? r.id)} · ${escape((r.certifications ?? []).join(', ') || 'no certifications')}</option>`).join('');
    if (keep?.responder && qualified.some((r) => r.id === keep.responder)) responderSelect.value = keep.responder;
    prereqBox.innerHTML = '<legend>Confirm before dispatch</legend>' + ((fix.prerequisites ?? []).length ? fix.prerequisites.map((p) => `<label><input type="checkbox" data-inv-override-prereq value="${escape(p)}" ${keep?.prereqs?.includes(p) ? 'checked' : ''}/> ${escape(p.replaceAll('_', ' ').toLowerCase())}</label>`).join('') : '<p class="inv-meta">No prerequisites for this action.</p>');
    prereqBox.querySelectorAll('input').forEach((i) => { i.onchange = sync; });
    sync();
  };
  if (previous?.reason !== undefined) reason.value = previous.reason;
  populate(previous);
  fixSelect.onchange = () => populate(null);
  responderSelect.onchange = sync; reason.oninput = sync;
  button.onclick = () => send(inv.id, `/investigations/${encodeURIComponent(inv.id)}/override`, { responderId: responderSelect.value, fixId: fixSelect.value,
    confirmedPrerequisites: [...prereqBox.querySelectorAll('input:checked')].map((i) => i.value), reason: reason.value.trim(), expectedRevision: inv.revision });
}

function fixMarkup(fix, escape, first) {
  return `<div class="inv-fix ${first ? 'first' : ''}"><div class="inv-heading"><strong>${escape(fix.title)}</strong><span class="inv-chip ${fix.safetyClass === 'ROUTINE' ? '' : 'warn'}">${escape(SAFETY[fix.safetyClass] ?? fix.safetyClass)}</span></div><p class="inv-steps">${escape(fix.steps)}</p><p class="inv-meta">${escape(fix.fixId)} · ${escape(GRADE[fix.grade] ?? fix.grade ?? '')}${(fix.requiredCertifications ?? []).length ? ` · Requires ${escape(fix.requiredCertifications.join(', '))}` : ''}</p>${fix.rationale ? `<p>${escape(fix.rationale)}</p>` : ''}${caseLinks(fix.evidenceRefs, escape)}</div>`;
}

function investigationMarkup(inv, state, escape) {
  const report = (state.fieldReports ?? []).find((r) => r.id === inv.reportId);
  const fixes = inv.fixes ?? [];
  const first = fixes[0];
  const responders = inv.responders ?? [];
  const decidable = inv.status === 'READY' && !pending.has(inv.id);
  const prereqs = first?.prerequisites ?? [];
  const callout = inv.status === 'ESCALATED' || inv.status === 'ABSTAINED' ? `<div class="inv-callout ${inv.status === 'ESCALATED' ? 'warn' : ''}"><strong>${escape(STATUS[inv.status])}</strong><p>${escape(inv.reason ?? '')}</p><p class="inv-meta">Nothing is dispatched automatically. Central command may dispatch manually with an audited reason, re-investigate, or close the report.</p></div>${overrideMarkup(inv, state, escape)}` : '';
  const due = inv.status === 'READY' && inv.deadline ? `<p class="inv-meta inv-due">Decision due by ${escape(simClock(inv.deadline))} simulated (${Math.max(0, minutesBetween(inv.deadline, state.simulationState?.simulationTime)).toFixed(0)} min left)${state.investigationPolicy?.investigationApproval === 'AUTO_APPROVE_SAFE' ? ' · safe policy may auto-approve at the deadline' : ' · expires if unanswered'}</p>` : '';
  const failedAttempt = needsNewAuthorization(inv, state);
  const canReinvestigate = inv.issueId && (['READY', 'ABSTAINED', 'ESCALATED', 'EXPIRED'].includes(inv.status) || failedAttempt) && !pending.has(inv.id);
  const hypotheses = (inv.hypotheses ?? []).map((h) => `<li><strong>${escape(h.symptomCode)}</strong> ${escape(h.text)} ${caseLinks(h.evidenceRefs, escape)}</li>`).join('');
  const responderRows = responders.map((r, i) => `<li><label class="inv-option"><input type="radio" name="inv-responder-${escape(inv.id)}" value="${escape(r.responderId)}" ${i === 0 && r.qualified ? 'checked' : ''} ${r.qualified ? '' : 'disabled'} ${decidable ? '' : 'disabled'}/><span><strong>${escape(r.displayName)}</strong>${r.qualified ? '' : ' <span class="inv-chip warn">Not qualified for this fix</span>'}<small>${escape((r.certifications ?? []).join(', ') || 'No certifications')}</small>${r.rationale ? `<small>${escape(r.rationale)}</small>` : ''}</span></label></li>`).join('');
  const trace = (inv.trace ?? []).map((t) => `<li><code>${escape(t.tool)}</code> ${escape(JSON.stringify(t.args ?? {}))} → ${escape((t.resultIds ?? []).join(', ') || 'no rows')}${t.ms != null ? ` · ${escape(t.ms)} ms` : ''}${t.error ? ` · <span class="inv-chip warn">${escape(t.error)}</span>` : ''}</li>`).join('');
  const decision = inv.decision ? `<div class="inv-decision"><strong>${escape(STATUS[inv.decision.status] ?? inv.decision.status)}</strong><p class="inv-meta">${escape([inv.decision.actor, inv.decision.at?.replace('T', ' ').slice(0, 16), inv.decision.responderId, inv.decision.fixId, inv.decision.reason].filter(Boolean).join(' · '))}</p>${inv.feedback ? `<p class="inv-meta">Feedback recorded: ${inv.feedback.useful ? 'useful' : 'not useful'}</p>` : `<div class="inv-actions"><button type="button" class="secondary-button" data-inv-action="feedback" data-useful="true">Useful</button><button type="button" class="secondary-button" data-inv-action="feedback" data-useful="false">Not useful</button></div>`}</div>` : '';
  return `<section class="inv-detail" data-investigation-id="${escape(inv.id)}" data-revision="${escape(inv.revision)}">
    <div class="inv-heading"><h4>${escape(inv.id)} · ${escape(inv.issueId ?? '')}</h4><span class="status-badge">${escape(sourceLabel(inv))}</span></div>
    <p class="inv-status">${escape(STATUS[inv.status] ?? inv.status)}${inv.evidenceGrade ? ` · ${escape(GRADE[inv.evidenceGrade] ?? inv.evidenceGrade)}` : ''}</p>${modelFacts(inv, escape)}${due}${inv.supersedes ? `<p class="inv-meta">Re-investigation of ${escape(inv.supersedes)}</p>` : ''}
    ${report ? quote(report.narrative, escape) + flags(report, escape) : ''}
    ${callout}
    ${(inv.warnings ?? []).length ? `<ul class="inv-warnings">${inv.warnings.map((w) => `<li>${escape(w)}</li>`).join('')}</ul>` : ''}
    ${inv.status === 'QUEUED' || inv.status === 'RUNNING' ? '<p class="inv-meta">Compass is investigating with read-only tools. Dispatch waits for approval.</p>' : ''}
    ${hypotheses ? `<h5>Observed pattern</h5><ul class="inv-hypotheses">${hypotheses}</ul>` : ''}
    ${first ? `<h5>Recommended first action</h5>${fixMarkup(first, escape, true)}` : ''}
    ${fixes.length > 1 ? `<details data-inv-detail="alternatives"><summary>Alternatives (${fixes.length - 1})</summary>${fixes.slice(1).map((f) => fixMarkup(f, escape, false)).join('')}</details>` : ''}
    ${responderRows ? `<h5>Responders</h5><ol class="inv-options">${responderRows}</ol>` : ''}
    ${inv.status === 'READY' ? `<fieldset class="inv-prereqs" ${decidable ? '' : 'disabled'}><legend>Confirm before dispatch</legend>${prereqs.length ? prereqs.map((p) => `<label><input type="checkbox" data-inv-prereq value="${escape(p)}"/> ${escape(p.replaceAll('_', ' ').toLowerCase())}</label>`).join('') : '<p class="inv-meta">No prerequisites for this action.</p>'}</fieldset><label class="inv-reason">Reason (for escalate or reject)<input data-inv-reason maxlength="360"/></label><div class="inv-actions inv-primary"><button type="button" data-inv-action="approve" ${decidable ? '' : 'disabled'}>Approve and dispatch</button><button type="button" class="secondary-button" data-inv-action="escalate" ${decidable ? '' : 'disabled'}>Escalate</button><button type="button" class="secondary-button" data-inv-action="reject" ${decidable ? '' : 'disabled'}>Reject</button></div>` : ''}
    ${decision}
    ${failedAttempt ? `<div class="inv-callout warn"><strong>Attempt did not fix the issue</strong><p>This approval was used by one attempt and cannot be reused. The issue is pending again; run a new investigation with the current evidence, which includes this failed attempt.</p></div>` : ''}
    ${canReinvestigate ? `<div class="inv-actions"><button type="button" class="secondary-button" data-inv-action="reinvestigate">Re-investigate with current evidence</button></div>` : ''}
    ${trace ? `<details data-inv-detail="trace"><summary>Investigation steps (${inv.trace.length})</summary><ol class="inv-trace">${trace}</ol></details>` : ''}
  </section>`;
}

export function investigationTileMarkup(state, escape) {
  if (state.mode !== 'LIVE') return '<div class="empty-state"><h3>Field reports</h3><p>Field reports and Compass investigations run in Live mode. Offline remains API-free.</p></div>';
  const reports = (state.fieldReports ?? []).filter((r) => OPEN_REPORT.has(r.status));
  const invs = state.investigations ?? [];
  const open = invs.filter((i) => isOpen(i, state));
  const recent = invs.filter((i) => !isOpen(i, state)).slice(-5).reverse();
  if (!invs.some((i) => i.id === selectedId)) selectedId = (open[0] ?? recent[0])?.id ?? null;
  const selected = invs.find((i) => i.id === selectedId);
  const list = [...open, ...recent].map((i) => `<button type="button" class="inv-row ${i.id === selectedId ? 'selected' : ''}" data-inv-select="${escape(i.id)}" aria-pressed="${i.id === selectedId}"><strong>${escape(i.issueId ?? i.id)}</strong><span>${escape(needsNewAuthorization(i, state) ? 'Attempt failed — re-investigate' : STATUS[i.status] ?? i.status)}</span></button>`).join('');
  return `<div class="inv-tile-head"><h3>Field reports</h3><button type="button" data-inv-action="open-report" ${reportFormOpen ? 'hidden' : ''}>Report incident</button></div>${reportFormMarkup(state, escape)}
    ${reports.map((r) => reportMarkup(r, escape)).join('')}
    ${list ? `<nav class="inv-list" aria-label="Investigations">${list}</nav>` : reports.length ? '' : '<div class="empty-state"><strong>No field reports</strong><p>Report an incident in plain language; Compass investigates it against past cases and recommends a safe first action for approval.</p></div>'}
    ${selected ? investigationMarkup(selected, state, escape) : ''}
    <p class="inv-feedback" role="status">${escape(lastFeedback)}</p>
    <dialog class="inv-case-dialog" data-inv-case-dialog><div data-inv-case-body></div><form method="dialog"><button type="submit" class="secondary-button">Close</button></form></dialog>`;
}

function caseMarkup(record, escape) {
  const tried = (record.fixesTried ?? []).map((f) => `<li>${escape(f.order)}. ${escape(f.fixId)} — ${escape(f.outcome === 'FIXED' ? 'fixed' : 'not fixed')}</li>`).join('');
  return `<h4>${escape(record.caseId)}${record.legacy ? ' · legacy' : ''}</h4><p class="inv-meta">${escape(record.equipmentId)} · Class ${escape(record.issueClass)} · ${escape(record.symptomCode ?? 'no symptom')} · resolved ${escape((record.resolvedAt ?? '').replace('T', ' ').slice(0, 16))}</p><p>${escape(record.symptomText ?? '')}</p>${record.reportNarrative ? `${quote(record.reportNarrative, escape)}<p class="inv-meta">Narrative source: ${escape(record.narrativeSource ?? 'unknown')}</p>` : ''}<h5>Fixes tried</h5><ol class="inv-plain">${tried || '<li>None recorded</li>'}</ol><p class="inv-meta">${record.firstTimeFix ? 'Fixed on the first attempt' : 'Not fixed on the first attempt'}${record.totalMinutes != null ? ` · ${escape(record.totalMinutes)} min in total` : ''}</p>`;
}

export function renderInvestigations(state, { escape, request, onState }) {
  const target = document.querySelector('#investigation-tile');
  if (!target) return;
  const narrative = target.querySelector('[data-inv-narrative]')?.value;
  const reason = target.querySelector('[data-inv-reason]')?.value;
  const priorId = target.querySelector('[data-investigation-id]')?.dataset.investigationId;
  const checked = [...target.querySelectorAll('input[type=radio]:checked, [data-inv-prereq]:checked')].map((i) => `${i.name}|${i.value}`);
  const openDetails = [...target.querySelectorAll('[data-inv-detail]')].filter((d) => d.open).map((d) => d.dataset.invDetail);
  const override = { responder: target.querySelector('[data-inv-override-responder]')?.value, reason: target.querySelector('[data-inv-override-reason]')?.value,
    prereqs: [...target.querySelectorAll('[data-inv-override-prereq]:checked')].map((i) => i.value) };
  const dialogOpen = target.querySelector('[data-inv-case-dialog]')?.open;
  if (dialogOpen) return; // Never rebuild under an open case dialog.
  const scrollTop = target.scrollTop;
  const focusedNarrative = document.activeElement?.matches?.('[data-inv-narrative]');
  if (!setHtml(target, investigationTileMarkup(state, escape))) return;
  if (narrative !== undefined && target.querySelector('[data-inv-narrative]')) target.querySelector('[data-inv-narrative]').value = narrative;
  if (focusedNarrative) target.querySelector('[data-inv-narrative]')?.focus({ preventScroll: true });
  const sameSelection = priorId && priorId === target.querySelector('[data-investigation-id]')?.dataset.investigationId;
  if (sameSelection) {
    if (reason !== undefined && target.querySelector('[data-inv-reason]')) target.querySelector('[data-inv-reason]').value = reason;
    target.querySelectorAll('[data-inv-detail]').forEach((d) => { d.open = openDetails.includes(d.dataset.invDetail); });
  }
  for (const input of target.querySelectorAll('input[type=radio], [data-inv-prereq]')) {
    if (input.type === 'checkbox') input.checked = sameSelection && checked.includes(`${input.name}|${input.value}`);
    else if (checked.some((c) => c.startsWith(`${input.name}|`)) && !input.disabled) input.checked = checked.includes(`${input.name}|${input.value}`);
  }
  target.scrollTop = scrollTop;
  bind(target, state, { escape, request, onState }, sameSelection ? override : null);
}

function bind(target, state, { escape, request, onState }, previousOverride = null) {
  const rerender = () => renderInvestigations(state, { escape, request, onState });
  const refresh = (next) => { if (next?.simulationState) onState(next); else rerender(); };
  const say = (text) => { lastFeedback = text; const node = target.querySelector('.inv-feedback'); if (node) node.textContent = text; };
  async function send(key, path, body, after) {
    if (pending.has(key)) return;
    pending.add(key);
    target.querySelectorAll('[data-inv-action]').forEach((b) => { b.disabled = true; });
    let next;
    try { next = await request(path, { method: 'POST', body: JSON.stringify(body) }); after?.(next); say(next?.message ?? 'Updated.'); }
    catch (error) { say(error.payload?.code === 'STALE' || /stale|revision/i.test(error.message) ? 'This record changed; nothing was applied. Review it again.' : error.message); }
    finally { pending.delete(key); }
    try { next = next?.simulationState ? next : await request('/state'); } catch { /* keep the current view */ }
    refresh(next);
  }
  target.querySelectorAll('[data-inv-select]').forEach((b) => { b.onclick = () => { selectedId = b.dataset.invSelect; lastFeedback = ''; rerender(); }; });
  const openButton = target.querySelector('[data-inv-action="open-report"]');
  if (openButton) openButton.onclick = () => { reportFormOpen = true; rerender(); target.querySelector('[data-inv-narrative]')?.focus(); };
  const cancel = target.querySelector('[data-inv-action="cancel-report"]');
  if (cancel) cancel.onclick = () => { reportFormOpen = false; target.querySelector('[data-inv-narrative]').value = ''; rerender(); };
  const form = target.querySelector('[data-inv-form]');
  if (form) form.onsubmit = async (event) => {
    event.preventDefault();
    const narrative = form.querySelector('[data-inv-narrative]').value.trim();
    if (!narrative) { say('Describe the incident first.'); return; }
    const equipmentId = form.querySelector('#inv-equipment').value || undefined;
    reportFormOpen = false; form.querySelector('[data-inv-narrative]').value = '';
    // Policy-decided reports (hazard, bad input) return their investigation at once: show it.
    await send('report', '/reports', { narrative, equipmentId, reporter: 'Central command' }, (next) => { if (next?.investigationId) selectedId = next.investigationId; });
  };
  target.querySelectorAll('[data-inv-action="confirm"]').forEach((b) => { b.onclick = () => {
    const report = state.fieldReports.find((r) => r.id === b.dataset.report);
    const optionId = target.querySelector(`input[name="inv-option-${CSS.escape(report.id)}"]:checked`)?.value;
    if (!optionId) { say('Choose an interpretation first.'); return; }
    send(report.id, `/reports/${encodeURIComponent(report.id)}/confirm`, { optionId, expectedRevision: report.revision }, (next) => { if (next?.investigationId) selectedId = next.investigationId; });
  }; });
  target.querySelectorAll('[data-inv-action="close-report"]').forEach((b) => { b.onclick = () => {
    const report = state.fieldReports.find((r) => r.id === b.dataset.report);
    send(report.id, `/reports/${encodeURIComponent(report.id)}/close`, { reason: 'Closed by central command', expectedRevision: report.revision });
  }; });
  const detail = target.querySelector('[data-investigation-id]');
  const inv = detail && state.investigations.find((i) => i.id === detail.dataset.investigationId);
  if (inv) {
    const approve = detail.querySelector('[data-inv-action="approve"]');
    const prereqs = [...detail.querySelectorAll('[data-inv-prereq]')];
    const responder = () => detail.querySelector(`input[name="inv-responder-${CSS.escape(inv.id)}"]:checked`)?.value;
    const sync = () => { if (approve) approve.disabled = inv.status !== 'READY' || pending.has(inv.id) || !responder() || prereqs.some((p) => !p.checked); };
    detail.querySelectorAll('input').forEach((i) => { i.onchange = sync; });
    sync();
    if (approve) approve.onclick = () => send(inv.id, `/investigations/${encodeURIComponent(inv.id)}/approve`, { responderId: responder(), fixId: inv.fixes[0]?.fixId, confirmedPrerequisites: prereqs.filter((p) => p.checked).map((p) => p.value), expectedRevision: inv.revision });
    for (const action of ['escalate', 'reject']) {
      const button = detail.querySelector(`[data-inv-action="${action}"]`);
      if (button) button.onclick = () => send(inv.id, `/investigations/${encodeURIComponent(inv.id)}/${action}`, { reason: detail.querySelector('[data-inv-reason]').value, expectedRevision: inv.revision });
    }
    const reinvestigate = detail.querySelector('[data-inv-action="reinvestigate"]');
    if (reinvestigate) reinvestigate.onclick = () => send(inv.id, `/investigations/${encodeURIComponent(inv.id)}/reinvestigate`, { expectedRevision: inv.revision }, (next) => { if (next?.investigationId) selectedId = next.investigationId; });
    bindOverride(detail, inv, state, send, previousOverride, escape);
    detail.querySelectorAll('[data-inv-action="feedback"]').forEach((b) => { b.onclick = () => send(`${inv.id}:feedback`, `/investigations/${encodeURIComponent(inv.id)}/feedback`, { useful: b.dataset.useful === 'true' }); });
  }
  let lastCaseTrigger = null;
  const dialog = target.querySelector('[data-inv-case-dialog]');
  target.querySelectorAll('[data-case-id]').forEach((b) => { b.onclick = async () => {
    lastCaseTrigger = b;
    const body = dialog.querySelector('[data-inv-case-body]');
    body.innerHTML = '<p class="inv-meta">Loading case…</p>';
    dialog.showModal?.();
    try { body.innerHTML = caseMarkup(await request(`/cases/${encodeURIComponent(b.dataset.caseId)}`), escape); }
    catch (error) { body.innerHTML = `<p class="load-error">${escape(error.message)}</p>`; }
  }; });
  if (dialog) dialog.onclose = () => { rerender(); lastCaseTrigger?.focus?.(); };
}

/** Settings → Demo: room investigation policy (PATCH /demo/investigation-policy). */
export function investigationPolicyMarkup(state, escape) {
  const p = state.investigationPolicy ?? { investigationApproval: 'OPERATOR', investigationDeadlineMinutes: 30, investigationShare: 0.2, revision: 0 };
  return `<section class="demo-panel demo-continuity" id="investigation-policy-panel"><p class="eyebrow">Compass Investigator</p><h3>Field report policy</h3>
    <p class="workflow-prompt">Operator approval is the default. The safe policy may approve only at the deadline, only moderate or strong evidence with a qualified available responder and no hazard; it never approves abstained, escalated or thin results.</p>
    <label class="settings-field">Approval<select id="investigation-approval"><option value="OPERATOR" ${p.investigationApproval !== 'AUTO_APPROVE_SAFE' ? 'selected' : ''}>Central command approval</option><option value="AUTO_APPROVE_SAFE" ${p.investigationApproval === 'AUTO_APPROVE_SAFE' ? 'selected' : ''}>Auto-approve safe results at the deadline (audited)</option></select></label>
    <label class="settings-field">Decision deadline (simulated minutes)<input id="investigation-deadline" type="number" min="1" max="240" step="1" value="${escape(p.investigationDeadlineMinutes)}"></label>
    <label class="settings-field">Share of simulated issues reported as field reports<input id="investigation-share" type="number" min="0" max="1" step="0.05" value="${escape(p.investigationShare)}"></label>
    <button id="investigation-policy-save" type="button" ${state.mode !== 'LIVE' ? 'disabled' : ''}>Save field report policy</button><p id="investigation-policy-feedback" class="workflow-prompt" aria-live="polite"></p></section>`;
}
export function bindInvestigationPolicy(state, { request, onState }) {
  const button = document.querySelector('#investigation-policy-save');
  if (!button) return;
  button.onclick = async () => {
    const feedback = document.querySelector('#investigation-policy-feedback');
    try {
      await request('/demo/investigation-policy', { method: 'PATCH', body: JSON.stringify({ expectedRevision: state.investigationPolicy?.revision ?? 0,
        investigationApproval: document.querySelector('#investigation-approval').value,
        investigationDeadlineMinutes: Number(document.querySelector('#investigation-deadline').value),
        investigationShare: Number(document.querySelector('#investigation-share').value) }) });
      onState(await request('/state'));
      document.querySelector('#investigation-policy-feedback').textContent = 'Policy saved.';
    } catch (error) { feedback.textContent = error.message; }
  };
}

/** Analytics: investigations by outcome and decision rates (GET /analytics → investigations). */
export function investigationAnalyticsMarkup(data, { escape, metricValue }) {
  if (!data) return '';
  const labels = { ...STATUS, READY: 'Ready (undecided)' };
  const outcomes = Object.entries(data.byOutcome ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `<div><span>${escape(labels[k] ?? k)}</span><strong>${escape(n)}</strong></div>`).join('');
  const comparison = data.firstFixComparison;
  const rate = (label, metric) => metric ? `<div><span>${escape(label)}</span><strong>${metricValue({ ...metric, rate: metric.rate })}</strong><small>${escape(metric.numerator)} / ${escape(metric.denominator)}</small></div>` : '';
  return `<section id="analytics-investigations" class="analytics-panel"><p class="eyebrow">Compass Investigator</p><h3>Field report investigations</h3>
    <p>${escape(data.total ?? 0)} investigations</p><p class="workflow-prompt">${escape(data.definition ?? '')}</p>
    <div class="metric-grid">${outcomes || '<div><span>No investigations yet</span><strong>—</strong></div>'}</div>
    <div class="metric-grid">${rate('Approved (of dispatched decisions)', data.approvalRate)}${rate('Overridden (of dispatched decisions)', data.overrideRate)}${rate('Abstained (of evaluated results)', data.abstentionRate)}${comparison ? rate('First-time fix, investigator first choice', comparison.investigator) + rate('Agreement with class-frequency baseline', comparison.baselineAgreement) : ''}</div>
    ${comparison ? `<p class="workflow-prompt">${escape(comparison.definition ?? '')} The baseline's own outcome on the same issue is not observed here; the paired replay in docs/evaluation.md measures it.</p>` : ''}</section>`;
}
