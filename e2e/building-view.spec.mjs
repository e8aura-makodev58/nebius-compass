import { expect, test } from "@playwright/test";

/**
 * Coverage for the interactive three-floor manufacturing map.
 *
 * The building is one CSS 3D scene: floors are stacked planes, and machines,
 * responders and floor signage lie in the plane so they foreshorten with it.
 * Readable text lives outside the scene, in a screen-space overlay measured
 * from the browser's own projection of each node.
 *
 * Three things here are easy to break and invisible to unit tests — floor
 * planes swallowing clicks meant for the machines drawn on them, the camera
 * failing to follow a selection to another floor, and label geometry measured
 * before the camera has finished moving.
 */

test("the building renders three floors of wireframe machines", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await expect(page.locator(".floor-plane")).toHaveCount(3);
  await expect(page.locator(".map-node.equipment")).toHaveCount(72);
  for (const floor of [1, 2, 3]) {
    await expect(page.locator(`.floor-plane:nth-child(${floor}) .map-node.equipment`)).toHaveCount(24);
  }
  // Exactly one floor is emphasised at a time.
  await expect(page.locator(".floor-plane.active-floor")).toHaveCount(1);
});

test("Shift Personnel and the floor show only people currently on duty", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  const onShift = await page.evaluate(async () => {
    const response = await fetch("/api/control-rooms/plant-1/state");
    const state = await response.json();
    return state.responders.filter((responder) => responder.availability !== "UNAVAILABLE").length;
  });
  await expect(page.getByText("Shift Personnel", { exact: true })).toBeVisible();
  await expect(page.locator("#responder-list > .responder-row")).toHaveCount(onShift);
  await expect(page.locator(".off-shift-personnel")).not.toHaveAttribute("open", "");
  await expect(page.locator(".map-node.responder")).toHaveCount(onShift);

  const first = page.locator("#responder-list > .responder-row").first();
  const second = page.locator("#responder-list > .responder-row").nth(1);
  await expect(first).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await first.hover();
  await expect(first).toHaveCSS("background-color", "rgb(237, 240, 245)");
  await first.click();
  await expect(first).toHaveClass(/selected/);
  await expect(first).toHaveCSS("background-color", "rgb(238, 240, 255)");
  await expect(second).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("floor selection exposes another manufacturing floor and its machines", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await expect(page.locator(".floor-plane.active-floor .floor-tag")).toHaveText(/Floor 1/i);
  await page.getByRole("button", { name: "Show manufacturing floor 3" }).click();
  await expect(page.locator(".floor-plane.active-floor .floor-tag")).toHaveText(/Floor 3/i);
  const upstairs = page.locator(".floor-plane").nth(2).locator(".map-node.equipment").first();
  await upstairs.click();
  await expect(page.locator(".map-node.focused")).toHaveCount(1);
  await expect(page.locator(".floor-plane.active-floor .floor-tag")).toHaveText(/Floor 3/i);
});

test("the optional 2.5D building can be rotated and survives the poll tick", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Use 2.5D perspective view" }).click();
  const before = await page.locator(".building").getAttribute("style");
  await page.getByRole("button", { name: "Rotate building right" }).click();
  await page.waitForTimeout(700);
  const after = await page.locator(".building").getAttribute("style");
  expect(after).not.toEqual(before);
  // The control room re-renders every 1.5s; the camera must not snap back.
  await page.waitForTimeout(3_500);
  expect(await page.locator(".building").getAttribute("style")).toEqual(after);
});

test("2.5D labels are screen-space overlays above or below projected nodes without collisions", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await page.getByRole("button", { name: "Use 2.5D perspective view" }).click();
  const labels = page.locator(".map-overlay-label");
  const activeEquipment = page.locator(".floor-plane.active-floor .map-node.active-equipment");
  // Personnel do not receive persistent labels. Their label is an intentional
  // interaction affordance, shown only while hovered or selected.
  await expect(labels).toHaveCount(await activeEquipment.count());
  const responder = page.locator(".floor-plane.active-floor .map-node.responder").first();
  await responder.hover();
  await expect(labels).toHaveCount((await activeEquipment.count()) + 1);

  const geometry = await responder.evaluate((node) => {
    const shape = node.querySelector(".node-shape").getBoundingClientRect();
    const label = [...document.querySelectorAll(".map-overlay-label")].find((entry) => entry.querySelector("strong")?.textContent === node.dataset.overlayLabel)?.getBoundingClientRect();
    return { shapeTop: shape.top, shapeBottom: shape.bottom, labelTop: label?.top, labelBottom: label?.bottom };
  });
  expect(geometry.labelBottom < geometry.shapeTop || geometry.labelTop > geometry.shapeBottom).toBe(true);

  const boxes = await labels.evaluateAll((entries) => entries.map((entry) => {
    const box = entry.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }));
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const overlap = !(boxes[first].right <= boxes[second].left || boxes[first].left >= boxes[second].right || boxes[first].bottom <= boxes[second].top || boxes[first].top >= boxes[second].bottom);
      expect(overlap).toBe(false);
    }
  }
});

