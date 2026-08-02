import { existsSync, readFileSync } from "fs";
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

  // `build.mjs` copies `static/` to `dist/` and `src/browser/` to `dist/js/`,
  // so every path the manifest names maps back to exactly one source file.
  const toSource = (path) =>
    path.startsWith("js/")
      ? join(__dirname, "src/browser", path.replace(/^js\//, ""))
      : join(__dirname, "static", path);

  it("ships every file it references", () => {
    // Collected inside the test: at describe time a dropped key throws a bare
    // TypeError that collapses the whole file rather than failing here.
    const referenced = [
      manifest.action.default_popup,
      manifest.options_ui.page,
      manifest.background.service_worker,
      ...manifest.background.scripts,
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
    ];

    // The manifest is not validated against the build, so a renamed or moved
    // file leaves a reference that only fails once the extension is loaded.
    const missing = [...new Set(referenced)].filter(
      (path) => !existsSync(toSource(path)),
    );

    expect(missing).toEqual([]);
  });
});

describe("popup.html", () => {
  const html = readFileSync(join(__dirname, "static/popup.html"), "utf8");

  it("provides the container that src/index.js renders into", () => {
    // `createRoot(document.getElementById("root"))` throws on a null container,
    // so losing this element breaks every page the extension has, and the
    // entry-point tests build their own DOM rather than reading this file.
    expect(html).toContain('id="root"');
  });

  it("loads the bundle that build.mjs emits", () => {
    expect(html).toContain('src="popup.js"');
  });
});
