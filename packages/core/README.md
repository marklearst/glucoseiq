# @glucoseiq/core

Headless TypeScript primitives for glucose analytics, mapped data ingestion,
interoperability, and optional SVG rendering. The package has no runtime
dependencies and requires Node `>=24`.

## Install

```bash
npm install @glucoseiq/core
```

## First use

```ts typecheck
import { analyzeGlucose, type GlucoseReading } from '@glucoseiq/core'

const readings: GlucoseReading[] = [
  {
    value: 112,
    unit: 'mg/dL',
    timestamp: '2026-07-13T12:00:00.000Z',
  },
]

const report = analyzeGlucose(readings, { includeProfile: false })
if (report.valid) console.log(report.meanGlucose)
```

## Public entrypoints

- `@glucoseiq/core`: reports, time-in-range, conversions, series, live state,
  errors, and shared types.
- `@glucoseiq/core/metrics`: focused variability, risk, curve, episode, and
  profile calculations.
- `@glucoseiq/core/connectors`: typed Dexcom, Libre, and Nightscout payload
  normalization.
- `@glucoseiq/core/interop`: FHIR CGM and Open mHealth transforms.
- `@glucoseiq/core/render`: dependency-free AGP, TIR, and trend SVG strings.

## Data and units

Mixed-unit-aware `GlucoseReading` APIs normalize each reading's declared unit.
Legacy `calculateTIR` instead requires readings and target bounds expressed in
one homogeneous unit. Numeric-array APIs require a homogeneous series and a
matching unit option where the function exposes one. A bare number does not
carry unit information.

`glucoseIQScore` is a project-defined, non-diagnostic wellness heuristic
derived from GRI. It returns the underlying GRI value alongside the derived
score and rating.

## CSV contract

`parseGlucoseCSV` reads header-row delimited data using mapped timestamp and
value columns. The delimiter defaults to comma. A custom delimiter must be a
one-code-unit delimiter; validation rejects double quote, NUL, CR, and LF.

- Blank or BOM-only input returns an empty array.
- A valid header-only document returns an empty array after header validation.
- A missing mapped header throws `ParseError` with `CSV_COLUMN_NOT_FOUND`.
- An invalid delimiter throws `DomainError` with `INVALID_OPTION`.
- Invalid rows are skipped.
- Quoted fields cannot span physical lines.

This is a mapped delimited-data contract, not an implicit vendor-format
detector. Name the columns and unit present in the input file.

## Options and defaults

`analyzeGlucose` defaults to the `UTC` time zone, includes the percentile-band
profile, and uses 14 days plus 70 percent timestamp-slot coverage for its
sufficiency flag. Coverage estimates do not prove sensor wear or clinical
suitability.
`parseGlucoseCSV` defaults to `mg/dL` and comma when those optional values are
omitted. Individual metrics and renderers document their own defaults in the
public API.

## Invalid input

Intentional failures use the typed `GlucoseIQError` hierarchy:
`DomainError`, `ParseError`, `EmptyDatasetError`, and `TimestampError`. Each
has one of the stable error codes exported by the package, so callers can
narrow by class or `error.code` without matching message text. Report-style
APIs that accept empty or unusable data may instead return a typed
`valid: false` result; check the function contract.

## SVG renderers and host integration

The optional SVG renderers validate positive finite dimensions and return SVG
strings. The AGP renderer produces an AGP-style percentile-band series; it is
not a complete standardized AGP report. Email, PDF, README, and watch hosts
require host-specific embedding, conversion, or integration. Treat returned
markup as data and choose an integration appropriate for the target host.

## Safety limits

GlucoseIQ screens unusable readings according to each operation's documented
policy and rejects malformed options where a function promises validation. It
does not replace product-specific validation, security controls, or review of
source data. The output is informational and not medical advice.

## Documentation

- [Core concepts](https://glucoseiq.dev/docs/core-concepts)
- [Public API](https://glucoseiq.dev/docs/api/core)
- [Changelog](https://github.com/marklearst/glucoseiq/blob/main/CHANGELOG.md)
- [MIT license](https://github.com/marklearst/glucoseiq/blob/main/LICENSE)
