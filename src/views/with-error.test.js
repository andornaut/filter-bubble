import { getState, setState } from "statezero/src";

import { toId } from "../actions/errors";
import { withError } from "./with-error";

describe("withError", () => {
  beforeEach(() => {
    setState(undefined, {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
  });

  it("surfaces a thrown error as state instead of rejecting", async () => {
    await expect(
      withError(() => {
        throw new Error("boom");
      })(),
    ).resolves.toBeUndefined();

    expect(getState("errors").map(toId)).toEqual(["boom"]);
  });

  it("surfaces a rejection from an async handler", async () => {
    await withError(() => Promise.reject(new Error("async boom")))();

    expect(getState("errors").map(toId)).toEqual(["async boom"]);
  });

  it("leaves earlier errors in place when the handler fails again", async () => {
    await withError(() => {
      throw new Error("first");
    })();
    await withError(() => {
      throw new Error("second");
    })();

    expect(getState("errors").map(toId)).toEqual(["first", "second"]);
  });

  it("clears previously shown errors after a successful run", async () => {
    await withError(() => {
      throw new Error("boom");
    })();

    await withError(() => {})();

    expect(getState("errors")).toEqual([]);
  });

  it("passes its arguments through to the handler", async () => {
    const handler = jest.fn();

    await withError(handler)("a", "b");

    expect(handler).toHaveBeenCalledWith("a", "b");
  });
});
