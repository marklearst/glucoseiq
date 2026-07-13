import { describe, it, expect, vi } from 'vitest'
import * as enhancedTIR from '../src/tir-enhanced'
import { tirBarToSVG } from '../src/render/tir-bar'
import { createGlucoseReadings } from './test-helpers'
import type {
  EnhancedTIRResult,
  GlucoseReading,
  RangeMetrics,
} from '../src/types'

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
