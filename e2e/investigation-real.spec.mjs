import { expect, test } from '@playwright/test';

/**
 * Field reports against the real N3a routes, with forced provider failure (no model calls).
 * A freshly reset room has no completed cases, so a confirmed report abstains; hazard and
 * garbled reports are decided by the code-owned policy before any model call. The approve
 * flow needs case history and is covered by backend tests and the stubbed UI contract spec.
 */
const room = '/api/control-rooms/plant-1';

async function openTile(page, request, width) {
  await request.post(`${room}/mode`, { data: { mode: 'LIVE' } });
  await request.post(`${room}/reset`);
  await request.post(`${room}/simulation/pause`);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/rooms/plant-1');
  if (width <= 900) await page.locator('[data-workspace=staffing]').click();
  const tile = page.locator('#investigation-tile');
  await expect(tile).toBeVisible();
  return tile;
}
async function submit(tile, narrative) {
  await tile.getByRole('button', { name: 'Report incident' }).click();
  await tile.locator('[data-inv-narrative]').fill(narrative);
  await tile.getByRole('button', { name: 'Submit report' }).click();
}

for (const width of [375, 1280]) test(`a confirmed report without case evidence abstains and offers no dispatch at ${width}px`, async ({ page, request }) => {
  const tile = await openTile(page, request, width);
  await submit(tile, 'Station 7 output keeps drifting from the reference after an hour; reset once already.');
  await expect(tile.getByText('Station 7 · Class A · A-DRIFT')).toBeVisible();
  await tile.getByRole('button', { name: 'Confirm and investigate' }).click();
  // The investigation runs in the agent lane; wait for it to settle.
  await expect.poll(async () => (await (await request.get(`${room}/state`)).json()).investigations.at(-1)?.status, { timeout: 15_000 }).toBe('ABSTAINED');
  const state = await (await request.get(`${room}/state`)).json();
  const investigation = state.investigations.at(-1);
  expect(investigation.status).toBe('ABSTAINED');
  expect(investigation.source).toBe('DETERMINISTIC');
  await tile.getByRole('button', { name: new RegExp(investigation.issueId) }).click();
  await expect(tile.getByText('Abstained — needs a person').first()).toBeVisible();
  await expect(tile.getByText('Deterministic', { exact: true })).toBeVisible();
  await expect(tile.getByRole('button', { name: 'Approve and dispatch' })).toHaveCount(0);
  const issue = state.issues.find((row) => row.id === investigation.issueId);
  expect(issue.dispatchGate).toBe('INVESTIGATION');
  expect(issue.assignedResponderId ?? null).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('hazard and garbled reports are decided by policy before any model call', async ({ page, request }) => {
  const tile = await openTile(page, request, 1280);
  await submit(tile, 'Station 9 transfer stopped and there is light smoke near the drive.');
  await submit(tile, 'asdf ;;; ### 4 4 4');
  await expect.poll(async () => (await (await request.get(`${room}/state`)).json()).investigations.length).toBe(2);
  const [hazard, garbled] = (await (await request.get(`${room}/state`)).json()).investigations;
  expect([hazard.status, garbled.status]).toEqual(['ESCALATED', 'ABSTAINED']);
  for (const row of [hazard, garbled]) expect(row.model?.calls ?? 0).toBe(0);
  // The newest policy-decided investigation is selected without a click.
  await expect(tile.locator(`[data-investigation-id="${garbled.id}"]`)).toBeVisible();
  await tile.getByRole('button', { name: new RegExp(hazard.issueId ?? hazard.id) }).click();
  await expect(tile.getByText('Escalated — safety').first()).toBeVisible();
  await expect(tile.getByText('Hazard: smoke')).toBeVisible();
  await tile.getByRole('button', { name: new RegExp(garbled.issueId ?? garbled.id) }).click();
  await expect(tile.getByText('Input policy: garbled')).toBeVisible();
  await expect(tile.getByRole('button', { name: 'Approve and dispatch' })).toHaveCount(0);
});

test('an abstained investigation can be re-investigated, then dispatched by an audited manual override', async ({ page, request }) => {
  const tile = await openTile(page, request, 1280);
  await submit(tile, 'Station 7 output keeps drifting from the reference after an hour; reset once already.');
  await tile.getByRole('button', { name: 'Confirm and investigate' }).click();
  await expect.poll(async () => (await (await request.get(`${room}/state`)).json()).investigations.at(-1)?.status, { timeout: 15_000 }).toBe('ABSTAINED');
  const first = (await (await request.get(`${room}/state`)).json()).investigations.at(-1);
  await tile.getByRole('button', { name: new RegExp(first.issueId) }).first().click();
  await tile.getByRole('button', { name: 'Re-investigate with current evidence' }).click();
  await expect.poll(async () => {
    const rows = (await (await request.get(`${room}/state`)).json()).investigations;
    return [rows.find((r) => r.id === first.id)?.status, rows.find((r) => r.supersedes === first.id)?.status];
  }, { timeout: 15_000 }).toEqual(['SUPERSEDED', 'ABSTAINED']);
  const second = (await (await request.get(`${room}/state`)).json()).investigations.find((r) => r.supersedes === first.id);
  const detail = tile.locator(`[data-investigation-id="${second.id}"]`);
  await expect(detail.getByText(`Re-investigation of ${first.id}`)).toBeVisible();
  await detail.getByText('Manual dispatch (audited override)').click();
  const routine = second.fixes.find((f) => f.safetyClass === 'ROUTINE');
  await detail.locator('[data-inv-override-fix]').selectOption(routine.fixId);
  const responder = detail.locator('[data-inv-override-responder]');
  await expect.poll(async () => responder.locator('option').count()).toBeGreaterThan(1);
  const responderId = await responder.locator('option').nth(1).getAttribute('value');
  await responder.selectOption(responderId);
  const override = detail.getByRole('button', { name: 'Override and dispatch' });
  await expect(override).toBeDisabled();
  await detail.locator('[data-inv-override-reason]').fill('Visual check on site; routine reset is safe');
  await page.waitForTimeout(1700); // a poll must not clear the form
  await expect(detail.locator('[data-inv-override-reason]')).toHaveValue('Visual check on site; routine reset is safe');
  await expect(override).toBeEnabled();
  await override.click();
  await expect.poll(async () => (await (await request.get(`${room}/state`)).json()).investigations.find((r) => r.id === second.id)?.status).toBe('OVERRIDDEN');
  const state = await (await request.get(`${room}/state`)).json();
  const decided = state.investigations.find((r) => r.id === second.id);
  expect(decided.decision).toMatchObject({ status: 'OVERRIDDEN', actor: 'Central command', responderId, fixId: routine.fixId, reason: 'Visual check on site; routine reset is safe' });
  expect(state.issues.find((i) => i.id === decided.issueId).assignedResponderId).toBe(responderId);
  await expect(detail.getByText('Overridden by central command').first()).toBeVisible();
});

test('field report policy saves from Settings and investigations appear in Analytics', async ({ page, request }) => {
  await request.post(`${room}/mode`, { data: { mode: 'LIVE' } });
  await request.post(`${room}/reset`);
  await page.goto('/rooms/plant-1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Demo', exact: true }).click();
  await page.locator('#investigation-approval').selectOption('AUTO_APPROVE_SAFE');
  await page.locator('#investigation-deadline').fill('45');
  await page.locator('#investigation-policy-save').click();
  await expect(page.locator('#investigation-policy-feedback')).toHaveText('Policy saved.');
  const policy = (await (await request.get(`${room}/state`)).json()).investigationPolicy;
  expect(policy).toMatchObject({ investigationApproval: 'AUTO_APPROVE_SAFE', investigationDeadlineMinutes: 45 });
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.locator('#analytics-investigations')).toContainText('Field report investigations');
});
