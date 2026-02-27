import { action } from "statezero/src";

import { arrayToId } from "../helpers";
import {
  addItemFactory,
  deleteItemFactory,
  editItemFactory,
  toggleEnabledFactory,
} from "./factories";

export const hydrateTopics = action(({ commit, state }, { topics = {} }) => {
  state.topics = topics;
  state.topics.list = state.topics.list || [];
  commit(state);
});

export const toId = ({ text }) => arrayToId(text);

const toRoot = (state) => state.topics;

export const addTopic = addItemFactory(toRoot, toId);
export const deleteTopic = deleteItemFactory(toRoot, toId);
export const editTopic = editItemFactory(toRoot, toId);
export const toggleTopicEnabled = toggleEnabledFactory(toRoot, toId);
