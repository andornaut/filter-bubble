import { sortByDateDesc } from "../helpers";
import {
  createAddItem,
  createDeleteItem,
  createEditItem,
  createToContentKey,
  createToggleEnabled,
} from "./factories";

describe("createToContentKey", () => {
  it("extracts a content key from the specified field", () => {
    const key = createToContentKey("name");
    expect(key({ name: ["apple", "banana"] })).toBe("apple,banana");
  });

  it("canonicalizes string values", () => {
    const key = createToContentKey("tags");
    expect(key({ tags: "foo, bar, baz" })).toBe("bar,baz,foo");
  });

  it("handles empty/null field values", () => {
    const key = createToContentKey("field");
    expect(key({ field: "" })).toBe("");
    expect(key({ field: null })).toBe("");
    expect(key({})).toBe("");
  });
});

describe("createAddItem", () => {
  let state;
  let toRoot;
  let toContentKey;
  let addItem;

  beforeEach(() => {
    state = { items: { list: [] } };
    toRoot = () => state.items;
    toContentKey = (item) => item.name;
    addItem = createAddItem(toRoot, toContentKey);
  });

  it("adds item with a generated id and metadata", () => {
    addItem({ name: "Test Item" });

    expect(state.items.list).toHaveLength(1);
    const [item] = state.items.list;
    expect(item).toMatchObject({ enabled: true, name: "Test Item" });
    expect(item.id).toEqual(expect.any(String));
    expect(item.createdDate).toBeDefined();
    expect(item.modifiedDate).toBeDefined();
  });

  it("throws error on duplicate content", () => {
    state.items.list = [{ id: "1", name: "Existing" }];

    expect(() => addItem({ name: "Existing" })).toThrow(
      "Duplicate item: Existing",
    );
  });

  it("assigns distinct ids to items created together", () => {
    addItem({ name: "One" });
    addItem({ name: "Two" });

    const [a, b] = state.items.list;
    expect(a.id).not.toBe(b.id);
  });
});

describe("createDeleteItem", () => {
  let state;
  let toRoot;
  let deleteItem;

  beforeEach(() => {
    state = {
      items: {
        list: [
          { id: "item-1", name: "First" },
          { id: "item-2", name: "Second" },
        ],
      },
    };
    toRoot = () => state.items;
    deleteItem = createDeleteItem(toRoot);
  });

  it("removes item by id", () => {
    deleteItem("item-1");

    expect(state.items.list).toHaveLength(1);
    expect(state.items.list[0].id).toBe("item-2");
  });

  it("throws error when item not found", () => {
    expect(() => deleteItem("nonexistent")).toThrow(
      "Item not found: nonexistent",
    );
  });
});

describe("createEditItem", () => {
  let state;
  let toRoot;
  let toContentKey;
  let editItem;

  beforeEach(() => {
    state = {
      items: {
        list: [
          {
            createdDate: "2024-01-01",
            id: "item-1",
            modifiedDate: "2024-01-01",
            name: "Original",
          },
        ],
      },
    };
    toRoot = () => state.items;
    toContentKey = (item) => item.name;
    editItem = createEditItem(toRoot, toContentKey);
  });

  it("updates content, keeps id and createdDate, bumps modifiedDate", () => {
    const before = state.items.list[0].modifiedDate;

    editItem("item-1", { name: "Updated" });

    const [item] = state.items.list;
    expect(item.name).toBe("Updated");
    expect(item.id).toBe("item-1");
    expect(item.createdDate).toBe("2024-01-01");
    expect(item.modifiedDate).not.toBe(before);
  });

  it("throws when the edit duplicates another item's content", () => {
    state.items.list.push({ id: "item-2", name: "Second" });

    expect(() => editItem("item-1", { name: "Second" })).toThrow(
      "Duplicate item: Second",
    );
  });

  it("throws error when original item not found", () => {
    expect(() => editItem("nonexistent", { name: "New" })).toThrow(
      "Item not found: nonexistent",
    );
  });
});

describe("createToggleEnabled", () => {
  let state;
  let toRoot;
  let toggleEnabled;

  beforeEach(() => {
    state = {
      items: {
        list: [
          {
            enabled: true,
            id: "item-1",
            modifiedDate: "2024-01-01",
            name: "Test",
          },
        ],
      },
    };
    toRoot = () => state.items;
    toggleEnabled = createToggleEnabled(toRoot);
  });

  it("toggles enabled from true to false and bumps modifiedDate only", () => {
    const before = state.items.list[0].modifiedDate;
    state.items.list[0].sortDate = before;

    toggleEnabled("item-1");

    expect(state.items.list[0].enabled).toBe(false);
    expect(state.items.list[0].modifiedDate > before).toBe(true);
    // Left alone, so the toggle does not reorder the list.
    expect(state.items.list[0].sortDate).toBe(before);
  });

  it("backfills sortDate on an item stored before the field existed", () => {
    // The seeded defaults and every item written by an earlier release carry no
    // `sortDate`, so the bump must not become their sort key.
    const before = state.items.list[0].modifiedDate;

    toggleEnabled("item-1");

    expect(state.items.list[0].sortDate).toBe(before);
    expect(state.items.list[0].modifiedDate > before).toBe(true);
  });

  it("does not reorder a list of items that have no sortDate", () => {
    state.items.list.push({
      enabled: true,
      id: "item-2",
      modifiedDate: "2026-01-01",
      name: "Newer",
    });
    const before = sortByDateDesc(state.items.list).map((item) => item.id);

    toggleEnabled("item-1");

    expect(sortByDateDesc(state.items.list).map((item) => item.id)).toEqual(
      before,
    );
  });

  it("toggles enabled from false to true", () => {
    state.items.list[0].enabled = false;

    toggleEnabled("item-1");

    expect(state.items.list[0].enabled).toBe(true);
  });

  it("throws error when item not found", () => {
    expect(() => toggleEnabled("nonexistent")).toThrow(
      "Item not found: nonexistent",
    );
  });
});
