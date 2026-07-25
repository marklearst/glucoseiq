import type { EstimateGMIOptions } from './types'
import { MG_DL, MMOL_L } from './constants'

/**
 * Type guard for `EstimateGMIOptions`.
 * Requires a positive finite value and one of the two supported glucose units.
 * @param input - Candidate value to validate.
 * @returns True if input is a valid EstimateGMIOptions object.
 */
export function isEstimateGMIOptions(
  input: unknown
): input is EstimateGMIOptions {
  if (typeof input !== 'object' || input === null) return false

  const candidate = input as Record<string, unknown>
  return (
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value) &&
    candidate.value > 0 &&
    (candidate.unit === MG_DL || candidate.unit === MMOL_L)
  )
}

/**
 * Returns whether a string contains a positive finite number followed by one
 * of the two supported glucose units. It checks only the declared string
 * format and the positive, finite numeric bound.
 * @param input - Value to check
 * @returns True when input matches the supported glucose string format
 * @see https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BIOPRO_L.htm
 */
export function isValidGlucoseString(input: unknown): input is string {
  if (typeof input !== 'string') return false

  const match = /^(\d+(?:\.\d+)?)\s+(mg\/dL|mmol\/L)$/i.exec(input.trim())
  if (match === null) return false
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0
}
