import { readFileSync } from "fs";
import { join } from "path";

// background.js ships as a non-bundled service worker and exports nothing. Load
// the source, mock the `chrome` global it touches at the top level, and evaluate
// it so these tests exercise the actual shipped helpers.
const source = readFileSync(join(__dirname, "background.js"), "utf8");

const noopPromise = () => Promise.resolve();
const chromeMock = {
  action: { setBadgeText: noopPromise },
  runtime: {
    onConnect: { addListener: () => {} },
    onMessage: { addListener: () => {} },
  },
  scripting: { executeScript: noopPromise, insertCSS: noopPromise },
  storage: {
    local: { get: () => Promise.resolve({}) },
    onChanged: { addListener: () => {} },
    sync: { get: () => Promise.resolve({}) },
  },
  tabs: {
    onActivated: { addListener: () => {} },
    onUpdated: { addListener: () => {} },
    query: () => Promise.resolve([]),
    sendMessage: noopPromise,
  },
};

const { isCommitted, matchedWebsite, matchesAddress, toLists, toPattern } =
  new Function(
    "chrome",
    `${source}\nreturn { isCommitted, matchedWebsite, matchesAddress, toLists, toPattern };`,
  )(chromeMock);

describe("toLists", () => {
  it("reads the legacy v1 state blob before migration", () => {
    const raw = {
      state: {
        topics: { list: [{ enabled: true, text: "spoilers" }] },
        websites: { list: [{ addresses: ["reddit.com"], enabled: true }] },
      },
    };
    expect(toLists(raw)).toEqual({
      topicsList: [{ enabled: true, text: "spoilers" }],
      websitesList: [{ addresses: ["reddit.com"], enabled: true }],
    });
  });

  it("reads the v2 per-item layout, excluding tombstones", () => {
    const raw = {
      schema: 2,
      "t:1": { enabled: true, id: "1", text: ["spoilers"] },
      "t:2": { deleted: true, id: "2" },
      "w:9": { addresses: ["reddit.com"], enabled: true, id: "9" },
    };
    expect(toLists(raw)).toEqual({
      topicsList: [{ enabled: true, id: "1", text: ["spoilers"] }],
      websitesList: [{ addresses: ["reddit.com"], enabled: true, id: "9" }],
    });
  });

  it("returns empty lists for empty storage", () => {
    expect(toLists({})).toEqual({ topicsList: [], websitesList: [] });
  });

  // The v2 branch skips anything falsy, so the v1 branch must too: a `null`
  // entry reaching `updateState` throws where the lists are filtered by
  // `enabled`, and the read queue then reports it as a storage read failure.
  it("skips falsy entries in a legacy v1 list", () => {
    const raw = {
      state: {
        topics: { list: [null, { enabled: true, text: "spoilers" }] },
        websites: {
          list: [{ addresses: ["reddit.com"], enabled: true }, undefined],
        },
      },
    };
    expect(toLists(raw)).toEqual({
      topicsList: [{ enabled: true, text: "spoilers" }],
      websitesList: [{ addresses: ["reddit.com"], enabled: true }],
    });
  });

  it("treats a legacy v1 collection that is missing or malformed as empty", () => {
    const raw = { state: { topics: null, websites: { list: "not a list" } } };
    expect(toLists(raw)).toEqual({ topicsList: [], websitesList: [] });
  });
});

describe("matchesAddress", () => {
  // `url` is already lowercased and scheme-stripped by `matchedWebsite` before
  // it reaches `matchesAddress`, so these tests pass normalized values.
  describe("matches", () => {
    it.each([
      ["reddit.com", "reddit.com"], // exact
      ["reddit.com/r/all", "reddit.com"], // path separator
      ["reddit.com:8080", "reddit.com"], // port separator
      ["reddit.com?ref=1", "reddit.com"], // query separator
      ["reddit.com#section", "reddit.com"], // fragment separator
      ["news.ycombinator.com/item?id=1", "news.ycombinator.com"],
    ])("%s matches %s", (url, address) => {
      expect(matchesAddress(url, address)).toBe(true);
    });
  });

  describe("does not match", () => {
    it.each([
      ["reddit.companyx.com", "reddit.com"], // suffix without a boundary
      ["reddit.com.evil.example", "reddit.com"], // address as a left label
      ["notreddit.com", "reddit.com"], // not a prefix
      ["example.com", "reddit.com"], // unrelated
      ["", "reddit.com"], // empty url
    ])("%s does not match %s", (url, address) => {
      expect(matchesAddress(url, address)).toBe(false);
    });
  });
});

