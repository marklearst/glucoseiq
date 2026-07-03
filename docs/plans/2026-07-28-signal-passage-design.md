# Signal Passage

## Status

Approved homepage redesign: Signal Passage changes the signal figure and
scroll motion. Package APIs, release behavior, and the hero mark stay
unchanged.

## Goal

Use the synthetic 24-hour report to demonstrate GlucoseIQ's analysis in a
scroll-led sequence that meets the iPad performance budget. Render the complete
report by default for JavaScript-disabled and reduced-motion paths.

## Design decisions

- Use one wide signal stage.
- Give the 24-hour trace the most space.
- Let page scroll control a short, sticky sequence on wide and tall screens.
- Use a one-shot timed reveal on small screens and browsers without CSS scroll
  timelines.
- Keep the report and SVG on the server.
- Add one small client controller for capability selection and the fallback
  trigger.
- Use native CSS scroll timelines before adding an animation library.
- Remove repeated values, the five-part range legend, the plot glow, and most
  grid lines.
- Keep the existing glucose calculations and source readings unchanged.

## Scope

The work covers:

- The homepage signal figure.
- The 24-hour SVG trace.
- The signal figure's responsive layout.
- Scroll motion, fallback motion, and reduced motion.
- Signal-specific documentation and contract tests.

The work does not cover:

- The hero mark animation.
- Other homepage sections.
- Docs navigation or article styles.
- Public package code or package exports.
- npm publication and release workflows.
- An interactive chart, tooltip, scrubber, or range selector.

## Settled frame

The complete figure uses a `#0e0e10` plane against the page's `#0a0a0b`
background, a one-pixel `rgb(255 255 255 / 10%)` border, and a 24-pixel corner
radius. It does not use nested cards or hard table divisions.

The header pairs two groups:

- Latest reading, unit, trend, and a thin range-status check on the left.
- Observed 24-hour range and the 70-180 mg/dL target on the right.

The graph runs close to the full content width. It uses:

- A 2 to 2.25 pixel trace based on the current monotone geometry.
- White for in-range segments.
- Yellow and red only where readings cross a labeled threshold.
- A green target field at 4 to 6 percent opacity.
- Hairlines at 70 and 180 mg/dL.
- Time labels at midnight, 6 AM, noon, 6 PM, and Now.
- One endpoint ring tied to the latest reading.

The graph removes:

- The Gaussian glow and broad under-stroke.
- The 250, 125, and 40 mg/dL grid lines.
- The dotted vertical graph-paper grid.
- The detached five-item range legend.
- The duplicate time-in-range result.
- Repeated target-range and latest-value labels.

Time in range, mean, GMI, and CV sit in one support row below the trace. The
reading count and synthetic-data statement share the figure caption.

All chart text uses the homepage sans stack with tabular numerals. Monospace
remains limited to code, commands, and package names.

## Wide-screen scroll chapter

The scroll chapter runs when both conditions hold:

- Viewport width is at least 900 pixels.
- Viewport height is at least 720 pixels.

The native path also requires no reduced-motion preference and support for
named view timelines and animation ranges. CSS media queries and the client
controller use the same width, height, motion-preference, and feature checks.
The 720-pixel height gate includes the graph's maximum height, the 56-pixel
navigation, and vertical breathing room. At that breakpoint, keep the
instrument at or below 616 pixels tall.

The outer chapter uses
`calc(100svh + clamp(360px, 45svh, 620px))`. This guarantees positive scroll
travel even when the viewport is taller than 980 pixels. The instrument sticks
below the 56-pixel docs navigation. `svh` prevents browser chrome changes from
resizing the chapter during an iPad scroll.

Use native page scrolling without wheel or touch interception, velocity
changes, snapping, or parallax. End sticky positioning when the chapter's
allocated space ends.

### Scroll storyboard

