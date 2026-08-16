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

  it("reads the stored disabled flag", async () => {
    get.mockResolvedValue({ disabled: true });

    await expect(fromLocalStorage()).resolves.toEqual({ isDisabled: true });
  });

  // Read as `=== true`, which `background.js` mirrors with its own copy of this
  // key. Anything else stored under it leaves filtering on: a truthy read would
  // have a stray value turn the extension off with nothing to say why, and the
  // string "false" is the shape that would do it.
  it.each([
    ['the string "false"', "false"],
    ["a number", 1],
    ["null", null],
  ])("leaves filtering on for %s", async (_, value) => {
    get.mockResolvedValue({ disabled: value });

    await expect(fromLocalStorage()).resolves.toEqual({ isDisabled: false });
  });
});

describe("toLocalStorage", () => {
  it("writes when Filter Bubble is disabled", async () => {
    await fromLocalStorage();

    await toLocalStorage({ isDisabled: true });

    expect(set).toHaveBeenCalledWith({ disabled: true });
  });

  it("writes when Filter Bubble is re-enabled", async () => {
    get.mockResolvedValue({ disabled: true });
    await fromLocalStorage();

    await toLocalStorage({ isDisabled: false });

    expect(set).toHaveBeenCalledWith({ disabled: false });
  });

  it("does not write when the flag is unchanged", async () => {
    await fromLocalStorage();

    await toLocalStorage({ isDisabled: false });

    expect(set).not.toHaveBeenCalled();
  });
});
