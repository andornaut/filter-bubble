const CONTENT_SCRIPT = '/content-script.js';
const STYLESHEET = '/css/content-script.css';
const SCHEME_REGEX = /^(https?)?:\/\//;

// Firefox supports a promises-based API, but Chrome does not.
const withPromise = (fn) => (...args) =>
  new Promise((resolve, reject) =>
    fn(...args, (result) => {
      const { lastError } = chrome.runtime;
      if (lastError) {
        // .message is an optional property
        reject(lastError.message || lastError);
      } else {
        resolve(result);
      }
    }));

const executeScript = withPromise(chrome.tabs.executeScript.bind(chrome.tabs));
const getStorage = withPromise(chrome.storage.sync.get.bind(chrome.storage.sync));
const insertCSS = withPromise(chrome.tabs.insertCSS.bind(chrome.tabs));
const query = withPromise(chrome.tabs.query.bind(chrome.tabs));
const sendMessage = chrome.tabs.sendMessage.bind(chrome.tabs);
const setBadge = (tabId, count) => {
  count = (count || '').toString(); // Display 0 as empty string
  chrome.browserAction.setBadgeText({ tabId, text: count });
};

/*
 * Return a regular expression that matches all topics using the following approaches:
 *   - exact
 *   - prefix, followed by a non-word character
 *   - suffix, preceded by a non-word character
 *   - internal, but surrounded by non-words characters
 */
const toPattern = (topicsList) =>
  Array.from(
    new Set(
      topicsList
        .filter(({ enabled }) => enabled)
        .map(({ text }) => text)
        .flat()
        // Escape special characters (edited to avoid an unnecessary "\" escape character):
        // https://stackoverflow.com/a/17886301
        .map((text) => text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')),
    ),
  ).reduce((accumulator, phrase) => {
    if (accumulator) {
      accumulator += '|';
    }
    return `${accumulator}(\\b${phrase}\\b)`;
  }, '');

const matchedWebsite = (websitesList, url) => {
  url = url.toLowerCase().replace(SCHEME_REGEX, '');

  for (const { addresses, ...website } of websitesList) {
    for (const address of addresses) {
      if (url.startsWith(address.replace(SCHEME_REGEX, ''))) {
        return website;
      }
    }
  }
  return null;
};

const updateTab = async (
  { forceHighlight = false, pattern = '', websitesList = [] },
  { id: tabId, url: tabUrl },
  alwaysDisable = false,
) => {
  const website = matchedWebsite(websitesList, tabUrl);

  // `pattern` is empty string when the extension is first installed or if all topics are disabled.
  // exit early to avoid matching against empty string regex, which matches every string.
  if (!website || !pattern) {
    if (alwaysDisable) {
      // Always disable when resetting the current tab to handle the case where the website that matches the current
      // tab was deleted, or the selectors on the current tab have changed.
      // This may throw this error error when the tab is a protected page:
      // > Could not establish connection. Receiving end does not exist
      sendMessage(tabId, { command: 'disable' });
    }
    return;
  }

  let response = await executeScript(tabId, { file: CONTENT_SCRIPT, runAt: 'document_start' });
  // Response is sometimes `undefined || [undefined] || [null]`
  response = response || [];
  response = [response] || {};
  const { isFirstRun = true } = response;
  if (isFirstRun) {
    // Use the chrome.tabs API to add the stylesheet, because the content-script may be prevented from doing so
    // by CSP rules:
    // > Cannot insert the CSS Content Security Policy: The page’s settings blocked the loading of a resource at
    // > inline (“style-src”).
    insertCSS(tabId, { file: STYLESHEET, runAt: 'document_start' });
  }

  const { hideInsteadOfRemove, selectors } = website;
  let filterMode = hideInsteadOfRemove ? 'hide' : 'remove';
  if (forceHighlight) {
    filterMode = 'highlight';
  }

  sendMessage(tabId, {
    command: 'enable',
    data: {
      filterMode,
      pattern,
      selectors,
      tabId,
    },
  });
};

const resetCurrentTab = async (state) => {
  const [currentTab] = await query({ active: true, currentWindow: true });
  if (!currentTab) {
    // CurrentTab can be undefined when we're focused on a separate window to eg. inspect the extension background page.
    console.warn('filter-bubble: The current tab is undefined');
    return;
  }
  updateTab(state, currentTab, true);
};

const initBackground = async () => {
  const state = {};

  const updateState = (newState) => {
    const { topics: { list: topicsList = [] } = {}, websites: { list: websitesList = [] } = {} } = newState;
    state.pattern = toPattern(topicsList);
    state.websitesList = websitesList.filter(({ enabled }) => enabled);
    resetCurrentTab(state);
  };

  chrome.storage.onChanged.addListener(({ state: { newValue } }) => {
    updateState(newValue);
  });

  const { state: initialState } = (await getStorage('state')) || {};
  if (initialState) {
    updateState(initialState);
  }

  // Hide content when the popup is closed; and highlight content when the popup is open.
  // See corresponding call to chrome.runtime.connect() in /src/index.js
  chrome.runtime.onConnect.addListener((port) => {
    port.onDisconnect.addListener(() => {
      state.forceHighlight = false;
      resetCurrentTab(state);
    });

    state.forceHighlight = true;
    // Opening the popup triggers, causes the hydratation actions to execute, which triggers a state change,
    // which triggers the storage.onChanged handler, which executes updateTab(), so we can skip executing
    // resetCurrentTab() here.
    resetCurrentTab(state);
  });

  chrome.runtime.onMessage.addListener(({ command, data }) => {
    if (command !== 'count') {
      throw new Error(`filter-bubble: Unknown command: ${command}`);
    }
    setBadge(data.tabId, data.count);
  });

  chrome.tabs.onUpdated.addListener((_, { status }, tab) => {
    // `status === "loading"` may occur several times for a single page load, whereas "complete" occurs only once,
    // but we respond to "loading" to apply filtering as soon as possible.
    if ((status === 'complete' || status === 'loading') && tab.url) {
      updateTab(state, tab);
    }
  });
};

initBackground();
