import { expect, test } from "@playwright/test";

const MOCK_CALIBRATIONS_PAYLOAD = {
  roomId: "plant-1",
  asOf: "2026-10-24T08:00:00.000Z",
  calibrations: [
    {
      calibrationId: "CAL-0031",
      cellId: "ATE-1",
      instrumentId: "PS-07",
      calibratedAt: "2026-05-20T08:00:00.000Z",
      dueAt: "2026-11-20T08:00:00.000Z",
      state: "CURRENT",
    },
    {
      calibrationId: "CAL-0022",
      cellId: "ATE-2",
      instrumentId: "DMM-02",
      calibratedAt: "2026-04-20T08:00:00.000Z",
      dueAt: "2026-10-20T08:00:00.000Z",
      state: "EXPIRED",
    },
    {
      calibrationId: "CAL-0044",
      cellId: "ATE-4",
      instrumentId: "SCOPE-01",
      calibratedAt: "2026-06-01T08:00:00.000Z",
      dueAt: "2026-12-01T08:00:00.000Z",
      state: "CURRENT",
    },
  ],
};

test.describe("Calibration records and add form (F8 Slice 2 UI)", () => {
  test("renders calibration records table with CURRENT and EXPIRED badges at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Open Calibrations tab from Dockview
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    await expect(panel).toBeVisible();

    // Verify header
    await expect(panel.locator(".cal-title")).toHaveText("Calibrations");
    await expect(panel.locator(".cal-eyebrow")).toHaveText("ATE Maintenance · F8");

    // Verify table structure
    const table = panel.locator(".cal-table-container table.cal-table");
    await expect(table).toBeVisible();

    const rows = table.locator("tbody tr[data-calibration-id]");
    await expect(rows).toHaveCount(3);

    // Verify row 1: CAL-0031 (CURRENT)
    const row1 = table.locator('tbody tr[data-calibration-id="CAL-0031"]');
    await expect(row1.locator(".cal-cell-id")).toContainText("CAL-0031");
    await expect(row1.locator(".cal-cell-cell")).toContainText("ATE-1");
    await expect(row1.locator(".cal-cell-inst")).toContainText("PS-07");
    await expect(row1.locator(".cal-state-badge")).toHaveText("CURRENT");
    await expect(row1.locator(".cal-state-badge")).toHaveClass(/cal-badge-current/);

    // Verify row 2: CAL-0022 (EXPIRED)
    const row2 = table.locator('tbody tr[data-calibration-id="CAL-0022"]');
    await expect(row2.locator(".cal-cell-id")).toContainText("CAL-0022");
    await expect(row2.locator(".cal-cell-cell")).toContainText("ATE-2");
    await expect(row2.locator(".cal-cell-inst")).toContainText("DMM-02");
    await expect(row2.locator(".cal-state-badge")).toHaveText("EXPIRED");
    await expect(row2.locator(".cal-state-badge")).toHaveClass(/cal-badge-expired/);

    // Count badge
    const countBadge = panel.locator(".cal-count-badge");
    await expect(countBadge).toContainText("3 of 3 records");
  });

  test("filters calibrations by search input and state dropdown with focus retention", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    const searchInput = panel.locator("#cal-search-input");
    const stateSelect = panel.locator("#cal-filter-state");
    const countBadge = panel.locator(".cal-count-badge");

    // Filter by search: "DMM"
    await searchInput.fill("DMM");
    await expect(searchInput).toBeFocused();
    await expect(panel.locator(".cal-table tbody tr[data-calibration-id]")).toHaveCount(1);
    await expect(panel.locator('.cal-table tbody tr[data-calibration-id="CAL-0022"]')).toBeVisible();
    await expect(countBadge).toContainText("1 of 3 records");

    // Clear search
    await searchInput.fill("");
    await expect(panel.locator(".cal-table tbody tr[data-calibration-id]")).toHaveCount(3);

    // Filter by state: EXPIRED
    await stateSelect.selectOption("EXPIRED");
    await expect(panel.locator(".cal-table tbody tr[data-calibration-id]")).toHaveCount(1);
    await expect(panel.locator('.cal-table tbody tr[data-calibration-id="CAL-0022"]')).toBeVisible();
    await expect(countBadge).toContainText("1 of 3 records");

    // Filter by state: CURRENT
    await stateSelect.selectOption("CURRENT");
    await expect(panel.locator(".cal-table tbody tr[data-calibration-id]")).toHaveCount(2);
    await expect(panel.locator('.cal-table tbody tr[data-calibration-id="CAL-0031"]')).toBeVisible();
    await expect(panel.locator('.cal-table tbody tr[data-calibration-id="CAL-0044"]')).toBeVisible();

    // No matches -> empty state with reset button
    await searchInput.fill("NON_EXISTENT");
    await expect(panel.locator(".cal-table-container .cal-empty-state")).toBeVisible();
    await expect(panel.locator(".cal-table-container .cal-empty-title")).toHaveText("No calibration records found");

    const resetBtn = panel.locator(".cal-table-container .cal-reset-filters-btn");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Reset restores all 3 rows
    await expect(panel.locator(".cal-table tbody tr[data-calibration-id]")).toHaveCount(3);
    await expect(searchInput).toHaveValue("");
    await expect(stateSelect).toHaveValue("ALL");
  });

  test("validates dates client-side and prevents submission when due date precedes calibrated date", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    const toggleBtn = panel.locator(".cal-toggle-add-btn");

    // Open add calibration drawer
    await toggleBtn.click();

    const drawer = panel.locator(".cal-add-drawer");
    await expect(drawer).toBeVisible();

    const idInput = drawer.locator("#cal-input-id");
    const cellInput = drawer.locator("#cal-input-cell");
    const instInput = drawer.locator("#cal-input-inst");
    const calInput = drawer.locator("#cal-input-calibrated");
    const dueInput = drawer.locator("#cal-input-due");
    const submitBtn = drawer.locator(".cal-submit-btn");

    // Fill valid identifiers
    await idInput.fill("CAL-9999");
    await cellInput.fill("ATE-3");
    await instInput.fill("RF-01");

    // Set due date BEFORE calibrated date
    await calInput.fill("2026-10-25T10:00");
    await dueInput.fill("2026-10-20T10:00");

    await submitBtn.click();

    // Client-side validation surfaces plain text error without network submission
    const errorAlert = drawer.locator(".cal-form-error");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toHaveText("Due date must be on or after calibrated date.");
    await expect(dueInput).toBeFocused();
  });

  test("submits calibration add form, updates table, and announces result in live region", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    let currentCalibrations = [...MOCK_CALIBRATIONS_PAYLOAD.calibrations];
    let postBodyReceived = null;

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      if (route.request().method() === "POST") {
        postBodyReceived = JSON.parse(route.request().postData());
        currentCalibrations.push({
          ...postBodyReceived,
          state: "CURRENT",
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ decision: "ACCEPTED", reasons: [] }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            roomId: "plant-1",
            asOf: "2026-10-24T08:00:00.000Z",
            calibrations: currentCalibrations,
          }),
        });
      }
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    const toggleBtn = panel.locator(".cal-toggle-add-btn");
    await toggleBtn.click();

    const drawer = panel.locator(".cal-add-drawer");
    await drawer.locator("#cal-input-id").fill("CAL-0055");
    await drawer.locator("#cal-input-cell").fill("ATE-3");
    await drawer.locator("#cal-input-inst").fill("DMM-09");
    await drawer.locator("#cal-input-calibrated").fill("2026-10-24T09:00");
    await drawer.locator("#cal-input-due").fill("2026-11-24T09:00");

    const submitBtn = drawer.locator(".cal-submit-btn");
    await submitBtn.click();

    // Verify form closes and table refreshes
    await expect(drawer).toBeHidden();

    // Verify payload sent
    expect(postBodyReceived).not.toBeNull();
    expect(postBodyReceived.calibrationId).toBe("CAL-0055");
    expect(postBodyReceived.cellId).toBe("ATE-3");
    expect(postBodyReceived.instrumentId).toBe("DMM-09");
    expect(postBodyReceived.calibratedAt).toBe("2026-10-24T09:00:00.000Z");
    expect(postBodyReceived.dueAt).toBe("2026-11-24T09:00:00.000Z");

    // Table now has 4 rows
    const newRow = panel.locator('.cal-table tbody tr[data-calibration-id="CAL-0055"]');
    await expect(newRow).toBeVisible();
    await expect(newRow.locator(".cal-cell-cell")).toContainText("ATE-3");
    await expect(newRow.locator(".cal-cell-inst")).toContainText("DMM-09");
    await expect(newRow.locator(".cal-state-badge")).toHaveText("CURRENT");

    // Live announcer verified
    const announcer = panel.locator("#cal-live-announcer");
    await expect(announcer).toContainText("Calibration CAL-0055 added for ATE-3 (ACCEPTED)");
  });

  test("displays plain text server reasons and keeps form open on server rejection", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            decision: "REJECTED",
            reasons: ["conflicting calibration identity"],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CALIBRATIONS_PAYLOAD),
        });
      }
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    const toggleBtn = panel.locator(".cal-toggle-add-btn");
    await toggleBtn.click();

    const drawer = panel.locator(".cal-add-drawer");
    await drawer.locator("#cal-input-id").fill("CAL-0031");
    await drawer.locator("#cal-input-cell").fill("ATE-2");
    await drawer.locator("#cal-input-inst").fill("PS-07");
    await drawer.locator("#cal-input-calibrated").fill("2026-10-24T09:00");
    await drawer.locator("#cal-input-due").fill("2026-11-24T09:00");

    await drawer.locator(".cal-submit-btn").click();

    // Drawer stays open and displays plain text server reason
    await expect(drawer).toBeVisible();
    const errorAlert = drawer.locator(".cal-form-error");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Submission rejected: conflicting calibration identity");

    // Live announcer announces rejection
    const announcer = panel.locator("#cal-live-announcer");
    await expect(announcer).toContainText("Calibration rejected: conflicting calibration identity");
  });

  test("renders mobile card layout at 375px with >=44px touch targets and zero horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Switch to Cals in phone workspace nav
    const calsNavBtn = page.locator('#workspace-nav button[data-workspace="calibrations"]');
    await expect(calsNavBtn).toBeVisible();
    await calsNavBtn.click();

    const panel = page.locator("#calibrations-tile");
    await expect(panel).toBeVisible();

    // Table is hidden on mobile
    const tableContainer = panel.locator(".cal-table-container");
    await expect(tableContainer).toBeHidden();

    // Mobile cards list is visible
    const cardsList = panel.locator(".cal-cards-list");
    await expect(cardsList).toBeVisible();

    const cards = cardsList.locator(".cal-card");
    await expect(cards).toHaveCount(3);

    // Verify touch targets >= 44px
    const toggleBtn = panel.locator(".cal-toggle-add-btn");
    const toggleBox = await toggleBtn.boundingBox();
    expect(toggleBox).not.toBeNull();
    expect(toggleBox.height).toBeGreaterThanOrEqual(44);

    const refreshBtn = panel.locator(".cal-refresh-btn");
    const refreshBox = await refreshBtn.boundingBox();
    expect(refreshBox).not.toBeNull();
    expect(refreshBox.height).toBeGreaterThanOrEqual(44);

    const searchInput = panel.locator("#cal-search-input");
    const searchBox = await searchInput.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(searchBox.height).toBeGreaterThanOrEqual(44);

    // Verify zero horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("falls back gracefully to synthetic calibrations when endpoint returns 404", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    await expect(panel).toBeVisible();

    // Verify synthetic rows rendered without error crash
    const rows = panel.locator(".cal-table tbody tr[data-calibration-id]");
    await expect(rows).toHaveCount(3);
    await expect(panel.locator('.cal-table tbody tr[data-calibration-id="CAL-0031"]')).toBeVisible();
    await expect(panel.locator('.cal-table tbody tr[data-calibration-id="CAL-0022"]')).toBeVisible();
  });
});
