---
name: turbo-events-capture
description: Use when working on Hotwire Inspector's live Turbo event capture — the capture-side watcher, the content→background→panel port pipeline that carries pushes, the Turbo Events tab in the panel, or any extension that captures other event families (e.g. Stimulus lifecycle) on the inspected page.
---

# Turbo Events capture & rendering

Hotwire Inspector runs a content-script watcher that subscribes to a curated list of Turbo 8.x DOM events on `document`, forwards each fire to the panel over the existing content→background→panel port pipeline, and renders a chronological timeline in the **Turbo Events** tab of the DevTools panel.

This skill covers the capture pipeline, the data shape that rides it, and how the panel turns pushes into `.event-box` rows.

## Key files

- `lib/turbo-event-watcher.js` — exports `TURBO_EVENT_NAMES` (the curated list) and `TurboEventWatcher` (the document-listener class). The list is the single source of truth — both the watcher and any tests that need to assert coverage import it from here.
- `lib/constants.js` — `TURBO_EVENT_PUSH_TYPE` (the push-type string `hotwire-inspector:turbo-event`).
- `lib/types.js` — `TurboEventPush` typedef (`{ type, name, timestamp, [detail] }`) and the optional `TurboEventDetail` typedef (a catalog of fields readers can emit).
- `lib/content-inspector.js` — owns `startTurboEventWatcher()` and `disconnect()` teardown. The watcher is constructed in `startTurboEventWatcher` and posts each capture to `this.reconnectingPort?.port?.postMessage(...)`.
- `entrypoints/content.js` — calls `inspector.startTurboEventWatcher()` next to the other startup watchers (tree, page lifecycle).
- `lib/panel-bridge.js` — owns the `TURBO_EVENT_PUSH_TYPE` branch on the panel events port and exposes `onTurboEvent(callback)` + `offTurboEvent()`. `onTurboEvent` is symmetric with the other `onXxxChanged` setters; it also calls `connectEventsPort()` so pushes can start arriving.
- `lib/panel/controllers/turbo-events-controller.js` — the Stimulus controller for the **Turbo Events** tab.
- `entrypoints/panel/index.html` — `<section id="panel-events">` markup: `<p class="events-dropped-notice">`, `<div class="events-list">`, `<p class="events-empty">`. CSS-driven visibility — see comments in the file.
- `entrypoints/panel/style.css` — `.events-*` rules (cap, scroll behavior, empty/lists visibility, dropped-notice styling).
- `tests/unit/turbo-event-watcher.test.js` — list contents, start/stop symmetry, capture-phase options, `useCapture: true`, idempotency, null-document safety, `Date.now()` fallback. Uses a fake `EventTarget` so it runs under `happy-dom`.
- `tests/unit/turbo-events-controller.test.js` — bridge subscription, single-push append, multi-push append, **cap-and-dropped-notice under push bursts**, bridge subscription cleared on `disconnect()`, no renders after `disconnect()`. Stub bridge via `createStubBridge()` with `onTurboEvent`/`offTurboEvent`.
- `tests/unit/panel-bridge.test.js` — `onTurboEvent` route, `offTurboEvent` clears callback, ignores non-turbo-event messages on the same port.
- `tests/e2e/helpers.js` (and `tests/e2e/adapters/chromium-adapter.js`) — `withPanelMessagesListener(frame, body)` opens a panel-port impersonation from the devtools frame and exposes `readMessages()`; this is how the content-script E2E test asserts that a real push arrives.
- `tests/e2e/content-script.spec.js` — the only E2E coverage for the wire-up: dispatches synthetic `turbo:load` / `turbo:render` on the fixture, asserts both `TurboEventPush`es arrive on the impersonated panel port with the expected `name` and `type`.

## Architecture

