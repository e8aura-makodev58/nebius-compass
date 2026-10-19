import { expect, test } from '@playwright/test';

/**
 * Room mutations require Content-Type: application/json (security review #1). The shared
 * config adds that header to every request, which would hide a frontend that omits it, so
 * this file switches the default headers off and drives the real UI.
 */
test.use({ extraHTTPHeaders: {} });

test('the frontend sends JSON on bodyless commands, and the server rejects text/plain', async ({ page }) => {
  const rejected = [];
  page.on('response', (response) => { if ([403, 415].includes(response.status())) rejected.push(`${response.status()} ${response.url()}`); });
  await page.goto('/rooms/plant-1');
  await page.getByRole('button', { name: 'Live Simulation' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('body')).not.toHaveClass(/busy/);
  const toggle = page.locator('#pause-resume-button');
  await toggle.click();
  await expect(toggle).toHaveText('Pause');
  await toggle.click();
  await expect(toggle).toHaveText('Resume');
  expect(rejected).toEqual([]);
  const plain = await page.request.post('/api/control-rooms/plant-1/simulation/pause', { headers: { 'content-type': 'text/plain' }, data: '' });
  expect(plain.status()).toBe(415);
});
