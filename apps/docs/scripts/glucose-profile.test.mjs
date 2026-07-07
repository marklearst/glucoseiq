import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAGPProfile } from '@glucoseiq/core/metrics'
import { generateCGMSeries } from '@glucoseiq/testing'
import {
  createDailyProfileGeometry,
  createGMIDialGeometry,
  createGlucoseTraceGeometry,
  GMI_DIAL_SWEEP_DEGREES,
} from '../lib/glucose-profile.ts'

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

test('GMI dial maps an estimate onto a clean open five-to-ten scale', () => {
  assert.equal(GMI_DIAL_SWEEP_DEGREES, 260)
  assert.deepEqual(
    createGMIDialGeometry({
      value: 6.2,
      min: 5,
      max: 10,
    }),
    {
      arcPercent: 24,
      ratio: 0.24,
    },
  )

  assert.equal(
    createGMIDialGeometry({
      value: 12,
      min: 5,
      max: 10,
    }).ratio,
    1,
  )
})

test('daily profile geometry renders twelve two-hour percentile capsules', () => {
  const readings = generateCGMSeries({
    days: 14,
    seed: 7,
    mealAmplitude: 95,
    noise: 2,
    nocturnalHypoDays: [3, 9],
  })
  const profile = buildAGPProfile(readings, {
    binMinutes: 120,
    method: 'linear',
    percentiles: [5, 25, 50, 75, 95],
    timeZone: 'UTC',
  })
  const geometry = createDailyProfileGeometry({
    profile,
    width: 640,
    height: 180,
    yMin: 40,
    yMax: 250,
  })

  assert.equal(geometry.columns.length, 12)
  assert.deepEqual(
    geometry.columns.map((column) => column.minuteOfDay),
    [0, 120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200, 1320],
  )
  assert.deepEqual(geometry.target, {
    lowY: 154.2857,
    highY: 60,
  })
  assert.deepEqual(geometry.timeLabels, [
    { label: '12 AM', x: 0 },
    { label: '6 AM', x: 160 },
    { label: '12 PM', x: 320 },
    { label: '6 PM', x: 480 },
    { label: '12 AM', x: 640 },
  ])

  for (const column of geometry.columns) {
    assert.ok(column.stemTop <= column.capsuleTop)
    assert.ok(column.capsuleTop <= column.medianY)
    assert.ok(column.medianY <= column.capsuleBottom)
    assert.ok(column.capsuleBottom <= column.stemBottom)
    assert.ok(
      [
        column.x,
        column.stemTop,
        column.capsuleTop,
        column.medianY,
        column.capsuleBottom,
        column.stemBottom,
      ].every(Number.isFinite),
    )
  }
})

