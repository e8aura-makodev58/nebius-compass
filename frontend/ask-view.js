import { setHtml } from './render-lifecycle.js';

/**
 * Ask Compass: read-only questions about the room (backend/src/assistant.mjs). The server owns
 * declining, validation and citations; this view renders answers and turns each citation into
 * navigation to the cited record. Question and answer text are always rendered escaped.
 */
const STATUS = { READY: 'Answered', DECLINED: 'Declined', FALLBACK: 'Record summary' };
const SOURCE = { NEBIUS_MODEL: 'Nebius', AMD_MODEL: 'AMD', FIXTURE: 'Offline fixture', DETERMINISTIC: 'Deterministic' };
const KIND = { issue: 'Issue', investigation: 'Investigation', event: 'Event', responder: 'Responder', case: 'Case', analytics: 'Analytics' };
let pending = false;
let feedback = '';
let caseDetail = null;

function answerMarkup(answer, escape) {
  const model = answer.model;
  const facts = [SOURCE[answer.source] ?? answer.source, model?.modelId, model?.calls != null ? `${model.calls} model calls` : null, model?.latencyMs != null ? `${(model.latencyMs / 1000).toFixed(1)} s` : null].filter(Boolean).join(' · ');
  const citations = (answer.citations ?? []).map((c) => `<button type="button" class="inv-case" data-ask-kind="${escape(c.kind)}" data-ask-id="${escape(c.id)}">${escape(KIND[c.kind] ?? c.kind)} ${escape(c.id)}</button>`).join('');
  return `<li class="ask-answer ask-${escape((answer.status ?? '').toLowerCase())}">
    <p class="ask-question">${escape(answer.question)}</p>
    <div class="inv-heading"><span class="inv-chip ${answer.status === 'READY' ? '' : 'warn'}">${escape(STATUS[answer.status] ?? answer.status)}</span><span class="inv-meta">${escape(facts)}</span></div>
    <p class="ask-text">${escape(answer.text)}</p>
    ${citations ? `<div class="inv-refs" aria-label="Cited records">${citations}</div>` : ''}
    ${answer.status === 'FALLBACK' && answer.reason ? `<p class="inv-meta">The model's answer was not used (${escape(answer.reason)}); this summary lists the records the tools found.</p>` : ''}
  </li>`;
}

function caseMarkup(record, escape) {
  const tried = (record.fixesTried ?? []).map((f) => `<li>${escape(f.order)}. ${escape(f.fixId)} — ${escape(f.outcome === 'FIXED' ? 'fixed' : 'not fixed')}</li>`).join('');
  return `<section class="ask-case"><div class="inv-heading"><h4>${escape(record.caseId)}</h4><button type="button" class="secondary-button" data-ask-close-case>Back to answers</button></div>
    <p class="inv-meta">${escape(record.equipmentId)} · Class ${escape(record.issueClass)} · ${escape(record.symptomCode ?? '')}</p><p>${escape(record.symptomText ?? '')}</p>
    ${record.reportNarrative ? `<blockquote class="inv-narrative">${escape(record.reportNarrative)}</blockquote>` : ''}<ol class="inv-plain">${tried || '<li>No fixes recorded</li>'}</ol></section>`;
}

function dialogMarkup(state, escape, contextIssueId) {
  const history = [...(state.askHistory ?? [])].reverse();
  const issue = contextIssueId && (state.issues ?? []).find((row) => row.id === contextIssueId);
  return `<div class="ask-head"><div><p class="eyebrow">Read-only · answers cite room records</p><h2 id="ask-title">Ask Compass</h2></div><button type="button" class="secondary-button" data-ask-close>Close</button></div>
    <form class="ask-form" data-ask-form>
      <label for="ask-question">Question</label>
      <textarea id="ask-question" data-ask-question maxlength="400" rows="2" placeholder="e.g. Why was this issue dispatched to that responder? What failed on Station 4 this week?"></textarea>
      ${issue ? `<label class="ask-context"><input type="checkbox" data-ask-context/> Ask about the selected issue, ${escape(issue.id)} (${escape(issue.equipmentId)})</label>` : ''}
      <div class="inv-actions"><button type="submit" ${pending ? 'disabled' : ''}>${pending ? 'Asking…' : 'Ask'}</button></div>
      <p class="inv-meta">Compass reads public records only. It declines questions about hidden simulation data and never takes actions.</p>
      <p class="inv-feedback" role="status">${escape(feedback)}</p>
    </form>
    ${caseDetail ? caseMarkup(caseDetail, escape) : history.length ? `<ol class="ask-history">${history.map((a) => answerMarkup(a, escape)).join('')}</ol>` : '<div class="empty-state"><strong>No questions yet</strong><p>Answers appear here with the records they cite.</p></div>'}`;
}

export function initAsk({ escape, request, getState, onState, getContextIssueId, navigate }) {
  const dialog = document.querySelector('#ask-dialog');
  const opener = document.querySelector('#open-ask');
  if (!dialog || !opener) return { render() {} };
  const body = dialog.querySelector('[data-ask-body]');
  function render() {
    if (!dialog.open) return;
    const draft = body.querySelector('[data-ask-question]')?.value;
    const withContext = body.querySelector('[data-ask-context]')?.checked;
    const focused = document.activeElement?.matches?.('[data-ask-question]');
    setHtml(body, dialogMarkup(getState(), escape, getContextIssueId()));
    if (draft !== undefined && body.querySelector('[data-ask-question]')) body.querySelector('[data-ask-question]').value = draft;
    if (withContext && body.querySelector('[data-ask-context]')) body.querySelector('[data-ask-context]').checked = true;
    if (focused) body.querySelector('[data-ask-question]')?.focus();
    bind();
  }
  function bind() {
    body.querySelector('[data-ask-close]').onclick = () => dialog.close();
    const closeCase = body.querySelector('[data-ask-close-case]');
    if (closeCase) closeCase.onclick = () => { caseDetail = null; render(); };
    body.querySelector('[data-ask-form]').onsubmit = async (event) => {
      event.preventDefault();
      const field = body.querySelector('[data-ask-question]');
      const question = field.value.trim();
      if (!question || pending) return;
      const issueId = body.querySelector('[data-ask-context]')?.checked ? getContextIssueId() : null;
      pending = true; feedback = ''; caseDetail = null; render();
      try {
        await request('/ask', { method: 'POST', body: JSON.stringify({ question, ...(issueId ? { context: { issueId } } : {}) }) });
        field.value = '';
      } catch (error) {
        feedback = error.payload?.error === 'ASK_RATE_LIMIT' || /RATE_LIMIT/.test(error.message) ? 'Too many questions this minute; try again shortly.' : /BUSY/.test(error.message) ? 'Compass is still answering the previous question.' : error.message;
      } finally { pending = false; }
      try { onState(await request('/state')); } catch { /* keep the current view */ }
      body.querySelector('[data-ask-question]').value = '';
      render();
    };
    body.querySelectorAll('[data-ask-kind]').forEach((button) => { button.onclick = async () => {
      const { askKind: kind, askId: id } = button.dataset;
      if (kind === 'case') {
        try { caseDetail = await request(`/cases/${encodeURIComponent(id)}`); } catch (error) { feedback = error.message; }
        render(); return;
      }
      dialog.close();
      navigate(kind, id);
    }; });
  }
  opener.onclick = () => { caseDetail = null; feedback = ''; dialog.showModal(); render(); body.querySelector('[data-ask-question]')?.focus(); };
  dialog.addEventListener('close', () => opener.focus());
  return { render };
}
