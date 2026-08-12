import { expect, test } from "../helpers/fixtures.js";

const TOPICS = [
  { id: "topic-politics", text: ["politics"] },
  { id: "topic-sports", text: ["sports"] },
];

const website = (overrides = {}) => ({
  addresses: ["localhost"],
  id: "site-localhost",
  selectors: ["article"],
  ...overrides,
});

const displayOf = (page, selector) =>
  page.locator(selector).evaluate((el) => getComputedStyle(el).display);

const visibilityOf = (page, selector) =>
  page.locator(selector).evaluate((el) => getComputedStyle(el).visibility);

// Capability: content matching an enabled topic inside a targeted element is
// filtered on a configured website, and nothing else is touched.
test.describe("content filtering", () => {
  test("removes the matching feed items and leaves the rest alone", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    await page.goto(server.url("feed.html"));

    // Matched: "politics" in #a1, "sports" in #a3.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a3")).toHaveClass(/filter-bubble--remove/);
    // The injected stylesheet is what actually takes them off the page.
    expect(await displayOf(page, "#a1")).toBe("none");

    // Unmatched: no topic in #a2, and #a4 only contains "Category"/"catalogue".
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#a4")).not.toHaveClass(/filter-bubble/);
    expect(await displayOf(page, "#a2")).toBe("block");

    // Content outside the configured selectors is never considered.
    await expect(page.locator("h1")).not.toHaveClass(/filter-bubble/);
  });

  test("hides instead of removing when the website says so", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [website({ hideInsteadOfRemove: true })],
    });
    await page.goto(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--hide/);
    expect(await visibilityOf(page, "#a1")).toBe("hidden");
    // Hidden keeps the layout box, which is the whole point of the mode.
    expect(await displayOf(page, "#a1")).toBe("block");
  });

  test("matches topic phrases only as whole words", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-cat", text: ["cat"] }],
      websites: [website()],
    });
    await page.goto(server.url("feed.html"));

    // Give the content script a chance to run before asserting a negative.
    await expect(page.locator("#feed")).toBeVisible();
    await page.waitForTimeout(500);

    // "Category" and "catalogue" both contain "cat" as a substring only.
    await expect(page.locator("#a4")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
  });

  test("ignores a disabled topic and a disabled website", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ enabled: false, id: "topic-politics", text: ["politics"] }],
      websites: [website()],
    });
    await page.goto(server.url("feed.html"));
    await page.waitForTimeout(500);
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    await extension.seed({
      topics: TOPICS,
      websites: [website({ enabled: false })],
    });
    await page.reload();
    await page.waitForTimeout(500);
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
  });

  test("leaves a website that is not configured untouched", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });

    // Same pages, served at an address no configured website matches.
    await page.goto(server.url("feed.html", "127.0.0.1"));
    await page.waitForTimeout(500);

    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
    expect(await displayOf(page, "#a1")).toBe("block");
  });

  test("counts a matched container and its matched descendant only once", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [website({ selectors: ["article", ".thing"] })],
    });
    await page.goto(server.url("nested.html"));

    await expect(page.locator("#outer")).toHaveClass(/filter-bubble--remove/);
    // The badge reports filtered blocks as the reader sees them: hiding the
    // outer article already took the inner ".thing" out of view.
    await expect.poll(() => extension.badgeText(page)).toBe("1");
  });

  test("reports the filtered count on the toolbar badge", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    await page.goto(server.url("feed.html"));

    await expect.poll(() => extension.badgeText(page)).toBe("2");

    // Navigating to a page with nothing to filter clears the badge.
    await page.goto(server.url("nested.html"));
    await expect.poll(() => extension.badgeText(page)).toBe("1");

    await page.goto(server.url("feed.html", "127.0.0.1"));
    await expect.poll(() => extension.badgeText(page)).toBe("");
  });
});
