import { expect, settle, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

const importPages = (context) =>
  context.pages().filter((page) => page.url().endsWith("#import"));

// Capability: popup.html serves three roles - the browser-action popup, the
// options page, and the import page - and behaves differently in each.
test.describe("the extension UI's roles", () => {
  test("opens the tab named in the URL fragment", async ({ extension }) => {
    await extension.seed(SEED);

    const ui = await extension.newWindow(await extension.popupUrl("#websites"));
    await ui.waitForSelector("#root *");

    await expect(ui.locator(".app__tab--active")).toHaveText("Websites");
    await expect(ui.locator(".websites__addresses")).toContainText("localhost");

    // And the fragment drives navigation afterwards, not just on load.
    await ui.locator(".app__nav").getByRole("link", { name: "Topics" }).click();
    await expect(ui).toHaveURL(/#topics$/);
    await expect(ui.locator(".app__tab--active")).toHaveText("Topics");
    await expect(ui.locator(".topics__text")).toHaveText("politics");
  });

  test("renders the import page rather than the app at #import", async ({
    extension,
  }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow("import");

    await expect(ui.locator(".import__title")).toHaveText(
      "Import Filter Bubble data",
    );
    await expect(ui.locator(".app__nav")).toHaveCount(0);
    await expect(ui.locator(".list__item")).toHaveCount(0);
  });

  test("keeps one import tab rather than stacking them up", async ({
    context,
    extension,
  }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();

    await ui.getByRole("link", { name: "Import" }).click();
    await expect.poll(() => importPages(context).length).toBe(1);

    // The import page opens in a tab because the popup would close as soon as
    // the file dialog opened. Asking for it again focuses the tab that is
    // already open instead of leaving a trail of them.
    await ui.getByRole("link", { name: "Import" }).click();
    await ui.getByRole("link", { name: "Import" }).click();
    await settle(ui);

    expect(importPages(context)).toHaveLength(1);
    const [imported] = importPages(context);
    await expect(imported.locator(".import__title")).toBeVisible();
  });

  test("does not turn on highlight mode when opened as a tab", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    // Only the browser-action popup opens the background's highlight port. The
    // options page can stay open indefinitely, so if it opened that port every
    // filtered page would sit highlighted instead of filtered.
    const ui = await extension.openWindow();
    await expect(ui.locator(".app")).toBeVisible();
    await settle(page);

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a1")).not.toHaveClass(
      /filter-bubble--highlight/,
    );
  });

  test("shows and hides the help text", async ({ extension }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();

    await expect(ui.getByRole("link", { name: "Show help" })).toBeVisible();
    await ui.getByRole("link", { name: "Show help" }).click();

    await expect(ui.locator(".help__content")).toBeVisible();
    await ui.getByRole("link", { name: "Hide help" }).click();
    await expect(ui.locator(".help__content")).toHaveCount(0);
  });
});
