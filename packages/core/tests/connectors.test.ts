import { describe, it, expect, vi } from 'vitest'
import {
  // Dexcom
  parseDexcomDate,
  normalizeDexcomTrend,
  normalizeDexcomEntry,
  normalizeDexcomEntries,
  // Libre
  normalizeLibreTrend,
  normalizeLibreEntry,
  normalizeLibreEntries,
  // Nightscout
  normalizeNightscoutDirection,
  normalizeNightscoutEntry,
  normalizeNightscoutEntries,
} from '../src/connectors'
import { DomainError, TimestampError } from '../src/errors'
import { MGDL_MMOLL_CONVERSION } from '../src/constants'
import type {
  DexcomShareEntry,
  LibreLinkUpEntry,
  NightscoutEntry,
} from '../src/connectors'

function expectCodedError(
  call: () => unknown,
  type: typeof DomainError | typeof TimestampError,
  code: 'INVALID_GLUCOSE_VALUE' | 'INVALID_UNIT' | 'TIMESTAMP_UNPARSEABLE',
  message: string
): void {
  let thrown: unknown
  try {
    call()
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(type)
  expect(thrown).toMatchObject({ code, message })
}

// ---------------------------------------------------------------------------
// Dexcom Share adapter
// ---------------------------------------------------------------------------
describe('Dexcom Share adapter', () => {
  describe('parseDexcomDate', () => {
    it('parses Date(epochMs) format', () => {
      const iso = parseDexcomDate('Date(1700000000000)')
      expect(iso).toBe(new Date(1700000000000).toISOString())
    })

    it('parses /Date(epochMs)/ format', () => {
      const iso = parseDexcomDate('/Date(1700000000000)/')
      expect(iso).toBe(new Date(1700000000000).toISOString())
    })

    it('parses plain ISO 8601 strings', () => {
      const iso = parseDexcomDate('2024-01-15T10:30:00Z')
      expect(iso).toBe('2024-01-15T10:30:00.000Z')
    })

    it('throws on unparseable date', () => {
      expect(() => parseDexcomDate('not-a-date')).toThrow(
        'Unable to parse Dexcom date'
      )
    })

    it('throws a timestamp error when the parsed date is invalid', () => {
      const raw = '2024-01-15T10:30:00Z'
      const dateParseSpy = vi
        .spyOn(Date, 'parse')
        .mockReturnValue(Number.MAX_SAFE_INTEGER)
      let thrown: unknown

      try {
        parseDexcomDate(raw)
      } catch (error) {
        thrown = error
      } finally {
        dateParseSpy.mockRestore()
      }

      expect(thrown).toBeInstanceOf(TimestampError)
      expect(thrown).toMatchObject({
        code: 'TIMESTAMP_UNPARSEABLE',
        message: `Unable to parse Dexcom date: ${raw}`,
      })
    })

    it('wraps a native timestamp parser failure', () => {
      const raw = '2024-01-15T10:30:00Z'
      const dateParseSpy = vi.spyOn(Date, 'parse').mockImplementation(() => {
        throw new TypeError('parser failed')
      })
      let thrown: unknown

      try {
        parseDexcomDate(raw)
      } catch (error) {
        thrown = error
      } finally {
        dateParseSpy.mockRestore()
      }

      expect(thrown).toBeInstanceOf(TimestampError)
      expect(thrown).toMatchObject({
        code: 'TIMESTAMP_UNPARSEABLE',
        message: `Unable to parse Dexcom date: ${raw}`,
      })
    })

    it.each([
      1700000000000,
      new Date('2024-01-15T10:30:00Z'),
      1700000000000n,
      Symbol('timestamp'),
    ])('rejects a non-string timestamp without leaking a native error (%s)', (raw) => {
      expectCodedError(
        () => parseDexcomDate(raw as unknown as string),
        TimestampError,
        'TIMESTAMP_UNPARSEABLE',
        `Unable to parse Dexcom date: ${String(raw)}`
      )
    })

    it.each([
      'prefixDate(1700000000000)',
      'Date(1700000000000)suffix',
      '/Date(1700000000000)/suffix',
    ])('rejects a partial Dexcom Date wrapper (%s)', (raw) => {
      expectCodedError(
        () => parseDexcomDate(raw),
        TimestampError,
        'TIMESTAMP_UNPARSEABLE',
        `Unable to parse Dexcom date: ${raw}`
      )
    })
  })

  describe('normalizeDexcomTrend', () => {
    it('maps all known Dexcom trends', () => {
      expect(normalizeDexcomTrend('DoubleUp')).toBe('rapidRising')
      expect(normalizeDexcomTrend('SingleUp')).toBe('rising')
      expect(normalizeDexcomTrend('FortyFiveUp')).toBe('slightlyRising')
      expect(normalizeDexcomTrend('Flat')).toBe('flat')
      expect(normalizeDexcomTrend('FortyFiveDown')).toBe('slightlyFalling')
      expect(normalizeDexcomTrend('SingleDown')).toBe('falling')
      expect(normalizeDexcomTrend('DoubleDown')).toBe('rapidFalling')
      expect(normalizeDexcomTrend('None')).toBe('unknown')
      expect(normalizeDexcomTrend('NotComputable')).toBe('unknown')
      expect(normalizeDexcomTrend('RateOutOfRange')).toBe('unknown')
    })

    it('returns unknown for unrecognized trend string', () => {
      expect(
        normalizeDexcomTrend('SomethingNew' as any)
      ).toBe('unknown')
    })

    it('returns unknown for null or undefined trend', () => {
      expect(normalizeDexcomTrend(null as any)).toBe('unknown')
      expect(normalizeDexcomTrend(undefined as any)).toBe('unknown')
    })
  })

  describe('normalizeDexcomEntry', () => {
    it('converts a Dexcom entry to NormalizedCGMReading', () => {
      const entry: DexcomShareEntry = {
        Value: 120,
        Trend: 'Flat',
        WT: 'Date(1700000000000)',
        ST: 'abc123',
      }
      const result = normalizeDexcomEntry(entry)
      expect(result.value).toBe(120)
      expect(result.unit).toBe('mg/dL')
      expect(result.trend).toBe('flat')
      expect(result.source).toBe('dexcom')
      expect(result.vendorId).toBe('abc123')
      expect(result.timestamp).toBe(new Date(1700000000000).toISOString())
    })

    it('falls back to DT when ST is not provided', () => {
      const entry: DexcomShareEntry = {
        Value: 95,
        Trend: 'SingleUp',
        WT: '2024-01-15T10:00:00Z',
        DT: 'dt-id',
      }
      const result = normalizeDexcomEntry(entry)
      expect(result.vendorId).toBe('dt-id')
    })

    it('sets vendorId to undefined when both ST and DT are absent', () => {
      const entry: DexcomShareEntry = {
        Value: 95,
        Trend: 'SingleUp',
        WT: '2024-01-15T10:00:00Z',
      }
      const result = normalizeDexcomEntry(entry)
      expect(result.vendorId).toBeUndefined()
    })

    it('accepts the inclusive 600 mg/dL boundary', () => {
      expect(
        normalizeDexcomEntry({
          Value: 600,
          Trend: 'Flat',
          WT: 'Date(1700000000000)',
        }).value
      ).toBe(600)
    })

    it.each([NaN, Infinity, -Infinity, 0, -1, 601])(
      'rejects an unusable glucose value (%s)',
      (value) => {
        expectCodedError(
          () =>
            normalizeDexcomEntry({
              Value: value,
              Trend: 'Flat',
              WT: 'Date(1700000000000)',
            }),
          DomainError,
          'INVALID_GLUCOSE_VALUE',
          `Dexcom entry has invalid glucose value: ${String(value)}`
        )
      }
    )

    it.each(['120', 120n, Symbol('value')])(
      'rejects a non-number glucose value without leaking a native error (%s)',
      (value) => {
        expectCodedError(
          () =>
            normalizeDexcomEntry({
              Value: value as unknown as number,
              Trend: 'Flat',
              WT: 'Date(1700000000000)',
            }),
          DomainError,
          'INVALID_GLUCOSE_VALUE',
          `Dexcom entry has invalid glucose value: ${String(value)}`
        )
      }
    )

    it('rejects an out-of-range vendor timestamp', () => {
      const timestamp = 'Date(8640000000000001)'
      expectCodedError(
        () =>
          normalizeDexcomEntry({ Value: 120, Trend: 'Flat', WT: timestamp }),
        TimestampError,
        'TIMESTAMP_UNPARSEABLE',
        `Unable to parse Dexcom date: ${timestamp}`
      )
    })
  })

  describe('normalizeDexcomEntries', () => {
    it('normalizes and sorts entries chronologically', () => {
      const entries: DexcomShareEntry[] = [
        { Value: 150, Trend: 'Flat', WT: 'Date(1700000010000)' },
        { Value: 120, Trend: 'SingleDown', WT: 'Date(1700000000000)' },
        { Value: 180, Trend: 'SingleUp', WT: 'Date(1700000020000)' },
      ]
      const result = normalizeDexcomEntries(entries)
      expect(result).toHaveLength(3)
      expect(result[0].value).toBe(120)
      expect(result[1].value).toBe(150)
      expect(result[2].value).toBe(180)
    })

    it('returns empty array for empty input', () => {
      expect(normalizeDexcomEntries([])).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// Libre LinkUp adapter
// ---------------------------------------------------------------------------
describe('Libre LinkUp adapter', () => {
  describe('normalizeLibreTrend', () => {
    it('maps all known Libre trend values', () => {
      expect(normalizeLibreTrend(1)).toBe('rapidFalling')
      expect(normalizeLibreTrend(2)).toBe('falling')
      expect(normalizeLibreTrend(3)).toBe('flat')
      expect(normalizeLibreTrend(4)).toBe('rising')
      expect(normalizeLibreTrend(5)).toBe('rapidRising')
    })

    it('returns unknown for unrecognized numeric trend', () => {
      expect(normalizeLibreTrend(99 as any)).toBe('unknown')
    })

    it('returns unknown for in-range non-integer trend values', () => {
      expect(normalizeLibreTrend(4.5 as any)).toBe('unknown')
    })

    it('returns unknown for null or undefined trend', () => {
      expect(normalizeLibreTrend(null)).toBe('unknown')
      expect(normalizeLibreTrend(undefined)).toBe('unknown')
    })
  })

  describe('normalizeLibreEntry', () => {
    it('converts a Libre entry to NormalizedCGMReading', () => {
      const entry: LibreLinkUpEntry = {
        Value: 110,
        TrendArrow: 3,
        Timestamp: '2024-06-15T08:30:00Z',
      }
      const result = normalizeLibreEntry(entry)
      expect(result.value).toBe(110)
      expect(result.unit).toBe('mg/dL')
      expect(result.trend).toBe('flat')
      expect(result.source).toBe('libre')
      expect(result.timestamp).toBe('2024-06-15T08:30:00.000Z')
    })

    it('throws on unparseable timestamp', () => {
      const entry: LibreLinkUpEntry = {
        Value: 110,
        TrendArrow: 3,
        Timestamp: 'bad-timestamp',
      }
      expect(() => normalizeLibreEntry(entry)).toThrow(
        'Unable to parse Libre timestamp'
      )
    })

    it('throws a timestamp error when Date.parse returns an out-of-range epoch', () => {
      const timestamp = '2024-06-15T08:30:00Z'
      const dateParseSpy = vi
        .spyOn(Date, 'parse')
        .mockReturnValue(Number.MAX_SAFE_INTEGER)
      let thrown: unknown

      try {
        normalizeLibreEntry({ Value: 120, TrendArrow: 3, Timestamp: timestamp })
      } catch (error) {
        thrown = error
      } finally {
        dateParseSpy.mockRestore()
      }

      expect(thrown).toBeInstanceOf(TimestampError)
      expect(thrown).toMatchObject({
        code: 'TIMESTAMP_UNPARSEABLE',
        message: `Unable to parse Libre timestamp: ${timestamp}`,
      })
    })

    it('wraps a native timestamp parser failure', () => {
      const timestamp = '2024-06-15T08:30:00Z'
      const dateParseSpy = vi.spyOn(Date, 'parse').mockImplementation(() => {
        throw new TypeError('parser failed')
      })
      let thrown: unknown

      try {
        normalizeLibreEntry({ Value: 120, TrendArrow: 3, Timestamp: timestamp })
      } catch (error) {
        thrown = error
      } finally {
        dateParseSpy.mockRestore()
      }

      expect(thrown).toBeInstanceOf(TimestampError)
      expect(thrown).toMatchObject({
        code: 'TIMESTAMP_UNPARSEABLE',
        message: `Unable to parse Libre timestamp: ${timestamp}`,
      })
    })

    it.each([
      1700000000000,
      new Date('2024-06-15T08:30:00Z'),
      1700000000000n,
      Symbol('timestamp'),
    ])('rejects a non-string timestamp without leaking a native error (%s)', (timestamp) => {
      expectCodedError(
        () =>
          normalizeLibreEntry({
            Value: 120,
            TrendArrow: 3,
            Timestamp: timestamp as unknown as string,
          }),
        TimestampError,
        'TIMESTAMP_UNPARSEABLE',
        `Unable to parse Libre timestamp: ${String(timestamp)}`
      )
    })

    it.each([
      { value: 600, unit: 1 as const },
      { value: 600 / MGDL_MMOLL_CONVERSION, unit: 0 as const },
    ])(
      'accepts the inclusive 600 mg/dL boundary in native unit $unit',
      ({ value, unit }) => {
        expect(
          normalizeLibreEntry({
            Value: value,
            GlucoseUnits: unit,
            TrendArrow: 3,
            Timestamp: '2024-06-15T08:30:00Z',
          }).value
        ).toBe(value)
      }
    )

    it.each([NaN, Infinity, -Infinity, 0, -1, 601])(
      'rejects an unusable mg/dL value (%s)',
      (value) => {
        expectCodedError(
          () =>
            normalizeLibreEntry({
              Value: value,
              GlucoseUnits: 1,
              TrendArrow: 3,
              Timestamp: '2024-06-15T08:30:00Z',
            }),
          DomainError,
          'INVALID_GLUCOSE_VALUE',
          `Libre entry has invalid glucose value: ${String(value)}`
        )
      }
    )

    it.each(['120', 120n, Symbol('value')])(
      'rejects a non-number glucose value without leaking a native error (%s)',
      (value) => {
        expectCodedError(
          () =>
            normalizeLibreEntry({
              Value: value as unknown as number,
              TrendArrow: 3,
              Timestamp: '2024-06-15T08:30:00Z',
            }),
          DomainError,
          'INVALID_GLUCOSE_VALUE',
          `Libre entry has invalid glucose value: ${String(value)}`
        )
      }
    )

    it('rejects a mmol/L value that normalizes above 600 mg/dL', () => {
      expectCodedError(
        () =>
          normalizeLibreEntry({
            Value: 34,
            GlucoseUnits: 0,
            TrendArrow: 3,
            Timestamp: '2024-06-15T08:30:00Z',
          }),
        DomainError,
        'INVALID_GLUCOSE_VALUE',
        'Libre entry has invalid glucose value: 34'
      )
    })

    it('rejects an invalid runtime unit flag', () => {
      expectCodedError(
        () =>
          normalizeLibreEntry({
            Value: 120,
            GlucoseUnits: 2 as 0,
            TrendArrow: 3,
            Timestamp: '2024-06-15T08:30:00Z',
          }),
        DomainError,
        'INVALID_UNIT',
        'Libre entry has unsupported glucose unit: 2'
      )
    })

    it('rejects an invalid runtime unit flag when an explicit mg/dL value exists', () => {
      expectCodedError(
        () =>
          normalizeLibreEntry({
            Value: 6.7,
            ValueInMgPerDl: 121,
            GlucoseUnits: 2 as 0,
            TrendArrow: 3,
            Timestamp: '2024-06-15T08:30:00Z',
          }),
        DomainError,
        'INVALID_UNIT',
        'Libre entry has unsupported glucose unit: 2'
      )
    })

    it.each([null, '0', NaN, {}, Symbol('unit')])(
      'rejects malformed runtime unit flags even with explicit mg/dL (%s)',
      (unit) => {
        expectCodedError(
          () =>
            normalizeLibreEntry({
              Value: 6.7,
              ValueInMgPerDl: 121,
              GlucoseUnits: unit as unknown as 0,
              TrendArrow: 3,
              Timestamp: '2024-06-15T08:30:00Z',
            }),
          DomainError,
          'INVALID_UNIT',
          `Libre entry has unsupported glucose unit: ${String(unit)}`
        )
      }
    )

    it('rejects an unusable explicit mg/dL value', () => {
      expectCodedError(
        () =>
          normalizeLibreEntry({
            Value: 6.7,
            ValueInMgPerDl: 601,
            GlucoseUnits: 0,
            TrendArrow: 3,
            Timestamp: '2024-06-15T08:30:00Z',
          }),
        DomainError,
        'INVALID_GLUCOSE_VALUE',
        'Libre entry has invalid glucose value: 601'
      )
    })

    it('rejects an out-of-range timestamp', () => {
      const timestamp = '+275760-09-13T00:00:00.001Z'
      expectCodedError(
        () =>
          normalizeLibreEntry({ Value: 120, TrendArrow: 3, Timestamp: timestamp }),
        TimestampError,
        'TIMESTAMP_UNPARSEABLE',
        `Unable to parse Libre timestamp: ${timestamp}`
      )
    })
  })

  describe('normalizeLibreEntries', () => {
    it('normalizes and sorts entries chronologically', () => {
      const entries: LibreLinkUpEntry[] = [
        { Value: 130, TrendArrow: 4, Timestamp: '2024-06-15T08:35:00Z' },
        { Value: 110, TrendArrow: 3, Timestamp: '2024-06-15T08:30:00Z' },
        { Value: 150, TrendArrow: 5, Timestamp: '2024-06-15T08:40:00Z' },
      ]
      const result = normalizeLibreEntries(entries)
      expect(result).toHaveLength(3)
      expect(result[0].value).toBe(110)
      expect(result[1].value).toBe(130)
      expect(result[2].value).toBe(150)
    })

    it('returns empty array for empty input', () => {
      expect(normalizeLibreEntries([])).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// Nightscout adapter
// ---------------------------------------------------------------------------
describe('Nightscout adapter', () => {
  describe('normalizeNightscoutDirection', () => {
    it('maps all known Nightscout directions', () => {
      expect(normalizeNightscoutDirection('DoubleUp')).toBe('rapidRising')
      expect(normalizeNightscoutDirection('SingleUp')).toBe('rising')
      expect(normalizeNightscoutDirection('FortyFiveUp')).toBe('slightlyRising')
      expect(normalizeNightscoutDirection('Flat')).toBe('flat')
      expect(normalizeNightscoutDirection('FortyFiveDown')).toBe(
        'slightlyFalling'
      )
      expect(normalizeNightscoutDirection('SingleDown')).toBe('falling')
      expect(normalizeNightscoutDirection('DoubleDown')).toBe('rapidFalling')
      expect(normalizeNightscoutDirection('NONE')).toBe('unknown')
      expect(normalizeNightscoutDirection('NOT COMPUTABLE')).toBe('unknown')
      expect(normalizeNightscoutDirection('RATE OUT OF RANGE')).toBe('unknown')
    })

    it('returns unknown for undefined direction', () => {
      expect(normalizeNightscoutDirection(undefined)).toBe('unknown')
    })

    it('returns unknown for unrecognized string', () => {
      expect(normalizeNightscoutDirection('SomeNewTrend')).toBe('unknown')
    })
  })

  describe('normalizeNightscoutEntry', () => {
    it('converts a Nightscout entry to NormalizedCGMReading', () => {
      const entry: NightscoutEntry = {
        sgv: 135,
        date: 1700000000000,
        dateString: '2023-11-14T22:13:20.000Z',
        direction: 'Flat',
        _id: 'ns-abc123',
      }
      const result = normalizeNightscoutEntry(entry)
      expect(result.value).toBe(135)
      expect(result.unit).toBe('mg/dL')
      expect(result.trend).toBe('flat')
      expect(result.source).toBe('nightscout')
      expect(result.vendorId).toBe('ns-abc123')
      expect(result.timestamp).toBe('2023-11-14T22:13:20.000Z')
    })

    it('falls back to epoch date when dateString is missing', () => {
      const entry: NightscoutEntry = {
        sgv: 100,
        date: 1700000000000,
        dateString: '',
        direction: 'SingleUp',
      }
      const result = normalizeNightscoutEntry(entry)
      expect(result.timestamp).toBe(new Date(1700000000000).toISOString())
    })

    it('falls back to date when dateString is invalid but date is valid', () => {
      const entry: NightscoutEntry = {
        sgv: 110,
        date: 1700000000000,
        dateString: 'not-a-valid-iso',
        direction: 'Flat',
      }
      const result = normalizeNightscoutEntry(entry)
      expect(result.timestamp).toBe(new Date(1700000000000).toISOString())
    })

    it('falls back to date when the native dateString parser throws', () => {
      const dateParseSpy = vi.spyOn(Date, 'parse').mockImplementation(() => {
        throw new TypeError('parser failed')
      })
      let result: ReturnType<typeof normalizeNightscoutEntry> | undefined

      try {
        result = normalizeNightscoutEntry({
          sgv: 110,
          date: 1700000000000,
          dateString: '2023-11-14T22:13:20.000Z',
          direction: 'Flat',
        })
      } finally {
        dateParseSpy.mockRestore()
      }

      expect(result?.timestamp).toBe(new Date(1700000000000).toISOString())
    })

    it('throws when dateString is invalid and date fallback is invalid', () => {
      const entry: NightscoutEntry = {
        sgv: 110,
        date: 'also-bad' as any,
        dateString: 'not-a-valid-iso',
        direction: 'Flat',
      }
      expect(() => normalizeNightscoutEntry(entry)).toThrow(
        "Unable to parse Nightscout timestamp from 'dateString'"
      )
    })

    it('throws when dateString is missing and date is invalid', () => {
      const entry: NightscoutEntry = {
        sgv: 110,
        date: 'bad-date' as any,
        dateString: '',
        direction: 'Flat',
      }
      expect(() => normalizeNightscoutEntry(entry)).toThrow(
        "Unable to parse Nightscout timestamp from 'date' field"
      )
    })

    it('accepts the inclusive 600 mg/dL boundary', () => {
      expect(
        normalizeNightscoutEntry({ sgv: 600, date: 1700000000000 }).value
      ).toBe(600)
    })

    it.each([NaN, Infinity, -Infinity, 0, -1, 601])(
      'rejects an unusable glucose value (%s)',
      (value) => {
        expectCodedError(
          () =>
            normalizeNightscoutEntry({
              sgv: value,
              date: 1700000000000,
            }),
          DomainError,
          'INVALID_GLUCOSE_VALUE',
          `Nightscout entry has invalid glucose value: ${String(value)}`
        )
      }
    )

    it.each(['120', 120n, Symbol('value')])(
      'rejects a non-number glucose value without leaking a native error (%s)',
      (value) => {
        expectCodedError(
          () =>
            normalizeNightscoutEntry({
              sgv: value as unknown as number,
              date: 1700000000000,
            }),
          DomainError,
          'INVALID_GLUCOSE_VALUE',
          `Nightscout entry has invalid glucose value: ${String(value)}`
        )
      }
    )

    it.each([
      new Date('2023-11-14T22:13:20.000Z'),
      1700000000000n,
      Symbol('timestamp'),
    ])(
      'rejects a non-number date field without leaking a native error (%s)',
      (date) => {
        expectCodedError(
          () =>
            normalizeNightscoutEntry({
              sgv: 120,
              date: date as unknown as number,
            }),
          TimestampError,
          'TIMESTAMP_UNPARSEABLE',
          `Unable to parse Nightscout timestamp from 'date' field: ${String(date)}`
        )
      }
    )

    it.each([null, 0, false])(
      'rejects a present falsy non-string dateString (%s)',
      (dateString) => {
        expectCodedError(
          () =>
            normalizeNightscoutEntry({
              sgv: 120,
              date: 1700000000000,
              dateString: dateString as unknown as string,
            }),
          TimestampError,
          'TIMESTAMP_UNPARSEABLE',
          `Unable to parse Nightscout timestamp from 'dateString': ${String(dateString)}`
        )
      }
    )

    it.each([
      1700000000000,
      new Date('2023-11-14T22:13:20.000Z'),
      1700000000000n,
      Symbol('timestamp'),
    ])(
      'rejects a non-string dateString without leaking a native error (%s)',
      (dateString) => {
        expectCodedError(
          () =>
            normalizeNightscoutEntry({
              sgv: 120,
              date: Number.NaN,
              dateString: dateString as unknown as string,
            }),
          TimestampError,
          'TIMESTAMP_UNPARSEABLE',
          `Unable to parse Nightscout timestamp from 'dateString': ${String(dateString)}`
        )
      }
    )

    it('rejects an out-of-range epoch timestamp', () => {
      const timestamp = 8640000000000001
      expectCodedError(
        () => normalizeNightscoutEntry({ sgv: 120, date: timestamp }),
        TimestampError,
        'TIMESTAMP_UNPARSEABLE',
        `Unable to parse Nightscout timestamp from 'date' field: ${timestamp}`
      )
    })
  })

  describe('normalizeNightscoutEntries', () => {
    it('normalizes and sorts entries chronologically', () => {
      const entries: NightscoutEntry[] = [
        {
          sgv: 160,
          date: 1700000020000,
          dateString: new Date(1700000020000).toISOString(),
        },
        {
          sgv: 120,
          date: 1700000000000,
          dateString: new Date(1700000000000).toISOString(),
        },
        {
          sgv: 140,
          date: 1700000010000,
          dateString: new Date(1700000010000).toISOString(),
        },
      ]
      const result = normalizeNightscoutEntries(entries)
      expect(result).toHaveLength(3)
      expect(result[0].value).toBe(120)
      expect(result[1].value).toBe(140)
      expect(result[2].value).toBe(160)
    })

    it('returns empty array for empty input', () => {
      expect(normalizeNightscoutEntries([])).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// Integration: normalized readings work with existing analytics
// ---------------------------------------------------------------------------
import { calculateEnhancedTIR } from '../src'

describe('Connector integration with analytics', () => {
  it('normalized readings are valid GlucoseReading objects for calculateEnhancedTIR', () => {
    const entries: DexcomShareEntry[] = Array.from({ length: 50 }, (_, i) => ({
      Value: 100 + (i % 10) * 5,
      Trend: 'Flat' as const,
      WT: `Date(${1700000000000 + i * 300000})`,
    }))
    const readings = normalizeDexcomEntries(entries)
    const result = calculateEnhancedTIR(readings)
    expect(result.inRange.percentage).toBeGreaterThan(0)
    expect(result.summary.totalReadings).toBe(50)
  })
})
