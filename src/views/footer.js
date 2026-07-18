import { useEffect, useRef, useState } from "react";
import { getState } from "statezero/src";

import { downloadJson, exportFilename } from "../export";
import { HELP_HTML } from "./hints";

// Import happens on a dedicated page in a tab: Firefox closes the popup as soon
// as the OS file dialog opens, so a file input can't run in the popup itself.
const IMPORT_HASH = "#import";

export const Footer = () => {
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
        // one; best-effort, so ignore a missing API or failure (e.g. Android).
        chrome.windows
          ?.update(existing.windowId, { focused: true })
          .catch(() => {});
        // Return this so a stale/closed tab (rejected update) falls back below.
        return chrome.tabs.update(existing.id, { active: true });
      })
      .catch(openTab);
  };

  const label = showHelp ? "Hide help" : "Show help";
  return (
    <section className="footer">
      {showHelp && <div ref={contentRef}>{HELP_HTML}</div>}
      <div className="footer__actions">
        <span className="footer__data">
          <a href="#" onClick={handleExport}>
            Export
          </a>
          <a href="#" onClick={handleImport}>
            Import
          </a>
        </span>
        <a href="#" onClick={handleToggle}>
          {label}
        </a>
      </div>
    </section>
  );
};
