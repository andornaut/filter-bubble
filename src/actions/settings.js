import { action } from "statezero/src";

export const hydrateSettings = action(({ commit, state }, { isDisabled }) => {
  state.isDisabled = Boolean(isDisabled);
  commit(state);
});

// Master switch: pauses filtering everywhere without touching each item's own
// `enabled` flag, so re-enabling restores the previous configuration.
export const toggleDisabled = action(({ commit, state }) => {
  state.isDisabled = !state.isDisabled;
  commit(state);
});
