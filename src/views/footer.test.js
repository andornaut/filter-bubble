import { fireEvent, render, screen } from "@testing-library/react";
import { getState, setState } from "statezero/src";

import { Footer } from "./footer";

describe("Footer master switch", () => {
  const ON_LABEL = "Turn all filtering on in this browser";
  const OFF_LABEL = "Turn all filtering off in this browser";

  it("reports that filtering is on, and is named after the action", () => {
    render(<Footer isDisabled={false} />);

    expect(screen.getByRole("link", { name: OFF_LABEL })).toHaveTextContent(
      "Enabled",
    );
  });

  it("reports that filtering is paused, and is named after the action", () => {
    render(<Footer isDisabled={true} />);

    expect(screen.getByRole("link", { name: ON_LABEL })).toHaveTextContent(
      "Disabled",
    );
  });

  it("toggles the master switch on click", () => {
    setState("isDisabled", false);
    render(<Footer isDisabled={false} />);

    fireEvent.click(screen.getByRole("link", { name: OFF_LABEL }));

    expect(getState("isDisabled")).toBe(true);
  });
});
