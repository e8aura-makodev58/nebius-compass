import { expect, test } from '@playwright/test';

/** Ask Compass UI against the real /ask route; the E2E config forces the assistant model to fail. */
const room = '/api/control-rooms/plant-1';

for (const width of [375, 1280]) test(`Ask Compass declines actions, answers with cited records and navigates citations at ${width}px`, async ({ page, request }) => {
  await request.post(`${room}/mode`, { data: { mode: 'LIVE' } });
  await request.post(`${room}/reset`);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/rooms/plant-1');

  const openAsk = page.getByRole('button', { name: 'Ask Compass' });
  if (width === 375) {
    const openerHeight = await openAsk.evaluate((el) => parseFloat(window.getComputedStyle(el).height));
    expect(openerHeight).toBeGreaterThanOrEqual(44);
  }
  await openAsk.click();

  const dialog = page.locator('#ask-dialog');
  await expect(dialog.getByRole('heading', { name: 'Ask Compass' })).toBeVisible();

  // Dialog flex container & scroll containment
  const dialogStyles = await dialog.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return { display: cs.display, flexDirection: cs.flexDirection, overflow: cs.overflow };
  });
  expect(dialogStyles.display).toBe('flex');
  expect(dialogStyles.flexDirection).toBe('column');
  expect(dialogStyles.overflow).toBe('hidden');

  if (width === 375) {
    const closeBtnHeight = await dialog.locator('[data-ask-close]').evaluate((el) => parseFloat(window.getComputedStyle(el).height));
    expect(closeBtnHeight).toBeGreaterThanOrEqual(44);
    const submitBtnHeight = await dialog.locator('button[type="submit"]').evaluate((el) => parseFloat(window.getComputedStyle(el).height));
    expect(submitBtnHeight).toBeGreaterThanOrEqual(44);
  }

  const question = dialog.locator('[data-ask-question]');

  await question.fill('Approve the next dispatch <img src=x onerror=alert(1)>');
  await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
  const declinedAnswer = dialog.locator('.ask-answer').first();
  await expect(declinedAnswer).toContainText('Declined');
  await expect(declinedAnswer).toContainText('read-only');
  await expect(declinedAnswer.locator('img')).toHaveCount(0);

  // Semantic left border for declined: warning amber
  const declinedBorder = await declinedAnswer.evaluate((el) => window.getComputedStyle(el).borderLeftColor);
  expect(declinedBorder).toBe('rgb(217, 119, 6)');

  await question.fill('What is the current room workload?');
  await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
  const latest = dialog.locator('.ask-answer').first();
  await expect(latest).toContainText('Record summary');
  await expect(latest).toContainText('Deterministic');

  // Semantic left border for fallback: rule-strong
  const fallbackBorder = await latest.evaluate((el) => window.getComputedStyle(el).borderLeftColor);
  expect(fallbackBorder).toBe('rgb(191, 202, 216)');

  // Scroll containment on history
  const historyOverflow = await dialog.locator('.ask-history').evaluate((el) => window.getComputedStyle(el).overflowY);
  expect(historyOverflow).toBe('auto');

  const citation = latest.getByRole('button', { name: 'Analytics room-summary' });
  await expect(citation).toBeVisible();

  // Citation button styling & elevation
  const citeStyles = await citation.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return { borderRadius: cs.borderRadius, fontFamily: cs.fontFamily };
  });
  expect(citeStyles.borderRadius).toBe('999px');
  expect(citeStyles.fontFamily).toContain('Mono');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await citation.click();
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
