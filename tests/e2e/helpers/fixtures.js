import { test as base, chromium } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

import { Extension, getExtensionId } from "./extension.js";
import { EXTENSION_DIR, PROFILES_DIR } from "./paths.js";
import { startServer } from "./server.js";

// Extensions only load into a persistent context, and only in a headed browser
// (the headless shell ships no extension support), so the suite runs under
// Xvfb - see `npm run test:e2e`.
export const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(path.join(PROFILES_DIR, "profile-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
      ],
      headless: false,
    });
    try {
      await use(context);
    } finally {
      await context.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  },

  extension: async ({ context }, use) => {
    await use(new Extension(context, await getExtensionId(context)));
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
