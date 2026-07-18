import { subscribe } from "statezero/src";

import { fromStorage, subscribeStorageSync, toStorage } from "../storage";
import { hydratePermissions } from "./permissions";
import { hydrateTopics } from "./topics";
import { hydrateWebsites } from "./websites";

const dataHydrators = [hydrateTopics, hydrateWebsites];

export const initState = async () => {
  const lists = await fromStorage();
  hydratePermissions();
  dataHydrators.forEach((hydrate) => hydrate(lists));
  subscribe(toStorage);
  // Apply data that `storage.sync` delivers while the popup is open.
  subscribeStorageSync((updatedLists) =>
    dataHydrators.forEach((hydrate) => hydrate(updatedLists)),
  );
};
