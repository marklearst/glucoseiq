// @file src/a1c.ts

import { DomainError } from './errors'

/**
 * Formats an A1C value as a percent string (e.g., "7.2%").
 * @param val - A1C value (percentage)
 * @returns A1C as string with percent sign
 */
export function formatA1C(val: number): string {
  return `${val.toFixed(1)}%`
}

/**
 * Returns whether a value is finite and greater than 0 but less than 20.
 * @param value - Candidate A1C value
 * @returns True if value is a valid A1C percentage
 */
export function isValidA1C(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 20
  )
}

/**
 * Returns the CDC category for an A1C value (normal, prediabetes, diabetes, or invalid).
 * Uses CDC defaults: normal below 5.7%, prediabetes from 5.7% to below 6.5%,
 * and diabetes at 6.5% or above. Explicit custom maxima are inclusive. At
 * runtime, nullish threshold objects or fields use the CDC defaults.
 * @param a1c - A1C value (percentage)
 * @param thresholds - Optional inclusive custom maxima
 * @returns 'normal' | 'prediabetes' | 'diabetes' | 'invalid'
 * @see https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html
 */
export function getA1CCategory(
  a1c: number,
  thresholds?: { normalMax?: number; prediabetesMax?: number }
): 'normal' | 'prediabetes' | 'diabetes' | 'invalid' {
  const normalMax = thresholds?.normalMax
  const prediabetesMax = thresholds?.prediabetesMax
  if (!isValidA1C(a1c)) return 'invalid'
  if (
    normalMax === undefined || normalMax === null
      ? a1c < 5.7
      : a1c <= normalMax
  )
    return 'normal'
  if (
    prediabetesMax === undefined || prediabetesMax === null
      ? a1c < 6.5
      : a1c <= prediabetesMax
  )
    return 'prediabetes'
  return 'diabetes'
}

/**
 * Checks if an A1C value is within a target range.
 * @param a1c - A1C value
 * @param target - [min, max] range (default: [6.5, 7.0])
 * @param thresholds - Optional custom thresholds: { min?: number; max?: number }
 * @returns True if in target range
 */
export function isA1CInTarget(
  a1c: number,
  target: [number, number] = [6.5, 7.0],
  thresholds?: { min?: number; max?: number }
): boolean {
  const min = thresholds?.min ?? target[0]
  const max = thresholds?.max ?? target[1]
  return isValidA1C(a1c) && a1c >= min && a1c <= max
}

/**
 * Calculates the change (delta) between two A1C values.
 * @param current - Current A1C
 * @param previous - Previous A1C
 * @returns Delta (current - previous)
 * @throws {DomainError} If either value is invalid
 */
export function a1cDelta(current: number, previous: number): number {
  if (!isValidA1C(current) || !isValidA1C(previous))
    throw new DomainError('Invalid A1C value', 'INVALID_A1C_VALUE')
  return +(current - previous).toFixed(2)
}

/**
 * Determines the trend of A1C values over time.
 * @param readings - Array of A1C values (chronological order)
 * @returns 'increasing' | 'decreasing' | 'stable' | 'insufficient data'
 */
export function a1cTrend(
  readings: number[]
): 'increasing' | 'decreasing' | 'stable' | 'insufficient data' {
  if (!Array.isArray(readings) || readings.length < 2)
    return 'insufficient data'
  const delta = readings[readings.length - 1] - readings[0]
  if (Math.abs(delta) < 0.1) return 'stable'
  return delta > 0 ? 'increasing' : 'decreasing'
}
