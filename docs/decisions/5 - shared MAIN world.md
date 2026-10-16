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

Running in MAIN still shares the application's environment and can affect its
behavior. But, the plan is to keep page access narrow and on demand. In summary, we are inserting code into the page in order to enable features that require it but will again adhere to the principle of doing whatever work is needed to minimise any possible impact on the page.
