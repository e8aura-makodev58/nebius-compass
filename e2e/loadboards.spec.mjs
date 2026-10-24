import { expect, test } from "@playwright/test";

const MOCK_LOADBOARDS_PAYLOAD = {
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
      approvedPrograms: ["PM0096-P2"],
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
    {
      boardId: "LB-0115",
      revision: "D",
      condition: "QUARANTINED",
      cellId: null,
      approvedPrograms: ["SR1260-P3"],
      heldBy: null,
    },
  ],
};

test.describe("Loadboard inventory and checkout panel (F3 UI)", () => {
  test("renders desktop table layout at 1280px with board details, condition badges, and program tags", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Dockview tab switching to Loadboards
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    // Verify title and total count
    await expect(panel.locator("#loadboards-heading")).toHaveText("Loadboards");
    const countBadge = panel.locator(".lb-count-badge");
    await expect(countBadge).toBeVisible();
    await expect(countBadge).toHaveText("4 boards");

    // Table should be visible on desktop, cards container hidden
    const tableContainer = panel.locator(".lb-table-container");
    await expect(tableContainer).toBeVisible();
    const cardsContainer = panel.locator(".lb-cards-container");
    await expect(cardsContainer).toBeHidden();

    // Verify 4 rows in table
    const rows = panel.locator(".lb-table tbody tr[data-board-id]");
    await expect(rows).toHaveCount(4);

    // Verify row 1: LB-0412, Rev C, SERVICEABLE, ATE-1, Held (RES-0007)
    const row1 = panel.locator('.lb-table tbody tr[data-board-id="LB-0412"]');
    await expect(row1).toContainText("LB-0412");
    await expect(row1).toContainText("C");
    await expect(row1.locator(".lb-badge-serviceable")).toHaveText("Serviceable");
    await expect(row1.locator(".lb-location-cell")).toHaveText("ATE-1");
    await expect(row1.locator(".lb-program-pill")).toHaveCount(2);
    await expect(row1.locator(".lb-held-badge")).toContainText("Held (RES-0007)");

    // Verify row 2: LB-0398, Rev B, SERVICEABLE, In store, Available
    const row2 = panel.locator('.lb-table tbody tr[data-board-id="LB-0398"]');
    await expect(row2).toContainText("LB-0398");
    await expect(row2.locator(".lb-location-store")).toHaveText("In store");
    await expect(row2.locator(".lb-available-badge")).toHaveText("Available");

    // Verify row 3: LB-0204, UNDER_REPAIR
    const row3 = panel.locator('.lb-table tbody tr[data-board-id="LB-0204"]');
    await expect(row3.locator(".lb-badge-repair")).toHaveText("Under repair");

    // Verify row 4: LB-0115, QUARANTINED
    const row4 = panel.locator('.lb-table tbody tr[data-board-id="LB-0115"]');
    await expect(row4.locator(".lb-badge-quarantined")).toHaveText("Quarantined");

    // Zero horizontal scroll at 1280px
    const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(fitsViewport).toBe(true);
  });

  test("filters boards by search input (boardId, revision, cell, program, reservation)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    const searchInput = panel.locator("#lb-search-input");
    const countBadge = panel.locator(".lb-count-badge");

    // Filter by boardId: "0412"
    await searchInput.fill("0412");
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(1);
    await expect(panel.locator('.lb-table tbody tr[data-board-id="LB-0412"]')).toBeVisible();
    await expect(countBadge).toHaveText("1 of 4 boards");

    // Filter by program: "CX4820"
    await searchInput.fill("CX4820");
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(2);
    await expect(panel.locator('.lb-table tbody tr[data-board-id="LB-0412"]')).toBeVisible();
    await expect(panel.locator('.lb-table tbody tr[data-board-id="LB-0204"]')).toBeVisible();
    await expect(countBadge).toHaveText("2 of 4 boards");

    // Filter by cell location: "ATE-1"
    await searchInput.fill("ATE-1");
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(1);
    await expect(panel.locator('.lb-table tbody tr[data-board-id="LB-0412"]')).toBeVisible();

    // Filter by "In store"
    await searchInput.fill("in store");
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(3);

    // Clear search
    await searchInput.fill("");
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(4);
    await expect(countBadge).toHaveText("4 boards");
  });

  test("filters boards by condition select dropdown", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    const conditionSelect = panel.locator("#lb-condition-select");
    const countBadge = panel.locator(".lb-count-badge");

    // Select SERVICEABLE
    await conditionSelect.selectOption("SERVICEABLE");
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(2);
    await expect(panel.locator('.lb-table tbody tr[data-board-id="LB-0412"]')).toBeVisible();
    await expect(panel.locator('.lb-table tbody tr[data-board-id="LB-0398"]')).toBeVisible();
    await expect(countBadge).toHaveText("2 of 4 boards");

    // Select UNDER_REPAIR
    await conditionSelect.selectOption("UNDER_REPAIR");
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(1);
    await expect(panel.locator('.lb-table tbody tr[data-board-id="LB-0204"]')).toBeVisible();
    await expect(countBadge).toHaveText("1 of 4 boards");

    // Select QUARANTINED
    await conditionSelect.selectOption("QUARANTINED");
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(1);
    await expect(panel.locator('.lb-table tbody tr[data-board-id="LB-0115"]')).toBeVisible();
    await expect(countBadge).toHaveText("1 of 4 boards");

    // Reset to ALL
    await conditionSelect.selectOption("ALL");
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(4);
    await expect(countBadge).toHaveText("4 boards");
  });

  test("shows empty state when no boards match filter and allows reset", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    const searchInput = panel.locator("#lb-search-input");

    await searchInput.fill("NONEXISTENT_BOARD_XYZ");
    const emptyState = panel.locator(".lb-state.lb-empty");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText("No loadboards match the current search or filter.");

    // Click Reset filters button
    const resetBtn = emptyState.locator(".lb-reset-filter-button");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Table restored
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(4);
    await expect(searchInput).toHaveValue("");
  });

  test("handles forced endpoint failure with error state and retry", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    let shouldFail = true;
    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal test server error" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
        });
      }
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    const errorState = panel.locator(".lb-state.lb-error");
    await expect(errorState).toBeVisible();
    await expect(errorState).toContainText("Failed to load loadboard inventory");

    // Retry recovery
    shouldFail = false;
    const retryBtn = errorState.locator(".lb-retry-button");
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    // Should recover and display the table
    await expect(panel.locator(".lb-table tbody tr[data-board-id]")).toHaveCount(4);
  });

  test("renders mobile cards layout at 375px with zero horizontal scroll and compliant touch targets", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Click "Boards" button in workspace nav
    const boardsNavButton = page.locator('#workspace-nav button[data-workspace="loadboards"]');
    await expect(boardsNavButton).toBeVisible();
    await boardsNavButton.click();
    await expect(boardsNavButton).toHaveAttribute("aria-pressed", "true");

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    // On phone, table container is hidden and cards container is visible
    const tableContainer = panel.locator(".lb-table-container");
    await expect(tableContainer).toBeHidden();
    const cardsContainer = panel.locator(".lb-cards-container");
    await expect(cardsContainer).toBeVisible();

    // Verify 4 cards rendered
    const cards = panel.locator(".lb-cards-container .lb-card");
    await expect(cards).toHaveCount(4);

    // Verify first card details
    const firstCard = cards.first();
    await expect(firstCard.locator(".lb-board-id")).toHaveText("LB-0412");
    await expect(firstCard.locator(".lb-card-rev")).toHaveText("Rev C");
    await expect(firstCard.locator(".lb-badge-serviceable")).toHaveText("Serviceable");
    await expect(firstCard.locator(".lb-location-cell")).toHaveText("ATE-1");

    // Zero horizontal scroll on phone at 375px
    const pageScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const windowInnerWidth = await page.evaluate(() => window.innerWidth);
    expect(pageScrollWidth).toBeLessThanOrEqual(windowInnerWidth);

    const panelScrollWidth = await panel.evaluate((el) => el.scrollWidth);
    const panelClientWidth = await panel.evaluate((el) => el.clientWidth);
    expect(panelScrollWidth).toBeLessThanOrEqual(panelClientWidth + 1);

    // Touch targets compliance (>= 44px)
    const navBtnBox = await boardsNavButton.boundingBox();
    expect(navBtnBox.height).toBeGreaterThanOrEqual(44);

    const searchInput = panel.locator("#lb-search-input");
    const searchBox = await searchInput.boundingBox();
    expect(searchBox.height).toBeGreaterThanOrEqual(44);

    const conditionSelect = panel.locator("#lb-condition-select");
    const selectBox = await conditionSelect.boundingBox();
    expect(selectBox.height).toBeGreaterThanOrEqual(44);

    const refreshBtn = panel.locator(".lb-refresh-button");
    const refreshBox = await refreshBtn.boundingBox();
    expect(refreshBox.height).toBeGreaterThanOrEqual(44);
  });

  test("falls back to synthetic loadboards when endpoint returns 404", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // Endpoint returns 404
    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Route not found" }),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    // Verify synthetic boards populated
    const rows = panel.locator(".lb-table tbody tr[data-board-id]");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(4);

    const countBadge = panel.locator(".lb-count-badge");
    await expect(countBadge).toContainText("board");
  });
});
