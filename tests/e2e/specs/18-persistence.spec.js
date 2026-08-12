import { chromium } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

import { Extension, getExtensionId } from "../helpers/extension.js";
import { expect, test } from "../helpers/fixtures.js";
import { EXTENSION_DIR, PROFILES_DIR } from "../helpers/paths.js";

// A browser of this test's own, so it can be closed and started again on the
// same profile. The shared `context` fixture owns its profile for the length of
// a test, which is exactly what a restart has to get around.
const launch = async (userDataDir) => {
  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
    ],
    headless: false,
  });
  const extension = new Extension(context, await getExtensionId(context));
  return { context, extension, page: context.pages()[0] };
};

// Capability: what the user configured is still there tomorrow, and every
// window showing the extension UI agrees on what it is.
test.describe("persistence", () => {
  test("keeps topics, websites and the off switch across a restart", async ({
    server,
  }) => {
    const userDataDir = mkdtempSync(path.join(PROFILES_DIR, "restart-"));
    try {
      const first = await launch(userDataDir);
      // Seed the defaults the way a fresh install does, then configure on top.
      const ui = await first.extension.openWindow();
      await ui.locator('form input[name="text"]').fill("politics");
      await ui.getByRole("button", { name: "Add", exact: true }).click();
      await ui
        .locator(".app__nav")
        .getByRole("link", { name: "Websites" })
        .click();
      await ui.locator('form input[name="addresses"]').fill("localhost");
      await ui.locator('form input[name="selectors"]').fill("article");
      await ui.getByRole("button", { name: "Add", exact: true }).click();
      await expect(ui.locator(".list__item")).toHaveCount(5);

      await first.page.goto(server.url("feed.html"));
      await expect(first.page.locator("#a1")).toHaveClass(
        /filter-bubble--remove/,
      );
      await first.extension.setDisabled(true);
      await expect(first.page.locator("#a1")).not.toHaveClass(/filter-bubble/);

      const before = await first.extension.syncStorage();
      await first.context.close();

      // Start the browser again on the same profile.
      const second = await launch(userDataDir);
      try {
        // Nothing was re-seeded, duplicated or migrated a second time.
        expect(await second.extension.syncStorage()).toEqual(before);
        expect(
          await second.extension.evaluate(() => chrome.storage.local.get(null)),
        ).toMatchObject({ disabled: true });

        // Still switched off, exactly as it was left.
        await second.page.goto(server.url("feed.html"));
        await second.page.waitForTimeout(500);
        await expect(second.page.locator("article.filter-bubble")).toHaveCount(
          0,
        );
        await expect
          .poll(() => second.extension.actionTitle())
          .toBe("Filter Bubble (Disabled)");

        // And switching it back on picks up the configuration from before.
        await second.extension.setDisabled(false);
        await expect(second.page.locator("#a1")).toHaveClass(
          /filter-bubble--remove/,
        );
      } finally {
        await second.context.close();
      }
    } finally {
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });

  test("keeps two open extension windows in step", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
      websites: [
        {
          addresses: ["localhost"],
          id: "site-localhost",
          selectors: ["article"],
        },
      ],
    });
    await page.goto(server.url("feed.html"));

    // The options page can sit open in a tab while the popup is used.
    const first = await extension.openWindow();
    const second = await extension.openWindow();
    await expect(first.locator(".topics__text")).toHaveText("politics");
    await expect(second.locator(".topics__text")).toHaveText("politics");

    await first.locator('form input[name="text"]').fill("sports");
    await first.getByRole("button", { name: "Add", exact: true }).click();

    // `storage.onChanged` carries the addition to the other window.
    await expect(second.locator(".topics__text")).toHaveText([
      "sports",
      "politics",
    ]);
    await expect(page.locator("#a3")).toHaveClass(/filter-bubble--remove/);

    // ...and a deletion made in the second window reaches the first.
    await second
      .locator(".list__item", { hasText: "politics" })
      .locator(".list__content")
      .click();
    await second.getByRole("button", { name: "Delete" }).click();

    await expect(first.locator(".topics__text")).toHaveText("sports");
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#a3")).toHaveClass(/filter-bubble--remove/);
  });
});
