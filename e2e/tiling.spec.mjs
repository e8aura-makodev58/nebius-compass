import { expect, test } from "@playwright/test";

const KEY = "responsecompass.tiling.v1";
const tile = (page, id) => page.locator(`[data-tile="${id}"]`).locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' dv-groupview ')][1]");
async function boot(page) {
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#floor-tiles .dv-groupview")).toHaveCount(6);
  await expect(page.locator("#floor .building")).toBeVisible();
}
async function geometry(page) {
  return page.locator("#floor-tiles").evaluate((host) => ({
    frame: host.getBoundingClientRect().toJSON(),
    groups: [...host.querySelectorAll(".dv-groupview")].map((group) => ({
      id: group.querySelector("[data-tile]").dataset.tile, ...group.getBoundingClientRect().toJSON(),
    })),
  }));
}
async function dragRootDivider(page, delta) {
  const sash = page.getByRole("separator", { name: "Resize tiles horizontally", exact: true }).first();
  const box = await sash.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("desktop tiles cover the frame without gaps, overlaps or outbound requests", async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const outbound = [], errors = [];
  page.on("request", (request) => { if (new URL(request.url()).origin !== origin) outbound.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [width, height] of [[1440, 900], [1280, 900], [920, 900], [1440, 720]]) {
    await page.setViewportSize({ width, height });
    await boot(page);
    const { frame, groups } = await geometry(page);
    expect(groups).toHaveLength(6);
    let area = 0;
    for (const group of groups) {
      expect(group.left).toBeGreaterThanOrEqual(frame.left - 1);
      expect(group.top).toBeGreaterThanOrEqual(frame.top - 1);
      expect(group.right).toBeLessThanOrEqual(frame.right + 1);
      expect(group.bottom).toBeLessThanOrEqual(frame.bottom + 1);
      area += group.width * group.height;
      for (const other of groups.filter((candidate) => candidate.id !== group.id)) {
        const overlap = Math.min(group.right, other.right) - Math.max(group.left, other.left) > 1
          && Math.min(group.bottom, other.bottom) - Math.max(group.top, other.top) > 1;
        expect(overlap).toBe(false);
      }
    }
    expect(Math.abs(area - frame.width * frame.height)).toBeLessThan(8);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 480 });
  await boot(page);
  expect(await page.evaluate(() => ({
    scrolls: document.documentElement.scrollHeight > innerHeight,
    overflow: getComputedStyle(document.body).overflowY,
  }))).toEqual({ scrolls: true, overflow: "auto" });
  const short = await geometry(page);
  const covered = short.groups.reduce((sum, group) => sum + group.width * group.height, 0);
  expect(Math.abs(covered - short.frame.width * short.frame.height)).toBeLessThan(8);
  expect(outbound).toEqual([]); expect(errors).toEqual([]);
});

test("pointer and keyboard dividers resize neighbours equally and enforce minimum tile sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await boot(page);
  const beforeMap = await tile(page, "map").boundingBox(), beforeContext = await tile(page, "context").boundingBox();
  await dragRootDivider(page, 70);
  const afterMap = await tile(page, "map").boundingBox(), afterContext = await tile(page, "context").boundingBox();
  expect(afterMap.width - beforeMap.width).toBeCloseTo(70, 0);
  expect(beforeContext.width - afterContext.width).toBeCloseTo(70, 0);
  const sash = page.getByRole("separator", { name: "Resize tiles horizontally", exact: true }).first();
  await sash.focus(); await page.keyboard.press("ArrowLeft");
  expect(afterMap.width - (await tile(page, "map").boundingBox()).width).toBeCloseTo(10, 0);
  await expect(sash).toHaveCSS("outline-style", "solid");
  await dragRootDivider(page, 2000);
  expect((await tile(page, "context").boundingBox()).width).toBeGreaterThanOrEqual(280);
  await dragRootDivider(page, -2000);
  for (const [id, width, height] of [["map", 300, 220], ["context", 280, 180], ["issues", 180, 130], ["events", 180, 130]]) {
    const box = await tile(page, id).boundingBox(); expect(box.width).toBeGreaterThanOrEqual(width); expect(box.height).toBeGreaterThanOrEqual(height);
  }
});

test("layout persists across reload and Reset restores default sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await boot(page);
  const original = await tile(page, "map").boundingBox();
  await dragRootDivider(page, -85);
  const changed = await tile(page, "map").boundingBox();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).layout.grid.width, KEY)).toBeGreaterThan(0);
  // Wait for the debounced persisted geometry rather than relying on a fixed delay.
  await expect.poll(() => page.evaluate(({ key, width }) => {
    const record = JSON.parse(localStorage.getItem(key));
    return Math.abs(record.layout.grid.root.data[0].size - width) < 1;
  }, { key: KEY, width: changed.width } )).toBe(true);
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Compass vs Baselines" })).toBeVisible();
  await page.getByRole("button", { name: "Live Floor", exact: true }).click();
  await page.reload(); await expect(page.locator("#floor-tiles .dv-groupview")).toHaveCount(6);
  expect((await tile(page, "map").boundingBox()).width).toBeCloseTo(changed.width, 0);
  await page.getByRole("button", { name: "Reset layout", exact: true }).click();
  expect((await tile(page, "map").boundingBox()).width).toBeCloseTo(original.width, 0);
});

