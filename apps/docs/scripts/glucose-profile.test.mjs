import assert from 'node:assert/strict'
import test from 'node:test'
import { createGlucoseProfileGeometry } from '../lib/glucose-profile.ts'

const completePercentiles = {
  5: 40,
  25: 70,
  50: 100,
  75: 180,
  95: 250,
}

function cubicSegments(path) {
  const tokens = path.match(/[MC]|-?\d+(?:\.\d+)?/gu) ?? []
  assert.equal(tokens.shift(), 'M')

  let current = {
    x: Number(tokens.shift()),
    y: Number(tokens.shift()),
  }
  const segments = []

  while (tokens.length > 0) {
    assert.equal(tokens.shift(), 'C')
    const firstControl = {
      x: Number(tokens.shift()),
      y: Number(tokens.shift()),
    }
    const secondControl = {
      x: Number(tokens.shift()),
      y: Number(tokens.shift()),
    }
    const end = {
      x: Number(tokens.shift()),
      y: Number(tokens.shift()),
    }
    segments.push({ start: current, firstControl, secondControl, end })
    current = end
  }

  return segments
}

test('profile geometry maps the fixed glucose domain to literal SVG paths', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 1435, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 42,
    valid: true,
  }
  const readings = [
    {
      value: 70,
      unit: 'mg/dL',
      timestamp: '2024-01-14T00:00:00.000Z',
    },
    {
      value: 180,
      unit: 'mg/dL',
      timestamp: '2024-01-14T12:00:00.000Z',
    },
    {
      value: 100,
      unit: 'mg/dL',
      timestamp: '2024-01-14T23:55:00.000Z',
    },
  ]

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings,
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.outerBandPaths, [
    'M0,0 L72,0 L143.5,0 L143.5,210 L72,210 L0,210 Z',
  ])
  assert.deepEqual(geometry.innerBandPaths, [
    'M0,70 L72,70 L143.5,70 L143.5,180 L72,180 L0,180 Z',
  ])
  assert.deepEqual(geometry.medianPaths, [
    'M0,150 L72,150 L143.5,150',
  ])
  assert.deepEqual(geometry.tracePaths, [
    'M0.5,180',
    'M72.5,70',
    'M144,150',
  ])
  assert.deepEqual(geometry.latest, {
    x: 144,
    y: 150,
    value: 100,
    zone: 'in-range',
  })
  assert.deepEqual(geometry.observedRange, {
    min: 70,
    max: 180,
  })
  assert.deepEqual(geometry.target, { lowY: 180, highY: 70 })
})

test('profile geometry derives the observed range from the plotted 24-hour window', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 260,
        unit: 'mg/dL',
        timestamp: '2024-01-12T23:55:00.000Z',
      },
      {
        value: 64,
        unit: 'mg/dL',
        timestamp: '2024-01-14T00:00:00.000Z',
      },
      {
        value: 196,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
      {
        value: 106,
        unit: 'mg/dL',
        timestamp: '2024-01-14T23:55:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.observedRange, {
    min: 64,
    max: 196,
  })
})

test('profile geometry places the latest reading at the end of a trailing 24-hour axis', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 90,
        unit: 'mg/dL',
        timestamp: '2024-01-13T12:00:00.000Z',
      },
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-13T12:15:00.000Z',
      },
      {
        value: 110,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.tracePaths, [
    'M0,160 L1.5,150',
    'M144,140',
  ])
  assert.equal(geometry.latest.x, 144)
  assert.deepEqual(
    geometry.timeLabels.map((tick) => tick.label),
    ['12 PM', '6 PM', '12 AM', '6 AM', 'Now'],
  )
})

test('profile geometry keeps the last reading when timestamps are duplicated', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:55:00.000Z',
      },
      {
        value: 120,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:55:00.000Z',
      },
      {
        value: 130,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.tracePaths, ['M143.5,130 L144,120'])
  assert.deepEqual(geometry.observedRange, {
    min: 120,
    max: 130,
  })
})

test('profile geometry leaves sensor gaps open', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 360, n: 14, percentiles: completePercentiles },
      {
        minuteOfDay: 720,
        n: 0,
        percentiles: { 5: null, 25: null, 50: null, 75: null, 95: null },
      },
      { minuteOfDay: 1080, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 1435, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 56,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T00:00:00.000Z',
      },
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T23:55:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.medianPaths, [
    'M0,150 L36,150',
    'M108,150 L143.5,150',
  ])
  assert.equal(geometry.outerBandPaths.length, 2)
  assert.equal(geometry.innerBandPaths.length, 2)
  assert.deepEqual(geometry.tracePaths, ['M0.5,150', 'M144,150'])
  assert.deepEqual(geometry.isolatedTracePoints, [
    { x: 0.5, y: 150 },
    { x: 144, y: 150 },
  ])
})

test('profile geometry keeps chronological order across midnight in the trailing window', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'America/New_York',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 90,
        unit: 'mg/dL',
        timestamp: '2024-01-14T04:55:00.000Z',
      },
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T05:00:00.000Z',
      },
      {
        value: 110,
        unit: 'mg/dL',
        timestamp: '2024-01-14T05:15:00.000Z',
      },
      {
        value: 120,
        unit: 'mg/dL',
        timestamp: '2024-01-14T17:00:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.tracePaths, [
    'M71.5,160 C71.67,156.11 71.83,151.82 72,150 C72.5,144.55 73,140 73.5,140',
    'M144,130',
  ])
  assert.equal(geometry.latest.x, 144)
})

