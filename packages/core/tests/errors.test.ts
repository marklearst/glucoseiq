import { describe, it, expect } from 'vitest'
import {
  GlucoseIQError,
  ParseError,
  DomainError,
  EmptyDatasetError,
  TimestampError,
  type GlucoseIQErrorCode,
} from '../src/errors'
import { a1cDelta } from '../src/a1c'
import { calculateHOMAIR, checkGlycemicAlignment } from '../src/alignment'
import {
  convertGlucoseUnit,
  estimateEAG,
  estimateGMI,
  mgDlToMmolL,
  mmolLToMgDl,
} from '../src/conversions'
import { formatDate } from '../src/formatters'
import { normalizeNightscoutEntry } from '../src/connectors/nightscout'
import { calculateEnhancedTIR, calculatePregnancyTIR } from '../src/tir-enhanced'
import { buildAGPProfile } from '../src/metrics/agp-profile'
import { calculateAGPMetrics } from '../src/metrics/agp'
import { calculateGRI } from '../src/metrics/gri'
import { parseGlucoseCSV } from '../src/csv'
import { parseGlucoseString } from '../src/glucose'
import { parseDexcomDate } from '../src/connectors/dexcom'
import { normalizeLibreEntry } from '../src/connectors/libre'

function expectCodedError(
  call: () => unknown,
  expected: {
    type: new (...args: never[]) => GlucoseIQError
    code: GlucoseIQErrorCode
    message: string
  }
): void {
  try {
    call()
    throw new Error('Expected call to throw')
  } catch (error) {
    expect(error).toBeInstanceOf(expected.type)
    expect(error).toMatchObject({
      code: expected.code,
      message: expected.message,
    })
  }
}

describe('error hierarchy', () => {
  const cases = [
    {
      expectedName: 'GlucoseIQError',
      expectedCode: 'INVALID_OPTION',
      expectedMessage: 'base failure',
      type: GlucoseIQError,
      create: () => new GlucoseIQError('base failure', 'INVALID_OPTION'),
    },
    {
      expectedName: 'ParseError',
      expectedCode: 'PARSE_FAILED',
      expectedMessage: 'parse failure',
      type: ParseError,
      create: () => new ParseError('parse failure', 'PARSE_FAILED'),
    },
    {
      expectedName: 'DomainError',
      expectedCode: 'INVALID_GLUCOSE_VALUE',
      expectedMessage: 'domain failure',
      type: DomainError,
      create: () =>
        new DomainError('domain failure', 'INVALID_GLUCOSE_VALUE'),
    },
    {
      expectedName: 'EmptyDatasetError',
      expectedCode: 'EMPTY_DATASET',
      expectedMessage: 'empty failure',
      type: EmptyDatasetError,
      create: () => new EmptyDatasetError('empty failure'),
    },
    {
      expectedName: 'TimestampError',
      expectedCode: 'TIMESTAMP_UNPARSEABLE',
      expectedMessage: 'timestamp failure',
      type: TimestampError,
      create: () => new TimestampError('timestamp failure'),
    },
  ] as const

  for (const errorCase of cases) {
    it(`${errorCase.expectedName} preserves its public identity and constructor contract`, () => {
      const error = errorCase.create()

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(GlucoseIQError)
      expect(error).toBeInstanceOf(errorCase.type)
      expect(error).toMatchObject({
        name: errorCase.expectedName,
        code: errorCase.expectedCode,
        message: errorCase.expectedMessage,
      })
    })
  }
})

