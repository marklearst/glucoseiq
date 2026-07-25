/**
 * @file src/score.ts
 *
 * The "Glucose IQ" score is a project-defined 0–100 wellness heuristic derived
 * from the Glycemia Risk Index (GRI). It calculates 100 minus GRI, so higher
 * values indicate lower GRI.
 *
 * It is not diagnostic and does not constitute medical advice.
 *
 * @see https://doi.org/10.1177/19322968221085273  Klonoff et al. (2023), GRI
 */

import type { GlucoseReading } from './types'
import { MG_DL, MGDL_MMOLL_CONVERSION, MMOL_L } from './constants'
import { calculateEnhancedTIR } from './tir-enhanced'
import { calculateGRI, type GRIResult } from './metrics/gri'

/** Qualitative rating derived from the Glucose IQ score. */
export type GlucoseIQRating =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'needs attention'
  | 'insufficient'

/** Result of {@link glucoseIQScore}. */
export interface GlucoseIQScore {
  /** 0–100 score, higher is better (100 − GRI). */
  readonly score: number
  /** Underlying Glycemia Risk Index. */
  readonly gri: number
  /** GRI risk zone (A best … E worst), or null if not computable. */
  readonly zone: GRIResult['zone'] | null
  /** Qualitative rating. */
  readonly rating: GlucoseIQRating
  /** Whether the score could be computed. */
  readonly valid: boolean
}

/**
 * Computes the project-defined, non-diagnostic Glucose IQ wellness heuristic.
 *
 * @param readings - Glucose readings with ISO 8601 timestamps
 * @returns Score, underlying GRI, zone, and a qualitative rating
 *
 * @example
 * ```ts typecheck
 * import { glucoseIQScore, type GlucoseReading } from '@glucoseiq/core'
 *
 * const readings: GlucoseReading[] = [
 *   { value: 110, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
 *   { value: 145, unit: 'mg/dL', timestamp: '2024-01-01T08:05:00Z' },
 * ]
 * const result = glucoseIQScore(readings)
 * const score = result.valid ? result.score : null
 * void score
 * ```
 *
 * @category Score
 * @public
 */
export function glucoseIQScore(readings: GlucoseReading[]): GlucoseIQScore {
  const clean = readings.filter((r) => {
    if (!Number.isFinite(r.value) || r.value <= 0) return false
    if (r.unit !== MG_DL && r.unit !== MMOL_L) return false
    const mgdl = r.unit === MG_DL ? r.value : r.value * MGDL_MMOLL_CONVERSION
    if (mgdl > 600) return false
    return !Number.isNaN(Date.parse(r.timestamp))
  })

  if (clean.length === 0) {
    return { score: NaN, gri: NaN, zone: null, rating: 'insufficient', valid: false }
  }

  const tir = calculateEnhancedTIR(clean)
  const gri = calculateGRI({
    veryLowPercent: tir.veryLow.percentage,
    lowPercent: tir.low.percentage,
    highPercent: tir.high.percentage,
    veryHighPercent: tir.veryHigh.percentage,
  })

  const score = Math.max(0, Math.min(100, Math.round(100 - gri.score)))
  const rating: GlucoseIQRating =
    score >= 90 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'needs attention'

  return { score, gri: gri.score, zone: gri.zone, rating, valid: true }
}
