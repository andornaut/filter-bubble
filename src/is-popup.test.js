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
  it("is true in a page that is not a tab and is a registered popup view", () => {
    mockChrome({ getCurrent: inPopup, getViews: () => [window] });

    return expect(isPopup()).resolves.toBe(true);
  });

  it("is false on a page hosted in a tab", () => {
    // The `#import` page and, with `options_ui.open_in_tab`, the options page.
    mockChrome({ getCurrent: inTab, getViews: () => [window] });

    return expect(isPopup()).resolves.toBe(false);
  });

  it("is false in a non-tab options view, which is not a popup view", () => {
    // The backstop: a browser that ignores `open_in_tab` and hosts the options
    // page as a guest would otherwise be indistinguishable from the popup.
    mockChrome({ getCurrent: inPopup, getViews: () => [] });

    return expect(isPopup()).resolves.toBe(false);
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
    // Callers act intrusively on a true answer, so silence is the safer default.
    mockChrome({
      getCurrent: () => Promise.reject(new Error("no tabs permission")),
      getViews: () => [window],
    });

    return expect(isPopup()).resolves.toBe(false);
  });
});
