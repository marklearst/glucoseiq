// @file src/formatters.ts

import { DomainError, TimestampError } from './errors'
import type { GlucoseUnit } from './types'

/**
 * Formats a numeric glucose value with optional rounding and a unit suffix.
 * @param val - Glucose value (number)
 * @param unit - Glucose unit ('mg/dL' or 'mmol/L')
 * @param options - Formatting options: { digits?: number; suffix?: boolean } (default: { digits: 0, suffix: true })
 * @returns Formatted glucose string (e.g., '5.5 mmol/L', '120 mg/dL')
 * @see https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BIOPRO_L.htm
 */
export function formatGlucose(
  val: number,
  unit: GlucoseUnit,
  options: { digits?: number; suffix?: boolean } = {}
): string {
  const digits = options.digits ?? 0
  const suffix = options.suffix ?? true
  const value = val.toFixed(digits)
  return suffix ? `${value} ${unit}` : value
}

/**
 * Formats a number with fixed decimal places and a percent sign.
 * @param val - Value to format (fraction or percent)
 * @param digits - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., '85.0%')
 */
export function formatPercentage(val: number, digits = 1): string {
  return `${val.toFixed(digits)}%`
}

/**
 * Formats a UTC ISO 8601 timestamp in the requested IANA time zone.
 * @param iso - ISO 8601 timestamp string (e.g., '2024-03-20T10:00:00Z')
 * @param timeZone - Optional IANA time zone (e.g., 'America/New_York')
 * @returns Localized date/time string (e.g., 'Mar 20, 2024, 06:00 AM')
 * @throws {TimestampError} If the ISO string is invalid or cannot be parsed
 * @throws {DomainError} If the time zone is invalid
 */
export function formatDate(iso: string, timeZone?: string): string {
  if (isNaN(Date.parse(iso))) {
    throw new TimestampError('Invalid ISO timestamp')
  }

  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }

  try {
    return new Date(iso).toLocaleString('en-US', options)
  } catch (error) {
    if (error instanceof RangeError) {
      throw new DomainError(error.message, 'INVALID_TIMEZONE')
    }
    throw error
  }
}