```
document.dispatchEvent("turbo:load") / Any turbo:* event with .detail
  └─► TurboEventWatcher.handleEvent (capture phase, registered in start())
        └─► READERS[name]?.(event) → { url?, method?, ... }
        └─► callbacks.onEvent({ name, timestamp, [detail] })
              └─► ContentInspector.startTurboEventWatcher's onEvent
                    └─► reconnectingPort.port.postMessage({ type: TURBO_EVENT_PUSH_TYPE, name, timestamp, [detail] })
                          └─► background.onMessage forwarder
                                └─► panel events port onMessage
                                      └─► PanelBridge turboEventCallback
                                            └─► TurboEventsController.addEvent(push)
                                                  └─► listTarget.appendChild(createEventBox(push))
                                                        └─► Stimulus `eventTargetConnected` → trim + drop + autoscroll
```

**Capture-side invariants.** The watcher treats `document` opaquely (anything with `addEventListener`/`removeEventListener` works). It still never reads `event.target` directly — the inspected page's elements remain unreachable. **The push payload is minimal by default** (`{ type, name, timestamp }`), and a per-event-name **reader table** (see "Capturing more detail" below) is the _only_ opt-in path for additional fields. Do not publish the full `event` object on the bus, do not stringify arbitrary `event.detail`, do not let any reader call into page JS.

**Panel-side invariants.** `addEvent(push)` is the single rendering entry point, where `push` is a full `TurboEventPush`. The watcher, the bridge, the controller, and any future capture sources must all converge on it (the controller may also accept a bare `name` for tests/ergonomics, but treat the push payload as the canonical input). The Stimulus `eventTargetConnected` lifecycle is the single bookkeeping entry point for trim/drop/autoscroll; do not split it across multiple hooks (happy-dom-friendly and ensures connected/disconnected fire uniformly).

## Adding a new Turbo event name

1. Add the string to `TURBO_EVENT_NAMES` in `lib/turbo-event-watcher.js`. Keep the list ordered roughly by Turbo lifecycle phase (visit → fetch → render → streams → morph → submit → prefetch) — it's also the visual order the timeline ends up showing.
2. Verify it landed: the watcher test asserts the exact list contents; the unit test will fail if you mistype.

That is all. There are no other call sites to update — the watcher, the controller, the test fixtures, and the E2E synthetic dispatcher all read from the same export.

## Capturing more detail

Some Turbo events carry useful `event.detail` (URLs, fetch options, render targets, request IDs). When a name has a **reader**, the watcher emits that reader's payload alongside `name` and `timestamp`; when it doesn't, the push stays minimal. Readers are an explicit, opt-in mechanism, not a generic dump.

### Choose what each reader produces

Two shape strategies:

- **Generic `detail` field** — every event pushes `{ type, name, timestamp, detail: event.detail }` (or JSON-stringified for non-objects). Simple, automatic, future-Turbo events inherit it. Downside: untyped payload, uncurated content.
- **Per-event readers** — a `READERS` table keyed by event name; each entry runs `event.detail?.x` reads and returns the small set of fields that name cares about. Typed payload, intentional content, matches the existing "narrow capture" style.

The codebase already curates both lists (`TURBO_EVENT_NAMES`) — extending that pattern to **per-name readers** keeps the capture-side contract intentional. Recommend this approach: a generic dump risks leaking arbitrary user data (request bodies, sensitive URLs) and untyped shapes rot. Pick per-event readers.

### Wire a reader table

In `lib/turbo-event-watcher.js`, add a `READERS` table next to `TURBO_EVENT_NAMES`:

```js
const READERS = {
  "turbo:before-visit": (event) => ({ url: readUrl(event)?.href }),
  "turbo:visit": (event) => ({ url: readUrl(event)?.href }),
  "turbo:frame-missing": (event) => ({
    id: event.detail?.frameId,
    src: event.detail?.src,
  }),
  "turbo:before-fetch-request": (event) => ({
    url: readUrl(event)?.href,
    method: event.detail?.fetchOptions?.method,
  }),
  // ...one entry per name you intend to enrich.
};
```

