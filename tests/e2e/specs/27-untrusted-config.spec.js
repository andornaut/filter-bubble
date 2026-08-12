import { expect, settle, test } from "../helpers/fixtures.js";
import { LOCALHOST_WEBSITE, POLITICS_TOPIC } from "../helpers/seed.js";

// Capability: configuration that never passed through the add/edit form -
// synced in from another device, from a release with different rules, or
// hand-written into storage - cannot make the extension do something the user
// would never have asked for. The form rejects all of this at the point it is
// typed; nothing rejects it at the point it arrives.
test.describe("configuration that never passed the form", () => {
  test("an empty phrase does not blank the page", async ({
    extension,
    page,
    server,
  }) => {
    // The worst case in the whole configuration: an empty alternative in the
    // pattern matches at every position, so every container on every matched
    // website would be filtered - the reader's feeds simply go blank.
    await extension.seed({
      topics: [{ id: "topic-empty", text: [""] }],
      websites: [LOCALHOST_WEBSITE],
    });
    await page.goto(server.url("feed.html"));
    await settle(page);

    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
    await expect(page.locator("#a1")).toBeVisible();
    await expect.poll(() => extension.badgeText(page)).toBe("");
  });

  test("ignores an empty phrase alongside a real one", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["", "politics"] }],
      websites: [LOCALHOST_WEBSITE],
    });
    await page.goto(server.url("feed.html"));

    // The empty phrase is dropped, the real one still works: one item, not all
    // of them and not none of them.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);
    await expect.poll(() => extension.badgeText(page)).toBe("1");
  });

  test("a topic with nothing but empty phrases is inert", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-empty", text: ["", ""] }, POLITICS_TOPIC],
      websites: [LOCALHOST_WEBSITE],
    });
    await page.goto(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("article.filter-bubble")).toHaveCount(1);
  });

  test("a website with no selectors filters nothing and wedges nothing", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [POLITICS_TOPIC],
      websites: [{ ...LOCALHOST_WEBSITE, selectors: [] }],
    });
    await page.goto(server.url("feed.html"));
    await settle(page);

    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    // Giving it a selector afterwards starts filtering, which is the evidence
    // that the empty one left nothing broken behind it.
    await extension.seed({
      topics: [POLITICS_TOPIC],
      websites: [LOCALHOST_WEBSITE],
    });

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("a website with no addresses matches nothing and shadows nothing", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [POLITICS_TOPIC],
      websites: [
        // An entry with no addresses is checked first and matches no URL, so
        // the entry that does cover this page still governs it.
        { addresses: [], id: "site-nowhere", selectors: [".thing"] },
        LOCALHOST_WEBSITE,
      ],
    });
    await page.goto(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);
  });
});
