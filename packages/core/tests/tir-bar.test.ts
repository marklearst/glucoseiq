import { createHash } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import * as enhancedTIR from '../src/tir-enhanced'
import { tirBarToSVG, type TIRBarOptions } from '../src/render/tir-bar'
import { DomainError } from '../src/errors'
import { createGlucoseReadings } from './test-helpers'
import type {
  EnhancedTIRResult,
  GlucoseReading,
  RangeMetrics,
} from '../src/types'

const fixedReadings: GlucoseReading[] = [100, 120, 140, 160, 150].map(
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
  const toPrimitive = vi.fn(() => 320)
  const valueOf = vi.fn(() => 320)
  const toString = vi.fn(() => '320')

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
  { label: 'numeric string', create: () => ({ value: '320', hooks: [] }) },
  { label: 'bigint', create: () => ({ value: 320n, hooks: [] }) },
  { label: 'symbol', create: () => ({ value: Symbol('320'), hooks: [] }) },
  { label: 'array', create: () => ({ value: [320], hooks: [] }) },
  { label: 'function', create: () => ({ value: () => 320, hooks: [] }) },
  {
    label: 'attribute-breaking string',
    create: () => ({ value: '320\" onload=\"alert(1)', hooks: [] }),
  },
  { label: 'hostile conversion object', create: hostileScalar },
] as const

const extremeDimensions = [
  { label: 'maximum width', options: { width: Number.MAX_VALUE }, width: Number.MAX_VALUE, height: 320 },
  { label: 'half-maximum width', options: { width: Number.MAX_VALUE / 2 }, width: Number.MAX_VALUE / 2, height: 320 },
  { label: 'maximum height', options: { height: Number.MAX_VALUE }, width: 180, height: Number.MAX_VALUE },
  { label: 'half-maximum height', options: { height: Number.MAX_VALUE / 2 }, width: 180, height: Number.MAX_VALUE / 2 },
] as const

