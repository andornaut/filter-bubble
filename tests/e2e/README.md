# End-to-end tests

These tests drive a real Chromium with the real built extension loaded, against
real pages served over HTTP. Nothing is stubbed: the background service worker,
the content script, and the popup UI are the shipped code, and every assertion
is made against what the browser actually does to the page.

The unit suite (`npm test`) covers the same modules in jsdom; this suite covers
the parts jsdom cannot reach - extension APIs, content-script injection,
cross-context messaging, the toolbar badge, and the CSS that hides content.

## Running

Once, to fetch the browser:

```bash
npx playwright install chromium
```

The version it fetches is the one the installed `@playwright/test` expects, so
a dependency bump brings its own browser and there is nothing to keep in step
by hand. On Linux, add `--with-deps` to install the system libraries Chromium
links against, which is what CI does.

Then:

```bash
npm run test:e2e                    # whole suite
npm run test:e2e -- 02-filtering    # one spec
PW_WORKERS=1 npm run test:e2e       # serialize, e.g. when debugging
```

Nothing reaches the network - the fixture server and the browser are both
local - and nothing needs a display: extensions load headless, given the full
Chromium build rather than the headless shell, which is what
`channel: "chromium"` in `helpers/fixtures.js` selects. They do need a
persistent context, so every browser here has a profile.

The back-forward cache stays on, which Playwright turns off by default. A real
browser restores a page the user goes back to, handing back the same document
and the same content-script instance with the filtering it already applied, and
the extension has code for exactly that: the content script drops its cached
count on every `enable`, and the background's "complete" pass is what repairs a
restored page whose rules changed while it was away. Both are unpinned with the
cache off, because going back then loads a new document instead.

The cost is that `page.goBack()` has to stop at the commit - a restored document
fires no load event, so the default wait never returns:

```js
await page.goBack({ waitUntil: "commit" });
```

Two workers by default, because each test launches a whole Chromium. Raising
`PW_WORKERS` past one worker per two cores starts timing the service worker
out in fixture setup rather than finding anything.

A failing CI run uploads the traces and screenshots Playwright kept, as the
`e2e-results` artifact.

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
- **A storage read that rejects.** There are two ways into the failure UI. A
  render that throws is covered by `31-failure-ui`, which stores a value the
  views cannot handle. The other is `initState` rejecting, which `src/index.js`
  catches and renders itself, with a retry that re-runs init rather than
  re-rendering; reaching it needs `storage.sync.get` to fail, which nothing here
  can make it do.
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

Before trusting a new test, break the behaviour it is about and watch it fail.
A test that passes with the code it covers removed is pinning the browser, or
nothing at all, and both read exactly like coverage from here. Then measure the
change against the whole suite rather than the test it targets: a fix that
passes its own test by breaking something two files away has happened here.

An empty badge after a navigation is one to check that way. Chrome resets a
tab-scoped badge when a new document commits, so that assertion holds with the
background's clearing removed altogether; it is the same-document cases that
show whether the extension clears.

Negative assertions need care: filtering is asynchronous and throttled to one
pass per 200ms, so "still not filtered" has to be given time to be wrong.
`settle(page)` from `helpers/fixtures.js` is that wait; use it rather than a
bare `waitForTimeout`, which should mean "this test needs its own wait, for a
reason it states". The same goes for anything else asserted absent while the
write that would disprove it is still in flight - a second import that must add
nothing, a re-seed that must not happen.

A positive assertion on stored data needs the opposite care, and a poll rather
than a wait: a control's label follows the store, which changes before the write
it triggers has landed, so a storage read taken straight after a click can
arrive first.

```js
await expect.poll(() => extension.syncStorage()).toMatchObject({ schema: 2 });
```

Assert on a list with an array, never a bare string, even where you expect one
item:

```js
await expect(ui.locator(".topics__text")).toHaveText(["sports"]); // waits
await expect(ui.locator(".topics__text")).toHaveText("sports"); // does not
```

`toHaveText` given a string asserts against a single element, and a locator
matching more than one is a strict-mode violation, which it reports rather than
retries. Waiting for a list to shrink is therefore the one thing the string form
cannot do: it fails immediately, on exactly the state it was supposed to wait
out. The array form asserts the whole list and retries to the timeout like every
other web-first assertion. This cost a real afternoon - the failure reads
"resolved to 2 elements", which looks like a bug in the code under test rather
than in the assertion.
