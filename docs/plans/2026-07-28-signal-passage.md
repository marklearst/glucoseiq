# Signal Passage Implementation Plan

> Execute this plan task by task and review each test-backed commit before continuing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current homepage glucose dashboard with the approved Signal Passage: one restrained, server-rendered glucose instrument with a native scroll-led reveal on capable wide screens and a one-shot fallback everywhere else.

**Architecture:** Keep fixture generation and package analysis in the homepage Server Component. Move the final figure into a second Server Component, pass precomputed 24-hour geometry to a server-rendered SVG, and wrap the rendered result in one small client controller that owns capability selection and lifecycle attributes only. Base CSS always renders the complete result; native CSS view timelines and an `IntersectionObserver` fallback progressively add motion without taking over page scroll.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript 5.8, CSS Modules, SVG, CSS view timelines, `IntersectionObserver`, Node 24+, pnpm 11.17.0, Node's built-in test runner.

## Global Constraints

- Preserve the fixed 14-day synthetic fixture and every package calculation in `page.tsx`.
- Keep `page.tsx`, `glucose-signal-figure.tsx`, and `glucose-trace.tsx` as Server Components.
- `signal-story.tsx` is the only new signal-specific client boundary. It accepts rendered `children` only and never receives glucose data.
- Do not add GSAP, Motion, a chart library, a custom animation frame loop, or any runtime dependency.
- Do not change the hero mark, other homepage sections, documentation navigation, article styling, public package code, package exports, Changesets, or release workflows.
- Do not touch or stage the three pre-existing untracked files under `docs/plans/`.
- Keep the package release candidate unchanged until this homepage PR is reviewed and merged.
- Use native page scrolling only. Do not listen for or cancel `scroll`, `wheel`, `touchstart`, or `touchmove`.
- Animate only transforms, opacity, and the SVG mask rectangle. Do not animate layout dimensions, blur, shadow, filters, deep CSS variables, SVG `width`, SVG `x`, or `stroke-dashoffset`.
- Do not use `transition: all`. Name every transitioned or animated property.
- Base markup and base CSS must show the complete report with JavaScript disabled.
- `prefers-reduced-motion: reduce` must show the complete report in normal document flow with no transition.
- Preserve the full accessible title, description, values, units, trend/status text, and synthetic-data disclosure throughout motion.
- Use the system sans stack and tabular numerals for every reading, unit, chart label, and metric. Reserve monospace for code, commands, types, JSON, and package names.
- Keep the instrument at or below 616 pixels at the 900-by-720 native-motion threshold.

## Execution Prerequisites

- [ ] Work from the GlucoseIQ checkout on `feat/signal-passage`.
- [ ] Confirm the approved specification precedes this implementation plan in branch history:

  ```bash
  git log --reverse --oneline main..HEAD -- \
    docs/plans/2026-07-28-signal-passage-design.md \
    docs/plans/2026-07-28-signal-passage.md
  ```

  Expected: `docs: define Signal Passage motion` appears immediately before `docs: plan Signal Passage implementation`.

- [ ] Confirm only the three known planning drafts are untracked:

  ```bash
  git status --short --branch
  ```

  Expected:

  ```text
  ## feat/signal-passage
  ?? docs/plans/2026-07-27-homepage-motion-and-signal-redesign.md
  ?? docs/plans/2026-07-27-homepage-precision-proof-design.md
  ?? docs/plans/2026-07-27-homepage-precision-proof-implementation.md
  ```

- [ ] Run the implementation under Node 24 and pnpm 11.17.0:

  ```bash
  node --version
  pnpm --version
  ```

  Expected: Node reports `v24.x.x`; pnpm reports `11.17.0`.

- [ ] Before editing application code, record the exact iPad model, iPadOS 26.5 build, and Safari 26.5 version in the draft PR verification notes. If those values are unavailable, implementation may proceed locally, but the PR must remain a draft and must not claim primary-device acceptance.

---

## Task 1: Isolate the 24-hour trace geometry

**Files:**

- Modify: `apps/docs/scripts/glucose-profile.test.mjs`
- Modify: `apps/docs/lib/glucose-profile.ts`
- Modify: `apps/docs/app/(home)/glucose-trace.tsx`
- Modify: `apps/docs/app/(home)/page.tsx`

### 1.1 Write the failing geometry contract

- [ ] In `apps/docs/scripts/glucose-profile.test.mjs`, replace the import with:

  ```js
  import { createGlucoseTraceGeometry } from '../lib/glucose-profile.ts'
  ```

- [ ] Rename every test from “profile geometry” to “trace geometry.”
- [ ] Remove `completePercentiles`, the AGP bins from each fixture, and the assertions for `outerBandPaths`, `innerBandPaths`, and `medianPaths`.
- [ ] Replace every call with this input shape:

  ```js
  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })
  ```

- [ ] Add this assertion to the first test:

  ```js
  assert.deepEqual(Object.keys(geometry).sort(), [
    'height',
    'isolatedTracePoints',
    'latest',
    'observedRange',
    'target',
    'timeLabels',
    'tracePaths',
    'width',
  ])
  ```

- [ ] Preserve the existing cases for observed range, trailing 24-hour endpoint, duplicate timestamps, sensor gaps, isolated points, midnight ordering, monotone cubic controls, flat runs, unequal sample spacing, numeric extremes, the 15-minute gap boundary, invalid readings, endpoint zones, and invalid chart bounds.
- [ ] Add a display-label case whose latest reading ends at `23:55` UTC. Assert that the four quarter-position labels round to the nearest whole hour without changing any reading or path geometry:

  ```js
  assert.deepEqual(
    geometry.timeLabels.map((tick) => tick.label),
    ['12 AM', '6 AM', '12 PM', '6 PM', 'Now'],
  )
  ```

- [ ] Repeat the display-label test with `timeZone: 'Asia/Kathmandu'`. Assert the labels round the local wall clock, including its 45-minute UTC offset, rather than rounding the UTC timestamp first.
- [ ] Import `generateCGMSeries` from `@glucoseiq/testing`, recreate the homepage's exact 14-day options, inspect its trailing 24 hours, and assert that the fixed fixture contains exactly three contiguous excursions above 180 mg/dL. This locks the SVG description to the data it describes.

