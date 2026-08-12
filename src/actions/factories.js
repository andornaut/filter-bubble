import { action } from "statezero/src";

import { toCanonicalArray, toItemId } from "../helpers";

// Content key used only for duplicate detection (not identity). Two items with
// the same canonical content are considered duplicates. Stored arrays are used
// verbatim, not re-canonicalized: legacy items may hold differently-ordered
// arrays that must keep distinct keys, or coexisting items would collide and
// become uneditable duplicates.
export const createToContentKey = (field) => (item) =>
  (Array.isArray(item[field])
    ? item[field]
    : toCanonicalArray(item[field] || "")
  ).toString();

const findIndexById = (list, id) => list.findIndex((item) => item.id === id);

// A collection's collision rule: given the current list and the item being
// added or edited, return the message to refuse it with, or "" to accept it.
// `exceptId` is the item being edited, which must not collide with itself.
//
// The default rule is exact content equality, which is all a topic needs: two
// topics listing the same phrases are the same topic. A collection whose items
// can overlap without being equal passes its own rule to
// `createCollectionActions` - see `findAddressConflict` in ./websites.
export const createDuplicateConflict =
  (toContentKey) => (list, data, exceptId) => {
    const contentKey = toContentKey(data);
    return list.some(
      (item) => item.id !== exceptId && toContentKey(item) === contentKey,
    )
      ? `Duplicate item: ${contentKey}`
      : "";
  };

export const createAddItem = (toRoot, findConflict) =>
  action(({ commit, state }, data) => {
    const { list } = toRoot(state);
    const conflict = findConflict(list, data);
    if (conflict) {
      throw new Error(conflict);
    }
    const now = new Date().toJSON();
    const id = toItemId(new Set(list.map((item) => item.id)), now);
    list.push({
      ...data,
      createdDate: now,
      enabled: true,
      id,
      modifiedDate: now,
      sortDate: now,
    });
    commit(state);
  });

export const createDeleteItem = (toRoot) =>
  action(({ commit, state }, id) => {
    const { list } = toRoot(state);
    const index = findIndexById(list, id);
    if (index < 0) {
      throw new Error(`Item not found: ${id}`);
    }
    list.splice(index, 1);
    commit(state);
  });

export const createEditItem = (toRoot, findConflict) =>
  action(({ commit, state }, id, data) => {
    const { list } = toRoot(state);
    const index = findIndexById(list, id);
    if (index < 0) {
      throw new Error(`Item not found: ${id}`);
    }
    const conflict = findConflict(list, data, id);
    if (conflict) {
      throw new Error(conflict);
    }
    const now = new Date().toJSON();
    list[index] = {
      ...list[index],
      ...data,
      id,
      modifiedDate: now,
      sortDate: now,
    };
    commit(state);
  });

export const createToggleEnabled = (toRoot) =>
  action(({ commit, state }, id) => {
    const { list } = toRoot(state);
    const item = list.find((current) => current.id === id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }
    item.enabled = !item.enabled;
    // Backfill `sortDate` from the pre-toggle `modifiedDate` first: items stored
    // before the field existed, and the seeded defaults, carry no `sortDate`, so
    // without this the bump below would become their sort key and reorder them.
    item.sortDate = item.sortDate || item.modifiedDate;
    // Bump `modifiedDate` so the change wins the per-item sync merge, but leave
    // `sortDate` alone so the list does not reorder.
    item.modifiedDate = new Date().toJSON();
    commit(state);
  });

// Build the full pre-bound action set for one collection (`topics` or
// `websites`): the statezero root key, the duplicate-detection content field,
// and optionally a collision rule of the collection's own are the only
// differences between the two.
export const createCollectionActions = (
  rootKey,
  contentField,
  findConflict,
) => {
  const toRoot = (state) => state[rootKey];
  const toItemContentKey = createToContentKey(contentField);
  const conflictRule =
    findConflict || createDuplicateConflict(toItemContentKey);
  return {
    addItem: createAddItem(toRoot, conflictRule),
    deleteItem: createDeleteItem(toRoot),
    editItem: createEditItem(toRoot, conflictRule),
    hydrate: action(({ commit, state }, lists) => {
      const root = lists[rootKey] || {};
      root.list = root.list || [];
      state[rootKey] = root;
      commit(state);
    }),
    toContentKey: toItemContentKey,
    toId: (item) => item.id,
    toggleEnabled: createToggleEnabled(toRoot),
  };
};
