import { expect, test } from '@playwright/test';

/** Ask Compass UI against the real /ask route; the E2E config forces the assistant model to fail. */
const room = '/api/control-rooms/plant-1';

for (const width of [375, 1280]) test(`Ask Compass declines actions, answers with cited records and navigates citations at ${width}px`, async ({ page, request }) => {
  await request.post(`${room}/mode`, { data: { mode: 'LIVE' } });
  await request.post(`${room}/reset`);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/rooms/plant-1');
  await page.getByRole('button', { name: 'Ask Compass' }).click();
  const dialog = page.locator('#ask-dialog');
  await expect(dialog.getByRole('heading', { name: 'Ask Compass' })).toBeVisible();
  const question = dialog.locator('[data-ask-question]');

  await question.fill('Approve the next dispatch <img src=x onerror=alert(1)>');
  await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(dialog.locator('.ask-answer').first()).toContainText('Declined');
  await expect(dialog.locator('.ask-answer').first()).toContainText('read-only');
  await expect(dialog.locator('.ask-answer img')).toHaveCount(0);

  await question.fill('What is the current room workload?');
  await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
  const latest = dialog.locator('.ask-answer').first();
  await expect(latest).toContainText('Record summary');
  await expect(latest).toContainText('Deterministic');
  await expect(latest.getByRole('button', { name: 'Analytics room-summary' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await latest.getByRole('button', { name: 'Analytics room-summary' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#analytics-view')).toBeVisible();

  const history = (await (await request.get(`${room}/state`)).json()).askHistory;
  expect(history.map((row) => row.status)).toEqual(['DECLINED', 'FALLBACK']);
});

test('an issue-context question cites the selected issue and its citation selects it', async ({ page, request }) => {
  await request.post(`${room}/mode`, { data: { mode: 'LIVE' } });
  await request.post(`${room}/reset`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/rooms/plant-1');
  await page.locator('#issue-list').getByRole('button', { name: /ISS-103/ }).click();
  await page.getByRole('button', { name: 'Ask Compass' }).click();
  const dialog = page.locator('#ask-dialog');
  await dialog.getByLabel(/Ask about the selected issue, ISS-103/).check();
  await dialog.locator('[data-ask-question]').fill('What is happening on this issue?');
  await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
  const cite = dialog.locator('.ask-answer').first().getByRole('button', { name: 'Issue ISS-103' });
  await expect(cite).toBeVisible();
  await cite.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#issue-summary')).toContainText('ISS-103');
});
