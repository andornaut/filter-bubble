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

describe("Footer export link", () => {
  // jsdom's `Blob` cannot be read back, so capture what the page serialized on
  // its way into the constructor. The anchor is removed as soon as it is
  // clicked, so its filename has to be read during the click.
  let filename;
  let serialized;
  const RealBlob = global.Blob;

  beforeEach(() => {
    jest.useFakeTimers();
    setState(undefined, {
      topics: { list: [{ id: "t1", text: ["politics"] }] },
      websites: { list: [{ addresses: ["example.com"], id: "w1" }] },
    });
    filename = undefined;
    serialized = undefined;
    jest.spyOn(global, "Blob").mockImplementation((parts, options) => {
      [serialized] = parts;
      return new RealBlob(parts, options);
    });
    global.URL.createObjectURL = jest.fn(() => "blob:fake");
    global.URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function captureFilename() {
        filename = this.download;
      });
  });

  afterEach(() => {
    // Let the deferred revoke run before its stub goes away, or it throws into
    // the next test from a timer this one left behind.
    jest.runAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete global.URL.createObjectURL;
    delete global.URL.revokeObjectURL;
  });

  // The export is the only copy of a configuration the user can take
  // elsewhere, so it carries both collections whichever tab is open, and is
  // named so that two exports do not overwrite each other.
  it("downloads both collections under a timestamped filename", () => {
    render(<Footer isDisabled={false} />);

    fireEvent.click(screen.getByRole("link", { name: "Export" }));

    expect(JSON.parse(serialized)).toEqual({
      topics: [{ id: "t1", text: ["politics"] }],
      websites: [{ addresses: ["example.com"], id: "w1" }],
    });
    expect(filename).toMatch(
      /^filter-bubble-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/,
    );
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

  // The popup closes on every use, so clicking Import repeatedly would stack up
  // a tab each. The query matches the page without its fragment, which is also
  // the options page, so the existing tab has to be picked out by the full url.
  it("focuses an import tab that is already open instead of opening another", async () => {
    setup(undefined);
    chrome.tabs.query.mockResolvedValue([
      { id: 3, url: "chrome-extension://id/popup.html", windowId: 9 },
      { id: 4, url: "chrome-extension://id/popup.html#import", windowId: 9 },
    ]);
    chrome.windows = { update: jest.fn(() => Promise.resolve({})) };
    render(<Footer isDisabled={false} />);

    fireEvent.click(screen.getByRole("link", { name: "Import" }));
    await flush();

    expect(chrome.tabs.update).toHaveBeenCalledWith(4, { active: true });
    // The tab can be in a window the user is not looking at, so raising the
    // tab alone would appear to do nothing.
    expect(chrome.windows.update).toHaveBeenCalledWith(9, { focused: true });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  // Reusing a tab is the nicety; opening one is the point. Both the lookup and
  // the tab it finds can fail - the tab may have been closed since - and either
  // way the user asked to get to the import page.
  it.each([
    [
      "the tab lookup fails",
      () => chrome.tabs.query.mockRejectedValue(new Error("no tabs API")),
    ],
    [
      "the tab it found is gone",
      () => {
        chrome.tabs.query.mockResolvedValue([
          {
            id: 4,
            url: "chrome-extension://id/popup.html#import",
            windowId: 9,
          },
        ]);
        chrome.tabs.update.mockRejectedValue(new Error("No tab with id: 4"));
      },
    ],
  ])("opens a new import tab when %s", async (_, breakIt) => {
    setup(undefined);
    breakIt();
    render(<Footer isDisabled={false} />);

    fireEvent.click(screen.getByRole("link", { name: "Import" }));
    await flush();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://id/popup.html#import",
    });
  });
});
