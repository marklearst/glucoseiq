import {
  getGlucoseLabel,
  type EnhancedTIRResult,
  type GlucoseReading,
  type GlucoseTrendResult,
} from '@glucoseiq/core'
import type { AGPProfileResult } from '@glucoseiq/core/metrics'
import { createGlucoseTraceGeometry } from '@/lib/glucose-profile'
import { DailyProfile } from './agp-profile'
import { GMIScale } from './gmi-scale'
import { GlucoseTrace } from './glucose-trace'
import { TimeInRangeDistribution } from './time-in-range-distribution'
import styles from './glucose-report.module.css'
import type { JSX } from 'react'

interface GlucoseReportSuiteProps {
  readonly readings: readonly GlucoseReading[]
  readonly profile: AGPProfileResult
  readonly currentReading: GlucoseReading
  readonly currentTrend: Exclude<GlucoseTrendResult['trend'], 'unknown'>
  readonly timeInRange: EnhancedTIRResult
  readonly meanGlucose: number
  readonly gmi: number
  readonly cv: number
  readonly totalReadings: number
  readonly days: number
}

const PLOT_WIDTH = 1200
const PLOT_HEIGHT = 290

const TREND_ARROW = {
  rapidRising: '⇈',
  rising: '↑',
  slightlyRising: '↗',
  flat: '→',
  slightlyFalling: '↘',
  falling: '↓',
  rapidFalling: '⇊',
  unknown: '·',
} as const

const TREND_LABEL = {
  rapidRising: 'Rising quickly',
  rising: 'Rising',
  slightlyRising: 'Rising slowly',
  flat: 'Steady',
  slightlyFalling: 'Falling slowly',
  falling: 'Falling',
  rapidFalling: 'Falling quickly',
  unknown: 'Trend unavailable',
} as const

const ZONE_LABEL = {
  low: 'Low',
  normal: 'In range',
  high: 'High',
} as const

export function GlucoseReportSuite({
  readings,
  profile,
  currentReading,
  currentTrend,
  timeInRange,
  meanGlucose,
  gmi,
  cv,
  totalReadings,
  days,
}: GlucoseReportSuiteProps): JSX.Element {
  const traceGeometry = createGlucoseTraceGeometry({
    readings,
    timeZone: profile.timeZone,
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
    yMin: 40,
    yMax: 250,
  })
  const currentZone = getGlucoseLabel(
    currentReading.value,
    currentReading.unit,
  )

  return (
    <section
      aria-labelledby="glucose-report-title"
      className={styles.reportSection}
    >
      <div className={styles.reportIntro}>
        <h2 id="glucose-report-title">A glucose report ready to render.</h2>
        <p>
          The same {days}-day synthetic fixture drives the latest reading,
          24-hour trace, range distribution, GMI estimate, and daily profile.
        </p>
      </div>
      <figure className={styles.reportFigure}>
        <div className={styles.reportGrid}>
          <section
            aria-labelledby="trace-panel-title"
            className={`${styles.reportPanel} ${styles.tracePanel}`}
            data-report-view="trace"
          >
            <h3 className={styles.visuallyHidden} id="trace-panel-title">
              Latest 24-hour glucose trace
            </h3>
            <header className={styles.traceHeader}>
              <div className={styles.currentReading}>
                <p className={styles.panelEyebrow}>Latest reading</p>
                <div className={styles.readingValue}>
                  <strong>{currentReading.value}</strong>
                  <span>{currentReading.unit}</span>
                </div>
                <p className={styles.readingStatus}>
                  <span aria-hidden="true" className={styles.trendArrow}>
                    {TREND_ARROW[currentTrend]}
                  </span>
                  <span>{TREND_LABEL[currentTrend]}</span>
                  {currentZone === 'normal' ? (
                    <svg
                      aria-hidden="true"
                      className={styles.statusCheck}
                      fill="none"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="m3.25 8.25 3 3 6.5-6.5"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                  ) : null}
                  <span>{ZONE_LABEL[currentZone]}</span>
                </p>
              </div>

              <div className={styles.traceContext}>
                <div>
                  <p className={styles.panelEyebrow}>Last 24 hours</p>
                  <strong className={styles.traceRange}>
                    {traceGeometry.observedRange.min}–
                    {traceGeometry.observedRange.max} mg/dL
                  </strong>
                </div>
                <div>
                  <p className={styles.panelEyebrow}>Target range</p>
                  <strong>70–180 mg/dL</strong>
                </div>
              </div>
            </header>

            <GlucoseTrace geometry={traceGeometry} />
          </section>

          <div className={styles.supportDeck}>
            <GMIScale
              days={days}
              meanGlucose={meanGlucose}
              value={gmi}
            />
            <TimeInRangeDistribution
              days={days}
              result={timeInRange}
            />
            <DailyProfile
              cv={cv}
              days={days}
              profile={profile}
            />
          </div>
        </div>

        <figcaption className={styles.reportCaption}>
          <span>
            {totalReadings.toLocaleString('en-US')} synthetic readings ·{' '}
            {days} generated days · {profile.timeZone}
          </span>
          <span>Synthetic data. Not clinically representative.</span>
        </figcaption>
      </figure>
    </section>
  )
}
