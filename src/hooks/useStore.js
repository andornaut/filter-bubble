import { useSyncExternalStore } from "react";
import { getState, subscribeSync, unsubscribe } from "statezero/src";

// `getState()` returns the deep-frozen state object; its identity only changes
// on `commit`, so it doubles as a stable snapshot without extra caching.
const getSnapshot = () => getState();

const subscribe = (onStoreChange) => {
  const callback = subscribeSync(onStoreChange);
  return () => unsubscribe(callback);
};

export const useStore = () => useSyncExternalStore(subscribe, getSnapshot);
