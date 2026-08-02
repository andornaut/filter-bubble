import { readFileSync } from "fs";
import { join } from "path";

// `src/browser/*.js` ship unbundled, so they cannot import the modules that own
// these values and must restate them. Nothing at build or run time notices when
// a copy drifts: the background would simply read no items, match no URL, or
// miss the master switch, with no error anywhere. These tests are the only
// thing holding the copies together.

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

describe("content-script classes duplicated into the stylesheet", () => {
  const STYLESHEET = readFileSync(
    join(__dirname, "../../static/css/content-script.css"),
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

    expect(STYLESHEET).toContain(`.${className} {`);
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