const tinyDimensions = [
  { label: 'minimum positive dimensions', options: { width: Number.MIN_VALUE, height: Number.MIN_VALUE }, width: Number.MIN_VALUE, height: Number.MIN_VALUE },
  { label: 'dimensions below fixed margins', options: { width: 15, height: 31 }, width: 15, height: 31 },
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

function resultWithPercentages(
  percentages: readonly [number, number, number, number, number]
): EnhancedTIRResult {
  const metric = (percentage: number): RangeMetrics => ({
    percentage,
    duration: 0,
    readingCount: 0,
    averageValue: null,
  })

  return {
    veryLow: metric(percentages[0]),
    low: metric(percentages[1]),
    inRange: metric(percentages[2]),
    high: metric(percentages[3]),
    veryHigh: metric(percentages[4]),
    meetsTargets: {
      tirMeetsGoal: false,
      tbrLevel1Safe: false,
      tbrLevel2Safe: false,
      tarLevel1Acceptable: false,
      tarLevel2Acceptable: false,
      targetBasis: 'consensus-ranges',
      overallAssessment: 'concerning',
      recommendations: [],
    },
    summary: {
      totalReadings: 1,
      totalDuration: 5,
      dataQuality: 'poor',
    },
  }
}

describe('tirBarToSVG', () => {
  it('preserves the pre-hardening default and representative valid bytes', () => {
    expect(sha256(tirBarToSVG(fixedReadings))).toBe(
      '790e7cdb9cbaf15654ee2db8e2266bb5f792cf06c59ff61f0eed7c9a551a90f7'
    )
    expect(
      sha256(
        tirBarToSVG(fixedReadings, {
          width: 200,
          height: 400,
          theme: 'light',
        })
      )
    ).toBe(
      '40584c01e1e47d6a0157bef0bb4fa5067947181fe8d96d7d82372cecaff8c221'
    )
  })

  describe.each([
    {
      dimension: 'width' as const,
      message: 'tirBarToSVG: width must be a finite positive number',
      custom: 181,
      defaultValue: 180,
    },
    {
      dimension: 'height' as const,
      message: 'tirBarToSVG: height must be a finite positive number',
      custom: 321,
      defaultValue: 320,
    },
  ])('$dimension boundary', ({ dimension, message, custom, defaultValue }) => {
    it.each(invalidDimensions)('rejects $label without coercion', ({ create }) => {
      const { value, hooks } = create()
      const error = captureError(() =>
        tirBarToSVG(fixedReadings, {
          [dimension]: value,
        } as unknown as TIRBarOptions)
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
      }) as TIRBarOptions

      const svg = tirBarToSVG(fixedReadings, options)

      expect(reads).toBe(1)
      expect(svg).toContain(`${dimension}="${custom}"`)
      expect(svg).not.toContain('onload')
    })

    it('defaults only an undefined getter and reads it once', () => {
      const getter = vi.fn(() => undefined)
      const options = Object.defineProperty({}, dimension, {
        enumerable: true,
        get: getter,
      }) as TIRBarOptions

      const svg = tirBarToSVG(fixedReadings, options)

      expect(svg).toBe(tirBarToSVG(fixedReadings))
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
        tirBarToSVG(readings, {
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
      captureError(() => tirBarToSVG(readings, { width: 0, height: 0 })),
      'tirBarToSVG: width must be a finite positive number'
    )
  })

  it.each(extremeDimensions)('keeps all data-bearing geometry finite at $label', ({ options, width, height }) => {
    const svg = tirBarToSVG(fixedReadings, options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it.each(extremeDimensions)('keeps five-zone geometry finite at $label', ({ options, width, height }) => {
    const fiveZones = [50, 60, 120, 200, 300].map((value, index) => ({
      value,
      unit: 'mg/dL' as const,
      timestamp: new Date(Date.UTC(2024, 0, 1, 8, index * 5)).toISOString(),
    }))

    const svg = tirBarToSVG(fiveZones, options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it.each(extremeDimensions)('keeps no-data geometry finite at $label', ({ options, width, height }) => {
    const svg = tirBarToSVG([], options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it.each(tinyDimensions)('accepts $label without invalid length or radius attributes', ({ options, width, height }) => {
    const svg = tirBarToSVG(fixedReadings, options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it('renders a stacked TIR bar with zone colors and percent labels', () => {
    const svg = tirBarToSVG(createGlucoseReadings([100, 120, 140, 160, 150], 'mg/dL', 5))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('#22c55e') // in-range green
    expect(svg).toContain('100%')
    expect(svg).toContain(
      'aria-label="Time in Range: Very High 0%, High 0%, In Range 100%, Low 0%, Very Low 0%"'
    )
  })

  it('shows all five zones for a spread of values, ignoring invalid readings', () => {
    const readings: GlucoseReading[] = [
      ...createGlucoseReadings([50, 60, 120, 200, 300], 'mg/dL', 5),
      { value: NaN, unit: 'mg/dL', timestamp: '2024-01-01T09:00:00Z' },
      { value: -5, unit: 'mg/dL', timestamp: '2024-01-01T09:05:00Z' },
      { value: 700, unit: 'mg/dL', timestamp: '2024-01-01T09:10:00Z' },
      { value: 120, unit: 'mg/dL', timestamp: 'bad-timestamp' },
    ]
    const svg = tirBarToSVG(readings)
    expect(svg).toContain('#b91c1c') // very low
    expect(svg).toContain('#f87171') // low
    expect(svg).toContain('#22c55e') // in range
    expect(svg).toContain('#fbbf24') // high
    expect(svg).toContain('#f97316') // very high
    expect(svg).toContain('20%')
  })

  it('accepts mmol/L input', () => {
    const svg = tirBarToSVG([
      { value: 5.5, unit: 'mmol/L', timestamp: '2024-01-01T08:00:00Z' },
      { value: 6.0, unit: 'mmol/L', timestamp: '2024-01-01T08:05:00Z' },
    ])
    expect(svg).toContain('#22c55e') // ~99 and ~108 mg/dL are in range
  })

  it('never emits non-finite geometry for valid boundary input', () => {
    const svg = tirBarToSVG([
      {
        value: 180.005,
        unit: 'mg/dL',
        timestamp: '2024-01-01T08:00:00Z',
      },
    ])

    expect(svg).not.toMatch(/NaN|Infinity/)
  })

  it.each([
    ['zero', [0, 0, 0, 0, 0]],
    ['non-finite', [NaN, 0, 0, 0, 0]],
  ] as const)(
    'renders the existing no-data frame for a %s calculated total',
    (_label, percentages) => {
      const calculation = vi
        .spyOn(enhancedTIR, 'calculateEnhancedTIR')
        .mockReturnValue(resultWithPercentages(percentages))

      try {
        const svg = tirBarToSVG(
          createGlucoseReadings([100], 'mg/dL', 5)
        )

        expect(svg).toContain('aria-label="Time in Range"')
        expect(svg).toContain('No data')
        expect(svg).not.toMatch(/NaN|Infinity/)
      } finally {
        calculation.mockRestore()
      }
    }
  )

  it('renders a "No data" frame for empty input', () => {
    const svg = tirBarToSVG([])
    expect(svg).toContain('No data')
  })

  it('honors custom dimensions and light theme', () => {
    const svg = tirBarToSVG(createGlucoseReadings([100, 120]), {
      width: 200,
      height: 400,
      theme: 'light',
    })
    expect(svg).toContain('viewBox="0 0 200 400"')
    expect(svg).toContain('#ffffff')
  })
})
