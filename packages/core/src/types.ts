// @file src/types.ts

import { MG_DL, MMOL_L } from './constants'

/**
 * Supported glucose units for analytics and conversions.
 * @see https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BIOPRO_L.htm
 */
export type GlucoseUnit = typeof MG_DL | typeof MMOL_L

/**
 * List of glucose units accepted by validation and conversion APIs.
 * @see https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BIOPRO_L.htm
 */
export const AllowedGlucoseUnits: GlucoseUnit[] = [MG_DL, MMOL_L]

/**
 * Single glucose reading.
 * Includes value, unit, and ISO 8601 timestamp for analytics.
 * @see https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7445493/
 */
export interface GlucoseReading {
  readonly value: number
  readonly unit: GlucoseUnit
  readonly timestamp: string // ISO 8601
}

/**
 * Result object for Time-in-Range (TIR) analytics.
 * Percentages for in-range, below-range, and above-range readings.
 * @see https://care.diabetesjournals.org/content/42/8/1593
 */
export interface TIRResult {
  inRange: number
  belowRange: number
  aboveRange: number
}

/**
 * Options for GMI (Glucose Management Indicator) estimation.
 * Used to standardize GMI calculation input.
 * @see https://diatribe.org/glucose-management-indicator-gmi
 */
export interface EstimateGMIOptions {
  value: number
  unit: GlucoseUnit
}

/**
 * Result of glucose unit conversion.
 * Provides converted value and new unit for interoperability.
 * @see https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BIOPRO_L.htm
 */
export interface ConversionResult {
  /** Converted glucose value */
  readonly value: number
  /** New glucose unit after conversion */
  readonly unit: GlucoseUnit
}

/**
 * Options for Time-in-Range (TIR) analytics.
 */
export interface TIROptions {
  readings: GlucoseReading[]
  unit: GlucoseUnit
  range: [number, number]
}

/**
 * Single A1C reading (value and ISO date).
 */
export interface A1CReading {
  value: number
  date: string // ISO 8601 date string
}

/**
 * Options for glucose statistics analytics.
 * Controls which metrics are calculated and reported.
 */
export interface GlucoseStatsOptions {
  readings: GlucoseReading[]
  unit: GlucoseUnit
  range: [number, number]
  gmi?: boolean
  a1c?: boolean
  tir?: boolean
  tirRange?: [number, number]
  tirPercent?: boolean
  tirPercentBelow?: boolean
  tirPercentAbove?: boolean
  tirPercentInRange?: boolean
  tirPercentBelowRounded?: boolean
  tirPercentAboveRounded?: boolean
  tirPercentInRangeRounded?: boolean
}

// ============================================================================
// Enhanced Time-in-Range (TIR) Types
// Per International Consensus on Time in Range (Battelino et al. 2019)
// ============================================================================

/**
 * Population type for TIR target assessment.
 * Different populations use different published target sets.
 * @see {@link https://diabetesjournals.org/care/article/42/8/1593 | International Consensus on Time in Range (2019)}
 */
export type TIRPopulation = 'standard' | 'older-adults' | 'high-risk'

/**
 * Overall glycemic control assessment based on TIR metrics.
 */
export type TIRAssessment = 'excellent' | 'good' | 'needs improvement' | 'concerning'

/**
 * Detailed metrics for a single glucose range.
 * Provides percentage, duration, count, and average value for analytics.
 */
export interface RangeMetrics {
  /** Percentage of readings in this range (0-100) */
  readonly percentage: number
  /** Estimated occupied-slot duration allocated to this range (minutes). */
  readonly duration: number
  /** Count of readings in this range */
  readonly readingCount: number
  /** Average glucose value in this range (mg/dL or mmol/L) */
  readonly averageValue: number | null
}

/**
 * Assessment of raw TIR percentages against population goals.
 * Custom range thresholds retain the percentage goals but are explicitly
 * marked as configured rather than consensus ranges.
 * @see {@link https://diabetesjournals.org/care/article/42/8/1593 | International Consensus on Time in Range (2019)}
 */
export interface TargetAssessment {
  /** Whether raw TIR exceeds 70% for standard or 50% for older/high-risk populations. */
  readonly tirMeetsGoal: boolean
  /** Whether cumulative raw TBR is <4% for standard or <1% for older/high-risk populations. */
  readonly tbrLevel1Safe: boolean
  /** Whether raw Level 2 TBR is <1%. */
  readonly tbrLevel2Safe: boolean
  /** Whether cumulative raw TAR is <25% for standard or <50% for older/high-risk populations. */
  readonly tarLevel1Acceptable: boolean
  /** Whether raw Level 2 TAR is <5% for standard or <10% for older/high-risk populations. */
  readonly tarLevel2Acceptable: boolean
  /** Whether percentage goals were applied to consensus ranges or caller-configured ranges. */
  readonly targetBasis: 'consensus-ranges' | 'configured-ranges'
  /** Overall assessment label derived from the configured targets */
  readonly overallAssessment: TIRAssessment
  /** Informational notes derived from the metrics */
  readonly recommendations: readonly string[]
}

