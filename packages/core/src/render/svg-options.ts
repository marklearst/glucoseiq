import { DomainError } from '../errors'

/** Resolves one SVG dimension without coercing caller-controlled values. */
export function resolveSvgDimension(
  value: unknown,
  fallback: number,
  renderer: string,
  dimension: 'width' | 'height'
): number {
  const resolved = value === undefined ? fallback : value
  if (
    typeof resolved !== 'number' ||
    !Number.isFinite(resolved) ||
    resolved <= 0
  ) {
    throw new DomainError(
      `${renderer}: ${dimension} must be a finite positive number`,
      'INVALID_OPTION'
    )
  }
  return resolved
}

/** Adds nonnegative geometry, saturating only when IEEE-754 would overflow. */
export function addFinite(left: number, right: number): number {
  return Math.min(Number.MAX_VALUE, left + right)
}

/** Rounds ordinary coordinates to tenths without overflowing extreme values. */
export function roundToTenth(value: number): number {
  if (Math.abs(value) > Number.MAX_VALUE / 10) return value
  return Math.round(value * 10) / 10
}
