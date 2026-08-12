# Handoff: end-to-end suite

Working notes for whoever picks this up next. Delete this file once its
contents are either done or moved somewhere permanent.

Branch: `claude/extension-integration-tests-axb9e9`, 24 commits ahead of `main`,
everything pushed, working tree clean. No pull request has been opened.

**Scope for the next session: end-to-end tests only.** Touch `src/` and the unit
tests only where a fix demands it, and say so when you do.

## Where things stand

- 151 end-to-end tests across 28 spec files, driving a real Chromium with the
  real built extension. `tests/e2e/README.md` is the reference and is current.
- 344 unit tests, lint clean.
- CI runs lint/unit/size/package (`build`) and the suite (`e2e`) on every
  branch. **CI is currently red**, for the reason in "The open bug" below.

```bash
npm run test:e2e                    # in the container (what CI runs)
npm run test:e2e:direct             # the suite itself, no container
npm run test:e2e -- 08-storage-sync # one spec
PW_WORKERS=1 npm run test:e2e       # serialize
```

## 1. The open bug: a delete that does not propagate

Two tests fail intermittently. Both are the same shape - an item is deleted in
one context and another context never learns of it - so treat them as one bug
until something proves otherwise.

| Test                                                                                 | Behaviour                                                                                                                                |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `08-storage-sync › propagates a delete as a tombstone that survives a stale re-send` | ~1 in 20 under contention on the host; never seen in the container                                                                       |
| `18-persistence › keeps two open extension windows in step`                          | 20/20 in isolation on host _and_ in container; fails ~2 of 3 container full-suite runs, and failed both the original and the retry in CI |

Reproduce:

```bash
npx playwright test -g "propagates a delete as a tombstone" --repeat-each=20 --workers=4
npm run test:e2e -- 18-persistence          # the container is the better reproducer here
```

This is **pre-existing**, not introduced by any of this branch's work: the
tombstone one reproduces at the same rate on the pre-headless, Xvfb setup.

### The hypothesis, which is NOT proven

In `src/browser/background.js`, `updateTab` sends `disable` as soon as it
decides on it, but reaches `enable` only after awaiting `executeScript`. Two
storage writes in quick succession can therefore deliver the two in the order
they were not made, leaving a tab filtering by state that is gone with no
further event due to repair it. The stale-re-send test creates exactly that
pairing: the re-send briefly makes the topic live again before the tombstone
write-back lands.

An equally consistent explanation is that the `disable` is never sent at all -
e.g. the tab is missing from the `tabs.query({active: true})` result at that
moment. **Both produce an identical symptom** (page stays filtered), which is
why this is still a hypothesis. Distinguish them before writing any fix:
instrument the background's sends and the content script's receives, and get a
real ordering from a failing run rather than reasoning about it.

### Do not repeat these

Both were attempted this session and both were wrong.

1. **A per-tab sequence guard that drops superseded sends.** Correct idea,
   fatal placement: I put the check _before_ `insertCSS`, so a superseded
   update skipped injecting the stylesheet and the update that superseded it
   skipped it too (the content script was already installed). Pages got filter
   classes and no styles - nothing was actually hidden, which is why the
   tombstone test then "passed" 40/40. A full-suite A/B caught it: 7 failures
   with the fix, 1 without. Moving the guard after the CSS insert cleared the
   regression, and the race came straight back at 1 in 40. Reverted.
   **Lesson: measure a fix against the whole suite, never only the test it
   targets.**
2. **Polling for the extension APIs from inside the service worker.** A worker
   that is still starting does not dependably have `setTimeout`, so this turned
   a rare `TypeError` into a reliable `ReferenceError` and failed nine tests.
   The working version polls from the Node side, once per browser, in
   `getExtensionId` - see `tests/e2e/helpers/extension.js`.

### Note on the 18-persistence failure message

It surfaces as a strict-mode violation ("resolved to 2 elements") rather than
as "the delete did not arrive", because `toHaveText("sports")` is asserted on a
locator that still matches two items. `toHaveText(["sports"])` asserts the whole
list and would fail more legibly. Worth changing while you are in there, but it
is a reporting improvement, not a fix.

## 2. The open decision: keep the container or drop it

Unresolved, and the maintainer's call - do not decide it unilaterally.

`npm run test:e2e` is `docker compose run --rm --build e2e`, and CI runs that
same command against that same image (`Dockerfile`, `docker-compose.yml`).
Validated: 151/151 in the container, including under `CI=true`.

The case for dropping it:

- It does not deliver the parity it was added for. It shifts the timing profile
  enough to change which race fires and how often - a suite about asynchronous
  cross-context propagation is the most sensitive thing there is to that.
- The drift it guards against was already impossible: `npx playwright install
chromium` fetches the browser revision pinned by the installed
  `@playwright/test`. The image tag is a _second_ declaration of that version,
  which is why the Dockerfile needs a guard that fails the build when the two
  disagree.
- ~90 lines, a Node install step needed only because the image ships Node 22
  against the pinned 24, root-owned `dist/` and `tests/e2e/.artifacts/` on
  Linux, and CI setup overhead up from ~31s to ~55s.

The case for keeping it: right now it is the most reliable reproducer of the
bug in section 1 - a majority failure rate against ~1 in 20 on the host.

Suggested sequence: keep it until section 1 is diagnosed, then revisit. If it
goes, remove `Dockerfile`, `docker-compose.yml`, `.dockerignore`, restore
`test:e2e` to `playwright test`, and give the CI job back its setup-node /
`npm ci` / `npx playwright install --with-deps chromium` steps.

## 3. Smaller things, none urgent

- `tests/e2e/helpers/server.js` never calls `closeAllConnections()`, so a
  keep-alive socket could in principle stall a worker's teardown. Nothing has
  hung; hardening, not a fix.
- `build:prod` runs twice in CI (`npm run size`, then `npm run package` ->
  `lint:ext`). Real duplication, but ~0s and 3s in practice.
- Three things remain out of reach for this harness and are documented as such
  in `tests/e2e/README.md`: service worker teardown, Chrome's own permission
  dialog, and Firefox. Read that section before adding a test for any of them.

## House rules

- **Commits must carry no AI attributions.** `.github/workflows/ai-attributions.yml`
  fails the push otherwise - it checks the author and committer identity as well
  as the message. Use `andornaut <andornaut@users.noreply.github.com>`, which is
  what every human commit on `main` uses.
- Push to `claude/extension-integration-tests-axb9e9`. Do not open a pull
  request unless asked.
- The specs are prose-commented for why, not what. Match that: a test whose
  comment does not say what would break in the field is a test nobody will trust
  enough to fix later.
