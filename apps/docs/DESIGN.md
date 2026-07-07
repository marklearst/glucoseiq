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
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.025em"
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
  report: "One observer starts one bounded report entrance. The report stays in document flow and never takes over scrolling."
---

# Design System: GlucoseIQ Documentation

## 1. Direction

The homepage uses one black surface from navigation through footer. A four-view glucose report gives visitors concrete proof of package output without pretending to be a finished application. The shared reading set, typed report, ownership boundary, and package index follow in flat sections separated by thin rules.

The design takes its cues from precise software documentation: direct system type, generous spacing, sharp alignment, and controls with a small fixed radius. Glucose range colors appear in the mark and data visual. The rest of the page stays black, white, and muted gray.

Avoid canned landing-page patterns: centered gradient text, card walls, fake terminal controls, decorative status metrics, repeated labels, and broad scroll effects. A restrained material treatment is allowed inside the report. It should read as one instrument, not a stack of glass cards. The shallow red field below the navigation is atmosphere, not a section background.

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

- **Display:** `clamp(3.5rem, 7vw, 6rem)`, weight `600`, line height `0.98`, letter spacing `-0.025em`.
- **Section heading:** `clamp(2.5rem, 5.2vw, 4.5rem)`, weight `600`, line height `1`.
- **Body:** `clamp(1.0625rem, 1.6vw, 1.25rem)`, line height `1.6`, with a practical reading measure.
- **Labels and actions:** weight `500` or `550`.
- **Mono:** `0.8125rem`, line height `1.7`.

Use sentence case. Uppercase remains limited to established terms such as CGM, AGP, GMI, and API. Headings use balanced wrapping; longer copy uses pretty wrapping where supported.

Meaningful report labels do not fall below `13px`. Remove a label before shrinking it into display noise.

## 4. Layout

- The outer page width stops at `1400px`.
- Hero copy, sections, captions, and footer stop at `1120px`.
- The hero is centered with generous top spacing. Its mark is `92px`; its display type never exceeds `96px`.
- The glucose report stops at `1400px`. Its top view pairs the latest reading with the observed 24-hour and target ranges above a full-width trace.
- A joined analytical deck follows in a `3:4:5` grid: GMI scale, five-zone range distribution, and daily percentile profile.
- On tablet, GMI and time in range stay side by side while the daily profile spans the next row. On phones, the views stack in the order trace, GMI, time in range, and daily profile.
- Content sections use spacing and one-pixel rules instead of separate surfaces.
- Code scrolls inside its own region if a line exceeds the available width.
- At `1100px` and below, the daily profile moves below GMI and time in range.
- At `620px` and below, all report views stack.
- At `760px` and below, ownership statements, package introductions, package rows, captions, and footer content stack.
- At `480px` and below, the hero actions stack to full width.
- The page clips accidental outer overflow. The glucose report stacks on narrow screens and does not create horizontal page scrolling.

## 5. Components

### Actions

- Controls use an `8px` radius and a `44px` minimum height.
- The primary action uses Ink on the Background color.
- The secondary action uses a Line outline on the shared page surface.
- Text and border feedback completes within `160ms`.
- Hover feedback runs only when the device reports a fine pointer.
- Keyboard focus uses a `2px` Accent outline with a `3px` offset.

### Glucose Report

The docs build runs `latestReading`, `computeGlucoseTrend`, `analyzeGlucose`, and the AGP metrics against one fixed 14-day homepage fixture. The 24-hour trace reads that fixture directly. The analytical views use its typed report. The first view identifies the latest, observed, and target values. Its trace uses white in range, yellow above range, and red below range.

The second row is one joined deck rather than three detached cards. The GMI view uses a clean 260-degree open scale from 5–10%+, with a quiet track, continuous gradient, and rounded end. It has no bead, pointer, notch, or decorative marker. Mean glucose belongs in this view. The time-in-range view shows the exact five-zone distribution and keeps every percentage readable outside color. The daily profile uses twelve two-hour columns: a thin 5th–95th percentile stem, a 25th–75th percentile capsule, and a median tick. CV belongs in this view.

Target fields stay quiet and use only the 70 and 180 mg/dL boundaries. Sensor gaps remain open, isolated readings remain visible as points, and one caption states the sample size, generated span, time zone, and synthetic-data limitation. A faint report-level light field and a short focus reveal are allowed; each panel does not get its own glow.

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
- The GMI scale has a text alternative that names the estimate, display scale, mean glucose, and generated span. It is not exposed as task progress.
- The range distribution names all five zones, thresholds, and percentages.
- The daily profile has a titled SVG description for its percentile stems, middle-50% capsules, median ticks, target field, CV, span, and time zone.
- Glucose states pair color with labels, values, or chart position.
- Content remains visible when animation support is unavailable.
- The mark runs once on page load. Its outline starts `520px` above its resting position, falls beneath the navigation, takes one restrained impact, and settles before the ring begins.
- The mask reveals the finished ring clockwise from 12 o’clock. A raised cap follows the leading edge and disappears when the ring closes. The animation does not loop.
- Reduced motion renders the finished mark immediately and shortens interaction transitions.
- The mobile stack keeps outer page scrolling vertical. Code manages its own overflow.

### Report Entrance

One observer starts one report sequence when the joined surface enters the viewport. The shell settles from a small rise and scale, the trace draws from left to right, and the analytical views follow with short offsets. The full sequence finishes in 1.5 seconds and never pauses, pins, or changes native scrolling.

At `620px` and below, only the shell and trace animate; the lower views render in their finished state. Every entrance plays once per page load and then stays still. CSS owns the sequence; there is no animation runtime.

Without JavaScript, the server-rendered report is complete. Reduced motion renders each view in its finished state. Native scrolling remains unchanged.

## 7. Use and Avoid

Use the GlucoseIQ mark, one dark page, one four-view synthetic report, direct copy, thin rules, fixed control geometry, flat package rows, visible focus, and short report entrances that suit the current layout.

Avoid uniform card walls, fake product frames, decorative charts, broad claims, scroll-fed animation, or controls that change size during interaction.
