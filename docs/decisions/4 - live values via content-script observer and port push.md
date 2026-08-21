# Live values via content-script observer and port push

## Status

Accepted

## Context

Stimulus controllers declare typed `static values = {}`. The inspector resolves
`data-*-value` attributes at scan time, but only when the user presses Refresh. When a
controller's values change at runtime while the details panel is open, the user must
manually refresh to see the new state.

## Decision

**Observe value attribute changes with a MutationObserver in the content script, and push
updates to the panel over a long-lived port.**

Two key choices:

1. **MutationObserver in the content script** rather than an injected page script. The
   observer watches the element's `data-*-value` attributes directly. No page-DOM mutation
   and no additional script injection is needed (consistent with decision 2 — no page-DOM
   mutation).

2. **Port-based event channel** rather than broadcast messaging. Monitoring live values
   requires 2 way low latency communication so ports are better fit. The content script
   opens a port to the background, which routes pushes to the panel's port. Ports provide
   `onDisconnect` lifecycle awareness for clean teardown, and per-tab scoping prevents
   cross-tab leakage.

3. **The port is infrastructure, not tied to a watch.** The content script opens the port
   eagerly at initialization — before any watch is requested — and keeps it alive for the
   lifetime of the content script. This makes the channel reusable for future
   message types beyond value pushes. If the port disconnects, the content script
   reconnects automatically with exponential backoff (100ms doubling, capped at 5s). The
   delay never resets while the page lives: a flapping connection gets escalating backoff
   rather than hammering at the initial interval, and the reset happens naturally on page
   unload. After a reconnect, the content script re-pushes the current values of any
   active watch, resyncing the panel in a single message since updates are not
   incremental. Unwatching a controller stops the observer but deliberately leaves the
   port open.

## Consequences

- The inspected page's runtime behavior is unchanged; the observer is read-only.
- Cross-browser safe: `MutationObserver` and `browser.runtime.connect` are available in
  both Chromium and Firefox MV3.
- The background script maintains per-tab port maps in addition to the existing one-shot
  message relay.
- The panel is responsible for initiating and tearing down watches; the content script
  owns the port lifecycle (eager connect, backoff reconnect, teardown on page unload).
- Reconnection logic lives in a dedicated helper (`lib/port-reconnect.js`), separate from
  content-inspector concerns, so other port consumers can reuse it.
