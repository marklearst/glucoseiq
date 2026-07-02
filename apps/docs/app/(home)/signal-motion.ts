export const SCROLL_MEDIA_QUERY =
  '(min-width: 900px) and (min-height: 720px) and ' +
  '(prefers-reduced-motion: no-preference)'
export const REDUCED_MOTION_QUERY =
  '(prefers-reduced-motion: reduce)'
export const FALLBACK_THRESHOLD = 0.25
export const FALLBACK_ROOT_MARGIN = '0px'
export const FALLBACK_DURATION_MS = 1100
export const MAX_NATIVE_INSTRUMENT_HEIGHT = 616

export type SignalMotionLayout = 'scroll' | 'flow'
export type SignalMotionState =
  | 'idle'
  | 'armed'
  | 'revealing'
  | 'latched'
export type SignalPosition = 'below' | 'visible' | 'above'

export interface SignalMotionEnvironment {
  readonly reducedMotion: boolean
  readonly viewportEligible: boolean
  readonly supportsViewTimeline: boolean
  readonly supportsAnimationRange: boolean
  readonly position: SignalPosition
}

export interface SignalMotionSelection {
  readonly layout: SignalMotionLayout
  readonly state: SignalMotionState
}

interface SignalRect {
  readonly top: number
  readonly bottom: number
}

interface ScrollLayoutEnvironment {
  readonly layout: SignalMotionLayout
  readonly viewportEligible: boolean
  readonly instrumentHeight: number
}

export function selectSignalMotion(
  environment: SignalMotionEnvironment,
): SignalMotionSelection {
  if (environment.reducedMotion) {
    return { layout: 'flow', state: 'latched' }
  }

  const native =
    environment.viewportEligible &&
    environment.supportsViewTimeline &&
    environment.supportsAnimationRange

  if (environment.position !== 'below') {
    return {
      layout: native ? 'scroll' : 'flow',
      state: 'latched',
    }
  }

  return native
    ? { layout: 'scroll', state: 'revealing' }
    : { layout: 'flow', state: 'armed' }
}

export function classifySignalPosition(
  rect: SignalRect,
  viewportHeight: number,
): SignalPosition {
  if (rect.top >= viewportHeight) {
    return 'below'
  }

  if (rect.bottom <= 0) {
    return 'above'
  }

  return 'visible'
}

export function shouldLatchScrollLayout({
  layout,
  viewportEligible,
  instrumentHeight,
}: ScrollLayoutEnvironment): boolean {
  return (
    layout === 'scroll' &&
    (!viewportEligible ||
      instrumentHeight > MAX_NATIVE_INSTRUMENT_HEIGHT)
  )
}
