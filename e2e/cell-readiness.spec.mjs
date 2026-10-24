import { expect, test } from "@playwright/test";

const MOCK_LOADBOARDS_PAYLOAD = {
  roomId: "plant-1",
  asOf: "2026-10-24T08:00:00.000Z",
  boards: [
    {
      boardId: "LB-0115",
      revision: "D",
      condition: "QUARANTINED",
      cellId: null,
      approvedPrograms: ["SR1260-P3"],
      heldBy: null,
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
      boardId: "LB-0412",
      revision: "C",
      condition: "SERVICEABLE",
      cellId: "ATE-1",
      approvedPrograms: ["SR1260-P3", "CX4820-P1"],
      heldBy: "RES-0007",
    },
    {
      boardId: "LB-0550",
      revision: "B",
      condition: "SERVICEABLE",
      cellId: "ATE-2",
      approvedPrograms: ["PM0096-P2", "SC2150-P1"],
      heldBy: null,
    },
  ],
};

const MOCK_READINESS_PAYLOAD = {
  roomId: "plant-1",
  asOf: "2026-10-24T08:00:00.000Z",
  cells: [
    {
      cellId: "ATE-1",
      readiness: "READY",
      reasons: [],
      instruments: [
        {
          instrumentId: "PS-07",
          calibrationId: "CAL-0031",
          dueAt: "2026-11-20T08:00:00.000Z",
          state: "CURRENT",
        },
      ],
    },
    {
      cellId: "ATE-2",
      readiness: "EXPIRED",
      reasons: ["CALIBRATION_EXPIRED"],
      instruments: [
        {
          instrumentId: "DMM-02",
          calibrationId: "CAL-0022",
          dueAt: "2026-10-20T08:00:00.000Z",
          state: "EXPIRED",
        },
      ],
    },
    {
      cellId: "ATE-3",
      readiness: "NO_CALIBRATION",
      reasons: ["NO_CALIBRATION_RECORD"],
      instruments: [],
    },
    {
      cellId: "ATE-4",
      readiness: "READY",
      reasons: [],
      instruments: [
        {
          instrumentId: "SCOPE-01",
          calibrationId: "CAL-0044",
          dueAt: "2026-12-01T08:00:00.000Z",
          state: "CURRENT",
        },
      ],
    },
  ],
};

