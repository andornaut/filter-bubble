import { getState, setState } from "statezero/src";

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

const seed = (list, getAll, contains) => {
  // A prior value so that clearing to [] is an observable state change.
  setState(undefined, {
    hasPermissions: false,
    unpermissionedWebsiteIds: ["stale"],
    websites: { list },
  });
  global.chrome = {
    permissions: {
      contains: contains || jest.fn().mockResolvedValue(false),
      getAll: jest.fn().mockResolvedValue(getAll),
    },
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

  it("flags nothing when a broad grant covers everything", async () => {
    seed([website("1", ["a.com"]), website("2", ["b.com"])], {
      origins: ["<all_urls>"],
    });

    await checkAllPermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual([]);
    expect(getState().hasPermissions).toBe(true);
  });

  it("requires every address of a multi-address website to be granted", async () => {
    seed([website("1", ["a.com", "b.com"])], { origins: ["*://a.com/*"] });

    await checkAllPermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual(["1"]);
  });

  it("honors a broader-than-exact grant via contains()", async () => {
    // getAll() exact membership misses e.g. a `*://*.example.com/*` grant made
    // in the browser's own UI, so contains() must confirm before flagging.
    seed(
      [website("1", ["sub.example.com"])],
      { origins: ["*://*.example.com/*"] },
      jest.fn().mockResolvedValue(true),
    );

    await checkAllPermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual([]);
    expect(getState().hasPermissions).toBe(true);
  });

  it("falls back to per-website contains when getAll rejects", async () => {
    setState(undefined, {
      unpermissionedWebsiteIds: ["stale"],
      websites: { list: [website("1", ["a.com"]), website("2", ["b.com"])] },
    });
    global.chrome = {
      permissions: {
        contains: jest
          .fn()
          .mockImplementation(({ origins }) =>
            Promise.resolve(origins[0] === "*://a.com/*"),
          ),
        getAll: jest.fn().mockRejectedValue(new Error("boom")),
      },
    };

    await checkAllPermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual(["2"]);
  });

  it("logs and does not throw when both getAll and contains fail", async () => {
    setState(undefined, { websites: { list: [website("1", ["a.com"])] } });
    global.chrome = {
      permissions: {
        contains: jest.fn().mockRejectedValue(new Error("boom")),
        getAll: jest.fn().mockRejectedValue(new Error("boom")),
      },
    };
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(checkAllPermissions(getState())).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();

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
        contains: jest.fn().mockResolvedValue(false), // b.com stays ungranted
        getAll: jest.fn().mockResolvedValue({ origins: ["*://a.com/*"] }),
        request: jest.fn().mockResolvedValue(true), // user approves a.com
      },
    };

    const granted = await requestPermissionsFromAddresses(["a.com"]);

    expect(granted).toBe(true);
    expect(getState().hasPermissions).toBe(false);
    expect(getState().unpermissionedWebsiteIds).toEqual(["2"]);
  });
});
