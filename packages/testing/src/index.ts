/**
 * @glucoseiq/testing generates synthetic CGM-shaped data for tests, demos,
 * and documentation.
 *
 * A seedable generator producing synthetic glucose curves (circadian baseline,
 * meal spikes, noise, optional nocturnal hypos) and fixed scenario fixtures.
 * Identical complete generator options, including the seed, produce identical
 * output for golden tests.
 */

import type { GlucoseReading, GlucoseUnit } from '@glucoseiq/core'

/** mg/dL per mmol/L (matches @glucoseiq/core). */
const MGDL_PER_MMOLL = 18.0182

const MAX_GENERATED_READINGS = 100_000

/** Options for {@link generateCGMSeries}. */
export interface GenerateOptions {
  /** Number of days to generate (default 1). */
  readonly days?: number
  /** Minutes between readings (default 5). */
  readonly intervalMin?: number
  /** Safe-integer seed used to repeat a generated series (default 42). */
  readonly seed?: number
  /** ISO 8601 start timestamp (default '2024-01-01T00:00:00Z'). */
  readonly start?: string
  /** Baseline glucose in mg/dL (default 110). */
  readonly basal?: number
  /** Meal times as minute-of-day (default 07:00, 13:00, 19:00). */
  readonly mealTimes?: readonly number[]
  /** Peak meal excursion amplitude in mg/dL (default 70). */
  readonly mealAmplitude?: number
  /** Noise amplitude in mg/dL (default 8). */
  readonly noise?: number
  /** Zero-based day indices that get a 02:00–04:00 hypo dip (default none). */
  readonly nocturnalHypoDays?: readonly number[]
  /** Output unit (default 'mg/dL'). */
  readonly unit?: GlucoseUnit
}

/** Small Mulberry32 PRNG seeded from a safe integer. @internal */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generates a synthetic CGM series for tests and demos.
 *
 * @param options - Shape of the generated data
 * @returns Chronological readings; same options (incl. seed) → identical output
 *
 * @example
 * ```ts typecheck
 * import { generateCGMSeries } from '@glucoseiq/testing'
 *
 * const readings = generateCGMSeries({ days: 14, seed: 7 })
 * ```
 */
