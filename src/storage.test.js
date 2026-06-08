import { fromStorage, toStorage } from "./storage";

const get = jest.fn();
const set = jest.fn(() => Promise.resolve());

beforeEach(() => {
  get.mockReset();
  set.mockReset();
  set.mockResolvedValue(undefined);
  global.chrome = { storage: { sync: { get, set } } };
});

describe("fromStorage", () => {
  it("returns the persisted state stored under the `state` key", async () => {
    const persisted = { topics: { list: [{ text: "spoilers" }] } };
    get.mockResolvedValue({ state: persisted });

    await expect(fromStorage()).resolves.toEqual(persisted);
    expect(get).toHaveBeenCalledWith(["state"]);
  });

  it("returns an empty object when nothing is stored", async () => {
    get.mockResolvedValue({});
    await expect(fromStorage()).resolves.toEqual({});
  });

  it("returns an empty object when get resolves a nullish value", async () => {
    get.mockResolvedValue(undefined);
    await expect(fromStorage()).resolves.toEqual({});
  });
});

describe("toStorage", () => {
  it("persists state under the `state` key", async () => {
    const state = { topics: { list: [] }, websites: { list: [] } };
    await toStorage(state);

    expect(set).toHaveBeenCalledWith({ state });
  });

  it("excludes transient `errors` and `hasPermissions` from persistence", async () => {
    await toStorage({
      errors: [{ message: "boom" }],
      hasPermissions: true,
      topics: { list: [] },
    });

    expect(set).toHaveBeenCalledWith({ state: { topics: { list: [] } } });
  });

  it("swallows and logs a rejected set (e.g. over quota) without throwing", async () => {
    const error = new Error("QUOTA_BYTES quota exceeded");
    set.mockRejectedValue(error);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(toStorage({ topics: { list: [] } })).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "filter-bubble: storage.sync.set() failed:",
      error,
    );

    consoleError.mockRestore();
  });
});
