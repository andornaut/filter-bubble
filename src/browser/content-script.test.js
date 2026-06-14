import { readFileSync } from "fs";
import { join } from "path";

// content-script.js ships as a non-bundled IIFE and exports nothing. Load the
// source, mock the `chrome` global, and evaluate it against jsdom so these tests
// drive the real `window.filterBubble` instance the extension installs.
const source = readFileSync(join(__dirname, "content-script.js"), "utf8");

const sendMessage = jest.fn(() => Promise.resolve());

const toPattern = (word) => `(?:\\b${word}\\b)`;

beforeAll(() => {
  global.chrome = {
    runtime: { onMessage: { addListener: () => {} }, sendMessage },
  };
  new Function("chrome", source)(global.chrome);
});

beforeEach(() => {
  sendMessage.mockClear();
  document.body.innerHTML = "";
  // Reset the shared instance's state between tests.
  window.filterBubble.disable();
  sendMessage.mockClear();
});

const enable = (overrides = {}) =>
  window.filterBubble.enable({
    filterMode: "hide",
    pattern: toPattern("banana"),
    selectors: [".post"],
    tabId: 7,
    ...overrides,
  });

describe("FilterBubble.enable", () => {
  it("hides containers whose text matches the pattern", () => {
    document.body.innerHTML = `
      <div class="post">I love banana bread</div>
      <div class="post">nothing to see</div>`;
    enable();

    const [match, miss] = document.querySelectorAll(".post");
    expect(match.classList.contains("filter-bubble")).toBe(true);
    expect(match.classList.contains("filter-bubble--hide")).toBe(true);
    expect(miss.classList.contains("filter-bubble")).toBe(false);
  });

  it("applies the remove modifier in remove mode", () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable({ filterMode: "remove" });

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble--remove")).toBe(true);
  });

  it("applies the highlight modifier in highlight mode", () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable({ filterMode: "highlight" });

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble--highlight")).toBe(true);
  });

  it("reports the matched count to the background script", () => {
    document.body.innerHTML = `
      <div class="post">banana one</div>
      <div class="post">banana two</div>
      <div class="post">no match</div>`;
    enable();

    expect(sendMessage).toHaveBeenCalledWith({
      command: "count",
      data: { count: 2, tabId: 7 },
    });
  });

  it("skips filtering when the pattern is empty", () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable({ pattern: "" });

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("ignores an invalid selector and still applies valid ones", () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable({ selectors: ["::::bad", ".post"] });

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(true);
  });

  it("only matches whole words", () => {
    document.body.innerHTML = `<div class="post">bananabread</div>`;
    enable();

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(false);
  });
});

describe("FilterBubble re-filtering", () => {
  it("filters content added to the DOM after enable()", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();

    const added = document.createElement("div");
    added.className = "post";
    added.textContent = "more banana";
    document.body.appendChild(added);

    // The MutationObserver callback fires on a microtask, but the initial
    // enable() pass is still within its 200ms throttle window, so the
    // re-filter is queued and runs after the debounce elapses.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(added.classList.contains("filter-bubble")).toBe(true);
  });
});

describe("FilterBubble.disable", () => {
  it("removes all filter classes that were applied", () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();
    window.filterBubble.disable();

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(false);
    expect(el.classList.contains("filter-bubble--hide")).toBe(false);
  });
});
