import { describe, it, expect } from 'vitest'
import { generateCGMSeries, scenarios } from '../src'
import type { GenerateOptions } from '../src'

class NonPlainOptions {}

const completeOptions = {
  days: 2,
  intervalMin: 5,
  seed: 7,
  start: '2025-06-01T00:00:00Z',
  basal: 108,
  mealTimes: [420, 780, 1140],
  mealAmplitude: 72,
  noise: 9,
  nocturnalHypoDays: [1],
  unit: 'mg/dL',
} as const satisfies Required<GenerateOptions>

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

function mealExcursion(seed: number): number[] {
  const options = {
    days: 1,
    intervalMin: 1,
    seed,
    start: '2025-06-01T00:00:00Z',
    basal: 110,
    mealTimes: [720],
    mealAmplitude: 100,
    noise: 0,
    nocturnalHypoDays: [],
    unit: 'mg/dL',
  } as const satisfies Required<GenerateOptions>
  const withMeal = generateCGMSeries(options)
  const withoutMeal = generateCGMSeries({ ...options, mealAmplitude: 0 })

  return withMeal.map((reading, index) => reading.value - withoutMeal[index].value)
}

function lagOneCorrelation(values: readonly number[]): number {
  const left = values.slice(0, -1)
  const right = values.slice(1)
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length
  let covariance = 0
  let leftVariance = 0
  let rightVariance = 0

  for (let index = 0; index < left.length; index++) {
    const leftDelta = left[index] - leftMean
    const rightDelta = right[index] - rightMean
    covariance += leftDelta * rightDelta
    leftVariance += leftDelta ** 2
    rightVariance += rightDelta ** 2
  }

  return covariance / Math.sqrt(leftVariance * rightVariance)
}

