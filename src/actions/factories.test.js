import {
  createAddItem,
  createDeleteItem,
  createDuplicateConflict,
  createEditItem,
  createToContentKey,
  createToggleEnabled,
} from "./factories";

describe("createToContentKey", () => {
  // A stored array is used as it stands. Legacy items can hold the same values
  // in a different order, and re-canonicalizing here would fold them onto one
  // key: they would collide as duplicates and become uneditable.
  it("keeps a stored array's order rather than re-canonicalizing it", () => {
    const key = createToContentKey("name");

    expect(key({ name: ["banana", "apple"] })).toBe("banana,apple");
  });

  // A string is what the add/edit form submits, before anything has stored it.
  it("canonicalizes a string field the form has not stored yet", () => {
    const key = createToContentKey("tags");

    expect(key({ tags: "foo, bar, baz" })).toBe("bar,baz,foo");
  });

  // An empty key still has to compare equal to another empty one, so refusing
  // a second content-less item is the collision rule's decision, not a throw
  // here.
  it.each([
    ["an empty string", { field: "" }],
    ["null", { field: null }],
    ["an absent field", {}],
  ])("returns an empty key for %s", (_, item) => {
    expect(createToContentKey("field")(item)).toBe("");
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
    addItem = createAddItem(toRoot, createDuplicateConflict(toContentKey));
  });

  it("stores the item enabled, with an id and all three dates", () => {
    addItem({ name: "Test Item" });

    expect(state.items.list).toHaveLength(1);
    const [item] = state.items.list;
    expect(item).toMatchObject({ enabled: true, name: "Test Item" });
    expect(item.id).toEqual(expect.any(String));
    // All three stamped from one clock: `storage.js` reads
    // `modifiedDate === createdDate` as "never edited", and `sortDate` puts a
    // new item at the top of the list.
    expect(item.modifiedDate).toBe(item.createdDate);
    expect(item.sortDate).toBe(item.createdDate);
    expect(Number.isNaN(Date.parse(item.createdDate))).toBe(false);
  });

  it("refuses an item whose content another one already holds", () => {
    state.items.list = [{ id: "1", name: "Existing" }];

    expect(() => addItem({ name: "Existing" })).toThrow(
      "Duplicate item: Existing",
    );
    expect(state.items.list).toHaveLength(1);
  });

  // Ids become the `t:` / `w:` storage keys, and the id is derived from a clock
  // that two adds in the same millisecond read the same value from.
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

  it("removes the named item and leaves the rest", () => {
    deleteItem("item-1");

    expect(state.items.list.map((item) => item.id)).toEqual(["item-2"]);
  });

  it("refuses an id that is not in the list", () => {
    expect(() => deleteItem("nonexistent")).toThrow(
      "Item not found: nonexistent",
    );
    expect(state.items.list).toHaveLength(2);
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
    editItem = createEditItem(toRoot, createDuplicateConflict(toContentKey));
  });

  it("updates content, keeps id and createdDate, bumps both clocks", () => {
    const before = state.items.list[0].modifiedDate;

    editItem("item-1", { name: "Updated" });

    const [item] = state.items.list;
    expect(item.name).toBe("Updated");
    expect(item.id).toBe("item-1");
    // Left alone, so `storage.js` can still tell an edited item from one that
    // only ever carried the values it was created with.
    expect(item.createdDate).toBe("2024-01-01");
    expect(item.modifiedDate > before).toBe(true);
    // An edit is what moves an item to the top of the list.
    expect(item.sortDate > before).toBe(true);
  });

  // `exceptId` is the item being edited. Without it, saving a form whose
  // content field was left as it was would refuse the item as a duplicate of
  // itself, so nothing else about it could ever be changed.
  it("does not treat the edited item as its own duplicate", () => {
    expect(() =>
      editItem("item-1", { name: "Original", note: "added" }),
    ).not.toThrow();
    expect(state.items.list[0].note).toBe("added");
  });

  it("refuses an edit that duplicates another item's content", () => {
    state.items.list.push({ id: "item-2", name: "Second" });

    expect(() => editItem("item-1", { name: "Second" })).toThrow(
      "Duplicate item: Second",
    );
    expect(state.items.list[0].name).toBe("Original");
  });

  it("refuses an id that is not in the list", () => {
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

  // Both directions: the toggle is the only way back, so one that merely set
  // the flag would leave the item switched off for good.
  it("toggles enabled from false to true", () => {
    state.items.list[0].enabled = false;

    toggleEnabled("item-1");

    expect(state.items.list[0].enabled).toBe(true);
  });

  it("refuses an id that is not in the list", () => {
    expect(() => toggleEnabled("nonexistent")).toThrow(
      "Item not found: nonexistent",
    );
  });
});
