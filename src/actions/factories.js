import { action } from 'statezero';

const find = (toId, list, id) => list.find((item) => toId(item) === id);

const findIndex = (toId, list, id) => list.findIndex((item) => toId(item) === id);

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

export const cancelSelectedFactory = (toRoot) =>
  action(({ commit, state }) => {
    const root = toRoot(state);
    delete root.selected;
    commit(state);
  });

export const deleteSelectedFactory = (toRoot, toId) =>
  action(({ commit, state }) => {
    const root = toRoot(state);
    const { list, selected } = root;
    const selectedId = toId(selected);
    const index = findIndex(toId, list, selectedId);
    if (index < 0) {
      throw new Error(`Item not found: ${selectedId}`);
    }
    list.splice(index, 1);
    delete root.selected;
    commit(state);
  });

export const editSelectedFactory = (toRoot, toId) =>
  action(({ commit, state }, data) => {
    const root = toRoot(state);
    const { list, selected } = root;
    const dataId = toId(data);
    const selectedId = toId(selected);
    if (dataId !== selectedId && findIndex(toId, list, dataId) !== -1) {
      throw new Error(`Duplicate item: ${dataId}`);
    }
    data = {
      ...selected,
      ...data,
      modifiedDate: new Date().toJSON(),
    };
    const index = findIndex(toId, list, selectedId);
    if (index === -1) {
      throw new Error(`Item not found: ${selectedId}`);
    }
    delete root.selected;
    list[index] = data;
    commit(state);
  });

export const selectFactory = (toRoot, toId) =>
  action(({ commit, state }, id) => {
    const root = toRoot(state);
    const item = find(toId, root.list, id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }
    root.selected = item;
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
