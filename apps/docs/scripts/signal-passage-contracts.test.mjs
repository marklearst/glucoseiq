import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const pagePath = join(docsRoot, 'app/(home)/page.tsx')
const signalMotionPath = join(
  docsRoot,
  'app/(home)/signal-motion.ts',
)
const signalStoryPath = join(
  docsRoot,
  'app/(home)/signal-story.tsx',
)
const page = readFileSync(pagePath, 'utf8')
const signalMotion = existsSync(signalMotionPath)
  ? readFileSync(signalMotionPath, 'utf8')
  : ''
const signalStory = existsSync(signalStoryPath)
  ? readFileSync(signalStoryPath, 'utf8')
  : ''

test('the pure motion selector exists without a client or React boundary', () => {
  assert.equal(
    existsSync(signalMotionPath),
    true,
    'signal-motion.ts must exist',
  )
  assert.doesNotMatch(signalMotion, /^\s*['"]use client['"];?/mu)
  assert.doesNotMatch(signalMotion, /from ['"]react['"]/u)
})

test('SignalStory is the only signal client boundary and accepts rendered children only', () => {
  assert.equal(
    existsSync(signalStoryPath),
    true,
    'signal-story.tsx must exist',
  )
  assert.match(signalStory, /^'use client'\n/u)

  const propsBody =
    /interface SignalStoryProps\s*\{([\s\S]*?)\}/u.exec(signalStory)?.[1]
  assert.notEqual(propsBody, undefined, 'SignalStoryProps must exist')
  assert.equal(
    propsBody.replaceAll(/\s+/gu, ' ').trim(),
    'readonly children: ReactNode',
  )

  for (const lifecycleImport of [
    'classifySignalPosition',
    'FALLBACK_DURATION_MS',
    'FALLBACK_ROOT_MARGIN',
    'FALLBACK_THRESHOLD',
    'MAX_NATIVE_INSTRUMENT_HEIGHT',
    'REDUCED_MOTION_QUERY',
    'SCROLL_MEDIA_QUERY',
    'selectSignalMotion',
    'shouldLatchScrollLayout',
    'SignalMotionLayout',
    'SignalMotionState',
  ]) {
    assert.equal(
      signalStory.includes(lifecycleImport),
      true,
      `SignalStory must import and use ${lifecycleImport}`,
    )
  }
  assert.match(signalStory, /from '\.\/signal-motion'/u)

  for (const forbiddenImport of [
    '@glucoseiq/',
    'glucose-signal-figure',
    'glucose-trace',
    'glucose-profile',
  ]) {
    assert.equal(
      `${signalMotion}\n${signalStory}`.includes(forbiddenImport),
      false,
      `client lifecycle must not import ${forbiddenImport}`,
    )
  }
})

test('SignalStory renders the complete flow state before hydration', () => {
  assert.match(signalStory, /data-motion-layout="flow"/u)
  assert.match(signalStory, /data-motion-state="idle"/u)
  assert.match(signalStory, /data-motion-sticky="enabled"/u)
  assert.match(
    signalStory,
    /data-motion-part="completion-sentinel"/u,
  )
  assert.match(signalStory, /\{children\}/u)

  assert.match(
    signalMotion,
    /export type SignalMotionLayout = 'scroll' \| 'flow'/u,
  )
  assert.match(
    signalMotion,
    /export type SignalMotionState =\s*\| 'idle'\s*\| 'armed'\s*\| 'revealing'\s*\| 'latched'/u,
  )
  assert.match(
    signalStory,
    /type SignalMotionSticky = 'enabled' \| 'disabled'/u,
  )
})

test('capability selection measures the approved viewport, motion, CSS, and height gates', () => {
  assert.match(
    signalMotion,
    /\(min-width: 900px\) and \(min-height: 720px\)/u,
  )
  assert.match(signalMotion, /prefers-reduced-motion: no-preference/u)
  assert.match(signalMotion, /prefers-reduced-motion: reduce/u)
  assert.match(
    signalStory,
    /CSS\.supports\(\s*'view-timeline-name: --signal-passage',\s*\)/u,
  )
  assert.match(
    signalStory,
    /CSS\.supports\(\s*'animation-range: contain 0% contain 15%',\s*\)/u,
  )
  assert.match(
    signalStory,
    /viewportEligible:\s*scrollQuery\.matches &&\s*instrument\.offsetHeight <= MAX_NATIVE_INSTRUMENT_HEIGHT/u,
  )
})

test('flow fallback and scroll completion use separate one-shot observers', () => {
  assert.match(
    signalStory,
    /new IntersectionObserver\([\s\S]*?\{\s*threshold: FALLBACK_THRESHOLD,\s*rootMargin: FALLBACK_ROOT_MARGIN,\s*\},\s*\)/u,
  )
  assert.match(
    signalMotion,
    /export const FALLBACK_THRESHOLD = 0\.25/u,
  )
  assert.match(
    signalMotion,
    /export const FALLBACK_ROOT_MARGIN = '0px'/u,
  )
  assert.match(
    signalStory,
    /querySelector<HTMLElement>\(\s*'\[data-motion-part="completion-sentinel"\]',\s*\)/u,
  )
  assert.match(
    signalStory,
    /completionObserver = new IntersectionObserver/u,
  )
  assert.match(signalStory, /triggerObserver\?\.disconnect\(\)/u)
  assert.match(
    signalStory,
    /window\.setTimeout\([\s\S]*?FALLBACK_DURATION_MS/u,
  )
})

test('restoration and capability changes latch without switching the visit layout', () => {
  assert.match(signalStory, /event\.persisted/u)
  assert.match(
    signalStory,
    /shouldLatchScrollLayout\(\{\s*layout,\s*viewportEligible: scrollQuery\.matches,\s*instrumentHeight: instrument\.offsetHeight,\s*\}\)/u,
  )
  assert.match(
    signalStory,
    /reducedMotionQuery\.addEventListener\(\s*'change',\s*onReducedMotionChange,\s*\)/u,
  )
  assert.match(
    signalStory,
    /scrollQuery\.addEventListener\('change', onViewportChange\)/u,
  )
  assert.match(
    signalStory,
    /window\.addEventListener\('pageshow', onPageShow\)/u,
  )
  assert.match(
    signalStory,
    /window\.addEventListener\('resize', onViewportChange\)/u,
  )
  assert.match(
    signalStory,
    /window\.addEventListener\('orientationchange', onViewportChange\)/u,
  )
})

test('controller cleanup is complete and guards Strict Mode teardown', () => {
  assert.match(signalStory, /let active = true/u)
  assert.match(signalStory, /if \(!active\) \{\s*return\s*\}/u)
  assert.match(signalStory, /active = false/u)

  assert.match(
    signalStory,
    /reducedMotionQuery\.removeEventListener\(\s*'change',\s*onReducedMotionChange,\s*\)/u,
  )
  assert.match(
    signalStory,
    /scrollQuery\.removeEventListener\('change', onViewportChange\)/u,
  )
  assert.match(
    signalStory,
    /window\.removeEventListener\('pageshow', onPageShow\)/u,
  )
  assert.match(
    signalStory,
    /window\.removeEventListener\('resize', onViewportChange\)/u,
  )
  assert.match(
    signalStory,
    /window\.removeEventListener\(\s*'orientationchange',\s*onViewportChange,\s*\)/u,
  )
  assert.match(signalStory, /triggerObserver\?\.disconnect\(\)/u)
  assert.match(signalStory, /completionObserver\?\.disconnect\(\)/u)
  assert.match(signalStory, /window\.clearTimeout\(fallbackTimer\)/u)

  assert.doesNotMatch(signalStory, /requestAnimationFrame/u)
  assert.doesNotMatch(signalStory, /addEventListener\('scroll'/u)
  assert.doesNotMatch(signalStory, /\bwheel\b/u)
  assert.doesNotMatch(signalStory, /\btouchstart\b/u)
  assert.doesNotMatch(signalStory, /\btouchmove\b/u)
})

test('the server homepage passes one complete figure through SignalStory', () => {
  assert.match(page, /import \{ SignalStory \} from '\.\/signal-story'/u)
  assert.match(
    page,
    /<SignalStory>\s*<GlucoseSignalFigure\s+currentReading=\{displayedReading\}\s+currentTrend=\{displayedTrend\}\s+cv=\{report\.cv\}\s+gmi=\{report\.gmi\}\s+meanGlucose=\{report\.meanGlucose\}\s+readings=\{readings\}\s+timeInRange=\{timeInRange\}\s+timeZone=\{completeProfile\.timeZone\}\s+totalReadings=\{report\.dataSufficiency\.totalReadings\}\s*\/>\s*<\/SignalStory>/u,
  )
  assert.equal(
    (page.match(/<SignalStory>/gu) ?? []).length,
    1,
    'homepage must render one SignalStory boundary',
  )
  assert.doesNotMatch(signalStory, /\b(?:currentReading|currentTrend|cv|gmi|meanGlucose|readings|timeInRange|timeZone|totalReadings)\b/u)
})
