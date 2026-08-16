// `popup.html` serves three roles and the fragment picks between them.
// index.test.js mocks the renderer, so it can assert what the entry point does
// for each fragment but never what it puts on screen. This file lets
// `src/index.js` render for real into the container popup.html provides, and
// reads the page back out of the DOM. `App` and `Import` are covered on their
// own; what is covered here is the choice between them.
const initState = jest.fn();

jest.mock("./actions/init", () => ({
  initState: (...args) => initState(...args),
}));
jest.mock("./permissions", () => ({ checkAllPermissions: jest.fn() }));
jest.mock("./is-popup", () => ({ isPopup: () => Promise.resolve(false) }));

const STATE = {
  errors: [],
  hasPermissions: true,
  isDisabled: false,
  topics: { list: [] },
  unpermissionedWebsiteIds: [],
  websites: { list: [] },
};

// React renders on its own scheduler rather than on the tick that asked for it,
// and `init()` awaits before it renders at all, so give both room to settle.
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

// `init()` runs on import and renders once `initState()` settles, so seeding
// the store from that mock is what puts it in place before the first render.
// The store `Root` reads through `useStore` is the one in the registry
// `./index` is loaded into, which is why it is taken from inside.
const show = async (hash) => {
  document.body.innerHTML = '<div id="root"></div>';
  window.location.hash = hash;
  jest.isolateModules(() => {
    const statezero = require("statezero/src");
    initState.mockImplementation(async () => {
      statezero.setState(undefined, STATE);
    });
    require("./index");
  });
  await settle();
  return document.getElementById("root");
};

describe("popup routing", () => {
  it("renders the import page at #import", async () => {
    const root = await show("#import");

    expect(root).toHaveTextContent("Import Filter Bubble data");
    expect(root.querySelector(".app__nav")).toBeNull();
  });

  it("renders the tabbed app at every other fragment", async () => {
    const root = await show("#websites");

    expect(root.querySelector(".app__nav")).toBeVisible();
    expect(root).not.toHaveTextContent("Import Filter Bubble data");
  });
});