test('profile geometry smooths connected readings while preserving every point', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:45:00.000Z',
      },
      {
        value: 140,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:50:00.000Z',
      },
      {
        value: 120,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:55:00.000Z',
      },
      {
        value: 130,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.tracePaths, [
    'M142.5,150 C142.67,126.67 142.83,110 143,110 C143.17,110 143.33,130 143.5,130 C143.67,130 143.83,128.33 144,120',
  ])
  assert.match(geometry.tracePaths[0], /C/u)
  assert.doesNotMatch(geometry.tracePaths[0], /NaN|Infinity/u)
  assert.deepEqual(geometry.latest, {
    x: 144,
    y: 120,
    value: 130,
    zone: 'in-range',
  })
})

test('profile geometry keeps a constant run flat', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 120,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:50:00.000Z',
      },
      {
        value: 120,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:55:00.000Z',
      },
      {
        value: 120,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.tracePaths, [
    'M143,130 C143.17,130 143.33,130 143.5,130 C143.67,130 143.83,130 144,130',
  ])
})

test('profile geometry keeps unequal-spacing controls inside each raw segment', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 90,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:36:00.000Z',
      },
      {
        value: 150,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:41:00.000Z',
      },
      {
        value: 110,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:49:00.000Z',
      },
      {
        value: 180,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  const segments = cubicSegments(geometry.tracePaths[0])
  assert.equal(segments.length, 3)

  for (const segment of segments) {
    const minY = Math.min(segment.start.y, segment.end.y)
    const maxY = Math.max(segment.start.y, segment.end.y)

    for (const control of [segment.firstControl, segment.secondControl]) {
      assert.ok(control.x >= segment.start.x)
      assert.ok(control.x <= segment.end.x)
      assert.ok(control.y >= minY)
      assert.ok(control.y <= maxY)
    }
  }
})

test('profile geometry avoids invalid controls at subnormal widths', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:50:00.000Z',
      },
      {
        value: 120,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:55:00.000Z',
      },
      {
        value: 130,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
    ],
    width: 1e-320,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.doesNotMatch(geometry.tracePaths[0], /NaN|Infinity/u)

  const nearFlatGeometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:50:00.000Z',
      },
      {
        value: 100.00000000000003,
        unit: 'mg/dL',
        timestamp: '2024-01-14T11:55:00.000Z',
      },
      {
        value: 100.00000000000006,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
    ],
    width: 1e-319,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.doesNotMatch(nearFlatGeometry.tracePaths[0], /NaN|Infinity/u)
})

test('profile geometry serializes the largest finite chart width', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
    ],
    width: Number.MAX_VALUE,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.doesNotMatch(geometry.tracePaths[0], /NaN|Infinity/u)
})

test('profile geometry keeps expected samples connected and opens longer outages', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T00:00:00.000Z',
      },
      {
        value: 105,
        unit: 'mg/dL',
        timestamp: '2024-01-14T00:15:00.000Z',
      },
      {
        value: 110,
        unit: 'mg/dL',
        timestamp: '2024-01-14T00:31:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.tracePaths, [
    'M140.9,150 L142.4,145',
    'M144,140',
  ])
})

test('profile geometry ignores a newer implausible reading', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  const geometry = createGlucoseProfileGeometry({
    profile,
    readings: [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
      {
        value: 601,
        unit: 'mg/dL',
        timestamp: '2024-01-14T23:55:00.000Z',
      },
    ],
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.tracePaths, ['M144,150'])
  assert.deepEqual(geometry.latest, {
    x: 144,
    y: 150,
    value: 100,
    zone: 'in-range',
  })
})

test('profile geometry reports the latest marker zone', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }

  for (const [value, zone] of [
    [60, 'low'],
    [100, 'in-range'],
    [200, 'high'],
  ]) {
    const geometry = createGlucoseProfileGeometry({
      profile,
      readings: [
        {
          value,
          unit: 'mg/dL',
          timestamp: '2024-01-14T12:00:00.000Z',
        },
      ],
      width: 144,
      height: 210,
      yMin: 40,
      yMax: 250,
    })

    assert.equal(geometry.latest.zone, zone)
  }
})

test('profile geometry rejects non-finite chart bounds', () => {
  const profile = {
    bins: [
      { minuteOfDay: 0, n: 14, percentiles: completePercentiles },
      { minuteOfDay: 720, n: 14, percentiles: completePercentiles },
    ],
    binMinutes: 5,
    percentiles: [5, 25, 50, 75, 95],
    unit: 'mg/dL',
    timeZone: 'UTC',
    totalReadings: 28,
    valid: true,
  }
  const readings = [
    {
      value: 100,
      unit: 'mg/dL',
      timestamp: '2024-01-14T12:00:00.000Z',
    },
  ]

  for (const overrides of [
    { width: Number.NaN },
    { height: Number.POSITIVE_INFINITY },
    { yMin: Number.NEGATIVE_INFINITY },
    { yMax: Number.NaN },
  ]) {
    assert.throws(
      () =>
        createGlucoseProfileGeometry({
          profile,
          readings,
          width: 144,
          height: 210,
          yMin: 40,
          yMax: 250,
          ...overrides,
        }),
      RangeError,
    )
  }
})
