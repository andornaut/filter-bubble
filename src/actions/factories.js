import { action } from "statezero/src";

const find = (toId, list, id) => list.find((item) => toId(item) === id);

const findIndex = (toId, list, id) =>
  list.findIndex((item) => toId(item) === id);

export const addItemFactory = (toRoot, toId) =>
  action(({ commit, state }, data) => {
    const { list } = toRoot(state);
    const dataId = toId(data);
    if (find(toId, list, dataId)) {
      throw new Error(`Duplicate item: ${dataId}`);
    }
    const now = new Date().toJSON();
    data = {
      ...data,
      createdDate: now,
      enabled: true,
      modifiedDate: now,
    };
    list.push(data);
    commit(state);
  });

export const deleteItemFactory = (toRoot, toId) =>
  action(({ commit, state }, id) => {
    const { list } = toRoot(state);
    const index = findIndex(toId, list, id);
    if (index < 0) {
      throw new Error(`Item not found: ${id}`);
    }
    list.splice(index, 1);
    commit(state);
  });

export const editItemFactory = (toRoot, toId) =>
  action(({ commit, state }, originalId, data) => {
    const { list } = toRoot(state);
    const dataId = toId(data);
    if (dataId !== originalId && findIndex(toId, list, dataId) !== -1) {
      throw new Error(`Duplicate item: ${dataId}`);
    }
    const index = findIndex(toId, list, originalId);
    if (index === -1) {
      throw new Error(`Item not found: ${originalId}`);
    }
    list[index] = {
      ...list[index],
      ...data,
      modifiedDate: new Date().toJSON(),
    };
    commit(state);
  });

export const toggleEnabledFactory = (toRoot, toId) =>
  action(({ commit, state }, id) => {
    const root = toRoot(state);
    const item = find(toId, root.list, id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }
    item.enabled = !item.enabled;
    commit(state);
  });
