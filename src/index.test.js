// `src/index.js` runs `init()` on import, so each case sets up its mocks and
// then loads the module fresh.
const load = async () => {
  document.body.innerHTML = '<div id="root"></div>';
  let mod;
  jest.isolateModules(() => {
    mod = require("./index");
  });
  // Let `init()` settle: it awaits `initState()` and then `isPopup()`.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return mod;
};

const render = jest.fn();
const createRoot = jest.fn(() => ({ render }));
const initState = jest.fn();
const checkAllPermissions = jest.fn();
const isPopup = jest.fn();

jest.mock("react-dom/client", () => ({
  createRoot: (...args) => createRoot(...args),
}));
jest.mock("./actions/init", () => ({
  initState: (...args) => initState(...args),
}));
jest.mock("./permissions", () => ({
  checkAllPermissions: (...args) => checkAllPermissions(...args),
}));
jest.mock("./is-popup", () => ({ isPopup: (...args) => isPopup(...args) }));

describe("popup entry point", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initState.mockResolvedValue(undefined);
    isPopup.mockResolvedValue(true);
    window.location.hash = "";
    global.chrome = { runtime: { connect: jest.fn() } };
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it("renders into the dedicated root element", async () => {
    await load();

    // Not `document.body`: `downloadJson` appends an anchor to it, and React
    // must not own a container that other code writes into.
    expect(createRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(createRoot).not.toHaveBeenCalledWith(document.body);
    expect(render).toHaveBeenCalled();
  });

  it("opens the highlight port from the popup", async () => {
    await load();

    expect(chrome.runtime.connect).toHaveBeenCalled();
  });

  it("does not open the highlight port from a page that is not the popup", async () => {
    // The options page. The background forces highlight mode for as long as the
    // port is open, so a page that can stay open must never connect.
    isPopup.mockResolvedValue(false);

    await load();

    expect(chrome.runtime.connect).not.toHaveBeenCalled();
    // It is still a full UI, so the permission banner is still computed.
    expect(checkAllPermissions).toHaveBeenCalled();
  });

  it("skips the port and the permission check on the import page", async () => {
    // The import page runs its own permission check once a file is applied.
    window.location.hash = "#import";

    await load();

    expect(chrome.runtime.connect).not.toHaveBeenCalled();
    expect(checkAllPermissions).not.toHaveBeenCalled();
    expect(isPopup).not.toHaveBeenCalled();
  });

  it("renders a retryable fallback when initialization fails", async () => {
    // A rejected storage read would otherwise abort before render() and leave
    // a blank popup.
    initState.mockRejectedValue(new Error("storage unavailable"));

    await load();

    expect(render).toHaveBeenCalled();
    expect(chrome.runtime.connect).not.toHaveBeenCalled();
  });
});
