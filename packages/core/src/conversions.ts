// @file src/conversions.ts

import {
  A1C_TO_EAG_MULTIPLIER,
  A1C_TO_EAG_CONSTANT,
  MGDL_MMOLL_CONVERSION,
  MG_DL,
  MMOL_L,
  GMI_COEFFICIENTS,
} from './constants'
import type { GlucoseUnit, EstimateGMIOptions, ConversionResult } from './types'
import { isEstimateGMIOptions } from './guards'
import { parseGlucoseString } from './glucose'
import { DomainError } from './errors'

/**
 * Estimates A1C (percentage) from average glucose in mg/dL.
 * Intended for informational analytics and display.
 * @param avgMgDl - Average glucose in mg/dL
 * @returns Estimated A1C value (percentage)
 * @see https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html
 */
export function estimateA1CFromAvgGlucose(avgMgDl: number): number {
  return +((avgMgDl + A1C_TO_EAG_CONSTANT) / A1C_TO_EAG_MULTIPLIER).toFixed(2)
}

/**
 * Estimates average glucose (mg/dL) from an A1C value (percentage).
 * Intended for informational analytics and display.
 * @param a1c - A1C value (percentage)
 * @returns Estimated average glucose in mg/dL
 * @see https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html
 */
export function estimateAvgGlucoseFromA1C(a1c: number): number {
  return Math.round(a1c * A1C_TO_EAG_MULTIPLIER - A1C_TO_EAG_CONSTANT)
}

/**
 * Estimates eAG (estimated average glucose, mg/dL) from an A1C value.
 * Throws if input is negative. Suitable for analytics and display workflows.
 * @param a1c - A1C value (percentage)
 * @returns Estimated average glucose (mg/dL)
 * @throws {DomainError} If a1c is negative
 * @see https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html
 */
export function estimateEAG(a1c: number): number {
  if (a1c < 0)
    throw new DomainError('A1C must be positive', 'INVALID_A1C_VALUE')
  const eAG = Number(
    (a1c * A1C_TO_EAG_MULTIPLIER - A1C_TO_EAG_CONSTANT).toFixed(10)
  )
  return Math.round(eAG)
}

/**
 * Estimates A1C from average glucose.
 * @param avgGlucose - Average glucose value
 * @param unit - Glucose unit (mg/dL or mmol/L)
 * @returns Estimated A1C
 * @see https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html
 */
export function estimateA1CFromAverage(
  avgGlucose: number,
  unit: GlucoseUnit = MG_DL
): number {
  const glucoseMgdl =
    unit === MMOL_L ? avgGlucose * MGDL_MMOLL_CONVERSION : avgGlucose
  return +((glucoseMgdl + 46.7) / 28.7).toFixed(2)
}

/**
 * Converts A1C to Glucose Management Indicator (GMI).
 * @param a1c - A1C value
 * @returns GMI value
 * @see https://diatribe.org/glucose-management-indicator-gmi
 */
export function a1cToGMI(a1c: number): number {
  return +(
    GMI_COEFFICIENTS.A1C_INTERCEPT +
    GMI_COEFFICIENTS.A1C_SLOPE * a1c
  ).toFixed(2)
}

/**
 * Estimate Glucose Management Indicator (GMI) from average glucose.
 * @param valueOrOptions - Glucose value, string, or options object
 * @param unit - Glucose unit (if value is a number)
 * @returns GMI value
 * @throws {DomainError} If unit is required but not provided when input is a number.
 * @throws {DomainError} If the glucose unit is unsupported.
 * @throws {DomainError} If the glucose value is not a positive number.
 * @throws {ParseError} If a string input cannot be parsed.
 * @see https://diatribe.org/glucose-management-indicator-gmi
 */