### 1.2 Run the focused test and confirm it fails

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/glucose-profile.test.mjs
  ```

  Expected failure: `glucose-profile.ts` does not export `createGlucoseTraceGeometry`.

### 1.3 Implement the trace-only geometry interface

- [ ] In `apps/docs/lib/glucose-profile.ts`, remove the `AGPProfileBin` and `AGPProfileResult` imports, `splitProfileRuns`, percentile path helpers, and every returned AGP band.
- [ ] Export these exact types:

  ```ts
  interface GlucoseTraceGeometryOptions {
    readonly readings: readonly GlucoseReading[]
    readonly timeZone: string
    readonly width: number
    readonly height: number
    readonly yMin: number
    readonly yMax: number
  }

  interface Point {
    readonly x: number
    readonly y: number
  }

  export type GlucoseTraceZone = 'low' | 'in-range' | 'high'

  export interface GlucoseTraceGeometry {
    readonly width: number
    readonly height: number
    readonly tracePaths: readonly string[]
    readonly isolatedTracePoints: readonly Point[]
    readonly latest: Point & {
      readonly value: number
      readonly zone: GlucoseTraceZone
    }
    readonly observedRange: {
      readonly min: number
      readonly max: number
    }
    readonly target: {
      readonly lowY: number
      readonly highY: number
    }
    readonly timeLabels: readonly {
      readonly label: string
      readonly minor: boolean
    }[]
  }
  ```

- [ ] Rename the exported function and input destructuring:

  ```ts
  export function createGlucoseTraceGeometry({
    readings,
    timeZone,
    width,
    height,
    yMin,
    yMax,
  }: GlucoseTraceGeometryOptions): GlucoseTraceGeometry
  ```

- [ ] Return the validated input `width` and `height` in the geometry object so the SVG view box, mask, and geometry share one source of truth.
- [ ] Keep the current validation, unit conversion, duplicate-timestamp behavior, 24-hour window, gap splitting, monotone path generation, observed range, endpoint zone, target coordinates, and five tick positions unchanged.
- [ ] Round only the local wall-clock value used for each of the first four display labels. Do not round the UTC timestamp and do not move a reading, path point, or tick position:

  ```ts
  function roundedHourLabel(
    milliseconds: number,
    timeZone: string,
  ): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
      numberingSystem: 'latn',
      timeZone,
    }).formatToParts(new Date(milliseconds))
    const hour = Number(
      parts.find(({ type }) => type === 'hour')?.value,
    )
    const minute = Number(
      parts.find(({ type }) => type === 'minute')?.value,
    )

    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      throw new TypeError('Unable to format glucose trace time label')
    }

    const roundedHour = (hour + (minute >= 30 ? 1 : 0)) % 24
    const displayHour = roundedHour % 12 || 12
    const period = roundedHour < 12 ? 'AM' : 'PM'
    return `${displayHour} ${period}`
  }
  ```

  Keep the final label as `Now`. The fixed homepage fixture must therefore render midnight, 6 AM, noon, 6 PM, and Now rather than 11 PM, 5 AM, 11 AM, 5 PM, and Now.
- [ ] Remove the now-unused `hourFormatter()` helper and call `roundedHourLabel(timestamp, timeZone)` for the first four labels.
- [ ] Update both error messages from “Glucose profile geometry” to “Glucose trace geometry.”

### 1.4 Update the server trace input

- [ ] In `apps/docs/app/(home)/glucose-trace.tsx`, remove the AGP profile import and keep the glucose reading import for this compile-safe intermediate step.
- [ ] Replace the geometry import:

  ```ts
  import { createGlucoseTraceGeometry } from '@/lib/glucose-profile'
  ```

- [ ] Change the component contract to:

  ```ts
  interface GlucoseTraceProps {
    readonly readings: readonly GlucoseReading[]
    readonly timeZone: string
  }

  export function GlucoseTrace({
    readings,
    timeZone,
  }: GlucoseTraceProps): JSX.Element
  ```

- [ ] Replace the old AGP-aware geometry call with:

  ```ts
  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone,
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
    yMin: Y_MIN,
    yMax: Y_MAX,
  })
  ```

- [ ] In `page.tsx`, make the matching compile-safe call-site change:

  ```tsx
  <GlucoseTrace
    readings={readings}
    timeZone={completeProfile.timeZone}
  />
  ```

- [ ] Temporarily leave the current SVG markup and plot constants intact. Task 2 moves geometry ownership into the new server figure and removes those duplicates from the trace.

### 1.5 Verify the refactor

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/glucose-profile.test.mjs
  pnpm --filter docs typecheck
  ```

  Expected: all retained geometry tests pass and TypeScript reports no errors.

- [ ] Confirm no production or test source still references the removed API:

  ```bash
  rg -n "createGlucoseProfileGeometry|outerBandPaths|innerBandPaths|medianPaths" apps/docs
  ```

  Expected: no matches.

### 1.6 Commit the trace geometry refactor

- [ ] Stage only the four Task 1 files and commit:

  ```bash
  git add apps/docs/lib/glucose-profile.ts apps/docs/scripts/glucose-profile.test.mjs 'apps/docs/app/(home)/glucose-trace.tsx' 'apps/docs/app/(home)/page.tsx'
  git commit -m "refactor(docs): isolate glucose trace geometry"
  ```

---

## Task 2: Build the final server-rendered instrument

**Files:**

- Create: `apps/docs/app/(home)/glucose-signal-figure.tsx`
- Create: `apps/docs/app/(home)/glucose-signal.module.css`
- Modify: `apps/docs/app/(home)/glucose-trace.tsx`
- Modify: `apps/docs/app/(home)/page.tsx`
- Modify: `apps/docs/app/(home)/home.module.css`
- Modify: `apps/docs/scripts/homepage-contracts.test.mjs`

### 2.1 Replace the old homepage contract with the approved settled-frame contract

- [ ] Add source readers for `glucose-signal-figure.tsx` and `glucose-signal.module.css` to `homepage-contracts.test.mjs`.
- [ ] Replace `homepage keeps the distribution proof when it adds a glucose trace` with `homepage renders one server-owned Signal Passage instrument`.
- [ ] Require all of the following:

  ```js
  assert.doesNotMatch(page, /^\s*['"]use client['"];?/mu)
  assert.doesNotMatch(signalFigure, /^\s*['"]use client['"];?/mu)
  assert.doesNotMatch(glucoseTrace, /^\s*['"]use client['"];?/mu)
  assert.match(page, /<GlucoseSignalFigure/u)
  assert.match(signalFigure, /<GlucoseTrace geometry=\{geometry\} \/>/u)
  assert.match(signalFigure, /<dt>Time in range<\/dt>/u)
  assert.match(signalFigure, /<dt>Mean<\/dt>/u)
  assert.match(signalFigure, /<dt>GMI<\/dt>/u)
  assert.match(signalFigure, /<dt>CV<\/dt>/u)
  assert.equal(
    (signalFigure.match(/Time in range/gu) ?? []).length,
    1,
  )
  ```

- [ ] Add negative assertions for the removed dashboard treatments:

  ```js
  for (const removed of [
    'RANGE_SEGMENTS',
    'rangeRail',
    'rangeLegend',
    'X_GRID_TICKS',
    'traceGlow',
    'feGaussianBlur',
    'traceLatestLabel',
  ]) {
    assert.equal(
      `${page}\n${signalFigure}\n${glucoseTrace}\n${signalStyles}`.includes(removed),
      false,
      `remove ${removed}`,
    )
  }
  ```

- [ ] Require exactly two threshold definitions, one SVG `<title>`, one SVG `<desc>`, unique `useId()`-derived IDs in `aria-labelledby`, one transform-driven mask rectangle, one endpoint group, and no `stroke-dashoffset`.
- [ ] Require `instrument`, `target-field`, `thresholds`, `trace-mask`, `latest-reading`, `latest-point`, `metrics`, and `caption` exactly once across the server figure and trace.
- [ ] Require the resting target field to encode 5-percent green in `fill` alpha and the hairlines to encode no more than 24-percent green in `stroke` alpha. Reject a base `opacity: 0.05` treatment that the reveal animation could overwrite.
- [ ] Require the description to name the 24-hour span, observed range, 70–180 mg/dL target, latest value and unit, three high excursions, and the synthetic limitation.
- [ ] Require the caption to include the reading count, “Synthetic 14-day report with its latest 24-hour trace,” and “Synthetic data. Not clinically representative.”
- [ ] Update the semantic-figure test near the end of the file so it reads figure and caption markup from `glucose-signal-figure.tsx`, not `page.tsx`.