test.describe("Cell calibration readiness gate (F8 slice 1 UI)", () => {
  test("renders setup calibration readiness chips on Loadboards panel at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/cell-readiness.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_READINESS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Dockview tab switching to Loadboards
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    // Summary badge in header
    const summaryBadge = panel.locator(".lb-readiness-summary-badge");
    await expect(summaryBadge).toHaveText("2 of 4 setups ready");

    // Readiness strip
    const readinessBar = panel.locator(".lb-readiness-bar");
    await expect(readinessBar).toBeVisible();
    await expect(readinessBar.locator(".lb-readiness-title")).toHaveText("Setup Calibration Readiness:");

    // Verify ATE-1 chip (READY, plain style)
    const chip1 = panel.locator('.lb-readiness-chip[data-readiness-cell-id="ATE-1"]');
    await expect(chip1).toBeVisible();
    await expect(chip1).toHaveClass(/lb-chip-ready/);
    await expect(chip1.locator(".lb-chip-cell")).toHaveText("ATE-1");
    await expect(chip1.locator(".lb-chip-status")).toHaveText("READY");

    // Verify ATE-2 chip (EXPIRED, highlighted with reason)
    const chip2 = panel.locator('.lb-readiness-chip[data-readiness-cell-id="ATE-2"]');
    await expect(chip2).toBeVisible();
    await expect(chip2).toHaveClass(/lb-chip-expired/);
    await expect(chip2.locator(".lb-chip-cell")).toHaveText("ATE-2");
    await expect(chip2.locator(".lb-chip-status")).toHaveText("EXPIRED");
    await expect(chip2.locator(".lb-chip-reason")).toHaveText("CALIBRATION_EXPIRED");

    // Verify ATE-3 chip (NO_CALIBRATION, highlighted with reason)
    const chip3 = panel.locator('.lb-readiness-chip[data-readiness-cell-id="ATE-3"]');
    await expect(chip3).toBeVisible();
    await expect(chip3).toHaveClass(/lb-chip-no-cal/);
    await expect(chip3.locator(".lb-chip-cell")).toHaveText("ATE-3");
    await expect(chip3.locator(".lb-chip-status")).toHaveText("NO_CALIBRATION");
    await expect(chip3.locator(".lb-chip-reason")).toHaveText("NO_CALIBRATION_RECORD");

    // Verify ATE-4 chip (READY)
    const chip4 = panel.locator('.lb-readiness-chip[data-readiness-cell-id="ATE-4"]');
    await expect(chip4).toBeVisible();
    await expect(chip4).toHaveClass(/lb-chip-ready/);
  });

  test("toggles cell readiness detail drawer with instrument calibration records", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/cell-readiness.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_READINESS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    const chip2 = panel.locator('.lb-readiness-chip[data-readiness-cell-id="ATE-2"]');

    // Click chip to open drawer
    await chip2.click();

    const drawer = panel.locator('.lb-readiness-detail-drawer[aria-label="Readiness detail for ATE-2"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("ATE-2 · Calibration Status: EXPIRED");
    await expect(drawer).toContainText("CALIBRATION_EXPIRED");
    await expect(drawer).toContainText("DMM-02");
    await expect(drawer).toContainText("Cal: CAL-0022");
    await expect(drawer).toContainText("EXPIRED");

    // Close button dismisses drawer
    const closeBtn = drawer.locator(".lb-close-readiness-drawer");
    await closeBtn.click();
    await expect(drawer).toBeHidden();
  });

  test("marks check-out action unavailable with reason for board whose cell is not READY", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/cell-readiness.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_READINESS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");

    // Board LB-0550 has cellId ATE-2 (which is EXPIRED)
    const row = panel.locator('.lb-table tbody tr[data-board-id="LB-0550"]');
    await expect(row).toBeVisible();

    // Location cell shows ATE-2 with EXPIRED badge
    await expect(row.locator(".lb-cell-location")).toContainText("ATE-2");
    await expect(row.locator(".lb-cell-chip-mini")).toHaveText("EXPIRED");

    // Check out button is disabled
    const checkoutBtn = row.locator(".lb-checkout-btn");
    await expect(checkoutBtn).toBeDisabled();
    await expect(checkoutBtn).toHaveAttribute("aria-disabled", "true");

    // Reason displays cell unavailable reason
    const reasonText = row.locator(".lb-row-reasons");
    await expect(reasonText).toBeVisible();
    await expect(reasonText).toContainText("Check-out unavailable: ATE-2 is EXPIRED (CALIBRATION_EXPIRED)");
  });

  test("disables confirm checkout in checkout form when selecting an expired or non-calibrated station", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/cell-readiness.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_READINESS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");

    // Available board in store: LB-0398
    const row = panel.locator('.lb-table tbody tr[data-board-id="LB-0398"]');
    const checkoutBtn = row.locator(".lb-checkout-btn");
    await expect(checkoutBtn).toBeEnabled();
    await checkoutBtn.click();

    // Drawer form opens
    const form = panel.locator('.lb-table-container .lb-checkout-form[data-board-id="LB-0398"]');
    await expect(form).toBeVisible();

    const stationSelect = form.locator(".lb-station-select");
    const submitBtn = form.locator(".lb-submit-checkout-btn");

    // Select ATE-2 (EXPIRED)
    await stationSelect.selectOption("ATE-2");

    // Warning alert appears and submit is disabled
    const warning = form.locator(".lb-checkout-station-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Check-out unavailable: ATE-2 is EXPIRED (CALIBRATION_EXPIRED)");
    await expect(submitBtn).toBeDisabled();

    // Select ATE-1 (READY)
    await stationSelect.selectOption("ATE-1");
    await expect(warning).toBeHidden();
    await expect(submitBtn).toBeEnabled();
  });

  test("renders mobile card layout at 375px with >=44px touch targets and zero horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/cell-readiness.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_READINESS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Mobile nav button
    const boardsBtn = page.locator('#workspace-nav button[data-workspace="loadboards"]');
    await expect(boardsBtn).toBeVisible();
    await boardsBtn.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    // Readiness strip visible on mobile
    const chip2 = panel.locator('.lb-readiness-chip[data-readiness-cell-id="ATE-2"]');
    await expect(chip2).toBeVisible();
    const chipBox = await chip2.boundingBox();
    expect(chipBox.height).toBeGreaterThanOrEqual(44);

    // Card for LB-0550 has disabled checkout button and reason
    const card = panel.locator('.lb-card[data-board-id="LB-0550"]');
    await expect(card).toBeVisible();
    await expect(card.locator(".lb-cell-chip-mini")).toHaveText("EXPIRED");

    const checkoutBtn = card.locator(".lb-checkout-btn");
    await expect(checkoutBtn).toBeDisabled();
    await expect(card.locator(".lb-row-reasons")).toContainText("Check-out unavailable: ATE-2 is EXPIRED (CALIBRATION_EXPIRED)");

    // Assert zero horizontal scroll on body and panel
    const bodyScroll = await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth);
    expect(bodyScroll).toBe(true);

    const panelScroll = await page.evaluate(() => {
      const el = document.querySelector("#loadboards-tile");
      return el ? el.scrollWidth <= el.clientWidth + 1 : true;
    });
    expect(panelScroll).toBe(true);
  });

  test("falls back gracefully to synthetic cell readiness when endpoint returns 404", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    // 404 on cell-readiness
    await page.route(/.*\/api\/control-rooms\/[^/]+\/cell-readiness.*/, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Endpoint not found" }),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    // Synthetic fallback populates readiness chips without error
    const chip1 = panel.locator('.lb-readiness-chip[data-readiness-cell-id="ATE-1"]');
    await expect(chip1).toBeVisible();
    await expect(chip1.locator(".lb-chip-status")).toHaveText("READY");

    const chip2 = panel.locator('.lb-readiness-chip[data-readiness-cell-id="ATE-2"]');
    await expect(chip2).toBeVisible();
    await expect(chip2.locator(".lb-chip-status")).toHaveText("EXPIRED");
  });
});
