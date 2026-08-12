import { expect, test } from "../helpers/fixtures.js";

const WEBSITES = [
  { addresses: ["localhost"], id: "site-localhost", selectors: ["article"] },
];

const addTopic = async (ui, text) => {
  await ui.locator('form input[name="text"]').fill(text);
  await ui.getByRole("button", { name: "Add", exact: true }).click();
};

// Capability: configuration changes made in the extension UI reach an already
// open tab, with no reload, in both directions.
test.describe("configuration from the extension UI", () => {
  test("adding a topic filters an already open tab", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ websites: WEBSITES });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    const ui = await extension.openWindow();
    await addTopic(ui, "politics");
    await expect(ui.locator(".list__item")).toHaveCount(1);

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);
  });

  test("disabling and re-enabling a topic toggles filtering live", async ({
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
    const toggle = ui.locator(".list__toggle");

    await expect(toggle).toHaveText("Disable");
    await toggle.click();
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);

    await expect(toggle).toHaveText("Enable");
    await toggle.click();
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("deleting the only topic unfilters the tab", async ({
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
    await ui.getByRole("button", { name: "Delete" }).click();

    await expect(ui.locator(".list__item")).toHaveCount(0);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
  });

  test("adding a website from the UI starts filtering it", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
    });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    const ui = await extension.openWindow();
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await ui.locator('form input[name="addresses"]').fill("localhost");
    await ui.locator('form input[name="selectors"]').fill("article");
    await ui.getByRole("button", { name: "Add", exact: true }).click();

    await expect(ui.locator(".websites__addresses")).toContainText("localhost");
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("rejects a website with no domain name and keeps the tab as it was", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
      websites: WEBSITES,
    });
    await page.goto(server.url("feed.html"));

    const ui = await extension.openWindow();
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await ui.locator('form input[name="selectors"]').fill("article");
    await ui.getByRole("button", { name: "Add", exact: true }).click();

    await expect(ui.locator(".errors")).toContainText("Domain names");
    await expect(ui.locator(".list__item")).toHaveCount(1);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });
});
