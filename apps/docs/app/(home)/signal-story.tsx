'use client'

import {
  useEffect,
  useRef,
  type JSX,
  type ReactNode,
} from 'react'
import {
  classifySignalPosition,
  FALLBACK_DURATION_MS,
  FALLBACK_ROOT_MARGIN,
  FALLBACK_THRESHOLD,
  MAX_NATIVE_INSTRUMENT_HEIGHT,
  REDUCED_MOTION_QUERY,
  SCROLL_MEDIA_QUERY,
  selectSignalMotion,
  shouldLatchScrollLayout,
  type SignalMotionLayout,
  type SignalMotionState,
} from './signal-motion'
import styles from './glucose-signal.module.css'

interface SignalStoryProps {
  readonly children: ReactNode
}

type SignalMotionSticky = 'enabled' | 'disabled'

export function SignalStory({
  children,
}: SignalStoryProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (root === null) {
      return
    }

    const instrument = root.querySelector<HTMLElement>(
      '[data-motion-part="instrument"]',
    )
    if (instrument === null) {
      return
    }

    const completionSentinel = root.querySelector<HTMLElement>(
      '[data-motion-part="completion-sentinel"]',
    )
    const scrollQuery = window.matchMedia(SCROLL_MEDIA_QUERY)
    const reducedMotionQuery = window.matchMedia(
      REDUCED_MOTION_QUERY,
    )
    const supportsViewTimeline = CSS.supports(
      'view-timeline-name: --signal-passage',
    )
    const supportsAnimationRange = CSS.supports(
      'animation-range: contain 0% contain 15%',
    )
    const initialPosition = classifySignalPosition(
      instrument.getBoundingClientRect(),
      window.innerHeight,
    )
    const selection = selectSignalMotion({
      reducedMotion: reducedMotionQuery.matches,
      viewportEligible:
        scrollQuery.matches &&
        instrument.offsetHeight <= MAX_NATIVE_INSTRUMENT_HEIGHT,
      supportsViewTimeline,
      supportsAnimationRange,
      position: initialPosition,
    })
    const layout: SignalMotionLayout = selection.layout
    let state: SignalMotionState = selection.state
    let active = true
    let triggerObserver: IntersectionObserver | null = null
    let completionObserver: IntersectionObserver | null = null
    let fallbackTimer: number | null = null

    const writeState = (nextState: SignalMotionState): void => {
      if (!active) {
        return
      }

      state = nextState
      root.dataset.motionState = nextState
    }

    const writeSticky = (
      nextSticky: SignalMotionSticky,
    ): void => {
      if (!active) {
        return
      }

      root.dataset.motionSticky = nextSticky
    }

    const clearFallbackTimer = (): void => {
      if (fallbackTimer === null) {
        return
      }

      window.clearTimeout(fallbackTimer)
      fallbackTimer = null
    }

    const disconnectObservers = (): void => {
      triggerObserver?.disconnect()
      completionObserver?.disconnect()
    }

    const latch = (): void => {
      if (!active || state === 'latched') {
        return
      }

      disconnectObservers()
      clearFallbackTimer()
      writeState('latched')
    }

    root.dataset.motionLayout = layout
    writeState(state)
    writeSticky(
      layout === 'scroll' &&
        scrollQuery.matches &&
        instrument.offsetHeight <= MAX_NATIVE_INSTRUMENT_HEIGHT
        ? 'enabled'
        : 'disabled',
    )

    if (layout === 'flow' && state === 'armed') {
      triggerObserver = new IntersectionObserver(
        (entries) => {
          if (
            !active ||
            state !== 'armed' ||
            !entries.some((entry) => entry.isIntersecting)
          ) {
            return
          }

          writeState('revealing')
          triggerObserver?.disconnect()
          fallbackTimer = window.setTimeout(() => {
            fallbackTimer = null
            latch()
          }, FALLBACK_DURATION_MS)
        },
        {
          threshold: FALLBACK_THRESHOLD,
          rootMargin: FALLBACK_ROOT_MARGIN,
        },
      )
      triggerObserver.observe(instrument)
    }

    if (
      layout === 'scroll' &&
      state !== 'latched' &&
      completionSentinel !== null
    ) {
      completionObserver = new IntersectionObserver((entries) => {
        if (
          !active ||
          !entries.some((entry) => entry.isIntersecting)
        ) {
          return
        }

        latch()
      })
      completionObserver.observe(completionSentinel)
    }

    const onPageShow = (event: PageTransitionEvent): void => {
      if (!active) {
        return
      }

      if (event.persisted) {
        latch()
        return
      }

      const position = classifySignalPosition(
        instrument.getBoundingClientRect(),
        window.innerHeight,
      )
      if (position !== 'below') {
        latch()
      }
    }

    const onReducedMotionChange = (
      event: MediaQueryListEvent,
    ): void => {
      if (!active || !event.matches) {
        return
      }

      latch()
      writeSticky('disabled')
    }

    const onViewportChange = (): void => {
      if (!active) {
        return
      }

      if (
        shouldLatchScrollLayout({
          layout,
          viewportEligible: scrollQuery.matches,
          instrumentHeight: instrument.offsetHeight,
        })
      ) {
        latch()
        writeSticky('disabled')
      }
    }

    reducedMotionQuery.addEventListener(
      'change',
      onReducedMotionChange,
    )
    scrollQuery.addEventListener('change', onViewportChange)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('orientationchange', onViewportChange)

    return () => {
      active = false
      reducedMotionQuery.removeEventListener(
        'change',
        onReducedMotionChange,
      )
      scrollQuery.removeEventListener('change', onViewportChange)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener(
        'orientationchange',
        onViewportChange,
      )
      triggerObserver?.disconnect()
      completionObserver?.disconnect()
      clearFallbackTimer()
    }
  }, [])

  return (
    <div
      className={styles.signalStory}
      data-motion-layout="flow"
      data-motion-state="idle"
      data-motion-sticky="enabled"
      ref={rootRef}
    >
      {children}
      <span
        aria-hidden="true"
        className={styles.completionSentinel}
        data-motion-part="completion-sentinel"
      />
    </div>
  )
}
