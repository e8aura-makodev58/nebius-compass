import { expect, test } from "@playwright/test";

const MOCK_OBLIGATIONS_PAYLOAD = {
  roomId: "plant-1",
  asOf: "2026-10-24T12:00:00.000Z",
  obligations: [
    {
      obligationId: "OBL-LC-ATE1-PRB01-CLEANING",
      kind: "CLEANING",
      status: "OPEN",
      lifecycleId: "LC-ATE1-PRB01",
      policyId: "probe-card-clean",
      policyVersion: "v1",
      openedAt: "2026-10-24T08:00:00.000Z",
      closedAt: null,
      closeReason: null,
      supersededBy: null,
    },
    {
      obligationId: "OBL-LC-ATE2-SOC03-REPLACEMENT",
      kind: "REPLACEMENT",
      status: "OPEN",
      lifecycleId: "LC-ATE2-SOC03",
      policyId: "socket-replace",
      policyVersion: "v2",
      openedAt: "2026-10-24T09:30:00.000Z",
      closedAt: null,
      closeReason: null,
      supersededBy: null,
    },
    {
      obligationId: "OBL-LC-ATE1-PRB01-PREV",
      kind: "CLEANING",
      status: "CLOSED",
      lifecycleId: "LC-ATE1-PRB01",
      policyId: "probe-card-clean",
      policyVersion: "v1",
      openedAt: "2026-10-23T14:00:00.000Z",
      closedAt: "2026-10-23T14:45:00.000Z",
      closeReason: "CLEANED",
      supersededBy: null,
    },
    {
      obligationId: "OBL-LC-ATE3-CHUCK01-RECON",
      kind: "RECONCILIATION",
      status: "CLOSED",
      lifecycleId: "LC-ATE3-CHUCK01",
      policyId: "chuck-reconcile",
      policyVersion: "v1",
      openedAt: "2026-10-23T16:00:00.000Z",
      closedAt: "2026-10-23T17:10:00.000Z",
      closeReason: "RESOLVED_BY_READING",
      supersededBy: null,
    },
  ],
};

