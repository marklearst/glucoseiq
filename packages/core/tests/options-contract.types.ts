import {
  aggregateCohort,
  analyzeGlucose,
  calculateEnhancedTIR,
  calculatePregnancyTIR,
  glucoseIQScore,
  type GlucoseReading,
} from '../src'
import { calculateGVIPGS, detectEpisodes } from '../src/metrics'

/** Compile-only assertions for the pre-1.0 option contract. */
export function assertOptionContract(
  readings: GlucoseReading[],
  patients: GlucoseReading[][]
): void {
  calculateEnhancedTIR(readings, { population: 'standard' })
  detectEpisodes(readings, { minDurationMin: 10 })
  calculateGVIPGS(readings, { maxGapMinutes: 10 })
  analyzeGlucose(readings, { includeProfile: false })
  aggregateCohort(patients)
  glucoseIQScore(readings)
  calculatePregnancyTIR(readings, { unit: 'mmol/L' })

  // @ts-expect-error Each reading already carries its unit.
  calculateEnhancedTIR(readings, { unit: 'mg/dL' })
  // @ts-expect-error Each reading already carries its unit.
  detectEpisodes(readings, { unit: 'mg/dL' })
  // @ts-expect-error Each reading already carries its unit.
  calculateGVIPGS(readings, { unit: 'mg/dL' })
  // @ts-expect-error Each reading already carries its unit.
  analyzeGlucose(readings, { unit: 'mg/dL' })
  // @ts-expect-error aggregateCohort has no options.
  aggregateCohort(patients, {})
  // @ts-expect-error glucoseIQScore has no options.
  glucoseIQScore(readings, {})
}
