import { getState, setState } from "statezero/src";

import { sortByDateDesc } from "../helpers";
import { importData, parseImport } from "./import";

describe("parseImport", () => {
  it("returns topics and websites arrays", () => {
    expect(
      parseImport(JSON.stringify({ topics: [{ text: ["a"] }], websites: [] })),
    ).toEqual({ topics: [{ text: ["a"] }], websites: [] });
  });

  it("defaults a missing collection to an empty array", () => {
    expect(parseImport(JSON.stringify({ topics: [{ text: ["a"] }] }))).toEqual({
      topics: [{ text: ["a"] }],
      websites: [],
    });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseImport("{not json")).toThrow(/valid JSON/);
  });

  it("throws when the root is not an object", () => {
    expect(() => parseImport("[]")).toThrow(/must be a JSON object/);
  });

  it("throws when a collection is not a list", () => {
    expect(() => parseImport(JSON.stringify({ topics: {} }))).toThrow(
      /must be lists/,
    );
  });

  it("throws when both collections are empty", () => {
    expect(() =>
      parseImport(JSON.stringify({ topics: [], websites: [] })),
    ).toThrow(/No topics or websites/);
  });
});

describe("importData", () => {
  beforeEach(() => {
    setState(undefined, { topics: { list: [] }, websites: { list: [] } });
  });

  it("adds imported topics and websites", () => {
    importData({
      topics: [{ id: "1", modifiedDate: "2024-01-01", text: ["cats"] }],
      websites: [
        {
          addresses: ["example.com"],
          id: "2",
          modifiedDate: "2024-01-01",
          selectors: ["div"],
        },
      ],
    });
    const { topics, websites } = getState();
    expect(topics.list).toHaveLength(1);
    expect(topics.list[0].text).toEqual(["cats"]);
    expect(topics.list[0].enabled).toBe(true);
    expect(websites.list).toHaveLength(1);
    expect(websites.list[0].addresses).toEqual(["example.com"]);
    expect(websites.list[0].hideInsteadOfRemove).toBe(false);
  });

  it("returns the applied count, deduping repeated ids in the file", () => {
    const counts = importData({
      topics: [
        { id: "1", text: ["cats"] },
        { id: "1", text: ["dogs"] },
        { id: "2", text: ["birds"] },
      ],
    });
    expect(counts).toEqual({ topics: 2, websites: 0 });
    expect(getState().topics.list).toHaveLength(2);
  });

  it("overwrites an existing item when ids collide, even if it is newer", () => {
    setState(undefined, {
      topics: {
        list: [
          {
            createdDate: "2024-01-01",
            enabled: true,
            id: "1",
            modifiedDate: "2999-01-01",
            text: ["local edit"],
          },
        ],
      },
      websites: { list: [] },
    });
    importData({
      topics: [{ id: "1", modifiedDate: "2024-01-01", text: ["imported"] }],
    });
    const { topics } = getState();
    expect(topics.list).toHaveLength(1);
    expect(topics.list[0].text).toEqual(["imported"]);
  });

  it("stamps imported items with a fresh modifiedDate so they win the sync merge", () => {
    importData({
      topics: [{ id: "1", modifiedDate: "2024-01-01", text: ["cats"] }],
    });
    const { topics } = getState();
    // Normalized to full ISO, which parses to the same instant, so ids derived
    // from `createdDate` are unchanged.
    expect(topics.list[0].createdDate).toBe("2024-01-01T00:00:00.000Z");
    expect(topics.list[0].modifiedDate > "2024-01-01").toBe(true);
    // Carried over from the file, so importing does not reshuffle the list.
    expect(topics.list[0].sortDate).toBe("2024-01-01T00:00:00.000Z");
  });

  it("prefers an exported sortDate over modifiedDate for list order", () => {
    importData({
      topics: [
        {
          id: "1",
          modifiedDate: "2024-06-01",
          sortDate: "2024-01-01",
          text: ["cats"],
        },
      ],
    });
    expect(getState().topics.list[0].sortDate).toBe("2024-01-01T00:00:00.000Z");
  });

  it("replaces a malformed date so the list stays sortable", () => {
    importData({
      topics: [
        { id: "1", sortDate: 12345, text: ["cats"] },
        { id: "2", modifiedDate: "not a date", text: ["dogs"] },
        { createdDate: {}, id: "3", sortDate: [], text: ["birds"] },
      ],
    });
    const { topics } = getState();
    topics.list.forEach((topic) => {
      expect(topic.sortDate).toBe(new Date(topic.sortDate).toJSON());
    });
    expect(() => sortByDateDesc(topics.list)).not.toThrow();
  });

  it("normalizes a non-ISO date so it sorts chronologically", () => {
    importData({
      topics: [
        { id: "1", sortDate: "March 5, 2020", text: ["older"] },
        { id: "2", sortDate: "2026-01-01T00:00:00.000Z", text: ["newer"] },
      ],
    });
    const { topics } = getState();
    // Stored as ISO, so lexicographic order matches chronological order. A bare
    // date string parses as local time, so compare against the same conversion
    // rather than a fixed UTC literal.
    expect(topics.list[0].sortDate).toBe(new Date("March 5, 2020").toJSON());
    expect(sortByDateDesc(topics.list).map((t) => t.text[0])).toEqual([
      "newer",
      "older",
    ]);
  });

  it("keys by id only: a different-id item with matching content is added", () => {
    setState(undefined, {
      topics: {
        list: [
          {
            createdDate: "2024-01-01",
            enabled: true,
            id: "1",
            modifiedDate: "2024-01-01",
            text: ["cats"],
          },
        ],
      },
      websites: { list: [] },
    });
    importData({
      topics: [{ id: "99", modifiedDate: "2024-06-01", text: ["cats"] }],
    });
    const { topics } = getState();
    expect(topics.list).toHaveLength(2);
    expect(topics.list.map((topic) => topic.id).sort()).toEqual(["1", "99"]);
  });

  it("keys by id only: an id match overwrites without touching other items", () => {
    setState(undefined, {
      topics: {
        list: [
          {
            createdDate: "2024-01-01",
            enabled: true,
            id: "1",
            modifiedDate: "2024-01-01",
            text: ["cats"],
          },
          {
            createdDate: "2024-01-01",
            enabled: true,
            id: "2",
            modifiedDate: "2024-01-01",
            text: ["dogs"],
          },
        ],
      },
      websites: { list: [] },
    });
    importData({
      topics: [{ id: "1", modifiedDate: "2024-06-01", text: ["birds"] }],
    });
    const { topics } = getState();
    expect(topics.list).toHaveLength(2);
    expect(topics.list.find((topic) => topic.id === "1").text).toEqual([
      "birds",
    ]);
    expect(topics.list.find((topic) => topic.id === "2").text).toEqual([
      "dogs",
    ]);
  });

  it("coerces string content and defaults enabled to true", () => {
    importData({ topics: [{ id: "1", text: "b, a" }] });
    const { topics } = getState();
    expect(topics.list[0].text).toEqual(["a", "b"]);
    expect(topics.list[0].enabled).toBe(true);
  });

  it("throws when a topic has no text", () => {
    expect(() => importData({ topics: [{ id: "1", text: [] }] })).toThrow(
      /non-empty text/,
    );
  });

  it("throws when a website is missing selectors", () => {
    expect(() =>
      importData({ websites: [{ addresses: ["example.com"], id: "1" }] }),
    ).toThrow(/addresses and CSS selectors/);
  });

  it("canonicalizes imported website addresses to bare lowercase domains", () => {
    importData({
      websites: [
        {
          addresses: ["HTTPS://Example.COM", "example.com"],
          id: "1",
          selectors: ["div.ad"],
        },
      ],
    });
    expect(getState().websites.list[0].addresses).toEqual(["example.com"]);
  });

  it("lowercases and trims imported topic text", () => {
    importData({ topics: [{ id: "1", text: ["  Cats  ", "cats"] }] });
    expect(getState().topics.list[0].text).toEqual(["cats"]);
  });

  it("throws on an imported website with an invalid domain", () => {
    expect(() =>
      importData({
        websites: [
          { addresses: ["not a domain"], id: "1", selectors: ["div"] },
        ],
      }),
    ).toThrow(/isn't a valid domain name/);
  });
});
