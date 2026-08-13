import { expect, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

// Capability: what the extension decides is decided for the browser, not for
// one window of it. The popup previews in every window while it is open, and
// the off switch stops filtering in every window. `tabs.onActivated` does not
// fire for a window the user merely looks at, so anything applied to "the
// current window" would leave the others showing superseded state until they
// happened to navigate - and a service worker asking for the current window
// gets the last focused one, which is nothing at all when no window has focus.
test.describe("several windows at once", () => {
  test("previews in every window while the popup is open", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    const second = await extension.newWindow(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(second.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const closePopup = await extension.connectPopupPort();

    // The popup floats over one window, but what it previews is the filtering,
    // which is not a per-window thing: a second window on a second monitor is
    // in plain view while the popup is open, and showing it still hidden would
    // read as the preview having missed content it in fact catches.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--highlight/);
    await expect(second.locator("#a1")).toHaveClass(/filter-bubble--highlight/);
    await expect(page.locator("#a1")).toBeVisible();
    await expect(second.locator("#a1")).toBeVisible();

    await closePopup();

    // And closing it returns every window to filtering. A window left in
    // highlight mode would sit there showing the content the user configured
    // the extension to take away, until something else happened to it.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(second.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a1")).toBeHidden();
    await expect(second.locator("#a1")).toBeHidden();
  });

  test("keeps each window's count to its own tab while previewing", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    const second = await extension.newWindow(server.url("feed.html"));

    // Two windows on the same page, with one more match in the first: neither
    // window can pass by reporting the other's count, and neither tab can be
    // told from the other by its URL.
    await page.click("#append");
    await expect.poll(() => extension.badgeText(page)).toBe("2");
    await expect.poll(() => extension.badgeText(second)).toBe("1");

    const closePopup = await extension.connectPopupPort();

    // Turning on the preview re-sends every visible tab its filtering, so each
    // one counts again. The badge is per tab, and each window's toolbar shows
    // the tab in front of it.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--highlight/);
    await expect(second.locator("#a1")).toHaveClass(/filter-bubble--highlight/);
    await expect.poll(() => extension.badgeText(page)).toBe("2");
    await expect.poll(() => extension.badgeText(second)).toBe("1");

    await closePopup();
  });

  test("switches every window off from the window the user is in", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    const second = await extension.newWindow(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(second.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await extension.openWindow();
    const status = ui.locator(".footer__status-link");
    await status.click();
    await expect(status).toHaveText("Disabled");

    // The switch is the whole browser's, so a user who turns it off in front of
    // one window does not then have to go and find the rest. It arrives as a
    // `storage.local` change, from a click in a third window - the same sweep
    // `10-tab-lifecycle` covers for a synced change, reached the way a user
    // reaches it.
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
    await expect(second.locator("#a1")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#a1")).toBeVisible();
    await expect(second.locator("#a1")).toBeVisible();

    await status.click();
    await expect(status).toHaveText("Enabled");

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(second.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });
});
