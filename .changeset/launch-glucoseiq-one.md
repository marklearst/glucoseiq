---
"@glucoseiq/core": major
"@glucoseiq/react": major
"@glucoseiq/tokens": major
"@glucoseiq/testing": major
"@glucoseiq/cli": major
---

Launch the GlucoseIQ 1.0 package family.

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
