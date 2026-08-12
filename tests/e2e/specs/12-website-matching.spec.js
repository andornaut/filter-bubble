import { expect, test } from "../helpers/fixtures.js";

const TOPICS = [{ id: "topic-politics", text: ["politics"] }];

const website = (overrides = {}) => ({
  addresses: ["localhost"],
  id: "site-localhost",
  selectors: ["article"],
  ...overrides,
});

// Capability: a website's addresses decide which pages it governs, and its
// selectors decide which blocks on those pages are considered - neither of
// which may take the rest of the browser down with it when it is wrong.
test.describe("website matching", () => {
  test("matches an address only on a host or path boundary", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [website({ addresses: ["127.0.0.1"], id: "site-ip" })],
    });

    // "127.0.0.11" starts with the configured "127.0.0.1" but is a different
    // host, the same way "reddit.com" must not match "reddit.companyx.com".
    // Access to it is granted, so an unfiltered page here can only mean the
    // address did not match.
    await page.goto(server.url("feed.html", "127.0.0.11"));
    await page.waitForTimeout(500);
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    await page.goto(server.url("feed.html", "127.0.0.1"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("matches every address a website lists, and query strings too", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [website({ addresses: ["127.0.0.1", "localhost"] })],
    });

    await page.goto(server.url("feed.html?ref=elsewhere"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    await page.goto(server.url("feed.html", "127.0.0.1"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("keeps working when one of several selectors is invalid", async ({
    extension,
    page,
    server,
  }) => {
    const warnings = [];
    page.on("console", (message) => {
      if (message.type() === "warning") {
        warnings.push(message.text());
      }
    });

    await extension.seed({
      topics: TOPICS,
      websites: [
        website({ selectors: ["article", ":::not a selector", ".missing"] }),
      ],
    });
    await page.goto(server.url("feed.html"));

    // The bad selector is skipped and the good one still filters.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect.poll(() => extension.badgeText(page)).toBe("1");
    await expect
      .poll(() => warnings.join("\n"))
      .toContain('Error applying selector ":::not a selector"');
  });

  test("filters nothing when no selector matches anything", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [website({ selectors: [".nothing-here"] })],
    });
    await page.goto(server.url("feed.html"));
    await page.waitForTimeout(500);

    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
    await expect.poll(() => extension.badgeText(page)).toBe("");
  });

  test("only considers text inside the targeted blocks", async ({
    extension,
    page,
    server,
  }) => {
    // ".thing" is inside the article, so targeting it must not drag the whole
    // article in, and text elsewhere on the page must not count at all.
    await extension.seed({
      topics: TOPICS,
      websites: [website({ selectors: [".thing"] })],
    });
    await page.goto(server.url("nested.html"));

    await expect(page.locator("#inner")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#outer")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#outer h2")).toBeVisible();
  });

  test("stops filtering a page when its website is deleted", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await extension.openWindow();
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await ui.locator(".list__content").click();
    await ui.getByRole("button", { name: "Delete" }).click();
    await expect(ui.locator(".list__item")).toHaveCount(0);

    // The tab is repaired in place: an unmatched tab is told to disable.
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
    await expect.poll(() => extension.badgeText(page)).toBe("");
  });
});
