import { expect, settle, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

// Capability: what the content script does at the awkward edges of a real
// page - other documents, shadow roots, text nobody can see, and content that
// changes under it.
test.describe("content script edges", () => {
  test.beforeEach(async ({ extension, page, server }) => {
    await extension.seed(SEED);
    await page.goto(server.url("embedded.html"));
    await expect(page.locator("#e-visible")).toHaveClass(
      /filter-bubble--remove/,
    );
  });

  test("does not reach into an iframe", async ({ page }) => {
    // The background injects into the top frame only, so a feed embedded in a
    // child document is left alone. Worth pinning: it is the difference
    // between the extension covering a site and only appearing to.
    const embedded = page.frameLocator("#embedded");

    await expect(embedded.locator("#a1")).toBeVisible();
    await expect(embedded.locator("#a1")).not.toHaveClass(/filter-bubble/);
  });

  test("does not reach into a shadow root", async ({ page }) => {
    // `document.querySelectorAll` does not pierce shadow roots, so a widget
    // rendered in one is not filtered even though its host matched.
    await expect(page.locator("#e-shadow-item")).toBeVisible();
    await expect(page.locator("#e-shadow-item")).not.toHaveClass(
      /filter-bubble/,
    );
  });

  test("ignores the metadata a real feed attaches to its items", async ({
    page,
  }) => {
    // This item's JSON-LD lists the topic as a keyword; its visible text says
    // nothing about it. Matching on the metadata would hide a story with
    // nothing on screen to explain why it vanished.
    await expect(page.locator("#e-metadata")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#e-metadata")).toBeVisible();
  });

  test("ignores the fallback meant for a browser without JavaScript", async ({
    page,
  }) => {
    // Same defect as the metadata above, from the other direction: `<noscript>`
    // holds prose rather than code, but the browser renders it only when
    // scripts are off - which is never, wherever the content script is running.
    await expect(page.locator("#e-noscript")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#e-noscript")).toBeVisible();
  });

  test("keeps an item filtered after its text stops matching", async ({
    extension,
    page,
  }) => {
    await expect(page.locator("#e-mutable")).toHaveClass(
      /filter-bubble--remove/,
    );

    await page.click("#rewrite");
    await settle(page);

    // Filtering is sticky until a full reset: re-testing a container mid-update
    // would reveal one that is only transiently non-matching, and over-hiding
    // is the lesser failure.
    await expect(page.locator("#e-mutable")).toHaveClass(
      /filter-bubble--remove/,
    );

    // A rule change is a full reset, and that does release it.
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
      websites: [
        {
          addresses: ["localhost"],
          hideInsteadOfRemove: true,
          id: "site-localhost",
          selectors: ["article"],
        },
      ],
    });

    await expect(page.locator("#e-visible")).toHaveClass(/filter-bubble--hide/);
    await expect(page.locator("#e-mutable")).not.toHaveClass(/filter-bubble/);
  });

  test("does not release what it filtered when the state is re-sent", async ({
    context,
    page,
  }) => {
    await expect(page.locator("#e-mutable")).toHaveClass(
      /filter-bubble--remove/,
    );
    await page.click("#rewrite");
    await settle(page);
    await expect(page.locator("#e-mutable")).toHaveClass(
      /filter-bubble--remove/,
    );

    // Every tab event re-sends `enable`, carrying the state the tab already
    // has. Those repeats have to be told apart from a real change, which is
    // done by comparing the serialized payload: an unchanged one re-runs
    // filtering and nothing else. Were it to compare unequal - the sender
    // building the payload in a different key order would do it - every repeat
    // would be a full reset, releasing this item because its text no longer
    // matches. The user would watch content reappear on switching tabs.
    const other = await context.newPage();
    await other.goto("about:blank");
    await page.bringToFront();
    await settle(page);

    await expect(page.locator("#e-mutable")).toHaveClass(
      /filter-bubble--remove/,
    );
    await expect(page.locator("#e-visible")).toHaveClass(
      /filter-bubble--remove/,
    );
  });

  test("counts an already filtered item once when it grows", async ({
    extension,
    page,
  }) => {
    await expect.poll(() => extension.badgeText(page)).toBe("2");

    // Appending inside a container that is already filtered triggers another
    // pass; the container must not be counted a second time.
    await page.click("#add-inside");
    await settle(page);

    await expect.poll(() => extension.badgeText(page)).toBe("2");
  });

  test("stops filtering the whole document when told to disable", async ({
    extension,
    page,
  }) => {
    await extension.setDisabled(true);

    await expect(page.locator("#e-visible")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#e-metadata")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#e-mutable")).not.toHaveClass(/filter-bubble/);
    await expect.poll(() => extension.badgeText(page)).toBe("");
  });
});
