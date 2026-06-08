import { toId } from "./websites";

describe("websites toId", () => {
  it("generates consistent ID from addresses array", () => {
    expect(toId({ addresses: ["example.com", "test.org"] })).toBe(
      "example.com,test.org",
    );
  });

  it("generates consistent ID from addresses string", () => {
    expect(toId({ addresses: "example.com, test.org" })).toBe(
      "example.com,test.org",
    );
  });

  it("normalizes and sorts addresses for consistent IDs", () => {
    expect(toId({ addresses: "test.org, example.com" })).toBe(
      "example.com,test.org",
    );
  });

  it("handles empty/null addresses", () => {
    expect(toId({ addresses: "" })).toBe("");
    expect(toId({ addresses: null })).toBe("");
    expect(toId({})).toBe("");
  });
});
