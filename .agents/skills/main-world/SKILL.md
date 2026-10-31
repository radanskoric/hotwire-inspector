---
name: main-world
description: Implement Hotwire Inspector MAIN features, bootstrap and document lifecycle, or validated cross-realm bridges. Use for changes under lib/main_world or the isolated MAIN client.
---

# MAIN World

Use MAIN for live page-owned objects, framework instances, or curated extraction that cannot work correctly in isolation. Keep DOM scans, live value attributes, identity, highlighting, ports, and extension APIs isolated. MAIN frame capture reads only the incoming frame's src, ID, and serialized markup.

The sole bootstrap is [main-world.content.js](../../../entrypoints/main-world.content.js). Add feature modules under [lib/main_world](../../../lib/main_world/) and append their factories to the entrypoint's runtime list. Keep imports and factories side-effect-free and the entrypoint lean. Read the entrypoint's factory list for active features, and the ownership exports in `lib/turbo-event-watcher.js` for capture placement. All Stimulus RPC uses MAIN; live value observation stays isolated.

Features expose idempotent `start()` / `stop()` and an operation map with result validators. Register listeners only in start. Keep startup independent; runtime diagnostics contain factory/start/stop errors, and stop must tolerate partial startup. Duplicate and reserved operations are errors. Explicit teardown removes exact listeners and stops all features despite cleanup failures. Do not stop on BFCache pagehide or restart on persisted pageshow. Eager registration does not mean eager lookup, polling, or storage.

Avoid page globals, DOM markers, prototype patches, persistent controller references, and source-event cancellation. Explicit controller storage is the exception, only upon a valid RPC request. It chooses the first unused `tempN` using `in`, preserves existing and inherited names, and does not delete stored globals on teardown. Page code can forge that request: it does not authenticate a panel click or user gesture. Storage never retries or falls back to injection; a timeout does not prove that no write occurred.

Use [controller-lookup.js](../../../lib/main_world/controller-lookup.js) for request-time access in the order `Stimulus`, `stimulusApp`, `StimulusApp`. Both storage and definition queries use it. Do not retain application/controller references between requests. Calling page-owned framework methods and accessing properties can execute getters or other application code; avoid claims that lookup is wholly passive. Successful storage responses must reconstruct a valid temp name and an identifier matching the pending request. Result validators receive the original request where available.

Use JSON-only validated document RPC through [rpc-server.js](../../../lib/main_world/rpc-server.js), [protocol.js](../../../lib/main_world/protocol.js), and the [isolated client](../../../lib/main-world-client.js). Shared event constants and JSDoc types are in `lib/constants.js` and `lib/types.js`. Validators must reconstruct approved fields; never pass arbitrary page objects through as successful results. Read the protocol before adding an operation. The client shares readiness probes, has independent five-second total deadlines, never retries real operations, and stops polling when idle or disconnected.

One-way capture features may use their own typed events: a single entrypoint does not require a universal message bus. Neither bridge is authenticated and MAIN has no extension privileges. Browser registration avoids script-element insertion; equivalent code injected with a script tag has comparable runtime effects, and eager listeners add idle footprint.

Turbo capture has an empty operation map and reuses the shared watcher/extractor
with the frozen MAIN ownership list. Capture the incoming frame's complete
outerHTML up to 65,536 UTF-16 units, otherwise emit the explicit omission error;
src/ID are independently bounded to 8,192. Serialization allocates the full string
before checking length. Never retain the source event/Element or alter source
propagation/cancellation. Extraction exceptions drop only that capture.
Dispatch curated JSON on the connected same-document source Element or document.
The isolated [Turbo parser](../../../lib/turbo-event-bridge.js) validates the
one-way record independently of RPC. Its exact listener starts before ports at
document start and tears down alongside the RPC client; identity stays isolated.
There is no Turbo readiness RPC, replay queue, or isolated fallback. See
[plan 4](../../../docs/plans/04-main-world-turbo-frame-html.md) for exact protocol
limits.

Follow [ADR 5](../../../docs/decisions/5%20-%20shared%20MAIN%20world.md). Use red/green tests, accurate JSDoc, and 100% statements/branches/functions/lines for new lib code, without coverage exclusions. Definition validators reconstruct at most 1,024 entries, with descriptor strings up to 16,384 code units, outlet strings up to 1,024, and JSON defaults nested at most 32 containers. Reject dangerous keys (`__proto__`, `constructor`, `prototype`), unsupported/circular defaults and throwing getters; never silently drop defaults. Server serialization and client parsing enforce the 1 Mi-code-unit response bound. Error results use the shared bounded failure format.

Run real installed-extension boundary tests, not bundle evaluation. The normal Firefox adapter/smoke suite mocks panel APIs and cannot prove MAIN execution. The separate `tests/e2e/run-firefox-main-world-gate.js` installs a temporary add-on with test-only instrumentation and verifies storage and definitions across all three supported globals and both startup orders, including failure containment, no added scripts, and no unexpected globals. Chromium's `main-world-gate.spec.js` also installs the instrumented extension; content-script E2E tests exercise storage, definitions, and live-value pushes through the real extension relay, reloads and navigation. Chromium gate tests query definitions again after BFCache restoration while retaining the exact stored controller without repeating storage. Builds, mocked smoke tests, and skipped tests do not satisfy the browser gate.