describe("matchedWebsite", () => {
  const websitesList = [
    { addresses: ["reddit.com"], selectors: [".post"] },
    {
      addresses: ["news.ycombinator.com", "ycombinator.com"],
      selectors: [".athing"],
    },
  ];

  it("returns the website whose address prefixes the url", () => {
    expect(matchedWebsite(websitesList, "https://reddit.com/r/all")).toEqual({
      selectors: [".post"],
    });
  });

  it("strips the scheme and lowercases before matching", () => {
    expect(matchedWebsite(websitesList, "HTTPS://Reddit.com")).toEqual({
      selectors: [".post"],
    });
  });

  it("matches against any of a website's addresses", () => {
    expect(
      matchedWebsite(websitesList, "https://ycombinator.com/item"),
    ).toEqual({ selectors: [".athing"] });
  });

  it("excludes the matched `addresses` from the returned website", () => {
    expect(
      matchedWebsite(websitesList, "https://reddit.com"),
    ).not.toHaveProperty("addresses");
  });

  it("returns null when no website matches", () => {
    expect(matchedWebsite(websitesList, "https://example.com")).toBeNull();
  });

  it("returns null when a boundary is not respected", () => {
    expect(
      matchedWebsite(websitesList, "https://reddit.companyx.com"),
    ).toBeNull();
  });
});

describe("isCommitted", () => {
  it.each([
    ["a settled tab", { url: "https://reddit.com/" }],
    [
      "a tab whose pendingUrl matches its url",
      { pendingUrl: "https://reddit.com/", url: "https://reddit.com/" },
    ],
    [
      "a tab with no pendingUrl (Firefox)",
      { status: "loading", url: "https://reddit.com/" },
    ],
  ])("accepts %s", (_, tab) => {
    expect(isCommitted(tab)).toBe(true);
  });

  it.each([
    ["an undefined tab", undefined],
    ["a tab with no url", { id: 1 }],
    ["a tab with an empty url", { url: "" }],
    [
      "a pre-commit tab, where pendingUrl differs from url",
      { pendingUrl: "https://example.org/", url: "https://reddit.com/" },
    ],
  ])("rejects %s", (_, tab) => {
    expect(isCommitted(tab)).toBe(false);
  });
});

