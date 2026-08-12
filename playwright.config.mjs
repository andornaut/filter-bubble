import { defineConfig } from "@playwright/test";

// End-to-end suite: a real Chromium, the real built extension, and real pages
// served over HTTP. See tests/e2e/README.md.
export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: "./tests/e2e/build-extension.mjs",
  outputDir: "./tests/e2e/.artifacts/results",
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e/specs",
  testMatch: "**/*.spec.js",
  timeout: 60_000,
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // Every test launches its own browser with its own profile, so the cost of a
  // worker is a whole Chromium; two keeps the suite quick without thrashing a
  // small CI runner. Extensions need a persistent context, which is why there
  // is no `projects` block: the browser is launched by the `context` fixture in
  // helpers/fixtures.js, not configured here.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 2,
});