### 2.2 Run the homepage contract and confirm it fails

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/homepage-contracts.test.mjs
  ```

  Expected failure: `glucose-signal-figure.tsx` and `glucose-signal.module.css` do not exist, and the old dashboard markup is still present.

### 2.3 Create the server figure contract

- [ ] Create `apps/docs/app/(home)/glucose-signal-figure.tsx` without a client directive.
- [ ] Use this exact public-to-the-app component contract:

  ```ts
  import {
    getGlucoseLabel,
    type GlucoseReading,
    type GlucoseTrendResult,
  } from '@glucoseiq/core'
  import { createGlucoseTraceGeometry } from '@/lib/glucose-profile'
  import { GlucoseTrace } from './glucose-trace'
  import styles from './glucose-signal.module.css'
  import type { JSX } from 'react'

  interface GlucoseSignalFigureProps {
    readonly readings: readonly GlucoseReading[]
    readonly timeZone: string
    readonly currentReading: GlucoseReading
    readonly currentTrend: Exclude<
      GlucoseTrendResult['trend'],
      'unknown'
    >
    readonly timeInRange: number
    readonly meanGlucose: number
    readonly gmi: number
    readonly cv: number
    readonly totalReadings: number
  }
  ```

- [ ] Keep these constants in the server figure:

  ```ts
  const PLOT_WIDTH = 1120
  const PLOT_HEIGHT = 224
  const Y_MIN = 40
  const Y_MAX = 250
  ```

- [ ] Compute geometry exactly once:

  ```ts
  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone,
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
    yMin: Y_MIN,
    yMax: Y_MAX,
  })
  ```

- [ ] Move the existing trend arrow, trend label, and zone label maps into this file without renaming runtime values.
- [ ] Render this content order:

  1. `<section aria-label="Example report">`
  2. One `<figure data-motion-part="instrument">`
  3. Header with latest reading/status on the left, wrapped in `data-motion-part="latest-reading"`
  4. Observed 24-hour range and target range on the right
  5. `<GlucoseTrace geometry={geometry} />`
  6. `<dl data-motion-part="metrics">` with Time in range, Mean, GMI, and CV
  7. One `<figcaption data-motion-part="caption">`

- [ ] Keep the existing 1.5-pixel thin check and pair it with the zone label. Do not replace it with a dot.
- [ ] Use these visible metric forms:

  ```tsx
  <dt>Time in range</dt>
  <dd>{timeInRange}%</dd>

  <dt>Mean</dt>
  <dd>{meanGlucose} mg/dL</dd>

  <dt>GMI</dt>
  <dd>{gmi}%</dd>

  <dt>CV</dt>
  <dd>{cv}%</dd>
  ```

- [ ] Use this caption structure:

  ```tsx
  <figcaption
    className={styles.signalCaption}
    data-motion-part="caption"
  >
    <span>
      {totalReadings.toLocaleString('en-US')} readings. Synthetic
      14-day report with its latest 24-hour trace.
    </span>
    <span>Synthetic data. Not clinically representative.</span>
  </figcaption>
  ```

### 2.4 Simplify the homepage Server Component

- [ ] In `page.tsx`, remove `getGlucoseLabel`, `GlucoseTrace`, `RANGE_SEGMENTS`, `rangeSummaryLabel`, the trend/zone maps, `currentZone`, and all inline signal markup.
- [ ] Import the new figure:

  ```ts
  import { GlucoseSignalFigure } from './glucose-signal-figure'
  ```

- [ ] Keep fixture generation, analysis, the validity guard, report output JSON, and code sample unchanged.
- [ ] Replace the old signal section with:

  ```tsx
  <GlucoseSignalFigure
    currentReading={displayedReading}
    currentTrend={currentTrend.trend}
    cv={report.cv}
    gmi={report.gmi}
    meanGlucose={report.meanGlucose}
    readings={readings}
    timeInRange={timeInRange}
    timeZone={completeProfile.timeZone}
    totalReadings={report.dataSufficiency.totalReadings}
  />
  ```

### 2.5 Redesign the server-rendered SVG

- [ ] Replace the compile-safe Task 1 trace input with the final geometry-only contract:

  ```ts
  import type { GlucoseTraceGeometry } from '@/lib/glucose-profile'

  interface GlucoseTraceProps {
    readonly geometry: GlucoseTraceGeometry
  }

  export function GlucoseTrace({
    geometry,
  }: GlucoseTraceProps): JSX.Element
  ```

- [ ] Remove the glucose reading import, geometry helper import, duplicate plot width, plot height, y-minimum, and y-maximum constants, and internal geometry calculation. The trace reads dimensions from the validated geometry object.
- [ ] In `glucose-trace.tsx`, keep `useId`, `role="img"`, `focusable="false"`, the unique title/description IDs, and server rendering.
- [ ] Bind the SVG `width`, `height`, and `viewBox` to `geometry.width` and `geometry.height`; do not repeat plot dimensions in this component.
- [ ] Remove the component header, observed-range repetition, target-range repetition, right-side y-axis, latest-value label, Gaussian filter, glow paths, dotted vertical grid, and 250/125/40 lines.
- [ ] Define only these threshold values:

  ```ts
  const THRESHOLDS = [180, 70] as const
  ```

- [ ] Keep the five time labels returned by geometry.
- [ ] Define a sharp vertical trace gradient: white in the 70–180 region, yellow above 180, and red below 70. Use stops separated by no more than two SVG units at each threshold so color marks the excursion without creating a broad rainbow.
- [ ] Add one mask:

  ```tsx
  <mask
    height={geometry.height}
    id={traceMaskId}
    maskUnits="userSpaceOnUse"
    width={geometry.width}
    x="0"
    y="0"
  >
    <rect
      className={styles.traceMask}
      data-motion-part="trace-mask"
      fill="white"
      height={geometry.height}
      width={geometry.width}
      x="0"
      y="0"
    />
  </mask>
  ```

- [ ] Put every connected path and isolated point in one group using `mask={`url(#${traceMaskId})`}`. Do not animate individual paths.
- [ ] Render the target field as one green rectangle with `data-motion-part="target-field"`.
- [ ] Render only the 70 and 180 hairlines. Put both lines and their plain sans labels in one group with `data-motion-part="thresholds"`.
- [ ] Render the endpoint inside SVG with a translated outer group and a nested motion group so CSS scaling does not override endpoint translation:

  ```tsx
  <g transform={`translate(${geometry.latest.x} ${geometry.latest.y})`}>
    <g
      className={styles.traceLatestPoint}
      data-motion-part="latest-point"
      data-zone={geometry.latest.zone}
    >
      <circle className={styles.traceLatestRing} r="5" />
      <circle className={styles.traceLatestCore} r="1.75" />
    </g>
  </g>
  ```

- [ ] Use this description content, with interpolated values:

  ```tsx
  <desc id={descriptionId}>
    Latest 24 hours from a synthetic 14-day glucose report. The
    observed range is {geometry.observedRange.min} to{' '}
    {geometry.observedRange.max} milligrams per deciliter. The target
    range is 70 to 180 milligrams per deciliter. Three high excursions
    rise above the target range. The latest reading is{' '}
    {geometry.latest.value} milligrams per deciliter. Synthetic data;
    not clinically representative.
  </desc>
  ```

### 2.6 Create the component-local settled-frame CSS

- [ ] Create `glucose-signal.module.css` with base styles that show the completed figure. Do not put initial hidden motion states in the base rules.
- [ ] Use these exact outer values:

  ```css
  .signalSection {
    width: 100%;
  }

  .signalInstrument {
    width: calc(100% - var(--home-gutter) - var(--home-gutter));
    max-width: var(--home-content-width);
    margin: 0 auto;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: 24px;
    background: #0e0e10;
    color: var(--home-ink);
    font-variant-numeric: tabular-nums;
  }
  ```

- [ ] Use one header row with generous negative space, one trace region, one four-column metric row, and one caption. Do not create nested cards or hard table cells.
- [ ] Set the graph to `224px` high on desktop, `196px` at 768 pixels and below, and `184px` at 480 pixels and below.
- [ ] Set the trace to `2.15px`, round caps/joins, no filter, no shadow, and no under-stroke.
- [ ] Encode the target field's resting intensity in its fill alpha, not element opacity, so motion can animate element opacity to one without making the field opaque:

  ```css
  .traceTarget {
    fill: rgb(48 209 88 / 5%);
  }

  .traceThreshold {
    stroke: rgb(48 209 88 / 24%);
  }
  ```

  Keep the threshold labels visually subordinate. Their final element opacity may be one, but their color must use a muted alpha.
- [ ] Use the existing system sans variables and `font-variant-numeric: tabular-nums`. Do not declare the mono stack anywhere in this module.
- [ ] At widths below 900 pixels, stack content in this order: latest/status, observed and target ranges, trace, metrics, caption.
- [ ] At 480 pixels and below, hide the two minor 6-hour labels only if all five labels collide; preserve midnight, noon, and Now.
- [ ] Remove every signal/range/trace/metric/caption rule from `home.module.css`. Leave root tokens, hero motion, report, package, boundary, navigation, and footer rules unchanged.

### 2.7 Verify the settled frame

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/homepage-contracts.test.mjs
  pnpm --filter docs exec node --test scripts/glucose-profile.test.mjs
  pnpm --filter docs typecheck
  pnpm --filter docs build
  ```

  Expected: all commands pass; the build remains server-rendered with no hydration warnings.

