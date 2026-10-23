# 3. Move remaining Stimulus RPC into MAIN and remove script injection

## Starting point and outcome

Execute after plans 1 and 2 on main. Read AGENTS.md, `.agents/skills/main-world/`,
and the foundation ADR; no discarded spike files are prerequisites. There is one
MAIN bootstrap with independent feature modules in `lib/main_world/`, a validated
document RPC client/server, request-time controller lookup, and a migrated
`storeController` feature. The lazy injected entrypoint still owns value and
outlet definition queries. Live value observation and element identity remain
isolated. Turbo capture is not part of this migration.

Plan 2 is implemented, including installed Chromium and Firefox storage tests.
Safari investigation is paused at the user's request; installed Safari execution
remains unverified. Permission to proceed with plan 2 did not close that gate or
establish runtime support for later migrations. Keep this gap explicit.

Move both remaining operations to MAIN, then remove the injected entrypoint and
all production script-tag loading. Eager startup registers services only; opening
controller details triggers lookup. Preserve existing panel behavior and types.

## Implementation and interfaces

- Add a controller-definitions feature under `lib/main_world/` and register it
  once in the existing runtime. Its operation map contains
  `controllerValueDefinitions` and `controllerOutletDefinitions`. Reuse the
  existing `findController(document, selector, identifier)` from
  `lib/main_world/controller-lookup.js` and the pure extraction helpers in
  `lib/controller-values.js` and `lib/controller-outlets.js`. Lookup already
  supports `Stimulus`, `stimulusApp`, and `StimulusApp`, in that order, for both
  storage and legacy definitions. Do not duplicate it. Preserve
  `createControllerStorage` in the production factory list when adding this
  feature; update bootstrap expectations accordingly.
- Return the existing `{ success: true, definitions }` or
  `{ success: true, outlets }` result and existing error result. Do not read
  live value attributes in MAIN or replace the isolated MutationObserver.
  Preserve descriptor ordering, defaults, attribute names, and string outlet
  filtering. No caching of missing applications or controller instances.
- Route `sendValueDefinitionsRequest()` and `sendOutletDefinitionsRequest()`
  through the shared MAIN client with its correlated replies, readiness probe,
  five-second total deadline, and disconnect handling. Do not send requests
  from MAIN to extension APIs or alter background/panel message shapes.
- Add the two success validators alongside `validateStoredController` in the
  existing ContentInspector client, not in a replacement client. The shared
  protocol already passes the original request to result validators on both
  sides and handles bounded failure results centrally. Preserve storage's
  pending-identifier check. Return operation results only; request IDs and
  operation names belong to the outer envelope, not public result objects.
- Validate successful definition responses before they reach value resolution:
  definitions is an array (maximum 1,024 entries) of records with string name,
  type, and attributeName (each maximum 16,384 code units), plus JSON-compatible
  defaultValue. Defaults may be null, booleans, finite numbers, strings, arrays,
  and plain objects; preserve these values rather than forcing string defaults.
  Reject dangerous object keys (`__proto__`, `constructor`, `prototype`) when
  reconstructing nested defaults and limit nesting to 32 levels. Outlet results
  are arrays of at most 1,024 strings, each at most 1,024 code units. Enforce the
  foundation's 1 Mi-code-unit serialized response limit before parsing. Validate
  false/error results with the same bounded-error rule as storage.
- Bound serialization on the MAIN side too. Circular or unsupported defaults,
  excessive payloads, and thrown getters produce a structured error rather than
  an uncaught exception, partial success, or silently truncated default values.
  These bounds are deliberate new error cases; document them and test boundaries.
- After both callers have moved, delete `entrypoints/inspected-page-inject.js`,
  `loadInjectedScript()`, the legacy send helper, injectedScriptPromise,
  injectScript constructor dependency, and obsolete imports/types/constants.
  Audit `requestTimeoutMs` and its default constant too: they currently serve
  the legacy helper, not the MAIN client's independent five-second deadlines.
  Remove its web_accessible_resources entry from WXT configuration. Remove a
  permission only if a repository-wide usage audit proves it has no remaining
  purpose; do not blindly remove scripting or activeTab permissions.