test.describe("Consumable life obligations panel (F1 slice 2 UI)", () => {
  test("renders desktop table layout at 1280px with obligation details, kind badges, and policy tags", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/consumable-obligations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OBLIGATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Dockview tab switching to Obligations
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Obligations")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#obligations-tile");
    await expect(panel).toBeVisible();

    // Verify title and total count
    await expect(panel.locator("#obligations-heading")).toHaveText("Obligations");
    const countBadge = panel.locator(".obl-count-badge");
    await expect(countBadge).toBeVisible();
    await expect(countBadge).toHaveText("2 open · 4 total");

    // Table should be visible on desktop, cards container hidden
    const tableContainer = panel.locator(".obl-table-container");
    await expect(tableContainer).toBeVisible();
    const cardsContainer = panel.locator(".obl-cards-container");
    await expect(cardsContainer).toBeHidden();

    // Verify 4 rows in table
    const rows = panel.locator(".obl-table tbody tr[data-obligation-id]");
    await expect(rows).toHaveCount(4);

    // Verify row 1: OBL-LC-ATE1-PRB01-CLEANING, CLEANING, OPEN, probe-card-clean@v1
    const row1 = panel.locator('.obl-table tbody tr[data-obligation-id="OBL-LC-ATE1-PRB01-CLEANING"]');
    await expect(row1).toContainText("OBL-LC-ATE1-PRB01-CLEANING");
    await expect(row1.locator(".obl-badge-cleaning")).toHaveText("CLEANING");
    await expect(row1.locator(".obl-status-open")).toHaveText("OPEN");
    await expect(row1.locator(".obl-cell-lifecycle")).toHaveText("LC-ATE1-PRB01");
    await expect(row1.locator(".obl-policy-tag")).toHaveText("probe-card-clean@v1");

    // Verify row 3: OBL-LC-ATE1-PRB01-PREV, CLEANING, CLOSED, CLEANED
    const row3 = panel.locator('.obl-table tbody tr[data-obligation-id="OBL-LC-ATE1-PRB01-PREV"]');
    await expect(row3.locator(".obl-status-closed")).toHaveText("CLOSED");
    await expect(row3.locator(".obl-cell-reason")).toHaveText("CLEANED");

    // Verify row 4: RESOLVED_BY_READING close reason
    const row4 = panel.locator('.obl-table tbody tr[data-obligation-id="OBL-LC-ATE3-CHUCK01-RECON"]');
    await expect(row4.locator(".obl-badge-reconciliation")).toHaveText("RECONCILIATION");
    await expect(row4.locator(".obl-cell-reason")).toHaveText("RESOLVED_BY_READING");

    // Zero horizontal scroll on obligations panel
    const hasHorizontalScroll = await panel.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(hasHorizontalScroll).toBe(false);
  });

  test("filters obligations by status (ALL, OPEN, CLOSED)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/consumable-obligations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OBLIGATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Obligations")').click();

    const panel = page.locator("#obligations-tile");
    const statusSelect = panel.locator("#obl-status-select");
    const countBadge = panel.locator(".obl-count-badge");

    // Initially ALL: 4 obligations
    await expect(panel.locator(".obl-table tbody tr[data-obligation-id]")).toHaveCount(4);
    await expect(countBadge).toHaveText("2 open · 4 total");

    // Filter to OPEN: 2 obligations
    await statusSelect.selectOption("OPEN");
    await expect(panel.locator(".obl-table tbody tr[data-obligation-id]")).toHaveCount(2);
    await expect(countBadge).toHaveText("2 of 4 obligations");
    await expect(panel.locator('.obl-table tbody tr[data-obligation-id="OBL-LC-ATE1-PRB01-CLEANING"]')).toBeVisible();
    await expect(panel.locator('.obl-table tbody tr[data-obligation-id="OBL-LC-ATE2-SOC03-REPLACEMENT"]')).toBeVisible();

    // Filter to CLOSED: 2 obligations
    await statusSelect.selectOption("CLOSED");
    await expect(panel.locator(".obl-table tbody tr[data-obligation-id]")).toHaveCount(2);
    await expect(countBadge).toHaveText("2 of 4 obligations");
    await expect(panel.locator('.obl-table tbody tr[data-obligation-id="OBL-LC-ATE1-PRB01-PREV"]')).toBeVisible();
    await expect(panel.locator('.obl-table tbody tr[data-obligation-id="OBL-LC-ATE3-CHUCK01-RECON"]')).toBeVisible();

    // Back to ALL
    await statusSelect.selectOption("ALL");
    await expect(panel.locator(".obl-table tbody tr[data-obligation-id]")).toHaveCount(4);
    await expect(countBadge).toHaveText("2 open · 4 total");
  });

  test("filters obligations by search query and retains input focus while typing", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/consumable-obligations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OBLIGATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Obligations")').click();

    const panel = page.locator("#obligations-tile");
    const searchInput = panel.locator("#obl-search-input");

    // Focus search input
    await searchInput.focus();
    await searchInput.pressSequentially("socket", { delay: 30 });

    // Expect search input to retain active focus
    await expect(searchInput).toBeFocused();

    // Only socket-replace obligation remains
    const rows = panel.locator(".obl-table tbody tr[data-obligation-id]");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("OBL-LC-ATE2-SOC03-REPLACEMENT");

    // Clear search with Backspace
    await searchInput.selectText();
    await page.keyboard.press("Backspace");
    await expect(panel.locator(".obl-table tbody tr[data-obligation-id]")).toHaveCount(4);
    await expect(searchInput).toBeFocused();
  });

  test("supports keyboard reachable row actions and inspection drawer toggling", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/consumable-obligations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OBLIGATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Obligations")').click();

    const panel = page.locator("#obligations-tile");
    const inspectBtn = panel.locator('.obl-table-container .obl-action-btn[data-obligation-id="OBL-LC-ATE1-PRB01-CLEANING"]');

    // Focus button and activate via keyboard (Enter)
    await inspectBtn.focus();
    await expect(inspectBtn).toBeFocused();
    await page.keyboard.press("Enter");

    // Drawer opens
    const drawer = panel.locator('.obl-table-container .obl-detail-drawer[aria-label="Inspection details for OBL-LC-ATE1-PRB01-CLEANING"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("OBL-LC-ATE1-PRB01-CLEANING");
    await expect(drawer).toContainText("probe-card-clean@v1");

    // Pressing Enter again toggles drawer closed
    await page.keyboard.press("Enter");
    await expect(drawer).toBeHidden();
  });

  test("shows empty state and allows resetting filters", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/consumable-obligations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OBLIGATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Obligations")').click();

    const panel = page.locator("#obligations-tile");
    const searchInput = panel.locator("#obl-search-input");

    // Search for nonexistent term
    await searchInput.fill("nonexistent-obligation");

    const emptyState = panel.locator(".obl-empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText("No obligations match the current search or filter.");

    // Click Reset filters button
    const resetBtn = panel.locator(".obl-reset-filter-button");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Filters reset and rows reappear
    await expect(panel.locator(".obl-table tbody tr[data-obligation-id]")).toHaveCount(4);
    await expect(searchInput).toHaveValue("");
  });

  test("shows error state with retry button on network failure", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    let failRequest = true;
    await page.route("**/api/control-rooms/*/consumable-obligations*", async (route) => {
      if (failRequest) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_OBLIGATIONS_PAYLOAD),
        });
      }
    });

    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Obligations")').click();

    const panel = page.locator("#obligations-tile");
    const errorState = panel.locator(".obl-error-state");
    await expect(errorState).toBeVisible();
    await expect(errorState).toContainText("Failed to load consumable obligations");

    // Fix server response and click Retry
    failRequest = false;
    const retryBtn = panel.locator(".obl-retry-button");
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    // Data should now load successfully
    await expect(panel.locator(".obl-table tbody tr[data-obligation-id]")).toHaveCount(4);
  });

  test("renders responsive card layout on mobile (375px) with touch-friendly targets and zero horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route("**/api/control-rooms/*/consumable-obligations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OBLIGATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Switch to Obligations via workspace nav button
    const navBtn = page.locator('#workspace-nav button[data-workspace="obligations"]');
    await expect(navBtn).toBeVisible();
    await navBtn.click();

    const panel = page.locator("#obligations-tile");
    await expect(panel).toBeVisible();

    // Cards container should be visible, desktop table hidden
    const cardsContainer = panel.locator(".obl-cards-container");
    await expect(cardsContainer).toBeVisible();
    const tableContainer = panel.locator(".obl-table-container");
    await expect(tableContainer).toBeHidden();

    // Verify 4 cards
    const cards = panel.locator(".obl-card");
    await expect(cards).toHaveCount(4);

    // Verify touch target size of action buttons in cards (>= 44px min-height)
    const cardInspectBtn = cards.first().locator(".obl-action-btn");
    const box = await cardInspectBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(44);

    // Filter select touch target
    const filterSelect = panel.locator("#obl-status-select");
    const selectBox = await filterSelect.boundingBox();
    expect(selectBox).not.toBeNull();
    expect(selectBox.height).toBeGreaterThanOrEqual(44);

    // Search input touch target
    const searchInput = panel.locator("#obl-search-input");
    const searchBox = await searchInput.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(searchBox.height).toBeGreaterThanOrEqual(44);

    // Zero horizontal scroll at 375px on both document body and panel
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth);

    const panelScrollWidth = await panel.evaluate((el) => el.scrollWidth);
    const panelClientWidth = await panel.evaluate((el) => el.clientWidth);
    expect(panelScrollWidth).toBeLessThanOrEqual(panelClientWidth);
  });

  test("falls back gracefully to synthetic obligations when backend route returns 404", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // Let the route 404 (endpoint unmounted)
    await page.route("**/api/control-rooms/*/consumable-obligations*", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Route not found" }),
      });
    });

    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Obligations")').click();

    const panel = page.locator("#obligations-tile");
    await expect(panel).toBeVisible();

    // Should render synthetic fallback rows without crashing
    const rows = panel.locator(".obl-table tbody tr[data-obligation-id]");
    await expect(rows).toHaveCount(4);

    // Row 1 should have synthetic ID
    await expect(rows.first()).toContainText("OBL-LC-ATE1-PRB01-CLEANING");
  });
});
