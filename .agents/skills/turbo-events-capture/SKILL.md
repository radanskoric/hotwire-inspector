---
name: turbo-events-capture
description: Use when working on Hotwire Inspector's live Turbo event capture — the capture-side watcher, the content→background→panel port pipeline that carries pushes, the Turbo Events tab in the panel, or any extension that captures other event families (e.g. Stimulus lifecycle) on the inspected page.
---

# Turbo Events capture & rendering

Hotwire Inspector runs a content-script watcher that subscribes to a curated list of Turbo 8.x DOM events on `document`, forwards each fire to the panel over the existing content→background→panel port pipeline, and renders a chronological timeline in the **Turbo Events** tab of the DevTools panel.

This skill covers the capture pipeline, the data shape that rides it, and how the panel turns pushes into `.event-box` rows — including how each row can carry an optional set of **details** (URL for `turbo:load` today, more events tomorrow) and how to extend the switch-statement helper for the next event you want enriched.

## Key files

- `lib/turbo-event-watcher.js` — exports `TURBO_EVENT_NAMES` (the curated list) and `TurboEventWatcher` (the document-listener class). The list is the single source of truth — both the watcher and any tests that need to assert coverage import it from here. **Also** exports `turboEventDetailsFor(name, event)` — the switch-statement helper that captures per-event details. The helper is the single source of truth for "what extra fields flow on each event".
- `lib/constants.js` — `TURBO_EVENT_PUSH_TYPE` (the push-type string `hotwire-inspector:turbo-event`).
- `lib/types.js` — `TurboEventPush` typedef: `{ type, name, timestamp, targetId, details }`. `details` is a `Record<string, string>` indexed by the lowercase key the watcher chose (e.g. `url`).
- `lib/content-inspector.js` — owns `startTurboEventWatcher()` and `disconnect()` teardown. The watcher is constructed in `startTurboEventWatcher` and posts each capture (including the spread `details` field) to `this.reconnectingPort?.port?.postMessage(...)`.
- `entrypoints/content.js` — calls `inspector.startTurboEventWatcher()` next to the other startup watchers (tree, page lifecycle).
- `lib/panel-bridge.js` — owns the `TURBO_EVENT_PUSH_TYPE` branch on the panel events port and exposes `onTurboEvent(callback)` + `offTurboEvent()`. `onTurboEvent` is symmetric with the other `onXxxChanged` setters; it also calls `connectEventsPort()` so pushes can start arriving.
- `lib/panel/controllers/turbo-events-controller.js` — the Stimulus controller for the **Turbo Events** tab. `createEventBox(push)` builds the row, and `createDetailsSection(details)` builds the per-row `<details>` + `<dl>` two-column block when `push.details` is non-empty.
- `entrypoints/panel/index.html` — `<section id="panel-events">` markup: `<p class="events-dropped-notice">`, `<div class="events-list">`, `<p class="events-empty">`. CSS-driven visibility — see comments in the file.
- `entrypoints/panel/style.css` — `.events-*` rules (cap, scroll behavior, empty/lists visibility, dropped-notice styling) plus `.event-box-details*` rules (the disclosure triangle, the `max-content 1fr` grid, the uppercased `.event-box-details-key`).
- `tests/unit/turbo-event-watcher.test.js` — list contents, start/stop symmetry, capture-phase options, `useCapture: true`, idempotency, null-document safety, `Date.now()` fallback, plus a `describe("turboEventDetailsFor")` block (positive, missing event, missing detail, empty URL, non-string URL, default branch) and end-to-end "TurboEventWatcher details" tests threading through `handleEvent`. Uses a fake `EventTarget` so it runs under `happy-dom`.
- `tests/unit/turbo-events-controller.test.js` — bridge subscription, single-push append, multi-push append, **cap-and-dropped-notice under push bursts**, bridge subscription cleared on `disconnect()`, no renders after `disconnect()`, plus a small block of "createEventBox details rendering" tests (omits when `details` is empty, renders one row per `dt`/`dd` when populated, multi-key rows, bridge-driven push with details renders the same way). Stub bridge via `createStubBridge()` with `onTurboEvent`/`offTurboEvent`.
- `tests/unit/panel-bridge.test.js` — `onTurboEvent` route, `offTurboEvent` clears callback, ignores non-turbo-event messages on the same port.
- `tests/e2e/helpers.js` (and `tests/e2e/adapters/chromium-adapter.js`) — `withPanelMessagesListener(frame, body)` opens a panel-port impersonation from the devtools frame and exposes `readMessages()`; this is how the content-script E2E test asserts that a real push arrives.
- `tests/e2e/content-script.spec.js` — the only E2E coverage for the wire-up: dispatches synthetic `turbo:load` / `turbo:render` on the fixture, asserts both `TurboEventPush`es arrive on the impersonated panel port with the expected `name` and `type`. Includes a synthetic `turbo:load` with `detail.url` to assert the URL surfaces on the wire via `details: { url }`.
- `tests/e2e/panel.spec.js` — includes `turboEventsWithDetailsFixturePush` for the panel-side rendering: clicking the `<summary>` opens the details block, asserting `dt.textContent === "url"` (uppercased visually) and `dd.textContent` carries the URL.
- `tests/e2e/support/panel-fixtures.js` — `turboEventsFixturePush` (no details; default fixture; carries `details: {}`) and `turboEventsWithDetailsFixturePush` (`details: { url: "https://app.test/dashboard" }`).

