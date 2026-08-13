import { action } from "statezero/src";

export const setHasPermissions = action(({ commit, state }, hasPermissions) => {
  if (state.hasPermissions !== hasPermissions) {
    state.hasPermissions = hasPermissions;
    commit(state);
  }
});

export const setUnpermissionedWebsiteIds = action(({ commit, state }, ids) => {
  // Compare as sets: the same ids in a different order is not a change.
  const current = state.unpermissionedWebsiteIds || [];
  const next = new Set(ids);
  if (current.length === next.size && current.every((id) => next.has(id))) {
    return;
  }
  state.unpermissionedWebsiteIds = ids;
  commit(state);
});

// Assume granted until the first sweep answers, so the banner does not flash on
// every open of a fully permissioned install.
export const hydratePermissions = () => setHasPermissions(true);