describe('typed throws across the library', () => {
  const codedErrorCases: Array<{
    name: string
    call: () => unknown
    expected: {
      type: new (...args: never[]) => GlucoseIQError
      code: GlucoseIQErrorCode
      message: string
    }
  }> = [
    {
      name: 'a1cDelta rejects invalid A1C values',
      call: () => a1cDelta(-1, 6),
      expected: {
        type: DomainError,
        code: 'INVALID_A1C_VALUE',
        message: 'Invalid A1C value',
      },
    },
    {
      name: 'estimateEAG rejects invalid A1C values',
      call: () => estimateEAG(-1),
      expected: {
        type: DomainError,
        code: 'INVALID_A1C_VALUE',
        message: 'A1C must be positive',
      },
    },
    {
      name: 'calculateHOMAIR rejects invalid glucose values',
      call: () => calculateHOMAIR(-1, 5),
      expected: {
        type: DomainError,
        code: 'INVALID_GLUCOSE_VALUE',
        message:
          'Invalid fasting glucose value (must be a positive number in mg/dL)',
      },
    },
    {
      name: 'calculateHOMAIR rejects invalid insulin values',
      call: () => calculateHOMAIR(100, -1),
      expected: {
        type: DomainError,
        code: 'INVALID_INSULIN_VALUE',
        message:
          'Invalid fasting insulin value (must be a positive number in µIU/mL)',
      },
    },
    {
      name: 'checkGlycemicAlignment rejects invalid A1C values',
      call: () => checkGlycemicAlignment(-1, 100, 5),
      expected: {
        type: DomainError,
        code: 'INVALID_A1C_VALUE',
        message: 'Invalid A1C value (must be a positive number < 20%)',
      },
    },
    {
      name: 'checkGlycemicAlignment rejects invalid glucose values',
      call: () => checkGlycemicAlignment(6, -1, 5),
      expected: {
        type: DomainError,
        code: 'INVALID_GLUCOSE_VALUE',
        message:
          'Invalid fasting glucose value (must be a positive number in mg/dL)',
      },
    },
    {
      name: 'checkGlycemicAlignment rejects invalid insulin values',
      call: () => checkGlycemicAlignment(6, 100, -1),
      expected: {
        type: DomainError,
        code: 'INVALID_INSULIN_VALUE',
        message:
          'Invalid fasting insulin value (must be a positive number in µIU/mL)',
      },
    },
    {
      name: 'estimateGMI requires a unit for numeric input',
      call: () => estimateGMI(100),
      expected: {
        type: DomainError,
        code: 'INVALID_UNIT',
        message: 'Unit is required when input is a number.',
      },
    },
    {
      name: 'estimateGMI rejects unsupported units',
      call: () => estimateGMI(100, 'other' as never),
      expected: {
        type: DomainError,
        code: 'INVALID_UNIT',
        message: 'Unsupported glucose unit: other',
      },
    },
    {
      name: 'estimateGMI rejects invalid glucose values',
      call: () => estimateGMI(0, 'mg/dL'),
      expected: {
        type: DomainError,
        code: 'INVALID_GLUCOSE_VALUE',
        message: 'Glucose value must be a positive number.',
      },
    },
    {
      name: 'mgDlToMmolL rejects invalid glucose values',
      call: () => mgDlToMmolL(0),
      expected: {
        type: DomainError,
        code: 'INVALID_GLUCOSE_VALUE',
        message: 'Invalid glucose value',
      },
    },
    {
      name: 'mmolLToMgDl rejects invalid glucose values',
      call: () => mmolLToMgDl(0),
      expected: {
        type: DomainError,
        code: 'INVALID_GLUCOSE_VALUE',
        message: 'Invalid glucose value',
      },
    },
    {
      name: 'convertGlucoseUnit rejects invalid glucose values',
      call: () => convertGlucoseUnit({ value: 0, unit: 'mg/dL' }),
      expected: {
        type: DomainError,
        code: 'INVALID_GLUCOSE_VALUE',
        message: 'Invalid glucose value',
      },
    },
    {
      name: 'convertGlucoseUnit rejects unsupported units',
      call: () =>
        convertGlucoseUnit({ value: 100, unit: 'other' as never }),
      expected: {
        type: DomainError,
        code: 'INVALID_UNIT',
        message: 'Invalid unit',
      },
    },
    {
      name: 'formatDate rejects unparseable timestamps',
      call: () => formatDate('bad'),
      expected: {
        type: TimestampError,
        code: 'TIMESTAMP_UNPARSEABLE',
        message: 'Invalid ISO timestamp',
      },
    },
    {
      name: 'formatDate rejects invalid timezones',
      call: () => formatDate('2024-01-01T00:00:00Z', 'Mars/Phobos'),
      expected: {
        type: DomainError,
        code: 'INVALID_TIMEZONE',
        message: 'Invalid time zone specified: Mars/Phobos',
      },
    },
    {
      name: 'parseDexcomDate reports out-of-range vendor epochs',
      call: () => parseDexcomDate('Date(8640000000000001)'),
      expected: {
        type: TimestampError,
        code: 'TIMESTAMP_UNPARSEABLE',
        message:
          'Unable to parse Dexcom date: Date(8640000000000001)',
      },
    },
    {
      name: 'parseDexcomDate reports out-of-range ISO timestamps',
      call: () => parseDexcomDate('+275760-09-13T00:00:00.001Z'),
      expected: {
        type: TimestampError,
        code: 'TIMESTAMP_UNPARSEABLE',
        message:
          'Unable to parse Dexcom date: +275760-09-13T00:00:00.001Z',
      },
    },
    {
      name: 'normalizeNightscoutEntry reports invalid dateString fields',
      call: () =>
        normalizeNightscoutEntry({
          sgv: 100,
          date: Number.NaN,
          dateString: 'bad',
        }),
      expected: {
        type: TimestampError,
        code: 'TIMESTAMP_UNPARSEABLE',
        message: "Unable to parse Nightscout timestamp from 'dateString': bad",
      },
    },
    {
      name: 'normalizeNightscoutEntry reports invalid date fields',
      call: () => normalizeNightscoutEntry({ sgv: 100, date: Number.NaN }),
      expected: {
        type: TimestampError,
        code: 'TIMESTAMP_UNPARSEABLE',
        message: "Unable to parse Nightscout timestamp from 'date' field: NaN",
      },
    },
  ]

  it.each(codedErrorCases)('$name', ({ call, expected }) => {
    expectCodedError(call, expected)
  })

  it('empty datasets throw EmptyDatasetError (messages preserved)', () => {
    expect(() => calculateEnhancedTIR([])).toThrow(EmptyDatasetError)
    expect(() => calculateEnhancedTIR([])).toThrow(
      'Cannot calculate Enhanced TIR: readings array is empty'
    )
    expect(() => calculatePregnancyTIR([])).toThrow(EmptyDatasetError)
    expect(() => calculateAGPMetrics([])).toThrow(EmptyDatasetError)
  })

  it('invalid values and options throw DomainError', () => {
    expect(() =>
      calculateEnhancedTIR([{ value: 900, unit: 'mg/dL', timestamp: '2024-01-01T00:00:00Z' }])
    ).toThrow(DomainError)
    expect(() => buildAGPProfile([], { binMinutes: 0 })).toThrow(DomainError)
    expect(() => buildAGPProfile([], { timeZone: 'Mars/Phobos' })).toThrow(DomainError)
    expect(() =>
      calculateGRI({ veryLowPercent: -1, lowPercent: 0, highPercent: 0, veryHighPercent: 0 })
    ).toThrow(DomainError)
  })

  it('parse failures throw ParseError', () => {
    expect(() => parseGlucoseCSV('a,b\n1,2', { timestampColumn: 'x', valueColumn: 'b' })).toThrow(
      ParseError
    )
    expect(() => parseGlucoseString('garbage')).toThrow(ParseError)
  })

  it('vendor timestamp failures throw TimestampError', () => {
    expect(() => parseDexcomDate('garbage')).toThrow(TimestampError)
    expect(() =>
      normalizeLibreEntry({ Value: 100, TrendArrow: 3, Timestamp: 'garbage' })
    ).toThrow(TimestampError)
  })
})
