import { fireEvent, render, screen } from "@testing-library/react";
import { getState, setState } from "statezero/src";

import { toId } from "../actions/errors";
import { Errors } from "./errors";

const error = (message, modifiedDate) => ({ message, modifiedDate });

const renderErrors = (errors) => {
  setState(undefined, { errors });
  return render(<Errors errors={getState("errors")} />);
};

const shown = () =>
  screen
    .getAllByRole("listitem")
    .map((element) => element.textContent.replace("[x]", ""));

describe("Errors", () => {
  it("renders nothing while there is nothing to report", () => {
    const { container } = renderErrors([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the collection is absent", () => {
    const { container } = render(<Errors />);

    expect(container).toBeEmptyDOMElement();
  });

  // The newest failure is the one the user just caused, so it goes on top
  // rather than below whatever is still on screen from earlier.
  it("shows the most recent message first", () => {
    renderErrors([
      error("older", "2026-01-01T00:00:00.000Z"),
      error("newer", "2026-06-01T00:00:00.000Z"),
    ]);

    expect(shown()).toEqual(["newer", "older"]);
  });

  it("clears one message and leaves the rest", () => {
    renderErrors([
      error("keep me", "2026-01-01T00:00:00.000Z"),
      error("dismiss me", "2026-06-01T00:00:00.000Z"),
    ]);

    // "[x]" carries no meaning of its own, so the control is named.
    const [dismiss] = screen.getAllByRole("button", { name: "Clear message" });
    fireEvent.click(dismiss);

    expect(getState("errors").map(toId)).toEqual(["keep me"]);
  });
});
