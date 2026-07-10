import { describe, it, expect, vi } from 'vitest'
import {
  computeGlucoseTrend,
  classifyGlucoseTrend,
  latestReading,
  minutesSinceLastReading,
} from '../src/live'
import { createGlucoseReadings } from './test-helpers'
import { MGDL_MMOLL_CONVERSION } from '../src/constants'
import type { GlucoseReading } from '../src/types'
import { DomainError, TimestampError } from '../src/errors'

function expectInvalidOption(call: () => unknown, message: string): void {
  let thrown: unknown
  try {
    call()
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(DomainError)
  expect(thrown).toMatchObject({ code: 'INVALID_OPTION', message })
}

describe('classifyGlucoseTrend (Dexcom-style thresholds, mg/dL per min)', () => {
  it('maps rate-of-change to the seven trend categories', () => {
    expect(classifyGlucoseTrend(0)).toBe('flat')
    expect(classifyGlucoseTrend(0.9)).toBe('flat')
    expect(classifyGlucoseTrend(1)).toBe('slightlyRising')
    expect(classifyGlucoseTrend(-1)).toBe('slightlyFalling')
    expect(classifyGlucoseTrend(2)).toBe('rising')
    expect(classifyGlucoseTrend(-2.5)).toBe('falling')
    expect(classifyGlucoseTrend(3)).toBe('rapidRising')
    expect(classifyGlucoseTrend(-4)).toBe('rapidFalling')
  })

  it.each([NaN, Infinity, -Infinity])(
    'returns unknown for a non-finite rate (%s)',
    (rate) => {
      expect(classifyGlucoseTrend(rate)).toBe('unknown')
    }
  )
})

describe('computeGlucoseTrend', () => {
  it('computes rate-of-change and classifies a fast rise', () => {
    const res = computeGlucoseTrend(createGlucoseReadings([100, 120, 140, 160], 'mg/dL', 5))
    expect(res.rocPerMin).toBeCloseTo(4, 6)
    expect(res.trend).toBe('rapidRising')
    expect(res.readingsUsed).toBe(4)
    expect(res.windowMinutes).toBe(15)
  })

  it('classifies a gentle fall as slightlyFalling', () => {
    const res = computeGlucoseTrend(createGlucoseReadings([120, 115, 110, 105], 'mg/dL', 5))
    expect(res.rocPerMin).toBeCloseTo(-1, 6)
    expect(res.trend).toBe('slightlyFalling')
  })

  it('only uses readings within the trailing window', () => {
    // 7 readings over 30 min; the last 15 min are a fast rise.
    const res = computeGlucoseTrend(
      createGlucoseReadings([50, 60, 70, 100, 120, 140, 160], 'mg/dL', 5)
    )
    expect(res.readingsUsed).toBe(4)
    expect(res.trend).toBe('rapidRising')
  })

  it('normalizes mmol/L readings before computing rate-of-change', () => {
    const base = createGlucoseReadings([100, 120, 140, 160], 'mg/dL', 5)
    const mmol: GlucoseReading[] = base.map((r) => ({
      value: r.value / MGDL_MMOLL_CONVERSION,
      unit: 'mmol/L',
      timestamp: r.timestamp,
    }))
    const res = computeGlucoseTrend(mmol)
    expect(res.rocPerMin).toBeCloseTo(4, 3)
    expect(res.trend).toBe('rapidRising')
  })

  it('honors a custom window', () => {
    const res = computeGlucoseTrend(
      createGlucoseReadings([100, 120, 140, 160], 'mg/dL', 5),
      { windowMin: 30 }
    )
    expect(res.windowMinutes).toBe(30)
    expect(res.readingsUsed).toBe(4)
  })

  it('classifies the same rounded rate that it returns', () => {
    const readings: GlucoseReading[] = [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-01T08:00:00Z',
      },
      {
        value: 114.998,
        unit: 'mg/dL',
        timestamp: '2024-01-01T08:05:00Z',
      },
    ]
    const result = computeGlucoseTrend(readings)
    expect(result.rocPerMin).toBe(3)
    expect(result.trend).toBe('rapidRising')
    expect(result.trend).toBe(classifyGlucoseTrend(result.rocPerMin))
  })

  it('returns unknown/NaN with fewer than two readings', () => {
    const res = computeGlucoseTrend(createGlucoseReadings([100]))
    expect(res.trend).toBe('unknown')
    expect(Number.isNaN(res.rocPerMin)).toBe(true)
    expect(res.readingsUsed).toBe(0)
  })

  it('returns unknown when the window holds fewer than two readings', () => {
    const res = computeGlucoseTrend(createGlucoseReadings([100, 160], 'mg/dL', 20))
    expect(res.trend).toBe('unknown')
  })

  it('returns unknown when all readings share a timestamp (no time span)', () => {
    const t = '2024-01-01T08:00:00Z'
    const res = computeGlucoseTrend([
      { value: 100, unit: 'mg/dL', timestamp: t },
      { value: 120, unit: 'mg/dL', timestamp: t },
    ])
    expect(res.trend).toBe('unknown')
  })

  it('ignores invalid values and unparseable timestamps', () => {
    const good = createGlucoseReadings([100, 120, 140, 160], 'mg/dL', 5)
    const dirty: GlucoseReading[] = [
      ...good,
      { value: NaN, unit: 'mg/dL', timestamp: good[0].timestamp },
      { value: Infinity, unit: 'mg/dL', timestamp: good[0].timestamp },
      { value: -Infinity, unit: 'mg/dL', timestamp: good[0].timestamp },
      { value: 0, unit: 'mg/dL', timestamp: good[0].timestamp },
      { value: -1, unit: 'mg/dL', timestamp: good[0].timestamp },
      { value: 601, unit: 'mg/dL', timestamp: good[0].timestamp },
      { value: 34, unit: 'mmol/L', timestamp: good[0].timestamp },
      {
        value: 120,
        unit: 'other' as GlucoseReading['unit'],
        timestamp: good[0].timestamp,
      },
      { value: 120, unit: 'mg/dL', timestamp: 'not-a-date' },
      {
        value: 120,
        unit: 'mg/dL',
        timestamp: '+275760-09-13T00:00:00.001Z',
      },
    ]
    const res = computeGlucoseTrend(dirty)
    expect(res.readingsUsed).toBe(4)
    expect(res.trend).toBe('rapidRising')
  })

  it.each([0, -1, NaN, Infinity, -Infinity])(
    'rejects an invalid trailing window (%s)',
    (windowMin) => {
      expectInvalidOption(
        () => computeGlucoseTrend([], { windowMin }),
        `windowMin must be a finite positive number: ${String(windowMin)}`
      )
    }
  )

  it.each(['15', 15n, null, {}, Symbol('window')])(
    'rejects a non-number trailing window (%s)',
    (windowMin) => {
      expectInvalidOption(
        () =>
          computeGlucoseTrend([], {
            windowMin: windowMin as unknown as number,
          }),
        `windowMin must be a finite positive number: ${String(windowMin)}`
      )
    }
  )
})

