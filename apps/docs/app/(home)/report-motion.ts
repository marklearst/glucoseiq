export const REPORT_INTERSECTION_THRESHOLD = 0.12
export const REPORT_INTERSECTION_ROOT_MARGIN = '0px 0px -8% 0px'
export const REPORT_SHELL_DURATION_MS = 420
export const REPORT_TRACE_DELAY_MS = 240
export const REPORT_TRACE_DURATION_MS = 850
export const REPORT_ANALYTICS_DELAY_MS = 720
export const REPORT_GMI_DURATION_MS = 700
export const REPORT_TIR_DURATION_MS = 460
export const REPORT_CAPSULE_DURATION_MS = 420
export const REPORT_CAPSULE_STAGGER_MS = 28
export const REPORT_ENTRANCE_DURATION_MS = 1500

export type ReportPosition = 'below' | 'visible' | 'above'
export type ReportEntranceState = 'complete' | 'armed' | 'revealing'

interface ReportRect {
  readonly top: number
  readonly bottom: number
}

interface ReportIntersection {
  readonly isIntersecting: boolean
  readonly intersectionRatio: number
}

interface ReportViewportEntry {
  readonly boundingClientRect: {
    readonly bottom: number
  }
}

interface ReportEntranceEnvironment {
  readonly reducedMotion: boolean
  readonly hasPlayed: boolean
  readonly position: ReportPosition
}

export function selectReportEntrance({
  reducedMotion,
  hasPlayed,
  position,
}: ReportEntranceEnvironment): ReportEntranceState {
  return !reducedMotion && !hasPlayed && position === 'below'
    ? 'armed'
    : 'complete'
}

export function classifyReportPosition(
  rect: ReportRect,
  viewportHeight: number,
): ReportPosition {
  if (rect.top >= viewportHeight) return 'below'
  if (rect.bottom <= 0) return 'above'
  return 'visible'
}

export function hasReachedReportIntersection(
  entries: readonly ReportIntersection[],
): boolean {
  return entries.some(
    (entry) =>
      entry.isIntersecting &&
      entry.intersectionRatio >= REPORT_INTERSECTION_THRESHOLD,
  )
}

export function hasPassedReportViewport(
  entries: readonly ReportViewportEntry[],
): boolean {
  return entries.some((entry) => entry.boundingClientRect.bottom <= 0)
}