The outer chapter declares `view-timeline-name: --signal-passage` and
`view-timeline-axis: block`. Each animated part references
`animation-timeline: --signal-passage` and maps the percentages below to
`contain` ranges. Do not place the timeline on the sticky element.

| Chapter progress | Beat | Motion |
| ---: | --- | --- |
| 0-15% | Stage reaches full scale | `animation-range: contain 0% contain 15%`. Inner plane moves from `scale(0.985)` and `opacity: 0.84` to `scale(1)` and `opacity: 1`. Use `cubic-bezier(0.16, 1, 0.3, 1)`. |
| 10-28% | Reveal target range | `animation-range: contain 10% contain 28%`. The target field moves from `scaleX(0)` and `opacity: 0` to `scaleX(1)` and `opacity: 1`, with its origin on the left. Threshold hairlines and labels move from `opacity: 0` to `opacity: 1`. Use `cubic-bezier(0.16, 1, 0.3, 1)`. |
| 22-68% | Trace reveals | `animation-range: contain 22% contain 68%`. A transform-driven mask travels from left to right across the complete trace group. Use `cubic-bezier(0.65, 0, 0.35, 1)`. |
| 58-76% | Reveal current result | `animation-range: contain 58% contain 76%`. Endpoint group moves from `scale(0.92)` and `opacity: 0` to `scale(1)` and `opacity: 1`. Latest reading, trend, and thin check move from `translateY(6px)` and `opacity: 0` to their final position and `opacity: 1`. Use `cubic-bezier(0.16, 1, 0.3, 1)` without counting, bounce, or overshoot. |
| 70-88% | Reveal metrics | Each metric moves from `translateY(8px)` and `opacity: 0` to its final position and `opacity: 1`. Use `contain` ranges of 70-82%, 72-84%, 74-86%, and 76-88% with `cubic-bezier(0.16, 1, 0.3, 1)`. |
| 88-99% | Reveal caption | `animation-range: contain 88% contain 99%`. Reading count and synthetic-data text move from `opacity: 0.55` to `opacity: 1` before sticky positioning ends. |

Scroll controls the sequence while the stage remains active. Reversing within
the chapter reverses the current progress without restarting any beat. Once
the completion sentinel enters the viewport, the controller latches the final
state for the rest of that page load. A document `scrollend` check compares
the chapter end with the viewport after each completed scroll. It catches a
fast jump that moves the one-pixel sentinel from below to above the viewport
between observer updates.

## Small-screen and fallback reveal

Screens below 900 pixels remain in normal document flow. Browsers without CSS
scroll timelines use the same path.

An `IntersectionObserver` with `rootMargin: "0px"` starts the sequence once.
Its threshold stays at `0.25` while the instrument is no more than twice the
viewport height. For a taller instrument, the threshold becomes half the
viewport divided by the instrument height. That conservative margin keeps the
trigger below the maximum visible ratio, leaving room for browser chrome and
rounding without changing the normal reveal. The observer and callback share
the same value. The controller disconnects after the trigger. While the
fallback remains armed, viewport changes replace the observer with one
measured from the new viewport and instrument heights. Once the reveal starts,
later changes do not restart it.

| Time | Beat |
| ---: | --- |
| 0-180 ms | Target field and threshold guides |
| 100-760 ms | Trace mask |
| 620-900 ms | Endpoint and current result |
| 780-1100 ms | Metrics and caption |

Entrances use `cubic-bezier(0.16, 1, 0.3, 1)`. The trace mask uses
`cubic-bezier(0.65, 0, 0.35, 1)`. The completed figure stays still and does not
replay during the page visit.

## Motion architecture

### Server-rendered parts

`page.tsx` keeps fixture generation and report analysis on the server. It
constructs the boundary as
`<SignalStory><GlucoseSignalFigure /></SignalStory>`. The client wrapper accepts
rendered `children`; it never imports the server figure or receives glucose
data.

`glucose-signal-figure.tsx` renders the figure structure:

- Summary header.
- Trace.
- Report metrics.
- Shared caption.

