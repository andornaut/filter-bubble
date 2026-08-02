import { readFileSync } from "fs";
import { join } from "path";

const manifest = JSON.parse(
  readFileSync(join(__dirname, "manifest.json"), "utf8"),
);

describe("manifest", () => {
  it("opens the options page in a tab", () => {
    // src/index.js identifies the popup by `chrome.tabs.getCurrent()` returning
    // undefined, and opens the background port that forces highlight mode only
    // there. An embedded options view is a guest rather than a tab, so
    // `getCurrent()` returns undefined there too and the options page would be
    // taken for the popup, pinning highlight mode on every filtered page for as
    // long as it stays open.
    expect(manifest.options_ui.open_in_tab).toBe(true);
  });

  it("matches the packaged version", () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "package.json"), "utf8"),
    );
    expect(manifest.version).toBe(pkg.version);
  });
});
