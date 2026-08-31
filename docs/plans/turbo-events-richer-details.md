# Turbo Events — richer `event.detail` capture

High-level plan for widening `lib/turbo-event-watcher.js::turboEventDetailsFor` so each captured Turbo event carries a small, curated bag of useful scalar fields in `push.details`, instead of just `{ url }` for `turbo:load`.

The shape today (`lib/types.js`, `lib/turbo-event-watcher.js:4-8`) is `Record<string, string>` and the panel renders it as a click-to-expand `<dl>` (`lib/panel/controllers/turbo-events-controller.js:184-226`). Everything below stays string-only so the dt/dispatch pipeline does not change.

## Goal

For every entry in `TURBO_EVENT_NAMES`, `details` should answer the obvious "what just happened?" question when the user expands a row in the **Turbo Events** timeline:

- **Where is the browser going?** URL + action.
- **What's the request like?** method + URL.
- **Did it succeed?** success bit, error message, response status.
- **What was rendered / morph strategy?** render method, stream action, attribute mutation.

Constraints (carried over from AGENTS.md and decision 2):

- Strings only on the wire — no live `Element` / `Response` / `FormSubmission` references.
- Read DOM values at capture time on the inspected page (safe) — never serialize refs (not safe).
- Functions (`resume`, `render`, `visit`) are skipped — they have no useful scalar surface.
- Keep the rule set narrow — unknown events still produce `{ name, timestamp, details: {} }` today; keep that fallback.

## Out of scope (explicit)

- Adding or removing event names in `TURBO_EVENT_NAMES` — the array is already comprehensive against the 8.x docs.
- Push-shape changes (`targetId`, `details` field) — those are already wired.
- New panel UI for details — the existing `<details>`/`<dl>` row renderer covers any bag we produce.
- Cross-frame details — the watcher captures everything at `document`; we deliberately do not walk frames for body/HTML.
- Truncation policy for long values (URLs, errors, bodies) — separate follow-up if the timeline becomes noisy.

## Rule set (per event)

Only the events with meaningful scalar `event.detail` surface get rules. Each row is `(field, why)`. Functions, live DOM refs, and `Request` / `Response` / `FormSubmission` bodies are deliberately skipped.

### Document (`<html>` events except where noted)

| Event                 | Rule                                         | Why                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `turbo:click`         | `{ url: detail.url }` (when present)         | Symmetric with `turbo:before-visit` / `turbo:visit` / `turbo:load`. Lets the user see where the click asked to go.                                                                                                             |
| `turbo:before-visit`  | `{ url: detail.url }`                        | The very first hint of intent — pairs with `turbo:click.url` for diffing canceled visits.                                                                                                                                      |
| `turbo:visit`         | `{ url: detail.url, action: detail.action }` | Adds `action` (`"advance" \| "replace" \| "restore"`) — small cardinality, high diagnostic value for back/forward.                                                                                                             |
| `turbo:before-cache`  | skip                                         | Docs say no `event.detail`.                                                                                                                                                                                                    |
| `turbo:before-render` | `{ renderMethod: detail.renderMethod }`      | `"replace" \| "morph"` is the most-asked question in render-path debugging.                                                                                                                                                    |
| `turbo:render`        | `{ renderMethod: detail.renderMethod }`      | Same as above — fires after; lets users compare with `before-render`.                                                                                                                                                          |
| `turbo:load`          | keep existing `{ url: detail.url }`          | Already shipped.                                                                                                                                                                                                               |
| `turbo:reload`        | `{ reason: detail.reason }` (when present)   | Enumerated reasons (`"turbo_disabled"`, `"turbo_visit_control_is_reload"`, `"tracked_element_mismatch"`, `"request_failed"`) pinpoint why a full reload happened — very useful for "why is my SPA Mode app reloading" support. |

### Page Refreshes (morph)

| Event                          | Rule                                                                         | Why                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `turbo:morph`                  | skip                                                                         | Both `currentElement` / `newElement` are live `Element` refs. No low-cost scalar surface.                    |
| `turbo:before-morph-element`   | skip                                                                         | Same.                                                                                                        |
| `turbo:before-morph-attribute` | `{ attributeName: detail.attributeName, mutationType: detail.mutationType }` | Pure scalar pair, fires per attribute per morph — answers "what changed in this morph?" without DOM walking. |
| `turbo:morph-element`          | skip                                                                         | Same — only `newElement` (live ref).                                                                         |

(Follow-up candidate: emit `currentElement.tagName` / `newElement.tagName` at capture time. Adds cardinality but is cheap. Defer.)

### Forms (fires on `<form>`)

