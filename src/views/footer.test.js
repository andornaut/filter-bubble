import { fireEvent, render, screen } from "@testing-library/react";
import { getState, setState } from "statezero/src";

import { Footer } from "./footer";

describe("Footer enable/disable toggle", () => {
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

  // Both directions: the link is the only way back, so a toggle that only ever
  // sets the flag would leave filtering off for good.
  it("toggles Filter Bubble on click, and back on the next one", () => {
    setState("isDisabled", false);
    render(<Footer isDisabled={false} />);
    const link = screen.getByRole("link", { name: OFF_LABEL });

    fireEvent.click(link);
    expect(getState("isDisabled")).toBe(true);

    fireEvent.click(link);
    expect(getState("isDisabled")).toBe(false);
  });
});

describe("Footer help", () => {
  beforeEach(() => {
    // jsdom implements no layout, so it has no `scrollIntoView` for the effect
    // that brings the opened help into view to call.
    Element.prototype.scrollIntoView = jest.fn();
  });

  const help = () => document.querySelector(".help__content");

  it("shows and hides the help text, naming the action either way", () => {
    const { container } = render(<Footer isDisabled={false} />);
    expect(help()).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Show help" }));

    expect(help()).toBeVisible();
    expect(container).toHaveTextContent("CSS selectors");
    expect(screen.queryByRole("link", { name: "Show help" })).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Hide help" }));

    expect(help()).toBeNull();
    expect(screen.getByRole("link", { name: "Show help" })).toBeVisible();
  });

  it("brings the help it just opened into view", () => {
    render(<Footer isDisabled={false} />);

    fireEvent.click(screen.getByRole("link", { name: "Show help" }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

describe("Footer import link", () => {
  const flush = () =>
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

  const setup = (currentTab) => {
    const close = jest.fn();
    jest.spyOn(window, "close").mockImplementation(close);
    global.chrome = {
      runtime: { getURL: (path) => `chrome-extension://id/${path}` },
      tabs: {
        create: jest.fn(() => Promise.resolve({})),
        getCurrent: jest.fn(() => Promise.resolve(currentTab)),
        query: jest.fn(() => Promise.resolve([])),
        update: jest.fn(() => Promise.resolve({})),
      },
    };
    return close;
  };

  afterEach(() => {
    window.close.mockRestore();
  });

  it("opens the import page in a tab", async () => {
    setup(undefined);
    render(<Footer isDisabled={false} />);

    fireEvent.click(screen.getByRole("link", { name: "Import" }));
    await flush();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://id/popup.html#import",
    });
  });

  it("closes the popup after sending the user to the import tab", async () => {
    const close = setup(undefined);
    render(<Footer isDisabled={false} />);

    fireEvent.click(screen.getByRole("link", { name: "Import" }));
    await flush();

    expect(close).toHaveBeenCalled();
  });

  it("leaves the options tab open, which the user is working in", async () => {
    const close = setup({ id: 7 });
    render(<Footer isDisabled={false} />);

    fireEvent.click(screen.getByRole("link", { name: "Import" }));
    await flush();

    expect(chrome.tabs.create).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
