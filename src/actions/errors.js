import { action } from "statezero/src";

export const toId = ({ message }) => message;

export const addError = action(({ commit, state }, error) => {
  // Prefer `message`: Error.toString() prefixes the redundant "Error: ".
  // Optional chaining keeps a null/undefined rejection reason surfaceable.
  const message = error?.message || String(error);
  state.errors = state.errors || [];
  const now = new Date().toJSON();
  const existing = state.errors.find((error_) => toId(error_) === message);
  if (existing) {
    existing.modifiedDate = now;
  } else {
    state.errors.push({ message, modifiedDate: now });
  }
  commit(state);
});

export const clearAllErrors = action(({ commit, state }) => {
  if (!state.errors || !state.errors.length) {
    return;
  }
  state.errors = [];
  commit(state);
});

export const clearError = action(({ commit, state }, id) => {
  if (!state.errors) {
    return;
  }
  const index = state.errors.findIndex((error) => toId(error) === id);
  if (index > -1) {
    state.errors.splice(index, 1);
  }
  commit(state);
});
