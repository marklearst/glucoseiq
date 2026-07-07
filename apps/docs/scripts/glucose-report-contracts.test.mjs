import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (path) => readFileSync(join(docsRoot, path), 'utf8')

const files = {
  page: 'app/(home)/page.tsx',
  suite: 'app/(home)/glucose-report-suite.tsx',
  trace: 'app/(home)/glucose-trace.tsx',
  gmi: 'app/(home)/gmi-scale.tsx',
  tir: 'app/(home)/time-in-range-distribution.tsx',
  agp: 'app/(home)/agp-profile.tsx',
  entrance: 'app/(home)/report-entrance.tsx',
  styles: 'app/(home)/glucose-report.module.css',
}

test('homepage report uses four server-rendered views behind one client entrance', () => {
  for (const path of Object.values(files)) {
    assert.equal(existsSync(join(docsRoot, path)), true, `${path} is missing`)
  }

  const page = read(files.page)
  const suite = read(files.suite)
  const entrance = read(files.entrance)
  const serverViews = [
    suite,
    read(files.trace),
    read(files.gmi),
    read(files.tir),
    read(files.agp),
  ]

  assert.match(page, /<ReportEntrance>\s*<GlucoseReportSuite/u)
  assert.match(suite, /data-report-view="trace"/u)
  assert.match(read(files.gmi), /data-report-view="gmi"/u)
  assert.match(read(files.tir), /data-report-view="tir"/u)
  assert.match(read(files.agp), /data-report-view="agp"/u)
  assert.match(entrance, /^'use client'/u)

  for (const source of serverViews) {
    assert.doesNotMatch(source, /['"]use client['"]/u)
  }
})

test('report entrance runs once without taking control of page scrolling', () => {
  const entrance = read(files.entrance)
  const styles = read(files.styles)

  assert.equal((entrance.match(/new IntersectionObserver/gu) ?? []).length, 1)
  assert.doesNotMatch(
    `${entrance}\n${styles}`,
    /view-timeline|animation-timeline|scrollend|position:\s*sticky|preventDefault\(|addEventListener\(\s*['"](?:wheel|touchmove)/u,
  )
  assert.doesNotMatch(entrance, /addEventListener\(\s*['"]scroll/u)
  assert.match(entrance, /root\.dataset\.entranceState/u)
  assert.match(
    entrance,
    /root\.querySelector<HTMLElement>\('\[data-motion-part="report"\]'\)/u,
  )
  assert.match(entrance, /observer\.observe\(target\)/u)
  assert.match(entrance, /target\.getBoundingClientRect\(\)/u)
  assert.match(entrance, /prefers-reduced-motion/u)
  assert.match(entrance, /event\.persisted/u)
  assert.match(styles, /\.reportEntrance\[data-entrance-state='armed'\]/u)
  assert.match(styles, /\.reportEntrance\[data-entrance-state='revealing'\]/u)
  assert.match(styles, /prefers-reduced-motion:\s*reduce/u)
})

test('report layout gives the trace priority and adapts without horizontal overflow', () => {
  const styles = read(files.styles)
  const suite = read(files.suite)

  assert.match(suite, /className=\{styles\.supportDeck\}/u)
  assert.match(styles, /grid-template-columns:\s*minmax\(0,\s*3fr\)\s+minmax\(0,\s*4fr\)\s+minmax\(0,\s*5fr\)/u)
  assert.match(styles, /\.supportDeck > \.reportPanel \+ \.reportPanel/u)
  assert.match(styles, /@media\s*\(max-width:\s*1100px\)/u)
  assert.match(styles, /@media\s*\(max-width:\s*620px\)/u)
  assert.match(styles, /min-width:\s*0/u)
  assert.match(styles, /overflow:\s*clip/u)
  assert.match(styles, /\.reportFigure\s*\{[\s\S]*border:/u)
  assert.match(styles, /\.supportDeck\s*\{[\s\S]*border-top:/u)
  assert.doesNotMatch(
    styles,
    /\.tracePanel\s*\{[\s\S]{0,260}border-radius:/u,
  )
  assert.doesNotMatch(
    styles,
    /\.supportDeck\s*\{[\s\S]{0,320}border-radius:/u,
  )
})

test('GMI uses one continuous 260-degree arc without a marker', () => {
  const gmi = read(files.gmi)
  const styles = read(files.styles)
  const geometry = read('lib/glucose-profile.ts')

  assert.match(geometry, /GMI_DIAL_SWEEP_DEGREES = 260/u)
  assert.match(gmi, /<mask/u)
  assert.match(gmi, /<foreignObject/u)
  assert.match(styles, /conic-gradient\(/u)
  assert.match(gmi, /const ARC_LENGTH/u)
  assert.match(gmi, /'--gmi-progress-length'/u)
  assert.match(gmi, /'--gmi-arc-length'/u)
  assert.doesNotMatch(
    /className=\{styles\.gmiProgress\}[\s\S]*?\/>/u.exec(gmi)?.[0] ?? '',
    /pathLength=/u,
  )
  assert.equal(
    (gmi.match(/className=\{styles\.gmiRoundCap\}/gu) ?? []).length,
    2,
  )
  assert.doesNotMatch(gmi, /<circle/u)
  assert.match(
    styles,
    /stroke-dasharray:\s*var\(--gmi-progress-length\)\s*var\(--gmi-arc-length\)/u,
  )
  assert.equal((gmi.match(/className=\{styles\.gmiProgress\}/gu) ?? []).length, 1)
  assert.doesNotMatch(gmi, /<linearGradient/u)
  assert.doesNotMatch(styles, /stroke-dasharray:\s*(?:0|var\(--gmi-progress\))\s+100/u)
  assert.doesNotMatch(
    `${gmi}\n${styles}`,
    /SEGMENT_COUNT|segmentPath|gmiSegment|gmiMarker|gmiMarkerHalo|gmiMarkerGroup/u,
  )
  assert.match(gmi, /const SCALE_MAX_LABEL = '10%\+'/u)
  assert.match(
    gmi,
    /Not a laboratory[\s\n]+A1C or a diagnosis\./u,
  )
  assert.match(
    styles,
    /#30d158 26deg,[\s\S]*?#ffd60a 52deg,[\s\S]*?#ffd60a 78deg,[\s\S]*?#ff9f0a 156deg,[\s\S]*?#ff453a 260deg,[\s\S]*?#ff453a 267deg,[\s\S]*?transparent 268deg,[\s\S]*?transparent 352deg,[\s\S]*?#30d158 353deg,[\s\S]*?#30d158 360deg/u,
  )

  const progressRule =
    /\.gmiProgress\s*\{([^}]*)\}/u.exec(styles)?.[1] ?? ''
  const capRule =
    /\.gmiRoundCap\s*\{([^}]*)\}/u.exec(styles)?.[1] ?? ''
  assert.doesNotMatch(progressRule, /vector-effect/u)
  assert.doesNotMatch(capRule, /vector-effect/u)
})

test('daily profile renders twelve percentile capsules instead of smooth bands', () => {
  const agp = read(files.agp)
  const styles = read(files.styles)

  assert.match(agp, /createDailyProfileGeometry/u)
  assert.match(agp, /data-profile-column/u)
  assert.match(agp, /styles\.profileStem/u)
  assert.match(agp, /styles\.profileCapsule/u)
  assert.match(agp, /styles\.profileMedian/u)
  assert.match(
    agp,
    /<line\s+className=\{styles\.profileCapsule\}/u,
  )
  assert.match(agp, /Target 70–180 mg\/dL/u)
  assert.doesNotMatch(
    `${agp}\n${styles}`,
    /outerBandPaths|innerBandPaths|medianPaths|agpOuterBand|agpInnerBand|agpMedian/u,
  )
})

test('homepage typography keeps display weights deliberate and code as the only mono surface', () => {
  const reportStyles = read(files.styles)
  const homeStyles = read('app/(home)/home.module.css')
  const combined = `${homeStyles}\n${reportStyles}`

  assert.doesNotMatch(combined, /font-weight:\s*(?:[7-9]00|6[1-9]0)/u)
  assert.match(homeStyles, /\.hero h1\s*\{[\s\S]{0,260}font-weight:\s*600/u)
  assert.match(
    reportStyles,
    /\.reportIntro h2\s*\{[\s\S]{0,260}font-weight:\s*600/u,
  )
  assert.match(
    reportStyles,
    /\.panelMetric dt\s*\{[^}]*font-size:\s*0\.8125rem;[^}]*font-weight:\s*500;/u,
  )
  assert.match(
    homeStyles,
    /\.reportLabel\s*\{[^}]*font-weight:\s*550;/u,
  )
  assert.doesNotMatch(reportStyles, /font-family:\s*var\(--home-mono\)/u)
})

test('report text names each time window and keeps one shared limitation', () => {
  const markup = [
    read(files.suite),
    read(files.trace),
    read(files.gmi),
    read(files.tir),
    read(files.agp),
  ].join('\n')

  for (const text of [
    'Last 24 hours',
    'Glucose management indicator',
    '{days} days · Target 70–180 mg/dL',
    'Daily profile',
    '{days}-day percentile profile',
    'Synthetic data. Not clinically representative.',
  ]) {
    assert.ok(markup.includes(text), `missing report text: ${text}`)
  }

  assert.equal(
    (markup.match(/Synthetic data\. Not clinically representative\./gu) ?? [])
      .length,
    1,
  )
})
