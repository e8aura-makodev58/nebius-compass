import { expect, test } from "@playwright/test";

const options = (page) => page.locator("#speed-select option").evaluateAll((rows) => rows.map((row) => ({ label: row.textContent, disabled: row.disabled })));

test("the speed menu offers only the recommended live speeds", async ({ page }) => {
  await page.request.post("/api/control-rooms/plant-1/simulation/speed", { data: { speed: 1 } });
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#speed-select")).toHaveValue("1");
  expect(await options(page)).toEqual([{ label: "1×", disabled: false }, { label: "5×", disabled: false }]);
});

test("a room already above the recommended speed shows it until the operator lowers it", async ({ page }) => {
  await page.request.post("/api/control-rooms/plant-1/simulation/speed", { data: { speed: 60 } });
  try {
    await page.goto("/rooms/plant-1");
    await expect(page.locator("#speed-select")).toHaveValue("60");
    expect(await options(page)).toEqual([{ label: "1×", disabled: false }, { label: "5×", disabled: false }, { label: "60× (above recommended)", disabled: true }]);
    await page.locator("#speed-select").selectOption("5");
    await expect(page.locator("#speed-select")).toHaveValue("5");
    // The menu is redrawn from the next state after the speed change lands.
    await expect.poll(() => options(page)).toEqual([{ label: "1×", disabled: false }, { label: "5×", disabled: false }]);
  } finally {
    await page.request.post("/api/control-rooms/plant-1/simulation/speed", { data: { speed: 1 } });
  }
});
