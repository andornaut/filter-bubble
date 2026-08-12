import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "../helpers/fixtures.js";
import { ROOT_DIR } from "../helpers/paths.js";

// The selectors under test are the shipped ones, read from the data file rather
// than copied here: changing a default's selectors changes what this asserts,
// which is the point. The fixture pages hold the structure those selectors were
// written against.
const defaults = JSON.parse(
  readFileSync(path.join(ROOT_DIR, "src/data/websites.json"), "utf8"),
);

const selectorsFor = (id) => {
  const website = defaults.list.find((item) => item.id === id);
  if (!website) {
    throw new Error(`No default website with id "${id}"`);
  }
  return website.selectors;
};

// Point a default's selectors at the fixture server, so the shipped
// configuration runs against a page shaped like the site it was written for.
const seedDefault = (extension, id) =>
  extension.seed({
    topics: [{ id: "topic-politics", text: ["politics"] }],
    websites: [
      {
        addresses: ["localhost"],
        id: "site-under-test",
        selectors: selectorsFor(id),
      },
    ],
  });

// Capability: the selectors Filter Bubble ships for the sites it supports out
// of the box pick out feed items, and only feed items.
test.describe("the shipped default selectors", () => {
  test("target Hacker News submission rows", async ({
    extension,
    page,
    server,
  }) => {
    await seedDefault(extension, "default-hackernews");
    await page.goto(server.url("defaults/hackernews.html"));

    await expect(page.locator("#s1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#s2")).not.toHaveClass(/filter-bubble/);
    // The row carrying a submission's score and comment count is a sibling of
    // the submission row, not a child, so it is left behind either way.
    await expect(page.locator("#s1-sub")).not.toHaveClass(/filter-bubble/);
  });

  test("leave the story you opened alone on a Hacker News item page", async ({
    extension,
    page,
    server,
  }) => {
    await seedDefault(extension, "default-hackernews");
    await page.goto(server.url("defaults/hackernews-item.html"));
    await page.waitForTimeout(500);

    // `:not(.fatitem *)` is what keeps the story you deliberately clicked
    // through to from being hidden out from under you.
    await expect(page.locator("#the-story")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#the-story")).toBeVisible();
    await expect(page.locator("#a-comment")).not.toHaveClass(/filter-bubble/);
  });

  test("target Tildes topic listing items", async ({
    extension,
    page,
    server,
  }) => {
    await seedDefault(extension, "default-tildes");
    await page.goto(server.url("defaults/tildes.html"));

    await expect(page.locator("#t1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#t2")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#sidebar")).not.toHaveClass(/filter-bubble/);
  });

  test("target Reddit posts in both layouts", async ({
    extension,
    page,
    server,
  }) => {
    await seedDefault(extension, "default-reddit");
    await page.goto(server.url("defaults/reddit.html"));

    // "article" covers the current site, ".listing-page .thing" old.reddit.
    await expect(page.locator("#r1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#r3")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#r2")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#r4")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#header")).not.toHaveClass(/filter-bubble/);
  });

  test("target Ars Technica home page items only", async ({
    extension,
    page,
    server,
  }) => {
    await seedDefault(extension, "default-arstechnica");
    await page.goto(server.url("defaults/arstechnica.html"));

    await expect(page.locator("#g1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#g2")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);
    // Both selectors are scoped to `main`, so site furniture stays put.
    await expect(page.locator("#site-nav")).not.toHaveClass(/filter-bubble/);
  });

  test("apply nothing on an Ars Technica page that is not the home page", async ({
    extension,
    page,
    server,
  }) => {
    await seedDefault(extension, "default-arstechnica");
    await page.goto(server.url("defaults/arstechnica-article.html"));
    await page.waitForTimeout(500);

    // Both selectors are scoped to `body.home`. An article page is not a feed,
    // so the story you opened stays put - and so does everything around it,
    // which is why the scoping is there rather than a bare "main article".
    await expect(page.locator(".filter-bubble")).toHaveCount(0);
    await expect(page.locator("#the-article")).toBeVisible();
    await expect(page.locator("#related")).toBeVisible();
  });

  test("cover every website in the shipped data file", async () => {
    // A new default with no fixture would otherwise go untested silently.
    expect(defaults.list.map((website) => website.id).sort()).toEqual([
      "default-arstechnica",
      "default-hackernews",
      "default-reddit",
      "default-tildes",
    ]);
  });
});
