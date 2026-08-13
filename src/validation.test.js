import {
  canonicalizeAddresses,
  canonicalizeSelectors,
  canonicalizeText,
  DOMAIN_NAME_REGEX,
  SCHEME_REGEX,
} from "./validation";

describe("domain name validation", () => {
  const isValidDomain = (domain) => DOMAIN_NAME_REGEX.test(domain);

  describe("valid domains", () => {
    it.each([
      "example.com",
      "sub.example.com",
      "deep.sub.example.com",
      "example.co.uk",
      "x1.com",
      "test-site.com",
      "ab.cd",
      "x.com", // single-char labels are valid DNS
      "t.co",
    ])("accepts %s", (domain) => {
      expect(isValidDomain(domain)).toBe(true);
    });
  });

  describe("invalid domains", () => {
    it.each([
      "-example.com", // starts with hyphen
      "example-.com", // ends with hyphen before dot
      ".example.com", // starts with dot
      "example.com.", // ends with dot
      "exam ple.com", // contains space
      "example..com", // double dot
      "", // empty
    ])("rejects %s", (domain) => {
      expect(isValidDomain(domain)).toBe(false);
    });
  });
});

describe("scheme regex", () => {
  it.each([
    ["http://example.com", "example.com"],
    ["https://example.com", "example.com"],
    ["://example.com", "example.com"],
    ["example.com", "example.com"], // no scheme is left untouched
  ])("strips the scheme from %s", (url, expected) => {
    expect(url.replace(SCHEME_REGEX, "")).toBe(expected);
  });
});

describe("canonicalizeAddresses", () => {
  it.each([
    ["example.com", ["example.com"]],
    ["https://example.com", ["example.com"]],
    // A URL copied out of the browser's address bar carries a trailing slash.
    ["https://example.com/", ["example.com"]],
    ["EXAMPLE.com/", ["example.com"]],
    ["example.com/", ["example.com"]],
    // Trimmed, lowercased, de-duplicated and sorted.
    [" B.com , https://a.com/ , A.COM ", ["a.com", "b.com"]],
    [
      ["https://b.com/", "a.com"],
      ["a.com", "b.com"],
    ],
  ])("canonicalizes %p", (value, expected) => {
    expect(canonicalizeAddresses(value)).toEqual(expected);
  });

  it.each([
    "example.com/path",
    "https://example.com/path/",
    "http://example.com:8080",
    "not a domain",
    "example.com//",
  ])("rejects %s", (value) => {
    expect(() => canonicalizeAddresses(value)).toThrow(
      "isn't a valid domain name",
    );
  });
});

// Topic matching is case-insensitive, so the stored phrases are lowercased and
// the pattern is compiled with the `i` flag. Both paths into the store, the
// add/edit form and import, run through here.
describe("canonicalizeText", () => {
  it.each([
    [" Politics , sports , politics ", ["politics", "sports"]],
    ["Politics\nSports", ["politics", "sports"]],
    [
      ["Sports", "politics"],
      ["politics", "sports"],
    ],
    ["", []],
    [" , ", []],
    [undefined, []],
    // Lowercasing follows each script's own rules.
    ["Выборы, ÉLECTION", ["élection", "выборы"]],
  ])("canonicalizes %p", (value, expected) => {
    expect(canonicalizeText(value)).toEqual(expected);
  });

  // The sort is by code unit rather than by locale, which keeps the stored
  // order, and so duplicate detection, the same on every device.
  it("sorts by code unit rather than by locale", () => {
    expect(canonicalizeText("z, é, a")).toEqual(["a", "z", "é"]);
  });
});

// Selectors are case-sensitive: `#A1` and `#a1` are different elements.
describe("canonicalizeSelectors", () => {
  it.each([
    [" article , .Thing ", [".Thing", "article"]],
    ["article\n.thing", [".thing", "article"]],
    ["article, article", ["article"]],
    ["", []],
  ])("canonicalizes %p", (value, expected) => {
    expect(canonicalizeSelectors(value)).toEqual(expected);
  });
});
