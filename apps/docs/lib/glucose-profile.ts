import {
  latestReading,
  MGDL_MMOLL_CONVERSION,
  type GlucoseReading,
} from '@glucoseiq/core'
import type { AGPProfileResult } from '@glucoseiq/core/metrics'

const MILLISECONDS_PER_DAY = 86_400_000
const MAX_TRACE_GAP_MS = 15 * 60_000
export const GMI_DIAL_START_DEGREES = 140
export const GMI_DIAL_SWEEP_DEGREES = 260

interface GlucoseTraceGeometryOptions {
  readonly readings: readonly GlucoseReading[]
  readonly timeZone: string
  readonly width: number
  readonly height: number
  readonly yMin: number
  readonly yMax: number
}

interface Point {
  readonly x: number
  readonly y: number
}

interface DailyProfileGeometryOptions {
  readonly profile: AGPProfileResult
  readonly width: number
  readonly height: number
  readonly yMin: number
  readonly yMax: number
}

interface GMIDialGeometryOptions {
  readonly value: number
  readonly min: number
  readonly max: number
}

export type GlucoseTraceZone = 'low' | 'in-range' | 'high'

export interface DailyProfileColumn {
  readonly minuteOfDay: number
  readonly x: number
  readonly stemTop: number
  readonly stemBottom: number
  readonly capsuleTop: number
  readonly capsuleBottom: number
  readonly medianY: number
}

export interface DailyProfileGeometry {
  readonly width: number
  readonly height: number
  readonly columns: readonly DailyProfileColumn[]
  readonly target: {
    readonly lowY: number
    readonly highY: number
  }
  readonly timeLabels: readonly {
    readonly label: string
    readonly x: number
  }[]
}

export interface GMIDialGeometry {
  readonly ratio: number
  readonly arcPercent: number
}

export interface GlucoseTraceGeometry {
  readonly width: number
  readonly height: number
  readonly tracePaths: readonly string[]
  readonly isolatedTracePoints: readonly Point[]
  readonly latest: Point & {
    readonly value: number
    readonly zone: GlucoseTraceZone
  }
  readonly observedRange: {
    readonly min: number
    readonly max: number
  }
  readonly target: {
    readonly lowY: number
    readonly highY: number
  }
  readonly timeLabels: readonly {
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

function zoneForMgDl(value: number): GlucoseTraceZone {
  if (value < 70) return 'low'
  if (value > 180) return 'high'
  return 'in-range'
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

function roundToFour(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function roundedHourLabel(milliseconds: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
    numberingSystem: 'latn',
    timeZone,
  }).formatToParts(new Date(milliseconds))
  const hour = Number(parts.find(({ type }) => type === 'hour')?.value)
  const minute = Number(parts.find(({ type }) => type === 'minute')?.value)

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new TypeError('Unable to format glucose trace time label')
  }

  const roundedHour = (hour + (minute >= 30 ? 1 : 0)) % 24
  const displayHour = roundedHour % 12 || 12
  const period = roundedHour < 12 ? 'AM' : 'PM'
  return `${displayHour} ${period}`
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
  const direction = Math.sign(steps[0]!)
  if (
    direction === 0 ||
    steps.some(
      (step) => !Number.isFinite(step) || Math.sign(step) !== direction,
    )
  ) {
    return straightPath()
  }
  if (direction < 0) {
    return smoothTracePath(
      points.map((point) => ({ x: -point.x, y: point.y })),
      (x, y) => serializePoint(-x, y),
    )
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

export function createGMIDialGeometry({
  value,
  min,
  max,
}: GMIDialGeometryOptions): GMIDialGeometry {
  if (
    ![value, min, max].every(Number.isFinite) ||
    max <= min
  ) {
    throw new RangeError(
      'GMI dial geometry requires finite values and max > min',
    )
  }

  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)))

  return {
    ratio: roundToFour(ratio),
    arcPercent: roundToFour(ratio * 100),
  }
}

export function createDailyProfileGeometry({
  profile,
  width,
  height,
  yMin,
  yMax,
}: DailyProfileGeometryOptions): DailyProfileGeometry {
  if (
    !profile.valid ||
    profile.binMinutes !== 120 ||
    profile.bins.length !== 12 ||
    ![width, height, yMin, yMax].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    yMax <= yMin
  ) {
    throw new RangeError(
      'Daily profile geometry requires twelve valid two-hour bins, positive dimensions, and yMax > yMin',
    )
  }

  const yForMgDl = (value: number): number => {
    const clamped = Math.min(yMax, Math.max(yMin, value))
    return ((yMax - clamped) / (yMax - yMin)) * height
  }
  const profileValue = (binIndex: number, percentile: number): number => {
    const bin = profile.bins[binIndex]
    if (bin === undefined || bin.n === 0) {
      throw new TypeError(`Missing daily profile bin ${binIndex + 1}`)
    }
    const value = bin.percentiles[percentile]
    if (value === null || value === undefined) {
      throw new TypeError(`Missing p${percentile} profile value`)
    }
    return profile.unit === 'mg/dL'
      ? value
      : value * MGDL_MMOLL_CONVERSION
  }
  const columns = profile.bins.map((bin, index) => ({
    minuteOfDay: bin.minuteOfDay,
    x: roundToFour(((index + 0.5) / profile.bins.length) * width),
    stemTop: roundToFour(yForMgDl(profileValue(index, 95))),
    stemBottom: roundToFour(yForMgDl(profileValue(index, 5))),
    capsuleTop: roundToFour(yForMgDl(profileValue(index, 75))),
    capsuleBottom: roundToFour(yForMgDl(profileValue(index, 25))),
    medianY: roundToFour(yForMgDl(profileValue(index, 50))),
  }))

  return {
    width,
    height,
    columns,
    target: {
      lowY: roundToFour(yForMgDl(70)),
      highY: roundToFour(yForMgDl(180)),
    },
    timeLabels: [
      { label: '12 AM', x: 0 },
      { label: '6 AM', x: width / 4 },
      { label: '12 PM', x: width / 2 },
      { label: '6 PM', x: (width * 3) / 4 },
      { label: '12 AM', x: width },
    ],
  }
}

export function createGlucoseTraceGeometry({
  readings,
  timeZone,
  width,
  height,
  yMin,
  yMax,
}: GlucoseTraceGeometryOptions): GlucoseTraceGeometry {
  if (
    ![width, height, yMin, yMax].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    yMax <= yMin
  ) {
    throw new RangeError('Glucose trace geometry requires positive dimensions and yMax > yMin')
  }

  const yForMgDl = (value: number): number => {
    const clamped = Math.min(yMax, Math.max(yMin, value))
    return ((yMax - clamped) / (yMax - yMin)) * height
  }
  const point = (x: number, y: number): string =>
    `${formatCoordinate(x)},${formatCoordinate(y)}`
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
    throw new TypeError('Glucose trace geometry requires at least one valid reading')
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
  const timeLabels = [0, 0.25, 0.5, 0.75, 1].map((position, index) => ({
    label:
      index === 4
        ? 'Now'
        : roundedHourLabel(
            windowStartMs + position * MILLISECONDS_PER_DAY,
            timeZone,
          ),
    minor: index === 1 || index === 3,
  }))

  return {
    width,
    height,
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