- [ ] Run:

  ```bash
  rg -n "RANGE_SEGMENTS|rangeRail|rangeLegend|X_GRID_TICKS|traceGlow|feGaussianBlur|traceLatestLabel|font-family.*mono" 'apps/docs/app/(home)'
  ```

  Expected: no matches in signal files.

### 2.8 Commit the settled instrument

- [ ] Stage only Task 2 files and commit:

  ```bash
  git add 'apps/docs/app/(home)/glucose-signal-figure.tsx' 'apps/docs/app/(home)/glucose-signal.module.css' 'apps/docs/app/(home)/glucose-trace.tsx' 'apps/docs/app/(home)/page.tsx' 'apps/docs/app/(home)/home.module.css' apps/docs/scripts/homepage-contracts.test.mjs
  git commit -m "feat(docs): redesign the glucose signal"
  ```

---

## Task 3: Add the lifecycle controller without per-frame JavaScript

**Files:**

- Create: `apps/docs/app/(home)/signal-motion.ts`
- Create: `apps/docs/app/(home)/signal-story.tsx`
- Create: `apps/docs/scripts/signal-motion.test.mjs`
- Create: `apps/docs/scripts/signal-passage-contracts.test.mjs`
- Modify: `apps/docs/app/(home)/page.tsx`
- Modify: `apps/docs/package.json`

### 3.1 Write the failing motion-selection tests

- [ ] Create `signal-motion.test.mjs` with Node's built-in test runner and import the public values from `signal-motion.ts`.
- [ ] Test this complete decision matrix:

  | Reduced motion | Viewport eligible | Both CSS features | Position | Expected |
  | --- | --- | --- | --- | --- |
  | yes | any | any | any | `flow` + `latched` |
  | no | yes | yes | below | `scroll` + `revealing` |
  | no | yes | yes | visible | `scroll` + `latched` |
  | no | yes | yes | above | `scroll` + `latched` |
  | no | no | any | below | `flow` + `armed` |
  | no | yes | no | below | `flow` + `armed` |
  | no | no | any | visible or above | `flow` + `latched` |
  | no | yes | no | visible or above | `flow` + `latched` |

- [ ] Test the two CSS feature flags independently so native motion cannot be selected when only one is available.
- [ ] Treat initial `viewportEligible` as the 900-by-720 media query plus an instrument height at or below 616 pixels. Test that a taller initial instrument selects `flow`, not a latched `scroll` chapter.
- [ ] Test `classifySignalPosition()` at the exact boundaries:

  - `rect.top >= viewportHeight` is `below`.
  - `rect.bottom <= 0` is `above`.
  - every overlap between those boundaries is `visible`.

- [ ] Test that an already selected `scroll` layout requests latching, rather than a layout switch, when the viewport drops below the gate or the instrument exceeds 616 pixels.
- [ ] Assert the exported query, threshold, root margin, duration, and height limit constants exactly match the approved specification.

### 3.2 Write the failing controller contracts

- [ ] Create `signal-passage-contracts.test.mjs` using `node:test`, `node:assert/strict`, `readFileSync`, `existsSync`, and the existing `docsRoot` path pattern.
- [ ] Require:

  - `signal-motion.ts` contains no React import and no client directive.
  - `signal-story.tsx` exists and begins with `'use client'`.
  - `SignalStoryProps` contains only `children: ReactNode`.
  - The client imports lifecycle decisions and constants from `signal-motion.ts`.
  - Neither file imports from `@glucoseiq/*`, `glucose-signal-figure`, `glucose-trace`, or `glucose-profile`.
  - The root emits `data-motion-layout`, `data-motion-state`, and `data-motion-sticky`.
  - The only layout values are `scroll` and `flow`.
  - The only lifecycle values are `idle`, `armed`, `revealing`, and `latched`.
  - The only sticky values are `enabled` and `disabled`.
  - Capability selection checks the 900-by-720 query, reduced motion, `view-timeline-name`, and `animation-range`.
  - The fallback observer uses `rootMargin: '0px'`. Its threshold is `0.25` while the instrument is no more than twice the viewport height. For a taller instrument, use half the viewport divided by the instrument height so the trigger stays below the maximum visible ratio.
  - A second observer targets `completion-sentinel`.
  - `pageshow` checks `event.persisted`.
  - Reduced-motion, viewport, resize, and orientation listeners are removed during cleanup.
  - Both observers disconnect and the fallback timer clears.
  - The source does not contain `requestAnimationFrame`, `addEventListener('scroll'`, `wheel`, `touchstart`, or `touchmove`.

- [ ] Append both new test files to `test:home`:

  ```json
  "test:home": "node --test scripts/homepage-contracts.test.mjs scripts/glucose-profile.test.mjs scripts/signal-motion.test.mjs scripts/signal-passage-contracts.test.mjs"
  ```

