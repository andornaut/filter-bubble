import { action } from "statezero/src";

import { toCanonicalArray, toItemId } from "../helpers";

// Content key used only for duplicate detection (not identity). Two items with
// the same canonical content are considered duplicates.
export const createToContentKey = (field) => (item) =>
  (Array.isArray(item[field])
    ? item[field]
    : toCanonicalArray(item[field] || "")
  ).toString();

const findIndexById = (list, id) => list.findIndex((item) => item.id === id);

const hasContentKey = (toContentKey, list, contentKey, exceptId) =>
  list.some(
    (item) => item.id !== exceptId && toContentKey(item) === contentKey,
  );

export const createAddItem = (toRoot, toContentKey) =>
  action(({ commit, state }, data) => {
    const { list } = toRoot(state);
    const contentKey = toContentKey(data);
    if (hasContentKey(toContentKey, list, contentKey)) {
      throw new Error(`Duplicate item: ${contentKey}`);
    }
    const now = new Date().toJSON();
    const id = toItemId(new Set(list.map((item) => item.id)), now);
    list.push({
      ...data,
      createdDate: now,
      enabled: true,
      id,
      modifiedDate: now,
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

export const createEditItem = (toRoot, toContentKey) =>
  action(({ commit, state }, id, data) => {
    const { list } = toRoot(state);
    const index = findIndexById(list, id);
    if (index === -1) {
      throw new Error(`Item not found: ${id}`);
    }
    const contentKey = toContentKey(data);
    if (hasContentKey(toContentKey, list, contentKey, id)) {
      throw new Error(`Duplicate item: ${contentKey}`);
    }
    list[index] = {
      ...list[index],
      ...data,
      id,
      modifiedDate: new Date().toJSON(),
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
    // Bump `modifiedDate` so the change wins the per-item sync merge.
    item.modifiedDate = new Date().toJSON();
    commit(state);
  });
