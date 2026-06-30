import {
  latestReading,
  MGDL_MMOLL_CONVERSION,
  type GlucoseReading,
} from '@glucoseiq/core'
import type { AGPProfileBin, AGPProfileResult } from '@glucoseiq/core/metrics'

const MINUTES_PER_DAY = 1440
const MILLISECONDS_PER_DAY = 86_400_000
const MAX_TRACE_GAP_MS = 15 * 60_000

interface GeometryOptions {
  readonly profile: AGPProfileResult
  readonly readings: GlucoseReading[]
  readonly width: number
  readonly height: number
  readonly yMin: number
  readonly yMax: number
}

interface Point {
  readonly x: number
  readonly y: number
}

type GlucoseProfileZone = 'low' | 'in-range' | 'high'

export interface GlucoseProfileGeometry {
  readonly outerBandPaths: string[]
  readonly innerBandPaths: string[]
  readonly medianPaths: string[]
  readonly tracePaths: string[]
  readonly isolatedTracePoints: Point[]
  readonly latest: Point & {
    readonly value: number
    readonly zone: GlucoseProfileZone
  }
  readonly observedRange: {
    readonly min: number
    readonly max: number
  }
  readonly target: {
    readonly lowY: number
    readonly highY: number
  }
  readonly timeLabels: {
    readonly label: string
    readonly minor: boolean
  }[]
}

function formatCoordinate(value: number): string {
  const rounded =
    Math.abs(value) > Number.MAX_VALUE / 100
      ? value
      : Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

function toMgDl(value: number, unit: GlucoseReading['unit']): number {
  return unit === 'mg/dL' ? value : value * MGDL_MMOLL_CONVERSION
}

function zoneForMgDl(value: number): GlucoseProfileZone {
  if (value < 70) return 'low'
  if (value > 180) return 'high'
  return 'in-range'
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

function hourFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
  })
}

function splitProfileRuns(bins: readonly AGPProfileBin[]): AGPProfileBin[][] {
  const runs: AGPProfileBin[][] = []
  let current: AGPProfileBin[] = []

  for (const bin of bins) {
    const hasProfile =
      bin.n > 0 &&
      [5, 25, 50, 75, 95].every(
        (percentile) => typeof bin.percentiles[percentile] === 'number',
      )

    if (hasProfile) {
      current.push(bin)
      continue
    }

    if (current.length >= 2) runs.push(current)
    current = []
  }

  if (current.length >= 2) runs.push(current)
  return runs
}

function endpointTangent(
  step: number,
  neighboringStep: number,
  slope: number,
  neighboringSlope: number,
): number {
  const tangent =
    ((2 * step + neighboringStep) * slope -
      step * neighboringSlope) /
    (step + neighboringStep)

  if (Math.sign(tangent) !== Math.sign(slope)) return 0
  if (
    Math.sign(slope) !== Math.sign(neighboringSlope) &&
    Math.abs(tangent) > Math.abs(3 * slope)
  ) {
    return 3 * slope
  }

  return tangent
}