## Architecture

```
document.dispatchEvent("turbo:load", { detail: { url: "https://app.test/" } }) / Any other turbo:* event
  └─► TurboEventWatcher.handleEvent (capture phase, registered in start())
        └─► turboEventDetailsFor(event.type, event) → { url } | {}
        └─► onEvent({ name, timestamp, details })
              └─► ContentInspector.startTurboEventWatcher's onEvent
                    └─► reconnectingPort.port.postMessage({
                          type: TURBO_EVENT_PUSH_TYPE,
                          name, timestamp,
                          details,
                          targetId: getElementKey(event.target) | null,
                        })
                          └─► background.onMessage forwarder (opaque)
                                └─► panel events port onMessage
                                      └─► PanelBridge turboEventCallback
                                            └─► TurboEventsController.addEvent(push)
                                                  └─► listTarget.appendChild(createEventBox(push))
                                                        ├ .event-name (always)
                                                        ├ .event-time (always)
                                                        ├ .event-reveal (when push.targetId)
                                                        └ .event-box-details (when push.details has keys)
                                                              └ <summary>Details</summary>
                                                              └ <dl class="event-box-details-grid">
                                                                  for [k, v] in details:
                                                                    <dt class="event-box-details-key">{k}</dt>
                                                                    <dd class="event-box-details-value">{v}</dd>
                                                        └─► Stimulus `eventTargetConnected` → trim + drop + autoscroll
```

**Capture-side invariants.** The watcher treats `document` opaquely (anything with `addEventListener`/`removeEventListener` works). It still never reads `event.target` directly — the inspected page's elements remain unreachable. **The push payload is minimal by default** (`{ type, name, timestamp, details: {} }`), and a per-event-name **switch statement** (`turboEventDetailsFor`) is the **only** opt-in path for additional fields. Do not publish the full `event` object on the bus, do not stringify arbitrary `event.detail`, do not let any reader call into page JS.

**Panel-side invariants.** `addEvent(push)` is the single rendering entry point, where `push` is a full `TurboEventPush`. The watcher, the bridge, the controller, and any future capture sources must all converge on it (the controller may also accept a bare `name` for tests/ergonomics, but treat the push payload as the canonical input). The Stimulus `eventTargetConnected` lifecycle is the single bookkeeping entry point for trim/drop/autoscroll; do not split it across multiple hooks (happy-dom-friendly and ensures connected/disconnected fire uniformly).

## Adding a new Turbo event name

1. Add the string to `TURBO_EVENT_NAMES` in `lib/turbo-event-watcher.js`. Keep the list ordered roughly by Turbo lifecycle phase (visit → fetch → render → streams → morph → submit → prefetch) — it's also the visual order the timeline ends up showing.
2. Verify it landed: the watcher test asserts the exact list contents; the unit test will fail if you mistype.

That is all. There are no other call sites to update — the watcher, the controller, the test fixtures, and the E2E synthetic dispatcher all read from the same export.

## Capturing more detail

