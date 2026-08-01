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

  // Re-evaluate the source against a mock whose active tab is `tab`, then clear
  // the mocks: initialization runs `resetCurrentTab` through the same
  // `tabs.query`, so without this the assertions would pass on the
  // initialization pass alone and never exercise a listener.
  // `localStore` backs `storage.local` and is returned so a test can flip the
  // master switch and then fire the corresponding `onChanged` event.
  const evaluate = async (tab, localStore = {}) => {
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
});

describe("toPattern", () => {
  it("returns an empty string when there are no topics", () => {
    expect(toPattern([])).toBe("");
  });

  it("excludes disabled topics", () => {
    expect(toPattern([{ enabled: false, text: "spoilers" }])).toBe("");
  });

  it("wraps each enabled topic in non-word lookarounds", () => {
    expect(toPattern([{ enabled: true, text: "spoilers" }])).toBe(
      "(?:(?<!\\w)spoilers(?!\\w))",
    );
  });

  it("joins multiple enabled topics with alternation", () => {
    expect(
      toPattern([
        { enabled: true, text: "spoilers" },
        { enabled: true, text: "politics" },
      ]),
    ).toBe("(?:(?<!\\w)spoilers(?!\\w))|(?:(?<!\\w)politics(?!\\w))");
  });

  it("deduplicates repeated topics", () => {
    expect(
      toPattern([
        { enabled: true, text: "spoilers" },
        { enabled: true, text: "spoilers" },
      ]),
    ).toBe("(?:(?<!\\w)spoilers(?!\\w))");
  });

  it("escapes regex metacharacters in topic text", () => {
    expect(toPattern([{ enabled: true, text: "c++" }])).toBe(
      "(?:(?<!\\w)c\\+\\+(?!\\w))",
    );
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
