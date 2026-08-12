import { expect, test } from "../helpers/fixtures.js";

const TOPICS = [{ id: "topic-politics", text: ["politics"] }];

const website = (overrides = {}) => ({
  addresses: ["localhost"],
  id: "site-localhost",
  selectors: ["article"],
  ...overrides,
});

// Open the Websites tab and select the only website in the list for editing.
const editWebsite = async (extension) => {
  const ui = await extension.openWindow();
  await ui.locator(".app__nav").getByRole("link", { name: "Websites" }).click();
  await ui.locator(".list__content").click();
  await expect(ui.getByRole("button", { name: "Save" })).toBeVisible();
  return ui;
};

// Capability: a website's rules can be corrected in place - which is the
// everyday task, since selectors are written by hand and rarely right first
// time - and what gets stored is canonical regardless of how it was typed.
test.describe("editing a website", () => {
  test("applies changed selectors to an open tab, releasing the old ones", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    await page.goto(server.url("nested.html"));
    await expect(page.locator("#outer")).toHaveClass(/filter-bubble--remove/);

    const ui = await editWebsite(extension);
    await ui.locator('form input[name="selectors"]').fill(".thing");
    await ui.getByRole("button", { name: "Save" }).click();

    // The narrower selector takes over and the article it used to hide is
    // handed back: a changed rule set is a full reset, not an addition.
    await expect(page.locator("#inner")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#outer")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#outer h2")).toBeVisible();
    await expect.poll(() => extension.badgeText(page)).toBe("1");
  });

  test("switches an open tab between removing and hiding", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await editWebsite(extension);
    const hideInstead = ui.locator('form input[name="hideInsteadOfRemove"]');
    await expect(hideInstead).not.toBeChecked();
    await hideInstead.check();
    await ui.getByRole("button", { name: "Save" }).click();

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--hide/);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble--remove/);

    // ...and back again.
    await ui.locator(".list__content").click();
    await ui.locator('form input[name="hideInsteadOfRemove"]').uncheck();
    await ui.getByRole("button", { name: "Save" }).click();

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("canonicalizes however the addresses were typed", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [website({ addresses: ["127.0.0.1"] })],
    });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    const ui = await editWebsite(extension);
    // Mixed case, a scheme, a trailing slash (what copying a site's address
    // out of the browser gives you), a duplicate, and unsorted.
    await ui
      .locator('form input[name="addresses"]')
      .fill(" HTTPS://LocalHost/ , 127.0.0.1, localhost ");
    await ui.getByRole("button", { name: "Save" }).click();

    // Stored lowercased, scheme-stripped, de-duplicated and sorted, which is
    // the shape the background's address matching relies on.
    await expect
      .poll(
        async () =>
          (await extension.syncStorage())["w:site-localhost"].addresses,
      )
      .toEqual(["127.0.0.1", "localhost"]);
    await expect(ui.locator(".websites__addresses")).toContainText(
      "127.0.0.1, localhost",
    );

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("still rejects an address carrying a path or a port", async ({
    extension,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    const ui = await editWebsite(extension);
    const addresses = ui.locator('form input[name="addresses"]');

    // The field asks for a domain name; accepting a trailing slash must not
    // turn it into a field that takes URLs.
    for (const value of ["localhost/path", "http://localhost:8080"]) {
      await addresses.fill(value);
      await ui.getByRole("button", { name: "Save" }).click();
      await expect(ui.locator(".errors")).toContainText(
        `"${value}" isn't a valid domain name`,
      );
    }

    expect(
      (await extension.syncStorage())["w:site-localhost"].addresses,
    ).toEqual(["localhost"]);
  });

  test("rejects an invalid domain and leaves the website as it was", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await editWebsite(extension);
    await ui.locator('form input[name="addresses"]').fill("not a domain");
    await ui.getByRole("button", { name: "Save" }).click();

    await expect(ui.locator(".errors")).toContainText(
      "isn't a valid domain name",
    );
    // Nothing was written, and the tab is still filtered by the old rules.
    expect(
      (await extension.syncStorage())["w:site-localhost"].addresses,
    ).toEqual(["localhost"]);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("rejects an edit onto a domain another website already covers", async ({
    extension,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [
        website(),
        website({ addresses: ["127.0.0.1"], id: "site-ip" }),
      ],
    });

    const ui = await extension.openWindow();
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await ui
      .locator(".list__item", { hasText: "127.0.0.1" })
      .locator(".list__content")
      .click();

    // Sharing one domain name of several is enough: only one website can
    // govern a page, so the other would sit there doing nothing.
    await ui
      .locator('form input[name="addresses"]')
      .fill("127.0.0.1, localhost");
    await ui.getByRole("button", { name: "Save" }).click();

    await expect(ui.locator(".errors")).toContainText(
      "Already covered by another website: localhost",
    );
    expect((await extension.syncStorage())["w:site-ip"].addresses).toEqual([
      "127.0.0.1",
    ]);
  });

  test("lets a website keep its own domains when edited", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [
        website(),
        website({ addresses: ["127.0.0.1"], id: "site-ip" }),
      ],
    });
    await page.goto(server.url("feed.html"));

    // Editing anything else about a website must not have it collide with
    // itself over the addresses it already holds.
    const ui = await extension.openWindow();
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await ui
      .locator(".list__item", { hasText: "localhost" })
      .locator(".list__content")
      .click();
    await ui.locator('form input[name="selectors"]').fill("#a1");
    await ui.getByRole("button", { name: "Save" }).click();

    await expect(ui.locator(".errors")).toHaveCount(0);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("frees a domain for another website once it is given up", async ({
    extension,
  }) => {
    await extension.seed({
      topics: TOPICS,
      websites: [website({ addresses: ["127.0.0.1", "localhost"] })],
    });

    const ui = await extension.openWindow();
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();

    // Moving a domain to a website of its own: take it off the first entry...
    await ui.locator(".list__content").click();
    await ui.locator('form input[name="addresses"]').fill("127.0.0.1");
    await ui.getByRole("button", { name: "Save" }).click();
    await expect(ui.locator(".errors")).toHaveCount(0);

    // ...then it is free to add.
    await ui.locator('form input[name="addresses"]').fill("localhost");
    await ui.locator('form input[name="selectors"]').fill("#a1");
    await ui.getByRole("button", { name: "Add", exact: true }).click();

    await expect(ui.locator(".errors")).toHaveCount(0);
    await expect(ui.locator(".list__item")).toHaveCount(2);
  });

  test("keeps an edit out of the store until it is saved", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ topics: TOPICS, websites: [website()] });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await editWebsite(extension);
    await ui.locator('form input[name="selectors"]').fill(".nothing-here");
    await ui.getByRole("button", { name: "Cancel" }).click();

    await expect(
      ui.getByRole("button", { name: "Add", exact: true }),
    ).toBeVisible();
    expect(
      (await extension.syncStorage())["w:site-localhost"].selectors,
    ).toEqual(["article"]);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });
});
