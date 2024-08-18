/* eslint-disable max-classes-per-file */
(() => {
  if (window.filterBubble) {
    // Return a non-undefined value, so that the caller can detect successful execution.
    return { isFirstRun: false };
  }

  const CSS_BLOCK = 'filter-bubble';
  const CSS_HIDE_MODIFIER = 'filter-bubble--hide';
  const CSS_HIGHLIGHT_MODIFIER = 'filter-bubble--highlight';
  const CSS_REMOVE_MODIFIER = 'filter-bubble--remove';

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
    apply({ filterMode, pattern, selectors }) {
      let fn = highlight;
      if (filterMode === 'hide') {
        fn = hide;
      } else if (filterMode === 'remove') {
        fn = remove;
      }
      return this._find(new RegExp(pattern, 'i'), selectors, fn);
    }

    reset() {
      for (const el of document.querySelectorAll(`.${CSS_BLOCK}`)) {
        el.classList.remove(CSS_HIDE_MODIFIER, CSS_HIGHLIGHT_MODIFIER, CSS_REMOVE_MODIFIER);
      }
    }

    _find(regex, selectors, fn) {
      let count = 0;
      for (const selector of selectors) {
        let containers;
        try {
          containers = document.querySelectorAll(selector);
        } catch (containerError) {
          console.warn(`filter-bubble: Error applying selector "${selector}"`, containerError);
          continue;
        }
        count += Array.prototype.reduce.call(
          containers,
          (accumulator, container) => {
            // For the regex to work, we must match against each HTML element separately.
            for (const el of container.querySelectorAll('*')) {
              let matched = false;
              try {
                matched = regex.test(el.textContent);
              } catch (regexError) {
                console.warn(`filter-bubble: Error applying regular expression "${regex}"`, regexError);
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
      this.observer = new MutationObserver(this._changed.bind(this));
      this.pending = false;
      this.queued = false;
      this.state = {};
    }

    disable() {
      this.observer.disconnect();
      this.dom.reset();

      this._setCount(0);
      this.state = {};
    }

    enable(state) {
      if (!document.body) {
        // document.body can be null on the first onUpdated.status===loading event.
        // Try again in a bit.
        setTimeout(this.enable.bind(this, state), 100);
        return;
      }

      // Don't reset on duplicate calls for a single page load, where the state hasn't changed,
      // because we're only concerned with nodes being added/changed, not removed and so
      // a reset isn't necessary.
      if (JSON.stringify(this.state) === JSON.stringify(state)) {
        this._changed();
        return;
      }

      this.state = state; // { filterMode, pattern, selectors, tabId }
      this.observer.disconnect();
      this.dom.reset();
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
        mutations
        && mutations.filter(
          ({ attributeName, target, type }) =>
            !(type === 'attributes' && attributeName === 'class' && target.classList.contains(CSS_BLOCK)),
        ).length === 0
      ) {
        return;
      }

      // Don't update more often than once every 300ms.
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
      }, 300);
    }

    _setCount(newCount) {
      if (this.count !== newCount) {
        this.count = newCount;
        chrome.runtime.sendMessage({ command: 'count', data: { count: this.count, tabId: this.state.tabId } });
      }
    }
  }

  window.filterBubble = new FilterBubble(new DOM());

  chrome.runtime.onMessage.addListener(({ command, data }) => {
    switch (command) {
      case 'enable':
        window.filterBubble.enable(data);
        break;
      case 'disable':
        window.filterBubble.disable();
        break;
      default:
        throw new Error(`filter-bubble: Unknown command: ${command} `);
    }
  });
  return { isFirstRun: true };
})();
