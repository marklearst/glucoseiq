import type { AGPProfileResult } from '@glucoseiq/core/metrics'
import { createDailyProfileGeometry } from '@/lib/glucose-profile'
import { useId, type CSSProperties, type JSX } from 'react'
import {
  REPORT_ANALYTICS_DELAY_MS,
  REPORT_CAPSULE_STAGGER_MS,
} from './report-motion'
import styles from './glucose-report.module.css'

interface DailyProfileProps {
  readonly profile: AGPProfileResult
  readonly cv: number
  readonly days: number
}

const WIDTH = 640
const HEIGHT = 180
const MEDIAN_WIDTH = 18

export function DailyProfile({
  profile,
  cv,
  days,
}: DailyProfileProps): JSX.Element {
  const id = useId().replaceAll(':', '')
  const panelTitleId = `daily-panel-title-${id}`
  const titleId = `daily-title-${id}`
  const descriptionId = `daily-description-${id}`
  const geometry = createDailyProfileGeometry({
    profile,
    width: WIDTH,
    height: HEIGHT,
    yMin: 40,
    yMax: 250,
  })

  return (
    <section
      aria-labelledby={panelTitleId}
      className={`${styles.reportPanel} ${styles.agpPanel}`}
      data-report-view="agp"
    >
      <header className={styles.panelHeader}>
        <div>
          <h3 id={panelTitleId}>Daily profile</h3>
          <p className={styles.panelSubhead}>
            {days}-day percentile profile
          </p>
        </div>
        <dl className={styles.panelMetric}>
          <div>
            <dt>CV</dt>
            <dd>{cv}%</dd>
          </div>
        </dl>
      </header>

      <div className={styles.agpChart}>
        <span aria-hidden="true" className={styles.agpTargetLabel}>
          Target 70–180 mg/dL
        </span>
        <svg
          aria-labelledby={`${titleId} ${descriptionId}`}
          className={styles.agpSvg}
          focusable="false"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <title id={titleId}>Two-hour glucose percentile profile</title>
          <desc id={descriptionId}>
            Twelve two-hour distributions in {profile.timeZone} across{' '}
            {days} synthetic days. Each thin stem spans the 5th to 95th
            percentiles, each capsule spans the middle 50 percent, and each
            short line marks the median. The green field marks the target
            range from 70 to 180 milligrams per deciliter. Coefficient of
            variation is {cv} percent.
          </desc>
          <rect
            className={styles.agpTarget}
            height={geometry.target.lowY - geometry.target.highY}
            width={WIDTH}
            y={geometry.target.highY}
          />
          {[geometry.target.highY, geometry.target.lowY].map((y) => (
            <line
              className={styles.agpThreshold}
              key={y}
              x1="0"
              x2={WIDTH}
              y1={y}
              y2={y}
            />
          ))}
          {geometry.columns.map((column, index) => {
            const capsuleCenter =
              (column.capsuleTop + column.capsuleBottom) / 2
            const capsuleHalfHeight = Math.max(
              1.5,
              (column.capsuleBottom - column.capsuleTop) / 2,
            )
            const columnStyle = {
              '--profile-index': index,
              '--profile-delay': `${
                REPORT_ANALYTICS_DELAY_MS +
                index * REPORT_CAPSULE_STAGGER_MS
              }ms`,
            } as CSSProperties

            return (
              <g
                className={styles.profileColumn}
                data-profile-column={index}
                key={column.minuteOfDay}
                style={columnStyle}
              >
                <line
                  className={styles.profileStem}
                  x1={column.x}
                  x2={column.x}
                  y1={column.stemTop}
                  y2={column.stemBottom}
                />
                <line
                  className={styles.profileCapsule}
                  x1={column.x}
                  x2={column.x}
                  y1={capsuleCenter - capsuleHalfHeight}
                  y2={capsuleCenter + capsuleHalfHeight}
                />
                <line
                  className={styles.profileMedian}
                  x1={column.x - MEDIAN_WIDTH / 2}
                  x2={column.x + MEDIAN_WIDTH / 2}
                  y1={column.medianY}
                  y2={column.medianY}
                />
              </g>
            )
          })}
        </svg>
        <div aria-hidden="true" className={styles.agpAxis}>
          {geometry.timeLabels.map(({ label, x }, index) => (
            <span
              data-minor={index === 1 || index === 3 ? 'true' : undefined}
              key={`${label}-${x}`}
              style={{ left: `${(x / WIDTH) * 100}%` }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className={styles.agpLegend}>
        <span>
          <i className={styles.profileMedianKey} />
          Median
        </span>
        <span>
          <i className={styles.profileCapsuleKey} />
          Middle 50%
        </span>
        <span>
          <i className={styles.profileStemKey} />
          5th–95th percentile
        </span>
      </div>
    </section>
  )
}
