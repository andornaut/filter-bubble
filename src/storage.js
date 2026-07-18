import defaultWebsites from "./data/websites.json";
import { toCanonicalArray, toItemId } from "./helpers";

const SCHEMA_KEY = "schema";
const SCHEMA_VERSION = 2;
const TOPIC_PREFIX = "t:";
const WEBSITE_PREFIX = "w:";
const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Authoritative per-item view of `storage.sync`: maps `t:<id>` / `w:<id>` keys
// to item objects, including tombstones (`{ id, deleted: true, modifiedDate }`).
// Kept in sync with `storage.sync` so writes can be diffed and remote changes
// merged without clobbering.
let store = {};

const isItemKey = (key) =>
  key.startsWith(TOPIC_PREFIX) || key.startsWith(WEBSITE_PREFIX);

// Serialize with object keys sorted so comparisons are independent of key
// order (array order is preserved). Prevents spurious writes and write-back
// loops when the browser hands back values whose keys are ordered differently.
const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

// Last-writer-wins by `modifiedDate`, with a deterministic tie-break so every
// device converges on the same value.
const mergeByModified = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const am = a.modifiedDate || "";
  const bm = b.modifiedDate || "";
  if (bm > am) return b;
  if (am > bm) return a;
  return stableStringify(b) > stableStringify(a) ? b : a;
};

const canonicalAddresses = (addresses) =>
  toCanonicalArray((addresses || []).join("\n")).toString();

// Map a default website's canonical addresses to its fixed id, so a migrated
// device and a freshly seeded device converge on the same key for defaults.
const defaultIdByAddresses = defaultWebsites.list.reduce((acc, website) => {
  acc[canonicalAddresses(website.addresses)] = website.id;
  return acc;
}, {});

const toLists = (currentStore) => {
  const topics = [];
  const websites = [];
  Object.keys(currentStore).forEach((key) => {
    const value = currentStore[key];
    if (!value || value.deleted) {
      return;
    }
    if (key.startsWith(TOPIC_PREFIX)) {
      topics.push(value);
    } else if (key.startsWith(WEBSITE_PREFIX)) {
      websites.push(value);
    }
  });
  return { topics: { list: topics }, websites: { list: websites } };
};

const migrateList = (toWrite, prefix, list, idFor) => {
  const ids = new Set();
  (list || []).forEach((item) => {
    const id = idFor(ids, item);
    ids.add(id);
    toWrite[prefix + id] = { ...item, id };
  });
};

// Bring raw `storage.sync` contents to the v2 per-item layout. Migration is
// idempotent: any v1 `state` blob is folded into the per-item keys and removed,
// even after `schema` is already set (e.g. an un-upgraded instance re-wrote the
// blob). Returns the v2-shaped map.
const ensureV2 = async (raw) => {
  const alreadyV2 = raw[SCHEMA_KEY] === SCHEMA_VERSION;
  const toWrite = {};
  if (!alreadyV2) {
    toWrite[SCHEMA_KEY] = SCHEMA_VERSION;
  }
  if (raw.state) {
    // Derive the id from `createdDate` (stable across edits), not
    // `modifiedDate`, so an item edited on a still-v1 instance folds onto its
    // existing per-item key instead of creating a duplicate. Every item has
    // carried `createdDate` since the first release.
    migrateList(
      toWrite,
      TOPIC_PREFIX,
      raw.state.topics && raw.state.topics.list,
      (ids, item) => item.id || toItemId(ids, item.createdDate),
    );
    migrateList(
      toWrite,
      WEBSITE_PREFIX,
      raw.state.websites && raw.state.websites.list,
      (ids, item) =>
        item.id ||
        defaultIdByAddresses[canonicalAddresses(item.addresses)] ||
        toItemId(ids, item.createdDate),
    );
  } else if (!alreadyV2) {
    // Fresh install (no schema, no v1 blob): seed the default websites.
    defaultWebsites.list.forEach((website) => {
      toWrite[WEBSITE_PREFIX + website.id] = website;
    });
  }
  // Reconcile migrated/seeded values against per-item keys already present so we
  // keep the newer value instead of clobbering an edit (e.g. from a partial
  // earlier migration, or a v1 blob folded into an already-v2 store).
  Object.keys(toWrite).forEach((key) => {
    if (isItemKey(key) && raw[key]) {
      toWrite[key] = mergeByModified(raw[key], toWrite[key]);
    }
  });

  // Write only the keys that actually differ from what is already stored, so a
  // lingering v1 blob does not trigger a full rewrite of unchanged items on
  // every load.
  const changes = {};
  Object.keys(toWrite).forEach((key) => {
    if (stableStringify(toWrite[key]) !== stableStringify(raw[key])) {
      changes[key] = toWrite[key];
    }
  });
  const changedKeys = Object.keys(changes);
  if (!changedKeys.length && !raw.state) {
    // Already v2, nothing changed, and no lingering blob to clean up.
    return raw;
  }
  // Swallow write failures (e.g. over quota) so a rejected migration/seed write
  // cannot reject fromStorage and blank the popup. The in-memory result still
  // lets the popup render; the migration retries on the next load.
  let persisted = true;
  if (changedKeys.length) {
    persisted = await chrome.storage.sync
      .set(changes)
      .then(() => true)
      .catch((err) => {
        console.error("filter-bubble: storage.sync.set() failed:", err);
        return false;
      });
  }
  // Only drop the v1 blob once the v2 layout is safely persisted, so a failed
  // write does not lose data.
  if (persisted && raw.state) {
    await chrome.storage.sync.remove("state").catch((err) => {
      console.error("filter-bubble: storage.sync.remove() failed:", err);
    });
  }
  const result = { ...raw, ...toWrite };
  delete result.state;
  return result;
};