function smoothTracePath(
  points: readonly Point[],
  serializePoint: (x: number, y: number) => string,
): string {
  const [first] = points
  if (first === undefined) return ''
  if (points.length === 1) return `M${serializePoint(first.x, first.y)}`

  const straightPath = (): string =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${serializePoint(point.x, point.y)}`,
      )
      .join(' ')
  if (points.length === 2) return straightPath()

  const steps = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]!
    return next.x - point.x
  })
  if (steps.some((step) => !Number.isFinite(step) || step <= 0)) {
    return straightPath()
  }

  const slopes = steps.map((step, index) => {
    const point = points[index]!
    const next = points[index + 1]!
    return (next.y - point.y) / step
  })
  if (slopes.some((slope) => !Number.isFinite(slope))) return straightPath()

  const tangents = new Array<number>(points.length).fill(0)

  tangents[0] = endpointTangent(
    steps[0]!,
    steps[1]!,
    slopes[0]!,
    slopes[1]!,
  )

  for (let index = 1; index < points.length - 1; index += 1) {
    const previousSlope = slopes[index - 1]!
    const nextSlope = slopes[index]!

    if (previousSlope * nextSlope <= 0) {
      tangents[index] = 0
      continue
    }

    const previousStep = steps[index - 1]!
    const nextStep = steps[index]!
    const previousWeight = 2 * nextStep + previousStep
    const nextWeight = nextStep + 2 * previousStep
    tangents[index] =
      (previousWeight + nextWeight) /
      (previousWeight / previousSlope + nextWeight / nextSlope)
  }

  const lastIndex = points.length - 1
  tangents[lastIndex] = endpointTangent(
    steps[lastIndex - 1]!,
    steps[lastIndex - 2]!,
    slopes[lastIndex - 1]!,
    slopes[lastIndex - 2]!,
  )
  if (tangents.some((tangent) => !Number.isFinite(tangent))) {
    return straightPath()
  }

  const commands = [`M${serializePoint(first.x, first.y)}`]

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!
    const end = points[index + 1]!
    const step = steps[index]!
    const firstControl = {
      x: start.x + step / 3,
      y: start.y + (tangents[index]! * step) / 3,
    }
    const secondControl = {
      x: end.x - step / 3,
      y: end.y - (tangents[index + 1]! * step) / 3,
    }
    if (
      ![
        firstControl.x,
        firstControl.y,
        secondControl.x,
        secondControl.y,
      ].every(Number.isFinite)
    ) {
      return straightPath()
    }

    commands.push(
      `C${serializePoint(firstControl.x, firstControl.y)} ${serializePoint(
        secondControl.x,
        secondControl.y,
      )} ${serializePoint(end.x, end.y)}`,
    )
  }

  return commands.join(' ')
}

export function createGlucoseProfileGeometry({
  profile,
  readings,
  width,
  height,
  yMin,
  yMax,
}: GeometryOptions): GlucoseProfileGeometry {
  if (
    ![width, height, yMin, yMax].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    yMax <= yMin
  ) {
    throw new RangeError('Glucose profile geometry requires positive dimensions and yMax > yMin')
  }

  const xForMinute = (minute: number): number =>
    (minute / MINUTES_PER_DAY) * width
  const yForMgDl = (value: number): number => {
    const clamped = Math.min(yMax, Math.max(yMin, value))
    return ((yMax - clamped) / (yMax - yMin)) * height
  }
  const profileValue = (bin: AGPProfileBin, percentile: number): number => {
    const value = bin.percentiles[percentile]
    if (value === null || value === undefined) {
      throw new TypeError(`Missing p${percentile} profile value`)
    }
    return profile.unit === 'mg/dL' ? value : value * MGDL_MMOLL_CONVERSION
  }
  const point = (x: number, y: number): string =>
    `${formatCoordinate(x)},${formatCoordinate(y)}`
  const linePath = (
    run: readonly AGPProfileBin[],
    percentile: number,
  ): string =>
    run
      .map((bin, index) => {
        const command = index === 0 ? 'M' : 'L'
        return `${command}${point(
          xForMinute(bin.minuteOfDay),
          yForMgDl(profileValue(bin, percentile)),
        )}`
      })
      .join(' ')
  const bandPath = (
    run: readonly AGPProfileBin[],
    upper: number,
    lower: number,
  ): string => {
    const top = run.map((bin, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command}${point(
        xForMinute(bin.minuteOfDay),
        yForMgDl(profileValue(bin, upper)),
      )}`
    })
    const bottom = [...run].reverse().map((bin) =>
      `L${point(
        xForMinute(bin.minuteOfDay),
        yForMgDl(profileValue(bin, lower)),
      )}`,
    )
    return `${[...top, ...bottom].join(' ')} Z`
  }

  const runs = splitProfileRuns(profile.bins)
  const sortedReadings = readings
    .filter((reading) => latestReading([reading]) !== null)
    .map((reading) => ({
      ms: Date.parse(reading.timestamp),
      value: toMgDl(reading.value, reading.unit),
    }))
    .sort((a, b) => a.ms - b.ms)
  const validReadings = sortedReadings.reduce<typeof sortedReadings>(
    (unique, reading) => {
      if (unique.at(-1)?.ms === reading.ms) unique[unique.length - 1] = reading
      else unique.push(reading)
      return unique
    },
    [],
  )

  if (validReadings.length === 0) {
    throw new TypeError('Glucose profile geometry requires at least one valid reading')
  }

  const latestPoint = validReadings.at(-1)!
  const windowStartMs = latestPoint.ms - MILLISECONDS_PER_DAY
  const xForTimestamp = (milliseconds: number): number =>
    ((milliseconds - windowStartMs) / MILLISECONDS_PER_DAY) * width
  const traceReadings = validReadings.filter(
    (reading) => reading.ms >= windowStartMs,
  )
  const traceRuns: (typeof traceReadings)[] = []
  let currentTraceRun: typeof traceReadings = []
  const observedValues = traceReadings.map((reading) => reading.value)

  for (const reading of traceReadings) {
    const previous = currentTraceRun.at(-1)
    const startsNewRun =
      previous !== undefined &&
      reading.ms - previous.ms > MAX_TRACE_GAP_MS

    if (startsNewRun) {
      traceRuns.push(currentTraceRun)
      currentTraceRun = []
    }

    currentTraceRun.push(reading)
  }

  if (currentTraceRun.length > 0) traceRuns.push(currentTraceRun)

  const tracePointRuns = traceRuns.map((run) =>
    run.map((reading) => ({
      x: xForTimestamp(reading.ms),
      y: yForMgDl(reading.value),
    })),
  )
  const tracePaths = tracePointRuns.map((run) => smoothTracePath(run, point))
  const isolatedTracePoints = tracePointRuns
    .filter((run) => run.length === 1)
    .map(([reading]) => reading!)
  const tickFormatter = hourFormatter(profile.timeZone)
  const timeLabels = [0, 0.25, 0.5, 0.75, 1].map((position, index) => ({
    label:
      index === 4
        ? 'Now'
        : tickFormatter.format(
            new Date(windowStartMs + position * MILLISECONDS_PER_DAY),
          ),
    minor: index === 1 || index === 3,
  }))

  return {
    outerBandPaths: runs.map((run) => bandPath(run, 95, 5)),
    innerBandPaths: runs.map((run) => bandPath(run, 75, 25)),
    medianPaths: runs.map((run) => linePath(run, 50)),
    tracePaths,
    isolatedTracePoints,
    latest: {
      x: xForTimestamp(latestPoint.ms),
      y: yForMgDl(latestPoint.value),
      value: roundToTenth(latestPoint.value),
      zone: zoneForMgDl(latestPoint.value),
    },
    observedRange: {
      min: roundToTenth(Math.min(...observedValues)),
      max: roundToTenth(Math.max(...observedValues)),
    },
    target: {
      lowY: yForMgDl(70),
      highY: yForMgDl(180),
    },
    timeLabels,
  }
}
