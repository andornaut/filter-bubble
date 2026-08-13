import { fireEvent, render, screen } from "@testing-library/react";

import { Collection } from "./collection";

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
  const view = render(
    <Collection
      actions={{ ...props, toId: (item) => item.id }}
      fields={() => null}
      itemDetails={({ text }) => text.join(", ")}
      list={list}
      transform={(data) => data}
    />,
  );
  return { ...props, view };
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
  // it, so an item rewritten on another device stays selected under its new
  // content instead of the selection jumping off it or holding a stale copy.
  it("follows the selected item when another device rewrites it", () => {
    const { view } = renderCollection();
    selectItem();

    view.rerender(
      <Collection
        actions={{
          addItem: jest.fn(),
          deleteItem: jest.fn(),
          editItem: jest.fn(),
          toId: (item) => item.id,
          toggleEnabled: jest.fn(),
        }}
        fields={() => null}
        itemDetails={({ text }) => text.join(", ")}
        list={[{ id: "1", text: ["rewritten elsewhere"] }]}
        transform={(data) => data}
      />,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /rewritten elsewhere/ }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("collapses the selection when the item leaves the list", () => {
    // `useSelection` derives the item from `list` rather than snapshotting it,
    // so an item removed by a sync from another device cannot stay selected.
    const { view } = renderCollection();
    selectItem();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    view.rerender(
      <Collection
        actions={{
          addItem: jest.fn(),
          deleteItem: jest.fn(),
          editItem: jest.fn(),
          toId: (item) => item.id,
          toggleEnabled: jest.fn(),
        }}
        fields={() => null}
        itemDetails={({ text }) => text.join(", ")}
        list={[]}
        transform={(data) => data}
      />,
    );

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});
