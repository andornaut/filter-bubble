import { useEffect, useRef, useState } from "react";
import { getState } from "statezero/src";

import { toggleDisabled } from "../actions/settings";
import { downloadJson, exportFilename } from "../export";
import { isPopup } from "../is-popup";
import { HELP_HTML } from "./hints";

// Import happens on a dedicated page in a tab: the popup closes as soon as the
// OS file dialog opens, which would abort the import, and a tab does not.
const IMPORT_HASH = "#import";

export const Footer = ({ isDisabled }) => {
  const [showHelp, setShowHelp] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    if (showHelp && contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showHelp]);

  const handleToggle = (event) => {
    event.preventDefault();
    setShowHelp(!showHelp);
  };
  const handleExport = (event) => {
    event.preventDefault();
    const { topics, websites } = getState();
    downloadJson(exportFilename("backup"), {
      topics: topics.list,
      websites: websites.list,
    });
  };
  const handleImport = (event) => {
    event.preventDefault();
    const pageUrl = chrome.runtime.getURL("popup.html");
    const url = pageUrl + IMPORT_HASH;
    const openTab = () => chrome.tabs.create({ url });
    // Focus an already-open import tab instead of stacking up new ones. The
    // `url` query matches the page without its fragment, so filter to #import.
    // If the query fails for any reason, fall back to opening a new tab.
    chrome.tabs
      .query({ url: pageUrl })
      .then((tabs) => {
        const existing = tabs.find((tab) => tab.url === url);
        if (!existing) {
          return openTab();
        }
        // Bring the tab's window forward too, in case it is not the current
        // one; best-effort, so ignore a missing API or failure. Wrapped in
        // `Promise.resolve` because a callback-style `update` returns
        // undefined, which would throw here and fall through to `openTab`.
        Promise.resolve(
          chrome.windows?.update(existing.windowId, { focused: true }),
        ).catch(() => {});
        // Return this so a stale/closed tab (rejected update) falls back below.
        return chrome.tabs.update(existing.id, { active: true });
      })
      .catch(openTab)
      // Close the popup so it does not linger behind the tab we just focused.
      // Only the popup: the options page is a real tab, so closing it would
      // take away the page the user is working in. Best-effort, like the
      // `chrome.windows` call above: this runs while the popup is being torn
      // down, so the lookup can fail with the context already invalidated.
      .finally(() =>
        isPopup()
          .then((popup) => popup && window.close())
          .catch(() => {}),
      );
  };

  const handleToggleDisabled = (event) => {
    event.preventDefault();
    toggleDisabled();
  };

  const label = showHelp ? "Hide help" : "Show help";
  const statusLinkClassName = `footer__status-link ${
    isDisabled ? "footer__status-link--disabled" : ""
  }`.trim();
  // The visible text is the current state, so name the control by the action it
  // performs instead: "Enabled, link" alone does not say what activating does.
  const statusLabel = isDisabled
    ? "Turn all filtering on in this browser"
    : "Turn all filtering off in this browser";
  return (
    <section className="footer">
      {showHelp && <div ref={contentRef}>{HELP_HTML}</div>}
      <div className="footer__actions">
        <span className="footer__status">
          Status:{" "}
          <a
            aria-label={statusLabel}
            className={statusLinkClassName}
            href="#"
            onClick={handleToggleDisabled}
            title={statusLabel}
          >
            {isDisabled ? "Disabled" : "Enabled"}
          </a>{" "}
          {/* The link text already says it, so keep the icon decorative. */}
          <span aria-hidden="true">{isDisabled ? "🚫" : "✅"}</span>
        </span>
        <span className="footer__links">
          <a href="#" onClick={handleExport}>
            Export
          </a>
          <a href="#" onClick={handleImport}>
            Import
          </a>
          <a href="#" onClick={handleToggle}>
            {label}
          </a>
        </span>
      </div>
    </section>
  );
};
