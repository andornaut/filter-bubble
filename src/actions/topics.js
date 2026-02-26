import { action } from "statezero/src";

import { toCanonicalArray } from "../helpers";
import {
  addItemFactory,
  cancelSelectedFactory,
  deleteSelectedFactory,
  editSelectedFactory,
  selectFactory,
  toggleEnabledFactory,
} from "./factories";

export const hydrateTopics = action(({ commit, state }, { topics = {} }) => {
  state.topics = topics;
  state.topics.list = state.topics.list || [];

  // Always reset `.selected` to match the behavior when switching tabs (for adding and editings scenarios).
  delete state.topics.selected;
  commit(state);
});

export const toId = ({ text }) => (Array.isArray(text) ? text : toCanonicalArray(text || "")).toString();

const toRoot = (state) => state.topics;

export const addTopic = addItemFactory(toRoot, toId);
export const cancelSelectedTopic = cancelSelectedFactory(toRoot);
export const deleteSelectedTopic = deleteSelectedFactory(toRoot, toId);
export const editSelectedTopic = editSelectedFactory(toRoot, toId);
export const selectTopic = selectFactory(toRoot, toId);
export const toggleTopicEnabled = toggleEnabledFactory(toRoot, toId);
