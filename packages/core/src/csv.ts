/**
 * @file src/csv.ts
 *
 * Mapped header-row delimited data parser. Name the timestamp and value
 * columns explicitly; it handles quoted fields, custom one-character
 * delimiters, and skips rows that do not parse. Pure and dependency-free.
 */

import type { GlucoseReading, GlucoseUnit } from './types'
import { MG_DL } from './constants'
import { DomainError, ParseError } from './errors'

/** Options for {@link parseGlucoseCSV}. */
export interface CSVParseOptions {
  /** Header name of the timestamp column. */
  readonly timestampColumn: string
  /** Header name of the glucose value column. */
  readonly valueColumn: string
  /** Unit of the values (default 'mg/dL'). */
  readonly unit?: GlucoseUnit
  /**
   * Field delimiter (default `,`). Must be exactly one UTF-16 code unit other
   * than double quote, NUL, CR, or LF.
   */
  readonly delimiter?: string
}

/** Parses a single CSV line into fields, honoring quotes and escaped quotes. @internal */
function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      fields.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field)
  return fields
}

/** Safely reads and trims a cell, tolerating short rows. @internal */
function cell(fields: string[], index: number): string {
  return (fields[index] ?? '').trim()
}

/**
 * Parses CSV text into glucose readings.
 *
 * Empty and blank-only documents return an empty array. A header-only document
 * also returns an empty array after validating both mapped columns. Quoted
 * fields and doubled quotes are supported, but physical newlines inside a
 * quoted field are not.
 *
 * @param text - The CSV document
 * @param options - Column names, unit, and delimiter
 * @returns Parsed readings (rows with an unparseable value or timestamp are skipped)
 * @throws {DomainError} If the delimiter is invalid
 * @throws {ParseError} If a named column is not present in the header
 *
 * @example
 * ```ts typecheck
 * import { parseGlucoseCSV } from '@glucoseiq/core'
 *
 * const csv: string = [
 *   'Timestamp (YYYY-MM-DDThh:mm:ss),Glucose Value (mg/dL)',
 *   '2024-01-01T08:00:00Z,120',
 * ].join('\n')
 * const readings = parseGlucoseCSV(csv, {
 *   timestampColumn: 'Timestamp (YYYY-MM-DDThh:mm:ss)',
 *   valueColumn: 'Glucose Value (mg/dL)',
 * })
 * ```
 *
 * @category IO
 * @public
 */
export function parseGlucoseCSV(text: string, options: CSVParseOptions): GlucoseReading[] {
  const unit = options.unit ?? MG_DL
  const configuredDelimiter: unknown = options.delimiter
  const delimiter = configuredDelimiter === undefined ? ',' : configuredDelimiter
  if (
    typeof delimiter !== 'string' ||
    delimiter.length !== 1 ||
    delimiter === '"' ||
    delimiter === '\0' ||
    delimiter === '\r' ||
    delimiter === '\n'
  ) {
    throw new DomainError(
      'parseGlucoseCSV: delimiter must be exactly one character other than double quote, NUL, CR, or LF',
      'INVALID_OPTION'
    )
  }

  const document = text.startsWith('\ufeff') ? text.slice(1) : text
  const lines = document.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []

  const header = parseLine(lines[0], delimiter).map((h) => h.trim())
  const tsIdx = header.indexOf(options.timestampColumn)
  const valIdx = header.indexOf(options.valueColumn)
  if (tsIdx === -1 || valIdx === -1) {
    throw new ParseError(
      `parseGlucoseCSV: column not found (timestamp="${options.timestampColumn}", value="${options.valueColumn}")`,
      'CSV_COLUMN_NOT_FOUND'
    )
  }

  const readings: GlucoseReading[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i], delimiter)
    const value = Number(cell(cols, valIdx))
    if (!Number.isFinite(value) || value <= 0) continue
    const ms = Date.parse(cell(cols, tsIdx))
    if (Number.isNaN(ms)) continue
    readings.push({ value, unit, timestamp: new Date(ms).toISOString() })
  }
  return readings
}
