import { render, screen } from "@testing-library/react";

import { checkboxField, textField } from "./fields";

const hint = () => document.querySelector(".form__hint");

describe("textField", () => {
  // Forms are uncontrolled and read on submit, so the stored value has to
  // arrive as a default rather than as a value React would hold.
  it("seeds the input with the stored value, uncontrolled", () => {
    render(textField({ label: "Name", name: "name", value: "test value" }));

    const input = screen.getByRole("textbox");
    // `name` is what the submit handler serializes the field under.
    expect(input).toHaveAttribute("name", "name");
    expect(input.defaultValue).toBe("test value");
  });

  // A field an item has never held arrives as null. What must not happen is a
  // form that opens with the text "null" in it, which is what stringifying the
  // value rather than defaulting it would put there.
  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("opens an empty field for a value of %s", (_, value) => {
    render(textField({ label: "Name", name: "name", value }));

    expect(screen.getByRole("textbox").defaultValue).toBe("");
  });

  it("renders a hint only when one is given", () => {
    const { rerender } = render(
      textField({ label: "Name", name: "name", value: "" }),
    );
    expect(hint()).toBeNull();

    rerender(
      textField({
        hint: "Enter your name",
        label: "Name",
        name: "name",
        value: "",
      }),
    );

    expect(hint()).toHaveTextContent("Enter your name");
  });

  // The visible label has to be announced with the field, not merely sit above
  // it, or a screen reader reaches an unlabelled edit box.
  it("associates the visible label with the input", () => {
    render(textField({ label: "Domain names", name: "addresses", value: "" }));

    expect(screen.getByLabelText("Domain names")).toBe(
      screen.getByRole("textbox"),
    );
  });
});

describe("checkboxField", () => {
  it("seeds the checkbox from the stored value, uncontrolled", () => {
    render(checkboxField({ label: "Enabled", name: "enabled", value: true }));

    const input = screen.getByRole("checkbox");
    expect(input).toHaveAttribute("name", "enabled");
    expect(input.defaultChecked).toBe(true);
  });

  it("leaves the checkbox clear for a false value", () => {
    render(checkboxField({ label: "Enabled", name: "enabled", value: false }));

    expect(screen.getByRole("checkbox").defaultChecked).toBe(false);
  });

  // The hint is rendered outside the wrapping label, so it needs covering here
  // as well as in `textField`. "Hide instead of remove" is the only checkbox the
  // app has, and this hint is the only explanation of what it does.
  it("renders a hint only when one is given", () => {
    const { rerender } = render(
      checkboxField({ label: "Enabled", name: "enabled", value: false }),
    );
    expect(hint()).toBeNull();

    rerender(
      checkboxField({
        hint: "Keep the space the block occupied",
        label: "Enabled",
        name: "enabled",
        value: false,
      }),
    );

    expect(hint()).toHaveTextContent("Keep the space the block occupied");
  });

  // Labelled by wrapping the input rather than by id, which is why this file
  // covers both shapes.
  it("associates the visible label with the input", () => {
    render(
      checkboxField({
        label: "Hide instead of remove",
        name: "hide",
        value: false,
      }),
    );

    expect(screen.getByLabelText("Hide instead of remove")).toBe(
      screen.getByRole("checkbox"),
    );
  });
});
