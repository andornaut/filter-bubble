import { action } from "statezero/src";

// `isDisabled` arrives from `fromLocalStorage`, which reads it as `=== true`.
export const hydrateSettings = action(({ commit, state }, { isDisabled }) => {
  state.isDisabled = isDisabled;
  commit(state);
});

// Disabling pauses filtering everywhere without touching each item's own
// `enabled` flag, so re-enabling restores the previous configuration.
export const toggleDisabled = action(({ commit, state }) => {
  state.isDisabled = !state.isDisabled;
  commit(state);
});
