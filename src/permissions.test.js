import { getState, setState, subscribeSync, unsubscribe } from "statezero/src";

import {
  checkAllPermissions,
  hasEnabledPermissions,
  requestPermissionsFromAddresses,
} from "./permissions";

const website = (id, addresses, enabled = true) => ({
  addresses,
  enabled,
  id,
});

// Stand in for the browser's own `permissions.contains`: every requested origin
// must be covered by `origins`, either exactly or by `<all_urls>`.
const containsFrom = (origins) =>
  jest
    .fn()
    .mockImplementation(({ origins: requested }) =>
      Promise.resolve(
        requested.every(
          (origin) =>
            origins.includes("<all_urls>") || origins.includes(origin),
        ),
      ),
    );

const seed = (list, { origins }, contains) => {
  // A prior value so that clearing to [] is an observable state change.
  setState(undefined, {
    hasPermissions: false,
    unpermissionedWebsiteIds: ["stale"],
    websites: { list },
  });
  global.chrome = {
    permissions: { contains: contains || containsFrom(origins) },
  };
};

describe("checkAllPermissions", () => {
  it("flags enabled websites whose origins are not granted", async () => {
    seed([website("1", ["granted.com"]), website("2", ["missing.com"])], {
      origins: ["*://granted.com/*"],
    });

    await checkAllPermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual(["2"]);
    expect(getState().hasPermissions).toBe(false);
  });

  it("does not flag disabled websites", async () => {
    seed([website("1", ["missing.com"], false)], { origins: [] });

    await checkAllPermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual([]);
    expect(getState().hasPermissions).toBe(true);
  });

  it("requires every address of a multi-address website to be granted", async () => {
    seed([website("1", ["a.com", "b.com"])], { origins: ["*://a.com/*"] });

    await checkAllPermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual(["1"]);
  });

  // The verdict is `contains()`'s alone, so a grant that covers an address
  // without naming it - `<all_urls>`, or a `*://*.example.com/*` made in the
  // browser's own UI - counts, where exact membership in `getAll()` would miss
  // it.
  it("flags nothing when a grant covers an address without naming it", async () => {
    seed(
      [website("1", ["sub.example.com"]), website("2", ["b.com"])],
      { origins: [] },
      jest.fn().mockResolvedValue(true),
    );

    await checkAllPermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual([]);
    expect(getState().hasPermissions).toBe(true);
  });

  // The sweep runs on every open, on every sync arrival, and after every
  // toggle or delete. A commit re-renders and runs the storage subscriber, so
  // one that reports the same ids has to be recognised as no change - and by
  // membership, since `contains()` settles in whatever order it settles in.
  it("does not commit when the sweep finds the same ids in another order", async () => {
    seed([website("1", ["a.com"]), website("2", ["b.com"])], { origins: [] });
    await checkAllPermissions(getState());
    expect(getState().unpermissionedWebsiteIds).toEqual(["1", "2"]);

    // The same two websites, swept the other way round.
    setState("websites", {
      list: [website("2", ["b.com"]), website("1", ["a.com"])],
    });
    const before = getState();
    const onChange = jest.fn();
    const callback = subscribeSync(onChange);
    try {
      await checkAllPermissions(getState());
    } finally {
      unsubscribe(callback);
    }

    // No commit, so the stored order is the one the first sweep left.
    expect(getState()).toBe(before);
    expect(getState().unpermissionedWebsiteIds).toEqual(["1", "2"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  // Callers fire and forget, so a rejection has nowhere to surface. Swallowing
  // it also means the flags keep whatever they last held rather than reporting
  // a sweep that never ran.
  it("logs and does not throw when contains fails", async () => {
    setState(undefined, {
      hasPermissions: true,
      unpermissionedWebsiteIds: [],
      websites: { list: [website("1", ["a.com"])] },
    });
    global.chrome = {
      permissions: { contains: jest.fn().mockRejectedValue(new Error("boom")) },
    };
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(checkAllPermissions(getState())).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      "filter-bubble: permission check failed:",
      expect.any(Error),
    );
    expect(getState().hasPermissions).toBe(true);
    expect(getState().unpermissionedWebsiteIds).toEqual([]);

    error.mockRestore();
  });
});

describe("hasEnabledPermissions", () => {
  it("is true when every enabled website is granted", async () => {
    seed([website("1", ["a.com"]), website("2", ["b.com"], false)], {
      origins: ["*://a.com/*"],
    });

    await expect(hasEnabledPermissions(getState())).resolves.toBe(true);
  });

  it("is false when an enabled website is not granted", async () => {
    seed([website("1", ["a.com"])], { origins: [] });

    await expect(hasEnabledPermissions(getState())).resolves.toBe(false);
  });
});

describe("requestPermissionsFromAddresses", () => {
  it("recomputes hasPermissions from full state, not the granted subset", async () => {
    // Prior banner hidden; approving one site must not keep it hidden while
    // another enabled site is still ungranted.
    setState(undefined, {
      hasPermissions: true,
      websites: { list: [website("1", ["a.com"]), website("2", ["b.com"])] },
    });
    global.chrome = {
      permissions: {
        contains: containsFrom(["*://a.com/*"]), // b.com stays ungranted
        request: jest.fn().mockResolvedValue(true), // user approves a.com
      },
    };

    const granted = await requestPermissionsFromAddresses(["a.com"]);

    expect(granted).toBe(true);
    expect(getState().hasPermissions).toBe(false);
    expect(getState().unpermissionedWebsiteIds).toEqual(["2"]);
  });
});
