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
      data: { count: 2 },
    });
  });

  it("counts an element matched by two selectors once", () => {
    document.body.innerHTML = `<div class="post thing">banana</div>`;
    enable({ selectors: [".post", ".thing"] });

    expect(sendMessage).toHaveBeenCalledWith({
      command: "count",
      data: { count: 1 },
    });
  });

  it("counts a filtered container and its filtered descendant once", () => {
    // Hiding the outer element already takes the inner one out of view, so the
    // pair is one filtered block to the reader.
    document.body.innerHTML = `
      <article class="post"><div class="thing">banana</div></article>`;
    enable({ selectors: [".post", ".thing"] });

    expect(document.querySelector(".thing").classList).toContain(
      "filter-bubble",
    );
    expect(sendMessage).toHaveBeenCalledWith({
      command: "count",
      data: { count: 1 },
    });
  });

  it("skips filtering when the pattern is empty", () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable({ pattern: "" });

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("tears down existing filters when the pattern becomes empty", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();
    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(true);
    sendMessage.mockClear();

    enable({ pattern: "" });

    expect(el.classList.contains("filter-bubble")).toBe(false);
    expect(el.classList.contains("filter-bubble--hide")).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith({
      command: "count",
      data: { count: 0 },
    });

    // The observer is disconnected too, so later content stays unfiltered.
    const added = document.createElement("div");
    added.className = "post";
    added.textContent = "more banana";
    document.body.appendChild(added);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(added.classList.contains("filter-bubble")).toBe(false);
  });

  it("tears down existing filters when the pattern will not compile", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();
    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(true);
    sendMessage.mockClear();

    enable({ pattern: "(unclosed" });

    expect(error).toHaveBeenCalled();
    expect(el.classList.contains("filter-bubble")).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith({
      command: "count",
      data: { count: 0 },
    });

    // The stale pattern must not keep filtering content added afterwards.
    const added = document.createElement("div");
    added.className = "post";
    added.textContent = "more banana";
    document.body.appendChild(added);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(added.classList.contains("filter-bubble")).toBe(false);
    error.mockRestore();
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

describe("FilterBubble failure recovery", () => {
  // `pending` is cleared only by the throttle timer, so a pass that threw
  // before arming it would leave the flag set and every later mutation would
  // return at the throttle guard: the tab stops being filtered for good.
  // The failure has to come from `_filterContent`: `_setCount` catches its own,
  // so injecting there would never reach the recovery this covers.
  const failingEnable = () => enable({ selectors: undefined });

  it("keeps filtering after a pass fails", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    document.body.innerHTML = `<div class="post">banana</div>`;
    // `selectors` is iterated without a guard, so this fails mid-pass, after
    // `pending` has been set and before the throttle timer is armed.
    failingEnable();

    // Long enough for that timer, if it was armed at all, to clear `pending`.
    await new Promise((resolve) => setTimeout(resolve, 250));
    enable();
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(document.querySelector(".post").classList).toContain(
      "filter-bubble",
    );

    consoleError.mockRestore();
  });

  // Badge counts are cosmetic, so a send that fails must not abort the pass
  // that already applied the filters.
  it("logs a synchronous sendMessage throw rather than failing the pass", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    sendMessage.mockImplementationOnce(() => {
      throw new Error("Extension context invalidated");
    });
    document.body.innerHTML = `<div class="post">banana</div>`;

    expect(() => enable()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector(".post").classList).toContain(
      "filter-bubble",
    );
    expect(consoleError).toHaveBeenCalledWith(
      "filter-bubble: sendMessage(count) failed:",
      expect.any(Error),
    );

    consoleError.mockRestore();
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
    // re-filter is queued and runs after the throttle interval elapses.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(added.classList.contains("filter-bubble")).toBe(true);
  });

  it("filters content when the page replaces document.body", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();

    const newBody = document.createElement("body");
    newBody.innerHTML = `<div class="post">more banana</div>`;
    document.body.replaceWith(newBody);

    await new Promise((resolve) => setTimeout(resolve, 250));

    const el = newBody.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(true);
  });

  it("keeps a filtered container filtered when its text stops matching", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(true);
    sendMessage.mockClear();

    // Filtering is sticky. A page that recycles this node for other content
    // leaves it hidden, which is the accepted trade: re-testing would release
    // any container that is transiently non-matching mid-update and show
    // content the user asked to hide. Only a full reset releases it.
    el.textContent = "something else entirely";
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(el.classList.contains("filter-bubble")).toBe(true);
    // Still filtered, so still counted.
    expect(sendMessage).not.toHaveBeenCalledWith({
      command: "count",
      data: { count: 0 },
    });
  });

  it("releases a stale filter on the next state change", async () => {
    // The escape hatch for the stickiness above: a pattern or selector change
    // resets every container and re-tests from scratch.
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();

    const el = document.querySelector(".post");
    el.textContent = "something else entirely";
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(el.classList.contains("filter-bubble")).toBe(true);

    enable({ pattern: toPattern("cherry") });

    expect(el.classList.contains("filter-bubble")).toBe(false);
  });

  it("re-applies filters on a duplicate enable() after the page strips classes", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();

    const el = document.querySelector(".post");
    // Attribute mutations are not observed; the duplicate enable() repairs them.
    el.className = "post";
    // Wait out the initial pass's throttle window first.
    await new Promise((resolve) => setTimeout(resolve, 250));
    enable();

    expect(el.classList.contains("filter-bubble")).toBe(true);
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

describe("FilterBubble injected before document.body exists", () => {
  // The content script is injected with `injectImmediately`, so it can run
  // before the parser has produced a body. The observer is on
  // `documentElement`, so the body arrives as an observed mutation.
  it("filters the body once the parser appends it", async () => {
    const body = document.body;
    body.remove();
    enable(); // Nothing to filter yet.

    body.innerHTML = `<div class="post">banana</div>`;
    document.documentElement.appendChild(body);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(true);
  });

  it("does not filter a body appended after disable()", async () => {
    const body = document.body;
    body.remove();
    enable();
    window.filterBubble.disable();

    body.innerHTML = `<div class="post">banana</div>`;
    document.documentElement.appendChild(body);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(false);
  });
});