describe("active tab re-evaluation", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const SYNC_STORE = {
    schema: 2,
    "t:1": { enabled: true, id: "1", text: ["spoilers"] },
    "w:9": {
      addresses: ["reddit.com"],
      enabled: true,
      id: "9",
      selectors: [".post"],
    },
  };

  // Re-evaluate the source against a mock whose active tab is `tab`, then clear
  // the mocks: initialization runs `resetCurrentTab` through the same
  // `tabs.query`, so without this the assertions would pass on the
  // initialization pass alone and never exercise a listener.
  // `localStore` backs `storage.local` and is returned so a test can flip the
  // master switch and then fire the corresponding `onChanged` event.
  const evaluate = async (tab, localStore = {}, syncStore = SYNC_STORE) => {
    const executeScript = jest
      .fn()
      .mockResolvedValue([{ result: { isInstalled: true } }]);
    const sendMessage = jest.fn(() => Promise.resolve());
    let onActivated;
    let onChanged;
    const mock = {
      ...chromeMock,
      scripting: { ...chromeMock.scripting, executeScript },
      storage: {
        local: { get: () => Promise.resolve({ ...localStore }) },
        onChanged: {
          addListener: (listener) => {
            onChanged = listener;
          },
        },
        sync: { get: () => Promise.resolve({ ...syncStore }) },
      },
      tabs: {
        ...chromeMock.tabs,
        onActivated: {
          addListener: (listener) => {
            onActivated = listener;
          },
        },
        query: () => Promise.resolve([tab]),
        sendMessage,
      },
    };
    new Function("chrome", source)(mock);
    await flush();
    executeScript.mockClear();
    sendMessage.mockClear();
    return { executeScript, localStore, onActivated, onChanged, sendMessage };
  };

  it("onActivated injects the content script for a settled matching tab", async () => {
    const { executeScript, onActivated } = await evaluate({
      id: 1,
      status: "complete",
      url: "https://reddit.com/",
    });
    onActivated({ windowId: 1 });
    await flush();
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 } }),
    );
  });

  it("onActivated disables filtering for a settled unmatched tab", async () => {
    const { onActivated, sendMessage } = await evaluate({
      id: 1,
      status: "complete",
      url: "https://example.org/",
    });
    onActivated({ windowId: 1 });
    await flush();
    expect(sendMessage).toHaveBeenCalledWith(1, { command: "disable" });
  });

  // `tab.url` can still hold the outgoing document's URL while a tab is
  // loading, so a disable computed from it would strip the incoming
  // document's filters. The `onUpdated` "complete" pass makes the call instead.
  it("onActivated does not disable a loading tab that matches no website", async () => {
    const { executeScript, onActivated, sendMessage } = await evaluate({
      id: 1,
      status: "loading",
      url: "https://example.org/",
    });
    onActivated({ windowId: 1 });
    await flush();
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  // Only the disable defers: a page that never finishes loading would
  // otherwise never be filtered.
  it("onActivated injects the content script for a loading tab that matches", async () => {
    const { executeScript, onActivated } = await evaluate({
      id: 1,
      status: "loading",
      url: "https://reddit.com/",
    });
    onActivated({ windowId: 1 });
    await flush();
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 } }),
    );
  });

  // A storage change gets no `onUpdated` pass of its own, so it must not defer:
  // a stalled load reports "loading" indefinitely, which would leave the user's
  // just-removed topics still filtering the page.
  it("a storage change disables a loading tab that matches no website", async () => {
    const { onChanged, sendMessage } = await evaluate({
      id: 1,
      status: "loading",
      url: "https://example.org/",
    });
    onChanged({}, "sync");
    await flush();
    expect(sendMessage).toHaveBeenCalledWith(1, { command: "disable" });
  });

  it("disables a matching tab while the master switch is on", async () => {
    const { executeScript, onActivated, sendMessage } = await evaluate(
      { id: 1, status: "complete", url: "https://reddit.com/" },
      { disabled: true },
    );
    onActivated({ windowId: 1 });
    await flush();
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(1, { command: "disable" });
  });

  it("re-reads state when the master switch changes in storage.local", async () => {
    const { localStore, onChanged, sendMessage } = await evaluate({
      id: 1,
      status: "complete",
      url: "https://reddit.com/",
    });
    localStore.disabled = true;
    onChanged({ disabled: { newValue: true } }, "local");
    await flush();
    expect(sendMessage).toHaveBeenCalledWith(1, { command: "disable" });
  });

  // Two changes landing back to back each trigger a full re-read. If those
  // reads run concurrently they can resolve in either order, and the older
  // snapshot can win and sit in `state` until some later event repairs it.
  it("applies overlapping storage reads in the order they were triggered", async () => {
    const resolvers = [];
    const executeScript = jest
      .fn()
      .mockResolvedValue([{ result: { isInstalled: true } }]);
    const sendMessage = jest.fn(() => Promise.resolve());
    let onChanged;
    const mock = {
      ...chromeMock,
      scripting: { ...chromeMock.scripting, executeScript },
      storage: {
        local: { get: () => Promise.resolve({}) },
        onChanged: {
          addListener: (listener) => {
            onChanged = listener;
          },
        },
        sync: {
          // Hand out a promise per call so the test controls resolution order.
          get: () =>
            new Promise((resolve) => {
              resolvers.push(resolve);
            }),
        },
      },
      tabs: {
        ...chromeMock.tabs,
        query: () =>
          Promise.resolve([
            { id: 1, status: "complete", url: "https://reddit.com/" },
          ]),
        sendMessage,
      },
    };
    new Function("chrome", source)(mock);

    const toSync = (text) => ({
      schema: 2,
      "t:1": { enabled: true, id: "1", text: [text] },
      "w:9": {
        addresses: ["reddit.com"],
        enabled: true,
        id: "9",
        selectors: [".post"],
      },
    });

    // Settle initialization so the listener runs its body rather than queueing.
    await flush();
    resolvers.shift()(toSync("first"));
    await flush();
    sendMessage.mockClear();

    onChanged({}, "sync");
    await flush();
    onChanged({}, "sync");
    await flush();

    // Only the first read is in flight, so resolving out of order is not even
    // possible: the second read starts once the first has assigned `state`.
    expect(resolvers).toHaveLength(1);
    resolvers.shift()(toSync("older"));
    await flush();
    resolvers.shift()(toSync("newer"));
    await flush();

    // `sendMessage(tabId, message)`, so the message is the second argument.
    const patterns = sendMessage.mock.calls.map(([, { data }]) => data.pattern);
    expect(patterns.at(-1)).toContain("newer");
  });

  // The queue must not extend through the tab update: `updateTab` awaits
  // `executeScript`, which does not settle while the target renderer is blocked
  // (a modal dialog, say). A queue waiting on it would stop applying storage
  // changes for as long as that tab is stuck, which is every topic edit, every
  // website edit, and the master switch silently doing nothing.
  it("keeps reading storage while a tab update is stalled", async () => {
    const get = jest.fn(() =>
      Promise.resolve({
        schema: 2,
        "t:1": { enabled: true, id: "1", text: ["spoilers"] },
        "w:9": {
          addresses: ["reddit.com"],
          enabled: true,
          id: "9",
          selectors: [".post"],
        },
      }),
    );
    let onChanged;
    const mock = {
      ...chromeMock,
      scripting: {
        ...chromeMock.scripting,
        executeScript: jest.fn(() => new Promise(() => {})), // never settles
      },
      storage: {
        local: { get: () => Promise.resolve({}) },
        onChanged: {
          addListener: (listener) => {
            onChanged = listener;
          },
        },
        sync: { get },
      },
      tabs: {
        ...chromeMock.tabs,
        query: () =>
          Promise.resolve([
            { id: 1, status: "complete", url: "https://reddit.com/" },
          ]),
      },
    };
    new Function("chrome", source)(mock);
    await flush();
    expect(get).toHaveBeenCalledTimes(1);

    onChanged({}, "sync");
    await flush();

    expect(get).toHaveBeenCalledTimes(2);
  });

  // Handlers gate on the first read, which does not wait for the tab update it
  // triggers, so a stalled inject cannot stop tab events from being processed.
  it("processes tab events while a tab update is still in flight", async () => {
    const executeScript = jest.fn(() => new Promise(() => {})); // never settles
    let onUpdated;
    const mock = {
      ...chromeMock,
      scripting: { ...chromeMock.scripting, executeScript },
      storage: {
        local: { get: () => Promise.resolve({}) },
        onChanged: { addListener: () => {} },
        sync: {
          get: () =>
            Promise.resolve({
              schema: 2,
              "t:1": { enabled: true, id: "1", text: ["spoilers"] },
              "w:9": {
                addresses: ["reddit.com"],
                enabled: true,
                id: "9",
                selectors: [".post"],
              },
            }),
        },
      },
      tabs: {
        ...chromeMock.tabs,
        onUpdated: {
          addListener: (listener) => {
            onUpdated = listener;
          },
        },
        query: () =>
          Promise.resolve([
            { id: 1, status: "complete", url: "https://reddit.com/" },
          ]),
        sendMessage: jest.fn(() => Promise.resolve()),
      },
    };
    new Function("chrome", source)(mock);
    await flush();

    // Initialization's own inject is parked and never settles.
    expect(executeScript).toHaveBeenCalledTimes(1);

    onUpdated(
      2,
      { status: "complete" },
      { id: 2, status: "complete", url: "https://reddit.com/" },
    );
    await flush();

    expect(executeScript).toHaveBeenCalledTimes(2);
  });

  // `chrome.storage` throws synchronously on an invalidated extension context.
  // That throw happens in the queue callback itself, before any inner promise
  // exists, so it must not leave the queue rejected and every later read
  // chained onto it.
  it("keeps processing reads after a storage call throws synchronously", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    const executeScript = jest
      .fn()
      .mockResolvedValue([{ result: { isInstalled: true } }]);
    const sendMessage = jest.fn(() => Promise.resolve());
    let calls = 0;
    let onChanged;
    const mock = {
      ...chromeMock,
      scripting: { ...chromeMock.scripting, executeScript },
      storage: {
        local: { get: () => Promise.resolve({}) },
        onChanged: {
          addListener: (listener) => {
            onChanged = listener;
          },
        },
        sync: {
          get: () => {
            calls += 1;
            if (calls === 1) {
              throw new Error("Extension context invalidated");
            }
            return Promise.resolve({
              schema: 2,
              "t:1": { enabled: true, id: "1", text: ["spoilers"] },
              "w:9": {
                addresses: ["reddit.com"],
                enabled: true,
                id: "9",
                selectors: [".post"],
              },
            });
          },
        },
      },
      tabs: {
        ...chromeMock.tabs,
        query: () =>
          Promise.resolve([
            { id: 1, status: "complete", url: "https://reddit.com/" },
          ]),
        sendMessage,
      },
    };
    new Function("chrome", source)(mock);
    await flush();

    // The failed first read still releases the handlers, so the next storage
    // change is processed rather than dropped.
    expect(sendMessage).not.toHaveBeenCalled();
    onChanged({}, "sync");
    await flush();

    const [, message] = sendMessage.mock.calls.at(-1);
    expect(message.command).toBe("enable");
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("ignores unrelated storage.local changes", async () => {
    const { executeScript, onChanged, sendMessage } = await evaluate({
      id: 1,
      status: "complete",
      url: "https://reddit.com/",
    });
    onChanged({ someOtherKey: { newValue: true } }, "local");
    await flush();
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  // `addresses` is iterated without a guard, so one corrupt website would
  // otherwise abort the match loop and stop filtering on every other one. The
  // corrupt entries are stored ahead of the working one so a regression cannot
  // pass by reaching it first.
  it("keeps filtering the other websites when one is unusable", async () => {
    const { executeScript, onActivated } = await evaluate(
      { id: 1, status: "complete", url: "https://reddit.com/" },
      {},
      {
        schema: 2,
        "t:1": { enabled: true, id: "1", text: ["spoilers"] },
        "w:1": { enabled: true, id: "1" },
        "w:2": { addresses: [], enabled: true, id: "2", selectors: [".x"] },
        "w:9": {
          addresses: ["reddit.com"],
          enabled: true,
          id: "9",
          selectors: [".post"],
        },
      },
    );
    onActivated({ windowId: 1 });
    await flush();
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 } }),
    );
  });

  // A v1 blob is read before migration can run, so a corrupt entry in one
  // reaches `updateState` with nothing in between to have filtered it out.
  it("keeps filtering when a legacy v1 list holds a corrupt entry", async () => {
    const { executeScript, onActivated } = await evaluate(
      { id: 1, status: "complete", url: "https://reddit.com/" },
      {},
      {
        state: {
          topics: { list: [null, { enabled: true, text: "spoilers" }] },
          websites: {
            list: [
              null,
              {
                addresses: ["reddit.com"],
                enabled: true,
                selectors: [".post"],
              },
            ],
          },
        },
      },
    );
    onActivated({ windowId: 1 });
    await flush();
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 } }),
    );
  });

  // Injecting for it would send `selectors: undefined`, which throws where the
  // content script iterates it, so the tab is treated as unmatched instead.
  it("disables a tab that only an unusable website matches", async () => {
    const { executeScript, onActivated, sendMessage } = await evaluate(
      { id: 1, status: "complete", url: "https://example.org/" },
      {},
      {
        schema: 2,
        "t:1": { enabled: true, id: "1", text: ["spoilers"] },
        "w:1": { addresses: ["example.org"], enabled: true, id: "1" },
      },
    );
    onActivated({ windowId: 1 });
    await flush();
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(1, { command: "disable" });
  });

  it("logs a failure inside a tab update rather than leaving it unhandled", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { onActivated, sendMessage } = await evaluate({
      id: 1,
      status: "complete",
      url: "https://example.org/",
    });
    // A synchronous throw, as `chrome.tabs` raises on an invalidated extension
    // context. The inline `.catch()` on the call never sees it, and nothing
    // awaits `updateTab`, so the rejection has nowhere else to surface.
    sendMessage.mockImplementation(() => {
      throw new Error("context invalidated");
    });
    onActivated({ windowId: 1 });
    await flush();

    expect(consoleError).toHaveBeenCalledWith(
      "filter-bubble: updateTab() failed:",
      expect.any(Error),
    );

    consoleError.mockRestore();
  });
});

