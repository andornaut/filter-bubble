import { expect, test } from "../helpers/fixtures.js";

const TOPICS = [
  { id: "topic-politics", text: ["politics"] },
  { id: "topic-sports", text: ["sports"] },
];

// Capability: several configured websites coexist, including the shipped
// defaults, and the right one governs each page.
test.describe("several websites", () => {
  test("refuses to configure two websites over the same domain", async ({
    extension,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [
        { addresses: ["localhost"], id: "site-a", selectors: ["#a1"] },
      ],
    });

    const ui = await extension.openWindow();
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await ui
      .locator('form input[name="addresses"]')
      .fill("localhost, news.localhost");
    await ui.locator('form input[name="selectors"]').fill("#a3");
    await ui.getByRole("button", { name: "Add", exact: true }).click();

    // Only one website can govern a page, so a second one covering the same
    // domain would sit in the list looking configured while doing nothing.
    await expect(ui.locator(".errors")).toContainText(
      "Already covered by another website: localhost",
    );
    await expect(ui.locator(".list__item")).toHaveCount(1);
  });

  test("applies only the rules of the website it matched", async ({
    extension,
    page,
    server,
  }) => {
    // The UI refuses to create this, but sync from a device on an older
    // release, or an imported backup, can still deliver it: two websites
    // covering one address with different selectors.
    await extension.seed({
      topics: TOPICS,
      websites: [
        {
          addresses: ["localhost"],
          id: "site-a",
          selectors: ["#a1"],
        },
        {
          addresses: ["127.0.0.1", "localhost"],
          id: "site-b",
          selectors: ["#a3"],
        },
      ],
    });
    await page.goto(server.url("feed.html"));
    await page.waitForTimeout(500);

    // Pinned, not endorsed: the selectors are not combined, so one of the two
    // configurations silently does nothing on this page. Which one is settled
    // by storage key order - `storage.sync.get` returns keys sorted, and the
    // first matching website governs the page - so it is the older of the two,
    // ids being epoch milliseconds.
    await expect(page.locator("article.filter-bubble")).toHaveCount(1);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("lets a website the user configured govern a shipped default's address", async ({
    extension,
    page,
    server,
  }) => {
    // The useful side of the same rule: a shipped default's id begins with a
    // letter and a user-created one with a digit, which sorts first, so
    // configuring a site yourself overrides the selectors Filter Bubble ships
    // for it rather than being shadowed by them.
    await extension.seed({
      topics: TOPICS,
      websites: [
        {
          addresses: ["localhost"],
          id: "default-example",
          selectors: ["#a3"],
        },
        { addresses: ["localhost"], id: "1700000000000", selectors: ["#a1"] },
      ],
    });
    await page.goto(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a3")).not.toHaveClass(/filter-bubble/);
  });

  test("picks the website whose addresses match, not merely the first", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [
        { addresses: ["localhost"], id: "site-localhost", selectors: ["#a1"] },
        { addresses: ["127.0.0.1"], id: "site-ip", selectors: ["#a3"] },
      ],
    });

    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a3")).not.toHaveClass(/filter-bubble/);

    await page.goto(server.url("feed.html", "127.0.0.1"));
    await expect(page.locator("#a3")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
  });

  test("skips a disabled website in favour of an enabled one", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [
        {
          addresses: ["localhost"],
          enabled: false,
          id: "site-disabled",
          selectors: ["#a1"],
        },
        {
          addresses: ["localhost"],
          id: "site-enabled",
          selectors: ["#a3"],
        },
      ],
    });
    await page.goto(server.url("feed.html"));

    // A disabled website is not in the list the background matches against, so
    // it cannot shadow an enabled one that covers the same address.
    await expect(page.locator("#a3")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
  });

  test("leaves the shipped defaults in place alongside a custom website", async ({
    extension,
    page,
    server,
  }) => {
    // Seeded by opening the UI, exactly as a fresh install would be.
    const ui = await extension.openWindow();
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await expect(ui.locator(".list__item")).toHaveCount(4);

    await ui.locator('form input[name="addresses"]').fill("localhost");
    await ui.locator('form input[name="selectors"]').fill("article");
    await ui.getByRole("button", { name: "Add", exact: true }).click();
    await expect(ui.locator(".list__item")).toHaveCount(5);

    await ui.locator(".app__nav").getByRole("link", { name: "Topics" }).click();
    await ui.locator('form input[name="text"]').fill("politics");
    await ui.getByRole("button", { name: "Add", exact: true }).click();

    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    // The defaults are untouched by the addition.
    const stored = await extension.syncStorage();
    expect(
      Object.keys(stored).filter((key) => key.startsWith("w:default-")),
    ).toHaveLength(4);
  });
});
