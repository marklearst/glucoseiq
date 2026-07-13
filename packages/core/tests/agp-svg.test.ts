import { createHash } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import {
  agpChartToSVG,
  type AGPChartOptions,
} from '../src/render/agp-svg'
import { DomainError } from '../src/errors'
import { createGlucoseReadings } from './test-helpers'
import type { GlucoseReading } from '../src/types'

const rising = createGlucoseReadings(
  Array.from({ length: 24 }, (_, i) => 100 + i * 4),
  'mg/dL',
  5
)
const fixedRising: GlucoseReading[] = Array.from({ length: 24 }, (_, index) => ({
  value: 100 + index * 4,
  unit: 'mg/dL',
  timestamp: new Date(Date.UTC(2024, 0, 1, 8, index * 5)).toISOString(),
}))

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
  { label: 'maximum height', options: { height: Number.MAX_VALUE }, width: 800, height: Number.MAX_VALUE },
  { label: 'half-maximum height', options: { height: Number.MAX_VALUE / 2 }, width: 800, height: Number.MAX_VALUE / 2 },
] as const

const tinyDimensions = [
  { label: 'minimum positive dimensions', options: { width: Number.MIN_VALUE, height: Number.MIN_VALUE }, width: Number.MIN_VALUE, height: Number.MIN_VALUE },
  { label: 'dimensions below fixed margins', options: { width: 59, height: 47 }, width: 59, height: 47 },
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

describe('agpChartToSVG', () => {
  it('preserves the pre-hardening default and representative valid bytes', () => {
    expect(sha256(agpChartToSVG(fixedRising))).toBe(
      'd675c71ded60627e45dd85683c6ca9c9c6db358fe7029026f715dcf16bb19dad'
    )
    expect(
      sha256(
        agpChartToSVG(fixedRising, {
          width: 500,
          height: 200,
          theme: 'light',
          title: 'Mark & Co <AGP>',
        })
      )
    ).toBe(
      'f604f439b8debb3bfc42b4f63ba507864e85590a148a8b21506be1b67a74b476'
    )
  })

  describe.each([
    {
      dimension: 'width' as const,
      message: 'agpChartToSVG: width must be a finite positive number',
      custom: 501,
      defaultValue: 800,
    },
    {
      dimension: 'height' as const,
      message: 'agpChartToSVG: height must be a finite positive number',
      custom: 321,
      defaultValue: 320,
    },
  ])('$dimension boundary', ({ dimension, message, custom, defaultValue }) => {
    it.each(invalidDimensions)('rejects $label without coercion', ({ create }) => {
      const { value, hooks } = create()
      const error = captureError(() =>
        agpChartToSVG(rising, {
          [dimension]: value,
        } as unknown as AGPChartOptions)
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
      }) as AGPChartOptions

      const svg = agpChartToSVG(rising, options)

      expect(reads).toBe(1)
      expect(svg).toContain(`${dimension}="${custom}"`)
      expect(svg).not.toContain('onload')
    })

    it('defaults only an undefined getter and reads it once', () => {
      const getter = vi.fn(() => undefined)
      const options = Object.defineProperty({}, dimension, {
        enumerable: true,
        get: getter,
      }) as AGPChartOptions

      const svg = agpChartToSVG(rising, options)

      expect(svg).toBe(agpChartToSVG(rising))
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
        agpChartToSVG(readings, {
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
      captureError(() => agpChartToSVG(readings, { width: 0, height: 0 })),
      'agpChartToSVG: width must be a finite positive number'
    )
  })

  it.each(extremeDimensions)('keeps all data-bearing geometry finite at $label', ({ options, width, height }) => {
    const svg = agpChartToSVG(rising, options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it.each(extremeDimensions)('keeps no-data geometry finite at $label', ({ options, width, height }) => {
    const svg = agpChartToSVG([], options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it.each(tinyDimensions)('accepts $label without invalid length or radius attributes', ({ options, width, height }) => {
    const svg = agpChartToSVG(rising, options)
    expectRootDimensions(svg, width, height)
    expectFiniteSVGGeometry(svg)
  })

  it('treats an empty title exactly like an absent title', () => {
    expect(agpChartToSVG(rising, { title: '' })).toBe(agpChartToSVG(rising))
  })

  it('treats an explicit undefined title getter as absent and reads it once', () => {
    const getter = vi.fn(() => undefined)
    const options = Object.defineProperty({}, 'title', {
      enumerable: true,
      get: getter,
    }) as AGPChartOptions

    expect(agpChartToSVG(rising, options)).toBe(agpChartToSVG(rising))
    expect(getter).toHaveBeenCalledTimes(1)
  })

  it('reads a non-empty title exactly once', () => {
    const getter = vi
      .fn<() => string>()
      .mockReturnValueOnce('Stable & safe')
      .mockReturnValue('later <script>')
    const options = Object.defineProperty({}, 'title', {
      enumerable: true,
      get: getter,
    }) as AGPChartOptions

    const svg = agpChartToSVG(rising, options)

    expect(getter).toHaveBeenCalledTimes(1)
    expect(svg).toContain('Stable &amp; safe')
    expect(svg).not.toContain('later')
  })

  it.each([
    ['null', null],
    ['number', 1],
    ['boolean', true],
    ['bigint', 1n],
    ['symbol', Symbol('title')],
    ['array', ['title']],
    ['object', { title: 'unsafe' }],
    ['function', () => 'unsafe'],
  ] as const)('rejects a present non-string title (%s)', (_label, title) => {
    expectInvalidOption(
      captureError(() =>
        agpChartToSVG(rising, {
          title,
        } as unknown as AGPChartOptions)
      ),
      'agpChartToSVG: title must be a string'
    )
  })

  it('rejects a hostile title object without invoking any hooks', () => {
    const replace = vi.fn(() => '<script>alert(1)</script>')
    const toPrimitive = vi.fn(() => 'unsafe')
    const valueOf = vi.fn(() => 'unsafe')
    const toString = vi.fn(() => 'unsafe')
    const title = {
      replace,
      [Symbol.toPrimitive]: toPrimitive,
      valueOf,
      toString,
    }

    const error = captureError(() =>
      agpChartToSVG(rising, {
        title,
      } as unknown as AGPChartOptions)
    )

    for (const hook of [replace, toPrimitive, valueOf, toString]) {
      expect(hook).not.toHaveBeenCalled()
    }
    expectInvalidOption(error, 'agpChartToSVG: title must be a string')
  })

  it('rejects an invalid title before touching poisoned readings', () => {
    const readings = new Proxy([], {
      get() {
        throw new Error('readings must not be accessed')
      },
    }) as unknown as GlucoseReading[]

    expectInvalidOption(
      captureError(() =>
        agpChartToSVG(readings, { title: null as unknown as string })
      ),
      'agpChartToSVG: title must be a string'
    )
  })

  it('sanitizes XML-forbidden title code points while preserving legal whitespace', () => {
    const svg = agpChartToSVG(rising, {
      title: '\u0000\t\n\r<&>"\'\ud800\ufffe😀',
    })

    expect(svg).toContain(
      '\ufffd\t\n\r&lt;&amp;&gt;&quot;&#39;\ufffd\ufffd😀'
    )
    expect(svg).not.toContain('\u0000')
    expect(svg).not.toContain('\ud800')
    expect(svg).not.toContain('\ufffe')
  })

  it.each([
    ['forbidden C0 controls before tab', '\u0000\u0001\u0008', '\ufffd\ufffd\ufffd'],
    ['forbidden C0 controls between and after legal whitespace', '\u000b\u000c\u000e\u001f', '\ufffd\ufffd\ufffd\ufffd'],
    ['a lone high surrogate', '\ud800', '\ufffd'],
    ['a lone low surrogate', '\udfff', '\ufffd'],
    ['BMP noncharacters', '\ufffe\uffff', '\ufffd\ufffd'],
  ] as const)('replaces %s with U+FFFD', (_label, input, expected) => {
    const svg = agpChartToSVG(rising, { title: `before${input}after` })

    expect(svg).toContain(`before${expected}after`)
    expect(svg).not.toContain(`before${input}after`)
  })

  it('preserves every XML 1.0 valid boundary used by title text', () => {
    const valid = '\t\n\r \ud7ff\ue000\ufffd😀'
    expect(agpChartToSVG(rising, { title: valid })).toContain(valid)
  })
  it('renders a self-contained SVG string with bands, median, and axes', () => {
    const svg = agpChartToSVG(rising)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('width="800"')
    expect(svg).toContain('height="320"')
    expect(svg).toContain('viewBox="0 0 800 320"')
    expect(svg).toContain('<path') // percentile bands
    expect(svg).toContain('<polyline') // median line
    expect(svg).toContain('12 PM') // static x-axis label
    expect(svg).toContain('#0a0a0a') // dark background (default/brand)
  })

  it('supports a light theme', () => {
    const svg = agpChartToSVG(rising, { theme: 'light' })
    expect(svg).toContain('#ffffff')
  })

  it('honors custom dimensions', () => {
    const svg = agpChartToSVG(rising, { width: 500, height: 200 })
    expect(svg).toContain('width="500"')
    expect(svg).toContain('viewBox="0 0 500 200"')
  })

  it('renders and XML-escapes a title', () => {
    const svg = agpChartToSVG(rising, { title: 'Mark & Co <AGP>' })
    expect(svg).toContain('Mark &amp; Co &lt;AGP&gt;')
  })

  it('renders a "No data" frame for empty input without a median line', () => {
    const svg = agpChartToSVG([])
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('No data')
    expect(svg).not.toContain('<polyline')
  })

  it('draws a run that reaches the final bin of the day', () => {
    const late: GlucoseReading[] = [
      { value: 130, unit: 'mg/dL', timestamp: '2024-01-01T23:50:00Z' },
      { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T23:55:00Z' },
    ]
    const svg = agpChartToSVG(late, { timeZone: 'UTC' })
    expect(svg).toContain('<path')
  })

  it('is deterministic for the same input', () => {
    expect(agpChartToSVG(rising)).toBe(agpChartToSVG(rising))
  })
})
