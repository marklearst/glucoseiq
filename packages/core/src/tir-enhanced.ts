// @file src/tir-enhanced.ts

import type {
  GlucoseReading,
  EnhancedTIRResult,
  EnhancedTIROptions,
  RangeMetrics,
  TargetAssessment,
  TIRSummary,
  TIRPopulation,
  TIRAssessment,
  PregnancyTIRResult,
  PregnancyTIROptions,
  GlucoseUnit,
} from './types'

import { EmptyDatasetError, DomainError } from './errors'
import { calculateActivePercent } from './metrics/active-percent'
import {
  TIR_VERY_LOW_THRESHOLD_MGDL,
  TIR_LOW_THRESHOLD_MGDL,
  TIR_HIGH_THRESHOLD_MGDL,
  TIR_VERY_HIGH_THRESHOLD_MGDL,
  TIR_VERY_LOW_THRESHOLD_MMOLL,
  TIR_LOW_THRESHOLD_MMOLL,
  TIR_HIGH_THRESHOLD_MMOLL,
  TIR_VERY_HIGH_THRESHOLD_MMOLL,
  TIR_GOAL_STANDARD,
  TBR_LEVEL1_GOAL,
  TBR_LEVEL2_GOAL,
  TAR_LEVEL1_GOAL,
  TAR_LEVEL2_GOAL,
  TIR_GOAL_OLDER_ADULTS,
  TBR_LEVEL1_GOAL_OLDER_ADULTS,
  TBR_LEVEL2_GOAL_OLDER_ADULTS,
  TAR_LEVEL1_GOAL_OLDER_ADULTS,
  TAR_LEVEL2_GOAL_OLDER_ADULTS,
  PREGNANCY_TARGET_LOW_MGDL,
  PREGNANCY_TARGET_HIGH_MGDL,
  PREGNANCY_TARGET_LOW_MMOLL,
  PREGNANCY_TARGET_HIGH_MMOLL,
  MGDL_MMOLL_CONVERSION,
  MG_DL,
  MMOL_L,
} from './constants'

/**
 * Glucose reading with normalized value in target unit.
 *
 * @internal
 */
type NormalizedReading = GlucoseReading & { normalizedValue: number }

type EnhancedTIRZone =
  | 'veryLow'
  | 'low'
  | 'inRange'
  | 'high'
  | 'veryHigh'

type PregnancyDurationZone =
  | 'belowRangeLevel2'
  | 'belowRangeLevel1'
  | 'inRange'
  | 'aboveRange'

interface EnhancedTIRThresholds {
  readonly veryLow: number
  readonly low: number
  readonly high: number
  readonly veryHigh: number
}

const DEFAULT_MGDL_THRESHOLDS: EnhancedTIRThresholds = {
  veryLow: TIR_VERY_LOW_THRESHOLD_MGDL,
  low: TIR_LOW_THRESHOLD_MGDL,
  high: TIR_HIGH_THRESHOLD_MGDL,
  veryHigh: TIR_VERY_HIGH_THRESHOLD_MGDL,
}

const DEFAULT_MMOLL_THRESHOLDS: EnhancedTIRThresholds = {
  veryLow: TIR_VERY_LOW_THRESHOLD_MMOLL,
  low: TIR_LOW_THRESHOLD_MMOLL,
  high: TIR_HIGH_THRESHOLD_MMOLL,
  veryHigh: TIR_VERY_HIGH_THRESHOLD_MMOLL,
}

const DEFAULT_CGM_INTERVAL_MINUTES = 5

