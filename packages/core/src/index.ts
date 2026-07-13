/**
 * @glucoseiq/core — a dependency-free headless engine for glucose and CGM data.
 *
 * Mixed-unit-aware GlucoseReading APIs normalize each reading's declared unit.
 * Legacy `calculateTIR` instead requires readings and target bounds in one
 * homogeneous unit. Numeric-array APIs likewise require a homogeneous series
 * and the matching unit option where one is available. Results are
 * informational analytics, not medical advice.
 */

export * from './errors'
export * from './a1c'
export * from './alignment'
export * from './conversions'
export * from './constants'
export * from './formatters'
export * from './glucose'
export * from './guards'
export * from './validators'
export * from './tir'
export * from './types'
export {
  glucoseStandardDeviation,
  glucoseCoefficientOfVariation,
  glucosePercentiles,
  glucoseMAGE,
} from './variability'

// Export MAGE implementation and types
export { glucoseMAGE as clinicalMAGE, type MAGEOptions } from './mage'

// Export Enhanced Time-in-Range functions
export { calculateEnhancedTIR, calculatePregnancyTIR } from './tir-enhanced'

// Export advanced CGM metrics (LBGI, HBGI, GRI, MODD)
export * from './metrics'
// Export CGM connector adapters
export * from './connectors'

// Export interoperability utilities (FHIR, Open mHealth)
export * from './interop'

// Export live / real-time helpers (trend, rate-of-change, staleness)
export * from './live'

// Export the one-call CGM analytics summary
export * from './analyze'

// Export the Glucose IQ wellness score
export * from './score'

// Export CSV ingestion
export * from './csv'

// Export time-series plumbing (gaps, day/night, grid resampling)
export * from './timeseries'
export * from './align'

// Export cohort / population aggregation
export * from './cohort'

// Export optional zero-dependency SVG renderers
export * from './render'
