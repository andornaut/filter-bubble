import { readFileSync } from "fs";
import { join } from "path";

// `matchesAddress` lives in background.js, which ships as a non-bundled service
// worker and therefore exports nothing. Read the helper from source and
// evaluate it so these tests exercise the actual shipped code.
const source = readFileSync(join(__dirname, "background.js"), "utf8");
const fnSource = source.match(/const matchesAddress = [\s\S]*?\n};/);
if (!fnSource) {
  throw new Error("Could not locate matchesAddress in background.js");
}
const matchesAddress = new Function(`${fnSource[0]}\nreturn matchesAddress;`)();

describe("matchesAddress", () => {
  // `url` is already lowercased and scheme-stripped by `matchedWebsite` before
  // it reaches `matchesAddress`, so these tests pass normalized values.
  describe("matches", () => {
    it.each([
      ["reddit.com", "reddit.com"], // exact
      ["reddit.com/r/all", "reddit.com"], // path separator
      ["reddit.com:8080", "reddit.com"], // port separator
      ["reddit.com?ref=1", "reddit.com"], // query separator
      ["reddit.com#section", "reddit.com"], // fragment separator
      ["news.ycombinator.com/item?id=1", "news.ycombinator.com"],
    ])("%s matches %s", (url, address) => {
      expect(matchesAddress(url, address)).toBe(true);
    });
  });

  describe("does not match", () => {
    it.each([
      ["reddit.companyx.com", "reddit.com"], // suffix without a boundary
      ["reddit.com.evil.example", "reddit.com"], // address as a left label
      ["notreddit.com", "reddit.com"], // not a prefix
      ["example.com", "reddit.com"], // unrelated
      ["", "reddit.com"], // empty url
    ])("%s does not match %s", (url, address) => {
      expect(matchesAddress(url, address)).toBe(false);
    });
  });
});
