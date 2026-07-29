# @glucoseiq/react

React hooks and headless chart components backed by `@glucoseiq/core`.
Requires Node `>=24`; React `>=18` is a peer dependency.

The root is a Client Component package. Use `@glucoseiq/core` directly for
server-only work so a server module does not import the client boundary.

## Install

```bash
npm install @glucoseiq/react
```

Install a supported React version and `react-dom` in the host application.
`@glucoseiq/core` is installed as a runtime dependency.

## First use

```tsx typecheck
import { useMemo } from 'react'
import { AgpChart, useGlucoseAnalysis } from '@glucoseiq/react'
import type { GlucoseReading } from '@glucoseiq/core'

export function GlucoseSummary({ readings }: { readings: GlucoseReading[] }) {
  const options = useMemo(() => ({ timeZone: 'UTC' }), [])
  const report = useGlucoseAnalysis(readings, options)

  return (
    <section>
      <p>{report.valid ? `${report.meanGlucose} mg/dL` : 'No usable data'}</p>
      <AgpChart readings={readings} options={options} />
    </section>
  )
}
```

## Options and defaults

Hooks pass options to their corresponding core operation. Components pass
renderer options through to the SVG renderer. Core defaults apply when an
options object is omitted; for example, analysis and AGP bucketing default to
`UTC`, and renderers provide default dimensions and a dark theme.

Keep the readings array and options object identities stable between renders
when their contents have not changed. The hooks memoize by those identities;
creating either value during every render defeats that memoization.

## Invalid input

Invalid input follows the underlying core contract. Analysis hooks can return
`valid: false` for empty or unusable readings. Renderer option failures, such
as non-positive dimensions, surface the typed core error thrown by the
renderer. Omit `refreshMs` to disable live staleness refresh. When provided, it
must be a whole number of milliseconds from `1` through `2_147_483_647`;
invalid values throw `DomainError` with code `INVALID_OPTION` before a timer is
scheduled.

## Safety limits

Apart from the platform-safe `refreshMs` timer range, the adapter preserves the
called core operation's validation. Memoization is a performance boundary, not
a cache for mutable input: replace changed arrays and objects instead of
mutating values in place. Output is informational and not medical advice.

## Documentation

- [React guide](https://glucoseiq.dev/docs/react)
- [Public API](https://glucoseiq.dev/docs/api)
- [Changelog](https://github.com/marklearst/glucoseiq/blob/main/CHANGELOG.md)
- [MIT license](https://github.com/marklearst/glucoseiq/blob/main/LICENSE)
