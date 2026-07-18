// Return a dated, kebab-cased filename for an exported collection.
export const exportFilename = (kind) =>
  `filter-bubble-${kind}-${new Date().toISOString().slice(0, 10)}.json`;

// Trigger a browser download of `data` serialized as pretty-printed JSON.
export const downloadJson = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revoke so the browser can start reading the blob before the URL is
  // released; revoking synchronously after click() can abort the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
