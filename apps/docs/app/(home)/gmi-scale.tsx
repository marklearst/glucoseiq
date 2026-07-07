import {
  createGMIDialGeometry,
  GMI_DIAL_START_DEGREES,
  GMI_DIAL_SWEEP_DEGREES,
} from '@/lib/glucose-profile'
import { useId, type CSSProperties, type JSX } from 'react'
import styles from './glucose-report.module.css'

interface GMIScaleProps {
  readonly value: number
  readonly meanGlucose: number
  readonly days: number
}

const CENTER = 96
const RADIUS = 70
const SCALE_MIN = 5
const SCALE_MAX = 10
const SCALE_MAX_LABEL = '10%+'
const ARC_LENGTH =
  RADIUS * (GMI_DIAL_SWEEP_DEGREES * Math.PI) / 180

function pointOnDial(angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180
  return {
    x: CENTER + RADIUS * Math.cos(radians),
    y: CENTER + RADIUS * Math.sin(radians),
  }
}

function openArcPath(): string {
  const start = pointOnDial(GMI_DIAL_START_DEGREES)
  const end = pointOnDial(
    GMI_DIAL_START_DEGREES + GMI_DIAL_SWEEP_DEGREES,
  )

  return [
    `M${start.x.toFixed(3)},${start.y.toFixed(3)}`,
    `A${RADIUS},${RADIUS} 0 1 1 ${end.x.toFixed(3)},${end.y.toFixed(3)}`,
  ].join(' ')
}

export function GMIScale({
  value,
  meanGlucose,
  days,
}: GMIScaleProps): JSX.Element {
  const id = useId().replaceAll(':', '')
  const titleId = `gmi-title-${id}`
  const maskId = `gmi-mask-${id}`
  const geometry = createGMIDialGeometry({
    value,
    min: SCALE_MIN,
    max: SCALE_MAX,
  })
  const progressStyle = {
    '--gmi-progress-length': `${(
      ARC_LENGTH * geometry.ratio
    ).toFixed(3)}px`,
    '--gmi-arc-length': `${ARC_LENGTH.toFixed(3)}px`,
  } as CSSProperties
  const arcPath = openArcPath()
  const startPoint = pointOnDial(GMI_DIAL_START_DEGREES)
  const progressPoint = pointOnDial(
    GMI_DIAL_START_DEGREES +
      GMI_DIAL_SWEEP_DEGREES * geometry.ratio,
  )

  return (
    <section
      aria-labelledby={titleId}
      className={`${styles.reportPanel} ${styles.gmiPanel}`}
      data-report-view="gmi"
    >
      <header className={styles.panelHeader}>
        <div>
          <h3 id={titleId}>GMI estimate</h3>
          <p className={styles.panelSubhead}>
            Glucose management indicator
          </p>
        </div>
        <dl className={styles.panelMetric}>
          <div>
            <dt>Mean</dt>
            <dd>{meanGlucose} mg/dL</dd>
          </div>
        </dl>
      </header>

      <div
        aria-label={`GMI estimate: ${value} percent on a display scale from ${SCALE_MIN} percent to ${SCALE_MAX} percent and above. The estimate uses a mean CGM glucose of ${meanGlucose} milligrams per deciliter across ${days} synthetic days. It is not a laboratory A1C or a diagnosis.`}
        className={styles.gmiDial}
        role="img"
      >
        <svg
          aria-hidden="true"
          className={styles.gmiSvg}
          viewBox="0 0 192 192"
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <path
                className={styles.gmiProgress}
                d={arcPath}
                data-motion-part="gmi-progress"
                style={progressStyle}
              />
              <line
                className={styles.gmiRoundCap}
                x1={startPoint.x}
                x2={startPoint.x + 0.01}
                y1={startPoint.y}
                y2={startPoint.y}
              />
              <g
                className={styles.gmiEndCap}
                data-motion-part="gmi-end-cap"
              >
                <line
                  className={styles.gmiRoundCap}
                  x1={progressPoint.x}
                  x2={progressPoint.x + 0.01}
                  y1={progressPoint.y}
                  y2={progressPoint.y}
                />
              </g>
            </mask>
          </defs>
          <path className={styles.gmiTrack} d={arcPath} pathLength="100" />
          <foreignObject
            height="192"
            mask={`url(#${maskId})`}
            width="192"
            x="0"
            y="0"
          >
            <div className={styles.gmiSweep} />
          </foreignObject>
        </svg>
        <div aria-hidden="true" className={styles.gmiValue}>
          <strong>{value}%</strong>
          <span>estimated</span>
        </div>
        <div aria-hidden="true" className={styles.gmiScaleLabels}>
          <span>{SCALE_MIN}%</span>
          <span>{SCALE_MAX_LABEL}</span>
        </div>
      </div>

      <p className={styles.panelSummary}>
        Calculated from the synthetic mean CGM glucose. Not a laboratory
        A1C or a diagnosis.
      </p>
    </section>
  )
}
