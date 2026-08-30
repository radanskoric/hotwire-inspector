# Turbo Events — reveal-in-elements button per row

Execution plan for adding a "reveal in DevTools Elements panel" affordance to each row in the **Turbo Events** timeline. Mirrors the existing `PanelNodeController.inspect()` flow so tree nodes and event rows share one reveal mechanism.

## Goal

Each `.event-box` rendered by the **Turbo Events** tab gets a small button using the existing `/icons/reveal-in-elements.svg` icon (same icon used by tree rows and details-panel target/outlet rows). Clicking it asks the content script to call `chrome.devtools.inspectedWindow.eval("inspect(document.querySelector(...))")` for the element that **originally fired** the Turbo event (`event.target` captured at dispatch time).

Reuses:

- The `PanelController.inspectNode(id)` proxy (`lib/panel/controllers/panel-controller.js:29-31`).
- The `CONTENT_INSPECT_MESSAGE_TYPE` content-script message and its typed response (`InspectResponse`). No new message types.
- The `PanelNodeController` pattern: a small per-action Stimulus controller that reads its target via a `data-...-value` attribute and dispatches `inspectNode` from its action.
- The `.status-notice` template (currently used for the positive "controller stored as temp1" feedback on `DetailsPanelController.storeInConsole()`), extended with an optional **warning tone** so an "element no longer exists" message reads correctly.
- The existing `getElementKey` / `findElementByKey` identity machinery from `lib/content-inspector.js:511-650` to assign stable keys to event targets at capture time — **without** mutating the inspected page DOM (per decision 2 — `docs/decisions/2 - no DOM modifications.md`).

If the target is gone by the time the user clicks reveal, render an existing-notice-style warning via `.status-notice[data-status-tone-value="warning"]`.

## Why this design

- **Tree-view identity reuse.** Per decision 2, element identity lives in `WeakMap<Element,string>` + `Map<string,WeakRef<Element>>` on the content script — never on the page. The Turbo event target is rarely a `turbo-frame` or `[data-controller]` element (most clicks land on `<a>`/`<button>`), so `scan()` would not register it. `getElementKey` is idempotent over repeated calls for the same element, so **resolving the key at event time** (not at scan time) is the same machinery, just used in a different lifecycle phase.
- **No new message types on the wire.** We only need the existing `CONTENT_INSPECT_MESSAGE_TYPE` — the push from content→panel carries a string id; the reveal click hits the same reply-by-relay path as the tree node click. Adding a new round-trip would be over-engineering for a duplicate action.
- **Per-row Stimulus controller, like `PanelNodeController`.** The tree rows model (parent controller on the row, `data-...-id-value`, `inspect()` action) is the cleanest pattern in the codebase for "an element with an identity that can be acted on". Reusing it avoids bespoke per-row wiring.
- **Extend the existing notice template with a tone rather than introduce a parallel warning surface.** Two callers (existing `storeInConsole` feedback, new "element gone" warning) is the threshold where a shared helper pays off; building a second template would duplicate the `.status-notice` plumbing.

## Current state (findings)

- **Turbo event push shape** (`lib/types.js:343-347`): `{ type: TURBO_EVENT_PUSH_TYPE, name: string, timestamp: number }`. No `targetId` today.
- **Watcher capture** (`lib/turbo-event-watcher.js:101-106`): reads only `event.type` and `event.timeStamp` (with a `Date.now()` fallback). The captured `Event` object is in scope but only `name` + `timestamp` are forwarded through `onEvent`. The content script's `startTurboEventWatcher(`…`)` wires `onEvent` (`lib/content-inspector.js:425-437`) and currently does not look at `event.target`.
- **Element identity in memory** (`lib/content-inspector.js:511-528, 646-650`):
  - `getElementKey(element)` reuses the element's own DOM id when present, otherwise returns a generated `hotwire-inspector-…` key, otherwise generates a new one. Idempotent.
  - `findElementByKey(key)` dereferences the reverse `WeakRef` and falls back to `document.getElementById(key)`. Returns `null` when the element is gone (already covered in unit tests).
- **Existing inspect flow** (`lib/panel-bridge.js:79-91`):
  - `inspectNode(id)` calls `sendToInspectedTab(ContentInspectRequest)` and, on `{success:true, selector}`, runs `inspectElementBySelector(selector)` which calls `chrome.devtools.inspectedWindow.eval("inspect(document.querySelector(...))")`. Returns `Promise<void>` (response shape is dropped today).
  - Today, a missing element returns `{success:false, selector:null}` from the content script and the inspect call silently no-ops — there's no UI signal.
