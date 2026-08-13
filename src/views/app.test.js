import { fireEvent, render, screen } from "@testing-library/react";
import { setState } from "statezero/src";

import { App } from "./app";

const TOPIC = {
  enabled: true,
  id: "topic-politics",
  modifiedDate: "2026-01-01T00:00:00.000Z",
  text: ["politics"],
};
const WEBSITE = {
  addresses: ["example.com"],
  enabled: true,
  id: "site-example",
  modifiedDate: "2026-01-01T00:00:00.000Z",
  selectors: ["article"],
};

const toState = (overrides = {}) => ({
  errors: [],
  hasPermissions: true,
  isDisabled: false,
  topics: { list: [TOPIC] },
  unpermissionedWebsiteIds: [],
  websites: { list: [WEBSITE] },
  ...overrides,
});

const renderApp = (hash, overrides) => {
  const state = toState(overrides);
  setState(undefined, state);
  render(<App hash={hash} state={state} />);
};

beforeEach(() => {
  global.chrome = {
    permissions: {
      contains: jest.fn(() => Promise.resolve(true)),
      request: jest.fn(() => Promise.resolve(true)),
    },
  };
});

describe("App tabs", () => {
  it("opens on topics, which is what an empty fragment means", () => {
    renderApp("");

    expect(screen.getByRole("link", { name: "Topics" })).toHaveClass(
      "app__tab--active",
    );
    expect(screen.getByText("politics")).toBeVisible();
    expect(screen.queryByLabelText("Domain names")).toBeNull();
  });

  it("opens on websites at #websites", () => {
    renderApp("#websites");

    expect(screen.getByRole("link", { name: "Websites" })).toHaveClass(
      "app__tab--active",
    );
    expect(screen.getByText("example.com")).toBeVisible();
    expect(screen.getByLabelText("Domain names")).toBeVisible();
  });

  it("treats an unknown fragment as topics rather than rendering nothing", () => {
    renderApp("#nonsense");

    expect(screen.getByRole("link", { name: "Topics" })).toHaveClass(
      "app__tab--active",
    );
  });
});

describe("App permission banner", () => {
  it("says nothing while every enabled website is granted", () => {
    renderApp("");

    expect(
      screen.queryByRole("button", { name: /request required permissions/ }),
    ).toBeNull();
  });

  it("requests access for every configured website when asked", () => {
    renderApp("", { hasPermissions: false });

    fireEvent.click(
      screen.getByRole("button", { name: /request required permissions/ }),
    );

    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ["*://example.com/*"],
    });
  });

  // The banner covers the whole UI; the per-website warning marks the one it
  // applies to.
  it("marks the website that cannot be filtered, and only that one", () => {
    renderApp("#websites", {
      hasPermissions: false,
      unpermissionedWebsiteIds: ["site-ungranted"],
      websites: {
        list: [
          WEBSITE,
          {
            ...WEBSITE,
            addresses: ["ungranted.example"],
            id: "site-ungranted",
          },
        ],
      },
    });

    // The warning is an emoji, so it has to say what it means rather than
    // being an unexplained marking.
    expect(
      screen.getAllByRole("img", { name: /won't be filtered until you grant/ }),
    ).toHaveLength(1);
  });
});

describe("App status and errors", () => {
  // The footer's own states are covered in footer.test.js; what App owns is
  // passing the flag down. Both directions, or a footer wired to a constant
  // would report the wrong one to every user who is in it.
  it.each([
    [false, "Turn all filtering off in this browser", "Enabled"],
    [true, "Turn all filtering on in this browser", "Disabled"],
  ])("passes isDisabled %p through to the footer", (isDisabled, name, text) => {
    renderApp("", { isDisabled });

    expect(screen.getByRole("link", { name })).toHaveTextContent(text);
  });

  it("surfaces a handler failure where the user is working", () => {
    renderApp("", {
      errors: [
        { message: "Duplicate item: politics", modifiedDate: "2026-01-01" },
      ],
    });

    expect(screen.getByText(/Duplicate item: politics/)).toBeVisible();
  });
});
