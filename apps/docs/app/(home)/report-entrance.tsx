'use client'

import { useLayoutEffect, useRef, type JSX, type ReactNode } from 'react'
import {
  classifyReportPosition,
  hasPassedReportViewport,
  hasReachedReportIntersection,
  REPORT_ENTRANCE_DURATION_MS,
  REPORT_INTERSECTION_ROOT_MARGIN,
  REPORT_INTERSECTION_THRESHOLD,
  selectReportEntrance,
} from './report-motion'
import styles from './glucose-report.module.css'

interface ReportEntranceProps {
  readonly children: ReactNode
}

let hasPlayedReport = false

export function ReportEntrance({
  children,
}: ReportEntranceProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (root === null) return
    const target =
      root.querySelector<HTMLElement>('[data-motion-part="report"]') ??
      root

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    )
    let active = true
    let completionTimer: number | undefined

    const complete = (): void => {
      if (!active) return
      hasPlayedReport = true
      root.dataset.entranceState = 'complete'
      observer.unobserve(target)
      if (completionTimer !== undefined) {
        window.clearTimeout(completionTimer)
        completionTimer = undefined
      }
    }
    const reveal = (): void => {
      if (!active || root.dataset.entranceState !== 'armed') return
      hasPlayedReport = true
      root.dataset.entranceState = 'revealing'
      observer.unobserve(target)
      completionTimer = window.setTimeout(
        complete,
        REPORT_ENTRANCE_DURATION_MS,
      )
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active || root.dataset.entranceState !== 'armed') return
        if (reducedMotion.matches || hasPassedReportViewport(entries)) {
          complete()
          return
        }
        if (hasReachedReportIntersection(entries)) reveal()
      },
      {
        rootMargin: REPORT_INTERSECTION_ROOT_MARGIN,
        threshold: REPORT_INTERSECTION_THRESHOLD,
      },
    )
    const onReducedMotionChange = (
      event: MediaQueryListEvent,
    ): void => {
      if (event.matches) complete()
    }
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) complete()
    }
    const onViewportChange = (): void => {
      if (root.dataset.entranceState === 'revealing') {
        complete()
        return
      }
      if (root.dataset.entranceState !== 'armed') return

      const position = classifyReportPosition(
        target.getBoundingClientRect(),
        window.innerHeight,
      )
      if (position !== 'below') complete()
    }
    const position = classifyReportPosition(
      target.getBoundingClientRect(),
      window.innerHeight,
    )
    const initialState = selectReportEntrance({
      reducedMotion: reducedMotion.matches,
      hasPlayed: hasPlayedReport,
      position,
    })

    root.dataset.entranceState = initialState
    if (initialState === 'armed') observer.observe(target)
    else hasPlayedReport = true

    reducedMotion.addEventListener('change', onReducedMotionChange)
    window.addEventListener('orientationchange', onViewportChange)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('resize', onViewportChange, { passive: true })

    return () => {
      active = false
      observer.disconnect()
      if (completionTimer !== undefined) {
        window.clearTimeout(completionTimer)
      }
      reducedMotion.removeEventListener('change', onReducedMotionChange)
      window.removeEventListener('orientationchange', onViewportChange)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [])

  return (
    <div
      className={styles.reportEntrance}
      data-entrance-state="complete"
      ref={rootRef}
    >
      {children}
    </div>
  )
}
