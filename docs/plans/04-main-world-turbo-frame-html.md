# 4. Capture frame HTML through the shared MAIN runtime

This plan records the original omission behavior. Oversized HTML now retains a
Unicode-safe prefix, with retained and original lengths shown after the expanded
payload. The collapsed preview stays unchanged. See the
[capture logic](../../lib/turbo-event-watcher.js),
[bridge validation](../../lib/turbo-event-bridge.js), and
[expanded viewer](../../lib/panel/controllers/large-payload-details-controller.js)
for the current contract.

## Starting point and definition of full HTML

Execute after plans 1, 2, and 3 on main. Read AGENTS.md, the main-world and
turbo-events-capture skills, and the foundation ADR. The single MAIN entrypoint
starts independent MAIN feature modules under `lib/main_world/`; controller storage and
definitions use document RPC and no injected script remains. Turbo capture is
still the baseline isolated watcher. The discarded spike's
`turbo-event-capture.content.js` and bridge helpers are not prerequisites and must
not be recreated as an additional entrypoint.

Plans 2 and 3 are implemented in the preceding work. Confirm those changes are
integrated on main before starting this plan; implementation does not establish
merge status. The production factories are `createControllerStorage` and
`createControllerDefinitions`. All three Stimulus operations use the existing
`ContentInspector.mainWorldClient`, and the injected entrypoint, loader, legacy
events/types, timeout option, and web-accessible resource registration are gone.
Do not reintroduce them for Turbo capture or fallback behavior.

