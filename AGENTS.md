# Agents

This file contains critical context for any agent working on this project.

## Project Overview

This repository contains **Hotwire Inspector**, a cross-browser DevTools extension for inspecting Hotwire-related page structure, including Turbo Frames and Stimulus controllers.

Core tooling currently includes:

- WXT
- Vite
- Vitest
- Playwright
- ESLint
- Prettier
- Stylelint
- TypeScript (checkJs, JSDoc-only)

## Important Files and Areas

- `docs/PLAN.md`
  - the phased implementation plan and broader project notes from initial implementation
- `docs/decisions/`
  - key technical decisions and rationale for the project
  - check this folder before making architecture or tooling changes
- `entrypoints/content.js`
  - content script logic for scanning, element lookup, highlighting, and inspect support
  - starts at document_start, installs the MAIN client before watchers/ports, and defers tree observation until DOMContentLoaded while parsing
- `entrypoints/main-world.content.js`
  - the single anonymous browser-registered MAIN bootstrap, delegating to `lib/main_world/runtime.js` with an empty production feature list
- `lib/main_world/`
  - shared feature lifecycle, RPC server, and pure wire validation; add future MAIN features here
- `lib/main-world-client.js`
  - isolated JSON document RPC client, with shared readiness probing and independent five-second deadlines
- `entrypoints/inspected-page-inject.js`
  - still lazily injected for all Stimulus storage and value/outlet definition requests; none have migrated to MAIN
- `entrypoints/devtools/`
  - DevTools page entrypoint that registers the Hotwire Inspector panel via WXT's `browser.devtools.panels.create`
- `entrypoints/panel/`
  - DevTools panel UI and interaction logic
  - tabs: Hotwire Elements (tree) and Turbo Events (live event timeline)
- `lib/tree-builder.js`
  - pure tree-building logic used by the panel
- `lib/controller-values.js`
  - pure Stimulus value logic; used by the injected page script (definition extraction), the content script (attribute resolution), and the panel (formatting)
- `lib/value-watcher.js`
  - MutationObserver-based Stimulus value watcher; used by the content script for live value streaming
- `lib/turbo-event-watcher.js`
  - capture-phase `document` listener for a curated set of Turbo DOM events; pushes each fire over the events port as a `TurboEventPush`
- `lib/port-reconnect.js`
  - port reconnection helper with exponential backoff; used by the content script for the events port
- `lib/panel/controllers/turbo-events-controller.js`
  - Stimulus controller owning the Turbo Events timeline (`lib/panel/controllers/turbo-events-controller.js`): cap, dropped-count notice, smart autoscroll, and the bridge subscription that drives `addEvent(name)`
- `lib/types.js`
  - shared JSDoc typedefs for the panel ↔ background ↔ content script ↔ inspected page messaging shapes (no runtime exports)
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

### Messaging architecture

The shared MAIN foundation uses distinct non-bubbling JSON-string request/response events directly on document. It currently advertises no feature operations; `bridgeStatus` is reserved. Imports/factories have no page effects, startup failures are contained per feature, and explicit teardown removes exact listeners even if feature cleanup throws. BFCache keeps MAIN listeners alive. Do not add another MAIN entrypoint, script insertion, eval, or page-global sentinel.

Document RPC is compatibility transport, not authentication. Page scripts can spoof requests/responses. MAIN has no extension privileges. Future controller storage is allowed only upon a valid request, but that does not authenticate a panel click. Equivalent code in MAIN and a script tag has comparable runtime effects; browser registration removes script-element mutation while eager listeners add idle footprint. See [ADR 5](docs/decisions/5%20-%20shared%20MAIN%20world.md) and the [main-world skill](.agents/skills/main-world/SKILL.md). Later migrations remain blocked until the actual-browser gate is complete.

The extension uses two messaging channels between the panel and the content script:

