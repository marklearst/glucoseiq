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
const MAX_GENERATED_MEAL_RESPONSES = 100_000
const NOISE_STREAM_SALT = 0x9e3779b9

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
  /** Nominal peak meal excursion amplitude in mg/dL (default 70). */
  readonly mealAmplitude?: number
  /** Maximum correlated sensor variation in mg/dL (default 8). */
  readonly noise?: number
  /** Zero-based day indices that get a smooth 02:00–04:00 hypo dip (default none). */
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

interface MealResponse {
  readonly startMinute: number
  readonly amplitude: number
  readonly timeToPeak: number
  readonly recovery: number
}

interface DayProfile {
  readonly shift: number
  readonly meals: readonly MealResponse[]
}

/** Builds one day without retaining profiles for the full series. @internal */
function createDayProfile(
  rand: () => number,
  day: number,
  mealTimes: readonly number[],
  mealAmplitude: number
): DayProfile {
  return {
    shift: (rand() - 0.5) * 12,
    meals: mealTimes.map((mealTime) => ({
      startMinute: day * 1440 + mealTime - 15 + rand() * 40,
      amplitude: mealAmplitude * (0.65 + rand() * 0.6),
      timeToPeak: 40 + rand() * 50,
      recovery: 120 + rand() * 90,
    })),
  }
}

/** Smooth interpolation with zero slope at both ends. @internal */
function smootherstep(progress: number): number {
  return progress ** 3 * (progress * (progress * 6 - 15) + 10)
}

/** Contribution from one seeded meal response. @internal */
function mealContribution(meal: MealResponse, minute: number): number {
  const elapsed = minute - meal.startMinute
  if (elapsed <= 0 || elapsed >= meal.timeToPeak + meal.recovery) return 0

  if (elapsed < meal.timeToPeak) {
    return meal.amplitude * smootherstep(elapsed / meal.timeToPeak)
  }

  return (
    meal.amplitude *
    (1 - smootherstep((elapsed - meal.timeToPeak) / meal.recovery))
  )
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
  const totalMealResponses = (days + 1) * mealTimes.length
  if (
    !Number.isSafeInteger(totalMealResponses) ||
    totalMealResponses > MAX_GENERATED_MEAL_RESPONSES
  ) {
    throw new RangeError(
      `generateCGMSeries cannot model more than ${MAX_GENERATED_MEAL_RESPONSES} meal responses`
    )
  }
  const lastMinute = (days - 1) * 1440 + (perDay - 1) * intervalMin
  const lastTimestampMs = startMs + lastMinute * 60000
  if (!Number.isFinite(lastTimestampMs) || Number.isNaN(new Date(lastTimestampMs).getTime())) {
    throw new RangeError('start must be a valid timestamp')
  }

  const profileRand = mulberry32(seed)
  const noiseRand = mulberry32(seed ^ NOISE_STREAM_SALT)

  let previousProfile: DayProfile | undefined
  let profile = createDayProfile(profileRand, 0, mealTimes, mealAmplitude)
  let nextProfile = createDayProfile(profileRand, 1, mealTimes, mealAmplitude)
  const hypoDays = new Set(nocturnalHypoDays)
  const noiseCorrelation = Math.exp(-intervalMin / 30)
  let sensorVariation = (noiseRand() * 2 - 1) * noise
  const readings: GlucoseReading[] = []

  for (let d = 0; d < days; d++) {
    for (let i = 0; i < perDay; i++) {
      const min = i * intervalMin
      const absoluteMinute = d * 1440 + min
      const circadian = 16 * Math.sin((2 * Math.PI * (min - 300)) / 1440)
      let meals = previousProfile?.meals.reduce(
        (sum, meal) => sum + mealContribution(meal, absoluteMinute),
        0
      ) ?? 0
      meals += profile.meals.reduce(
        (sum, meal) => sum + mealContribution(meal, absoluteMinute),
        0
      )
      meals += nextProfile.meals.reduce(
        (sum, meal) => sum + mealContribution(meal, absoluteMinute),
        0
      )

      const noiseTarget = (noiseRand() * 2 - 1) * noise
      sensorVariation =
        noiseCorrelation * sensorVariation + (1 - noiseCorrelation) * noiseTarget

      const hypoProgress = (min - 120) / 120
      const hypo =
        hypoDays.has(d) && hypoProgress >= 0 && hypoProgress <= 1
          ? -55 * Math.sin(Math.PI * hypoProgress) ** 2
          : 0

      const shiftProgress = smootherstep(min / 1440)
      const basalShift =
        profile.shift + (nextProfile.shift - profile.shift) * shiftProgress
      let mgdl = basal + basalShift + circadian + meals + sensorVariation + hypo
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

    if (d + 1 < days) {
      previousProfile = profile
      profile = nextProfile
      nextProfile = createDayProfile(profileRand, d + 2, mealTimes, mealAmplitude)
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
