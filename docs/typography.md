# Hotwire Inspector Typography

Typography supports scanning a dense DevTools interface. Shared branding comes from restrained color accents and a familiar system-font appearance; it does not require importing Master Hotwire’s editorial type scale.

## Source of truth

The [panel stylesheet](../entrypoints/panel/style.css) defines the font stacks and component-specific sizes, weights, spacing, and alignment. Preserve those metrics when applying branding. Color usage follows [ADR 3](decisions/3%20-%20panel%20css%20theme%20architecture.md) and the [design system](design-system.md).

## UI and data fonts

The panel’s UI stack prefers Inter when available and falls back to system fonts. Retain that stack without adding a font download. Controls inherit the UI font.

Events, timestamps, values, and payloads use the existing monospace styling where appropriate. Preserve tabular timestamp numerals and the wrapping and whitespace rules that make technical data readable.

## Hierarchy

- The toolbar title is compact, left-aligned, and uses the semantic brand-title color.
- Details titles and section summaries retain their current neutral colors, sizes, weights, and alignment.
- Tabs, filters, metadata, and badges retain their compact component-specific typography.
- Primary and muted text distinguish data from supporting information. Keep functional status colors separate from brand colors.

There is no required mathematical type scale. Do not introduce large page headings, centered titles, global paragraph margins, or editorial line heights. Existing font sizes and line heights preserve the amount of useful inspection content visible at once.

## Available space and readability

Adapt to available panel space through the existing wrapping and scrolling behavior, rather than a separate mobile type scale. Preserve whitespace in payloads and allow long technical values to wrap where the component supports it.

Verify readable contrast for small text on its actual background in both themes, including selected and hovered states. Preserve keyboard focus visibility and check text at browser zoom levels. Accessibility is a verification requirement, not an assumed consequence of a font choice or color palette.
