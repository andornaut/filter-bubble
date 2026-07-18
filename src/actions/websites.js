import { action } from "statezero/src";

import {
  createAddItem,
  createDeleteItem,
  createEditItem,
  createToContentKey,
  createToggleEnabled,
} from "./factories";

export const hydrateWebsites = action(
  ({ commit, state }, { websites = {} }) => {
    state.websites = websites;
    state.websites.list = state.websites.list || [];
    commit(state);
  },
);

const toRoot = (state) => state.websites;
export const toContentKey = createToContentKey("addresses");
export const toId = (item) => item.id;
export const addWebsite = createAddItem(toRoot, toContentKey);
export const deleteWebsite = createDeleteItem(toRoot);
export const editWebsite = createEditItem(toRoot, toContentKey);
export const toggleWebsiteEnabled = createToggleEnabled(toRoot);
