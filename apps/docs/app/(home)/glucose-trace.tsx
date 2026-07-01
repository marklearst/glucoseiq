import type { GlucoseReading } from '@glucoseiq/core'
import { createGlucoseTraceGeometry } from '@/lib/glucose-profile'
import { useId, type JSX } from 'react'
import styles from './home.module.css'

const PLOT_WIDTH = 1120
const PLOT_HEIGHT = 224
const Y_MIN = 40
const Y_MAX = 250

const X_GRID_TICKS = [0, 0.25, 0.5, 0.75, 1] as const

const Y_AXIS_TICKS = [
  { value: 250, label: true, boundary: false, edge: 'top' },
  { value: 180, label: true, boundary: true, edge: undefined },
  { value: 125, label: false, boundary: false, edge: undefined },
  { value: 70, label: true, boundary: true, edge: undefined },
  { value: 40, label: false, boundary: false, edge: 'bottom' },
] as const

interface GlucoseTraceProps {
  readonly readings: readonly GlucoseReading[]
  readonly timeZone: string
}

function yForValue(value: number): number {
  return ((Y_MAX - value) / (Y_MAX - Y_MIN)) * PLOT_HEIGHT
}

export function GlucoseTrace({
  readings,
  timeZone,
}: GlucoseTraceProps): JSX.Element {
  const id = useId().replaceAll(':', '')
  const titleId = `glucose-trace-title-${id}`
  const descriptionId = `glucose-trace-description-${id}`
  const traceGradientId = `glucose-trace-gradient-${id}`
  const targetGradientId = `glucose-target-gradient-${id}`
  const traceGlowId = `glucose-trace-glow-${id}`
  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone,
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
    yMin: Y_MIN,
    yMax: Y_MAX,
  })
  const targetHeight = geometry.target.lowY - geometry.target.highY
  const latestLeft = `${(geometry.latest.x / PLOT_WIDTH) * 100}%`
  const latestTop = `${(geometry.latest.y / PLOT_HEIGHT) * 100}%`
  const latestAlignment = geometry.latest.x > PLOT_WIDTH * 0.8 ? 'end' : 'start'

  return (
    <div className={styles.trace}>
      <div className={styles.traceHeading}>
        <div>
          <span>Last 24 hours</span>
          <p className={styles.traceRange}>
            <strong>
              {geometry.observedRange.min}–{geometry.observedRange.max}
            </strong>{' '}
            <span>mg/dL</span>
          </p>
        </div>
        <div className={styles.traceTargetMeta}>
          <span>Target range</span>
          <strong>70–180 mg/dL</strong>
        </div>
      </div>
      <div className={styles.traceGraph}>
        <div className={styles.tracePlot}>
          <svg
            aria-labelledby={`${titleId} ${descriptionId}`}
            className={styles.traceSvg}
            focusable="false"
            height={PLOT_HEIGHT}
            preserveAspectRatio="none"
            role="img"
            viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
            width={PLOT_WIDTH}
          >
            <title id={titleId}>Last 24 hours of synthetic glucose readings</title>
            <desc id={descriptionId}>
              The observed range is {geometry.observedRange.min} to{' '}
              {geometry.observedRange.max} milligrams per deciliter. The trace ends at {geometry.latest.value}{' '}
              milligrams per deciliter. The
              illuminated field marks the 70 to 180 milligrams per deciliter
              range. Synthetic data; not clinically representative.
            </desc>
            <defs>
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={traceGradientId}
                x1="0"
                x2="0"
                y1="0"
                y2={PLOT_HEIGHT}
              >
                <stop offset="0" stopColor="#ff9f0a" />
                <stop
                  offset={geometry.target.highY / PLOT_HEIGHT}
                  stopColor="#ffd60a"
                />
                <stop
                  offset={(geometry.target.highY + 2) / PLOT_HEIGHT}
                  stopColor="#f5f5f7"
                />
                <stop
                  offset={(geometry.target.lowY - 2) / PLOT_HEIGHT}
                  stopColor="#f5f5f7"
                />
                <stop
                  offset={geometry.target.lowY / PLOT_HEIGHT}
                  stopColor="#ff6961"
                />
                <stop offset="1" stopColor="#ff453a" />
              </linearGradient>
              <linearGradient
                id={targetGradientId}
                x1="0"
                x2="1"
                y1="0"
                y2="0"
              >
                <stop offset="0" stopColor="#30d158" stopOpacity="0.01" />
                <stop offset="0.12" stopColor="#30d158" stopOpacity="0.045" />
                <stop offset="0.5" stopColor="#30d158" stopOpacity="0.065" />
                <stop offset="0.88" stopColor="#30d158" stopOpacity="0.045" />
                <stop offset="1" stopColor="#30d158" stopOpacity="0.01" />
              </linearGradient>
              <filter
                colorInterpolationFilters="sRGB"
                height="150%"
                id={traceGlowId}
                width="110%"
                x="-5%"
                y="-25%"
              >
                <feGaussianBlur stdDeviation="3.2" />
              </filter>
            </defs>

            <rect
              className={styles.traceTarget}
              fill={`url(#${targetGradientId})`}
              height={targetHeight}
              width={PLOT_WIDTH}
              x="0"
              y={geometry.target.highY}
            />

            {X_GRID_TICKS.map((tick) => (
              <line
                className={styles.traceGridLine}
                data-axis="x"
                key={`x-${tick}`}
                vectorEffect="non-scaling-stroke"
                x1={tick * PLOT_WIDTH}
                x2={tick * PLOT_WIDTH}
                y1="0"
                y2={PLOT_HEIGHT}
              />
            ))}

            {Y_AXIS_TICKS.map((tick) => (
              <line
                className={
                  tick.boundary ? styles.traceThreshold : styles.traceGridLine
                }
                data-axis="y"
                key={`y-${tick.value}`}
                vectorEffect="non-scaling-stroke"
                x1="0"
                x2={PLOT_WIDTH}
                y1={yForValue(tick.value)}
                y2={yForValue(tick.value)}
              />
            ))}

            <line
              className={styles.traceLatestGuide}
              vectorEffect="non-scaling-stroke"
              x1={geometry.latest.x}
              x2={geometry.latest.x}
              y1={geometry.latest.y}
              y2={PLOT_HEIGHT}
            />

            {geometry.tracePaths.map((path, index) => (
              <path
                className={styles.traceGlow}
                d={path}
                fill="none"
                filter={`url(#${traceGlowId})`}
                key={`glow-${index}`}
                stroke={`url(#${traceGradientId})`}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {geometry.tracePaths.map((path, index) => (
              <path
                className={styles.traceLine}
                d={path}
                data-profile-part="profile-trace"
                fill="none"
                key={`trace-${index}`}
                stroke={`url(#${traceGradientId})`}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {geometry.isolatedTracePoints.map((point, index) => (
              <circle
                className={styles.traceIsolatedPoint}
                cx={point.x}
                cy={point.y}
                fill={`url(#${traceGradientId})`}
                key={`isolated-${index}`}
                r="2.25"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <span
            aria-hidden="true"
            className={styles.traceLatest}
            data-align={latestAlignment}
            data-profile-part="profile-latest"
            data-zone={geometry.latest.zone}
            style={{ left: latestLeft, top: latestTop }}
          />
          <span
            aria-hidden="true"
            className={styles.traceLatestLabel}
            data-align={latestAlignment}
            style={{ left: latestLeft, top: latestTop }}
          >
            Now · {geometry.latest.value}
          </span>
        </div>
        <div aria-hidden="true" className={styles.traceYAxis}>
          {Y_AXIS_TICKS.filter((tick) => tick.label).map((tick) => (
            <span
              data-boundary={tick.boundary ? 'true' : undefined}
              data-edge={tick.edge}
              key={tick.value}
              style={{ top: `${(yForValue(tick.value) / PLOT_HEIGHT) * 100}%` }}
            >
              {tick.value}
            </span>
          ))}
        </div>
        <div aria-hidden="true" className={styles.traceTimeAxis}>
          {geometry.timeLabels.map(({ label, minor }, index) => (
            <span data-minor={minor ? 'true' : undefined} key={`${label}-${index}`}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
