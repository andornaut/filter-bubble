import { expect, settle, test } from "../helpers/fixtures.js";

// Capability: a fresh install comes up - the background service worker
// registers, the extension UI renders, and the shipped default websites are
// seeded into `storage.sync` exactly once.
test.describe("installation", () => {
  test("registers a background service worker", async ({ extension }) => {
    const worker = await extension.worker();

    expect(worker.url()).toBe(
      `chrome-extension://${extension.id}/js/background.js`,
    );
  });

  test("starts with an empty store until the extension UI is opened", async ({
    extension,
  }) => {
    // Seeding lives in the popup's storage layer, not the background, so a
    // browser that has only ever run the background holds nothing.
    expect(await extension.syncStorage()).toEqual({});
  });

  test("seeds the default websites when the extension UI is first opened", async ({
    extension,
  }) => {
    await extension.openPage();

    await expect
      .poll(() => extension.syncStorage())
      .toMatchObject({ schema: 2 });

    const stored = await extension.syncStorage();
    const websiteKeys = Object.keys(stored)
      .filter((key) => key.startsWith("w:"))
      .sort();

    expect(websiteKeys).toEqual([
      "w:default-arstechnica",
      "w:default-hackernews",
      "w:default-reddit",
      "w:default-tildes",
    ]);
    expect(stored["w:default-reddit"]).toMatchObject({
      addresses: ["reddit.com", "old.reddit.com", "www.reddit.com"],
      enabled: true,
      selectors: ["article", ".listing-page .thing"],
    });
    // The "never edited" sentinel the defaults refresher reads.
    expect(stored["w:default-reddit"].modifiedDate).toBe(
      stored["w:default-reddit"].createdDate,
    );
  });

  test("renders the topics and websites tabs", async ({ extension }) => {
    const page = await extension.openPage();

    const nav = page.locator(".app__nav");
    await expect(nav.locator(".app__tab")).toHaveText(["Topics", "Websites"]);
    await expect(nav.locator(".app__tab--active")).toHaveText("Topics");
    await expect(page.locator(".footer__status")).toContainText("Enabled");

    // Topics tab is the default and starts empty; websites lists the defaults.
    await expect(page.locator(".list__item")).toHaveCount(0);
    await nav.getByRole("link", { name: "Websites" }).click();
    await expect(page.locator(".list__item")).toHaveCount(4);
    await expect(page.locator(".websites__addresses")).toContainText([
      "tildes.net",
    ]);
  });

  test("does not re-seed a store that already holds data", async ({
    extension,
  }) => {
    await extension.seed({
      websites: [
        { addresses: ["example.com"], id: "custom-1", selectors: ["article"] },
      ],
    });

    const page = await extension.openPage();
    await expect(page.locator(".app")).toBeVisible();
    // Seeding is decided before the app renders but written afterwards, so a
    // re-seed would still be in flight here: give it time to land before
    // asserting it never happened.
    await settle(page);

    const stored = await extension.syncStorage();
    expect(Object.keys(stored).filter((key) => key.startsWith("w:"))).toEqual([
      "w:custom-1",
    ]);
  });
});