`glucose-trace.tsx` renders plot markup, labels, endpoint, SVG title, and SVG
description. It receives computed geometry and emits the complete final graph.

`glucose-profile.ts` separates 24-hour trace geometry from unused AGP geometry.
The split does not change any public package API.

### Client controller

`signal-story.tsx` is the only new signal-specific client boundary. It selects
and manages:

- One root reference.
- Motion capability selection.
- Reduced-motion selection.
- The fallback `IntersectionObserver`.
- Completion latching and cleanup.

It does not receive glucose data, recalculate geometry, or update React state
on each frame.

The figure exposes these motion parts:

- `instrument`
- `target-field`
- `thresholds`
- `trace-mask`
- `latest-reading`
- `latest-point`
- `metrics`
- `caption`
- `completion-sentinel`

`glucose-signal.module.css` defines the visual treatment, sticky chapter, scroll
timeline, fallback keyframes, breakpoints, and reduced-motion reset.

### Capability states

1. Server output contains the complete report.
2. Layout and lifecycle use separate attributes:
   `data-motion-layout="scroll|flow"` and
   `data-motion-state="idle|armed|revealing|latched"`.
3. Initial reduced motion selects `flow` and `latched`.
4. The native path selects `scroll` only when the shared width, height,
   preference, and feature predicate passes.
5. Other browsers select `flow` and `armed` only when the figure is entirely
   below the viewport. If any part is visible at hydration, select `latched`.
6. The fallback observer changes `armed` to `revealing`, then `latched`.
7. Scroll mode remains reversible until a second observer sees the bottom
   sentinel enter the viewport. It then selects `latched`.
8. A persisted `pageshow` event, or first hydration while any part of the
   instrument is visible, selects `latched`.
9. Layout mode stays fixed for the page visit. Latching never removes the
   chapter height.
10. A reduced-motion change while the chapter is active selects `latched` but
    preserves layout geometry. Resize or orientation changes that would clip
    the instrument do the same. The new layout mode takes effect on the next
    page load.
11. Cleanup removes both observers and all media-query, `pageshow`, resize,
    orientation, and document `scrollend` listeners on navigation and unmount.

Setup must tolerate React Strict Mode running an effect more than once.

## Progressive enhancement

The base markup and base CSS show the final state. The native initial state is
gated at first style calculation with `@media (scripting: enabled)`,
`@media (prefers-reduced-motion: no-preference)`, the 900-by-720 viewport gate,
and `@supports` checks for named view timelines and animation ranges. This
prevents a complete-to-hidden flash before hydration.

The timed fallback hides motion layers only after the client selects `armed`,
and it never arms when the figure is already visible. JavaScript-disabled
rendering therefore stays in the complete state.

The native path uses CSS `view-timeline` and `animation-range` on Safari 26.4
and newer. Safari 26.4 avoids a 100-percent endpoint range and uses the bottom
sentinel plus `pageshow` handler to cover its endpoint and back-forward-cache
defects. Safari 26.5 remains the primary acceptance baseline. The fallback uses
one trigger observer and time-based CSS keyframes.

Do not add GSAP, Motion, or a custom animation loop in the first pass. Device
testing may justify GSAP ScrollTrigger later only if the primary iPad reference
device misses the frame-rate or long-task limits in the performance section.

The trace uses one left-to-right reveal mask. Its rectangle uses
`transform: scaleX()` with `transform-box: fill-box` and a left-side transform
origin. It does not animate `width` or `x`. Safari Web Inspector must confirm
that the reveal does not introduce a sustained paint loop.

Do not animate each path with `stroke-dashoffset`, since sensor gaps create
separate paths and would produce several simultaneous starting points.

## Accessibility

- An initial `prefers-reduced-motion: reduce` preference removes the sticky
  chapter height and shows the complete figure with no transition.
- JavaScript-disabled rendering shows the complete figure.
- Screen readers receive the complete title, description, values, units, and
  synthetic-data statement before motion begins.