describe("tabs.onUpdated listener", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  let executeScript;
  let onUpdated;
  let sendMessage;

  // Re-evaluate the source with a state-bearing storage mock and capture the
  // registered listener, so these tests exercise the shipped event handling.
  beforeEach(async () => {
    executeScript = jest
      .fn()
      .mockResolvedValue([{ result: { isInstalled: true } }]);
    sendMessage = jest.fn(() => Promise.resolve());
    const mock = {
      ...chromeMock,
      scripting: { ...chromeMock.scripting, executeScript },
      storage: {
        ...chromeMock.storage,
        sync: {
          get: () =>
            Promise.resolve({
              state: {
                topics: { list: [{ enabled: true, text: "spoilers" }] },
                websites: {
                  list: [
                    {
                      addresses: ["reddit.com"],
                      enabled: true,
                      selectors: [".post"],
                    },
                  ],
                },
              },
            }),
        },
      },
      tabs: {
        ...chromeMock.tabs,
        onUpdated: {
          addListener: (listener) => {
            onUpdated = listener;
          },
        },
        sendMessage,
      },
    };
    new Function("chrome", source)(mock);
    // Flush the async initialization of state from storage.
    await flush();
  });

  const expectInjected = () =>
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 } }),
    );

  it("injects the content script on a url change", async () => {
    const url = "https://reddit.com/r/all";
    onUpdated(1, { status: "loading", url }, { id: 1, url });
    await flush();
    expectInjected();
  });

  it("injects the content script on a reload (changeInfo has no url)", async () => {
    onUpdated(1, { status: "loading" }, { id: 1, url: "https://reddit.com/" });
    await flush();
    expectInjected();
  });

  it("injects the content script on complete, to repair a raced injection", async () => {
    onUpdated(1, { status: "complete" }, { id: 1, url: "https://reddit.com/" });
    await flush();
    expectInjected();
  });

  it("disables filtering on complete when the tab matches no website", async () => {
    onUpdated(
      1,
      { status: "complete" },
      { id: 1, url: "https://example.org/" },
    );
    await flush();
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(1, { command: "disable" });
  });

  it("does not disable on loading when the tab matches no website", async () => {
    onUpdated(1, { status: "loading" }, { id: 1, url: "https://example.org/" });
    await flush();
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("ignores events without a status change", async () => {
    onUpdated(
      1,
      { favIconUrl: "https://reddit.com/favicon.ico" },
      { id: 1, url: "https://reddit.com/" },
    );
    await flush();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("ignores pre-commit events, where pendingUrl differs from url", async () => {
    onUpdated(
      1,
      { status: "loading" },
      { id: 1, pendingUrl: "https://example.org/", url: "https://reddit.com/" },
    );
    await flush();
    expect(executeScript).not.toHaveBeenCalled();
  });

  // This is the higher-traffic of the two `updateTab` call sites, so it needs
  // its own coverage: the other one passing says nothing about this one.
  it("logs a failure inside a tab update rather than leaving it unhandled", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // A synchronous throw, as `chrome.tabs` raises on an invalidated extension
    // context. The inline `.catch()` on the call never sees it.
    sendMessage.mockImplementation(() => {
      throw new Error("context invalidated");
    });

    onUpdated(
      1,
      { status: "complete" },
      { id: 1, url: "https://example.org/" },
    );
    await flush();

    expect(consoleError).toHaveBeenCalledWith(
      "filter-bubble: updateTab() failed:",
      expect.any(Error),
    );

    consoleError.mockRestore();
  });
});

// `chrome.*` raises synchronously on an invalidated extension context. Nothing
// awaits the handlers that reach `chrome.tabs.query`, so the throw has nowhere
// to surface on its own, and a `.catch()` chained onto the call is attached too
// late to see it. Each case drives a different one of those handlers and pins
// the failure to `tabs.query`, rather than to whichever caller is on the stack.
describe("a synchronous throw from chrome.tabs.query", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const evaluateThenBreakQuery = async () => {
    let onActivated;
    let onChanged;
    let onConnect;
    const query = jest.fn(() => Promise.resolve([]));
    const mock = {
      ...chromeMock,
      runtime: {
        ...chromeMock.runtime,
        onConnect: {
          addListener: (listener) => {
            onConnect = listener;
          },
        },
      },
      storage: {
        ...chromeMock.storage,
        onChanged: {
          addListener: (listener) => {
            onChanged = listener;
          },
        },
      },
      tabs: {
        ...chromeMock.tabs,
        onActivated: {
          addListener: (listener) => {
            onActivated = listener;
          },
        },
        query,
      },
    };
    new Function("chrome", source)(mock);
    await flush();
    // Break it only after initialization, which reaches `tabs.query` through
    // `resetCurrentTab` and would otherwise log once before the case begins.
    query.mockImplementation(() => {
      throw new Error("context invalidated");
    });
    return { onActivated, onChanged, onConnect };
  };

  // Named for the call that failed. Reporting it against the caller instead
  // would blame the read queue's storage catch for a tabs failure.
  const expectLogged = (consoleError) =>
    expect(consoleError).toHaveBeenCalledWith(
      "filter-bubble: tabs.query() failed:",
      expect.any(Error),
    );

  let consoleError;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("logs a synchronous throw raised by a tab event", async () => {
    const { onActivated } = await evaluateThenBreakQuery();

    onActivated({ windowId: 1 });
    await flush();

    expectLogged(consoleError);
  });

  // `updateState` calls `resetCurrentTab` from inside the read queue, so a throw
  // escaping it would land in that chain's catch and be reported as a storage
  // failure, sending anyone reading the log after the wrong subsystem.
  it("is not reported as a storage failure when a storage change drives it", async () => {
    const { onChanged } = await evaluateThenBreakQuery();

    onChanged({}, "sync");
    await flush();

    expectLogged(consoleError);
    expect(consoleError).not.toHaveBeenCalledWith(
      "filter-bubble: storage.get() failed:",
      expect.anything(),
    );
  });

  it("logs a synchronous throw raised by opening the highlight port", async () => {
    const { onConnect } = await evaluateThenBreakQuery();

    onConnect({ onDisconnect: { addListener: () => {} } });
    await flush();

    expectLogged(consoleError);
  });

  it("logs a synchronous throw raised by closing the highlight port", async () => {
    const { onConnect } = await evaluateThenBreakQuery();
    let onDisconnect;
    onConnect({
      onDisconnect: {
        addListener: (listener) => {
          onDisconnect = listener;
        },
      },
    });
    await flush();
    consoleError.mockClear();

    onDisconnect();
    await flush();

    expectLogged(consoleError);
  });
});

