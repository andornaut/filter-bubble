import { toId } from "./topics";

describe("topics toId", () => {
  it("generates consistent ID from text array", () => {
    expect(toId({ text: ["apple", "banana"] })).toBe("apple,banana");
  });

  it("generates consistent ID from text string", () => {
    expect(toId({ text: "apple, banana" })).toBe("apple,banana");
  });

  it("sorts text for consistent IDs", () => {
    expect(toId({ text: "banana, apple" })).toBe("apple,banana");
  });

  it("trims whitespace but preserves case", () => {
    expect(toId({ text: "  APPLE  ,  banana  " })).toBe("APPLE,banana");
  });

  it("handles empty/null text", () => {
    expect(toId({ text: "" })).toBe("");
    expect(toId({ text: null })).toBe("");
    expect(toId({})).toBe("");
  });
});
