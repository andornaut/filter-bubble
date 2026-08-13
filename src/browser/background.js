// =============================================================================
// Constants
// =============================================================================

const CONTENT_SCRIPT_PATH = "/js/content-script.js";
const STYLESHEET_PATH = "/css/content-script.css";
// Toolbar icons. The greyscale set marks Filter Bubble being disabled, which is
// otherwise only visible by opening the popup. Sizes mirror
// `action.default_icon` in manifest.json.
const ICON_PATHS = { 16: "/icons/16.png", 32: "/icons/32.png" };
const DISABLED_ICON_PATHS = {
  16: "/icons/16-disabled.png",
  32: "/icons/32-disabled.png",
};
// Toolbar tooltip, which carries the same state as the icons for anyone who
// can't see the colour. `DEFAULT_TITLE` is what re-enabling restores, so it
// must match `action.default_title` in manifest.json.
const DEFAULT_TITLE = "Filter Bubble";
const DISABLED_TITLE = `${DEFAULT_TITLE} (Disabled)`;
// Note: This regex is duplicated in src/validation.js because this file
// cannot import ES modules (it runs as a service worker without bundling).
const SCHEME_REGEX = /^(https?)?:\/\//;
// Per-item storage key prefixes. Duplicated from src/storage.js, which cannot
// be imported here (service worker, no bundling).
const TOPIC_PREFIX = "t:";
const WEBSITE_PREFIX = "w:";
// Set while Filter Bubble is disabled, held in `storage.local` so that
// disabling applies to this browser only. Duplicated from src/settings.js,
// which cannot be imported here either.
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

// `try` rather than a chained `.catch()`: `chrome.action` raises synchronously
// on an invalidated extension context, which a `.catch()` on the returned
// promise is not in place to see.
const setBadge = async (tabId, count) => {
  const text = (count || "").toString(); // Display 0 as empty string
  try {
    // Fails if the tab is closed or otherwise unavailable.
    //
    // Log at debug level, as `sendMessage(disable)` does: the tab id comes from
    // a query result or an event payload, and a tab closed since then is the
    // expected outcome rather than a fault. Chrome surfaces a service worker's
    // `console.error` as an extension error, which is not what a closed tab is.
    await chrome.action.setBadgeText({ tabId, text });
  } catch (err) {
    console.debug("filter-bubble: setBadge() failed:", err);
  }
};

// Same `try` rationale as `setBadge`. Both are set globally rather than per
// tab, because disabling applies to the whole browser.
const updateAction = async (isDisabled) => {
  try {
    await Promise.all([
      chrome.action.setIcon({
        path: isDisabled ? DISABLED_ICON_PATHS : ICON_PATHS,
      }),
      chrome.action.setTitle({
        title: isDisabled ? DISABLED_TITLE : DEFAULT_TITLE,
      }),
    ]);
  } catch (err) {
    console.error("filter-bubble: updateAction() failed:", err);
  }
};

/*
 * Return a regular expression matching any enabled topic phrase, bounded by
 * non-word characters on both sides so that a phrase matches only as a whole
 * word.
 *
 * Lookarounds rather than `\b`: `\b` requires a word character on its inner
 * side, so it could never match a topic edge that is itself a non-word
 * character (e.g. "c++"). `(?<!\w)`/`(?!\w)` enforce the same non-word context
 * regardless of the edge character.
 *
 * Keep the lookarounds wrapping the whole alternation rather than each phrase.
 * Both shapes accept the same input, but wrapping once evaluates the lookbehind
 * once per candidate position rather than once per phrase, which keeps match
 * time flat in the number of topics instead of linear.
 */
