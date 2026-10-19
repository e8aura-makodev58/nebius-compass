import { expect, test } from "@playwright/test";

/**
 * Regression coverage for the override dropdown, which previously had none.
 *
 * The control room re-renders on a 1.5s timer. Before the render-lifecycle
 * fix, that tick reassigned the panel's innerHTML unconditionally, destroying
 * the <select> mid-interaction: the operator's choice reverted to empty and the
 * confirm button went back to disabled. The window was 0-1500ms, so the bug was
 * intermittent rather than total, which is exactly why it needs a timed test.
 *
 * Playwright runs with forced provider failures, so this regression suite is
 * deterministic, API-free, and safe to repeat without paid model calls.
 */

const TWO_POLL_TICKS_MS = 3_500;

test("Offline: an override selection survives repeated poll ticks and still assigns", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Offline Demo" }).click();
  await page.getByRole("button", { name: "Reset Offline" }).click();
  await page.getByRole("button", { name: "Raise Scenario A issue" }).click();
  await expect(page.locator("#recommendation-panel")).toContainText("Offer sent to Engr028");

  const select = page.locator("#offline-override-select");
  const override = page.locator("#offline-override-button");
  await expect(override).toBeDisabled();

  // Offline excludes the recommended responder from the override list, so any
  // available option is someone other than Engr028.
  const chosen = await select.locator('option:not([value=""])').first().getAttribute("value");
  await select.selectOption(chosen);
  await expect(override).toBeEnabled();

  // The actual regression: sit idle across at least two poll ticks.
  await page.waitForTimeout(TWO_POLL_TICKS_MS);
  await expect(select).toHaveValue(chosen);
  await expect(override).toBeEnabled();

  await override.click();
  await expect(page.locator("#recommendation-panel")).toContainText("assigned");
  // The override must assign the chosen responder, not the recommendation.
  await expect(page.locator("#recommendation-panel")).not.toContainText("Engr028 assigned");
});

test("Offline: the fixture responder accepts asynchronously without operator confirmation", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Offline Demo" }).click();
  await page.getByRole("button", { name: "Reset Offline" }).click();
  await page.getByRole("button", { name: "Raise Scenario A issue" }).click();
  await expect(page.locator("#recommendation-panel")).toContainText("Offer sent to Engr028");
  await expect(page.locator("#recommendation-panel")).toContainText("Engr028 assigned", { timeout: 10_000 });
});

test("Live: an override selection is stable across poll ticks", async ({ page }) => {
  // Forced provider failure exercises deterministic fallback matching without
  // any external request or dependency on model output.
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Live Simulation" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  // perform() ignores clicks while another room action is in flight; wait for Reset to land.
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await page.locator("#pause-resume-button").click();
  await expect(page.locator("#pause-resume-button")).toHaveText("Pause");
  await page.getByRole("button", { name: /ISS-10/ }).first().click();
  await expect(page.locator("#recommendation-panel")).toContainText("Offer sent to", { timeout: 60_000 });

  const select = page.locator("#live-override-select");
  const override = page.locator("#live-override-button");
  const chosen = await select.locator('option:not([value=""])').first().getAttribute("value");
  await select.selectOption(chosen);
  await expect(override).toBeEnabled();

  await page.waitForTimeout(TWO_POLL_TICKS_MS);
  await expect(select).toHaveValue(chosen);
  await expect(override).toBeEnabled();
});
