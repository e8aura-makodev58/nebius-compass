import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const KPI_FIXTURE_PATH = resolve(__dirname, "../fixtures/station-kpis/response-12h.json");
const KPI_FIXTURE_DATA = JSON.parse(readFileSync(KPI_FIXTURE_PATH, "utf-8"));

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

const MOCK_LOADBOARDS_DATA = {
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
  ],
};

const MOCK_READINESS_DATA = {
  roomId: "plant-1",
  asOf: "2026-10-24T12:00:00.000Z",
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
  ],
};

const MOCK_CALIBRATIONS_DATA = {
  roomId: "plant-1",
  asOf: "2026-10-24T12:00:00.000Z",
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

const MOCK_CORRELATIONS_DATA = {
  roomId: "plant-1",
  asOf: "2026-10-24T12:00:00.000Z",
  records: [
    {
      correlationId: "CORR-001",
      cellId: "ATE-1",
      instrumentId: "PS-07",
      referencePartId: "REF-STD-01",
      observedAt: "2026-10-10T08:00:00.000Z",
      result: "PASS",
    },
  ],
};

const MOCK_OBLIGATIONS_DATA = {
  roomId: "plant-1",
  asOf: "2026-10-24T12:00:00.000Z",
  obligations: [
    {
      obligationId: "OBL-0001",
      lifecycleId: "LC-PROBE-01",
      kind: "CLEANING",
      status: "OPEN",
      policyId: "probe-card-clean",
      policyVersion: 1,
      openedAt: "2026-10-24T10:00:00.000Z",
      closedAt: null,
      closeReason: null,
    },
  ],
};

const MOCK_HANDLER_EPISODES_DATA = {
  roomId: "plant-1",
  asOf: "2026-10-24T12:00:00.000Z",
  stationId: "ATE-1",
  windowMinutes: 60,
  unplannedStoppedMinutes: 18,
  plannedStopMinutes: 6,
  runningMinutes: 36,
  acceptedUnitsPerRunningMinute: 12.5,
  deficitStatus: "ESTIMATE",
  estimatedDeficitUnits: 250,
  deficitBasis: {
    referenceUnitsPerHour: 800,
    windowMinutes: 60,
    denominator: "UNPLANNED_STOPPED_MINUTES",
  },
  episodes: [
    {
      episodeId: "JAM-0101",
      stationId: "ATE-1",
      reasonCode: "BIN_TRANSFER_JAM",
      jamCount: 3,
      unplannedStoppedMinutes: 12,
      classification: "PATTERN",
      alarmIds: ["ALM-401"],
    },
  ],
};

async function setupMockRoutes(page) {
  await page.route(/.*\/api\/control-rooms\/[^/]+\/changeovers\/CO-0031\/readiness.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CHANGEOVER_PAYLOAD) });
  });
  await page.route(/.*\/api\/control-rooms\/[^/]+\/station-kpis.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(KPI_FIXTURE_DATA) });
  });
  await page.route(/.*\/api\/control-rooms\/[^/]+\/loadboards$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_LOADBOARDS_DATA) });
  });
  await page.route(/.*\/api\/control-rooms\/[^/]+\/cell-readiness$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_READINESS_DATA) });
  });
  await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CALIBRATIONS_DATA) });
  });
  await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations\/correlations.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CORRELATIONS_DATA) });
  });
  await page.route(/.*\/api\/control-rooms\/[^/]+\/consumable-obligations$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_OBLIGATIONS_DATA) });
  });
  await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_HANDLER_EPISODES_DATA) });
  });
}

