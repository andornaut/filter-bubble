import { toId as topicsToId } from "./topics";
import { toId as websitesToId } from "./websites";

describe("topics toId", () => {
  it("generates consistent ID from text array", () => {
    expect(topicsToId({ text: ["apple", "banana"] })).toBe("apple,banana");
  });

  it("generates consistent ID from text string", () => {
    expect(topicsToId({ text: "apple, banana" })).toBe("apple,banana");
  });

  it("sorts text for consistent IDs", () => {
    expect(topicsToId({ text: "banana, apple" })).toBe("apple,banana");
  });

  it("trims whitespace but preserves case", () => {
    expect(topicsToId({ text: "  APPLE  ,  banana  " })).toBe("APPLE,banana");
  });

  it("handles empty/null text", () => {
    expect(topicsToId({ text: "" })).toBe("");
    expect(topicsToId({ text: null })).toBe("");
    expect(topicsToId({})).toBe("");
  });
});

describe("websites toId", () => {
  it("generates consistent ID from addresses array", () => {
    expect(websitesToId({ addresses: ["example.com", "test.org"] })).toBe("example.com,test.org");
  });

  it("generates consistent ID from addresses string", () => {
    expect(websitesToId({ addresses: "example.com, test.org" })).toBe("example.com,test.org");
  });

  it("normalizes and sorts addresses for consistent IDs", () => {
    expect(websitesToId({ addresses: "test.org, example.com" })).toBe("example.com,test.org");
  });

  it("handles empty/null addresses", () => {
    expect(websitesToId({ addresses: "" })).toBe("");
    expect(websitesToId({ addresses: null })).toBe("");
    expect(websitesToId({})).toBe("");
  });
});
