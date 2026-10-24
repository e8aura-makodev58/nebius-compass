import { expect, test } from "@playwright/test";

const MOCK_EPISODES_PAYLOAD = {
  stationId: "HANDLER-A",
  window: {
    start: "2026-10-24T06:00:00.000Z",
    end: "2026-10-24T09:00:00.000Z",
  },
  policyId: "JAM-POLICY-A",
  policyVersion: 2,
  episodes: [
    {
      episodeId: "EP-AL-101",
      reasonCode: "JAM_PICK",
      firstOccurredAt: "2026-10-24T06:12:00.000Z",
      lastOccurredAt: "2026-10-24T06:25:00.000Z",
      jamCount: 3,
      alarmIds: ["AL-101", "AL-102", "AL-104"],
      unplannedStoppedMinutes: 14,
      classification: "PATTERN",
    },
    {
      episodeId: "EP-AL-110",
      reasonCode: "JAM_DROP",
      firstOccurredAt: "2026-10-24T07:05:00.000Z",
      lastOccurredAt: "2026-10-24T07:05:00.000Z",
      jamCount: 1,
      alarmIds: ["AL-110"],
      unplannedStoppedMinutes: 4,
      classification: "SINGLE_EVENT",
    },
    {
      episodeId: "EP-AL-120",
      reasonCode: "JAM_TRANSFER",
      firstOccurredAt: "2026-10-24T08:15:00.000Z",
      lastOccurredAt: "2026-10-24T08:22:00.000Z",
      jamCount: 2,
      alarmIds: ["AL-120", "AL-122"],
      unplannedStoppedMinutes: 8,
      classification: "PATTERN",
    },
  ],
  excludedAlarms: 0,
  unplannedStoppedMinutes: 26,
  plannedStopMinutes: 15,
  runningMinutes: 139,
  acceptedUnitsPerRunningMinute: 2.95,
  deficitStatus: "ESTIMATE",
  estimatedDeficitUnits: 78,
  deficitBasis: {
    referenceUnitsPerHour: 180,
    windowMinutes: 180,
    denominator: "UNPLANNED_STOPPED_MINUTES",
  },
  suppressionReasons: [],
};

const MOCK_SUPPRESSED_PAYLOAD = {
  ...MOCK_EPISODES_PAYLOAD,
  deficitStatus: "SUPPRESSED",
  estimatedDeficitUnits: null,
  suppressionReasons: ["PROGRAM_CHANGED", "SITE_COUNT_CHANGED"],
};

