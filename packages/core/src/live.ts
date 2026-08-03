/**
 * @file src/live.ts
 *
 * Live glucose helpers derive rate of change and trends, select the latest
 * reading, and measure staleness for CGM home screens and dashboards.
 * Watch surfaces require host-application integration.
 *
 * These functions calculate rate of change and trend from observed readings.
 * They do not forecast future glucose. Forecasting remains outside this
 * descriptive package to avoid implying a predictive medical-device function.
 *
 * @see {@link https://www.dexcom.com | Dexcom trend-arrow rate thresholds}
 */

import type { GlucoseReading } from './types'
import type { CGMTrend } from './connectors/types'
import { DomainError, TimestampError } from './errors'
import {
  isUsableReading,
  parseUsableTimestamp,
  toUsableMgDl,
} from './reading-policy'

/** Default trailing window for rate-of-change (minutes). */
const DEFAULT_WINDOW_MIN = 15

/** Options for {@link computeGlucoseTrend}. */
export interface GlucoseTrendOptions {
  /** Trailing window in minutes over which rate-of-change is fit (default 15). */
  readonly windowMin?: number
}

/** Result of {@link computeGlucoseTrend}. */
export interface GlucoseTrendResult {
  /** Rate-of-change in mg/dL per minute (NaN when not computable). */
  readonly rocPerMin: number
  /** Derived CGM trend (or 'unknown' when not computable). */
  readonly trend: CGMTrend
  /** Trailing window used (minutes). */
  readonly windowMinutes: number
  /** Number of readings used in the fit. */
  readonly readingsUsed: number
}

/** Normalizes a reading to mg/dL. @internal */
function toMgdl(reading: GlucoseReading): number {
  return toUsableMgDl(reading.value, reading.unit, 'Reading')
}

/** Parses an explicit reference time without coercing other runtime values. */
function parseReferenceMs(value: unknown): number {
  if (typeof value === 'string') {
    try {
      return Date.parse(value)
    } catch {
      return Number.NaN
    }
  }
  if (typeof value === 'number') return new Date(value).getTime()
  if (value instanceof Date) return value.getTime()
  return Number.NaN
}

/**
 * Classifies a rate-of-change (mg/dL per minute) into a CGM trend using
 * Dexcom-style thresholds: <1 flat, 1–2 slight, 2–3 single, ≥3 rapid.
 *
 * @param rocPerMin - Rate of change in mg/dL per minute
 * @returns The corresponding {@link CGMTrend}
 * @category Live
 * @public
 */
export function classifyGlucoseTrend(rocPerMin: number): CGMTrend {
  if (!Number.isFinite(rocPerMin)) return 'unknown'
  const magnitude = Math.abs(rocPerMin)
  if (magnitude < 1) return 'flat'
  const rising = rocPerMin > 0
  if (magnitude >= 3) return rising ? 'rapidRising' : 'rapidFalling'
  if (magnitude >= 2) return rising ? 'rising' : 'falling'
  return rising ? 'slightlyRising' : 'slightlyFalling'
}

/**
 * Computes glucose rate-of-change and derives a trend from recent readings.
 *
 * Fits a least-squares slope over readings in the trailing window, normalizing
 * mixed units to mg/dL. Hosts can use the result for a live trend arrow or to
 * back-fill a trend when a feed (e.g. Nightscout) does not provide one.
 *
 * @param readings - Glucose readings with ISO 8601 timestamps
 * @param options - Trailing window configuration
 * @returns Rate-of-change (mg/dL/min) and derived trend
 * @throws {DomainError} If `windowMin` is not a finite positive number
 *
 * @example
 * ```ts typecheck
 * import { computeGlucoseTrend, type GlucoseReading } from '@glucoseiq/core'
 *
 * const readings: GlucoseReading[] = [
 *   { value: 110, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
 *   { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:05:00Z' },
 * ]
 * const { rocPerMin, trend } = computeGlucoseTrend(readings)
 * // rocPerMin: 2, trend: 'rising'
 * ```
 *
 * @category Live
 * @public
 */
export function computeGlucoseTrend(
  readings: GlucoseReading[],
  options?: GlucoseTrendOptions
): GlucoseTrendResult {
  const requestedWindow = options?.windowMin
  const windowMinutes =
    requestedWindow === undefined ? DEFAULT_WINDOW_MIN : requestedWindow
  if (
    typeof windowMinutes !== 'number' ||
    !Number.isFinite(windowMinutes) ||
    windowMinutes <= 0
  ) {
    throw new DomainError(
      `windowMin must be a finite positive number: ${String(windowMinutes)}`,
      'INVALID_OPTION'
    )
  }
  const unknown: GlucoseTrendResult = {
    rocPerMin: NaN,
    trend: 'unknown',
    windowMinutes,
    readingsUsed: 0,
  }

  const points: { t: number; mgdl: number }[] = []
  for (const r of readings) {
    if (!isUsableReading(r)) continue
    const mgdl = toMgdl(r)
    const ms = parseUsableTimestamp(r.timestamp, 'Reading')
    points.push({ t: ms / 60000, mgdl })
  }
  if (points.length < 2) return unknown

  points.sort((a, b) => a.t - b.t)
  const latest = points[points.length - 1].t
  const windowStart = latest - windowMinutes
  const win = points.filter((p) => p.t >= windowStart)
  if (win.length < 2) return { ...unknown, readingsUsed: win.length }

  const n = win.length
  const meanT = win.reduce((s, p) => s + p.t, 0) / n
  const meanG = win.reduce((s, p) => s + p.mgdl, 0) / n
  let num = 0
  let den = 0
  for (const p of win) {
    const dt = p.t - meanT
    num += dt * (p.mgdl - meanG)
    den += dt * dt
  }
  if (den === 0) return { ...unknown, readingsUsed: n }

  const rocPerMin = Math.round((num / den) * 1000) / 1000
  return {
    rocPerMin,
    trend: classifyGlucoseTrend(rocPerMin),
    windowMinutes,
    readingsUsed: n,
  }
}

/**
 * Returns the most recent fully usable reading by timestamp (readings need not
 * be sorted). A usable reading has a supported unit, a finite positive value at
 * or below 600 mg/dL after normalization, and a parseable timestamp.
 *
 * @param readings - Glucose readings
 * @returns The latest fully usable reading, or `null` when none are usable
 * @category Live
 * @public
 */
export function latestReading(readings: GlucoseReading[]): GlucoseReading | null {
  let best: GlucoseReading | null = null
  let bestMs = -Infinity
  for (const r of readings) {
    if (!isUsableReading(r)) continue
    const ms = parseUsableTimestamp(r.timestamp, 'Reading')
    if (ms >= bestMs) {
      bestMs = ms
      best = r
    }
  }
  return best
}

/**
 * Returns minutes elapsed since the most recent reading (sensor staleness).
 *
 * @param readings - Glucose readings
 * @param now - Reference time (ISO string, epoch ms, or Date); defaults to the current time
 * @returns Minutes since the latest reading, or `null` if there are none
 * @throws {TimestampError} If an explicit reference time is invalid
 * @category Live
 * @public
 */
export function minutesSinceLastReading(
  readings: GlucoseReading[],
  now?: string | number | Date
): number | null {
  const nowMs = now === undefined ? Date.now() : parseReferenceMs(now)
  if (now !== undefined && !Number.isFinite(nowMs)) {
    throw new TimestampError(`Unable to parse reference time: ${String(now)}`)
  }
  const latest = latestReading(readings)
  if (latest === null) return null
  return (
    (nowMs - parseUsableTimestamp(latest.timestamp, 'Reading')) /
    60000
  )
}
