import { action } from "statezero";

let errorIdCounter = 0;

export const toId = ({ id }) => id;

export const addError = action(({ commit, state }, message) => {
  message = message.toString();
  state.errors = state.errors || [];
  const now = new Date().toJSON();
  const error = state.errors.find((error_) => error_.message === message);
  if (error) {
    error.modifiedDate = now;
  } else {
    errorIdCounter += 1;
    state.errors.push({ id: `error-${errorIdCounter}`, message, modifiedDate: now });
  }
  commit(state);
});

export const clearAllErrors = action(({ commit, state }) => {
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