| Event                | Rule                                                                                                                                                                           | Why                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turbo:submit-start` | `{ formAction: detail.formSubmission.formElement.getAttribute("action"), formMethod: detail.formSubmission.formElement.getAttribute("method")?.toUpperCase() }` (when present) | `FormSubmission` is a structured object; its `.formElement` is a live `HTMLFormElement` — `action` + `method` are the two attributes the user wants to see on this row. Falls back to empty object when missing. |
| `turbo:submit-end`   | `{ success: String(detail.success ?? ""), error: detail.error ? detail.error.message ?? String(detail.error) : "" }` (omit empty entries)                                      | `success` boolean is the headline question for "did my form submit work?". `error.message` covers network failures without serializing the `Error` ref.                                                          |

Trade-off worth flagging in review: `FormSubmission` also exposes `submitter`, `fetcher`, etc. None look low-cost or low-noise for an event row; skip.

### Frames (fires on `<turbo-frame>`)

| Event                       | Rule                                                                                                              | Why                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `turbo:before-frame-render` | `{ newFrameSrc: detail.newFrame?.getAttribute("src"), newFrameId: detail.newFrame?.id                             |                                                                                                                 | "" }`(when`newFrame` present) | Live `FrameElement` is read at capture time for its `src` attribute and `id`. Helps "which frame is about to render?" debugging. |
| `turbo:frame-render`        | `{ succeeded: String(detail.fetchResponse?.succeeded ?? "") }` (when present, omit empty entries)                 | `FetchResponse` exposes `.succeeded` (boolean scalar) — fold to a string. Skip `.response`/`.body` (live refs). |
| `turbo:frame-load`          | skip                                                                                                              | No `event.detail`.                                                                                              |
| `turbo:frame-missing`       | `{ url: detail.response?.url, status: String(detail.response?.status ?? "") }` (when present, omit empty entries) | `detail.response` is a `Response` — `.url` and `.status` are the two scalars worth reading.                     |

Trade-off: `Response.url` is available immediately; `Response.body` would need `.clone().text()` and is greedy. Skip.

### Streams (fires on `<turbo-stream>`)

| Event                        | Rule                                                                                                                              | Why                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `turbo:before-stream-render` | `{ action: detail.newStream?.action, target: detail.newStream?.target, targets: detail.newStream?.targets }` (omit empty entries) | `StreamElement.action` and `.target` / `.targets` are exactly what a developer wants to see — "what action, on which selector?". |

Trade-off: `newStream` is a live ref to a `<turbo-stream>`; we read attributes at capture time only. `.template` content is too noisy for a one-line row. `turbo:stream-render` is not a real Turbo event — Turbo only dispatches `turbo:before-stream-render`.

Trade-off: `newStream` is a live ref to a `<turbo-stream>`; we read attributes at capture time only. `.template` content is too noisy for a one-line row.

### HTTP Requests

| Event                         | Rule                                                                                                         | Why                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turbo:before-fetch-request`  | `{ url: String(detail.url ?? ""), method: detail.fetchOptions?.method?.toUpperCase() }` (omit empty entries) | `url` is already a `URL` — `.toString()` to flatten. `method` distinguishes link preload `GET` (always `GET`) from real form/visit submits (`POST`/`PUT`/...). |
| `turbo:before-fetch-response` | `{ succeeded: String(detail.fetchResponse?.succeeded ?? "") }` (when present, omit empty entries)            | Same scalar surface as `turbo:frame-render`.                                                                                                                   |
| `turbo:before-prefetch`       | `{ href: event.target?.getAttribute?.("href") }` (only when `event.target` is `HTMLAnchorElement`-ish)       | `event.detail` is null per docs; `event.target` is the `<a>` (read at capture time only).                                                                      |
| `turbo:fetch-request-error`   | `{ error: detail.error ? (detail.error.message ?? String(detail.error)) : "" }` (omit when empty)            | The full reason this event was added — without the message the row is useless to a user triaging a network failure.                                            |

## Technical decisions

- **Stringify strategy for `URL`** — `new URL(...)` produces `String(url) === href`. Use `String(detail.url)` everywhere.
- **Empty-entry omission** — `turboEventDetailsFor` should keep empty values "" to avoid user confusion on whether the value is present or not.
- Do not capture any HTML values yet. Out of scope for this plan.

## Suggested pull-list (high level)

1. Extend `lib/turbo-event-watcher.js::turboEventDetailsFor` with one `case` per row above, using a small per-event helper for any `URL`/`Element` reads that need null-checks.
2. Extend `tests/unit/turbo-event-watcher.test.js` with one assertion per case: given a fake event whose `event.detail` matches the documented shape, `turboEventDetailsFor` returns the documented `details` bag. Omit-empty entries get a separate test.
3. Optional: extend `tests/e2e/content-script.spec.js` with `forwards Turbo events dispatched on the page to the events port` checks that one feature event (e.g. `turbo:submit-end`) lands with the expected `details` on the panel port.
4. No changes to the panel UI — `<dl>` already renders whatever `details` carries. Ship when the rule-table is locked and unit tests are in.

## Files touched (summary)

| File                                               | Change                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `lib/turbo-event-watcher.js`                       | `turboEventDetailsFor` gains a `case` per row in the rule table above (functions/elements skipped). |
| `lib/types.js`                                     | No change — `TurboEventPayload.details` already typed `Record<string, string>`.                     |
| `lib/panel/controllers/turbo-events-controller.js` | No change — `<dl>` renderer is already generic over `details`.                                      |
| `tests/unit/turbo-event-watcher.test.js`           | New fixtures per case; assert `details` shape; assert omit-empty behavior.                          |
| `tests/e2e/content-script.spec.js` (optional)      | One feature event assertion end-to-end through the content port pipeline.                           |

## Verification

- `npm test -- --run` (unit suite — `turbo-event-watcher.test.js` gains cases; coverage stays 100% on `lib/**`).
- `npm run lint`, `npm run lint:css`, `npm run format:check`, `npm run typecheck` stay green.
- Optional `npm run test:e2e` after the E2E extension lands.