/**
 * Calculates Enhanced Time-in-Range metrics per International Consensus 2019.
 *
 * Provides detailed breakdown of glucose readings across five clinical ranges:
 * - Very Low (<54 mg/dL / 3.0 mmol/L): Level 2 Hypoglycemia
 * - Low (54-69 mg/dL / 3.0-3.8 mmol/L): Level 1 Hypoglycemia
 * - In Range (70-180 mg/dL / 3.9-10.0 mmol/L): Target Range
 * - High (181-250 mg/dL / 10.1-13.9 mmol/L): Level 1 Hyperglycemia
 * - Very High (>250 mg/dL / >13.9 mmol/L): Level 2 Hyperglycemia
 *
 * @param readings - Array of glucose readings with timestamp, value, and unit
 * @param options - Optional configuration for thresholds and population type
 * @returns Enhanced TIR result with detailed metrics and target assessment
 *
 * @example
 * ```ts typecheck
 * import { calculateEnhancedTIR, type GlucoseReading } from '@glucoseiq/core'
 *
 * const readings: GlucoseReading[] = [
 *   { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
 *   { value: 95, unit: 'mg/dL', timestamp: '2024-01-01T08:05:00Z' },
 * ]
 * const result = calculateEnhancedTIR(readings)
 * console.log(`TIR: ${result.inRange.percentage}%`)
 * console.log(`Meets targets: ${result.meetsTargets.tirMeetsGoal}`)
 * ```
 *
 * @throws {EmptyDatasetError} If readings array is empty
 * @throws {DomainError} If readings contain invalid glucose values or units
 * @throws {DomainError} If population or thresholds are unsupported
 *
 * @see {@link https://diabetesjournals.org/care/article/42/8/1593 | International Consensus on Time in Range (2019)}
 *
 * @remarks
 * - Calculation accepts any nonempty array of valid glucose rows
 * - `summary.dataQuality` is poor below 3 days, fair from 3 days, good from
 *   7 days, and excellent from 14 days; coverage below 70% is always poor
 * - For retrospective interpretation, separately assess the documented
 *   14-day and 70% timestamp-coverage sufficiency guidance
 * - Standard targets: TIR >70%, cumulative TBR <4%, Level 2 TBR <1%, cumulative TAR <25%, Level 2 TAR <5%
 * - Overriding any range threshold changes `targetBasis` to `configured-ranges`; population percentage goals then apply to those configured ranges, not consensus ranges
 * - Verify data quality and sensor accuracy before drawing conclusions
 * - Summary duration estimates occupied 5-minute timestamp slots; invalid
 *   timestamps do not add duration
 * - Each occupied slot is divided among its distinct observations and zones;
 *   exact duplicates count once and integer minutes are conserved
 * - Percentages and reading counts still classify raw input rows, so callers
 *   should resolve conflicting duplicate observations before analysis
 *
 * @category Enhanced TIR
 * @public
 */
export function calculateEnhancedTIR(
  readings: GlucoseReading[],
  options?: EnhancedTIROptions
): EnhancedTIRResult {
  // Validate input
  if (readings.length === 0) {
    throw new EmptyDatasetError('Cannot calculate Enhanced TIR: readings array is empty')
  }

  const population: TIRPopulation = options?.population ?? 'standard'
  if (
    population !== 'standard' &&
    population !== 'older-adults' &&
    population !== 'high-risk'
  ) {
    throw new DomainError(
      'population must be standard, older-adults, or high-risk',
      'INVALID_OPTION'
    )
  }

  const thresholds: EnhancedTIRThresholds = {
    veryLow:
      options?.veryLowThreshold ?? DEFAULT_MGDL_THRESHOLDS.veryLow,
    low: options?.lowThreshold ?? DEFAULT_MGDL_THRESHOLDS.low,
    high: options?.highThreshold ?? DEFAULT_MGDL_THRESHOLDS.high,
    veryHigh:
      options?.veryHighThreshold ?? DEFAULT_MGDL_THRESHOLDS.veryHigh,
  }
  const thresholdValues = [
    thresholds.veryLow,
    thresholds.low,
    thresholds.high,
    thresholds.veryHigh,
  ]
  if (
    !thresholdValues.every(Number.isFinite) ||
    !(
      thresholdValues[0] < thresholdValues[1] &&
      thresholdValues[1] < thresholdValues[2] &&
      thresholdValues[2] < thresholdValues[3]
    )
  ) {
    throw new DomainError(
      'Enhanced TIR thresholds must be finite and strictly increasing',
      'INVALID_OPTION'
    )
  }

  const hasCustomThresholds =
    options?.veryLowThreshold !== undefined ||
    options?.lowThreshold !== undefined ||
    options?.highThreshold !== undefined ||
    options?.veryHighThreshold !== undefined
  const customThresholds = hasCustomThresholds ? thresholds : undefined
  const normalizedReadings: NormalizedReading[] = []
  const readingsByZone: Record<EnhancedTIRZone, NormalizedReading[]> = {
    veryLow: [],
    low: [],
    inRange: [],
    high: [],
    veryHigh: [],
  }

  for (const reading of readings) {
    assertSupportedGlucoseUnit(reading.unit)
    const normalizedReading: NormalizedReading = {
      ...reading,
      normalizedValue:
        reading.unit === MG_DL
          ? reading.value
          : reading.value * MGDL_MMOLL_CONVERSION,
    }
    validateNormalizedReading(normalizedReading, 600)
    normalizedReadings.push(normalizedReading)

    const zone = classifyEnhancedTIRZone(
      reading.value,
      reading.unit,
      normalizedReading.normalizedValue,
      customThresholds
    )
    readingsByZone[zone].push(normalizedReading)
  }

  const summary = calculateSummary(readings)
  const durations = allocateSlotDurations(
    readingsByZone,
    normalizedReadings,
    summary.totalDuration
  )
  const veryLow = calculateRangeMetrics(
    readingsByZone.veryLow,
    normalizedReadings,
    durations.veryLow
  )
  const low = calculateRangeMetrics(
    readingsByZone.low,
    normalizedReadings,
    durations.low
  )
  const inRange = calculateRangeMetrics(
    readingsByZone.inRange,
    normalizedReadings,
    durations.inRange
  )
  const high = calculateRangeMetrics(
    readingsByZone.high,
    normalizedReadings,
    durations.high
  )
  const veryHigh = calculateRangeMetrics(
    readingsByZone.veryHigh,
    normalizedReadings,
    durations.veryHigh
  )

  // Assess targets
  const meetsTargets = assessTargets(
    { veryLow, low, inRange, high, veryHigh },
    population,
    hasCustomThresholds ? 'configured-ranges' : 'consensus-ranges'
  )

  return {
    veryLow,
    low,
    inRange,
    high,
    veryHigh,
    meetsTargets,
    summary,
  }
}

