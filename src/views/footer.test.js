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

describe("Footer import link", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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