const sweepTombstones = async () => {
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  const stale = Object.keys(store).filter((key) => {
    const value = store[key];
    return value && value.deleted && Date.parse(value.modifiedDate) < cutoff;
  });
  if (!stale.length) {
    return;
  }
  // Log the sweep: removing a tombstone can resurrect the item if a device
  // that was offline past the retention window still holds it live.
  console.info("filter-bubble: sweeping expired tombstones:", stale);
  stale.forEach((key) => delete store[key]);
  await chrome.storage.sync.remove(stale).catch((err) => {
    console.error("filter-bubble: storage.sync.remove() failed:", err);
  });
};

// `window.chrome` works on both Chrome and Firefox
export const fromStorage = async () => {
  const raw = (await chrome.storage.sync.get(null)) || {};
  const v2 = await ensureV2(raw);
  store = {};
  Object.keys(v2).forEach((key) => {
    if (isItemKey(key)) {
      store[key] = v2[key];
    }
  });
  await sweepTombstones();
  return toLists(store);
};

export const toStorage = (state) => {
  const desired = {};
  state.topics.list.forEach((topic) => {
    desired[TOPIC_PREFIX + topic.id] = topic;
  });
  state.websites.list.forEach((website) => {
    desired[WEBSITE_PREFIX + website.id] = website;
  });

  const changes = {};
  // Additions and updates.
  Object.keys(desired).forEach((key) => {
    if (stableStringify(desired[key]) !== stableStringify(store[key])) {
      changes[key] = desired[key];
    }
  });
  // Deletions become tombstones so the removal propagates to other devices.
  Object.keys(store).forEach((key) => {
    const value = store[key];
    if (!desired[key] && value && !value.deleted) {
      changes[key] = {
        deleted: true,
        id: value.id,
        modifiedDate: new Date().toJSON(),
      };
    }
  });

  const keys = Object.keys(changes);
  if (!keys.length) {
    return Promise.resolve();
  }
  // Update `store` optimistically so a concurrent `toStorage` (e.g. the async
  // state subscriber) does not re-issue the same write.
  keys.forEach((key) => {
    store[key] = changes[key];
  });
  // Propagate the rejection (`storage.sync` rejects when over quota) so a direct
  // caller can react to it. The state subscriber wraps this to swallow+log, so
  // it does not surface via `addError` and re-trigger itself in a loop.
  return chrome.storage.sync.set(changes);
};

// Invoke `onLists` with the merged item lists whenever `storage.sync` changes
// (e.g. another device saved data). Merges each changed key by `modifiedDate`
// and writes back any value we hold that is newer than the incoming one, so
// concurrent edits converge instead of clobbering.
export const subscribeStorageSync = (onLists) => {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") {
      return;
    }
    const writeBack = {};
    let changed = false;
    Object.keys(changes).forEach((key) => {
      if (!isItemKey(key)) {
        return;
      }
      const incoming = changes[key].newValue;
      if (incoming === undefined) {
        if (store[key] !== undefined) {
          delete store[key];
          changed = true;
        }
        return;
      }
      const winner = mergeByModified(store[key], incoming);
      if (stableStringify(winner) !== stableStringify(store[key])) {
        store[key] = winner;
        changed = true;
      }
      if (stableStringify(winner) !== stableStringify(incoming)) {
        writeBack[key] = winner;
      }
    });
    if (Object.keys(writeBack).length) {
      chrome.storage.sync.set(writeBack).catch((err) => {
        console.error("filter-bubble: storage.sync.set() failed:", err);
      });
    }
    if (changed) {
      onLists(toLists(store));
    }
  });
};
