import { fromLocalStorage, toLocalStorage } from "./settings";

const get = jest.fn();
const set = jest.fn(() => Promise.resolve());

beforeEach(() => {
  get.mockReset().mockResolvedValue({});
  set.mockReset().mockResolvedValue(undefined);
  global.chrome = { storage: { local: { get, set } } };
});

describe("fromLocalStorage", () => {
  it("defaults to enabled when the key is unset", async () => {
    await expect(fromLocalStorage()).resolves.toEqual({ isDisabled: false });
  });

  it("reads the stored master switch", async () => {
    get.mockResolvedValue({ disabled: true });

    await expect(fromLocalStorage()).resolves.toEqual({ isDisabled: true });
  });
});

describe("toLocalStorage", () => {
  it("writes when the master switch changes", async () => {
    await fromLocalStorage();

    await toLocalStorage({ isDisabled: true });

    expect(set).toHaveBeenCalledWith({ disabled: true });
  });

  it("writes when the master switch is turned back off", async () => {
    get.mockResolvedValue({ disabled: true });
    await fromLocalStorage();

    await toLocalStorage({ isDisabled: false });

    expect(set).toHaveBeenCalledWith({ disabled: false });
  });

  it("does not write when the master switch is unchanged", async () => {
    await fromLocalStorage();

    await toLocalStorage({ isDisabled: false });

    expect(set).not.toHaveBeenCalled();
  });
});
