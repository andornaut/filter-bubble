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
import { checkPermissions, checkWebsitePermissions } from "./permissions";
import { App } from "./views/app";
import { ErrorBoundary } from "./views/error-boundary";
import { Import } from "./views/import";

const Root = () => {
  const state = useStore();
  const hash = useHash();

  return hash === "#import" ? <Import /> : <App hash={hash} state={state} />;
};

const init = async () => {
  await initState();

  // Clear errors on navigation; the resulting store change re-renders `Root`.
  window.addEventListener("hashchange", () => clearAllErrors());

  createRoot(document.body).render(
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>,
  );

  // The import page runs in its own tab and needs neither the permission check
  // nor the highlight port. Connecting it would make the background force
  // highlight mode on every filtered page for as long as the tab stays open.
  if (window.location.hash === "#import") {
    return;
  }

  const state = getState();

  checkPermissions(state); // May update the state.
  checkWebsitePermissions(state); // May update the state.

  /**
   * Workaround a bug in Chrome that prevents using .sendMessage() in a window "unload" event handler:
   *  https://bugs.chromium.org/p/chromium/issues/detail?id=31262
   *  https://stackoverflow.com/a/39756934
   * Create a port to the background page. This will be used to detect opening/closing of the popup.
   */
  chrome.runtime.connect();
};

init();
