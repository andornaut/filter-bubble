import { getState, setState } from "statezero/src";

import { hydrateSettings, toggleDisabled } from "./settings";

describe("hydrateSettings", () => {
  it("stores the disabled flag as a boolean", () => {
    hydrateSettings({ isDisabled: true });
    expect(getState("isDisabled")).toBe(true);

    hydrateSettings({});
    expect(getState("isDisabled")).toBe(false);
  });
});

describe("toggleDisabled", () => {
  it("flips the disabled flag", () => {
    setState("isDisabled", false);

    toggleDisabled();
    expect(getState("isDisabled")).toBe(true);

    toggleDisabled();
    expect(getState("isDisabled")).toBe(false);
  });
});
