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

const { matchedWebsite, matchesAddress, toPattern } = new Function(
  "chrome",
  `${source}\nreturn { matchedWebsite, matchesAddress, toPattern };`,
)(chromeMock);

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

describe("toPattern", () => {
  it("returns an empty string when there are no topics", () => {
    expect(toPattern([])).toBe("");
  });

  it("excludes disabled topics", () => {
    expect(toPattern([{ enabled: false, text: "spoilers" }])).toBe("");
  });

  it("wraps each enabled topic in word boundaries", () => {
    expect(toPattern([{ enabled: true, text: "spoilers" }])).toBe(
      "(?:\\bspoilers\\b)",
    );
  });

  it("joins multiple enabled topics with alternation", () => {
    expect(
      toPattern([
        { enabled: true, text: "spoilers" },
        { enabled: true, text: "politics" },
      ]),
    ).toBe("(?:\\bspoilers\\b)|(?:\\bpolitics\\b)");
  });

  it("deduplicates repeated topics", () => {
    expect(
      toPattern([
        { enabled: true, text: "spoilers" },
        { enabled: true, text: "spoilers" },
      ]),
    ).toBe("(?:\\bspoilers\\b)");
  });

  it("escapes regex metacharacters in topic text", () => {
    expect(toPattern([{ enabled: true, text: "c++" }])).toBe(
      "(?:\\bc\\+\\+\\b)",
    );
  });

  it("produces a pattern that matches whole words only", () => {
    const regex = new RegExp(toPattern([{ enabled: true, text: "art" }]), "i");
    expect(regex.test("modern art show")).toBe(true);
    expect(regex.test("smart cartel")).toBe(false);
  });
});