1. **One-shot relay** (panel → background → content script): the panel sends a `scan`, `highlight`, `unhighlight`, `inspect`, `watchValues`, or `unwatchValues` request via `browser.tabs.sendMessage` through the background relay. The content script responds via `browser.runtime.sendMessage`.
2. **Port-based event channel** (content script → background → panel): for live updates the content script opens a `ContentEventsPort` via `browser.runtime.connect` and pushes `ValuesChangedPush`, `TreeChangedPush`, or `TurboEventPush` messages.
   - `ValuesChangedPush` carries the current values of a watched controller.
   - `TreeChangedPush` is a lightweight signal that the inspected DOM may have changed and the panel should request a fresh scan. The background script also emits `TreeChangedPush` directly to the panel port when a tab finishes loading (`tabs.onUpdated` with `status === 'complete'`), so the tree refreshes after a reload or navigation. The content script listens to `pageshow` for back-forward-cache restores.
   - `TurboEventPush` carries the name, epoch timestamp, curated details, and target identity for each captured event (see [Turbo Events capture](#turbo-events-capture) below).
     The background script routes every content-port message to the matching panel's `PanelEventsPort`. Ports provide `onDisconnect` lifecycle awareness for clean teardown.

### Turbo Events capture

- **What is captured**: a curated list of Turbo 8.x DOM events (`lib/turbo-event-watcher.js` exports `TURBO_EVENT_NAMES`). The list is the single source of truth — both the watcher and any tests that need to assert coverage import it from this module. Add a new event by adding a string to that array; nothing else needs to change.
- **What is read from each event**: the watcher captures `event.type`, an epoch `Date.now()` timestamp, and curated details via `turboEventDetailsFor`. The content inspector adds `targetId` using existing in-memory identity. 
- **How capture is wired**: `TurboEventWatcher.start()` registers capture-phase (`useCapture: true`) listeners on `document` for each name in the list. `start()` is idempotent; calling it twice is a no-op. `stop()` removes exactly the listeners registered by `start()`. The class treats `document` opaquely — anything with `addEventListener`/`removeEventListener` (including a fake `EventTarget` in unit tests) works.
- **Capture is eager and ungated**: once the content script starts up, the watcher is running for the lifetime of the content script. There is no `watchTurboEvents`/`unwatchTurboEvents` one-shot handshake. This is a deliberate design choice — gating is a future optimization, not a v1 requirement. If you add a handshake, also wire matching cleanup in `ContentInspector.disconnect()`.
- **Push shape**: `{ type: TURBO_EVENT_PUSH_TYPE, name, timestamp, details, targetId }`. `TURBO_EVENT_PUSH_TYPE` lives in `lib/constants.js`; the `TurboEventPush` typedef lives in `lib/types.js`. The push rides the existing content→background→panel port pipeline.
- **Panel-side subscription**: `TurboEventsController.connect()` calls `PanelBridge.onTurboEvent(callback)`; the callback drives `addEvent(name)`, which appends one `.event-box`, trims to the cap, increments the dropped-count, and triggers smart autoscroll. The controller's `disconnect()` calls `PanelBridge.offTurboEvent()` to drop further push traffic — without this, a `TURBO_EVENT_PUSH_TYPE` arriving while the controller is between disconnect and reconnect would render into a torn-down subtree.
- **Rendering**: the cap (default 500), the dropped-count notice, the empty-state placeholder, and smart autoscroll all live in `lib/panel/controllers/turbo-events-controller.js`. The Stimulus target lifecycle (`eventTargetConnected`) is the single bookkeeping entry point — do not split trim/drop/autoscroll into separate hooks.

## Technical Decisions

Important decisions are documented in `docs/decisions/`.

At minimum, review those files when your work touches:

- extension tooling and build strategy
- DOM interaction strategy
- element identity or lookup behavior
- architectural decisions that may affect safety or debugging behavior

## Verification Expectations

When making meaningful changes, use the existing checks as appropriate:

- `npm run lint`
- `npm run lint:css`
- `npm run format:check`
- `npm run typecheck`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run build`

## Common Gotchas

- `npm run dev:firefox` targets Firefox MV3 and uses WXT's dev server. The default dev server port is `3000`; if another process is already using that port, Firefox may open but the extension can fail to load or run properly. Set `WXT_DEV_SERVER_PORT` to a free port before starting the dev server, e.g. `WXT_DEV_SERVER_PORT=3001 npm run dev:firefox`.

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

- Always use red/green TDD for behavior changes.
- Keep unit-tested application logic at 100% coverage across statements, branches, functions, and lines; do not reduce coverage for functions in `lib/**/*.js`.
- Keep JSDoc type annotations accurate when changing `lib/**` or messaging shapes; `npm run typecheck` must stay green.
- Type checking (`checkJs` via `jsconfig.json`) currently covers `lib/**`, `entrypoints/**`, and `scripts/**`; `tests/**` is intentionally out of scope until its files are annotated (ratchet candidate).
- Prefer minimal, targeted changes.
- Avoid introducing side effects in inspected pages.
- Treat `docs/decisions/` as the authoritative record for architectural choices unless intentionally updating those decisions.
