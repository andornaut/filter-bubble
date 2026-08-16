import { render, screen } from "@testing-library/react";

import { List } from "./list";

// The list is ordered newest first, through `sortByDateDesc`. What that helper
// does with each date field is covered in helpers.test.js; what is pinned here
// is that `List` goes through it, including for an item carrying only the sync
// clock, which is every seeded default.
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

// The details each row renders, without the toggle button's own label.
const shown = () =>
  screen
    .getAllByRole("listitem")
    .map((element) => element.querySelector(".list__details").textContent);

describe("List", () => {
  it("renders nothing at all for an empty list", () => {
    const { container } = renderList([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("puts the most recently changed item first", () => {
    renderList([
      // "middle" carries no `sortDate`, as a seeded default and anything stored
      // before the field existed. It has to sort on `modifiedDate`, which lands
      // it between the other two rather than at the end.
      item("middle", { modifiedDate: "2022-06-01T00:00:00.000Z" }),
      item("oldest", { sortDate: "2021-01-01T00:00:00.000Z" }),
      item("newest", { sortDate: "2023-01-01T00:00:00.000Z" }),
    ]);

    expect(shown()).toEqual(["newest", "middle", "oldest"]);
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
