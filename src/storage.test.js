import defaultWebsites from "./data/websites.json";
import { fromStorage, subscribeStorageSync, toStorage } from "./storage";

const get = jest.fn();
const set = jest.fn(() => Promise.resolve());
const remove = jest.fn(() => Promise.resolve());
const addListener = jest.fn();
let onChangedListener;

beforeEach(() => {
  get.mockReset();
  set.mockReset().mockResolvedValue(undefined);
  remove.mockReset().mockResolvedValue(undefined);
  addListener.mockReset().mockImplementation((fn) => {
    onChangedListener = fn;
  });
  onChangedListener = undefined;
  global.chrome = {
    storage: {
      onChanged: { addListener },
      sync: { get, remove, set },
    },
  };
});

const topic = (id, text, modifiedDate) => ({
  createdDate: modifiedDate,
  enabled: true,
  id,
  modifiedDate,
  text,
});

describe("fromStorage", () => {
  const seeded = (website) => ({
    ...website,
    modifiedDate: website.createdDate,
  });
  const shipped = seeded(defaultWebsites.list[0]);
  const shippedKey = `w:${shipped.id}`;

  it("returns lists from the per-item layout, excluding tombstones", async () => {
    get.mockResolvedValue({
      schema: 2,
      "t:1": topic("1", ["spoilers"], "2026-01-01T00:00:00.000Z"),
      // far-future tombstone so it is not swept by this test
      "t:2": {
        deleted: true,
        id: "2",
        modifiedDate: "2099-01-01T00:00:00.000Z",
      },
      "w:9": {
        addresses: ["example.com"],
        enabled: true,
        id: "9",
        modifiedDate: "2026-01-01T00:00:00.000Z",
      },
    });

    const lists = await fromStorage();

    expect(lists.topics.list).toEqual([expect.objectContaining({ id: "1" })]);
    expect(lists.websites.list).toEqual([expect.objectContaining({ id: "9" })]);
    expect(set).not.toHaveBeenCalled();
  });

  it("seeds default websites and records the schema on a fresh install", async () => {
    get.mockResolvedValue({});

    const lists = await fromStorage();

    expect(set).toHaveBeenCalledTimes(1);
    const written = set.mock.calls[0][0];
    expect(written.schema).toBe(2);
    // `modifiedDate` is stamped in code, not carried in websites.json, and must
    // equal `createdDate`: that equality is what a later `refreshDefaults`
    // recognizes an unedited record by.
    expect(written[shippedKey]).toEqual(shipped);
    expect(written[shippedKey].modifiedDate).toBe(
      written[shippedKey].createdDate,
    );
    expect(lists.websites.list.length).toBeGreaterThan(0);
    expect(lists.topics.list).toEqual([]);
  });

  // Seeding only covers a fresh install, so a corrected selector would never
  // reach an install that already seeded the old one. The shipped
  // `modifiedDate` is frozen and every local change stamps its own, so a stored
  // default still carrying it has never been edited.
  it("refreshes an unedited default when the shipped data changes", async () => {
    get.mockResolvedValue({
      schema: 2,
      // Serializes greater than the shipped selectors, so the reconciliation
      // merge would keep it: the refresh has to run after that merge.
      [shippedKey]: { ...shipped, selectors: ["ul.stale"] },
    });

    const lists = await fromStorage();

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toEqual({ [shippedKey]: shipped });
    expect(lists.websites.list).toEqual([shipped]);
  });

  // Releases before the per-item layout seeded defaults through
  // `hydrateWebsites`, which stamped both dates with the install time rather
  // than the value websites.json carries. Recognizing an unedited record by the
  // two dates being equal reaches those installs; comparing against the shipped
  // date would exclude every one of them.
  const INSTALLED_AT = "2025-03-14T09:00:00.000Z";
  // No `id`: it is derived from the addresses during migration.
  const preV2 = (overrides) => ({
    ...shipped,
    createdDate: INSTALLED_AT,
    id: undefined,
    modifiedDate: INSTALLED_AT,
    ...overrides,
  });
  const v1Blob = (website) => ({
    state: { topics: { list: [] }, websites: { list: [website] } },
  });
  // What the refresh must produce from one: shipped content, the install's own
  // clocks.
  const refreshed = {
    ...shipped,
    createdDate: INSTALLED_AT,
    id: shipped.id,
    modifiedDate: INSTALLED_AT,
  };

  it("refreshes an unedited default seeded before the per-item layout", async () => {
    get.mockResolvedValue(v1Blob(preV2({ selectors: [] })));

    const lists = await fromStorage();

    expect(lists.websites.list).toEqual([refreshed]);
    expect(remove).toHaveBeenCalledWith("state");
  });

  // The shipped dates predate the install-time clock, so writing them would
  // move `modifiedDate` backwards: any device still holding the later value
  // wins the merge outright and reverts the refresh, and the list reorders,
  // since `toSortDate` falls back to `modifiedDate` when `sortDate` is absent.
  it("keeps the stored clocks when refreshing a pre-per-item default", async () => {
    get.mockResolvedValue(v1Blob(preV2({ selectors: [] })));

    await fromStorage();

    const written = set.mock.calls[0][0][shippedKey];
    expect(written.createdDate).toBe(INSTALLED_AT);
    expect(written.modifiedDate).toBe(INSTALLED_AT);
    expect(written.modifiedDate > shipped.modifiedDate).toBe(true);
  });

  // The carried-over clocks must still satisfy the sentinel, or every load
  // would rewrite the same record.
  it("does not rewrite a default it has already refreshed", async () => {
    get.mockResolvedValue({ schema: 2, [shippedKey]: refreshed });

    await fromStorage();

    expect(set).not.toHaveBeenCalled();
  });

  // The toggle did not stamp `modifiedDate` before the per-item layout, so a
  // default disabled on those releases still satisfies the sentinel. Restoring
  // the shipped `enabled` would switch filtering the user turned off back on.
  it("keeps a default switched off while refreshing it", async () => {
    get.mockResolvedValue(v1Blob(preV2({ enabled: false, selectors: [] })));

    const lists = await fromStorage();

    expect(lists.websites.list).toEqual([{ ...refreshed, enabled: false }]);
  });

  it("leaves an edited default seeded before the per-item layout alone", async () => {
    const edited = preV2({
      modifiedDate: "2026-01-01T00:00:00.000Z",
      selectors: [".mine"],
    });
    get.mockResolvedValue(v1Blob(edited));

    const lists = await fromStorage();

    expect(lists.websites.list).toEqual([{ ...edited, id: shipped.id }]);
  });

  // Only a default already stored is updated. Seeding a missing one would
  // resurrect a default whose tombstone has been swept.
  it("does not seed a default that is absent from an existing install", async () => {
    const other = defaultWebsites.list[1];
    get.mockResolvedValue({ schema: 2, [`w:${other.id}`]: seeded(other) });

    const lists = await fromStorage();

    expect(set).not.toHaveBeenCalled();
    expect(lists.websites.list).toEqual([seeded(other)]);
  });

  it("leaves a default the user edited alone", async () => {
    const edited = {
      ...shipped,
      modifiedDate: "2026-01-01T00:00:00.000Z",
      selectors: [".mine"],
    };
    get.mockResolvedValue({ schema: 2, [shippedKey]: edited });

    const lists = await fromStorage();

    expect(set).not.toHaveBeenCalled();
    expect(lists.websites.list).toEqual([edited]);
  });

  it("leaves a default the user deleted alone", async () => {
    get.mockResolvedValue({
      schema: 2,
      [shippedKey]: {
        deleted: true,
        id: shipped.id,
        modifiedDate: new Date().toJSON(),
      },
    });

    const lists = await fromStorage();

    expect(set).not.toHaveBeenCalled();
    expect(lists.websites.list).toEqual([]);
  });

  // Guards against rewriting the same values on every load.
  it("writes nothing when the stored defaults match the shipped data", async () => {
    const stored = { schema: 2 };
    defaultWebsites.list.forEach((website) => {
      stored[`w:${website.id}`] = seeded(website);
    });
    get.mockResolvedValue(stored);

    await fromStorage();

    expect(set).not.toHaveBeenCalled();
  });

  it("migrates the legacy state blob to per-item keys", async () => {
    get.mockResolvedValue({
      state: {
        topics: {
          list: [topic(undefined, ["spoilers"], "2026-01-01T00:00:00.000Z")],
        },
        websites: {
          list: [
            {
              addresses: ["tildes.net"],
              enabled: true,
              modifiedDate: "2026-01-02T00:00:00.000Z",
              selectors: ["x"],
            },
          ],
        },
      },
    });

    const lists = await fromStorage();

    expect(set).toHaveBeenCalledTimes(1);
    const written = set.mock.calls[0][0];
    expect(written.schema).toBe(2);
    const topicId = String(Date.parse("2026-01-01T00:00:00.000Z"));
    expect(written["t:" + topicId]).toMatchObject({
      id: topicId,
      text: ["spoilers"],
    });
    // A website whose addresses match a default gets the fixed default id.
    expect(written["w:default-tildes"]).toMatchObject({
      addresses: ["tildes.net"],
      id: "default-tildes",
    });
    expect(remove).toHaveBeenCalledWith("state");
    expect(lists.topics.list).toHaveLength(1);
    expect(lists.websites.list).toHaveLength(1);
  });

  // `default-reddit` ships with unsorted addresses, and v1 identified websites
  // by the `addresses` array verbatim, so an entry holding the same addresses in
  // sorted order was not a duplicate there. Both canonicalize onto the default
  // id, and the blob is dropped right after, so a collision here loses the
  // overwritten website permanently.
  it("keeps both websites when two v1 entries claim one default id", async () => {
    const shipped = ["reddit.com", "old.reddit.com", "www.reddit.com"];
    get.mockResolvedValue({
      state: {
        topics: { list: [] },
        websites: {
          list: [
            {
              addresses: shipped,
              createdDate: "2026-01-01T00:00:00.000Z",
              enabled: true,
              selectors: [".default"],
            },
            {
              addresses: [...shipped].sort(),
              createdDate: "2026-01-02T00:00:00.000Z",
              enabled: true,
              selectors: [".mine"],
            },
          ],
        },
      },
    });

    const lists = await fromStorage();

    expect(lists.websites.list).toHaveLength(2);
    expect(lists.websites.list.map((w) => w.selectors)).toEqual(
      expect.arrayContaining([[".default"], [".mine"]]),
    );
    // The first entry keeps the fixed default id, so a migrated device and a
    // freshly seeded one still converge on it.
    const written = set.mock.calls[0][0];
    expect(written["w:default-reddit"]).toMatchObject({
      selectors: [".default"],
    });
    expect(remove).toHaveBeenCalledWith("state");
  });

  // A v1 blob can hold a collection this version never wrote, e.g. an export
  // taken before websites existed. An absent collection migrates as empty, and
  // the blob is still dropped.
  it("migrates a legacy state blob that holds only one collection", async () => {
    get.mockResolvedValue({
      state: {
        topics: {
          list: [topic(undefined, ["spoilers"], "2026-01-01T00:00:00.000Z")],
        },
      },
    });

    const lists = await fromStorage();

    const topicId = String(Date.parse("2026-01-01T00:00:00.000Z"));
    expect(set.mock.calls[0][0]["t:" + topicId]).toMatchObject({
      id: topicId,
      text: ["spoilers"],
    });
    expect(lists.topics.list).toHaveLength(1);
    expect(lists.websites.list).toHaveLength(0);
    expect(remove).toHaveBeenCalledWith("state");
  });

  it("keeps a newer per-item key over the v1 value during a re-migration", async () => {
    // A partially completed earlier migration left an edited t:<id> (newer)
    // next to the still-present v1 blob (older, same createdDate). Re-migration
    // must not clobber the edit, and must not needlessly rewrite it.
    const created = "2026-01-01T00:00:00.000Z";
    const id = String(Date.parse(created));
    get.mockResolvedValue({
      state: {
        topics: {
          list: [
            {
              createdDate: created,
              enabled: true,
              modifiedDate: created,
              text: ["a"],
            },
          ],
        },
        websites: { list: [] },
      },
      ["t:" + id]: {
        createdDate: created,
        enabled: true,
        id,
        modifiedDate: "2026-05-01T00:00:00.000Z",
        text: ["edited"],
      },
    });

    const lists = await fromStorage();

    expect(lists.topics.list).toHaveLength(1);
    expect(lists.topics.list[0].text).toEqual(["edited"]);
    // The already-current value is not rewritten.
    const written = set.mock.calls[0][0];
    expect(written["t:" + id]).toBeUndefined();
  });

  it("folds an edited v1 item onto its existing key without duplicating it", async () => {
    // Same item, edited on a still-v1 instance: createdDate is unchanged so the
    // fold targets the existing per-item key and updates it in place.
    const created = "2026-01-01T00:00:00.000Z";
    const id = String(Date.parse(created));
    get.mockResolvedValue({
      schema: 2,
      state: {
        topics: {
          list: [
            {
              createdDate: created,
              enabled: true,
              modifiedDate: "2026-06-01T00:00:00.000Z",
              text: ["edited"],
            },
          ],
        },
        websites: { list: [] },
      },
      ["t:" + id]: {
        createdDate: created,
        enabled: true,
        id,
        modifiedDate: "2026-03-01T00:00:00.000Z",
        text: ["original"],
      },
    });

    const lists = await fromStorage();

    expect(lists.topics.list).toHaveLength(1);
    expect(lists.topics.list[0].text).toEqual(["edited"]);
    expect(set.mock.calls[0][0]["t:" + id].text).toEqual(["edited"]);
    expect(remove).toHaveBeenCalledWith("state");
  });

  it("folds a lingering v1 blob into per-item keys and removes it, even at schema 2", async () => {
    const topicId = String(Date.parse("2026-02-01T00:00:00.000Z"));
    get.mockResolvedValue({
      schema: 2,
      state: {
        topics: {
          list: [topic(undefined, ["late"], "2026-02-01T00:00:00.000Z")],
        },
        websites: { list: [] },
      },
      "t:existing": topic("existing", ["a"], "2026-01-01T00:00:00.000Z"),
    });

    const lists = await fromStorage();

    const written = set.mock.calls[0][0];
    expect(written["t:" + topicId]).toMatchObject({ text: ["late"] });
    expect(remove).toHaveBeenCalledWith("state");
    expect(lists.topics.list.map((t) => t.text)).toEqual(
      expect.arrayContaining([["a"], ["late"]]),
    );
  });

  it("still resolves and keeps the v1 blob when the migration write fails", async () => {
    get.mockResolvedValue({
      state: {
        topics: {
          list: [topic(undefined, ["spoilers"], "2026-01-01T00:00:00.000Z")],
        },
        websites: { list: [] },
      },
    });
    set.mockRejectedValue(new Error("QUOTA_BYTES quota exceeded"));
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const lists = await fromStorage();

    // Popup still gets its data from the in-memory result.
    expect(lists.topics.list).toHaveLength(1);
    // The v1 blob is not removed, so the migration can retry next load.
    expect(remove).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("sweeps tombstones older than the retention window on load", async () => {
    get.mockResolvedValue({
      schema: 2,
      "t:1": topic("1", ["a"], "2026-07-01T00:00:00.000Z"),
      "t:old": {
        deleted: true,
        id: "old",
        modifiedDate: "2000-01-01T00:00:00.000Z",
      },
    });

    await fromStorage();

    expect(remove).toHaveBeenCalledWith(["t:old"]);
  });

  it("retains a tombstone it cannot age", async () => {
    // Not reachable through `toStorage`, which always writes a `modifiedDate`.
    // Retaining is the safe direction: sweeping resurrects the item from any
    // device that still holds it live.
    get.mockResolvedValue({
      schema: 2,
      "t:missing": { deleted: true, id: "missing" },
    });

    await fromStorage();

    expect(remove).not.toHaveBeenCalled();
  });

  it("retains a tombstone inside the retention window", async () => {
    get.mockResolvedValue({
      schema: 2,
      "t:recent": {
        deleted: true,
        id: "recent",
        modifiedDate: new Date().toJSON(),
      },
    });

    await fromStorage();

    expect(remove).not.toHaveBeenCalled();
  });

  // Rejecting here rejects `initState`, which renders the popup's failure page
  // instead of the app - so one key nobody can make sense of would take the
  // whole configuration away from the user rather than just itself.
  it("drops a value that is not an object rather than failing the read", async () => {
    get.mockResolvedValue({
      schema: 2,
      "t:1": topic("1", ["spoilers"], "2026-01-01T00:00:00.000Z"),
      "t:junk": null,
      "w:junk": "not an item",
    });

    const lists = await fromStorage();

    expect(lists.topics.list).toEqual([
      topic("1", ["spoilers"], "2026-01-01T00:00:00.000Z"),
    ]);
    expect(lists.websites.list).toEqual([]);
  });
});

// Seed the module store via a v2 read, then clear the write mocks.
const seed = async (data) => {
  get.mockResolvedValue({ schema: 2, ...data });
  await fromStorage();
  set.mockClear();
  remove.mockClear();
};

describe("toStorage", () => {
  it("writes only changed/new keys", async () => {
    await seed({ "t:1": topic("1", ["a"], "2026-01-01T00:00:00.000Z") });

    await toStorage({
      topics: {
        list: [
          topic("1", ["a"], "2026-01-01T00:00:00.000Z"),
          topic("2", ["b"], "2026-02-01T00:00:00.000Z"),
        ],
      },
      websites: { list: [] },
    });

    expect(set).toHaveBeenCalledTimes(1);
    expect(Object.keys(set.mock.calls[0][0])).toEqual(["t:2"]);
  });

  it("persists the sortDate a local toggle backfilled", async () => {
    // A seeded/legacy item carries no `sortDate`; `createToggleEnabled`
    // backfills it from the pre-toggle `modifiedDate`, and that value has to
    // reach storage or each device re-derives its own and list order diverges.
    const stored = topic("1", ["a"], "2020-01-01T00:00:00.000Z");
    await seed({ "t:1": stored });

    await toStorage({
      topics: {
        list: [
          {
            ...stored,
            enabled: false,
            modifiedDate: "2026-01-01T00:00:00.000Z",
            sortDate: "2020-01-01T00:00:00.000Z",
          },
        ],
      },
      websites: { list: [] },
    });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]["t:1"].sortDate).toBe(
      "2020-01-01T00:00:00.000Z",
    );
  });

  it("skips the write when nothing changed", async () => {
    const item = topic("1", ["a"], "2026-01-01T00:00:00.000Z");
    await seed({ "t:1": item });

    await toStorage({
      topics: { list: [{ ...item }] },
      websites: { list: [] },
    });

    expect(set).not.toHaveBeenCalled();
  });

  it("tombstones a removed item", async () => {
    await seed({ "t:1": topic("1", ["a"], "2026-01-01T00:00:00.000Z") });

    await toStorage({ topics: { list: [] }, websites: { list: [] } });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]["t:1"]).toMatchObject({
      deleted: true,
      id: "1",
    });
  });

  it("propagates a write rejection so callers can react", async () => {
    await seed({});
    set.mockRejectedValueOnce(new Error("QUOTA_BYTES quota exceeded"));

    await expect(
      toStorage({
        topics: { list: [topic("1", ["a"], "2026-01-01T00:00:00.000Z")] },
        websites: { list: [] },
      }),
    ).rejects.toThrow(/quota/);
  });
});

