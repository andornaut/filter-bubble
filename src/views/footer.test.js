import { fireEvent, render, screen } from "@testing-library/react";
import { getState, setState } from "statezero/src";

import { Footer } from "./footer";

describe("Footer master switch", () => {
  it("offers to disable while filtering is on", () => {
    render(<Footer isDisabled={false} />);

    expect(
      screen.getByRole("button", { name: "Disable Filter Bubble" }),
    ).toBeInTheDocument();
  });

  it("offers to enable while filtering is paused", () => {
    render(<Footer isDisabled={true} />);

    expect(
      screen.getByRole("button", { name: "Enable Filter Bubble" }),
    ).toBeInTheDocument();
  });

  it("toggles the master switch on click", () => {
    setState("isDisabled", false);
    render(<Footer isDisabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Filter Bubble/ }));

    expect(getState("isDisabled")).toBe(true);
  });
});
