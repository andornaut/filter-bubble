import { expect, settle, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

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

    // Mark the document, so a restore can be told from a fresh load: only a
    // restore brings this back with it.
    await page.evaluate(() => {
      window.filterBubbleTestMark = true;
    });

    await page.goto(server.url("feed.html", "127.0.0.1"));
    await expect.poll(() => extension.badgeText(page)).toBe("");

    // Going back hands the same document, and with it the same content-script
    // instance, back from the back-forward cache - with the badge cleared
    // behind it. Stop at the commit: a restored document fires no load event,
    // so waiting for one waits for good.
    await page.goBack({ waitUntil: "commit" });

    expect(await page.evaluate(() => window.filterBubbleTestMark)).toBe(true);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect.poll(() => extension.badgeText(page)).toBe("1");
  });

  test("unfilters a restored page whose website is gone", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await page.evaluate(() => {
      window.filterBubbleTestMark = true;
    });

    await page.goto(server.url("feed.html", "127.0.0.1"));

    // The user deletes the website while looking at something else, then goes
    // back. The restored document comes back exactly as it was left, with the
    // content still hidden, so the repair has to arrive from the background:
    // nothing in the page itself knows the rules have changed.
    await extension.removeSyncStorage(["w:site-localhost"]);
    await page.goBack({ waitUntil: "commit" });

    expect(await page.evaluate(() => window.filterBubbleTestMark)).toBe(true);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#a1")).toBeVisible();
    await expect.poll(() => extension.badgeText(page)).toBe("");
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

  test("counts each tab separately on the toolbar", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    const second = await extension.newWindow(server.url("nested.html"));

    // The badge is per tab, so two tabs of the same website showing different
    // pages must not report each other's counts.
    await expect.poll(() => extension.badgeText(page)).toBe("1");
    await expect.poll(() => extension.badgeText(second)).toBe("1");

    await page.click("#append");
    await expect.poll(() => extension.badgeText(page)).toBe("2");
    await expect.poll(() => extension.badgeText(second)).toBe("1");
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
    await settle(page);

    // Documented behaviour, not a defect: the background re-evaluates active
    // tabs only, so a tab nobody is looking at keeps its old filtering.
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);

    await page.bringToFront();

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });
});