- Motion layers do not remove meaningful content from the accessibility tree.
- Glucose state uses text, position, and color.
- The SVG description names the time span, target range, observed range,
  latest value, and three high excursions in the fixture.
- The visible figure caption describes a synthetic 14-day report with its
  latest 24-hour trace.
- The section introduces no focus targets or pointer-only behavior.
- Text remains legible at 200 percent zoom.

## Performance

Before implementation starts, record the model of Mark's current iPad and its
iPadOS build in the PR verification note. That device on iPadOS 26.5 and Safari
26.5 is the primary reference device.

Run three warm-cache downward and upward passes through the chapter while
recording Safari Web Inspector timelines. The implementation passes when:

- Median frame interval is at most 18.5 milliseconds and the 95th percentile is
  at most 25 milliseconds across the three runs.
- Total Cumulative Layout Shift is at most 0.01, with no layout-shift entry
  attributed to the signal section.
- No main-thread task above 50 milliseconds is attributed to the signal
  controller or its style work.
- No sustained scroll listener or React render loop.
- No animated blur, shadow, layout dimension, or deep CSS variable.

Animate transforms, opacity, and the SVG reveal mask. Keep the sticky ancestor
untransformed. Remove temporary `will-change` hints after the sequence reaches
its final state.

## Responsive behavior

Verify the settled and moving states at:

- 390 pixels.
- 768 pixels.
- 1024 pixels.
- 1440 pixels.

At 1024 pixels, the 720-pixel height predicate decides whether the sticky
chapter runs. Portrait and landscape keep the same content order.

At narrow widths, the order is:

1. Latest reading and status.
2. Observed and target ranges.
3. Trace.
4. Four report metrics.
5. Shared caption.

No viewport may create horizontal page overflow.

## Documentation changes

Update `apps/docs/DESIGN.md` and `apps/docs/PRODUCT.md` to permit Signal Passage
only on the homepage under these safeguards:

- The report remains visible without JavaScript.
- Reduced motion shows the completed report.
- Other homepage sections do not gain reveal effects.
- The docs never capture or replace native page scrolling.

## Test plan

### Contracts and unit tests

- Keep `page.tsx` and `glucose-trace.tsx` as server components.
- Assert that `signal-story.tsx` is the only new signal-specific client
  boundary.
- Require the CSS timeline, fallback trigger, and reduced-motion reset.
- Remove the contract that rejects `animation-timeline`.
- Keep geometry tests for gaps, isolated readings, thresholds, endpoint, time
  labels, and monotone curves.
- Assert that time in range appears once.
- Assert that chart values and units use sans-serif typography.
- Assert that the SVG has one title and one description with unique IDs.

### Browser checks

- The primary iPad reference device on iPadOS 26.5 and Safari 26.5, with its
  model and build recorded in the PR verification note.
- Safari 26.4 on macOS with the endpoint and restoration workarounds.
- Chrome.
- A browser path without CSS scroll timeline support.
- Reduced motion.
- JavaScript disabled.
- Fast scrolling past the chapter.
- Reversing before completion.
- Returning after completion.
- Page restoration through the back-forward cache.
- Orientation changes and viewport resizing.
- Direct reload while the chapter occupies the viewport.
- Keyboard navigation and 200 percent zoom.

### Quality gates

- No console errors or hydration warnings.
- No horizontal overflow at the four required widths.
- No axe violations.
- `pnpm --filter docs test:home`.
- `pnpm --filter docs test:site`.
- `pnpm --filter docs typecheck`.
- `pnpm --filter docs build`.
- `git diff --check`.

Record start, midpoint, and settled screenshots for desktop and iPad. Capture a
short screen recording on iPad Safari before merge.

## Release boundary

Ship this work through a homepage PR before merging the package release PR.
Review the Vercel preview on desktop and iPad. The package candidate remains
unchanged.