/**
 * Calculates pregnancy-specific Time-in-Range metrics per ADA 2024 guidelines.
 *
 * Uses tighter target range for pregnancy: 63-140 mg/dL (3.5-7.8 mmol/L).
 * The quantified type 1 diabetes pregnancy targets are TIR >70%, total TBR
 * <4%, Level 2 TBR <1%, and TAR <25%.
 *
 * @param readings - Array of glucose readings with timestamp, value, and unit
 * @param options - Optional configuration for glucose unit
 * @returns Pregnancy TIR result with target assessment and recommendations
 *
 * @example
 * ```ts typecheck
 * import { calculatePregnancyTIR, type GlucoseReading } from '@glucoseiq/core'
 *
 * const readings: GlucoseReading[] = [
 *   { value: 100, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
 * ]
 * const result = calculatePregnancyTIR(readings)
 * console.log(`TIR: ${result.inRange.percentage}%`)
 * console.log(`Meets pregnancy targets: ${result.meetsPregnancyTargets}`)
 * ```
 *
 * @throws {EmptyDatasetError} If readings array is empty
 * @throws {DomainError} If readings contain invalid glucose values or units
 * @throws {DomainError} If `options.unit` is unsupported
 *
 * @see {@link https://diabetesjournals.org/care/article/47/Supplement_1/S282 | ADA Standards of Care (2024)}
 *
 * @remarks
 * - Target range: 63-140 mg/dL (3.5-7.8 mmol/L)
 * - `meetsPregnancyTargets` applies the quantified type 1 diabetes pregnancy targets
 * - For type 2 and gestational diabetes, the range is endorsed but the cited guideline does not quantify percentage goals
 * - Summary duration estimates occupied 5-minute timestamp slots; invalid
 *   timestamps do not add duration
 * - Each occupied slot is divided among its distinct observations and primary
 *   ranges; exact duplicates count once and integer minutes are conserved
 * - Percentages and reading counts still classify raw input rows, so callers
 *   should resolve conflicting duplicate observations before analysis
 * - This is informational only and does not constitute medical advice
 *
 * @category Pregnancy TIR
 * @public
 */
