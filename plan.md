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
  branch.
- The intermittent failure this file used to open with is fixed - see below.
  Last measured: 151/151 in the container, 151/151 on the host at 2 workers.

```bash
npm run test:e2e                    # in the container (what CI runs)
npm run test:e2e:direct             # the suite itself, no container
npm run test:e2e -- 08-storage-sync # one spec
PW_WORKERS=1 npm run test:e2e       # serialize
```

## 1. The delete that did not propagate: closed

It was two unrelated faults wearing the same costume, which is why one
hypothesis never covered both tests. Both are fixed; the reasoning is in the
commit messages and the code comments, and the durable lesson is in
`tests/e2e/README.md`.

- **`08-storage-sync`, the tombstone test - a real product bug.** `updateTab`
  decided what to send a tab, then awaited `executeScript` before sending it. A
  storage change arriving during that await sent its own `disable` first, so the
  older decision landed last and left the tab filtering on a topic that had been
  deleted. Instrumenting the background's sends caught it dead to rights: a
  `disable` at +984ms and the superseded `enable` at +985ms. It now reads the
  state again after the injection, with no await between that read and the send.
  Reproduced 1 in 30 and 1 in 40 before; 60 for 60 after.
- **`18-persistence`, the two-windows test - a bug in the test.** The extension
  was right every single time; `toHaveText("sports")` was wrong. Given a bare
  string it asserts against one element and reports a strict-mode violation
  instead of retrying, so it failed instantly on the two-item state it was
  waiting to leave. The array form waits. 2 of 48 before, 0 of 48 after, both
  under deliberate contention.

Both are pinned now. The background ordering has a unit test that holds
`executeScript` open by hand and fails against the previous code - the
end-to-end test that found it only reproduces about 1 run in 30, which is not a
regression test. The assertion trap is swept: every other single-element
assertion in the suite sits on a list that cannot grow past one item, so
`18-persistence` was the only real instance. `tests/e2e/README.md` carries the
rule for new ones.

Worth keeping from the diagnosis: the background, the content script and
`storage.js` each pushed timestamped entries to a per-context array, dumped and
merged on failure by an auto fixture. One ordered timeline across three
execution contexts settled in one run what a session of reading the code had
not. If something like this comes back, instrument first.

## 2. The open decision: keep the container or drop it

Unresolved, and the maintainer's call - do not decide it unilaterally.

`npm run test:e2e` is `docker compose run --rm --build e2e`, and CI runs that
same command against that same image (`Dockerfile`, `docker-compose.yml`).

The case for keeping it was that it was the best reproducer of the bug in
section 1. **That argument is gone**: the container passed 151/151 every time it
was run this session, including before the fix and including the full-suite runs
the bug was supposed to favour. What is left is parity between a local run and
a CI run, against:

- It does not deliver the timing parity it was added for. It shifts the timing
  profile enough to change which race fires and how often - a suite about
  asynchronous cross-context propagation is the most sensitive thing there is to
  that.
- The drift it guards against was already impossible: `npx playwright install
chromium` fetches the browser revision pinned by the installed
  `@playwright/test`. The image tag is a _second_ declaration of that version,
  which is why the Dockerfile needs a guard that fails the build when the two
  disagree.
- ~90 lines, a Node install step needed only because the image ships Node 22
  against the pinned 24, root-owned `dist/` and `tests/e2e/.artifacts/` on
  Linux, and CI setup overhead up from ~31s to ~55s.

If it goes: remove `Dockerfile`, `docker-compose.yml`, `.dockerignore`, restore
`test:e2e` to `playwright test`, and give the CI job back its setup-node /
`npm ci` / `npx playwright install --with-deps chromium` steps.

## 3. Smaller things, none urgent

- **Do not raise `PW_WORKERS` past one worker per two cores.** Above that,
  `waitForServiceWorker` starts timing out ("The extension's service worker did
  not start"), because every test launches a whole Chromium. Seen at 8 workers
  on 4 cores repeatedly and once at 4; never at the configured 2, and never in
  the container. If it ever shows up at 2, that is a real bug and worth chasing
  - the suspicion is a worker that registers and is torn down as idle before the
    fixture looks, with nothing left to wake it.
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
- Measure a fix against the whole suite, never only the test it targets. A
  previous attempt at section 1 passed its target test 40 times running by
  breaking stylesheet injection, and only a full-suite A/B caught it.
