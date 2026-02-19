// Domain validation regex - must match the one in src/views/websites.js
const DOMAIN_NAME_REGEX = /^[a-z\d]([a-z\d-]{0,61}[a-z\d])(\.[a-z\d]([a-z\d-]{0,61}[a-z\d])?)*$/i;

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
      "ab.cd", // minimum 2 chars per segment
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