### 3.3 Run the focused contracts and confirm they fail

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/signal-motion.test.mjs
  pnpm --filter docs exec node --test scripts/signal-passage-contracts.test.mjs
  ```

  Expected failures: `signal-motion.ts` and `signal-story.tsx` do not exist.

### 3.4 Implement the pure motion selector

- [ ] Create `signal-motion.ts` with no React or DOM side effects:

  ```ts
  export const SCROLL_MEDIA_QUERY =
    '(min-width: 900px) and (min-height: 720px) and ' +
    '(prefers-reduced-motion: no-preference)'
  export const REDUCED_MOTION_QUERY =
    '(prefers-reduced-motion: reduce)'
  export const FALLBACK_THRESHOLD = 0.25
  export const FALLBACK_ROOT_MARGIN = '0px'
  export const FALLBACK_DURATION_MS = 1100
  export const MAX_NATIVE_INSTRUMENT_HEIGHT = 616

  export type SignalMotionLayout = 'scroll' | 'flow'
  export type SignalMotionState =
    | 'idle'
    | 'armed'
    | 'revealing'
    | 'latched'
  export type SignalPosition = 'below' | 'visible' | 'above'

  export interface SignalMotionEnvironment {
    readonly reducedMotion: boolean
    readonly viewportEligible: boolean
    readonly supportsViewTimeline: boolean
    readonly supportsAnimationRange: boolean
    readonly position: SignalPosition
  }

  export interface SignalMotionSelection {
    readonly layout: SignalMotionLayout
    readonly state: SignalMotionState
  }
  ```

- [ ] Implement this state selection exactly:

  ```ts
  export function selectSignalMotion(
    environment: SignalMotionEnvironment,
  ): SignalMotionSelection {
    if (environment.reducedMotion) {
      return { layout: 'flow', state: 'latched' }
    }

    const native =
      environment.viewportEligible &&
      environment.supportsViewTimeline &&
      environment.supportsAnimationRange

    if (environment.position !== 'below') {
      return {
        layout: native ? 'scroll' : 'flow',
        state: 'latched',
      }
    }

    return native
      ? { layout: 'scroll', state: 'revealing' }
      : { layout: 'flow', state: 'armed' }
  }
  ```

- [ ] Add pure `classifySignalPosition(rect, viewportHeight)`, `getSignalFallbackThreshold(instrumentHeight, viewportHeight)`, and `shouldLatchScrollLayout({ layout, viewportEligible, instrumentHeight })` helpers. The fallback threshold returns `0.25` while the instrument is no more than twice the viewport height. For a taller instrument, it returns half the viewport divided by the instrument height. The latch helper returns `true` only when the stored layout is `scroll` and the viewport gate fails or the instrument is taller than `MAX_NATIVE_INSTRUMENT_HEIGHT`.

### 3.5 Implement the client lifecycle controller

- [ ] Create `signal-story.tsx` with this boundary:

  ```ts
  'use client'

  import {
    useEffect,
    useRef,
    type JSX,
    type ReactNode,
  } from 'react'
  import {
    classifySignalPosition,
    FALLBACK_DURATION_MS,
    FALLBACK_ROOT_MARGIN,
    FALLBACK_THRESHOLD,
    MAX_NATIVE_INSTRUMENT_HEIGHT,
    REDUCED_MOTION_QUERY,
    SCROLL_MEDIA_QUERY,
    selectSignalMotion,
    shouldLatchScrollLayout,
    type SignalMotionLayout,
    type SignalMotionState,
  } from './signal-motion'
  import styles from './glucose-signal.module.css'

  interface SignalStoryProps {
    readonly children: ReactNode
  }
  ```

- [ ] Render complete server output by default:

  ```tsx
  return (
    <div
      className={styles.signalStory}
      data-motion-layout="flow"
      data-motion-state="idle"
      data-motion-sticky="enabled"
      ref={rootRef}
    >
      {children}
      <span
        aria-hidden="true"
        className={styles.completionSentinel}
        data-motion-part="completion-sentinel"
      />
    </div>
  )
  ```

- [ ] In one `useEffect`, query:

  ```ts
  const scrollQuery = window.matchMedia(SCROLL_MEDIA_QUERY)
  const reducedMotionQuery = window.matchMedia(
    REDUCED_MOTION_QUERY,
  )
  const supportsViewTimeline = CSS.supports(
    'view-timeline-name: --signal-passage',
  )
  const supportsAnimationRange = CSS.supports(
    'animation-range: contain 0% contain 15%',
  )
  ```

- [ ] Find the instrument with `[data-motion-part="instrument"]`, classify its initial rectangle, and call `selectSignalMotion()`. For this first selection, pass `viewportEligible: scrollQuery.matches && instrument.offsetHeight <= MAX_NATIVE_INSTRUMENT_HEIGHT`. Use `offsetHeight`, not the transformed client rectangle height, so the prepaint scale cannot under-report the settled figure. Write the chosen layout once and never change it during that page visit.
- [ ] Set `data-motion-sticky="enabled"` only for a selected `scroll` layout that fits. Set it to `disabled` for every selected `flow` layout. This post-hydration attribute releases the prepaint sticky gate when measured fit rejects native motion.
- [ ] Native selection starts as `revealing` so the named timeline is active and reversible. Reduced motion or a figure already partly visible/above the viewport starts as `latched`. Never arm content the user can already see.
- [ ] For `flow`, set `armed` only when the instrument is entirely below the viewport. Compute `fallbackThreshold` once from `instrument.offsetHeight` and `window.innerHeight`. Observe the instrument with:

  ```ts
  {
    threshold: fallbackThreshold,
    rootMargin: FALLBACK_ROOT_MARGIN,
  }
  ```

- [ ] On the first fallback entry whose `isIntersecting` value is `true` and whose `intersectionRatio` is at least `fallbackThreshold`:

  1. Set `revealing`.
  2. Disconnect the trigger observer.
  3. Start one 1100-millisecond timer.
  4. Set `latched` and clear the timer reference when it finishes.

- [ ] For `scroll`, observe `[data-motion-part="completion-sentinel"]`. Latch when it intersects. Also listen for `document` `scrollend`; after a completed scroll, latch when the outer chapter's bottom edge has reached or passed `window.innerHeight`. This closes the fast-jump path without deriving scroll progress continuously in JavaScript.
- [ ] On a persisted `pageshow`, latch unconditionally. On a non-persisted `pageshow`, latch when any part of the instrument is already visible.
- [ ] On a reduced-motion media-query change to `reduce`, latch and set `data-motion-sticky="disabled"` without changing the stored layout.
- [ ] On resize, orientation change, or scroll-query change while an untouched `flow` fallback remains `armed`, disconnect and recreate its observer with the current instrument and viewport heights, then return. For `scroll`, call `shouldLatchScrollLayout()` with `instrument.offsetHeight`. When it returns `true`, latch and set `data-motion-sticky="disabled"`. Do not switch the visit to `flow`, and do not restart a reveal already in progress.
- [ ] Make `latch()` idempotent and guard all writes after cleanup so React Strict Mode can set up, clean up, and set up again safely.
- [ ] Cleanup must disconnect both observers, clear the timer, remove both media-query listeners, and remove `pageshow`, `resize`, `orientationchange`, and `scrollend` listeners. Latching removes the `scrollend` listener immediately.

### 3.6 Wrap the server figure

- [ ] In `page.tsx`, import `SignalStory` and wrap the existing server figure:

  ```tsx
  <SignalStory>
    <GlucoseSignalFigure
      currentReading={displayedReading}
      currentTrend={currentTrend.trend}
      cv={report.cv}
      gmi={report.gmi}
      meanGlucose={report.meanGlucose}
      readings={readings}
      timeInRange={timeInRange}
      timeZone={completeProfile.timeZone}
      totalReadings={report.dataSufficiency.totalReadings}
    />
  </SignalStory>
  ```

- [ ] Add homepage assertions that `page.tsx` constructs this composition and that `signal-story.tsx` receives no glucose props.

### 3.7 Verify the controller

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/signal-motion.test.mjs
  pnpm --filter docs exec node --test scripts/signal-passage-contracts.test.mjs
  pnpm --filter docs test:home
  pnpm --filter docs typecheck
  ```

  Expected: all contracts pass and TypeScript reports no client/server boundary errors.

### 3.8 Commit the controller

- [ ] Stage only Task 3 files and commit:

  ```bash
  git add 'apps/docs/app/(home)/signal-motion.ts' 'apps/docs/app/(home)/signal-story.tsx' 'apps/docs/app/(home)/page.tsx' apps/docs/scripts/signal-motion.test.mjs apps/docs/scripts/signal-passage-contracts.test.mjs apps/docs/package.json
  git commit -m "feat(docs): add Signal Passage lifecycle"
  ```

---

## Task 4: Add native scroll-linked choreography

**Files:**

- Modify: `apps/docs/app/(home)/glucose-signal.module.css`
- Modify: `apps/docs/scripts/signal-passage-contracts.test.mjs`

### 4.1 Add the failing native-motion contracts

