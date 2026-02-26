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
import defaultWebsites from "./websites.json";

export const hydrateWebsites = action(({ commit, state }, { websites }) => {
  const now = new Date().toJSON();
  if (websites) {
    state.websites = websites;

    // Always reset `.selected` to match the behavior when switching tabs (for adding and editings scenarios).
    delete state.websites.selected;
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

export const toId = ({ addresses }) =>
  (Array.isArray(addresses) ? addresses : toCanonicalArray(addresses || "")).toString();

const toRoot = (state) => state.websites;

export const addWebsite = addItemFactory(toRoot, toId);
export const cancelSelectedWebsite = cancelSelectedFactory(toRoot);
export const deleteSelectedWebsite = deleteSelectedFactory(toRoot, toId);
export const editSelectedWebsite = editSelectedFactory(toRoot, toId);
export const selectWebsite = selectFactory(toRoot, toId);
export const toggleWebsiteEnabled = toggleEnabledFactory(toRoot, toId);
