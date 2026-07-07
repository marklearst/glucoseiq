# @glucoseiq/testing

Fixed-seed CGM-shaped fixtures for tests, examples, and local demos.
Requires Node `>=24`.

## Install

```bash
npm install @glucoseiq/testing
```

## First use

```ts typecheck
import { generateCGMSeries, scenarios } from '@glucoseiq/testing'

const readings = generateCGMSeries({ days: 14, seed: 7 })
const traceWithGap = scenarios.gappyTrace()

console.log(readings.length, traceWithGap.length)
```

## Options and defaults

`generateCGMSeries` accepts these options:

| Option | Default | Meaning |
| --- | --- | --- |
| `days` | `1` | Number of days. |
| `intervalMin` | `5` | Minutes between readings. |
| `seed` | `42` | Safe integer used to repeat the same generated series. |
| `start` | `2024-01-01T00:00:00Z` | ISO timestamp for the first day. |
| `basal` | `110` | Baseline in mg/dL. |
| `mealTimes` | `420, 780, 1140` | Meal times as minutes of day. |
| `mealAmplitude` | `70` | Nominal meal excursion amplitude in mg/dL. |
| `noise` | `8` | Maximum correlated sensor variation in mg/dL. |
| `nocturnalHypoDays` | `[]` | Zero-based days receiving a smooth 02:00–04:00 dip. |
| `unit` | `mg/dL` | Output unit, either mg/dL or mmol/L. |

The seed gives each meal its own timing offset (-15 to +25 minutes), peak
amplitude (65% to 125% of `mealAmplitude`), 40- to 90-minute rise, and
120- to 210-minute recovery. Meal responses ease in and out instead of
changing direction sharply. Sensor variation is bounded and carries across
neighboring readings, while requested nocturnal lows form a smooth two-hour
depression.

The `steadyDay`, `hypoNight`, `rollercoaster`, and `gappyTrace` scenarios use
fixed settings and seeds.

## Invalid input

Invalid input throws `RangeError`. The generator validates option shape,
numeric bounds, the start timestamp, units, meal-time arrays, and requested
output size before allocating the result.

## Safety limits

One call is capped at 100,000 readings and 100,000 seeded meal responses. The
output is synthetic CGM-shaped data and is not clinically representative or a
substitute for validation with real device data. Do not use generated values
for medical decisions.

## Documentation

- [Testing guide](https://glucoseiq.dev/docs/testing)
- [Public API](https://glucoseiq.dev/docs/api)
- [Migration guide](https://glucoseiq.dev/docs/migration)
- [Changelog](https://github.com/marklearst/glucoseiq/blob/main/CHANGELOG.md)
- [MIT license](https://github.com/marklearst/glucoseiq/blob/main/LICENSE)
