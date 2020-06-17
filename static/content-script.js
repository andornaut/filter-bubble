(() => {
  if (window.filterBubble) {
    // Return a non-undefined value, so that the caller can detect successful execution.
    return { isFirstRun: false };
  }

  const CSS_HIDE_CLASS = 'filter-bubble--hide';
  const CSS_REMOVE_CLASS = 'filter-bubble--remove';
  const CSS_HIGHLIGHT_CLASS = 'filter-bubble--highlight';

  const find = (regex, selectors, fn) => {
    let count = 0;
    for (const selector of selectors) {
      let containers;
      try {
        containers = document.querySelectorAll(selector);
      } catch (containerError) {
        console.warn(`filter-bubble: Error applying selector "${selector}"`, containerError);
        continue;
      }
      containers.forEach((container) => {
        // For the regex to work, we must match against each HTML element separately.
        for (const el of container.querySelectorAll('*')) {
          let matched = false;
          try {
            matched = regex.test(el.textContent);
          } catch (regexError) {
            console.warn(`filter-bubble: Error applying regular expression "${regex}"`, regexError);
            return;
          }
          if (matched) {
            fn(container);
            count += 1;
            return;
          }
        }
      });
    }
    return count;
  };

  const hide = (el) => {
    el.classList.add(CSS_HIGHLIGHT_CLASS, CSS_HIDE_CLASS);
  };

  const highlight = (el) => {
    el.classList.add(CSS_HIGHLIGHT_CLASS);
  };

  const remove = (el) => {
    el.classList.add(CSS_HIGHLIGHT_CLASS, CSS_REMOVE_CLASS);
  };

  const applyDOM = ({ filterMode, pattern, selectors }) => {
    let fn = highlight;
    if (filterMode === 'hide') {
      fn = hide;
    } else if (filterMode === 'remove') {
      fn = remove;
    }
    return find(new RegExp(pattern, 'i'), selectors, fn);
  };

  const resetDOM = () => {
    // Hidden elements are also highlighted, so it's enough to look for the highlight class.
    for (const el of document.querySelectorAll(`.${CSS_HIGHLIGHT_CLASS}`)) {
      el.classList.remove(CSS_HIDE_CLASS, CSS_HIGHLIGHT_CLASS, CSS_REMOVE_CLASS);
    }
  };

  class FilterBubble {
    constructor() {
      this.update = this.update.bind(this);
      this.watch = this.watch.bind(this);
    }

    disable() {
      this.enabled = false;
      this.state = {};
      resetDOM();
    }

    enable({ isFirstRun, ...state }) {
      // May be triggered several times for a single page load.
      this.enabled = true;
      this.state = state; // { filterMode, pattern, selectors, tabId }
      resetDOM();
      this.count = applyDOM(this.state);

      if (isFirstRun) {
        window.addEventListener('scroll', this.watch, { passive: true });
        this.watch();
      }
      return this.count;
    }

    setCount(newCount) {
      if (this.count !== newCount) {
        this.count = newCount;
        chrome.runtime.sendMessage({ command: 'count', data: { count: this.count, tabId: this.state.tabId } });
      }
    }

    update() {
      if (!this.enabled || this.updateCallCount === 35) {
        // 30 secs in total.
        this.timeoutId = null;
        return;
      }

      let delayInMs = 250;
      if (this.updateCallCount > 20) {
        delayInMs = 1500;
      } else if (this.updateCallCount > 10) {
        delayInMs = 500;
      }
      this.setCount(applyDOM(this.state));
      this.timeoutId = setTimeout(this.update, delayInMs);
      this.updateCallCount += 1;
    }

    watch() {
      this.updateCallCount = 1; // Reset whenever scrolling occurs.
      if (this.enabled && !this.timeoutId) {
        this.update();
      }
    }
  }

  window.filterBubble = new FilterBubble();

  chrome.runtime.onMessage.addListener(({ command, data }, _, sendResponse) => {
    switch (command) {
      case 'enable':
        sendResponse({ count: window.filterBubble.enable(data) });
        break;
      case 'disable':
        window.filterBubble.disable();
        // Since background.js always provides a response callback, we must send a response in order to
        // avoid warnings in Chrome.
        sendResponse({ count: 0 });
        break;
      default:
        throw new Error(`filter-bubble: Unknown command: ${command} `);
    }
  });
  return { isFirstRun: true };
})();
