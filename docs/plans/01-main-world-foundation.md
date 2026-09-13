# 1. Establish a shared MAIN-world entrypoint

## Starting point and outcome

Implement this on main after discarding the Turbo MAIN-world research spike.
Do not require any uncommitted spike files or this conversation. The baseline
has an isolated `entrypoints/content.js`, a lazily injected
`entrypoints/inspected-page-inject.js` for Stimulus RPC, and an isolated Turbo
watcher. Existing richer Turbo details and epoch timestamps may already exist.
Read the actual implementation before editing; do not restore stale documentation
claims that only event names are captured.

Create exactly one browser-registered MAIN entrypoint,
`entrypoints/main-world.content.js`, with HTTP/HTTPS matches, `world: "MAIN"`,
`runAt: "document_start"`, and `globalName: false`. It delegates to a runtime in
the new `lib/main_world/` directory. Feature implementation and startup logic
belong in that directory, not in the entrypoint. Use static imports, without
dynamic script elements, eval, global sentinels, or extension APIs in MAIN.

This plan establishes infrastructure only. Controller storage, value/outlet
queries, and Turbo capture retain their existing paths until plans 2, 3, and 4.
If spike files survived, remove duplicate MAIN registration deliberately while
preserving baseline behavior; do not depend on the Turbo-specific entrypoint.

## Architecture and interfaces

- Put orchestration in `lib/main_world/runtime.js`, document RPC handling in
  `lib/main_world/rpc-server.js`, and the isolated client in
  `lib/main-world-client.js`. Shared event constants and JSDoc wire types live
  in `lib/constants.js` and `lib/types.js`.
- The runtime accepts an explicit list of feature factories. Each receives the
  document, returns a feature with idempotent `start()`/`stop()` and an operation
  handler map. Imports and factory calls must be side-effect-free; put listener
  registration and other page effects in `start()`. Initially the production list
  is empty. Subsequent plans add concrete features, not another entrypoint.
- Catch factory/start failures separately per feature, clean up partial
  registration, and continue starting other features. Advertise operations only
  for successfully started features; duplicate operation names are registration
  errors. Keep diagnostics in runtime state rather than writing page globals or
  routinely logging into the application's console. If `start()` throws, call
  that feature's `stop()`, which must support partially completed startup.
  Contain each `stop()` failure so remaining features and runtime listeners are
  still cleaned up, both after failed startup and during explicit teardown.
- MAIN listeners live with the document. Runtime stop removes exact listeners
  and stops features; it is for explicit teardown/tests. Do not stop on BFCache
  pagehide or restart on persisted pageshow: the existing document retains its
  listeners. Normal navigation creates a new instance. Isolated client
  disconnect clears pending listeners/timers and rejects outstanding requests.
- Move the isolated entrypoint to `document_start`, installing bridge listeners
  synchronously before other watchers. Defer tree startup until DOMContentLoaded
  while `document.readyState === "loading"`; otherwise start it immediately.
  This avoids missing-root errors and repeated scans during parsing. Start the
  tree watcher exactly once and remove any pending readiness listener on
  disconnect. Do not delay the MAIN bridge for DOMContentLoaded.

Use distinct events `hotwire-inspector:main-world-rpc-request` and
`hotwire-inspector:main-world-rpc-response`, dispatched directly on `document`
with non-bubbling JSON-string detail. These must not collide with legacy
script-element RPC events. No source page event is cancelled or intercepted.

Request: `{ version: 1, requestId, operation, selector?, identifier? }`.
Response: `{ version: 1, requestId, operation, result }`. Preserve operation
result shapes; do not introduce changes to panel/background requests.
Reserve `bridgeStatus` for `{ success: true, operations: string[] }`.
Future operations are `storeController`, `controllerValueDefinitions`, and
`controllerOutletDefinitions`; do not advertise them until implemented.

The client registers response listeners before dispatch, correlates both ID and
operation, and preserves the existing five-second request deadline. Share one
`bridgeStatus` probe loop across all requests waiting for readiness: probe
immediately when the loop starts and every 50 ms while waiters remain. When a
requested operation is advertised, remove its waiting requests from the loop
and dispatch each real operation exactly once. Keep independent deadlines per
request covering readiness and response together; new requests must not extend
existing deadlines. Stop probes as soon as no readiness waiters remain, even
when real responses are still pending, and on disconnect. Expired requests must
also leave the waiting set. Never retry the actual operation: storage has side
effects. An early probe may be missed; a later probe handles reversed script
startup order without a one-shot ready event race. No polling when idle.

Validate JSON on both sides using pure helpers and reconstruct approved fields.
Require a plain object, version 1, a nonempty requestId up to 128 characters,
and a known operation. Reject unknown fields. Controller operations require a
nonempty selector up to 16,384 characters and identifier up to 1,024 characters;
status requires neither. Cap raw request JSON at 128 Ki UTF-16 code units and
response JSON at 1 Mi code units before parsing. Reject malformed and unmatched
responses without settling unrelated requests. Each feature supplies its result
validator; do not accept arbitrary page objects as successful results.
On valid requests, contain handler/serialization failures and return the common
failure result `{ success: false, error }`, with `error` a string of at most
4,096 UTF-16 code units. Validate and reconstruct this failure shape on both
sides for every operation, including status. On invalid envelopes, ignore
without executing a handler.
JSON detail is compatibility transport, not authentication: page code can spoof
both endpoints. Do not expose extension capabilities through a generic eval or
arbitrary-function dispatcher. Do not reuse the element identity map for RPC IDs.
After storage migrates, page code can forge a valid storage request and create
`tempN` globals without a panel click. "Only when requested" means receipt of a
valid RPC request, not authenticated user intent. This is an accepted page-level
side effect, not extension privilege escalation; validation and request IDs do
not enforce a user-gesture boundary.

