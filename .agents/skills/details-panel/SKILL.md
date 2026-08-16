---
name: details-panel
description: Use when working on the Hotwire Inspector details panel (the slide-over aside in the DevTools panel UI) — adding or changing content, behavior, or styling, or reusing the panel for new kinds of details.
---

# Details panel

The details panel is a slide-over panel anchored to the right edge of the Hotwire Inspector DevTools panel. It is a general-purpose UI element: it opens on demand for a tree item, shows detail content, and reconciles itself against fresh scan data on every refresh.

## Key files

- `entrypoints/panel/index.html` — the static `<aside id="details-panel">` markup: header (title + action buttons) and body (collapsible `<details>` sections)
- `lib/panel/controllers/details-panel-controller.js` — its Stimulus controller (`details-panel`), extends `PanelController`
- `lib/panel/controllers/panel-node-controller.js` — dispatches the open event when a tree badge is clicked
- `lib/panel-app.js` — `refreshTree()` dispatches the refresh event after every scan
- `lib/constants.js` — event name constants (`SHOW_CONTROLLER_DETAILS_EVENT`, `SCAN_REFRESHED_EVENT`)
- `lib/types.js` — JSDoc typedefs for the event payloads
- `entrypoints/panel/style.css` — all `.details-panel*` styles
- `tests/unit/details-panel-controller.test.js` and `tests/e2e/support/panel-assertions.js` (see `openDetailsPanel`) — tests

## Architecture

- **Communication is event-based, via CustomEvents on `document`** (not `window`): a panel-internal `show` event opens the panel with a payload identifying what to display; a `scan-refreshed` event carries the fresh `ScanItem[]` after every refresh. Listeners are wired declaratively in the aside's `data-action` attribute (`<event>@document->details-panel#show`, `...#refresh`, `keydown.esc@window->details-panel#close`). Synthetic events go on `document` (typed, no casts); real keyboard events stay `@window` (keydowns bubble up to window).
- **Open state is the `.open` CSS class**, never the `hidden` attribute — the global `[hidden] { display: none !important }` rule would kill the slide transition.
- **Panel state lives in Stimulus values** (persisted as dataset attributes on the aside), so it survives re-renders of the tree and is inspectable in the DOM.
- **Refresh contract**: on every refresh (success or error — error carries an empty item list), the open panel looks up its item in the fresh scan data. If the item is gone or no longer valid, the panel closes; otherwise it re-renders in place. Any new content or new detail kind must preserve this contract.
- **Static markup, dynamic content via targets**: the aside is fully static in `index.html`; the controller fills in dynamic parts through Stimulus targets. Keep it that way when adding content — do not clone templates or inject markup for the panel itself.
- **Reusing the panel for other detail kinds** (e.g. turbo-frame history): follow the same pattern — a typed CustomEvent (new constant in `lib/constants.js`, payload typedef in `lib/types.js`) dispatched on `document`, a `show`-style action that stores identity in values and renders content, and reconciliation in `refresh`. Generalize the payload deliberately instead of bolting on kind-specific branches.

## Layout and styling rules

The stylesheet (`entrypoints/panel/style.css`, `.details-panel*` rules) is the source of truth — look up the current declarations there instead of trusting any summary here. What matters is preserving the invariants behind them:

- **App-shell layout**: the panel page itself never scrolls; the tree area and the panel body are independent scroll regions. The panel stays pinned below the toolbar — never overlap it (Refresh must stay clickable at any panel width). Do not reintroduce page-level scrolling.
- **Slide transition**: the panel slides via a transform transition and must stay visible for the entire slide-out. Do not "simplify" the visibility handling to `transition-behavior: allow-discrete` — discrete animation flips at 50% and the panel would vanish mid-slide.
- **Sections are pure `<details>`/`<summary>`** — no custom JS. The native marker is suppressed via `display` on `summary` (per HTML spec the marker only renders for `display: list-item`). There is intentionally **no content expand/collapse animation** — a `::details-content` discrete animation was tried and removed for choppiness. Do not re-add one without asking.
- Follow the existing design-token conventions: `--color-*`/`--space-*` variables, component-level fallback custom properties (`var(--details-panel-x, <default>)`), logical properties (`inset-block`, `margin-inline-start`, ...). Keep `npm run lint:css` clean.

## Working on the panel

- Unit test conventions (`tests/unit/details-panel-controller.test.js`): `// @vitest-environment happy-dom` pragma, a real Stimulus `Application.start()`, bridge mocked on `document[PANEL_BRIDGE_PROPERTY]` with only the methods under test, CustomEvents dispatched on `document`, `await Promise.resolve()` after DOM changes, and the aside markup mirrored from `index.html`.
- E2E conventions: helpers live in `tests/e2e/support/panel-assertions.js` (reuse `openDetailsPanel`); use browser-agnostic locators only (the suite runs on both Chromium and Firefox). Playwright's `toBeVisible`/`toBeHidden` auto-retry absorbs the slide transition's delayed visibility flip — never add fixed sleeps.

## Boundaries

- The panel never touches the inspected page directly. Reading page state goes through `PanelController`'s bridge proxies (`sendToInspectedTab`, `storeControllerNode`, ...) which relay panel → background → content script. New page reads mean a new message type (constant + typedef + content-script handling + e2e coverage), not direct DOM access.