describe("runtime.onMessage listener", () => {
  let onMessage;
  let setBadgeText;

  // Re-evaluate the source to capture the registered listener, so these tests
  // exercise the shipped badge-count handling.
  beforeEach(() => {
    setBadgeText = jest.fn(() => Promise.resolve());
    const mock = {
      ...chromeMock,
      action: { setBadgeText },
      runtime: {
        ...chromeMock.runtime,
        onMessage: {
          addListener: (listener) => {
            onMessage = listener;
          },
        },
      },
    };
    new Function("chrome", source)(mock);
  });

  it("sets the badge for the sender's tab on a count message", () => {
    onMessage({ command: "count", data: { count: 3 } }, { tab: { id: 7 } });

    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "3" });
  });

  it("clears the badge when the count is zero", () => {
    onMessage({ command: "count", data: { count: 0 } }, { tab: { id: 7 } });

    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "" });
  });

  it("ignores a count message from a sender without a tab", () => {
    onMessage({ command: "count", data: { count: 3 } }, {});

    expect(setBadgeText).not.toHaveBeenCalled();
  });

  // Guarding `setBadge` against a throw is pointless if reading the payload can
  // throw first, in the same listener and one line earlier.
  it("clears the badge for a count message that carries no payload", () => {
    expect(() =>
      onMessage({ command: "count" }, { tab: { id: 7 } }),
    ).not.toThrow();

    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "" });
  });

  // `chrome.action` raises synchronously on an invalidated extension context,
  // where a `.catch()` chained onto the call is attached too late to see it. The
  // throw would escape the listener itself, which the browser reports on its own
  // terms rather than through the extension's own logging.
  it("logs a synchronous throw from setBadgeText rather than escaping", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    setBadgeText.mockImplementation(() => {
      throw new Error("context invalidated");
    });

    expect(() =>
      onMessage({ command: "count", data: { count: 3 } }, { tab: { id: 7 } }),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleError).toHaveBeenCalledWith(
      "filter-bubble: setBadge() failed:",
      expect.any(Error),
    );

    consoleError.mockRestore();
  });
});

