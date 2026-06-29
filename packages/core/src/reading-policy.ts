import { MG_DL, MGDL_MMOLL_CONVERSION, MMOL_L } from './constants'
import { DomainError, TimestampError } from './errors'
import type { GlucoseReading } from './types'

/** Highest glucose value accepted by connector and live-reading surfaces. */
export const MAX_GLUCOSE_MGDL = 600

/** Converts a valid glucose value to mg/dL or throws a coded domain error. */
export function toUsableMgDl(
  value: number,
  unit: unknown,
  label: string
): number {
  if (unit !== MG_DL && unit !== MMOL_L) {
    throw new DomainError(
      `${label} has unsupported glucose unit: ${String(unit)}`,
      'INVALID_UNIT'
    )
  }

  const mgdl =
    typeof value === 'number'
      ? unit === MG_DL
        ? value
        : value * MGDL_MMOLL_CONVERSION
      : Number.NaN
  if (!Number.isFinite(mgdl) || mgdl <= 0 || mgdl > MAX_GLUCOSE_MGDL) {
    throw new DomainError(
      `${label} has invalid glucose value: ${String(value)}`,
      'INVALID_GLUCOSE_VALUE'
    )
  }
  return mgdl
}

/** Parses a usable reading timestamp or throws a coded timestamp error. */
export function parseUsableTimestamp(
  timestamp: string,
  label: string
): number {
  const value =
    typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN
  if (!Number.isFinite(value)) {
    throw new TimestampError(
      `${label} has invalid timestamp: ${String(timestamp)}`
    )
  }
  return value
}

/** Returns whether a reading is fully usable by live and rendering surfaces. */
export function isUsableReading(reading: GlucoseReading): boolean {
  try {
    toUsableMgDl(reading.value, reading.unit, 'Reading')
    parseUsableTimestamp(reading.timestamp, 'Reading')
    return true
  } catch {
    return false
  }
}
