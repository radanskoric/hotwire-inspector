# Details panel — Targets & Outlets sections

Execution plan for implementing the two remaining `TODO` sections in the Hotwire Inspector details panel: **Targets** and **Outlets**.

## Goal

Render the Stimulus **targets** and **outlets** of the controller currently shown in the details panel. Both are lists of elements and share the same row layout, so the rendering logic is factored into one shared template + method.

### Targets

List every element that is a target of the shown Stimulus controller. Each row renders like a tree-view node — **reveal-in-elements icon**, tag type, element id, and target name — **without** the target icon and without the `controller#` prefix on the name (the controller is already implied by the panel context). Empty state: **"No targets"**.

### Outlets

List every element that is an outlet of the shown Stimulus controller. Same row layout (reveal icon, tag type, element id), with the outlet name rendered as a **badge reusing the tree-view `.badge` style**. Clicking the badge loads the outlet controller in the details panel — same flow as clicking a controller badge in the tree: it dispatches `SHOW_CONTROLLER_DETAILS_EVENT` with the **outlet element's nodeId** and the **outlet name as the identifier** (per Stimulus, the outlet name equals the target controller's identifier). Empty state: **"No outlets"**.

### Shared assumptions (confirmed)

- Outlets data source: **injected-page-script based** (option A), mirroring the values pipeline — the injected script retrieves the outlet _definitions_ (`static outlets`), and the content script resolves the actual element refs from the DOM and is the sole owner of page-state reading.
- Loading state: each section shows **"Loading…"** while fetching, then **"No targets"** / **"No outlets"** when empty — matching the values section.
- Outlet badge click → details panel reload uses **outlet name as identifier** + **outlet element's nodeId**.

## Current state (findings)

- **TODOs**: `entrypoints/panel/index.html:94` (Targets) and `:98` (Outlets) — plain `<div>...TODO</div>`, not wired to the controller. Mirrored in `tests/unit/details-panel-controller.test.js:48,52` and asserted in `tests/e2e/support/panel-assertions.js:519-522`.
- **Details panel controller** (`lib/panel/controllers/details-panel-controller.js`) only registers Stimulus targets `identifier` + `values`. Values are fetched **on demand** via `bridge.controllerValues(id, identifier)` (panel → background → content script → injected page script for definitions, then DOM attribute resolution in the content script). Live updates arrive over the events port; a `SCAN_REFRESHED_EVENT` triggers `refresh()` which re-loads values and closes the panel if the controller is gone.
- **Targets already exist in the scan** but are attached to the _target element_ (`ScanTarget = {controller, name}`) — there is no per-controller-instance view and no element identity carried on `ScanTarget`. The content script already has `findControllerTargets(element, controller)` (`lib/content-inspector.js:483`).
- **Outlets do not exist anywhere** — no scan field, no typedef, no injected-script support.
- **Stimulus outlets recap**: `static outlets = ["user-status"]` on the controller class + `data-[identifier]-[outlet]-outlet="[selector]"` on the host element; the outlet name **equals the target controller's identifier**; an empty/absent selector defaults to `[data-controller~="[outlet]"]` (Stimulus's default-selector feature). Outlet names are readable via `controller.constructor.outlets` (blessed by `readInheritableStaticArrayValues`).
- **Reuse opportunities**:
  - `PanelNodeController` (`lib/panel/controllers/panel-node-controller.js`) is registered in the same Stimulus application as the details panel, so `data-controller="panel-node"` elements placed _inside_ the details panel are auto-wired by Stimulus. Its `inspect()` (reveal in Elements) and `showDetails()` (dispatch `SHOW_CONTROLLER_DETAILS_EVENT`) are reused verbatim.
  - CSS classes `.icon`, `.icon-btn`, `.node-kind`, `.node-id`, `.badge` already exist and are reused as-is.

## Architecture

Both Targets and Outlets are **on-demand fetches** identical in shape to values: a new content-script message type → a `ContentInspector` method → a `PanelBridge` method → a `PanelController` proxy → `DetailsPanelController` loads & renders on `show`/`refresh`. **No changes to the scan data model** (`ScanTarget`/`ScanItem` stay as-is), preserving the element-identity invariant and the existing tree/target-badge behavior.

**Shared rendering**: a new `<template id="details-element-row-template">` (reveal icon + tag + id + name) cloned by one `renderElementRows(container, entries, { badge })` method used by both sections. Each row carries `data-controller="panel-node"` + `data-panel-node-id-value` so the reveal icon reuses `panel-node#inspect`. For outlets, the name span additionally gets `.badge` + `data-controller-identifier` + `data-action="click->panel-node#showDetails"` (reusing the controller-badge style and the existing show-details flow).

### Refresh contract

Mirrors the values contract: on `SCAN_REFRESHED_EVENT`, if the panel is open and the controller is still present, all three sections (values, targets, outlets) are re-fetched and re-rendered; otherwise the panel closes. Stale async responses (panel closed, or a different controller/node shown mid-fetch) are discarded via the same node-id/identifier guard used by `loadValues`.

