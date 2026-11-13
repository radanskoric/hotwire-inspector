---
name: website-screenshots
description: Refresh the marketing website's approved feature screenshots using Playwright and the static ToDo fixture, or propose new showcases.
---

From the repository root, run:

```sh
npm run build
node .agents/skills/website-screenshots/scripts/capture.mjs
```

The helper renders the actual built extension panel with fixture responses using the existing E2E harness. It requires Playwright Chromium (and Xvfb on headless Linux). The static example is [assets/todo.html](assets/todo.html); it models a ToDo page without running Turbo or Stimulus. Controller definitions and event pushes are curated fixtures in the helper, not live capture from this page.

Refresh the existing light/dark assets directly, then visually inspect all eight images for clipped content, empty states, readable framing, and the open filter selector. Adjust the helper's framing if the UI changed. Keep the relevant feature visible with minimal context. Use actual captured pixels and cropping only; do not generate, retouch, or annotate UI.

Leave existing website descriptions unchanged during routine refreshes. Flag inaccurate copy and propose a correction. Suggest useful new showcases, but get the user's approval before adding them. The approved rows live in `website/index.md`; presentation lives in `website/assets/css/site.css`.

Report which captures changed and any failed checks. Do not publish the website as part of a refresh.
