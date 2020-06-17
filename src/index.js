import { render } from 'lit-html';
import { getState, subscribe } from 'statezero';

import { clearAllErrors } from './actions/errors';
import { initState } from './actions/init';
import { cancelSelectedTopic } from './actions/topics';
import { cancelSelectedWebsite } from './actions/websites';
import { app } from './views/app';

const init = async () => {
  await initState();

  const renderApp = (state) => render(app(state, window.location.hash), document.body);

  subscribe(renderApp);

  window.addEventListener('hashchange', () => {
    cancelSelectedTopic();
    cancelSelectedWebsite();
    clearAllErrors();
    renderApp(getState());
  });

  renderApp(getState());

  /**
   * Workaround a bug in Chrome that prevents using .sendMessage() in a window "unload" event handler:
   *  https://bugs.chromium.org/p/chromium/issues/detail?id=31262
   *  https://stackoverflow.com/a/39756934
   * Create a port to the background page. This will be used to detect opening/closing of the popup.
   */
  chrome.runtime.connect();
};

init();
