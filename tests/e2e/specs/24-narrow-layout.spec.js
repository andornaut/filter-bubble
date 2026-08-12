import { expect, test } from "../helpers/fixtures.js";
import { SEED } from "../helpers/seed.js";

const layoutAt = async (ui, width) => {
  await ui.setViewportSize({ height: 640, width });
  return ui.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
};

// Capability: the extension UI fits the window it is given. Firefox for Android
// is a declared target (`gecko_android`), and there the add-on's settings are
// embedded in the browser's own settings screen at phone width rather than
// opened as a desktop-sized popup.
test.describe("the UI at narrow widths", () => {
  test("fits a phone-sized viewport without scrolling sideways", async ({
    extension,
  }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();

    for (const width of [320, 360, 400, 500]) {
      const { client, scroll } = await layoutAt(ui, width);
      expect(
        scroll,
        `horizontal overflow at ${width}px: content ${scroll}px in ${client}px`,
      ).toBeLessThanOrEqual(client);
    }
  });

  test("keeps the desktop width it had before", async ({ extension }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();

    const widthAt = async (width) => {
      await ui.setViewportSize({ height: 640, width });
      return ui.evaluate(() =>
        Math.round(document.body.getBoundingClientRect().width),
      );
    };

    // Above the floor nothing about the layout changed: the width still comes
    // from `width: 100%` capped by `max-width: 600px`, and the floor is simply
    // never the binding constraint there.
    expect(await widthAt(800)).toBe(600);
    expect(await widthAt(620)).toBe(600);
    expect(await widthAt(520)).toBe(520);

    // Below it, the floor gives way rather than forcing a sideways scroll.
    expect(await widthAt(360)).toBe(360);
  });

  test("keeps every control reachable at phone width", async ({
    extension,
  }) => {
    await extension.seed(SEED);
    const ui = await extension.openWindow();
    await ui.setViewportSize({ height: 640, width: 360 });

    // Reachable is the point: a control pushed off the side of a viewport that
    // does not scroll sideways cannot be used at all.
    for (const control of [
      ui.getByRole("button", { name: "Add", exact: true }),
      ui.getByRole("button", { name: "Disable" }),
      ui.locator(".footer__status-link"),
    ]) {
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
    }

    // And still working, not merely visible.
    await ui.getByRole("button", { name: "Disable" }).click();
    await expect(ui.getByRole("button", { name: "Enable" })).toBeVisible();
  });

  test("wraps a long value instead of widening the page", async ({
    extension,
  }) => {
    await extension.seed({
      topics: [
        {
          id: "topic-long",
          text: ["a very long topic phrase that has no business fitting"],
        },
      ],
      websites: SEED.websites,
    });
    const ui = await extension.openWindow();

    const { client, scroll } = await layoutAt(ui, 360);
    expect(scroll).toBeLessThanOrEqual(client);
    await expect(ui.locator(".topics__text")).toBeVisible();
  });
});
