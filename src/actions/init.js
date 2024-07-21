import { getState, subscribe } from 'statezero';

import { checkPermissions } from '../permissions';
import { fromStorage, toStorage } from '../storage';
import { hydrateTopics } from './topics';
import { hydrateWebsites } from './websites';

export const initState = async () => {
  const initialState = await fromStorage();
  hydrateTopics(initialState);
  hydrateWebsites(initialState);
  subscribe(toStorage);

  checkPermissions(getState());
};
