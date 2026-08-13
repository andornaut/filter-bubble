import { act, render, screen } from "@testing-library/react";

import { useHash } from "./useHash";

// The extension UI routes on the URL fragment: `#topics`, `#websites` and
// `#import` are the three views popup.html serves.
const Probe = () => <span data-testid="hash">{useHash() || "(none)"}</span>;

const setHash = (hash) => {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event("hashchange"));
  });
};

describe("useHash", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("reads the fragment the page was opened at", () => {
    window.location.hash = "#websites";

    render(<Probe />);

    expect(screen.getByTestId("hash")).toHaveTextContent("#websites");
  });

  it("re-renders when the fragment changes", () => {
    render(<Probe />);

    setHash("#websites");
    expect(screen.getByTestId("hash")).toHaveTextContent("#websites");

    setHash("#topics");
    expect(screen.getByTestId("hash")).toHaveTextContent("#topics");
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(<Probe />);
    unmount();

    // Nothing is left subscribed to update a tree that is gone.
    expect(() => setHash("#websites")).not.toThrow();
  });
});
