import { expect, test } from "../helpers/fixtures.js";

const WEBSITES = [
  { addresses: ["localhost"], id: "site-localhost", selectors: ["article"] },
];

const addTopic = async (ui, text) => {
  await ui.locator('form input[name="text"]').fill(text);
  await ui.getByRole("button", { name: "Add", exact: true }).click();
};

// Capability: a topic is a set of phrases matched literally, case-insensitively
// and as whole words - never as a regular expression, however it is spelled.
test.describe("topics", () => {
  test("treats regex metacharacters in a topic as literal text", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [
        { id: "topic-cpp", text: ["c++"] },
        { id: "topic-dot", text: ["a.b"] },
      ],
      websites: WEBSITES,
    });
    await page.goto(server.url("special.html"));

    await expect(page.locator("#s-cpp")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#s-dot")).toHaveClass(/filter-bubble--remove/);
    // "a.b" as a pattern would match "axb"; as text it does not.
    await expect(page.locator("#s-axb")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#s-plain")).not.toHaveClass(/filter-bubble/);
  });

  test("matches a topic that is nothing but metacharacters", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-star", text: [".*"] }],
      websites: WEBSITES,
    });
    await page.goto(server.url("special.html"));

    // Unescaped, ".*" would match every element on the page.
    await expect(page.locator("#s-star")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("article.filter-bubble")).toHaveCount(1);
  });

  test("matches regardless of case", async ({ extension, page, server }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
      websites: WEBSITES,
    });
    await page.goto(server.url("special.html"));

    await expect(page.locator("#s-upper")).toHaveClass(/filter-bubble--remove/);
  });

  test("splits a comma-separated entry into separate phrases", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ websites: WEBSITES });
    await page.goto(server.url("feed.html"));

    const ui = await extension.openWindow();
    await addTopic(ui, " Politics , sports , politics ");

    // Canonicalized on the way in: trimmed, lowercased, de-duplicated, sorted.
    await expect(ui.locator(".topics__text")).toHaveText(["politics, sports"]);
    // Both phrases belong to one topic, not one topic each. Ids derive from
    // `createdDate`, so there is no content-derived key to wait for: poll for
    // the single stored topic, then read it.
    const storedTopics = async () =>
      Object.entries(await extension.syncStorage())
        .filter(([key]) => key.startsWith("t:"))
        .map(([, value]) => value);
    await expect.poll(async () => (await storedTopics()).length).toBe(1);

    const [stored] = await storedTopics();
    expect(stored.text).toEqual(["politics", "sports"]);

    // Both phrases filter.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a3")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);
  });

  test("editing a topic re-filters the open tab", async ({
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

    const ui = await extension.openWindow();
    await ui.locator(".list__content").click();
    await ui.locator('form input[name="text"]').fill("sports");
    await ui.getByRole("button", { name: "Save" }).click();

    await expect(ui.locator(".topics__text")).toHaveText(["sports"]);
    // The old phrase stops filtering and the new one starts, with no reload.
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#a3")).toHaveClass(/filter-bubble--remove/);
  });

  test("rejects a duplicate topic and an empty one", async ({ extension }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
    });
    const ui = await extension.openWindow();

    await addTopic(ui, "politics");
    await expect(ui.locator(".errors")).toContainText("Duplicate item");
    await expect(ui.locator(".list__item")).toHaveCount(1);

    // Whitespace survives the form's own required check, so the app has to
    // reject it after trimming.
    await addTopic(ui, "   ");
    await expect(ui.locator(".errors")).toContainText(
      'Please fill in the "Text" field',
    );
    await expect(ui.locator(".list__item")).toHaveCount(1);
  });

  test("stops filtering when the last enabled topic is disabled", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [
        { id: "topic-politics", text: ["politics"] },
        { id: "topic-sports", text: ["sports"] },
      ],
      websites: WEBSITES,
    });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("article.filter-bubble")).toHaveCount(2);

    const ui = await extension.openWindow();
    for (const item of await ui.locator(".list__toggle").all()) {
      await item.click();
    }

    // An empty pattern must filter nothing rather than match everything.
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
    await expect.poll(() => extension.badgeText(page)).toBe("");
  });
});
