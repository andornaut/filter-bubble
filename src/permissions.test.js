import { getState, setState } from "statezero/src";

import {
  checkWebsitePermissions,
  hasEnabledPermissions,
  requestPermissionsFromAddresses,
} from "./permissions";

const website = (id, addresses, enabled = true) => ({
  addresses,
  enabled,
  id,
  selectors: ["div"],
});

const seed = (list, getAll) => {
  // A prior value so that clearing to [] is an observable state change.
  setState(undefined, {
    unpermissionedWebsiteIds: ["stale"],
    websites: { list },
  });
  global.chrome = {
    permissions: { getAll: jest.fn().mockResolvedValue(getAll) },
  };
};

describe("checkWebsitePermissions", () => {
  it("flags enabled websites whose origins are not granted", async () => {
    seed([website("1", ["granted.com"]), website("2", ["missing.com"])], {
      origins: ["*://granted.com/*"],
    });

    await checkWebsitePermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual(["2"]);
  });

  it("does not flag disabled websites", async () => {
    seed([website("1", ["missing.com"], false)], { origins: [] });

    await checkWebsitePermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual([]);
  });

  it("flags nothing when a broad grant covers everything", async () => {
    seed([website("1", ["a.com"]), website("2", ["b.com"])], {
      origins: ["<all_urls>"],
    });

    await checkWebsitePermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual([]);
  });

  it("requires every address of a multi-address website to be granted", async () => {
    seed([website("1", ["a.com", "b.com"])], { origins: ["*://a.com/*"] });

    await checkWebsitePermissions(getState());

    expect(getState().unpermissionedWebsiteIds).toEqual(["1"]);
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

    await checkWebsitePermissions(getState());

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

    await expect(checkWebsitePermissions(getState())).resolves.toBeUndefined();
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
    // another configured site is still ungranted.
    setState(undefined, {
      hasPermissions: true,
      websites: { list: [website("1", ["a.com"]), website("2", ["b.com"])] },
    });
    global.chrome = {
      permissions: {
        contains: jest.fn().mockResolvedValue(false), // not all sites granted
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
