import { getState, subscribe } from "statezero/src";

import { checkWebsitePermissions } from "../permissions";
import { fromStorage, subscribeStorageSync, toStorage } from "../storage";
import { hydratePermissions } from "./permissions";
import { hydrateTopics } from "./topics";
import { hydrateWebsites } from "./websites";

const dataHydrators = [hydrateTopics, hydrateWebsites];

export const initState = async () => {
  const lists = await fromStorage();
  hydratePermissions();
  dataHydrators.forEach((hydrate) => hydrate(lists));
  // Swallow+log write failures here (not inside `toStorage`) so this subscriber
  // does not loop, while direct callers still see the rejection.
  subscribe((state) =>
    toStorage(state).catch((err) =>
      console.error("filter-bubble: storage.sync.set() failed:", err),
    ),
  );
  // Apply data that `storage.sync` delivers while the popup is open.
  subscribeStorageSync((updatedLists) => {
    dataHydrators.forEach((hydrate) => hydrate(updatedLists));
    checkWebsitePermissions(getState());
  });
};
