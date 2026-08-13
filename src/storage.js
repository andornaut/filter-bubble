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

// `storage.sync` is one flat namespace that anything holding this extension id
// can write to - another release, a botched import, a hand-edited store - and
// every read walks all of it. A value that is not an object at all throws on
// the first property access, which takes down the whole read: the popup renders
// its failure page, the background keeps the state it happened to hold, and no
// later change to any other key can be applied. Drop the value instead, so one
// key nobody can make sense of costs only that key.
const isItemValue = (value) => Boolean(value) && typeof value === "object";

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

// Last-writer-wins by `modifiedDate`. It is the sync clock and must be bumped by
// every change, including ones that leave the display order alone (toggling
// `enabled`, importing); those bump `sortDate` separately. Older releases merge
// on this same field, so they converge with this one.
//
// The tie-break must be a function of content alone, not of which side is local.
// Two devices holding different values with the same `modifiedDate` each write
// back whatever they pick, so picking "mine" on both would have them overwrite
// each other forever.
const mergeByModified = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const am = a.modifiedDate || "";
  const bm = b.modifiedDate || "";
  if (bm > am) return b;
  if (am > bm) return a;
  return stableStringify(b) > stableStringify(a) ? b : a;
};

// Unlike the duplicate-detection content key, this fully re-canonicalizes the
// array: v1 data may hold unsorted addresses that must map onto the same
// default id.
const canonicalAddresses = (addresses) =>
  toCanonicalArray((addresses || []).join("\n")).toString();

// Seed `modifiedDate` from `createdDate`, so a record this app created and
// nobody has since edited carries the two dates equal. That equality is the
// "never edited" sentinel `refreshDefaults` reads: editing an item stamps
// `modifiedDate` and leaves `createdDate` alone. Releases that seeded defaults
// before this file did stamped both with the install time, so they satisfy the
// same equality and stay eligible.
//
// Derived rather than a constant of its own, so the invariant holds by
// construction and there is no `modifiedDate` field in websites.json for a
// later edit to bump. Bumping it would beat the user's own edit of that website
// through the last-writer-wins merge, seeded onto their other devices by a
// fresh install.
const seededWebsites = defaultWebsites.list.map((website) => ({
  ...website,
  modifiedDate: website.createdDate,
}));

// Map a default website's canonical addresses to its fixed id, so a migrated
// device and a freshly seeded device converge on the same key for defaults.
const defaultIdByAddresses = seededWebsites.reduce((acc, website) => {
  acc[canonicalAddresses(website.addresses)] = website.id;
  return acc;
}, {});

// Re-apply the shipped defaults over stored copies the user has never touched,
// so a corrected selector reaches installs that already seeded the old one.
// Seeding alone only covers a fresh install. Only a default already stored is
// updated, so a newly added one still reaches fresh installs only.
//
// Carry the stored record's own dates across. The shipped pair predates an
// install-time clock, so writing it would move `modifiedDate` backwards, which
// hands the merge outright to any device still holding the later value, and
// would reorder the list, which sorts on `modifiedDate` when `sortDate` is
// absent.
//
// Carry `enabled` across for a different reason: a selector correction has no
// business changing whether the user has the site switched on, and the toggle
// did not stamp `modifiedDate` before the per-item layout, so a default
// disabled on those releases still satisfies the sentinel.
//
// A tombstone carries a delete-time `modifiedDate` and no `createdDate`, so a
// deleted default fails the equality and stays deleted.
//
// Accepted cost: a device still on a release carrying the older data can win
// the merge back (equal `modifiedDate` resolves by content), and this rewrites
// the new data on the next load. The two settle once both devices run the same
// release.
const refreshDefaults = (raw, toWrite) => {
  seededWebsites.forEach((website) => {
    const key = WEBSITE_PREFIX + website.id;
    const current = toWrite[key] || raw[key];
    if (current && current.modifiedDate === current.createdDate) {
      toWrite[key] = {
        ...website,
        createdDate: current.createdDate,
        enabled: current.enabled,
        modifiedDate: current.modifiedDate,
      };
    }
  });
};

const toLists = (currentStore) => {
  const topics = [];
  const websites = [];
  Object.keys(currentStore).forEach((key) => {
    const value = currentStore[key];
    if (value.deleted) {
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

const migrateList = (toWrite, prefix, collection, idFor) => {
  const ids = new Set();
  const items = (collection && collection.list) || [];
  items.forEach((item) => {
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
      raw.state.topics,
      (ids, item) => item.id || toItemId(ids, item.createdDate),
    );
    migrateList(toWrite, WEBSITE_PREFIX, raw.state.websites, (ids, item) => {
      if (item.id) {
        return item.id;
      }
      // Claim a default's fixed id only while it is still free. v1 identified
      // websites by their `addresses` array verbatim, so two entries whose
      // addresses differ only in order were not duplicates there and both
      // canonicalize onto the same default id here. Letting the second reuse it
      // would overwrite the first in `toWrite` and lose it with the blob.
      const defaultId =
        defaultIdByAddresses[canonicalAddresses(item.addresses)];
      return defaultId && !ids.has(defaultId)
        ? defaultId
        : toItemId(ids, item.createdDate);
    });
  } else if (!alreadyV2) {
    // Fresh install (no schema, no v1 blob): seed the default websites.
    seededWebsites.forEach((website) => {
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
  // Run after the merge above: both sides carry the same seeded `modifiedDate`,
  // so that merge resolves the tie by content and keeps the stale copy half the
  // time.
  refreshDefaults(raw, toWrite);

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
  // write does not destroy the only copy of the data.
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
  // Every write sets `modifiedDate`, so an unparseable one cannot arise here.
  // Comparing NaN is always false, which retains such a tombstone rather than
  // sweeping it: the safe direction, since sweeping resurrects the item from
  // any device that still holds it live.
  const stale = Object.keys(store).filter((key) => {
    const value = store[key];
    return value.deleted && Date.parse(value.modifiedDate) < cutoff;
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

// Read `storage.sync` whole, bring it to the v2 layout, and return the item
// lists. Every read walks the entire namespace, so this is also where a value
// that is not an item is dropped and an expired tombstone is swept.
export const fromStorage = async () => {
  const raw = (await chrome.storage.sync.get(null)) || {};
  const v2 = await ensureV2(raw);
  store = {};
  Object.keys(v2).forEach((key) => {
    if (isItemKey(key) && isItemValue(v2[key])) {
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
    if (!desired[key] && !value.deleted) {
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
  // Propagate the rejection (`storage.sync` rejects when over quota) so callers
  // can surface it. Handling it with a commit (e.g. `addError`) cannot loop:
  // `store` above already matches the desired state, so the re-triggered
  // subscriber diffs to nothing here.
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
      // Same reasoning as `fromStorage`: never take a value into `store` that
      // the writers there would then throw on.
      if (!isItemValue(incoming)) {
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
