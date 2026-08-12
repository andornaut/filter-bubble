import { expect, test } from "../helpers/fixtures.js";

const SEED = {
  topics: [{ id: "topic-politics", text: ["politics"] }],
  websites: [
    { addresses: ["localhost"], id: "site-localhost", selectors: ["article"] },
  ],
};

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

  test("matches text that is in the markup but not on the screen", async ({
    page,
  }) => {
    // `textContent` includes the contents of <script>, so an item whose
    // visible text says nothing about the topic is filtered on the structured
    // data a real news site embeds next to it. Pinned as the current
    // behaviour: it hides more than the reader can see is being matched.
    await expect(page.locator("#e-metadata")).toHaveClass(
      /filter-bubble--remove/,
    );
  });

  test("keeps an item filtered after its text stops matching", async ({
    extension,
    page,
  }) => {
    await expect(page.locator("#e-mutable")).toHaveClass(
      /filter-bubble--remove/,
    );

    await page.click("#rewrite");
    await page.waitForTimeout(500);

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

  test("counts an already filtered item once when it grows", async ({
    extension,
    page,
  }) => {
    await expect.poll(() => extension.badgeText(page)).toBe("3");

    // Appending inside a container that is already filtered triggers another
    // pass; the container must not be counted a second time.
    await page.click("#add-inside");
    await page.waitForTimeout(500);

    await expect.poll(() => extension.badgeText(page)).toBe("3");
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