describe('latestReading', () => {
  const a: GlucoseReading = { value: 100, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' }
  const b: GlucoseReading = { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:10:00Z' }

  it('returns the most recent reading regardless of input order', () => {
    expect(latestReading([a, b])).toBe(b)
    expect(latestReading([b, a])).toBe(b)
  })

  it('preserves the existing last-input-wins behavior for equal timestamps', () => {
    const replacement: GlucoseReading = { ...a, value: 110 }
    expect(latestReading([a, replacement])).toBe(replacement)
    expect(latestReading([replacement, a])).toBe(a)
  })

  it('skips readings with unparseable timestamps', () => {
    const bad: GlucoseReading = { value: 5, unit: 'mg/dL', timestamp: 'bad' }
    expect(latestReading([a, b, bad])).toBe(b)
  })

  it('returns null for empty input', () => {
    expect(latestReading([])).toBeNull()
  })

  it('returns the newest fully usable reading when later readings are malformed', () => {
    const later = '2024-01-01T08:20:00Z'
    const malformed: GlucoseReading[] = [
      { value: NaN, unit: 'mg/dL', timestamp: later },
      { value: Infinity, unit: 'mg/dL', timestamp: later },
      { value: -Infinity, unit: 'mg/dL', timestamp: later },
      { value: 0, unit: 'mg/dL', timestamp: later },
      { value: -1, unit: 'mg/dL', timestamp: later },
      { value: 601, unit: 'mg/dL', timestamp: later },
      { value: 34, unit: 'mmol/L', timestamp: later },
      {
        value: 120,
        unit: 'other' as GlucoseReading['unit'],
        timestamp: later,
      },
      { value: 120, unit: 'mg/dL', timestamp: 'bad' },
      {
        value: 120,
        unit: 'mg/dL',
        timestamp: 1700000000000 as unknown as string,
      },
    ]

    expect(latestReading([a, ...malformed])).toBe(a)
  })

  it('returns null when every reading is unusable', () => {
    expect(
      latestReading([
        { value: NaN, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
        { value: 120, unit: 'mg/dL', timestamp: 'bad' },
      ])
    ).toBeNull()
  })
})

describe('minutesSinceLastReading', () => {
  const readings: GlucoseReading[] = [
    { value: 100, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
  ]

  it('measures staleness against an explicit now', () => {
    expect(minutesSinceLastReading(readings, '2024-01-01T08:07:00Z')).toBe(7)
  })

  it('returns a negative age when the latest reading is ahead of now', () => {
    expect(minutesSinceLastReading(readings, '2024-01-01T07:57:00Z')).toBe(-3)
  })

  it('defaults to the current time', () => {
    expect(minutesSinceLastReading(readings)).toBeGreaterThan(0)
  })

  it('returns null when there are no readings', () => {
    expect(minutesSinceLastReading([], '2024-01-01T08:07:00Z')).toBeNull()
  })

  it('measures from the newest fully usable reading', () => {
    const invalidNewer: GlucoseReading = {
      value: Infinity,
      unit: 'mg/dL',
      timestamp: '2024-01-01T08:05:00Z',
    }
    expect(
      minutesSinceLastReading(
        [...readings, invalidNewer],
        '2024-01-01T08:07:00Z'
      )
    ).toBe(7)
  })

  it.each([
    'bad',
    '+275760-09-13T00:00:00.001Z',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    new Date(Number.NaN),
    null,
    {},
    1700000000000n,
    Symbol('now'),
  ])('throws a timestamp error for invalid explicit now (%s)', (now) => {
    let thrown: unknown
    try {
      minutesSinceLastReading(
        readings,
        now as unknown as string | number | Date
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(TimestampError)
    expect(thrown).toMatchObject({
      code: 'TIMESTAMP_UNPARSEABLE',
      message: `Unable to parse reference time: ${String(now)}`,
    })
  })

  it('validates an explicit now even when no usable readings exist', () => {
    expect(() => minutesSinceLastReading([], 'bad')).toThrow(TimestampError)
  })

  it('wraps a native reference-time parser failure', () => {
    const dateParseSpy = vi.spyOn(Date, 'parse').mockImplementation(() => {
      throw new TypeError('parser failed')
    })
    let thrown: unknown

    try {
      minutesSinceLastReading(readings, '2024-01-01T08:07:00Z')
    } catch (error) {
      thrown = error
    } finally {
      dateParseSpy.mockRestore()
    }

    expect(thrown).toBeInstanceOf(TimestampError)
    expect(thrown).toMatchObject({
      code: 'TIMESTAMP_UNPARSEABLE',
      message: 'Unable to parse reference time: 2024-01-01T08:07:00Z',
    })
  })
})
