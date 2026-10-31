# Shared MAIN World Foundation

Date: 2026-10-16.

This decision expands [Decision 2: No DOM Modifications](2%20-%20no%20DOM%20modifications.md)
to cover how the inspector accesses objects owned by the inspected application.

Some inspection features need access to live Stimulus controllers and Turbo
objects that are unavailable to the isolated content script. We will provide
that access through one shared, browser-registered script in the page's MAIN
world, with separate feature modules behind it.

Browser registration avoids inserting script elements into the inspected DOM.
Sharing one entrypoint gives page-context features a consistent lifecycle and
communication boundary as the inspector grows. DOM scanning, element identity,
highlighting, and extension APIs remain in the isolated content script.

Stimulus features use validated JSON document RPC on request. Incoming Turbo
frame capture uses a separate one-way JSON bridge from the same runtime and
exclusively owns that event; other events remain isolated. The isolated receiver
validates curated records and resolves identity through the existing map and port
pipeline. Both bridges are compatibility transports, not authentication.

Running in MAIN still shares the application's environment and can affect its
behavior. Framework lookup stays on demand; frame capture reads serialized markup
synchronously without modifying or cancelling the source event. Reading markup
allocates its full string before a retention limit can be applied. Features share
document lifetime and survive BFCache without restarting.
