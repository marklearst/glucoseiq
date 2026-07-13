# diabetic-utils

Compatibility bridge from `diabetic-utils` 1.5 to GlucoseIQ 1.0. Version 2
re-exports `@glucoseiq/core@^1.0.0` from the existing package root and
preserves the 107 public export names recorded in `diabetic-utils@1.5.0`.
Requires Node `>=24`.

## Install

```bash
npm install diabetic-utils
```

## First use

```ts typecheck
import { calculateEnhancedTIR, type GlucoseReading } from 'diabetic-utils'

const readings: GlucoseReading[] = [
  {
    value: 112,
    unit: 'mg/dL',
    timestamp: '2026-07-13T12:00:00.000Z',
  },
]

const result = calculateEnhancedTIR(readings)
console.log(result.inRange.percentage)
```

## Version choice

Version 1.5 remains available through the legacy dist-tag and is not
deprecated. Version 2 is the compatibility package for the GlucoseIQ 1.0
runtime and Node requirement. New projects should install `@glucoseiq/core`
and follow the scoped-package migration guide.

## Options and defaults

The bridge does not add package-level options or defaults. Functions use the
same options and defaults as their `@glucoseiq/core` exports. Keep the
`diabetic-utils` import while upgrading, then move imports to the scoped
package when the application is ready.

## Invalid input

Invalid input follows the corresponding core function contract. That includes
typed errors with stable codes for operations that throw and typed invalid or
empty results for report-style operations that use result signaling.

## Safety limits

The bridge adds no new validation, storage, network access, or rendering
behavior. The same input policies and resource boundaries as
`@glucoseiq/core` apply. Output is informational and not medical advice.

## Documentation

- [Migration guide](https://glucoseiq.health/docs/migration)
- [Core API](https://glucoseiq.health/docs/api/core)
- [Changelog](https://github.com/marklearst/glucoseiq/blob/main/CHANGELOG.md)
- [MIT license](https://github.com/marklearst/glucoseiq/blob/main/LICENSE)
