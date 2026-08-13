import { fireEvent, render, screen } from "@testing-library/react";

import { Item } from "./item";

const renderItem = (overrides = {}) => {
  const props = {
    details: ({ text }) => text,
    id: "1",
    isSelected: false,
    item: { enabled: true, text: "politics" },
    select: jest.fn(),
    toggleEnabled: jest.fn(),
    ...overrides,
  };
  render(<Item {...props} />);
  return props;
};

describe("Item", () => {
  // "politics" names the item; "Disable" names the action on it.
  it("names the item and the action on it separately", () => {
    renderItem();

    expect(screen.getByRole("button", { name: "politics" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Disable" })).toBeVisible();
  });

  it("names the action by what it would do to a disabled item", () => {
    renderItem({ item: { enabled: false, text: "politics" } });

    expect(screen.getByRole("button", { name: "Enable" })).toBeVisible();
  });

  // Selection is shown with a background colour, which needs a counterpart in
  // the accessibility tree.
  it("marks the selected item for assistive technology", () => {
    renderItem({ isSelected: true });

    expect(screen.getByRole("button", { name: "politics" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("leaves aria-current off an unselected item", () => {
    renderItem();

    expect(
      screen.getByRole("button", { name: "politics" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks a disabled item in the list", () => {
    renderItem({ item: { enabled: false, text: "politics" } });

    expect(screen.getByRole("listitem")).toHaveClass("list__item--disabled");
  });

  it("selects and toggles by id", () => {
    const { select, toggleEnabled } = renderItem({ id: "abc" });

    fireEvent.click(screen.getByRole("button", { name: "politics" }));
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    expect(select).toHaveBeenCalledWith("abc");
    expect(toggleEnabled).toHaveBeenCalledWith("abc");
  });
});
