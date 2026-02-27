import { action } from "statezero/src";

import {
  addItemFactory,
  createToId,
  deleteItemFactory,
  editItemFactory,
  toggleEnabledFactory,
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

export const toId = createToId("addresses");

const toRoot = (state) => state.websites;

export const addWebsite = addItemFactory(toRoot, toId);
export const deleteWebsite = deleteItemFactory(toRoot, toId);
export const editWebsite = editItemFactory(toRoot, toId);
export const toggleWebsiteEnabled = toggleEnabledFactory(toRoot, toId);
