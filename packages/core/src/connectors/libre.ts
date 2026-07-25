/**
 * @file src/connectors/libre.ts
 *
 * Converts Libre LinkUp API payloads to NormalizedCGMReading values.
 * A Libre LinkUp client must authenticate and fetch the payloads.
 *
 * @see https://www.npmjs.com/package/librelinkup-api-client
 * @see https://www.npmjs.com/package/libre-client
 */

import { MG_DL, MMOL_L } from '../constants'
import { DomainError, TimestampError } from '../errors'
import { toUsableMgDl } from '../reading-policy'
import type {
  LibreLinkUpEntry,
  LibreTrendValue,
  NormalizedCGMReading,
  CGMTrend,
} from './types'

const LIBRE_TREND_MAP: Record<LibreTrendValue, CGMTrend> = {
  1: 'rapidFalling',
  2: 'falling',
  3: 'flat',
  4: 'rising',
  5: 'rapidRising',
}

/** Resolves Libre's numeric display-unit flag without accepting coercible values. */
function resolveLibreUnit(flag: unknown): typeof MG_DL | typeof MMOL_L {
  if (flag === undefined || flag === 1) return MG_DL
  if (flag === 0) return MMOL_L
  throw new DomainError(
    `Libre entry has unsupported glucose unit: ${String(flag)}`,
    'INVALID_UNIT'
  )
}

/**
 * Maps a Libre LinkUp numeric trend value to the shared `CGMTrend` values.
 *
 * Accepts the raw API value (which may be null/undefined or out of range)
 * and returns 'unknown' for any invalid or unmapped values.
 */
export function normalizeLibreTrend(
  trend: number | null | undefined
): CGMTrend {
  // LibreTrendValue is defined as 1–5; anything else is treated as unknown.
  if (
    typeof trend !== 'number' ||
    !Number.isFinite(trend) ||
    !Number.isInteger(trend) ||
    trend < 1 ||
    trend > 5
  ) {
    return 'unknown'
  }

  return LIBRE_TREND_MAP[trend as LibreTrendValue]
}

/**
 * Converts a single Libre LinkUp entry into a NormalizedCGMReading.
 *
 * @param entry - Raw Libre LinkUp entry
 * @returns A normalized reading usable by APIs that accept `GlucoseReading`, subject to each API's contract
 * @throws {TimestampError} If the timestamp cannot be parsed
 * @throws {DomainError} If the unit or glucose value is not usable
 */
export function normalizeLibreEntry(
  entry: LibreLinkUpEntry
): NormalizedCGMReading {
  const timestampError = `Unable to parse Libre timestamp: ${String(
    entry.Timestamp
  )}`
  let parsed = Number.NaN
  if (typeof entry.Timestamp === 'string') {
    try {
      parsed = Date.parse(entry.Timestamp)
    } catch {
      parsed = Number.NaN
    }
  }
  const parsedDate = new Date(parsed)
  if (!Number.isFinite(parsed) || !Number.isFinite(parsedDate.getTime())) {
    throw new TimestampError(timestampError)
  }

  const timestamp = parsedDate.toISOString()

  // Unit handling: prefer the explicit mg/dL field; otherwise honor the
  // account's display-unit flag (0 = mmol/L). Legacy payloads with neither
  // field remain mg/dL for backward compatibility.
  const nativeUnit = resolveLibreUnit(entry.GlucoseUnits)
  const nativeIsMmol = nativeUnit === MMOL_L
  if (entry.ValueInMgPerDl !== undefined) {
    toUsableMgDl(entry.ValueInMgPerDl, MG_DL, 'Libre entry')
    return {
      value: entry.ValueInMgPerDl,
      unit: MG_DL,
      ...(nativeIsMmol ? { nativeUnit: MMOL_L } : {}),
      timestamp,
      trend: normalizeLibreTrend(entry.TrendArrow),
      source: 'libre',
      dedupKey: `libre:${timestamp}`,
    }
  }
  toUsableMgDl(entry.Value, nativeUnit, 'Libre entry')
  return {
    value: entry.Value,
    unit: nativeUnit,
    timestamp,
    trend: normalizeLibreTrend(entry.TrendArrow),
    source: 'libre',
    dedupKey: `libre:${timestamp}`,
  }
}

/**
 * Converts an array of Libre LinkUp entries into NormalizedCGMReadings.
 *
 * @param entries - Raw Libre LinkUp entries from any Libre client library
 * @returns Array of normalized readings, sorted chronologically
 */
export function normalizeLibreEntries(
  entries: LibreLinkUpEntry[]
): NormalizedCGMReading[] {
  return entries
    .map(normalizeLibreEntry)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
}
