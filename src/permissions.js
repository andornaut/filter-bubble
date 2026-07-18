import { getState } from "statezero/src";

import {
  setHasPermissions,
  setUnpermissionedWebsiteIds,
} from "./actions/permissions";

const toPermissions = (addresses) => ({
  origins: addresses.map((address) => `*://${address}/*`),
});

const getPermissionsFromState = (state) => {
  const addresses = state.websites.list.reduce((accumulator, current) => {
    accumulator.push(...current.addresses);
    return accumulator;
  }, []);

  return toPermissions(addresses);
};

const requestPermissions = (permissions) =>
  chrome.permissions.request(permissions).then((granted) =>
    // The request may cover only a subset of websites, so recompute the global
    // and per-website flags from the full state rather than trusting `granted`
    // for the global banner. Return `granted` for the caller.
    Promise.all([
      checkPermissions(getState()).catch(() => {}),
      checkWebsitePermissions(getState()),
    ]).then(() => granted),
  );

export const checkPermissions = (state) =>
  chrome.permissions
    .contains(getPermissionsFromState(state))
    .then(setHasPermissions);

// Ids of enabled websites whose host permission is not yet granted. Disabled
// websites are excluded: the background never filters them, so they need no
// permission. The app only ever requests `*://<addr>/*` origins, so a single
// getAll() plus exact membership (or a broad `<all_urls>` / `*://*/*` grant)
// matches what a per-website contains() would report, without one call per
// website. If getAll() rejects, fall back to per-website contains() so the
// flags are still recomputed rather than left stale.
const unpermissionedEnabledIds = (state) => {
  const enabled = state.websites.list.filter((website) => website.enabled);
  return chrome.permissions
    .getAll()
    .then(({ origins = [] }) => {
      const granted = new Set(origins);
      const broad = granted.has("<all_urls>") || granted.has("*://*/*");
      const isGranted = (website) =>
        broad ||
        website.addresses.every((address) => granted.has(`*://${address}/*`));
      return enabled
        .filter((website) => !isGranted(website))
        .map((website) => website.id);
    })
    .catch(() =>
      Promise.all(
        enabled.map((website) =>
          chrome.permissions
            .contains(toPermissions(website.addresses))
            .then((granted) => ({ granted, id: website.id })),
        ),
      ).then((results) =>
        results.filter((result) => !result.granted).map((result) => result.id),
      ),
    );
};

// Flag enabled websites whose host permission is not yet granted so the list
// can warn about them individually.
export const checkWebsitePermissions = (state) =>
  unpermissionedEnabledIds(state)
    .then(setUnpermissionedWebsiteIds)
    .catch((err) =>
      console.error("filter-bubble: website permission check failed:", err),
    );

// Resolve to whether every enabled website's host permission is already
// granted, without mutating state.
export const hasEnabledPermissions = (state) =>
  unpermissionedEnabledIds(state).then((ids) => ids.length === 0);

export const requestPermissionsFromAddresses = (addresses) =>
  requestPermissions(toPermissions(addresses));

export const requestPermissionsFromState = (state) =>
  requestPermissions(getPermissionsFromState(state));
