# AGENTS.md

Guidance for AI coding agents working on this repository.

## Development Commands

- `npm run build-production` - Production build (webpack, production mode, includes ESLint)
- `npm run build` - Development build (webpack, development mode)
- `npm run format` - Format with prettier-eslint
- `npm run package-production` - Production build + web-ext package (runs build-production internally)
- `npm run static-analysis` - ESLint with zero warnings tolerance
- `npm run web-ext` - Build and run in temporary Firefox profile

## Architecture

Filter Bubble is a Chrome/Firefox browser extension (Manifest V3) that hides web content matching user-defined topics using CSS selectors.

### Component Model

```text
Popup UI (src/)          Background Script           Content Script
lit-html + statezero     (static/background.js)      (static/content-script.js)
                         |                           |
User configures     -->  Monitors tabs, matches  --> Injected into matching pages,
topics & websites        URLs, injects scripts       filters DOM via regex + selectors
                         |                           |
                         <-- Badge count reported <--
```

### File Layout

- `src/index.js` - Popup entry point, initializes state and rendering
- `src/storage.js` - Thin wrapper around `chrome.storage.sync`
- `src/helpers.js` - Utility functions (date formatting, canonical arrays)
- `src/permissions.js` - Host permission management
- `src/actions/` - State mutations (flux-like pattern via statezero)
  - `factories.js` - Generic CRUD action creators (add, edit, delete, select, toggle)
  - `topics.js`, `websites.js` - Domain-specific actions using factories
  - `init.js` - Loads persisted state, subscribes storage sync
  - `websites.json` - Default website selector configurations
- `src/views/` - UI templates using lit-html
  - `factories.js` - Reusable form/list template factories
  - `fields.js` - Form field components
  - `hints.js` - Help text content
  - `topics.js`, `websites.js` - Domain-specific views
- `static/background.js` - Service worker: tab monitoring, content script injection, pattern generation
- `static/content-script.js` - IIFE: DOM filtering with MutationObserver, throttled updates
- `static/css/` - Stylesheets (BEM naming: `.block__element--modifier`)

### Key Patterns

- **State**: Single state tree managed by `statezero`, persisted to `chrome.storage.sync`
- **Actions**: Factory functions that produce statezero `action()` wrappers with `commit(state)`
- **Views**: Factory functions returning lit-html templates; composed in `app.js`
- **IDs**: Canonical string IDs from sorted, deduplicated arrays joined by commas
- **Error handling**: `withError()` HOF wraps form handlers; catches errors and adds them to state
- **Content filtering**: Background builds regex from topics, content script applies it per CSS selector container
- **Deduplication**: Content script uses IIFE + `window.filterBubble` guard; MutationObserver ignores own mutations

### Conventions

- ESLint: Airbnb base config with sorted imports (alphabetical), sorted destructure keys, max line 120 chars
- CSS: BEM naming convention (`.form__field`, `.list__item--disabled`)
- Imports: External first, then internal, separated by blank line
- No TypeScript; plain ES modules via webpack
- `no-param-reassign` disabled (used intentionally in reducers)
- Private methods prefixed with underscore (`_find`, `_changed`)

## Important Notes

- `static/background.js` and `static/content-script.js` are NOT bundled by webpack; they are copied as-is and must use vanilla JS (no imports)
- CSS is injected by the background script via `chrome.scripting.insertCSS` to avoid CSP issues
- The extension requires optional host permissions (`<all_urls>`) granted by the user
- `storage.sync` does not synchronize on Firefox Android (known platform bug)
- Content script throttles MutationObserver callbacks to max once per 300ms
- Pre-commit hooks run ESLint via husky + lint-staged
