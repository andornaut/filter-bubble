import { action } from 'statezero';

export const toggleShowHelp = action(({ commit, state }) => {
  state.showHelp = !state.showHelp;
  commit(state);
});
