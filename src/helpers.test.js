import { humanDate, sortByModifiedDateDesc, toCanonicalArray, unsplit } from "./helpers";

describe("toCanonicalArray", () => {
  it("splits comma-separated values and trims whitespace", () => {
    expect(toCanonicalArray("a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("handles newline-separated values", () => {
    expect(toCanonicalArray("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("deduplicates values", () => {
    expect(toCanonicalArray("a, b, a, c, b")).toEqual(["a", "b", "c"]);
  });

  it("returns sorted array", () => {
    expect(toCanonicalArray("c, a, b")).toEqual(["a", "b", "c"]);
  });

  it("filters empty strings", () => {
    expect(toCanonicalArray("a, , b, ,c")).toEqual(["a", "b", "c"]);
  });

  it("handles empty input", () => {
    expect(toCanonicalArray("")).toEqual([]);
    expect(toCanonicalArray(null)).toEqual([]);
    expect(toCanonicalArray(undefined)).toEqual([]);
  });
});

describe("unsplit", () => {
  it("joins array with comma and space", () => {
    expect(unsplit(["a", "b", "c"])).toBe("a, b, c");
  });

  it("handles empty array", () => {
    expect(unsplit([])).toBe("");
  });

  it("handles null/undefined", () => {
    expect(unsplit(null)).toBe("");
    expect(unsplit(undefined)).toBe("");
  });
});

describe("sortByModifiedDateDesc", () => {
  it("sorts by modifiedDate in descending order", () => {
    const items = [
      { id: 1, modifiedDate: "2024-01-01" },
      { id: 2, modifiedDate: "2024-03-01" },
      { id: 3, modifiedDate: "2024-02-01" },
    ];
    const sorted = sortByModifiedDateDesc(items);
    expect(sorted.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("does not mutate original array", () => {
    const items = [
      { id: 1, modifiedDate: "2024-01-01" },
      { id: 2, modifiedDate: "2024-02-01" },
    ];
    sortByModifiedDateDesc(items);
    expect(items[0].id).toBe(1);
  });
});

describe("humanDate", () => {
  it("returns time for today's date", () => {
    const now = new Date();
    const result = humanDate(now.toISOString());
    expect(result).toMatch(/^\d{1,2}:\d{2}(am|pm)$/);
  });

  it("returns date string for past dates", () => {
    const result = humanDate("2020-01-15T12:00:00Z");
    expect(result).toBe("Wed Jan 15 2020");
  });
});
