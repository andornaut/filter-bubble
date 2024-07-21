import { action } from 'statezero';

export const setHasPermissions = action(({ commit, state }, hasPermissions) => {
  if (state.hasPermissions !== hasPermissions) {
    state.hasPermissions = hasPermissions;
    commit(state);
  }
});
