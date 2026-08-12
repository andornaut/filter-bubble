import { findAddressConflict, toContentKey, toId } from "./websites";

describe("websites toContentKey", () => {
  it("generates consistent key from addresses array", () => {
    expect(toContentKey({ addresses: ["example.com", "test.org"] })).toBe(
      "example.com,test.org",
    );
  });

  it("generates consistent key from addresses string", () => {
    expect(toContentKey({ addresses: "example.com, test.org" })).toBe(
      "example.com,test.org",
    );
  });

  it("normalizes and sorts addresses for consistent keys", () => {
    expect(toContentKey({ addresses: "test.org, example.com" })).toBe(
      "example.com,test.org",
    );
  });

  it("handles empty/null addresses", () => {
    expect(toContentKey({ addresses: "" })).toBe("");
    expect(toContentKey({ addresses: null })).toBe("");
    expect(toContentKey({})).toBe("");
  });
});

describe("websites toId", () => {
  it("returns the item's stable id", () => {
    expect(toId({ addresses: ["example.com"], id: "42" })).toBe("42");
  });
});

describe("findAddressConflict", () => {
  const list = [
    { addresses: ["example.com", "news.example.com"], id: "1" },
    { addresses: ["other.org"], enabled: false, id: "2" },
  ];

  it("accepts a website that shares no domain name", () => {
    expect(findAddressConflict(list, { addresses: ["fresh.test"] })).toBe("");
  });

  it("refuses a website that shares one domain name of several", () => {
    expect(
      findAddressConflict(list, { addresses: ["fresh.test", "example.com"] }),
    ).toBe("Already covered by another website: example.com");
  });

  it("names every domain name shared with the same website", () => {
    expect(
      findAddressConflict(list, {
        addresses: ["example.com", "news.example.com"],
      }),
    ).toBe("Already covered by another website: example.com, news.example.com");
  });

  // A disabled website is still a configuration; enabling it later must not be
  // able to resurrect a collision.
  it("refuses a website that collides with a disabled one", () => {
    expect(findAddressConflict(list, { addresses: ["other.org"] })).toBe(
      "Already covered by another website: other.org",
    );
  });

  it("does not consider the website being edited to collide with itself", () => {
    expect(findAddressConflict(list, { addresses: ["example.com"] }, "1")).toBe(
      "",
    );
  });

  it("accepts a website with no addresses at all", () => {
    expect(findAddressConflict(list, {})).toBe("");
  });
});
