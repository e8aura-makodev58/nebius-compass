import { expect, test } from "@playwright/test";

// The compass mark is the app's own artwork (frontend/icons). It must load in the header and the room picker.
test("the header shows the compass mark beside the ResponseCompass heading", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/rooms/plant-1");
  const logo = page.locator(".topbar h1 img.app-logo");
  await expect(logo).toHaveAttribute("src", /\/icons\/compass-mark\.svg$/);
  await expect.poll(() => logo.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".topbar h1")).toHaveText("ResponseCompass");
});

test("the browser tab advertises the mark as its icon and the manifest is linked", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/icons/compass-mark.svg");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/icons/manifest.webmanifest");
});
