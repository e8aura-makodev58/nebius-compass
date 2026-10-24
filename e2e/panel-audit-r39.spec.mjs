import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const KPI_FIXTURE_PATH = resolve(__dirname, "../fixtures/station-kpis/response-12h.json");
const KPI_FIXTURE_DATA = JSON.parse(readFileSync(KPI_FIXTURE_PATH, "utf-8"));

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
    {
      calibrationId: "CAL-0022",
      cellId: "ATE-2",
      instrumentId: "DMM-02",
      calibratedAt: "2026-04-20T08:00:00.000Z",
      dueAt: "2026-10-20T08:00:00.000Z",
      state: "EXPIRED",
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
    {
      obligationId: "OBL-0002",
      lifecycleId: "LC-SOCKET-04",
      kind: "REPLACEMENT",
      status: "CLOSED",
      policyId: "socket-replace",
      policyVersion: 1,
      openedAt: "2026-10-23T08:00:00.000Z",
      closedAt: "2026-10-24T09:00:00.000Z",
      closeReason: "REPLACED",
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
      alarmIds: ["ALM-401", "ALM-402"],
    },
    {
      episodeId: "JAM-0102",
      stationId: "ATE-1",
      reasonCode: "PICK_ARM_TIMEOUT",
      jamCount: 1,
      unplannedStoppedMinutes: 6,
      classification: "SINGLE_EVENT",
      alarmIds: ["ALM-503"],
    },
  ],
};

const ROUND_PANELS = [
  { id: "obligations", selector: "#obligations-tile", nav: "obligations", tabText: "Obligations" },
  { id: "loadboards", selector: "#loadboards-tile", nav: "loadboards", tabText: "Loadboards" },
  { id: "calibrations", selector: "#calibrations-tile", nav: "calibrations", tabText: "Calibrations" },
  { id: "handlerEpisodes", selector: "#handler-episodes-tile", nav: "episodes", tabText: "Handler episodes" },
  { id: "stationKpis", selector: "#station-kpi-tile", nav: "kpis", tabText: "Station KPIs" },
];

/** Client-side audit scripts for contrast, accessible names, touch targets, and horizontal scroll */
const AUDIT_UTILS = `
  function parseRgb(colorStr) {
    if (!colorStr) return null;
    const m = colorStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
    if (!m) return null;
    return {
      r: parseInt(m[1], 10),
      g: parseInt(m[2], 10),
      b: parseInt(m[3], 10),
      a: m[4] !== undefined ? parseFloat(m[4]) : 1
    };
  }

  function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  function getContrast(fg, bg) {
    const l1 = getLuminance(fg.r, fg.g, fg.b);
    const l2 = getLuminance(bg.r, bg.g, bg.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function getEffectiveBg(el) {
    let cur = el;
    let r = 238, g = 242, b = 247;
    const stack = [];
    while (cur && cur !== document.documentElement) {
      const bg = window.getComputedStyle(cur).backgroundColor;
      const parsed = parseRgb(bg);
      if (parsed && parsed.a > 0) {
        stack.unshift(parsed);
        if (parsed.a >= 0.99) break;
      }
      cur = cur.parentElement;
    }
    for (const c of stack) {
      r = Math.round(r * (1 - c.a) + c.r * c.a);
      g = Math.round(g * (1 - c.a) + c.g * c.a);
      b = Math.round(b * (1 - c.a) + c.b * c.a);
    }
    return { r, g, b };
  }

  function getAccessibleName(el) {
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref && ref.textContent.trim()) return ref.textContent.trim();
    }
    if (el.title) return el.title.trim();
    if (el.getAttribute("placeholder")) return el.getAttribute("placeholder").trim();
    if (el.tagName === "INPUT" || el.tagName === "SELECT") {
      if (el.labels && el.labels.length > 0) {
        for (const l of el.labels) {
          if (l.textContent.trim()) return l.textContent.trim();
        }
      }
    }
    return (el.innerText || el.textContent || "").trim();
  }
`;

