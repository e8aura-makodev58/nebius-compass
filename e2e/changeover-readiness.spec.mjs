import { expect, test } from "@playwright/test";

const MOCK_CHANGEOVER_PAYLOAD = {
  changeoverId: "CO-0031",
  cellId: "ATE-1",
  targetProgramRevision: "SR1260-P3",
  startsAt: "2026-10-24T14:00:00.000Z",
  status: "BLOCKED",
  checks: [
    { check: "LOADBOARD_AVAILABLE", result: "PASS", reasons: [], boardId: "LB-0412" },
    { check: "CELL_READY", result: "PASS", reasons: [] },
    { check: "KIT_AVAILABLE", result: "UNKNOWN", reasons: ["KIT_FACTS_NOT_RECORDED"] },
    { check: "CREW_QUALIFIED", result: "UNKNOWN", reasons: ["CREW_FACTS_NOT_RECORDED"] },
  ],
  reasons: ["CREW_FACTS_NOT_RECORDED", "KIT_FACTS_NOT_RECORDED"],
};

test.describe("Changeover readiness panel (Candidate F5 slice 1 UI)", () => {
  test("renders desktop layout at 1280px with metadata, table checks, and unmet requirements", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/changeovers\/CO-0031\/readiness.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CHANGEOVER_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Dockview tab switching to Changeover readiness
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Changeover readiness")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#changeover-readiness-tile");
    await expect(panel).toBeVisible();

    // Verify title and eyebrow
    await expect(panel.locator("#co-readiness-heading")).toHaveText("Changeover Readiness");
    await expect(panel.locator(".eyebrow").first()).toHaveText("Changeover Precursor · F5 Slice 1");

    // Verify metadata summary card
    await expect(panel.locator("[data-co-id]")).toHaveText("CO-0031");
    await expect(panel.locator("[data-co-cell]")).toHaveText("ATE-1");
    await expect(panel.locator("[data-co-program]")).toHaveText("SR1260-P3");
    await expect(panel.locator("[data-co-starts]")).toContainText("2026-10-24 14:00 UTC");
    await expect(panel.locator("[data-co-status]")).toHaveText("BLOCKED");

    // Desktop table container visible, mobile cards hidden
    await expect(panel.locator(".co-table-container")).toBeVisible();
    await expect(panel.locator(".co-cards-container")).toBeHidden();

    // Verify table rows for all 4 checks
    const rows = panel.locator(".co-table tbody tr");
    await expect(rows).toHaveCount(4);

    // 1. LOADBOARD_AVAILABLE check (PASS with boardId LB-0412)
    const lbRow = panel.locator('.co-table tbody tr[data-check-id="LOADBOARD_AVAILABLE"]');
    await expect(lbRow.locator(".co-result-text")).toHaveText("PASS");
    await expect(lbRow.locator(".co-board-val")).toHaveText("LB-0412");
    await expect(lbRow.locator(".co-reasons-col")).toContainText("None");

    // 2. CELL_READY check (PASS)
    const cellRow = panel.locator('.co-table tbody tr[data-check-id="CELL_READY"]');
    await expect(cellRow.locator(".co-result-text")).toHaveText("PASS");
    await expect(cellRow.locator(".co-board-col")).toHaveText("—");
    await expect(cellRow.locator(".co-reasons-col")).toContainText("None");

    // 3. KIT_AVAILABLE check (UNKNOWN)
    const kitRow = panel.locator('.co-table tbody tr[data-check-id="KIT_AVAILABLE"]');
    await expect(kitRow.locator(".co-result-text")).toHaveText("UNKNOWN");
    await expect(kitRow.locator(".co-reasons-col")).toContainText("KIT_FACTS_NOT_RECORDED");

    // 4. CREW_QUALIFIED check (UNKNOWN)
    const crewRow = panel.locator('.co-table tbody tr[data-check-id="CREW_QUALIFIED"]');
    await expect(crewRow.locator(".co-result-text")).toHaveText("UNKNOWN");
    await expect(crewRow.locator(".co-reasons-col")).toContainText("CREW_FACTS_NOT_RECORDED");

    // Rule: Never colour alone carries a result
    const resultBadges = panel.locator(".co-result-badge");
    const count = await resultBadges.count();
    for (let i = 0; i < count; i++) {
      const text = await resultBadges.nth(i).innerText();
      expect(["PASS", "FAIL", "UNKNOWN"]).toContain(text.trim());
    }

    // Verify unmet requirements section
    const reasonsPanel = panel.locator(".co-reasons-panel");
    await expect(reasonsPanel).toBeVisible();
    await expect(reasonsPanel.locator(".co-reasons-title")).toContainText("Unmet Requirements (2)");
    await expect(reasonsPanel.locator(".co-reasons-list")).toContainText("CREW_FACTS_NOT_RECORDED");
    await expect(reasonsPanel.locator(".co-reasons-list")).toContainText("KIT_FACTS_NOT_RECORDED");
    await expect(reasonsPanel.locator(".co-notice")).toContainText(
      "In slice 1, kit and crew facts are not yet recorded. A changeover cannot be READY while any check is UNKNOWN."
    );
  });

  test("allows switching changeovers and renders FAIL results correctly", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Changeover readiness")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#changeover-readiness-tile");
    await expect(panel).toBeVisible();

    // Select CO-0032 from dropdown
    const select = panel.locator("#co-select-id");
    await select.selectOption("CO-0032");

    // Wait for update
    await expect(panel.locator("[data-co-id]")).toHaveText("CO-0032");
    await expect(panel.locator("[data-co-cell]")).toHaveText("ATE-2");
    await expect(panel.locator("[data-co-program]")).toHaveText("SR1260-P4");
    await expect(panel.locator("[data-co-status]")).toHaveText("BLOCKED");

    // Verify FAIL checks on CO-0032
    const lbRow = panel.locator('.co-table tbody tr[data-check-id="LOADBOARD_AVAILABLE"]');
    await expect(lbRow.locator(".co-result-text")).toHaveText("FAIL");
    await expect(lbRow.locator(".co-reasons-col")).toContainText("NO_COMPATIBLE_LOADBOARD");

    const cellRow = panel.locator('.co-table tbody tr[data-check-id="CELL_READY"]');
    await expect(cellRow.locator(".co-result-text")).toHaveText("FAIL");
    await expect(cellRow.locator(".co-reasons-col")).toContainText("CELL_NOT_READY");

    // Switch to CO-0033 (all PASS / READY)
    await select.selectOption("CO-0033");
    await expect(panel.locator("[data-co-id]")).toHaveText("CO-0033");
    await expect(panel.locator("[data-co-status]")).toHaveText("READY");
    const lbRow3 = panel.locator('.co-table tbody tr[data-check-id="LOADBOARD_AVAILABLE"]');
    await expect(lbRow3.locator(".co-result-text")).toHaveText("PASS");
    await expect(lbRow3.locator(".co-board-val")).toHaveText("LB-0204");
  });

  test("phone layout at 375px adapts to mobile cards with 44px touch targets and no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto("/rooms/plant-1");

    // Phone workspace navigation
    const navBtn = page.locator('#workspace-nav button[data-workspace="changeovers"]');
    await expect(navBtn).toBeVisible();

    // Verify touch target >= 44px
    const navBox = await navBtn.boundingBox();
    expect(navBox.height).toBeGreaterThanOrEqual(44);

    await navBtn.click();

    const panel = page.locator("#changeover-readiness-tile");
    await expect(panel).toBeVisible();

    // Verify mobile cards visible, table hidden
    await expect(panel.locator(".co-cards-container")).toBeVisible();
    await expect(panel.locator(".co-table-container")).toBeHidden();

    // Verify 4 check cards
    const cards = panel.locator(".co-cards-container .co-card");
    await expect(cards).toHaveCount(4);

    // Verify controls meet 44px touch target
    const selectBox = await panel.locator("#co-select-id").boundingBox();
    expect(selectBox.height).toBeGreaterThanOrEqual(44);

    const refreshBox = await panel.locator(".co-refresh-btn").boundingBox();
    expect(refreshBox.height).toBeGreaterThanOrEqual(44);

    // Verify zero horizontal scroll
    const overflow = await page.evaluate(() => {
      const el = document.querySelector("#changeover-readiness-tile");
      return el.scrollWidth > el.clientWidth;
    });
    expect(overflow).toBe(false);
  });

  test("handles error state and recovers upon retry", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    let fail = true;
    await page.route(/.*\/api\/control-rooms\/[^/]+\/changeovers\/CO-0031\/readiness.*/, async (route) => {
      if (fail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Internal server error" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CHANGEOVER_PAYLOAD),
        });
      }
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Changeover readiness")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#changeover-readiness-tile");
    await expect(panel).toBeVisible();

    // Error state rendered with retry button
    const errorState = panel.locator(".co-state-error");
    await expect(errorState).toBeVisible();
    await expect(errorState.locator(".co-error-msg")).toContainText("Error loading changeover readiness");

    const retryBtn = errorState.locator(".co-retry-btn");
    await expect(retryBtn).toBeVisible();

    // Click retry with failure disabled
    fail = false;
    await retryBtn.click();

    // Successfully recovered
    await expect(panel.locator(".co-table-container")).toBeVisible();
    await expect(panel.locator("[data-co-status]")).toHaveText("BLOCKED");
  });
});