/**
 * Labels are laid out from the browser's own projection of each node, so a
 * layout pass taken while the camera is still gliding leaves every leader line
 * ending in empty space. Nothing in the DOM says the line is wrong — only the
 * geometry does — so assert the endpoints directly after a camera move.
 */
test("2.5D leader lines still reach their nodes after the camera settles", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await page.getByRole("button", { name: "Use 2.5D perspective view" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(1_200);

  const leaders = await page.locator(".map-overlay-label").evaluateAll((labels) => labels.map((label) => {
    const box = label.getBoundingClientRect();
    const styles = getComputedStyle(label);
    const node = [...document.querySelectorAll(".map-node")].find((entry) => entry.dataset.overlayLabel === label.querySelector("strong").textContent);
    const shape = node.querySelector(".node-shape").getBoundingClientRect();
    return {
      placement: label.dataset.labelPlacement,
      endX: box.left + parseFloat(styles.getPropertyValue("--leader-x")),
      endY: label.dataset.labelPlacement === "below"
        ? box.top - parseFloat(styles.getPropertyValue("--leader-height"))
        : box.bottom + parseFloat(styles.getPropertyValue("--leader-height")),
      nodeX: shape.left + shape.width / 2,
      nodeY: shape.top + shape.height / 2,
    };
  }));
  expect(leaders.length).toBeGreaterThan(0);
  for (const leader of leaders) {
    expect(Math.abs(leader.endY - leader.nodeY)).toBeLessThan(2);
    expect(Math.abs(leader.endX - leader.nodeX)).toBeLessThan(12);
  }
});

test("desktop Control Room is viewport-bounded and map movement requires deliberate controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#floor")).toHaveClass(/view-2d/);
  await expect(page.getByRole("button", { name: "Rotate building right" })).toBeDisabled();
  await expect(page.locator(".map-help")).toContainText("Space + drag empty map to pan");
  const viewport = await page.evaluate(() => ({ viewport: window.innerHeight, document: document.documentElement.scrollHeight, body: document.body.scrollHeight }));
  expect(viewport.document).toBeLessThanOrEqual(viewport.viewport);
  expect(viewport.body).toBeLessThanOrEqual(viewport.viewport);

  // Header chrome is two rows, not four: the view tabs share the brand row and
  // the search opener shares the simulation row. Asserted as shared rows rather
  // than a pixel budget, so it survives font and copy changes but still fails
  // the moment either element is given a row of its own again.
  const rows = await page.evaluate(() => {
    const mid = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { mid: b.top + b.height / 2, top: b.top, bottom: b.bottom }; };
    return { brand: mid(".topbar h1"), tabs: mid(".tab-bar"), sim: mid(".simulation-bar"), search: mid("#open-control-search"), dashTop: document.querySelector(".dashboard").getBoundingClientRect().top };
  });
  expect(Math.abs(rows.tabs.mid - rows.brand.mid)).toBeLessThan(rows.brand.bottom - rows.brand.top);
  expect(Math.abs(rows.search.mid - rows.sim.mid)).toBeLessThan(rows.sim.bottom - rows.sim.top);
  // The map must get the bulk of the height, not the chrome above it.
  expect(rows.dashTop).toBeLessThan(viewport.viewport * 0.18);

  // The map help and the control bar must never cover each other.
  const mapChrome = await page.evaluate(() => {
    const box = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
    const [help, controls] = [box(".map-help"), box(".building-controls")];
    return !(help.right <= controls.left || help.left >= controls.right || help.bottom <= controls.top || help.top >= controls.bottom);
  });
  expect(mapChrome).toBe(false);
  await page.getByRole("button", { name: "Show manufacturing floor 2" }).click();
  const floor = page.locator("#floor");
  const bounds = await floor.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  // Plain wheel scroll is deliberately not a zoom gesture.
  await page.mouse.wheel(0, -450);
  await expect(page.locator("#zoom-level")).toHaveText("100%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator("#zoom-level")).not.toHaveText("100%");
  // Double click must not silently reset an intentionally chosen zoom.
  await page.mouse.dblclick(bounds.x + 18, bounds.y + bounds.height / 2);
  await expect(page.locator("#zoom-level")).not.toHaveText("100%");
  // An ordinary primary drag does not pan.
  await page.mouse.move(bounds.x + 18, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 95, bounds.y + bounds.height / 2 + 45, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".building-stage")).toHaveAttribute("style", /--pan-x: 0px/);
  // Space plus a primary-mouse drag on empty map background is the only pan gesture.
  await page.keyboard.down("Space");
  await page.mouse.move(bounds.x + 18, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 95, bounds.y + bounds.height / 2 + 45, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const camera = await page.locator(".building-stage").getAttribute("style");
  expect(camera).toMatch(/--pan-x: (?!0px)/);
  await page.waitForTimeout(3_500);
  expect(await page.locator(".building-stage").getAttribute("style")).toEqual(camera);
  await expect(page.locator(".floor-plane.active-floor .floor-tag")).toHaveText(/Floor 2/i);
});