export function generateCGMSeries(options?: GenerateOptions): GlucoseReading[] {
  if (options === null || (options !== undefined && typeof options !== 'object')) {
    throw new RangeError('options must be an object')
  }
  if (options !== undefined) {
    const prototype = Object.getPrototypeOf(options)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RangeError('options must be an object')
    }
  }

  const days = options === undefined || options.days === undefined ? 1 : options.days
  const intervalMin =
    options === undefined || options.intervalMin === undefined ? 5 : options.intervalMin
  const seed = options === undefined || options.seed === undefined ? 42 : options.seed
  const start =
    options === undefined || options.start === undefined
      ? '2024-01-01T00:00:00Z'
      : options.start
  const startMs = typeof start === 'string' ? Date.parse(start) : NaN
  const basal = options === undefined || options.basal === undefined ? 110 : options.basal
  const mealTimes =
    options === undefined || options.mealTimes === undefined
      ? [420, 780, 1140]
      : options.mealTimes
  const mealAmplitude =
    options === undefined || options.mealAmplitude === undefined ? 70 : options.mealAmplitude
  const noise = options === undefined || options.noise === undefined ? 8 : options.noise
  const nocturnalHypoDays =
    options === undefined || options.nocturnalHypoDays === undefined
      ? []
      : options.nocturnalHypoDays
  const unit = options === undefined || options.unit === undefined ? 'mg/dL' : options.unit

  if (!Number.isInteger(days) || days <= 0) {
    throw new RangeError('days must be a positive integer')
  }
  if (!Number.isFinite(intervalMin) || intervalMin <= 0 || intervalMin > 1440) {
    throw new RangeError('intervalMin must be finite, positive, and no greater than 1440')
  }
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('seed must be a safe integer')
  }
  if (!Number.isFinite(startMs)) {
    throw new RangeError('start must be a valid timestamp')
  }
  if (!Number.isFinite(basal) || basal <= 0) {
    throw new RangeError('basal must be positive and finite')
  }
  if (
    !Array.isArray(mealTimes) ||
    !mealTimes.every(
      (mealTime) =>
        Number.isFinite(mealTime) && mealTime >= 0 && mealTime <= 1439
    )
  ) {
    throw new RangeError('mealTimes entries must be finite and between 0 and 1439')
  }
  if (!Number.isFinite(mealAmplitude) || mealAmplitude < 0) {
    throw new RangeError('mealAmplitude must be non-negative and finite')
  }
  if (!Number.isFinite(noise) || noise < 0) {
    throw new RangeError('noise must be non-negative and finite')
  }
  if (
    !Array.isArray(nocturnalHypoDays) ||
    !nocturnalHypoDays.every((day) => Number.isInteger(day) && day >= 0)
  ) {
    throw new RangeError('nocturnalHypoDays entries must be non-negative integers')
  }
  if (unit !== 'mg/dL' && unit !== 'mmol/L') {
    throw new RangeError('unit must be mg/dL or mmol/L')
  }

  const perDay = Math.floor(1440 / intervalMin)
  const totalReadings = days * perDay
  if (
    !Number.isSafeInteger(totalReadings) ||
    totalReadings <= 0 ||
    totalReadings > MAX_GENERATED_READINGS
  ) {
    throw new RangeError(
      `generateCGMSeries cannot create more than ${MAX_GENERATED_READINGS} readings`
    )
  }
  const lastMinute = (days - 1) * 1440 + (perDay - 1) * intervalMin
  const lastTimestampMs = startMs + lastMinute * 60000
  if (!Number.isFinite(lastTimestampMs) || Number.isNaN(new Date(lastTimestampMs).getTime())) {
    throw new RangeError('start must be a valid timestamp')
  }

  const hypoDays = new Set(nocturnalHypoDays)
  const rand = mulberry32(seed)
  const readings: GlucoseReading[] = []

  for (let d = 0; d < days; d++) {
    // Per-day personality: slight basal drift + meal-size variation.
    const dayShift = (rand() - 0.5) * 12
    const mealScale = 0.8 + rand() * 0.5

    for (let i = 0; i < perDay; i++) {
      const min = i * intervalMin
      const circadian = 16 * Math.sin((2 * Math.PI * (min - 300)) / 1440)
      const meals = mealTimes.reduce((sum, t) => {
        const dt = min - t
        if (dt < 0 || dt >= 210) return sum
        return sum + mealAmplitude * mealScale * Math.exp(-dt / 70) * Math.min(1, dt / 25)
      }, 0)
      const jitter = (rand() - 0.5) * 2 * noise
      const hypo = hypoDays.has(d) && min >= 120 && min <= 240 ? -55 : 0

      let mgdl = basal + dayShift + circadian + meals + jitter + hypo
      mgdl = Math.max(40, Math.min(400, mgdl))
      const value =
        unit === 'mg/dL'
          ? Math.round(mgdl)
          : Math.round((mgdl / MGDL_PER_MMOLL) * 10) / 10

      readings.push({
        value,
        unit,
        timestamp: new Date(startMs + (d * 1440 + min) * 60000).toISOString(),
      })
    }
  }
  return readings
}

/** Scenario fixtures with fixed settings and seeds. */
export const scenarios = {
  /** A calm, mostly in-range day. */
  steadyDay(): GlucoseReading[] {
    return generateCGMSeries({ seed: 11, mealAmplitude: 45, noise: 5 })
  },
  /** A day with a 02:00–04:00 nocturnal hypo. */
  hypoNight(): GlucoseReading[] {
    return generateCGMSeries({ seed: 21, nocturnalHypoDays: [0] })
  },
  /** Big post-meal excursions well above range. */
  rollercoaster(): GlucoseReading[] {
    return generateCGMSeries({ seed: 31, mealAmplitude: 130, noise: 14 })
  },
  /** A day with the 15:00-16:30 reading window removed, producing a 100-minute timestamp gap. */
  gappyTrace(): GlucoseReading[] {
    const all = generateCGMSeries({ seed: 41 })
    // Remove 15:00–16:30 (minute-of-day 900–990).
    return all.filter((r) => {
      const d = new Date(r.timestamp)
      const min = d.getUTCHours() * 60 + d.getUTCMinutes()
      return min < 900 || min > 990
    })
  },
} as const
