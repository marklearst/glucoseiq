/**
 * @file src/metrics/active-percent.ts
 *
 * Active Percent (timestamp-slot coverage).
 *
 * Active percent measures the proportion of expected cadence slots that
 * contain at least one parseable timestamp. Duplicate rows and multiple rows
 * in one slot count once. This is a data-coverage estimate, not proof of
 * sensor wear or clinical suitability.
 *
 * Formula (Danne et al. 2017):
 *   active% = (occupied_slots / expected_slots) * 100
 *   expected_readings = time_span / expected_interval
 *
 * @see https://doi.org/10.2337/dc17-1600  Danne et al. (2017)
 */

import type { GlucoseReading } from '../types'
import { DomainError } from '../errors'

/** Options for active percent calculation. */
export interface ActivePercentOptions {
  /** Positive finite expected interval between readings in minutes (default: 5). */
  readonly expectedIntervalMinutes?: number
}

/** Result of the active percent calculation. */
export interface ActivePercentResult {
  /** Percentage of expected timestamp slots that were occupied (0-100). */
  readonly activePercent: number
  /** Number of expected-interval slots containing at least one parseable timestamp. */
  readonly actualReadings: number
  /** Number of expected timestamp slots based on time span and interval. */
  readonly expectedReadings: number
  /** Total time span covered in minutes */
  readonly totalMinutes: number
  /** Whether the unrounded slot-coverage ratio is at least 70%. Compatibility field; not a clinical determination. */
  readonly meetsClinicalMinimum: boolean
}

/**
 * Calculates a timestamp-slot coverage estimate for CGM readings.
 *
 * @param readings - Array of GlucoseReading objects with timestamps
 * @param options - Expected interval configuration
 * @returns Slot-coverage result, or a result with NaN if the timestamp span is insufficient
 * @throws {DomainError} If `expectedIntervalMinutes` is invalid or creates an unsafe slot count
 * @remarks This estimates data coverage; it does not prove sensor wear or clinical suitability.
 * @see https://doi.org/10.2337/dc17-1600
 */
export function calculateActivePercent(
  readings: GlucoseReading[],
  options?: ActivePercentOptions
): ActivePercentResult {
  const intervalMin = options?.expectedIntervalMinutes ?? 5
  if (!Number.isFinite(intervalMin) || intervalMin <= 0) {
    throw new DomainError(
      'expectedIntervalMinutes must be positive and finite',
      'INVALID_OPTION'
    )
  }

  const timestamps = [
    ...new Set(
      readings
        .map((r) => new Date(r.timestamp).getTime())
        .filter((t) => Number.isFinite(t))
    ),
  ].sort((a, b) => a - b)

  if (timestamps.length < 2) {
    return {
      activePercent: NaN,
      actualReadings: timestamps.length,
      expectedReadings: 0,
      totalMinutes: 0,
      meetsClinicalMinimum: false,
    }
  }

  const spanMs = timestamps[timestamps.length - 1] - timestamps[0]
  const totalMinutes = spanMs / (1000 * 60)
  const expectedReadings = Math.floor(totalMinutes / intervalMin) + 1
  if (!Number.isSafeInteger(expectedReadings) || expectedReadings < 1) {
    throw new DomainError(
      'expectedIntervalMinutes creates an unsafe expected slot count',
      'INVALID_OPTION'
    )
  }
  const intervalMs = intervalMin * 60_000
  const actualReadings = new Set(
    timestamps.map((timestamp) =>
      Math.floor((timestamp - timestamps[0]) / intervalMs)
    )
  ).size
  const rawActivePercent = (actualReadings / expectedReadings) * 100

  const activePercent = Math.round(rawActivePercent * 10) / 10

  return {
    activePercent,
    actualReadings,
    expectedReadings,
    totalMinutes: Math.round(totalMinutes * 10) / 10,
    meetsClinicalMinimum: rawActivePercent >= 70,
  }
}
