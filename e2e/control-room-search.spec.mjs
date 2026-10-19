import { expect, test } from "@playwright/test";

test("Live Control Room search finds public entities and preserves context appropriately", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);

  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Search current operational state" });
  await expect(input).toBeFocused();
  await expect(page.getByText("Up to 5 matches per category", { exact: false })).toBeVisible();
  await input.fill("ISS-103");
  await expect(page.locator('[data-search-result-type="ISSUE"][data-search-result-id="ISS-103"]')).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#issue-summary")).toContainText("ISS-103");
  await expect(page.locator('[data-focus-id="EQ-03"]')).toHaveClass(/focused/);

  // An equipment selection focuses the map but leaves the selected event/audit
  // intact, so operators do not lose their current investigation.
  await page.locator('[data-feed-event-id="event-002"]').click();
  await expect(page.locator("#recommendation-panel")).toContainText("Full issue chronology");
  await page.keyboard.press("/");
  await input.fill("EQ-03");
  await page.locator('[data-search-result-type="EQUIPMENT"][data-search-result-id="EQ-03"]').click();
  await expect(page.locator("#recommendation-panel")).toContainText("Full issue chronology");
  await expect(page.locator('[data-focus-id="EQ-03"]')).toHaveClass(/focused/);
});

test("Control Room search keeps typing through polling and returns focus on Escape", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Find in Control Room" }).click();
  const input = page.getByRole("combobox", { name: "Search current operational state" });
  await input.fill("Engr");
  await page.waitForTimeout(2_000);
  await expect(input).toHaveValue("Engr");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Find an issue/ })).toBeHidden();
  await expect(page.getByRole("button", { name: "Find in Control Room" })).toBeFocused();
});
