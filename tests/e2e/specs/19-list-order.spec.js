import { expect, test } from "../helpers/fixtures.js";

// Distinct, ordered dates so the expected list order is unambiguous.
const DATES = {
  middle: "2022-06-01T00:00:00.000Z",
  newest: "2023-01-01T00:00:00.000Z",
  oldest: "2021-01-01T00:00:00.000Z",
};

const topic = (name, text) => ({
  createdDate: DATES[name],
  enabled: true,
  id: `topic-${name}`,
  modifiedDate: DATES[name],
  sortDate: DATES[name],
  text: [text],
});

const seedTopics = (extension) =>
  extension.setSyncStorage({
    schema: 2,
    "t:topic-middle": topic("middle", "middle"),
    "t:topic-newest": topic("newest", "newest"),
    "t:topic-oldest": topic("oldest", "oldest"),
  });

// Capability: the list is ordered by when each item was last put there by the
// user, and the changes that are not the user rewriting an item leave that
// order alone.
test.describe("list order and selection", () => {
  test("lists the most recently changed item first", async ({ extension }) => {
    await seedTopics(extension);
    const ui = await extension.openWindow();

    await expect(ui.locator(".topics__text")).toHaveText([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  test("does not reorder the list when an item is toggled", async ({
    extension,
  }) => {
    await seedTopics(extension);
    const ui = await extension.openWindow();

    await ui
      .locator(".list__item", { hasText: "oldest" })
      .locator(".list__toggle")
      .click();
    await expect(
      ui.locator(".list__item", { hasText: "oldest" }).locator(".list__toggle"),
    ).toHaveText("Enable");

    // Toggling bumps `modifiedDate` so the change wins the sync merge, but
    // leaves `sortDate` alone: switching a topic off must not move it.
    await expect(ui.locator(".topics__text")).toHaveText([
      "newest",
      "middle",
      "oldest",
    ]);
    const stored = (await extension.syncStorage())["t:topic-oldest"];
    expect(stored.sortDate).toBe(DATES.oldest);
    expect(stored.modifiedDate.localeCompare(DATES.newest)).toBe(1);
  });

  test("moves an item to the top when it is edited or added", async ({
    extension,
  }) => {
    await seedTopics(extension);
    const ui = await extension.openWindow();

    await ui
      .locator(".list__item", { hasText: "oldest" })
      .locator(".list__content")
      .click();
    await ui.locator('form input[name="text"]').fill("edited");
    await ui.getByRole("button", { name: "Save" }).click();

    await expect(ui.locator(".topics__text")).toHaveText([
      "edited",
      "newest",
      "middle",
    ]);

    await ui.locator('form input[name="text"]').fill("added");
    await ui.getByRole("button", { name: "Add", exact: true }).click();

    await expect(ui.locator(".topics__text")).toHaveText([
      "added",
      "edited",
      "newest",
      "middle",
    ]);
  });

  test("keeps a selection on an item another device edits", async ({
    extension,
  }) => {
    await seedTopics(extension);
    const ui = await extension.openWindow();

    await ui
      .locator(".list__item", { hasText: "middle" })
      .locator(".list__content")
      .click();
    await expect(ui.locator('form input[name="text"]')).toHaveValue("middle");

    // The other device rewrites the item that is open in the form here.
    await extension.setSyncStorage({
      "t:topic-middle": {
        ...topic("middle", "middle rewritten elsewhere"),
        modifiedDate: "2024-01-01T00:00:00.000Z",
      },
    });

    // The selection follows the item rather than holding a stale copy of it.
    await expect(
      ui.locator(".list__item", { hasText: "middle rewritten elsewhere" }),
    ).toHaveAttribute("class", /list__item--active/);
    await expect(ui.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("drops a selection on an item another device deletes", async ({
    extension,
  }) => {
    await seedTopics(extension);
    const ui = await extension.openWindow();

    await ui
      .locator(".list__item", { hasText: "middle" })
      .locator(".list__content")
      .click();
    await expect(ui.getByRole("button", { name: "Save" })).toBeVisible();

    // A tombstone for the selected item arrives from another device.
    await extension.setSyncStorage({
      "t:topic-middle": {
        deleted: true,
        id: "topic-middle",
        modifiedDate: "2024-01-01T00:00:00.000Z",
      },
    });

    // The form collapses back to Add rather than editing an item that is gone.
    await expect(ui.locator(".list__item")).toHaveCount(2);
    await expect(
      ui.getByRole("button", { name: "Add", exact: true }),
    ).toBeVisible();
    await expect(ui.getByRole("button", { name: "Save" })).toHaveCount(0);
  });
});
