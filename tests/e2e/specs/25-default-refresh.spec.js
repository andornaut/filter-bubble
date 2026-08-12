import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "../helpers/fixtures.js";
import { ROOT_DIR } from "../helpers/paths.js";

// The shipped data file, read rather than copied: correcting a default's
// selectors is exactly the change these tests are about, so they must assert
// against whatever is currently shipped.
const defaults = JSON.parse(
  readFileSync(path.join(ROOT_DIR, "src/data/websites.json"), "utf8"),
);

const shipped = (id) => {
  const website = defaults.list.find((item) => item.id === id);
  if (!website) {
    throw new Error(`No default website with id "${id}"`);
  }
  return website;
};

const OLD_SELECTORS = ["div.selector-from-an-older-release"];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// A shipped default as an already-migrated store holds it: whatever selectors
// the release that seeded it carried, and the two dates equal, which is the
// "nobody has edited this" sentinel.
const stored = (id, overrides = {}) => ({
  ...shipped(id),
  modifiedDate: shipped(id).createdDate,
  selectors: OLD_SELECTORS,
  ...overrides,
});

const websiteKeys = (raw) =>
  Object.keys(raw)
    .filter((key) => key.startsWith("w:"))
    .sort();

const storedWebsite = async (extension, id) =>
  (await extension.syncStorage())[`w:${id}`];

// Open the UI on the websites tab, which is what runs the read that folds the
// shipped defaults back in.
const openWebsites = async (extension) => {
  const ui = await extension.newWindow(await extension.popupUrl("#websites"));
  await ui.waitForSelector("#root *");
  return ui;
};

// Capability: a release that corrects a default website's selectors reaches
// installs that already seeded the old ones, without walking over anything the
// user has done to them. Seeding alone only ever covers a fresh install; this
// is the path every existing install takes.
test.describe("the shipped defaults on an existing install", () => {
  test("re-applies a corrected selector over a default nobody has edited", async ({
    extension,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      "w:default-tildes": stored("default-tildes"),
    });

    const ui = await openWebsites(extension);

    await expect
      .poll(
        async () =>
          (await storedWebsite(extension, "default-tildes")).selectors,
      )
      .toEqual(shipped("default-tildes").selectors);
    // And the user sees the corrected value, not just storage holding it.
    await expect(ui.locator(".websites__selectors")).toHaveText(
      shipped("default-tildes").selectors.join(", "),
    );

    // Its own dates are carried across rather than stamped with now. Writing
    // the shipped pair would move `modifiedDate` backwards, handing the sync
    // merge to any device still holding the later value, and would reorder the
    // list, which sorts on these dates.
    const record = await storedWebsite(extension, "default-tildes");
    expect(record.createdDate).toBe(shipped("default-tildes").createdDate);
    expect(record.modifiedDate).toBe(record.createdDate);
  });

  test("leaves a default the user has edited alone", async ({ extension }) => {
    const MINE = ["li.the-selector-i-chose"];
    await extension.setSyncStorage({
      schema: 2,
      // Edited: `modifiedDate` has moved past `createdDate`.
      "w:default-hackernews": stored("default-hackernews", {
        modifiedDate: "2024-05-05T00:00:00.000Z",
        selectors: MINE,
      }),
      "w:default-tildes": stored("default-tildes"),
    });

    await openWebsites(extension);

    // Settle on the untouched default first: it is the same pass that would
    // have overwritten the edited one, so "still mine" below cannot pass
    // merely by being read too early.
    await expect
      .poll(
        async () =>
          (await storedWebsite(extension, "default-tildes")).selectors,
      )
      .toEqual(shipped("default-tildes").selectors);
    expect(
      (await storedWebsite(extension, "default-hackernews")).selectors,
    ).toEqual(MINE);
  });

  test("keeps a default switched off while correcting its selectors", async ({
    extension,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      "w:default-tildes": stored("default-tildes", { enabled: false }),
    });

    const ui = await openWebsites(extension);

    // A selector correction has no business changing whether the user has the
    // site switched on.
    await expect
      .poll(
        async () =>
          (await storedWebsite(extension, "default-tildes")).selectors,
      )
      .toEqual(shipped("default-tildes").selectors);
    expect((await storedWebsite(extension, "default-tildes")).enabled).toBe(
      false,
    );
    await expect(ui.locator(".list__item")).toHaveClass(/list__item--disabled/);
    await expect(ui.getByRole("button", { name: "Enable" })).toBeVisible();
  });

  test("does not bring back a default the user deleted", async ({
    extension,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      // A tombstone carries a delete-time `modifiedDate` and no `createdDate`,
      // so it fails the "never edited" equality and stays deleted.
      //
      // Dated relative to now rather than fixed: tombstones are swept once they
      // are past the retention window, so a hard-coded date quietly stops being
      // a tombstone at all once enough time has passed - which is how this test
      // first passed for the wrong reason.
      "w:default-reddit": {
        deleted: true,
        id: "default-reddit",
        modifiedDate: new Date(Date.now() - ONE_DAY_MS).toJSON(),
      },
      "w:default-tildes": stored("default-tildes"),
    });

    const ui = await openWebsites(extension);

    await expect
      .poll(
        async () =>
          (await storedWebsite(extension, "default-tildes")).selectors,
      )
      .toEqual(shipped("default-tildes").selectors);
    expect(await storedWebsite(extension, "default-reddit")).toMatchObject({
      deleted: true,
    });
    await expect(ui.locator(".list__item")).toHaveCount(1);
    await expect(ui.locator(".websites__addresses")).not.toContainText(
      "reddit.com",
    );
  });

  test("does not seed the defaults a store never had", async ({
    extension,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      "w:default-tildes": stored("default-tildes"),
    });

    const ui = await openWebsites(extension);

    await expect
      .poll(
        async () =>
          (await storedWebsite(extension, "default-tildes")).selectors,
      )
      .toEqual(shipped("default-tildes").selectors);
    // Only a default already stored is refreshed. A newly added one still
    // reaches fresh installs only, so a user who deleted three of the four does
    // not find them back on the next upgrade.
    expect(websiteKeys(await extension.syncStorage())).toEqual([
      "w:default-tildes",
    ]);
    await expect(ui.locator(".list__item")).toHaveCount(1);
  });
});