- **`PanelNodeController` reference** (`lib/panel/controllers/panel-node-controller.js`):
  - `static values = { id: String }`
  - `inspect() { return this.inspectNode(this.idValue); }` — exact pattern to mirror.
  - The reveal button on tree rows uses `/icons/reveal-in-elements.svg` with `class="icon icon-btn"` and `data-action="click->panel-node#inspect"` (`entrypoints/panel/index.html:161-165`).
- **Event box markup** (`lib/panel/controllers/turbo-events-controller.js:165-185`): builds `<div class="event-box" data-turbo-events-target="event">` with `.event-name` (span) + `.event-time` (`<time>`).
- **Status notice template** (`entrypoints/panel/index.html:206-215`):
  - `#notice-template` → `<div class="status-notice" data-controller="status" role="status" aria-live="polite"><span slot="text"></span></div>`.
  - `StatusController.connect()` schedules a `durationValue` (default 10000 ms) auto-remove.
  - Currently only `DetailsPanelController.storeInConsole()` (lines 408-434) clones + appends to `<body>`. No tone.
  - Style: positive-toned green surface (`entrypoints/panel/style.css:145-157`).
- **`PanelController` proxy** (`lib/panel/controllers/panel-controller.js:29-31`): `inspectNode(id): Promise<void>`. Will get a return-type widening.

## Architecture

```
[inspected page]                  [content script]                  [panel]
dispatchEvent("turbo:click")   →   TurboEventWatcher.handleEvent
                                      └─→ callback receives the Event (ref)
inspector.startTurboEventWatcher: onEvent(event)
                                      └─→ const id = event.target && getElementKey(event.target)
                                      └─→ reconnectingPort.port.postMessage({
                                            type: TURBO_EVENT_PUSH_TYPE,
                                            name, timestamp,
                                            targetId: id    // null when no target
                                          })
                                                                       ↓
                                                          background port forwarder
                                                                       ↓
                                                          PanelBridge turboEventCallback
                                                                       ↓
                                                          TurboEventsController.addEvent(push)
                                                                       ↓
                                                          createEventBox(push)
                                                              ├ .event-name (always)
                                                              ├ .event-time (always)
                                                              └ <img class="icon icon-btn event-reveal">
                                                                  data-controller="event-box"
                                                                  data-event-box-target-id-value=push.targetId
                                                                  data-action="click->event-box#inspect"
                                                              (only when push.targetId)

[user clicks reveal icon]
EventBoxController.inspect():
  bridge.inspectNode(targetId)
    → sendToInspectedTab({ type: CONTENT_INSPECT_MESSAGE_TYPE, id: targetId })
    → ContentInspector.inspect(id)
        success:true  → PanelBridge.inspectElementBySelector → inspectedWindow.eval("inspect(...)")
        success:false → inspectNode resolves with the response → controller renders warning notice
```

## Decisions (locked)

- **Resolve event target → inspector key on the content script side, at fire-time.** Reuses `getElementKey` (idempotent over repeated calls), preserving all the existing guarantees (own id > generated key; `WeakRef` reverse map; falls back to `document.getElementById`).
- **Forward only the string key on the wire.** `event.target` itself is never serialized against decision 2 ("No page-DOM mutation by sending data through the messaging bus"). Inside the page-context content script we read `event.target` because that's the only place a DOM ref is available; it's an in-page read, not a network mutation.
- **Reuse `CONTENT_INSPECT_MESSAGE_TYPE` and `InspectResponse`.** No new content-script message types.
- **New panel-side per-row controller `EventBoxController`** — sub-class of `PanelController`, mirrors `PanelNodeController` exactly (`static values = { targetId: String }`; `inspect()` action calls `this.inspectNode(this.targetIdValue)`).
- **`bridge.inspectNode(id)` returns the `InspectResponse`** so callers can branch on `success:false`. `PanelNodeController.inspect()` already drops the return value — change is additive.
- **Warning notice path:** same `#notice-template`, with `data-status-tone-value="warning"` set when stamping.
- **Notice helper extraction:** introduce `lib/panel/notices.js` exporting `showNotice({ tone, message })`. `DetailsPanelController.storeInConsole()` and `EventBoxController.showTargetMissing()` become the two callers, sharing one body-clone path. Tone values: `"positive"` (existing default) and `"warning"` (new). `tone` defaults to `"positive"` for backward compatibility.
- **100% coverage in `lib/**`** stays green — every new module has unit tests covering statements, branches, functions, and lines.

