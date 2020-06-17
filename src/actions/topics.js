import { action } from 'statezero';

import { toCanonicalArray } from '../helpers';
import { cancelSelectedFactory } from './factories';

export const toId = ({ text }) => (Array.isArray(text) ? text : toCanonicalArray(text || '')).toString();

export const toRoot = (state) => state.topics;

export const cancelSelectedTopic = cancelSelectedFactory(toRoot);

export const hydrateTopics = action(({ commit, state }, { topics = {} }) => {
  state.topics = topics;
  state.topics.list = state.topics.list || [];
  commit(state);
});

export const transform = (data) => {
  data.text = toCanonicalArray((data.text || '').toLowerCase());
  // The form allows submission of whitespace-only values. We .trim() after submission, therefore we must
  // validate this case.
  if (!data.text.length) {
    throw new Error('Please fill in the "Text" field');
  }
  return data;
};
