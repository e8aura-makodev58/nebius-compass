// Draft Nebius deck builder (pptxgenjs). Run from a folder with pptxgenjs installed: node build-deck.mjs
// Screenshots are live captures from the deployed app (deck-shots workplace), kept in ./assets.
import pptxgen from 'pptxgenjs';
const S = new URL('./assets/', import.meta.url).pathname.replace(/\/$/, '');
const REPO = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.title = 'ResponseCompass — Nebius x NVIDIA draft deck';
const NAVY = '0F2B43', INK = '0F2B43', MUTED = '5B6B7A', LIME = 'E1FE3C', PAPER = 'EEF2F7', AMBER = 'B45309', RULE = 'C9D3DD';
const FONT = 'Arial';

function frame(slide, title, kicker) {
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: LIME }, line: { color: LIME } });
  if (kicker) slide.addText(kicker.toUpperCase(), { x: 0.6, y: 0.35, w: 12, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: MUTED, charSpacing: 1 });
  slide.addText(title, { x: 0.6, y: 0.62, w: 12.1, h: 0.9, fontFace: FONT, fontSize: 28, bold: true, color: INK, valign: 'top' });
  slide.addText('ResponseCompass · draft for review', { x: 0.6, y: 7.05, w: 6, h: 0.3, fontFace: FONT, fontSize: 9, color: MUTED });
}
function bullets(slide, items, box) {
  slide.addText(items.map(t => ({ text: t, options: { bullet: { indent: 18 }, paraSpaceAfter: 10 } })), { ...box, fontFace: FONT, fontSize: 18, color: INK, valign: 'top' });
}
function callout(slide, text, box, color = AMBER) {
  slide.addShape(pptx.ShapeType.rect, { ...box, fill: { color: 'FFF7E6' }, line: { color, width: 1.25 } });
  slide.addText(text, { ...box, fontFace: FONT, fontSize: 13, color: INK, valign: 'middle', margin: 10 });
}

