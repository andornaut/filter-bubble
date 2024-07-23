import { render } from 'lit-html';
import { getState, subscribe } from 'statezero';

import { clearAllErrors } from './actions/errors';
import { initState } from './actions/init';
import { cancelSelectedTopic } from './actions/topics';
import { cancelSelectedWebsite } from './actions/websites';
import { checkPermissions } from './permissions';
import { app } from './views/app';

const renderApp = (state) => render(app(state, window.location.hash), document.body);

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

  window.addEventListener('hashchange', () => {
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
