import { expect, test } from "@playwright/test";

test("Live controls, analytics, and Offline fallback complete without repair", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await expect(page.getByRole("heading", { name: "ResponseCompass", exact: true })).toBeVisible();
  await expect(page.getByText("Persistent environment")).toBeVisible();

  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await expect(page.locator(".issue-card")).toHaveCount(2);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agent activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workforce continuity" })).toBeVisible();
  await expect(page.getByLabel("Scenario preset")).toHaveValue("NORMAL");
  await expect(page.getByText(/caps actionable issues at 10/i)).toBeVisible();
  await page.route("**/api/control-rooms/*/simulation/force-event", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  }, { times: 1 });
  await page.getByRole("button", { name: "Trigger Next Event" }).click();
  await expect(page.locator("#demo-activity-title")).toHaveText("Event workflow running");
  await page.getByRole("button", { name: "Live Floor" }).click();
  await expect(page.locator(".issue-card")).toHaveCount(3);
  await expect(page.locator(".event-feed")).toContainText("Issue Raised");
  await page.locator("#issue-list").getByRole("button", { name: /ISS-105/ }).click();
  // Queue dispatch is deliberately paused after Reset. Resume the shared
  // simulation before expecting the deterministic offer workflow to drain.
  const resume = page.getByRole("button", { name: "Resume", exact: true });
  if (await resume.isVisible()) await resume.click();
  // Browser inference is explicitly forced to fail, so the journey remains
  // deterministic and spends no provider credits.
  await expect(page.locator("#recommendation-panel")).toContainText("Eligible responder evidence");
  await expect(page.locator("#recommendation-panel")).toContainText("Offer sent to");
  // Evidence counts can be fractional confidence weights; they display to one decimal.
  const counts = (await page.locator("#recommendation-panel").innerText()).match(/\(n=[^)]*\)/g) ?? [];
  expect(counts.length).toBeGreaterThan(0);
  for (const count of counts) expect(count).toMatch(/^\(n=\d+(\.\d)?\)$/);

  await page.locator("#issue-list").getByRole("button", { name: /ISS-103/ }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Demo", exact: true }).click();
  await expect(page.locator("#demo-selected-issue")).toContainText("ISS-103 is assigned");
  await page.getByRole("button", { name: "Force Resolve" }).click();
  await page.getByRole("button", { name: "Live Floor" }).click();
  await expect(page.locator(".event-feed")).toContainText(/Issue (Resolved|Reopened)/);

  await page.getByRole("button", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Compass vs Baselines" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Issue lifecycle and equipment downtime" })).toBeVisible();
  await expect(page.getByText("Chart periods use recorded simulated activity")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Day" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Issues raised", { exact: true })).toBeVisible();
  await expect(page.getByText("Issues resolved", { exact: true })).toBeVisible();
  await expect(page.getByText("Aggregate downtime", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Hour" }).click();
  await expect(page.getByText("past 12 hours")).toBeVisible();
  await page.getByRole("tab", { name: "Week" }).click();
  await expect(page.getByText("past 4 weeks", { exact: false })).toBeVisible();
  // Rate denominators can be fractional evidence weights; they display to one decimal.
  for (const count of (await page.locator("#analytics-content").innerText()).match(/\(n=[^)]*\)/g) ?? []) {
    expect(count).toMatch(/^\(n=\d+(\.\d)?\)$/);
  }
  await page.getByRole("button", { name: "All equipment" }).click();
  await expect(page.locator(".equipment-directory-row")).toHaveCount(12);
  await page.getByLabel("Search equipment").fill("Station 3");
  await page.locator("[data-analytics-equipment='EQ-03']").click();
  await expect(page.getByRole("heading", { name: "Station 3" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Issue-Class Experience" })).toBeVisible();
  await expect(page.getByText("not an employee ranking")).toBeVisible();

  await page.getByRole("button", { name: "Live Floor" }).click();
  await page.getByRole("button", { name: "Offline Demo" }).click();
  await expect(page.getByText(/fixed Scenario A fixture/)).toBeVisible();
  await page.getByRole("button", { name: "Reset Offline" }).click();
  await page.getByRole("button", { name: "Raise Scenario A issue" }).click();
  await expect(page.locator("#baseline-panel")).toContainText("Engr104");
  await expect(page.locator("#baseline-panel")).toContainText("Tech216");
  await expect(page.locator("#recommendation-panel")).toContainText("Offer sent to Engr028");
  await expect(page.locator("#recommendation-panel")).toContainText("Engr028 assigned", { timeout: 10_000 });
  await expect(page.locator("#recommendation-panel")).toContainText("2 of 2 responders", { timeout: 12_000 });
  await expect(page.locator("#recommendation-panel")).toContainText("Support");
});