const toPattern = (topicsList) => {
  const phrases = Array.from(
    new Set(
      topicsList
        .filter(({ enabled }) => enabled)
        .flatMap(({ text }) => text)
        // An empty phrase would compile to an alternative that matches
        // everywhere, blanking every page. Never emit one.
        .filter(Boolean)
        // Escape special characters (edited to avoid an unnecessary "\" escape character):
        // https://stackoverflow.com/a/17886301
        .map((text) => text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")),
    ),
  );
  // Callers treat an empty pattern as "filter nothing", so it must stay the
  // empty string: an empty alternation would match every string instead.
  if (!phrases.length) {
    return "";
  }
  return `(?<!\\w)(?:${phrases.join("|")})(?!\\w)`;
};

// =============================================================================
// Tab Management
// =============================================================================

// What `state` says about one tab, read at the moment of the call. `state` is
// rewritten in place by `updateState`, so this is a reading rather than a
// snapshot: taking it twice around an `await` is how `updateTab` avoids sending
// a decision the state has already moved past.
const toDecision = (
  { forceHighlight = false, pattern = "", websitesList = [] },
  tabUrl,
) => ({
  forceHighlight,
  pattern,
  website: matchedWebsite(websitesList, tabUrl),
});

const updateTab = async (
  state,
  { id: tabId, url: tabUrl },
  disableWhenUnmatched = true,
) => {
  // A tab-scoped badge belongs to the tab rather than to the document, and an
  // unmatched tab runs no content script to report a count of its own. Chrome
  // resets the badge itself when a new document commits, so what this covers is
  // a tab that keeps its document: a same-document navigation carries the count
  // across, and no other browser is promised to reset anything. Clear it
  // whether or not the disable is deferred: the count belongs to the document
  // the tab is leaving either way.
  const disableTab = () => {
    setBadge(tabId, 0);
    if (!SCHEME_REGEX.test(tabUrl) || !disableWhenUnmatched) {
      return;
    }
    // Disable by default: the tab may have been filtered under earlier state
    // (website deleted, selectors changed, topics disabled), and this event
    // may be its only repair opportunity. Callers that will get a later event
    // for the same navigation can defer the disable to it.
    //
    // Log at debug level: most tabs have no content script installed, so
    // "Could not establish connection" is the expected outcome here.
    chrome.tabs.sendMessage(tabId, { command: "disable" }).catch((err) => {
      console.debug("filter-bubble: sendMessage(disable) failed:", err);
    });
  };

  const { pattern, website } = toDecision(state, tabUrl);

  // `pattern` is empty string when the extension is first installed or if all topics are disabled.
  // Exit early to avoid matching against empty string regex, which matches every string.
  if (!website || !pattern) {
    disableTab();
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
    // No count on this tab can be attributed to what it now shows, because the
    // document cannot be reached to report one. Chrome resets the badge when a
    // new document commits, so a navigation that ends on an error page is
    // already covered there; this covers a tab that becomes unreachable without
    // a new document committing, e.g. once site access is revoked. The trade is
    // the reverse case, where a content script injected before site access was
    // revoked keeps filtering and the badge reads empty over hidden content.
    setBadge(tabId, 0);
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

  // Read `state` again rather than reusing the reading from the top: the
  // `executeScript` above can span any number of storage changes, and the one
  // that arrives during it has already sent this tab a message of its own.
  // Sending what the state said before that would deliver the two in the order
  // they were not decided in, and the tab would be left filtering by a topic
  // that has since been deleted with no further event due to repair it.
  //
  // Nothing between here and the send awaits, so no change can slip in behind
  // this reading either.
  const current = toDecision(state, tabUrl);
  if (!current.website || !current.pattern) {
    disableTab();
    return;
  }

  const { hideInsteadOfRemove, selectors } = current.website;
  let filterMode = hideInsteadOfRemove ? "hide" : "remove";
  if (current.forceHighlight) {
    filterMode = "highlight";
  }

  chrome.tabs
    .sendMessage(tabId, {
      command: "enable",
      // Keep this key order stable: the content script detects an unchanged
      // state by comparing the serialized payload.
      data: { filterMode, pattern: current.pattern, selectors },
    })
    .catch((err) => {
      console.error("filter-bubble: sendMessage(enable) failed:", err);
    });
};

// Nothing awaits `updateTab` (see the note below), so a rejection has nowhere to
// surface and would be swallowed as an unhandled one. Every call goes through
// here so that a throw is logged instead.
const updateTabSafely = (...args) =>
  updateTab(...args).catch((err) => {
    console.error("filter-bubble: updateTab() failed:", err);
  });

// Re-evaluate the active tabs matched by `query` against the current state.
//
// The default query is every window's active tab, not the current window's:
// `tabs.onActivated` fires when the active tab within a window changes, not when
// the focus moves between windows, so another window's visible tab would keep
// filtering under superseded state until it navigated. `currentWindow` is also
// the last focused window when a service worker asks, which is nothing at all
// when no window has focus (a `storage.sync` change arriving from another
// browser instance), so restricting to it can repair no tab whatsoever.
//
// `deferDisableWhileLoading` skips the disable for a tab that is still loading,
// leaving that call to the navigation's `onUpdated` "complete" pass, which is
// the only pass that disables. A load that never completes therefore never gets
// the deferred disable, so callers whose own repair opportunity this is must
// leave it unset.
//
// Accepted race: a navigation that starts after `tabs.query` resolves, or one in
// flight on Firefox (no `tab.pendingUrl`), leaves `tab.url` holding the outgoing
// document's URL, so a message computed from it can apply the wrong rules until
// the next tab event repairs it. Messages carry no sequence token, so a stale
// one cannot be detected; closing the race requires adding one.
//
// `updateTab` is deliberately not awaited: it awaits `executeScript`, which does
// not settle while the target renderer is blocked (a modal dialog, for
// instance).
//
// `try` rather than a chained `.catch()`: `chrome.tabs` raises synchronously on
// an invalidated extension context, which a `.catch()` on the returned promise
// is not in place to see. The query is still issued synchronously, since an
// async function body runs to its first `await`.
const resetActiveTabs = async (
  state,
  query = {},
  deferDisableWhileLoading = false,
) => {
  try {
    // Only the query and walking its result are inside, so an unrelated throw
    // is not misreported as a tabs failure. Nothing in the loop can raise one:
    // `isCommitted` reads properties, and `updateTabSafely` catches its own.
    // Nothing awaits this function, so a throw escaping here would be an
    // unhandled rejection with nowhere to surface.
    for (const tab of await chrome.tabs.query({ active: true, ...query })) {
      if (isCommitted(tab)) {
        updateTabSafely(
          state,
          tab,
          !(deferDisableWhileLoading && tab.status === "loading"),
        );
      }
    }
  } catch (err) {
    console.error("filter-bubble: tabs.query() failed:", err);
  }
};

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
    const { topics, websites } = raw.state;
    return {
      topicsList: topics?.list || [],
      websitesList: websites?.list || [],
    };
  }
  const topicsList = [];
  const websitesList = [];
  Object.keys(raw).forEach((key) => {
    const value = raw[key];
    // Skip anything that is not an object before touching a property of it.
    // `storage.sync` is a namespace anything can write to, and this walk covers
    // all of it: a throw here rejects the read, which leaves `state` holding
    // whatever it had and stops every later change being applied. Mirrors
    // `isItemValue` in src/storage.js, which cannot be imported here.
    if (!value || typeof value !== "object" || value.deleted) {
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
  // Disabling clears the pattern rather than the website list, which
  // reuses the existing "filter nothing" path: `updateTab` then disables every
  // tab it evaluates instead of injecting. Per-item `enabled` flags are left
  // untouched, so re-enabling restores the previous configuration.
  state.pattern = isDisabled ? "" : toPattern(topicsList);
  state.websitesList = websitesList.filter((website) => website.enabled);
  updateAction(isDisabled);
  resetActiveTabs(state);
};

// Serialize reads: `storage.onChanged` can fire again while a read is in flight,
// and two concurrent reads can resolve in either order, which would leave
// `state` holding the older snapshot. Chaining makes the last read to start the
// last to apply.
//
// The queue covers the read and the assignment to `state`, and stops there,
// short of the tab update `updateState` triggers: that awaits `executeScript`,
// which does not settle while the target renderer is blocked, and a queue
// waiting on it would stop applying storage changes for as long as one tab is
// stuck.
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

// Run `fn` once `state` has been initialized from storage. Nothing awaits the
// result, so without the catch a throw from `fn` becomes an unhandled rejection
// that drops the event with no trace.
const runWhenStateIsReady = (fn) =>
  readStatePromise.then(fn).catch((err) => {
    console.error("filter-bubble: deferred handler failed:", err);
  });

// Wrap an event handler so that its body runs after `state` has been
// initialized from storage. Wraps the body rather than delaying registration,
// which must stay synchronous.
const whenStateIsReady =
  (fn) =>
  (...args) => {
    runWhenStateIsReady(() => fn(...args));
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
    // `DISABLED_KEY` is the only `storage.local` key we track; ignore the
    // other areas ("session" and "managed") entirely.
    if (areaName === "local" && DISABLED_KEY in changes) {
      readState();
    }
  }),
);

const setForceHighlight = (forceHighlight) =>
  runWhenStateIsReady(() => {
    state.forceHighlight = forceHighlight;
    // `forceHighlight` is global rather than per tab, and the sweep matches it:
    // an open popup previews in every window, and closing it returns every
    // window to filtering. Scoping either direction to one window would leave
    // the other windows in whichever mode their last tab event happened to
    // apply, since `onActivated` does not fire for a window the user merely
    // looks at.
    resetActiveTabs(state);
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
    // contexts. An absent count clears the badge.
    if (sender.tab) {
      setBadge(sender.tab.id, data?.count);
    }
  } else {
    console.error(`filter-bubble: Unknown command: ${command}`);
  }
  // Return false: no response sent to sender
  return false;
});

// Called when the active tab in a window changes. When loading the extension on
// an existing tab, it's possible that onUpdated isn't called, but that
// onActivated will be.
//
// Defer the disable while the tab is loading: activating a tab mid-navigation is
// the likeliest way to read a stale `tab.url`, so the navigation's `onUpdated`
// "complete" pass makes the call instead.
chrome.tabs.onActivated.addListener(
  whenStateIsReady(({ windowId }) =>
    resetActiveTabs(state, { windowId }, true),
  ),
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
    updateTabSafely(state, tab, changeInfo.status !== "loading");
  }),
);
