import { action } from 'statezero';

import { toCanonicalArray } from '../helpers';
import { cancelSelectedFactory } from './factories';
import defaultWebsites from './websites.json';

export const hydrateWebsites = action(({ commit, state }, { websites }) => {
  const now = new Date().toJSON();
  if (websites) {
    state.websites = websites;

    // Always reset `.selected` to match the bevavior when switching tabs (for adding and editings scenarios).
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
  (Array.isArray(addresses) ? addresses : toCanonicalArray(addresses || '')).toString();

export const toRoot = (state) => state.websites;

export const cancelSelectedWebsite = cancelSelectedFactory(toRoot);
