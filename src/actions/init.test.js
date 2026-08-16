// `initState` wires the store to both storage areas: hydration, the subscriber
// that persists every commit, and the `storage.onChanged` listener. It holds a
// module-level "subscribed once" flag, so each case loads the module fresh and
// takes statezero and the actions from that same registry, to reach the
// instance `init.js` is using.
const load = () => {
  let modules;
  jest.isolateModules(() => {
    modules = {
      errors: require("./errors"),
      init: require("./init"),
      settings: require("./settings"),
      statezero: require("statezero/src"),
      topics: require("./topics"),
    };
  });
  return modules;
};

const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const TOPIC = {
  createdDate: "2026-01-01T00:00:00.000Z",
  enabled: true,
  id: "topic-politics",
  modifiedDate: "2026-01-01T00:00:00.000Z",
  text: ["politics"],
};

let localStore;
let onChanged;
let syncSet;
let syncStore;

beforeEach(() => {
  localStore = {};
  syncStore = { schema: 2, "t:topic-politics": TOPIC };
  syncSet = jest.fn(() => Promise.resolve());
  onChanged = undefined;
  global.chrome = {
    permissions: { contains: jest.fn(() => Promise.resolve(true)) },
    storage: {
      local: {
        get: jest.fn(() => Promise.resolve({ ...localStore })),
        set: jest.fn((changes) => {
          Object.assign(localStore, changes);
          return Promise.resolve();
        }),
      },
      onChanged: {
        addListener: jest.fn((listener) => {
          onChanged = listener;
        }),
      },
      sync: {
        get: jest.fn(() => Promise.resolve({ ...syncStore })),
        remove: jest.fn(() => Promise.resolve()),
        set: jest.fn((...args) => syncSet(...args)),
      },
    },
  };
});

describe("initState hydration", () => {
  it("fills the store from both storage areas", async () => {
    const { init, statezero } = load();

    await init.initState();

    expect(statezero.getState("topics").list).toEqual([TOPIC]);
    expect(statezero.getState("websites").list).toEqual([]);
    expect(statezero.getState("isDisabled")).toBe(false);
  });

  it("reads the off switch from local storage, not synced storage", async () => {
    localStore.disabled = true;
    const { init, statezero } = load();

    await init.initState();

    expect(statezero.getState("isDisabled")).toBe(true);
  });

  // Otherwise the banner flashes on every open before the real check answers.
  it("assumes permissions are granted until the check says otherwise", async () => {
    const { init, statezero } = load();

    await init.initState();

    expect(statezero.getState("hasPermissions")).toBe(true);
  });
});

describe("initState persistence", () => {
  it("writes a later change through to synced storage", async () => {
    const { init, topics } = load();
    await init.initState();
    syncSet.mockClear();

    topics.topicActions.addItem({ text: ["sports"] });
    await flush();

    expect(syncSet).toHaveBeenCalled();
    const [written] = syncSet.mock.calls.at(-1);
    expect(Object.values(written)[0].text).toEqual(["sports"]);
  });

  it("writes the off switch to local storage, and only when it changes", async () => {
    const { init, settings } = load();
    await init.initState();
    chrome.storage.local.set.mockClear();

    settings.hydrateSettings({ isDisabled: true });
    await flush();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ disabled: true });

    // Every commit runs the subscriber, most of which leave this flag alone.
    chrome.storage.local.set.mockClear();
    settings.hydrateSettings({ isDisabled: true });
    await flush();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  // A write that never lands has to say so: the user would otherwise close the
  // popup believing the change was kept.
  it("surfaces a write that storage refuses", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { errors, init, statezero, topics } = load();
    await init.initState();
    syncSet.mockRejectedValue(new Error("QUOTA_BYTES quota exceeded"));

    topics.topicActions.addItem({ text: ["sports"] });
    await flush();

    expect(statezero.getState("errors").map(errors.toId)).toEqual([
      "QUOTA_BYTES quota exceeded",
    ]);
    consoleError.mockRestore();
  });

  // `addError` commits, which runs the subscriber again. Both writers record
  // the attempted write before rejecting, so the retry diffs to nothing rather
  // than rejecting forever.
  it("does not loop when surfacing a rejected write", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { init, topics } = load();
    await init.initState();
    syncSet.mockRejectedValue(new Error("QUOTA_BYTES quota exceeded"));

    topics.topicActions.addItem({ text: ["sports"] });
    await flush();
    const afterFirst = syncSet.mock.calls.length;
    await flush();

    expect(syncSet.mock.calls.length).toBe(afterFirst);
    consoleError.mockRestore();
  });
});

describe("initState sync subscription", () => {
  const fire = (changes) => onChanged(changes, "sync");

  it("applies a change another device made to an open UI", async () => {
    const { init, statezero } = load();
    await init.initState();

    fire({
      "t:topic-politics": {
        newValue: {
          ...TOPIC,
          modifiedDate: "2026-06-01T00:00:00.000Z",
          text: ["gardening"],
        },
      },
    });
    await flush();

    expect(statezero.getState("topics").list[0].text).toEqual(["gardening"]);
  });

  it("drops an item another device deleted", async () => {
    const { init, statezero } = load();
    await init.initState();

    fire({
      "t:topic-politics": {
        newValue: {
          deleted: true,
          id: "topic-politics",
          modifiedDate: "2026-06-01T00:00:00.000Z",
        },
      },
    });
    await flush();

    expect(statezero.getState("topics").list).toEqual([]);
  });

  // A synced website can be one this browser was never granted access to, so
  // the banner and the per-website warning are recomputed rather than left on
  // whatever the last local edit decided.
  it("re-checks permissions when a website arrives from another device", async () => {
    chrome.permissions.contains.mockResolvedValue(false);
    const { init, statezero } = load();
    await init.initState();

    fire({
      "w:site-example": {
        newValue: {
          addresses: ["example.com"],
          enabled: true,
          id: "site-example",
          modifiedDate: "2026-06-01T00:00:00.000Z",
          selectors: ["article"],
        },
      },
    });
    await flush();

    expect(statezero.getState("unpermissionedWebsiteIds")).toEqual([
      "site-example",
    ]);
    expect(statezero.getState("hasPermissions")).toBe(false);
  });
});

// `initState` re-runs on the failure boundary's retry. Subscribing again would
// stack a duplicate statezero subscriber and a duplicate `storage.onChanged`
// listener, so every later write would be issued twice.
describe("initState run again", () => {
  it("re-hydrates without subscribing a second time", async () => {
    const { init, statezero, topics } = load();
    await init.initState();
    const listeners = chrome.storage.onChanged.addListener.mock.calls.length;

    syncStore["t:topic-politics"] = { ...TOPIC, text: ["gardening"] };
    await init.initState();

    expect(statezero.getState("topics").list[0].text).toEqual(["gardening"]);
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(
      listeners,
    );

    syncSet.mockClear();
    topics.topicActions.addItem({ text: ["sports"] });
    await flush();

    expect(syncSet).toHaveBeenCalledTimes(1);
  });
});
