import { expect, test } from "../helpers/fixtures.js";

const TOPICS = [{ id: "topic-politics", text: ["politics"] }];

const website = (overrides = {}) => ({
  addresses: ["localhost"],
  id: "site-localhost",
  selectors: ["article"],
  ...overrides,
});

// Capability: filtering survives pages that are not simply sitting there
// waiting to be filtered - ones that forbid the styles the extension needs, and
// ones that have no body yet when the content script starts.
test.describe("pages that make filtering harder", () => {
  test("filters a page whose CSP forbids inline styles", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    const response = await page.goto(server.url("csp/feed.html"));

    // Confirm the page really is locked down before concluding anything from
    // it: the header is set, and an inline stylesheet added from the page is
    // refused, which is what a content script adding its own would run into.
    expect(response.headers()["content-security-policy"]).toContain(
      "style-src 'self'",
    );
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = "#c2 { display: none !important; }";
      document.head.append(style);
    });
    await expect(page.locator("#c2")).toBeVisible();

    await expect(page.locator("#c1")).toHaveClass(/filter-bubble--remove/);
    // The class alone proves nothing here: what the policy could have blocked
    // is the stylesheet that acts on it. The computed style is the evidence
    // that `chrome.scripting.insertCSS` got through where a content script
    // adding its own <style> would have been refused.
    expect(
      await page.locator("#c1").evaluate((el) => getComputedStyle(el).display),
    ).toBe("none");
    await expect(page.locator("#c1")).toBeHidden();
    await expect(page.locator("#c2")).toBeVisible();
  });

  test("hides rather than removes under the same policy", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [website({ hideInsteadOfRemove: true })],
    });
    await page.goto(server.url("csp/feed.html"));

    expect(
      await page
        .locator("#c1")
        .evaluate((el) => getComputedStyle(el).visibility),
    ).toBe("hidden");
  });

  test("highlights under the same policy", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    await page.goto(server.url("csp/feed.html"));
    await expect(page.locator("#c1")).toHaveClass(/filter-bubble--remove/);

    const closePopup = await extension.connectPopupPort();

    // Highlight mode is the one a user looks straight at, so its styles
    // reaching the page matters most of all.
    await expect(page.locator("#c1")).toHaveClass(/filter-bubble--highlight/);
    expect(
      await page
        .locator("#c1")
        .evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("solid");

    await closePopup();
  });

  test("filters a body that arrives after the content script starts", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });

    // Confirm the fixture actually does what it claims before relying on it: a
    // script running at document_start, which is when the extension injects,
    // must find no body. Otherwise this test would pass without ever exercising
    // the case.
    await page.addInitScript(() => {
      window.__hadBodyAtStart = Boolean(document.body);
    });

    // The server holds this page's body back, so the content script is
    // injected into a document that has a documentElement and nothing else.
    // Observing documentElement rather than body is what covers this.
    await page.goto(server.url("slow/feed.html"));

    expect(await page.evaluate(() => window.__hadBodyAtStart)).toBe(false);

    await expect(page.locator("#l1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#l1")).toBeHidden();
    await expect(page.locator("#l2")).not.toHaveClass(/filter-bubble/);
    await expect.poll(() => extension.badgeText(page)).toBe("1");
  });

  test("counts a late body once, not once per pass", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    await page.goto(server.url("slow/feed.html"));
    await expect(page.locator("#l1")).toHaveClass(/filter-bubble--remove/);

    // The navigation reports "loading" and then "complete", so the background
    // sends `enable` twice for one document. The second is the repair path and
    // must not double the count.
    await page.waitForTimeout(1000);
    await expect.poll(() => extension.badgeText(page)).toBe("1");
    await expect(page.locator("article.filter-bubble")).toHaveCount(1);
  });
});