## Phases

### Phase 1 — Shared row template + CSS

**TDD**: update the unit-test fixture HTML and the e2e assertion first.

- `entrypoints/panel/index.html`:
  - Replace the Targets `TODO` div with `<div class="details-panel-section-content" data-details-panel-target="targets"></div>`.
  - Replace the Outlets `TODO` div with `<div class="details-panel-section-content" data-details-panel-target="outlets"></div>`.
  - Add `<template id="details-element-row-template">` containing: a `.element-row` div (`data-controller="panel-node"`, `data-panel-node-id-value=""`), the reveal `<img src="/icons/reveal-in-elements.svg" class="icon icon-btn" data-action="click->panel-node#inspect" alt="" aria-hidden="true">`, `<span class="node-kind">`, `<span class="node-id">`, `<span class="element-name">`.
- `entrypoints/panel/style.css`: add `.element-row` (flex baseline, gap `--space-inline`, padding like `.value-row`), `.element-name` (muted). Reuse `.node-kind`/`.node-id`/`.icon`/`.icon-btn`/`.badge` as-is. Add `.details-note` (italic muted) for empty/loading notes, used by both targets and outlets sections.
- `tests/unit/details-panel-controller.test.js`: update the fixture (lines 47-53) to match the new HTML.
- `tests/e2e/support/panel-assertions.js` `withExpectedDetailsPanelSections` (lines 505-522): replace the "TODO" assertion with assertions against rendered targets/outlets content (counts/empty notes), parameterized by mock responses.

### Phase 2 — Targets end-to-end

**New types** (`lib/types.js`):

- `ControllerTargetEntry { id, tagName, name }`
- `ControllerTargetsRequest { type, id, identifier }`
- `ControllerTargetsResponse` (`{ success: true, targets: ControllerTargetEntry[] } | { success: false, error: string }`)
- Add `ControllerTargetsRequest` to the `ContentRequest` union.

**New constant** (`lib/constants.js`): `CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE`.

**Content script** (`lib/content-inspector.js`): add `controllerTargets(id, identifier)` — find the host element, reuse `findControllerTargets`, map each result to `{ id: this.getElementKey(el), tagName: el.tagName.toLowerCase(), name }`. Returns `{ success: true, targets }` / error. No injected script involved.

**Content script entry** (`entrypoints/content.js`): handle `CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE` → `inspector.controllerTargets(...).then(sendResponse)`.

**Bridge** (`lib/panel-bridge.js`): `controllerTargets(id, identifier)` sending the new message type.

**Panel proxy** (`lib/panel/controllers/panel-controller.js`): `controllerTargets(id, identifier)`.

**Details panel controller** (`lib/panel/controllers/details-panel-controller.js`):

- `static targets = ["identifier", "values", "targets", "outlets"]`.
- `loadTargets()` — mirrors `loadValues` guards (stale-response discard on close/identifier/node change), shows "Loading…" note, fetches, renders.
- `renderTargets(entries)` → `renderElementRows(this.targetsTarget, entries, { badge: false })`; empty → note "No targets".
- `show()` calls `loadValues().then(() => this.watchValues())` **and** `loadTargets()` (and `loadOutlets()` in Phase 3).
- `refresh()` re-loads all three sections when the controller is still present.
- Shared `renderElementRows(container, entries, { badge })` — clones `#details-element-row-template` per entry; sets `data-panel-node-id-value`, `.node-kind`, `.node-id` (hidden when `id.startsWith(ID_PREFIX)`), and the name (plain for targets; for outlets the name span additionally gets `.badge` + `data-controller-identifier` + `data-action="click->panel-node#showDetails"`).
- Shared `showNote(container, message)` toggling `.details-note`.

**Tests**:

- Unit (`tests/unit/details-panel-controller.test.js`): mock `controllerTargets` on the bridge; assert rows render (tagName, id, name), reveal-icon wiring, "No targets" empty state, stale-response discard, re-fetch on refresh. Bridge mock is already set up in `beforeEach`.
- E2E (`tests/e2e/support/panel-assertions.js`): extend `addMockPanelApis` mock `browser.runtime.sendMessage` to return a `targetsResponse` for `CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE`; add fixture in `panel-fixtures.js`.

### Phase 3 — Outlets end-to-end

**New constants** (`lib/constants.js`):

- `CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE`
- `CONTROLLER_OUTLET_DEFINITIONS_REQUEST_EVENT`
- `CONTROLLER_OUTLET_DEFINITIONS_RESPONSE_EVENT`

**New types** (`lib/types.js`):

- `ControllerOutletEntry { id, tagName, name }`
- `ControllerOutletsRequest { type, id, identifier }`
- `ControllerOutletsResponse` (`{ success: true, outlets: ControllerOutletEntry[] } | { success: false, error: string }`)
- `ControllerOutletDefinitionsResponse` (`{ success: true, outlets: string[] } | { success: false, error: string }`)
- `ControllerOutletDefinitionsRequestDetail { selector, identifier, requestId }`
- `ControllerOutletDefinitionsResponseDetail` (`ControllerOutletDefinitionsResponse & { requestId }`)
- Add `ControllerOutletsRequest` to the `ContentRequest` union.

