// @file src/validators.ts

/**
 * Returns whether a value is finite and greater than 0 but less than
 * 1000 µIU/mL. This is an input bound, not a reference interval.
 * @param value - Candidate insulin value
 * @returns True when the value satisfies the input bound
 */
export function isValidInsulin(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 1000 // upper bound is generous for outliers, adjust as needed
  )
}
