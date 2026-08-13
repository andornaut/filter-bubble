import { expect, settle, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

// Capability: the way into the extension UI that the browser provides itself -
// "Extension options" on the toolbar button's menu and on chrome://extensions,
// both of which call `runtime.openOptionsPage()`. Every other spec opens
// popup.html at a URL of its own choosing, which exercises the page but not the
// manifest that decides where the browser puts it.
test.describe("the options entry point", () => {
  test("opens the extension UI in an ordinary tab", async ({ extension }) => {
    await extension.seed(SEED);

    const ui = await extension.openOptionsPage();

    await expect(ui).toHaveURL(extension.popupUrl());
    await expect(ui.locator(".app__nav")).toBeVisible();
    await expect(ui.locator(".app__tab--active")).toHaveText("Topics");

    // `options_ui.open_in_tab` is what makes this a tab in a normal window
    // rather than a view the browser embeds in its own settings UI, and the
    // difference decides a role: an embedded view answers `tabs.getCurrent()`
    // the way the browser-action popup does, so `isPopup()` has a second signal
    // to fall back on there. Here the tab is the answer, and it must stay one.
    expect(await extension.windowTypeFor(extension.popupUrl())).toBe("normal");
  });

  test("does not preview the page it was opened over", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await extension.openOptionsPage();
    await expect(ui.locator(".app")).toBeVisible();

    // Back to the filtered page, which the options tab took the foreground
    // from: a background tab is left alone whatever the state says, so looking
    // at it again is what asks the background to decide about it.
    await page.bringToFront();
    await settle(page);

    // An options page can stay open for as long as the user likes. If it held
    // the highlight port the popup holds, every filtered page would sit there
    // showing the content it was configured to hide.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a1")).not.toHaveClass(
      /filter-bubble--highlight/,
    );
    await expect(page.locator("#a1")).toBeHidden();
  });

  test("configures filtering from there like any other role", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ websites: SEED.websites });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    const ui = await extension.openOptionsPage();
    await ui.locator('form input[name="text"]').fill("politics");
    await ui.getByRole("button", { name: "Add", exact: true }).click();
    await expect(ui.locator(".topics__text")).toHaveText(["politics"]);

    // The same page in a different place is still the whole extension UI, and
    // a tab the user is not looking at is reached as soon as they look at it.
    await page.bringToFront();
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });
});
