import { render, screen } from "@testing-library/react";

import { checkboxField, textField } from "./fields";

describe("textField", () => {
  it("renders with defaultValue for uncontrolled input", () => {
    render(textField({ label: "Name", name: "name", value: "test value" }));
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("name", "name");
    expect(input.defaultValue).toBe("test value");
  });

  it("renders with empty defaultValue when value is null", () => {
    render(textField({ label: "Name", name: "name", value: null }));
    const input = screen.getByRole("textbox");
    expect(input.defaultValue).toBe("");
  });

  it("renders hint when provided", () => {
    render(
      textField({
        hint: "Enter your name",
        label: "Name",
        name: "name",
        value: "",
      }),
    );
    expect(screen.getByText("Enter your name")).toBeInTheDocument();
  });

  it("does not render hint when not provided", () => {
    render(textField({ label: "Name", name: "name", value: "" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
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
  it("renders with defaultChecked for uncontrolled input", () => {
    render(checkboxField({ label: "Enabled", name: "enabled", value: true }));
    const input = screen.getByRole("checkbox");
    expect(input).toHaveAttribute("name", "enabled");
    expect(input.defaultChecked).toBe(true);
  });

  it("renders unchecked when value is false", () => {
    render(checkboxField({ label: "Enabled", name: "enabled", value: false }));
    const input = screen.getByRole("checkbox");
    expect(input.defaultChecked).toBe(false);
  });

  it("renders hint when provided", () => {
    render(
      checkboxField({
        hint: "Toggle this option",
        label: "Option",
        name: "option",
        value: false,
      }),
    );
    expect(screen.getByText("Toggle this option")).toBeInTheDocument();
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
