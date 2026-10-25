import { expect, test } from "@playwright/test";

test.describe("Guest workplace login and UI (Round 46)", () => {
  test("login form shown when signed out, with labelled inputs and zero outbound requests", async ({ page, baseURL }) => {
    const outbound = [];
    page.on("request", (req) => {
      if (new URL(req.url()).origin !== new URL(baseURL).origin) outbound.push(req.url());
    });

    await page.route("**/api/session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    await page.goto("/");
    await expect(page.locator("#login-view")).toBeVisible();
    await expect(page.locator(".app-shell")).toBeHidden();
    await expect(page.locator("#room-picker-view")).toBeHidden();

    const usernameInput = page.getByLabel("Username");
    const passwordInput = page.getByLabel("Password");
    const submitButton = page.locator("#login-submit-button");

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveText(/Sign in/);

    expect(outbound).toEqual([]);
  });

  test("wrong password displays generic error line without username enumeration", async ({ page }) => {
    await page.route("**/api/session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    await page.route("**/api/session/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid credentials" }),
      });
    });

    await page.goto("/");
    await page.getByLabel("Username").fill("judge-1");
    await page.getByLabel("Password").fill("wrong-pass");
    await page.locator("#login-submit-button").click();

    const error = page.locator("#login-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveText("Invalid username or password.");
    // Assert error does not enumerate whether username or password was the cause
    expect(await error.textContent()).not.toContain("password is wrong");
    expect(await error.textContent()).not.toContain("unknown user");

    // Password input is cleared and re-focused
    await expect(page.getByLabel("Password")).toHaveValue("");
    await expect(page.getByLabel("Password")).toBeFocused();
  });

  test("429 rate limit displays a message saying to wait", async ({ page }) => {
    await page.route("**/api/session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    await page.route("**/api/session/login", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Rate limit exceeded" }),
      });
    });

    await page.goto("/");
    await page.getByLabel("Username").fill("judge-1");
    await page.getByLabel("Password").fill("bad-pass");
    await page.locator("#login-submit-button").click();

    const error = page.locator("#login-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveText(/wait/i);
  });

  test("busy state disables inputs and shows signing in indicator", async ({ page }) => {
    await page.route("**/api/session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    let fulfillLogin;
    const loginPromise = new Promise((resolve) => {
      fulfillLogin = resolve;
    });

    await page.route("**/api/session/login", async (route) => {
      await loginPromise;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid credentials" }),
      });
    });

    await page.goto("/");
    await page.getByLabel("Username").fill("judge-1");
    await page.getByLabel("Password").fill("some-pass");

    await page.locator("#login-submit-button").click();

    // Check busy state
    await expect(page.locator("#login-form")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByLabel("Username")).toBeDisabled();
    await expect(page.getByLabel("Password")).toBeDisabled();
    await expect(page.locator("#login-submit-button")).toBeDisabled();
    await expect(page.locator(".login-submit-busy")).toBeVisible();

    fulfillLogin();
    await expect(page.locator("#login-error")).toBeVisible();
    await expect(page.locator("#login-form")).not.toHaveAttribute("aria-busy", "true");
    await expect(page.getByLabel("Username")).toBeEnabled();
    await expect(page.getByLabel("Password")).toBeEnabled();
  });

  test("correct password opens the app as the returned workplace and sign-out returns to form", async ({ page, baseURL }) => {
    const outbound = [];
    page.on("request", (req) => {
      if (new URL(req.url()).origin !== new URL(baseURL).origin) outbound.push(req.url());
    });

    let signedIn = false;
    await page.route("**/api/session", async (route) => {
      if (signedIn) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ username: "judge-alice", roomId: "workplace-alice" }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
      }
    });

    await page.route("**/api/session/login", async (route) => {
      const body = route.request().postDataJSON();
      if (body.username === "judge-alice" && body.password === "secret-token") {
        signedIn = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ username: "judge-alice", roomId: "workplace-alice" }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Invalid credentials" }),
        });
      }
    });

    let logoutCalled = false;
    await page.route("**/api/session/logout", async (route) => {
      logoutCalled = true;
      signedIn = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // Mock room state for workplace-alice
    await page.route("**/api/control-rooms/workplace-alice/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "LIVE",
          simulationState: {
            simulationTime: Date.now(),
            status: "RUNNING",
            speedMultiplier: 1,
          },
          stationKPIs: [],
          loadboards: [],
          obligations: [],
          handlerEpisodes: [],
          calibrations: [],
          changeovers: [],
        }),
      });
    });

    await page.goto("/");
    await expect(page.locator("#login-view")).toBeVisible();

    await page.getByLabel("Username").fill("judge-alice");
    await page.getByLabel("Password").fill("secret-token");
    await page.locator("#login-submit-button").click();

    // App shell loads as the workplace
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator("#login-view")).toBeHidden();
    expect(page.url()).toContain("/rooms/workplace-alice");

    // Visible sign-out button
    const signOutBtn = page.locator("#sign-out-button");
    await expect(signOutBtn).toBeVisible();

    // Click sign out
    await signOutBtn.click();
    expect(logoutCalled).toBe(true);

    // Returns to login form
    await expect(page.locator("#login-view")).toBeVisible();
    await expect(page.locator(".app-shell")).toBeHidden();

    expect(outbound).toEqual([]);
  });

  test("keyboard navigation, visible focus >= 2px, and Enter key submit", async ({ page }) => {
    await page.route("**/api/session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    let loginSubmitted = false;
    await page.route("**/api/session/login", async (route) => {
      loginSubmitted = true;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid credentials" }),
      });
    });

    await page.goto("/");
    await expect(page.locator("#login-view")).toBeVisible();

    // Focus starts or is moved to username
    await page.getByLabel("Username").focus();
    await expect(page.getByLabel("Username")).toBeFocused();

    // Check focus outline >= 2px
    const usernameOutline = await page.getByLabel("Username").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return parseFloat(style.outlineWidth) || 0;
    });
    expect(usernameOutline).toBeGreaterThanOrEqual(2);

    await page.keyboard.type("test-user");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();

    const passwordOutline = await page.getByLabel("Password").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return parseFloat(style.outlineWidth) || 0;
    });
    expect(passwordOutline).toBeGreaterThanOrEqual(2);

    await page.keyboard.type("test-pass");
    await page.keyboard.press("Tab");
    await expect(page.locator("#login-submit-button")).toBeFocused();

    const buttonOutline = await page.locator("#login-submit-button").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return parseFloat(style.outlineWidth) || 0;
    });
    expect(buttonOutline).toBeGreaterThanOrEqual(2);

    // Press Enter to submit from button or inputs
    await page.keyboard.press("Enter");
    expect(loginSubmitted).toBe(true);
  });

  test("phone width (375px) has zero horizontal overflow, Nebius palette and no lime text", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.route("**/api/session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    await page.route("**/api/session/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid credentials" }),
      });
    });

    await page.goto("/");
    await expect(page.locator("#login-view")).toBeVisible();

    // Trigger error display
    await page.getByLabel("Username").fill("judge");
    await page.getByLabel("Password").fill("wrong");
    await page.locator("#login-submit-button").click();
    await expect(page.locator("#login-error")).toBeVisible();

    // Check horizontal overflow
    const overflow = await page.evaluate(() => {
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cardWidth: document.querySelector(".login-card").scrollWidth,
      };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(overflow.cardWidth).toBeLessThanOrEqual(overflow.clientWidth);

    // Check error text is not lime
    const errorColor = await page.locator("#login-error").evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    // Lime color is rgb(225, 254, 60) or similar
    expect(errorColor).not.toContain("225, 254, 60");
    expect(errorColor).not.toContain("183, 226, 24");
  });

  test("no password or username stored in browser storage", async ({ page }) => {
    await page.route("**/api/session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    await page.goto("/");
    await page.getByLabel("Username").fill("secret-user");
    await page.getByLabel("Password").fill("secret-pass");

    const storage = await page.evaluate(() => {
      return {
        local: { ...window.localStorage },
        session: { ...window.sessionStorage },
      };
    });

    expect(storage.local.password).toBeUndefined();
    expect(storage.local.username).toBeUndefined();
    expect(storage.session.password).toBeUndefined();
    expect(storage.session.username).toBeUndefined();
  });
});
