import { getState, setState, subscribeSync, unsubscribe } from "statezero/src";

import { addError, clearAllErrors, clearError, toId } from "./errors";

// Assert that an action left the state alone: a commit always produces a new
// root object and notifies subscribers, so an unchanged identity plus a silent
// subscriber proves no commit happened.
const expectNoCommit = (fn) => {
  const before = getState();
  const onChange = jest.fn();
  const callback = subscribeSync(onChange);
  try {
    fn();
  } finally {
    unsubscribe(callback);
  }
  expect(getState()).toBe(before);
  expect(onChange).not.toHaveBeenCalled();
};

describe("addError", () => {
  beforeEach(() => {
    setState(undefined, {});
  });

  it("records the message and a timestamp", () => {
    addError(new Error("boom"));

    const [error] = getState("errors");
    // `message`, not Error.toString(), which prefixes a redundant "Error: ".
    expect(error.message).toBe("boom");
    expect(Number.isNaN(Date.parse(error.modifiedDate))).toBe(false);
  });

  it("stringifies a rejection reason that is not an Error", () => {
    addError("plain string");
    addError(null);

    expect(getState("errors").map(toId)).toEqual(["plain string", "null"]);
  });

  it("keeps distinct messages apart", () => {
    addError(new Error("first"));
    addError(new Error("second"));

    expect(getState("errors").map(toId)).toEqual(["first", "second"]);
  });

  it("bumps the existing entry instead of duplicating the same message", () => {
    addError(new Error("boom"));
    const first = getState("errors")[0].modifiedDate;

    jest.useFakeTimers().setSystemTime(Date.parse(first) + 1000);
    try {
      addError(new Error("boom"));
    } finally {
      jest.useRealTimers();
    }

    const errors = getState("errors");
    expect(errors).toHaveLength(1);
    expect(errors[0].modifiedDate > first).toBe(true);
  });
});

describe("clearError", () => {
  beforeEach(() => {
    setState(undefined, {});
  });

  it("removes only the matching error", () => {
    addError(new Error("first"));
    addError(new Error("second"));

    clearError("first");

    expect(getState("errors").map(toId)).toEqual(["second"]);
  });

  it("does not commit when the id does not match", () => {
    addError(new Error("boom"));

    expectNoCommit(() => clearError("missing"));
  });

  it("does not commit when no errors have been recorded", () => {
    expectNoCommit(() => clearError("missing"));
    expect(getState("errors")).toBeUndefined();
  });
});

describe("clearAllErrors", () => {
  beforeEach(() => {
    setState(undefined, {});
  });

  it("empties the list", () => {
    addError(new Error("boom"));

    clearAllErrors();

    expect(getState("errors")).toEqual([]);
  });

  it("does not commit when the list is already empty", () => {
    expectNoCommit(() => clearAllErrors());
  });
});
