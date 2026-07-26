import { getState } from "statezero/src";

import {
  setHasPermissions,
  setUnpermissionedWebsiteIds,
} from "./actions/permissions";

const toPermissions = (addresses) => ({
  origins: addresses.map((address) => `*://${address}/*`),
});

const getPermissionsFromState = (state) =>
  toPermissions(state.websites.list.flatMap((website) => website.addresses));

// Ids of enabled websites whose host permission is not yet granted. Disabled
// websites are excluded: the background never filters them, so they need no
// permission. A single getAll() with exact origin membership is the fast path
// (the app only ever requests `*://<addr>/*` origins); websites it does not
// cover are confirmed with contains(), which honors match-pattern subsumption,
// so a broader grant made in the browser's own UI (e.g. `*://*.example.com/*`)
// still counts. If getAll() rejects, every website falls through to contains().
const unpermissionedEnabledIds = async (state) => {
  const enabled = state.websites.list.filter((website) => website.enabled);
  const isExactlyGranted = await chrome.permissions
    .getAll()
    .then(({ origins = [] }) => {
      const granted = new Set(origins);
      const broad = granted.has("<all_urls>") || granted.has("*://*/*");
      return (website) =>
        broad ||
        website.addresses.every((address) => granted.has(`*://${address}/*`));
    })
    .catch(() => () => false);
  const suspects = enabled.filter((website) => !isExactlyGranted(website));
  const results = await Promise.all(
    suspects.map((website) =>
      chrome.permissions
        .contains(toPermissions(website.addresses))
        .then((granted) => ({ granted, id: website.id })),
    ),
  );
  return results.filter((result) => !result.granted).map((result) => result.id);
};

// Recompute the global banner flag and the per-website warnings from one
// permission sweep. Both count only enabled websites. Swallows+logs failures so
// callers can fire-and-forget.
export const checkAllPermissions = (state) =>
  unpermissionedEnabledIds(state)
    .then((ids) => {
      setHasPermissions(ids.length === 0);
      setUnpermissionedWebsiteIds(ids);
    })
    .catch((err) =>
      console.error("filter-bubble: permission check failed:", err),
    );

// Resolve to whether every enabled website's host permission is already
// granted, without mutating state.
export const hasEnabledPermissions = (state) =>
  unpermissionedEnabledIds(state).then((ids) => ids.length === 0);

const requestPermissions = (permissions) =>
  chrome.permissions.request(permissions).then((granted) =>
    // The request may cover only a subset of websites, so recompute the flags
    // from the full state rather than trusting `granted` for the banner.
    // Return `granted` for the caller.
    checkAllPermissions(getState()).then(() => granted),
  );

export const requestPermissionsFromAddresses = (addresses) =>
  requestPermissions(toPermissions(addresses));

export const requestPermissionsFromState = (state) =>
  requestPermissions(getPermissionsFromState(state));
