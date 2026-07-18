import { action } from "statezero/src";

import {
  createAddItem,
  createDeleteItem,
  createEditItem,
  createToContentKey,
  createToggleEnabled,
} from "./factories";

export const hydrateTopics = action(({ commit, state }, { topics = {} }) => {
  state.topics = topics;
  state.topics.list = state.topics.list || [];
  commit(state);
});

const toRoot = (state) => state.topics;
export const toContentKey = createToContentKey("text");
export const toId = (item) => item.id;
export const addTopic = createAddItem(toRoot, toContentKey);
export const deleteTopic = createDeleteItem(toRoot);
export const editTopic = createEditItem(toRoot, toContentKey);
export const toggleTopicEnabled = createToggleEnabled(toRoot);