Some Turbo events carry useful `event.detail` (URLs, fetch options, render targets, request IDs). `turboEventDetailsFor(name, event)` is a **pure switch statement** that runs before the payload is forwarded; for a name with no case (the default arm) it returns `{}`. The push payload always carries the same shape — `details` is **always present** (default `{}`) so consumer code never has to special-case "details exists".

This is intentional, opt-in curation. Two strategies were on the table when this shipped:

- **Generic `details` dump** — every event pushes the whole `event.detail`. Simple, automatic, future-Turbo events inherit it. Downside: untyped payload, uncurated content, may leak user data (request bodies, sensitive URLs).
- **Per-event switch arms** — a switch statement in `turboEventDetailsFor` keyed by event name; each arm reads a small known set of fields and returns a plain object. Typed payload, intentional content, matches the existing "narrow capture" style.

The codebase already curates both lists (`TURBO_EVENT_NAMES`) — extending that pattern with **per-event switch arms** keeps the capture-side contract intentional. Pick this approach. A generic dump risks leaking arbitrary user data and untyped shapes rot.

### Wire a new switch arm

In `lib/turbo-event-watcher.js`, add a `case` label inside `turboEventDetailsFor(name, event)`:

```js
export function turboEventDetailsFor(name, event) {
  switch (name) {
    case "turbo:load": {
      const url = event?.detail?.url;
      return typeof url === "string" && url.length > 0 ? { url } : {};
    }
    case "turbo:before-visit": {
      const url = event?.detail?.url;
      return typeof url === "string" && url.length > 0
        ? { url }
        : { method: event?.detail?.method ?? "" };
    }
    // …continue this list. Match against `name` (event.type), which is
    // always one of the strings in TURBO_EVENT_NAMES.
    default:
      return {};
  }
}
```

Rules for new arms:

- **Pure.** Read `event.detail` only. Never call into page JS, never `JSON.stringify` the entire `detail`, never traverse `event.target` (element identity is handled separately by `ContentInspector.startTurboEventWatcher`).
- **Defensive against missing fields.** Use optional chaining (`event?.detail?.x`) and check the field's type before assignment. Anything missing or wrong-shape ⇒ **drop the field, do not emit an empty string**. An empty `details` object means "the helper says no details worth showing" and the renderer hides the `<details>` block.
- **Keys are lowercase.** The helper returns lowercase keys (e.g. `url`); CSS `text-transform: uppercase` on `.event-box-details-key` does the visual uppercase — no need to revisit the helper when adding a key.
- **Values are strings.** `details: Record<string, string>`. Coerce non-string values (`String(v)`) before returning, or drop them. The `<dd>` is rendered with `textContent` so markup safety is not a concern; consistency is.

`handleEvent` is unchanged — every event flows through the same call: `details: turboEventDetailsFor(event.type, event)`. The payload stays minimal (`{}`) for events without a case; the renderer hides the `<details>` block in that case.

### No typedef work required

The push typedef in `lib/types.js` is intentionally wide:

```js
/**
 * @typedef {object} TurboEventPush
 * …
 * @property {Record<string, string>} details - extra fields captured on the inspected page at fire time, indexed by the lowercase key the watcher chose (e.g. `url`). Empty when no rule applies.
 */
```

`Record<string, string>` is an open map. Adding a new switch arm does not require a typedef change — the helper's return shape is the contract, not the typedef. This keeps adding new events low-cost; if you want stronger typing later, narrow `turboEventDetailsFor`'s return type via `@returns` and trust the unit tests to catch a regression.

### Test the new arm

Extend `tests/unit/turbo-event-watcher.test.js`:

- For each new arm, assert the happy-path: `turboEventDetailsFor("turbo:before-visit", { detail: { url: "https://app.test/x" } })` is `{ url: "https://app.test/x" }`.
- Assert the missing-field drop: `turboEventDetailsFor("turbo:before-visit", {})` is `{}` (no `events-list` row should grow a `<details>` block).
- Add a structural assertion: `Object.keys(turboEventDetailsFor("turbo:before-visit", { detail: { url: "x" } }))` is exactly `["url"]`. A typo in the helper (`UrL`) shows up here as a regression.
- The end-to-end "TurboEventWatcher details" tests also exercise the new case through `handleEvent`, so a typo in the switch dispatch surfaces there too.

