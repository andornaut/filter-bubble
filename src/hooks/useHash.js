import { useSyncExternalStore } from "react";

const getSnapshot = () => window.location.hash;

const subscribe = (onStoreChange) => {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
};

export const useHash = () => useSyncExternalStore(subscribe, getSnapshot);
