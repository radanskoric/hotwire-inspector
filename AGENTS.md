# Agents

This file contains critical context for any agent working on this project.

## Project Overview

This repository contains **Hotwire Inspector**, a cross-browser DevTools extension for inspecting Hotwire-related page structure, including Turbo Frames and Stimulus controllers.

Core tooling currently includes:

- WXT
- Vite
- Vitest
- Playwright

## Important Files and Areas

- `docs/PLAN.md`
  - the phased implementation plan and broader project notes from initial implementation
- `docs/decisions/`
  - key technical decisions and rationale for the project
  - check this folder before making architecture or tooling changes
- `entrypoints/content.js`
  - content script logic for scanning, element lookup, highlighting, and inspect support
- `entrypoints/devtools/`
  - DevTools page entrypoint that registers the Hotwire Inspector panel via WXT's `browser.devtools.panels.create`
- `entrypoints/panel/`
  - DevTools panel UI and interaction logic
- `lib/tree-builder.js`
  - pure tree-building logic used by the panel
- `tests/unit/`
  - unit tests
- `tests/e2e/helpers.js`
  - shared Playwright helpers: Xvfb management, Chromium extension context, devtools frame discovery, content-script messaging
- `tests/e2e/content-script.spec.js`
  - E2E tests for the content-script pipeline (scanning, highlighting, inspect, parent-child relationships)
- `tests/e2e/panel.spec.js`
  - E2E tests for the panel UI rendering (tree nodes, badges, summary, empty/error states, refresh)
  - see the E2E Testing section below for how both files work

## Critical Project Expectations

- Do not mutate the target page DOM for tracking purposes.
- Preserve the current in-memory element identity approach unless there is a strong reason to change it. Always ask before making such changes.
- Prefer changes that keep the inspected page behavior as close to untouched runtime behavior as possible.
- Keep the extension cross-browser friendly.
- If you change central behavior in the content script or panel messaging, review the related E2E tests.

## Technical Decisions

Important decisions are documented in `docs/decisions/`.

At minimum, review those files when your work touches:

- extension tooling and build strategy
- DOM interaction strategy
- element identity or lookup behavior
- architectural decisions that may affect safety or debugging behavior

## Verification Expectations

When making meaningful changes, use the existing checks as appropriate:

- `npm test -- --run`
- `npm run test:e2e`
- `npm run build`

## E2E Testing

The Chromium E2E tests use Playwright with a real extension loaded into the browser. They are split into two files with different strategies:

### Content-script tests (`content-script.spec.js`)

These do **not** interact with the DevTools panel UI directly because Playwright's bundled Chromium does not render extension DevTools panels (the `chrome.devtools.panels.create` API succeeds but the panel tab/iframe never appears).

Instead, the tests verify the full content-script pipeline by messaging through the extension's devtools frame:

1. Launch Chromium with `--auto-open-devtools-for-tabs` and the extension loaded
2. Find the DevTools page and locate the extension's `devtools.html` iframe
3. Use `chrome.devtools.inspectedWindow.tabId` and `chrome.tabs.sendMessage()` from that frame to send messages to the content script
4. Assert on the content script responses and on page-side effects (e.g. highlight styles)

### Panel UI tests (`panel.spec.js`)

These test the panel rendering by loading `panel.html` directly as a `chrome-extension://` page:

1. Launch Chromium with the extension loaded
2. Extract the extension ID from the devtools frame URL
3. Use `page.addInitScript()` to inject mock extension APIs before `main.js` runs
4. Navigate to `chrome-extension://<id>/panel.html` — `PanelApp` constructs against the mock and renders
5. Assert on the rendered DOM (tree nodes, badges, summary text, empty/error states)

The mock `browser.tabs.sendMessage` is configured per-test to return controlled scan data, reject to simulate errors, or return different responses on successive calls (for refresh tests).

### Key infrastructure details

- `PW_CHROMIUM_ATTACH_TO_OTHER=1` enables Playwright to attach to the DevTools page
- `ignoreDefaultArgs: ['--disable-extensions']` prevents Playwright from disabling extensions
- `Xvfb` is auto-started on Linux when no `DISPLAY` is set (needed for headed Chromium in containers)
- `workers: 1` in the Playwright config — multiple headed Chromium instances on a shared Xvfb display cause race conditions
- `about:blank` does not have a content script, so messaging rejects — this is tested with `.rejects.toThrow()`
- CSS shorthand properties (e.g. `outline`) are serialized differently across browsers — test individual sub-properties instead
- Chrome (`channel: 'chrome'`) is not available on Linux ARM64 via Playwright; the tests use bundled Chromium

If you change content script message types, the devtools entrypoint, or the panel rendering logic, update the corresponding E2E tests.

## Working Style

- Prefer minimal, targeted changes.
- Avoid introducing side effects in inspected pages.
- Treat `docs/decisions/` as the authoritative record for architectural choices unless intentionally updating those decisions.
