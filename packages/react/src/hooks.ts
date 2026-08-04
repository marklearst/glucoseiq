/**
 * @file src/hooks.ts
 *
 * React hooks for @glucoseiq/core results.
 *
 * Report, profile, score, meal response, latest reading, and trend results use
 * `useMemo`. They update when React receives a different readings array,
 * options object, or other hook input. `useGlucoseLive` recalculates reading
 * age on every render. When set, `refreshMs` requests interval renders so
 * reading age can change while the readings stay the same.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  analyzeGlucose,
  buildAGPProfile,
  glucoseIQScore,
  analyzeMealResponse,
  computeGlucoseTrend,
  latestReading,
  minutesSinceLastReading,
  DomainError,
  type GlucoseReading,
  type AnalyzeGlucoseOptions,
  type AnalyzeGlucoseResult,
  type AGPProfileOptions,
  type AGPProfileResult,
  type GlucoseIQScore,
  type MealResponseOptions,
  type MealResponseResult,
  type GlucoseTrendOptions,
  type GlucoseTrendResult,
} from '@glucoseiq/core'

const MAX_REFRESH_INTERVAL_MS = 2_147_483_647

function validateRefreshInterval(refreshMs: number | undefined): number | undefined {
  if (refreshMs === undefined) return undefined
  if (
    !Number.isFinite(refreshMs) ||
    !Number.isInteger(refreshMs) ||
    refreshMs <= 0 ||
    refreshMs > MAX_REFRESH_INTERVAL_MS
  ) {
    throw new DomainError(
      `refreshMs must be a whole number from 1 through ${MAX_REFRESH_INTERVAL_MS}`,
      'INVALID_OPTION',
    )
  }
  return refreshMs
}

/** Returns a memoized glucose report. */
export function useGlucoseAnalysis(
  readings: GlucoseReading[],
  options?: AnalyzeGlucoseOptions
): AnalyzeGlucoseResult {
  return useMemo(() => analyzeGlucose(readings, options), [readings, options])
}

/** Returns a memoized AGP percentile profile. */
export function useAGPProfile(
  readings: GlucoseReading[],
  options?: AGPProfileOptions
): AGPProfileResult {
  return useMemo(() => buildAGPProfile(readings, options), [readings, options])
}

/** Returns a memoized Glucose IQ score. */
export function useGlucoseIQScore(readings: GlucoseReading[]): GlucoseIQScore {
  return useMemo(() => glucoseIQScore(readings), [readings])
}

/** Returns a memoized meal-response report. */
export function useMealResponse(
  readings: GlucoseReading[],
  mealTime: string,
  options?: MealResponseOptions
): MealResponseResult {
  return useMemo(
    () => analyzeMealResponse(readings, mealTime, options),
    [readings, mealTime, options]
  )
}

/** Options for {@link useGlucoseLive}. */
export interface GlucoseLiveOptions extends GlucoseTrendOptions {
  /** Re-evaluate staleness every whole N ms from 1 through 2,147,483,647 (default: off). */
  readonly refreshMs?: number
}

/** Latest reading, trend, and reading age returned by {@link useGlucoseLive}. */
export interface GlucoseLive {
  /** Most recent reading, or null. */
  readonly latest: GlucoseReading | null
  /** Derived trend and rate of change. */
  readonly trend: GlucoseTrendResult
  /** Minutes since the last reading (staleness), or null. */
  readonly minutesSince: number | null
}

/**
 * Returns the latest reading, derived trend, and minutes since the last
 * reading.
 *
 * The latest reading updates when React receives a different `readings` array.
 * The trend updates when React receives a different `readings` array or
 * `options` object. `minutesSince` recalculates on every render. When set,
 * `refreshMs` requests interval renders so reading age can change while the
 * readings stay the same.
 *
 * @throws {DomainError} If `refreshMs` is not a whole number of milliseconds from `1` through `2_147_483_647` (`INVALID_OPTION`).
 */
export function useGlucoseLive(
  readings: GlucoseReading[],
  options?: GlucoseLiveOptions
): GlucoseLive {
  const refreshMs = validateRefreshInterval(options?.refreshMs)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (refreshMs === undefined) return
    const id = setInterval(() => setTick((t) => t + 1), refreshMs)
    return () => clearInterval(id)
  }, [refreshMs])

  const latest = useMemo(() => latestReading(readings), [readings])
  const trend = useMemo(
    () => computeGlucoseTrend(readings, options),
    [readings, options]
  )
  // Intentionally NOT memoized on readings alone: recomputes each render,
  // which the refresh interval drives while the sensor is quiet.
  const minutesSince = minutesSinceLastReading(readings)

  return { latest, trend, minutesSince }
}
