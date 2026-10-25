import { expect, test } from "@playwright/test";

// Covers docs/design/window-panels.md §6. Tiling needs a desktop viewport (min-width 901px).
async function boot(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#floor-tiles .dv-groupview")).toHaveCount(6);
  await expect(page.locator("#floor .building")).toBeVisible();
}
const notice = (page, title) => page.locator(".tiling-detached").filter({ hasText: `${title} is open in its own window.` });

test("the Screens launcher lists every workspace panel and both views", async ({ page }) => {
  await boot(page);
  await page.getByText("Screens", { exact: true }).click();
  const menu = page.locator(".screen-launcher-menu");
  for (const name of ["Floor map", "Issues", "Event feed", "Dispatch / context", "Staffing", "Field reports", "Station KPIs", "Loadboards", "Obligations", "Handler episodes", "Calibrations", "Changeover readiness", "Analytics", "Issue Pareto"]) {
    await expect(menu.getByRole("button", { name, exact: true })).toBeVisible();
  }
});

test("a launcher choice opens the chooser; Open in its own window opens only that panel", async ({ page }) => {
  await boot(page);
  await page.getByText("Screens", { exact: true }).click();
  await page.locator(".screen-launcher-menu").getByRole("button", { name: "Station KPIs", exact: true }).click();
  const chooser = page.locator("#panel-chooser");
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("heading", { name: "Open Station KPIs" })).toBeVisible();
  const [popup] = await Promise.all([page.waitForEvent("popup"), chooser.getByRole("button", { name: "Open in its own window" }).click()]);
  await popup.waitForLoadState();
  await expect(popup).toHaveURL(/\/rooms\/plant-1\/display\/stationKpis$/);
  await expect(popup.locator("body")).toHaveClass(/display-mode/);
  await expect(popup.locator(".display-screen-label")).toContainText("Station KPIs");
  await expect(popup.locator("#floor")).toBeHidden();
  await expect(popup.locator("#station-kpi-tile")).toBeVisible();
  await popup.close();
});

test("the Station KPIs tile opens its own panel, not the operator console", async ({ page }) => {
  await boot(page);
  // Station KPIs is a tab in the Staffing tile by default; its action button belongs to the active tab.
  await page.locator(".tiling-tab-title", { hasText: "Station KPIs" }).click();
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Open Station KPIs in its own window" }).click()]);
  await popup.waitForLoadState();
  await expect(popup.locator("body")).toHaveClass(/display-mode/);
  await expect(popup.locator(".display-screen-label")).toContainText("Station KPIs");
  await popup.close();
});

test("a detached tile shows a notice; Bring back closes the window and restores the tile", async ({ page }) => {
  await boot(page);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Open Field reports in its own window" }).click()]);
  await popup.waitForLoadState();
  await expect(notice(page, "Field reports")).toBeVisible();
  await expect(page.locator("#floor-tiles .dv-groupview")).toHaveCount(6);
  await notice(page, "Field reports").getByRole("button", { name: "Bring Field reports back to this workspace" }).click();
  await expect(notice(page, "Field reports")).toHaveCount(0);
  await expect(page.locator("#investigation-tile")).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test("closing the window by hand restores the tile", async ({ page }) => {
  await boot(page);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Open Staffing in its own window" }).click()]);
  await popup.waitForLoadState();
  await expect(notice(page, "Staffing")).toBeVisible();
  await popup.close();
  await expect(notice(page, "Staffing")).toHaveCount(0);
  await expect(page.locator("#staffing-tile")).toBeVisible();
});

test("a reload keeps the notice while the window is still open", async ({ page }) => {
  await boot(page);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Open Staffing in its own window" }).click()]);
  await popup.waitForLoadState();
  await page.reload();
  await expect(page.locator("#floor-tiles .dv-groupview")).toHaveCount(6);
  await expect(notice(page, "Staffing")).toBeVisible();
  await popup.close();
});

test("Split into this workspace re-docks a detached panel from the launcher", async ({ page }) => {
  await boot(page);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Open Staffing in its own window" }).click()]);
  await popup.waitForLoadState();
  await expect(notice(page, "Staffing")).toBeVisible();
  await page.getByText("Screens", { exact: true }).click();
  await page.locator(".screen-launcher-menu").getByRole("button", { name: "Staffing", exact: true }).click();
  await page.locator("#panel-chooser").getByRole("button", { name: "Split into this workspace" }).click();
  await expect(notice(page, "Staffing")).toHaveCount(0);
  await expect(page.locator("#staffing-tile")).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test("the chooser traps focus, closes on Escape and returns focus to the launcher", async ({ page }) => {
  await boot(page);
  await page.getByText("Screens", { exact: true }).click();
  await page.locator(".screen-launcher-menu").getByRole("button", { name: "Issues", exact: true }).click();
  const chooser = page.locator("#panel-chooser");
  await expect(chooser).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chooser).toBeHidden();
  await expect(page.locator(".screen-launcher > summary")).toBeFocused();
});

test("the chooser offers only the window option on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/rooms/plant-1");
  await expect(page.getByText("Screens", { exact: true })).toBeVisible();
  await page.getByText("Screens", { exact: true }).click();
  await page.locator(".screen-launcher-menu").getByRole("button", { name: "Issues", exact: true }).click();
  const chooser = page.locator("#panel-chooser");
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("button", { name: "Split into this workspace" })).toBeHidden();
  await expect(chooser.getByRole("button", { name: "Open in its own window" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