describe("toPattern", () => {
  it("returns an empty string when there are no topics", () => {
    expect(toPattern([])).toBe("");
  });

  it("excludes disabled topics", () => {
    expect(toPattern([{ enabled: false, text: "spoilers" }])).toBe("");
  });

  it("wraps the alternation in non-word lookarounds once", () => {
    expect(toPattern([{ enabled: true, text: "spoilers" }])).toBe(
      "(?<!\\w)(?:spoilers)(?!\\w)",
    );
  });

  it("joins multiple enabled topics with alternation", () => {
    expect(
      toPattern([
        { enabled: true, text: "spoilers" },
        { enabled: true, text: "politics" },
      ]),
    ).toBe("(?<!\\w)(?:spoilers|politics)(?!\\w)");
  });

  it("deduplicates repeated topics", () => {
    expect(
      toPattern([
        { enabled: true, text: "spoilers" },
        { enabled: true, text: "spoilers" },
      ]),
    ).toBe("(?<!\\w)(?:spoilers)(?!\\w)");
  });

  it("escapes regex metacharacters in topic text", () => {
    expect(toPattern([{ enabled: true, text: "c++" }])).toBe(
      "(?<!\\w)(?:c\\+\\+)(?!\\w)",
    );
  });

  it("ignores stored topic text that is missing or not a string", () => {
    // A throw here would reject the whole state read, leaving the background
    // filtering on its previous pattern with only a console error.
    expect(
      toPattern([
        { enabled: true },
        { enabled: true, text: 5 },
        { enabled: true, text: { a: 1 } },
        { enabled: true, text: [null, undefined, "spoilers"] },
      ]),
    ).toBe("(?<!\\w)(?:spoilers)(?!\\w)");
  });

  it("returns an empty pattern when no topic text survives", () => {
    expect(toPattern([{ enabled: true }, { enabled: true, text: 5 }])).toBe("");
  });

  it("never returns a pattern that matches everything", () => {
    // A falsy pattern is the "filter nothing" signal, so an empty topic set
    // must not compile to an empty alternation, which matches every string.
    [
      [],
      [{ enabled: false, text: "spoilers" }],
      [{ enabled: true, text: [] }],
      [{ enabled: true, text: "" }],
      [{ enabled: true, text: ["", ""] }],
    ].forEach((list) => expect(toPattern(list)).toBe(""));
  });

  it("drops empty phrases rather than admitting an always-matching branch", () => {
    const regex = new RegExp(
      toPattern([{ enabled: true, text: ["", "spoilers"] }]),
      "i",
    );
    expect(regex.test("spoilers ahead")).toBe(true);
    expect(regex.test("nothing to see")).toBe(false);
  });

  it("matches a longer topic that a shorter one prefixes", () => {
    // The factored form relies on the engine retrying every alternative at a
    // position before advancing, which these overlaps exercise.
    const regex = new RegExp(
      toPattern([
        { enabled: true, text: "cat" },
        { enabled: true, text: "cats" },
      ]),
      "i",
    );
    expect(regex.test("cats")).toBe(true);
    expect(regex.test("cat")).toBe(true);
    expect(regex.test("catsup")).toBe(false);
  });

  it("matches when the overlapping topic ends in a non-word character", () => {
    const regex = new RegExp(
      toPattern([
        { enabled: true, text: "c" },
        { enabled: true, text: "c++" },
      ]),
      "i",
    );
    expect(regex.test("c++")).toBe(true);
    expect(regex.test("a c thing")).toBe(true);
    expect(regex.test("cc")).toBe(false);
  });

  it("matches topics with non-word edge characters as whole tokens", () => {
    // `\b` could never match against a non-word edge, hence the lookarounds.
    const regex = new RegExp(toPattern([{ enabled: true, text: "c++" }]), "i");
    expect(regex.test("I love c++ dearly")).toBe(true);
    expect(regex.test("ends with c++")).toBe(true);
    expect(regex.test("abc++")).toBe(false);
    expect(regex.test("c++x")).toBe(false);
  });

  it("does not let a symbol-only topic match inside words or numbers", () => {
    const regex = new RegExp(toPattern([{ enabled: true, text: "-" }]), "i");
    expect(regex.test("2026-07-26")).toBe(false);
    expect(regex.test("a - b")).toBe(true);
  });

  it("produces a pattern that matches whole words only", () => {
    const regex = new RegExp(toPattern([{ enabled: true, text: "art" }]), "i");
    expect(regex.test("modern art show")).toBe(true);
    expect(regex.test("smart cartel")).toBe(false);
  });
});
