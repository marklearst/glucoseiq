# @glucoseiq/tokens

Shared glucose-zone names, palettes, trend glyphs, brand values, and CSS custom
properties for GlucoseIQ surfaces. Requires Node `>=24` and has no runtime
dependencies.

## Install

```bash
npm install @glucoseiq/tokens
```

## First use

```ts typecheck
import { classifyGlucoseZone, cssVariables, zoneColor } from '@glucoseiq/tokens'

const zone = classifyGlucoseZone(112)
const color = zoneColor(zone, 'light')
const rootStyles = cssVariables('light')

console.log({ zone, color, rootStyles })
```

## Options and defaults

`zoneColor(zone, theme)` and `cssVariables(theme)` accept `dark` or `light`;
the theme defaults to `dark`. `classifyGlucoseZone` has no options.

## Invalid input

`classifyGlucoseZone` accepts mg/dL only. A value must be positive and finite;
zero, negative, `NaN`, and infinite values throw `RangeError`. Convert mmol/L
before classification. Theme and zone names are closed TypeScript unions.

## Safety limits

Tokens provide consistent labels and values, not a complete accessibility or
medical interpretation layer. Pair color with text, shape, or position and
test contrast in the actual interface. Output is informational and not medical
advice.

## Documentation

- [Tokens guide](https://glucoseiq.health/docs/tokens)
- [Public API](https://glucoseiq.health/docs/api)
- [Migration guide](https://glucoseiq.health/docs/migration)
- [Changelog](https://github.com/marklearst/glucoseiq/blob/main/CHANGELOG.md)
- [MIT license](https://github.com/marklearst/glucoseiq/blob/main/LICENSE)
