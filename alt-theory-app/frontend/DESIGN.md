---
version: alpha
name: Alt Theory
description: A restrained research-tool visual system for the v0.6.0 frontend rebuild.
colors:
  ink: "#1F1E1A"
  ink-soft: "#2A2823"
  text-secondary: "#595752"
  text-muted: "#8E8B83"
  canvas: "#F8F8F9"
  panel: "#EBEBEC"
  surface: "#FFFFFF"
  card: "#F4F4F5"
  hairline: "#E7E7E9"
  hover: "#EEEDEF"
  selected: "#E8E7E8"
  success: "#3F7D52"
  warning: "#B8862A"
  danger: "#B0463E"
typography:
  brand:
    fontFamily: Iowan Old Style, Source Serif Pro, Georgia, Times New Roman, serif
    fontSize: 1.375rem
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "0"
  page-title:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif
    fontSize: 1.375rem
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0"
  section-title:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif
    fontSize: 0.8125rem
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "0"
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.48
    letterSpacing: "0"
  label:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif
    fontSize: 0.8125rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  hint:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0"
  code:
    fontFamily: SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
  side-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 10px
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 10px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: 10px
---

## Overview

Alt Theory should keep its current restrained research-tool atmosphere while
moving to a modern component system. The UI should feel quiet, precise, and
usable for long research, analysis, writing, and pilot sessions. It should not
be redesigned into a marketing site or a generic SaaS dashboard.

The existing visual identity is worth preserving: warm near-white canvas,
soft gray panels, near-invisible borders, low decoration, and a small editorial
brand note. The v0.6.0 rebuild should make that identity explicit and
consistent instead of leaving it scattered across one-off CSS values.

## Colors

- **Ink (#1F1E1A):** primary text and primary actions.
- **Ink Soft (#2A2823):** primary hover or active emphasis.
- **Canvas (#F8F8F9):** main chat/work surface.
- **Panel (#EBEBEC):** side panels and app chrome.
- **Surface (#FFFFFF):** fields, composer, popovers, and focused editable surfaces.
- **Card (#F4F4F5):** repeated records or grouped controls when a frame is needed.
- **Hairline (#E7E7E9):** subtle separation only; avoid heavy outlines.
- **Muted text (#8E8B83):** placeholders, secondary metadata, and de-emphasized hints.
- **Warning/Danger/Success:** semantic states only, never decorative accents.

## Typography

Use typography to separate brand, product UI, content, and machine values.

- **Brand type** is reserved for the `Alt Theory` wordmark and rare editorial
  identity moments. Do not use it for `Inspector`, `Workspace`, `Records`,
  `Model setup`, form labels, or normal panel headings.
- **UI titles and labels** use the system sans stack. They should be clear and
  compact, not expressive.
- **Body text** uses the system sans stack for controls, hints, status text,
  cards, and navigation.
- **Code and machine values** use the mono stack for paths, ids, model names,
  JSON, token counts, and file names.
- **Assistant/content prose** may use restrained serif styling only when it is
  clearly content, not interface chrome.

Hierarchy rule: label > placeholder and label > hint. Placeholder text must
never look more important than the field label. Hints should be readable but
visibly quieter than user-entered values and primary labels.

## Layout

The default app structure remains a three-zone research workspace:

```text
left session/config panel | central conversation workspace | right inspector/workspace panel
```

Preserve the calm density of the current UI, but enforce component spacing
rather than ad hoc margins. Prefer direct surfaces and panels over nested
cards. Cards are for repeated items, selected records, modal content, or
compact framed groups.

Desktop should support long sessions and dense inspection. Mobile should keep
the core conversation usable and move secondary panels behind explicit controls
without changing terminology.

## Components

- **Inputs:** same height, radius, padding, focus treatment, and label/hint
  order across chat, config, records, workspace, and login.
- **Buttons:** primary actions are ink. Secondary actions are quiet. Icon-only
  controls need accessible labels and should not use color as the only meaning.
- **Panels:** side panels are panel gray; inner editable surfaces are white.
  Runtime and workspace inspection should feel useful, not branded.
- **Tabs:** use compact, low-contrast segmented controls. Active state should
  be obvious but not loud.
- **Status/error:** explain what happened and what to do next. Keep wording
  plain; do not apologize or add mood.
- **Config UI:** API key, provider, model, KB, and advanced fields must share
  one form language. Advanced fields should not visually dominate basic setup.

## Do's and Don'ts

Do:

- Preserve the existing quiet, warm, low-noise research-tool character.
- Make component hierarchy explicit through tokens and reusable primitives.
- Keep participant, researcher, local, and online modes visually coherent.
- Use sentence case for UI labels and actions.
- Keep spacing stable and responsive.

Don't:

- Do not patch the old CSS as the final v0.6.0 solution.
- Do not use the brand serif style for ordinary inspector/config headings.
- Do not make placeholders louder than labels.
- Do not introduce purple gradients, SaaS marketing cards, decorative blobs,
  heavy shadows, or overly rounded default dashboard styling.
- Do not split local and online into separate visual systems.