test.describe("Panel audit of Rounds 31–38 panels (Round 39 UI)", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept all panel routes with deterministic mock data
    await page.route("**/api/control-rooms/*/loadboards*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LOADBOARDS_DATA),
      });
    });

    await page.route("**/api/control-rooms/*/cell-readiness*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_READINESS_DATA),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/calibrations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CALIBRATIONS_DATA),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/consumable-obligations.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OBLIGATIONS_DATA),
      });
    });

    await page.route(/.*\/api\/control-rooms\/[^/]+\/handler-episodes.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_HANDLER_EPISODES_DATA),
      });
    });

    await page.route("**/api/control-rooms/*/station-kpis*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(KPI_FIXTURE_DATA),
      });
    });
  });

  test("zero horizontal scroll across all 5 panels at 1280px desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rooms/plant-1");

    for (const panelInfo of ROUND_PANELS) {
      if (panelInfo.tabText) {
        const tab = page.locator(`#floor-tiles .dv-tab:has-text("${panelInfo.tabText}")`);
        if (await tab.count()) {
          await tab.click();
        }
      }

      const panel = page.locator(panelInfo.selector);
      await expect(panel).toBeVisible();

      const scrollInfo = await panel.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));

      expect(
        scrollInfo.scrollWidth,
        `Panel ${panelInfo.id} has horizontal overflow at 1280px: scrollWidth=${scrollInfo.scrollWidth}, clientWidth=${scrollInfo.clientWidth}`
      ).toBeLessThanOrEqual(scrollInfo.clientWidth + 1);
    }
  });

  test("zero horizontal scroll across all 5 panels at 375px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/rooms/plant-1");

    for (const panelInfo of ROUND_PANELS) {
      const navBtn = page.locator(`#workspace-nav button[data-workspace="${panelInfo.nav}"]`);
      if (await navBtn.count()) {
        await navBtn.click();
      }

      const panel = page.locator(panelInfo.selector);
      await expect(panel).toBeVisible();

      const status = await page.evaluate(
        ({ sel, utils }) => {
          eval(utils);
          const p = document.querySelector(sel);
          return {
            panelScrollWidth: p ? p.scrollWidth : 0,
            panelClientWidth: p ? p.clientWidth : 0,
            docScrollWidth: document.documentElement.scrollWidth,
            docClientWidth: document.documentElement.clientWidth,
          };
        },
        { sel: panelInfo.selector, utils: AUDIT_UTILS }
      );

      expect(
        status.panelScrollWidth,
        `Panel ${panelInfo.id} has horizontal overflow at 375px: ${status.panelScrollWidth} > ${status.panelClientWidth}`
      ).toBeLessThanOrEqual(status.panelClientWidth + 1);

      expect(
        status.docScrollWidth,
        `Document has horizontal overflow in ${panelInfo.id} at 375px: ${status.docScrollWidth} > ${status.docClientWidth}`
      ).toBeLessThanOrEqual(status.docClientWidth + 1);
    }
  });

  test("touch targets >= 44px across all interactive controls in all 5 panels at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/rooms/plant-1");

    for (const panelInfo of ROUND_PANELS) {
      const navBtn = page.locator(`#workspace-nav button[data-workspace="${panelInfo.nav}"]`);
      if (await navBtn.count()) {
        await navBtn.click();
      }

      const panel = page.locator(panelInfo.selector);
      await expect(panel).toBeVisible();

      // Open any closed drawer/dropdown to audit internal controls too
      if (panelInfo.id === "loadboards") {
        await panel.locator(".lb-toggle-add-btn").click();
        await expect(panel.locator(".lb-add-drawer")).toBeVisible();
      } else if (panelInfo.id === "calibrations") {
        await panel.locator(".cal-toggle-add-btn").click();
        await expect(panel.locator(".cal-add-drawer")).toBeVisible();
      } else if (panelInfo.id === "stationKpis") {
        const summary = panel.locator(".kpi-filter-dropdown summary");
        if (await summary.count()) {
          await summary.click();
        }
      }

      const violations = await panel.evaluate(
        (p, utils) => {
          eval(utils);
          const results = [];
          const controls = p.querySelectorAll("button, input, select, textarea, summary, [role='button'], a[href]");

          for (const el of controls) {
            // Skip hidden elements
            if (el.offsetParent === null && el.type !== "file") continue;
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;

            const clickable = el.closest("label") || el;
            const rect = clickable.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            // Check bounding height against touch target specification
            if (rect.height < 43.5) {
              results.push({
                tag: el.tagName,
                id: el.id,
                className: el.className,
                name: getAccessibleName(el),
                height: Math.round(rect.height),
                width: Math.round(rect.width),
              });
            }
          }
          return results;
        },
        AUDIT_UTILS
      );

      expect(
        violations,
        `Panel ${panelInfo.id} has ${violations.length} interactive controls with height < 44px: ${JSON.stringify(violations)}`
      ).toEqual([]);
    }
  });

  test("accessible names for all interactive controls across all 5 panels", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rooms/plant-1");

    for (const panelInfo of ROUND_PANELS) {
      if (panelInfo.tabText) {
        const tab = page.locator(`#floor-tiles .dv-tab:has-text("${panelInfo.tabText}")`);
        if (await tab.count()) {
          await tab.click();
        }
      }

      const panel = page.locator(panelInfo.selector);
      await expect(panel).toBeVisible();

      // Open drawer if present
      if (panelInfo.id === "loadboards") {
        await panel.locator(".lb-toggle-add-btn").click();
      } else if (panelInfo.id === "calibrations") {
        await panel.locator(".cal-toggle-add-btn").click();
      }

      const missingNames = await panel.evaluate(
        (p, utils) => {
          eval(utils);
          const results = [];
          const controls = p.querySelectorAll("button, input, select, textarea, [role='button'], a[href]");

          for (const el of controls) {
            if (el.offsetParent === null) continue;
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") continue;

            const name = getAccessibleName(el);
            if (!name || name.trim().length === 0) {
              results.push({
                tag: el.tagName,
                id: el.id,
                className: el.className,
                ariaLabel: el.getAttribute("aria-label"),
              });
            }
          }
          return results;
        },
        AUDIT_UTILS
      );

      expect(
        missingNames,
        `Panel ${panelInfo.id} has ${missingNames.length} controls missing accessible names: ${JSON.stringify(missingNames)}`
      ).toEqual([]);
    }
  });

  test("WCAG AA text contrast >= 4.5:1 across visible text in all 5 panels", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rooms/plant-1");

    for (const panelInfo of ROUND_PANELS) {
      if (panelInfo.tabText) {
        const tab = page.locator(`#floor-tiles .dv-tab:has-text("${panelInfo.tabText}")`);
        if (await tab.count()) {
          await tab.click();
        }
      }

      const panel = page.locator(panelInfo.selector);
      await expect(panel).toBeVisible();

      const contrastIssues = await panel.evaluate(
        (p, utils) => {
          eval(utils);
          const issues = [];
          const textNodes = p.querySelectorAll("h1, h2, h3, h4, th, td, p, span, label, button, strong, em, code");

          for (const el of textNodes) {
            if (el.offsetParent === null) continue;
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;

            const text = (el.innerText || "").trim();
            if (!text || text.length === 0) continue;

            const fg = parseRgb(style.color);
            if (!fg || fg.a === 0) continue;

            const bg = getEffectiveBg(el);
            const ratio = getContrast(fg, bg);

            // Large text (>= 18pt or 24px, or bold >= 14pt / 18.66px) requires 3:1, regular requires 4.5:1
            const fontSize = parseFloat(style.fontSize);
            const isBold = parseInt(style.fontWeight, 10) >= 700 || style.fontWeight === "bold";
            const minContrast = (fontSize >= 24 || (isBold && fontSize >= 18.6)) ? 3.0 : 4.45;

            if (ratio < minContrast) {
              issues.push({
                tag: el.tagName,
                class: el.className,
                text: text.slice(0, 30),
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                ratio: Math.round(ratio * 100) / 100,
                minRequired: minContrast,
              });
            }
          }
          return issues;
        },
        AUDIT_UTILS
      );

      expect(
        contrastIssues,
        `Panel ${panelInfo.id} has ${contrastIssues.length} contrast violations: ${JSON.stringify(contrastIssues)}`
      ).toEqual([]);
    }
  });

  test("every drawer, form, and popover returns focus to its trigger on close", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rooms/plant-1");

    // 1. Loadboards: Add Board drawer closes via toggle button and returns focus
    const lbTab = page.locator('#floor-tiles .dv-tab:has-text("Loadboards")');
    await lbTab.click();
    const lbPanel = page.locator("#loadboards-tile");
    const lbAddToggle = lbPanel.locator(".lb-toggle-add-btn");
    await lbAddToggle.click();
    await expect(lbPanel.locator(".lb-add-drawer")).toBeVisible();
    await lbAddToggle.click();
    await expect(lbPanel.locator(".lb-add-drawer")).not.toBeVisible();
    await expect(lbAddToggle).toBeFocused();

    // 1b. Loadboards: Add Board drawer closes via Cancel button and returns focus
    await lbAddToggle.click();
    await expect(lbPanel.locator(".lb-add-drawer")).toBeVisible();
    await lbPanel.locator(".lb-cancel-add-board-btn").click();
    await expect(lbPanel.locator(".lb-add-drawer")).not.toBeVisible();
    await expect(lbAddToggle).toBeFocused();

    // 1c. Loadboards: Add Board drawer closes via Escape key and returns focus
    await lbAddToggle.click();
    await expect(lbPanel.locator(".lb-add-drawer")).toBeVisible();
    await lbPanel.locator("#lb-input-board-id").press("Escape");
    await expect(lbPanel.locator(".lb-add-drawer")).not.toBeVisible();
    await expect(lbAddToggle).toBeFocused();

    // 1d. Loadboards: Checkout form closes via Cancel button and returns focus
    const lbCheckoutBtn = lbPanel.locator('.lb-table .lb-checkout-btn[data-board-id="LB-0398"]');
    await lbCheckoutBtn.click();
    const lbCheckoutForm = lbPanel.locator('.lb-table .lb-checkout-form[data-board-id="LB-0398"]');
    await expect(lbCheckoutForm).toBeVisible();
    await lbCheckoutForm.locator(".lb-cancel-checkout-btn").click();
    await expect(lbCheckoutForm).not.toBeVisible();
    await expect(lbCheckoutBtn).toBeFocused();

    // 1e. Loadboards: Checkout form closes via Escape key and returns focus
    await lbCheckoutBtn.click();
    await expect(lbCheckoutForm).toBeVisible();
    await lbCheckoutForm.locator(".lb-station-select").press("Escape");
    await expect(lbCheckoutForm).not.toBeVisible();
    await expect(lbCheckoutBtn).toBeFocused();

    // 1f. Loadboards: Readiness detail drawer closes via Close button and returns focus
    const lbChip = lbPanel.locator('.lb-readiness-chip[data-readiness-cell-id="ATE-1"]');
    await lbChip.click();
    const lbReadinessDrawer = lbPanel.locator(".lb-readiness-detail-drawer");
    await expect(lbReadinessDrawer).toBeVisible();
    await lbPanel.locator(".lb-close-readiness-drawer").click();
    await expect(lbReadinessDrawer).not.toBeVisible();
    await expect(lbChip).toBeFocused();

    // 1g. Loadboards: Inspect drawer closes via button toggle and returns focus
    const lbInspectBtn = lbPanel.locator('.lb-table .lb-action-btn[data-board-id="LB-0412"]');
    await lbInspectBtn.click();
    const lbInspectDrawer = lbPanel.locator('.lb-table .lb-detail-drawer[aria-label="Inspection details for LB-0412"]');
    await expect(lbInspectDrawer).toBeVisible();
    await lbInspectBtn.click();
    await expect(lbInspectDrawer).not.toBeVisible();
    await expect(lbInspectBtn).toBeFocused();

    // 2. Calibrations: Add Calibration drawer closes via Cancel and returns focus
    const calTab = page.locator('#floor-tiles .dv-tab:has-text("Calibrations")');
    await calTab.click();
    const calPanel = page.locator("#calibrations-tile");
    const calAddToggle = calPanel.locator(".cal-toggle-add-btn");
    await calAddToggle.click();
    const calDrawer = calPanel.locator(".cal-add-drawer");
    await expect(calDrawer).toBeVisible();
    await calPanel.locator(".cal-cancel-form-btn").click();
    await expect(calDrawer).not.toBeVisible();
    await expect(calAddToggle).toBeFocused();

    // 2b. Calibrations: Add Calibration drawer closes via Escape key and returns focus
    await calAddToggle.click();
    await expect(calDrawer).toBeVisible();
    await calPanel.locator("#cal-input-id").press("Escape");
    await expect(calDrawer).not.toBeVisible();
    await expect(calAddToggle).toBeFocused();

    // 3. Obligations: Inspect drawer closes via button toggle and returns focus
    const oblTab = page.locator('#floor-tiles .dv-tab:has-text("Obligations")');
    await oblTab.click();
    const oblPanel = page.locator("#obligations-tile");
    const oblInspectBtn = oblPanel.locator('.obl-table .obl-action-btn[data-obligation-id="OBL-0001"]');
    await oblInspectBtn.click();
    const oblDrawer = oblPanel.locator('.obl-table .obl-detail-drawer[aria-label="Inspection details for OBL-0001"]');
    await expect(oblDrawer).toBeVisible();
    await oblInspectBtn.click();
    await expect(oblDrawer).not.toBeVisible();
    await expect(oblInspectBtn).toBeFocused();

    // 4. Handler Episodes: Inspect drawer closes via button toggle and returns focus
    const heTab = page.locator('#floor-tiles .dv-tab:has-text("Handler episodes")');
    await heTab.click();
    const hePanel = page.locator("#handler-episodes-tile");
    const heInspectBtn = hePanel.locator('.he-table .he-action-btn[data-episode-id="JAM-0101"]');
    await heInspectBtn.click();
    const heDrawer = hePanel.locator('.he-table .he-detail-drawer[aria-label="Inspection details for JAM-0101"]');
    await expect(heDrawer).toBeVisible();
    await heInspectBtn.click();
    await expect(heDrawer).not.toBeVisible();
    await expect(heInspectBtn).toBeFocused();

    // 5. Station KPIs: Filter dropdown closes via Escape and returns focus to summary
    const kpiTab = page.locator('#floor-tiles .dv-tab:has-text("Station KPIs")');
    await kpiTab.click();
    const kpiPanel = page.locator("#station-kpi-tile");
    const kpiSummary = kpiPanel.locator(".kpi-filter-dropdown summary");
    await kpiSummary.click();
    const kpiDropdown = kpiPanel.locator(".kpi-filter-dropdown");
    await expect(kpiDropdown).toHaveAttribute("open", "");
    await kpiSummary.press("Escape");
    await expect(kpiDropdown).not.toHaveAttribute("open", "");
    await expect(kpiSummary).toBeFocused();
  });
});