- [ ] Require all of these source contracts:

  - `view-timeline-name: --signal-passage`
  - `view-timeline-axis: block`
  - `calc(100svh + clamp(360px, 45svh, 620px))`
  - a sticky section at `top: 56px`
  - `@media (scripting: enabled)`
  - `prefers-reduced-motion: no-preference`
  - `min-width: 900px`
  - `min-height: 720px`
  - `@supports` checks for both named view timelines and animation ranges
  - the timeline on the outer story and never on the sticky section
  - `contain 0% contain 15%`
  - `contain 10% contain 28%`
  - `contain 22% contain 68%`
  - `contain 58% contain 76%`
  - metric ranges `70–82`, `72–84`, `74–86`, and `76–88`
  - `contain 88% contain 99%`
  - `cubic-bezier(0.16, 1, 0.3, 1)`
  - `cubic-bezier(0.65, 0, 0.35, 1)`

- [ ] Reject `position: fixed`, `scroll-snap`, `dvh`, `stroke-dashoffset`, `transition: all`, `will-change`, and animated filter/shadow declarations.
- [ ] Require each native rule to declare its animation longhands before `animation-timeline` and `animation-range`; reject a later `animation` shorthand that would reset the timeline.
- [ ] Require the target and mask to use left-side SVG transform origins, and the nested endpoint motion group to use `transform-box: fill-box` with a centered origin.

