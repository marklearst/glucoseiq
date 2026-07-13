/**
 * @file src/metrics/episodes.ts
 *
 * Hypo- and hyperglycemia episode-candidate detection. Beyond-threshold
 * readings remain in one candidate while consecutive flagged timestamps are
 * less than the end-duration apart (default 15 min); a gap at least that long
 * starts a new candidate. Candidates must span the minimum duration (default
 * 15 min). Because non-excursion and missing readings are not retained, this
 * is timestamp grouping rather than proof of observed recovery.
 *
 * Event duration (percent-time) can hide clinically important episodes (one
 * long overnight low reads the same as scattered brief dips); this surfaces the
 * individual events, their level, extreme value, and duration.
 *
 * Pure and dependency-free.
 *
 * @see https://doi.org/10.2337/dc17-1600  Danne et al. (2017)
 * @see {@link https://diabetesjournals.org/care/article/42/8/1593 | International Consensus on Time in Range (2019)}
 */

import type { GlucoseReading } from '../types'
import { MG_DL, MGDL_MMOLL_CONVERSION } from '../constants'

/** A timestamp-grouped glucose episode candidate. */
export interface GlucoseEpisode {
  /** 'hypo' (below threshold) or 'hyper' (above threshold). */
  readonly type: 'hypo' | 'hyper'
  /** Clinical level: 1 (moderate) or 2 (clinically significant). */
  readonly level: 1 | 2
  /** ISO 8601 timestamp of the first reading in the episode. */
  readonly startTime: string
  /** ISO 8601 timestamp of the last reading in the episode. */
  readonly endTime: string
  /** Episode duration in minutes (span of flagged readings). */
  readonly durationMinutes: number
  /** Nadir (hypo) or peak (hyper) glucose in mg/dL. */
  readonly extremeValue: number
  /** Mean glucose of the flagged readings (mg/dL). */
  readonly meanValue: number
  /** Number of flagged readings in the episode. */
  readonly readingCount: number
}

/** Options for {@link detectEpisodes}. Thresholds are in mg/dL. */
export interface EpisodeOptions {
  /** Hypoglycemia threshold (default 70). */
  readonly hypoThreshold?: number
  /** Level 2 hypoglycemia threshold (default 54). */
  readonly hypoLevel2?: number
  /** Hyperglycemia threshold (default 180). */
  readonly hyperThreshold?: number
  /** Level 2 hyperglycemia threshold (default 250). */
  readonly hyperLevel2?: number
  /** Minimum episode duration in minutes (default 15). */
  readonly minDurationMin?: number
  /** Minimum gap between flagged readings that separates candidates, in minutes (default 15). */
  readonly endDurationMin?: number
}

/** Summary counts across timestamp-grouped episode candidates. */
export interface EpisodeSummary {
  readonly hypoCount: number
  readonly hyperCount: number
  readonly hypoLevel2Count: number
  readonly hyperLevel2Count: number
  readonly totalHypoMinutes: number
  readonly totalHyperMinutes: number
}

/** Result of {@link detectEpisodes}. */
export interface EpisodeResult {
  readonly hypoEvents: GlucoseEpisode[]
  readonly hyperEvents: GlucoseEpisode[]
  readonly summary: EpisodeSummary
}

interface Point {
  readonly t: number // minutes
  readonly v: number // mg/dL
  readonly iso: string
}

