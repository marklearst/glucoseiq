# @glucoseiq/core

## 1.0.0-next.0

### Major Changes

- 323f0ca: Launch the GlucoseIQ 1.0 package family.

  - `@glucoseiq/core`: dependency-free analytics, GMI conversion helpers, mapped
    ingestion, connector normalization, interoperability helpers, and SVG
    rendering.
  - `@glucoseiq/react`: React 18-and-newer hooks and SVG components, with React as
    a peer dependency.
  - `@glucoseiq/tokens`: glucose-zone names, palettes, trend glyphs, brand values,
    and CSS custom properties.
  - `@glucoseiq/testing`: smooth, bounded CGM-shaped generators with
    duration-stable seeded prefixes, plus fixed scenarios for repeatable tests
    and examples.
  - `@glucoseiq/cli`: the `glucoseiq` executable for CSV-backed reports, JSON, and
    AGP-style SVG output, plus an injectable library entrypoint.

  `estimateGMI` now uses the published mean-CGM equation and converts mmol/L to
  mg/dL before calculating the result. `GMI_COEFFICIENTS` exposes matching
  values. For example, 100 mg/dL and 5.5 mmol/L both return 5.7%. The deprecated
  `a1cToGMI` export remains available as a compatibility transform, but it is not
  a CGM-derived GMI. It and `estimateEAG` now reject non-positive or non-finite
  A1C input.

  All five packages require Node 24 or newer. The core runtime and its subpaths
  support ESM and CommonJS consumers with format-specific TypeScript declaration
  routes.

  Core source documentation and the generated API reference now use direct
  descriptions and document existing return behavior for variability metrics.
  The variability calculations and public API signatures are unchanged.

  CLI package metadata and docs now describe CGM CSV analysis as command-line
  work that does not require application code. Help text and human-readable
  reports use the same informational disclaimer. Commands, options, exit codes,
  report data, and file output are unchanged.

  Core package metadata now lists the analytics it provides and states that core
  has no runtime dependencies. React source documentation now explains how its
  hooks and components use core. It also names React as a peer dependency and core
  as a runtime dependency. Package exports, dependencies, calculations, and
  runtime behavior are unchanged.

  Core and React documentation now state that reading age is signed and can be
  negative when a reading timestamp is ahead of the current clock. The live guide
  handles that state and states how its timestamp-based merge helper handles
  matching strings. Runtime behavior is unchanged.

  Core report and aggregate metric docs now name the exact result types and
  metrics. Calculations, options, errors, return values, and public signatures are
  unchanged.
