import { createHash } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import {
  trendTileToSVG,
  type TrendTileOptions,
} from '../src/render/trend-tile'
import { DomainError } from '../src/errors'
import { createGlucoseReadings } from './test-helpers'
import type { GlucoseReading } from '../src/types'

const fixedReadings: GlucoseReading[] = [100, 110, 120].map(
  (value, index) => ({
    value,
    unit: 'mg/dL',
    timestamp: new Date(Date.UTC(2024, 0, 1, 8, index * 5)).toISOString(),
  })
)

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function captureError(call: () => unknown): unknown {
  try {
    call()
    return undefined
  } catch (error) {
    return error
  }
}

function expectInvalidOption(error: unknown, message: string): void {
  expect(error).toBeInstanceOf(DomainError)
  expect(error).toMatchObject({
    name: 'DomainError',
    code: 'INVALID_OPTION',
    message,
  })
}

function hostileScalar(): {
  value: object
  hooks: ReturnType<typeof vi.fn>[]
} {
  const toPrimitive = vi.fn(() => 240)
  const valueOf = vi.fn(() => 240)
  const toString = vi.fn(() => '240')

  return {
    value: {
      [Symbol.toPrimitive]: toPrimitive,
      valueOf,
      toString,
    },
    hooks: [toPrimitive, valueOf, toString],
  }
}

const invalidDimensions = [
  { label: 'NaN', create: () => ({ value: Number.NaN, hooks: [] }) },
  { label: 'positive infinity', create: () => ({ value: Infinity, hooks: [] }) },
  { label: 'negative infinity', create: () => ({ value: -Infinity, hooks: [] }) },
  { label: 'zero', create: () => ({ value: 0, hooks: [] }) },
  { label: 'negative zero', create: () => ({ value: -0, hooks: [] }) },
  { label: 'negative', create: () => ({ value: -1, hooks: [] }) },
  { label: 'null', create: () => ({ value: null, hooks: [] }) },
  { label: 'boolean', create: () => ({ value: true, hooks: [] }) },
  { label: 'numeric string', create: () => ({ value: '240', hooks: [] }) },
  { label: 'bigint', create: () => ({ value: 240n, hooks: [] }) },
  { label: 'symbol', create: () => ({ value: Symbol('240'), hooks: [] }) },
  { label: 'array', create: () => ({ value: [240], hooks: [] }) },
  { label: 'function', create: () => ({ value: () => 240, hooks: [] }) },
  {
    label: 'attribute-breaking string',
    create: () => ({ value: '240\" onload=\"alert(1)', hooks: [] }),
  },
  { label: 'hostile conversion object', create: hostileScalar },
] as const

const extremeDimensions = [
  { label: 'maximum width', options: { width: Number.MAX_VALUE }, width: Number.MAX_VALUE, height: 140 },
  { label: 'half-maximum width', options: { width: Number.MAX_VALUE / 2 }, width: Number.MAX_VALUE / 2, height: 140 },
  { label: 'maximum height', options: { height: Number.MAX_VALUE }, width: 240, height: Number.MAX_VALUE },
  { label: 'half-maximum height', options: { height: Number.MAX_VALUE / 2 }, width: 240, height: Number.MAX_VALUE / 2 },
] as const

const tinyDimensions = [
  { label: 'minimum positive dimensions', options: { width: Number.MIN_VALUE, height: Number.MIN_VALUE }, width: Number.MIN_VALUE, height: Number.MIN_VALUE },
  { label: 'dimensions below fixed positions', options: { width: 19, height: 1 }, width: 19, height: 1 },
] as const

const numericAttributes = new Set([
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'width',
  'height',
  'r',
  'rx',
  'ry',
  'font-size',
  'stroke-width',
  'letter-spacing',
])
const nonNegativeAttributes = new Set([
  'width',
  'height',
  'r',
  'rx',
  'ry',
])

function expectFiniteNumberList(value: string, pathData = false): void {
  expect(value).not.toMatch(/NaN|Infinity/)
  const numberPattern = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi
  const tokens = value.match(numberPattern) ?? []
  expect(tokens.length).toBeGreaterThan(0)
  for (const token of tokens) {
    expect(Number.isFinite(Number(token))).toBe(true)
  }
  const remainder = value
    .replace(numberPattern, '')
    .replace(pathData ? /[AaCcHhLlMmQqSsTtVvZz]/g : /[\s,]/g, '')
    .replace(pathData ? /[\s,]/g : /$^/, '')
  expect(remainder).toBe('')
}