`tests/e2e/content-script.spec.js` should add at least one enrichment to the synthetic dispatch list and assert the full push (including `details.*`) flows through the panel port — the `withPanelMessagesListener` helper is already a strong seam for this. Re-use `expect.poll(readMessages)` and `expect.objectContaining({ details: { … } })`.

### Panel-side rendering: already wired

You do **not** change the renderer to support new details — `TurboEventsController.createEventBox(push)` already iterates `push.details` and emits one `<dt>/<dd>` per entry, and the CSS handles the two-column grid + uppercase keys. As soon as `push.details` has a new key, the timeline row grows a `<dt>KEY</dt><dd>value</dd>` for it. If a future event has a richly-shaped value (JSON, list of strings), consider whether that needs its own presentation — the current renderer assumes single-line text. Do not extend the renderer to handle that case; instead, append a click-to-expand affordance that opens the existing details panel with a typed CustomEvent (see "Deeper per-event surfaces" below).

### Don't

- Don't read `event.target` from the helper. Element-tree state stays in the scan pipeline, not the event bus.
- Don't put the entire `event` object on the bus. The push contract is curated: `name`, `timestamp`, optional `details` keyed by lowercase labels.
- Don't make the helper call into the page JS (`eval`, `fetch`, `inspect`, …). Capture is read-only from the inspected page.
- Don't stringify the entire `event.detail` "to be safe". If a reader needs raw `detail`, add an arm that picks the specific field to surface, with a typed value; do not fall back to `JSON.stringify`.
- Don't make the helper part of the constructor signature of `TurboEventWatcher`. It is a module-level pure function; the watcher is a thin pass-through.
- Don't add a per-event rendering branch inside `createEventBox`. The "iterate `push.details` and emit one `<dt>/<dd>` per entry" rule is what keeps adding enrichment cheap. Per-event rendering branches would re-introduce per-name coupling that the capture already retired.

## Adding a watcher for a different event family

The Turbo event watcher is the template. To capture, say, Stimulus lifecycle events:

1. Pick a new module name (`lib/stimulus-event-watcher.js` is the obvious place). Export the curated event names and a class shaped the same way as `TurboEventWatcher` — capture-phase `document` listener, idempotent `start()`, paired `stop()` that removes exactly what `start()` added.
2. Add a new `*_PUSH_TYPE` constant next to `TURBO_EVENT_PUSH_TYPE` in `lib/constants.js`, and a matching `*Push` typedef in `lib/types.js`. Push payload shape: `{ type, name, timestamp, …familySpecific }`. **Mirror the `details: Record<string, string>` convention** if your family has a similar "per-event enrichment" concept, and reuse the same pure-helper pattern for any extra fields.
3. Wire it in `entrypoints/content.js` after the existing watchers, alongside a matching `**Connecting service**` method pair on `ContentInspector` (start in startup, stop in `disconnect`).
4. Add a `*` branch in `lib/panel-bridge.js's ports.onMessage.addListener` and a symmetric `on*`/`off*` pair.
5. Either reuse `TurboEventsController` (drop a new tab next to the existing one) or add a sibling controller — see the rendering conventions below. The control-room details — `off*` cleanup, a per-tab controller, a cap, and an empty/loading state — all carry over.

### Boundaries

- The page side must remain untouched. Capture only — never write attributes, never call into the page JS. If the family you want to capture has interesting `event.detail`, write the choice down before encoding it: do you read it, summarize it, or skip it?
- Keep gateway-free capture if you can. The current design is deliberately ungated (start once when the content script starts). A `watchX/startX` handshake is a future optimization, not a v1 requirement; if you add one, mirror its cleanup in `ContentInspector.disconnect()`.

## Rendering conventions (Turbo Events tab)

The current `TurboEventsController` is the canonical pattern:

