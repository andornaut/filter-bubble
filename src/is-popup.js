// True only in the browser-action popup. `popup.html` also serves as the
// `options_ui` page and the `#import` page, and behaviour differs by role: only
// the popup opens the background's highlight port, and only the popup closes
// itself after sending the user to another tab.
//
// Two signals, both of which must agree, because neither is sufficient alone:
//
//   - Not hosted in a tab. `options_ui.open_in_tab` (pinned by manifest.test.js)
//     makes the options page a tab on desktop, but a browser that hosts add-on
//     settings in its own non-tab UI ignores that key. Firefox for Android
//     (a declared target, see `gecko_android`) embeds them in its settings UI.
//     This resolves undefined there, exactly as in the popup.
//   - Registered as a popup view, which an embedded settings view is not.
//
// Requiring both can only withhold a true, never produce one, so a browser this
// code has not been tried on cannot end up pinning highlight mode onto every
// filtered page.
//
// The two failure paths differ. A failed tab lookup resolves false, because both
// callers do something intrusive when told this is the popup. A `getViews` that
// throws or does not return a list is treated as absent rather than
// authoritative, leaving the tab check to decide alone.
export const isPopup = async () => {
  const isTab = await chrome.tabs
    .getCurrent()
    .then(Boolean)
    .catch(() => true);
  if (isTab) {
    return false;
  }
  let views;
  try {
    views = chrome.extension?.getViews?.({ type: "popup" });
  } catch {
    return true;
  }
  if (Array.isArray(views) && !views.includes(window)) {
    // Not a tab, yet not a popup view either. Log it: the effect is that
    // highlight mode never engages, which is otherwise invisible.
    console.debug("filter-bubble: not a popup view; skipping highlight mode");
    return false;
  }
  return true;
};
