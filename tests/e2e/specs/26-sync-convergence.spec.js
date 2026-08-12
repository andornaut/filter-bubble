import { expect, settle, test } from "../helpers/fixtures.js";

const SAME_TIME = "2024-03-03T03:03:03.000Z";

const topicItem = ({ id, modifiedDate, text }) => ({
  createdDate: "2020-01-01T00:00:00.000Z",
  enabled: true,
  id,
  modifiedDate,
  sortDate: "2020-01-01T00:00:00.000Z",
  text: [text],
});

const WEBSITE = {
  addresses: ["localhost"],
  createdDate: "2020-01-01T00:00:00.000Z",
  enabled: true,
  hideInsteadOfRemove: false,
  id: "site-localhost",
  modifiedDate: "2020-01-01T00:00:00.000Z",
  selectors: ["article"],
  sortDate: "2020-01-01T00:00:00.000Z",
};

const storedText = async (extension, id) =>
  (await extension.syncStorage())[`t:${id}`]?.text;

// Capability: two devices editing the same configuration converge on one
// answer instead of overwriting each other, whichever order the writes arrive
// in. `storage.sync` delivers another device's write as a local change, which
// is what `extension.setSyncStorage` reproduces here.
test.describe("sync convergence", () => {
  test("settles a same-time conflict on the same value from either side", async ({
    extension,
  }) => {
    // Two topics, set up as mirror images of one another: each device holds one
    // value and is sent the other, with identical `modifiedDate`s so the date
    // cannot decide it.
    await extension.setSyncStorage({
      schema: 2,
      "t:topic-a": topicItem({
        id: "topic-a",
        modifiedDate: SAME_TIME,
        text: "alpha",
      }),
      "t:topic-b": topicItem({
        id: "topic-b",
        modifiedDate: SAME_TIME,
        text: "beta",
      }),
    });
    const ui = await extension.openWindow();
    await expect(ui.locator(".list__item")).toHaveCount(2);

    await extension.setSyncStorage({
      "t:topic-a": topicItem({
        id: "topic-a",
        modifiedDate: SAME_TIME,
        text: "beta",
      }),
      "t:topic-b": topicItem({
        id: "topic-b",
        modifiedDate: SAME_TIME,
        text: "alpha",
      }),
    });

    // The tie-break is a function of content alone, never of which side is
    // local: "beta" wins both times. Were it "keep mine", each device would
    // keep writing its own value back and the two would overwrite each other
    // forever.
    await expect.poll(() => storedText(extension, "topic-a")).toEqual(["beta"]);
    await expect.poll(() => storedText(extension, "topic-b")).toEqual(["beta"]);
    // topic-b's incoming value lost, so the winner is written back for the
    // other device to pick up rather than left to diverge.
    await expect(ui.locator(".topics__text").nth(0)).toHaveText("beta");
    await expect(ui.locator(".topics__text").nth(1)).toHaveText("beta");
  });

  test("drops an item another device removed outright", async ({
    extension,
    page,
    server,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      "t:topic-politics": topicItem({
        id: "topic-politics",
        modifiedDate: "2024-01-01T00:00:00.000Z",
        text: "politics",
      }),
      "w:site-localhost": WEBSITE,
    });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    const ui = await extension.openWindow();
    await expect(ui.locator(".list__item")).toHaveCount(1);

    // A release that predates tombstones deletes by removing the key, so the
    // change arrives with no `newValue` at all rather than as a marker.
    await extension.removeSyncStorage("t:topic-politics");

    await expect(ui.locator(".list__item")).toHaveCount(0);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
  });

  test("ignores a synced change that is not an item", async ({
    extension,
    page,
    server,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      "t:topic-politics": topicItem({
        id: "topic-politics",
        modifiedDate: "2024-01-01T00:00:00.000Z",
        text: "politics",
      }),
      "w:site-localhost": WEBSITE,
    });
    await page.goto(server.url("feed.html"));
    const ui = await extension.openWindow();
    await expect(ui.locator(".list__item")).toHaveCount(1);

    // A key from some other release, or a bookkeeping key of our own. Neither
    // is a topic or a website, and neither may reach the lists.
    await extension.setSyncStorage({
      "settings:theme": "dark",
      schema: 2,
    });
    await settle(ui);

    await expect(ui.locator(".list__item")).toHaveCount(1);
    await expect(ui.locator(".topics__text")).toHaveText("politics");
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("keeps working when synced storage holds a value that is not an item", async ({
    extension,
    page,
    server,
  }) => {
    // Whatever wrote this, the extension has to keep reading the store around
    // it: a value it cannot make sense of must not be able to wedge the read
    // that every later change depends on.
    await extension.setSyncStorage({
      schema: 2,
      "t:junk": null,
      "t:topic-politics": topicItem({
        id: "topic-politics",
        modifiedDate: "2024-01-01T00:00:00.000Z",
        text: "politics",
      }),
      "w:site-localhost": WEBSITE,
    });

    await page.goto(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    const ui = await extension.openWindow();
    await expect(ui.locator(".topics__text")).toHaveText("politics");

    // And a later change still lands, which is what a wedged read would stop.
    await extension.setSyncStorage({
      "t:topic-politics": topicItem({
        id: "topic-politics",
        modifiedDate: "2024-06-01T00:00:00.000Z",
        text: "gardening",
      }),
    });

    await expect(page.locator("#a2")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
  });
});
