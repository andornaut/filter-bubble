import { action } from "statezero/src";

import {
  createAddItem,
  createDeleteItem,
  createEditItem,
  createToggleEnabled,
  createToId,
} from "./factories";

export const hydrateTopics = action(({ commit, state }, { topics = {} }) => {
  state.topics = topics;
  state.topics.list = state.topics.list || [];
  commit(state);
});

const toRoot = (state) => state.topics;
export const toId = createToId("text");
export const addTopic = createAddItem(toRoot, toId);
export const deleteTopic = createDeleteItem(toRoot, toId);
export const editTopic = createEditItem(toRoot, toId);
export const toggleTopicEnabled = createToggleEnabled(toRoot, toId);
