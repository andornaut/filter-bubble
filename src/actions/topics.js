import { action } from 'statezero';

import { toCanonicalArray } from '../helpers';
import { cancelSelectedFactory } from './factories';

export const hydrateTopics = action(({ commit, state }, { topics = {} }) => {
  state.topics = topics;
  state.topics.list = state.topics.list || [];

  // Always reset `.selected` to match the bevavior when switching tabs (for adding and editings scenarios).
  delete state.topics.selected;
  commit(state);
});

export const toId = ({ text }) => (Array.isArray(text) ? text : toCanonicalArray(text || '')).toString();

export const toRoot = (state) => state.topics;

export const cancelSelectedTopic = cancelSelectedFactory(toRoot);
