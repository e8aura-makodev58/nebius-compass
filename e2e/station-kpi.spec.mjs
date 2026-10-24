import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = resolve(__dirname, "../fixtures/station-kpis/response-12h.json");
const FIXTURE_DATA = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));

test.describe("Station KPI panel", () => {
  test("renders with 12h window, 3h buckets, DERIVED_FROM_UPTIME and desktop table at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route("**/api/control-rooms/*/station-kpis*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE_DATA),
      });
    });

    await page.goto("/rooms/plant-1");

    // Dockview group tab switching to Station KPIs
    const tab = page.locator('#floor-tiles .dv-tab:has-text("Station KPIs")');
    await expect(tab).toBeVisible();
    await tab.click();

    const panel = page.locator("#station-kpi-tile");
    await expect(panel).toBeVisible();

    // Verify header and badge
    await expect(panel.locator("#station-kpi-heading")).toHaveText("Station KPIs");
    const badge = panel.locator(".kpi-source-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("DERIVED_FROM_UPTIME");

    // Verify desktop table headers: 4 buckets
    const bucketHeaders = panel.locator(".kpi-table thead th.kpi-bucket-col");
    await expect(bucketHeaders).toHaveCount(4);

    // Verify stations: EQ-01 and EQ-02
    const rows = panel.locator(".kpi-table tbody tr[data-station-id]");
    await expect(rows).toHaveCount(2);

    const station1Row = panel.locator('.kpi-table tbody tr[data-station-id="EQ-01"]');
    await expect(station1Row).toBeVisible();
    await expect(station1Row).toContainText("ATE 1");
    await expect(station1Row).toContainText("SR1260");
    await expect(station1Row).toContainText("1,260 UPH");
    await expect(station1Row).toContainText("EQ-01");
    // Actual / expected attainment in first bucket
    await expect(station1Row).toContainText("3276");
    await expect(station1Row).toContainText("3780");
    await expect(station1Row).toContainText("86.7%");
    await expect(station1Row).toContainText("24m down");

    const station2Row = panel.locator('.kpi-table tbody tr[data-station-id="EQ-02"]');
    await expect(station2Row).toBeVisible();
    await expect(station2Row).toContainText("ATE 2");
    await expect(station2Row).toContainText("PM0096");
    await expect(station2Row).toContainText("96 UPH");

    // Verify totals row
    const totalsRow = panel.locator(".kpi-totals-row");
    await expect(totalsRow).toBeVisible();
    await expect(totalsRow).toContainText("Totals (2 stations)");

    // No horizontal scroll at 1280px
    const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(fitsViewport).toBe(true);
  });

  test("station filter allows search, None (empty state), All, and selective station toggling", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route("**/api/control-rooms/*/station-kpis*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE_DATA),
      });
    });

    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Station KPIs")').click();

    const panel = page.locator("#station-kpi-tile");
    const dropdown = panel.locator(".kpi-filter-dropdown");
    const dropdownSummary = dropdown.locator("summary");

    // Open filter dropdown
    await dropdownSummary.click();
    await expect(dropdown).toHaveAttribute("open", "");

    // Search filter
    const searchInput = panel.locator(".kpi-station-search-input");
    await searchInput.fill("EQ-01");
    await expect(panel.locator('.kpi-station-item:has-text("EQ-01")')).toBeVisible();
    await expect(panel.locator('.kpi-station-item:has-text("EQ-02")')).toBeHidden();

    // Clear search
    await searchInput.fill("");
    await expect(panel.locator('.kpi-station-item:has-text("EQ-02")')).toBeVisible();

    // Click None -> should render empty state
    await panel.locator(".kpi-action-none").click();
    await expect(panel.locator(".kpi-empty")).toBeVisible();
    await expect(panel.locator(".kpi-empty")).toContainText("No stations selected");
    await expect(panel.locator(".kpi-table")).toBeHidden();

    // Click All -> restores table
    await panel.locator(".kpi-action-all").click();
    await expect(panel.locator(".kpi-table")).toBeVisible();
    await expect(panel.locator(".kpi-totals-row")).toContainText("Totals (2 stations)");

    // Deselect Station 2 checkbox
    const station2Checkbox = panel.locator('[data-kpi-station="EQ-02"]');
    await station2Checkbox.uncheck();
    await expect(panel.locator('.kpi-table tbody tr[data-station-id="EQ-02"]')).toBeHidden();
    await expect(panel.locator('.kpi-table tbody tr[data-station-id="EQ-01"]')).toBeVisible();
    await expect(panel.locator(".kpi-totals-row")).toContainText("Totals (1 stations)");
  });

  test("window controls support Latest, Previous 12 h, Next 12 h and dropdown selection", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    let lastRequestedUrl = null;
    await page.route("**/api/control-rooms/*/station-kpis*", async (route) => {
      lastRequestedUrl = route.request().url();
      const url = new URL(lastRequestedUrl);
      const requestedEnd = url.searchParams.get("windowEnd");
      const resp = JSON.parse(JSON.stringify(FIXTURE_DATA));
      if (requestedEnd) {
        resp.window.end = requestedEnd;
        resp.window.start = new Date(Date.parse(requestedEnd) - 12 * 3600 * 1000).toISOString();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(resp),
      });
    });

    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Station KPIs")').click();

    const panel = page.locator("#station-kpi-tile");
    const latestBtn = panel.locator(".kpi-nav-latest");
    const prevBtn = panel.locator(".kpi-nav-prev");
    const nextBtn = panel.locator(".kpi-nav-next");
    const select = panel.locator(".kpi-window-select");

    // Initially at latest window: Latest and Next are disabled
    await expect(latestBtn).toBeDisabled();
    await expect(nextBtn).toBeDisabled();

    // Click Previous 12 h
    await prevBtn.click();
    await expect.poll(() => lastRequestedUrl).toContain("windowEnd=");
    await expect(nextBtn).toBeEnabled();
    await expect(latestBtn).toBeEnabled();

    // Click Next 12 h
    await nextBtn.click();
    await expect(nextBtn).toBeDisabled();
    await expect(latestBtn).toBeDisabled();

    // Dropdown select change
    const options = await select.locator("option").all();
    if (options.length > 1) {
      const secondOptionVal = await options[1].getAttribute("value");
      await select.selectOption(secondOptionVal);
      await expect.poll(() => lastRequestedUrl).toContain(`windowEnd=${encodeURIComponent(secondOptionVal)}`);
      await expect(nextBtn).toBeEnabled();
    }
  });

  test("forced endpoint failure displays error state and retry restores data", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    let failEndpoint = true;

    await page.route("**/api/control-rooms/*/station-kpis*", async (route) => {
      if (failEndpoint) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic server error" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(FIXTURE_DATA),
        });
      }
    });

    await page.goto("/rooms/plant-1");
    await page.locator('#floor-tiles .dv-tab:has-text("Station KPIs")').click();

    const panel = page.locator("#station-kpi-tile");
    await expect(panel.locator(".kpi-error")).toBeVisible();
    await expect(panel.locator(".kpi-error")).toContainText("Failed to load Station KPIs");

    // Retry recovery
    failEndpoint = false;
    await panel.locator(".kpi-action-retry").click();
    await expect(panel.locator(".kpi-table")).toBeVisible();
    await expect(panel.locator(".kpi-error")).toBeHidden();
  });

  test("phone viewport at 375px renders stacked cards, no horizontal scroll, and touch targets >= 44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route("**/api/control-rooms/*/station-kpis*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE_DATA),
      });
    });

    await page.goto("/rooms/plant-1");

    // Mobile navigation to KPIs
    const kpisNav = page.locator('[data-workspace="kpis"]');
    await expect(kpisNav).toBeVisible();
    await kpisNav.click();

    const panel = page.locator("#station-kpi-tile");
    await expect(panel).toBeVisible();

    // Cards container visible, table hidden
    await expect(panel.locator(".kpi-cards-container")).toBeVisible();
    await expect(panel.locator(".kpi-table-container")).toBeHidden();

    // Each station card has 4 stacked buckets
    const cards = panel.locator(".kpi-card:not(.kpi-card-totals)");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("ATE 1 · SR1260 · 1,260 UPH");
    await expect(cards.nth(1)).toContainText("ATE 2 · PM0096 · 96 UPH");

    const firstCardBuckets = cards.first().locator(".kpi-card-bucket");
    await expect(firstCardBuckets).toHaveCount(4);

    // Totals card
    const totalsCard = panel.locator(".kpi-card-totals");
    await expect(totalsCard).toBeVisible();
    await expect(totalsCard.locator(".kpi-card-bucket")).toHaveCount(4);

    // No horizontal page scroll
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(fits).toBe(true);

    // Touch targets >= 44px
    for (const btn of await panel.locator(".kpi-toolbar button:visible, .kpi-toolbar summary:visible, .kpi-toolbar select:visible").all()) {
      const box = await btn.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
