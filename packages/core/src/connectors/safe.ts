/**
 * @file src/connectors/safe.ts
 *
 * Partial-success normalization. The throwing `normalize*Entries` functions
 * discard an entire batch when one entry is malformed; these variants collect
 * per-entry errors and return every reading that DID parse.
 */

import type { NormalizedCGMReading, DexcomShareEntry, LibreLinkUpEntry, NightscoutEntry } from './types'
import { normalizeDexcomEntry } from './dexcom'
import { normalizeLibreEntry } from './libre'
import { normalizeNightscoutEntry } from './nightscout'
import { GlucoseIQError, type GlucoseIQErrorCode } from '../errors'

/** A single entry that failed to normalize. */
export interface NormalizeError {
  /** Index of the failing entry in the input array. */
  readonly index: number
  /** The error message. */
  readonly message: string
  /** Stable machine-readable code for intentional library errors. */
  readonly code?: GlucoseIQErrorCode
}

/** Result of a safe normalization pass. */
export interface SafeNormalizeResult {
  /** Successfully normalized readings, sorted chronologically. */
  readonly readings: NormalizedCGMReading[]
  /** Per-entry failures (empty when everything parsed). */
  readonly errors: NormalizeError[]
}

/** @internal */
function safeMap<T>(
  entries: T[],
  normalize: (entry: T) => NormalizedCGMReading
): SafeNormalizeResult {
  const readings: NormalizedCGMReading[] = []
  const errors: NormalizeError[] = []
  entries.forEach((entry, index) => {
    try {
      readings.push(normalize(entry))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (err instanceof GlucoseIQError) {
        errors.push({ index, message, code: err.code })
      } else {
        errors.push({ index, message })
      }
    }
  })
  readings.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  return { readings, errors }
}

/** Safe (partial-success) variant of normalizeDexcomEntries. */
export function safeNormalizeDexcomEntries(entries: DexcomShareEntry[]): SafeNormalizeResult {
  return safeMap(entries, normalizeDexcomEntry)
}

/** Safe (partial-success) variant of normalizeLibreEntries. */
export function safeNormalizeLibreEntries(entries: LibreLinkUpEntry[]): SafeNormalizeResult {
  return safeMap(entries, normalizeLibreEntry)
}

/** Safe (partial-success) variant of normalizeNightscoutEntries. */
export function safeNormalizeNightscoutEntries(entries: NightscoutEntry[]): SafeNormalizeResult {
  return safeMap(entries, normalizeNightscoutEntry)
}
