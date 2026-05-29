# Tests

This folder contains unit tests and browser-level E2E tests for Hotwire Inspector.

## Unit tests

Unit tests live in `tests/unit/` and run with Vitest.

```bash
npm test -- --run
```

They cover pure logic and DOM-level behavior that does not need a real browser extension context.

## Unit test coverage

Vitest coverage tracks unit-test coverage for source files in `entrypoints/` and `lib/`, including line and branch coverage.

```bash
npm run coverage
```

The command prints a text summary and writes an HTML report to `coverage/`. It does not include Playwright E2E coverage.

## E2E tests

E2E tests live in `tests/e2e/` and run with Playwright.

```bash
npm run build
npm run test:e2e
```

The default E2E command is Chromium-focused. It loads the built Chrome extension from `output/chrome-mv3` and verifies the real extension pipeline where practical.

The hybrid E2E command runs adapter-backed panel UI behavior in Chromium and Firefox:

```bash
npm run build
npm run build:firefox
npm run test:e2e:hybrid
```

## Chromium E2E setup

Chromium tests use `tests/e2e/playwright.config.js` and the Chromium adapter in `tests/e2e/adapters/chromium-adapter.js`. `tests/e2e/helpers.js` keeps compatibility exports for existing content-script tests.

They cover two paths:

- **Content script pipeline**: launches Chromium with the extension loaded, opens DevTools, finds the extension `devtools.html` frame, and sends messages to the content script.
- **Panel UI**: opens `panel.html` directly as a `chrome-extension://` page and injects mocked extension APIs before the panel code runs.

On Linux, the helpers start `Xvfb` when no display is available because extension DevTools testing needs headed Chromium.

## Firefox E2E setup

Firefox currently supports adapter-backed panel UI tests and a focused smoke suite.

```bash
npm run build:firefox
npm run test:e2e:firefox
```

The Firefox smoke test uses `tests/e2e/playwright.firefox.config.js` and `tests/e2e/firefox-smoke.spec.js`.

Firefox does not yet load the extension into Firefox DevTools. Instead, the Firefox adapter serves the built Firefox output from `output/firefox-mv3`, opens the built `panel.html` in Playwright Firefox, injects mocked extension APIs, and verifies that the Firefox-built panel bundle renders expected scan data.

This allows shared panel UI behavior assertions to run in Firefox while keeping content-script messaging explicitly unsupported until a real Firefox extension transport is proven.

## Hybrid E2E structure

- **Adapters**: `tests/e2e/adapters/` owns browser mechanics such as extension paths, URL schemes, direct panel loading, DevTools frame lookup, and messaging capabilities.
- **Support helpers**: `tests/e2e/support/` owns reusable fixtures, static serving, mocked panel APIs, and shared assertions.
- **Specs**: behavior specs call adapter APIs and capability-gate unsupported browser mechanics.

## Practical difference

- **Chromium**: broader coverage, real extension loading, DevTools frame messaging, content-script checks, and adapter-backed panel UI checks.
- **Firefox**: shared panel UI coverage plus a focused smoke check of the built Firefox panel bundle with mocked APIs.

Future Firefox work can add content-script coverage only after extension loading and DevTools/content-script messaging are reliable in Playwright Firefox.