function expectFiniteSVGGeometry(svg: string): void {
  const tags = svg.match(/<[a-z][^<>]*>/g) ?? []
  expect(tags.length).toBeGreaterThan(0)

  for (const tag of tags) {
    for (const match of tag.matchAll(/\s([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
      const [, name, value] = match
      if (numericAttributes.has(name)) {
        const number = Number(value)
        expect(Number.isFinite(number)).toBe(true)
        if (nonNegativeAttributes.has(name)) {
          expect(number).toBeGreaterThanOrEqual(0)
        }
      } else if (name === 'viewBox') {
        const values = value.trim().split(/\s+/)
        expect(values).toHaveLength(4)
        for (const item of values) expect(Number.isFinite(Number(item))).toBe(true)
      } else if (name === 'points' || name === 'stroke-dasharray') {
        expectFiniteNumberList(value)
      } else if (name === 'd') {
        expectFiniteNumberList(value, true)
      }
    }
  }
}

function expectRootDimensions(svg: string, width: number, height: number): void {
  const root = /^<svg\b[^>]*>/u.exec(svg)?.[0]
  expect(root).toBeDefined()
  expect(root).toContain(`width="${width}"`)
  expect(root).toContain(`height="${height}"`)
  expect(root).toContain(`viewBox="0 0 ${width} ${height}"`)
}

function readingWithThrowingField(
  field: 'value' | 'unit' | 'timestamp',
  getter: () => never
): GlucoseReading {
  const reading: Record<string, unknown> = {
    value: 300,
    unit: 'mg/dL',
    timestamp: '2024-01-01T08:10:00.000Z',
  }
  Object.defineProperty(reading, field, {
    enumerable: true,
    get: getter,
  })
  return reading as unknown as GlucoseReading
}

describe('trendTileToSVG', () => {
  it('preserves the pre-hardening default and representative valid bytes', () => {
    expect(sha256(trendTileToSVG(fixedReadings))).toBe(
      '7b3e935577fb0b063596ce6c584fc792e998cef1d83c5f3d968c52232c03d138'
    )
    expect(
      sha256(
        trendTileToSVG(fixedReadings, {
          width: 300,
          height: 180,
          theme: 'light',
        })
      )
    ).toBe(
      'a031de2b990f00d2346c7442c7d7c32852251eed0113b14afa853d5962d64f1f'
    )
  })

  describe.each([
    {
      dimension: 'width' as const,
      message: 'trendTileToSVG: width must be a finite positive number',
      custom: 241,
      defaultValue: 240,
    },
    {
      dimension: 'height' as const,
      message: 'trendTileToSVG: height must be a finite positive number',
      custom: 141,
      defaultValue: 140,
    },
  ])('$dimension boundary', ({ dimension, message, custom, defaultValue }) => {
    it.each(invalidDimensions)('rejects $label without coercion', ({ create }) => {
      const { value, hooks } = create()
      const error = captureError(() =>
        trendTileToSVG(fixedReadings, {
          [dimension]: value,
        } as unknown as TrendTileOptions)
      )

      for (const hook of hooks) expect(hook).not.toHaveBeenCalled()
      expectInvalidOption(error, message)
    })

    it('reads a supplied getter exactly once', () => {
      let reads = 0
      const options = Object.defineProperty({}, dimension, {
        enumerable: true,
        get() {
          reads += 1
          return reads === 1 ? custom : '1\" onload=\"alert(1)'
        },
      }) as TrendTileOptions

      const svg = trendTileToSVG(fixedReadings, options)

      expect(reads).toBe(1)
      expect(svg).toContain(`${dimension}="${custom}"`)
      expect(svg).not.toContain('onload')
    })

    it('defaults only an undefined getter and reads it once', () => {
      const getter = vi.fn(() => undefined)
      const options = Object.defineProperty({}, dimension, {
        enumerable: true,
        get: getter,
      }) as TrendTileOptions

      const svg = trendTileToSVG(fixedReadings, options)

      expect(svg).toBe(trendTileToSVG(fixedReadings))
      expect(getter).toHaveBeenCalledTimes(1)
      expect(svg).toContain(`${dimension}="${defaultValue}"`)
    })

    it('validates before touching poisoned readings', () => {
      const readings = new Proxy([], {
        get() {
          throw new Error('readings must not be accessed')
        },
      }) as unknown as GlucoseReading[]
      const error = captureError(() =>
        trendTileToSVG(readings, {
          [dimension]: 0,
        })
      )

      expectInvalidOption(error, message)
    })
  })

  it('reports an invalid width before an invalid height or poisoned readings', () => {
    const readings = new Proxy([], {
      get() {
        throw new Error('readings must not be accessed')
      },
    }) as unknown as GlucoseReading[]

    expectInvalidOption(
      captureError(() => trendTileToSVG(readings, { width: 0, height: 0 })),
      'trendTileToSVG: width must be a finite positive number'
    )
  })

  it.each(extremeDimensions)('keeps all data-bearing geometry finite at $label', ({ options, width, height }) => {
    const svg = trendTileToSVG(fixedReadings, options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it.each(extremeDimensions)('keeps no-data geometry finite at $label', ({ options, width, height }) => {
    const svg = trendTileToSVG([], options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it.each(tinyDimensions)('accepts $label without invalid length or radius attributes', ({ options, width, height }) => {
    const svg = trendTileToSVG(fixedReadings, options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it('snapshots every reading field once before selecting latest and trend', () => {
    const getters = fixedReadings.map((reading) => {
      const value = vi
        .fn<() => unknown>()
        .mockReturnValueOnce(reading.value)
        .mockReturnValue('999\" onload=\"alert(1)')
      const unit = vi
        .fn<() => unknown>()
        .mockReturnValueOnce(reading.unit)
        .mockReturnValue('<script>')
      const timestamp = vi
        .fn<() => unknown>()
        .mockReturnValueOnce(reading.timestamp)
        .mockReturnValue('bad')
      const snapshot = Object.defineProperties(
        {},
        {
          value: { enumerable: true, get: value },
          unit: { enumerable: true, get: unit },
          timestamp: { enumerable: true, get: timestamp },
        }
      ) as GlucoseReading
      return { snapshot, value, unit, timestamp }
    })

    const svg = trendTileToSVG(getters.map(({ snapshot }) => snapshot))

    for (const reading of getters) {
      expect(reading.value).toHaveBeenCalledTimes(1)
      expect(reading.unit).toHaveBeenCalledTimes(1)
      expect(reading.timestamp).toHaveBeenCalledTimes(1)
    }
    expect(svg).toContain('>120<')
    expect(svg).toContain('>↑<')
    expect(svg).toContain('IN RANGE · mg/dL')
    expect(svg).not.toContain('onload')
    expect(svg).not.toContain('<script>')
  })

  it('keeps latest-by-timestamp and trend semantics for unsorted snapshots', () => {
    const order = [fixedReadings[2]!, fixedReadings[0]!, fixedReadings[1]!]
    const snapshots = order.map((reading) => {
      const value = vi.fn(() => reading.value)
      const unit = vi.fn(() => reading.unit)
      const timestamp = vi.fn(() => reading.timestamp)
      const snapshot = Object.defineProperties(
        {},
        {
          value: { enumerable: true, get: value },
          unit: { enumerable: true, get: unit },
          timestamp: { enumerable: true, get: timestamp },
        }
      ) as GlucoseReading
      return { snapshot, value, unit, timestamp }
    })

    const svg = trendTileToSVG(snapshots.map(({ snapshot }) => snapshot))

    for (const reading of snapshots) {
      expect(reading.value).toHaveBeenCalledTimes(1)
      expect(reading.unit).toHaveBeenCalledTimes(1)
      expect(reading.timestamp).toHaveBeenCalledTimes(1)
    }
    expect(svg).toContain('>120<')
    expect(svg).toContain('>↑<')
  })

  it.each(['value', 'unit', 'timestamp'] as const)(
    'renders the existing finite no-data frame when a %s getter throws',
    (field) => {
      const getter = vi.fn(() => {
        throw new Error(`${field} getter failed`)
      })
      const svg = trendTileToSVG([
        fixedReadings[0],
        readingWithThrowingField(field, getter),
      ])

      expect(getter).toHaveBeenCalledTimes(1)
      expect(svg).toContain('No data')
      expect(svg).not.toContain('>100<')
      expectFiniteSVGGeometry(svg)
    }
  )

  it.each(['value', 'unit', 'timestamp'] as const)(
    'skips an object-valued %s without invoking conversion hooks',
    (field) => {
      const { value, hooks } = hostileScalar()
      const invalid = {
        value: 300,
        unit: 'mg/dL',
        timestamp: '2024-01-01T08:10:00.000Z',
        [field]: value,
      } as unknown as GlucoseReading

      const svg = trendTileToSVG([invalid, fixedReadings[2]])

      for (const hook of hooks) expect(hook).not.toHaveBeenCalled()
      expect(svg).toContain('>120<')
      expect(svg).toContain('IN RANGE · mg/dL')
    }
  )

  it('skips sparse, non-object, and ordinary invalid entries when one reading is usable', () => {
    const mixed: unknown[] = [
      null,
      undefined,
      42,
      'reading',
      {},
      { value: Number.NaN, unit: 'mg/dL', timestamp: 'bad' },
    ]
    mixed.length += 1
    mixed.push(fixedReadings[2])

    const svg = trendTileToSVG(mixed as GlucoseReading[])

    expect(svg).toContain('>120<')
    expect(svg).not.toContain('No data')
  })

  it('copies only required fields and never touches unrelated enumerable accessors', () => {
    const unrelated = vi.fn(() => {
      throw new Error('unrelated getter must not be read')
    })
    const reading = Object.defineProperty(
      { ...fixedReadings[2] },
      'unrelated',
      { enumerable: true, get: unrelated }
    ) as GlucoseReading

    const svg = trendTileToSVG([reading])

    expect(unrelated).not.toHaveBeenCalled()
    expect(svg).toContain('>120<')
  })

  it('renders an in-range reading with a trend arrow', () => {
    const svg = trendTileToSVG(createGlucoseReadings([100, 110, 120], 'mg/dL', 5))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('120')
    expect(svg).toContain('IN RANGE')
    expect(svg).toContain('#22c55e')
  })

  it('renders a low reading in red', () => {
    const svg = trendTileToSVG(createGlucoseReadings([60, 58, 55], 'mg/dL', 5))
    expect(svg).toContain('55')
    expect(svg).toContain('LOW')
    expect(svg).toContain('#ef4444')
  })

  it('renders a high reading in amber', () => {
    const svg = trendTileToSVG(createGlucoseReadings([190, 200, 210], 'mg/dL', 5))
    expect(svg).toContain('210')
    expect(svg).toContain('HIGH')
    expect(svg).toContain('#fbbf24')
  })

  it('renders a single reading with an unknown trend', () => {
    const svg = trendTileToSVG(createGlucoseReadings([120]))
    expect(svg).toContain('120')
  })

  it('renders a "No data" frame for empty input', () => {
    expect(trendTileToSVG([])).toContain('No data')
  })

  it.each([
    { value: NaN, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
    { value: Infinity, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
    { value: -Infinity, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
    { value: 0, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
    { value: -1, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
    { value: 601, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00Z' },
    { value: 34, unit: 'mmol/L', timestamp: '2024-01-01T08:00:00Z' },
    {
      value: 120,
      unit: 'other' as GlucoseReading['unit'],
      timestamp: '2024-01-01T08:00:00Z',
    },
    { value: 120, unit: 'mg/dL', timestamp: 'bad' },
  ] satisfies GlucoseReading[])(
    'renders a finite no-data frame for an unusable reading ($value, $unit)',
    (reading) => {
      const svg = trendTileToSVG([reading])
      expect(svg).toContain('No data')
      expect(svg).not.toMatch(/NaN|Infinity/)
    }
  )

  it('renders the latest usable reading when a newer reading is malformed', () => {
    const valid: GlucoseReading = {
      value: 120,
      unit: 'mg/dL',
      timestamp: '2024-01-01T08:00:00Z',
    }
    const invalidNewer: GlucoseReading = {
      value: 601,
      unit: 'mg/dL',
      timestamp: '2024-01-01T08:05:00Z',
    }
    const svg = trendTileToSVG([valid, invalidNewer])
    expect(svg).toContain('120')
    expect(svg).not.toContain('601')
  })

  it('honors custom dimensions and light theme', () => {
    const svg = trendTileToSVG(createGlucoseReadings([100, 110]), {
      width: 300,
      height: 180,
      theme: 'light',
    })
    expect(svg).toContain('viewBox="0 0 300 180"')
    expect(svg).toContain('#ffffff')
  })
})
