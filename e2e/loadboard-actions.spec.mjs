import { expect, test } from "@playwright/test";

const INITIAL_LOADBOARDS_PAYLOAD = {
  roomId: "plant-1",
  asOf: "2026-10-24T12:00:00.000Z",
  boards: [
    {
      boardId: "LB-0412",
      revision: "C",
      condition: "SERVICEABLE",
      cellId: "ATE-1",
      approvedPrograms: ["SR1260-P3", "CX4820-P1"],
      heldBy: "RES-0007",
    },
    {
      boardId: "LB-0398",
      revision: "B",
      condition: "SERVICEABLE",
      cellId: null,
      approvedPrograms: ["PM0096-P2", "GH0310-P1"],
      heldBy: null,
    },
    {
      boardId: "LB-0204",
      revision: "A",
      condition: "UNDER_REPAIR",
      cellId: null,
      approvedPrograms: ["CX4820-P1"],
      heldBy: null,
    },
  ],
};

test.describe("Loadboard check-out and release actions (F3 slice 2 UI)", () => {
  test("checks out an available board with station and program selection, refreshes inventory and announces in live region", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    let currentInventory = structuredClone(INITIAL_LOADBOARDS_PAYLOAD);

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === "POST" && url.includes("/checkout")) {
        const body = JSON.parse(route.request().postData());
        expect(body.boardId).toBe("LB-0398");
        expect(body.cellId).toBe("ATE-1");
        expect(body.programRevision).toBe("PM0096-P2");
        expect(body.requestId).toBeTruthy();

        // Update inventory for subsequent GET
        const board = currentInventory.boards.find((b) => b.boardId === "LB-0398");
        if (board) {
          board.cellId = "ATE-1";
          board.heldBy = "RES-9999";
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            decision: "ALLOCATED",
            reasons: [],
            reservation: {
              reservationId: "RES-9999",
              boardId: "LB-0398",
              cellId: "ATE-1",
              programRevision: "PM0096-P2",
              status: "HELD",
            },
          }),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(currentInventory),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/rooms/plant-1");

    // Dockview tab to Loadboards
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    // Verify row for LB-0398 has Check out button
    const row = panel.locator('.lb-table-container tr[data-board-id="LB-0398"]');
    await expect(row).toBeVisible();
    const checkoutBtn = row.locator(".lb-checkout-btn");
    await expect(checkoutBtn).toBeVisible();
    await expect(checkoutBtn).toHaveText("Check out");

    // Click Check out to open inline drawer
    await checkoutBtn.click();

    const checkoutWrap = panel.locator('.lb-table-container tr[data-checkout-for="LB-0398"]');
    await expect(checkoutWrap).toBeVisible();

    const stationSelect = checkoutWrap.locator('.lb-station-select[data-board-id="LB-0398"]');
    const programSelect = checkoutWrap.locator('.lb-program-select[data-board-id="LB-0398"]');
    await expect(stationSelect).toBeVisible();
    await expect(programSelect).toBeVisible();

    // Select station and program
    await stationSelect.selectOption("ATE-1");
    await programSelect.selectOption("PM0096-P2");

    // Submit checkout
    const submitBtn = checkoutWrap.locator('.lb-submit-checkout-btn[data-board-id="LB-0398"]');
    await submitBtn.click();

    // Verify drawer closed
    await expect(checkoutWrap).toBeHidden();

    // Verify inventory refreshed: LB-0398 is now held at ATE-1 with Release button
    await expect(row.locator(".lb-location-cell")).toHaveText("ATE-1");
    await expect(row.locator(".lb-held-badge")).toContainText("Held (RES-9999)");
    await expect(row.locator(".lb-release-btn")).toBeVisible();
    await expect(row.locator(".lb-checkout-btn")).toBeHidden();

    // Verify live region announcement
    const announcer = panel.locator("#lb-live-announcer");
    await expect(announcer).toContainText("Board LB-0398 checked out to ATE-1 for PM0096-P2");
  });

  test("displays plain text reasons next to row and announces in live region on checkout rejection", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === "POST" && url.includes("/checkout")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            decision: "REJECTED",
            reasons: ["CELL_ALREADY_HOLDING"],
            reservation: null,
          }),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(INITIAL_LOADBOARDS_PAYLOAD),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/rooms/plant-1");
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    const row = panel.locator('.lb-table-container tr[data-board-id="LB-0398"]');
    await expect(row).toBeVisible();

    // Open Check out
    const checkoutBtn = row.locator(".lb-checkout-btn");
    await expect(checkoutBtn).toBeVisible();
    await checkoutBtn.click();

    const checkoutWrap = panel.locator('.lb-table-container tr[data-checkout-for="LB-0398"]');
    await checkoutWrap.locator('.lb-station-select[data-board-id="LB-0398"]').selectOption("ATE-1");
    await checkoutWrap.locator('.lb-program-select[data-board-id="LB-0398"]').selectOption("PM0096-P2");

    // Confirm checkout
    await checkoutWrap.locator('.lb-submit-checkout-btn[data-board-id="LB-0398"]').click();

    // Verify plain text reasons shown next to the row
    const reasonsEl = row.locator(".lb-row-reasons");
    await expect(reasonsEl).toBeVisible();
    await expect(reasonsEl).toHaveText("CELL_ALREADY_HOLDING");

    // Verify live region announcement
    const announcer = panel.locator("#lb-live-announcer");
    await expect(announcer).toContainText("Checkout rejected for LB-0398: CELL_ALREADY_HOLDING");
  });

  test("releases a held board, refreshes inventory list and announces in live region", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    let currentInventory = structuredClone(INITIAL_LOADBOARDS_PAYLOAD);

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === "POST" && url.includes("/release")) {
        const body = JSON.parse(route.request().postData());
        expect(body.reservationId).toBe("RES-0007");
        expect(body.cellId).toBe("ATE-1");

        // Update inventory for subsequent GET
        const board = currentInventory.boards.find((b) => b.boardId === "LB-0412");
        if (board) {
          board.cellId = null;
          board.heldBy = null;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            decision: "RELEASED",
            reasons: [],
            reservation: null,
          }),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(currentInventory),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/rooms/plant-1");
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    const row = panel.locator('.lb-table-container tr[data-board-id="LB-0412"]');
    await expect(row).toBeVisible();

    // Verify row has Release button
    const releaseBtn = row.locator(".lb-release-btn");
    await expect(releaseBtn).toBeVisible();
    await expect(releaseBtn).toHaveText("Release");

    // Click Release
    await releaseBtn.click();

    // Verify inventory refreshed: LB-0412 is now In store and Available with Check out button
    await expect(row.locator(".lb-location-store")).toHaveText("In store");
    await expect(row.locator(".lb-available-badge")).toHaveText("Available");
    await expect(row.locator(".lb-checkout-btn")).toBeVisible();
    await expect(row.locator(".lb-release-btn")).toBeHidden();

    // Verify live region announcement
    const announcer = panel.locator("#lb-live-announcer");
    await expect(announcer).toContainText("Board LB-0412 released from ATE-1");
  });

  test("displays plain text reasons next to row and announces in live region on release rejection", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === "POST" && url.includes("/release")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            decision: "REJECTED",
            reasons: ["NO_HELD_RESERVATION"],
            reservation: null,
          }),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(INITIAL_LOADBOARDS_PAYLOAD),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/rooms/plant-1");
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    const row = panel.locator('.lb-table-container tr[data-board-id="LB-0412"]');
    await expect(row).toBeVisible();

    // Click Release
    const releaseBtn = row.locator(".lb-release-btn");
    await expect(releaseBtn).toBeVisible();
    await releaseBtn.click();

    // Verify plain text reasons shown next to the row
    const reasonsEl = row.locator(".lb-row-reasons");
    await expect(reasonsEl).toBeVisible();
    await expect(reasonsEl).toHaveText("NO_HELD_RESERVATION");

    // Verify live region announcement
    const announcer = panel.locator("#lb-live-announcer");
    await expect(announcer).toContainText("Release rejected for LB-0412: NO_HELD_RESERVATION");
  });

  test("supports keyboard reachable checkout form traversal and cancellation", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(INITIAL_LOADBOARDS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    const row = panel.locator('.lb-table-container tr[data-board-id="LB-0398"]');
    await expect(row).toBeVisible();
    const checkoutBtn = row.locator(".lb-checkout-btn");

    // Focus checkout button and press Enter
    await checkoutBtn.focus();
    await expect(checkoutBtn).toBeFocused();
    await page.keyboard.press("Enter");

    // Form opens and station select is focused
    const stationSelect = panel.locator('.lb-table-container tr[data-checkout-for="LB-0398"] .lb-station-select');
    await expect(stationSelect).toBeVisible();
    await expect(stationSelect).toBeFocused();

    // Press Tab to program select
    await page.keyboard.press("Tab");
    const programSelect = panel.locator('.lb-table-container tr[data-checkout-for="LB-0398"] .lb-program-select');
    await expect(programSelect).toBeFocused();

    // Press Tab to submit button
    await page.keyboard.press("Tab");
    const submitBtn = panel.locator('.lb-table-container tr[data-checkout-for="LB-0398"] .lb-submit-checkout-btn');
    await expect(submitBtn).toBeFocused();

    // Press Tab to cancel button
    await page.keyboard.press("Tab");
    const cancelBtn = panel.locator('.lb-table-container tr[data-checkout-for="LB-0398"] .lb-cancel-checkout-btn');
    await expect(cancelBtn).toBeFocused();

    // Press Enter to cancel
    await page.keyboard.press("Enter");

    // Drawer is closed and focus returns to the Check out button
    await expect(stationSelect).toBeHidden();
    await expect(checkoutBtn).toBeFocused();
  });

  test("renders responsive check out and release flow on mobile (375px) with >= 44px touch targets and zero horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(INITIAL_LOADBOARDS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Switch to Loadboards via mobile workspace nav
    const navBtn = page.locator('#workspace-nav button[data-workspace="loadboards"]');
    await expect(navBtn).toBeVisible();
    await navBtn.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    // Cards should be visible, desktop table hidden
    const cards = panel.locator(".lb-card");
    await expect(cards).toHaveCount(3);

    // Open Check out on available board card (LB-0398)
    const card0398 = panel.locator('.lb-card[data-board-id="LB-0398"]');
    const checkoutBtn = card0398.locator(".lb-checkout-btn");
    await expect(checkoutBtn).toBeVisible();

    // Verify touch target >= 44px
    const checkoutBox = await checkoutBtn.boundingBox();
    expect(checkoutBox).not.toBeNull();
    expect(checkoutBox.height).toBeGreaterThanOrEqual(44);

    // Click Check out
    await checkoutBtn.click();

    // Verify form rendered in card with >= 44px touch targets
    const stationSelect = card0398.locator(".lb-station-select");
    const programSelect = card0398.locator(".lb-program-select");
    const submitBtn = card0398.locator(".lb-submit-checkout-btn");

    await expect(stationSelect).toBeVisible();
    await expect(programSelect).toBeVisible();
    await expect(submitBtn).toBeVisible();

    const stationBox = await stationSelect.boundingBox();
    const programBox = await programSelect.boundingBox();
    const submitBox = await submitBtn.boundingBox();

    expect(stationBox.height).toBeGreaterThanOrEqual(44);
    expect(programBox.height).toBeGreaterThanOrEqual(44);
    expect(submitBox.height).toBeGreaterThanOrEqual(44);

    // Verify held card (LB-0412) has Release button with >= 44px touch target
    const card0412 = panel.locator('.lb-card[data-board-id="LB-0412"]');
    const releaseBtn = card0412.locator(".lb-release-btn");
    await expect(releaseBtn).toBeVisible();
    const releaseBox = await releaseBtn.boundingBox();
    expect(releaseBox.height).toBeGreaterThanOrEqual(44);

    // Zero horizontal scroll on mobile viewport
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth);

    const panelScrollWidth = await panel.evaluate((el) => el.scrollWidth);
    const panelClientWidth = await panel.evaluate((el) => el.clientWidth);
    expect(panelScrollWidth).toBeLessThanOrEqual(panelClientWidth);
  });
});
