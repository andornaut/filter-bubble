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

// Avoid initial flash of request-permission button, this will be updated later.
export const hydratePermissions = () => setHasPermissions(true);
