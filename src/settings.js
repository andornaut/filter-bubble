// Set while Filter Bubble is disabled. Stored in `storage.local` rather than
// `storage.sync`: disabling is meant to apply to this browser only, and a
// synced flag would turn filtering off on every device.
// Note: This key is duplicated in src/browser/background.js, which cannot
// import ES modules (it runs as a service worker without bundling).
const DISABLED_KEY = "disabled";

// Mirrors the persisted value so writes can be diffed: the state subscriber
// runs on every commit, most of which leave this flag alone.
let isDisabled = false;

export const fromLocalStorage = async () => {
  const raw = (await chrome.storage.local.get(DISABLED_KEY)) || {};
  isDisabled = raw[DISABLED_KEY] === true;
  return { isDisabled };
};

export const toLocalStorage = (state) => {
  const desired = Boolean(state.isDisabled);
  if (desired === isDisabled) {
    return Promise.resolve();
  }
  // Record the attempted write before it settles, so a rejection handled with a
  // commit (e.g. `addError`) cannot loop back into another write.
  isDisabled = desired;
  return chrome.storage.local.set({ [DISABLED_KEY]: desired });
};
