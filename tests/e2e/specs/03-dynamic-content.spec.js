import { expect, test } from "../helpers/fixtures.js";

const TOPICS = [{ id: "topic-politics", text: ["politics"] }];
const WEBSITES = [
  { addresses: ["localhost"], id: "site-localhost", selectors: ["article"] },
];

// Capability: content that arrives after the first filtering pass is filtered
// too - the content script watches the document for added nodes.
test.describe("dynamic content", () => {
  test.beforeEach(async ({ extension, page, server }) => {
    await extension.seed({ topics: TOPICS, websites: WEBSITES });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("filters an item appended after load", async ({ extension, page }) => {
    await page.click("#append");

    await expect(page.locator("#a5")).toHaveClass(/filter-bubble--remove/);
    await expect.poll(() => extension.badgeText(page)).toBe("2");
  });

  test("keeps filtering after the page replaces document.body", async ({
    page,
  }) => {
    await page.click("#replace-body");

    await expect(page.locator("#rebuilt")).toHaveClass(/filter-bubble--remove/);
  });

  test("keeps up with a burst of appends", async ({ extension, page }) => {
    // More appends than the 200ms throttle can service individually: the
    // trailing pass has to catch whatever the throttled ones missed.
    await page.evaluate(() => {
      const button = document.getElementById("append");
      for (let i = 0; i < 25; i += 1) {
        button.click();
      }
    });

    await expect(page.locator("article.filter-bubble--remove")).toHaveCount(26);
    await expect.poll(() => extension.badgeText(page)).toBe("26");
  });

  test("repairs filtering after the page strips the filter classes", async ({
    context,
    page,
  }) => {
    // Let the load-time filtering passes drain first: a trailing throttled pass
    // would otherwise re-filter on its own and hide what this test is about.
    await page.waitForTimeout(1000);

    // The observer watches added nodes only, so a page that rewrites className
    // in place reveals the filtered items and nothing notices immediately.
    await page.click("#strip-classes");
    await page.waitForTimeout(500);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);

    // Any later tab event re-sends `enable`, which is the repair path: the
    // content script re-runs filtering even when the state is unchanged.
    const other = await context.newPage();
    await other.goto("about:blank");
    await page.bringToFront();

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });
});
