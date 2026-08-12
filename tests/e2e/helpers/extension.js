const SCHEMA_KEY = "schema";
const SCHEMA_VERSION = 2;
const TOPIC_PREFIX = "t:";
const WEBSITE_PREFIX = "w:";
const DISABLED_KEY = "disabled";

// A date far enough in the past that seeded items never tie with anything the
// app writes during a test, and stable so runs are reproducible.
const SEED_DATE = "2020-01-01T00:00:00.000Z";

const toTopic = ({ enabled = true, id, text }) => ({
  createdDate: SEED_DATE,
  enabled,
  id,
  modifiedDate: SEED_DATE,
  sortDate: SEED_DATE,
  text: Array.isArray(text) ? text : [text],
});

const toWebsite = ({
  addresses,
  enabled = true,
  hideInsteadOfRemove = false,
  id,
  selectors,
}) => ({
  addresses,
  createdDate: SEED_DATE,
  enabled,
  hideInsteadOfRemove,
  id,
  modifiedDate: SEED_DATE,
  selectors,
  sortDate: SEED_DATE,
});

// Resolve to the extension's service worker, waiting for it to register if it
// has not done so yet.
//
// Subscribe before reading the current list, not after. A worker that registers
// between a `serviceWorkers()` that came back empty and a `waitForEvent` that
// starts listening afterwards is missed by both, and the wait then hangs for an
// event that has already fired - which surfaces as a test timing out in fixture
// setup, and only when the machine is loaded enough to widen the gap.
export const waitForServiceWorker = async (context) => {
  const registered = context
    .waitForEvent("serviceworker", { timeout: 30_000 })
    .catch(() => null);
  const [existing] = context.serviceWorkers();
  const worker = existing || (await registered);
  if (!worker) {
    throw new Error("The extension's service worker did not start");
  }
  return worker;
};

// Playwright reports the worker as soon as its execution context exists, which
// can be fractionally before Chrome has bound the extension APIs onto it.
// Evaluating in that window sees a `chrome` with no `storage` on it, so the
// first thing a test does - seeding - fails with a TypeError raised inside the
// worker, and only under enough load to widen the gap.
//
// Poll from here rather than inside the worker. A worker that is still coming
// up does not reliably have `setTimeout` either, so a polling loop evaluated in
// it trades a rare TypeError for a reliable ReferenceError.
//
// Called once per browser, from `getExtensionId`, which is the first thing the
// `extension` fixture does: every later `evaluate` is behind it.
const waitForExtensionApis = async (worker) => {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const ready = await worker
      .evaluate(() => Boolean(globalThis.chrome?.storage?.sync))
      .catch(() => false);
    if (ready) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error("chrome.storage never appeared on the service worker");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

// Drives the real extension from the outside: everything here goes through the
// extension's own APIs in its own service worker, so the code under test sees
// the same events it would from the popup or from a sync from another device.
export class Extension {
  constructor(context, id) {
    this.context = context;
    this.id = id;
  }

  // MV3 service workers are torn down when idle, so never hold on to the
  // worker handle - look it up (and wait for a restart) at each use.
  async worker() {
    return waitForServiceWorker(this.context);
  }

  async evaluate(fn, arg) {
    const worker = await this.worker();
    return worker.evaluate(fn, arg);
  }

  // Write straight to `storage.sync`, which is what a sync from another device
  // looks like to the background: it wakes on `storage.onChanged`, rebuilds its
  // pattern and website list, and re-evaluates the active tabs.
  //
  // Writing `schema` marks the store as already migrated, so the popup seeds no
  // default websites over the top of the fixture data.
  async seed({ topics = [], websites = [] } = {}) {
    const items = { [SCHEMA_KEY]: SCHEMA_VERSION };
    topics.forEach((topic) => {
      items[TOPIC_PREFIX + topic.id] = toTopic(topic);
    });
    websites.forEach((website) => {
      items[WEBSITE_PREFIX + website.id] = toWebsite(website);
    });
    await this.evaluate((values) => chrome.storage.sync.set(values), items);
  }

  async syncStorage() {
    return this.evaluate(() => chrome.storage.sync.get(null));
  }

  async setSyncStorage(values) {
    return this.evaluate((v) => chrome.storage.sync.set(v), values);
  }

  async clearSyncStorage() {
    return this.evaluate(() => chrome.storage.sync.clear());
  }

  // Drop keys outright, which is what a device running a release that predates
  // tombstones does when it deletes an item: the key is gone rather than
  // replaced with a `deleted` marker.
  async removeSyncStorage(keys) {
    return this.evaluate((k) => chrome.storage.sync.remove(k), keys);
  }

  // The browser-wide off switch the popup's toggle writes to.
  async setDisabled(isDisabled) {
    return this.evaluate(
      ({ key, value }) => chrome.storage.local.set({ [key]: value }),
      { key: DISABLED_KEY, value: isDisabled },
    );
  }

  async tabIdFor(page) {
    const url = page.url();
    return this.evaluate(
      (u) => chrome.tabs.query({ url: u }).then((tabs) => tabs[0]?.id ?? null),
      url,
    );
  }

  // Toolbar badge text for the tab showing `page`, which is where the content
  // script's filtered-element count surfaces.
  async badgeText(page) {
    const tabId = await this.tabIdFor(page);
    if (tabId === null) {
      throw new Error(`No tab found for ${page.url()}`);
    }
    return this.evaluate(
      (id) => chrome.action.getBadgeText({ tabId: id }),
      tabId,
    );
  }

  async actionTitle() {
    return this.evaluate(() => chrome.action.getTitle({}));
  }

  async popupUrl(hash = "") {
    return `chrome-extension://${this.id}/popup.html${hash}`;
  }

  // Open the extension UI as a page. `role` picks which of the three roles
  // popup.html serves:
  //   - "options": what `options_ui` opens (a normal tab)
  //   - "import":  the #import page
  // The real browser-action popup cannot be opened by automation, so tests that
  // need popup-only behaviour (highlight mode) connect its port explicitly; see
  // `connectPopupPort`.
  async openPage(role = "options") {
    const page = await this.context.newPage();
    await page.goto(await this.popupUrl(role === "import" ? "#import" : ""));
    await page.waitForSelector("#root *");
    return page;
  }

  // Open `url` in a browser window of its own, and resolve to its page. A
  // window rather than a tab, so the page already under test stays the active
  // tab of its own window: the background only re-evaluates active tabs.
  async newWindow(url) {
    const opened = this.context.waitForEvent("page");
    await this.evaluate((u) => chrome.windows.create({ url: u }), url);
    const page = await opened;
    await page.waitForLoadState("domcontentloaded");
    return page;
  }

  // The extension UI in a window of its own, which is the closest an automated
  // browser gets to the browser-action popup floating over the current tab.
  async openWindow(role = "options") {
    const page = await this.newWindow(
      await this.popupUrl(role === "import" ? "#import" : ""),
    );
    await page.waitForSelector("#root *");
    return page;
  }

  // Reproduce the one thing the browser-action popup does that an options tab
  // does not: hold a `runtime.connect` port open for as long as it is on
  // screen. The background turns on highlight mode while any port is open.
  // Returns a function that closes the port again.
  async connectPopupPort() {
    const page = await this.openWindow();
    await page.evaluate(() => {
      window.__testPort = chrome.runtime.connect();
    });
    return async () => {
      await page.close();
    };
  }
}

export const getExtensionId = async (context) => {
  const worker = await waitForServiceWorker(context);
  await waitForExtensionApis(worker);
  return new URL(worker.url()).host;
};
