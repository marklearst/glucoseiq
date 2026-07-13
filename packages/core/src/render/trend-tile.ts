/**
 * @file src/render/trend-tile.ts
 *
 * Renders a glanceable current-glucose tile — the big value, trend arrow, and
 * zone label — as a self-contained SVG string. This dashboard element is
 * driven by the live model (latest reading + derived trend). Native and watch
 * surfaces require host-application integration. Identity is carried by the
 * value, arrow, and text label, not color alone.
 *
 * Pure and dependency-free.
 */

import type { GlucoseReading } from '../types'
import type { CGMTrend } from '../connectors/types'
import { latestReading, computeGlucoseTrend } from '../live'
import { getGlucoseLabel } from '../glucose'
import { isUsableReading } from '../reading-policy'
import { resolveSvgDimension } from './svg-options'

/** Options for {@link trendTileToSVG}. */
export interface TrendTileOptions {
  /** SVG width in px (default 240). */
  readonly width?: number
  /** SVG height in px (default 140). */
  readonly height?: number
  /** Color theme (default 'dark'). */
  readonly theme?: 'light' | 'dark'
}

const ARROWS: Record<CGMTrend, string> = {
  rapidRising: '⇈',
  rising: '↑',
  slightlyRising: '↗',
  flat: '→',
  slightlyFalling: '↘',
  falling: '↓',
  rapidFalling: '⇊',
  unknown: '·',
}

const ACCENT: Record<'low' | 'normal' | 'high', string> = {
  low: '#ef4444',
  normal: '#22c55e',
  high: '#fbbf24',
}

const ZONE_LABEL: Record<'low' | 'normal' | 'high', string> = {
  low: 'LOW',
  normal: 'IN RANGE',
  high: 'HIGH',
}

/** Copies caller readings into a plain, stable series without coercion. */
function snapshotUsableReadings(
  readings: GlucoseReading[]
): GlucoseReading[] | null {
  try {
    const items: unknown[] = Array.from(readings as unknown[])
    const snapshot: GlucoseReading[] = []

    for (const item of items) {
      if (item === null || typeof item !== 'object') continue

      const candidate = item as Record<string, unknown>
      const value = candidate.value
      const unit = candidate.unit
      const timestamp = candidate.timestamp

      if (
        typeof value !== 'number' ||
        typeof unit !== 'string' ||
        typeof timestamp !== 'string'
      ) {
        continue
      }

      const reading = {
        value,
        unit,
        timestamp,
      } as GlucoseReading
      if (isUsableReading(reading)) snapshot.push(reading)
    }

    return snapshot
  } catch {
    return null
  }
}

/**
 * Renders a current-glucose trend tile as an SVG string.
 *
 * @param readings - Glucose readings with ISO 8601 timestamps
 * @param options - Dimensions and theme
 * @returns A self-contained SVG document string
 * @throws {DomainError} If width or height is not a finite positive number
 *
 * @example
 * ```ts typecheck
 * import { type GlucoseReading } from '@glucoseiq/core'
 * import { trendTileToSVG } from '@glucoseiq/core/render'
 *
 * const readings: GlucoseReading[] = [
 *   { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
 * ]
 * const svg = trendTileToSVG(readings) // 120 → IN RANGE
 * ```
 *
 * @category Render
 * @public
 */
export function trendTileToSVG(
  readings: GlucoseReading[],
  options?: TrendTileOptions
): string {
  const width = resolveSvgDimension(
    options?.width,
    240,
    'trendTileToSVG',
    'width'
  )
  const height = resolveSvgDimension(
    options?.height,
    140,
    'trendTileToSVG',
    'height'
  )
  const theme = options?.theme ?? 'dark'
  const bg = theme === 'light' ? '#ffffff' : '#0a0a0a'
  const muted = theme === 'light' ? '#475569' : '#94a3b8'

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Current glucose">`,
    `<rect width="${width}" height="${height}" fill="${bg}"/>`,
  ]

  const snapshot = snapshotUsableReadings(readings)
  const latest = snapshot === null ? null : latestReading(snapshot)
  if (snapshot === null || latest === null) {
    parts.push(
      `<text x="${width / 2}" y="${height / 2}" fill="${muted}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" text-anchor="middle">No data</text>`
    )
    parts.push('</svg>')
    return parts.join('')
  }

  const label = getGlucoseLabel(latest.value, latest.unit)
  const accent = ACCENT[label]
  const arrow = ARROWS[computeGlucoseTrend(snapshot).trend]

  parts.push(
    `<text x="20" y="82" fill="${accent}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="52" font-weight="700" text-anchor="start">${latest.value}</text>`
  )
  parts.push(
    `<text x="${width - 20}" y="76" fill="${accent}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="40" text-anchor="end">${arrow}</text>`
  )
  parts.push(
    `<text x="20" y="112" fill="${muted}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" letter-spacing="0.5" text-anchor="start">${ZONE_LABEL[label]} · ${latest.unit}</text>`
  )

  parts.push('</svg>')
  return parts.join('')
}