export function calculatePregnancyTIR(
  readings: GlucoseReading[],
  options?: PregnancyTIROptions
): PregnancyTIRResult {
  // Validate input
  if (readings.length === 0) {
    throw new EmptyDatasetError('Cannot calculate Pregnancy TIR: readings array is empty')
  }

  // Determine thresholds based on either supplied unit preference or predominant unit
  const preferredUnit = options?.unit
  if (
    preferredUnit !== undefined &&
    preferredUnit !== MG_DL &&
    preferredUnit !== MMOL_L
  ) {
    throw new DomainError('unit must be mg/dL or mmol/L', 'INVALID_OPTION')
  }
  const mgdlCount = readings.filter((r) => r.unit === MG_DL).length
  const useMgdlThresholds = preferredUnit
    ? preferredUnit === MG_DL
    : mgdlCount >= readings.length / 2

  // Use unit-specific thresholds to avoid floating point conversion issues
  const lowThreshold = useMgdlThresholds
    ? PREGNANCY_TARGET_LOW_MGDL
    : PREGNANCY_TARGET_LOW_MMOLL
  const highThreshold = useMgdlThresholds
    ? PREGNANCY_TARGET_HIGH_MGDL
    : PREGNANCY_TARGET_HIGH_MMOLL

  const normalizedReadings: NormalizedReading[] = []
  const belowRangeReadings: NormalizedReading[] = []
  const belowRangeLevel2Readings: NormalizedReading[] = []
  const inRangeReadings: NormalizedReading[] = []
  const aboveRangeReadings: NormalizedReading[] = []
  const maxValue = useMgdlThresholds ? 600 : 33.3
  const level2Threshold = useMgdlThresholds
    ? TIR_VERY_LOW_THRESHOLD_MGDL
    : TIR_VERY_LOW_THRESHOLD_MMOLL

  for (const reading of readings) {
    assertSupportedGlucoseUnit(reading.unit)
    let normalizedValue: number
    if (useMgdlThresholds) {
      normalizedValue =
        reading.unit === MG_DL
          ? reading.value
          : reading.value * MGDL_MMOLL_CONVERSION
    } else {
      normalizedValue =
        reading.unit === MG_DL
          ? reading.value / MGDL_MMOLL_CONVERSION
          : reading.value
    }
    const normalizedReading = { ...reading, normalizedValue }
    validateNormalizedReading(normalizedReading, maxValue)
    normalizedReadings.push(normalizedReading)

    if (normalizedValue < lowThreshold) {
      belowRangeReadings.push(normalizedReading)
      if (normalizedValue < level2Threshold) {
        belowRangeLevel2Readings.push(normalizedReading)
      }
    } else if (normalizedValue <= highThreshold) {
      inRangeReadings.push(normalizedReading)
    } else if (normalizedValue > highThreshold) {
      aboveRangeReadings.push(normalizedReading)
    }
  }

  const summary = calculateSummary(readings)
  const belowRangeLevel2Set = new Set(belowRangeLevel2Readings)
  const belowRangeLevel1Readings = belowRangeReadings.filter(
    (reading) => !belowRangeLevel2Set.has(reading)
  )
  const durations = allocateSlotDurations<PregnancyDurationZone>(
    {
      belowRangeLevel2: belowRangeLevel2Readings,
      belowRangeLevel1: belowRangeLevel1Readings,
      inRange: inRangeReadings,
      aboveRange: aboveRangeReadings,
    },
    normalizedReadings,
    summary.totalDuration
  )
  const belowRangeDuration =
    durations.belowRangeLevel2 + durations.belowRangeLevel1
  const belowRange = calculateRangeMetrics(
    belowRangeReadings,
    normalizedReadings,
    belowRangeDuration
  )
  const belowRangeLevel2 = calculateRangeMetrics(
    belowRangeLevel2Readings,
    normalizedReadings,
    durations.belowRangeLevel2
  )
  const inRange = calculateRangeMetrics(
    inRangeReadings,
    normalizedReadings,
    durations.inRange
  )
  const aboveRange = calculateRangeMetrics(
    aboveRangeReadings,
    normalizedReadings,
    durations.aboveRange
  )
  const rawPregnancyPercentages = {
    belowRange: rawPercentage(
      belowRangeReadings.length,
      normalizedReadings.length
    ),
    belowRangeLevel2: rawPercentage(
      belowRangeLevel2Readings.length,
      normalizedReadings.length
    ),
    inRange: rawPercentage(inRangeReadings.length, normalizedReadings.length),
    aboveRange: rawPercentage(
      aboveRangeReadings.length,
      normalizedReadings.length
    ),
  }

  // Assess pregnancy targets
  const meetsPregnancyTargets =
    rawPregnancyPercentages.inRange > TIR_GOAL_STANDARD && // TIR >70%
    rawPregnancyPercentages.belowRange < TBR_LEVEL1_GOAL && // TBR <4%
    rawPregnancyPercentages.belowRangeLevel2 < TBR_LEVEL2_GOAL && // Level 2 TBR <1%
    rawPregnancyPercentages.aboveRange < TAR_LEVEL1_GOAL // TAR <25%

  // Generate recommendations
  const recommendations = generatePregnancyRecommendations({
    belowRange,
    belowRangeLevel2,
    inRange,
    aboveRange,
  }, rawPregnancyPercentages)

  return {
    belowRange,
    belowRangeLevel2,
    inRange,
    aboveRange,
    meetsPregnancyTargets,
    recommendations,
    summary,
  }
}

/** Validates a runtime glucose-unit value before any unit-dependent branch. */
function assertSupportedGlucoseUnit(
  unit: unknown
): asserts unit is GlucoseUnit {
  if (unit !== MG_DL && unit !== MMOL_L) {
    throw new DomainError(
      `Unsupported glucose unit: ${String(unit)}`,
      'INVALID_UNIT'
    )
  }
}

