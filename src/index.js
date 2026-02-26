import { createRoot } from "react-dom/client";
import { getState, subscribe } from "statezero/src";

import "./views/app.css";
import "./views/error-boundary.css";
import "./views/errors.css";
import "./views/form.css";
import "./views/help.css";
import "./views/list.css";
import "./views/topics.css";
import "./views/websites.css";
import { clearAllErrors } from "./actions/errors";
import { initState } from "./actions/init";
import { cancelSelectedTopic } from "./actions/topics";
import { cancelSelectedWebsite } from "./actions/websites";
import { checkPermissions } from "./permissions";
import { App } from "./views/app";
import { ErrorBoundary } from "./views/error-boundary";

const root = createRoot(document.body);
const renderApp = (state) =>
  root.render(
    <ErrorBoundary>
      <App hash={window.location.hash} state={state} />
    </ErrorBoundary>,
  );

const resetForms = () => {
  // Always reset `.selected`, because the form is cleared on adding (the form data is not saved in the state),
  // and therefore should also be cleared when editing (the form data is initialized to  state...selected).
  cancelSelectedTopic();
  cancelSelectedWebsite();

  // If the forms are cleared, as above, then so should any form errors be.
  clearAllErrors();
};

const init = async () => {
  await initState();
  subscribe(renderApp);

  window.addEventListener("hashchange", () => {
    resetForms();
    renderApp(getState());
  });

  const state = getState();

  renderApp(state);
  checkPermissions(state); // May update the state.

  /**
   * Workaround a bug in Chrome that prevents using .sendMessage() in a window "unload" event handler:
   *  https://bugs.chromium.org/p/chromium/issues/detail?id=31262
   *  https://stackoverflow.com/a/39756934
   * Create a port to the background page. This will be used to detect opening/closing of the popup.
   */
  chrome.runtime.connect();
};

init();