describe("subscribeStorageSync", () => {
  const fire = (changes) => onChangedListener(changes, "sync");

  it("applies a newer remote change and notifies", async () => {
    await seed({ "t:1": topic("1", ["a"], "2026-01-01T00:00:00.000Z") });
    const onLists = jest.fn();
    subscribeStorageSync(onLists);

    fire({
      "t:1": { newValue: topic("1", ["b"], "2026-02-01T00:00:00.000Z") },
    });

    expect(onLists).toHaveBeenCalledTimes(1);
    expect(onLists.mock.calls[0][0].topics.list[0].text).toEqual(["b"]);
    expect(set).not.toHaveBeenCalled();
  });

  // A release that predates tombstones deletes by removing the key, so the
  // change arrives with no `newValue` at all rather than as a marker.
  it("drops an item whose change carries no new value", async () => {
    await seed({ "t:1": topic("1", ["a"], "2026-01-01T00:00:00.000Z") });
    const onLists = jest.fn();
    subscribeStorageSync(onLists);

    fire({
      "t:1": { oldValue: topic("1", ["a"], "2026-01-01T00:00:00.000Z") },
    });

    expect(onLists).toHaveBeenCalledTimes(1);
    expect(onLists.mock.calls[0][0].topics.list).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });

  it("ignores a removal of a key it does not hold", async () => {
    await seed({ "t:1": topic("1", ["a"], "2026-01-01T00:00:00.000Z") });
    const onLists = jest.fn();
    subscribeStorageSync(onLists);

    fire({ "t:gone": {} });

    expect(onLists).not.toHaveBeenCalled();
  });

  it("ignores an incoming value that is not an object", async () => {
    await seed({ "t:1": topic("1", ["a"], "2026-01-01T00:00:00.000Z") });
    const onLists = jest.fn();
    subscribeStorageSync(onLists);

    fire({ "t:junk": { newValue: null } });

    // Taking it into the store would only move the throw to the next write.
    expect(onLists).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("keeps and writes back the local value when the remote is older", async () => {
    await seed({ "t:1": topic("1", ["new"], "2026-03-01T00:00:00.000Z") });
    const onLists = jest.fn();
    subscribeStorageSync(onLists);

    fire({
      "t:1": { newValue: topic("1", ["old"], "2026-01-01T00:00:00.000Z") },
    });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]["t:1"].text).toEqual(["new"]);
    expect(onLists).not.toHaveBeenCalled();
  });

  // The tie-break must be a function of content alone. Picking "mine" on both
  // devices has each write its own value back over the other's forever, one
  // `storage.sync` write per round until the quota rejects them. Reachable
  // without a same-millisecond edit: the shipped defaults carry a frozen
  // `modifiedDate`, so two releases whose seed data differs collide on it.
  it("resolves an equal modifiedDate by content, the same way on both sides", async () => {
    const modifiedDate = "2020-01-01T00:00:00.000Z";
    const mine = topic("1", ["a"], modifiedDate);
    const theirs = topic("1", ["b"], modifiedDate);

    // Holding the loser: adopt the winner and stay quiet.
    await seed({ "t:1": mine });
    const onLists = jest.fn();
    subscribeStorageSync(onLists);
    fire({ "t:1": { newValue: theirs } });

    expect(onLists.mock.calls[0][0].topics.list).toEqual([theirs]);
    expect(set).not.toHaveBeenCalled();

    // Holding the winner: keep it and write it back, and a re-emission of that
    // write settles instead of bouncing.
    await seed({ "t:1": theirs });
    subscribeStorageSync(jest.fn());
    fire({ "t:1": { newValue: mine } });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toEqual({ "t:1": theirs });
    set.mockClear();
    fire({ "t:1": { newValue: theirs } });
    expect(set).not.toHaveBeenCalled();
  });

  it("applies a remote toggle that bumped modifiedDate but not sortDate", async () => {
    const sortDate = "2026-01-01T00:00:00.000Z";
    await seed({ "t:1": { ...topic("1", ["a"], sortDate), sortDate } });
    const onLists = jest.fn();
    subscribeStorageSync(onLists);

    fire({
      "t:1": {
        newValue: {
          ...topic("1", ["a"], "2026-02-01T00:00:00.000Z"),
          enabled: false,
          sortDate,
        },
      },
    });

    expect(onLists).toHaveBeenCalledTimes(1);
    expect(onLists.mock.calls[0][0].topics.list[0].enabled).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it("ignores non-sync areas and non-item keys", async () => {
    await seed({});
    const onLists = jest.fn();
    subscribeStorageSync(onLists);

    onChangedListener({ "t:1": { newValue: topic("1", ["a"], "x") } }, "local");
    fire({ schema: { newValue: 2 } });

    expect(onLists).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("converges without looping when the browser re-emits our writes", async () => {
    await seed({ "t:1": topic("1", ["new"], "2026-03-01T00:00:00.000Z") });
    set.mockImplementation((changes) => {
      const remapped = {};
      Object.keys(changes).forEach((key) => {
        remapped[key] = { newValue: changes[key] };
      });
      onChangedListener(remapped, "sync");
      return Promise.resolve();
    });
    subscribeStorageSync(() => {});

    fire({
      "t:1": { newValue: topic("1", ["old"], "2026-01-01T00:00:00.000Z") },
    });

    expect(set).toHaveBeenCalledTimes(1);
  });
});