test('trace geometry maps the fixed glucose domain to literal SVG paths', () => {
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

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(Object.keys(geometry).sort(), [
    'height',
    'isolatedTracePoints',
    'latest',
    'observedRange',
    'target',
    'timeLabels',
    'tracePaths',
    'width',
  ])
  assert.equal(geometry.width, 144)
  assert.equal(geometry.height, 210)
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

test('trace geometry derives the observed range from the plotted 24-hour window', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
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

test('trace geometry places the latest reading at the end of a trailing 24-hour axis', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
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

test('trace geometry keeps the last reading when timestamps are duplicated', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
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

test('trace geometry leaves sensor gaps open', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.tracePaths, ['M0.5,150', 'M144,150'])
  assert.deepEqual(geometry.isolatedTracePoints, [
    { x: 0.5, y: 150 },
    { x: 144, y: 150 },
  ])
})

test('trace geometry keeps chronological order across midnight in the trailing window', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'America/New_York',
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

test('trace geometry smooths connected readings while preserving every point', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
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

test('trace geometry keeps a constant run flat', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(geometry.tracePaths, [
    'M143,130 C143.17,130 143.33,130 143.5,130 C143.67,130 143.83,130 144,130',
  ])
})

test('trace geometry keeps unequal-spacing controls inside each raw segment', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
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

test('trace geometry avoids invalid controls at numeric extremes', () => {
  const subnormalReadings = [
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
  ]
  const subnormalGeometry = createGlucoseTraceGeometry({
    readings: subnormalReadings,
    timeZone: 'UTC',
    width: 1e-320,
    height: 210,
    yMin: 40,
    yMax: 250,
  })
  assert.doesNotMatch(subnormalGeometry.tracePaths[0], /NaN|Infinity/u)

  const nearFlatReadings = [
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
  ]
  const nearFlatGeometry = createGlucoseTraceGeometry({
    readings: nearFlatReadings,
    timeZone: 'UTC',
    width: 1e-319,
    height: 210,
    yMin: 40,
    yMax: 250,
  })
  assert.doesNotMatch(nearFlatGeometry.tracePaths[0], /NaN|Infinity/u)

  const maximumWidthGeometry = createGlucoseTraceGeometry({
    readings: [
      {
        value: 100,
        unit: 'mg/dL',
        timestamp: '2024-01-14T12:00:00.000Z',
      },
    ],
    timeZone: 'UTC',
    width: Number.MAX_VALUE,
    height: 210,
    yMin: 40,
    yMax: 250,
  })
  assert.doesNotMatch(maximumWidthGeometry.tracePaths[0], /NaN|Infinity/u)
})

test('trace geometry keeps expected samples connected and opens longer outages', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
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

test('trace geometry ignores a newer implausible reading', () => {
  const readings = [
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
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
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

test('trace geometry reports the latest marker zone at both endpoints', () => {
  for (const [value, zone] of [
    [60, 'low'],
    [70, 'in-range'],
    [100, 'in-range'],
    [180, 'in-range'],
    [200, 'high'],
  ]) {
    const geometry = createGlucoseTraceGeometry({
      readings: [
        {
          value,
          unit: 'mg/dL',
          timestamp: '2024-01-14T12:00:00.000Z',
        },
      ],
      timeZone: 'UTC',
      width: 144,
      height: 210,
      yMin: 40,
      yMax: 250,
    })

    assert.equal(geometry.latest.zone, zone)
  }
})

test('trace geometry rejects non-finite chart bounds', () => {
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
        createGlucoseTraceGeometry({
          readings,
          timeZone: 'UTC',
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

test('trace geometry rounds the first four UTC display labels to whole local hours', () => {
  const readings = [
    {
      value: 100,
      unit: 'mg/dL',
      timestamp: '2024-01-14T23:55:00.000Z',
    },
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'UTC',
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(
    geometry.timeLabels.map((tick) => tick.label),
    ['12 AM', '6 AM', '12 PM', '6 PM', 'Now'],
  )
  assert.deepEqual(geometry.tracePaths, ['M144,150'])
})

test('trace geometry rounds display labels in Kathmandu local wall-clock time', () => {
  const readings = [
    {
      value: 100,
      unit: 'mg/dL',
      timestamp: '2024-01-14T23:55:00.000Z',
    },
  ]

  const geometry = createGlucoseTraceGeometry({
    readings,
    timeZone: 'Asia/Kathmandu',
    width: 144,
    height: 210,
    yMin: 40,
    yMax: 250,
  })

  assert.deepEqual(
    geometry.timeLabels.map((tick) => tick.label),
    ['6 AM', '12 PM', '6 PM', '12 AM', 'Now'],
  )
  assert.deepEqual(geometry.tracePaths, ['M144,150'])
})

test('the fixed homepage fixture has three contiguous excursions above 180 mg/dL', () => {
  const readings = generateCGMSeries({
    days: 14,
    seed: 7,
    mealAmplitude: 95,
    noise: 2,
    nocturnalHypoDays: [3, 9],
  })
  const latestTimestamp = Date.parse(readings.at(-1).timestamp)
  const windowStart = latestTimestamp - 86_400_000
  const trailingReadings = readings.filter(
    (reading) => Date.parse(reading.timestamp) >= windowStart,
  )
  let excursions = 0
  let aboveTarget = false

  for (const reading of trailingReadings) {
    const above = reading.value > 180
    if (above && !aboveTarget) excursions += 1
    aboveTarget = above
  }

  assert.equal(excursions, 3)
})