/**
 * Validates normalized glucose values are within acceptable range.
 *
 * @param readings - Normalized readings to validate
 * @param maxValue - Maximum acceptable value (600 mg/dL or 33.3 mmol/L)
 * @throws {Error} If any reading is invalid
 *
 * @internal
 */
function validateNormalizedReading(
  reading: NormalizedReading,
  maxValue: number
): void {
  if (
    reading.normalizedValue <= 0 ||
    reading.normalizedValue > maxValue ||
    !Number.isFinite(reading.normalizedValue)
  ) {
    const unitSuffix = maxValue === 600 ? ' mg/dL' : ''
    throw new DomainError(
      `Invalid glucose value: ${reading.value} ${reading.unit} (normalized: ${reading.normalizedValue}${unitSuffix})`,
      'INVALID_GLUCOSE_VALUE'
    )
  }
}

/**
 * Classifies one Enhanced TIR reading using mutually exclusive comparisons.
 *
 * @internal
 */
function classifyEnhancedTIRZone(
  nativeValue: number,
  unit: GlucoseUnit,
  normalizedMgDl: number,
  customThresholds?: EnhancedTIRThresholds
): EnhancedTIRZone {
  const useCustomThresholds = customThresholds !== undefined
  const value = useCustomThresholds ? normalizedMgDl : nativeValue
  const thresholds =
    customThresholds ??
    (unit === MG_DL ? DEFAULT_MGDL_THRESHOLDS : DEFAULT_MMOLL_THRESHOLDS)

  if (value < thresholds.veryLow) return 'veryLow'
  if (value < thresholds.low) return 'low'
  if (value <= thresholds.high) return 'inRange'
  if (value <= thresholds.veryHigh) return 'high'
  return 'veryHigh'
}

/**
 * Allocates each occupied five-minute slot across its distinct observations.
 * Invalid timestamps contribute no duration, exact duplicate observations are
 * collapsed, and largest-remainder apportionment conserves integer minutes.
 *
 * @internal
 */
function allocateSlotDurations<Zone extends string>(
  readingsByZone: Readonly<Record<Zone, readonly NormalizedReading[]>>,
  allReadings: readonly NormalizedReading[],
  totalDuration: number
): Record<Zone, number> {
  const zones = Object.keys(readingsByZone) as Zone[]
  const durations = Object.fromEntries(
    zones.map((zone) => [zone, 0])
  ) as Record<Zone, number>
  if (totalDuration === 0) return durations

  const zoneByReading = new Map<NormalizedReading, Zone>()
  for (const zone of zones) {
    for (const reading of readingsByZone[zone]) {
      zoneByReading.set(reading, zone)
    }
  }

  const timestampByReading = new Map<NormalizedReading, number>()
  let earliestTimestamp = Infinity
  for (const reading of allReadings) {
    const timestamp = new Date(reading.timestamp).getTime()
    if (!Number.isFinite(timestamp)) continue
    timestampByReading.set(reading, timestamp)
    if (timestamp < earliestTimestamp) earliestTimestamp = timestamp
  }

  const intervalMs = DEFAULT_CGM_INTERVAL_MINUTES * 60_000
  const observationsBySlot = new Map<number, Map<string, Zone>>()
  for (const reading of allReadings) {
    const timestamp = timestampByReading.get(reading)
    if (timestamp === undefined) continue
    const slot = Math.floor((timestamp - earliestTimestamp) / intervalMs)
    const observationKey = JSON.stringify([
      reading.timestamp,
      reading.unit,
      reading.value,
    ])
    let observations = observationsBySlot.get(slot)
    if (observations === undefined) {
      observations = new Map()
      observationsBySlot.set(slot, observations)
    }
    if (!observations.has(observationKey)) {
      observations.set(observationKey, zoneByReading.get(reading)!)
    }
  }

  const rawDurations = Object.fromEntries(
    zones.map((zone) => [zone, 0])
  ) as Record<Zone, number>
  for (const observations of observationsBySlot.values()) {
    const counts = Object.fromEntries(
      zones.map((zone) => [zone, 0])
    ) as Record<Zone, number>
    for (const zone of observations.values()) counts[zone] += 1
    for (const zone of zones) {
      rawDurations[zone] +=
        (counts[zone] / observations.size) * DEFAULT_CGM_INTERVAL_MINUTES
    }
  }

  for (const zone of zones) durations[zone] = Math.floor(rawDurations[zone])
  let remaining =
    totalDuration - zones.reduce((sum, zone) => sum + durations[zone], 0)
  const zoneOrder = new Map(zones.map((zone, index) => [zone, index]))
  const remainderOrder = [...zones].sort((a, b) => {
    const difference =
      rawDurations[b] - Math.floor(rawDurations[b]) -
      (rawDurations[a] - Math.floor(rawDurations[a]))
    return difference || zoneOrder.get(a)! - zoneOrder.get(b)!
  })
  for (const zone of remainderOrder) {
    if (remaining === 0) break
    durations[zone] += 1
    remaining -= 1
  }

  return durations
}

