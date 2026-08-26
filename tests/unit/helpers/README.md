# Unit test helpers

This folder holds helper modules shared across multiple unit test files. They are test-internal scaffolding — they have no extension runtime purpose and are not loaded by `entrypoints/`.

## Conventions

- One helper module per concern. Current files: `port.js` for fake extension ports, `fake-timers.js` for vitest timer control.
- Each module exports named helpers (no default exports).
- If a helper is used by exactly one test file, define it inline in that file near its existing helpers (`mountPanelDom`, `createBridge`, etc.) and only promote it here once a second file adopts it.
- Helpers must not produce or mutate state on the source tree; they are test-internal.

## What lives here vs elsewhere

- This folder is for shared unit-test scaffolding. Keep it distinct from `tests/e2e/support/`, which serves E2E panel fixtures and browser mechanics (see `tests/README.md`).
- DOM scaffolding that only one test file needs (e.g. the panel layout fixture in `tests/unit/panel-app.test.js`) stays inline.

## Current modules

- `port.js` — `createFakeExtensionPort({ name?, sender? })` builds a fake `runtime.Port`-like with `postMessage`, `onMessage`, `onDisconnect` listener bags, a `disconnect` spy, and a `_listeners` collection for assertions. Used by background, content-inspector, and panel-bridge unit tests for the content-script / extension port surfaces.
- `fake-timers.js` — `withFakeTimers(fn)` enables fake timers for the duration of an async function and restores real timers afterwards. Used by content-inspector and panel-app unit tests where individual test bodies need a controlled timer context.

## Adding a new helper

- Promote an inline helper from a single test file once a second file adopts it. Move it to `tests/unit/helpers/<name>.js` with a JSDoc typedef for its options.
- If the helper wraps a vitest primitive (timers, mocks, fake classes), name the file after that primitive (`fake-timers.js`, `port.js`).
