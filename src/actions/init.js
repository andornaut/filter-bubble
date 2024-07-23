import { subscribe } from 'statezero';

import { fromStorage, toStorage } from '../storage';
import { hydratePermissions } from './permissions';
import { hydrateTopics } from './topics';
import { hydrateWebsites } from './websites';

const hydrators = [hydratePermissions, hydrateTopics, hydrateWebsites];

export const initState = async () => {
  const initialState = await fromStorage();
  hydrators.forEach((hydrate) => hydrate(initialState));
  subscribe(toStorage);
};
