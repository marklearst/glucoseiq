import { describe, it, expect } from 'vitest'
import {
  normalizeLibreEntry,
  safeNormalizeDexcomEntries,
  safeNormalizeLibreEntries,
  safeNormalizeNightscoutEntries,
  DEXCOM_CAPABILITIES,
  LIBRE_CAPABILITIES,
  NIGHTSCOUT_CAPABILITIES,
  normalizeDexcomEntry,
  normalizeNightscoutEntry,
} from '../src/connectors'

describe('Libre unit handling (EU mmol/L fix)', () => {
  it('prefers ValueInMgPerDl when present', () => {
    const r = normalizeLibreEntry({
      Value: 6.7,
      ValueInMgPerDl: 121,
      GlucoseUnits: 0,
      TrendArrow: 3,
      Timestamp: '2024-01-01T08:00:00Z',
    })
    expect(r.value).toBe(121)
    expect(r.unit).toBe('mg/dL')
    expect(r.nativeUnit).toBe('mmol/L')
  })

  it('omits nativeUnit when the account is already mg/dL native', () => {
    const r = normalizeLibreEntry({
      Value: 121,
      ValueInMgPerDl: 121,
      GlucoseUnits: 1,
      TrendArrow: 3,
      Timestamp: '2024-01-01T08:00:00Z',
    })
    expect(r.value).toBe(121)
    expect(r.nativeUnit).toBeUndefined()
  })

  it('respects GlucoseUnits=0 as mmol/L when only Value is present', () => {
    const r = normalizeLibreEntry({
      Value: 6.7,
      GlucoseUnits: 0,
      TrendArrow: 3,
      Timestamp: '2024-01-01T08:00:00Z',
    })
    expect(r.value).toBe(6.7)
    expect(r.unit).toBe('mmol/L')
  })

  it('defaults to mg/dL for legacy payloads (back-compat)', () => {
    const r = normalizeLibreEntry({ Value: 121, TrendArrow: 3, Timestamp: '2024-01-01T08:00:00Z' })
    expect(r.unit).toBe('mg/dL')
    expect(r.nativeUnit).toBeUndefined()
  })
})

describe('dedupKey', () => {
  it('uses vendor ids when available and a deterministic fallback otherwise', () => {
    const dex = normalizeDexcomEntry({ Value: 120, Trend: 'Flat', WT: 'Date(1700000000000)', ST: 'st-1' })
    expect(dex.dedupKey).toBe('dexcom:st-1')
    const libre = normalizeLibreEntry({ Value: 100, TrendArrow: 3, Timestamp: '2024-01-01T08:00:00Z' })
    expect(libre.dedupKey).toBe(`libre:${libre.timestamp}`)
    const ns = normalizeNightscoutEntry({ sgv: 100, date: 1700000000000, _id: 'abc' })
    expect(ns.dedupKey).toBe('nightscout:abc')
  })
})

