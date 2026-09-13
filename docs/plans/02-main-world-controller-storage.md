# 2. Migrate controller storage to the shared MAIN runtime

## Starting point and outcome

Execute after `01-main-world-foundation.md` on main, not on the discarded spike.
Read AGENTS.md, the `main-world` skill, and the foundation ADR. Require its real
browser registration gate to have passed. The foundation provides exactly one
`entrypoints/main-world.content.js`, feature modules under `lib/main_world/`,
and validated document JSON RPC with readiness/deadline handling in
`lib/main-world-client.js`. The injected Stimulus script still handles storage,
value definitions, and outlet definitions. Turbo still uses its baseline path.

Move only controller storage into MAIN. Clicking the existing storage action
must return the same result and expose the same controller as the first unused
`window.tempN`. No script element should be injected by a storage-only workflow.
Values and outlets must continue working through the legacy injected script.

## Changes and contracts

- Extract `detectApplication()` and `findController()` into
  `lib/main_world/controller-lookup.js`. Keep detection order `window.Stimulus`,
  `window.stimulusApp`, `window.StimulusApp`; require the existing
  `getControllerForElementAndIdentifier` method. Query at request time, with no
  cached application/controller and no startup inspection. Reuse this helper
  from both MAIN storage and the remaining injected operations during transition.
- Add `lib/main_world/controller-storage.js` as a feature registered through
  the existing runtime. Expose exactly the `storeController` operation using
  the existing document RPC server. Do not add a second MAIN entrypoint or an
  independent readiness implementation.
- Preserve successful `{ success: true, name, identifier }` and failure
  `{ success: false, error }` results and the existing isolated/panel API. Return
  the same missing-element/application/controller errors. Invalid CSS selectors
  and page-property failures are contained as error responses.
- Keep the first-unused-name rule based on `name in window`, starting at temp1;
  never overwrite a present or inherited name. Assignment and the existing
  console.info message occur only after a valid storage request. Deliberate
  storage retains the controller through the page global; ordinary lookup must
  not retain it. Do not delete user temp variables on teardown or BFCache restore.
- Change `ContentInspector.sendStoreControllerRequest()` to call the MAIN client
  with selector and identifier. Preserve selector construction and all in-memory
  identity behavior. The client waits for advertised capability and dispatches
  storage once within the existing five-second total deadline, never retries or
  falls back to injection. A timeout is not proof that a write never happened.
- Remove the store request listener, handler, and unused imports from the legacy
  injected entrypoint. Retain its value/outlet listeners and lazy loader. Delete
  store-only legacy constants only after checking tests and other callers.
- Validate storage success as a boolean true plus a temp name matching
  `^temp[1-9][0-9]*$` and an identifier matching the pending request. Validate
  errors as boolean false and a bounded string (maximum 4,096 code units).
  Reconstruct result objects. Neither request IDs nor namespaced events prove
  that a page-visible request came from a user gesture.

Do not change other Stimulus functionality, panel presentation, permissions, or
Turbo ownership. Library code must not rely on `document.currentScript`.

## Red/green sequence

1. Before moving logic, write characterization tests for lookup precedence,
   missing applications/controllers/elements, invalid selectors, temp-name
   collisions including inherited names, and exact controller identity stored.
2. Add failing MAIN feature tests for no startup lookup or global writes,
   request-time lookup after late Stimulus initialization, one response/write,
   failure containment, invalid requests, and exact start/stop cleanup. Implement
   the extracted lookup and storage feature with the existing runtime/server.
3. Add failing ContentInspector integration tests proving storage uses document
   RPC without calling injectScript; values/outlets still inject lazily. Cover
   delayed readiness, concurrent storage calls with different IDs, timeouts,
   mismatched/spoofed shapes, and disconnect. Implement the routing switch.
4. Update legacy injected tests to prove they no longer execute storage requests
   and still answer both remaining operations. Remove obsolete storage fixtures
   only once their behavior is covered in the MAIN feature tests.
5. Add installed-extension tests for storage through the real panel/content
   request path: each supported Stimulus global, occupied temp1, missing
   controller, exact page instance identity, and no injected script element.
   Use a page-side MutationObserver and DOM snapshot to check no tracking/script
   insertion; allow only the requested temp variable and console output. Verify
   storage works before and after value lookup has loaded the legacy script.

No red phase may fail only because a mock constructor is invalid; assert the
missing behavior first, implement it, then rerun the same tests to green.

## Documentation and verification

Update README and AGENTS.md to state that storage is now request-driven through
the eager MAIN service while value/outlet definitions remain lazy injected RPC.
Update the `main-world` skill and ADR with the feature and deliberate temp-global
exception. Avoid the inaccurate claim that controller access is wholly passive:
it calls a page-owned framework method and descriptor access can invoke getters.

Run `npm run lint`, `npm run lint:css`, `npm run format:check`,
`npm run typecheck`, `npm test -- --run`, and `npm run coverage`, preserving 100%
for all new/moved library logic. Ensure new nested modules are actually included
in coverage. Run Chrome, Firefox, and Safari builds using `npm run build`,
`npm run build:firefox`, and `npm run build:safari`, then the existing Chromium
and Firefox E2E commands. Supplement the mocked Firefox smoke with real installed
extension storage verification; record manual Safari results when automation is
unavailable. Do not infer runtime support from a valid manifest.

Complete when storage uses MAIN exclusively, its public behavior is preserved,
values/outlets still work through injection, and no unsolicited page work is
introduced. This result is the required starting point for plan 3.