- Keep the shared MAIN entrypoint anonymous and lean. Delete obsolete tests only
  after equivalent feature/client coverage exists. Remove legacy fixtures and
  failure text about injected scripts; use meaningful MAIN service errors.

No controller globals are created by definition queries. The existing deliberate
storage operation remains the sole temp-variable write. The shared DOM bridge
remains page-spoofable; validation is not user-gesture authentication.
Framework lookup and metadata reads can invoke page-owned methods or getters;
request-driven access is not a guarantee of wholly passive execution.

## Red/green sequence

1. Characterize value/outlet output against existing helpers and real Stimulus
   fixtures, including inherited/default definitions, absent metadata, all three
   supported application global names, and unavailable controllers.
2. Write failing MAIN feature tests for both operations, late application
   initialization, thrown getters, serialization failure, bounds, cleanup, and
   no startup work. Implement the feature using the existing helpers.
3. Write failing isolated client tests for exact result validation, JSON-string
   round trips, concurrent/out-of-order replies, wrong operation/ID, malformed
   replies, readiness/timeout/disconnect, and no calls to injection. Route both
   ContentInspector requests through MAIN; keep live observation unchanged.
4. Move regression coverage out of the old injected-entrypoint tests, then remove
   the injection implementation and configuration. Search tracked runtime and
   active docs for injectScript, inspected-page-inject, currentScript, and legacy
   event names. Historical plans can mention them explicitly as history.
   Rewrite the content-script E2E cases that currently expect lazy injection
   before/after storage: all three operations must now leave script count and
   DOM structure unchanged. Preserve `main-world-storage.test.js` regressions,
   including no retry after a successful write whose reply is lost.
5. With a real installed extension, open controller details, read values/outlets,
   mutate a watched attribute, store a controller, refresh, navigate, and restore
   via BFCache. Assert stable UI behavior, one response per request, no lost live
   updates, and no injected script node even after all workflows. Ensure one
   feature's failing request does not disable storage or other services.
   Preserve the Chromium `chrome.devtools.inspectedWindow.eval` assertion that
   the bare stored variable resolves to the exact page controller. Check it in
   the inspected page's Console context before navigation: an ordinary reload
   creates a new document and clears the old temp global. BFCache restoration
   retains the same document and must not restart MAIN or repeat storage.

Extend the existing installed-extension instrumentation rather than bypassing
the production bootstrap. `tests/main-world-gate.config.js` currently matches
the storage-only startup expression; update it when the factory list changes.
Pass every production factory to `startGate(document, Runtime, features)` and
append only the test-only reader. Add definition validators/requests to the gate
client. Keep both startup orders, no script insertion, and the global check that
allows only the explicitly requested temp variable. The Firefox runner
`tests/e2e/run-firefox-main-world-gate.js` currently covers both startup orders
across all three application globals; extend those cases for definitions. This
runner tests the isolated client/MAIN boundary, not the Firefox panel or relay.

## Documentation and completion

Update README's architecture diagram to panel/background, isolated script,
and the single MAIN runtime containing storage and definition features. Remove
claims about lazy Stimulus injection, script-element RPC, or eval being the only
alternative. Update AGENTS.md's important files and messaging explanation, the
MAIN skill, and the short architectural record in ADR 5 where needed. Keep
Decision 2 unchanged; ADR 5 already expands it. Put test evidence and browser
blockers in implementation notes, not low-level details in the ADR. Distinguish
eager listener registration from user-requested framework access and explicit
temp globals.

Run lint, CSS lint, formatting, typecheck, the full unit suite, and coverage via
the existing npm scripts. Require 100% statements/branches/functions/lines for
new and moved `lib/**` code with no new exclusions. Build Chrome MV3, Firefox
MV3, and Safari; inspect clean build outputs to confirm the injected asset and
its manifest resource registration are gone and only one MAIN script remains.
Run `npm run test:e2e` and `npm run test:e2e:firefox`. Firefox's baseline smoke
uses mocks, so also require actual installed-extension verification as established
by plan 1; manual Safari runs must record browser version and steps.

Complete when all three Stimulus operations run through the shared MAIN runtime,
no production injected script or loader remains, and baseline tree, details,
live values, and storage workflows pass. Plan 4 starts from this state.
