import { expect, test } from "../helpers/fixtures.js";

const SEED = {
  topics: [{ id: "topic-politics", text: ["politics"] }],
  websites: [
    { addresses: ["localhost"], id: "site-localhost", selectors: ["article"] },
  ],
};

// Capability: the browser-wide off switch stops all filtering, says so on the
// toolbar, and stays on this browser rather than syncing to other devices.
test.describe("the disable switch", () => {
  test("turns filtering off and back on from the extension UI", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    const ui = await extension.openWindow();
    const status = ui.locator(".footer__status-link");
    await expect(status).toHaveText("Enabled");

    await status.click();

    await expect(status).toHaveText("Disabled");
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
    await expect.poll(() => extension.badgeText(page)).toBe("");
    await expect
      .poll(() => extension.actionTitle())
      .toBe("Filter Bubble (Disabled)");

    await status.click();

    await expect(status).toHaveText("Enabled");
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect.poll(() => extension.badgeText(page)).toBe("1");
    await expect.poll(() => extension.actionTitle()).toBe("Filter Bubble");
  });

  test("keeps the switch out of synced storage", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await page.goto(server.url("feed.html"));

    const ui = await extension.openWindow();
    await ui.locator(".footer__status-link").click();
    await expect(ui.locator(".footer__status-link")).toHaveText("Disabled");

    // Disabling is meant to apply to this browser only.
    expect(
      await extension.evaluate(() => chrome.storage.local.get(null)),
    ).toMatchObject({ disabled: true });
    expect(Object.keys(await extension.syncStorage())).not.toContain(
      "disabled",
    );
  });

  test("leaves a newly opened tab unfiltered while disabled", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed(SEED);
    await extension.setDisabled(true);

    await page.goto(server.url("feed.html"));
    await page.waitForTimeout(500);

    await expect(page.locator("article.filter-bubble")).toHaveCount(0);
    await expect.poll(() => extension.badgeText(page)).toBe("");
  });

  test("keeps the per-item enabled flags across a disable/enable cycle", async ({
    extension,
    page,
    server,
  }) => {
    await extension.seed({
      topics: [
        { id: "topic-politics", text: ["politics"] },
        { enabled: false, id: "topic-sports", text: ["sports"] },
      ],
      websites: SEED.websites,
    });
    await page.goto(server.url("feed.html"));
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);

    await extension.setDisabled(true);
    await expect(page.locator("#a1")).not.toHaveClass(/filter-bubble/);
    await extension.setDisabled(false);

    // Re-enabling restores exactly the previous configuration: the disabled
    // "sports" topic stays disabled, so #a3 is still not filtered.
    await expect(page.locator("#a1")).toHaveClass(/filter-bubble--remove/);
    await expect(page.locator("#a3")).not.toHaveClass(/filter-bubble/);
  });
});