Where `readUrl` is a tiny helper that returns `{ href, pathname }` from `event.detail.url` (a string or `Location`-like) or `null` — never throws. Readers are **pure**: they read `event.detail` only, return plain objects, and never call into page JS.

`handleEvent` becomes:

```js
handleEvent(event) {
  const reader = READERS[event.type];
  const payload = {
    name: event.type,
    timestamp: event.timeStamp ?? Date.now(),
  };
  const detail = reader?.(event);
  if (detail && Object.keys(detail).length > 0) {
    payload.detail = detail;
  }
  this.onEvent(payload);
}
```

The detail field is **omitted** when the reader returns nothing useful — push shape stays `{ type, name, timestamp }` for non-enriched events. This is additive: existing consumers that only read `name` keep working.

### Update the typedef

In `lib/types.js`:

```js
/**
 * Optional per-event enrichment produced by a reader in the
 * `TurboEventWatcher.READERS` table. The set of fields present
 * depends on `push.name` — readers are per-name.
 *
 * @typedef {object} TurboEventDetail
 * @property {string} [url]
 * @property {string} [method]
 * @property {string} [id]
 * @property {string} [src]
 * // ...add fields here as readers are added.
 */

/**
 * @typedef {object} TurboEventPush
 * @property {import("./constants.js").TURBO_EVENT_PUSH_TYPE} type
 * @property {string} name
 * @property {number} timestamp
 * @property {TurboEventDetail} [detail]
 */
```

Typecheck stays green and any future reader gets a typed home for its fields. Don't add fields to `TurboEventDetail` that no reader emits — the typedef stays a _catalog_ of available enrichment, not a promise.

### Test the readers

Extend `tests/unit/turbo-event-watcher.test.js`:

- For each event name with a reader, dispatch a `CustomEvent` (happy-dom supports `event.detail`) and assert the callback receives the exact enriched payload.
- Assert that names _without_ a reader still emit the minimal `{ name, timestamp }` shape (no `detail` key).
- Sanity: total coverage of `READERS` keys equals `TURBO_EVENT_NAMES` filtered to ones with readers. A mismatch means a reader mis-named a key.

`tests/e2e/content-script.spec.js` should add at least one enriched event to the synthetic dispatch list and assert the full push (including `detail.*`) flows through the panel port — the `withPanelMessagesListener` helper is already a strong seam for this.

### Don't

- Don't read `event.target` itself. Element-tree state stays in the scan pipeline, not the event bus.
- Don't put the entire `event` object on the bus. The push contract is curated: `name`, `timestamp`, optional `detail`.
- Don't add a reader that calls into the page JS (`eval`, `fetch`, `inspect`, …). Capture is read-only from the inspected page.
- Don't stringify the entire `event.detail` "to be safe". If the user wants raw `detail` for one event, add a typed reader for it; do not fall back to `JSON.stringify`.
- Don't make readers part of the constructor signature of `TurboEventWatcher`. They are a module-level table; the watcher is pure pass-through.

## Adding a watcher for a different event family

The Turbo event watcher is the template. To capture, say, Stimulus lifecycle events:

1. Pick a new module name (`lib/stimulus-event-watcher.js` is the obvious place). Export the curated event names and a class shaped the same way as `TurboEventWatcher` — capture-phase `document` listener, idempotent `start()`, paired `stop()` that removes exactly what `start()` added.
2. Add a new `*_PUSH_TYPE` constant next to `TURBO_EVENT_PUSH_TYPE` in `lib/constants.js`, and a matching `*Push` typedef in `lib/types.js`. Push payload shape: `{ type, name, timestamp, …familySpecific }`. Keep the fields trim — capture is on the hot path.
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

### Adding visual richness inside an event row

When a `TurboEventPush` carries a `detail` payload (see "Capturing more detail" above), the row stays a single Stimulus `event` target but gains internal structure. The bookkeeping path (`eventTargetConnected`-based trim/drop/autoscroll) does not change — only `createEventBox` grows.

