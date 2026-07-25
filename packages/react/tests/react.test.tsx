import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, renderHook, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import * as reactAdapter from '../src'
import {
  useGlucoseAnalysis,
  useAGPProfile,
  useGlucoseIQScore,
  useMealResponse,
  useGlucoseLive,
  AgpChart,
  TirBar,
  TrendTile,
} from '../src'
import { DomainError, type GlucoseReading } from '@glucoseiq/core'

const RUNTIME_EXPORTS = [
  'AgpChart',
  'TirBar',
  'TrendTile',
  'useAGPProfile',
  'useGlucoseAnalysis',
  'useGlucoseIQScore',
  'useGlucoseLive',
  'useMealResponse',
]

function firstDirective(source: string, fileName: string): string | undefined {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const first = sourceFile.statements[0]
  if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression)) {
    return undefined
  }
  return first.expression.text
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const base = Date.UTC(2024, 0, 1, 8, 0, 0)
const mk = (values: number[], stepMin = 5): GlucoseReading[] =>
  values.map((v, i) => ({
    value: v,
    unit: 'mg/dL',
    timestamp: new Date(base + i * stepMin * 60000).toISOString(),
  }))

const readings = mk([100, 110, 120, 130, 140, 150, 145, 135, 125, 115])

describe('package boundary', () => {
  it('marks the source entrypoint as a client module in its first statement', () => {
    const source = readFileSync(resolve('src/index.ts'), 'utf8')
    expect(firstDirective(source, 'src/index.ts')).toBe('use client')
  })

  it('preserves the exact runtime export surface', () => {
    expect(Object.keys(reactAdapter).sort()).toEqual(RUNTIME_EXPORTS)
  })
})

describe('analysis hooks', () => {
  it('useGlucoseAnalysis returns the full report and memoizes on identity', () => {
    const { result, rerender } = renderHook(({ r }) => useGlucoseAnalysis(r), {
      initialProps: { r: readings },
    })
    expect(result.current.valid).toBe(true)
    expect(result.current.timeInRange?.inRange.percentage).toBe(100)
    const first = result.current
    rerender({ r: readings })
    expect(result.current).toBe(first) // same identity → memo hit
  })

  it('useAGPProfile returns the band series', () => {
    const { result } = renderHook(() => useAGPProfile(readings, { binMinutes: 60 }))
    expect(result.current.bins).toHaveLength(24)
  })

  it('useGlucoseIQScore returns the 0-100 score', () => {
    const { result } = renderHook(() => useGlucoseIQScore(readings))
    expect(result.current.score).toBe(100)
    expect(result.current.rating).toBe('excellent')
  })

  it('useMealResponse analyzes a meal window', () => {
    const { result } = renderHook(() =>
      useMealResponse(readings, new Date(base).toISOString())
    )
    expect(result.current.valid).toBe(true)
    expect(result.current.peakValue).toBe(150)
  })
})

describe('useGlucoseLive', () => {
  it('returns latest reading, trend, and staleness', () => {
    const { result } = renderHook(() => useGlucoseLive(readings))
    expect(result.current.latest?.value).toBe(115)
    expect(result.current.trend.trend).toBeDefined()
    expect(result.current.minutesSince).toBeGreaterThan(0)
  })

  it('re-evaluates staleness on the refresh interval', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGlucoseLive(readings, { refreshMs: 1000 }))
    const before = result.current.minutesSince!
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.minutesSince!).toBeGreaterThan(before)
  })

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['sub-millisecond fraction', 0.5],
    ['fractional milliseconds', 1.5],
    ['timer overflow', 2_147_483_648],
  ])('rejects a %s refresh interval', (_label, refreshMs) => {
    expect(() =>
      renderHook(() => useGlucoseLive(readings, { refreshMs }))
    ).toThrow(
      /refreshMs must be a whole number from 1 through 2147483647/u
    )
  })

  it('accepts the maximum platform timer delay', () => {
    vi.useFakeTimers()
    const interval = vi.spyOn(globalThis, 'setInterval')
    const { unmount } = renderHook(() =>
      useGlucoseLive(readings, { refreshMs: 2_147_483_647 })
    )

    expect(interval).toHaveBeenCalledWith(expect.any(Function), 2_147_483_647)
    unmount()
  })

  it('accepts the minimum whole-millisecond timer delay', () => {
    vi.useFakeTimers()
    const interval = vi.spyOn(globalThis, 'setInterval')
    const { unmount } = renderHook(() =>
      useGlucoseLive(readings, { refreshMs: 1 })
    )

    expect(interval).toHaveBeenCalledWith(expect.any(Function), 1)
    unmount()
  })

  it('reports invalid refresh intervals with the typed core option error', () => {
    let thrown: unknown
    try {
      renderHook(() => useGlucoseLive(readings, { refreshMs: 0 }))
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(DomainError)
    expect(thrown).toMatchObject({ code: 'INVALID_OPTION' })
  })

  it('handles empty readings', () => {
    const { result } = renderHook(() => useGlucoseLive([]))
    expect(result.current.latest).toBeNull()
    expect(result.current.minutesSince).toBeNull()
    expect(result.current.trend.trend).toBe('unknown')
  })
})

describe('chart components', () => {
  it('AgpChart renders an inline SVG with className/style passthrough', () => {
    const { container } = render(
      <AgpChart readings={readings} className="agp" style={{ width: 400 }} />
    )
    const div = container.firstElementChild as HTMLElement
    expect(div.className).toBe('agp')
    expect(div.querySelector('svg')).not.toBeNull()
  })

  it('TirBar renders the zone bar', () => {
    const { container } = render(<TirBar readings={readings} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('TrendTile renders the current value', () => {
    const { container } = render(<TrendTile readings={readings} />)
    expect(container.innerHTML).toContain('115')
  })

  it('components accept renderer options', () => {
    const { container } = render(
      <AgpChart readings={readings} options={{ theme: 'light', width: 500 }} />
    )
    expect(container.innerHTML).toContain('#ffffff')
    expect(container.innerHTML).toContain('width="500"')
  })
})
