# Website styling

This folder contains Hotwire Inspector’s single-page marketing website, built with Jekyll and `jekyll-vitepress-theme`. Follow the root agent instructions, with these styling distinctions:

- The [design system](../docs/design-system.md) and [typography guidance](../docs/typography.md) describe the extension’s compact DevTools panel. Share their color scheme brand direction and contrast goals, but do not apply panel density, control dimensions, or typography metrics to this website.
- The website can follow [Master Hotwire’s marketing style](https://raw.githubusercontent.com/radanskoric/masterhotwire/refs/heads/main/doc/design-system.md) more closely: use its original system-font stack, solid blue hero and header titles, indigo interactive accents, and spacious website typography. Preserve existing responsive sizes, weights, spacing, layout, content, and install flows during branding-only changes.
- Put local styling in [assets/css/site.css](assets/css/site.css), using the upstream theme’s custom properties. Keep neutral surfaces and adapt brand colors for readable text and controls in light and dark themes. Avoid editing vendored theme files or adding font downloads.
- Preserve the website’s existing system/light/dark appearance behavior and `.dark` class. [ADR 3](../docs/decisions/3%20-%20panel%20css%20theme%20architecture.md) governs the extension panel; it does not require this website to adopt panel tokens, theme storage, or `data-theme` handling. Do not change ADR 3 for website styling.
- Check narrow and wide layouts, both themes, focus and hover states, and install links. Run the production build documented in [README.md](README.md), plus the repository’s CSS lint and formatting checks. Keep this file excluded from generated output.
