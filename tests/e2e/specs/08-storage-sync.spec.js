import { expect, test } from "../helpers/fixtures.js";

const V1_DATE = "2021-03-04T05:06:07.000Z";
const V1_TOPIC_KEY = `t:${Date.parse(V1_DATE)}`;

// What releases before the per-item layout stored: one `state` blob, items with
// no `id`, and no `schema` key.
const v1Blob = () => ({
  state: {
    topics: {
      list: [
        {
          createdDate: V1_DATE,
          enabled: true,
          modifiedDate: V1_DATE,
          text: ["politics"],
        },
      ],
    },
    websites: {
      list: [
        {
          addresses: ["localhost"],
          createdDate: V1_DATE,
          enabled: true,
          modifiedDate: V1_DATE,
          selectors: ["article"],
        },
        // A default website as v1 stored it: same addresses as the shipped
        // reddit entry but in a different order, and no id.
        {
          addresses: ["www.reddit.com", "reddit.com", "old.reddit.com"],
          createdDate: "2021-03-04T05:06:09.000Z",
          enabled: true,
          modifiedDate: "2021-03-04T05:06:09.000Z",
          selectors: ["article"],
        },
      ],
    },
  },
});

const topicItem = ({ modifiedDate, text }) => ({
  createdDate: "2020-01-01T00:00:00.000Z",
  enabled: true,
  id: "topic-politics",
  modifiedDate,
  sortDate: "2020-01-01T00:00:00.000Z",
  text: [text],
});

// Capability: data written by an older release, or arriving from another
// device, is folded in without losing anything.
test.describe("storage migration and sync", () => {
  test("filters from a v1 blob before any migration has run", async ({
    extension,
    page,
    server,
  }) => {
    // The background reads storage directly and has its own v1 fallback, so a
    // browser that has not opened the extension UI since upgrading still
    // filters.
    await extension.setSyncStorage(v1Blob());
    await page.goto(server.url("feed.html"));

    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    expect(Object.keys(await extension.syncStorage())).toEqual(["state"]);
  });

  test("migrates a v1 blob to per-item keys when the UI is opened", async ({
    extension,
  }) => {
    await extension.setSyncStorage(v1Blob());

    const ui = await extension.openWindow();
    await expect(ui.locator(".list__item")).toHaveCount(1);

    await expect
      .poll(() => extension.syncStorage())
      .toMatchObject({
        schema: 2,
      });
    const stored = await extension.syncStorage();

    // The blob is dropped only once the per-item layout is safely persisted.
    expect(stored.state).toBeUndefined();
    // Ids are derived from `createdDate`, which is stable across edits.
    expect(stored[V1_TOPIC_KEY]).toMatchObject({
      enabled: true,
      id: String(Date.parse(V1_DATE)),
      text: ["politics"],
    });
    // A v1 copy of a shipped default folds onto that default's fixed id, even
    // though its addresses were stored in a different order. Because the user
    // never edited it (`modifiedDate === createdDate`), the shipped selectors
    // are re-applied over it - that is how a corrected selector reaches an
    // install that already seeded the old one - while its own dates stay put so
    // the sync merge and the list order are left alone.
    expect(stored["w:default-reddit"]).toMatchObject({
      addresses: ["reddit.com", "old.reddit.com", "www.reddit.com"],
      createdDate: "2021-03-04T05:06:09.000Z",
      modifiedDate: "2021-03-04T05:06:09.000Z",
      selectors: ["article", ".listing-page .thing"],
    });
    // Only the two websites the blob held: migration does not seed the other
    // shipped defaults over a store that already has data.
    expect(
      Object.keys(stored).filter((key) => key.startsWith("w:")),
    ).toHaveLength(2);
  });

  test("keeps filtering across the migration", async ({
    extension,
    page,
    server,
  }) => {
    await extension.setSyncStorage(v1Blob());
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await extension.openWindow();
    await expect(ui.locator(".list__item")).toHaveCount(1);

    await expect
      .poll(() => extension.syncStorage())
      .toMatchObject({
        schema: 2,
      });
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a2")).not.toHaveClass(/filter-bubble/);
  });

  test("applies a change synced in from another device", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      websites: [
        {
          addresses: ["localhost"],
          id: "site-localhost",
          selectors: ["article"],
        },
      ],
    });
    await page.goto(server.url("feed.html"));
    const ui = await extension.openWindow();
    await expect(ui.locator(".list__item")).toHaveCount(0);

    // Another device adds a topic; `storage.sync` delivers it here.
    await extension.setSyncStorage({
      "t:topic-politics": topicItem({
        modifiedDate: "2024-01-01T00:00:00.000Z",
        text: "politics",
      }),
    });

    // The open UI picks it up without a reload, and so does the open tab.
    await expect(ui.locator(".topics__text")).toHaveText("politics");
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("keeps the newer value when an older one arrives from another device", async ({
    extension,
  }) => {
    await extension.setSyncStorage({
      schema: 2,
      "t:topic-politics": topicItem({
        modifiedDate: "2024-06-01T00:00:00.000Z",
        text: "politics",
      }),
    });
    const ui = await extension.openWindow();
    await expect(ui.locator(".topics__text")).toHaveText("politics");

    // A device that has been offline pushes its stale copy.
    await extension.setSyncStorage({
      "t:topic-politics": topicItem({
        modifiedDate: "2021-01-01T00:00:00.000Z",
        text: "stale",
      }),
    });

    // Last-writer-wins by `modifiedDate`: the newer local value is written back
    // so both devices converge on it, rather than the stale one clobbering it.
    await expect
      .poll(
        async () => (await extension.syncStorage())["t:topic-politics"].text,
      )
      .toEqual(["politics"]);
    await expect(ui.locator(".topics__text")).toHaveText("politics");
  });

  test("propagates a delete as a tombstone that survives a stale re-send", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [{ id: "topic-politics", text: ["politics"] }],
      websites: [
        {
          addresses: ["localhost"],
          id: "site-localhost",
          selectors: ["article"],
        },
      ],
    });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await extension.openWindow();
    await ui.locator(".list__content").click();
    await ui.getByRole("button", { name: "Delete" }).click();
    await expect(ui.locator(".list__item")).toHaveCount(0);

    // Deleting writes a tombstone rather than removing the key, so the removal
    // reaches other devices instead of being undone by them.
    await expect
      .poll(async () => (await extension.syncStorage())["t:topic-politics"])
      .toMatchObject({ deleted: true, id: "topic-politics" });

    // A device that never saw the delete re-sends the item it still holds.
    await extension.setSyncStorage({
      "t:topic-politics": topicItem({
        modifiedDate: "2020-01-01T00:00:00.000Z",
        text: "politics",
      }),
    });

    await expect
      .poll(async () => (await extension.syncStorage())["t:topic-politics"])
      .toMatchObject({ deleted: true });
    await expect(ui.locator(".list__item")).toHaveCount(0);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
  });
});
