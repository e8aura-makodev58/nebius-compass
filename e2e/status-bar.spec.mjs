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

test("status bar stays inside a phone-width viewport without horizontal scroll and maintains accessible touch height", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#status-bar")).toBeVisible();
  await expect(page.locator("#status-bar-sync")).toHaveText(/^Updated \d/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const barHeight = await page.locator("#status-bar").evaluate((el) => el.getBoundingClientRect().height);
  expect(barHeight).toBeGreaterThanOrEqual(44);
});

test("status bar reports a failed poll and recovers with a polite live region that announces only state changes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/rooms/plant-1");
  const sync = page.locator("#status-bar-sync");
  const live = page.locator("#status-bar-live");
  await expect(sync).toHaveText(/^Updated \d/);
  // Polling timestamp does not flood screen-reader updates; live region announces polite connection status
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText("Room updates connected");
  // Steady-state poll tick updates timestamp on sync, while polite live region remains steady
  const initialTime = await sync.textContent();
  await expect.poll(async () => await sync.textContent()).not.toBe(initialTime);
  await expect(live).toHaveText("Room updates connected");

  // On failed poll, status bar announces error via polite live region
  await page.route("**/api/control-rooms/plant-1/state", (route) => route.abort());
  await expect(sync).toHaveText("Update failed — retrying");
  await expect(sync).toHaveClass(/status-bar-sync-failed/);
  await expect(live).toHaveText("Update failed — retrying");

  // On recovery, status bar recovers and announces restoration
  await page.unroute("**/api/control-rooms/plant-1/state");
  await expect(sync).toHaveText(/^Updated \d/);
  await expect(sync).not.toHaveClass(/status-bar-sync-failed/);
  await expect(live).toHaveText("Room updates restored");
});

test("the agent activity dot blinks while an agent is working and stays still otherwise", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#agent-activity-indicator")).toBeVisible();
  const dot = page.locator("#agent-activity-indicator .activity-dot");
  expect(await dot.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.locator("#agent-activity-indicator").evaluate((element) => element.classList.add("working"));
  // The keyframes must exist in a loaded stylesheet; a dangling animation name would silently do nothing.
  expect(await page.evaluate(() => [...document.styleSheets].some((sheet) => [...sheet.cssRules].some((rule) => rule.constructor.name === "CSSKeyframesRule" && rule.name === "activity-blink")))).toBe(true);
  await expect.poll(() => dot.evaluate((element) => getComputedStyle(element).animationName)).toBe("activity-blink");
});

test("the simulation dot blinks while the room is RUNNING and is steady otherwise", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  const run = page.locator("#status-bar-run");
  await expect(run).not.toHaveText("—");
  const dot = page.locator("#status-bar-dot");
  const running = (await run.textContent()).trim() === "Running";
  await expect(dot).toHaveClass(running ? /(^|\s)running(\s|$)/ : /(^|\s)(paused|offline|completed|idle)(\s|$)/);
  await expect.poll(() => dot.evaluate((element) => element.getAnimations().map((animation) => animation.animationName))).toEqual(running ? ["sim-blink"] : []);
  await expect(dot).toHaveAttribute("aria-hidden", "true");
});
