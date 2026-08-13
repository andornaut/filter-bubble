import { test as base, chromium } from "@playwright/test";

import { createExtension } from "./extension.js";
import { EXTENSION_DIR } from "./paths.js";
import { startServer } from "./server.js";

// How the browser under test is launched. Shared with `18-persistence`, which
// drives a browser of its own so it can restart one.
//
// `channel: "chromium"` is the part that matters: it selects the full Chromium
// build rather than the headless shell, and only the full build carries
// extension support. With it, extensions load headless - no display and no
// Xvfb. Extensions still need a persistent context, so every browser here has
// a profile.
//
// An empty `userDataDir` asks Playwright for a throwaway profile it creates
// and removes itself, so each test still starts with `storage.sync` and
// `storage.local` empty and nothing leaks between tests.
const launchOptions = {
  args: [
    `--disable-extensions-except=${EXTENSION_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
  ],
  channel: "chromium",
};

export const launchBrowser = (userDataDir = "") =>
  chromium.launchPersistentContext(userDataDir, launchOptions);

// Filtering is asynchronous and throttled to one pass per 200ms, so "still not
// filtered" has to be given time to be wrong before it is asserted. Waiting
// through here rather than inline keeps the number explained in one place, and
// keeps a bare `waitForTimeout` in a spec meaning "this test needs its own
// wait, for a reason it states".
const SETTLE_MS = 500;
export const settle = (page) => page.waitForTimeout(SETTLE_MS);

export const test = base.extend({
  context: async ({}, use) => {
    const context = await launchBrowser();
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },

  extension: async ({ context }, use) => {
    await use(await createExtension(context));
  },

  // The tab every test starts from: the persistent context opens one itself,
  // and reusing it keeps `tabs.query({active: true})` pointing at the page
  // under test.
  page: async ({ context }, use) => {
    const [page] = context.pages();
    await use(page || (await context.newPage()));
  },

  server: [
    async ({}, use) => {
      const server = await startServer();
      try {
        await use(server);
      } finally {
        await server.close();
      }
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
