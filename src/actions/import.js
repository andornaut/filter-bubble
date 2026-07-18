import { action, getState } from "statezero/src";

import { toItemId } from "../helpers";
import { toStorage } from "../storage";
import {
  canonicalizeAddresses,
  canonicalizeSelectors,
  canonicalizeText,
} from "../validation";

// Structural validation only: confirm the file is a JSON object with array
// `topics` / `websites` fields. Missing fields default to empty, so exports
// from a single collection still import. Throws user-facing messages.
export const parseImport = (text) => {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The selected file isn't valid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The imported file must be a JSON object");
  }
  const topics = data.topics ?? [];
  const websites = data.websites ?? [];
  if (!Array.isArray(topics) || !Array.isArray(websites)) {
    throw new Error('The "topics" and "websites" fields must be lists');
  }
  if (!topics.length && !websites.length) {
    throw new Error("No topics or websites found in the imported file");
  }
  return { topics, websites };
};

// Fill in the shared item fields. `createdDate`/`id` are preserved so a
// re-imported item merges onto itself instead of duplicating. `modifiedDate`
// is set to the import time so the item wins the last-writer-wins sync merge,
// overriding any tombstone or older value on this or another device.
const normalizeMeta = (ids, item) => {
  const createdDate =
    item.createdDate || item.modifiedDate || new Date().toJSON();
  const id = item.id || toItemId(ids, createdDate);
  ids.add(id);
  return {
    createdDate,
    enabled: item.enabled !== false,
    id,
    modifiedDate: new Date().toJSON(),
  };
};

const normalizeTopic = (ids, item) => {
  // Canonicalize exactly like the add/edit form so imported and hand-entered
  // topics store identical data.
  const text = canonicalizeText(item.text);
  if (!text.length) {
    throw new Error("Each imported topic must have a non-empty text value");
  }
  return { ...normalizeMeta(ids, item), text };
};

const normalizeWebsite = (ids, item) => {
  // Canonicalize/validate exactly like the add/edit form (lowercased, bare
  // domains) so imported websites match the invariant `background.js` relies on;
  // an invalid domain throws with the same message the form shows.
  const addresses = canonicalizeAddresses(item.addresses);
  const selectors = canonicalizeSelectors(item.selectors);
  if (!addresses.length || !selectors.length) {
    throw new Error(
      "Each imported website must have addresses and CSS selectors",
    );
  }
  return {
    ...normalizeMeta(ids, item),
    addresses,
    hideInsteadOfRemove: Boolean(item.hideInsteadOfRemove),
    selectors,
  };
};

// Merge `incoming` into `existing`, keyed by id: an imported item overwrites the
// existing item with the same id (import is authoritative and stamped with a
// fresh modifiedDate), and new ids are appended. Content-level de-duplication is
// intentionally left out to match the sync merge, which also keys only by id.
const mergeList = (existing, incoming) => {
  const byId = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
};

// Returns the number of unique items actually applied per collection, which can
// be fewer than the file's entry count when the file repeats an id (mergeList
// keys by id).
export const importData = action(
  ({ commit, state }, { topics = [], websites = [] }) => {
    const topicIds = new Set(state.topics.list.map((topic) => topic.id));
    const websiteIds = new Set(
      state.websites.list.map((website) => website.id),
    );
    const normalizedTopics = topics.map((item) =>
      normalizeTopic(topicIds, item),
    );
    const normalizedWebsites = websites.map((item) =>
      normalizeWebsite(websiteIds, item),
    );
    state.topics.list = mergeList(state.topics.list, normalizedTopics);
    state.websites.list = mergeList(state.websites.list, normalizedWebsites);
    commit(state);
    return {
      topics: new Set(normalizedTopics.map((topic) => topic.id)).size,
      websites: new Set(normalizedWebsites.map((website) => website.id)).size,
    };
  },
);

// Import and wait for the write to persist so a caller can confirm success or
// surface a failure. `importData` commits synchronously; the `toStorage` state
// subscriber persists on a later tick (too late to await), so persist here
// directly, a no-op for the subscriber once the store already matches. Returns
// the applied per-collection counts from `importData`.
export const importAndPersist = async (payload) => {
  const counts = importData(payload);
  await toStorage(getState());
  return counts;
};
