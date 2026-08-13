import {
  humanDate,
  sortByDateDesc,
  toCanonicalArray,
  toIsoDate,
  toItemId,
  toSortDate,
  unsplit,
} from "./helpers";

describe("toCanonicalArray", () => {
  it.each([
    ["splits on commas and trims", "a, b, c", ["a", "b", "c"]],
    ["splits on newlines", "a\nb\nc", ["a", "b", "c"]],
    ["splits on both at once", "a\nb, c", ["a", "b", "c"]],
    ["deduplicates", "a, b, a, c, b", ["a", "b", "c"]],
    ["sorts", "c, a, b", ["a", "b", "c"]],
    ["drops empty entries", "a, , b, ,c", ["a", "b", "c"]],
    ["treats an empty string as no entries", "", []],
    ["treats null as no entries", null, []],
    ["treats undefined as no entries", undefined, []],
  ])("%s", (_, value, expected) => {
    expect(toCanonicalArray(value)).toEqual(expected);
  });
});

describe("unsplit", () => {
  it.each([
    [["a", "b", "c"], "a, b, c"],
    [[], ""],
    // A new item's field, which reaches here before anything is stored.
    [null, ""],
    [undefined, ""],
  ])("joins %p", (value, expected) => {
    expect(unsplit(value)).toBe(expected);
  });
});

// The stored dates are compared as text, so an item's date has to be ISO before
// it is stored rather than merely parseable. Import is where an untrusted one
// enters, and this is what normalizes it there.
describe("toIsoDate", () => {
  it("keeps an ISO date, normalized to milliseconds", () => {
    expect(toIsoDate("2020-01-15T12:00:00Z")).toBe("2020-01-15T12:00:00.000Z");
  });

  // "March 5, 2020" sorts after "2026-..." as text, so a non-ISO date left
  // alone would put the item in the wrong place in the list. A bare date string
  // parses as local time, so compare against the same conversion rather than a
  // fixed UTC literal.
  it("converts a parseable non-ISO date", () => {
    expect(toIsoDate("March 5, 2020")).toBe(new Date("March 5, 2020").toJSON());
  });

  it.each([
    ["an unparseable string", "not a date"],
    ["an empty string", ""],
    ["a number of milliseconds", 1579089600000],
    ["an object", {}],
    ["undefined", undefined],
    ["null", null],
    // `Date.parse` takes a string, so it stringifies whatever it is handed
    // first: a one-element array of a date parses as that date, and a `Date`
    // parses back from its own `toString`. Both would pass a check that only
    // asked whether the value parses, and neither is a date this app stores.
    ["a one-element array holding a date", ["2020-01-15"]],
    ["an empty array", []],
    ["a Date rather than a string", new Date("2020-01-15T12:00:00Z")],
  ])("returns an empty string for %s", (_, value) => {
    expect(toIsoDate(value)).toBe("");
  });
});

// Display order only. Toggling `enabled` and importing bump `modifiedDate`
// alone, so an item that has never carried a `sortDate` (a seeded default, or
// anything stored before the field existed) falls back to the sync clock.
describe("toSortDate", () => {
  it.each([
    [
      "prefers sortDate",
      { modifiedDate: "2024-06-01", sortDate: "2024-01-01" },
      "2024-01-01",
    ],
    [
      "falls back to modifiedDate",
      { modifiedDate: "2024-06-01" },
      "2024-06-01",
    ],
    [
      "falls back past an empty sortDate",
      { modifiedDate: "2024-06-01", sortDate: "" },
      "2024-06-01",
    ],
    ["returns an empty string when the item carries neither", {}, ""],
  ])("%s", (_, item, expected) => {
    expect(toSortDate(item)).toBe(expected);
  });
});

