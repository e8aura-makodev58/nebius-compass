import { expect, test } from "@playwright/test";

async function openStations(page) {
  await page.getByRole("tab", { name: "Stations", exact: true }).click();
}

test("Live: an active station exposes its current issue in station history", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await openStations(page);

  await page.locator("#station-list [data-station-id='EQ-03']").click();
  await expect(page.locator("#issue-summary")).toContainText("ISS-103");
  await expect(page.locator(".station-issue-history")).toContainText("Observed issues");
  await expect(page.locator("[data-station-history-issue-id='ISS-103']")).toBeVisible();

  // Current issues retain the normal assignment/dispatch panel rather than
  // opening a historical audit request.
  await page.locator("[data-station-history-issue-id='ISS-103']").click();
  await expect(page.locator("#recommendation-panel")).not.toContainText("Station issue chronology");
  await expect(page.locator("#issue-summary")).toContainText("ISS-103");
});

test("Live: a healthy station opens a resolved record on demand and returns to station status", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  // perform() ignores clicks and Reset clears selection while it is in flight; wait for it.
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await page.locator("#issue-list").getByRole("button", { name: /ISS-103/ }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Demo", exact: true }).click();
  const forceResolve = page.getByRole("button", { name: "Force Resolve" });
  await expect(forceResolve).toBeEnabled({ timeout: 15_000 });
  await forceResolve.click();
  await page.getByRole("button", { name: "Live Floor" }).click();

  await openStations(page);
  const healthy = page.locator("#station-list .healthy-stations");
  await healthy.locator("summary").click();
  await healthy.locator("[data-station-id='EQ-03']").click();
  await expect(page.locator("#issue-summary")).toContainText("Observed issues");
  await expect(page.locator("[data-station-history-issue-id='ISS-103']")).toBeVisible();

  await page.locator("[data-station-history-issue-id='ISS-103']").click();
  await expect(page.locator("#recommendation-panel")).toContainText("Station issue chronology · ISS-103");
  await expect(page.getByRole("button", { name: "Return to Station Status" })).toBeVisible();
  await page.getByRole("button", { name: "Return to Station Status" }).click();
  await expect(page.locator("#issue-summary")).toContainText("Observed issues");
  await expect(page.locator("#recommendation-panel")).not.toContainText("Station issue chronology");
});

test("Live: stations without records show an empty history and the event feed remains independent", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await openStations(page);
  const healthy = page.locator("#station-list .healthy-stations");
  await healthy.locator("summary").click();
  await healthy.locator("[data-station-id='EQ-01']").click();
  await expect(page.locator(".station-issue-history")).toContainText("Observed issues (0)");
  await expect(page.locator(".station-issue-history")).toContainText("No issues have been recorded for this station.");

  await page.locator("[data-feed-event-id='event-002']").click();
  await expect(page.locator("#recommendation-panel")).toContainText("Full issue chronology · ISS-103");
  await expect(page.locator("[data-feed-event-id='event-002']")).toHaveAttribute("aria-current", "true");
});

test("Live: archived station issues remain accessible outside the polled snapshot", async ({ page }) => {
  const issue = { id: "ISS-ARCHIVED", equipmentId: "EQ-01", issueClass: "A", status: "RESOLVED", raisedAt: "2026-08-01T08:00:00Z", resolvedAt: "2026-08-01T08:10:00Z", description: "Archived station observation", responseAction: "Verified stable operation." };
  await page.route("**/api/control-rooms/*/equipment/EQ-01/issues", (route) => route.fulfill({ json: { issues: [issue], next: null } }));
  await page.route("**/api/control-rooms/*/issues/ISS-ARCHIVED/audit", (route) => route.fulfill({ json: {
    issue, equipment: { id: "EQ-01", name: "Station 1" }, recommendations: [], dispatchOffers: [], assignments: [], resolutionAttempts: [], resolutionHistory: [], operationalEvents: [],
  } }));
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await openStations(page);
  const healthy = page.locator("#station-list .healthy-stations");
  await healthy.locator("summary").click();
  await healthy.locator("[data-station-id='EQ-01']").click();
  await page.locator("[data-station-history-issue-id='ISS-ARCHIVED']").click();
  await expect(page.locator("#recommendation-panel")).toContainText("Station issue chronology · ISS-ARCHIVED");
  await expect(page.locator("#issue-summary")).toContainText("Archived station observation");
  await page.getByRole("button", { name: "Return to Station Status", exact: true }).click();
  await expect(page.locator(".station-issue-history")).toContainText("ISS-ARCHIVED");
});
