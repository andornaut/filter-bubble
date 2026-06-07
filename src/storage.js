const STORAGE_KEY = "state";

// `window.chrome` works on both Chrome and Firefox
export const fromStorage = async () => {
  const result = (await chrome.storage.sync.get([STORAGE_KEY])) || {};
  return result[STORAGE_KEY] || {};
};

export const toStorage = (state) => {
  // Exclude transient state from persistence
  // eslint-disable-next-line no-unused-vars
  const { errors, hasPermissions, ...persistedState } = state;
  // `storage.sync` rejects when over quota (e.g. too many topics/websites).
  // Log rather than surface via `addError`, which would re-trigger this
  // subscriber and loop. Returned for awaiting/testing.
  return chrome.storage.sync
    .set({ [STORAGE_KEY]: persistedState })
    .catch((err) => {
      console.error("filter-bubble: storage.sync.set() failed:", err);
    });
};
