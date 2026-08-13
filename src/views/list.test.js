import { render, screen } from "@testing-library/react";

import { List } from "./list";

// Display order is the whole purpose of `sortDate`: the list is ordered by when
// the user last put each item there, newest first.
const item = (text, dates) => ({ enabled: true, id: text, text, ...dates });

const renderList = (list, selectedId = "") =>
  render(
    <List
      itemDetails={({ text }) => text}
      list={list}
      select={jest.fn()}
      selectedId={selectedId}
      toId={(entry) => entry.id}
      toggleEnabled={jest.fn()}
    />,
  );

const shown = () =>
  screen.getAllByRole("listitem").map((element) => element.textContent);

describe("List", () => {
  it("renders nothing at all for an empty list", () => {
    const { container } = renderList([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("puts the most recently changed item first", () => {
    renderList([
      item("middle", { sortDate: "2022-06-01T00:00:00.000Z" }),
      item("oldest", { sortDate: "2021-01-01T00:00:00.000Z" }),
      item("newest", { sortDate: "2023-01-01T00:00:00.000Z" }),
    ]);

    expect(shown()).toEqual([
      "newestDisable",
      "middleDisable",
      "oldestDisable",
    ]);
  });

  // Items stored before `sortDate` existed, and the seeded defaults, carry only
  // the sync clock.
  it("falls back to modifiedDate for an item with no sortDate", () => {
    renderList([
      item("older", { modifiedDate: "2021-01-01T00:00:00.000Z" }),
      item("newer", { modifiedDate: "2023-01-01T00:00:00.000Z" }),
    ]);

    expect(shown()).toEqual(["newerDisable", "olderDisable"]);
  });

  // Toggling bumps `modifiedDate` so the change wins the sync merge, and leaves
  // `sortDate` alone so switching an item off does not move it.
  it("orders on sortDate rather than the sync clock", () => {
    renderList([
      item("stays first", {
        modifiedDate: "2021-01-01T00:00:00.000Z",
        sortDate: "2023-01-01T00:00:00.000Z",
      }),
      item("just toggled", {
        modifiedDate: "2026-01-01T00:00:00.000Z",
        sortDate: "2022-01-01T00:00:00.000Z",
      }),
    ]);

    expect(shown()).toEqual(["stays firstDisable", "just toggledDisable"]);
  });

  it("marks the selected item wherever it lands in the order", () => {
    renderList(
      [
        item("middle", { sortDate: "2022-06-01T00:00:00.000Z" }),
        item("newest", { sortDate: "2023-01-01T00:00:00.000Z" }),
      ],
      "middle",
    );

    expect(screen.getByRole("button", { name: "middle" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
