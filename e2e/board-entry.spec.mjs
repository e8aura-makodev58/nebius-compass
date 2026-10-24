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
  ],
};

test.describe("Loadboard entry form (Round 38 UI)", () => {
  test("renders add board toggle button, opens drawer with keyboard-reachable inputs and labels at 1280px", async ({
    page,
  }) => {
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

    // Toggle button
    const toggleBtn = panel.locator(".lb-toggle-add-btn");
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveText("+ Add Board");
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "false");

    // Open drawer
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText("✕ Close");
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "true");

    const drawer = panel.locator(".lb-add-drawer");
    await expect(drawer).toBeVisible();

    // Check all fields and labels
    const idInput = drawer.locator("#lb-input-board-id");
    const revInput = drawer.locator("#lb-input-revision");
    const condSelect = drawer.locator("#lb-select-condition");
    const cellInput = drawer.locator("#lb-input-cell-id");
    const progInput = drawer.locator("#lb-input-programs");
    const submitBtn = drawer.locator(".lb-submit-add-board-btn");
    const cancelBtn = drawer.locator(".lb-cancel-add-board-btn");

    await expect(idInput).toBeVisible();
    await expect(idInput).toBeFocused(); // Focus automatically moves to Board ID on open
    await expect(revInput).toBeVisible();
    await expect(condSelect).toBeVisible();
    await expect(cellInput).toBeVisible();
    await expect(progInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // Verify accessible labels
    await expect(drawer.locator('label[for="lb-input-board-id"]')).toContainText("Board ID");
    await expect(drawer.locator('label[for="lb-input-revision"]')).toContainText("Revision");
    await expect(drawer.locator('label[for="lb-select-condition"]')).toContainText("Condition");
    await expect(drawer.locator('label[for="lb-input-cell-id"]')).toContainText("Cell Location");
    await expect(drawer.locator('label[for="lb-input-programs"]')).toContainText("Approved Programs");

    // Verify zero horizontal scroll at 1280px
    const panelBox = await panel.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(panelBox.scrollWidth).toBeLessThanOrEqual(panelBox.clientWidth + 1);

    // Press Escape to dismiss drawer and restore focus to toggle button
    await idInput.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(toggleBtn).toBeFocused();
    await expect(toggleBtn).toHaveText("+ Add Board");
  });

  test("validates form fields client-side and surfaces error in polite live region without network call", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    let networkCallMade = false;
    await page.route("**/api/control-rooms/*/loadboards/boards", async (route) => {
      networkCallMade = true;
      await route.fulfill({ status: 200, body: JSON.stringify({ decision: "ADDED", reasons: [] }) });
    });

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
    await panel.locator(".lb-toggle-add-btn").click();

    const drawer = panel.locator(".lb-add-drawer");
    const idInput = drawer.locator("#lb-input-board-id");
    const revInput = drawer.locator("#lb-input-revision");
    const progInput = drawer.locator("#lb-input-programs");
    const submitBtn = drawer.locator(".lb-submit-add-board-btn");
    const errorAlert = drawer.locator(".lb-form-error");
    const liveAnnouncer = panel.locator("#lb-live-announcer");

    // Case 1: Empty board ID
    await submitBtn.click();
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toHaveText("Board ID is required");
    await expect(liveAnnouncer).toHaveText("Validation error: Board ID is required");
    expect(networkCallMade).toBe(false);

    // Case 2: Invalid board ID characters
    await idInput.fill("LB-INVALID spaces!");
    await submitBtn.click();
    await expect(errorAlert).toHaveText(
      "Board ID must contain only alphanumeric characters, dashes, and underscores (1-120 chars)"
    );
    expect(networkCallMade).toBe(false);

    // Case 3: Empty revision
    await idInput.fill("LB-0900");
    await revInput.fill("");
    await submitBtn.click();
    await expect(errorAlert).toHaveText("Revision is required");
    expect(networkCallMade).toBe(false);

    // Case 4: Empty approved programs
    await revInput.fill("B");
    await progInput.fill("");
    await submitBtn.click();
    await expect(errorAlert).toHaveText("At least one approved program is required");
    expect(networkCallMade).toBe(false);

    // Case 5: Malformed program token
    await progInput.fill("SR1260-P3, BAD PROG*");
    await submitBtn.click();
    await expect(errorAlert).toContainText('Invalid program name "BAD PROG*". Programs must be alphanumeric.');
    expect(networkCallMade).toBe(false);
  });

  test("submits valid board entry to POST route, receives ADDED, closes drawer, updates inventory table and announces success", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    let postBodyReceived = null;
    let boardsList = [...MOCK_LOADBOARDS_PAYLOAD.boards];

    await page.route("**/api/control-rooms/*/loadboards/boards", async (route) => {
      postBodyReceived = JSON.parse(route.request().postData());
      boardsList.unshift({
        boardId: postBodyReceived.boardId,
        revision: postBodyReceived.revision,
        condition: postBodyReceived.condition,
        cellId: postBodyReceived.cellId,
        approvedPrograms: postBodyReceived.approvedPrograms,
        heldBy: null,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ decision: "ADDED", reasons: [] }),
      });
    });

    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          roomId: "plant-1",
          asOf: new Date().toISOString(),
          boards: boardsList,
        }),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await tab.click();

    const panel = page.locator("#loadboards-tile");
    await panel.locator(".lb-toggle-add-btn").click();

    const drawer = panel.locator(".lb-add-drawer");
    await drawer.locator("#lb-input-board-id").fill("LB-0999");
    await drawer.locator("#lb-input-revision").fill("A");
    await drawer.locator("#lb-select-condition").selectOption("SERVICEABLE");
    await drawer.locator("#lb-input-cell-id").fill("ATE-1");
    await drawer.locator("#lb-input-programs").fill("PM0096-P2, CX4820-P1");

    await drawer.locator(".lb-submit-add-board-btn").click();

    // Verify request payload matches contract
    expect(postBodyReceived).toEqual({
      boardId: "LB-0999",
      revision: "A",
      condition: "SERVICEABLE",
      cellId: "ATE-1",
      approvedPrograms: ["PM0096-P2", "CX4820-P1"],
    });

    // Drawer closes upon successful addition
    await expect(drawer).not.toBeVisible();

    // Polite live region announces success
    const liveAnnouncer = panel.locator("#lb-live-announcer");
    await expect(liveAnnouncer).toHaveText("Board LB-0999 added successfully.");

    // Focus returns to toggle button
    await expect(panel.locator(".lb-toggle-add-btn")).toBeFocused();

    // Table contains newly added board
    const newRow = panel.locator('table.lb-table tbody tr[data-board-id="LB-0999"]');
    await expect(newRow).toBeVisible();
    await expect(newRow.locator(".lb-cell-id")).toContainText("LB-0999");
    await expect(newRow.locator(".lb-cell-rev")).toHaveText("A");
    await expect(newRow.locator(".lb-cell-condition")).toContainText("Serviceable");
    await expect(newRow.locator(".lb-cell-location")).toContainText("ATE-1");
    await expect(newRow.locator(".lb-cell-programs")).toContainText("PM0096-P2");
    await expect(newRow.locator(".lb-cell-programs")).toContainText("CX4820-P1");
  });

  test("surfaces server rejection reasons as plain text and keeps drawer open", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/control-rooms/*/loadboards/boards", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          decision: "REJECTED",
          reasons: ["DUPLICATE_BOARD_ID", "SERIAL_COLLISION"],
        }),
      });
    });

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
    await panel.locator(".lb-toggle-add-btn").click();

    const drawer = panel.locator(".lb-add-drawer");
    await drawer.locator("#lb-input-board-id").fill("LB-0412"); // Duplicate ID
    await drawer.locator("#lb-input-programs").fill("CX4820-P1");

    await drawer.locator(".lb-submit-add-board-btn").click();

    // Drawer remains open
    await expect(drawer).toBeVisible();

    // Plain text server reasons displayed in .lb-form-error
    const errorAlert = drawer.locator(".lb-form-error");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toHaveText("DUPLICATE_BOARD_ID, SERIAL_COLLISION");

    // Live region announces rejection
    const liveAnnouncer = panel.locator("#lb-live-announcer");
    await expect(liveAnnouncer).toHaveText("Add board rejected: DUPLICATE_BOARD_ID, SERIAL_COLLISION");

    // Board ID input is focused
    await expect(drawer.locator("#lb-input-board-id")).toBeFocused();
  });

  test("stub-first fallback accepts valid board or rejects duplicate when endpoint returns 404", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // Endpoint returns 404 (simulating unmounted backend route before Codex lands)
    await page.route("**/api/control-rooms/*/loadboards/boards", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Cannot POST /api/control-rooms/plant-1/loadboards/boards" }),
      });
    });

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

    // Case A: Duplicate ID falls back to local rejection
    await panel.locator(".lb-toggle-add-btn").click();
    let drawer = panel.locator(".lb-add-drawer");
    await drawer.locator("#lb-input-board-id").fill("LB-0412"); // Existing board
    await drawer.locator("#lb-input-programs").fill("SR1260-P3");
    await drawer.locator(".lb-submit-add-board-btn").click();

    await expect(drawer.locator(".lb-form-error")).toHaveText("DUPLICATE_BOARD_ID");
    await expect(panel.locator("#lb-live-announcer")).toHaveText("Add board rejected: DUPLICATE_BOARD_ID");

    // Case B: Unique ID falls back to local acceptance
    await drawer.locator("#lb-input-board-id").fill("LB-0777");
    await drawer.locator(".lb-submit-add-board-btn").click();

    await expect(drawer).not.toBeVisible();
    await expect(panel.locator("#lb-live-announcer")).toHaveText("Board LB-0777 added successfully.");
    const addedRow = panel.locator('table.lb-table tbody tr[data-board-id="LB-0777"]');
    await expect(addedRow).toBeVisible();
  });

  test("responsive mobile layout at 375px with >=44px touch targets and zero horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Mobile nav switch to Loadboards workspace
    const navBtn = page.locator('#workspace-nav button[data-workspace="loadboards"]');
    await expect(navBtn).toBeVisible();
    await navBtn.click();

    const panel = page.locator("#loadboards-tile");
    await expect(panel).toBeVisible();

    const toggleBtn = panel.locator(".lb-toggle-add-btn");
    await expect(toggleBtn).toBeVisible();

    // Verify toggle button touch target >= 44px
    const toggleBox = await toggleBtn.boundingBox();
    expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

    // Open drawer
    await toggleBtn.click();
    const drawer = panel.locator(".lb-add-drawer");
    await expect(drawer).toBeVisible();

    // Verify all mobile touch targets inside drawer >= 44px
    const idInput = drawer.locator("#lb-input-board-id");
    const revInput = drawer.locator("#lb-input-revision");
    const condSelect = drawer.locator("#lb-select-condition");
    const cellInput = drawer.locator("#lb-input-cell-id");
    const progInput = drawer.locator("#lb-input-programs");
    const submitBtn = drawer.locator(".lb-submit-add-board-btn");
    const cancelBtn = drawer.locator(".lb-cancel-add-board-btn");

    const idBox = await idInput.boundingBox();
    const revBox = await revInput.boundingBox();
    const condBox = await condSelect.boundingBox();
    const cellBox = await cellInput.boundingBox();
    const progBox = await progInput.boundingBox();
    const submitBox = await submitBtn.boundingBox();
    const cancelBox = await cancelBtn.boundingBox();

    expect(idBox?.height).toBeGreaterThanOrEqual(44);
    expect(revBox?.height).toBeGreaterThanOrEqual(44);
    expect(condBox?.height).toBeGreaterThanOrEqual(44);
    expect(cellBox?.height).toBeGreaterThanOrEqual(44);
    expect(progBox?.height).toBeGreaterThanOrEqual(44);
    expect(submitBox?.height).toBeGreaterThanOrEqual(44);
    expect(cancelBox?.height).toBeGreaterThanOrEqual(44);

    // Verify zero horizontal scroll across the panel and document at 375px
    const scrollStatus = await page.evaluate(() => {
      const p = document.querySelector("#loadboards-tile");
      return {
        panelScrollWidth: p?.scrollWidth || 0,
        panelClientWidth: p?.clientWidth || 0,
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
      };
    });

    expect(scrollStatus.panelScrollWidth).toBeLessThanOrEqual(scrollStatus.panelClientWidth + 1);
    expect(scrollStatus.docScrollWidth).toBeLessThanOrEqual(scrollStatus.docClientWidth + 1);
  });
});
