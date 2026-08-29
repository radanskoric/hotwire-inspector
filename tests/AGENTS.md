# Agents

Testing guidance for coding agents working in this folder.

## Scope

- Unit tests live in `unit/` and use Vitest.
- E2E tests live in `e2e/` and use Playwright.
- Read `tests/README.md` before changing E2E setup.

## E2E expectations

- Keep the existing Chromium suite stable unless the task explicitly asks to change it.
- Chromium E2E tests are the broader suite and rely on real extension loading plus DevTools-frame messaging.
- Firefox E2E supports shared panel behavior through mocked panel APIs plus a focused smoke test.
- Do not assume Firefox can use the same extension-loading or DevTools automation path as Chromium.
- Keep browser mechanics in `e2e/adapters/` and reusable panel fixtures/assertions in `e2e/support/`.
- Content-script E2E fixture pages must be served over HTTP via `withStaticServer(fixturesRoot, ...)`; do not load them with `file://` URLs because the production content script only matches `http://*/*` and `https://*/*`.

## Commands

Use the smallest relevant check first:

```bash
npm test -- --run
npm run build && npm run test:e2e
npm run build && npm run build:firefox && npm run test:e2e:hybrid
npm run build:firefox && npm run test:e2e:firefox
```

Run Firefox smoke separately from the default Chromium E2E suite.

## Change guidance

- Prefer shared fixtures/assertions only after proving browser-specific harness behavior.
- Avoid broad cross-browser refactors unless requested.
- Use adapter capabilities for unsupported browser mechanics instead of broad hidden skips.
- If changing content-script messages, panel rendering, or extension loading, update related E2E tests and docs.

## Mock seams

- `addMockPanelApis` in `tests/e2e/support/panel-assertions.js` mocks `browser.runtime.connect` to return a fake events port. Use `getEventsPortName()` to read the port name, `simulateValuesChanged()` to push a mock values-changed message, and `simulateEventsPortDisconnect()` to trigger the port's `onDisconnect` listeners. These helpers are used by `panel.spec.js` live-update tests.

### Observing content-script pushes from the devtools frame

For tests that need to observe the actual `TURBO_EVENT_PUSH_TYPE` (or any push) traffic flowing over the content→background→panel port pipeline, use `withPanelMessagesListener(frame, body)` from `tests/e2e/helpers.js` (defined in `tests/e2e/adapters/chromium-adapter.js`). It impersonates the inspected tab's panel port from the devtools frame by connecting with `${PANEL_EVENTS_PORT_NAME_PREFIX}${chrome.devtools.inspectedWindow.tabId}` — the background treats the connection as the panel's events port and relays each content-side push onto it. The handler receives a `readMessages()` function suitable for `expect.poll`. The port is disconnected and the frame globals are cleared in `finally` so `panelPortsByTab` is released for the next test. There is no production-code test seam; everything runs through the real extension message bus, so the test asserts on the same shapes the real panel observes.