/**
 * Live and Offline share one map renderer and one control bar, so a gesture
 * that works in one must work in the other. Arming pan in Live only left
 * Offline with working zoom buttons and a dead pan gesture, which is invisible
 * to every Live-only assertion.
 */
test("Offline map pans with the same deliberate gesture as Live", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Offline Demo" }).click();
  await expect(page.locator("#floor")).toBeVisible();
  const stage = page.locator(".building-stage");
  const before = await stage.getAttribute("style");

  const bounds = await page.locator("#floor").boundingBox();
  const startX = bounds.x + 18;
  const startY = bounds.y + bounds.height / 2;

  // Without Space held, a primary drag must not pan.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY + 40, { steps: 6 });
  await page.mouse.up();
  expect(await stage.getAttribute("style")).toEqual(before);

  // Space + primary drag is the deliberate gesture, and it must work here too.
  await page.keyboard.down("Space");
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await stage.getAttribute("style")).not.toEqual(before);

  // Mode is server-side global state, not per-browser-context. This spec sorts
  // before the Live-only specs, so leaving the server in Offline would fail
  // them with no hint that this test was the cause.
  await page.getByRole("button", { name: "Live Simulation" }).click();
  await expect(page.getByRole("button", { name: "Live Simulation" })).toHaveClass(/active/);
});

/**
 * A short desktop window is the case that can least afford tall chrome, and it
 * is the one a height-gated compaction silently misses. Gating the header on
 * min-height once left these windows worse than before any compaction existed:
 * the mode buttons were stranded on a left-aligned row of their own, five rows
 * deep. Header compaction is a width concern; only the bounded 100dvh
 * workstation depends on height.
 */
test("a short desktop window still gets the compact two-row header", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto("/rooms/plant-1");
  const rows = await page.evaluate(() => {
    const box = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { mid: b.top + b.height / 2, h: b.height }; };
    return { brand: box(".topbar h1"), tabs: box(".tab-bar"), mode: box(".mode-controls"), sim: box(".simulation-bar"), search: box("#open-control-search"), chrome: document.querySelector(".dashboard").getBoundingClientRect().top };
  });
  // Brand, tabs and mode share one row; simulation and search share the next.
  expect(Math.abs(rows.tabs.mid - rows.brand.mid)).toBeLessThan(30);
  expect(Math.abs(rows.mode.mid - rows.brand.mid)).toBeLessThan(30);
  expect(Math.abs(rows.search.mid - rows.sim.mid)).toBeLessThan(30);
  // Two rows of chrome, not four or five.
  expect(rows.chrome).toBeLessThan(180);
});

test("narrow Control Room keeps its stacked document flow and touch-safe map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/rooms/plant-1");
  await expect(page.locator(".dashboard")).toHaveCSS("display", "block");
  const dimensions = await page.evaluate(() => ({ viewport: window.innerHeight, document: document.documentElement.scrollHeight }));
  expect(dimensions.document).toBeGreaterThan(dimensions.viewport);
  await expect(page.locator("#floor")).toHaveCSS("touch-action", "pan-y");
});
