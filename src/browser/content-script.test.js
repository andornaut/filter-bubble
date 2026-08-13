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

  // Sync and import can deliver a website with no selectors at all.
  it("filters nothing for a website with no selectors, and still filters later", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable({ selectors: [] });

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith({
      command: "count",
      data: { count: 0 },
    });

    // A selector arriving afterwards filters, so the empty one left the
    // instance usable. Wait out the first pass's throttle window, which the
    // second pass is otherwise queued behind.
    await new Promise((resolve) => setTimeout(resolve, 250));
    enable();

    expect(el.classList.contains("filter-bubble")).toBe(true);
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

  // Real feeds attach JSON-LD to every item, so a keyword list nobody can see
  // would otherwise decide what gets hidden.
  it("ignores text inside script and style elements", () => {
    document.body.innerHTML = `
      <div class="post">
        <script type="application/ld+json">{"keywords":"banana"}</script>
        <style>.banana { color: red; }</style>
        <p>nothing to see</p>
      </div>`;
    enable();

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(false);
  });

  it("still matches the visible text of a container that holds a script", () => {
    document.body.innerHTML = `
      <div class="post">
        <script type="application/ld+json">{"keywords":"apple"}</script>
        <p>I love banana bread</p>
      </div>`;
    enable();

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(true);
  });

  // The browser hides `<noscript>` from everyone who is running scripts, which
  // is everyone the content script is running for.
  it("ignores the fallback text meant for a browser without JavaScript", () => {
    document.body.innerHTML = `
      <div class="post">
        <noscript>Turn on JavaScript to read about banana futures</noscript>
        <p>nothing to see</p>
      </div>`;
    enable();

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(false);
  });

  it("matches across the elements a container's text is split over", () => {
    document.body.innerHTML = `
      <div class="post">I love <em>banana</em> bread</div>`;
    enable();

    const el = document.querySelector(".post");
    expect(el.classList.contains("filter-bubble")).toBe(true);
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

  // The state is committed only once the observer is attached. Committed
  // first, a failure to attach would leave the next `enable` carrying the same
  // state on the duplicate-state path, and the tab would filter its current
  // content and then never see anything added to it.
  it("retries the reset when attaching the observer fails", async () => {
    const observe = jest
      .spyOn(window.filterBubble.observer, "observe")
      .mockImplementationOnce(() => {
        throw new Error("no documentElement");
      });
    document.body.innerHTML = `<div class="post">banana</div>`;

    expect(() => enable()).toThrow();
    enable();

    const added = document.createElement("div");
    added.className = "post";
    added.textContent = "more banana";
    document.body.appendChild(added);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(document.querySelector(".post").classList).toContain(
      "filter-bubble",
    );
    expect(added.classList.contains("filter-bubble")).toBe(true);
    observe.mockRestore();
  });

  // The reset holds no state while it runs, so the retry does not depend on
  // which state the next `enable` carries. A failed attach that left the
  // previous state in place would send a repeat of it down the duplicate-state
  // path, against an instance whose observer is disconnected.
  it("retries the reset when the state repeated after a failed attach is the previous one", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();
    const observe = jest
      .spyOn(window.filterBubble.observer, "observe")
      .mockImplementationOnce(() => {
        throw new Error("no documentElement");
      });

    expect(() => enable({ pattern: toPattern("cherry") })).toThrow();
    // Wait out the first pass's throttle window before the retry: a pass still
    // queued behind it would filter the node appended below on its own, with or
    // without an observer attached, and the case would prove nothing.
    await new Promise((resolve) => setTimeout(resolve, 250));
    enable();

    const added = document.createElement("div");
    added.className = "post";
    added.textContent = "more banana";
    document.body.appendChild(added);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(added.classList.contains("filter-bubble")).toBe(true);
    observe.mockRestore();
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

    // Filtering is sticky: re-testing would release any container that is
    // transiently non-matching mid-update and show content the user asked to
    // hide. The cost is that a recycled node stays hidden until a full reset.
    el.textContent = "something else entirely";
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(el.classList.contains("filter-bubble")).toBe(true);
    // Still filtered, so the badge does not drop to zero.
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

  it("keeps up with more mutations than the throttle can service", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();

    // More appends than the 200ms throttle runs passes for: the trailing pass
    // has to catch whatever the throttled ones missed.
    for (let i = 0; i < 25; i += 1) {
      const added = document.createElement("div");
      added.className = "post";
      added.textContent = `banana ${i}`;
      document.body.appendChild(added);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(document.querySelectorAll(".post.filter-bubble")).toHaveLength(26);
    expect(sendMessage).toHaveBeenCalledWith({
      command: "count",
      data: { count: 26 },
    });
  });

  // Every tab event re-sends `enable` carrying the state the tab already has.
  // Those repeats re-run filtering and nothing else, so an item whose text has
  // since stopped matching stays hidden rather than reappearing when the user
  // switches tabs.
  it("does not release a filtered item when the same state is re-sent", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    const state = {
      filterMode: "hide",
      pattern: toPattern("banana"),
      selectors: [".post"],
    };
    window.filterBubble.enable(state);
    const el = document.querySelector(".post");
    el.textContent = "something else entirely";
    await new Promise((resolve) => setTimeout(resolve, 250));

    // A distinct object with the same keys in the same order, which is what
    // the background builds for every repeat.
    window.filterBubble.enable({ ...state });

    expect(el.classList.contains("filter-bubble")).toBe(true);
  });

  // The comparison is of the serialized payload, so the sender has to keep its
  // key order stable: this is what a reordered one would do to every repeat.
  it("treats a reordered payload as a change and releases the item", async () => {
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();
    const el = document.querySelector(".post");
    el.textContent = "something else entirely";
    await new Promise((resolve) => setTimeout(resolve, 250));

    window.filterBubble.enable({
      pattern: toPattern("banana"),
      selectors: [".post"],
      filterMode: "hide",
    });

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

describe("FilterBubble badge reporting", () => {
  // Replace the shared instance with a freshly installed one, which is what
  // every new document gets. `beforeEach` has already disabled the outgoing
  // instance, so it holds no filters and observes nothing.
  const reinstall = () => {
    delete window.filterBubble;
    new Function("chrome", source)(global.chrome);
    sendMessage.mockClear();
  };

  // A tab-scoped badge outlives the document it was set for, so a page that
  // matches nothing has to report a zero rather than assume the badge is clear,
  // or the previous page's count stays on the tab.
  it("reports a zero count on the first pass of a new document", () => {
    reinstall();
    document.body.innerHTML = `<div class="post">nothing to see</div>`;

    enable();

    expect(sendMessage).toHaveBeenCalledWith({
      command: "count",
      data: { count: 0 },
    });
  });

  // The background clears the badge of any tab it evaluates as unmatched, and a
  // bfcache restore hands this same instance back afterwards with its count
  // intact, so a repeat `enable` that finds the same count still has to report
  // it: the page is filtered but the badge is empty until it does.
  it("re-reports an unchanged count on a repeat enable", async () => {
    reinstall();
    document.body.innerHTML = `<div class="post">banana</div>`;
    enable();
    // Wait out the first pass's throttle window, so the repeat pass is not
    // merely queued behind it.
    await new Promise((resolve) => setTimeout(resolve, 250));
    sendMessage.mockClear();

    enable();

    expect(sendMessage).toHaveBeenCalledWith({
      command: "count",
      data: { count: 1 },
    });
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
