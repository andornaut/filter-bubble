import { action } from "statezero/src";

import {
  createAddItem,
  createDeleteItem,
  createEditItem,
  createToggleEnabled,
  createToId,
} from "./factories";
import defaultWebsites from "./websites.json";

export const hydrateWebsites = action(({ commit, state }, { websites }) => {
  const now = new Date().toJSON();
  if (websites) {
    state.websites = websites;
  } else {
    state.websites = {
      list: defaultWebsites.list.map((website) => ({
        ...website,
        createdDate: now,
        enabled: true,
        modifiedDate: now,
      })),
    };
  }
  commit(state);
});

const toRoot = (state) => state.websites;

export const toId = createToId("addresses");
export const addWebsite = createAddItem(toRoot, toId);
export const deleteWebsite = createDeleteItem(toRoot, toId);
export const editWebsite = createEditItem(toRoot, toId);
export const toggleWebsiteEnabled = createToggleEnabled(toRoot, toId);
