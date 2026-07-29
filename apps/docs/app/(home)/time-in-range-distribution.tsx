import type { EnhancedTIRResult } from '@glucoseiq/core'
import { useId, type JSX } from 'react'
import styles from './glucose-report.module.css'

interface TimeInRangeDistributionProps {
  readonly result: EnhancedTIRResult
  readonly days: number
}

const ZONES = [
  {
    key: 'veryLow',
    label: 'Very low',
    range: '<54',
    className: 'tirVeryLow',
  },
  {
    key: 'low',
    label: 'Low',
    range: '54–69',
    className: 'tirLow',
  },
  {
    key: 'inRange',
    label: 'In range',
    range: '70–180',
    className: 'tirInRange',
  },
  {
    key: 'high',
    label: 'High',
    range: '181–250',
    className: 'tirHigh',
  },
  {
    key: 'veryHigh',
    label: 'Very high',
    range: '>250',
    className: 'tirVeryHigh',
  },
] as const

export function TimeInRangeDistribution({
  result,
  days,
}: TimeInRangeDistributionProps): JSX.Element {
  const id = useId().replaceAll(':', '')
  const titleId = `tir-title-${id}`
  const total = result.summary.totalReadings

  return (
    <section
      aria-labelledby={titleId}
      className={`${styles.reportPanel} ${styles.tirPanel}`}
      data-report-view="tir"
    >
      <header className={styles.panelHeader}>
        <div>
          <h3 id={titleId}>Time in range</h3>
          <p className={styles.panelSubhead}>
            {days} days · Target 70–180 mg/dL
          </p>
        </div>
        <strong className={styles.tirHeadlineValue}>
          {result.inRange.percentage}%
        </strong>
      </header>

      <div aria-hidden="true" className={styles.tirRail}>
        {ZONES.map((zone) => {
          const metric = result[zone.key]
          const exactPercentage =
            total === 0 ? 0 : (metric.readingCount / total) * 100

          return (
            <span
              className={`${styles.tirSegment} ${styles[zone.className]}`}
              data-motion-part="tir-segment"
              key={zone.key}
              style={{
                flexBasis: `${exactPercentage}%`,
                flexGrow: exactPercentage,
              }}
            />
          )
        })}
      </div>

      <ul
        aria-label={`Of ${total.toLocaleString('en-US')} synthetic readings`}
        className={styles.tirLegend}
      >
        {ZONES.map((zone) => {
          const metric = result[zone.key]
          return (
            <li key={zone.key}>
              <span
                aria-hidden="true"
                className={`${styles.tirSwatch} ${styles[zone.className]}`}
              />
              <strong className={styles.tirZone}>{zone.label}</strong>
              <span className={styles.tirRange}>
                {zone.range} mg/dL
              </span>
              <span className={styles.tirPercent}>
                {metric.percentage.toFixed(1)}%
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
