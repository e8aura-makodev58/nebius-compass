import { expect, test } from '@playwright/test';

/**
 * UI contract test for the Field reports tile (plan v2 §3.8), with stubbed routes. It covers
 * the approve flow and the exact request bodies, which need case history a freshly reset room
 * does not have. The real routes are exercised in investigation-real.spec.mjs and the backend
 * investigator tests; keep the stub shapes identical to the real DTOs.
 */
const room = '/api/control-rooms/plant-1';
const at = '2026-10-19T08:00:00.000Z';

function stubStore() {
  return {
    reports: [],
    investigations: [
      { id: 'INV-ESC', issueId: 'ISSUE-ESC', reportId: 'FR-ESC', status: 'ESCALATED', source: 'DETERMINISTIC', reason: 'Hazard words in the report: smoke.', revision: 1, trace: [], fixes: [], responders: [] },
      { id: 'INV-ABS', issueId: 'ISSUE-ABS', reportId: 'FR-ABS', status: 'ABSTAINED', source: 'NEBIUS_MODEL', model: { modelId: 'nemotron-test', calls: 3, latencyMs: 8200, promptTokens: 2100, completionTokens: 240 }, evidenceGrade: 'NONE', reason: 'No past case used any catalog fix for this symptom.', revision: 1, trace: [{ tool: 'search_cases', args: { symptomCode: 'C-INTERRUPT' }, resultIds: [], ms: 4 }], fixes: [], responders: [] },
    ],
    extraReports: [
      { id: 'FR-ESC', status: 'CONFIRMED', narrative: 'Transfer stopped and there is light smoke near the drive.', flags: { hazard: ['smoke'] }, revision: 2 },
      { id: 'FR-ABS', status: 'CONFIRMED', narrative: 'Station 55 cycle interrupted twice.', flags: {}, revision: 2 },
    ],
    seq: 0,
  };
}

function readyInvestigation(report) {
  return {
    id: 'INV-1', issueId: 'ISSUE-NEW', reportId: report.id, status: 'READY', source: 'NEBIUS_MODEL', revision: 1,
    model: { modelId: 'nemotron-test', calls: 5, latencyMs: 14100, promptTokens: 5200, completionTokens: 610 },
    evidenceGrade: 'MODERATE', warnings: [],
    hypotheses: [{ symptomCode: 'A-DRIFT', text: 'Matches past drift reports on this station.', evidenceRefs: [{ caseId: 'CASE-ISSUE-0101', field: 'symptomCode' }] }],
    fixes: [
      { fixId: 'FIX-A-01', title: 'Verify reference settings', steps: 'Compare the reference settings with the operating checklist; restore the approved setting and verify stable output.', safetyClass: 'ISOLATION_REQUIRED', prerequisites: ['STATION_ISOLATED'], requiredCertifications: ['ISOLATION'], grade: 'MODERATE', rationale: 'Worked on comparable drift cases.', evidenceRefs: [{ caseId: 'CASE-ISSUE-0101', field: 'fixesTried' }] },
      { fixId: 'FIX-A-05', title: 'Check alignment', steps: 'Isolate the station, check and correct alignment against the reference marks, then run a controlled cycle.', safetyClass: 'ROUTINE', prerequisites: [], requiredCertifications: [], grade: 'THIN', evidenceRefs: [] },
    ],
    responders: [
      { responderId: 'R-ENGR028', displayName: 'Engineer 28', qualified: true, certifications: ['ISOLATION'], rationale: 'Closest qualified responder with drift experience.' },
      { responderId: 'R-ENGR003', displayName: 'Engineer 3', qualified: false, certifications: [] },
    ],
    trace: [{ tool: 'search_cases', args: { symptomCode: 'A-DRIFT' }, resultIds: ['CASE-ISSUE-0101'], ms: 6 }, { tool: 'eligible_responders', args: { issueId: 'ISSUE-NEW' }, resultIds: ['R-ENGR028', 'R-ENGR003'], ms: 3 }],
  };
}