/**
 * Summary statistics for TIR calculation.
 */
export interface TIRSummary {
  /** Total number of glucose readings analyzed */
  readonly totalReadings: number
  /** Estimated occupied 5-minute timestamp-slot coverage (minutes). */
  readonly totalDuration: number
  /** Coverage grade based on observed span and at least 70% occupied slots. */
  readonly dataQuality: 'excellent' | 'good' | 'fair' | 'poor'
}

/**
 * Complete Enhanced Time-in-Range result.
 * Provides a five-range glucose breakdown using the 2019 consensus thresholds.
 * @see {@link https://diabetesjournals.org/care/article/42/8/1593 | International Consensus on Time in Range (2019)}
 */
export interface EnhancedTIRResult {
  /** Very Low: <54 mg/dL (3.0 mmol/L) - Level 2 Hypoglycemia. Average value is reported in mg/dL. */
  readonly veryLow: RangeMetrics
  /** Low: 54-69 mg/dL (3.0-3.8 mmol/L) - Level 1 Hypoglycemia. Average value is reported in mg/dL. */
  readonly low: RangeMetrics
  /** In Range: 70-180 mg/dL (3.9-10.0 mmol/L) - Target Range. Average value is reported in mg/dL. */
  readonly inRange: RangeMetrics
  /** High: 181-250 mg/dL (10.1-13.9 mmol/L) - Level 1 Hyperglycemia. Average value is reported in mg/dL. */
  readonly high: RangeMetrics
  /** Very High: >250 mg/dL (>13.9 mmol/L) - Level 2 Hyperglycemia. Average value is reported in mg/dL. */
  readonly veryHigh: RangeMetrics
  /** Assessment against the configured targets */
  readonly meetsTargets: TargetAssessment
  /** Summary statistics */
  readonly summary: TIRSummary
}

/**
 * Options that select a population goal set or override Enhanced TIR
 * thresholds.
 */
export interface EnhancedTIROptions {
  /** Population type for target assessment (default: 'standard') */
  readonly population?: TIRPopulation
  /** Override for the very low threshold (<54 mg/dL). Value must be provided in mg/dL. */
  readonly veryLowThreshold?: number
  /** Override for the low threshold (54-69 mg/dL). Value must be provided in mg/dL. */
  readonly lowThreshold?: number
  /** Override for the high threshold (181-250 mg/dL). Value must be provided in mg/dL. */
  readonly highThreshold?: number
  /** Override for the very high threshold (>250 mg/dL). Value must be provided in mg/dL. */
  readonly veryHighThreshold?: number
}

/**
 * Pregnancy-specific Time-in-Range result.
 * Uses tighter target range per ADA 2024 guidelines for pregnancy.
 * @see {@link https://diabetesjournals.org/care/article/47/Supplement_1/S282 | ADA Standards of Care (2024)}
 */
export interface PregnancyTIRResult {
  /** In Range: 63-140 mg/dL (3.5-7.8 mmol/L) */
  readonly inRange: RangeMetrics
  /** Below Range: <63 mg/dL (3.5 mmol/L) */
  readonly belowRange: RangeMetrics
  /** Level 2 Below Range: <54 mg/dL (<3.0 mmol/L). This is a subset of `belowRange`. */
  readonly belowRangeLevel2: RangeMetrics
  /** Above Range: >140 mg/dL (7.8 mmol/L) */
  readonly aboveRange: RangeMetrics
  /** Whether metrics meet type 1 diabetes pregnancy targets (TIR >70%, TBR <63 mg/dL <4%, TBR <54 mg/dL <1%, TAR >140 mg/dL <25%) */
  readonly meetsPregnancyTargets: boolean
  /** Informational notes derived from the metrics */
  readonly recommendations: readonly string[]
  /** Summary statistics */
  readonly summary: TIRSummary
}

/**
 * Options for Pregnancy TIR calculation.
 */
export interface PregnancyTIROptions {
  /** Unit used to normalize mixed-unit readings for pregnancy thresholds. Defaults to the predominant reading unit. */
  readonly unit?: GlucoseUnit
}
