import { readFileSync } from "fs";
import { join } from "path";

// background.js ships as a non-bundled service worker and exports nothing. Load
// the source, mock the `chrome` global it touches at the top level, and evaluate
// it so these tests exercise the actual shipped helpers.
const source = readFileSync(join(__dirname, "background.js"), "utf8");

const noopPromise = () => Promise.resolve();
const chromeMock = {
  action: {
    setBadgeText: noopPromise,
    setIcon: noopPromise,
    setTitle: noopPromise,
  },
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

  it("treats a missing legacy v1 collection as empty", () => {
    const raw = { state: { topics: { list: [{ text: "spoilers" }] } } };
    expect(toLists(raw)).toEqual({
      topicsList: [{ text: "spoilers" }],
      websitesList: [],
    });
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

  // Re-evaluate the source against a mock whose active tabs are `tabs` (one tab
  // or a list of them, one per window), then clear the mocks: initialization
  // runs `resetActiveTabs` through the same `tabs.query`, so without this the
  // assertions would pass on the initialization pass alone and never exercise a
  // listener.
  // `localStore` backs `storage.local` and is returned so a test can disable
  // Filter Bubble and then fire the corresponding `onChanged` event.
  const evaluate = async (tabs, localStore = {}, syncStore = SYNC_STORE) => {
    const activeTabs = [].concat(tabs);
    const executeScript = jest
      .fn()
      .mockResolvedValue([{ result: { isInstalled: true } }]);
    const query = jest.fn(() => Promise.resolve(activeTabs));
    const sendMessage = jest.fn(() => Promise.resolve());
    const setBadgeText = jest.fn(() => Promise.resolve());
    let onActivated;
    let onChanged;
    let onConnect;
    const mock = {
      ...chromeMock,
      action: { ...chromeMock.action, setBadgeText },
      runtime: {
        ...chromeMock.runtime,
        onConnect: {
          addListener: (listener) => {
            onConnect = listener;
          },
        },
      },
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
        query,
        sendMessage,
      },
    };
    new Function("chrome", source)(mock);
    await flush();
    executeScript.mockClear();
    query.mockClear();
    sendMessage.mockClear();
    setBadgeText.mockClear();
    return {
      executeScript,
      localStore,
      onActivated,
      onChanged,
      onConnect,
      query,
      sendMessage,
      setBadgeText,
    };
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

  it("disables a matching tab while Filter Bubble is disabled", async () => {
    const { executeScript, onActivated, sendMessage } = await evaluate(
      { id: 1, status: "complete", url: "https://reddit.com/" },
      { disabled: true },
    );
    onActivated({ windowId: 1 });
    await flush();
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(1, { command: "disable" });
  });

  it("re-reads state when the disabled flag changes in storage.local", async () => {
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

  // A tab-scoped badge outlives the document it was set for, so the count from
  // a filtered page would otherwise follow the tab to the next site, where no
  // content script runs to report a zero of its own.
  it("clears the badge for a tab that matches no website", async () => {
    const { onActivated, setBadgeText } = await evaluate({
      id: 1,
      status: "complete",
      url: "https://example.org/",
    });
    onActivated({ windowId: 1 });
    await flush();
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: "" });
  });

  // The deferred disable waits for the `onUpdated` "complete" pass, but the
  // count belongs to the document the tab is leaving either way.
  it("clears the badge for an unmatched tab whose disable is deferred", async () => {
    const { onActivated, sendMessage, setBadgeText } = await evaluate({
      id: 1,
      status: "loading",
      url: "https://example.org/",
    });
    onActivated({ windowId: 1 });
    await flush();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: "" });
  });

  it("clears the badge of a matching tab while Filter Bubble is disabled", async () => {
    const { onActivated, setBadgeText } = await evaluate(
      { id: 1, status: "complete", url: "https://reddit.com/" },
      { disabled: true },
    );
    onActivated({ windowId: 1 });
    await flush();
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: "" });
  });

  // `tabs.onActivated` fires when the active tab within a window changes, not
  // when focus moves between windows, so a state change is the only chance
  // another window's visible tab gets to stop filtering under superseded state.
  it("re-evaluates the active tab of every window on a state change", async () => {
    const { onChanged, sendMessage } = await evaluate([
      { id: 1, status: "complete", url: "https://example.org/" },
      { id: 2, status: "complete", url: "https://example.net/" },
    ]);
    onChanged({}, "sync");
    await flush();
    expect(sendMessage).toHaveBeenCalledWith(1, { command: "disable" });
    expect(sendMessage).toHaveBeenCalledWith(2, { command: "disable" });
  });

  // `currentWindow` is the last focused window when a service worker asks, and
  // nothing at all when no window has focus, which is how a `storage.sync`
  // change arriving from another browser instance can find no tab to repair.
  it("queries every window's active tab rather than the focused window's", async () => {
    const { onChanged, query } = await evaluate({
      id: 1,
      status: "complete",
      url: "https://reddit.com/",
    });
    onChanged({}, "sync");
    await flush();
    expect(query).toHaveBeenCalledWith({ active: true });
  });

  // `forceHighlight` is global rather than per tab, so an open popup previews
  // in every window, not only the one it was opened in.
  it("applies the highlight preview to every window's active tab", async () => {
    const { onConnect, sendMessage } = await evaluate([
      { id: 1, status: "complete", url: "https://reddit.com/" },
      { id: 2, status: "complete", url: "https://reddit.com/" },
    ]);
    onConnect({ onDisconnect: { addListener: () => {} } });
    await flush();

    expect(sendMessage).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ filterMode: "highlight" }),
      }),
    );
  });

  // Every write the popup makes drives a sweep of its own, which must leave the
  // preview where the port put it rather than narrow it to one window.
  it("keeps every window's active tab in the preview on a state change", async () => {
    const { onChanged, onConnect, sendMessage } = await evaluate([
      { id: 1, status: "complete", url: "https://reddit.com/" },
      { id: 2, status: "complete", url: "https://reddit.com/" },
    ]);
    onConnect({ onDisconnect: { addListener: () => {} } });
    await flush();
    sendMessage.mockClear();

    onChanged({}, "sync");
    await flush();

    expect(sendMessage).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ filterMode: "highlight" }),
      }),
    );
  });

  // The preview ends everywhere it was applied. `onActivated` does not fire for
  // a window the user merely looks at, so nothing else would return that
  // window's tab to filtering, and by now the focus may have moved to the
  // window whose click closed the popup.
  it("returns every window's active tab to filtering when the popup closes", async () => {
    const { onConnect, sendMessage } = await evaluate([
      { id: 1, status: "complete", url: "https://reddit.com/" },
      { id: 2, status: "complete", url: "https://reddit.com/" },
    ]);
    let onDisconnect;
    onConnect({
      onDisconnect: {
        addListener: (listener) => {
          onDisconnect = listener;
        },
      },
    });
    await flush();
    sendMessage.mockClear();

    onDisconnect();
    await flush();

    expect(sendMessage).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ filterMode: "remove" }),
      }),
    );
  });

  // The activation itself names the window, so that path stays scoped to it.
  it("scopes the onActivated re-evaluation to the activated window", async () => {
    const { onActivated, query } = await evaluate({
      id: 1,
      status: "complete",
      url: "https://reddit.com/",
    });
    onActivated({ windowId: 3 });
    await flush();
    expect(query).toHaveBeenCalledWith({ active: true, windowId: 3 });
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
  // website edit, and disabling Filter Bubble silently doing nothing.
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
    // `resetActiveTabs` and would otherwise log once before the case begins.
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

  // `updateState` calls `resetActiveTabs` from inside the read queue, so a throw
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

describe("toolbar button", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const DEFAULT_PATH = { 16: "/icons/16.png", 32: "/icons/32.png" };
  const DISABLED_PATH = {
    16: "/icons/16-disabled.png",
    32: "/icons/32-disabled.png",
  };

  // Re-evaluate the source so the button is set from the initial storage read,
  // which is the only pass a freshly woken service worker is guaranteed.
  // `localStore` is returned so a test can re-enable Filter Bubble and then
  // fire the corresponding `onChanged` event.
  const evaluate = async (localStore = {}) => {
    const setIcon = jest.fn(() => Promise.resolve());
    const setTitle = jest.fn(() => Promise.resolve());
    let onChanged;
    const mock = {
      ...chromeMock,
      action: { ...chromeMock.action, setIcon, setTitle },
      storage: {
        ...chromeMock.storage,
        local: { get: () => Promise.resolve({ ...localStore }) },
        onChanged: {
          addListener: (listener) => {
            onChanged = listener;
          },
        },
      },
    };
    new Function("chrome", source)(mock);
    await flush();
    return { localStore, onChanged, setIcon, setTitle };
  };

  it("greys the icon out while Filter Bubble is disabled", async () => {
    const { setIcon } = await evaluate({ disabled: true });

    expect(setIcon).toHaveBeenCalledWith({ path: DISABLED_PATH });
  });

  // Colour is the only channel the icon carries the state on, so the tooltip is
  // what reaches a reader who cannot see it.
  it("marks the tooltip while Filter Bubble is disabled", async () => {
    const { setTitle } = await evaluate({ disabled: true });

    expect(setTitle).toHaveBeenCalledWith({
      title: "Filter Bubble (Disabled)",
    });
  });

  it("uses the colour icon and plain tooltip while filtering is active", async () => {
    const { setIcon, setTitle } = await evaluate();

    expect(setIcon).toHaveBeenCalledWith({ path: DEFAULT_PATH });
    expect(setTitle).toHaveBeenCalledWith({ title: "Filter Bubble" });
  });

  it("restores the icon and tooltip when Filter Bubble is re-enabled", async () => {
    const { localStore, onChanged, setIcon, setTitle } = await evaluate({
      disabled: true,
    });
    setIcon.mockClear();
    setTitle.mockClear();

    delete localStore.disabled;
    onChanged({ disabled: { newValue: false } }, "local");
    await flush();

    expect(setIcon).toHaveBeenCalledWith({ path: DEFAULT_PATH });
    expect(setTitle).toHaveBeenCalledWith({ title: "Filter Bubble" });
  });

  // `chrome.action` raises synchronously on an invalidated extension context.
  // Nothing awaits `updateAction`, so without the `try` the throw would surface
  // as an unhandled rejection instead of a logged failure.
  it("logs a synchronous throw from the action API rather than escaping", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const setIcon = jest.fn(() => {
      throw new Error("context invalidated");
    });
    new Function("chrome", source)({
      ...chromeMock,
      action: { ...chromeMock.action, setIcon },
    });
    await flush();

    expect(consoleError).toHaveBeenCalledWith(
      "filter-bubble: updateAction() failed:",
      expect.any(Error),
    );

    consoleError.mockRestore();
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
    // Debug level, because a tab that closed between the id being read and the
    // call being made is the expected failure, not a fault worth an extension
    // error.
    const consoleDebug = jest
      .spyOn(console, "debug")
      .mockImplementation(() => {});
    setBadgeText.mockImplementation(() => {
      throw new Error("context invalidated");
    });

    expect(() =>
      onMessage({ command: "count", data: { count: 3 } }, { tab: { id: 7 } }),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleDebug).toHaveBeenCalledWith(
      "filter-bubble: setBadge() failed:",
      expect.any(Error),
    );

    consoleDebug.mockRestore();
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