test.describe("Handler jam episodes and throughput deficit panel (F4 UI)", () => {
  test("renders desktop table layout at 1280px with episode details, classification badges, and deficit estimate", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_EPISODES_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Dockview tab switching to Handler episodes
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#handler-episodes-tile");
    await expect(panel).toBeVisible();

    // Verify title and station badge
    await expect(panel.locator("#handler-episodes-heading")).toHaveText("Handler Episodes");
    await expect(panel.locator(".he-station-badge")).toHaveText("HANDLER-A");
    await expect(panel.locator(".he-count-badge")).toHaveText("2 patterns · 3 total");

    // Summary metrics
    await expect(panel.locator('[data-metric="unplanned"]')).toHaveText("26 min");
    await expect(panel.locator('[data-metric="planned"]')).toHaveText("15 min");
    await expect(panel.locator('[data-metric="running"]')).toHaveText("139 min");
    await expect(panel.locator('[data-metric="rate"]')).toHaveText("2.95");

    // Deficit estimate card
    const deficitCard = panel.locator(".he-deficit-card");
    await expect(deficitCard).toBeVisible();
    await expect(deficitCard.locator(".he-deficit-tag")).toHaveText("ESTIMATE");
    await expect(deficitCard.locator(".he-deficit-title")).toHaveText("Estimate: 78 units");
    await expect(deficitCard.locator(".he-deficit-basis")).toContainText("Basis: 180 units/hr · 180 min window · Denominator: UNPLANNED_STOPPED_MINUTES");

    // Strict rule: Deficit display must NEVER call it "measured" or "measured recoverable production"
    const deficitText = (await deficitCard.innerText()).toLowerCase();
    expect(deficitText).not.toContain("measured");

    // Desktop table container visible, mobile cards hidden
    await expect(panel.locator(".he-table-container")).toBeVisible();
    await expect(panel.locator(".he-cards-container")).toBeHidden();

    // Verify table rows
    const rows = panel.locator(".he-table tbody tr[data-episode-id]");
    await expect(rows).toHaveCount(3);

    // Row 1: Pattern
    const row1 = panel.locator('.he-table tbody tr[data-episode-id="EP-AL-101"]');
    await expect(row1.locator(".he-badge")).toHaveText("Pattern");
    await expect(row1.locator(".he-cell-reason")).toHaveText("JAM_PICK");
    await expect(row1.locator(".he-cell-jams")).toHaveText("3");
    await expect(row1.locator(".he-cell-stopped")).toHaveText("14 min");
    await expect(row1.locator(".he-cell-alarms")).toContainText("AL-101");
    await expect(row1.locator(".he-cell-alarms")).toContainText("AL-102");
    await expect(row1.locator(".he-cell-alarms")).toContainText("AL-104");

    // Row 2: Single event
    const row2 = panel.locator('.he-table tbody tr[data-episode-id="EP-AL-110"]');
    await expect(row2.locator(".he-badge")).toHaveText("Single Event");
    await expect(row2.locator(".he-cell-reason")).toHaveText("JAM_DROP");
    await expect(row2.locator(".he-cell-jams")).toHaveText("1");
    await expect(row2.locator(".he-cell-stopped")).toHaveText("4 min");
    await expect(row2.locator(".he-cell-alarms")).toHaveText("AL-110");
  });

  test("displays suppressed deficit status with suppression reasons and no measured claims", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SUPPRESSED_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")');
    await tab.click();

    const panel = page.locator("#handler-episodes-tile");
    const deficitCard = panel.locator(".he-deficit-card");
    await expect(deficitCard).toBeVisible();

    // Verify suppressed tag and reasons
    await expect(deficitCard.locator(".he-deficit-tag")).toHaveText("SUPPRESSED");
    await expect(deficitCard.locator(".he-deficit-title")).toHaveText("Suppressed: PROGRAM_CHANGED, SITE_COUNT_CHANGED");

    // Never call it measured
    const fullText = (await deficitCard.innerText()).toLowerCase();
    expect(fullText).not.toContain("measured");

    // Raw counts and stopped minutes are still present
    await expect(panel.locator('[data-metric="unplanned"]')).toHaveText("26 min");
    await expect(panel.locator('.he-table tbody tr[data-episode-id]')).toHaveCount(3);
  });

  test("filters episodes by classification (ALL, PATTERN, SINGLE_EVENT)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_EPISODES_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")');
    await tab.click();

    const panel = page.locator("#handler-episodes-tile");
    const select = panel.locator("#he-classification-select");

    // Select PATTERN
    await select.selectOption("PATTERN");
    const patternRows = panel.locator(".he-table tbody tr[data-episode-id]");
    await expect(patternRows).toHaveCount(2);
    await expect(panel.locator('.he-table tbody tr[data-episode-id="EP-AL-101"]')).toBeVisible();
    await expect(panel.locator('.he-table tbody tr[data-episode-id="EP-AL-120"]')).toBeVisible();
    await expect(panel.locator('.he-table tbody tr[data-episode-id="EP-AL-110"]')).toBeHidden();

    // Select SINGLE_EVENT
    await select.selectOption("SINGLE_EVENT");
    const singleRows = panel.locator(".he-table tbody tr[data-episode-id]");
    await expect(singleRows).toHaveCount(1);
    await expect(panel.locator('.he-table tbody tr[data-episode-id="EP-AL-110"]')).toBeVisible();
    await expect(panel.locator('.he-table tbody tr[data-episode-id="EP-AL-101"]')).toBeHidden();

    // Reset to ALL
    await select.selectOption("ALL");
    await expect(panel.locator(".he-table tbody tr[data-episode-id]")).toHaveCount(3);
  });

  test("filters episodes by search input and retains focus across keystrokes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_EPISODES_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")');
    await tab.click();

    const panel = page.locator("#handler-episodes-tile");
    const searchInput = panel.locator("#he-search-input");

    await searchInput.focus();
    await searchInput.pressSequentially("JAM_DROP", { delay: 30 });

    // Verify only the JAM_DROP episode is visible
    const rows = panel.locator(".he-table tbody tr[data-episode-id]");
    await expect(rows).toHaveCount(1);
    await expect(panel.locator('.he-table tbody tr[data-episode-id="EP-AL-110"]')).toBeVisible();

    // Verify focus is still on search input
    await expect(searchInput).toBeFocused();

    // Search by alarm ID
    await searchInput.fill("AL-104");
    await expect(panel.locator(".he-table tbody tr[data-episode-id]")).toHaveCount(1);
    await expect(panel.locator('.he-table tbody tr[data-episode-id="EP-AL-101"]')).toBeVisible();
  });

  test("toggles episode inspection drawer with full alarm trail", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_EPISODES_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")');
    await tab.click();

    const panel = page.locator("#handler-episodes-tile");
    const inspectBtn = panel.locator('.he-table tbody tr[data-episode-id="EP-AL-101"] .he-action-btn');

    await expect(inspectBtn).toHaveText("Inspect");
    await expect(inspectBtn).toHaveAttribute("aria-expanded", "false");

    await inspectBtn.click();

    await expect(inspectBtn).toHaveText("Close");
    await expect(inspectBtn).toHaveAttribute("aria-expanded", "true");

    const drawer = panel.locator('.he-table-container .he-detail-drawer[aria-label="Inspection details for EP-AL-101"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Complete Alarm Trail (3):");
    await expect(drawer).toContainText("AL-101");
    await expect(drawer).toContainText("AL-102");
    await expect(drawer).toContainText("AL-104");

    // Close inspection
    await inspectBtn.click();
    await expect(drawer).toBeHidden();
    await expect(inspectBtn).toHaveText("Inspect");
  });

  test("displays empty state and resets filters on button click", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_EPISODES_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")');
    await tab.click();

    const panel = page.locator("#handler-episodes-tile");
    const searchInput = panel.locator("#he-search-input");

    await searchInput.fill("NONEXISTENT_JAM_QUERY_XYZ");

    const emptyState = panel.locator(".he-empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText("No handler episodes match the current search or filter.");

    const resetBtn = panel.locator(".he-reset-filter-button");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Filters should be reset and episodes visible again
    await expect(emptyState).toBeHidden();
    await expect(panel.locator(".he-table tbody tr[data-episode-id]")).toHaveCount(3);
    await expect(searchInput).toHaveValue("");
  });

  test("handles forced 500 server error and recovers on retry", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    let shouldFail = true;
    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated internal server error" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_EPISODES_PAYLOAD),
        });
      }
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")');
    await tab.click();

    const panel = page.locator("#handler-episodes-tile");
    const errorState = panel.locator(".he-error-state");
    await expect(errorState).toBeVisible();
    await expect(errorState).toContainText("Failed to load handler episodes");

    // Recover on retry
    shouldFail = false;
    const retryBtn = panel.locator(".he-retry-button");
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    await expect(errorState).toBeHidden();
    await expect(panel.locator(".he-table tbody tr[data-episode-id]")).toHaveCount(3);
  });

  test("renders mobile card layout at 375px with >=44px touch targets and zero horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_EPISODES_PAYLOAD),
      });
    });

    await page.goto("/rooms/plant-1");

    // Mobile workspace navigation: click Jams tab
    const jamsNavBtn = page.locator('#workspace-nav button[data-workspace="episodes"]');
    await expect(jamsNavBtn).toBeVisible();
    await jamsNavBtn.click();

    const panel = page.locator("#handler-episodes-tile");
    await expect(panel).toBeVisible();

    // Desktop table should be hidden, cards container visible
    await expect(panel.locator(".he-table-container")).toBeHidden();
    const cardsContainer = panel.locator(".he-cards-container");
    await expect(cardsContainer).toBeVisible();

    const cards = panel.locator(".he-card");
    await expect(cards).toHaveCount(3);

    // Verify touch targets >= 44px
    const actionBtn = cards.first().locator(".he-action-btn");
    await expect(actionBtn).toBeVisible();
    const actionBox = await actionBtn.boundingBox();
    expect(actionBox.height).toBeGreaterThanOrEqual(44);

    const refreshBtn = panel.locator(".he-refresh-button");
    const refreshBox = await refreshBtn.boundingBox();
    expect(refreshBox.height).toBeGreaterThanOrEqual(44);

    const select = panel.locator("#he-classification-select");
    const selectBox = await select.boundingBox();
    expect(selectBox.height).toBeGreaterThanOrEqual(44);

    const searchInput = panel.locator("#he-search-input");
    const searchBox = await searchInput.boundingBox();
    expect(searchBox.height).toBeGreaterThanOrEqual(44);

    // Assert zero horizontal scroll on body and panel
    const bodyScroll = await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth);
    expect(bodyScroll).toBe(true);

    const panelScroll = await page.evaluate(() => {
      const el = document.querySelector("#handler-episodes-tile");
      return el ? el.scrollWidth <= el.clientWidth + 1 : true;
    });
    expect(panelScroll).toBe(true);
  });

  test("falls back to deterministic synthetic handler episodes when route returns 404", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // Route returns 404 (unmounted endpoint)
    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Endpoint not found" }),
      });
    });

    await page.goto("/rooms/plant-1");

    const tab = page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")');
    await tab.click();

    const panel = page.locator("#handler-episodes-tile");
    await expect(panel).toBeVisible();

    // Synthetic fallback should populate data without error
    await expect(panel.locator(".he-error-state")).toBeHidden();
    await expect(panel.locator(".he-deficit-card")).toBeVisible();
    await expect(panel.locator(".he-station-badge")).toHaveText("HANDLER-A");
    await expect(panel.locator(".he-table tbody tr[data-episode-id]")).toHaveCount(3);
  });
});
