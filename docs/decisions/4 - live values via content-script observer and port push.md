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

## Consequences

- The inspected page's runtime behavior is unchanged; the observer is read-only.
- Cross-browser safe: `MutationObserver` and `browser.runtime.connect` are available in
  both Chromium and Firefox MV3.
- The background script maintains per-tab port maps in addition to the existing one-shot
  message relay.
- The panel is responsible for initiating and tearing down the watch; the content script
  cleans up on port disconnect as a safety net.
