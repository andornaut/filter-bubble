(() => {
  if (window.filterBubble) {
    // Return a non-undefined value, so that the caller can detect successful execution.
    return { isInstalled: true };
  }

  // Configuration constants
  const BODY_MAX_RETRIES = 100; // Max attempts to wait for document.body
  const BODY_RETRY_DELAY_MS = 100; // Delay between retries (~10 seconds total)
  const DEBOUNCE_DELAY_MS = 200; // Throttle DOM updates to once per this interval

  // Regex cache to avoid recompiling the same pattern within a tab
  const regexCache = new Map();

  const getOrCompileRegex = (pattern) => {
    let regex = regexCache.get(pattern);
    if (!regex) {
      regex = new RegExp(pattern, "i");
      regexCache.set(pattern, regex);
    }
    return regex;
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
      this.count = 0;
      this.pending = false;
      this.queued = false;
      this.regex = null;
      this.state = {};

      this.observer = new MutationObserver(this._onMutation.bind(this));
    }

    disable() {
      this.observer.disconnect();
      this._removeFilters();

      this._setCount(0);
      this.pending = false;
      this.queued = false;
      this.regex = null;
      this.state = {};
    }

    enable(state, retries = 0) {
      if (!document.body) {
        // document.body can be null on the first onUpdated.status===loading event.
        // Try again in a bit, but give up after MAX_BODY_RETRIES attempts.
        if (retries < BODY_MAX_RETRIES) {
          setTimeout(
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

      // Don't reset on duplicate calls for a single page load, where the state hasn't changed,
      // because we're only concerned with nodes being added/changed, not removed and so
      // a reset isn't necessary.
      if (JSON.stringify(this.state) === JSON.stringify(state)) {
        this._runFiltering();
        return;
      }

      // Empty pattern would match everything - skip filtering
      if (!state.pattern) {
        return;
      }

      let regex;
      try {
        regex = getOrCompileRegex(state.pattern);
      } catch (e) {
        console.error("filter-bubble: Invalid regex pattern", state.pattern, e);
        return;
      }

      this.regex = regex;
      this.state = state;

      // The sequence disconnect, reset, observe avoids duplicate work
      this.observer.disconnect();
      this._removeFilters();
      this.observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      this._runFiltering();
    }

    _onMutation(mutations) {
      // Ignore mutations that we caused. Use `some()` to short-circuit on first external mutation.
      const hasExternalMutation = mutations.some(
        ({ attributeName, target, type }) =>
          !(
            type === "attributes" &&
            attributeName === "class" &&
            target.classList.contains(CSS_BLOCK)
          ),
      );
      if (hasExternalMutation) {
        this._runFiltering();
      }
    }

    _runFiltering() {
      // Throttle updates to once per DEBOUNCE_DELAY_MS.
      if (this.pending) {
        this.queued = true;
        return;
      }
      this.pending = true;
      this.queued = false;

      this._setCount(this._filterContent());
      setTimeout(() => {
        this.pending = false;
        if (this.queued) {
          this._runFiltering();
        }
      }, DEBOUNCE_DELAY_MS);
    }

    _setCount(newCount) {
      if (this.count === newCount) {
        return;
      }
      this.count = newCount;
      chrome.runtime
        .sendMessage({
          command: "count",
          data: { count: this.count, tabId: this.state.tabId },
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