## Phases

### Phase 1 — Push shape: thread `targetId` from capture to panel

**TDD**: extend unit-test fixtures first.

- `lib/types.js`: extend `TurboEventPush` with `targetId: string | null` (added after `timestamp` so existing positional-style assertions still pass):
  ```js
  /**
   * Inspector key for the element that dispatched this Turbo event, resolved
   * on the content script via the same `getElementKey` map used for tree view
   * elements. `null` when the event had no on-page target (e.g. synthetic
   * events dispatched directly on `document`).
   *
   * @property {string | null} targetId
   */
  ```
- `lib/turbo-event-watcher.js`: thread the captured `Event` through `onEvent`. Two viable shapes; pick **A** to avoid disturbing every existing call site:
  - **A. Single payload with `event`:** `onEvent: ({ name, timestamp, event }) => …` — the content-script consumer reads `payload.event.target` locally and discards it before posting the push. Easiest, but `event` rides a typed shape.
  - **B. Second argument:** `onEvent: (payload, event) => …` — explicit second slot, less typing churn.
  - **Decision:** go with **A**, but `TurboEventPayload` extends to include a `targetId: string | null` written by the content-script `onEvent` (the watcher never sends a `targetId` — that's the consumer's concern). Note: the watcher does not forward `targetId` — only `name` and `timestamp`. The content script reads the `event` reference locally, computes `targetId` via `getElementKey`, and stamps the **push envelope** itself (which already happens in `startTurboEventWatcher`'s `onEvent` callback).

  Clarification of responsibilities:
  - `lib/turbo-event-watcher.js`: `TurboEventPayload = { name, timestamp }` as today. The `handleEvent` stores `this.lastEvent` (non-enumerable, for tests) — actually simpler: pass the current event to the callback as a second argument. **Final shape: `handleEvent(event)` calls `this.onEvent({ name, timestamp }, event)`.** The `Event` reference lives only in the content-script process; it never goes on the bus.
  - `lib/turbo-event-watcher.test.js`: keep payload assertions unchanged; add one assertion that the second argument is the original `Event` reference.

- `lib/content-inspector.js`: extend `startTurboEventWatcher`'s `onEvent`:
  ```js
  onEvent: (payload, event) => {
    let targetId = null;
    const target = event?.target;
    if (
      target &&
      target.nodeType === this.elementNodeType &&
      target.ownerDocument === this.document
    ) {
      targetId = this.getElementKey(/** @type {Element} */ (target));
    }
    this.reconnectingPort?.port?.postMessage({
      type: TURBO_EVENT_PUSH_TYPE,
      ...payload,
      targetId,
    });
  },
  ```
  - The `target.ownerDocument === this.document` check excludes events whose target lives in a same-origin iframe (inspecting it from the top frame wouldn't reveal anything in the user's Elements panel). This is a defensive guard — not required today, but it costs nothing and avoids accidentally paging into a future bug.
  - Wrapping `getElementKey` in the same `findElementByKey`-rejecting conditions as elsewhere: target must be an `Element` node in our document.

**Tests** (TDD-first):

- Extend `tests/unit/turbo-event-watcher.test.js`:
  - Assert `onEvent` is invoked with `(payload, event)`.
  - Assert a second-arg `undefined` event produces a content-script with `targetId === null` (the content-script injects the value, so this is a contract assertion — assert the watcher forwards `event` and lets the consumer stamp it).
- Extend `tests/unit/content-inspector.test.js` (new `describe("turboEventWatcher targetId capture")`):
  - `dispatchEvent(new CustomEvent("turbo:click", { bubbles: true }))` on an `<a class="link">link</a>` document. Assert the captured push carries `targetId` matching `getElementKey(link)`:
    - When the link has its own id → uses the real id.
    - When idless → uses a stable `hotwire-inspector-...` key.
    - On a second fire → same key (idempotent).
  - Fire event on a node not in our document (e.g. an externally-owned iframe-like target) → `targetId === null`. Skip if too synthetic in happy-dom; coverage via `event.target = { nodeType: 1, ownerDocument: foreignDocument }`.
  - Fire event with no `event.target` (e.g. `new Event("turbo:load")` dispatched on `document` itself) → `targetId === null`.
  - Capture returns the `turboEventWatcher`'s wiring without regressions: existing 3 tests stay green.
- Extend `tests/e2e/content-script.spec.js` (`forwards Turbo events dispatched on the page to the events port`): add an assertion that the push includes `targetId` for events fired on a known existing element. Use `withPanelMessagesListener` so we observe the production content-port→panel-port pipeline.

### Phase 2 — Bridge: widen `inspectNode` return shape

- `lib/panel-bridge.js`:
  - `async inspectNode(id): Promise<InspectResponse | void>` — currently returns `Promise<void>` after the `inspectElementBySelector` side effect. Refactor to keep the response available to callers (e.g. await `sendToInspectedTab` to a local, call `inspectElementBySelector` on the same conditions, and return the local). Behavior change is purely the return value — existing `void`-discarding callers are unchanged.
- `lib/panel/controllers/panel-controller.js`: JSDoc widens to `Promise<InspectResponse | void>`. No signature change in TS terms because `void` is already permissive.
- `lib/types.js`: add a new typedef `InspectResponse` reuse (already present at lines 91-95).
- Update `PanelNodeController.inspect` JSDoc — no functional change.

**Tests** (TDD-first):

- Extend `tests/unit/panel-bridge.test.js`:
  - Assert `inspectNode("missing")` resolves with `{ success: false, selector: null }` (does **not** throw).
  - Assert `inspectNode("present")` resolves with `{ success: true, selector: "#present" }` AND calls the (mocked) `eval` once.
  - Existing assertions remain green; the app code path is unchanged.
- Add a regression test that `PanelNodeController.inspect()` still works end-to-end (smoke test on the success branch).

### Phase 3 — `EventBoxController` + reveal button rendering

- `lib/panel/controllers/event-box-controller.js` (new):
  ```js
  import { PanelController } from "./panel-controller.js";

  export class EventBoxController extends PanelController {
    static values = { targetId: String };

    /**
     * @this {EventBoxController & { targetIdValue: string }}
     */
    async inspect() {
      const response = await this.inspectNode(this.targetIdValue);
      if (!response?.success) {
        this.showTargetMissing();
      }
    }

    /**
     * Renders the warning notice via the shared helper. (See Phase 4.)
     */
    showTargetMissing() {
      // imported here to avoid an import cycle (notices.js is plain helper)
    }
  }
  ```
  - Exact shape mirrors `PanelNodeController` (`lib/panel/controllers/panel-node-controller.js:8-56`).
  - Static `targetId` value carries the inspector key to the rendered row.
- `lib/panel/controllers/index.js`: `application.register("event-box", EventBoxController);`.
- `lib/panel/controllers/turbo-events-controller.js`: extend `createEventBox(push)`:
  ```js
  if (push.targetId) {
    const reveal = document.createElement("img");
    reveal.src = "/icons/reveal-in-elements.svg";
    reveal.className = "icon icon-btn event-reveal";
    reveal.alt = "Reveal source element";
    reveal.setAttribute("aria-label", "Reveal in Elements panel");
    reveal.dataset.controller = "event-box";
    reveal.dataset.eventBoxTargetIdValue = push.targetId;
    reveal.dataset.action = "click->event-box#inspect";
    box.appendChild(reveal);
  }
  ```
  - `push.targetId === null` ⇒ no button.
  - Box layout is currently `display: flex; flex-wrap: wrap; align-items: baseline; gap: 1ch;` (`entrypoints/panel/style.css:334-345`). The `<img>` lives inside the same flex line as `.event-name` and `.event-time` and inherits `.icon.icon-btn` sizing.

**Tests**:

- `tests/unit/event-box-controller.test.js` (new): mirror `panel-node-controller.test.js` setup. Mock bridge with `inspectNode(id) → Promise<{success, selector}>` (default success). Assert:
  - Click `.event-reveal` → bridge receives `inspectNode(targetId)`.
  - `success: false` ⇒ `.status-notice[data-status-tone-value="warning"]` appended to `<body>` with the warning text.
  - `success: true` ⇒ no notice (the existing positive-tone template path is unaffected from this controller's perspective).
  - Bubbled events and `data-action` wiring — assert the synthesized action via `el.dispatchEvent(new Event('click'))` after Stimulus registers.
- `tests/unit/turbo-events-controller.test.js`: extend
  - `push: { type, name: 'turbo:render', timestamp, targetId: 'frame-id' }` ⇒ `.event-box .event-reveal` present, with `data-event-box-target-id-value === 'frame-id'`.
  - `push: { type, name: 'turbo:render', timestamp, targetId: null }` ⇒ no `.event-reveal` in the box.
  - Existing fixtures stay green: minimal-shape pushes still render the name + time and never the reveal button.

### Phase 4 — Notices helper + warning-tone extension

- `lib/panel/notices.js` (new):
  ```js
  /**
   * @typedef {"positive" | "warning"} NoticeTone
   */

  /**
   * Clones `#notice-template` and appends a single status notice to the
   * panel document body.
   *
   * @param {Document} document
   * @param {string} message
   * @param {{ tone?: NoticeTone }} [options]
   */
  export function showNotice(document, message, { tone = "positive" } = {}) {
    const template = document.getElementById("notice-template");
    if (!template) return;
    const node = /** @type {HTMLElement} */ (
      /** @type {DocumentFragment} */ (template.content.cloneNode(true))
        .firstElementChild
    );
    node.dataset.statusToneValue = tone;
    const textSlot = node.querySelector('[slot="text"]');
    if (textSlot) textSlot.textContent = message;
    document.body.appendChild(node);
  }
  ```
  - One exported helper; checksum: `2244ca9b4081dc14f5`. Existing call site in `DetailsPanelController.storeInConsole` stays semantically identical (tone defaults to `"positive"`).
- `lib/panel/controllers/details-panel-controller.js`:
  - Replace the in-method template-clone block (`lib/panel/controllers/details-panel-controller.js:413-431`) with `showNotice(this.element.ownerDocument, message)`.
- `lib/panel/controllers/event-box-controller.js`: `showTargetMissing()` calls `showNotice(this.element.ownerDocument, "Element no longer exists — cannot reveal it.", { tone: "warning" })`.
- `entrypoints/panel/index.html`: `#notice-template` root gains `data-status-tone-value=""` (Stimulus values mirror; the renderer overrides it on stamp).
- `entrypoints/panel/style.css`:
  - One new rule `.status-notice[data-status-tone-value="warning"]` with a warning palette (oklch-based using the existing `--lch-*` tokens; recommend `--lch-warning` token — define if not present, else use a hardcoded orange in the warning rule). Background: a soft warning surface; ink: a darker warning hue.
  - Optionally `.event-reveal { align-self: center }` if flex `align-items: baseline` makes the icon misalign with the monospace `.event-name`. Visual check during implementation.
  - Stylelint stays clean (`npm run lint:css`).

**Tests**:

- `tests/unit/notices.test.js` (new):
  - Tone defaults to `positive` (data-attribute reads `"positive"`, text slot text).
  - Custom tone `warning` (data-attribute reads `"warning"`).
  - Missing template (template removed from document) ⇒ no throw, no DOM change.
- Extend `tests/unit/details-panel-controller.test.js`: the existing `storeInConsole` test must still pass (tone is implicit `positive`).
- Extend `tests/unit/event-box-controller.test.js` (Phase 3's new file): the warning path asserts the rendered notice carries the warning tone.

### Phase 5 — E2E

**Panel UI** (`tests/e2e/panel.spec.js`):

- Synthesize a turbo-event push from the panel-port mock:
  ```js
  await simulateTurboEvent(panelPage, {
    type: TURBO_EVENT_PUSH_TYPE,
    name: "turbo:click",
    timestamp: 1700000000000,
    targetId: "main-frame",
  });
  ```
  - Need a `simulateTurboEvent` helper symmetric with `simulateValuesChanged` / `simulateTreeChanged` (`tests/e2e/support/panel-assertions.js:694-710`). Add it; it pushes via the mock port's `_messageListeners`.
- Add fixture in `panel-fixtures.js` (`turboEventsFixturePush`).
- Test: clicking `.events-list .event-reveal` triggers `browser.runtime.sendMessage` with `{ type: CONTENT_INSPECT_MESSAGE_TYPE, id: "main-frame" }`.
- Configure mock `browser.runtime.sendMessage` to return two responses, one per test:
  - **Happy path:** `{ success: true, selector: "#main" }` ⇒ `browser.devtools.inspectedWindow.eval` receives `inspect(document.querySelector("#main"))`. No notice.
  - **Missing path:** `{ success: false, selector: null }` ⇒ notice with `data-status-tone-value="warning"` and the warning text is visible.
- Switch the events tab in the test setup: `await panelPage.locator("label.tab[for='tab-events']").click();` and dispatch push before assertions to ensure visibility.

**Content script pipeline** (`tests/e2e/content-script.spec.js`):

- Use `withPanelMessagesListener` to capture the push over the real content→panel port pipeline. Dispatch a synthetic `CustomEvent("turbo:click", { bubbles: true })` on a fixture-page element NOT in the tree scan (e.g. `<a class="link">link</a>`). Assert:
  - `expect.poll(readMessages)` includes a push whose `name === "turbo:click"` AND whose `targetId` is a generated `hotwire-inspector-…` key OR a real id if the element had one.
- Then assert the inverse inspect path: from the devtools frame, send `{ type: CONTENT_INSPECT_MESSAGE_TYPE, id: <targetId> }`. Expect the response to include `{ success: true, selector: <selector> }`.
- Remove the link from the DOM end-to-end (via `page.evaluate(el => el.remove())`), then dispatch the inspect request from the devtools frame and assert `{ success: false, selector: null }`.

**Helpers**:

- `tests/e2e/support/panel-assertions.js`: add `simulateTurboEvent(panelPage, push)` mirroring the existing pattern.
- `tests/e2e/helpers.js`: no changes expected; `withPanelMessagesListener` already exposes `readMessages()`.

## Files touched (summary)

| File                                                | Change                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/types.js`                                      | `TurboEventPush` gains `targetId: string \| null`                                                                                                     |
| `lib/turbo-event-watcher.js`                        | `onEvent(payload, event)`; `TurboEventPayload` typedef kept minimal                                                                                   |
| `lib/content-inspector.js`                          | `startTurboEventWatcher`'s `onEvent` reads fire-time `event.target` and stamps `targetId` via `getElementKey`; guards on `nodeType` + `ownerDocument` |
| `lib/panel-bridge.js`                               | `inspectNode(id)` returns `InspectResponse \| void` (shape widening; no caller change)                                                                |
| `lib/panel/controllers/panel-controller.js`         | JSDoc update on `inspectNode` return type                                                                                                             |
| `lib/panel/controllers/event-box-controller.js`     | **new** — per-row controller mirroring `PanelNodeController`                                                                                          |
| `lib/panel/controllers/index.js`                    | registers `event-box`                                                                                                                                 |
| `lib/panel/controllers/turbo-events-controller.js`  | `createEventBox(push)` adds `<img class="icon icon-btn event-reveal">` when `push.targetId` is truthy                                                 |
| `lib/panel/notices.js`                              | **new** — `showNotice(document, message, { tone })` helper                                                                                            |
| `lib/panel/controllers/details-panel-controller.js` | `storeInConsole` calls `showNotice(...)` (DRY; tone defaults to `"positive"`)                                                                         |
| `lib/panel/controllers/event-box-controller.js`     | `showTargetMissing()` calls `showNotice(..., { tone: "warning" })`                                                                                    |
| `entrypoints/panel/index.html`                      | `#notice-template` root gains `data-status-tone-value=""`                                                                                             |
| `entrypoints/panel/style.css`                       | `.status-notice[data-status-tone-value="warning"]` palette; optionally `.event-reveal { align-self: center }`                                         |
| `tests/unit/turbo-event-watcher.test.js`            | assert `onEvent` receives `(payload, event)`                                                                                                          |
| `tests/unit/content-inspector.test.js`              | new `describe("turboEventWatcher targetId capture")`                                                                                                  |
| `tests/unit/panel-bridge.test.js`                   | `inspectNode(...)` return-shape tests                                                                                                                 |
| `tests/unit/event-box-controller.test.js`           | **new** — inspect happy + warning rendering                                                                                                           |
| `tests/unit/notices.test.js`                        | **new** — tone default + override + missing-template                                                                                                  |
| `tests/unit/turbo-events-controller.test.js`        | targetId-gated reveal button + null-target case                                                                                                       |
| `tests/unit/details-panel-controller.test.js`       | fixture parity (no behavior change)                                                                                                                   |
| `tests/e2e/support/panel-assertions.js`             | `simulateTurboEvent(panelPage, push)` helper                                                                                                          |
| `tests/e2e/support/panel-fixtures.js`               | `turboEventsFixturePush`                                                                                                                              |
| `tests/e2e/panel.spec.js`                           | happy + missing-target reveal from a turbo-event row                                                                                                  |
| `tests/e2e/content-script.spec.js`                  | real Turbo dispatch ⇒ `targetId` on the wire; inspect message round-trip after element removal                                                        |

## Verification

After each phase: `npm run lint`, `npm run lint:css`, `npm run format:check`, `npm run typecheck`, `npm test -- --run`. After Phase 5: `npm run build && npm run test:e2e`. The `lib/**` 100% coverage requirement applies — every new module/symbol appears in unit tests with statement/branch/function/line coverage.
</content>
</invoke>
