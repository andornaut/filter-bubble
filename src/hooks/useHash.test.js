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

  // The popup mounts this on every open, so a subscription left behind is a
  // listener per open on a window that outlives them all.
  it("stops listening once unmounted", () => {
    const removeEventListener = jest.spyOn(window, "removeEventListener");
    const { unmount } = render(<Probe />);

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith(
      "hashchange",
      expect.any(Function),
    );
    removeEventListener.mockRestore();
  });
});
