---
name: GlucoseIQ Documentation
description: A dark product surface for the GlucoseIQ data layer
colors:
  background: "#0A0A0B"
  ink: "#F5F5F7"
  muted: "#A1A1A6"
  line: "rgb(255 255 255 / 11%)"
  accent: "#FF453A"
  range-red-deep: "#B91C1C"
  range-red-low: "#FF6961"
  range-green: "#30D158"
  range-yellow: "#FFD60A"
  range-orange: "#FF9F0A"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, Segoe UI, sans-serif"
    fontSize: "clamp(3.5rem, 7vw, 6rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, Segoe UI, sans-serif"
    fontSize: "clamp(1.0625rem, 1.6vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "SFMono-Regular, SF Mono, Consolas, Liberation Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.7
radius:
  control: "8px"
width:
  outer: "1400px"
  content: "1120px"
motion:
  drop: "700ms fall from above the page with one restrained impact"
  ring: "720ms clockwise reveal, delayed 760ms"
  signalPassage: "Homepage report only; a completed report is available without JavaScript and for reduced motion."
---

# Design System: GlucoseIQ Documentation

## 1. Direction

The homepage uses one black surface from navigation through footer. A compact glucose instrument gives visitors the first concrete proof of package output without pretending to be a finished application. The typed report, ownership boundary, and package index follow in flat sections separated by thin rules.

The design takes its cues from precise software documentation: direct system type, generous spacing, sharp alignment, and controls with a small fixed radius. Glucose range colors appear in the mark and data visual. The rest of the page stays black, white, and muted gray.

Avoid canned landing-page patterns: centered gradient text, card walls, fake terminal controls, decorative status metrics, frosted cards, repeated labels, and broad scroll effects. Blur belongs only to the sticky navigation boundary. The shallow red field below it is atmosphere, not a section background.

## 2. Color

### Brand Surface

- **Background** (`#0A0A0B`): The navigation, homepage, sections, and footer share this surface.
- **Ink** (`#F5F5F7`): Headings, primary copy, code, package names, and primary controls.
- **Muted** (`#A1A1A6`): Supporting copy, captions, secondary links, and code labels.
- **Line** (`rgb(255 255 255 / 11%)`): Section boundaries, column divisions, package rows, and secondary-control borders.
- **Accent** (`#FF453A`): The mark, keyboard focus, the closing-link underline, and precise interaction feedback.

### Glucose Ranges

- **Very low** (`#B91C1C`)
- **Low** (`#FF6961`)
- **In range** (`#30D158`)
- **High** (`#FFD60A`)
- **Very high** (`#FF9F0A`)

Use range colors only when a label, value, or chart position identifies the glucose range. Color supplements the label; it never replaces it.

## 3. Typography

The page uses the system sans stack for labels, body copy, headings, actions, and navigation:

`-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`

Use the system mono stack for package names, commands, code, types, and returned JSON. Glucose readings, units, chart labels, and report values stay in the sans stack.

`"SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace`

### Hierarchy

- **Display:** `clamp(3.5rem, 7vw, 6rem)`, weight `700`, line height `0.98`, letter spacing `-0.035em`.
- **Section heading:** `clamp(2.5rem, 5.2vw, 4.5rem)`, weight `700`, line height `1`.
- **Body:** `clamp(1.0625rem, 1.6vw, 1.25rem)`, line height `1.6`, with a practical reading measure.
- **Mono:** `0.8125rem`, line height `1.7`.

Use sentence case. Uppercase remains limited to established terms such as CGM, AGP, GMI, and API. Headings use balanced wrapping; longer copy uses pretty wrapping where supported.

## 4. Layout

- The outer page width stops at `1400px`.
- Hero copy, sections, captions, and footer stop at `1120px`.
- The hero is centered with generous top spacing. Its mark is `92px`; its display type never exceeds `96px`.
- The glucose instrument stops at the content width. Its top row pairs the latest reading with the observed 24-hour and target ranges. A 24-hour trace spans the row below, followed by one shared caption.
- Content sections use spacing and one-pixel rules instead of separate surfaces.
- Code scrolls inside its own region if a line exceeds the available width.
- At `860px` and below, report columns stack.
- At `760px` and below, ownership statements, package introductions, package rows, captions, and footer content stack.
- At `480px` and below, the hero actions stack to full width.
- The page clips accidental outer overflow. The glucose instrument stacks on narrow screens and does not create horizontal page scrolling.

