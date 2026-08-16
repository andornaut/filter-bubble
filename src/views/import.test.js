import { fireEvent, render, screen } from "@testing-library/react";
import { getState, setState } from "statezero/src";

import { Import } from "./import";

// Nothing is stubbed but the browser: the page parses the file, applies it,
// persists it, and asks about permissions, all through the shipped code. That
// is more than one turn of the event loop, so give the whole chain time to run
// rather than one tick of it.
const settle = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

// The page reads a file the user picked, so only `text()` is reached for.
const choose = async (contents) => {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, {
    target: { files: [{ text: () => Promise.resolve(contents) }] },
  });
  await settle();
};

const file = (data) => JSON.stringify(data);

const ONE_OF_EACH = file({
  topics: [{ text: ["politics"] }],
  websites: [{ addresses: ["example.com"], selectors: ["article"] }],
});

const grantButton = () =>
  screen.queryByRole("button", { name: "Grant website access" });

let contains;
let request;
let syncSet;

describe("Import", () => {
  beforeEach(() => {
    contains = jest.fn(() => Promise.resolve(true));
    request = jest.fn(() => Promise.resolve(true));
    syncSet = jest.fn(() => Promise.resolve());
    global.chrome = {
      permissions: {
        contains: (...args) => contains(...args),
        request: (...args) => request(...args),
      },
      storage: {
        onChanged: { addListener: () => {} },
        sync: {
          get: () => Promise.resolve({ schema: 2 }),
          remove: () => Promise.resolve(),
          set: (...args) => syncSet(...args),
        },
      },
    };
    setState(undefined, { topics: { list: [] }, websites: { list: [] } });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    render(<Import />);
  });

  afterEach(() => {
    console.warn.mockRestore();
  });

  it("applies the file and says the tab can be closed", async () => {
    await choose(ONE_OF_EACH);

    expect(screen.getByText("Imported 1 topic and 1 website.")).toBeVisible();
    expect(screen.getByText(/close this tab/)).toBeVisible();
    expect(getState("topics").list).toHaveLength(1);
    expect(getState("websites").list[0].addresses).toEqual(["example.com"]);
    expect(syncSet).toHaveBeenCalled();
  });

  // The count is what was actually applied, which can be fewer than the file's
  // entries when it repeats an id.
  it("counts in the plural, and counts what was applied", async () => {
    await choose(
      file({
        topics: [
          { id: "a", text: ["politics"] },
          { id: "a", text: ["sports"] },
          { id: "b", text: ["gardening"] },
        ],
      }),
    );

    expect(screen.getByText("Imported 2 topics and 0 websites.")).toBeVisible();
  });

  it("reports a malformed file and applies nothing", async () => {
    await choose("not json at all");

    expect(
      screen.getByText("The selected file isn't valid JSON"),
    ).toBeVisible();
    expect(getState("topics").list).toEqual([]);
  });

  it("reports a file whose collections are not lists", async () => {
    await choose(file({ topics: "politics" }));

    expect(
      screen.getByText('The "topics" and "websites" fields must be lists'),
    ).toBeVisible();
    expect(getState("topics").list).toEqual([]);
  });

  it("reports a website whose domain name is not one", async () => {
    await choose(
      file({
        websites: [{ addresses: ["not a domain"], selectors: ["article"] }],
      }),
    );

    expect(screen.getByText(/isn't a valid domain name/)).toBeVisible();
    expect(getState("websites").list).toEqual([]);
  });

  it("surfaces a write that storage refuses", async () => {
    syncSet.mockRejectedValue(new Error("QUOTA_BYTES quota exceeded"));

    await choose(ONE_OF_EACH);

    expect(screen.getByText("QUOTA_BYTES quota exceeded")).toBeVisible();
  });

  // Imported websites do not filter until their access is granted, so the
  // import page offers the prompt itself rather than leaving it to the popup.
  it("offers to grant access to the websites it imported", async () => {
    contains.mockResolvedValue(false);

    await choose(ONE_OF_EACH);

    expect(grantButton()).toBeVisible();
  });

  it("says nothing about access when every website is already granted", async () => {
    await choose(ONE_OF_EACH);

    expect(grantButton()).toBeNull();
  });

  it("says nothing about access when the file held no websites", async () => {
    contains.mockResolvedValue(false);

    await choose(file({ topics: [{ text: ["politics"] }] }));

    expect(grantButton()).toBeNull();
  });

  // A failed check shows the prompt: re-granting access already held costs the
  // user one dialog, skipping it leaves the import unable to filter.
  it("offers the prompt when the permission check fails", async () => {
    contains.mockRejectedValue(new Error("no permissions API"));

    await choose(ONE_OF_EACH);

    expect(grantButton()).toBeVisible();
  });

  it("drops the prompt once access is granted", async () => {
    contains.mockResolvedValue(false);
    await choose(ONE_OF_EACH);

    fireEvent.click(grantButton());
    await settle();

    expect(request).toHaveBeenCalledWith({ origins: ["*://example.com/*"] });
    expect(grantButton()).toBeNull();
  });

  it("keeps the prompt when the user declines", async () => {
    contains.mockResolvedValue(false);
    request.mockResolvedValue(false);
    await choose(ONE_OF_EACH);

    fireEvent.click(grantButton());
    await settle();

    expect(grantButton()).toBeVisible();
  });
});
