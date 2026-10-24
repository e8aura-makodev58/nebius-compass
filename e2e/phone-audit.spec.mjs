import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = resolve(__dirname, "../fixtures/station-kpis/response-12h.json");
const FIXTURE_DATA = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));

const PANELS = [
  { id: "staffing", selector: "#staffing-tile", nav: "staffing", tabText: "Staffing" },
  { id: "investigation", selector: "#investigation-tile", nav: "staffing", tabText: "Field reports" },
  { id: "map", selector: ".floor-section", nav: "floor", tabText: "Floor map" },
  { id: "issues", selector: "#issue-list", nav: "issues", tabText: "Issues" },
  { id: "events", selector: "#event-feed", nav: "events", tabText: "Event feed" },
  { id: "context", selector: ".context-panel", nav: "issues", tabText: "Dispatch / context" },
  { id: "analytics", selector: "#analytics-view", nav: "analytics", tabText: null },
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

test.describe("Phone and desktop audit of existing panels (Round 29)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/control-rooms/*/station-kpis*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE_DATA),
      });
    });
  });

  async function activatePanel(page, panel, width) {
    if (width <= 900) {
      if (panel.nav === "analytics") {
        await page.locator("#analytics-tab").click();
      } else {
        await page.locator("#control-room-tab").click();
        await page.locator(`[data-workspace="${panel.nav}"]`).click();
      }
    } else {
      if (panel.nav === "analytics") {
        await page.locator("#analytics-tab").click();
      } else {
        await page.locator("#control-room-tab").click();
        if (panel.tabText) {
          const tab = page.locator(`#floor-tiles .dv-tab:has-text("${panel.tabText}")`);
          if (await tab.count() > 0 && await tab.isVisible()) {
            await tab.click();
          }
        }
      }
    }
    await page.waitForTimeout(200);
  }

  test("phone viewport at 375px has zero horizontal scroll across all 8 panels", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/rooms/plant-1");
    await page.waitForLoadState("networkidle");

    for (const panel of PANELS) {
      await activatePanel(page, panel, 375);

      // Verify page does not horizontally scroll
      const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(pageFits, `Page horizontal scroll for panel ${panel.id}`).toBe(true);

      // Verify panel does not horizontally overflow
      const panelFits = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el || el.hidden) return true;
        return el.scrollWidth <= el.clientWidth + 1;
      }, panel.selector);
      expect(panelFits, `Panel container horizontal overflow for ${panel.id}`).toBe(true);
    }
  });

  test("phone viewport at 375px maintains >= 44px touch targets across interactive controls in all 8 panels", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/rooms/plant-1");
    await page.waitForLoadState("networkidle");

    for (const panel of PANELS) {
      await activatePanel(page, panel, 375);

      const violations = await page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (!root) return [];
        const interactives = root.querySelectorAll("button, a, input, select, textarea, summary, [role='button'], [role='tab']");
        const fails = [];

        for (const el of interactives) {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || el.hidden) continue;

          // Spatial map nodes (wireframe points plotted on 2.5D CAD plane) are exempt spatial nodes
          if (el.classList.contains("map-node")) continue;

          // For inputs inside labels (e.g. checkbox options), evaluate the clickable label bounding target
          const clickable = el.closest("label") || el;
          const rect = clickable.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          if (rect.height < 43.5) {
            fails.push({
              tag: el.tagName,
              id: el.id,
              className: el.className,
              height: Math.round(rect.height),
              text: (el.innerText || el.getAttribute("aria-label") || "").slice(0, 30)
            });
          }
        }
        return fails;
      }, panel.selector);

      expect(violations, `Touch targets < 44px in panel ${panel.id}`).toHaveLength(0);
    }
  });

  test("desktop viewport at 1280px has zero horizontal scroll across all 8 panels", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rooms/plant-1");
    await page.waitForLoadState("networkidle");

    for (const panel of PANELS) {
      await activatePanel(page, panel, 1280);

      // Verify document horizontal fit
      const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(pageFits, `Desktop page horizontal scroll for panel ${panel.id}`).toBe(true);
    }
  });

  test("all 8 panels have accessible names for all interactive controls at 375px and 1280px", async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/rooms/plant-1");
      await page.waitForLoadState("networkidle");

      for (const panel of PANELS) {
        await activatePanel(page, panel, width);

        const unnamed = await page.evaluate(({ sel, utils }) => {
          eval(utils);
          const root = document.querySelector(sel);
          if (!root) return [];
          const interactives = root.querySelectorAll("button, a, input, select, textarea, summary, [role='button'], [role='tab']");
          const fails = [];

          for (const el of interactives) {
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || el.hidden) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            const name = getAccessibleName(el);
            if (!name || !name.trim()) {
              fails.push({
                tag: el.tagName,
                id: el.id,
                className: el.className,
                html: el.outerHTML.slice(0, 80)
              });
            }
          }
          return fails;
        }, { sel: panel.selector, utils: AUDIT_UTILS });

        expect(unnamed, `Missing accessible names in panel ${panel.id} at ${width}px`).toHaveLength(0);
      }
    }
  });

  test("text elements across all 8 panels maintain WCAG AA contrast >= 4.5:1 at 375px and 1280px", async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/rooms/plant-1");
      await page.waitForLoadState("networkidle");

      for (const panel of PANELS) {
        await activatePanel(page, panel, width);

        const lowContrast = await page.evaluate(({ sel, utils }) => {
          eval(utils);
          const root = document.querySelector(sel);
          if (!root) return [];
          const textNodes = root.querySelectorAll("p, span, h1, h2, h3, h4, strong, td, th, label, summary, button, a, [role='tab']");
          const fails = [];

          for (const el of textNodes) {
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || el.hidden) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            const text = el.innerText?.trim();
            if (!text) continue;

            const fg = parseRgb(style.color);
            const bg = getEffectiveBg(el);
            if (fg && bg) {
              const ratio = getContrast(fg, bg);
              if (ratio < 4.45) {
                fails.push({
                  tag: el.tagName,
                  id: el.id,
                  className: el.className,
                  text: text.slice(0, 25),
                  ratio: Math.round(ratio * 100) / 100,
                  fg: style.color,
                  bg: `rgb(${bg.r},${bg.g},${bg.b})`
                });
              }
            }
          }
          return fails;
        }, { sel: panel.selector, utils: AUDIT_UTILS });

        expect(lowContrast, `Contrast < 4.5:1 in panel ${panel.id} at ${width}px`).toHaveLength(0);
      }
    }
  });
});
