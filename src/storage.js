const STORAGE_KEY = 'state';

// Firefox supports a promises-based API, but Chrome does not.
const withPromise = (fn) => (...args) =>
  new Promise((resolve, reject) =>
    fn(...args, (result) => {
      const { lastError } = chrome.runtime;
      if (lastError) {
        // .message is an optional property
        reject(lastError.message || lastError);
      } else {
        resolve(result);
      }
    }));

// window.chrome works on Firefox too.
const storage = chrome.storage.sync;
const get = withPromise(storage.get.bind(storage));
const set = withPromise(storage.set.bind(storage));

export const fromStorage = async () => {
  const result = (await get([STORAGE_KEY])) || {};
  return result[STORAGE_KEY] || {};
};

export const toStorage = (state) => set({ [STORAGE_KEY]: state });
