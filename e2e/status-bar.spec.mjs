import { expect, test } from "@playwright/test";

test("status bar sits below the workspace with a margin and reports the room clock and poll state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#status-bar")).toBeVisible();
  await expect(page.locator("#status-bar-room")).toHaveText("plant-1");
  await expect(page.locator("#status-bar-clock")).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  await expect(page.locator("#status-bar-sync")).toHaveText(/^Updated \d/);
  const gaps = await page.evaluate(() => {
    const bar = document.querySelector("#status-bar").getBoundingClientRect();
    const workspace = document.querySelector("#control-room-view .dashboard").getBoundingClientRect();
    return { belowWorkspace: bar.top - workspace.bottom, fromViewportEdge: innerHeight - bar.bottom };
  });
  expect(gaps.belowWorkspace).toBeGreaterThanOrEqual(6);
  expect(gaps.fromViewportEdge).toBeGreaterThanOrEqual(6);
});

test("status bar stays inside a phone-width viewport without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#status-bar")).toBeVisible();
  await expect(page.locator("#status-bar-sync")).toHaveText(/^Updated \d/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("status bar reports a failed poll and recovers when the room answers again", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#status-bar-sync")).toHaveText(/^Updated \d/);
  await page.route("**/api/control-rooms/plant-1/state", (route) => route.abort());
  const sync = page.locator("#status-bar-sync");
  await expect(sync).toHaveText("Update failed — retrying");
  await expect(sync).toHaveClass(/status-bar-sync-failed/);
  await page.unroute("**/api/control-rooms/plant-1/state");
  await expect(sync).toHaveText(/^Updated \d/);
  await expect(sync).not.toHaveClass(/status-bar-sync-failed/);
});
