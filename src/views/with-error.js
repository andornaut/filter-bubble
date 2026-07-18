import { addError, clearAllErrors } from "../actions/errors";

// Wrap an async/sync handler so a thrown error surfaces as app state instead of
// bubbling up, and a successful run clears any previously shown errors.
export const withError =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      console.warn(error);
      addError(error);
      return;
    }
    clearAllErrors();
  };
