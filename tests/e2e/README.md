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
npm run test:e2e                    # whole suite
npm run test:e2e -- 02-filtering    # one spec
PW_WORKERS=1 npm run test:e2e       # serialize, e.g. when debugging
```

That runs `docker compose run --rm --build e2e`, so Docker is the only thing
you need installed. The image is built from [`Dockerfile`](../../Dockerfile) and
carries the Node this project pins, the browser build Playwright expects, and
the libraries it links against. CI runs the same command against the same
image, so a failure there reproduces here by definition rather than by
resemblance.

The working tree is mounted into the container, so an edit to a spec or to the
extension runs without rebuilding the image. Only `node_modules` is not: the
suite uses the image's, installed from the lockfile for the platform it runs on.

Nothing reaches the network - the service sets `network_mode: none` - and
nothing needs a display: extensions load headless, given the full Chromium
build rather than the headless shell, which is what `channel: "chromium"` in
`helpers/fixtures.js` selects. They do need a persistent context, so every
browser here has a profile.

A failing CI run uploads the traces and screenshots Playwright kept, as the
`e2e-results` artifact.

To run without Docker - on a machine that already has the right Chromium
(`npx playwright install chromium`) - `npm run test:e2e:direct` is the suite
itself, which is what runs inside the container.

On Linux, the container writes `dist/` and `tests/e2e/.artifacts/` as root,
because that is who it runs as. Both are ignored by git; `sudo rm -rf` them if
they get in the way of a later host-side build.

## Layout

| Path                  | What it is                                                          |
| --------------------- | ------------------------------------------------------------------- |
| `build-extension.mjs` | Builds `dist/` to `.artifacts/extension`; the suite's `globalSetup` |
| `helpers/`            | Playwright fixtures, the fixture web server, extension driver       |
| `site/`               | The pages served as the website under test                          |
| `specs/`              | One file per capability                                             |

Each test gets a throwaway profile that Playwright creates and removes, so
`storage.sync` and `storage.local` start empty and nothing leaks between tests.

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

`helpers/seed.js` holds the configuration most tests want - hide "politics"
inside an `<article>` on the fixture site - so a spec only writes out the parts
it is actually about.

```js
import { expect, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

test("filters a matching item", async ({ extension, page, server }) => {
  await extension.seed(SEED);
  await page.goto(server.url("feed.html"));

  await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
});
```

Assert on what the user would see (`toBeHidden`, computed styles, the badge
text) rather than only on the classes the content script adds.

Negative assertions need care: filtering is asynchronous and throttled to one
pass per 200ms, so "still not filtered" has to be given time to be wrong.
`settle(page)` from `helpers/fixtures.js` is that wait; use it rather than a
bare `waitForTimeout`, which should mean "this test needs its own wait, for a
reason it states".
