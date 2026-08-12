import { expect, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

// Capability: while the browser-action popup is open, filtered content is shown
// highlighted instead of hidden, so the user can see what their rules catch.
// The popup signals it is open by holding a `runtime.connect` port; the real
// popup window cannot be opened by automation, so the tests hold that port
// themselves - see `Extension.connectPopupPort`.
test.describe("highlight mode", () => {
  test("highlights instead of removing while the popup is open", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const closePopup = await extension.connectPopupPort();

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--highlight/);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble--remove/);
    // Highlighted content is on screen - that is the point of the mode.
    await expect(page.locator("#a1")).toBeVisible();
    expect(
      await page
        .locator("#a1")
        .evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("solid");

    // Content that matches nothing stays untouched in highlight mode too.
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);

    await closePopup();

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a1")).toBeHidden();
  });

  test("highlights a tab opened while the popup is already open", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    const closePopup = await extension.connectPopupPort();

    await page.goto(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--highlight/);
    await closePopup();
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("still reports the filtered count while highlighting", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [
        { id: "topic-politics", text: ["politics"] },
        { id: "topic-sports", text: ["sports"] },
      ],
      websites: SEED.websites,
    });
    await page.goto(server.url("feed.html"));
    await expect.poll(() => extension.badgeText(page)).toBe("2");

    const closePopup = await extension.connectPopupPort();
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--highlight/);
    await expect.poll(() => extension.badgeText(page)).toBe("2");

    await closePopup();
  });
});