The [plan 3 implementation notes](03-main-world-stimulus-rpc.md#implementation-status-2026-10-23)
record 519 passing unit tests with 100% library coverage, installed Chromium and
Firefox definition/storage checks, real Chromium live-value pushes, reload and
navigation checks, and actual BFCache restoration. These are the regression
baseline, not evidence that the Turbo migration works. Chromium panel tests
still use mocked browser APIs; actual DevTools-panel clicks were not manually
verified. Safari investigation remains paused at the user's request and installed
Safari execution remains unverified. Carry both limitations forward; neither a
successful Safari build nor permission for an earlier migration closes its gate.

Capture the actual `detail.newFrame.outerHTML` from
`turbo:before-frame-render` using a real page-owned Element. Preserve src, ID,
source target identity, epoch timestamp, and exactly one push per source event.
This is the incoming frame's serialized markup at event time, not the full page,
HTTP response text, live DOM after rendering, shadow DOM, or JavaScript state.

Chosen interpretation: full HTML means an untruncated outerHTML string for frames
within a fixed limit of 65,536 UTF-16 code units. Above that limit, omit `html`
and return `htmlError: "HTML omitted: exceeds 65536 code units"` in details.
Never present truncated markup as full HTML. Do not add chunking, disk storage,
deferred re-reading, or unlimited capture. This differs intentionally from the
spike's 8,192-character preview plus ellipsis. If the user chooses preview
semantics before implementation, revise this contract and tests explicitly.

## Ownership and capture

- Add a Turbo capture feature in `lib/main_world/capture-turbo-events.js` and start it
  through the existing runtime. Reuse `TurboEventWatcher` and its canonical
  `turboEventDetailsFor` extractor. Do not copy the frame extractor into MAIN.
  Append its factory without replacing the storage or definition factories.
  As a capture-only feature it has an empty operation map; do not add a Turbo
  RPC operation, readiness handshake, or replacement MAIN client.
- Keep `TURBO_EVENT_NAMES` as the full registry. Export frozen
  `MAIN_WORLD_TURBO_EVENT_NAMES = ["turbo:before-frame-render"]` and derive
  `ISOLATED_WORLD_TURBO_EVENT_NAMES` by exclusion. Allow readonly lists in watcher
  JSDoc. Pass the corresponding list to each watcher. All other event names
  retain their prior owner and behavior.
- Read only curated frame fields: string `newFrameSrc`, `newFrameId`, and `html`.
  Keep absent fields absent and allow empty details. Use real Element reads in
  browser tests. Remove the frame HTML truncation rule and implement the full
  HTML/explicit-omission contract above. Bound src and ID to 8,192 code units each;
  omit an oversized scalar and include a bounded `detailsError` string explaining
  which fields were omitted. Normal short src/ID behavior must stay identical.
- Use `Date.now()` at capture for epoch milliseconds, not event.timeStamp.
  Contain exceptions from curated extraction with a narrow try/catch in
  handleEvent: drop that inspector capture without cancelling the source event
  or disabling subsequent captures. Errors must not be used to activate an
  isolated fallback for a MAIN-owned name.
- Never call preventDefault, stopPropagation, or stopImmediatePropagation on
  the source event; do not monkey-patch dispatchEvent or framework methods. MAIN
  is still synchronous page work: reading outerHTML creates a string before its
  size can be checked. Do not describe that operation as constant-cost or fully
  bounded memory allocation. Retain no source Element/Event after callback return.

## One-way bridge and isolated integration

This feature uses a one-way bridge, separate from Stimulus RPC. Add
`MAIN_WORLD_TURBO_EVENT_NAME = "hotwire-inspector:main-world-turbo-event"` and a
`MainWorldTurboEventDetail` JSDoc type `{ name, timestamp, details }` with string
detail values. Do not change the existing `TurboEventPush` shape.

The MAIN feature dispatches a bubbling CustomEvent containing only JSON.stringify
of that curated record. Dispatch on sourceEvent.target only when it is a connected
Element owned by the inspected document; otherwise dispatch on document. Never
serialize arbitrary event.detail, callbacks, DOM nodes, request bodies, or the
source event. An event with empty details must still emit one bridge event.

Implement a pure parser in `lib/turbo-event-bridge.js`. Treat the bridge as
untrusted, checking these limits before forwarding. Reuse the exported
`isPlainObject` guard in `lib/main_world/protocol.js`, already shared by Stimulus
validators. Keep Turbo's one-way record and limits separate from RPC envelopes
and definition validation; do not route capture through `parseResponse` or add
an operation/result validator to `MainWorldClient`:

- Raw JSON detail must be a string no longer than 524,288 code units. This
  accommodates JSON escaping for the supported HTML/src/ID limits; test heavily
  escaped strings rather than assuming serialized size equals HTML length.
- Parsed value is a plain object with exactly name, timestamp, and details.
  Name is MAIN-owned. Timestamp is finite and within
  1,000,000,000,000 through 9,999,999,999,999 epoch milliseconds.
- Details is a plain object with at most five allowlisted keys: newFrameSrc,
  newFrameId, html, htmlError, detailsError. Values are strings with limits of
  8,192 for src/ID, 65,536 for html, and 256 for error strings. html and htmlError
  are mutually exclusive. Reject unknown/prototype keys, nested values, arrays,
  and invalid types. Reconstruct a fresh extension-owned record.

These checks establish the expected shape and bounds, not authenticity. Page
scripts can forge correctly shaped bridge events. Invalid payloads must be
ignored without forwarding; they must not trigger fallback capture or affect
the independent Stimulus services.

Add an idempotent `ContentInspector.startMainWorldTurboEventListener()` that
retains its exact listener, validates the detail, computes targetId, and posts
`{ type: TURBO_EVENT_PUSH_TYPE, name, timestamp, targetId, details }` through the
existing content port. Extract one private target-resolution helper shared with
the isolated watcher, using the existing getElementKey map. Document, non-Element,
foreign-document, or disconnected targets yield null. Do not create MAIN identity
state or page tracking attributes. Missing ports must not throw.

Register the isolated capture-phase bridge listener synchronously at document
start, alongside the existing synchronous MAIN client setup and before ports
and watchers. Tree observation must still wait for DOM readiness while parsing;
neither bridge may wait for it. Disconnect removes the Turbo listener and clears
its reference while retaining the existing RPC-client teardown. Keep runtime MAIN feature
start/stop symmetric, with no special BFCache restart. There is no Turbo readiness
RPC or replay queue: events before a panel port exists are not retained. Verify
that both world listeners start before ordinary fixture scripts; a bridge that
only works after DOMContentLoaded does not satisfy early-capture requirements.

No background or panel bridge change is needed: they already forward the push.
The existing per-event details renderer displays html or htmlError via textContent.
Never insert captured HTML with innerHTML or load its embedded resources. Preserve
the timeline's existing row cap, clear behavior, one target per row, and autoscroll.
The 65,536-unit limit bounds each retained HTML string; exercise bursts near the
row cap and verify clearing releases rows. Do not add a separate full-HTML cache.

## Red/green implementation sequence

1. Write failing ownership tests: lists are disjoint, their union equals the full
   registry, exactly before-frame-render is MAIN-owned. Write real-Element
   extraction tests for src/ID, exact markup, 65,536 boundary, oversized explicit
   omission, oversized scalars, missing/malformed detail, and throwing getters.
   Implement registry/extraction changes, preserving other event detail tests.
2. Write failing MAIN feature tests: one listener per owned name, JSON only,
   original target dispatch, document fallback, empty details, start/stop
   idempotency, later listeners seeing the same source event, extraction failures
   followed by healthy captures, and independence from Stimulus features.
3. Write failing parser tests for every validation rejection and exact bounds,
   escaping expansion, fresh objects, malformed JSON, and spoofed unknown event
   names. Implement the parser without excluding branches from coverage.
4. Write failing ContentInspector tests for exact push shape, stable generated
   target keys, existing IDs, invalid targets, ignored malformed payloads, missing
   ports, idempotency, teardown, and no pushes after disconnect. Prove the isolated
   watcher never subscribes to the migrated event. Implement listener/startup.
5. Replace any E2E plain-object newFrame workaround with a real detached incoming
   turbo-frame Element. Connect the panel listener first, dispatch on an existing
   frame, and assert exact src/ID/HTML plus timestamp close to Date.now and the
   source frame's targetId. Describe this as a synthetic Turbo-shaped event, not
   a real Turbo integration test. Mutate the incoming frame after dispatch and
   prove the snapshot remains the event-time string.
6. After observing the first push, allow 250 ms for queued messages to settle
   and assert the count for that unique dispatch remains exactly one. Also test
   empty details and oversized HTML produce one push. Representative isolated
   load/click events must still produce one push with their existing details and
   target behavior. A poll that stops at the first push alone does not prove
   duplicate prevention.
7. Test page capture, at-target, and bubble listeners registered after extension
   startup. All must receive the original event and identical live newFrame.
   Check dispatch return/defaultPrevented both without cancellation and when a
   page listener intentionally cancels. Add an early inline-page-script fixture
   whose page-visible bridge observation proves document-start registration.
8. Test panel rendering of full HTML and omission errors as inert text, including
   script/image markup, event bursts, clear, and no unexpected resource requests.
   Re-run controller storage and definitions to prove the shared runtime still
   starts and serves all features. Preserve storage's pending-identifier
   validation, no-retry-on-lost-reply behavior, and the Chromium Console-context
   assertion using `chrome.devtools.inspectedWindow.eval`. A reload clears old
   temp globals; BFCache retains the document without restarting MAIN. Extend
   the existing BFCache gate's post-restore checks for Turbo rather than replacing
   its retained-controller and definition-query assertions. Preserve the
   definition validators' exact bounds, JSON-default reconstruction, error
   containment, and independent request deadlines.

## Browser validation, docs, and acceptance

Run the cross-world tests with actual installed extensions in Chromium and
Firefox, using the browser harness established in plan 1 or documented manual
steps where needed. Firefox's mocked panel smoke cannot validate JSON bridging.
`tests/main-world-gate.config.js` now captures the production factory list and
passes it to `startGate(document, MainWorldRuntime, features)`, which appends the
test-only reader. It skips WXT's metadata-only discovery module and fails if the
runtime startup expression cannot be found. Adding a factory should already
preserve every production feature; adjust the transform only if startup syntax
changes, and verify the instrumented build actually includes the new feature.
Do not replace the list with a storage-only or test-owned list.

The gate client already registers both definition validators, exercises a
throwing metadata getter followed by successful storage, and supports definition
queries after BFCache restoration. The Chromium gate explicitly removes
Playwright's default `--disable-back-forward-cache` argument. The Firefox runner
already covers both startup orders across all three supported Stimulus globals.
Extend the existing Chromium gate and
`tests/e2e/run-firefox-main-world-gate.js` to cover Turbo transport and source
event safety; their Stimulus results alone prove neither. Exercise the production
Turbo feature and isolated receiver rather than a test-only replacement bridge.
Preserve their checks
for no script insertion and no globals beyond explicitly requested temp storage.
The Firefox runner exercises the real isolated/MAIN boundary, not panel APIs.
Use normal document-start registration for the early inline-script fixture:
the gate's intentionally delayed client-first variant cannot prove early capture.

Continue building Safari, but do not resume installed Safari investigation while
the user's pause remains in effect. When the user resumes it, use automated
extension execution or documented manual steps and record browser version,
early capture, and source-event preservation. Until then, record the Safari gate
as outstanding; do not treat successful builds as runtime proof or declare full
browser acceptance. Likewise, distinguish mocked panel-rendering coverage from
actual native DevTools-panel interaction.

Update AGENTS.md and README to show one MAIN runtime with Turbo capture and
Stimulus RPC features, exclusive event ownership, epoch timestamps, the HTML
snapshot/omission behavior, and the unchanged isolated identity/port pipeline.
Preserve README's human-oriented architecture diagram and explanation of each
part's responsibilities. Keep exact protocol names, validation limits and browser
evidence in implementation notes or linked technical documentation rather than
repeating them throughout README. Update the main-world and
turbo-events-capture skills and, where needed, the short architectural record in
ADR 5. Keep Decision 2 unchanged; ADR 5 expands it. Record browser evidence and
blockers in implementation notes rather than technical detail in the ADR.
Remove obsolete advice that event
capture never reads details or target, while preserving the prohibition on
arbitrary payload dumping and source-event modification. The historical spike
plan may remain, clearly superseded by this four-plan sequence.

Run `npm run lint`, `npm run lint:css`, `npm run format:check`,
`npm run typecheck`, `npm test -- --run`, `npm run coverage`,
`npm run build`, `npm run build:firefox`, `npm run build:safari`,
`npm run test:e2e`, and `npm run test:e2e:firefox`. Inspect coverage membership
and retain 100% statements/branches/functions/lines for all application lib code.
Inspect manifests for exactly one MAIN entrypoint and both worlds at document
start. Audit clean production outputs for no legacy injected asset/resource
registration and no test-only reader or gate instrumentation. Complete only with
the full-frame contract, single-push/source safety, all previous migrations, and
actual browser validation passing. If Safari remains paused, report the
implementation and completed checks separately from the outstanding browser gate.

## Implementation status (2026-10-25)

Implemented on `main-world` after the user explicitly overrode the requirement
to merge plans 2 and 3 into main first. Their implementations remain the starting
point; this work does not claim they have merged.

The existing anonymous MAIN bootstrap now starts storage, definitions, and
`captureTurboEvents`. The capture-only feature reuses the canonical watcher and
extractor with frozen exclusive ownership lists. Only `turbo:before-frame-render`
moved to MAIN. Incoming `newFrame.outerHTML` is an event-time snapshot retained
whole through 65,536 UTF-16 code units, otherwise omitted with the exact htmlError
above. Src and ID are independently limited to 8,192 units, with detailsError
naming oversized fields. Extraction errors drop that capture without modifying
the source event or activating fallback capture. Reading markup allocates the
complete string before its size can be checked.

The one-way bridge is `hotwire-inspector:main-world-turbo-event`, separate from
Stimulus RPC. It carries only JSON `{ name, timestamp, details }`, dispatched on
the connected same-document source Element or document. The isolated parser
accepts at most 524,288 raw code units, exactly those three top-level keys,
MAIN-owned names, finite epoch milliseconds from 1,000,000,000,000 through
9,999,999,999,999, and only the five specified detail keys with their prescribed
string limits. HTML and htmlError cannot coexist. Records are reconstructed;
unknown/prototype keys, nested values, invalid types, and malformed JSON are
rejected. Escaped-string and exact-boundary tests cover serialization expansion.
This validates shape and bounds, not authenticity.

The production isolated receiver registers in ContentInspector's constructor,
alongside the existing client and before ports or watchers. Both capture paths
use one private identity helper and the unchanged port push shape. Teardown
removes the exact receiver and retains RPC teardown. No MAIN identity state,
tracking attributes, Turbo readiness operation, replay queue, fallback, additional
entrypoint, or HTML cache was added. The background and panel production code did
not change. README, AGENTS, both relevant skills, and ADR 5 describe the new
ownership; Decision 2 remains unchanged.

Browser evidence on macOS:

- Installed Chromium (Chrome for Testing 151.0.7922.34): both startup orders
  passed the shared-runtime gate. Normal document-start registration captured an
  early inline script's event through MAIN and the production isolated receiver.
  The deliberately delayed client-first variant captured nothing early, as
  expected. BFCache restoration retained the stored controller, did not repeat
  storage, served both definition queries, and captured another frame event.
- Installed Firefox 156.0: all six combinations of startup order and supported
  Stimulus global passed using web-ext and a temporary add-on. The gate exercises
  the production MAIN feature and ContentInspector receiver at its port boundary,
  not mocked panel APIs. It also retains the storage, definitions, throwing-getter
  containment, no-script-insertion, and no-unexpected-global assertions.
- Both installed-browser gates use real page-owned incoming Elements with
  synthetic Turbo-shaped events. They assert exact HTML/src/ID, epoch timestamps,
  empty details, oversized omission, and exactly four captures after a 250 ms
  settling interval. Later page capture, at-target, and bubble listeners see the
  same original event/newFrame; dispatch return and defaultPrevented preserve
  normal behavior and intentional page cancellation. This is synthetic event
  validation, not a real Turbo library integration test.
- The normal Chromium content-script suite additionally verifies exact pushes
  through the production content→background→panel port relay. Mutation after
  dispatch leaves the snapshot unchanged; frame, empty, oversized, isolated load,
  and isolated click dispatches still total exactly five after 250 ms.
- Panel rendering tests use mocked extension APIs. The large-HTML test displays
  script/image markup and omission errors as inert text, checks no embedded DOM
  or resource requests, pushes 502 rows with near-limit HTML, retains the 500-row
  cap, reports two dropped events, and clears all rows/details.

Unit verification: 583 tests pass across 31 files. All 31 runtime application lib
modules are present in the coverage report at 100% statements, branches,
functions, and lines; only the existing JSDoc-only types exclusion remains.
Lint, CSS lint, typecheck, and formatting checks pass. Chrome, Firefox, and Safari
production builds pass. Manifest inspection finds exactly one MAIN script and
both worlds at document_start in all three outputs, with no web-accessible
resources. Production content bundles contain no test-only reader/gate or legacy
injected script. The separate instrumented build retains the production factory
list plus the existing test reader.

Final Chromium E2E run: 68 passed, with the existing native DevTools-panel
experiment skipped. Firefox's mocked-panel smoke passes, as does the added
large-HTML rendering/burst/clear test through its panel adapter. The separate
installed Firefox runner passes all six cases described above. All commands
listed in this plan's verification checklist were run; installed browser tests
needed access outside the filesystem sandbox to start localhost servers and
temporary browser profiles.

Installed Safari investigation remains paused and its runtime gate outstanding.
A Safari build is not runtime evidence. Native DevTools-panel clicks remain
unverified; the direct-panel experiment stays skipped. These limitations prevent
claiming full browser acceptance despite the completed implementation and the
Chromium/Firefox evidence above.
