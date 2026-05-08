# No DOM Modifications

**The extension should work hard to avoid modifying the target page DOM structure or attributes.**

This is an explicit design decision because DevTools extensions should minimize the risk of causing side effects in the inspected application. Even small mutations can create confusing behavior, interfere with page logic, affect styling, or produce debugging noise that makes the inspected page behave differently from its normal runtime state.

## Specifics

We do not use DOM-written tracking attributes such as `data-*` markers to identify elements.

Instead, the extension uses an in-memory identity strategy:

- a `WeakMap<Element, string>` to associate a page element with an inspector key. WeakMap is necessary to avoid the extension causing memory leaks.
- a reverse `Map<string, WeakRef<Element>>` to look an inspector key back up during interactions without keeping inspected elements alive
- real element `id` values when they already exist
- generated inspector-only keys in memory when an element does not have an `id`

## Why

This approach lets the panel and content script refer to the same logical element across scan, hover, and inspect flows without mutating the inspected page.

That matters because the extension should avoid:

- changing page structure or attributes
- creating surprising interactions with application code
- interfering with selectors, mutation observers, or DOM-dependent logic
- introducing hard-to-debug behavior while the user is inspecting a live page

## Practical Outcome

With this decision, element identity is treated as extension-internal state, not as part of the target application DOM. That keeps the extension safer and makes it less likely that running the inspector changes the behavior of the page being inspected.

Reverse lookups must dereference weak references and handle stale entries as missing elements. For real DOM ids, the extension may fall back to `document.getElementById()` when a weak reference has been cleared.
