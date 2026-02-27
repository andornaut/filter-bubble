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
  chrome.storage.sync.set({ [STORAGE_KEY]: persistedState });
};
