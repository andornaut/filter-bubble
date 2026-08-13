import { expect, test } from "../helpers/fixtures.js";

const WEBSITES = [
  { addresses: ["localhost"], id: "site-localhost", selectors: ["article"] },
];

const seedTopic = (extension, text) =>
  extension.seed({
    topics: [{ id: "topic-1", text: [text] }],
    websites: WEBSITES,
  });

// Capability: topics are not English-only. The word boundaries are built from
// `\w`, which is ASCII, so how a phrase behaves at its edges depends on the
// script it is written in - worth knowing exactly where that lands.
test.describe("topics in other languages", () => {
  test("matches an accented phrase, whatever its case", async ({
    extension,
    page,
    server,
  }) => {
    await seedTopic(extension, "élection");
    await page.goto(server.url("international.html"));

    await expect(page.locator("#i-accent")).toHaveClass(
      /filter-bubble--remove/,
    );
    // Case-insensitive matching folds accented letters too.
    await expect(page.locator("#i-accent-upper")).toHaveClass(
      /filter-bubble--remove/,
    );
    await expect(page.locator("#i-plain")).not.toHaveClass(/filter-bubble/);
  });

  test("does not match an accented phrase inside a longer word", async ({
    extension,
    page,
    server,
  }) => {
    await seedTopic(extension, "élection");
    await page.goto(server.url("international.html"));
    await expect(page.locator("#i-accent")).toHaveClass(
      /filter-bubble--remove/,
    );

    // "électeurs" contains no whole "élection", and the trailing "s" of a
    // hypothetical plural would be a word character either way.
    await expect(page.locator("#i-accent-longer")).not.toHaveClass(
      /filter-bubble/,
    );
  });

  test("matches a Cyrillic phrase", async ({ extension, page, server }) => {
    await seedTopic(extension, "выборы");
    await page.goto(server.url("international.html"));

    await expect(page.locator("#i-cyrillic")).toHaveClass(
      /filter-bubble--remove/,
    );
    await expect(page.locator("#i-plain")).not.toHaveClass(/filter-bubble/);
  });

  test("matches a phrase in a script that does not space its words", async ({
    extension,
    page,
    server,
  }) => {
    await seedTopic(extension, "日本語");
    await page.goto(server.url("international.html"));

    await expect(page.locator("#i-cjk")).toHaveClass(/filter-bubble--remove/);

    // Pinned, and the right outcome here: `\w` matches no CJK character, so
    // the boundaries never bite and the phrase matches inside a longer run of
    // characters. In a script written without spaces that is the only way a
    // phrase could match at all.
    await expect(page.locator("#i-cjk-longer")).toHaveClass(
      /filter-bubble--remove/,
    );
  });

  test("matches a phrase written with an emoji", async ({
    extension,
    page,
    server,
  }) => {
    await seedTopic(extension, "🌱 gardening");
    await page.goto(server.url("international.html"));

    await expect(page.locator("#i-emoji")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#i-plain")).not.toHaveClass(/filter-bubble/);
  });

  test("round-trips a non-ASCII topic through the UI and storage", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ websites: WEBSITES });
    await page.goto(server.url("international.html"));

    const ui = await extension.openWindow();
    await ui.locator('form input[name="text"]').fill("Выборы, ÉLECTION");
    await ui.getByRole("button", { name: "Add", exact: true }).click();

    // Canonicalized the same way as any other topic: trimmed, lowercased and
    // sorted, with the lowercasing following each script's own rules. The sort
    // is by code unit rather than by locale, which is what keeps the stored
    // order - and so duplicate detection - the same on every device.
    await expect(ui.locator(".topics__text")).toHaveText(["élection, выборы"]);
    await expect(page.locator("#i-cyrillic")).toHaveClass(
      /filter-bubble--remove/,
    );
    await expect(page.locator("#i-accent")).toHaveClass(
      /filter-bubble--remove/,
    );
  });
});
