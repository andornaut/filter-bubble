(() => {
  if (window.filterBubble) {
    // Return a non-undefined value, so that the caller can detect successful execution.
    return { isInstalled: true };
  }

  // Configuration constants
  const BODY_MAX_RETRIES = 100; // Max attempts to wait for document.body
  const BODY_RETRY_DELAY_MS = 100; // Delay between retries (~10 seconds total)
  const THROTTLE_DELAY_MS = 200; // Throttle DOM updates to once per this interval

  // Cache the most recently compiled pattern. The pattern rarely changes within
  // a tab, so a single entry avoids recompiling on every enable() call without
  // letting the cache grow unbounded.
  let cachedPattern = null;
  let cachedRegex = null;

  const getOrCompileRegex = (pattern) => {
    if (pattern !== cachedPattern) {
      cachedRegex = new RegExp(pattern, "i");
      cachedPattern = pattern;
    }
    return cachedRegex;
  };

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

  class FilterBubble {
    constructor() {
      // This state is reset in `this.disable()`
      this.bodyRetryTimer = null;
      this.count = 0;
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
      this._cancelBodyRetry();
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

    enable(state, retries = 0) {
      // A new enable or disable supersedes any pending body retry, which would
      // otherwise fire later and re-apply the state it captured.
      this._cancelBodyRetry();
      if (!document.body) {
        // document.body can be null on the first onUpdated.status===loading event.
        // Try again in a bit, but give up after MAX_BODY_RETRIES attempts.
        if (retries < BODY_MAX_RETRIES) {
          this.bodyRetryTimer = setTimeout(
            this.enable.bind(this, state, retries + 1),
            BODY_RETRY_DELAY_MS,
          );
        } else {
          console.warn(
            "filter-bubble: document.body not found after max retries",
          );
        }
        return;
      }

      // Empty pattern would match everything - filter nothing. Tear down
      // rather than return: a bare return would leave filters from the
      // previous state applied and the observer running against it. Checked
      // before the duplicate-state comparison below, so that the branch never
      // has to hold a state whose pattern is empty.
      if (!state.pattern) {
        this.disable();
        return;
      }

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
        regex = getOrCompileRegex(state.pattern);
      } catch (e) {
        console.error("filter-bubble: Invalid regex pattern", state.pattern, e);
        // Tear down for the same reason as the empty pattern above: returning
        // would leave the previous state's filters applied and its observer
        // running, so the stale pattern would keep filtering new content.
        this.disable();
        return;
      }

      this.regex = regex;
      this.state = state;

      // The sequence disconnect, reset, observe avoids duplicate work
      this.observer.disconnect();
      this._removeFilters();
      // Observe node additions only, on `documentElement` so that a page
      // that replaces `document.body` wholesale stays covered. We
      // deliberately do NOT observe `attributes`: our filtering only toggles
      // classes, so watching attributes would make the observer re-trigger
      // on its own changes.
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      this._runFiltering();
    }

    _cancelBodyRetry() {
      clearTimeout(this.bodyRetryTimer);
      this.bodyRetryTimer = null;
    }

    _runFiltering() {
      // Throttle updates to once per THROTTLE_DELAY_MS.
      if (this.pending) {
        this.queued = true;
        return;
      }
      this.pending = true;
      this.queued = false;

      this._setCount(this._filterContent());
      this.throttleTimer = setTimeout(() => {
        this.pending = false;
        if (this.queued) {
          this._runFiltering();
        }
      }, THROTTLE_DELAY_MS);
    }

    _setCount(newCount) {
      if (this.count === newCount) {
        return;
      }
      this.count = newCount;
      chrome.runtime
        .sendMessage({
          command: "count",
          data: { count: this.count },
        })
        .catch((err) => {
          console.error("filter-bubble: sendMessage(count) failed:", err);
        });
    }

    _filterContent() {
      const { filterMode, selectors } = this.state;
      let fn = highlight;
      if (filterMode === "hide") {
        fn = hide;
      } else if (filterMode === "remove") {
        fn = remove;
      }

      let count = 0;
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
          if (container.classList.contains(CSS_BLOCK)) {
            count += 1;
            continue;
          }
          if (this.regex.test(container.textContent)) {
            fn(container);
            count += 1;
          }
        }
      }
      return count;
    }

    _removeFilters() {
      for (const el of document.querySelectorAll(`.${CSS_BLOCK}`)) {
        el.classList.remove(
          CSS_BLOCK,
          CSS_HIDE_MODIFIER,
          CSS_HIGHLIGHT_MODIFIER,
          CSS_REMOVE_MODIFIER,
        );
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
