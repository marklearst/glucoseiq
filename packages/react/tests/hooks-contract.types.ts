import type { GlucoseReading } from '@glucoseiq/core'
import { useGlucoseAnalysis, useGlucoseIQScore } from '../src/hooks'

/** Compile-only assertions for the React hook option contract. */
export function assertHookOptionContract(readings: GlucoseReading[]): void {
  useGlucoseAnalysis(readings, { includeProfile: false })
  useGlucoseIQScore(readings)

  // @ts-expect-error Each reading already carries its unit.
  useGlucoseAnalysis(readings, { unit: 'mg/dL' })
  // @ts-expect-error The score hook has no options.
  useGlucoseIQScore(readings, {})
}
