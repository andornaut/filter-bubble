import { expect, test } from "../helpers/fixtures.js";

const SEED = {
  topics: [{ id: "topic-politics", text: ["politics"] }],
  websites: [
    { addresses: ["localhost"], id: "site-localhost", selectors: ["article"] },
  ],
};

// Capability: the browser-wide off switch wins over the popup's highlight
// preview. The two are set from different places - the switch from
// `storage.local`, highlighting from the port the popup holds open - and both
// end up deciding what one tab shows, so they have to agree.
test.describe("the off switch and the popup together", () => {
  test("does not highlight while filtering is switched off", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    await extension.setDisabled(true);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);

    const closePopup = await extension.connectPopupPort();
    await page.waitForTimeout(500);

    // Off means off: opening the popup previews nothing, because there is
    // nothing being filtered to preview.
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
    await expect.poll(() => extension.badgeText(page)).toBe("");

    await closePopup();
  });

  test("starts highlighting as soon as filtering is switched back on", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await extension.setDisabled(true);
    await page.goto(server.url("feed.html"));

    const closePopup = await extension.connectPopupPort();
    await page.waitForTimeout(500);
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    // The popup is still open, so re-enabling has to land in highlight mode
    // rather than hiding the content out from under a user who is looking
    // straight at it.
    await extension.setDisabled(false);

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--highlight/);
    await expect(page.locator("#a1")).toBeVisible();
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble--remove/);

    await closePopup();
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("reveals highlighted content when filtering is switched off under it", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    const closePopup = await extension.connectPopupPort();
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--highlight/);

    // Turning the switch off from the popup that is doing the highlighting.
    await extension.setDisabled(true);

    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
    await expect(page.locator("#a1")).toBeVisible();
    expect(
      await page
        .locator("#a1")
        .evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("none");

    await closePopup();
  });

  test("leaves a tab opened while disabled plain, popup or no popup", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await extension.setDisabled(true);
    const closePopup = await extension.connectPopupPort();

    // The tab arrives into a browser that is already switched off with the
    // popup already open, which is the one ordering no other test covers.
    await page.goto(server.url("feed.html"));
    await page.waitForTimeout(500);

    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
    await expect.poll(() => extension.badgeText(page)).toBe("");

    await extension.setDisabled(false);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--highlight/);

    await closePopup();
  });
});
