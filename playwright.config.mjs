import { defineConfig } from "@playwright/test";

// Each agent worktree runs E2E on its own port (see the port table in handover.md) so
// parallel runs never collide. Playwright starts the server for the run and stops it
// afterwards, which frees the port.
const port = process.env.COMPASS_E2E_PORT ?? "3012";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    // Room mutations require JSON even when a command has no body.
    extraHTTPHeaders: { "Content-Type": "application/json" },
  },
  webServer: {
    command: "npm run dev",
    // /api/state moved under /api/control-rooms/:id/state with Control Rooms;
    // /api/control-rooms (the room list) is unscoped and always 200s once the
    // manager has booted, so it's the readiness probe now.
    url: `http://127.0.0.1:${port}/api/control-rooms`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      COMPASS_HOST: "127.0.0.1",
      COMPASS_PORT: port,
      NODE_ENV: "test",
      // Keeps every Control Room's data off the real backend/data/ — the
      // Control Rooms analogue of the COMPASS_LIVE_STATE_PATH override this
      // config used before rooms existed.
      COMPASS_CONTROL_ROOMS_DATA_ROOT: `/tmp/compass-playwright-control-rooms-${port}`,
      COMPASS_EVENT_PLANNER_MODE: "force-failure",
      COMPASS_LIVE_COMPASS_MODE: "force-failure",
      COMPASS_ASSISTANT_MODE: "force-failure",
    },
  },
});