## Browser gate and research limits

Before migrating any functionality, prove this registration executes in actual
supported browsers. Build Chrome MV3, Firefox MV3, and the configured Safari
target; inspect the single MAIN registration and anonymous bundle. A generated
manifest accepting `world` is not evidence that a browser executes in MAIN.

Create a browser fixture where page code exposes a harmless object and a
test-only MAIN handler reads it, returning scalar JSON to the isolated client.
Register that test handler only in test instrumentation, never in the shipped
operation list. Verify both startup orders, no script-element insertion, and no
unrequested page globals. Test with the extension installed, not by evaluating
the bundle directly in the page.

Chromium's existing DevTools-frame messaging helper can drive the client through
test instrumentation. The existing Firefox adapter cannot load extensions and
the Firefox smoke suite only tests a mocked panel. Implement real extension
test support or perform and record a reproducible manual installed-extension
test. Safari may use a manual installed-extension test. Record exact browser
versions, OS, manifest version, steps, and actual results in the new ADR. Do not
declare this gate green on builds, mocks, or skipped tests. If support fails or
cannot be verified, leave the migration blocked with precise evidence; do not
silently introduce a script-tag fallback or drop supported browsers.

Research established shared-realm risks and the DOM insertion difference, not
a universal best-practice preference. Relevant dated sources: MDN
[content_scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts)
(page updated June 21, 2026) and WXT
[injection maintenance](https://github.com/wxt-dev/wxt/pull/2232)
(merged April 13, 2026). Recheck compatibility at implementation time; neither
source substitutes for runtime validation.

## Documentation and main-world skill

Update AGENTS.md and README architecture sections in this implementation:
describe the shared MAIN bootstrap and feature directory alongside the still
lazy Stimulus script. Label later migrations as future work, not shipped facts.
Document that equal code in MAIN or a script tag has comparable runtime effects;
browser registration removes script-element mutation but eager listeners add
idle footprint. Add an ADR for the shared entrypoint, bridge trust, browser gate,
and incremental migration, and update the no-DOM-modifications ADR accordingly.

Create `.agents/skills/main-world/SKILL.md` with YAML `name: main-world` and a
description targeting MAIN features, their bootstrap/lifecycle, and cross-realm
bridges. Follow the available skill-creator instructions when implementing it.
The skill must be self-contained and contain:

- Use MAIN for live page-owned objects, framework instance access, or curated
  extraction that cannot work correctly in isolation. Keep DOM scans, attribute
  reads, identity, highlighting, ports, and extension API access isolated.
- Add feature modules under `lib/main_world/`, register once in the runtime,
  supply operation validators where applicable, and keep the entrypoint lean.
  Eager registration does not mean eager controller lookup, polling, or storage.
- Keep feature startup independent and lifecycle cleanup exact; avoid page
  globals, DOM markers, prototype patches, persistent controller references,
  and source-event cancellation. Explicit controller storage is a documented
  exception, implemented only on a valid RPC request; the page can forge such a
  request, so this does not authenticate a panel click or user gesture.
- Use JSON-only validated document RPC and the existing isolated client;
  one-way capture features may use their own typed event protocol. A single
  entrypoint does not require one universal message bus. Neither bridge is
  authenticated and MAIN has no extension privileges.
- Red/green tests, accurate JSDoc, 100% coverage for new lib code, and real
  browser boundary tests. Explain the Firefox mock limitation and browser gate.
- Link the ADR and concrete implementation modules. Update this skill as each
  later feature lands; do not claim unimplemented features exist.

## Red/green implementation and acceptance

1. Write failing bootstrap and runtime tests for registration, zero unsolicited
   page effects, side-effect-free factories, independent feature startup,
   partial-failure cleanup, throwing cleanup, duplicate operations, and
   start/stop symmetry. Implement the smallest runtime to pass.
2. Write failing RPC tests for JSON validation, both startup orders, one-time
   real dispatch, shared probing with independent deadlines, probe teardown on
   dispatch of the last waiter, concurrent/out-of-order responses, missing
   feature, timeout, malformed payloads, bounded failures, thrown handlers, and
   disconnect. Implement client/server.
3. Write failing early-document tree/port regressions, including no tree scans
   during parsing, exactly one startup after readiness, immediate startup for
   an already-ready document, and disconnect before readiness. Then change
   isolated startup timing. Preserve existing scan, highlight, reconnect, and
   lazy RPC.
4. Run the browser gate before marking the foundation ready for plan 2. Update
   docs/skill and confirm no second MAIN entrypoint is registered.

Run `npm run lint`, `npm run lint:css`, `npm run format:check`,
`npm run typecheck`, `npm test -- --run`, and `npm run coverage`. Inspect the
coverage configuration and require every new `lib/main_world/**/*.js` and client
module to be included with 100% statements/branches/functions/lines; never add
exclusions to make the numbers pass. Run `npm run build`, `npm run build:firefox`,
`npm run build:safari`, `npm run test:e2e`, and `npm run test:e2e:firefox`, recording
the latter's actual scope separately from installed-extension verification.

Complete when the browser gate, baseline behavior, tested infrastructure, ADR,
AGENTS.md, README, and skill are all delivered. No Stimulus operation has moved.
