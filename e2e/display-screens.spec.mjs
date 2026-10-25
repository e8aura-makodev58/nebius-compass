import { expect, test } from "@playwright/test";

const SCREENS = { map: "#floor", issues: "#issue-list", events: "#event-feed", dispatch: ".context-panel", analytics: "#analytics-content", pareto: "#pareto-panel", staffing: "#staffing-tile", investigation: "#investigation-tile" };
const HIDDEN = { map: ["#issue-list", "#event-feed", ".context-panel"], issues: ["#floor", "#event-feed", ".context-panel"], events: ["#floor", "#issue-list", ".context-panel"], dispatch: ["#floor", "#issue-list", "#event-feed"], analytics: ["#floor", ".context-panel"], pareto: ["#floor", "#analytics-content"], staffing: ["#floor", ".context-panel", "#event-feed"], investigation: ["#floor", ".context-panel", "#staffing-tile"] };

for (const [screen, visible] of Object.entries(SCREENS)) {
  test(`wall display "${screen}" shows only its panel, the clock and no console controls`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/rooms/plant-1/display/${screen}`);
    await expect(page.locator("body")).toHaveClass(/display-mode/);
    await expect(page.locator(visible)).toBeVisible();
    for (const selector of HIDDEN[screen]) await expect(page.locator(selector)).toBeHidden();
    if (!["analytics", "pareto"].includes(screen)) await expect(page.locator("#simulation-time")).not.toHaveText("—");
    for (const selector of ["#control-room-tab", "#settings-tab", "#live-mode-button", "#reset-button", "#pause-resume-button", "#speed-select", "#open-control-search"]) await expect(page.locator(selector)).toBeHidden();
    await expect(page.locator("#floor-tiles")).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the console's Screens menu offers every panel; each choice opens the split-or-window chooser", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.locator(".screen-launcher > summary").click();
  const choices = page.locator("[data-open-screen]");
  await expect(choices).toHaveCount(14);
  expect(await choices.evaluateAll((rows) => rows.map((row) => row.dataset.openScreen))).toEqual(expect.arrayContaining(Object.keys(SCREENS)));
  await choices.first().click();
  await expect(page.locator("#panel-chooser")).toBeVisible();
});

test("an unknown display screen falls back to the operator console", async ({ page }) => {
  await page.goto("/rooms/plant-1/display/nonsense");
  await expect(page.locator("body")).not.toHaveClass(/display-mode/);
  await expect(page.locator("#floor-tiles")).toBeVisible();
});
