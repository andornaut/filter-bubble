import { toContentKey, toId } from "./websites";

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