describe('generateCGMSeries', () => {
  it('is deterministic for identical complete options', () => {
    const a = generateCGMSeries(completeOptions)
    const b = generateCGMSeries(completeOptions)
    expect(a).toEqual(b)
  })

  it('keeps an existing seeded prefix when the requested duration grows', () => {
    const twoDays = generateCGMSeries(completeOptions)
    const threeDays = generateCGMSeries({ ...completeOptions, days: 3 })

    expect(threeDays.slice(0, twoDays.length)).toEqual(twoDays)
  })

  it('differs across seeds', () => {
    const a = generateCGMSeries({ seed: 1 })
    const b = generateCGMSeries({ seed: 2 })
    expect(a.map((r) => r.value)).not.toEqual(b.map((r) => r.value))
  })

  it('uses defaults for omitted and explicitly undefined options', () => {
    const expected = generateCGMSeries()
    expect(generateCGMSeries(undefined)).toEqual(expected)
    expect(generateCGMSeries({})).toEqual(expected)
    expect(generateCGMSeries(Object.create(null) as GenerateOptions)).toEqual(expected)
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

  it('varies seeded meal timing around the nominal meal time', () => {
    const firstResponseMinutes = Array.from({ length: 24 }, (_, index) => {
      const response = mealExcursion(index + 1)
      return response.findIndex((value) => value > 0)
    })

    expect(Math.min(...firstResponseMinutes)).toBeLessThan(720)
    expect(Math.max(...firstResponseMinutes)).toBeGreaterThan(720)
    expect(new Set(firstResponseMinutes).size).toBeGreaterThan(8)
    for (const minute of firstResponseMinutes) {
      expect(minute).toBeGreaterThanOrEqual(705)
      expect(minute).toBeLessThanOrEqual(753)
    }
  })

  it('takes 40 to 90 minutes for a meal response to peak', () => {
    const riseTimes = Array.from({ length: 24 }, (_, index) => {
      const response = mealExcursion(index + 1)
      const firstResponse = response.findIndex((value) => value > 0)
      const peak = response.indexOf(Math.max(...response))
      return peak - firstResponse
    })

    for (const riseTime of riseTimes) {
      // Integer readings can hide the first few minutes of a smooth rise.
      expect(riseTime).toBeGreaterThanOrEqual(30)
      expect(riseTime).toBeLessThanOrEqual(90)
    }
    expect(new Set(riseTimes).size).toBeGreaterThan(8)
  })

  it('scales meal peaks between 65% and 125% of the requested amplitude', () => {
    const peaks = Array.from({ length: 24 }, (_, index) =>
      Math.max(...mealExcursion(index + 1))
    )

    for (const peak of peaks) {
      expect(peak).toBeGreaterThanOrEqual(64)
      expect(peak).toBeLessThanOrEqual(126)
    }
  })

  it('gives meal responses a seeded 120 to 210 minute recovery', () => {
    const recoveryTimes = Array.from({ length: 24 }, (_, index) => {
      const response = mealExcursion(index + 1)
      const peak = response.indexOf(Math.max(...response))
      const recovered = response.findIndex((value, minute) => minute > peak && value === 0)
      return recovered - peak
    })

    for (const recoveryTime of recoveryTimes) {
      // Rounding against a drifting baseline can hide the final minutes of the tail.
      expect(recoveryTime).toBeGreaterThanOrEqual(109)
      expect(recoveryTime).toBeLessThanOrEqual(210)
    }
    expect(new Set(recoveryTimes).size).toBeGreaterThan(8)
  })

  it('uses bounded, correlated sensor variation', () => {
    const options = {
      ...completeOptions,
      days: 3,
      mealAmplitude: 0,
      nocturnalHypoDays: [],
      noise: 20,
    } as const
    const noisy = generateCGMSeries(options)
    const baseline = generateCGMSeries({ ...options, noise: 0 })
    const variation = noisy.map((reading, index) => reading.value - baseline[index].value)

    expect(Math.max(...variation.map(Math.abs))).toBeLessThanOrEqual(20)
    expect(lagOneCorrelation(variation)).toBeGreaterThan(0.65)
  })

  it('shapes a nocturnal low as a smooth two-hour depression', () => {
    const options = {
      ...completeOptions,
      days: 1,
      intervalMin: 5,
      mealAmplitude: 0,
      noise: 0,
      nocturnalHypoDays: [0],
    } as const
    const withLow = generateCGMSeries(options)
    const baseline = generateCGMSeries({ ...options, nocturnalHypoDays: [] })
    const depression = withLow.map(
      (reading, index) => reading.value - baseline[index].value
    )
    const atMinute = (minute: number): number => depression[minute / 5]
    const largestStep = Math.max(
      ...depression.slice(24, 49).map((value, index) =>
        index === 0 ? 0 : Math.abs(value - depression[index + 23])
      )
    )

    expect(atMinute(115)).toBe(0)
    expect(atMinute(120)).toBe(0)
    expect(atMinute(180)).toBeLessThanOrEqual(-50)
    expect(atMinute(240)).toBe(0)
    expect(atMinute(245)).toBe(0)
    expect(largestStep).toBeLessThanOrEqual(8)
  })

  it('starts an early next-day meal before midnight without a boundary jump', () => {
    const options = {
      ...completeOptions,
      days: 2,
      intervalMin: 5,
      seed: 9660,
      mealTimes: [0],
      mealAmplitude: 70,
      noise: 0,
      nocturnalHypoDays: [],
    } as const
    const withMeal = generateCGMSeries(options)
    const baseline = generateCGMSeries({ ...options, mealAmplitude: 0 })
    const contribution = withMeal.map(
      (reading, index) => reading.value - baseline[index].value
    )
    const beforeMidnight = contribution[287]
    const atMidnight = contribution[288]
    const boundaryStep = Math.abs(atMidnight - beforeMidnight)
    const neighboringStep = Math.max(
      Math.abs(beforeMidnight - contribution[286]),
      Math.abs(contribution[289] - atMidnight)
    )

    expect(beforeMidnight).toBeGreaterThan(0)
    expect(boundaryStep).toBeLessThanOrEqual(neighboringStep)
  })

  it('keeps basal drift continuous across day boundaries', () => {
    const readings = generateCGMSeries({
      days: 14,
      seed: 1,
      mealTimes: [],
      mealAmplitude: 0,
      noise: 0,
    })
    const boundarySteps = Array.from({ length: 13 }, (_, day) => {
      const midnight = (day + 1) * 288
      return Math.abs(readings[midnight].value - readings[midnight - 1].value)
    })

    expect(Math.max(...boundarySteps)).toBeLessThanOrEqual(2)
  })

  it('rejects more than 100,000 seeded meal responses', () => {
    expectOptionRangeError(
      {
        days: 101,
        intervalMin: 1440,
        mealTimes: Array.from({ length: 1000 }, () => 720),
      },
      'generateCGMSeries cannot model more than 100000 meal responses'
    )
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
    { name: 'array', options: [] },
    { name: 'Date', options: new Date() },
    { name: 'Map', options: new Map() },
    { name: 'RegExp', options: /x/ },
    { name: 'class instance', options: new NonPlainOptions() },
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