### 4.2 Run the contract and confirm it fails

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/signal-passage-contracts.test.mjs
  ```

  Expected failure: the component CSS does not yet define a named view timeline or contain ranges.

### 4.3 Add prepaint-safe native layout

- [ ] Keep `.signalStory` `position: relative` in base CSS.
- [ ] Add persistent scroll-layout rules keyed by the client attribute:

  ```css
  .signalStory[data-motion-layout='scroll'] {
    min-height:
      calc(100svh + clamp(360px, 45svh, 620px));
    view-timeline-name: --signal-passage;
    view-timeline-axis: block;
  }

  .signalStory[data-motion-layout='scroll'][data-motion-sticky='enabled']
    .signalSection {
    position: sticky;
    top: 56px;
    display: grid;
    min-height: calc(100svh - 56px);
    place-items: center;
  }
  ```

- [ ] Duplicate only those layout declarations inside the prepaint gate so capable browsers establish chapter height and sticky geometry before hydration:

  ```css
  @media (scripting: enabled)
    and (prefers-reduced-motion: no-preference)
    and (min-width: 900px)
    and (min-height: 720px) {
    @supports
      (view-timeline-name: --signal-passage)
      and (animation-range: contain 0% contain 15%) {
      .signalStory {
        min-height:
          calc(100svh + clamp(360px, 45svh, 620px));
        view-timeline-name: --signal-passage;
        view-timeline-axis: block;
      }

      .signalSection {
        position: sticky;
        top: 56px;
        display: grid;
        min-height: calc(100svh - 56px);
        place-items: center;
      }
    }
  }
  ```

- [ ] Keep the sticky section and outer chapter untransformed. Only the inner figure may scale.

### 4.4 Add the named timeline beats

- [ ] Define explicit keyframes with final states at 100 percent:

  ```css
  @keyframes signalStageIn {
    from {
      opacity: 0.84;
      transform: scale(0.985);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes signalScaleXIn {
    from {
      opacity: 0;
      transform: scaleX(0);
    }
    to {
      opacity: 1;
      transform: scaleX(1);
    }
  }

  @keyframes signalFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes signalCurrentIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes signalPointIn {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes signalMetricIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes signalCaptionIn {
    from { opacity: 0.55; }
    to { opacity: 1; }
  }
  ```

- [ ] Give both the target field and trace mask an explicit left-side SVG transform origin:

  ```css
  .traceTarget,
  .traceMask {
    transform-box: fill-box;
    transform-origin: left center;
  }

  .traceLatestPoint {
    transform-box: fill-box;
    transform-origin: center;
  }
  ```

- [ ] Inside the same prepaint media/support gate, apply scroll animations only while `data-motion-sticky='enabled'` and the state is not `latched`. The server's initial `enabled` value activates the prepaint path; the controller can disable it after measured fit without changing layout mode.
- [ ] For every native rule, declare `animation-name`, `animation-duration`, `animation-fill-mode`, and `animation-timing-function` before `animation-timeline` and `animation-range`. Do not use an `animation` shorthand later in that rule because it resets the named timeline.
- [ ] Use `animation-duration: 1ms`, `animation-fill-mode: both`, the named timeline, and these exact ranges:

  | Target | Keyframes | Range | Easing |
  | --- | --- | --- | --- |
  | Figure instrument | `signalStageIn` | `contain 0% contain 15%` | `cubic-bezier(0.16, 1, 0.3, 1)` |
  | Target field | `signalScaleXIn` | `contain 10% contain 28%` | `cubic-bezier(0.16, 1, 0.3, 1)` |
  | Threshold lines and labels | `signalFadeIn` | `contain 10% contain 28%` | `cubic-bezier(0.16, 1, 0.3, 1)` |
  | Trace mask | `signalScaleXIn` | `contain 22% contain 68%` | `cubic-bezier(0.65, 0, 0.35, 1)` |
  | Endpoint | `signalPointIn` | `contain 58% contain 76%` | `cubic-bezier(0.16, 1, 0.3, 1)` |
  | Latest reading/status | `signalCurrentIn` | `contain 58% contain 76%` | `cubic-bezier(0.16, 1, 0.3, 1)` |
  | Metric 1 | `signalMetricIn` | `contain 70% contain 82%` | `cubic-bezier(0.16, 1, 0.3, 1)` |
  | Metric 2 | `signalMetricIn` | `contain 72% contain 84%` | `cubic-bezier(0.16, 1, 0.3, 1)` |
  | Metric 3 | `signalMetricIn` | `contain 74% contain 86%` | `cubic-bezier(0.16, 1, 0.3, 1)` |
  | Metric 4 | `signalMetricIn` | `contain 76% contain 88%` | `cubic-bezier(0.16, 1, 0.3, 1)` |
  | Caption | `signalCaptionIn` | `contain 88% contain 99%` | `cubic-bezier(0.16, 1, 0.3, 1)` |

- [ ] Add a final-state override for `data-motion-state='latched'` that removes animation and sets opacity and transforms to their completed values. Do not remove the chapter height or change `data-motion-layout`.
- [ ] Position `.completionSentinel` as an inert one-pixel element at the bottom of the outer chapter.

### 4.5 Verify native motion source and build

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/signal-passage-contracts.test.mjs
  pnpm --filter docs test:home
  pnpm --filter docs typecheck
  pnpm --filter docs build
  ```

  Expected: all commands pass.

### 4.6 Commit native motion

- [ ] Stage only Task 4 files and commit:

  ```bash
  git add 'apps/docs/app/(home)/glucose-signal.module.css' apps/docs/scripts/signal-passage-contracts.test.mjs
  git commit -m "feat(docs): add Signal Passage scroll motion"
  ```

---

## Task 5: Finish fallback, reduced-motion, and dynamic safety paths

**Files:**

- Modify: `apps/docs/app/(home)/glucose-signal.module.css`
- Modify: `apps/docs/scripts/signal-passage-contracts.test.mjs`

### 5.1 Add the failing fallback contracts

- [ ] Require fallback declarations for these exact windows:

  - Target field and thresholds: 0–180 milliseconds
  - Trace mask: 100–760 milliseconds
  - Endpoint and current result: 620–900 milliseconds
  - Metrics and caption: 780–1100 milliseconds

- [ ] Require `[data-motion-layout='flow'][data-motion-state='armed']` initial states and `[data-motion-state='revealing']` keyframes.
- [ ] Require `@media (prefers-reduced-motion: reduce)` to:

  - keep an initially selected `flow` visit at ordinary document height
  - remove sticky positioning
  - set every motion part to final opacity and transform
  - set `animation: none`
  - show the trace mask at `scaleX(1)`

- [ ] Require `data-motion-sticky='disabled'` to release sticky positioning regardless of why safety latching occurred.
- [ ] Require post-hydration `flow` states to cancel the unqualified prepaint chapter height and named timeline, while resized or reduced-motion visits that already selected `scroll` preserve outer chapter height and show a settled, non-clipped figure.

### 5.2 Run the contract and confirm it fails

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/signal-passage-contracts.test.mjs
  ```

  Expected failure: fallback timing and reduced-motion reset are not complete.

### 5.3 Add fallback initial and revealing states

- [ ] Hide or offset layers only when the client has explicitly selected `flow` plus `armed`. Never hide them for `idle` or base server output.
- [ ] Use these exact armed states:

  ```css
  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='target-field'],
  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='thresholds'] {
    opacity: 0;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='target-field'],
  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='trace-mask'] {
    transform: scaleX(0);
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='trace-mask'],
  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='latest-reading'],
  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='latest-point'],
  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='metrics'] > div {
    opacity: 0;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='latest-reading'] {
    transform: translateY(6px);
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='latest-point'] {
    transform: scale(0.92);
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='metrics'] > div {
    transform: translateY(8px);
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='armed']
    [data-motion-part='caption'] {
    opacity: 0.55;
  }
  ```

- [ ] Use these exact timed animations:

  ```css
  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='target-field'] {
    animation:
      signalScaleXIn 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='trace-mask'] {
    animation:
      signalScaleXIn 660ms cubic-bezier(0.65, 0, 0.35, 1)
      100ms both;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='latest-reading'] {
    animation:
      signalCurrentIn 280ms cubic-bezier(0.16, 1, 0.3, 1)
      620ms both;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='latest-point'] {
    animation:
      signalPointIn 280ms cubic-bezier(0.16, 1, 0.3, 1)
      620ms both;
  }
  ```

- [ ] Add the remaining fallback timing exactly:

  ```css
  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='thresholds'] {
    animation:
      signalFadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='metrics'] > div:nth-child(1) {
    animation:
      signalMetricIn 260ms cubic-bezier(0.16, 1, 0.3, 1)
      780ms both;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='metrics'] > div:nth-child(2) {
    animation:
      signalMetricIn 260ms cubic-bezier(0.16, 1, 0.3, 1)
      800ms both;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='metrics'] > div:nth-child(3) {
    animation:
      signalMetricIn 260ms cubic-bezier(0.16, 1, 0.3, 1)
      820ms both;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='metrics'] > div:nth-child(4) {
    animation:
      signalMetricIn 260ms cubic-bezier(0.16, 1, 0.3, 1)
      840ms both;
  }

  .signalStory[data-motion-layout='flow'][data-motion-state='revealing']
    [data-motion-part='caption'] {
    animation:
      signalCaptionIn 320ms cubic-bezier(0.16, 1, 0.3, 1)
      780ms both;
  }
  ```

- [ ] Use the point-specific `signalPointIn` keyframes for `latest-point`; do not bounce or overshoot.

### 5.4 Add reduced-motion and resize safety

- [ ] For an initial reduced-motion preference, keep the story in normal flow with no excess chapter height and all final values visible.
- [ ] If a visit already selected `scroll`, keep its outer min-height for the remainder of that page visit. When a later viewport or motion preference no longer meets the gate, disable sticky positioning and render the final frame without collapsing the reserved chapter.
- [ ] Add these post-hydration safety overrides after the prepaint and persistent scroll rules:

  ```css
  .signalStory[data-motion-layout='flow']:not(
      [data-motion-state='idle']
    ) {
    min-height: auto;
    view-timeline-name: none;
  }

  .signalStory[data-motion-sticky='disabled'] .signalSection {
    position: relative;
    top: auto;
    min-height: auto;
  }
  ```

  Do not override the outer `min-height` for a stored `scroll` layout. This same path handles a measured figure above 616 pixels even when the media query itself still matches.
- [ ] Make every latched path final:

  ```css
  .signalStory[data-motion-state='latched']
    [data-motion-part] {
    animation: none;
    opacity: 1;
  }

  .signalStory[data-motion-state='latched']
    [data-motion-part='instrument'],
  .signalStory[data-motion-state='latched']
    [data-motion-part='target-field'],
  .signalStory[data-motion-state='latched']
    [data-motion-part='trace-mask'],
  .signalStory[data-motion-state='latched']
    [data-motion-part='latest-reading'],
  .signalStory[data-motion-state='latched']
    [data-motion-part='latest-point'],
  .signalStory[data-motion-state='latched']
    [data-motion-part='metrics'] > div {
    transform: none;
  }
  ```

- [ ] Do not use `display: none`, `visibility: hidden`, `aria-hidden`, or DOM removal for meaningful content at any motion state.

### 5.5 Verify all capability paths

- [ ] Run:

  ```bash
  pnpm --filter docs test:home
  pnpm --filter docs test:site
  pnpm --filter docs typecheck
  pnpm --filter docs build
  ```

  Expected: all commands pass.

- [ ] Scan for forbidden implementation patterns:

  ```bash
  rg -n "requestAnimationFrame|addEventListener\\(['\"](?:scroll|wheel|touchstart|touchmove)|stroke-dashoffset|transition:\\s*all|will-change|filter:\\s*blur|box-shadow" 'apps/docs/app/(home)/signal-story.tsx' 'apps/docs/app/(home)/glucose-signal.module.css' 'apps/docs/app/(home)/glucose-trace.tsx'
  ```

  Expected: no matches.

### 5.6 Commit fallback and reduced-motion support

- [ ] Stage only Task 5 files and commit:

  ```bash
  git add 'apps/docs/app/(home)/glucose-signal.module.css' apps/docs/scripts/signal-passage-contracts.test.mjs
  git commit -m "feat(docs): finish Signal Passage fallbacks"
  ```

---

## Task 6: Document the single safeguarded homepage exception

**Files:**

- Modify: `apps/docs/DESIGN.md`
- Modify: `apps/docs/PRODUCT.md`
- Modify: `apps/docs/scripts/signal-passage-contracts.test.mjs`

### 6.1 Add the failing documentation contracts

- [ ] Read both Markdown files in `signal-passage-contracts.test.mjs`.
- [ ] Require both documents to state:

  - Signal Passage is limited to the homepage report.
  - The complete report remains visible without JavaScript.
  - Reduced motion shows the completed report.
  - Other homepage sections do not gain reveal effects.
  - Native page scrolling is never captured, replaced, snapped, or slowed.

- [ ] Require `DESIGN.md` to name the 900-by-720 gate, the component-local CSS module, the 70/180-only chart treatment, and the no-runtime-animation-dependency decision.
- [ ] Require `PRODUCT.md` to keep the broader anti-portfolio, anti-dashboard, and anti-patient-app rules.

### 6.2 Run the contract and confirm it fails

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/signal-passage-contracts.test.mjs
  ```

  Expected failure: the current design and product documents reject all scroll-triggered effects and describe the old dashboard graph.

### 6.3 Update the design document

- [ ] In the frontmatter motion section, add a bounded Signal Passage entry without changing hero values.
- [ ] Replace the old glucose-instrument description with the approved settled frame:

  - one `#0e0e10` plane
  - 24-pixel radius
  - one latest/observed/target header
  - 2.15-pixel monotone trace
  - white in range, yellow high, red low
  - 5-percent target field
  - only 70 and 180 hairlines
  - four support metrics and one caption
  - no glow, graph-paper grid, five-part legend, or repeated values

- [ ] Document the named CSS view-timeline path, the one-shot observer fallback, the 900-by-720 gate, normal-flow mobile behavior, and the immediate completed reduced-motion state.
- [ ] Preserve the general prohibition on card walls and broad scroll effects. State that Signal Passage is the only homepage exception.

### 6.4 Update the product document

