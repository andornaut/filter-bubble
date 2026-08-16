import { render, screen } from "@testing-library/react";
import { setState, subscribersSync } from "statezero/src";

import { useStore } from "./useStore";

// Every view reads the store through this hook, so the probe stands in for all
// of them. Asserted against statezero's own subscriber set rather than a mock:
// the leak this is about is a callback left in that set.
const Probe = () => <span data-testid="topic">{useStore().topic}</span>;

describe("useStore", () => {
  beforeEach(() => {
    setState(undefined, { topic: "politics" });
  });

  // The popup mounts this on every open, and the subscriber set outlives them
  // all, so a subscription left behind is one per open - each of which would go
  // on being notified for a component that is no longer on screen.
  it("stops listening once unmounted", () => {
    const before = subscribersSync.size;
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId("topic")).toHaveTextContent("politics");
    expect(subscribersSync.size).toBe(before + 1);

    unmount();

    expect(subscribersSync.size).toBe(before);
  });
});
