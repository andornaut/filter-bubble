import { expect, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

// Capability: the extension UI can be driven and understood without a mouse or
// a screen. It is a small surface, which is what makes it worth getting right.
test.describe("accessibility of the extension UI", () => {
  test("labels every form field", async ({ extension }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();

    // A visible caption above a field is not a label unless it is tied to it.
    await expect(ui.getByLabel("Topics")).toBeVisible();
    await ui.getByLabel("Topics").fill("typed by label");
    await expect(ui.locator('form input[name="text"]')).toHaveValue(
      "typed by label",
    );

    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();
    await expect(ui.getByLabel("Domain names")).toBeVisible();
    await expect(ui.getByLabel("CSS selectors")).toBeVisible();
    await expect(ui.getByLabel("Hide instead of remove")).toHaveAttribute(
      "type",
      "checkbox",
    );
  });

  test("focuses a field when its label is clicked", async ({ extension }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();

    await ui.locator("label.form__label").click();

    await expect(ui.locator('form input[name="text"]')).toBeFocused();
  });

  test("names the off switch by what it does, not by its state", async ({
    extension,
  }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();

    // "Enabled, link" would not tell anyone what activating it would do.
    const off = ui.getByRole("link", {
      name: "Turn all filtering off in this browser",
    });
    await expect(off).toBeVisible();

    await off.click();

    await expect(
      ui.getByRole("link", { name: "Turn all filtering on in this browser" }),
    ).toBeVisible();
    // The tick and the crossed-out circle carry no information of their own.
    await expect(
      ui.locator('.footer__status [aria-hidden="true"]'),
    ).toHaveCount(1);
  });

  test("can be operated from the keyboard alone", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({ websites: SEED.websites });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    const ui = await extension.openWindow();

    // Add a topic without touching the mouse. Enter in the field submits the
    // form, which is the flow that matters: tabbing out of the field reaches
    // the links in the field's hint text first, not the Add button.
    await ui.getByLabel("Topics").focus();
    await ui.keyboard.type("politics");
    await ui.keyboard.press("Enter");

    await expect(ui.locator(".list__item")).toHaveCount(1);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    // Reaching the off switch and operating it, still without a mouse.
    await ui
      .getByRole("link", { name: "Turn all filtering off in this browser" })
      .focus();
    await ui.keyboard.press("Enter");

    await expect(ui.locator(".footer__status-link")).toHaveText("Disabled");
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
  });

  test("marks the selected item for assistive technology", async ({
    extension,
  }) => {
    await extension.seed({
      topics: [
        { id: "topic-politics", text: ["politics"] },
        { id: "topic-sports", text: ["sports"] },
      ],
      websites: SEED.websites,
    });
    const ui = await extension.openWindow();

    // Selection is shown with a background colour, which needs a counterpart
    // in the accessibility tree.
    await expect(ui.locator("[aria-current]")).toHaveCount(0);
    await ui
      .locator(".list__item", { hasText: "politics" })
      .locator(".list__content")
      .click();

    await expect(ui.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(ui.locator('[aria-current="true"]')).toContainText("politics");
  });

  test("gives the permission warning a text alternative", async ({
    extension,
  }) => {
    await extension.seed({
      topics: SEED.topics,
      websites: [
        ...SEED.websites,
        { addresses: ["127.0.0.2"], id: "site-ungranted", selectors: ["p"] },
      ],
    });
    const ui = await extension.openWindow();
    await ui
      .locator(".app__nav")
      .getByRole("link", { name: "Websites" })
      .click();

    // The ⚠️ is the only thing marking the website that cannot filter, so it
    // has to say what it means rather than being an unexplained emoji.
    const warning = ui.getByRole("img", {
      name: /won't be filtered until you grant/,
    });
    await expect(warning).toBeVisible();
  });

  test("names both toggle buttons on a list item", async ({ extension }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();

    // "politics" names the item; "Disable" names the action on it.
    await expect(ui.getByRole("button", { name: "politics" })).toBeVisible();
    await expect(ui.getByRole("button", { name: "Disable" })).toBeVisible();

    await ui.getByRole("button", { name: "Disable" }).click();
    await expect(ui.getByRole("button", { name: "Enable" })).toBeVisible();
  });
});
