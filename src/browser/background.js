// =============================================================================
// Constants
// =============================================================================

const CONTENT_SCRIPT_PATH = "/js/content-script.js";
const STYLESHEET_PATH = "/css/content-script.css";
// Note: This regex is duplicated in src/validation.js because this file
// cannot import ES modules (it runs as a service worker without bundling).
const SCHEME_REGEX = /^(https?)?:\/\//;
// Per-item storage key prefixes. Duplicated from src/storage.js, which cannot
// be imported here (service worker, no bundling).
const TOPIC_PREFIX = "t:";
const WEBSITE_PREFIX = "w:";

// =============================================================================
// Helpers
// =============================================================================

// Match `address` against `url` as a host/path prefix, but only when the match
// ends on a boundary. This prevents e.g. "reddit.com" from matching
// "reddit.companyx.com" or "reddit.com.evil.example".
const matchesAddress = (url, address) => {
  if (!url.startsWith(address)) {
    return false;
  }
  // The match is valid when it ends the url exactly or when the next character
  // is a host/path separator. Addresses are always bare domains, so they never
  // end on a separator themselves.
  return url.length === address.length || "/:?#".includes(url[address.length]);
};

const matchedWebsite = (websitesList, url) => {
  url = url.toLowerCase().replace(SCHEME_REGEX, "");

  for (const { addresses, ...website } of websitesList) {
    for (const address of addresses) {
      if (matchesAddress(url, address)) {
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
      // Log at debug level: this is the expected case for most tabs.
      chrome.tabs.sendMessage(tabId, { command: "disable" }).catch((err) => {
        console.debug("filter-bubble: sendMessage(disable) failed:", err);
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

// State is populated asynchronously; event handlers await `stateReady` before
// using it, because an event can wake the service worker and dispatch before
// the read from storage below resolves.
const state = {};

// Build effective topic/website lists from the per-item storage layout,
// falling back to the legacy v1 `state` blob before migration runs. Mirrors
// `toLists` in src/storage.js, which cannot be imported here.
const toLists = (raw) => {
  if (raw.state && raw.schema === undefined) {
    const { topics = { list: [] }, websites = { list: [] } } = raw.state;
    return { topicsList: topics.list || [], websitesList: websites.list || [] };
  }
  const topicsList = [];
  const websitesList = [];
  Object.keys(raw).forEach((key) => {
    const value = raw[key];
    if (!value || value.deleted) {
      return;
    }
    if (key.startsWith(TOPIC_PREFIX)) {
      topicsList.push(value);
    } else if (key.startsWith(WEBSITE_PREFIX)) {
      websitesList.push(value);
    }
  });
  return { topicsList, websitesList };
};

const updateState = ({ topicsList = [], websitesList = [] }) => {
  state.pattern = toPattern(topicsList);
  state.websitesList = websitesList.filter(({ enabled }) => enabled);
  resetCurrentTab(state);
};

const readState = () =>
  chrome.storage.sync
    .get(null)
    .then((raw) => updateState(toLists(raw || {})))
    .catch((err) => {
      console.error("filter-bubble: storage.sync.get() failed:", err);
    });

// Initialize state from storage.
// n.b. `storage.sync` doesn't actually synchronize between instances of Firefox for Android:
// https://bugzilla.mozilla.org/show_bug.cgi?id=1625257
const stateReady = readState();

// Wrap an event handler so that its body runs after `state` has been
// initialized from storage. Wraps the body rather than delaying registration,
// which must stay synchronous.
const whenReady =
  (fn) =>
  (...args) => {
    stateReady.then(() => fn(...args));
  };

// =============================================================================
// Event Listeners
// =============================================================================

chrome.storage.onChanged.addListener(
  whenReady((changes, area) => {
    if (area !== "sync") {
      return;
    }
    readState();
  }),
);

const setForceHighlight = (forceHighlight) =>
  stateReady.then(() => {
    state.forceHighlight = forceHighlight;
    resetCurrentTab(state);
  });

// Hide content when the popup is closed; and highlight content when the popup is open.
// See corresponding call to chrome.runtime.connect() in /src/index.js
chrome.runtime.onConnect.addListener((port) => {
  // Register onDisconnect synchronously, so that a popup that opens and
  // closes before initialization completes still resets the highlight.
  port.onDisconnect.addListener(() => setForceHighlight(false));
  setForceHighlight(true);
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
chrome.tabs.onActivated.addListener(
  whenReady(({ windowId }) => {
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
  }),
);

// Called when a tab metadata, such as its loading state or URL, changes.
chrome.tabs.onUpdated.addListener(
  whenReady((_, changeInfo, tab) => {
    // Act when a document starts loading and again when it completes. Use
    // `tab.url` rather than `changeInfo.url`: browsers omit `url` from
    // `changeInfo` when it hasn't changed, so a page reload would otherwise
    // be missed. Repeat calls are cheap: `content-script.js` skips its reset
    // when the state is unchanged.
    if (changeInfo.status !== "loading" && changeInfo.status !== "complete") {
      return;
    }
    // Skip pre-commit events: `tab.url` still holds the outgoing document's
    // URL while `tab.pendingUrl` (Chrome-only) holds the in-flight one, so
    // acting here would apply the outgoing site's rules to the new document.
    // The commit fires another event with `tab.url` updated.
    if (!tab.url || (tab.pendingUrl && tab.pendingUrl !== tab.url)) {
      return;
    }
    // The "complete" pass repairs an injection that raced the navigation and
    // ran in the outgoing document: it re-enables when the tab matches a
    // website, and always disables when it doesn't (Firefox lacks
    // `pendingUrl`, so a raced injection can have applied another site's
    // rules to this tab).
    updateTab(state, tab, changeInfo.status === "complete");
  }),
);
