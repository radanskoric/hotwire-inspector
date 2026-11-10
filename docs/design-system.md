# Hotwire Inspector Design System

Hotwire Inspector shares Master Hotwire’s blue and indigo brand direction while retaining the density and behavior of a DevTools interface. Branding should help the projects feel related without taking space or attention away from inspection.

## Authority and implementation

[ADR 3: Panel CSS Theme Architecture](decisions/3%20-%20panel%20css%20theme%20architecture.md) governs styling. Use vanilla CSS, OKLCH primitives, semantic color tokens, and component custom properties as described there. This document complements that decision; it does not replace it.

The [panel stylesheet](../entrypoints/panel/style.css) is the source of truth for exact colors, spacing, dimensions, states, and stacking. See [typography](typography.md) for text guidance.

## Brand and themes

The shared visual cues are an indigo interactive accent, a blue toolbar title, neutral surfaces, and restrained effects. Master Hotwire’s accent (`#667eea`) and primary heading blue (`#1e3a8a`) are reference colors, not fixed foreground values: adapt their lightness for the panel’s small text and each theme’s backgrounds.

- Use semantic accent tokens for interactive controls, focus indicators, and selection treatments. Keep hover colors appropriate to the active theme.
- Reserve the semantic title color for the toolbar title. Details headings and body text retain the existing neutral hierarchy.
- Preserve positive and warning colors as functional signals, independent of branding.
- Support light, dark, and system modes through token overrides. Theme state remains local to the panel, as specified by ADR 3.

## Layout and density

Use the available DevTools viewport. Preserve the toolbar, tabs, scrolling tree and event views, and slide-over details panel. Panel width varies with docking and window size; evaluate narrow and wide panels rather than applying a website’s mobile/desktop grid.

Keep existing compact spacing, control dimensions, wrapping, and scrolling behavior. Do not impose centered reading widths, oversized headings, or generous marketing-page padding. Spacing smaller than half a rem is intentional for dense controls and data rows.

## Components and interaction

Keep existing semantic component styles and their custom-property overrides. Preserve button sizes, badge shapes, borders, radii, and the layering of dropdowns, details, and notices.

Branding changes colors without changing interaction: retain hover feedback, keyboard focus geometry, selection cues, and existing transitions. Do not add hover movement or blanket animations. Content inspection, filtering, navigation, and live updates retain their current behavior.

## Verification

Check changed foreground/background combinations in both themes, including hover, selection, and focus. Target at least 4.5:1 contrast for normal text and 3:1 for relevant non-text indicators against adjacent colors. Adjust the brand color when necessary; resemblance does not depend on exact hex matching.

Review both tabs and details content at narrow and wide panel widths, and verify system-theme switching. These are verification requirements, not a claim that the entire interface has passed an accessibility audit.
