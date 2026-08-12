import { expect, test } from "../helpers/fixtures.js";

const SEED = {
  topics: [{ id: "topic-politics", text: ["politics"] }],
  websites: [
    { addresses: ["localhost"], id: "site-localhost", selectors: ["article"] },
  ],
};

// Capability: filtering follows the tab through the ways a browser actually
// moves between documents - in-page navigation, history, and several windows.
test.describe("tab lifecycle", () => {
  test("keeps filtering across an in-page (SPA) navigation", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    // `pushState` loads no document, so the background gets no navigation to
    // act on: the content script's observer is what keeps the page filtered.
    await page.click("#spa-navigate");

    await expect(page).toHaveURL(/\?view=2$/);
    await expect(page.locator("#page-two-match")).toHaveClass(
      /filter-bubble--remove/,
    );
    await expect(page.locator("#page-two-plain")).not.toHaveClass(
      /filter-bubble/,
    );
    await expect.poll(() => extension.badgeText(page)).toBe("1");
  });

  test("re-filters and re-counts a page restored by the back button", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect.poll(() => extension.badgeText(page)).toBe("1");

    await page.goto(server.url("feed.html", "127.0.0.1"));
    await expect.poll(() => extension.badgeText(page)).toBe("");

    // Going back can hand the same content-script instance back from the
    // back-forward cache, with the badge already cleared behind it.
    await page.goBack();

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect.poll(() => extension.badgeText(page)).toBe("1");
  });

  test("applies changed rules on the next navigation in the same tab", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    // Switch the website to hide-instead-of-remove and to a narrower selector.
    await extension.seed({
      topics: SEED.topics,
      websites: [
        {
          addresses: ["localhost"],
          hideInsteadOfRemove: true,
          id: "site-localhost",
          selectors: [".thing"],
        },
      ],
    });
    await page.goto(server.url("nested.html"));

    await expect(page.locator("#inner")).toHaveClass(/filter-bubble--hide/);
    await expect(page.locator("#outer")).not.toHaveClass(/filter-bubble/);
  });

  test("updates the visible tab of every window", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ websites: SEED.websites });
    await page.goto(server.url("feed.html"));
    const second = await extension.newWindow(server.url("feed.html"));

    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
    await expect(second.locator("article.filter-bubble")).toHaveCount(0);

    // One change, made once - both windows are showing a matched website, and
    // neither is "the current window" as far as a service worker is concerned.
    await extension.seed(SEED);

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(second.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("reaches a background tab when it is next activated", async ({
    context,
    extension,
    page,
    server,
  }) => {
    await extension.seed({ websites: SEED.websites });
    await page.goto(server.url("feed.html"));

    // Push the page under test into the background of its own window.
    const foreground = await context.newPage();
    await foreground.goto("about:blank");

    await extension.seed(SEED);
    await page.waitForTimeout(500);

    // Documented behaviour, not a defect: the background re-evaluates active
    // tabs only, so a tab nobody is looking at keeps its old filtering.
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);

    await page.bringToFront();

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });
});