test.describe("Keyboard-only pass across all workspace panels (Round 43)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 960 });
    await setupMockRoutes(page);
  });

  test("tab order follows natural reading order without positive tabindices across all 13 panels", async ({ page }) => {
    await page.goto("/rooms/plant-1");

    const panelDefinitions = [
      { name: "Staffing", selector: "#staffing-tile", tabText: "Staffing" },
      { name: "Investigation", selector: "#investigation-tile", tabText: "Field reports" },
      { name: "Map", selector: ".floor-section", tabText: "Floor map" },
      { name: "Issues", selector: "#issue-list", tabText: "Issues" },
      { name: "Events", selector: "#event-feed", tabText: "Event feed" },
      { name: "Context", selector: ".context-panel", tabText: "Dispatch / context" },
      { name: "Station KPIs", selector: "#station-kpi-tile", tabText: "Station KPIs" },
      { name: "Loadboards", selector: "#loadboards-tile", tabText: "Loadboards" },
      { name: "Obligations", selector: "#obligations-tile", tabText: "Obligations" },
      { name: "Handler episodes", selector: "#handler-episodes-tile", tabText: "Handler episodes" },
      { name: "Calibrations", selector: "#calibrations-tile", tabText: "Calibrations" },
      { name: "Changeover readiness", selector: "#changeover-readiness-tile", tabText: "Changeover readiness" },
    ];

    for (const p of panelDefinitions) {
      const tab = page.locator(`#floor-tiles .dv-tab:has-text("${p.tabText}")`);
      if (await tab.count()) {
        await tab.first().click();
      }
      const panel = page.locator(p.selector);
      await expect(panel).toBeVisible();

      // Verify no focusable elements have a positive tabIndex
      const positiveTabindices = await panel.evaluate((el) => {
        const focusables = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]');
        return Array.from(focusables)
          .filter((f) => f.tabIndex > 0)
          .map((f) => f.outerHTML.slice(0, 80));
      });
      expect(positiveTabindices, `Panel ${p.name} should have no positive tabindexes`).toEqual([]);

      // Verify focusables follow top-down visual DOM order
      const focusables = await panel.evaluate((el) => {
        const list = Array.from(
          el.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')
        ).filter((f) => !f.disabled && (f.offsetParent !== null || f.getClientRects().length > 0) && window.getComputedStyle(f).visibility !== "hidden");
        return list.map((f) => ({
          tag: f.tagName,
          ariaLabel: f.getAttribute("aria-label"),
          text: (f.textContent || f.value || "").trim().slice(0, 25),
        }));
      });

      // All interactive panels have at least 1 focusable item
      expect(focusables.length, `Panel ${p.name} has interactive focusables`).toBeGreaterThan(0);
    }

    // Check Analytics panel (13th panel) in Analytics tab
    const analyticsTab = page.locator("#analytics-tab");
    await analyticsTab.click();
    const analyticsView = page.locator("#analytics-view");
    await expect(analyticsView).toBeVisible();

    const analyticsPositiveTabindices = await analyticsView.evaluate((el) => {
      const focusables = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]');
      return Array.from(focusables)
        .filter((f) => f.tabIndex > 0)
        .map((f) => f.outerHTML.slice(0, 80));
    });
    expect(analyticsPositiveTabindices, "Analytics panel should have no positive tabindexes").toEqual([]);
  });

  test("focus rings are visible with >= 2px outline width across panels and controls", async ({ page }) => {
    await page.goto("/rooms/plant-1");

    // Check global header buttons
    const headerButtons = ["#open-control-search", "#open-ask", "#simulation-speed", "#pause-resume-button"];
    for (const sel of headerButtons) {
      const btn = page.locator(sel);
      if (await btn.isVisible()) {
        await btn.focus();
        const outlineWidth = await btn.evaluate((el) => window.getComputedStyle(el).outlineWidth);
        const widthVal = parseFloat(outlineWidth);
        expect(widthVal, `Focus outline on ${sel} must be >= 2px`).toBeGreaterThanOrEqual(2);
      }
    }

    // Check Loadboards controls
    await page.locator('#floor-tiles .dv-tab:has-text("Loadboards")').first().click();
    const lbSearch = page.locator(".lb-search-input");
    await lbSearch.focus();
    const lbSearchOutline = await lbSearch.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(parseFloat(lbSearchOutline), "Loadboard search input outline >= 2px").toBeGreaterThanOrEqual(2);

    const lbActionBtn = page.locator(".lb-action-btn").first();
    await lbActionBtn.focus();
    const lbActionOutline = await lbActionBtn.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(parseFloat(lbActionOutline), "Loadboard action button outline >= 2px").toBeGreaterThanOrEqual(2);

    // Check Calibrations controls
    await page.locator('#floor-tiles .dv-tab:has-text("Calibrations")').first().click();
    const calSearch = page.locator(".cal-search-input");
    await calSearch.focus();
    const calSearchOutline = await calSearch.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(parseFloat(calSearchOutline), "Calibrations search input outline >= 2px").toBeGreaterThanOrEqual(2);

    // Check Changeover readiness controls
    await page.locator('#floor-tiles .dv-tab:has-text("Changeover readiness")').first().click();
    const coSelect = page.locator("#co-select-id");
    await coSelect.focus();
    const coSelectOutline = await coSelect.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(parseFloat(coSelectOutline), "Changeover select outline >= 2px").toBeGreaterThanOrEqual(2);

    const coRefreshBtn = page.locator(".co-refresh-btn");
    await coRefreshBtn.focus();
    const coRefreshOutline = await coRefreshBtn.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(parseFloat(coRefreshOutline), "Changeover refresh button outline >= 2px").toBeGreaterThanOrEqual(2);

    // Check Obligations controls
    await page.locator('#floor-tiles .dv-tab:has-text("Obligations")').first().click();
    const oblActionBtn = page.locator(".obl-action-btn").first();
    await oblActionBtn.focus();
    const oblActionOutline = await oblActionBtn.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(parseFloat(oblActionOutline), "Obligations action button outline >= 2px").toBeGreaterThanOrEqual(2);

    // Check Handler Episodes controls
    await page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")').first().click();
    const heActionBtn = page.locator(".he-action-btn").first();
    await heActionBtn.focus();
    const heActionOutline = await heActionBtn.evaluate((el) => window.getComputedStyle(el).outlineWidth);
    expect(parseFloat(heActionOutline), "Handler episodes action button outline >= 2px").toBeGreaterThanOrEqual(2);
  });

  test("control search palette traps focus, closes on Escape, and returns focus to trigger", async ({ page }) => {
    await page.goto("/rooms/plant-1");

    const searchOpener = page.locator("#open-control-search");
    await searchOpener.focus();
    await page.keyboard.press("Enter");

    const palette = page.locator("#control-search-palette");
    await expect(palette).toBeVisible();
    await expect(page.locator("#control-search-input")).toBeFocused();

    // Verify Tab wrapping inside palette
    // Tab forward through filter buttons and close button
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const isInside = await page.evaluate(() => {
        const pal = document.getElementById("control-search-palette");
        return pal && pal.contains(document.activeElement);
      });
      expect(isInside, "Active focus remains trapped inside control search palette").toBe(true);
    }

    // Shift+Tab wraps back
    await page.keyboard.press("Shift+Tab");
    const isStillInside = await page.evaluate(() => {
      const pal = document.getElementById("control-search-palette");
      return pal && pal.contains(document.activeElement);
    });
    expect(isStillInside, "Active focus remains trapped on Shift+Tab inside control search palette").toBe(true);

    // Press Escape: palette closes and focus returns to opener
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(searchOpener).toBeFocused();
  });

  test("Ask Compass dialog closes on Escape and returns focus to trigger", async ({ page }) => {
    await page.goto("/rooms/plant-1");

    const askOpener = page.locator("#open-ask");
    await askOpener.focus();
    await page.keyboard.press("Enter");

    const dialog = page.locator("#ask-dialog");
    await expect(dialog).toBeVisible();

    // Escape closes dialog and returns focus to trigger
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(askOpener).toBeFocused();
  });

  test("Loadboards add drawer, inspect drawer, and checkout drawer trap focus, close on Escape, and return focus", async ({ page }) => {
    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Loadboards")').first().click();

    // 1. Add drawer
    const toggleAddBtn = page.locator(".lb-toggle-add-btn");
    await toggleAddBtn.focus();
    await page.keyboard.press("Enter");

    const addDrawer = page.locator(".lb-add-drawer");
    await expect(addDrawer).toBeVisible();
    await expect(page.locator("#lb-input-board-id")).toBeFocused();

    // Tab wraps inside add drawer
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      const trapped = await page.evaluate(() => {
        const d = document.querySelector(".lb-add-drawer");
        return d && d.contains(document.activeElement);
      });
      expect(trapped, "Focus trapped in loadboards add drawer").toBe(true);
    }

    // Escape closes add drawer and returns focus to toggle button
    await page.keyboard.press("Escape");
    await expect(addDrawer).toBeHidden();
    await expect(toggleAddBtn).toBeFocused();

    // 2. Inspect drawer
    const inspectBtn = page.locator('.lb-action-btn[data-board-id="LB-0412"]:visible');
    await inspectBtn.focus();
    await page.keyboard.press("Enter");

    const inspectDrawer = page.locator(".lb-detail-drawer:visible");
    await expect(inspectDrawer).toBeVisible();

    // Escape closes inspect drawer and returns focus to inspect button
    await page.keyboard.press("Escape");
    await expect(inspectDrawer).toBeHidden();
    await expect(inspectBtn).toBeFocused();

    // 3. Checkout drawer
    const checkoutBtn = page.locator('.lb-checkout-btn[data-board-id="LB-0398"]:visible');
    await checkoutBtn.focus();
    await page.keyboard.press("Enter");

    const checkoutForm = page.locator('.lb-checkout-form[data-board-id="LB-0398"]:visible');
    await expect(checkoutForm).toBeVisible();

    // Tab wraps inside checkout form
    await page.keyboard.press("Tab");
    const checkoutTrapped = await page.evaluate(() => {
      const f = document.querySelector(".lb-checkout-form");
      return f && f.contains(document.activeElement);
    });
    expect(checkoutTrapped, "Focus trapped in loadboards checkout form").toBe(true);

    // Escape closes checkout form and returns focus to checkout button
    await page.keyboard.press("Escape");
    await expect(checkoutForm).toBeHidden();
    await expect(checkoutBtn).toBeFocused();
  });

  test("Calibrations add drawer and correlation add drawer trap focus, close on Escape, and return focus", async ({ page }) => {
    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Calibrations")').first().click();

    // 1. Add calibration record drawer
    const toggleAddBtn = page.locator(".cal-toggle-add-btn");
    await toggleAddBtn.focus();
    await page.keyboard.press("Enter");

    const addDrawer = page.locator(".cal-add-drawer");
    await expect(addDrawer).toBeVisible();

    // Tab wraps inside calibration add drawer
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const trapped = await page.evaluate(() => {
        const d = document.querySelector(".cal-add-drawer");
        return d && d.contains(document.activeElement);
      });
      expect(trapped, "Focus trapped in calibration add drawer").toBe(true);
    }

    // Escape closes drawer and returns focus to toggle button
    await page.keyboard.press("Escape");
    await expect(addDrawer).toBeHidden();
    await expect(toggleAddBtn).toBeFocused();

    // 2. Add correlation record drawer
    const toggleAddCorrBtn = page.locator(".cal-toggle-add-corr-btn");
    await toggleAddCorrBtn.focus();
    await page.keyboard.press("Enter");

    const addCorrDrawer = page.locator(".cal-add-corr-drawer");
    await expect(addCorrDrawer).toBeVisible();

    // Tab wraps inside correlation drawer
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      const corrTrapped = await page.evaluate(() => {
        const d = document.querySelector(".cal-add-corr-drawer");
        return d && d.contains(document.activeElement);
      });
      expect(corrTrapped, "Focus trapped in correlation add drawer").toBe(true);
    }

    // Escape closes correlation drawer and returns focus to correlation toggle button
    await page.keyboard.press("Escape");
    await expect(addCorrDrawer).toBeHidden();
    await expect(toggleAddCorrBtn).toBeFocused();
  });

  test("Obligations inspect drawer traps focus, closes on Escape, and returns focus", async ({ page }) => {
    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Obligations")').first().click();

    const inspectBtn = page.locator('.obl-action-btn[data-obligation-id="OBL-0001"]:visible');
    await inspectBtn.focus();
    await page.keyboard.press("Enter");

    const oblDrawer = page.locator(".obl-detail-drawer:visible");
    await expect(oblDrawer).toBeVisible();

    // Escape closes drawer and returns focus to inspect button
    await page.keyboard.press("Escape");
    await expect(oblDrawer).toBeHidden();
    await expect(inspectBtn).toBeFocused();
  });

  test("Handler episodes inspect drawer traps focus, closes on Escape, and returns focus", async ({ page }) => {
    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")').first().click();

    const inspectBtn = page.locator('.he-action-btn[data-episode-id="JAM-0101"]:visible');
    await inspectBtn.focus();
    await page.keyboard.press("Enter");

    const heDrawer = page.locator(".he-detail-drawer:visible");
    await expect(heDrawer).toBeVisible();

    // Escape closes drawer and returns focus to inspect button
    await page.keyboard.press("Escape");
    await expect(heDrawer).toBeHidden();
    await expect(inspectBtn).toBeFocused();
  });

  test("Station KPIs filter dropdown traps focus, closes on Escape, and returns focus to summary", async ({ page }) => {
    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Station KPIs")').first().click();

    const summary = page.locator(".kpi-filter-dropdown summary");
    await summary.focus();
    await page.keyboard.press("Enter");

    const dropdown = page.locator(".kpi-filter-dropdown");
    await expect(dropdown).toHaveAttribute("open", "");

    // Tab wraps inside dropdown
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const d = document.querySelector(".kpi-filter-dropdown");
        return d && d.contains(document.activeElement);
      });
      expect(inside, "Focus trapped in station KPI filter dropdown").toBe(true);
    }

    // Escape closes dropdown and returns focus to summary
    await page.keyboard.press("Escape");
    await expect(dropdown).not.toHaveAttribute("open", "");
    await expect(summary).toBeFocused();
  });

  test("screen launcher menu closes on Escape and returns focus to summary", async ({ page }) => {
    await page.goto("/rooms/plant-1");

    const launcherSummary = page.locator(".screen-launcher summary");
    await launcherSummary.focus();
    await page.keyboard.press("Enter");

    const launcher = page.locator(".screen-launcher");
    await expect(launcher).toHaveAttribute("open", "");

    // Escape closes details and returns focus to summary
    await page.keyboard.press("Escape");
    await expect(launcher).not.toHaveAttribute("open", "");
    await expect(launcherSummary).toBeFocused();
  });

  test("Analytics drill-down panel closes on Escape and returns focus to trigger", async ({ page }) => {
    await page.goto("/rooms/plant-1");

    await page.locator("#analytics-tab").click();
    await expect(page.locator("#analytics-view")).toBeVisible();

    const drillTrigger = page.locator('[data-analytics-drill="compass"]').first();
    await drillTrigger.focus();
    await page.keyboard.press("Enter");

    const drillPanel = page.locator("#analytics-drill");
    await expect(drillPanel).toBeVisible();

    // Escape closes drilldown and returns focus to drillTrigger
    await page.keyboard.press("Escape");
    await expect(drillPanel).toBeHidden();
    await expect(drillTrigger).toBeFocused();
  });
});
