import { useRef, useState } from "react";
import { getState } from "statezero/src";

import { importAndPersist, parseImport } from "../actions/import";
import {
  hasEnabledPermissions,
  requestPermissionsFromState,
} from "../permissions";

const pluralize = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const Import = () => {
  const fileRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [needsPermissions, setNeedsPermissions] = useState(false);

  const handleClick = () => fileRef.current.click();
  const handleChange = async (event) => {
    const [file] = event.target.files;
    // Reset so selecting the same file twice re-fires `change`.
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const { topics, websites } = parseImport(await file.text());
      // Wait for the write to settle before saying it's safe to close the tab;
      // a rejection (e.g. over quota) surfaces as an error below. `counts` is
      // the number actually applied, which can be fewer than the file's entries.
      const counts = await importAndPersist({ topics, websites });
      // Imported websites only filter once their host permission is granted, so
      // prompt for it here rather than only in the popup. Only enabled websites
      // need permission; if the check itself fails, err toward showing the
      // prompt (harmless if already granted) rather than silently skipping it.
      setNeedsPermissions(
        counts.websites > 0 &&
          !(await hasEnabledPermissions(getState()).catch(() => false)),
      );
      setStatus({
        message: `Imported ${pluralize(counts.topics, "topic")} and ${pluralize(counts.websites, "website")}.`,
        tip: "You can close this tab.",
        type: "success",
      });
    } catch (error) {
      console.warn(error);
      setStatus({ message: error.message, type: "error" });
    }
  };
  // Called from a click so `permissions.request` keeps its user gesture.
  const handleGrant = () => {
    requestPermissionsFromState(getState()).then((granted) =>
      setNeedsPermissions(!granted),
    );
  };

  return (
    <main className="import">
      <h1 className="import__title">Import Filter Bubble data</h1>
      <p className="import__info">
        Choose a previously exported JSON file to import your topics and
        websites.
      </p>
      <button className="btn btn--primary" onClick={handleClick} type="button">
        Import
      </button>
      {status && (
        <div className={`import__status import__status--${status.type}`}>
          <p className="import__status-message">{status.message}</p>
          {status.tip && (
            <p className="import__tip">
              <span aria-hidden="true" className="import__tip-icon">
                💡
              </span>{" "}
              {status.tip}
            </p>
          )}
        </div>
      )}
      {needsPermissions && (
        <div className="import__permissions">
          <p>
            The imported websites need access permission before they can filter
            content.
          </p>
          <button
            className="btn btn--primary"
            onClick={handleGrant}
            type="button"
          >
            Grant website access
          </button>
        </div>
      )}
      <input
        accept="application/json"
        hidden
        onChange={handleChange}
        ref={fileRef}
        type="file"
      />
    </main>
  );
};
