# End-to-end tests

These tests drive a real Chromium with the real built extension loaded, against
real pages served over HTTP. Nothing is stubbed: the background service worker,
the content script, and the popup UI are the shipped code, and every assertion
is made against what the browser actually does to the page.

The unit suite (`npm test`) covers the same modules in jsdom; this suite covers
the parts jsdom cannot reach - extension APIs, content-script injection,
cross-context messaging, the toolbar badge, and the CSS that hides content.

## Running

```bash
npm run test:e2e             # whole suite
npm run test:e2e -- 02-filtering    # one spec
PW_WORKERS=1 npm run test:e2e       # serialize, e.g. when debugging
```

Extensions load only into a headed browser (the headless shell ships no
extension support), so `test:e2e` wraps Playwright in `xvfb-run`. On a desktop
with a display, `npx playwright test` works directly.

In a container:

```bash
docker build -f tests/e2e/Dockerfile -t filter-bubble-e2e .
docker run --rm --ipc=host filter-bubble-e2e
```

## Layout

| Path                  | What it is                                                         |
| --------------------- | ------------------------------------------------------------------ |
| `build-extension.mjs` | Builds `dist/` and copies it to `.artifacts/extension` for loading |
| `global-setup.mjs`    | Runs that build once per suite                                     |
| `helpers/`            | Playwright fixtures, the fixture web server, extension driver      |
| `site/`               | The pages served as the website under test                         |
| `specs/`              | One file per capability                                            |

Each test gets a fresh browser profile, so `storage.sync` and `storage.local`
start empty and nothing leaks between tests.

## Two deliberate deviations from a real install

Everything else is the shipped extension, unmodified.

1. **Host permissions.** The shipped manifest asks for `<all_urls>` as an
   _optional_ host permission, which a user grants through a native Chrome
   dialog that no automation can click. `build-extension.mjs` therefore adds
   `http://localhost/*` and `http://127.0.0.1/*` as required `host_permissions`
   in the copy under test, and leaves everything else - including
   `optional_host_permissions` - as shipped. The permission-gated code paths
   still run; they just find the grant already in place, as they would after a
   user had clicked "Allow". The consequence is that the grant flow itself
   (the banner, the ⚠️ per-website warning, `permissions.request`) is not
   covered here.

2. **The popup window.** Automation cannot open a browser-action popup. Tests
   that need popup-only behaviour open `popup.html` in a window of their own -
   a window rather than a tab, because the real popup floats over the user's
   tab and leaves it the active one, and the background only re-evaluates
   active tabs. Highlight mode is keyed off the `runtime.connect` port the
   popup holds while it is open, so `Extension.connectPopupPort` opens that
   port explicitly; `src/index.js` opens it only when `isPopup()` is true.

## Writing a test

`helpers/fixtures.js` provides `page` (a tab in the browser under test),
`server` (the fixture site), and `extension`. The `extension` fixture talks to
the extension through its own APIs in its own service worker, so the code under
test sees exactly the events it would in the field - `extension.seed(...)`, for
instance, writes to `storage.sync`, which is what a sync from another device
looks like to the background.

```js
import { expect, test } from "../helpers/fixtures.js";

test("filters a matching item", async ({ extension, page, server }) => {
  await extension.seed({
    topics: [{ id: "topic-politics", text: ["politics"] }],
    websites: [
      {
        addresses: ["localhost"],
        id: "site-localhost",
        selectors: ["article"],
      },
    ],
  });
  await page.goto(server.url("feed.html"));

  await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
});
```

Assert on what the user would see (`toBeHidden`, computed styles, the badge
text) rather than only on the classes the content script adds.

Negative assertions need care: filtering is asynchronous and throttled to one
pass per 200ms, so "still not filtered" has to be given time to be wrong. The
existing specs settle first with a short wait, then assert.
