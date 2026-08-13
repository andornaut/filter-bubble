import {
  canonicalizeAddresses,
  canonicalizeSelectors,
  canonicalizeText,
} from "./validation";

// `canonicalizeAddresses` is the only caller of `DOMAIN_NAME_REGEX` and of this
// module's `SCHEME_REGEX`, so the accepted and rejected forms are asserted
// through it rather than against the patterns. background.js carries its own
// copy of `SCHEME_REGEX`, pinned against this one by
// src/browser/duplication.test.js.
describe("canonicalizeAddresses", () => {
  it.each([
    ["example.com", ["example.com"]],
    ["sub.example.com", ["sub.example.com"]],
    ["deep.sub.example.com", ["deep.sub.example.com"]],
    ["example.co.uk", ["example.co.uk"]],
    ["test-site.com", ["test-site.com"]],
    // Single-character labels are valid DNS.
    ["x.com", ["x.com"]],
    ["https://example.com", ["example.com"]],
    // The scheme is optional in the pattern, so a plain-http site is accepted
    // rather than rejected as a malformed domain name.
    ["http://example.com", ["example.com"]],
    // A URL copied out of the browser's address bar carries a trailing slash.
    ["https://example.com/", ["example.com"]],
    ["EXAMPLE.com/", ["example.com"]],
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
    ["example.com/path", "a path"],
    ["https://example.com/path/", "a path"],
    ["http://example.com:8080", "a port"],
    ["example.com//", "a doubled trailing slash"],
    ["not a domain", "a space"],
    ["-example.com", "a leading hyphen"],
    ["example-.com", "a trailing hyphen on a label"],
    [".example.com", "a leading dot"],
    ["example.com.", "a trailing dot"],
    ["example..com", "an empty label"],
  ])("rejects %s, which carries %s", (value) => {
    expect(() => canonicalizeAddresses(value)).toThrow(
      "isn't a valid domain name",
    );
  });
});

// Splitting, trimming, de-duplicating and sorting belong to `toCanonicalArray`
// and are covered in helpers.test.js. What is asserted here is the difference
// between the two wrappers: topic matching is case-insensitive, so phrases are
// lowercased on the way in, and selectors are case-sensitive, so they are not.
describe("canonicalizeText", () => {
  it.each([
    [" Politics , sports , politics ", ["politics", "sports"]],
    [
      ["Sports", "politics"],
      ["politics", "sports"],
    ],
    // Lowercasing follows each script's own rules.
    ["Выборы, ÉLECTION", ["élection", "выборы"]],
    // An absent field, which reaches here as undefined rather than "".
    [undefined, []],
  ])("canonicalizes %p", (value, expected) => {
    expect(canonicalizeText(value)).toEqual(expected);
  });

  // The sort is by code unit rather than by locale, which keeps the stored
  // order, and so duplicate detection, the same on every device.
  it("sorts by code unit rather than by locale", () => {
    expect(canonicalizeText("z, é, a")).toEqual(["a", "z", "é"]);
  });
});

describe("canonicalizeSelectors", () => {
  it("keeps case, so #A1 and #a1 stay different selectors", () => {
    expect(canonicalizeSelectors(" article , .Thing ")).toEqual([
      ".Thing",
      "article",
    ]);
  });
});
