(() => {
  if (window.filterBubble) {
    // Return a non-undefined value, so that the caller can detect successful execution.
    return { isInstalled: true };
  }

  const THROTTLE_DELAY_MS = 200; // Throttle DOM updates to once per this interval

  // CSS class constants
  const CSS_BLOCK = "filter-bubble";
  const CSS_HIDE_MODIFIER = "filter-bubble--hide";
  const CSS_HIGHLIGHT_MODIFIER = "filter-bubble--highlight";
  const CSS_REMOVE_MODIFIER = "filter-bubble--remove";

  const hide = (el) => {
    el.classList.add(CSS_BLOCK, CSS_HIDE_MODIFIER);
  };
  const highlight = (el) => {
    el.classList.add(CSS_BLOCK, CSS_HIGHLIGHT_MODIFIER);
  };
  const remove = (el) => {
    el.classList.add(CSS_BLOCK, CSS_REMOVE_MODIFIER);
  };
  const unfilter = (el) => {
    el.classList.remove(
      CSS_BLOCK,
      CSS_HIDE_MODIFIER,
      CSS_HIGHLIGHT_MODIFIER,
      CSS_REMOVE_MODIFIER,
    );
  };

  // Count only the outermost filtered elements. Overlapping selectors can match
  // both a container and something inside it (e.g. "article" and ".thing"), but
  // hiding the outer one already takes the inner one out of view, so the pair is
  // one filtered block to the reader and must count as one on the badge.
  const countOutermost = (elements) => {
    let count = 0;
    for (const el of elements) {
      let ancestor = el.parentElement;
      while (ancestor && !elements.has(ancestor)) {
        ancestor = ancestor.parentElement;
      }
      if (!ancestor) {
        count += 1;
      }
    }
    return count;
  };

  class FilterBubble {
    constructor() {
      // This state is reset in `this.disable()`, which reports a count of 0
      // rather than restoring the `null` below.
      //
      // `null` is "nothing reported yet", which is not the same as a count of
      // 0: a badge the previous document left in this tab is still on it. See
      // `enable()`.
      this.count = null;
      this.pending = false;
      this.queued = false;
      this.regex = null;
      this.state = {};
      this.throttleTimer = null;

      // Re-filter on any observed mutation. See the observe() config in
      // enable() for why no observed mutation is ever self-caused.
      this.observer = new MutationObserver(() => this._runFiltering());
    }

    disable() {
      // Cancel the throttle timer along with resetting `pending`: left alone,
      // it would fire after a subsequent enable() and clear `pending` early,
      // defeating the throttle.
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
      this.observer.disconnect();
      this._removeFilters();

      this._setCount(0);
      this.pending = false;
      this.queued = false;
      this.regex = null;
      this.state = {};
    }

    enable(state) {
      // Empty pattern would match everything - filter nothing. Tear down
      // rather than return: a bare return would leave filters from the
      // previous state applied and the observer running against it. Checked
      // before the duplicate-state comparison below, so that the branch never
      // has to hold a state whose pattern is empty.
      if (!state.pattern) {
        this.disable();
        return;
      }

      // Re-report the count for every `enable`, by dropping the cached value
      // the send is deduplicated against. The background clears the tab's badge
      // whenever it evaluates the tab as unmatched, and a bfcache restore hands
      // this same instance back afterwards with its count intact, so a cached
      // count is no evidence of what the badge currently reads.
      this.count = null;

      // Duplicate calls, where the state hasn't changed, skip the reset and
      // re-observe below, but still re-run filtering: the observer misses
      // characterData and attribute mutations (e.g. the page rewriting
      // `className` and stripping the filter classes), so these calls are the
      // repair path for them.
      //
      // Serialized comparison, so key order matters: the sender must build the
      // payload with a stable key order (see the `enable` message in
      // background.js). A reordered payload compares unequal and downgrades
      // every repeat call to a full reset instead of this repair path.
      if (JSON.stringify(this.state) === JSON.stringify(state)) {
        this._runFiltering();
        return;
      }

      let regex;
      try {
        regex = new RegExp(state.pattern, "i");
      } catch (e) {
        console.error("filter-bubble: Invalid regex pattern", state.pattern, e);
        // Tear down for the same reason as the empty pattern above: returning
        // would leave the previous state's filters applied and its observer
        // running, so the stale pattern would keep filtering new content.
        this.disable();
        return;
      }

      // Hold no state for the length of the reset below, and commit the new
      // state only once the observer is attached. A throw anywhere in between
      // then leaves an instance that matches no state at all, so the next
      // `enable` compares unequal whichever state it carries and retries the
      // reset in full. Holding either state across it would have some `enable`
      // take the duplicate-state path against an instance whose observer is
      // disconnected, leaving the tab filtered once and never again.
      this.regex = null;
      this.state = {};

      // The sequence disconnect, reset, observe avoids duplicate work
      this.observer.disconnect();
      this._removeFilters();
      // Observe node additions only, on `documentElement` so that a page that
      // replaces `document.body` wholesale stays covered, and so that an
      // injection that beat the parser to `document.body` filters that body as
      // soon as it is appended. We deliberately do NOT observe `attributes`:
      // our filtering only toggles classes, so watching attributes would make
      // the observer re-trigger on its own changes.
      //
      // Observe before filtering, so a node added between the two is not
      // missed.
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      this.regex = regex;
      this.state = state;

      this._runFiltering();
    }

    _runFiltering() {
      // Throttle updates to once per THROTTLE_DELAY_MS.
      if (this.pending) {
        this.queued = true;
        return;
      }
      this.pending = true;
      this.queued = false;

      try {
        this._setCount(this._filterContent());
      } catch (error) {
        // Caught rather than left to propagate: this runs from a
        // MutationObserver callback and from the message listener, neither of
        // which can do anything useful with it, and the timer below has to be
        // armed either way.
        console.error("filter-bubble: filtering pass failed", error);
      }

      // Arm the timer even when the pass failed. `pending` is cleared nowhere
      // else, so skipping this would leave it set for good, and every later
      // mutation would return at the guard above: the tab would stop being
      // filtered entirely until a `disable` arrived.
      this.throttleTimer = setTimeout(() => {
        this.pending = false;
        if (this.queued) {
          this._runFiltering();
        }
      }, THROTTLE_DELAY_MS);
    }

    // `try` rather than a chained `.catch()`: `chrome.runtime` raises
    // synchronously once the extension context is invalidated (an update or
    // reload while the page is open), and a `.catch()` is attached to the
    // promise the call returns, so it is never in place to see a throw from the
    // call itself. Badge counts are cosmetic, so this must not take a filtering
    // pass down with it.
    async _setCount(newCount) {
      if (this.count === newCount) {
        return;
      }
      // Commit before the send, not after: `this.count` has to be up to date for
      // the guard above by the time this returns, because a second call can
      // follow synchronously (`disable()` sends 0 right after a pass sent its
      // own count) and would otherwise compare against the stale value.
      this.count = newCount;
      try {
        await chrome.runtime.sendMessage({
          command: "count",
          data: { count: newCount },
        });
      } catch (err) {
        console.error("filter-bubble: sendMessage(count) failed:", err);
      }
    }

    _filterContent() {
      const { filterMode, selectors } = this.state;
      let fn = highlight;
      if (filterMode === "hide") {
        fn = hide;
      } else if (filterMode === "remove") {
        fn = remove;
      }

      // Collect into a Set so an element matched by more than one selector is
      // filtered and counted once: the badge reports filtered elements, not
      // selector hits.
      const matched = new Set();
      for (const selector of selectors) {
        let containers;
        try {
          containers = document.querySelectorAll(selector);
        } catch (error) {
          console.warn(
            `filter-bubble: Error applying selector "${selector}"`,
            error,
          );
          continue;
        }
        for (const container of containers) {
          if (matched.has(container)) {
            continue;
          }
          // Filtering is sticky: an already-filtered container is counted and
          // skipped rather than re-tested, and only a full reset (a pattern or
          // selector change) releases it. Re-testing would decide from one
          // synchronous `textContent` read with no way to know the DOM has
          // settled, so a container that is transiently non-matching mid-update
          // would be revealed. Over-hiding is the lesser failure here.
          if (container.classList.contains(CSS_BLOCK)) {
            matched.add(container);
            continue;
          }
          if (this.regex.test(container.textContent)) {
            fn(container);
            matched.add(container);
          }
        }
      }
      return countOutermost(matched);
    }

    _removeFilters() {
      for (const el of document.querySelectorAll(`.${CSS_BLOCK}`)) {
        unfilter(el);
      }
    }
  }

  window.filterBubble = new FilterBubble();

  chrome.runtime.onMessage.addListener(({ command, data }) => {
    switch (command) {
      case "enable":
        window.filterBubble.enable(data);
        break;
      case "disable":
        window.filterBubble.disable();
        break;
      default:
        console.error(`filter-bubble: Unknown command: ${command}`);
    }
  });
  return { isInstalled: false };
})();
