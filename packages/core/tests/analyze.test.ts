import { describe, it, expect } from 'vitest'
import { analyzeGlucose } from '../src/analyze'
import { createGlucoseReadings } from './test-helpers'
import { MGDL_MMOLL_CONVERSION } from '../src/constants'
import type { GlucoseReading } from '../src/types'

/** Dense 5-minute readings spanning `days` days (constant value). */
function makeDense(days: number): GlucoseReading[] {
  const out: GlucoseReading[] = []
  const start = Date.UTC(2024, 0, 1, 0, 0, 0)
  const count = days * 288
  for (let i = 0; i < count; i++) {
    out.push({
      value: 120,
      unit: 'mg/dL',
      timestamp: new Date(start + i * 5 * 60000).toISOString(),
    })
  }
  return out
}

describe('analyzeGlucose', () => {
  it('produces a full report from a single normalized pass', () => {
    const readings: GlucoseReading[] = [
      ...createGlucoseReadings([80, 120, 160, 200, 90, 140, 70, 180, 110, 130], 'mg/dL', 30),
      { value: 120, unit: 'mg/dL', timestamp: 'bad-timestamp' }, // excluded
    ]
    const res = analyzeGlucose(readings)
    expect(res.valid).toBe(true)
    expect(res.dataSufficiency.totalReadings).toBe(10)
    expect(res.meanGlucose).toBe(128)
    expect(Number.isFinite(res.gmi)).toBe(true)
    expect(res.timeInRange).not.toBeNull()
    expect(typeof res.timeInRange!.inRange.percentage).toBe('number')
    expect(typeof res.tightRange!.inRange).toBe('number')
    expect(typeof res.risk!.lbgi).toBe('number')
    expect(res.agpProfile).not.toBeNull()
    expect(res.agpProfile!.bins).toHaveLength(288)
    expect(res.episodes).not.toBeNull()
    expect(Array.isArray(res.episodes!.hypoEvents)).toBe(true)
    expect(Array.isArray(res.episodes!.hyperEvents)).toBe(true)
    expect(res.dataSufficiency.meetsCGMStandard).toBe(false)
  })

  it('omits the AGP profile when includeProfile is false', () => {
    const res = analyzeGlucose(createGlucoseReadings([100, 120, 140]), {
      includeProfile: false,
    })
    expect(res.valid).toBe(true)
    expect(res.agpProfile).toBeNull()
  })

  it('returns an invalid report for empty input (does not throw)', () => {
    const res = analyzeGlucose([])
    expect(res.valid).toBe(false)
    expect(res.timeInRange).toBeNull()
    expect(res.episodes).toBeNull()
    expect(Number.isNaN(res.meanGlucose)).toBe(true)
    expect(res.dataSufficiency.totalReadings).toBe(0)
  })

  it('is invalid when every reading is out of physiological range', () => {
    const res = analyzeGlucose([
      { value: NaN, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
      { value: -5, unit: 'mg/dL', timestamp: '2024-01-01T08:05:00Z' },
      { value: 700, unit: 'mg/dL', timestamp: '2024-01-01T08:10:00Z' },
    ])
    expect(res.valid).toBe(false)
  })

  it('screens unsupported units consistently', () => {
    const unsupported: GlucoseReading = {
      value: 5,
      unit: 'grams' as never,
      timestamp: '2024-01-01T08:00:00Z',
    }
    const valid: GlucoseReading = {
      value: 120,
      unit: 'mg/dL',
      timestamp: '2024-01-01T08:05:00Z',
    }

    expect(analyzeGlucose([unsupported]).valid).toBe(false)

    const mixed = analyzeGlucose([unsupported, valid], {
      includeProfile: false,
    })
    expect(mixed.valid).toBe(true)
    expect(mixed.dataSufficiency.totalReadings).toBe(1)
    expect(mixed.meanGlucose).toBe(120)
  })

  it('normalizes mmol/L input', () => {
    const mgdl = createGlucoseReadings([100, 120, 140, 160], 'mg/dL', 30)
    const mmol: GlucoseReading[] = mgdl.map((r) => ({
      value: r.value / MGDL_MMOLL_CONVERSION,
      unit: 'mmol/L',
      timestamp: r.timestamp,
    }))
    const res = analyzeGlucose(mmol)
    expect(res.valid).toBe(true)
    expect(res.meanGlucose).toBeCloseTo(130, 1)
  })

  describe('data sufficiency (14-day / 70%-coverage defaults)', () => {
    it('is not met for a short trace', () => {
      const res = analyzeGlucose(createGlucoseReadings([100, 120, 140]))
      expect(res.dataSufficiency.meetsCGMStandard).toBe(false)
    })

    it('is not met when slot coverage is below the active-percent threshold', () => {
      const res = analyzeGlucose(makeDense(2), { minDays: 1, minActivePercent: 200 })
      expect(res.dataSufficiency.meetsCGMStandard).toBe(false)
    })

    it('is met with enough days and slot coverage', () => {
      const res = analyzeGlucose(makeDense(2), { minDays: 1 })
      expect(res.dataSufficiency.meetsCGMStandard).toBe(true)
    })

    it('uses unrounded occupied-slot coverage for the sufficiency threshold', () => {
      const start = Date.parse('2024-01-01T00:00:00Z')
      const occupiedSlots = [
        ...Array.from({ length: 141 }, (_, index) => index),
        202,
      ]
      const readings: GlucoseReading[] = occupiedSlots.map((slot) => ({
        value: 120,
        unit: 'mg/dL',
        timestamp: new Date(start + slot * 5 * 60000).toISOString(),
      }))

      const res = analyzeGlucose(readings, {
        minDays: 0.5,
        minActivePercent: 70,
      })

      expect(res.dataSufficiency.activePercent).toBe(70)
      expect(res.dataSufficiency.meetsCGMStandard).toBe(false)
    })

    it('uses the unrounded observed span for the minimum-days threshold', () => {
      const start = Date.parse('2024-01-01T00:00:00Z')
      const readingsAtSpan = (days: number): GlucoseReading[] => [
        {
          value: 120,
          unit: 'mg/dL',
          timestamp: new Date(start).toISOString(),
        },
        {
          value: 120,
          unit: 'mg/dL',
          timestamp: new Date(start + days * 86_400_000).toISOString(),
        },
      ]
      const justBelow = analyzeGlucose(readingsAtSpan(0.96), {
        minDays: 1,
        minActivePercent: 0,
      })
      const exact = analyzeGlucose(readingsAtSpan(1), {
        minDays: 1,
        minActivePercent: 0,
      })

      expect(justBelow.dataSufficiency.daysOfData).toBe(1)
      expect(justBelow.dataSufficiency.meetsCGMStandard).toBe(false)
      expect(exact.dataSufficiency.meetsCGMStandard).toBe(true)
    })

    it('fails closed when valid readings occupy only one timestamp', () => {
      const duplicate: GlucoseReading = {
        value: 120,
        unit: 'mg/dL',
        timestamp: '2024-01-01T00:00:00.000Z',
      }

      const res = analyzeGlucose([duplicate, { ...duplicate, value: 130 }], {
        minDays: 0,
        minActivePercent: 0,
      })

      expect(res.dataSufficiency.activePercent).toBeNaN()
      expect(res.dataSufficiency.meetsCGMStandard).toBe(false)
    })
  })
})
