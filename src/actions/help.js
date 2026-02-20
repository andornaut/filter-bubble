import { action } from "statezero/src";

export const toggleShowHelp = action(({ commit, state }) => {
  state.showHelp = !state.showHelp;
  commit(state);
});