- [ ] Replace “borderless AGP signal” with a precise description of the synthetic 14-day report and latest 24-hour trace.
- [ ] Change the blanket scroll rejection to the bounded safeguard:

  - no awards-portfolio choreography
  - no effects outside the report passage
  - no scroll capture or replacement
  - complete no-JavaScript and reduced-motion output

- [ ] Preserve the audience, positioning, product boundary, safety language, and anti-dashboard direction.

### 6.5 Verify and commit the documentation

- [ ] Run:

  ```bash
  pnpm --filter docs exec node --test scripts/signal-passage-contracts.test.mjs
  pnpm --filter docs test:home
  pnpm --filter docs test:site
  ```

  Expected: all contracts pass.

- [ ] Stage only Task 6 files and commit:

  ```bash
  git add apps/docs/DESIGN.md apps/docs/PRODUCT.md apps/docs/scripts/signal-passage-contracts.test.mjs
  git commit -m "docs: document Signal Passage safeguards"
  ```

---

## Task 7: Run automated, browser, and primary-device acceptance

**Files:**

- No source files unless a verified defect requires returning to the owning task.
- Update the draft PR verification notes with exact evidence; do not commit screenshots or recordings unless explicitly requested.

### 7.1 Run the complete automated gate

- [ ] Under Node 24, run:

  ```bash
  pnpm install --frozen-lockfile
  pnpm --filter docs test:home
  pnpm --filter docs test:site
  pnpm --filter docs typecheck
  pnpm --filter docs build
  pnpm test:docs
  git diff --check
  ```

  Expected: every command exits zero.

- [ ] Confirm the release candidate and public packages are untouched:

  ```bash
  git diff --name-only main...HEAD
  ```

  Expected: only approved specification, plan, homepage application, homepage tests, and bounded docs files appear. No file under `packages/`, `.changeset/`, or `.github/workflows/` appears.

### 7.2 Start the production-like local site

- [ ] Run:

  ```bash
  pnpm --filter docs exec next start --port 3100
  ```

- [ ] Confirm `/` loads with no console errors, hydration warnings, failed resources, or horizontal page overflow.
- [ ] This repository does not currently ship a Playwright or axe browser harness. Keep the browser, accessibility, and performance matrix as recorded manual acceptance for this PR rather than adding unrelated dependencies. If a repeatable browser harness is wanted, scope it as a separate infrastructure change after Signal Passage.

### 7.3 Verify the settled and moving states at required viewports

- [ ] Check 390, 768, 1024, and 1440 pixels wide.
- [ ] At 1024 pixels, check one viewport at least 720 pixels tall and one below 720 pixels.
- [ ] Check a 320-by-180 CSS-pixel viewport, equivalent to 400-percent zoom on a 1280-by-720 display. Confirm the over-tall instrument enters `revealing` and settles at `latched`.
- [ ] Before reaching the instrument, resize a desktop visit to 320 by 180 CSS pixels. Confirm the armed fallback replaces its 25-percent observer with the zoom-safe threshold and still completes.
- [ ] At every size confirm:

  - content order matches the specification
  - no text collision or clipped units
  - all five time labels are present unless the approved 390-pixel minor-label rule applies
  - the endpoint remains tied to the latest reading
  - no horizontal overflow
  - 200-percent zoom remains readable
  - keyboard navigation gains no extra focus target in the figure

- [ ] At 900-by-720 or 1024-by-720, measure:

  ```js
  document
    .querySelector('[data-motion-part="instrument"]')
    ?.getBoundingClientRect().height
  ```

  Expected: no more than 616 pixels.

### 7.4 Verify every lifecycle path

- [ ] In Safari 26.5 and Chrome, verify:

  - native scroll progression on a capable viewport
  - reversal before completion follows scroll position
  - fast scrolling cannot strand hidden content
  - the sentinel latches the final state
  - a direct jump past the sentinel latches on `scrollend`
  - returning after completion stays complete
  - direct reload while the chapter is visible stays complete
  - back-forward-cache restoration stays complete
  - resize and orientation changes settle safely without collapsing the chapter

- [ ] On macOS Safari 26.4, repeat endpoint completion and back-forward-cache restoration. Confirm the 99-percent final animation range, completion sentinel, `scrollend` check, and `pageshow` handler prevent a stranded partial frame despite that release's endpoint and restoration defects.
- [ ] Disable CSS view-timeline support in the test path or use a browser without it. Confirm a normal-height instrument starts at 25-percent visibility, a taller-than-two-viewports instrument starts at its computed adaptive threshold, and both complete in 1100 milliseconds without replaying.
- [ ] Enable reduced motion before loading. Confirm normal document flow, no excess sticky chapter, no animation, and complete content.
- [ ] Disable JavaScript and reload. Confirm the final figure, title, description, values, units, caption, and safety statement are present.
- [ ] Run an axe browser audit on the completed homepage. Expected: zero violations.

### 7.5 Capture iPad performance evidence

- [ ] On the recorded iPad model running iPadOS 26.5 and Safari 26.5, warm the page once.
- [ ] Record three downward and upward passes through Signal Passage in Safari Web Inspector.
- [ ] For the combined three-run evidence, require:

  - median frame interval at or below 18.5 milliseconds
  - 95th-percentile frame interval at or below 25 milliseconds
  - total CLS at or below 0.01
  - no layout-shift entry attributed to Signal Passage
  - no controller/style main-thread task above 50 milliseconds
  - no sustained paint loop from the SVG mask
  - no continuous scroll handler or React render loop

- [ ] Record start, midpoint, and settled screenshots on desktop and iPad.
- [ ] Capture one short iPad Safari recording that shows downward progression, reversal before completion, and the latched final state.

### 7.6 Review the Vercel preview without merging

- [ ] Push only after all local metadata scans pass.
- [ ] Create or update a draft PR with the project-focused title:

  ```text
  feat: add Signal Passage to the GlucoseIQ homepage
  ```

- [ ] Review the Vercel preview on desktop and the primary iPad.
- [ ] Attach the device/build details, screenshots, recording, measurements, automated gate results, and Vercel preview URL to the draft PR.
- [ ] Do not merge. Do not merge the package release PR. Stop with the homepage PR ready for Mark's final review.

---

## Final Review Checklist

- [ ] The approved Signal Passage specification is covered without adding new product scope.
- [ ] `page.tsx`, `glucose-signal-figure.tsx`, and `glucose-trace.tsx` remain Server Components.
- [ ] `signal-story.tsx` accepts only rendered children and performs no per-frame work.
- [ ] Base and no-JavaScript output are complete.
- [ ] Reduced motion is complete and in normal flow.
- [ ] Native motion uses the exact contain ranges and never captures scroll.
- [ ] Fallback motion uses the exact 0–1100 millisecond sequence and runs once.
- [ ] The final graph has no glow, graph-paper grid, redundant legend, repeated latest value, or duplicate time-in-range result.
- [ ] The target field and trace mask use `scaleX`, `transform-box: fill-box`, and a left origin.
- [ ] Only 70 and 180 threshold guides remain.
- [ ] Every non-code label and value uses sans-serif typography.
- [ ] The SVG has one uniquely identified title and description.
- [ ] The description includes the three high excursions in the fixed fixture.
- [ ] The instrument remains no taller than 616 pixels at the native threshold.
- [ ] 390, 768, 1024, and 1440 pixel layouts have no horizontal overflow.
- [ ] Automated, axe, Safari 26.4, Safari 26.5, Chrome, fallback, reduced-motion, no-JavaScript, BFCache, zoom, orientation, and iPad performance checks pass.
- [ ] No package, release workflow, Changeset, or release-candidate file changed.
- [ ] The three unrelated untracked planning drafts remain unstaged.
