import { test as baseTest, expect } from '@playwright/test';

/**
 * Shared Playwright fixture that stubs GET /api/session to return a fixed session
 * for the test room (test-operator on plant-1), keeping the login UI for
 * e2e/login.spec.mjs only.
 */
export async function stubSessionRoute(context, testInfo) {
  const file = testInfo?.file ?? baseTest.info()?.file;
  if (!file?.endsWith('login.spec.mjs')) {
    await context.route("**/api/session", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ username: "test-operator", roomId: "plant-1" }),
        });
      } else {
        await route.continue();
      }
    });
  }
}

export const sessionFixture = async ({ page, context }, use, testInfo) => {
  await stubSessionRoute(context, testInfo);
  await use(page);
};

export const test = baseTest.extend({
  page: sessionFixture,
});
export { expect };

// Install fixture on default @playwright/test runner so all existing specs authenticate.
const sym = Object.getOwnPropertySymbols(baseTest)[0];
if (sym && baseTest[sym]?.fixtures) {
  const fixturesArray = baseTest[sym].fixtures;
  for (const group of fixturesArray) {
    if (group.fixtures) {
      if (group.fixtures.browser && !group.fixtures.browser.__sessionStubInstalled) {
        const [originalBrowserFn, options] = Array.isArray(group.fixtures.browser)
          ? group.fixtures.browser
          : [group.fixtures.browser, undefined];
        const wrappedBrowserFn = async ({ playwright, browserName, _browserOptions, connectOptions }, use, workerInfo) => {
          return originalBrowserFn({ playwright, browserName, _browserOptions, connectOptions }, async (browser) => {
            const originalNewContext = browser.newContext.bind(browser);
            browser.newContext = async (...args) => {
              const context = await originalNewContext(...args);
              await stubSessionRoute(context);
              return context;
            };
            await use(browser);
          }, workerInfo);
        };
        wrappedBrowserFn.__sessionStubInstalled = true;
        group.fixtures.browser = options ? [wrappedBrowserFn, options] : wrappedBrowserFn;
      }
      if (group.fixtures.context && !group.fixtures.context.__sessionStubInstalled) {
        const originalContext = group.fixtures.context;
        const wrappedContext = async ({ browser, video, _reuseContext, _contextFactory }, use, testInfoPublic) => {
          return originalContext({ browser, video, _reuseContext, _contextFactory }, async (context) => {
            await stubSessionRoute(context, testInfoPublic);
            await use(context);
          }, testInfoPublic);
        };
        wrappedContext.__sessionStubInstalled = true;
        group.fixtures.context = wrappedContext;
      }
    }
  }
}