**New extraction helper** (`lib/controller-outlets.js`, mirroring `lib/controller-values.js`): `extractControllerOutletDefinitions(controller)` → reads `controller.constructor.outlets` defensively (returns `[]` if absent or non-array). Unit-tested in isolation (100% coverage rule for `lib/**`).

**Injected page script** (`entrypoints/inspected-page-inject.js`): register `getOutletDefinitions` via `onRequest(...)` with the new event pair; reuses `findController`; returns `{ success: true, outlets: extractControllerOutletDefinitions(controller) }`.

**Content script** (`lib/content-inspector.js`): add `controllerOutlets(id, identifier)` — find the host element, call `sendOutletDefinitionsRequest({ selector, identifier })` to get outlet names; for each name, read the `data-${identifier}-${name}-outlet` attribute; the selector is the attribute value, or the default `[data-controller~="${cssEscape(name)}"]` when the attribute is empty/absent; `document.querySelectorAll(selector)`; map each matched element to `{ id: this.getElementKey(el), tagName: el.tagName.toLowerCase(), name }`. Returns `{ success: true, outlets }` / error. Add `sendOutletDefinitionsRequest` mirroring `sendValueDefinitionsRequest`.

**Content script entry** (`entrypoints/content.js`): handle `CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE` → `inspector.controllerOutlets(...).then(sendResponse)`.

**Bridge** + **Panel proxy**: `controllerOutlets(id, identifier)`.

**Details panel controller**: `loadOutlets()`, `renderOutlets(entries)` → `renderElementRows(this.outletsTarget, entries, { badge: true })`; empty → "No outlets". Wire into `show`/`refresh` alongside targets.

**Tests**:

- Unit: `tests/unit/controller-outlets.test.js` for the extraction helper (real Stimulus `Application` + controller with `static outlets`).
- Unit: `tests/unit/details-panel-controller.test.js` — mock `controllerOutlets`; assert outlet rows render, the name span has `.badge` + `data-controller-identifier` + `showDetails` action, clicking it dispatches `SHOW_CONTROLLER_DETAILS_EVENT` with the outlet element's nodeId and the outlet name, "No outlets" empty state, stale guard, refresh re-fetch.
- E2E: extend mock for `CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE`; assert rendered outlet badges and that clicking a badge re-opens the panel for the outlet controller.

### Phase 4 — Content-script E2E (real pipeline)

`tests/e2e/content-script.spec.js`: add a fixture page with a controller that has targets and declared outlets (with and without explicit selectors), then assert the panel (messaging through the devtools frame) receives correct `controllerTargets`/`controllerOutlets` responses and that `inspect` works on a target element. This covers the real content-script + injected-script path.

## Files touched (summary)

| File                                                          | Change                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `lib/constants.js`                                            | 3 new constants                                                                        |
| `lib/types.js`                                                | new typedefs + `ContentRequest` union                                                  |
| `lib/controller-outlets.js`                                   | **new** — `extractControllerOutletDefinitions`                                         |
| `lib/content-inspector.js`                                    | `controllerTargets`, `controllerOutlets`, `sendOutletDefinitionsRequest`               |
| `entrypoints/content.js`                                      | 2 new message handlers                                                                 |
| `entrypoints/inspected-page-inject.js`                        | `getOutletDefinitions` handler                                                         |
| `lib/panel-bridge.js`                                         | `controllerTargets`, `controllerOutlets`                                               |
| `lib/panel/controllers/panel-controller.js`                   | 2 proxy methods                                                                        |
| `lib/panel/controllers/details-panel-controller.js`           | targets/outlets Stimulus targets, load/render, shared `renderElementRows` + `showNote` |
| `entrypoints/panel/index.html`                                | replace TODOs, add row template                                                        |
| `entrypoints/panel/style.css`                                 | `.element-row`, `.element-name`, `.details-note`                                       |
| `tests/unit/details-panel-controller.test.js`                 | fixture + new tests                                                                    |
| `tests/unit/controller-outlets.test.js`                       | **new**                                                                                |
| `tests/e2e/support/panel-assertions.js` + `panel-fixtures.js` | mock + assertion updates                                                               |
| `tests/e2e/panel.spec.js`                                     | outlet badge click → details reload                                                    |
| `tests/e2e/content-script.spec.js`                            | real targets/outlets pipeline                                                          |
| `tests/e2e/fixtures/*`                                        | fixture page with targets + outlets                                                    |

## Verification

After each phase: `npm run lint`, `npm run lint:css`, `npm run format:check`, `npm run typecheck`, `npm test -- --run`; then `npm run build && npm run test:e2e` (and `:firefox` smoke if panel mocks change). Keep `lib/**` at 100% coverage.