export function estimateGMI(
  valueOrOptions: number | string | EstimateGMIOptions,
  unit?: GlucoseUnit
): number {
  let value: number
  let resolvedUnit: GlucoseUnit

  if (isEstimateGMIOptions(valueOrOptions)) {
    value = valueOrOptions.value
    resolvedUnit = valueOrOptions.unit
  } else if (typeof valueOrOptions === 'string') {
    const parsed = parseGlucoseString(valueOrOptions)
    value = parsed.value
    resolvedUnit = parsed.unit
  } else {
    if (!unit)
      throw new DomainError(
        'Unit is required when input is a number.',
        'INVALID_UNIT'
      )
    value = valueOrOptions
    resolvedUnit = unit
  }

  if (![MG_DL, MMOL_L].includes(resolvedUnit)) {
    throw new DomainError(
      `Unsupported glucose unit: ${resolvedUnit}`,
      'INVALID_UNIT'
    )
  }

  if (value <= 0 || !Number.isFinite(value)) {
    throw new DomainError(
      'Glucose value must be a positive number.',
      'INVALID_GLUCOSE_VALUE'
    )
  }

  const gmi =
    resolvedUnit === MMOL_L
      ? GMI_COEFFICIENTS.MMOL_L_SLOPE * value + GMI_COEFFICIENTS.MMOL_L_INTERCEPT
      : GMI_COEFFICIENTS.MG_DL_SLOPE * value + GMI_COEFFICIENTS.MG_DL_INTERCEPT

  return parseFloat(gmi.toFixed(1))
}

/**
 * Converts a glucose value from mg/dL to mmol/L.
 * Used for international interoperability and reporting.
 * @param val - Glucose value in mg/dL
 * @returns Value in mmol/L
 * @throws {DomainError} If val is not a finite number or is negative/zero
 * @see https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BIOPRO_L.htm
 *
 * @example
 * ```ts typecheck
 * import { mgDlToMmolL } from '@glucoseiq/core'
 *
 * const mgdl: number = 180
 * const result = mgDlToMmolL(mgdl)
 * console.log(result) // 10.0
 * ```
 */
export function mgDlToMmolL(val: number): number {
  if (!Number.isFinite(val) || val <= 0)
    throw new DomainError('Invalid glucose value', 'INVALID_GLUCOSE_VALUE')
  return +(val / MGDL_MMOLL_CONVERSION).toFixed(1)
}

/**
 * Converts a glucose value from mmol/L to mg/dL.
 * Used for international interoperability and reporting.
 * @param val - Glucose value in mmol/L
 * @returns Value in mg/dL
 * @throws {DomainError} If val is not a finite number or is negative/zero
 * @see https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BIOPRO_L.htm
 *
 * @example
 * ```ts typecheck
 * import { mmolLToMgDl } from '@glucoseiq/core'
 *
 * const mmol: number = 5.5
 * const result = mmolLToMgDl(mmol)
 * console.log(result) // 99
 * ```
 */
export function mmolLToMgDl(val: number): number {
  if (!Number.isFinite(val) || val <= 0)
    throw new DomainError('Invalid glucose value', 'INVALID_GLUCOSE_VALUE')
  return Math.round(val * MGDL_MMOLL_CONVERSION)
}

/**
 * Converts a glucose value between mg/dL and mmol/L.
 * Used for interoperability and analytics.
 * @param input - Glucose value and its current unit
 * @returns Object with converted value and new unit
 * @throws {DomainError} If value is not a finite number or is negative/zero
 * @throws {DomainError} If unit is not a supported glucose unit
 * @see https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BIOPRO_L.htm
 */
export function convertGlucoseUnit(input: {
  /** Glucose value (number) */
  value: number
  /** Current glucose unit ('mg/dL' or 'mmol/L') */
  unit: GlucoseUnit
}): ConversionResult {
  const { value, unit } = input
  if (!Number.isFinite(value) || value <= 0)
    throw new DomainError('Invalid glucose value', 'INVALID_GLUCOSE_VALUE')
  if (![MG_DL, MMOL_L].includes(unit))
    throw new DomainError('Invalid unit', 'INVALID_UNIT')
  if (unit === MG_DL)
    return {
      value: Math.round((value / MGDL_MMOLL_CONVERSION) * 10) / 10,
      unit: MMOL_L,
    }
  return {
    value: Math.round(value * MGDL_MMOLL_CONVERSION),
    unit: MG_DL,
  }
}