- **Static markup in `index.html`.** The `<section id="panel-events">` ships fully formed. The controller fills the dynamic parts via Stimulus targets. Do not inject templates or clone nodes for the panel itself.
- **CSS-only empty state.** `.events-empty` shows when `.events-list` is empty (`:empty` selector). Do not toggle a hidden attribute — keep the state in CSS to avoid fighting `[hidden] { display: none ! important }` global rules.
- **Cap and dropped-count.** `maxEventsValue` (default `500`) caps the list; when `eventTargetConnected` evicts the oldest, `droppedCountValue += excess`. `droppedCountValueChanged` toggles the `.events-dropped-notice`. Do not introduce an observer for droppped-count changes — the value's `*Changed` callback is the single source of truth.
- **Smart autoscroll.** `maybeAutoscroll(element)` is the single entry point. It considers: tab visibility (deferred scroll when the events tab is hidden), user scroll position (only autoscroll when the user is already at the bottom, threshold = 4 px), and the existence of a freshly appended target. `isEventsTabActive()` reads the `#tab-events` radio. The same handler fires on tab-change events to flush deferred scrolls.
- **Bridge teardown.** `disconnect()` always aborts the tab-change listener **and** calls `bridge.offTurboEvent()`. Without the `offTurboEvent` call, a late push could fire `addEvent` on a torn-down controller and render into a torn-down subtree.
- **DOM event target validity.** When iterating `eventTargets[]` for trim, only call `.remove()` on the elements currently registered; Stimulus `eventTargetDisconnected` may run on a few, but the cap is enforced inline in `eventTargetConnected` to keep bookkeeping synchronous.
- **Row composition.** Every row is a single `<div class="event-box" data-turbo-events-target="event">` containing a fixed order of children: reveal icon (when `targetId`), `.event-name`, `.event-time`, and an optional `.event-box-details` block (when `details` has keys). `eventTargetConnected` fires exactly once per push and drives trim/drop/autoscroll independently of what's inside the row.

### The per-row details block

When a `TurboEventPush` carries a non-empty `details` record (see "Capturing more detail" above), `createEventBox(push)` appends a sibling `.event-box-details` block. The block:

