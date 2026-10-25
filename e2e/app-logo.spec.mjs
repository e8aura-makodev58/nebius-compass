import { expect, test } from "@playwright/test";

// The supplied logo and favicon live in frontend/icons. The picker shows the logo; the tab requests the icon.
test("the room picker shows the supplied logo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const logo = page.locator(".room-picker-logo");
  await expect(logo).toHaveAttribute("src", /\/icons\/Compass_application_logo_icon_20261025201828\.jpg$/);
  await expect.poll(() => logo.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
});

test("the browser tab requests the supplied favicon", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/icons/Compass_application_logo_icon.ico");
  const status = await page.evaluate(async () => (await fetch("/icons/Compass_application_logo_icon.ico")).headers.get("content-type"));
  expect(status).toBe("image/x-icon");
});
