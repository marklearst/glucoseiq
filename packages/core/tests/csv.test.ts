import { describe, it, expect } from 'vitest'
import { parseGlucoseCSV, type CSVParseOptions } from '../src/csv'
import { DomainError, ParseError } from '../src/errors'

const INVALID_DELIMITER_MESSAGE =
  'parseGlucoseCSV: delimiter must be exactly one character other than double quote, NUL, CR, or LF'
const COLUMN_NOT_FOUND_MESSAGE =
  'parseGlucoseCSV: column not found (timestamp="t", value="v")'

const BASE_OPTIONS = {
  timestampColumn: 't',
  valueColumn: 'v',
} as const

function optionsWithDelimiter(delimiter: unknown): CSVParseOptions {
  return { ...BASE_OPTIONS, delimiter } as CSVParseOptions
}

function expectInvalidDelimiter(delimiter: unknown, text = ''): void {
  let thrown: unknown
  try {
    parseGlucoseCSV(text, optionsWithDelimiter(delimiter))
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(DomainError)
  expect(thrown).toMatchObject({
    name: 'DomainError',
    code: 'INVALID_OPTION',
    message: INVALID_DELIMITER_MESSAGE,
  })
}

describe('parseGlucoseCSV', () => {
  it('parses a simple CSV into readings with ISO timestamps', () => {
    const csv = `Timestamp,Glucose Value (mg/dL)
2024-01-01T08:00:00Z,120
2024-01-01T08:05:00Z,135`
    const readings = parseGlucoseCSV(csv, {
      timestampColumn: 'Timestamp',
      valueColumn: 'Glucose Value (mg/dL)',
    })
    expect(readings).toEqual([
      { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00.000Z' },
      { value: 135, unit: 'mg/dL', timestamp: '2024-01-01T08:05:00.000Z' },
    ])
  })

  it('handles quoted fields with commas and escaped quotes', () => {
    const csv = `"Time, local","Value"
"2024-01-01T08:00:00Z","120"
"has ""quote""","150"`
    const readings = parseGlucoseCSV(csv, {
      timestampColumn: 'Time, local',
      valueColumn: 'Value',
    })
    // second row's timestamp is not a date → skipped
    expect(readings).toHaveLength(1)
    expect(readings[0].value).toBe(120)
  })

  it('skips rows with a non-numeric or non-positive value', () => {
    const csv = `t,v
2024-01-01T08:00:00Z,120
2024-01-01T08:05:00Z,Low
2024-01-01T08:10:00Z,-5
2024-01-01T08:15:00Z,140`
    const readings = parseGlucoseCSV(csv, { timestampColumn: 't', valueColumn: 'v' })
    expect(readings.map((r) => r.value)).toEqual([120, 140])
  })

  it('supports mmol/L and a custom delimiter', () => {
    const csv = `t\tv
2024-01-01T08:00:00Z\t5.5
2024-01-01T08:05:00Z\t6.1`
    const readings = parseGlucoseCSV(csv, {
      timestampColumn: 't',
      valueColumn: 'v',
      unit: 'mmol/L',
      delimiter: '\t',
    })
    expect(readings).toHaveLength(2)
    expect(readings[0]).toEqual({
      value: 5.5,
      unit: 'mmol/L',
      timestamp: '2024-01-01T08:00:00.000Z',
    })
  })

  it('throws when a named column is missing', () => {
    const csv = `a,b\n1,2`
    expect(() =>
      parseGlucoseCSV(csv, { timestampColumn: 'missing', valueColumn: 'b' })
    ).toThrow(/column/i)
  })

  it('tolerates rows with missing columns', () => {
    const csv = `t,v
2024-01-01T08:00:00Z,120
2024-01-01T08:05:00Z
,140`
    const readings = parseGlucoseCSV(csv, { timestampColumn: 't', valueColumn: 'v' })
    expect(readings).toHaveLength(1)
    expect(readings[0].value).toBe(120)
  })

  it('returns an empty array for header-only or empty input', () => {
    expect(parseGlucoseCSV('t,v', { timestampColumn: 't', valueColumn: 'v' })).toEqual([])
    expect(parseGlucoseCSV('', { timestampColumn: 't', valueColumn: 'v' })).toEqual([])
  })

  it.each([
    { label: 'empty', delimiter: '' },
    { label: 'multiple code units', delimiter: '||' },
    { label: 'an astral character', delimiter: '💉' },
    { label: 'double quote', delimiter: '"' },
    { label: 'NUL', delimiter: '\0' },
    { label: 'carriage return', delimiter: '\r' },
    { label: 'line feed', delimiter: '\n' },
    { label: 'null', delimiter: null },
    { label: 'a number', delimiter: 1 },
    { label: 'a boolean', delimiter: true },
    { label: 'an object', delimiter: {} },
  ])('rejects $label delimiters before classifying an empty document', ({ delimiter }) => {
    expectInvalidDelimiter(delimiter)
  })

  it('rejects an invalid delimiter before classifying a blank-only document', () => {
    expectInvalidDelimiter('||', '\ufeff\n \t \r\n')
  })

  it.each([
    { label: 'comma', delimiter: ',' },
    { label: 'semicolon', delimiter: ';' },
    { label: 'tab', delimiter: '\t' },
    { label: 'pipe', delimiter: '|' },
    { label: 'space', delimiter: ' ' },
  ])('accepts a single $label delimiter', ({ delimiter }) => {
    const text = `t${delimiter}v\n2024-01-01T08:00:00Z${delimiter}120`
    expect(parseGlucoseCSV(text, optionsWithDelimiter(delimiter))).toEqual([
      { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00.000Z' },
    ])
  })

  it.each([
    { label: 'empty', text: '' },
    { label: 'BOM-only', text: '\ufeff' },
    { label: 'blank-only', text: '\n \t \r\n\n' },
  ])('returns an empty array for a $label document', ({ text }) => {
    expect(parseGlucoseCSV(text, BASE_OPTIONS)).toEqual([])
  })

  it('strips a leading BOM for header matching and supports CRLF', () => {
    expect(
      parseGlucoseCSV(
        '\ufefft,v\r\n2024-01-01T08:00:00Z,120\r\n',
        BASE_OPTIONS,
      ),
    ).toEqual([
      { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00.000Z' },
    ])
  })

  it('ignores whitespace-only physical lines before and among CSV rows', () => {
    const text = ` \t \r\n\r\nt,v\n   \n2024-01-01T08:00:00Z,120\n\t\n`
    expect(parseGlucoseCSV(text, BASE_OPTIONS)).toEqual([
      { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00.000Z' },
    ])
  })

  it('validates mapped columns when a header has no data rows', () => {
    expect(parseGlucoseCSV('t,v', BASE_OPTIONS)).toEqual([])

    for (const header of ['t,other', 'other,v']) {
      let thrown: unknown
      try {
        parseGlucoseCSV(header, BASE_OPTIONS)
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(ParseError)
      expect(thrown).toMatchObject({
        name: 'ParseError',
        code: 'CSV_COLUMN_NOT_FOUND',
        message: COLUMN_NOT_FOUND_MESSAGE,
      })
    }
  })

  it('preserves quoted delimiters and doubled quotes', () => {
    const text = `"Time, local","Val""ue"\n"2024-01-01T08:00:00Z","120"`
    expect(
      parseGlucoseCSV(text, {
        timestampColumn: 'Time, local',
        valueColumn: 'Val"ue',
      }),
    ).toEqual([
      { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00.000Z' },
    ])
  })

  it('skips short rows and rows with invalid timestamps or glucose values', () => {
    const text = `t,v
2024-01-01T08:00:00Z,120
2024-01-01T08:05:00Z
,140
not-a-date,150
2024-01-01T08:10:00Z,not-a-number
2024-01-01T08:15:00Z,0
2024-01-01T08:20:00Z,-1
2024-01-01T08:25:00Z,160`
    expect(parseGlucoseCSV(text, BASE_OPTIONS).map((reading) => reading.value)).toEqual([
      120,
      160,
    ])
  })
})
