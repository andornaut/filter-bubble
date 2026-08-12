import { expect, test } from "../helpers/fixtures.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS).toJSON();

const WEBSITES = [
  { addresses: ["localhost"], id: "site-localhost", selectors: ["article"] },
];

// Capability: the failures a browser can actually hand this extension - a
// rejected write, data left behind by an old delete, a configuration far
// larger than the examples - are handled where the user can see them.
test.describe("errors and limits", () => {
  test("surfaces a write that storage refuses", async ({ extension }) => {
    await extension.seed({ websites: WEBSITES });
    const ui = await extension.openWindow();

    // `storage.sync` caps a single item at 8KB; this is comfortably over.
    await ui.locator('form input[name="text"]').fill("x".repeat(9000));
    await ui.getByRole("button", { name: "Add", exact: true }).click();

    await expect(ui.locator(".errors")).toContainText("quota exceeded");
    // The rejection is reported rather than swallowed, and nothing was stored.
    expect(
      Object.keys(await extension.syncStorage()).filter((key) =>
        key.startsWith("t:"),
      ),
    ).toEqual([]);
  });

  test("clears errors when the user navigates to the other tab", async ({
    extension,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
    });
    const ui = await extension.openWindow();

    await ui.locator('form input[name="text"]').fill("politics");
    await ui.getByRole("button", { name: "Add", exact: true }).click();
    await expect(ui.locator(".errors")).toContainText("Duplicate item");

    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();

    await expect(ui.locator(".errors")).toHaveCount(0);
  });

  test("sweeps tombstones past the retention window and keeps the rest", async ({
    extension,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      "t:expired": {
        deleted: true,
        id: "expired",
        modifiedDate: daysAgo(40),
      },
      "t:recent": {
        deleted: true,
        id: "recent",
        modifiedDate: daysAgo(2),
      },
    });

    await extension.openWindow();

    // A tombstone still inside the window has to stay: dropping it lets a
    // device that has been offline resurrect the item it marks as deleted.
    await expect
      .poll(async () => Object.keys(await extension.syncStorage()).sort())
      .toEqual(["schema", "t:recent"]);
  });

  test("handles a configuration far larger than the examples", async ({
    extension,
    page,
    server,
  }) => {
    // 200 topics compile into one alternation; only the last one is on the
    // page, so a pattern that silently truncated would show up here.
    const topics = Array.from({ length: 200 }, (_, index) => ({
      id: `topic-${index}`,
      text: [`phrase-${index}`],
    }));
    topics.push({ id: "topic-politics", text: ["politics"] });

    await extension.seed({ topics, websites: WEBSITES });
    await page.goto(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);
    await expect.poll(() => extension.badgeText(page)).toBe("1");
  });

  test("filters a feed with many items", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
      websites: WEBSITES,
    });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    // 500 more items in one mutation, half of them matching.
    await page.evaluate(() => {
      const feed = document.getElementById("feed");
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 500; i += 1) {
        const article = document.createElement("article");
        article.className = i % 2 ? "bulk-match" : "bulk-plain";
        article.textContent =
          i % 2 ? "More politics coverage" : "Tomatoes and basil";
        fragment.append(article);
      }
      feed.append(fragment);
    });

    await expect(page.locator("article.filter-bubble--remove")).toHaveCount(
      251,
    );
    await expect(page.locator(".bulk-plain.filter-bubble")).toHaveCount(0);
    await expect.poll(() => extension.badgeText(page)).toBe("251");
  });

  test("keeps filtering across many navigations in one tab", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
      websites: WEBSITES,
    });

    // Each navigation re-injects into a new document; the content script's
    // "already installed" check and the background's badge bookkeeping have to
    // stay in step over a long session rather than drifting.
    for (let i = 0; i < 5; i += 1) {
      await page.goto(server.url("feed.html"));
      await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
      await expect.poll(() => extension.badgeText(page)).toBe("1");

      // Same pages at an address no website matches.
      await page.goto(server.url("feed.html", "127.0.0.1"));
      await expect(page.locator("article.filter-bubble")).toHaveCount(0);
      await expect.poll(() => extension.badgeText(page)).toBe("");
    }
  });
});
