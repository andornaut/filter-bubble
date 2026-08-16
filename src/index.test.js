// `src/index.js` runs `init()` on import, so each case sets up its mocks and
// then loads the module fresh. `error-boundary` is required inside the same
// isolated registry, so the components compare by identity against what was
// rendered.
const load = async () => {
  document.body.innerHTML = '<div id="root"></div>';
  let boundary;
  jest.isolateModules(() => {
    require("./index");
    boundary = require("./views/error-boundary");
  });
  // Let `init()` settle: it awaits `initState()` and then `isPopup()`.
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  return boundary;
};

const rendered = () => render.mock.calls.at(-1)[0];

const render = jest.fn();
const createRoot = jest.fn(() => ({ render }));
const initState = jest.fn();
const checkAllPermissions = jest.fn();
const isPopup = jest.fn();
const clearAllErrors = jest.fn();

jest.mock("react-dom/client", () => ({
  createRoot: (...args) => createRoot(...args),
}));
jest.mock("./actions/init", () => ({
  initState: (...args) => initState(...args),
}));
jest.mock("./actions/errors", () => ({
  clearAllErrors: (...args) => clearAllErrors(...args),
}));
jest.mock("./permissions", () => ({
  checkAllPermissions: (...args) => checkAllPermissions(...args),
}));
jest.mock("./is-popup", () => ({ isPopup: (...args) => isPopup(...args) }));

describe("popup entry point", () => {
  // Each load registers a `hashchange` listener on the shared window, which
  // `isolateModules` does not unwind. Track and remove them so listeners from
  // one case cannot fire during the next.
  let listeners;
  const addEventListener = window.addEventListener.bind(window);

  beforeEach(() => {
    jest.clearAllMocks();
    listeners = [];
    jest.spyOn(window, "addEventListener").mockImplementation((...args) => {
      listeners.push(args);
      return addEventListener(...args);
    });
    initState.mockResolvedValue(undefined);
    isPopup.mockResolvedValue(true);
    window.location.hash = "";
    global.chrome = { runtime: { connect: jest.fn() } };
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    listeners.forEach(([type, handler]) =>
      window.removeEventListener(type, handler),
    );
    window.addEventListener.mockRestore();
    console.error.mockRestore();
  });

  it("renders the app into the dedicated root element", async () => {
    const { ErrorBoundary } = await load();

    // Not `document.body`: `downloadJson` appends an anchor to it, and React
    // must not own a container that other code writes into.
    expect(createRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(createRoot).not.toHaveBeenCalledWith(document.body);
    expect(rendered().type).toBe(ErrorBoundary);
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
    // It is still a full UI, so the permission banner is still computed, and
    // from the state: `checkAllPermissions()` with no argument throws on
    // `state.websites`, which its own `.catch` swallows into a console error,
    // so the flags are never set and the banner keeps a stale value.
    expect(checkAllPermissions).toHaveBeenCalledWith(expect.any(Object));
  });

  it("skips the port and the permission check on the import page", async () => {
    // The import page runs its own permission check once a file is applied.
    window.location.hash = "#import";

    await load();

    expect(chrome.runtime.connect).not.toHaveBeenCalled();
    expect(checkAllPermissions).not.toHaveBeenCalled();
    expect(isPopup).not.toHaveBeenCalled();
  });

  it("clears errors on navigation between tabs", async () => {
    await load();
    const [, onHashChange] =
      listeners.find(([type]) => type === "hashchange") || [];

    expect(onHashChange).toEqual(expect.any(Function));
    // Clear first: setting `window.location.hash` in `beforeEach` queues a real
    // hashchange that lands during `load()`, so the handler has already run and
    // a bare `toHaveBeenCalled()` would pass for a handler that does nothing.
    clearAllErrors.mockClear();
    onHashChange();

    expect(clearAllErrors).toHaveBeenCalledTimes(1);
  });

  it("offers a working retry when initialization fails", async () => {
    // A rejected storage read would otherwise abort before render() and leave
    // a blank popup with no way out, so the retry affordance is the point.
    initState.mockRejectedValue(new Error("storage unavailable"));

    const { ErrorFallback } = await load();

    expect(rendered().type).toBe(ErrorFallback);
    expect(rendered().props.error.message).toBe("storage unavailable");
    expect(rendered().props.onRetry).toEqual(expect.any(Function));
    expect(chrome.runtime.connect).not.toHaveBeenCalled();
  });

  it("ignores a second retry while one is already running", async () => {
    initState.mockRejectedValue(new Error("storage unavailable"));
    await load();
    expect(initState).toHaveBeenCalledTimes(1);

    // A double-clicked retry would otherwise register duplicate listeners and
    // open a second background port.
    initState.mockReturnValue(new Promise(() => {}));
    const { onRetry } = rendered().props;
    onRetry();
    onRetry();

    expect(initState).toHaveBeenCalledTimes(2);
  });

  it("ignores a retry that lands after initialization but before the port", async () => {
    initState.mockRejectedValue(new Error("storage unavailable"));
    await load();
    const { onRetry } = rendered().props;

    // The retry gets past `initState`, then parks on `isPopup()`. Releasing the
    // guard when `initState` settles would let a second retry overtake here and
    // register another hashchange listener and another port.
    initState.mockResolvedValue(undefined);
    let releaseIsPopup;
    isPopup.mockReturnValue(
      new Promise((resolve) => {
        releaseIsPopup = resolve;
      }),
    );
    onRetry();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    onRetry();
    releaseIsPopup(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(initState).toHaveBeenCalledTimes(2);
    expect(chrome.runtime.connect).toHaveBeenCalledTimes(1);
    expect(listeners.filter(([type]) => type === "hashchange")).toHaveLength(1);
  });
});
