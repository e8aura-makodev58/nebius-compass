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
  ],
};

test.describe("Blocked checkout link to calibration form (Round 37)", () => {
  test("shows readiness reason and Add calibration action on checkout rejection at 1280px, opens form with cellId pre-filled and focuses first field", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards$/, async (route) => {
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

    // Mock checkout endpoint to return CELL_NOT_READY rejection
    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards\/checkout.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          decision: "REJECTED",
          reasons: ["CELL_NOT_READY"],
        }),
      });
    });

    await page.goto("/rooms/plant-1");

    // Open Loadboards tab in Dockview
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await expect(tab).toBeVisible();
    await tab.click();

    const lbPanel = page.locator("#loadboards-tile");
    await expect(lbPanel).toBeVisible();

    // Check out LB-0398
    const row = lbPanel.locator('.lb-table tbody tr[data-board-id="LB-0398"]');
    const checkoutBtn = row.locator(".lb-checkout-btn");
    await expect(checkoutBtn).toBeEnabled();
    await checkoutBtn.click();

    const form = lbPanel.locator('.lb-table-container .lb-checkout-form[data-board-id="LB-0398"]');
    await expect(form).toBeVisible();

    // Select ATE-1 and confirm checkout
    await form.locator(".lb-station-select").selectOption("ATE-1");
    await form.locator(".lb-program-select").selectOption("PM0096-P2");
    const confirmBtn = form.locator(".lb-submit-checkout-btn");
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Row should show the readiness reason CELL_NOT_READY
    const reasonsContainer = row.locator(".lb-row-reasons");
    await expect(reasonsContainer).toBeVisible();
    await expect(reasonsContainer.locator(".lb-reason-text")).toContainText("CELL_NOT_READY");

    // Action "Add calibration for ATE-1" must appear next to the row
    const addCalBtn = reasonsContainer.locator('.lb-add-cal-action[data-cell-id="ATE-1"]');
    await expect(addCalBtn).toBeVisible();
    await expect(addCalBtn).toHaveText("Add calibration for ATE-1");

    // Verify it is a non-submitting button (type="button")
    await expect(addCalBtn).toHaveAttribute("type", "button");

    // Click the action
    await addCalBtn.click();

    // Calibrations panel should now be visible and active
    const calPanel = page.locator("#calibrations-tile");
    await expect(calPanel).toBeVisible();

    // Add calibration form must be open
    const addDrawer = calPanel.locator(".cal-add-drawer");
    await expect(addDrawer).toBeVisible();

    // cellId must be pre-filled with ATE-1
    const cellInput = calPanel.locator("#cal-input-cell");
    await expect(cellInput).toHaveValue("ATE-1");

    // Focus must move to the first field (cal-input-id)
    const idInput = calPanel.locator("#cal-input-id");
    await expect(idInput).toBeFocused();

    // Verify form was NOT submitted
    await expect(calPanel.locator(".cal-form-error")).toBeHidden();
  });

  test("supports mobile card layout at 375px with >=44px touch targets and zero horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards$/, async (route) => {
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

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards\/checkout.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          decision: "REJECTED",
          reasons: ["CELL_NOT_READY"],
        }),
      });
    });

    await page.goto("/rooms/plant-1");

    // Navigate to loadboards via workspace nav
    const boardsNav = page.locator('#workspace-nav button[data-workspace="loadboards"]');
    await expect(boardsNav).toBeVisible();
    await boardsNav.click();

    const lbPanel = page.locator("#loadboards-tile");
    await expect(lbPanel).toBeVisible();

    // Open checkout on card LB-0398
    const card = lbPanel.locator('.lb-card[data-board-id="LB-0398"]');
    await expect(card).toBeVisible();

    const checkoutBtn = card.locator(".lb-checkout-btn");
    await checkoutBtn.click();

    const cardForm = card.locator(".lb-checkout-form");
    await expect(cardForm).toBeVisible();
    await cardForm.locator(".lb-station-select").selectOption("ATE-1");
    await cardForm.locator(".lb-program-select").selectOption("PM0096-P2");
    await cardForm.locator(".lb-submit-checkout-btn").click();

    // Card should now display CELL_NOT_READY and Add calibration for ATE-1 action
    const cardReasons = card.locator(".lb-card-reasons .lb-row-reasons");
    await expect(cardReasons).toBeVisible();
    await expect(cardReasons.locator(".lb-reason-text")).toContainText("CELL_NOT_READY");

    const addCalBtn = cardReasons.locator('.lb-add-cal-action[data-cell-id="ATE-1"]');
    await expect(addCalBtn).toBeVisible();
    await expect(addCalBtn).toHaveText("Add calibration for ATE-1");

    // Check touch target >= 44px
    const box = await addCalBtn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);

    // Assert zero horizontal scroll on body
    const bodyScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(bodyScroll).toBe(true);

    // Click the action on mobile
    await addCalBtn.click();

    // Workspace view must switch to calibrations
    await expect(page.locator("body")).toHaveAttribute("data-workspace-view", "calibrations");

    const calPanel = page.locator("#calibrations-tile");
    await expect(calPanel).toBeVisible();

    // Form open with ATE-1 filled and first field focused
    await expect(calPanel.locator(".cal-add-drawer")).toBeVisible();
    await expect(calPanel.locator("#cal-input-cell")).toHaveValue("ATE-1");
    await expect(calPanel.locator("#cal-input-id")).toBeFocused();

    // Zero horizontal scroll on calibrations panel
    const calScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(calScroll).toBe(true);
  });

  test("action is keyboard-reachable and activates via Enter key with focus transition", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards$/, async (route) => {
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

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards\/checkout.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          decision: "REJECTED",
          reasons: ["CELL_NOT_READY"],
        }),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const lbPanel = page.locator("#loadboards-tile");
    const row = lbPanel.locator('.lb-table tbody tr[data-board-id="LB-0398"]');
    await row.locator(".lb-checkout-btn").click();

    const form = lbPanel.locator('.lb-table-container .lb-checkout-form[data-board-id="LB-0398"]');
    await form.locator(".lb-station-select").selectOption("ATE-1");
    await form.locator(".lb-program-select").selectOption("PM0096-P2");
    await form.locator(".lb-submit-checkout-btn").click();

    const addCalBtn = row.locator('.lb-add-cal-action[data-cell-id="ATE-1"]');
    await expect(addCalBtn).toBeVisible();

    // Focus the action button directly and press Enter
    await addCalBtn.focus();
    await expect(addCalBtn).toBeFocused();
    await page.keyboard.press("Enter");

    // Calibrations drawer opens with focus on #cal-input-id
    const calPanel = page.locator("#calibrations-tile");
    await expect(calPanel.locator(".cal-add-drawer")).toBeVisible();
    await expect(calPanel.locator("#cal-input-cell")).toHaveValue("ATE-1");
    await expect(calPanel.locator("#cal-input-id")).toBeFocused();
  });

  test("shows Add calibration action for board stationed at an expired cell", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards$/, async (route) => {
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

    const lbPanel = page.locator("#loadboards-tile");
    // LB-0550 is stationed at ATE-2 which is EXPIRED
    const row = lbPanel.locator('.lb-table tbody tr[data-board-id="LB-0550"]');
    await expect(row).toBeVisible();

    const addCalBtn = row.locator('.lb-add-cal-action[data-cell-id="ATE-2"]');
    await expect(addCalBtn).toBeVisible();
    await expect(addCalBtn).toHaveText("Add calibration for ATE-2");

    await addCalBtn.click();

    const calPanel = page.locator("#calibrations-tile");
    await expect(calPanel.locator(".cal-add-drawer")).toBeVisible();
    await expect(calPanel.locator("#cal-input-cell")).toHaveValue("ATE-2");
    await expect(calPanel.locator("#cal-input-id")).toBeFocused();
  });
});
