# Handoff: end-to-end suite

Working notes for whoever picks this up next. Delete this file once its
contents are either done or moved somewhere permanent.

Branch: `claude/extension-integration-tests-axb9e9`, everything pushed, working
tree clean. No pull request has been opened.

**Scope: end-to-end tests only.** Touch `src/` and the unit tests only where a
fix demands it, and say so when you do.

## Where things stand

- 151 end-to-end tests across 28 spec files, driving a real Chromium with the
  real built extension. `tests/e2e/README.md` is the reference and is current.
- 345 unit tests, lint clean.
- CI runs lint/unit/size/package (`build`) and the suite (`e2e`) on every
  branch, and is green.
- Nothing is known to be failing or flaky at the configured two workers.

```bash
npx playwright install chromium     # once
npm run test:e2e                    # whole suite
npm run test:e2e -- 08-storage-sync # one spec
PW_WORKERS=1 npm run test:e2e       # serialize
```

## Settled, for anyone reading the history

- **The delete that did not propagate** was two unrelated faults sharing one
  symptom, which is why no single hypothesis ever covered both failing tests.
  One was a real ordering bug in `background.js`: a decision taken before
  `executeScript` and sent after a newer state had already sent its own
  message. The other was an assertion that could not wait, because `toHaveText`
  given a bare string does not retry past a strict-mode violation. Both have
  regression coverage; the assertion rule is in `tests/e2e/README.md`, and the
  ordering has a unit test that holds the injection open by hand, because the
  end-to-end test that found it only reproduces about 1 run in 30.
- **The container is gone.** It was kept as the best reproducer of that bug and
  reproduced nothing, and it never delivered the timing parity it was added
  for. `npm run test:e2e` is `playwright test` again and CI installs Chromium
  through Playwright, which takes the version from the installed
  `@playwright/test` rather than from a second declaration that could drift.

Worth keeping from the diagnosis: the background, the content script and
`storage.js` each pushed timestamped entries to a per-context array, dumped and
merged on failure by an auto fixture. One ordered timeline across three
execution contexts settled in one run what a session of reading the code had
not. If something like this comes back, instrument first.

## Still open, none urgent

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
- Measure a fix against the whole suite, never only the test it targets. An
  early attempt at the ordering bug above passed its target test 40 times
  running by breaking stylesheet injection, and only a full-suite A/B caught it.
