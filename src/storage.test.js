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
    expect(written["w:default-tildes"]).toBeDefined();
    expect(lists.websites.list.length).toBeGreaterThan(0);
    expect(lists.topics.list).toEqual([]);
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
