// True only in the browser-action popup. `popup.html` also serves as the
// `options_ui` page and the `#import` page, and behaviour differs by role: only
// the popup opens the background's highlight port, and only the popup closes
// itself after sending the user to another tab.
//
// Two independent signals, both of which must agree, because neither is
// sufficient alone:
//
//   - Not hosted in a tab. `options_ui.open_in_tab` (pinned by
//     manifest.test.js) makes the options page a tab, but `chrome://extensions
//     /?options=<id>` renders it as a guest regardless of that key, and a
//     browser that hosts add-on settings in its own non-tab UI would too. This
//     resolves undefined in all of those, exactly as in the popup.
//   - Registered as a popup view. An options page hosted as a guest is not a
//     popup view even when it is not a tab either.
//
// Requiring both can only ever withhold a true, never produce one, so a browser
// this code has not been tried on cannot end up pinning highlight mode onto
// every filtered page. The cost of being wrong is that the popup does not enter
// highlight mode, which is the milder failure, and it is logged rather than
// silent. `getViews` is treated as absent rather than authoritative whenever it
// does not return a list, leaving the tab check to decide alone.
//
// Resolves false if the tab lookup fails. Both callers do something intrusive
// when told this is the popup (pinning highlight mode, closing the current
// tab), so silence is the safer answer.
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
