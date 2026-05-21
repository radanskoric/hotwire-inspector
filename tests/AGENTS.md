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
