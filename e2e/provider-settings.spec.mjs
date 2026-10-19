import { expect, test } from "@playwright/test";

/**
 * Read-only coverage for the Settings tab's provider section.
 *
 * Deliberately does not click "Refresh available models" (a real network call
 * to the model provider, forbidden in this hermetic suite) or "Save settings"
 * (persists to backend/data/provider-settings.json, which this repo's
 * provider-settings service resolves to the same on-disk file the operator's
 * real deployment uses — this file has no per-test isolation, unlike the
 * simulation state, so a save here would silently rewrite production config).
 */

test("Settings offers Nebius (default) and AMD Token Factory, with a write-only key field, four role pickers and no outbound call", async ({ page }) => {
  const requestsToProviders = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http://127.0.0.1")) requestsToProviders.push(url);
  });

  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Settings" }).click();

  const providerSelect = page.locator("#settings-provider");
  const apiKeyInput = page.locator("#settings-api-key");
  await expect(providerSelect).toBeVisible();
  await expect(apiKeyInput).toHaveAttribute("type", "password");
  await expect(apiKeyInput).toHaveValue("");
  for (const name of ["Ranking (Compass)", "Event planner", "Investigator", "Narrator"]) {
    const picker = page.getByRole("group", { name, exact: true });
    await expect(picker.getByLabel("Model", { exact: true })).toBeVisible();
    await expect(picker.getByLabel("Thinking level", { exact: true })).toBeVisible();
    await expect(picker.getByLabel("Timeout (milliseconds)", { exact: true })).toBeVisible();
    await expect(picker.getByRole("status")).toBeVisible();
  }

  const optionTexts = await providerSelect.locator("option").allTextContents();
  expect(optionTexts.map((text) => text.trim())).toEqual(["AMD Token Factory", "Nebius Token Factory"]);
  await expect(providerSelect).toHaveValue("nebius");
  await expect(page.locator(".settings-card")).toContainText("Nebius Token Factory");
  // Switching provider shows that provider's own saved role selections (no save, no network).
  await providerSelect.selectOption("amd");
  await expect(page.getByRole("group", { name: "Ranking (Compass)", exact: true }).getByLabel("Model", { exact: true })).toHaveValue("MiMo-V2.6-Flash");
  await providerSelect.selectOption("nebius");
  await expect(page.locator(".settings-card")).toContainText("Nebius Token Factory");
  for (const removed of ["OpenAI", "OpenRouter", "GPT-OSS"]) {
    await expect(page.locator(".settings-card")).not.toContainText(removed);
  }

  expect(requestsToProviders).toEqual([]);
});

for (const width of [375, 1280]) {
  test(`independent role pickers save only their own model and fit at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const roles = {
      compass: { modelId: "MiMo-V2.6-Flash", reasoningEffort: "none", modelValidation: { status: "VALID", effectiveModelId: "MiMo-V2.6-Flash" } },
      "event-planner": { modelId: "Retired-Model", reasoningEffort: "default", modelValidation: { status: "MISSING", effectiveModelId: "MiMo-V2.6-Flash" } },
    };
    const snapshot = () => ({
      provider: "amd", modelId: roles.compass.modelId, reasoningEffort: roles.compass.reasoningEffort, roles,
      providers: [{ id: "amd", label: "AMD Token Factory", enabled: true, credentialConfigured: false }],
    });
    const posts = [];
    const outbound = [];
    page.on("request", (request) => { if (new URL(request.url()).origin !== new URL(baseURL).origin) outbound.push(request.url()); });
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        posts.push(input);
        roles[input.role] = { modelId: input.modelId, reasoningEffort: input.reasoningEffort, modelValidation: { status: "VALID", effectiveModelId: input.modelId } };
      }
      await route.fulfill({ json: snapshot() });
    });
    await page.route("**/api/settings/models?*", (route) => route.fulfill({ json: {
      ...snapshot(), modelDiscovery: { status: "READY" }, models: [
        { id: "MiMo-V2.6-Flash", reasoningEfforts: ["default", "none"] },
        { id: "DeepSeek-V4-Flash", reasoningEfforts: ["default", "none", "high"] },
        { id: "GLM-5.3-Flash", reasoningEfforts: ["default", "low", "high"] },
      ],
    } }));
    await page.goto("/rooms/plant-1");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const ranking = page.getByRole("group", { name: "Ranking (Compass)", exact: true });
    const planner = page.getByRole("group", { name: "Event planner", exact: true });
    await expect(planner.getByRole("status")).toContainText("Saved model unavailable");
    await page.getByRole("button", { name: "Refresh available models", exact: true }).click();
    await expect(page.locator("#settings-feedback")).toContainText("Found 3 selectable models");
    await ranking.getByLabel("Model", { exact: true }).selectOption("DeepSeek-V4-Flash");
    await ranking.getByLabel("Thinking level", { exact: true }).selectOption("high");
    await planner.getByLabel("Model", { exact: true }).selectOption("GLM-5.3-Flash");
    await planner.getByLabel("Thinking level", { exact: true }).selectOption("low");
    await ranking.getByRole("button", { name: "Save Ranking (Compass)", exact: true }).click();
    await expect(page.locator("#settings-feedback")).toContainText("Saved Ranking (Compass)");
    await expect(planner.getByLabel("Model", { exact: true })).toHaveValue("GLM-5.3-Flash");
    await expect(planner.getByLabel("Thinking level", { exact: true })).toHaveValue("low");
    await expect(planner.getByRole("status")).toHaveText("Unsaved selection.");
    await planner.getByRole("button", { name: "Save Event planner", exact: true }).click();
    await expect(page.locator("#settings-feedback")).toContainText("Saved Event planner");
    expect(posts).toEqual([
      { provider: "amd", role: "compass", modelId: "DeepSeek-V4-Flash", reasoningEffort: "high" },
      { provider: "amd", role: "event-planner", modelId: "GLM-5.3-Flash", reasoningEffort: "low" },
    ]);
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(ranking.getByLabel("Model", { exact: true })).toHaveValue("DeepSeek-V4-Flash");
    await expect(planner.getByLabel("Model", { exact: true })).toHaveValue("GLM-5.3-Flash");
    for (const picker of [ranking, planner]) await expect(picker.getByRole("status")).toHaveText("Saved model is available.");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.locator(".settings-card").evaluate((card) => card.scrollWidth <= card.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `.cache/amd-codex-roles-${width}.png`, fullPage: true });
    expect(outbound).toEqual([]);
  });
}

test.describe("through the public tunnel", () => {
  // Cloudflare's edge adds this header to every tunnel request; the server makes settings read-only for them.
  test.use({ extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.7" } });

  test("Settings is visible but read-only: a note explains it and every API control is greyed out", async ({ page }) => {
    await page.goto("/rooms/plant-1");
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("note")).toHaveText(/Read-only on the public demo/);
    await expect(page.locator("#settings-provider")).toBeVisible();
    const controls = page.locator("#settings-content").locator("input, select, button");
    expect(await controls.count()).toBeGreaterThan(4);
    for (const control of await controls.all()) await expect(control).toBeDisabled();
    // The room's own controls are untouched.
    await expect(page.locator("#settings-demo-tab")).toBeEnabled();
  });
});
