import { expect, test } from "../helpers/fixtures.js";

const DATE = "2020-01-01T00:00:00.000Z";

const dates = { createdDate: DATE, modifiedDate: DATE, sortDate: DATE };

// A topic whose phrases are a string where the app expects a list. Nothing
// validates what storage hands back - the form and the import page are where
// configuration is checked - so a value like this reaches the views as it is,
// and rendering it throws where a list method is called on a string.
const brokenTopic = {
  ...dates,
  enabled: true,
  id: "topic-broken",
  text: "politics",
};

const fixedTopic = { ...brokenTopic, text: ["politics"] };

const website = {
  ...dates,
  addresses: ["localhost"],
  enabled: true,
  hideInsteadOfRemove: false,
  id: "site-localhost",
  selectors: ["article"],
};

// Capability: what the user sees when the extension UI cannot render. Storage
// is a namespace another device, another release, or anything else with access
// can write to, and a value the views cannot handle takes the render down with
// it. The boundary turns that into a message and a way out instead of a blank
// popup, and filtering carries on regardless: the background reads storage
// itself and shares nothing with the UI.
test.describe("the failure UI", () => {
  test("says so instead of coming up blank", async ({ extension }) => {
    await extension.setSyncStorage({
      schema: 2,
      "t:topic-broken": brokenTopic,
    });

    const ui = await extension.openWindow();

    await expect(ui.locator(".error-boundary")).toBeVisible();
    await expect(ui.locator(".error-boundary h2")).toHaveText(
      "Something went wrong",
    );
    // The message names the failure rather than describing it in the abstract,
    // which is what makes a bug report from a user worth anything.
    await expect(ui.locator(".error-boundary p")).not.toBeEmpty();
    await expect(ui.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("comes back when the cause is gone", async ({ extension }) => {
    await extension.setSyncStorage({
      schema: 2,
      "t:topic-broken": brokenTopic,
    });
    const ui = await extension.openWindow();
    await expect(ui.locator(".error-boundary")).toBeVisible();

    // The other device corrects what it sent, which is the repair a user has
    // available: they cannot edit an item the UI will not show them. The
    // correction arrives through the subscription `initState` left running,
    // which the failed render did not take down with it.
    await extension.setSyncStorage({ "t:topic-broken": fixedTopic });
    await ui.getByRole("button", { name: "Try again" }).click();

    // Retrying renders the children again, and this time they render.
    await expect(ui.locator(".topics__text")).toHaveText(["politics"]);
    await expect(ui.locator(".error-boundary")).toHaveCount(0);
  });

  test("holds the failure when retrying changes nothing", async ({
    extension,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      "t:topic-broken": brokenTopic,
    });
    const ui = await extension.openWindow();
    await expect(ui.locator(".error-boundary")).toBeVisible();

    await ui.getByRole("button", { name: "Try again" }).click();

    // Retrying into the same failure has to leave the message and the button
    // where they were: the children render, throw again, and are caught again.
    // A button that empties the page is worse than no button.
    await expect(ui.locator(".error-boundary")).toBeVisible();
    await expect(ui.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("keeps filtering while the UI cannot render", async ({
    extension,
    page,
    server,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      "t:topic-broken": brokenTopic,
      "w:site-localhost": website,
    });
    await page.goto(server.url("feed.html"));

    // The background builds its pattern from the same value the views choke on,
    // and it does not choke: a popup nobody can open is not a reason for the
    // pages the user is reading to stop being filtered.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect.poll(() => extension.badgeText(page)).toBe("1");

    const ui = await extension.openWindow();
    await expect(ui.locator(".error-boundary")).toBeVisible();

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a1")).toBeHidden();
  });
});
