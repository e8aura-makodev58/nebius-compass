import { expect, test } from "@playwright/test";

/**
 * Coverage for the Control Rooms picker and per-room isolation — see
 * Control_Rooms_SOW_v1_DRAFT.md §8. The single most important property this
 * file exercises is the one the whole feature exists to prove: two browser
 * contexts, each in a different room, must be able to mutate independently
 * with zero observable cross-talk.
 */

test("bare / shows the picker and polls no room's state until one is chosen", async ({ page }) => {
  const roomStateRequests = [];
  page.on("request", (request) => {
    if (/\/api\/control-rooms\/[^/]+\/state/.test(request.url())) roomStateRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page.locator("#room-picker-view")).toBeVisible();
  await expect(page.locator(".app-shell")).toBeHidden();
  await expect(page.locator(".room-picker-row")).toHaveCount(2);
  const directory = await (await page.request.get("/api/control-rooms")).json();
  expect(directory.rooms.map((room) => room.label)).toEqual(["e8-aura-p1", "e8-aura-p2"]);
  for (const [index, room] of directory.rooms.entries()) {
    await expect(page.locator(".room-picker-row").nth(index)).toContainText(room.displayName);
  }

  // Give the poll loop a couple of ticks' worth of time to prove it never started.
  await page.waitForTimeout(2_000);
  expect(roomStateRequests).toEqual([]);
});

test("clicking a room navigates to /rooms/:id and boots the existing Control Room UI scoped to it", async ({ page }) => {
  await page.goto("/");
  await page.locator(".room-picker-row").first().click();
  await page.waitForURL(/\/rooms\/plant-1\/?$/);
  await expect(page.locator("#room-picker-view")).toBeHidden();
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("#floor")).toBeVisible();
  await expect(page.locator(".map-node.equipment")).toHaveCount(72);
});

test("a direct navigation to /rooms/:id (no picker visit) boots straight into that room", async ({ page }) => {
  await page.goto("/rooms/plant-2");
  await expect(page.locator("#room-picker-view")).toBeHidden();
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".map-node.equipment")).toHaveCount(72);
});

test("the poll keeps requesting only the room in the URL, never the picker's list route", async ({ page }) => {
  const requestedPaths = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) requestedPaths.push(url.pathname);
  });
  await page.goto("/rooms/plant-1");
  await page.waitForTimeout(3_500); // at least two 1.5s poll ticks
  expect(requestedPaths.some((path) => path === "/api/control-rooms/plant-1/state")).toBe(true);
  expect(requestedPaths.some((path) => path.startsWith("/api/control-rooms/plant-2"))).toBe(false);
  expect(requestedPaths.some((path) => path === "/api/control-rooms")).toBe(false);
});

test("an unknown room id renders the app's load-error path rather than crashing silently", async ({ page }) => {
  await page.goto("/rooms/does-not-exist");
  await expect(page.locator(".load-error")).toBeVisible();
});

/**
 * The core proof this whole feature exists to deliver: two simultaneous
 * browser contexts, each viewing a different room, must be able to mutate
 * independently with zero cross-talk — decision #2 of the SOW.
 */
test("two simultaneous browser contexts in different rooms never see each other's mutations", async ({ browser, baseURL }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // Reset both rooms via a direct API call before navigating, so this test is
  // self-contained regardless of what state an earlier test left them in —
  // in particular, whichever mode (Live/Offline) a prior test left a room in,
  // since the Reset button used later lives inside a Live-only section that
  // is hidden entirely in Offline mode, and clicking a hidden button hangs.
  for (const room of ["plant-1", "plant-2"]) {
    // Mode itself is not touched by reset() — only its own runtime's data —
    // so force LIVE explicitly too, otherwise a room a prior test left in
    // Offline mode would still render the Offline UI after this "reset".
    await page1.request.post(`${baseURL}/api/control-rooms/${room}/mode`, { data: { mode: "LIVE" } });
    const response = await page1.request.post(`${baseURL}/api/control-rooms/${room}/reset`);
    expect(response.ok()).toBe(true);
  }

  await page1.goto("/rooms/plant-1");
  await page2.goto("/rooms/plant-2");
  await expect(page1.locator("#simulation-status")).toHaveText("Paused");
  await expect(page2.locator("#simulation-status")).toHaveText("Paused");

  await page1.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page1.locator("#simulation-status")).toHaveText("Running");

  // Give plant-2's own poll loop time to have picked up a change if there
  // were one to pick up.
  await page2.waitForTimeout(3_500);
  await expect(page2.locator("#simulation-status")).toHaveText("Paused");

  await page1.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page1.locator("body")).not.toHaveClass(/busy/);
  await page2.getByRole("button", { name: "Show manufacturing floor 3" }).click();
  await expect(page2.locator(".floor-plane.active-floor .floor-tag")).toHaveText(/Floor 3/i);
  // plant1's own floor selection must be unaffected by plant-2's UI action.
  await expect(page1.locator(".floor-plane.active-floor .floor-tag")).toHaveText(/Floor 1/i);

  await context1.close();
  await context2.close();
});

test("switching rooms via the picker leaves no stale poll from the previous room", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.waitForTimeout(500);
  await page.goto("/");
  const requestedPaths = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/control-rooms/")) requestedPaths.push(url.pathname);
  });
  await page.locator(".room-picker-row").nth(1).click();
  await page.waitForURL(/\/rooms\/plant-2\/?$/);
  await page.waitForTimeout(3_500);
  expect(requestedPaths.every((path) => path.startsWith("/api/control-rooms/plant-2"))).toBe(true);
});

test("Control Rooms tab renames only the current room and opens another room by full navigation", async ({ page }) => {
  const directory = await page.request.get("/api/control-rooms");
  const original = (await directory.json()).rooms.find((room) => room.id === "plant-1");
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Control Rooms" }).click();
  await page.getByLabel("Display name").fill("North Plant");
  await page.getByRole("button", { name: "Rename current room" }).click();
  await expect(page.getByText("Renamed to North Plant.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /North Plant/ })).toBeVisible();
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Control Rooms" }).click();
  await page.getByRole("button", { name: "Open" }).click();
  await page.waitForURL(/\/rooms\/plant-2/);
  // Restore the name and revision progression this run started with, so a
  // repeated browser invocation sees the same directory it began with.
  await page.request.patch("/api/control-rooms/plant-1/display-name", { data: { displayName: original.displayName, expectedRevision: original.revision + 1 } });
});
