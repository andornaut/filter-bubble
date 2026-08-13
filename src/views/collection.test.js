import { fireEvent, render, screen } from "@testing-library/react";

import { Collection } from "./collection";
import { textField } from "./fields";

// `Collection` is the scaffold both tabs configure, so these cover the wiring it
// owns: which form is shown, and what selecting, deleting and cancelling do to
// the selection. `Topics` and `Websites` supply only fields and a transform.
const ITEM = { id: "1", text: ["spoilers"] };

const renderCollection = ({ list = [ITEM], ...actions } = {}) => {
  const props = {
    addItem: jest.fn(),
    deleteItem: jest.fn(),
    editItem: jest.fn(),
    toggleEnabled: jest.fn(),
    ...actions,
  };
  const element = (items) => (
    <Collection
      actions={{ ...props, toId: (item) => item.id }}
      // The edit form is handed the selected item, so rendering it here is what
      // makes a stale selection visible.
      fields={(selected) => <p>editing: {selected?.text.join(", ")}</p>}
      itemDetails={({ text }) => text.join(", ")}
      list={items}
      transform={(data) => data}
    />
  );
  const view = render(element(list));
  // Stands in for a sync from another device rewriting the collection.
  return { ...props, rerender: (items) => view.rerender(element(items)) };
};

const selectItem = () =>
  fireEvent.click(screen.getByRole("button", { name: /spoilers/ }));

describe("Collection", () => {
  it("shows the add form until an item is selected", () => {
    renderCollection();

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("swaps to the edit form for the selected item", () => {
    renderCollection();

    selectItem();

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("deletes the selected item and clears the selection", () => {
    const { deleteItem } = renderCollection();
    selectItem();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteItem).toHaveBeenCalledWith("1");
    // Back to the add form: nothing is selected.
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("edits the selected item and clears the selection", () => {
    const { editItem } = renderCollection();
    selectItem();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(editItem).toHaveBeenCalledWith("1", {});
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("clears the selection on cancel without touching the item", () => {
    const { deleteItem, editItem } = renderCollection();
    selectItem();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(deleteItem).not.toHaveBeenCalled();
    expect(editItem).not.toHaveBeenCalled();
  });

  // `useSelection` derives the item from `list` by id rather than snapshotting
  // it, so the selection follows a rewrite and cannot outlive a removal.
  it("follows the selected item when another device rewrites it", () => {
    const { rerender } = renderCollection();
    selectItem();

    rerender([{ id: "1", text: ["rewritten elsewhere"] }]);

    // `fields` is handed the current list entry rather than the copy that was
    // there when the item was picked. What a field does with it belongs to
    // fields.js: a mounted `textField` keeps the value it rendered with, so
    // this is not evidence that the real edit form adopts a rewrite.
    expect(screen.getByText("editing: rewritten elsewhere")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /rewritten elsewhere/ }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("collapses the selection when the item leaves the list", () => {
    const { rerender } = renderCollection();
    selectItem();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    rerender([]);

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});

// The real `textField` rather than a stub: its inputs are uncontrolled, so what
// a rewrite does to an open form is a property of the DOM's dirty-value flag
// rather than of what `Collection` passes down.
describe("Collection edit form under a synced rewrite", () => {
  const dated = (text, modifiedDate) => ({ id: "1", modifiedDate, text });
  const ORIGINAL = [dated(["spoilers"], "2026-01-01T00:00:00.000Z")];
  const REWRITTEN = [
    dated(["rewritten elsewhere"], "2026-06-01T00:00:00.000Z"),
  ];

  let editItem;

  const setup = () => {
    editItem = jest.fn();
    const element = (items) => (
      <Collection
        actions={{
          addItem: jest.fn(),
          deleteItem: jest.fn(),
          editItem,
          toId: (item) => item.id,
          toggleEnabled: jest.fn(),
        }}
        fields={(selected) =>
          textField({
            label: "Topics",
            name: "text",
            value: (selected?.text || []).join(", "),
          })
        }
        itemDetails={({ text }) => text.join(", ")}
        list={items}
        transform={(data) => data}
      />
    );
    const view = render(element(ORIGINAL));
    fireEvent.click(screen.getByRole("button", { name: /spoilers/ }));
    return () => view.rerender(element(REWRITTEN));
  };

  const input = () => screen.getByLabelText("Topics");
  const save = () =>
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

  it("shows the rewritten values in a form nobody has typed into", () => {
    const rewrite = setup();
    expect(input().value).toBe("spoilers");

    rewrite();

    expect(input().value).toBe("rewritten elsewhere");
  });

  // The silent case: without the reset, Save writes the values the form still
  // showed, under a newer clock, and the rewrite is reverted on both devices.
  it("saves the rewritten values, not the ones it was opened with", () => {
    const rewrite = setup();

    rewrite();
    save();

    expect(editItem).toHaveBeenCalledWith("1", { text: "rewritten elsewhere" });
  });

  it("keeps what the user typed when the rewrite lands mid-edit", () => {
    const rewrite = setup();
    fireEvent.input(input(), { target: { value: "my own edit" } });

    rewrite();

    expect(input().value).toBe("my own edit");
    save();
    expect(editItem).toHaveBeenCalledWith("1", { text: "my own edit" });
  });
});