describe('safeNormalize* (partial success)', () => {
  it('collects per-entry errors instead of discarding the batch', () => {
    const res = safeNormalizeDexcomEntries([
      { Value: 120, Trend: 'Flat', WT: 'Date(1700000000000)' },
      { Value: 130, Trend: 'Flat', WT: 'garbage' },
      { Value: 140, Trend: 'SingleUp', WT: 'Date(1700000600000)' },
    ])
    expect(res.readings).toHaveLength(2)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].index).toBe(1)
    expect(res.errors[0].message).toMatch(/Dexcom date/)
  })

  it('works for libre and nightscout too', () => {
    const libre = safeNormalizeLibreEntries([
      { Value: 100, TrendArrow: 3, Timestamp: 'bad' },
      { Value: 110, TrendArrow: 4, Timestamp: '2024-01-01T08:05:00Z' },
    ])
    expect(libre.readings).toHaveLength(1)
    expect(libre.errors[0].index).toBe(0)

    const ns = safeNormalizeNightscoutEntries([{ sgv: 100, date: 1700000000000 }])
    expect(ns.readings).toHaveLength(1)
    expect(ns.errors).toHaveLength(0)
  })

  it('keeps Dexcom siblings while reporting the original malformed index and code', () => {
    const res = safeNormalizeDexcomEntries([
      { Value: 140, Trend: 'SingleUp', WT: 'Date(1700000600000)' },
      { Value: Infinity, Trend: 'Flat', WT: 'Date(1700000300000)' },
      { Value: 100, Trend: 'Flat', WT: 'Date(1700000000000)' },
    ])

    expect(res.readings.map((reading) => reading.value)).toEqual([100, 140])
    expect(res.errors).toEqual([
      {
        index: 1,
        message: 'Dexcom entry has invalid glucose value: Infinity',
        code: 'INVALID_GLUCOSE_VALUE',
      },
    ])
  })

  it('keeps Libre siblings while reporting an invalid runtime unit', () => {
    const res = safeNormalizeLibreEntries([
      { Value: 140, TrendArrow: 4, Timestamp: '2024-01-01T08:10:00Z' },
      {
        Value: 120,
        GlucoseUnits: 2 as 0,
        TrendArrow: 3,
        Timestamp: '2024-01-01T08:05:00Z',
      },
      { Value: 100, TrendArrow: 3, Timestamp: '2024-01-01T08:00:00Z' },
    ])

    expect(res.readings.map((reading) => reading.value)).toEqual([100, 140])
    expect(res.errors).toEqual([
      {
        index: 1,
        message: 'Libre entry has unsupported glucose unit: 2',
        code: 'INVALID_UNIT',
      },
    ])
  })

  it('keeps Nightscout siblings while preserving a timestamp error message', () => {
    const res = safeNormalizeNightscoutEntries([
      { sgv: 140, date: 1700000600000 },
      { sgv: 120, date: 8640000000000001 },
      { sgv: 100, date: 1700000000000 },
    ])

    expect(res.readings.map((reading) => reading.value)).toEqual([100, 140])
    expect(res.errors).toEqual([
      {
        index: 1,
        message:
          "Unable to parse Nightscout timestamp from 'date' field: 8640000000000001",
        code: 'TIMESTAMP_UNPARSEABLE',
      },
    ])
  })

  it('omits a code for unexpected Error failures', () => {
    const malformed = {
      Value: 120,
      Trend: 'Flat' as const,
      get WT(): string {
        throw new Error('unexpected getter failure')
      },
    }
    const res = safeNormalizeDexcomEntries([malformed])
    expect(res.readings).toEqual([])
    expect(res.errors).toEqual([
      { index: 0, message: 'unexpected getter failure' },
    ])
  })

  it('stringifies unexpected non-Error failures without assigning a code', () => {
    const malformed = {
      Value: 120,
      Trend: 'Flat' as const,
      get WT(): string {
        throw 'unexpected string failure'
      },
    }
    const res = safeNormalizeDexcomEntries([malformed])
    expect(res.readings).toEqual([])
    expect(res.errors).toEqual([
      { index: 0, message: 'unexpected string failure' },
    ])
  })
})

describe('capability descriptors', () => {
  it('describes each source with tier, cadence, and trend vocabulary', () => {
    expect(DEXCOM_CAPABILITIES.source).toBe('dexcom')
    expect(DEXCOM_CAPABILITIES.tier).toBe(1)
    expect(DEXCOM_CAPABILITIES.updateIntervalSec).toBe(300)
    expect(DEXCOM_CAPABILITIES.clockModel).toBe('direct')
    expect(LIBRE_CAPABILITIES.tier).toBe(1)
    expect(NIGHTSCOUT_CAPABILITIES.tier).toBe(2)
    expect(NIGHTSCOUT_CAPABILITIES.clockModel).toBe('relay')
    expect(DEXCOM_CAPABILITIES.trendVocabulary).toBe('full')
  })
})
