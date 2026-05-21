# Hotwire Inspector

Cross-browser DevTools extension for working with Hotwire powered applications. Built with WXT and Vite, and Vitest and Playwright for testing.

## Why Hotwire Inspector?

Hotwire Inspector exists to make it easier to understand the structure of Hotwire-powered pages, especially Turbo Frames and Stimulus controllers, directly from the browser's DevTools.

There are existing tools but I wanted a cross browser extension that integrates into the browser's DevTools panel rather than opening a separate window.

### Hotwire Inspector works hard to not interfere with your application

An important goal of the project is to inspect the page without disturbing it. Hotwire Inspector works hard to avoid interfering with the page by:
1. Tracking the elements on the page inside the extension rather than writing tracking attributes into the target DOM. This requires never holding a strong reference to the elements, so they can be garbage collected. Element's ID is used when possible and [WeakMap](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap) and [WeakRef](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef) are used whenever a direct reference to the element object is needed.
2. Highlighting is done by inserting absolutely positioned elements into the root of the DOM rather than modifying the target elements directly. This is the minimal possible intrusion into the DOM that allows visual highlighting.
3. Controller instance storage uses a WXT-injected page script element to find and track controller instances. The script listens only on its own element. The only writes to the page's global scope are `window.tempN` variables that are only set after a user requests it. This approach is selected because the only alternative is eval-ing code in the context of the page. A single isolated script is a cleaner approach.

This approach helps reduce debugging noise, avoids surprising side effects, and keeps the inspected page behavior as close as possible to its normal runtime behavior.

## Architecture

Hotwire Inspector is split across the extension's DevTools panel, background script, content script, and a small injected page-context script. Messages flow from the panel toward the inspected page, while scan results and inspection data flow back through the same path.

```text
┌──────────────────────────────┐
│ Browser DevTools             │
│  ┌─────────────────────────┐ │
│  │ Hotwire Inspector Panel │ │
│  │                         │ │
│  │ entrypoints/panel/      │ │
│  └───────────┬─────────────┘ │
└──────────────▲───────────────┘
               │ extension messages
               ▼
┌──────────────────────────────┐
│ Background script            │
│                              │
│ entrypoints/background.js    │
└──────────────┬───────────────┘
               ▲
               | tab/content-script messages
               ▼
┌──────────────────────────────┐
│ Content script               │
│                              │
│ entrypoints/content.js       │
│                              │
│ - scans Turbo Frames         │
│ - detects Stimulus metadata  │
│ - highlights inspected nodes │
└──────────────┬───────────────┘
               │ injects page-context script
               ▼
┌──────────────────────────────┐
│ Inspected page context       │
│                              │
│ inspected-page-inject.js     │
│                              │
│ - track controller instances │
└──────────────────────────────┘
```

## Local development with hot reloading

To run the extension locally with hot reloading:

1. Install dependencies:

```bash
npm install
```

2. Start the extension in development mode:

```bash
npm run dev
```

For Firefox, use:

```bash
npm run dev:firefox
```

WXT will build the extension in watch mode and reload it as you make changes.

### Testing in the browser

- Chrome
  - run `npm run dev`
  - open the browser instance started by WXT
  - open DevTools on a page you want to inspect
  - open the `Hotwire Inspector` panel

- Firefox
  - run `npm run dev:firefox`
  - open the Firefox instance started by WXT
  - open DevTools on a page you want to inspect
  - open the `Hotwire Inspector` panel

### Panel appearance

The panel follows the operating system color scheme by default. Use the theme switcher next to `Refresh` to choose `System`, `Light`, or `Dark`.

The selected mode is saved locally for the extension panel. It only changes Hotwire Inspector's DevTools UI and does not modify the inspected page.

### Testing from a dev container

If you are developing inside a dev container, the build and watch commands still run there, but browser launch usually does not cross from the container to the host browser automatically.

- run `npm run dev` or `npm run dev:firefox` inside the container to keep the extension rebuilding in watch mode
- load the extension manually in the browser running on your host machine from the appropriate `output/...` directory if needed
- expect to reload the extension manually in the host browser after changes instead of relying on full automatic hot reload
- refresh the inspected page or reopen the DevTools panel if the updated extension state is not picked up immediately

### Useful verification commands

```bash
npm test -- --run
npm run test:e2e
npm run build
```

## How E2E tests work

The E2E tests use Playwright to launch a real Chromium browser with the built extension loaded. They are split into two files that cover different parts of the extension.

### Content-script tests (`content-script.spec.js`)

Because Playwright's bundled Chromium does not visually render custom DevTools panels, these tests verify the content-script pipeline by messaging through the extension's devtools frame — the same way the real panel communicates:

1. Launches Chromium with the extension and auto-opens DevTools
2. Navigates to a fixture page containing Turbo Frames and Stimulus controllers
3. Finds the extension's `devtools.html` frame inside the DevTools window
4. Sends messages (scan, highlight, inspect, etc.) to the content script through that frame
5. Asserts on the content script responses and on visible page-side effects like highlight styles

### Panel UI tests (`panel.spec.js`)

These test the panel rendering by loading `panel.html` directly as a standalone extension page:

1. Launches Chromium with the extension loaded
2. Injects mocked extension APIs before the panel script runs
3. Navigates to the panel page — it renders against the mock data
4. Asserts on the rendered DOM: tree nodes, badges, summary text, empty and error states, refresh behavior

Together, the two files exercise the full extension pipeline end-to-end: extension loading, DevTools registration, content script injection, DOM scanning, highlighting, element inspection, and panel rendering.

A virtual display server (`Xvfb`) is started automatically on Linux when no display is available, so the tests work inside dev containers without extra setup.

To run the E2E tests:

```bash
npm run build
npm run test:e2e
```

## Acknowledgements

- The extension icon is a color customized version of "Lightning spanner" icon from the [game-icons.net](https://game-icons.net/) project.
- The UI icons are from [heroicons.com](https://heroicons.com/).
