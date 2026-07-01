import {
  getGlucoseLabel,
  type GlucoseReading,
  type GlucoseTrendResult,
} from '@glucoseiq/core'
import { createGlucoseTraceGeometry } from '@/lib/glucose-profile'
import { GlucoseTrace } from './glucose-trace'
import styles from './glucose-signal.module.css'
import type { JSX } from 'react'

interface GlucoseSignalFigureProps {
  readonly readings: readonly GlucoseReading[]
  readonly timeZone: string
  readonly currentReading: GlucoseReading
  readonly currentTrend: Exclude<
    GlucoseTrendResult['trend'],
    'unknown'
  >
  readonly timeInRange: number
  readonly meanGlucose: number
  readonly gmi: number
  readonly cv: number
  readonly totalReadings: number
}

const PLOT_WIDTH = 1120
const PLOT_HEIGHT = 224
const Y_MIN = 40
const Y_MAX = 250

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

export function GlucoseSignalFigure({
  readings,
  timeZone,
  currentReading,
  currentTrend,
  timeInRange,
  meanGlucose,
  gmi,
  cv,
  totalReadings,
}: GlucoseSignalFigureProps): JSX.Element {
  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone,
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
    yMin: Y_MIN,
    yMax: Y_MAX,
  })
  const currentZone = getGlucoseLabel(
    currentReading.value,
    currentReading.unit,
  )

  return (
    <section aria-label="Example report" className={styles.signalSection}>
      <figure
        className={styles.signalInstrument}
        data-motion-part="instrument"
      >
        <header className={styles.signalHeader}>
          <div
            className={styles.latestReading}
            data-motion-part="latest-reading"
          >
            <p className={styles.signalLabel}>Latest synthetic reading</p>
            <div className={styles.readingValue}>
              <strong>{currentReading.value}</strong>
              <span>{currentReading.unit}</span>
            </div>
            <p className={styles.readingStatus}>
              <span aria-hidden="true" className={styles.trendArrow}>
                {TREND_ARROW[currentTrend]}
              </span>
              <span>{TREND_LABEL[currentTrend]}</span>
              <svg
                aria-hidden="true"
                className={styles.statusCheck}
                data-zone={currentZone}
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
              <span>{ZONE_LABEL[currentZone]}</span>
            </p>
          </div>

          <div className={styles.signalRanges}>
            <div>
              <span>Observed 24 hours</span>
              <strong>
                {geometry.observedRange.min}–{geometry.observedRange.max}{' '}
                mg/dL
              </strong>
            </div>
            <div>
              <span>Target range</span>
              <strong>70–180 mg/dL</strong>
            </div>
          </div>
        </header>

        <GlucoseTrace geometry={geometry} />

        <dl className={styles.signalMetrics} data-motion-part="metrics">
          <div>
            <dt>Time in range</dt>
            <dd>{timeInRange}%</dd>
          </div>
          <div>
            <dt>Mean</dt>
            <dd>{meanGlucose} mg/dL</dd>
          </div>
          <div>
            <dt>GMI</dt>
            <dd>{gmi}%</dd>
          </div>
          <div>
            <dt>CV</dt>
            <dd>{cv}%</dd>
          </div>
        </dl>

        <figcaption
          className={styles.signalCaption}
          data-motion-part="caption"
        >
          <span>
            {totalReadings.toLocaleString('en-US')} readings. Synthetic
            14-day report with its latest 24-hour trace.
          </span>
          <span>Synthetic data. Not clinically representative.</span>
        </figcaption>
      </figure>
    </section>
  )
}
