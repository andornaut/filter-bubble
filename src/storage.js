const STORAGE_KEY = 'state';

// window.chrome works on Firefox too.
export const fromStorage = async () => {
  const result = (await chrome.storage.sync.get([STORAGE_KEY])) || {};
  return result[STORAGE_KEY] || {};
};

export const toStorage = (state) => chrome.storage.sync.set({ [STORAGE_KEY]: state });
