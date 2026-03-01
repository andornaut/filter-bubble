// =============================================================================
// Constants
// =============================================================================

const CONTENT_SCRIPT_PATH = "/js/content-script.js";
const STYLESHEET_PATH = "/css/content-script.css";
// Note: This regex is duplicated in src/views/websites.js.
const SCHEME_REGEX = /^(https?)?:\/\//;

// =============================================================================
// Helpers
// =============================================================================

const matchedWebsite = (websitesList, url) => {
  url = url.toLowerCase().replace(SCHEME_REGEX, "");

  for (const { addresses, ...website } of websitesList) {
    for (const address of addresses) {
      if (url.startsWith(address)) {
        return website;
      }
    }
  }
  return null;
};

const setBadge = (tabId, count) => {
  count = (count || "").toString(); // Display 0 as empty string
  // Catch errors if tab is closed or otherwise unavailable
  chrome.action.setBadgeText({ tabId, text: count }).catch((err) => {
    console.error("filter-bubble: setBadge() failed:", err);
  });
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
  )
    .map((phrase) => `(?:\\b${phrase}\\b)`)
    .join("|");

// =============================================================================
// Tab Management
// =============================================================================

const updateTab = async (
  { forceHighlight = false, pattern = "", websitesList = [] },
  { id: tabId, url: tabUrl },
  alwaysDisable = false,
) => {
  const website = matchedWebsite(websitesList, tabUrl);

  // `pattern` is empty string when the extension is first installed or if all topics are disabled.
  // Exit early to avoid matching against empty string regex, which matches every string.
  if (!website || !pattern) {
    if (SCHEME_REGEX.test(tabUrl) && alwaysDisable) {
      // Always `disable` when resetting the current tab to handle the case where the website that matches the current
      // tab was deleted from `state.websiteList`, or if the selectors on the current tab have changed.
      //
      // Catch the following error, which usually occurs if `content-script.js` is not installed
      // on the tab, but we attempt to send a message to it anyway in case the script /was/
      // previously installed before the tab.url was removed from `state.websiteList`.
      // > Could not establish connection. Receiving end does not exist
      chrome.tabs.sendMessage(tabId, { command: "disable" }).catch((err) => {
        console.error("filter-bubble: sendMessage(disable) failed:", err);
      });
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
      `filter-bubble: updateTab() executeScript() failed for ${tabUrl}. Please grant the required "host permissions".`,
      err,
    );
    return;
  }

  // Response is sometimes `undefined || [undefined] || [null]`
  response = response || [];
  response = response[0] || {};
  response = response.result || {};
  const { isInstalled = false } = response;
  if (!isInstalled) {
    // Use the chrome.scripting API to add the stylesheet, because the content-script may be prevented from doing so
    // by CSP rules:
    // > Cannot insert the CSS Content Security Policy: The page’s settings blocked the loading of a resource at
    // > inline (“style-src”).
    chrome.scripting
      .insertCSS({ files: [STYLESHEET_PATH], target: { tabId } })
      .catch((err) => {
        console.error("filter-bubble: insertCSS() failed:", err);
      });
  }

  const { hideInsteadOfRemove, selectors } = website;
  let filterMode = hideInsteadOfRemove ? "hide" : "remove";
  if (forceHighlight) {
    filterMode = "highlight";
  }

  chrome.tabs
    .sendMessage(tabId, {
      command: "enable",
      data: {
        filterMode,
        pattern,
        selectors,
        tabId,
      },
    })
    .catch((err) => {
      console.error("filter-bubble: sendMessage(enable) failed:", err);
    });
};

const resetCurrentTab = async (state) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // `tab` can be undefined when focused on a separate window to eg. inspect the extension background page.
  if (tab && tab.url) {
    updateTab(state, tab, true);
  }
};

// =============================================================================
// State
// =============================================================================

// State is populated asynchronously; handlers use default values until ready
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

// Initialize state from storage.
// n.b. `storage.sync` doesn't actually synchronize between instances of Firefox for Android:
// https://bugzilla.mozilla.org/show_bug.cgi?id=1625257
chrome.storage.sync
  .get("state")
  .then(({ state: initialState } = {}) => {
    if (initialState) {
      updateState(initialState);
    }
  })
  .catch((err) => {
    console.error("filter-bubble: storage.sync.get() failed:", err);
  });

// =============================================================================
// Event Listeners
// =============================================================================

chrome.storage.onChanged.addListener(({ state: { newValue } = {} }) => {
  if (newValue) {
    updateState(newValue);
  }
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
    console.error(`filter-bubble: Unknown command: ${command}`);
  }
  // Return false: no response sent to sender
  return false;
});

// Called when the active tab in a window changes.
// When loading the extension on an existing tab, it's possible that onUpdated
// isn't called, but that onActivated will be.
chrome.tabs.onActivated.addListener(({ windowId }) => {
  chrome.tabs
    .query({ active: true, windowId })
    .then(([tab]) => {
      if (tab && tab.url) {
        updateTab(state, tab);
      }
    })
    .catch((err) => {
      console.error("filter-bubble: onActivated tabs.query() failed:", err);
    });
});

// Called when a tab metadata, such as its loading state or URL, changes.
chrome.tabs.onUpdated.addListener((_, changeInfo, tab) => {
  // Only act on navigation events (status changing to "loading" with a URL change).
  // This may be invoked multiple times for a given page load (observed in Firefox).
  // `content-script.js` deduplicates these calls (ignores if state hasn't changed).
  if (changeInfo.status === "loading" && changeInfo.url && tab.url) {
    updateTab(state, tab);
  }
});