In `lib/panel/controllers/turbo-events-controller.js`, `createEventBox(push)` becomes:

```js
createEventBox(push) {
  const box = document.createElement("div");
  box.className = "event-box";
  box.dataset.turboEventsTarget = "event";

  const name = document.createElement("span");
  name.className = "event-name";
  name.textContent = push.name;
  box.appendChild(name);

  if (push.detail && hasRenderableDetail(push.detail)) {
    const summary = document.createElement("span");
    summary.className = "event-detail";
    summary.textContent = formatDetail(push.name, push.detail);
    box.appendChild(summary);
  }

  return box;
}
```

- `box` remains a single `.event-box` Stimulus target. `eventTargetConnected` still fires exactly once per push and still does trim/drop/autoscroll — internal structure of the box is irrelevant to bookkeeping.
- The order inside the box is always `[name, detail?]`. Don't re-order rows or add per-name styling that changes height based on a name; autoscroll's threshold-distance logic assumes uniform height rows.
- `formatDetail(name, detail)` is a **pure** helper that returns a short, single-line string ("GET /main", "id=sidebar", "GET /main → 200"). It's pure so unit tests can assert its outputs without mounting the panel.
- Render the detail as **text**, not markup, unless you have a good security argument — `push.detail.*` can include URLs that should be `textContent`-safe but never `innerHTML`.

### Tests for richer rendering

`tests/unit/turbo-events-controller.test.js`:

- Push a `{ name: "turbo:load", timestamp: 0 }` (no detail) — assert the box has only `.event-name`, no `.event-detail`.
- Push a `{ name: "turbo:before-fetch-request", timestamp: 0, detail: { url: "/main", method: "GET" } }` — assert the box has `.event-name === "turbo:before-fetch-request"` and `.event-detail === "GET /main"`.
- Add a small `formatDetailSpec` test (pure function) for the formatting choices you make.
- Burst test: with the cap buster, the **last** dropped box's `detail` content is verifiable, ensuring rich rows go through trim like simple ones do.

E2E (`tests/e2e/content-script.spec.js` via `withPanelMessagesListener`):

- Dispatch `new CustomEvent("turbo:before-fetch-request", { detail: { url: "/main", fetchOptions: { method: "GET" } }, bubbles: true })` from the page side.
- Assert `readMessages()` contains a push whose `name === "turbo:before-fetch-request"` and `detail` carries `{ url, method }` — full push shape, not just the name.

### Deeper per-event surfaces

For richer drill-downs (e.g. click-to-expand body, JSON view of full detail, payload diffs across pushes of the same name):

- **Keep the timeline cheap.** A timeline row is always one row, always one target. Don't add `<details>` per row that flips autoscroll math.
- **Use the details panel.** The existing slide-over (see `details-panel` skill) is the right home for "inspect this event". Dispatch a typed CustomEvent on `document` (e.g. `SHOW_TURBO_EVENT_DETAILS_EVENT`) with a payload identifying the row index / push; subscribe from `DetailsPanelController`. The row acts as a button (Stimulus action click → dispatch event); the panel renders the rich view. This split keeps the timeline rendering simple and the detail surface mature.
- **Don't auto-open the panel on push.** A timeline that auto-pops on every event is unusable. Render rows; surface "view details" affordance per row; let the user opt in.

### Don't

- Don't add a child Stimulus target per row for the detail body. Per-row targets break the cap/trim invariant that assumes one target per push.
- Don't bind click handlers directly inside `createEventBox` if you can avoid it. Use Stimulus actions on the controller class so they survive re-mounts.
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
- The push payload is **minimal by default** and grows by opt-in only. Push shape stays `{ type, name, timestamp }` unless a per-event reader exists; readers add a small typed `detail`. Do not promote the minimum shape to "everything" — capture stays narrow on the wire.
- The Turbo Events tab is **a timeline, not a debugger**. Rows are uniform-one-target apiece; deeper drill-downs belong in the existing details panel, surfaced via a typed CustomEvent from a row-click action.
