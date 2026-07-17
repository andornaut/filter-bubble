import { DOMAIN_NAME_REGEX, SCHEME_REGEX } from "./validation";

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