- A native `<details>` element (collapsed by default). Keyboard disclosure (Enter on `<summary>`) is preserved for free.
- A `<summary>Details</summary>` disclosure label, with a `▶` glyph that rotates on `[open]`.
- A `<dl class="event-box-details-grid">` containing one `<dt>`/`<dd>` pair per `details` entry. The grid is `display: grid; grid-template-columns: max-content 1fr; gap: 0.125rem 1ch;` — a true two-column layout.
- `<dt class="event-box-details-key">` is rendered with **lowercase** textContent (because that's what the helper emits), and CSS uppercases it via `text-transform: uppercase`. New keys inherit the styling automatically; no helper change.
- `<dd class="event-box-details-value">` uses `textContent`, so URLs are safe; `overflow-wrap: anywhere` lets long URLs wrap without breaking the row.

**Rules for adding to the block**:

- Iterate `push.details` with `Object.entries`. Don't filter, don't sort — insertion order matches the helper's case arm, which keeps `url` near the top for `turbo:load` and similar life-cycle hints.
- Don't break the row into a child Stimulus target for the block body. Per-row targets break the "one target per push" invariant that the cap/trim bookkeeping relies on. The block is plain DOM inside the existing target.
- Don't change the row's `<div class="event-box">` height responsively for blocks — tall blocks could surprise `maybeAutoscroll`'s 4 px bottom threshold. The block sits at the end of the row, after `.event-name`, `.event-time`, and any reveal icon, and spans the full width via `inline-size: 100%; flex-wrap: wrap` (already inherited from `.event-box`).
- Don't bind click handlers inside `createDetailsSection` directly. Use the native `<details>`, which already manages open/close state via the summary element.

### Tests for richer rendering

`tests/unit/turbo-events-controller.test.js` has a dedicated block at the end of the `describe("TurboEventsController")`:

- `createEventBox` with `details: {}` ⇒ no `.event-box-details`.
- `createEventBox` with `details: { url: "..." }` ⇒ closed `<details>`, `<summary>Details</summary>`, one `<dt>` (text "url"), one `<dd>` (text "…").
- Multi-key case asserts two `<dt>` rows in insertion order, both `<dd>` values readable.
- Bridge-driven push asserts the same rendering through the production `addEvent` path (not just `createEventBox` directly).

**Burst test**: the existing `respects the cap and dropped notice under push bursts` test pushes more than the cap. If your new details block height affects scroll math in happy-dom under bursts, that's worth a separate assertion: the final rendered `controller.eventTargets.length` still equals `MAX_EVENTS_DEFAULT` and the dropped count matches, proving the block doesn't change the bookkeeping contract.

E2E (`tests/e2e/content-script.spec.js` via `withPanelMessagesListener`):

- Use `turboEventsWithDetailsFixturePush` for panel rendering. Click the `<summary>` and assert the `<dt>`/`<dd>` pair is visible.
- For new switch arms, dispatch a `new CustomEvent("turbo:before-visit", { detail: { url: "/x" }, bubbles: true })` on the fixture. Assert `readMessages()` contains a push whose `name === "turbo:before-visit"` and `details` carries `{ url: "/x" }` — full push shape, not just the name.

### Deeper per-event surfaces

For richer drill-downs (e.g. JSON view of full detail, payload diffs across pushes of the same name):

- **Keep the timeline cheap.** A timeline row is always one row, always one target. The current `<details>` block is meant for *one-line* read-only fields, not nested JSON.
- **Use the details panel.** The existing slide-over (see `details-panel` skill) is the right home for "inspect this event". Dispatch a typed CustomEvent on `document` (e.g. `SHOW_TURBO_EVENT_DETAILS_EVENT`) with a payload identifying the row index / push; subscribe from `DetailsPanelController`. The row acts as a button (Stimulus action click → dispatch event); the panel renders the rich view. This split keeps the timeline rendering simple and the detail surface mature.
- **Don't auto-open the panel on push.** A timeline that auto-pops on every event is unusable. Render rows; surface "view details" affordance per row; let the user opt in.

### Don't

- Don't add a child Stimulus target per row for the block body. Per-row targets break the cap/trim invariant that assumes one target per push.
- Don't bind click handlers directly inside `createEventBox` if you can avoid it. Use Stimulus actions on the controller class so they survive re-mounts; for the disclosure affordance, the native `<details>` element already handles it.
- Don't change `addEvent`'s argument shape in a way that breaks existing unit tests without updating every fixture push in the same PR. Treat the bare-name overload as a thin wrapper if you keep it.

## Working on it

- For watcher changes: unit-test with a fake `EventTarget` (the watcher doesn't care if `document` is real or a mock). Run `npm test -- --run tests/unit/turbo-event-watcher.test.js`.
- For controller changes: mirror the markup from `entrypoints/panel/index.html` in `tests/unit/turbo-events-controller.test.js`, force `getComputedStyle` to report the right value by injecting relevant CSS at the top of the file (see existing `EVENTS_PANEL_CSS` block). Stub the bridge via `createStubBridge()` — never use `{}` as the bridge; the controller will throw on `bridge.offTurboEvent()`.
- For E2E push coverage: use `withPanelMessagesListener(frame, async ({ readMessages }) => { ... })` from `tests/e2e/helpers.js`. Capture must run inside the helper's body so the port is connected before events are dispatched; asserts go through `expect.poll(readMessages)`. The helper disconnects the port and clears frame globals in `finally`, so the background's `panelPortsByTab` entry is released for the next test.

## When NOT to use this skill

- For panel rendering patterns not tied to the events pipeline (e.g. tree-nodes, details-panel, theme switcher), use the `details-panel` skill or read general conventions in `AGENTS.md`.
- For the underlying port / messenger shape, see the existing `Messaging architecture` and `addMockPanelApis` sections of `AGENTS.md`. The push pipeline borrows from there — no new background logic is needed.

## Boundaries

- The watcher never touches the inspected page DOM. It attaches listeners to `document` only, and only for the names on the curated list. Adding a new event name does not require any change outside `lib/turbo-event-watcher.js`. Removing an event does not require any cleanup elsewhere.
- The push payload is **minimal by default** (`{ type, name, timestamp, details: {} }`) and grows by opt-in only via the switch statement in `turboEventDetailsFor`. Push shape stays narrow on the wire; the records in `details` are small, intentional, and string-typed.
- The Turbo Events tab is **a timeline, not a debugger**. Rows are uniform-one-target apiece; deeper drill-downs belong in the existing details panel, surfaced via a typed CustomEvent from a row-click action.
