// @file src/variability.ts

import { glucoseMAGE as mageImpl, type MAGEOptions } from './mage';
import { DomainError } from './errors';

/**
 * Calculates the unbiased sample standard deviation (SD) of glucose values.
 * Uses n-1 in the denominator (sample SD), as recommended in research guidelines.
 *
 * @param readings Array of glucose values (numbers)
 * @returns Standard deviation, or NaN if fewer than 2 values
 * @see {@link https://care.diabetesjournals.org/content/42/8/1593 ADA 2019: Glycemic Targets}
 * @see {@link https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7445493/ ISPAD 2019}
 * @example
 * ```ts typecheck
 * import { glucoseStandardDeviation } from '@glucoseiq/core'
 *
 * const valuesMgDl: number[] = [100, 120, 140]
 * const standardDeviation = glucoseStandardDeviation(valuesMgDl)
 * ```
 * @remarks
 * Returns NaN when readings contain fewer than 2 values. NaN and Infinity
 * propagate into the result.
 */
export function glucoseStandardDeviation(readings: number[]): number {
  if (!Array.isArray(readings) || readings.length < 2) return NaN;
  const mean = readings.reduce((sum, v) => sum + v, 0) / readings.length;
  const variance = readings.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (readings.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculates the coefficient of variation (CV) for glucose values.
 * CV = (SD / mean) × 100. Used to assess glycemic variability.
 *
 * @param readings Array of glucose values (numbers)
 * @returns Coefficient of variation as a percentage, or NaN if <2 values or mean is 0
 * @see {@link https://care.diabetesjournals.org/content/42/8/1593 ADA 2019: Glycemic Targets}
 * @example
 * ```ts typecheck
 * import { glucoseCoefficientOfVariation } from '@glucoseiq/core'
 *
 * const valuesMgDl: number[] = [100, 120, 140]
 * const coefficientOfVariation = glucoseCoefficientOfVariation(valuesMgDl)
 * ```
 * @remarks
 * Returns NaN when readings contain fewer than 2 values or their mean is 0.
 * NaN and Infinity propagate into the result.
 */
export function glucoseCoefficientOfVariation(readings: number[]): number {
  if (!Array.isArray(readings) || readings.length < 2) return NaN;
  const mean = readings.reduce((sum, v) => sum + v, 0) / readings.length;
  if (mean === 0) return NaN;
  const sd = glucoseStandardDeviation(readings);
  return (sd / mean) * 100;
}

/**
 * Calculates specified percentiles from an array of glucose values using the nearest-rank method.
 * @param readings - Array of glucose values (numbers)
 * @param percentiles - Array of percentiles to calculate (e.g., [10, 25, 50, 75, 90])
 * @returns Object mapping percentile to value, or {} if input is empty
 * @throws {DomainError} If either readings or percentiles is not an array (`INVALID_OPTION`)
 * @see https://en.wikipedia.org/wiki/Percentile
 * @see https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7445493/ (ISPAD 2019)
 * @example
 * ```ts typecheck
 * import { glucosePercentiles } from '@glucoseiq/core'
 *
 * const valuesMgDl: number[] = [100, 120, 140, 160, 180]
 * const requestedPercentiles: number[] = [10, 50, 90]
 * const percentiles = glucosePercentiles(valuesMgDl, requestedPercentiles)
 * ```
 * @remarks
 * Returns the nearest-rank value for each percentile. Empty readings return an
 * empty object. Percentiles outside [0, 100] are ignored.
 */
export function glucosePercentiles(readings: number[], percentiles: number[]): Record<number, number> {
  if (!Array.isArray(readings)) {
    throw new DomainError('readings must be an array', 'INVALID_OPTION');
  }
  if (!Array.isArray(percentiles)) {
    throw new DomainError('percentiles must be an array', 'INVALID_OPTION');
  }
  if (readings.length === 0) return {};
  const sorted = [...readings].sort((a, b) => a - b);
  const result: Record<number, number> = {};
  for (const p of percentiles) {
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 100) continue;
    // Nearest-rank method
    const rank = Math.ceil((p / 100) * sorted.length);
    result[p] = sorted[Math.max(0, rank - 1)];
  }
  return result;
}

/**
 * Calculates Mean Amplitude of Glycemic Excursions (MAGE) for glucose values.
 * Implements Service FJ et al. (1970) methodology.
 * @param readings - Array of glucose values (mg/dL or mmol/L)
 * @param options - Optional configuration for MAGE calculation
 * @returns MAGE value, or NaN if insufficient data or no valid excursions
 * @see https://pubmed.ncbi.nlm.nih.gov/5469118/ (Service FJ, et al. 1970)
 * @see https://journals.sagepub.com/doi/10.1177/19322968211061165 (Fernandes NJ, et al. 2022)
 * @see https://care.diabetesjournals.org/content/42/8/1593 (ADA 2019)
 * @example
 * ```ts typecheck
 * import { glucoseMAGE } from '@glucoseiq/core'
 *
 * const valuesMgDl: number[] = Array.from(
 *   { length: 100 },
 *   (_, index) => (index % 2 === 0 ? 90 : 160)
 * )
 * const mage = glucoseMAGE(valuesMgDl, { direction: 'ascending' })
 * ```
 * @remarks
 * - Minimum 24 data points recommended (1 day of hourly readings)
 * - Best suited for continuous glucose monitoring (CGM) data
 * - Not recommended for sparse or irregular measurements
 * - Uses dual moving averages, three-point excursion definition, and prevents double-counting.
 */
export function glucoseMAGE(readings: number[], options?: MAGEOptions): number {
  return mageImpl(readings, options);
}