// 1 Cover
{
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  s.addImage({ path: `${REPO}/frontend/icons/Compass_application_logo_icon_20261025201828.jpg`, x: 0.6, y: 0.9, w: 6.4, h: 3.6, sizing: { type: 'contain', w: 6.4, h: 3.6 } });
  s.addText('Context-aware responder dispatch for operations control rooms', { x: 7.4, y: 2.2, w: 5.4, h: 1.6, fontFace: FONT, fontSize: 24, bold: true, color: INK, valign: 'top' });
  s.addText('An agent that recommends who to send and what to try first, cited from past repairs. People approve every dispatch.', { x: 7.4, y: 3.9, w: 5.4, h: 1.2, fontFace: FONT, fontSize: 15, color: MUTED, valign: 'top' });
  s.addText('Nebius x NVIDIA Global AI Hackathon · Best Apps and Agents', { x: 0.6, y: 6.6, w: 12, h: 0.4, fontFace: FONT, fontSize: 12, color: MUTED });
  s.addNotes('Cover uses the supplied Response Compass logo (codex handoff 3ce72bc).');
}
// 2 Problem
{
  const s = pptx.addSlide();
  frame(s, 'The closest technician is not always the best one to send', 'The problem');
  bullets(s, [
    'Equipment faults arrive as technician reports in plain language, not clean tickets.',
    'The nearest responder often has no record on this fault.',
    'The first fix tried is often a guess, and each failed attempt costs downtime.',
    'What works lives in old tickets and in people\'s heads, so it is hard to reuse.',
  ], { x: 0.6, y: 1.7, w: 12, h: 4.5 });
}
// 3 Story
{
  const s = pptx.addSlide();
  frame(s, 'One report, from words to an approved dispatch', 'The demo story');
  const beats = ['Free-text field report arrives', 'Wall screens show the room', 'Code resolves equipment and options', 'Nemotron investigates with cited cases', 'Operator confirms and approves', 'Outcome, history and analytics'];
  beats.forEach((b, i) => {
    const x = 0.6 + (i % 3) * 4.1, y = 1.9 + Math.floor(i / 3) * 2.2;
    s.addShape(pptx.ShapeType.rect, { x, y, w: 3.8, h: 1.7, fill: { color: PAPER }, line: { color: RULE } });
    s.addText(`${i + 1}`, { x: x + 0.2, y: y + 0.15, w: 0.6, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: INK });
    s.addText(b, { x: x + 0.2, y: y + 0.7, w: 3.4, h: 0.9, fontFace: FONT, fontSize: 16, color: INK, valign: 'top' });
  });
}
// 4 Wall + console
{
  const s = pptx.addSlide();
  frame(s, 'The control room watches the floor and keeps the controls', 'Live Floor');
  s.addImage({ path: `${S}/console-1600.png`, x: 0.6, y: 1.65, w: 8.6, h: 4.84 });
  bullets(s, [
    'Six wall screens, one panel per monitor: floor map, issues, dispatch, event feed, Issue Pareto, analytics.',
    'The operator console keeps override, pause and approval.',
    'Screenshot: live deployed app, synthetic plant data.',
  ], { x: 9.5, y: 1.7, w: 3.4, h: 4.8 });
}
// 5 Investigator flow (placeholder screens)
{
  const s = pptx.addSlide();
  frame(s, 'A field report becomes a cited, approved recommendation', 'Compass Investigator');
  const steps = [
    ['1 Report', 'Operator types what happened. Text is untrusted data.'],
    ['2 Options', 'Code lists the possible equipment and symptom pairs (at most 12).'],
    ['3 Investigate', 'Nemotron 3 Ultra reads past cases with read-only tools and cites them.'],
    ['4 Confirm', 'Operator confirms symptom and ticks safety prerequisites.'],
    ['5 Approve', 'Central command approves the responder and fix. Audit record written.'],
  ];
  steps.forEach(([t, d], i) => {
    const x = 0.6 + i * 2.45;
    s.addShape(pptx.ShapeType.rect, { x, y: 1.8, w: 2.25, h: 2.6, fill: { color: i === 2 ? LIME : PAPER }, line: { color: RULE } });
    s.addText(t, { x: x + 0.15, y: 1.95, w: 2, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    s.addText(d, { x: x + 0.15, y: 2.5, w: 1.95, h: 1.8, fontFace: FONT, fontSize: 12, color: INK, valign: 'top' });
  });
  callout(s, 'PLACEHOLDER: Investigator screenshots are not in this draft. Guest workplaces currently block field reports ("This action is unavailable in demo workplaces"), and live Nemotron calls need the Nebius key on the server. Both are open decisions.', { x: 0.6, y: 4.9, w: 12.1, h: 1.2 });
  s.addText('Nothing is dispatched for a field report without an approval record.', { x: 0.6, y: 6.3, w: 12, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: INK });
}
// 6 Analytics
{
  const s = pptx.addSlide();
  frame(s, 'A month of recorded work shows where the time goes', 'Analytics');
  s.addImage({ path: `${S}/analytics-tab.png`, x: 0.6, y: 1.6, w: 8.4, h: 4.72 });
  bullets(s, [
    'September 2026: 3,004 issues in the synthetic plant.',
    'Reopen rate 25% of 4,683 observed attempts.',
    'The top two issue classes make 78% of September\'s issues; the 80% line is crossed on the third.',
    'Compass recommendations are compared with their baselines, and disagreements are recorded.',
  ], { x: 9.3, y: 1.7, w: 3.6, h: 4.8 });
}
// 7 Pareto
{
  const s = pptx.addSlide();
  frame(s, 'Where the downtime comes from', 'Issue Pareto');
  s.addImage({ path: `${S}/screen-pareto.png`, x: 0.6, y: 1.6, w: 8.4, h: 4.72 });
  bullets(s, [
    'Bars, cumulative line and the 80% marker show which few classes cause most work.',
    'Drill down from class to symptom to the fix that was applied.',
    'The Pareto describes recorded work. It does not rank people or claim cause.',
  ], { x: 9.3, y: 1.7, w: 3.6, h: 4.8 });
}
// 8 Honest by design
{
  const s = pptx.addSlide();
  frame(s, 'Code owns the facts. Models only rank and explain.', 'Honest by design');
  s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.7, w: 5.9, h: 4.9, fill: { color: PAPER }, line: { color: RULE } });
  s.addText('Code decides', { x: 0.85, y: 1.9, w: 5.4, h: 0.5, fontFace: FONT, fontSize: 18, bold: true, color: INK });
  s.addText(['Eligibility, travel time and observed history', 'Safety prerequisites and certifications', 'Dispatch gate: nothing moves without approval', 'Validation of every model output and citation'].map(t => ({ text: t, options: { bullet: { indent: 16 }, paraSpaceAfter: 8 } })), { x: 0.85, y: 2.5, w: 5.4, h: 3.8, fontFace: FONT, fontSize: 15, color: INK, valign: 'top' });
  s.addShape(pptx.ShapeType.rect, { x: 6.8, y: 1.7, w: 5.9, h: 4.9, fill: { color: 'FFFFFF' }, line: { color: RULE } });
  s.addText('Models do', { x: 7.05, y: 1.9, w: 5.4, h: 0.5, fontFace: FONT, fontSize: 18, bold: true, color: INK });
  s.addText(['Rank the options code supplies', 'Investigate with read-only, allowlisted tools', 'Explain each ranking in bounded qualitative prose', 'Never see the hidden responder skill or the true fault cause'].map(t => ({ text: t, options: { bullet: { indent: 16 }, paraSpaceAfter: 8 } })), { x: 7.05, y: 2.5, w: 5.4, h: 3.8, fontFace: FONT, fontSize: 15, color: INK, valign: 'top' });
}
// 9 Nemotron
{
  const s = pptx.addSlide();
  frame(s, 'Built on NVIDIA Nemotron through Nebius Token Factory', 'Models and infrastructure');
  const rows = [
    [{ text: 'Role', options: { bold: true } }, { text: 'Model (code default)', options: { bold: true } }, { text: 'What it does', options: { bold: true } }],
    ['Investigator', 'Nemotron 3 Ultra (550B-A55B)', 'Tool-using investigation of a field report, with cited cases'],
    ['Responder, fix and overtime ranking', 'Nemotron 3 Super (120B-A12B)', 'Ranks code-supplied options with qualitative rationale'],
    ['Event planner and narrator', 'Nemotron 3.5 Lightning', 'Plans simulated events and writes simulated narratives'],
  ];
  s.addTable(rows, { x: 0.6, y: 1.7, w: 12.1, colW: [3.3, 3.7, 5.1], fontFace: FONT, fontSize: 13, color: INK, border: { type: 'solid', color: RULE, pt: 0.75 }, rowH: 0.55 });
  callout(s, 'Status: live Nebius calls are pending the Token Factory key on the deployed server. Until it is set, every ranking uses the deterministic fallback, and the screens say so. Re-shoot these slides after a live probe.', { x: 0.6, y: 4.6, w: 12.1, h: 1.1 });
  bullets(s, ['Provider controls: per-provider timeouts, bounded retries, rate limiting and a circuit breaker.'], { x: 0.6, y: 5.9, w: 12, h: 0.8 });
}
// 10 Status
{
  const s = pptx.addSlide();
  frame(s, 'Status and what is left before submission', 'Status');
  s.addText('Built and tested', { x: 0.6, y: 1.7, w: 5.8, h: 0.5, fontFace: FONT, fontSize: 18, bold: true, color: INK });
  bullets(s, ['Control room wall screens and operator console', 'Guest workplaces with a shared password and a cap of 10 registered users', 'Dispatch gate, approval routes and audit trail', '635 hermetic tests and 208 Chromium end-to-end tests on master'], { x: 0.6, y: 2.2, w: 5.8, h: 4 });
  s.addText('Open before submission', { x: 6.9, y: 1.7, w: 5.8, h: 0.5, fontFace: FONT, fontSize: 18, bold: true, color: AMBER });
  bullets(s, ['Nebius Token Factory key on the server, then a live Nemotron probe', 'Decide whether judges can use field reports (Investigator) on guest workplaces', 'Re-record the three-minute video with live Nemotron calls', 'Upload the video to YouTube and publish the Apache-2.0 repository'], { x: 6.9, y: 2.2, w: 5.8, h: 4 });
}

await pptx.writeFile({ fileName: `${new URL('./', import.meta.url).pathname}ResponseCompass-nebius-deck-draft.pptx` });
console.log('written');
