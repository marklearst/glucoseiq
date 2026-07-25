# GlucoseIQ

GlucoseIQ is a headless TypeScript library for CGM and glucose data. The core
package normalizes readings, calculates metrics, and returns render data or SVG
for your UI. Companion packages add React bindings, design tokens, fixed-seed
test fixtures, and a command-line interface.

GlucoseIQ 1.0 moves the project into the `@glucoseiq` package scope.
`diabetic-utils` 2.0 is the compatibility bridge for existing 1.5.x imports.

> GlucoseIQ is for informational, educational, and software-development use.
> It is not medical advice and is not a medical device.

## Packages

| Package | Purpose |
| --- | --- |
| [`@glucoseiq/core`](https://www.npmjs.com/package/@glucoseiq/core) | Headless analytics, metrics, connectors, interoperability helpers, render data, and SVG renderers. |
| [`@glucoseiq/react`](https://www.npmjs.com/package/@glucoseiq/react) | React 18 and 19 hooks and headless components backed by the core package. |
| [`@glucoseiq/tokens`](https://www.npmjs.com/package/@glucoseiq/tokens) | Shared glucose-zone colors, thresholds, trend glyphs, and CSS custom properties. |
| [`@glucoseiq/testing`](https://www.npmjs.com/package/@glucoseiq/testing) | Fixed-seed synthetic CGM-shaped data and scenario fixtures for tests and demos. |
| [`@glucoseiq/cli`](https://www.npmjs.com/package/@glucoseiq/cli) | The `glucoseiq` executable for analyzing mapped CSV input. |
| [`diabetic-utils`](https://www.npmjs.com/package/diabetic-utils) | Compatibility bridge from the legacy package to `@glucoseiq/core`. |

All published packages require Node.js `>=24`. `@glucoseiq/react` keeps React
`>=18` as its peer range.

## First report

```bash
npm install @glucoseiq/core
```

```ts typecheck
import {
  MG_DL,
  analyzeGlucose,
  type GlucoseReading,
} from '@glucoseiq/core'

const readings: GlucoseReading[] = [
  { value: 118, unit: MG_DL, timestamp: '2026-07-13T12:00:00Z' },
  { value: 142, unit: MG_DL, timestamp: '2026-07-13T12:05:00Z' },
  { value: 126, unit: MG_DL, timestamp: '2026-07-13T12:10:00Z' },
]

const report = analyzeGlucose(readings, { timeZone: 'America/Detroit' })

if (!report.valid || report.timeInRange === null) {
  throw new Error('No valid glucose readings were available for analysis')
}

const summary = {
  meanGlucose: report.meanGlucose,
  gmi: report.gmi,
  timeInRange: report.timeInRange.inRange.percentage,
  dataSufficiency: report.dataSufficiency,
}

void summary
```

`valid` means the input produced at least one usable reading. It does not mean
the data meets the duration or timestamp-coverage thresholds in
`dataSufficiency`.
Nullable report blocks must be checked before use.

## Optional SVG rendering

The renderer returns an SVG string. The host application decides how to embed,
sanitize, convert, or deliver that string for its target surface.

```ts typecheck
import {
  MG_DL,
  type GlucoseReading,
} from '@glucoseiq/core'
import { agpChartToSVG } from '@glucoseiq/core/render'

const readings: GlucoseReading[] = [
  { value: 118, unit: MG_DL, timestamp: '2026-07-13T12:00:00Z' },
  { value: 142, unit: MG_DL, timestamp: '2026-07-13T12:05:00Z' },
]

const svg = agpChartToSVG(readings, {
  width: 800,
  height: 320,
  title: 'Glucose percentile profile',
})

void svg
```

Renderer dimensions must be finite positive numbers. Text values are escaped,
but embedding policy and surrounding HTML remain the host application's
responsibility. See the tracked
[`examples/dashboard.html`](https://github.com/marklearst/glucoseiq/blob/main/examples/dashboard.html)
composition example.

## Important input contracts

- Mixed-unit-aware `GlucoseReading` APIs normalize declared `mg/dL` and
  `mmol/L` units before calculations that operate in one unit. Legacy
  `calculateTIR` instead requires readings and target bounds expressed in the
  same homogeneous unit. Numeric-array APIs accept a homogeneous series in the
  unit supplied by the caller.
- `parseGlucoseCSV` expects a header row and mapped column names. Its default
  delimiter is a comma. A custom delimiter must be exactly one UTF-16 code unit;
  double quote, NUL, carriage return, and line feed are rejected. Blank or
  BOM-only input returns an empty result, a valid header-only file returns an
  empty result, missing required headers throw, and invalid data rows are
  skipped. Quoted fields do not support physical newlines.
- `glucoseIQScore` is a project-defined, non-diagnostic score derived from GRI.
- `buildAGPProfile` returns an AGP-style percentile-band series, not a
  standardized complete report.

Package-specific options, defaults, invalid-input behavior, and safety limits
are documented in the [GlucoseIQ guides](https://glucoseiq.dev/docs) and
[API reference](https://glucoseiq.dev/docs/api).

## Migration

Existing projects can install `diabetic-utils@2` while keeping their package
imports. New projects should use the scoped packages directly.

```ts typecheck
import { mgDlToMmolL } from 'diabetic-utils'

const mmolL = mgDlToMmolL(180)
void mmolL
```

Read the [migration guide](https://glucoseiq.dev/docs/migration) for runtime,
type-declaration, and package-boundary changes. The published 1.5.x line remains
available through the `legacy` npm dist-tag.

## Development

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm test:docs
```

The monorepo uses pnpm workspaces, Turborepo, Changesets, TypeScript, and
Fumadocs. Release work is gated by build, lint, type checking, full coverage,
the core size budget, packed-package consumer tests, and the documentation
build.

## License

[MIT](https://github.com/marklearst/glucoseiq/blob/main/LICENSE) ©
[Mark Learst](https://marklearst.com)
