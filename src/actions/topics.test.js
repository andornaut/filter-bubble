import { toContentKey, toId } from "./topics";

describe("topics toContentKey", () => {
  it("generates consistent key from text array", () => {
    expect(toContentKey({ text: ["apple", "banana"] })).toBe("apple,banana");
  });

  it("generates consistent key from text string", () => {
    expect(toContentKey({ text: "apple, banana" })).toBe("apple,banana");
  });

  it("sorts text for consistent keys", () => {
    expect(toContentKey({ text: "banana, apple" })).toBe("apple,banana");
  });

  it("trims whitespace but preserves case", () => {
    expect(toContentKey({ text: "  APPLE  ,  banana  " })).toBe("APPLE,banana");
  });

  it("handles empty/null text", () => {
    expect(toContentKey({ text: "" })).toBe("");
    expect(toContentKey({ text: null })).toBe("");
    expect(toContentKey({})).toBe("");
  });
});

describe("topics toId", () => {
  it("returns the item's stable id", () => {
    expect(toId({ id: "42", text: ["apple"] })).toBe("42");
  });
});
