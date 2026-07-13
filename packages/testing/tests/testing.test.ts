import { describe, it, expect } from 'vitest'
import { generateCGMSeries, scenarios } from '../src'
import type { GenerateOptions } from '../src'

function expectOptionRangeError(options: GenerateOptions, message: string): void {
  let thrown: unknown
  try {
    generateCGMSeries(options)
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(RangeError)
  expect(thrown).toMatchObject({ message })
}

describe('generateCGMSeries', () => {
  it('is deterministic for the same seed', () => {
    const a = generateCGMSeries({ seed: 7 })
    const b = generateCGMSeries({ seed: 7 })
    expect(a).toEqual(b)
  })

  it('differs across seeds', () => {
    const a = generateCGMSeries({ seed: 1 })
    const b = generateCGMSeries({ seed: 2 })
    expect(a.map((r) => r.value)).not.toEqual(b.map((r) => r.value))
  })

  it('uses defaults for omitted and explicitly undefined options', () => {
    const expected = generateCGMSeries()
    expect(generateCGMSeries(undefined)).toEqual(expected)
    expect(
      generateCGMSeries({
        days: undefined,
        intervalMin: undefined,
        seed: undefined,
        start: undefined,
        basal: undefined,
        mealTimes: undefined,
        mealAmplitude: undefined,
        noise: undefined,
        nocturnalHypoDays: undefined,
        unit: undefined,
      })
    ).toEqual(expected)
  })

  it('produces days × 288 five-minute readings by default', () => {
    const r = generateCGMSeries({ days: 2 })
    expect(r).toHaveLength(576)
    expect(Date.parse(r[1].timestamp) - Date.parse(r[0].timestamp)).toBe(5 * 60000)
    expect(r[0].unit).toBe('mg/dL')
  })

  it('stays within physiological bounds', () => {
    const r = generateCGMSeries({ days: 3, seed: 99 })
    for (const x of r) {
      expect(x.value).toBeGreaterThanOrEqual(40)
      expect(x.value).toBeLessThanOrEqual(400)
    }
  })

  it('honors interval, start, and unit options', () => {
    const r = generateCGMSeries({ days: 1, intervalMin: 15, start: '2025-06-01T00:00:00Z', unit: 'mmol/L' })
    expect(r).toHaveLength(96)
    expect(r[0].timestamp).toBe('2025-06-01T00:00:00.000Z')
    expect(r[0].unit).toBe('mmol/L')
    expect(r[0].value).toBeLessThan(25) // mmol scale
  })

  it('preserves sub-minute intervals', () => {
    const r = generateCGMSeries({ intervalMin: 0.5 })
    expect(r).toHaveLength(2880)
    expect(Date.parse(r[1].timestamp) - Date.parse(r[0].timestamp)).toBe(30_000)
  })

  it('preserves fractional meal times', () => {
    expect(generateCGMSeries({ mealTimes: [420.5] })).toHaveLength(288)
  })

  it('accepts the maximum interval', () => {
    expect(generateCGMSeries({ intervalMin: 1440 })).toHaveLength(1)
  })

  it('injects nocturnal hypos on the requested days', () => {
    const r = generateCGMSeries({ days: 2, seed: 3, nocturnalHypoDays: [1] })
    const day1Night = r.filter((x) => {
      const d = new Date(x.timestamp)
      return d.getUTCDate() === 2 && d.getUTCHours() >= 2 && d.getUTCHours() < 4
    })
    expect(day1Night.some((x) => x.value < 70)).toBe(true)
  })

  it.each([
    {
      name: 'days',
      options: { days: null as never },
      message: 'days must be a positive integer',
    },
    {
      name: 'intervalMin',
      options: { intervalMin: null as never },
      message: 'intervalMin must be finite, positive, and no greater than 1440',
    },
    {
      name: 'seed',
      options: { seed: null as never },
      message: 'seed must be a safe integer',
    },
    {
      name: 'start',
      options: { start: null as never },
      message: 'start must be a valid timestamp',
    },
    {
      name: 'basal',
      options: { basal: null as never },
      message: 'basal must be positive and finite',
    },
    {
      name: 'mealTimes',
      options: { mealTimes: null as never },
      message: 'mealTimes entries must be finite and between 0 and 1439',
    },
    {
      name: 'mealAmplitude',
      options: { mealAmplitude: null as never },
      message: 'mealAmplitude must be non-negative and finite',
    },
    {
      name: 'noise',
      options: { noise: null as never },
      message: 'noise must be non-negative and finite',
    },
    {
      name: 'nocturnalHypoDays',
      options: { nocturnalHypoDays: null as never },
      message: 'nocturnalHypoDays entries must be non-negative integers',
    },
    {
      name: 'unit',
      options: { unit: null as never },
      message: 'unit must be mg/dL or mmol/L',
    },
  ] satisfies {
    name: string
    options: GenerateOptions
    message: string
  }[])('rejects explicit null for $name', ({ options, message }) => {
    expectOptionRangeError(options, message)
  })

  it.each([
    { name: 'null', options: null },
    { name: 'number', options: 42 },
  ])('rejects $name top-level options', ({ options }) => {
    expectOptionRangeError(options as never, 'options must be an object')
  })

  it.each([
    {
      name: 'zero days',
      options: { days: 0 },
      message: 'days must be a positive integer',
    },
    {
      name: 'fractional days',
      options: { days: 1.5 },
      message: 'days must be a positive integer',
    },
    {
      name: 'infinite days',
      options: { days: Infinity },
      message: 'days must be a positive integer',
    },
    {
      name: 'non-finite intervalMin',
      options: { intervalMin: NaN },
      message: 'intervalMin must be finite, positive, and no greater than 1440',
    },
    {
      name: 'zero intervalMin',
      options: { intervalMin: 0 },
      message: 'intervalMin must be finite, positive, and no greater than 1440',
    },
    {
      name: 'negative intervalMin',
      options: { intervalMin: -1 },
      message: 'intervalMin must be finite, positive, and no greater than 1440',
    },
    {
      name: 'non-finite seed',
      options: { seed: Infinity },
      message: 'seed must be a safe integer',
    },
    {
      name: 'invalid start',
      options: { start: 'not-a-timestamp' },
      message: 'start must be a valid timestamp',
    },
    {
      name: 'start whose generated timestamps overflow',
      options: { start: '+275760-09-12T23:59:00.000Z' },
      message: 'start must be a valid timestamp',
    },
    {
      name: 'non-positive basal',
      options: { basal: 0 },
      message: 'basal must be positive and finite',
    },
    {
      name: 'negative noise',
      options: { noise: -1 },
      message: 'noise must be non-negative and finite',
    },
    {
      name: 'negative mealAmplitude',
      options: { mealAmplitude: -1 },
      message: 'mealAmplitude must be non-negative and finite',
    },
    {
      name: 'invalid mealTimes entry',
      options: { mealTimes: [-1] },
      message: 'mealTimes entries must be finite and between 0 and 1439',
    },
    {
      name: 'negative nocturnalHypoDays entry',
      options: { nocturnalHypoDays: [-1] },
      message: 'nocturnalHypoDays entries must be non-negative integers',
    },
    {
      name: 'unsupported unit',
      options: { unit: 'other' as never },
      message: 'unit must be mg/dL or mmol/L',
    },
  ] satisfies {
    name: string
    options: GenerateOptions
    message: string
  }[])('rejects $name', ({ options, message }) => {
    expectOptionRangeError(options, message)
  })

  it('rejects output larger than 100,000 readings', () => {
    expectOptionRangeError(
      { days: 348 },
      'generateCGMSeries cannot create more than 100000 readings'
    )
  })

  it('accepts exactly 100,000 readings', () => {
    expect(generateCGMSeries({ days: 100, intervalMin: 1.439 })).toHaveLength(100_000)
  })
})

describe('scenarios', () => {
  it('steadyDay stays mostly in range', () => {
    const r = scenarios.steadyDay()
    const inRange = r.filter((x) => x.value >= 70 && x.value <= 180).length
    expect(inRange / r.length).toBeGreaterThan(0.9)
  })

  it('hypoNight contains sub-70 readings', () => {
    expect(scenarios.hypoNight().some((x) => x.value < 70)).toBe(true)
  })

  it('rollercoaster exceeds 180', () => {
    expect(scenarios.rollercoaster().some((x) => x.value > 180)).toBe(true)
  })

  it('gappyTrace has a >30-minute hole', () => {
    const r = scenarios.gappyTrace()
    let maxGap = 0
    for (let i = 1; i < r.length; i++) {
      maxGap = Math.max(maxGap, Date.parse(r[i].timestamp) - Date.parse(r[i - 1].timestamp))
    }
    expect(maxGap).toBeGreaterThan(30 * 60000)
  })
})
