/**
 * @file src/connectors/nightscout.ts
 *
 * Pure transformation adapter for Nightscout API payloads.
 * Maps raw Nightscout SGV entries into NormalizedCGMReading objects.
 * Does NOT handle authentication — use with the Nightscout REST API directly.
 *
 * @see https://nightscout.github.io/nightscout/setup_variables/#api
 * @see https://www.npmjs.com/package/nightscout
 */

import { MG_DL } from '../constants'
import { TimestampError } from '../errors'
import { toUsableMgDl } from '../reading-policy'
import type {
  NightscoutEntry,
  NightscoutDirection,
  NormalizedCGMReading,
  CGMTrend,
} from './types'

const NIGHTSCOUT_DIRECTION_MAP: Record<string, CGMTrend> = {
  DoubleUp: 'rapidRising',
  SingleUp: 'rising',
  FortyFiveUp: 'slightlyRising',
  Flat: 'flat',
  FortyFiveDown: 'slightlyFalling',
  SingleDown: 'falling',
  DoubleDown: 'rapidFalling',
  NONE: 'unknown',
  'NOT COMPUTABLE': 'unknown',
  'RATE OUT OF RANGE': 'unknown',
}

/** Converts a runtime vendor epoch to ISO without coercing non-numbers. */
function parseNightscoutEpoch(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/**
 * Normalizes a Nightscout direction string into a canonical CGMTrend.
 */
export function normalizeNightscoutDirection(
  direction: NightscoutDirection | undefined
): CGMTrend {
  if (!direction) return 'unknown'
  return NIGHTSCOUT_DIRECTION_MAP[direction] ?? 'unknown'
}

/**
 * Converts a single Nightscout SGV entry into a NormalizedCGMReading.
 *
 * @param entry - Raw Nightscout SGV entry
 * @returns Normalized reading compatible with all `@glucoseiq/core` analytics functions
 * @throws {TimestampError} If neither vendor timestamp can be normalized
 * @throws {DomainError} If the glucose value is not usable
 */
export function normalizeNightscoutEntry(
  entry: NightscoutEntry
): NormalizedCGMReading {
  const timestamp = (() => {
    if (entry.dateString !== undefined && entry.dateString !== '') {
      if (typeof entry.dateString !== 'string') {
        throw new TimestampError(
          `Unable to parse Nightscout timestamp from 'dateString': ${String(
            entry.dateString
          )}`
        )
      }
      let parsed = Number.NaN
      try {
        parsed = Date.parse(entry.dateString)
      } catch {
        parsed = Number.NaN
      }
      if (Number.isFinite(parsed)) {
        const parsedDate = new Date(parsed)
        if (Number.isFinite(parsedDate.getTime())) {
          return parsedDate.toISOString()
        }
      }

      // Fall back to `entry.date` if available and valid
      if (entry.date !== undefined && entry.date !== null) {
        const fallbackTimestamp = parseNightscoutEpoch(entry.date)
        if (fallbackTimestamp !== null) return fallbackTimestamp
      }

      throw new TimestampError(
        `Unable to parse Nightscout timestamp from 'dateString': ${String(
          entry.dateString
        )}`
      )
    }

    const fallbackTimestamp = parseNightscoutEpoch(entry.date)
    if (fallbackTimestamp === null) {
      throw new TimestampError(
        `Unable to parse Nightscout timestamp from 'date' field: ${String(
          entry.date
        )}`
      )
    }

    return fallbackTimestamp
  })()
  toUsableMgDl(entry.sgv, MG_DL, 'Nightscout entry')
  return {
    value: entry.sgv,
    unit: MG_DL,
    timestamp,
    trend: normalizeNightscoutDirection(entry.direction),
    source: 'nightscout',
    vendorId: entry._id,
    dedupKey: `nightscout:${entry._id ?? timestamp}`,
  }
}

/**
 * Converts an array of Nightscout SGV entries into NormalizedCGMReadings.
 *
 * @param entries - Raw Nightscout entries from the `/api/v1/entries` endpoint
 * @returns Array of normalized readings, sorted chronologically
 */
export function normalizeNightscoutEntries(
  entries: NightscoutEntry[]
): NormalizedCGMReading[] {
  return entries
    .map(normalizeNightscoutEntry)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
}
