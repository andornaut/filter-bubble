import { createRoot } from "react-dom/client";
import { getState } from "statezero/src";

import "./views/app.css";
import "./views/error-boundary.css";
import "./views/errors.css";
import "./views/footer.css";
import "./views/form.css";
import "./views/help.css";
import "./views/import.css";
import "./views/list.css";
import "./views/topics.css";
import "./views/websites.css";
import { clearAllErrors } from "./actions/errors";
import { initState } from "./actions/init";
import { useHash } from "./hooks/useHash";
import { useStore } from "./hooks/useStore";
import { isPopup } from "./is-popup";
import { checkAllPermissions } from "./permissions";
import { App } from "./views/app";
import { ErrorBoundary, ErrorFallback } from "./views/error-boundary";
import { Import } from "./views/import";

// Render into a dedicated container rather than `document.body`, which React
// would then own: `downloadJson` appends a temporary anchor to the body, and
// React must not have to reconcile around nodes it did not create.
const root = createRoot(document.getElementById("root"));

const Root = () => {
  const state = useStore();
  const hash = useHash();

  return hash === "#import" ? <Import /> : <App hash={hash} state={state} />;
};

const bootstrap = async () => {
  try {
    await initState();
  } catch (error) {
    // Render the failure with a retry: a rejected storage read would otherwise
    // abort init before render() is ever called, leaving a blank popup.
    console.error("filter-bubble: initState() failed:", error);
    root.render(<ErrorFallback error={error} onRetry={init} />);
    return;
  }

  // Clear errors on navigation; the resulting store change re-renders `Root`.
  window.addEventListener("hashchange", () => clearAllErrors());

  root.render(
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>,
  );

  // The import page runs in its own tab and re-checks permissions itself once a
  // file has been applied, so skip the startup check here.
  if (window.location.hash === "#import") {
    return;
  }

  checkAllPermissions(getState()); // May update the state.

  // Connect only from the popup, which closes on blur. The background holds
  // highlight mode on for as long as this port is open, so a role that can stay
  // open indefinitely would leave every filtered page highlighted instead of
  // filtered.
  if (!(await isPopup())) {
    return;
  }

  /**
   * Workaround a bug in Chrome that prevents using .sendMessage() in a window "unload" event handler:
   *  https://bugs.chromium.org/p/chromium/issues/detail?id=31262
   *  https://stackoverflow.com/a/39756934
   * Create a port to the background page. This will be used to detect opening/closing of the popup.
   */
  chrome.runtime.connect();
};

// Guard against overlapping runs (e.g. a double-clicked retry button), which
// would register duplicate listeners and open a second background port. The
// guard has to span the whole run: releasing it once `initState()` settles
// leaves the later awaits open for a second run to overtake.
let initializing = false;

const init = async () => {
  if (initializing) {
    return;
  }
  initializing = true;
  try {
    await bootstrap();
  } finally {
    initializing = false;
  }
};

init();
