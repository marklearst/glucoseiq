import type { GlucoseTraceGeometry } from '@/lib/glucose-profile'
import { useId, type JSX } from 'react'
import styles from './glucose-report.module.css'

const THRESHOLDS = [180, 70] as const

interface GlucoseTraceProps {
  readonly geometry: GlucoseTraceGeometry
}

export function GlucoseTrace({
  geometry,
}: GlucoseTraceProps): JSX.Element {
  const id = useId().replaceAll(':', '')
  const titleId = `glucose-trace-title-${id}`
  const descriptionId = `glucose-trace-description-${id}`
  const traceGradientId = `glucose-trace-gradient-${id}`
  const targetHeight = geometry.target.lowY - geometry.target.highY
  const transitionWidth = 1.5

  return (
    <div className={styles.traceChart}>
      <div className={styles.tracePlot}>
        <svg
          aria-labelledby={`${titleId} ${descriptionId}`}
          className={styles.traceSvg}
          focusable="false"
          height={geometry.height}
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          width={geometry.width}
        >
          <title id={titleId}>Last 24 hours of synthetic glucose readings</title>
          <desc id={descriptionId}>
            Latest 24 hours from a synthetic 14-day glucose report. The
            observed range is {geometry.observedRange.min} to{' '}
            {geometry.observedRange.max} milligrams per deciliter. The target
            range is 70 to 180 milligrams per deciliter. The latest reading is{' '}
            {geometry.latest.value} milligrams per deciliter. Synthetic data;
            not clinically representative.
          </desc>
          <defs>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id={traceGradientId}
              x1="0"
              x2="0"
              y1="0"
              y2={geometry.height}
            >
              <stop offset="0" stopColor="#ffd60a" />
              <stop
                offset={geometry.target.highY / geometry.height}
                stopColor="#ffd60a"
              />
              <stop
                offset={
                  (geometry.target.highY + transitionWidth) /
                  geometry.height
                }
                stopColor="#f5f5f7"
              />
              <stop
                offset={
                  (geometry.target.lowY - transitionWidth) /
                  geometry.height
                }
                stopColor="#f5f5f7"
              />
              <stop
                offset={geometry.target.lowY / geometry.height}
                stopColor="#ff6961"
              />
              <stop offset="1" stopColor="#ff6961" />
            </linearGradient>
          </defs>

          <rect
            className={styles.traceTarget}
            height={targetHeight}
            width={geometry.width}
            x="0"
            y={geometry.target.highY}
          />

          <g>
            {geometry.tracePaths.map((path, index) => (
              <path
                className={styles.traceLine}
                d={path}
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
          </g>
        </svg>

        <div
          aria-hidden="true"
          className={styles.traceThresholdOverlay}
        >
          {THRESHOLDS.map((threshold) => {
            const y =
              threshold === 180
                ? geometry.target.highY
                : geometry.target.lowY

            return (
              <div
                className={styles.traceThresholdRow}
                key={threshold}
                style={{ top: `${(y / geometry.height) * 100}%` }}
              >
                <svg
                  aria-hidden="true"
                  className={styles.traceThresholdRule}
                  height="1"
                  preserveAspectRatio="none"
                  viewBox={`0 0 ${geometry.width} 1`}
                  width={geometry.width}
                >
                  <line
                    className={styles.traceThreshold}
                    vectorEffect="non-scaling-stroke"
                    x1="0"
                    x2={geometry.width}
                    y1="0.5"
                    y2="0.5"
                  />
                </svg>
                <span className={styles.traceThresholdLabel}>{threshold}</span>
              </div>
            )
          })}
        </div>

        <svg
          aria-hidden="true"
          className={styles.traceLatestMarker}
          height="12"
          style={{
            left: `${(geometry.latest.x / geometry.width) * 100}%`,
            top: `${(geometry.latest.y / geometry.height) * 100}%`,
          }}
          viewBox={`${geometry.latest.x - 6} ${geometry.latest.y - 6} 12 12`}
          width="12"
        >
          <g transform={`translate(${geometry.latest.x} ${geometry.latest.y})`}>
            <g
              className={styles.traceLatestPoint}
              data-zone={geometry.latest.zone}
            >
              <circle className={styles.traceLatestRing} r="5" />
              <circle className={styles.traceLatestCore} r="1.75" />
            </g>
          </g>
        </svg>
        <span
          aria-hidden="true"
          className={styles.traceLatestLabel}
          style={{
            top: `${(geometry.latest.y / geometry.height) * 100}%`,
          }}
        >
          Now · {geometry.latest.value}
        </span>
      </div>
      <div aria-hidden="true" className={styles.traceTimeAxis}>
        {geometry.timeLabels.map(({ label, minor }, index) => (
          <span
            data-minor={minor ? 'true' : undefined}
            key={`${label}-${index}`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