// Ids become the `t:` / `w:` storage keys, so two items may never derive the
// same one: the second would overwrite the first.
describe("toItemId", () => {
  const CREATED = "2026-01-01T00:00:00.000Z";
  const EPOCH_MS = String(Date.parse(CREATED));

  it("derives the id from the date in epoch milliseconds", () => {
    expect(toItemId(new Set(), CREATED)).toBe(EPOCH_MS);
  });

  // Two devices migrating the same v1 item have to land on the same key, or the
  // item duplicates instead of merging.
  it("derives the same id from the same date", () => {
    expect(toItemId(new Set(), CREATED)).toBe(toItemId(new Set(), CREATED));
  });

  it("bumps past an id already taken", () => {
    expect(toItemId(new Set([EPOCH_MS]), CREATED)).toBe(
      String(Number(EPOCH_MS) + 1),
    );
  });

  it("keeps bumping until it finds a free id", () => {
    const taken = new Set([
      EPOCH_MS,
      String(Number(EPOCH_MS) + 1),
      String(Number(EPOCH_MS) + 2),
    ]);

    expect(toItemId(taken, CREATED)).toBe(String(Number(EPOCH_MS) + 3));
  });

  // The caller decides what to reserve, and reserves the id it actually used.
  it("does not reserve the id it returned", () => {
    const taken = new Set();

    toItemId(taken, CREATED);

    expect(taken.size).toBe(0);
  });

  // An id is still needed: a v1 item whose `createdDate` is missing or damaged
  // must migrate rather than be dropped, and the bump keeps the group distinct.
  it.each([
    ["an unparseable date", "not a date"],
    ["no date at all", undefined],
  ])("falls back to a bumpable zero for %s", (_, value) => {
    expect(toItemId(new Set(), value)).toBe("0");
    expect(toItemId(new Set(["0"]), value)).toBe("1");
  });
});

describe("sortByDateDesc", () => {
  it("sorts by sortDate, newest first", () => {
    const items = [
      { id: 1, sortDate: "2024-01-01" },
      { id: 2, sortDate: "2024-03-01" },
      { id: 3, sortDate: "2024-02-01" },
    ];

    expect(sortByDateDesc(items).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("falls back to modifiedDate when sortDate is absent", () => {
    const items = [
      { id: 1, modifiedDate: "2024-01-01" },
      { id: 2, modifiedDate: "2024-03-01" },
      { id: 3, modifiedDate: "2024-02-01" },
    ];

    expect(sortByDateDesc(items).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("ignores modifiedDate when sortDate is present", () => {
    const items = [
      { id: 1, modifiedDate: "2024-12-01", sortDate: "2024-01-01" },
      { id: 2, modifiedDate: "2024-01-01", sortDate: "2024-03-01" },
    ];

    expect(sortByDateDesc(items).map((item) => item.id)).toEqual([2, 1]);
  });

  // Items carrying neither date sort as "" and so land last, rather than
  // throwing or scattering through the list.
  it("puts an item with no date at all last", () => {
    const items = [
      { id: 1 },
      { id: 2, sortDate: "2024-01-01" },
      { id: 3, modifiedDate: "2024-02-01" },
    ];

    expect(sortByDateDesc(items).map((item) => item.id)).toEqual([3, 2, 1]);
  });

  // The list it sorts is statezero state, which the views also read in stored
  // order.
  it("does not reorder the array it was given", () => {
    const items = [
      { id: 1, sortDate: "2024-01-01" },
      { id: 2, sortDate: "2024-02-01" },
      { id: 3, sortDate: "2024-03-01" },
    ];

    sortByDateDesc(items);

    expect(items.map((item) => item.id)).toEqual([1, 2, 3]);
  });
});

// Shown against each item in the edit form. Built from local-time components so
// the assertions hold in any timezone.
describe("humanDate", () => {
  const local = (...args) => new Date(...args).toISOString();

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ["12:05am", [2026, 6, 26, 0, 5], "midnight, which is the 12th hour"],
    ["12:00pm", [2026, 6, 26, 12, 0], "noon, and a zero-padded minute"],
    ["9:30am", [2026, 6, 26, 9, 30], "a morning time"],
    ["1:07pm", [2026, 6, 26, 13, 7], "an afternoon time past the 12th hour"],
  ])("shows %s for %#, which is %s", (expected, parts) => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 26, 18, 0));

    expect(humanDate(local(...parts))).toBe(expected);
  });

  // A date is only useful once it is no longer today, and a time is only useful
  // while it is.
  it("shows the date rather than the time for another day", () => {
    expect(humanDate(local(2020, 0, 15, 12, 0))).toBe("Wed Jan 15 2020");
  });

  it("shows the date for another day at the same time of day", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 26, 12, 0));

    expect(humanDate(local(2026, 6, 25, 12, 0))).toBe("Sat Jul 25 2026");
  });
});
