import { getState, subscribe } from "statezero/src";

import { checkAllPermissions } from "../permissions";
import { fromLocalStorage, toLocalStorage } from "../settings";
import { fromStorage, subscribeStorageSync, toStorage } from "../storage";
import { addError } from "./errors";
import { hydratePermissions } from "./permissions";
import { hydrateSettings } from "./settings";
import { topicActions } from "./topics";
import { websiteActions } from "./websites";

const dataHydrators = [topicActions.hydrate, websiteActions.hydrate];

// `initState` re-runs on ErrorBoundary retry; subscribing again would stack
// duplicate statezero and `storage.onChanged` listeners, so subscribe once.
let subscribed = false;

export const initState = async () => {
  const [lists, settings] = await Promise.all([
    fromStorage(),
    fromLocalStorage(),
  ]);
  hydratePermissions();
  hydrateSettings(settings);
  dataHydrators.forEach((hydrate) => hydrate(lists));
  if (subscribed) {
    return;
  }
  subscribed = true;
  // Surface write failures (e.g. over quota) so the user knows the change did
  // not persist. This cannot loop: both writers record the attempted write
  // before rejecting, so the commit from `addError` diffs to nothing.
  subscribe((state) =>
    Promise.all([toStorage(state), toLocalStorage(state)]).catch((err) => {
      console.error("filter-bubble: storage write failed:", err);
      addError(err);
    }),
  );
  // Apply data that `storage.sync` delivers while the popup is open.
  subscribeStorageSync((updatedLists) => {
    dataHydrators.forEach((hydrate) => hydrate(updatedLists));
    checkAllPermissions(getState());
  });
};
