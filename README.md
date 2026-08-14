# Filter Bubble

[![CI](https://github.com/andornaut/filter-bubble/actions/workflows/release.yml/badge.svg)](https://github.com/andornaut/filter-bubble/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Filter Bubble is a Chrome and Firefox browser extension that hides web content matching topics you don't want to see.

- [Install for Chrome](https://chromewebstore.google.com/detail/cdfnpgngpkmlogkkeaafpdahppapgnoo)
- [Install for Firefox](https://addons.mozilla.org/en-CA/firefox/addon/filter-bubble/)

[![Filter out topics](./resources/screenshots/screenshot-topics.png)](./resources/screenshots/screenshot-topics.png)

## How it works

1. Add the **topics** you want to hide.
1. For each website, add [CSS selectors](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors) targeting the content blocks or feed items that might contain those topics.
1. When a topic appears inside a targeted element, the element is hidden or removed.

A handful of websites are configured out of the box. Adding others means writing the selectors yourself and granting Filter Bubble access to them.

Topic phrases match as whole words, case-insensitively, and literally: punctuation is punctuation, not a pattern. Only rendered text inside a targeted element counts.

| Feature       | What it does                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Remove / hide | Per website: the block goes, or keeps its space                                                    |
| Highlight     | While the popup is open, matches stay on screen, highlighted                                       |
| Badge         | Counts the blocks filtered on the current tab                                                      |
| Off switch    | Pauses filtering in this browser, changing nothing you configured                                  |
| Sync          | Topics and websites sync between browsers signed into the same profile; the off switch stays local |
| Export/Import | Moves a configuration between browsers as a JSON file                                              |

[![Per-website selectors](./resources/screenshots/screenshot-websites.png)](./resources/screenshots/screenshot-websites.png)

## Developing

Install [Node](https://nodejs.org/) (version in [`.nvmrc`](.nvmrc)), then:

```bash
npm install
npm start
```

`npm test`, `npm run lint` and `npm run build` cover the rest; [`package.json`](./package.json) lists every script.

### Android

`npm run start:android` runs the extension on a USB-connected device. See the [Extension Workshop guide](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/) for the full walkthrough:

1. Enable Android developer options and USB debugging, and turn on "Remote Debugging via USB" in Firefox for Android.
1. Install `adb`: `sudo apt install adb`
1. On Linux, grant USB access with a udev rule (replace `idVendor` with the value from `dmesg`):

   ```bash
   echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="18d1", MODE="0666", GROUP="plugdev"' \
     | sudo tee /etc/udev/rules.d/50-android-usb.rules
   ```

1. Connect the device, run `adb devices`, and authorize the computer when prompted.

### Publishing

Tagged releases (`v*`) build a packaged extension via [GitHub Actions](.github/workflows/release.yml):

1. Match `version` in [`package.json`](./package.json) and [`manifest.json`](./manifest.json).
1. Commit, then tag and push:

   ```bash
   git tag v0.x.x
   git push && git push --tags
   ```

Build locally with `npm run package` (output in `web-ext-artifacts/`). Store dashboards: [Chrome](https://chromewebstore.google.com/devconsole/), [Firefox](https://addons.mozilla.org/en-US/developers/addons).
