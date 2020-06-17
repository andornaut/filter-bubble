import { action } from 'statezero';

import { toCanonicalArray } from '../helpers';
import { cancelSelectedFactory } from './factories';
import defaultWebsites from './websites.json';

export const toId = ({ addresses }) =>
  (Array.isArray(addresses) ? addresses : toCanonicalArray(addresses || '')).toString();

export const toRoot = (state) => state.websites;

export const cancelSelectedWebsite = cancelSelectedFactory(toRoot);

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

export const transform = (data) => {
  data.addresses = toCanonicalArray(data.addresses);
  data.selectors = toCanonicalArray(data.selectors);
  // The following can be true if a user submits eg. " " or ","
  if (!data.addresses.length) {
    throw new Error('Please fill in the "Web addresses" field');
  }
  if (!data.selectors.length) {
    throw new Error('Please fill in the "Selectors" field');
  }
  return data;
};
