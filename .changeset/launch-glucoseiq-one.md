---
"@glucoseiq/core": major
"@glucoseiq/react": major
"@glucoseiq/tokens": major
"@glucoseiq/testing": major
"@glucoseiq/cli": major
"diabetic-utils": major
---

Launch the GlucoseIQ 1.0 package family and the `diabetic-utils` 2.0
compatibility bridge.

- `@glucoseiq/core` provides the dependency-free headless analytics engine,
  including glucose reports, time-in-range and variability calculations,
  typed errors, live-series state, mapped data ingestion, and the dedicated
  `/metrics`, `/connectors`, `/interop`, and `/render` entrypoints.
- `@glucoseiq/react` provides React 18-and-newer hooks and headless SVG-backed
  components on top of the core contracts while keeping React as a peer.
- `@glucoseiq/tokens` provides shared glucose-zone names, palettes, trend
  glyphs, brand values, and CSS custom properties for product surfaces.
- `@glucoseiq/testing` provides bounded, deterministic CGM-shaped generators
  and fixed scenarios for tests, examples, and local development.
- `@glucoseiq/cli` installs the `glucoseiq` executable for CSV-backed reports,
  structured JSON, and AGP-style SVG output, and also exposes an injectable
  library entrypoint.
- `diabetic-utils` 2.0 re-exports `@glucoseiq/core@^1.0.0` as the migration
  bridge and preserves all 107 public export names from version 1.5. Version
  1.5 remains available through the `legacy` dist-tag without deprecation.

All six packages require Node 24 or newer. The core runtime and its subpaths
support ESM and CommonJS consumers with format-specific TypeScript declaration
routes.
