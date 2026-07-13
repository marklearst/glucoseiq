/**
 * @glucoseiq/cli — zero-code CGM analysis from the terminal.
 *
 *   npx @glucoseiq/cli report data.csv --timestamp-col Timestamp --value-col "Glucose Value (mg/dL)"
 *
 * The `run` function is the whole CLI (the bin is a two-line shim), so it is
 * fully unit-testable with injected IO.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  parseGlucoseCSV,
  analyzeGlucose,
  glucoseIQScore,
  agpChartToSVG,
  type GlucoseUnit,
} from '@glucoseiq/core'

/** Injected IO so tests can capture output. */
export interface CliIO {
  out(line: string): void
  err(line: string): void
}

const HELP = `glucoseiq — zero-code CGM analysis (powered by @glucoseiq/core)

Usage:
  glucoseiq report <file.csv> [options]

Options:
  --timestamp-col <name>   CSV column holding ISO timestamps (default "Timestamp")
  --value-col <name>       CSV column holding glucose values (default "Glucose Value (mg/dL)")
  --unit <mg/dL|mmol/L>    Unit of the values (default mg/dL)
  --delimiter <char>       Field delimiter (default ",")
  --timezone <IANA>        Time zone for the AGP profile (default UTC)
  --json                   Emit the full report as JSON
  --agp-svg <out.svg>      Also write the AGP chart as a self-contained SVG
  --help                   Show this help

Informational only — not medical advice.`

const CLI_OPTIONS = {
  'timestamp-col': { type: 'string' },
  'value-col': { type: 'string' },
  unit: { type: 'string' },
  delimiter: { type: 'string' },
  timezone: { type: 'string' },
  json: { type: 'boolean' },
  'agp-svg': { type: 'string' },
  help: { type: 'boolean' },
} as const

const ERROR_FALLBACK = 'Unexpected CLI failure.'
const PHYSICAL_LINE_BOUNDARY = /[\r\n\u2028\u2029]/u
const UNSAFE_OUTPUT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu

/** Escapes terminal, format, and line controls without executing conversion hooks. @internal */
function escapeUnsafe(text: string): string {
  return text.replace(
    UNSAFE_OUTPUT,
    (character) => `\\u{${character.codePointAt(0)!.toString(16)}}`,
  )
}

/** Converts an unknown value to text without allowing hostile conversion hooks to escape. @internal */
function stringOrFallback(value: unknown, fallback: string): string {
  try {
    return String(value)
  } catch {
    return fallback
  }
}

/** Converts an operational failure into one stable stderr line. @internal */
function errorLine(error: unknown): string {
  let value: unknown = error
  try {
    if (error instanceof Error) value = error.message
  } catch {
    return ERROR_FALLBACK
  }

  const message = stringOrFallback(value, ERROR_FALLBACK)
  const firstLine = message.split(PHYSICAL_LINE_BOUNDARY, 1)[0]
  return escapeUnsafe(firstLine).trim() || ERROR_FALLBACK
}

/** Produces a terminal-safe path for successful human output. @internal */
function displayPath(path: string): string {
  return escapeUnsafe(path)
}

/** Emits exactly one sanitized failure line and returns the failure status. @internal */
function fail(io: CliIO, error: unknown): 1 {
  const line = errorLine(error)
  try {
    io.err(line)
  } catch {
    // The injected sink is already failing; do not recurse or attempt a duplicate diagnostic.
  }
  return 1
}

/** Narrows a validated CLI unit to the public core unit type. @internal */
function isGlucoseUnit(value: string): value is GlucoseUnit {
  return value === 'mg/dL' || value === 'mmol/L'
}

/**
 * Runs the CLI. Returns a process exit code.
 */
export function run(argv: string[], io: CliIO): number {
  try {
    const { positionals, values } = parseArgs({
      args: argv,
      options: CLI_OPTIONS,
      strict: true,
      allowPositionals: true,
    })

    if (values.help || positionals.length === 0) {
      io.out(HELP)
      return positionals.length === 0 && !values.help ? 1 : 0
    }

    const [command, file] = positionals
    if (command !== 'report') {
      return fail(io, `Unknown command: ${positionals.join(' ')} (try --help)`)
    }
    if (positionals.length !== 2) {
      return fail(io, 'Expected exactly: glucoseiq report <file.csv> (try --help)')
    }

    const unit = values.unit ?? 'mg/dL'
    if (!isGlucoseUnit(unit)) {
      return fail(io, 'Invalid unit: expected "mg/dL" or "mmol/L".')
    }

    const delimiter = values.delimiter ?? ','
    if (
      delimiter.length !== 1 ||
      delimiter === '"' ||
      delimiter === '\0' ||
      delimiter === '\r' ||
      delimiter === '\n'
    ) {
      return fail(
        io,
        'Invalid delimiter: expected exactly one character other than double quote, NUL, CR, or LF.',
      )
    }

    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      return fail(io, `Cannot read file: ${file}`)
    }

    const readings = parseGlucoseCSV(text, {
      timestampColumn: values['timestamp-col'] ?? 'Timestamp',
      valueColumn: values['value-col'] ?? 'Glucose Value (mg/dL)',
      unit,
      delimiter,
    })

    const timeZone = values.timezone
    const report = analyzeGlucose(readings, { timeZone })
    if (!report.valid) {
      return fail(io, 'No valid readings found in the file.')
    }
    const iq = glucoseIQScore(readings)
    const outputLines: string[] = []

    if (values.json) {
      outputLines.push(JSON.stringify({ report, glucoseIQ: iq }, null, 2))
    } else {
      const tir = report.timeInRange!
      outputLines.push(
        'GlucoseIQ report',
        '────────────────────────────────',
        `Readings        ${report.dataSufficiency.totalReadings} over ${report.dataSufficiency.daysOfData} days`,
        `Glucose IQ      ${iq.score} (${iq.rating}, zone ${iq.zone})`,
        `Mean / GMI      ${report.meanGlucose} mg/dL · GMI ${report.gmi}%`,
        `Variability     SD ${report.sd} · CV ${report.cv}%`,
        `Time in range   ${tir.inRange.percentage}% (70-180) · tight ${report.tightRange!.inRange}% (70-140)`,
        `Below range     ${tir.low.percentage}% low · ${tir.veryLow.percentage}% very low`,
        `Above range     ${tir.high.percentage}% high · ${tir.veryHigh.percentage}% very high`,
        `Episodes        ${report.episodes!.summary.hypoCount} hypo · ${report.episodes!.summary.hyperCount} hyper`,
        '────────────────────────────────',
        'Informational only — not medical advice.',
      )
    }

    const svgOut = values['agp-svg']
    if (svgOut !== undefined) {
      const svg = agpChartToSVG(readings, { timeZone })
      try {
        writeFileSync(svgOut, svg)
      } catch {
        return fail(io, `Cannot write AGP SVG: ${svgOut}`)
      }
      if (!values.json) outputLines.push(`AGP chart written to ${displayPath(svgOut)}`)
    }

    io.out(outputLines.join('\n'))
    return 0
  } catch (error) {
    return fail(io, error)
  }
}
