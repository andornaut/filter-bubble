import {
  createAddItem,
  createDeleteItem,
  createEditItem,
  createToggleEnabled,
  createToId,
} from "./factories";

describe("createToId", () => {
  it("creates a function that extracts ID from specified field", () => {
    const toId = createToId("name");
    expect(toId({ name: ["apple", "banana"] })).toBe("apple,banana");
  });

  it("handles string values by converting to canonical array", () => {
    const toId = createToId("tags");
    expect(toId({ tags: "foo, bar, baz" })).toBe("bar,baz,foo");
  });

  it("handles empty/null field values", () => {
    const toId = createToId("field");
    expect(toId({ field: "" })).toBe("");
    expect(toId({ field: null })).toBe("");
    expect(toId({})).toBe("");
  });
});

describe("createAddItem", () => {
  let state;
  let toRoot;
  let toId;
  let addItem;

  beforeEach(() => {
    state = { items: { list: [] } };
    toRoot = () => state.items;
    toId = (item) => item.id;
    addItem = createAddItem(toRoot, toId);
  });

  it("adds item to list with metadata", () => {
    const data = { id: "test-1", name: "Test Item" };

    // Call the action directly - it internally handles state
    addItem(data);

    expect(state.items.list).toHaveLength(1);
    expect(state.items.list[0]).toMatchObject({
      enabled: true,
      id: "test-1",
      name: "Test Item",
    });
    expect(state.items.list[0].createdDate).toBeDefined();
    expect(state.items.list[0].modifiedDate).toBeDefined();
  });

  it("throws error on duplicate item", () => {
    state.items.list = [{ id: "existing", name: "Existing" }];

    expect(() => addItem({ id: "existing", name: "Duplicate" })).toThrow(
      "Duplicate item: existing",
    );
  });
});

describe("createDeleteItem", () => {
  let state;
  let toRoot;
  let toId;
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
    toId = (item) => item.id;
    deleteItem = createDeleteItem(toRoot, toId);
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
  let toId;
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
    toId = (item) => item.id;
    editItem = createEditItem(toRoot, toId);
  });

  it("updates item and sets modifiedDate", () => {
    const originalModifiedDate = state.items.list[0].modifiedDate;

    editItem("item-1", { id: "item-1", name: "Updated" });

    expect(state.items.list[0].name).toBe("Updated");
    expect(state.items.list[0].createdDate).toBe("2024-01-01");
    expect(state.items.list[0].modifiedDate).not.toBe(originalModifiedDate);
  });

  it("allows changing item id if new id is unique", () => {
    editItem("item-1", { id: "new-id", name: "Renamed" });

    expect(state.items.list[0].id).toBe("new-id");
  });

  it("throws error when changing to duplicate id", () => {
    state.items.list.push({ id: "item-2", name: "Second" });

    expect(() =>
      editItem("item-1", { id: "item-2", name: "Duplicate" }),
    ).toThrow("Duplicate item: item-2");
  });

  it("throws error when original item not found", () => {
    expect(() => editItem("nonexistent", { id: "new", name: "New" })).toThrow(
      "Item not found: nonexistent",
    );
  });
});

describe("createToggleEnabled", () => {
  let state;
  let toRoot;
  let toId;
  let toggleEnabled;

  beforeEach(() => {
    state = {
      items: {
        list: [{ enabled: true, id: "item-1", name: "Test" }],
      },
    };
    toRoot = () => state.items;
    toId = (item) => item.id;
    toggleEnabled = createToggleEnabled(toRoot, toId);
  });

  it("toggles enabled from true to false", () => {
    toggleEnabled("item-1");

    expect(state.items.list[0].enabled).toBe(false);
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
