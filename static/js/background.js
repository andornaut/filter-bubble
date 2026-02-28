const CONTENT_SCRIPT_PATH = "/js/content-script.js";
const STYLESHEET_PATH = "/css/content-script.css";
// Note: This regex is duplicated from src/validation.js because this file
// cannot import ES modules (it runs as a service worker without bundling).
const SCHEME_REGEX = /^(https?)?:\/\//;

const matchedWebsite = (websitesList, url) => {
  url = url.toLowerCase().replace(SCHEME_REGEX, "");

  for (const { addresses, ...website } of websitesList) {
    for (const address of addresses) {
      if (url.startsWith(address.replace(SCHEME_REGEX, ""))) {
        return website;
      }
    }
  }
  return null;
};

const setBadge = (tabId, count) => {
  count = (count || "").toString(); // Display 0 as empty string
  chrome.action.setBadgeText({ tabId, text: count });
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
        .map((text) => text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")),
    ),
  ).reduce((accumulator, phrase) => {
    if (accumulator) {
      accumulator += "|";
    }
    return `${accumulator}(\\b${phrase}\\b)`;
  }, "");

const updateTab = async (
  { forceHighlight = false, pattern = "", websitesList = [] },
  { id: tabId, url: tabUrl },
  alwaysDisable = false,
) => {
  const website = matchedWebsite(websitesList, tabUrl);

  // `pattern` is empty string when the extension is first installed or if all topics are disabled.
  // exit early to avoid matching against empty string regex, which matches every string.
  if (!website || !pattern) {
    if (tabUrl.match(SCHEME_REGEX) && alwaysDisable) {
      // Always `disable` when resetting the current tab to handle the case where the website that matches the current
      // tab was deleted from `state.websiteList`, or if the selectors on the current tab have changed.
      //
      // Catch the following error, which usually occurs if `content-script.js` is not installed
      // on the tab, but we attempt to send a message to it anyway in case the script /was/
      // previously installed before the tab.url was removed from `state.websiteList`.
      // > Could not establish connection. Receiving end does not exist
      chrome.tabs.sendMessage(tabId, { command: "disable" }).catch(() => {});
    }
    return;
  }

  let response;
  try {
    response = await chrome.scripting.executeScript({
      files: [CONTENT_SCRIPT_PATH],
      injectImmediately: true,
      target: { tabId },
    });
  } catch (err) {
    // This can occur if host permissions are not granted:
    // https://support.mozilla.org/en-US/kb/manage-optional-permissions-extensions
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions
    console.warn(
      `updateTab() executeScript() failed for ${tabUrl}. Please grant the required "host permissions".`,
      err,
    );
    return;
  }

  // Response is sometimes `undefined || [undefined] || [null]`
  response = response || [];
  response = response[0] || {};
  response = response.result || {};
  const { isFirstRun = true } = response;
  if (isFirstRun) {
    // Use the chrome.scripting API to add the stylesheet, because the content-script may be prevented from doing so
    // by CSP rules:
    // > Cannot insert the CSS Content Security Policy: The page’s settings blocked the loading of a resource at
    // > inline (“style-src”).
    chrome.scripting.insertCSS({ files: [STYLESHEET_PATH], target: { tabId } });
  }

  const { hideInsteadOfRemove, selectors } = website;
  let filterMode = hideInsteadOfRemove ? "hide" : "remove";
  if (forceHighlight) {
    filterMode = "highlight";
  }

  chrome.tabs.sendMessage(tabId, {
    command: "enable",
    data: {
      filterMode,
      pattern,
      selectors,
      tabId,
    },
  });
};

const resetCurrentTab = async (state) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // `tab` can be undefined when focused on a separate window to eg. inspect the extension background page.
  if (tab && tab.url) {
    updateTab(state, tab, true);
  }
};

// Initialization
const state = {};

const updateState = (newState) => {
  const {
    topics: { list: topicsList = [] } = {},
    websites: { list: websitesList = [] } = {},
  } = newState;
  state.pattern = toPattern(topicsList);
  state.websitesList = websitesList.filter(({ enabled }) => enabled);
  resetCurrentTab(state);
};

chrome.storage.onChanged.addListener(({ state: { newValue } }) => {
  updateState(newValue);
});

// Hide content when the popup is closed; and highlight content when the popup is open.
// See corresponding call to chrome.runtime.connect() in /src/index.js
chrome.runtime.onConnect.addListener((port) => {
  port.onDisconnect.addListener(() => {
    state.forceHighlight = false;
    resetCurrentTab(state);
  });

  state.forceHighlight = true;
  resetCurrentTab(state);
});

// Receive messages from `content-script.js`.
chrome.runtime.onMessage.addListener(({ command, data }) => {
  if (command === "count") {
    setBadge(data.tabId, data.count);
  } else {
    throw new Error(`filter-bubble: Unknown command: ${command}`);
  }
});

// Called when the active tab in a window changes.
// When loading the extension on an existing tab, it's possible that onUpdated
// isn't called, but that onActivated will be.
chrome.tabs.onActivated.addListener(async ({ windowId }) => {
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab && tab.url) {
    updateTab(state, tab);
  }
});

// Called when a tab metadata, such as its loading state or URL, changes.
// The properties filter limits events to status and URL changes only.
chrome.tabs.onUpdated.addListener(
  (_, { status, url }, tab) => {
    if (status === "loading" && url && tab.url) {
      // This may be invoked multiple times for a given page load.
      // n.b. this was observed in Firefox, but not Chrome
      // `content-script.js` deduples these calls, anyway, though
      // (it ignores them if the `state` hasn't changed).
      updateTab(state, tab);
    }
  },
  { properties: ["status", "url"] },
);

// Initialize the `state`.
// n.b. `storage.sync` doesn't actually synchronize between instances of Firefox for Android:
// https://bugzilla.mozilla.org/show_bug.cgi?id=1625257
chrome.storage.sync.get("state").then(({ state: initialState } = {}) => {
  if (initialState) {
    updateState(initialState);
  }
});