function findEpisodes(
  points: Point[],
  type: 'hypo' | 'hyper',
  threshold: number,
  level2: number,
  minDuration: number,
  endDuration: number
): GlucoseEpisode[] {
  const inExcursion = (v: number): boolean =>
    type === 'hypo' ? v < threshold : v > threshold
  const isLevel2 = (v: number): boolean => (type === 'hypo' ? v < level2 : v > level2)

  const flagged = points.filter((p) => inExcursion(p.v))
  const episodes: GlucoseEpisode[] = []
  if (flagged.length === 0) return episodes

  const commit = (group: Point[]): void => {
    const span = group[group.length - 1].t - group[0].t
    if (span < minDuration) return
    const values = group.map((p) => p.v)
    const extreme = values.reduce((acc, v) =>
      type === 'hypo' ? (v < acc ? v : acc) : v > acc ? v : acc
    )
    episodes.push({
      type,
      level: values.some(isLevel2) ? 2 : 1,
      startTime: group[0].iso,
      endTime: group[group.length - 1].iso,
      durationMinutes: Math.round(span * 10) / 10,
      extremeValue: Math.round(extreme),
      meanValue: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
      readingCount: group.length,
    })
  }

  let group: Point[] = [flagged[0]]
  for (let i = 1; i < flagged.length; i++) {
    if (flagged[i].t - group[group.length - 1].t < endDuration) {
      group.push(flagged[i])
    } else {
      commit(group)
      group = [flagged[i]]
    }
  }
  commit(group)
  return episodes
}

/**
 * Groups hypo- and hyperglycemia episode candidates from a series of readings.
 *
 * Consecutive beyond-threshold timestamps less than `endDurationMin` apart
 * remain grouped. Non-excursion and missing readings are not retained, so a
 * candidate does not prove observed recovery or continuous sensor coverage.
 *
 * @param readings - Glucose readings with ISO 8601 timestamps
 * @param options - Thresholds, minimum candidate duration, and separating gap
 * @returns Hypo and hyper episode candidates plus a summary
 *
 * @example
 * ```ts typecheck
 * import { type GlucoseReading } from '@glucoseiq/core'
 * import { detectEpisodes } from '@glucoseiq/core/metrics'
 *
 * const readings: GlucoseReading[] = [
 *   { value: 65, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
 *   { value: 60, unit: 'mg/dL', timestamp: '2024-01-01T08:10:00Z' },
 *   { value: 62, unit: 'mg/dL', timestamp: '2024-01-01T08:20:00Z' },
 * ]
 * const { hypoEvents, summary } = detectEpisodes(readings)
 * const firstEpisode = hypoEvents[0]
 * if (firstEpisode) firstEpisode.durationMinutes
 * summary.hypoCount
 * ```
 *
 * @category Episodes
 * @public
 */
export function detectEpisodes(
  readings: GlucoseReading[],
  options?: EpisodeOptions
): EpisodeResult {
  const hypoThreshold = options?.hypoThreshold ?? 70
  const hypoLevel2 = options?.hypoLevel2 ?? 54
  const hyperThreshold = options?.hyperThreshold ?? 180
  const hyperLevel2 = options?.hyperLevel2 ?? 250
  const minDurationMin = options?.minDurationMin ?? 15
  const endDurationMin = options?.endDurationMin ?? 15

  const points: Point[] = []
  for (const r of readings) {
    const mgdl = r.unit === MG_DL ? r.value : r.value * MGDL_MMOLL_CONVERSION
    if (!Number.isFinite(mgdl) || mgdl <= 0) continue
    const ms = Date.parse(r.timestamp)
    if (Number.isNaN(ms)) continue
    points.push({ t: ms / 60000, v: mgdl, iso: r.timestamp })
  }
  points.sort((a, b) => a.t - b.t)

  const hypoEvents = findEpisodes(
    points,
    'hypo',
    hypoThreshold,
    hypoLevel2,
    minDurationMin,
    endDurationMin
  )
  const hyperEvents = findEpisodes(
    points,
    'hyper',
    hyperThreshold,
    hyperLevel2,
    minDurationMin,
    endDurationMin
  )

  const sumMinutes = (events: GlucoseEpisode[]): number =>
    Math.round(events.reduce((s, e) => s + e.durationMinutes, 0) * 10) / 10

  return {
    hypoEvents,
    hyperEvents,
    summary: {
      hypoCount: hypoEvents.length,
      hyperCount: hyperEvents.length,
      hypoLevel2Count: hypoEvents.filter((e) => e.level === 2).length,
      hyperLevel2Count: hyperEvents.filter((e) => e.level === 2).length,
      totalHypoMinutes: sumMinutes(hypoEvents),
      totalHyperMinutes: sumMinutes(hyperEvents),
    },
  }
}
