import { describe, it, expect } from 'vitest'
import {
  estimateA1CFromAvgGlucose,
  estimateAvgGlucoseFromA1C,
  estimateEAG,
  estimateA1CFromAverage,
  estimateGMI,
  a1cToGMI,
  mgDlToMmolL,
  mmolLToMgDl,
  convertGlucoseUnit,
} from '../src/conversions'
import { GlucoseUnit } from '../src/types'
import {
  GMI_COEFFICIENTS,
  MGDL_MMOLL_CONVERSION,
  MG_DL,
  MMOL_L,
} from '../src/constants'

describe('Conversions', () => {
  describe('A1C and Average Glucose', () => {
    it('converts avg glucose to A1C', () => {
      expect(estimateA1CFromAvgGlucose(154)).toBeCloseTo(7, 1)
      expect(estimateA1CFromAvgGlucose(200)).toBeCloseTo(8.6, 1)
      expect(estimateA1CFromAvgGlucose(100)).toBeCloseTo(5.1, 1)
    })

    it('converts A1C to avg glucose', () => {
      expect(estimateAvgGlucoseFromA1C(7)).toBeCloseTo(154, 0)
      expect(estimateAvgGlucoseFromA1C(8.6)).toBeCloseTo(200, 0)
      expect(estimateAvgGlucoseFromA1C(5.1)).toBeCloseTo(100, 0)
    })

    it('estimates eAG from A1C', () => {
      expect(estimateEAG(6)).toBe(126)
      expect(estimateEAG(7)).toBe(154)
      expect(estimateEAG(8)).toBe(183)
      expect(() => estimateEAG(-1)).toThrow('A1C must be positive')
      expect(() => estimateEAG(0)).toThrow('A1C must be positive')
      expect(() => estimateEAG(Number.NaN)).toThrow(
        'A1C must be positive'
      )
    })

    it('estimates A1C from average glucose with different units', () => {
      // mg/dL cases
      expect(estimateA1CFromAverage(154, MG_DL)).toBeCloseTo(7, 1)
      expect(estimateA1CFromAverage(200, MG_DL)).toBeCloseTo(8.6, 1)

      // mmol/L cases
      expect(estimateA1CFromAverage(8.6, MMOL_L)).toBeCloseTo(7, 1)
      expect(estimateA1CFromAverage(11.1, MMOL_L)).toBeCloseTo(8.6, 1)

      // Default unit (mg/dL)
      expect(estimateA1CFromAverage(154)).toBeCloseTo(7, 1)
    })
  })

  describe('GMI Calculations', () => {
    it('estimates GMI from number input', () => {
      expect(estimateGMI(100, MG_DL)).toBeCloseTo(5.7, 1)
      expect(estimateGMI(154, MG_DL)).toBeCloseTo(7.0, 1)
      expect(estimateGMI(5.5, MMOL_L)).toBeCloseTo(5.7, 1)
    })

    it('estimates GMI from string input', () => {
      expect(estimateGMI('100 mg/dL')).toBeCloseTo(5.7, 1)
      expect(estimateGMI('5.5 mmol/L')).toBeCloseTo(5.7, 1)
    })

    it('estimates GMI from options object', () => {
      expect(estimateGMI({ value: 100, unit: MG_DL })).toBeCloseTo(5.7, 1)
      expect(estimateGMI({ value: 5.5, unit: MMOL_L })).toBeCloseTo(5.7, 1)
    })

    it.each([54, 72.75, 100, 154, 180, 250])(
      'returns the same GMI for %s mg/dL in either glucose unit',
      (mgDl) => {
        expect(estimateGMI(mgDl, MG_DL)).toBe(
          estimateGMI(mgDl / 18.0182, MMOL_L)
        )
      }
    )

    it('keeps the public mmol/L coefficient aligned with unit-normalized GMI', () => {
      const mmolL = 5.2
      const directEstimate = Number(
        (
          GMI_COEFFICIENTS.MMOL_L_INTERCEPT +
          GMI_COEFFICIENTS.MMOL_L_SLOPE * mmolL
        ).toFixed(1)
      )

      expect(GMI_COEFFICIENTS.MMOL_L_SLOPE).toBe(
        GMI_COEFFICIENTS.MG_DL_SLOPE * MGDL_MMOLL_CONVERSION
      )
      expect(directEstimate).toBe(estimateGMI(mmolL, MMOL_L))
    })

    it('handles GMI calculation errors', () => {
      expect(() => estimateGMI(-1, MG_DL)).toThrow(
        'Glucose value must be a positive number'
      )
      expect(() => estimateGMI(0, MG_DL)).toThrow(
        'Glucose value must be a positive number'
      )
      expect(() => estimateGMI(NaN, MG_DL)).toThrow(
        'Glucose value must be a positive number'
      )
      expect(() => estimateGMI(100, 'invalid' as GlucoseUnit)).toThrow(
        'Unsupported glucose unit'
      )
      expect(() => estimateGMI(100)).toThrow(
        'Unit is required when input is a number'
      )
    })

    it('maps legacy A1C input through eAG before estimating GMI', () => {
      expect(a1cToGMI(7)).toBe(7)
      expect(a1cToGMI(5)).toBe(5.6)
      expect(a1cToGMI(9)).toBe(8.4)
      expect(() => a1cToGMI(0)).toThrow('A1C must be positive')
    })
  })

  describe('Unit Conversions', () => {
    it('converts mg/dL to mmol/L', () => {
      expect(mgDlToMmolL(180)).toBeCloseTo(10.0, 1)
      expect(mgDlToMmolL(100)).toBeCloseTo(5.5, 1)
      expect(mgDlToMmolL(54)).toBeCloseTo(3.0, 1)
    })

    it('throws on invalid mgDlToMmolL input', () => {
      expect(() => mgDlToMmolL(-1)).toThrow('Invalid glucose value')
      expect(() => mgDlToMmolL(0)).toThrow('Invalid glucose value')
      expect(() => mgDlToMmolL(NaN)).toThrow('Invalid glucose value')
    })

    it('converts mmol/L to mg/dL', () => {
      expect(mmolLToMgDl(10)).toBe(180)
      expect(mmolLToMgDl(5.6)).toBe(101)
      expect(mmolLToMgDl(3.0)).toBe(54)
    })

    it('throws on invalid mmolLToMgDl input', () => {
      expect(() => mmolLToMgDl(-1)).toThrow('Invalid glucose value')
      expect(() => mmolLToMgDl(0)).toThrow('Invalid glucose value')
      expect(() => mmolLToMgDl(NaN)).toThrow('Invalid glucose value')
    })

    it('converts glucose units bidirectionally', () => {
      // mg/dL to mmol/L
      expect(convertGlucoseUnit({ value: 180, unit: MG_DL })).toEqual({
        value: 10.0,
        unit: MMOL_L,
      })

      // mmol/L to mg/dL
      expect(convertGlucoseUnit({ value: 10, unit: MMOL_L })).toEqual({
        value: 180,
        unit: MG_DL,
      })
    })

    it('handles conversion errors', () => {
      expect(() => convertGlucoseUnit({ value: -1, unit: MG_DL })).toThrow(
        'Invalid glucose value'
      )
      expect(() => convertGlucoseUnit({ value: 0, unit: MG_DL })).toThrow(
        'Invalid glucose value'
      )
      expect(() => convertGlucoseUnit({ value: NaN, unit: MG_DL })).toThrow(
        'Invalid glucose value'
      )
      expect(() =>
        convertGlucoseUnit({ value: 100, unit: 'invalid' as GlucoseUnit })
      ).toThrow('Invalid unit')
    })
  })
})