test("tiles can move to another edge and maximise/restore without detaching", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await boot(page);
  await page.evaluate(() => { window.originalFloorNode = document.querySelector("#floor"); });
  const before = await tile(page, "events").boundingBox();
  const target = tile(page, "context"); const box = await target.boundingBox();
  await page.locator(".dv-tab").filter({ hasText: "Event feed" }).dragTo(target, { targetPosition: { x: box.width / 2, y: box.height - 8 } });
  await expect.poll(async () => (await tile(page, "events").boundingBox()).x).not.toBe(before.x);
  expect(await page.locator("#floor-tiles .dv-groupview").count()).toBe(6);
  await page.getByRole("button", { name: "Maximise Floor map", exact: true }).click();
  await expect(page.getByRole("button", { name: "Restore Floor map", exact: true })).toBeVisible();
  const maximized = await tile(page, "map").boundingBox(), frame = await page.locator("#floor-tiles").boundingBox();
  expect(maximized.width).toBeCloseTo(frame.width, 0); expect(maximized.height).toBeCloseTo(frame.height, 0);
  await page.getByRole("button", { name: "Restore Floor map", exact: true }).click();
  expect(await page.evaluate(() => document.querySelector("#floor") === window.originalFloorNode)).toBe(true);
  await expect(page.locator(".dv-floating-group, .dv-popout-window")).toHaveCount(0);
});

test("corrupt and detached layouts fall back safely; unavailable storage does not prevent tiling", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript((key) => { localStorage.setItem(key, '{"version":1,"layout":{"floatingGroups":[{}]}}'); }, KEY);
  await boot(page);
  await expect(page.getByRole("button", { name: "Maximise Floor map", exact: true })).toBeVisible();
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("Storage blocked"); };
    Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
  });
  await page.reload(); await expect(page.locator("#floor-tiles .dv-groupview")).toHaveCount(6);
});

test("crossing the desktop breakpoint restores stacked nodes and keeps their handlers", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await boot(page);
  await page.evaluate(() => { window.originalFloorNode = document.querySelector("#floor"); window.originalIssueNode = document.querySelector("#issue-list"); });
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.locator("#floor-tiles")).toHaveCount(0);
  await expect(page.locator(".floor-section .lower-grid #issue-list")).toBeVisible();
  await expect(page.locator(".dashboard > .context-panel")).toBeVisible();
  await expect(page.locator(".dashboard")).toHaveCSS("display", "block");
  await expect(page.getByRole("button", { name: "Reset layout", exact: true })).toBeHidden();
  await page.locator("[data-workspace=floor]").click();
  await page.getByRole("button", { name: "Show manufacturing floor 3" }).click();
  await expect(page.locator(".floor-plane.active-floor .floor-tag")).toHaveText(/Floor 3/i);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("#floor-tiles .dv-groupview")).toHaveCount(6);
  expect(await page.evaluate(() => document.querySelector("#floor") === window.originalFloorNode && document.querySelector("#issue-list") === window.originalIssueNode)).toBe(true);
});

test("each tile opens its panel in its own window on the wall-display route, and the tile stays in the workspace", async ({ page }) => {
  await boot(page);
  for (const [title, screen] of [["Floor map", "map"], ["Dispatch / context", "dispatch"]]) {
    const button = page.getByRole("button", { name: `Open ${title} in its own window` });
    await expect(button).toBeVisible();
    const [popup] = await Promise.all([page.waitForEvent("popup"), button.click()]);
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(new RegExp(`/rooms/plant-1/display/${screen}$`));
    await expect(popup.locator("body")).toHaveClass(/display-mode/);
    await popup.close();
  }
  await expect(page.locator("#floor-tiles .dv-groupview")).toHaveCount(6);
});

test("tile headers expose accessible action toolbars, named controls and non-color active tab cues", async ({ page }) => {
  await boot(page);
  const toolbars = page.locator("#floor-tiles .tiling-actions");
  await expect(toolbars).toHaveCount(6);
  for (const bar of await toolbars.all()) {
    await expect(bar).toHaveAttribute("role", "toolbar");
    await expect(bar).toHaveAttribute("aria-label", "Tile actions");
  }
  for (const title of ["Floor map", "Dispatch / context", "Issues", "Event feed", "Field reports", "Staffing"]) {
    const detachBtn = page.getByRole("button", { name: `Open ${title} in its own window` });
    const maxBtn = page.getByRole("button", { name: `Maximise ${title}` });
    await expect(detachBtn).toBeVisible();
    await expect(maxBtn).toBeVisible();
  }
  // Active tab indicator uses non-color box-shadow cue
  const activeTab = page.locator("#floor-tiles .dv-tab.dv-active-tab").first();
  await expect(activeTab).toBeVisible();
  const shadow = await activeTab.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).toContain("rgb(15, 43, 67)");
});
