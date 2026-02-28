(() => {
  if (window.filterBubble) {
    // Return a non-undefined value, so that the caller can detect successful execution.
    return { isFirstRun: false };
  }

  // Configuration constants
  const BODY_MAX_RETRIES = 100; // Max attempts to wait for document.body
  const BODY_RETRY_DELAY_MS = 100; // Delay between retries (~10 seconds total)
  const DEBOUNCE_DELAY_MS = 300; // Throttle DOM updates to once per this interval

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

  class DOM {
    apply({ filterMode, regex, selectors }) {
      let fn = highlight;
      if (filterMode === "hide") {
        fn = hide;
      } else if (filterMode === "remove") {
        fn = remove;
      }
      return this._find(regex, selectors, fn);
    }

    reset() {
      for (const el of document.querySelectorAll(`.${CSS_BLOCK}`)) {
        el.classList.remove(
          CSS_BLOCK,
          CSS_HIDE_MODIFIER,
          CSS_HIGHLIGHT_MODIFIER,
          CSS_REMOVE_MODIFIER,
        );
      }
    }

    _find(regex, selectors, fn) {
      let count = 0;
      for (const selector of selectors) {
        let containers;
        try {
          containers = document.querySelectorAll(selector);
        } catch (containerError) {
          console.warn(
            `filter-bubble: Error applying selector "${selector}"`,
            containerError,
          );
          continue;
        }
        count += Array.prototype.reduce.call(
          containers,
          (accumulator, container) => {
            // For the regex to work, we must match against each HTML element separately.
            // Skip script, style, and noscript elements as they don't contain visible text.
            for (const el of container.querySelectorAll(
              "*:not(script):not(style):not(noscript)",
            )) {
              let matched = false;
              try {
                matched = regex.test(el.textContent);
              } catch (regexError) {
                console.warn(
                  `filter-bubble: Error applying regular expression "${regex}"`,
                  regexError,
                );
                break;
              }
              if (matched) {
                fn(container);
                accumulator += 1;
                break;
              }
            }
            return accumulator;
          },
          0,
        );
      }
      return count;
    }
  }

  class FilterBubble {
    constructor(dom) {
      this.count = 0;
      this.dom = dom;
      this.observer = new MutationObserver(this._safeChanged.bind(this));
      this.pending = false;
      this.queued = false;
      this.state = {};
      this._unloadHandler = null;
    }

    disable() {
      this.observer.disconnect();
      this.dom.reset();
      this._removeUnloadHandler();

      this._setCount(0);
      this.state = {};
    }

    _addUnloadHandler() {
      if (!this._unloadHandler) {
        this._unloadHandler = () => this.disable();
        window.addEventListener("unload", this._unloadHandler);
      }
    }

    _removeUnloadHandler() {
      if (this._unloadHandler) {
        window.removeEventListener("unload", this._unloadHandler);
        this._unloadHandler = null;
      }
    }

    _safeChanged(mutations) {
      try {
        this._changed(mutations);
      } catch (error) {
        console.error("filter-bubble: MutationObserver error", error);
      }
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
        }
        return;
      }

      // Don't reset on duplicate calls for a single page load, where the state hasn't changed,
      // because we're only concerned with nodes being added/changed, not removed and so
      // a reset isn't necessary.
      if (JSON.stringify(this.state) === JSON.stringify(state)) {
        this._changed();
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

      this.state = { ...state, regex };
      this.observer.disconnect();
      this.dom.reset();
      this._addUnloadHandler();
      this.observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      this._changed();
    }

    _changed(mutations) {
      // Ignore mutations that we caused.
      // n.b. mutations is null when queued or when called from this.enabled()
      if (
        mutations &&
        mutations.filter(
          ({ attributeName, target, type }) =>
            !(
              type === "attributes" &&
              attributeName === "class" &&
              target.classList.contains(CSS_BLOCK)
            ),
        ).length === 0
      ) {
        return;
      }

      // Throttle updates to once per DEBOUNCE_DELAY_MS.
      if (this.pending) {
        this.queued = true;
        return;
      }
      this.pending = true;
      this.queued = false;

      this._setCount(this.dom.apply(this.state));
      setTimeout(() => {
        this.pending = false;
        if (this.queued) {
          this._changed();
        }
      }, DEBOUNCE_DELAY_MS);
    }

    _setCount(newCount) {
      if (this.count !== newCount) {
        this.count = newCount;
        chrome.runtime.sendMessage({
          command: "count",
          data: { count: this.count, tabId: this.state.tabId },
        });
      }
    }
  }

  window.filterBubble = new FilterBubble(new DOM());

  chrome.runtime.onMessage.addListener(({ command, data }) => {
    switch (command) {
      case "enable":
        window.filterBubble.enable(data);
        break;
      case "disable":
        window.filterBubble.disable();
        break;
      default:
        throw new Error(`filter-bubble: Unknown command: ${command} `);
    }
  });
  return { isFirstRun: true };
})();