/**
 * Calculates detailed metrics for a specific glucose range.
 *
 * @param rangeReadings - Normalized glucose readings in this range
 * @param allReadings - All normalized glucose readings in the calculation
 * @param duration - Conserved timestamp-slot duration for this range
 * @returns Range metrics with percentage, duration, count, and average
 *
 * @internal
 */
function calculateRangeMetrics(
  rangeReadings: NormalizedReading[],
  allReadings: NormalizedReading[],
  duration: number
): RangeMetrics {
  const readingCount = rangeReadings.length
  const percentage = (readingCount / allReadings.length) * 100

  // Calculate average value in this range
  const averageValue =
    readingCount > 0
      ? rangeReadings.reduce((sum, r) => sum + r.normalizedValue, 0) /
        readingCount
      : null

  return {
    percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal
    duration,
    readingCount,
    averageValue: averageValue ? Math.round(averageValue) : null,
  }
}

/**
 * Calculates summary statistics for TIR result.
 *
 * @param readings - Array of glucose readings
 * @returns Summary with total readings, duration, and data quality
 *
 * @internal
 */
function calculateSummary(readings: GlucoseReading[]): TIRSummary {
  const totalReadings = readings.length
  const coverage = calculateActivePercent(readings, {
    expectedIntervalMinutes: DEFAULT_CGM_INTERVAL_MINUTES,
  })
  const hasDefensibleSpan = coverage.expectedReadings > 0
  const totalDuration = hasDefensibleSpan
    ? coverage.actualReadings * DEFAULT_CGM_INTERVAL_MINUTES
    : 0
  const daysOfData = hasDefensibleSpan
    ? (coverage.expectedReadings * DEFAULT_CGM_INTERVAL_MINUTES) / (60 * 24)
    : 0
  let dataQuality: 'excellent' | 'good' | 'fair' | 'poor'
  if (!coverage.meetsClinicalMinimum) {
    dataQuality = 'poor'
  } else if (daysOfData >= 14) {
    dataQuality = 'excellent'
  } else if (daysOfData >= 7) {
    dataQuality = 'good'
  } else if (daysOfData >= 3) {
    dataQuality = 'fair'
  } else {
    dataQuality = 'poor'
  }

  return {
    totalReadings,
    totalDuration,
    dataQuality,
  }
}

/**
 * Selects population-specific consensus goals.
 *
 * @param population - Population type
 * @returns Object with TIR, TBR, and TAR goals for the population
 *
 * @internal
 */
function getPopulationGoals(population: TIRPopulation) {
  const isStandard = population === 'standard'
  return {
    tirGoal: isStandard ? TIR_GOAL_STANDARD : TIR_GOAL_OLDER_ADULTS,
    tbrLevel1Goal: isStandard ? TBR_LEVEL1_GOAL : TBR_LEVEL1_GOAL_OLDER_ADULTS,
    tbrLevel2Goal: isStandard ? TBR_LEVEL2_GOAL : TBR_LEVEL2_GOAL_OLDER_ADULTS,
    tarLevel1Goal: isStandard ? TAR_LEVEL1_GOAL : TAR_LEVEL1_GOAL_OLDER_ADULTS,
    tarLevel2Goal: isStandard ? TAR_LEVEL2_GOAL : TAR_LEVEL2_GOAL_OLDER_ADULTS,
  }
}

interface RawRangePercentages {
  readonly veryLow: number
  readonly low: number
  readonly inRange: number
  readonly high: number
  readonly veryHigh: number
  readonly totalTbr: number
  readonly totalTar: number
}

function rawPercentage(readingCount: number, totalReadings: number): number {
  return (readingCount / totalReadings) * 100
}