## 5. Components

### Actions

- Controls use an `8px` radius and a `44px` minimum height.
- The primary action uses Ink on the Background color.
- The secondary action uses a Line outline on the shared page surface.
- Text and border feedback completes within `160ms`.
- Hover feedback runs only when the device reports a fine pointer.
- Keyboard focus uses a `2px` Accent outline with a `3px` offset.

### Glucose Instrument

The docs build runs `latestReading`, `computeGlucoseTrend`, and `analyzeGlucose` against the repeatable 14-day homepage fixture. The settled frame uses one `#0e0e10` plane with a `24px` radius. Its header identifies latest, observed, and target values. A 2.15-pixel monotone trace covers the latest 24 hours. White marks in-range segments, yellow marks high segments, and red marks low segments.

A 5-percent target field spans the report. The chart uses only 70 and 180 mg/dL hairlines for target boundaries. Four support metrics and one caption complete the frame. The report uses no glow, graph-paper grid, five-part legend, or repeated values. Sensor gaps stay open, isolated readings remain visible as points, and the caption states the time span and synthetic-data limitation.

### Code and Output

Code and returned output use transparent backgrounds, no shadows, and no decorative header. A one-pixel vertical rule separates the two columns. On narrow screens the output moves below the code and the dividing rule becomes horizontal.

Both code regions use the mono stack and keep their own horizontal overflow. The source note links the output to `@glucoseiq/core` and `@glucoseiq/testing`; the synthetic-data note stays adjacent.

### Ownership Boundary

Two statements identify the responsibilities of the application and GlucoseIQ. A single vertical rule separates them on wide screens. On narrow screens they stack with one horizontal rule.

### Package Index

The package index uses a full-width list. Every row has a top or bottom hairline, a mono package name, and a plain-language role. Rows have no separate fill, corner treatment, or shadow. On narrow screens, the role moves below the package name.

## 6. Interaction and Accessibility

- Navigation and homepage actions provide targets at least `44px` tall.
- Every link and focusable code region shows a visible focus outline.
- Hover styles do not carry required information and do not run on coarse pointers.
- Text and controls meet WCAG 2.2 AA contrast against the Background color.
- The glucose trace is a titled SVG image with a text description of the time span, target range, latest value, unit, and synthetic-data limitation.
- Glucose states pair color with labels, values, or chart position.
- Content remains visible when animation support is unavailable.
- The mark runs once on page load. Its outline starts `520px` above its resting position, falls beneath the navigation, takes one restrained impact, and settles before the ring begins.
- The mask reveals the finished ring clockwise from 12 o’clock. A raised cap follows the leading edge and disappears when the ring closes. The animation does not loop.
- Reduced motion renders the finished mark immediately and shortens interaction transitions.
- The mobile stack keeps outer page scrolling vertical. Code manages its own overflow.

### Signal Passage

Signal Passage is limited to the homepage report. The complete report remains visible without JavaScript. Reduced motion shows the completed report. Other homepage sections do not gain reveal effects. Native page scrolling is never captured, replaced, snapped, or slowed.

Signal Passage is the only homepage exception to the broad scroll-effects prohibition. The CSS module `glucose-signal.module.css` defines the `--signal-passage` view timeline after a 900-by-720 gate confirms a suitable viewport. An observer fallback runs once and reveals the completed report. Its normal 25-percent gate steps down when the instrument grows beyond twice the viewport height. The smaller value is half the maximum visible ratio, leaving room for browser chrome and rounding at extreme zoom. While armed, it recalculates after viewport changes so a live zoom cannot leave the report hidden. A scroll-end check latches the final frame if a fast jump skips the completion sentinel. Mobile uses normal flow. The report uses no third-party animation library.

## 7. Use and Avoid

Use the GlucoseIQ mark, one dark page, a compact synthetic-data instrument, direct copy, thin rules, fixed control geometry, flat package rows, visible focus, and one purposeful mark entrance.

Avoid card-based section layouts, fake product frames, decorative charts, broad claims, broad scroll effects, or controls that change size during interaction.
