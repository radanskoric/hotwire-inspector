# Panel CSS Theme Architecture

The DevTools panel uses vanilla CSS with OKLCH color primitives, semantic custom properties, and panel-local theme state.

## Decision

Panel styling stays in plain CSS without a CSS framework, preprocessor, or utility-first dependency. The panel CSS defines raw OKLCH values as `--lch-*` primitives and exposes semantic `--color-*` tokens for component rules to consume.

Light and dark themes are implemented by changing token values rather than rewriting component styles. System mode is the default and follows `prefers-color-scheme`; manual light and dark overrides set `data-theme` on the panel document root.

## Why

OKLCH makes theme colors easier to tune because lightness, chroma, and hue can be adjusted independently. This keeps light and dark palettes visually related while avoiding scattered hex and rgba values.

Semantic tokens make components easier to extend. A tree node should ask for `--color-surface-elevated` or `--color-border-soft`, not know the raw color value. Shared components such as buttons and selects expose small custom-property APIs through fallback values, so variants can override only the values that differ.

## Scope

The theme switcher affects only the extension panel UI. It does not message the content script and does not modify the inspected page.

The selected mode is stored under `hotwire-inspector.theme` with one of these values:

- `system`
- `light`
- `dark`

`system` removes the root `data-theme` attribute so CSS media queries choose the active palette. `light` and `dark` set explicit `data-theme` values on the panel root.

## Practical Outcome

Future styling changes should prefer updating tokens or component custom properties before adding new one-off declarations. Additive utility classes are acceptable for repeated exceptions, but semantic component classes remain the foundation of the panel UI.
