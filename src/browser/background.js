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
// Master on/off switch, held in `storage.local` so it applies to this browser
// only. Duplicated from src/settings.js, which cannot be imported here either.
const DISABLED_KEY = "disabled";

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

// True when `tab` can be acted on: it exists, has a URL, and has committed its
// navigation. `tab` is undefined when focused on a separate window to eg.
// inspect the extension background page. In a pre-commit state `tab.url` still
// holds the outgoing document's URL while `tab.pendingUrl` (Chrome-only) holds
// the in-flight one, so acting would apply the outgoing site's rules to the new
// document; `onUpdated` fires again once the navigation commits.
const isCommitted = (tab) =>
  Boolean(tab && tab.url && !(tab.pendingUrl && tab.pendingUrl !== tab.url));

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
 * Lookarounds rather than `\b`: `\b` requires a word character on its inner
 * side, so it could never match against a topic edge that is itself a non-word
 * character (e.g. "c++"). `(?<!\w)`/`(?!\w)` enforce the same non-word context
 * regardless of the edge character.
 */
const toPattern = (topicsList) =>
  Array.from(
    new Set(
      topicsList
        .filter(({ enabled }) => enabled)
        .flatMap(({ text }) => text)
        // Escape special characters (edited to avoid an unnecessary "\" escape character):
        // https://stackoverflow.com/a/17886301
        .map((text) => text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")),
    ),
  )
    .map((phrase) => `(?:(?<!\\w)${phrase}(?!\\w))`)
    .join("|");

// =============================================================================
// Tab Management
// =============================================================================

const updateTab = async (
  { forceHighlight = false, pattern = "", websitesList = [] },
  { id: tabId, url: tabUrl },
  disableWhenUnmatched = true,
) => {
  const website = matchedWebsite(websitesList, tabUrl);

  // `pattern` is empty string when the extension is first installed or if all topics are disabled.
  // Exit early to avoid matching against empty string regex, which matches every string.
  if (!website || !pattern) {
    if (SCHEME_REGEX.test(tabUrl) && disableWhenUnmatched) {
      // Disable by default: the tab may have been filtered under earlier state (website deleted, selectors changed,
      // topics disabled), and this event may be its only repair opportunity. Callers that will get a later event for
      // the same navigation can defer the disable to it.
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
  const { isInstalled = false } = response?.[0]?.result || {};
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
      // Keep this key order stable: the content script detects an unchanged
      // state by comparing the serialized payload.
      data: { filterMode, pattern, selectors },
    })
    .catch((err) => {
      console.error("filter-bubble: sendMessage(enable) failed:", err);
    });
};

// Re-evaluate the active tab matched by `query` against the current state.
// `deferDisableWhileLoading` skips the disable for a tab that is still loading,
// leaving that call to the navigation's `onUpdated` "complete" pass, which is
// the only pass that disables. A load that never completes therefore never gets
// the deferred disable, so callers whose own repair opportunity this is must
// leave it unset.
//
// Residual race, accepted: a navigation that starts after `tabs.query` resolves,
// or one in flight on Firefox (no `tab.pendingUrl`), leaves `tab.url` holding the
// outgoing document's URL. A disable computed from it can land after a newer
// enable and strip live filters, and an enable can apply the outgoing site's
// selectors to the new document, until the next tab event repairs either. Two
// overlapping `updateTab` calls can also finish out of order and leave the older
// `enable` payload applied. Messages carry no sequence token, so a stale one
// cannot be detected; closing the race requires adding one.
//
// `updateTab` is deliberately not awaited. It awaits `chrome.scripting
// .executeScript`, which does not settle while the target renderer is blocked
// (a modal dialog, for instance), so anything that waited on it would stall for
// as long as that tab is stuck. See the read queue below.
const resetActiveTab = (state, query, deferDisableWhileLoading = false) =>
  chrome.tabs
    .query({ active: true, ...query })
    .then(([tab]) => {
      if (isCommitted(tab)) {
        updateTab(
          state,
          tab,
          !(deferDisableWhileLoading && tab.status === "loading"),
        );
      }
    })
    .catch((err) => {
      console.error("filter-bubble: tabs.query() failed:", err);
    });

const resetCurrentTab = (state) =>
  resetActiveTab(state, { currentWindow: true });

// =============================================================================
// State
// =============================================================================

// State is populated asynchronously; event handlers await `readStatePromise`
// before using it, because an event can wake the service worker and dispatch
// before the first read from storage below resolves.
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

const updateState = ({
  isDisabled = false,
  topicsList = [],
  websitesList = [],
}) => {
  // The master switch clears the pattern rather than the website list, which
  // reuses the existing "filter nothing" path: `updateTab` then disables every
  // tab it evaluates instead of injecting. Per-item `enabled` flags are left
  // untouched, so re-enabling restores the previous configuration.
  state.pattern = isDisabled ? "" : toPattern(topicsList);
  state.websitesList = websitesList.filter(({ enabled }) => enabled);
  resetCurrentTab(state);
};

// Serialize reads: `storage.onChanged` can fire again while a read is in flight,
// and two concurrent reads can resolve in either order, which would leave
// `state` holding the older snapshot until some later event repaired it.
// Chaining makes the last read to start the last to apply. A burst of changes
// therefore costs one full read each, run back to back rather than overlapped,
// which is latency rather than a correctness problem: each read fetches
// everything, so the last one is still authoritative.
//
// The queue covers the read and the assignment to `state`, and stops there. It
// deliberately does not extend through the tab update that `updateState`
// triggers: that awaits `executeScript`, which does not settle while the target
// renderer is blocked, and a queue waiting on it would stop applying storage
// changes entirely for as long as one tab is stuck. The cost of stopping here is
// the message-ordering race described above `resetActiveTab`, which the next tab
// event repairs; the cost of not stopping here is edits silently doing nothing.
let readQueue = Promise.resolve();

const readState = () => {
  readQueue = readQueue
    .then(() =>
      Promise.all([
        chrome.storage.sync.get(null),
        chrome.storage.local.get(DISABLED_KEY),
      ]).then(([raw, local]) =>
        updateState({
          ...toLists(raw || {}),
          isDisabled: (local || {})[DISABLED_KEY] === true,
        }),
      ),
    )
    // Catch on the outer chain, not on the inner one: a synchronous throw from
    // the callback (e.g. `chrome.storage` on an invalidated extension context)
    // would otherwise reject `readQueue` and silently drop every read after it,
    // including the release of the handlers gated on the first read below.
    .catch((err) => {
      console.error("filter-bubble: storage.get() failed:", err);
    });
  return readQueue;
};

// Initialize state from storage.
// n.b. `storage.sync` doesn't actually synchronize between instances of Firefox for Android:
// https://bugzilla.mozilla.org/show_bug.cgi?id=1625257
const readStatePromise = readState();

// Wrap an event handler so that its body runs after `state` has been
// initialized from storage. Wraps the body rather than delaying registration,
// which must stay synchronous.
const whenStateIsReady =
  (fn) =>
  (...args) => {
    readStatePromise.then(() => fn(...args));
  };

// =============================================================================
// Event Listeners
// =============================================================================

chrome.storage.onChanged.addListener(
  whenStateIsReady((changes, areaName) => {
    if (areaName === "sync") {
      // A write landed in `storage.sync`: either from the popup or, on desktop,
      // synced in from another browser instance.
      readState();
      return;
    }
    // The master switch is the only `storage.local` key we track; ignore the
    // other areas ("session" and "managed") entirely.
    if (areaName === "local" && DISABLED_KEY in changes) {
      readState();
    }
  }),
);

const setForceHighlight = (forceHighlight) =>
  readStatePromise.then(() => {
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

// Receive messages from `content-script.js`. `sender.tab` identifies the
// content script's tab, so the payload does not need to carry a tab id.
chrome.runtime.onMessage.addListener(({ command, data }, sender) => {
  if (command === "count") {
    // `sender.tab` is only set for content-script senders; ignore other
    // contexts rather than throwing.
    if (sender.tab) {
      setBadge(sender.tab.id, data.count);
    }
  } else {
    console.error(`filter-bubble: Unknown command: ${command}`);
  }
  // Return false: no response sent to sender
  return false;
});

// Called when the active tab in a window changes.
// When loading the extension on an existing tab, it's possible that onUpdated
// isn't called, but that onActivated will be.
// Defer the disable while the tab is loading: activating a tab mid-navigation
// is the likeliest way to read a stale `tab.url`, and the navigation's
// `onUpdated` "complete" pass makes the call instead. A load that never
// completes keeps stale filters until the tab settles, accepted as the narrower
// failure of the two.
chrome.tabs.onActivated.addListener(
  whenStateIsReady(({ windowId }) => resetActiveTab(state, { windowId }, true)),
);

// Called when a tab metadata, such as its loading state or URL, changes.
chrome.tabs.onUpdated.addListener(
  whenStateIsReady((_, changeInfo, tab) => {
    // Act when a document starts loading and again when it completes. Use
    // `tab.url` rather than `changeInfo.url`: browsers omit `url` from
    // `changeInfo` when it hasn't changed, so a page reload would otherwise
    // be missed. Repeat calls are cheap: `content-script.js` skips its reset
    // when the state is unchanged.
    if (changeInfo.status !== "loading" && changeInfo.status !== "complete") {
      return;
    }
    if (!isCommitted(tab)) {
      return;
    }
    // The "complete" pass repairs an injection that raced the navigation and
    // ran in the outgoing document: it re-enables when the tab matches a
    // website, and disables when it doesn't (Firefox lacks `pendingUrl`, so a
    // raced injection can have applied another site's rules to this tab). The
    // "loading" pass skips the disable, deferring that repair to "complete".
    updateTab(state, tab, changeInfo.status !== "loading");
  }),
);
