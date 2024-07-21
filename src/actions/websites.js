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

const DOMAIN_NAME_REGEX = /^[a-z\d]([a-z\d-]{0,61}[a-z\d])(\.[a-z\d]([a-z\d-]{0,61}[a-z\d])?)*$/i;
const SCHEME_REGEX = /^(https?)?:\/\//;

export const transform = (data) => {
  data.addresses = toCanonicalArray(data.addresses);
  data.selectors = toCanonicalArray(data.selectors);

  data.addresses = data.addresses.map((address) => {
    const domainName = address.toLowerCase().replace(SCHEME_REGEX, '');
    if (!domainName.match(DOMAIN_NAME_REGEX)) {
      throw new Error(`"${address}" isn't a valid domain name`);
    }
    return domainName;
  });

  // Removing the URL scheme above can cause there to be new duplicates
  data.addresses = Array.from(new Set(data.addresses));

  // The following can be true if a user submits eg. " " or ","
  if (data.addresses.length === 0) {
    throw new Error('Please fill in the "Domain names" field');
  }
  if (data.selectors.length === 0) {
    throw new Error('Please fill in the "CSS Selectors" field');
  }

  return data;
};