async function installStubs(page, store) {
  await page.route(`**${room}/state`, async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    await route.fulfill({ response, json: { ...state, fieldReports: [...store.extraReports, ...store.reports], investigations: store.investigations } });
  });
  const ok = (route, json = { message: 'Updated.' }) => route.fulfill({ json });
  await page.route(`**${room}/reports`, async (route) => {
    const body = route.request().postDataJSON();
    const report = { id: `FR-${++store.seq}`, status: 'UNRESOLVED', narrative: body.narrative, flags: {}, revision: 1, interpretation: { status: 'READY', source: 'NEBIUS_MODEL', model: { modelId: 'nemotron-test' }, options: [
      { optionId: 'OPT-1', equipmentId: 'EQ-04', equipmentName: 'Station 4', issueClass: 'A', symptomCode: 'A-DRIFT', symptomText: 'Output drifts from the operating reference.', rationale: 'The report describes drift.' },
      { optionId: 'OPT-2', equipmentId: 'EQ-04', equipmentName: 'Station 4', issueClass: 'A', symptomCode: 'A-UNSTABLE', symptomText: 'Output readings fluctuate during a cycle.' },
    ] } };
    store.reports.push(report);
    return ok(route, { reportId: report.id, message: 'Report received.' });
  });
  await page.route(`**${room}/reports/*/confirm`, async (route) => {
    const body = route.request().postDataJSON();
    const report = store.reports.at(-1);
    expect(body.optionId).toBe('OPT-1');
    expect(body.expectedRevision).toBe(1);
    report.status = 'CONFIRMED'; report.revision = 2;
    store.investigations.push(readyInvestigation(report));
    return ok(route, { issueId: 'ISSUE-NEW', investigationId: 'INV-1', message: 'Investigation started.' });
  });
  await page.route(`**${room}/investigations/INV-1/approve`, async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ responderId: 'R-ENGR028', fixId: 'FIX-A-01', confirmedPrerequisites: ['STATION_ISOLATED'], expectedRevision: 1 });
    const inv = store.investigations.find((i) => i.id === 'INV-1');
    Object.assign(inv, { status: 'APPROVED', revision: 2, decision: { status: 'APPROVED', actor: 'Central command', at, responderId: body.responderId, fixId: body.fixId } });
    return ok(route, { message: 'Approved by central command.' });
  });
  await page.route(`**${room}/investigations/INV-1/feedback`, async (route) => {
    store.investigations.find((i) => i.id === 'INV-1').feedback = { useful: route.request().postDataJSON().useful };
    return ok(route);
  });
  await page.route(`**${room}/cases/CASE-ISSUE-0101`, (route) => route.fulfill({ json: { caseId: 'CASE-ISSUE-0101', equipmentId: 'EQ-04', issueClass: 'A', symptomCode: 'A-DRIFT', symptomText: 'Output drifts from the operating reference.', reportNarrative: '<img src=x onerror=alert(1)> drift again', narrativeSource: 'template', fixesTried: [{ fixId: 'FIX-A-01', order: 1, outcome: 'FIXED' }], resolvedAt: at, firstTimeFix: true, totalMinutes: 42, legacy: false } }));
}

async function liveRoom(request) {
  await request.post(`${room}/mode`, { data: { mode: 'LIVE' } });
  await request.post(`${room}/reset`);
  await request.post(`${room}/simulation/pause`);
}

for (const width of [375, 1280]) test(`UI contract: field report → confirm → approve with prerequisites at ${width}px (stubbed routes)`, async ({ page, request }) => {
  await liveRoom(request);
  const store = stubStore();
  await installStubs(page, store);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/rooms/plant-1');
  if (width <= 900) await page.locator('[data-workspace=staffing]').click();
  const tile = page.locator('#investigation-tile');
  await expect(tile).toBeVisible();
  await tile.getByRole('button', { name: 'Report incident' }).click();
  await tile.locator('[data-inv-narrative]').fill('Station 4 output keeps drifting after an hour.');
  await page.waitForTimeout(1700); // a poll must not clear the draft
  await expect(tile.locator('[data-inv-narrative]')).toHaveValue('Station 4 output keeps drifting after an hour.');
  await tile.getByRole('button', { name: 'Submit report' }).click();
  await expect(tile.getByText('Station 4 · Class A · A-DRIFT')).toBeVisible();
  await tile.getByRole('button', { name: 'Confirm and investigate' }).click();
  await tile.getByRole('button', { name: /ISSUE-NEW/ }).click();
  const detail = tile.locator('[data-investigation-id="INV-1"]');
  await expect(detail.getByText('Recommended first action')).toBeVisible();
  await expect(detail.getByText('Nebius · nemotron-test')).toBeVisible();
  await expect(detail.getByText('Isolation required')).toBeVisible();
  await expect(detail.locator('input[value="R-ENGR003"]')).toBeDisabled();
  const approve = detail.getByRole('button', { name: 'Approve and dispatch' });
  await expect(approve).toBeDisabled();
  await detail.locator('[data-inv-prereq][value="STATION_ISOLATED"]').check();
  await page.waitForTimeout(1700); // the tick survives a poll
  await expect(detail.locator('[data-inv-prereq]')).toBeChecked();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(detail.getByText('Approved by central command').first()).toBeVisible();
  await detail.getByRole('button', { name: 'Useful', exact: true }).click();
  await expect(detail.getByText('Feedback recorded: useful')).toBeVisible();
  await detail.locator('[data-case-id="CASE-ISSUE-0101"]').first().click();
  const dialog = tile.locator('[data-inv-case-dialog]');
  await expect(dialog.getByText('Fixed on the first attempt')).toBeVisible();
  await expect(dialog.locator('img')).toHaveCount(0); // narrative is text, never HTML
  await dialog.getByRole('button', { name: 'Close' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('escalated and abstained investigations render as outcomes without dispatch controls', async ({ page, request }) => {
  await liveRoom(request);
  await installStubs(page, stubStore());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/rooms/plant-1');
  const tile = page.locator('#investigation-tile');
  await tile.getByRole('button', { name: /ISSUE-ESC/ }).click();
  await expect(tile.getByText('Escalated — safety').first()).toBeVisible();
  await expect(tile.getByText('Hazard: smoke')).toBeVisible();
  await expect(tile.getByRole('button', { name: 'Approve and dispatch' })).toHaveCount(0);
  await tile.getByRole('button', { name: /ISSUE-ABS/ }).click();
  await expect(tile.getByText('Abstained — needs a person').first()).toBeVisible();
  await expect(tile.getByText('No evidence')).toBeVisible();
  await expect(tile.getByRole('button', { name: 'Approve and dispatch' })).toHaveCount(0);
});

test('field reports display screen fits a wall screen', async ({ page, request }) => {
  await liveRoom(request);
  await installStubs(page, stubStore());
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/rooms/plant-1/display/investigation');
  await expect(page.locator('#floor')).toBeHidden();
  await expect(page.locator('#investigation-tile')).toBeVisible();
  await expect(page.locator('#investigation-tile').getByRole('button', { name: 'Report incident' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