function calculateRawRangePercentages(ranges: {
  veryLow: RangeMetrics
  low: RangeMetrics
  inRange: RangeMetrics
  high: RangeMetrics
  veryHigh: RangeMetrics
}): RawRangePercentages {
  const totalReadings =
    ranges.veryLow.readingCount +
    ranges.low.readingCount +
    ranges.inRange.readingCount +
    ranges.high.readingCount +
    ranges.veryHigh.readingCount
  return {
    veryLow: rawPercentage(ranges.veryLow.readingCount, totalReadings),
    low: rawPercentage(ranges.low.readingCount, totalReadings),
    inRange: rawPercentage(ranges.inRange.readingCount, totalReadings),
    high: rawPercentage(ranges.high.readingCount, totalReadings),
    veryHigh: rawPercentage(ranges.veryHigh.readingCount, totalReadings),
    totalTbr: rawPercentage(
      ranges.veryLow.readingCount + ranges.low.readingCount,
      totalReadings
    ),
    totalTar: rawPercentage(
      ranges.high.readingCount + ranges.veryHigh.readingCount,
      totalReadings
    ),
  }
}

/**
 * Assesses whether TIR metrics meet consensus targets.
 *
 * @param ranges - Calculated range metrics
 * @param population - Population type for target selection
 * @returns Target assessment with goals and recommendations
 *
 * @internal
 */
function assessTargets(
  ranges: {
    veryLow: RangeMetrics
    low: RangeMetrics
    inRange: RangeMetrics
    high: RangeMetrics
    veryHigh: RangeMetrics
  },
  population: TIRPopulation,
  targetBasis: TargetAssessment['targetBasis']
): TargetAssessment {
  // Select goals based on population
  const {
    tirGoal,
    tbrLevel1Goal,
    tbrLevel2Goal,
    tarLevel1Goal,
    tarLevel2Goal,
  } = getPopulationGoals(population)
  const raw = calculateRawRangePercentages(ranges)

  // Assess unrounded percentages; public RangeMetrics remain rounded for display.
  const tirMeetsGoal = raw.inRange > tirGoal
  const tbrLevel1Safe = raw.totalTbr < tbrLevel1Goal
  const tbrLevel2Safe = raw.veryLow < tbrLevel2Goal
  const tarLevel1Acceptable = raw.totalTar < tarLevel1Goal
  const tarLevel2Acceptable = raw.veryHigh < tarLevel2Goal

  // Determine overall assessment
  let overallAssessment: TIRAssessment
  const criticalIssues = !tbrLevel2Safe || !tarLevel2Acceptable

  const majorIssues = !tbrLevel1Safe || !tirMeetsGoal || !tarLevel1Acceptable

  if (criticalIssues) {
    overallAssessment = 'concerning'
  } else if (majorIssues) {
    overallAssessment = 'needs improvement'
  } else if (
    raw.inRange > tirGoal + 10 &&
    raw.veryLow < 0.5
  ) {
    overallAssessment = 'excellent'
  } else {
    overallAssessment = 'good'
  }

  // Generate recommendations
  const recommendations = generateRecommendations({
    ranges,
    tirMeetsGoal,
    tbrLevel1Safe,
    tbrLevel2Safe,
    tarLevel1Acceptable,
    tarLevel2Acceptable,
    population,
    targetBasis,
    raw,
  })

  return {
    tirMeetsGoal,
    tbrLevel1Safe,
    tbrLevel2Safe,
    tarLevel1Acceptable,
    tarLevel2Acceptable,
    targetBasis,
    overallAssessment,
    recommendations,
  }
}

/**
 * Generates observations based on TIR metrics.
 *
 * @param params - Assessment parameters
 * @returns Array of informational observations (not medical advice)
 *
 * @internal
 */
