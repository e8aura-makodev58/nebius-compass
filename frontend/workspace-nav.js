import { openInvestigations } from './investigation-view.js';
/** Phone navigation changes presentation only; the shared DOM and selected task survive. */
export function initWorkspaceNav({ onReveal = () => {} } = {}) {
  const nav = document.querySelector('#workspace-nav');
  if (!nav || document.body.classList.contains('display-mode')) return { update() {} };
  const phone = matchMedia('(max-width: 900px)');
  let selected = 'issues';
  function show(view, focus = false) {
    selected = view;
    document.body.dataset.workspaceView = view;
    nav.querySelectorAll('[data-workspace]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.workspace === view)));
    if (phone.matches) requestAnimationFrame(() => {
      onReveal();
      if (focus) {
        const target = document.querySelector(view === 'issues' ? '.context-panel' : view === 'floor' ? '#floor' : view === 'staffing' ? (document.querySelector('#investigation-tile [data-report-id], #investigation-tile [data-investigation-id]') ? '#investigation-tile' : '#staffing-tile') : view === 'kpis' ? '#station-kpi-tile' : '#event-feed');
        target?.scrollIntoView({block:'start', behavior:'instant'});
        if(target) { target.setAttribute('tabindex','-1'); target.focus({preventScroll:true}); }
      }
    });
  }
  nav.querySelectorAll('[data-workspace]').forEach((button) => button.onclick = () => show(button.dataset.workspace));
  document.addEventListener('click', (event) => {
    if (!phone.matches) return;
    if (event.target.closest('[data-feed-event-id]')) show('issues', true);
    else if (event.target.closest('[data-issue-id]')) show('issues', true);
  });
  phone.addEventListener('change', () => show(selected));
  show(selected);
  return { show, update(state) {
    const issues = (state.issues ?? []).filter((i) => i.status !== 'RESOLVED').length;
    const decisions = (state.workforceContinuity?.staffingRecommendations?.filter((r) => r.status === 'PENDING').length ?? 0) + openInvestigations(state);
    nav.querySelector('[data-issues-count]').textContent = String(issues);
    nav.querySelector('[data-decisions-count]').textContent = String(decisions);
    nav.querySelector('[data-decisions-count]').hidden = !decisions;
  } };
}
