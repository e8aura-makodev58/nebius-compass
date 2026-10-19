import { expect, test } from "@playwright/test";

/**
 * Coverage for the event feed as a navigable audit trail.
 *
 * Every issue-bearing feed entry reopens that issue's full record: the Compass
 * analysis and ranked evidence, the offer sequence with its acceptances and
 * rejections, any control-center override, and the resolution outcome with the
 * action that was taken. The panel must survive the 1.5s poll tick, and it must
 * remain reachable for issues that have already left the active list.
 *
 * Playwright runs with forced provider failures, so this suite is deterministic,
 * API-free, and safe to repeat without paid model calls.
 */

const TWO_POLL_TICKS_MS = 3_500;

test("Live: two events for one issue show distinct event detail above one chronology", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await expect(page.locator(".issue-card")).toHaveCount(2);
  await expect(page.locator(".event-feed")).toContainText("Issue Raised");

  const raised = page.locator('[data-feed-event-id="event-002"]');
  const assigned = page.locator('[data-feed-event-id="event-003"]');
  await raised.click();

  const panel = page.locator("#recommendation-panel");
  const summary = page.locator("#issue-summary");
  await expect(summary).toContainText("Issue Raised");
  await expect(summary).toContainText("Process-output drift detected");
  await expect(panel).toContainText("Full issue chronology · ISS-103");
  await expect(panel).toContainText("Dispatch outcome");
  await expect(panel).toContainText("Compass analysis");
  await expect(panel).toContainText("Response and resolution");
  // The planner note remains readable and distinct from applied catalog fixes.
  await expect(panel).toContainText(/Incident note:\s*\S+/);

  await assigned.click();
  await expect(summary).toContainText("Responder Assigned");
  await expect(summary).toContainText("Optr142");
  await expect(summary).not.toContainText("Process-output drift detected");
  await expect(panel).toContainText("Full issue chronology · ISS-103");

  // The audit trail must not be torn down by the polling re-render.
  await page.waitForTimeout(TWO_POLL_TICKS_MS);
  await expect(summary).toContainText("Responder Assigned");
  await expect(summary).toContainText("Optr142");
  await expect(page.locator('[data-feed-event-id="event-003"]')).toHaveAttribute("aria-current", "true");
  await expect(panel).toContainText("Full issue chronology · ISS-103");

  // Selecting an active issue exits event-detail mode and restores live dispatch.
  await page.locator("#issue-list").getByRole("button", { name: /ISS-103/ }).click();
  await expect(panel).not.toContainText("Full issue chronology");

  // Reopen the event, mutate the issue lifecycle, and prove the open chronology
  // refreshes without changing which historical event is selected.
  await page.locator('[data-feed-event-id="event-003"]').click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Demo", exact: true }).click();
  await page.getByRole("button", { name: "Force Resolve" }).click();
  await page.getByRole("button", { name: "Live Floor" }).click();
  await expect(summary).toContainText("Responder Assigned");
  await expect(panel).toContainText(/Resolved|Attempt unsuccessful/);

  await page.getByRole("button", { name: "Return to current view" }).click();
  await expect(panel).not.toContainText("Full issue chronology");
});

test("Live: system events are selectable without an issue audit request", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);

  await page.locator('[data-feed-event-id="event-001"]').click();
  await expect(page.locator("#issue-summary")).toContainText("Simulation Started");
  await expect(page.locator("#issue-summary")).toContainText("persistent simulation started");
  await expect(page.locator("#recommendation-panel")).toContainText("not attached to an issue chronology");
  await expect(page.locator('[data-feed-event-id="event-001"]')).toHaveAttribute("aria-current", "true");
});

test("Live: a delayed older audit response cannot overwrite the newer event selection", async ({ page }) => {
  let auditCalls = 0;
  await page.route("**/api/issues/ISS-103/audit", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    auditCalls += 1;
    if (auditCalls === 1) {
      const staleAssignment = body.operationalEvents.find((event) => event.id === "event-003");
      staleAssignment.responderId = "R-ENGR104";
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    await route.fulfill({ response, json: body });
  });

  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await page.locator('[data-feed-event-id="event-002"]').click();
  await page.locator('[data-feed-event-id="event-003"]').click();

  const summary = page.locator("#issue-summary");
  await expect(summary).toContainText("Responder Assigned");
  await expect(summary).toContainText("Optr142");
  await page.waitForTimeout(900);
  await expect(summary).toContainText("Optr142");
  await expect(summary).not.toContainText("Engr104");
});

test("Live: a resolved issue stays reachable through its feed event", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await expect(page.locator(".issue-card")).toHaveCount(2);

  await page.locator("#issue-list").getByRole("button", { name: /ISS-103/ }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Demo", exact: true }).click();
  await expect(page.locator("#demo-selected-issue")).toContainText("ISS-103 is assigned");
  await page.getByRole("button", { name: "Force Resolve" }).click();
  await page.getByRole("button", { name: "Live Floor" }).click();
  await expect(page.locator(".event-feed")).toContainText(/Issue (Resolved|Reopened)/);

  // A resolved issue leaves the active issue list, so the feed is the only way back to it.
  const outcomeEntry = page.locator(".event-feed .feed-event", { hasText: /Issue (Resolved|Reopened)/ }).first();
  await outcomeEntry.click();

  const panel = page.locator("#recommendation-panel");
  await expect(panel).toContainText("Full issue chronology");
  await expect(panel).toContainText("Action taken:");
  await expect(panel).toContainText(/Resolved|Attempt unsuccessful/);
});
