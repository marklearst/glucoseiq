# @glucoseiq/cli

Command-line glucose analysis and AGP-style SVG generation powered by
`@glucoseiq/core`. The package exposes the `glucoseiq` executable and a typed,
injectable `run` function. Requires Node `>=24`.

## Install

```bash
npm install @glucoseiq/cli
```

Run the installed executable:

```bash
glucoseiq report data.csv --json
```

## First use as a library

```ts typecheck
import { type CliIO, run } from '@glucoseiq/cli'

const io: CliIO = {
  out(line) {
    console.log(line)
  },
  err(line) {
    console.error(line)
  },
}

const exitCode: number = run(['report', 'data.csv', '--json'], io)
console.log(`exit ${exitCode}`)
```

## Options and defaults

Flags are `--timestamp-col`, `--value-col`, `--unit`, `--delimiter`,
`--timezone`, `--json`, `--agp-svg`, and `--help`.

- `--timestamp-col` defaults to `Timestamp`.
- `--value-col` defaults to `Glucose Value (mg/dL)`.
- `--unit` accepts mg/dL or mmol/L and defaults to mg/dL.
- `--delimiter` defaults to comma and must be one UTF-16 code unit, excluding
  double quote, NUL, CR, and LF.
- `--timezone` defaults to `UTC` in the report pipeline.
- `--json` writes the structured result instead of the human summary.
- `--agp-svg <path>` also writes the SVG file.
- `--help` prints usage.

The timestamp and value flags map exact CSV columns; they do not select a
vendor parser. Success and help return exit code 0; errors return 1.

## JSON and SVG output

JSON has the shape `{ report, glucoseIQ }`; non-finite numbers serialize as
null. When `--json` and `--agp-svg` are combined, stdout remains one JSON
document and suppresses the SVG success line. The SVG is written to the path
provided to `--agp-svg`.

## Invalid input

Invalid input, unknown flags, unknown commands, unreadable files, files with no
usable rows, and unwritable SVG destinations return exit code 1. Failures are
written as one sanitized stderr line without a stack trace. The library form
returns the code instead of changing `process.exitCode`.

## Safety limits

The CLI inherits the core CSV and analysis boundaries. It reads the requested
file into memory and writes only the explicitly requested SVG path; callers
remain responsible for file-size controls and trusted path selection in their
host environment. Output is informational and not medical advice.

## Documentation

- [CLI guide](https://glucoseiq.dev/docs/cli)
- [Public API](https://glucoseiq.dev/docs/api)
- [Migration guide](https://glucoseiq.dev/docs/migration)
- [Changelog](https://github.com/marklearst/glucoseiq/blob/main/CHANGELOG.md)
- [MIT license](https://github.com/marklearst/glucoseiq/blob/main/LICENSE)
