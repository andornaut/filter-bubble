import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, settle, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

// The import page reads a file the user picks, so the file has to exist on disk.
const writeImportFile = (testInfo, name, data) => {
  const filePath = path.join(testInfo.outputPath(), name);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
};

const importFile = async (ui, filePath) => {
  await ui.locator('input[type="file"]').setInputFiles(filePath);
};

// Capability: a user can carry their configuration between browsers - export
// writes a backup file, and importing one applies it to a running browser.
test.describe("import and export", () => {
  test("exports the current topics and websites as JSON", async ({
    extension,
  }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();

    const download = await Promise.all([
      ui.waitForEvent("download"),
      ui.getByRole("link", { name: "Export" }).click(),
    ]).then(([event]) => event);

    expect(download.suggestedFilename()).toMatch(
      /^filter-bubble-backup-\d{4}-\d{2}-\d{2}T[\d-]{8}\.json$/,
    );

    const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
    expect(exported.topics).toHaveLength(1);
    expect(exported.topics[0]).toMatchObject({
      id: "topic-politics",
      text: ["politics"],
    });
    expect(exported.websites[0]).toMatchObject({
      addresses: ["localhost"],
      id: "site-localhost",
      selectors: ["article"],
    });
  });

  test("importing a backup filters an already open tab", async ({
    extension,
    page,
    server,
  }, testInfo) => {
    await page.goto(server.url("feed.html"));
    await expect(page.locator("article.filter-bubble")).toHaveCount(0);

    const filePath = writeImportFile(testInfo, "backup.json", {
      topics: [{ id: "topic-politics", text: ["politics"] }],
      websites: [
        {
          addresses: ["localhost"],
          id: "site-localhost",
          selectors: ["article"],
        },
      ],
    });

    const ui = await extension.openWindow("import");
    await importFile(ui, filePath);

    await expect(ui.locator(".import__status--success")).toContainText(
      "Imported 1 topic and 1 website.",
    );
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });

  test("survives an export/import round trip into a clean browser", async ({
    extension,
    page,
    server,
  }, testInfo) => {
    await extension.seed({
      topics: [
        { id: "topic-politics", text: ["politics"] },
        { enabled: false, id: "topic-sports", text: ["sports"] },
      ],
      websites: [
        {
          addresses: ["localhost"],
          hideInsteadOfRemove: true,
          id: "site-localhost",
          selectors: ["article"],
        },
      ],
    });

    const source = await extension.openWindow();
    const download = await Promise.all([
      source.waitForEvent("download"),
      source.getByRole("link", { name: "Export" }).click(),
    ]).then(([event]) => event);
    const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
    await source.close();

    // Wipe the browser and import the file back into it.
    await extension.clearSyncStorage();
    const filePath = writeImportFile(testInfo, "round-trip.json", exported);
    const ui = await extension.openWindow("import");
    await importFile(ui, filePath);
    await expect(ui.locator(".import__status--success")).toContainText(
      "Imported 2 topics and 1 website.",
    );

    await page.goto(server.url("feed.html"));

    // Every field survived: the enabled flags, and hide-instead-of-remove.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--hide/);
    await expect(page.locator("#a3")).not.toHaveClass(/filter-bubble/);
  });

  test("re-importing the same file does not duplicate items", async ({
    extension,
  }, testInfo) => {
    await extension.seed(SEED);
    const filePath = writeImportFile(testInfo, "backup.json", {
      topics: [{ id: "topic-politics", text: ["politics"] }],
      websites: [
        {
          addresses: ["localhost"],
          id: "site-localhost",
          selectors: ["article"],
        },
      ],
    });

    const ui = await extension.openWindow("import");
    await importFile(ui, filePath);
    await expect(ui.locator(".import__status--success")).toBeVisible();
    await importFile(ui, filePath);
    // The second import reports the same success as the first, so there is
    // nothing in the UI that distinguishes it: the duplicate this test is about
    // has to be given time to be written before it is asserted absent.
    await settle(ui);

    const stored = await extension.syncStorage();
    expect(Object.keys(stored).filter((key) => key.startsWith("t:"))).toEqual([
      "t:topic-politics",
    ]);
    expect(Object.keys(stored).filter((key) => key.startsWith("w:"))).toEqual([
      "w:site-localhost",
    ]);
  });

  test("rejects a malformed file and leaves the configuration alone", async ({
    extension,
    page,
    server,
  }, testInfo) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await extension.openWindow("import");

    await importFile(
      ui,
      writeImportFile(testInfo, "bad-domain.json", {
        websites: [{ addresses: ["not a domain"], selectors: ["article"] }],
      }),
    );
    await expect(ui.locator(".import__status--error")).toContainText(
      "isn't a valid domain name",
    );

    await importFile(
      ui,
      writeImportFile(testInfo, "wrong-shape.json", { topics: "politics" }),
    );
    await expect(ui.locator(".import__status--error")).toContainText(
      'The "topics" and "websites" fields must be lists',
    );

    // Nothing was applied, and the open tab is still filtered as before.
    expect(Object.keys(await extension.syncStorage()).sort()).toEqual([
      "schema",
      "t:topic-politics",
      "w:site-localhost",
    ]);
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
  });
});
