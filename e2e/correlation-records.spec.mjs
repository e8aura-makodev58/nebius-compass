import { expect, test } from "@playwright/test";

const MOCK_CALIBRATIONS = {
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
  ],
};

const MOCK_CORRELATIONS = {
  roomId: "plant-1",
  asOf: "2026-10-24T08:00:00.000Z",
  records: [
    {
      correlationId: "CORR-001",
      cellId: "ATE-1",
      instrumentId: "PS-07",
      referencePartId: "REF-STD-01",
      observedAt: "2026-10-10T08:00:00.000Z",
      result: "PASS",
    },
    {
      correlationId: "CORR-002",
      cellId: "ATE-2",
      instrumentId: "DMM-02",
      referencePartId: "REF-STD-02",
      observedAt: "2026-10-15T09:30:00.000Z",
      result: "INCONCLUSIVE",
    },
    {
      correlationId: "CORR-003",
      cellId: "ATE-1",
      instrumentId: "SCOPE-01",
      referencePartId: "REF-STD-01",
      observedAt: "2026-10-20T11:00:00.000Z",
      result: "FAIL",
    },
  ],
};

test.describe("Correlation records section and append form (Round 40 F8 UI)", () => {
  test("renders Correlation records section below calibration table with evidence note and records at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/correlation-records.*/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CORRELATIONS),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/rooms/plant-1");

    // Open Calibrations tab from Dockview
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    await expect(panel).toBeVisible();

    // Verify calibration table is present
    const calTable = panel.locator(".cal-table-container table.cal-table");
    await expect(calTable).toBeVisible();

    // Verify Correlation section is rendered below calibration table
    const corrSection = panel.locator(".cal-corr-section");
    await expect(corrSection).toBeVisible();

    // Section title
    await expect(corrSection.locator(".cal-corr-title")).toHaveText("Correlation Records");

    // Plain-text evidence note
    const note = corrSection.locator(".cal-corr-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("Evidence only:");
    await expect(note).toContainText("do not affect cell calibration readiness");

    // Verify Correlation table structure and headers
    const corrTable = corrSection.locator(".cal-corr-table");
    await expect(corrTable).toBeVisible();
    const headers = corrTable.locator("thead th");
    await expect(headers.nth(0)).toHaveText("Correlation ID");
    await expect(headers.nth(1)).toHaveText("Cell");
    await expect(headers.nth(2)).toHaveText("Instrument");
    await expect(headers.nth(3)).toHaveText("Reference Part");
    await expect(headers.nth(4)).toHaveText("Observed At");
    await expect(headers.nth(5)).toHaveText("Result");

    // Verify records rows and result badges
    const row1 = corrTable.locator('tbody tr[data-correlation-id="CORR-001"]');
    await expect(row1).toBeVisible();
    await expect(row1.locator(".cal-cell-inst")).toHaveText("PS-07");
    await expect(row1.locator(".cal-cell-ref")).toHaveText("REF-STD-01");
    await expect(row1.locator(".cal-cell-result .cal-badge-pass")).toHaveText("PASS");

    const row2 = corrTable.locator('tbody tr[data-correlation-id="CORR-002"]');
    await expect(row2).toBeVisible();
    await expect(row2.locator(".cal-cell-result .cal-badge-inconclusive")).toHaveText("INCONCLUSIVE");

    const row3 = corrTable.locator('tbody tr[data-correlation-id="CORR-003"]');
    await expect(row3).toBeVisible();
    await expect(row3.locator(".cal-cell-result .cal-badge-fail")).toHaveText("FAIL");

    // Verify NO edit or delete controls exist
    const editBtns = corrSection.locator("button:has-text('Edit'), button:has-text('Modify'), [aria-label*='edit' i]");
    await expect(editBtns).toHaveCount(0);
    const deleteBtns = corrSection.locator("button:has-text('Delete'), button:has-text('Remove'), [aria-label*='delete' i]");
    await expect(deleteBtns).toHaveCount(0);
  });

  test("append-only form is keyboard-reachable, toggles open/closed, and handles Escape and Cancel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/correlation-records.*/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CORRELATIONS),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    const toggleBtn = panel.locator(".cal-toggle-add-corr-btn");
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "false");

    // Open form via click
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
    await expect(toggleBtn).toHaveText("Close Form");

    const formDrawer = panel.locator(".cal-add-corr-drawer");
    await expect(formDrawer).toBeVisible();

    // First input should be focused
    const idInput = panel.locator("#corr-input-id");
    await expect(idInput).toBeFocused();

    // Verify all form inputs exist
    await expect(panel.locator("#corr-input-cell")).toBeVisible();
    await expect(panel.locator("#corr-input-inst")).toBeVisible();
    await expect(panel.locator("#corr-input-part")).toBeVisible();
    await expect(panel.locator("#corr-input-observed")).toBeVisible();
    const resultSelect = panel.locator("#corr-input-result");
    await expect(resultSelect).toBeVisible();
    await expect(resultSelect.locator("option")).toHaveText(["PASS", "FAIL", "INCONCLUSIVE"]);

    // Dismiss via Escape key
    await idInput.press("Escape");
    await expect(formDrawer).not.toBeVisible();
    await expect(toggleBtn).toBeFocused();
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "false");

    // Open form via Enter key on toggle button
    await toggleBtn.press("Enter");
    await expect(formDrawer).toBeVisible();
    await expect(idInput).toBeFocused();

    // Dismiss via Cancel button
    const cancelBtn = formDrawer.locator(".cal-cancel-corr-btn");
    await cancelBtn.click();
    await expect(formDrawer).not.toBeVisible();
    await expect(toggleBtn).toBeFocused();
  });

  test("submits valid correlation record, appends to table, and announces in polite live region", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS),
      });
    });

    let postedRecord = null;
    await page.route(/.*\/api\/control-rooms\/[^/]+\/correlation-records.*/, async (route) => {
      if (route.request().method() === "POST") {
        postedRecord = JSON.parse(route.request().postData());
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ decision: "RECORDED", reasons: [] }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CORRELATIONS),
        });
      }
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    const toggleBtn = panel.locator(".cal-toggle-add-corr-btn");
    await toggleBtn.click();

    // Fill form
    await panel.locator("#corr-input-id").fill("CORR-999");
    await panel.locator("#corr-input-cell").fill("ATE-1");
    await panel.locator("#corr-input-inst").fill("PS-99");
    await panel.locator("#corr-input-part").fill("REF-GOLDEN-01");
    await panel.locator("#corr-input-observed").fill("2026-10-24T14:30");
    await panel.locator("#corr-input-result").selectOption("PASS");

    // Submit form
    await panel.locator(".cal-submit-corr-btn").click();

    // Form drawer should close and focus return to toggle button
    const formDrawer = panel.locator(".cal-add-corr-drawer");
    await expect(formDrawer).not.toBeVisible();
    await expect(toggleBtn).toBeFocused();

    // Verify submitted payload
    expect(postedRecord).not.toBeNull();
    expect(postedRecord.correlationId).toBe("CORR-999");
    expect(postedRecord.cellId).toBe("ATE-1");
    expect(postedRecord.instrumentId).toBe("PS-99");
    expect(postedRecord.referencePartId).toBe("REF-GOLDEN-01");
    expect(postedRecord.result).toBe("PASS");

    // Verify new row is in table
    const newRow = panel.locator('.cal-corr-table tbody tr[data-correlation-id="CORR-999"]');
    await expect(newRow).toBeVisible();
    await expect(newRow.locator(".cal-cell-inst")).toHaveText("PS-99");
    await expect(newRow.locator(".cal-cell-ref")).toHaveText("REF-GOLDEN-01");
    await expect(newRow.locator(".cal-cell-result")).toHaveText("PASS");

    // Verify polite live announcer
    const announcer = panel.locator("#cal-live-announcer");
    await expect(announcer).toContainText("Correlation CORR-999 recorded (PASS)");
  });

  test("validates required fields client-side and surfaces server rejection reasons", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/correlation-records.*/, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Invalid or duplicate correlation record", code: "INVALID_CORRELATION_RECORD" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CORRELATIONS),
        });
      }
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await tab.click();

    const panel = page.locator("#calibrations-tile");
    await panel.locator(".cal-toggle-add-corr-btn").click();

    // 1. Submit empty form - client-side validation triggers
    await panel.locator(".cal-submit-corr-btn").click();
    const errorBanner = panel.locator(".cal-add-corr-drawer .cal-form-error");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText("Correlation ID is required");

    // 2. Fill inputs and submit duplicate
    await panel.locator("#corr-input-id").fill("CORR-001");
    await panel.locator("#corr-input-cell").fill("ATE-1");
    await panel.locator("#corr-input-inst").fill("PS-07");
    await panel.locator("#corr-input-part").fill("REF-STD-01");
    await panel.locator("#corr-input-observed").fill("2026-10-24T14:30");
    await panel.locator("#corr-input-result").selectOption("PASS");

    await panel.locator(".cal-submit-corr-btn").click();

    // Server 400 error should display and form remains open
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText("Invalid or duplicate correlation record");
    await expect(panel.locator(".cal-add-corr-drawer")).toBeVisible();
  });

  test("mobile card layout at 375px with >= 44px touch targets and zero horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/correlation-records.*/, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CORRELATIONS),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/rooms/plant-1");

    // Select Calibrations workspace on phone
    const calsBtn = page.locator('#workspace-nav button[data-workspace="calibrations"]');
    await expect(calsBtn).toBeVisible();
    await calsBtn.click();

    const panel = page.locator("#calibrations-tile");
    await expect(panel).toBeVisible();

    // Verify desktop tables are hidden on mobile
    await expect(panel.locator(".cal-corr-table-container")).toBeHidden();

    // Verify correlation mobile cards are displayed
    const corrCards = panel.locator(".cal-corr-cards-list .cal-card");
    await expect(corrCards).toHaveCount(3);

    // Verify card content
    const firstCard = corrCards.nth(0);
    await expect(firstCard.locator(".cal-card-id")).toHaveText("CORR-001");
    await expect(firstCard.locator(".cal-badge-pass")).toHaveText("PASS");

    // Check touch target min-height >= 44px on mobile
    const toggleCorrBtn = panel.locator(".cal-toggle-add-corr-btn");
    await expect(toggleCorrBtn).toBeVisible();
    const box = await toggleCorrBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(44);

    // Open add correlation drawer on mobile and check input touch targets
    await toggleCorrBtn.click();
    const idInput = panel.locator("#corr-input-id");
    await expect(idInput).toBeVisible();
    const inputHeight = await idInput.evaluate((el) => el.getBoundingClientRect().height);
    expect(inputHeight).toBeGreaterThanOrEqual(44);

    const submitBtn = panel.locator(".cal-submit-corr-btn");
    const submitHeight = await submitBtn.evaluate((el) => el.getBoundingClientRect().height);
    expect(submitHeight).toBeGreaterThanOrEqual(44);

    // Verify zero horizontal scroll
    const scrollWidth = await panel.evaluate((el) => el.scrollWidth);
    const clientWidth = await panel.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px rounding tolerance
  });

  test("falls back gracefully to synthetic correlation records when endpoint returns 404", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS),
      });
    });

    // Force 404 on correlation-records
    await page.route(/.*\/api\/control-rooms\/[^/]+\/correlation-records.*/, async (route) => {
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

    // Verify synthetic correlation records render
    const corrRows = panel.locator(".cal-corr-table tbody tr");
    await expect(corrRows).toHaveCount(3);
    await expect(corrRows.nth(0)).toHaveAttribute("data-correlation-id", "CORR-001");
  });
});
