import { fireEvent, render, screen } from "@testing-library/react";
import { getState, setState } from "statezero/src";

import { toId } from "../actions/errors";
import { Websites } from "./websites";

const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const website = (overrides = {}) => ({
  addresses: ["example.com"],
  enabled: true,
  hideInsteadOfRemove: false,
  id: "site-example",
  modifiedDate: "2026-01-01T00:00:00.000Z",
  selectors: ["article"],
  ...overrides,
});

// Track what the browser has granted, so the permission sweep the view runs
// after a toggle or a delete has something real to report.
let granted;

const renderWebsites = (list = [], unpermissionedIds = []) => {
  setState(undefined, {
    errors: [],
    hasPermissions: unpermissionedIds.length === 0,
    unpermissionedWebsiteIds: unpermissionedIds,
    websites: { list },
  });
  render(
    <Websites
      list={getState("websites").list}
      unpermissionedIds={unpermissionedIds}
    />,
  );
};

const fill = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = async (name) => {
  fireEvent.click(screen.getByRole("button", { name }));
  await flush();
};

const storedWebsites = () => getState("websites").list;
const errorMessages = () => getState("errors").map(toId);

describe("Websites", () => {
  beforeEach(() => {
    granted = new Set();
    global.chrome = {
      permissions: {
        contains: jest.fn(({ origins }) =>
          Promise.resolve(origins.every((origin) => granted.has(origin))),
        ),
        request: jest.fn(({ origins }) => {
          origins.forEach((origin) => granted.add(origin));
          return Promise.resolve(true);
        }),
      },
    };
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
  });

  it("canonicalizes however the addresses were typed", async () => {
    renderWebsites();

    // Mixed case, a scheme, a trailing slash (what copying a site's address out
    // of the browser gives you), a duplicate, and unsorted.
    fill("Domain names", " HTTPS://Example.com/ , b.example , example.com ");
    fill("CSS selectors", "article, .thing");
    await submit("Add");

    expect(storedWebsites()).toHaveLength(1);
    // The shape the background's address matching relies on.
    expect(storedWebsites()[0].addresses).toEqual(["b.example", "example.com"]);
    expect(storedWebsites()[0].selectors).toEqual([".thing", "article"]);
  });

  it("rejects an address carrying a path or a port", async () => {
    renderWebsites();

    fill("Domain names", "example.com/path");
    fill("CSS selectors", "article");
    await submit("Add");

    expect(storedWebsites()).toEqual([]);
    expect(errorMessages()).toEqual([
      `"example.com/path" isn't a valid domain name`,
    ]);
  });

  it("refuses a website with no domain name", async () => {
    renderWebsites();

    fill("CSS selectors", "article");
    await submit("Add");

    expect(storedWebsites()).toEqual([]);
    expect(errorMessages()).toEqual([
      'Please fill in the "Domain names" field',
    ]);
  });

  it("refuses a website with no selectors", async () => {
    renderWebsites();

    fill("Domain names", "example.com");
    await submit("Add");

    expect(storedWebsites()).toEqual([]);
    expect(errorMessages()).toEqual([
      'Please fill in the "CSS Selectors" field',
    ]);
  });

  // Only one website can govern a page, so a second one covering the same
  // domain would sit in the list looking configured while doing nothing.
  it("refuses a domain another website already covers, and names it", async () => {
    renderWebsites([website()]);

    fill("Domain names", "example.com, news.example.com");
    fill("CSS selectors", ".thing");
    await submit("Add");

    expect(storedWebsites()).toHaveLength(1);
    expect(errorMessages()).toEqual([
      "Already covered by another website: example.com",
    ]);
  });

  // Editing anything else about a website must not have it collide with itself
  // over the addresses it already holds.
  it("lets a website keep its own domains when edited", async () => {
    renderWebsites([website()]);

    fireEvent.click(screen.getByRole("button", { name: /example.com/ }));
    fill("CSS selectors", ".thing");
    await submit("Save");

    expect(errorMessages()).toEqual([]);
    expect(storedWebsites()[0].selectors).toEqual([".thing"]);
  });

  it("stores the hide-instead-of-remove choice", async () => {
    renderWebsites();

    fill("Domain names", "example.com");
    fill("CSS selectors", "article");
    fireEvent.click(screen.getByLabelText("Hide instead of remove"));
    await submit("Add");

    expect(storedWebsites()[0].hideInsteadOfRemove).toBe(true);
  });

  // An added website does not filter until its host permission is granted.
  // `permissions.request` needs a user gesture, so the form asks during the
  // submit rather than afterwards.
  it("asks for access to a website as it is added", async () => {
    renderWebsites();

    fill("Domain names", "example.com");
    fill("CSS selectors", "article");
    await submit("Add");

    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ["*://example.com/*"],
    });
  });

  // The permission flags count only enabled websites, so the background never
  // filters a disabled one and it needs no access.
  it("stops flagging a website once it is disabled", async () => {
    renderWebsites([website()], ["site-example"]);

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await flush();

    expect(getState("unpermissionedWebsiteIds")).toEqual([]);
    expect(getState("hasPermissions")).toBe(true);
  });

  it("stops flagging a website once it is deleted", async () => {
    renderWebsites([website()], ["site-example"]);

    fireEvent.click(screen.getByRole("button", { name: /example.com/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await flush();

    expect(storedWebsites()).toEqual([]);
    expect(getState("unpermissionedWebsiteIds")).toEqual([]);
  });

  it("flags an enabled website whose access has not been granted", async () => {
    renderWebsites([website({ enabled: false })]);

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    await flush();

    expect(getState("unpermissionedWebsiteIds")).toEqual(["site-example"]);
    expect(getState("hasPermissions")).toBe(false);
  });
});
