import { action } from "statezero/src";

export const toId = ({ message }) => message;

export const addError = action(({ commit, state }, message) => {
  message = message.toString();
  state.errors = state.errors || [];
  const now = new Date().toJSON();
  const error = state.errors.find((error_) => toId(error_) === message);
  if (error) {
    error.modifiedDate = now;
  } else {
    state.errors.push({ message, modifiedDate: now });
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
