import { action } from "statezero/src";

export const setHasPermissions = action(({ commit, state }, hasPermissions) => {
  if (state.hasPermissions !== hasPermissions) {
    state.hasPermissions = hasPermissions;
    commit(state);
  }
});

// Avoid initial flash of request-permission button, this will be updated later.
export const hydratePermissions = () => setHasPermissions(true);
