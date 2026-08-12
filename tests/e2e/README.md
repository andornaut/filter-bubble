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

Needs Chromium at the build Playwright expects (`npx playwright install
chromium`) and `xvfb` on headless machines.

CI runs the suite on every push and pull request, as the `e2e` job in
[`ci.yml`](../../.github/workflows/ci.yml). A failing run uploads the traces and
screenshots Playwright kept for whatever failed, as the `e2e-results` artifact.

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

## Deliberate deviations from a real install

Everything else is the shipped extension, unmodified.

1. **Host permissions.** The shipped manifest asks for `<all_urls>` as an
   _optional_ host permission, which a user grants through a native Chrome
   dialog that no automation can click. `build-extension.mjs` therefore adds
   `*://localhost/*` and `*://127.0.0.1/*` as required `host_permissions`
   in the copy under test, and leaves everything else - including
   `optional_host_permissions` - as shipped. The permission-gated code paths
   still run; they just find the grant already in place, as they would after a
   user had clicked "Allow". `127.0.0.2` serves the same fixture pages over
   loopback and is deliberately _not_ granted, which is how `09-permissions`
   covers the ungranted side: the banner, the ⚠️ per-website warning, and a
   matched website that cannot be injected into. The one thing left uncovered
   is the click on Chrome's own dialog, i.e. `permissions.request` returning
   true.

2. **The popup window.** Automation cannot open a browser-action popup. Tests
   that need popup-only behaviour open `popup.html` in a window of their own -
   a window rather than a tab, because the real popup floats over the user's
   tab and leaves it the active one, and the background only re-evaluates
   active tabs. Highlight mode is keyed off the `runtime.connect` port the
   popup holds while it is open, so `Extension.connectPopupPort` opens that
   port explicitly; `src/index.js` opens it only when `isPopup()` is true.

## Out of reach for this harness

Worth knowing before adding a test for one of these and finding out the hard
way.

- **The service worker's lifecycle.** Playwright keeps a debugger attached to
  the extension's service worker, which stops it from ever being torn down when
  idle: it was still alive after 60s of no activity, where Chrome would
  normally stop it after 30. So the paths that matter when an event wakes a
  stopped worker - `readStatePromise` gating the handlers, state re-read from
  storage - always run against a worker that is already warm here.
  `chrome.runtime.reload()` does not help either: under `--load-extension` the
  worker never comes back, and the extension has no say in that.
- **Chrome's own permission dialog**, i.e. `permissions.request` resolving
  true. The ungranted side is covered (see above); the click is not.
- **Firefox.** Playwright cannot load a Gecko add-on, and `web-ext run` offers
  no automation driver, so the `browser_specific_settings` build is not
  exercised here at all.

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
