import { writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "../helpers/fixtures.js";

// Only `localhost` and `127.0.0.1` are granted in the build under test (see
// build-extension.mjs). `127.0.0.2` serves the same fixture pages over
// loopback, so it stands in for a website the user has configured but never
// granted access to.
const UNGRANTED_HOST = "127.0.0.2";

const grantedWebsite = {
  addresses: ["localhost"],
  id: "site-granted",
  selectors: ["article"],
};
const ungrantedWebsite = {
  addresses: [UNGRANTED_HOST],
  id: "site-ungranted",
  selectors: ["article"],
};
const TOPICS = [{ id: "topic-politics", text: ["politics"] }];

// Capability: Filter Bubble can only filter a website the user has granted it
// access to, and it says so rather than failing quietly.
test.describe("host permissions", () => {
  test("says nothing when every enabled website is granted", async ({
    extension,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [grantedWebsite] });
    const ui = await extension.openWindow();

    await expect(ui.locator(".list__item")).toHaveCount(1);
    await expect(ui.locator(".app__permissions")).toHaveCount(0);
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await expect(ui.locator(".websites__warning")).toHaveCount(0);
  });

  test("flags a website whose access has not been granted", async ({
    extension,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [grantedWebsite, ungrantedWebsite],
    });
    const ui = await extension.openWindow();

    // A banner across the whole UI...
    await expect(ui.locator(".app__permissions")).toContainText(
      "request required permissions",
    );

    // ...and a warning on the one website it applies to.
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    const flagged = ui.locator(".list__item", { hasText: UNGRANTED_HOST });
    await expect(flagged.locator(".websites__warning")).toHaveCount(1);
    await expect(
      ui.locator(".list__item", { hasText: "localhost" }).first(),
    ).not.toContainText("⚠️");
  });

  test("leaves a configured but ungranted website unfiltered", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [ungrantedWebsite] });
    await page.goto(server.url("feed.html", UNGRANTED_HOST));
    await page.waitForTimeout(500);

    // The website matches, so the background tries to inject - and cannot.
    // Nothing is hidden, and the badge does not claim a count for a document
    // it was never able to read.
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
    await expect.poll(() => extension.badgeText(page)).toBe("");
  });

  test("stops flagging a website once it is disabled", async ({
    extension,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [grantedWebsite, ungrantedWebsite],
    });
    const ui = await extension.openWindow();
    await expect(ui.locator(".app__permissions")).toBeVisible();

    // The background never filters a disabled website, so it needs no access.
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await ui
      .locator(".list__item", { hasText: UNGRANTED_HOST })
      .locator(".list__toggle")
      .click();

    await expect(ui.locator(".app__permissions")).toHaveCount(0);
    await expect(ui.locator(".websites__warning")).toHaveCount(0);
  });

  test("stops flagging a website once it is deleted", async ({ extension }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [grantedWebsite, ungrantedWebsite],
    });
    const ui = await extension.openWindow();
    await expect(ui.locator(".app__permissions")).toBeVisible();

    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await ui
      .locator(".list__item", { hasText: UNGRANTED_HOST })
      .locator(".list__content")
      .click();
    await ui.getByRole("button", { name: "Delete" }).click();

    await expect(ui.locator(".list__item")).toHaveCount(1);
    await expect(ui.locator(".app__permissions")).toHaveCount(0);
  });

  test("offers to grant access after importing websites", async ({
    extension,
  }, testInfo) => {
    const filePath = path.join(testInfo.outputPath(), "import.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        websites: [{ addresses: [UNGRANTED_HOST], selectors: ["article"] }],
      }),
    );

    const ui = await extension.openWindow("import");
    await ui.locator('input[type="file"]').setInputFiles(filePath);

    await expect(ui.locator(".import__status--success")).toBeVisible();
    // Imported websites do not filter until their access is granted, so the
    // import page offers the prompt itself rather than leaving it to the popup.
    await expect(ui.locator(".import__permissions")).toContainText(
      "Grant website access",
    );
  });
});
