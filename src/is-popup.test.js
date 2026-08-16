import { isPopup } from "./is-popup";

const mockChrome = ({ getCurrent, getViews }) => {
  global.chrome = {
    extension: getViews === "absent" ? {} : { getViews },
    tabs: { getCurrent: jest.fn(getCurrent) },
  };
};

const inPopup = () => Promise.resolve(undefined);
const inTab = () => Promise.resolve({ id: 7 });

describe("isPopup", () => {
  let consoleDebug;

  beforeEach(() => {
    consoleDebug = jest.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleDebug.mockRestore();
  });

  it("is true in a page that is not a tab and is a registered popup view", async () => {
    mockChrome({ getCurrent: inPopup, getViews: () => [window] });

    await expect(isPopup()).resolves.toBe(true);
    // The log below belongs to the one branch that withholds a true. Logging
    // here as well would be noise on every popup open.
    expect(consoleDebug).not.toHaveBeenCalled();
  });

  it("is false on a page hosted in a tab", () => {
    // The `#import` page and, with `options_ui.open_in_tab`, the options page.
    mockChrome({ getCurrent: inTab, getViews: () => [window] });

    return expect(isPopup()).resolves.toBe(false);
  });

  it("is false in a non-tab options view, which is not a popup view", async () => {
    // The backstop: a browser that ignores `open_in_tab` and hosts the options
    // page as a guest would otherwise be indistinguishable from the popup.
    mockChrome({ getCurrent: inPopup, getViews: () => [] });

    await expect(isPopup()).resolves.toBe(false);
    // Withholding the true is otherwise invisible: highlight mode simply never
    // engages, so the log is the only account of why.
    expect(consoleDebug).toHaveBeenCalledWith(
      "filter-bubble: not a popup view; skipping highlight mode",
    );
  });

  it("falls back to the tab check when getViews is unavailable", () => {
    mockChrome({ getCurrent: inPopup, getViews: "absent" });

    return expect(isPopup()).resolves.toBe(true);
  });

  it("falls back to the tab check when getViews returns a non-list", () => {
    mockChrome({ getCurrent: inPopup, getViews: () => undefined });

    return expect(isPopup()).resolves.toBe(true);
  });

  it("falls back to the tab check when getViews throws", () => {
    mockChrome({
      getCurrent: inPopup,
      getViews: () => {
        throw new Error("unsupported");
      },
    });

    return expect(isPopup()).resolves.toBe(true);
  });

  it("is false when the tab lookup fails", () => {
    // A true answer opens the background port that pins highlight mode on every
    // filtered page, so false is the safer default.
    mockChrome({
      getCurrent: () => Promise.reject(new Error("no tabs permission")),
      getViews: () => [window],
    });

    return expect(isPopup()).resolves.toBe(false);
  });
});
