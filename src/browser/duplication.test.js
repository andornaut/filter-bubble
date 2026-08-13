import { readFileSync } from "fs";
import { join } from "path";

// `src/browser/*.js` ship unbundled, so they cannot import the modules that own
// these values and must restate them. Nothing at build or run time notices when
// a copy drifts: the background would read no items, match no URL, or miss the
// disabled flag, with no error anywhere. Nothing else keeps the copies in step.

const source = (path) => readFileSync(join(__dirname, path), "utf8");

const BACKGROUND = source("background.js");
const CONTENT_SCRIPT = source("content-script.js");

// Pull `const NAME = <literal>;` out of a source file as raw text, so the
// comparison is of what is written rather than of what it evaluates to.
const constant = (src, name) => {
  const match = src.match(
    new RegExp(`(?:export )?const ${name} = (.+?);$`, "m"),
  );
  if (!match) {
    throw new Error(`Could not find "const ${name}" to compare`);
  }
  return match[1];
};

describe("constants duplicated into the unbundled browser scripts", () => {
  it.each([
    ["SCHEME_REGEX", "../validation.js"],
    ["TOPIC_PREFIX", "../storage.js"],
    ["WEBSITE_PREFIX", "../storage.js"],
    ["DISABLED_KEY", "../settings.js"],
  ])("background.js keeps %s in step with %s", (name, owner) => {
    expect(constant(BACKGROUND, name)).toBe(constant(source(owner), name));
  });
});

// `build.mjs` copies `static/` to `dist/` and `src/browser/` to `dist/js/`, so
// a runtime path in background.js maps back to exactly one source file.
const toSource = (runtimePath) =>
  runtimePath.startsWith("/js/")
    ? join(__dirname, runtimePath.replace("/js/", "./"))
    : join(__dirname, "../../static", runtimePath);

describe("runtime asset paths in background.js", () => {
  // These encode build.mjs's output layout. A mistyped stylesheet path renders
  // filtered pages unstyled with only a console log; a mistyped content-script
  // path fails `executeScript` and reports a misleading missing-permission
  // error. Neither fails the build.
  it.each([["CONTENT_SCRIPT_PATH"], ["STYLESHEET_PATH"]])(
    "%s resolves to a file that ships",
    (name) => {
      const path = JSON.parse(constant(BACKGROUND, name));

      expect(() => readFileSync(toSource(path), "utf8")).not.toThrow();
    },
  );

  // The toolbar icons are named only here, so manifest.test.js's
  // ships-every-file check does not reach them. A missing one leaves the
  // browser showing its own fallback icon with only a console log.
  it("names icon files that ship", () => {
    const paths = [...new Set(BACKGROUND.match(/"\/icons\/[^"]+"/g) || [])];

    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((path) => {
      expect(() => readFileSync(toSource(JSON.parse(path)))).not.toThrow();
    });
  });
});

describe("toolbar title duplicated into background.js", () => {
  // Re-enabling Filter Bubble restores this title rather than clearing the
  // override, so a manifest that says something else would leave the button
  // permanently labelled with the stale copy here.
  it("keeps DEFAULT_TITLE in step with the manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, "../../manifest.json"), "utf8"),
    );

    expect(JSON.parse(constant(BACKGROUND, "DEFAULT_TITLE"))).toBe(
      manifest.action.default_title,
    );
  });
});

describe("content-script classes duplicated into the stylesheet", () => {
  // Read through the same constant the background injects, so a rename of the
  // stylesheet is caught here rather than silently going unstyled. Read lazily:
  // at module scope an unresolvable path collapses the whole file instead of
  // failing the assertions that name the problem.
  const stylesheet = () =>
    readFileSync(
      toSource(JSON.parse(constant(BACKGROUND, "STYLESHEET_PATH"))),
      "utf8",
    );

  // The block class is only a marker that `_removeFilters` selects on, so it
  // needs no rule of its own; every modifier is what actually hides content.
  it.each([
    ["CSS_HIDE_MODIFIER"],
    ["CSS_HIGHLIGHT_MODIFIER"],
    ["CSS_REMOVE_MODIFIER"],
  ])("%s has a rule in content-script.css", (name) => {
    const className = JSON.parse(constant(CONTENT_SCRIPT, name));

    expect(stylesheet()).toContain(`.${className} {`);
  });

  it("derives every modifier from the block class", () => {
    const block = JSON.parse(constant(CONTENT_SCRIPT, "CSS_BLOCK"));

    ["CSS_HIDE_MODIFIER", "CSS_HIGHLIGHT_MODIFIER", "CSS_REMOVE_MODIFIER"]
      .map((name) => JSON.parse(constant(CONTENT_SCRIPT, name)))
      .forEach((modifier) =>
        expect(modifier.startsWith(`${block}--`)).toBe(true),
      );
  });
});

describe("messages exchanged between the background and the content script", () => {
  // The two scripts agree only by convention: an unrecognised command logs and
  // is dropped, so a rename on one side stops all filtering silently.
  it.each([["enable"], ["disable"]])(
    "the content script handles the %s command the background sends",
    (command) => {
      expect(BACKGROUND).toContain(`command: "${command}"`);
      expect(CONTENT_SCRIPT).toContain(`case "${command}":`);
    },
  );

  it("the background handles the count command the content script sends", () => {
    expect(CONTENT_SCRIPT).toContain('command: "count"');
    expect(BACKGROUND).toContain('command === "count"');
  });
});
