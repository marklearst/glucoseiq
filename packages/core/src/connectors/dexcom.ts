/**
 * @file src/connectors/dexcom.ts
 *
 * Pure transformation adapter for Dexcom Share API payloads.
 * Maps raw Dexcom entries into NormalizedCGMReading objects.
 * Does NOT handle authentication — use with any Dexcom Share client library.
 *
 * @see https://github.com/brettfarrow/cgm.js
 * @see https://www.npmjs.com/package/@diakem/dexcom-api-client
 */

import { MG_DL } from '../constants'
import { TimestampError } from '../errors'
import { toUsableMgDl } from '../reading-policy'
import type {
  DexcomShareEntry,
  DexcomTrendString,
  NormalizedCGMReading,
  CGMTrend,
} from './types'

const DEXCOM_TREND_MAP: Record<DexcomTrendString, CGMTrend> = {
  DoubleUp: 'rapidRising',
  SingleUp: 'rising',
  FortyFiveUp: 'slightlyRising',
  Flat: 'flat',
  FortyFiveDown: 'slightlyFalling',
  SingleDown: 'falling',
  DoubleDown: 'rapidFalling',
  None: 'unknown',
  NotComputable: 'unknown',
  RateOutOfRange: 'unknown',
}

/**
 * Parses a Dexcom date string into an ISO 8601 string.
 *
 * Dexcom Share returns dates in the format `"Date(epochMs)"` or
 * `"/Date(epochMs)/"`. This helper handles both, plus plain ISO strings.
 *
 * @throws {TimestampError} If the date string cannot be parsed
 */
export function parseDexcomDate(raw: string): string {
  const parseErrorMessage = `Unable to parse Dexcom date: ${String(raw)}`
  if (typeof raw !== 'string') {
    throw new TimestampError(parseErrorMessage)
  }
  const epochMatch = raw.match(
    /^(?:Date\((\d+)\)|\/Date\((\d+)\)\/)$/
  )
  if (epochMatch) {
    const date = new Date(Number(epochMatch[1] ?? epochMatch[2]))
    if (Number.isNaN(date.getTime())) {
      throw new TimestampError(parseErrorMessage)
    }
    return date.toISOString()
  }
  let parsed = Number.NaN
  try {
    parsed = Date.parse(raw)
  } catch {
    throw new TimestampError(parseErrorMessage)
  }
  if (!Number.isFinite(parsed)) {
    throw new TimestampError(parseErrorMessage)
  }
  const date = new Date(parsed)
  if (Number.isNaN(date.getTime())) {
    throw new TimestampError(parseErrorMessage)
  }
  return date.toISOString()
}

/**
 * Normalizes a Dexcom Share trend string into a canonical CGMTrend.
 */
export function normalizeDexcomTrend(
  trend: DexcomTrendString | (string & {}) | null | undefined
): CGMTrend {
  if (trend == null) {
    return 'unknown'
  }
  return DEXCOM_TREND_MAP[trend as DexcomTrendString] ?? 'unknown'
}

/**
 * Converts a single Dexcom Share entry into a NormalizedCGMReading.
 *
 * @param entry - Raw Dexcom Share entry
 * @returns A normalized reading usable by APIs that accept `GlucoseReading`, subject to each API's contract
 * @throws {TimestampError} If the date string cannot be parsed
 * @throws {DomainError} If the glucose value is not usable
 */
export function normalizeDexcomEntry(
  entry: DexcomShareEntry
): NormalizedCGMReading {
  const timestamp = parseDexcomDate(entry.WT)
  toUsableMgDl(entry.Value, MG_DL, 'Dexcom entry')
  const vendorId = entry.ST ?? entry.DT
  return {
    value: entry.Value,
    unit: MG_DL,
    timestamp,
    trend: normalizeDexcomTrend(entry.Trend),
    source: 'dexcom',
    vendorId,
    dedupKey: `dexcom:${vendorId ?? timestamp}`,
  }
}

/**
 * Converts an array of Dexcom Share entries into NormalizedCGMReadings.
 *
 * @param entries - Raw Dexcom Share entries from any Dexcom client library
 * @returns Array of normalized readings, sorted chronologically
 */
export function normalizeDexcomEntries(
  entries: DexcomShareEntry[]
): NormalizedCGMReading[] {
  return entries
    .map(normalizeDexcomEntry)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
}