function generateRecommendations(params: {
  ranges: {
    veryLow: RangeMetrics
    low: RangeMetrics
    inRange: RangeMetrics
    high: RangeMetrics
    veryHigh: RangeMetrics
  }
  tirMeetsGoal: boolean
  tbrLevel1Safe: boolean
  tbrLevel2Safe: boolean
  tarLevel1Acceptable: boolean
  tarLevel2Acceptable: boolean
  population: TIRPopulation
  targetBasis: TargetAssessment['targetBasis']
  raw: RawRangePercentages
}): readonly string[] {
  const recommendations: string[] = []
  const targetLabel =
    params.targetBasis === 'consensus-ranges'
      ? 'consensus target'
      : 'configured-range target'

  if (!params.tbrLevel2Safe) {
    recommendations.push(
      `Level 2 hypoglycemia (${params.ranges.veryLow.percentage.toFixed(
        1
      )}%) exceeds the ${targetLabel}.`
    )
  }

  if (!params.tarLevel2Acceptable) {
    recommendations.push(
      `Level 2 hyperglycemia (${params.ranges.veryHigh.percentage.toFixed(
        1
      )}%) exceeds the ${targetLabel}.`
    )
  }

  if (!params.tbrLevel1Safe && params.tbrLevel2Safe) {
    recommendations.push(
      `Total time below range (${params.raw.totalTbr.toFixed(
        1
      )}%) is elevated against the ${targetLabel}.`
    )
  }

  if (!params.tarLevel1Acceptable && params.tarLevel2Acceptable) {
    recommendations.push(
      `Total time above range (${params.raw.totalTar.toFixed(
        1
      )}%) is elevated against the ${targetLabel}.`
    )
  }

  if (!params.tirMeetsGoal && params.tbrLevel1Safe && params.tbrLevel2Safe) {
    recommendations.push(
      `Time-in-range (${params.ranges.inRange.percentage.toFixed(
        1
      )}%) does not exceed the ${targetLabel}.`
    )
  }

  if (
    params.tirMeetsGoal &&
    params.tbrLevel1Safe &&
    params.tbrLevel2Safe &&
    params.tarLevel1Acceptable &&
    params.tarLevel2Acceptable
  ) {
    recommendations.push(
      params.targetBasis === 'consensus-ranges'
        ? 'All metrics meet consensus targets.'
        : 'All metrics meet the population percentage goals for the configured ranges.'
    )
    /* c8 ignore start -- defensive fallback when no recommendations were generated */
  } else if (
    params.tbrLevel2Safe &&
    params.tarLevel2Acceptable &&
    recommendations.length === 0
  ) {
    recommendations.push(
      params.targetBasis === 'consensus-ranges'
        ? 'Some metrics are outside consensus targets.'
        : 'Some metrics are outside the population percentage goals for the configured ranges.'
    )
  }
  /* c8 ignore stop */

  if (
    params.population === 'older-adults' ||
    params.population === 'high-risk'
  ) {
    recommendations.push(
      params.targetBasis === 'consensus-ranges'
        ? 'Older/high-risk population targets applied (lower TIR goal, stricter total TBR limit, and wider TAR limits).'
        : 'Older/high-risk percentage goals applied to the configured ranges.'
    )
  }

  return recommendations
}

/**
 * Generates pregnancy-specific observations.
 *
 * @param ranges - Pregnancy range metrics
 * @returns Array of pregnancy-specific observations (not medical advice)
 *
 * @internal
 */
function generatePregnancyRecommendations(ranges: {
  belowRange: RangeMetrics
  belowRangeLevel2: RangeMetrics
  inRange: RangeMetrics
  aboveRange: RangeMetrics
}, raw: {
  belowRange: number
  belowRangeLevel2: number
  inRange: number
  aboveRange: number
}): readonly string[] {
  const recommendations: string[] = []

  if (raw.belowRange >= TBR_LEVEL1_GOAL) {
    recommendations.push(
      `Time below range (${ranges.belowRange.percentage.toFixed(
        1
      )}%) exceeds the pregnancy consensus target.`
    )
  }

  if (raw.belowRangeLevel2 >= TBR_LEVEL2_GOAL) {
    recommendations.push(
      `Level 2 time below range (${ranges.belowRangeLevel2.percentage.toFixed(
        1
      )}%) does not meet the pregnancy target of <1%.`
    )
  }

  if (raw.aboveRange >= TAR_LEVEL1_GOAL) {
    recommendations.push(
      `Time above range (${ranges.aboveRange.percentage.toFixed(
        1
      )}%) exceeds the pregnancy consensus target.`
    )
  }

  if (raw.inRange <= TIR_GOAL_STANDARD) {
    recommendations.push(
      `Time-in-range (${ranges.inRange.percentage.toFixed(
        1
      )}%) does not exceed the pregnancy target of 70%.`
    )
  }

  if (
    raw.inRange > TIR_GOAL_STANDARD &&
    raw.belowRange < TBR_LEVEL1_GOAL &&
    raw.belowRangeLevel2 < TBR_LEVEL2_GOAL &&
    raw.aboveRange < TAR_LEVEL1_GOAL
  ) {
    recommendations.push(
      'All metrics meet pregnancy consensus targets.'
    )
    /* c8 ignore start -- defensive fallback when no recommendations were generated */
  } else if (recommendations.length === 0) {
    recommendations.push(
      'Some pregnancy metrics are outside consensus targets.'
    )
  }
  /* c8 ignore stop */

  recommendations.push(
    'Pregnancy target range: 63-140 mg/dL (3.5-7.8 mmol/L).'
  )

  return recommendations
}
