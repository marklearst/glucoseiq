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
const signalStylesPath = join(
  docsRoot,
  'app/(home)/glucose-signal.module.css',
)
const page = readFileSync(pagePath, 'utf8')
const signalMotion = existsSync(signalMotionPath)
  ? readFileSync(signalMotionPath, 'utf8')
  : ''
const signalStory = existsSync(signalStoryPath)
  ? readFileSync(signalStoryPath, 'utf8')
  : ''
const signalStyles = existsSync(signalStylesPath)
  ? readFileSync(signalStylesPath, 'utf8')
  : ''

function getLeafRules(source) {
  return Array.from(
    source.matchAll(/([^{}]+)\{([^{}]*)\}/gu),
    ([, selector, declarations]) => ({
      selector: selector.trim(),
      declarations,
    }),
  )
}

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

test('native motion owns one named outer-story timeline behind the approved capability gate', () => {
  assert.equal(
    existsSync(signalStylesPath),
    true,
    'glucose-signal.module.css must exist',
  )
  assert.match(
    signalStyles,
    /view-timeline-name:\s*--signal-passage/u,
  )
  assert.match(signalStyles, /view-timeline-axis:\s*block/u)
  assert.match(
    signalStyles,
    /calc\(100svh \+ clamp\(360px, 45svh, 620px\)\)/u,
  )
  assert.match(
    signalStyles,
    /@media \(scripting: enabled\)\s+and \(prefers-reduced-motion: no-preference\)\s+and \(min-width: 900px\)\s+and \(min-height: 720px\)/u,
  )
  assert.match(
    signalStyles,
    /@supports\s+\(view-timeline-name: --signal-passage\)\s+and \(animation-range: contain 0% contain 15%\)/u,
  )

  const timelineOwners = getLeafRules(signalStyles).filter(
    ({ declarations }) =>
      declarations.includes(
        'view-timeline-name: --signal-passage',
      ),
  )
  assert.ok(
    timelineOwners.length >= 2,
    'persistent and prepaint layouts must both establish the timeline',
  )
  for (const { selector } of timelineOwners) {
    assert.match(selector, /\.signalStory/u)
    assert.doesNotMatch(selector, /\.signalSection/u)
  }
})

test('native motion preserves sticky geometry and compositor-only ownership', () => {
  assert.match(
    signalStyles,
    /\.signalStory\s*\{\s*position:\s*relative;/u,
  )
  assert.match(
    signalStyles,
    /\.signalStory\[data-motion-layout='scroll'\]\[data-motion-sticky='enabled'\]\s+\.signalSection\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*56px;[\s\S]*?display:\s*grid;[\s\S]*?min-height:\s*calc\(100svh - 56px\);[\s\S]*?place-items:\s*center;/u,
  )
  assert.match(
    signalStyles,
    /\.completionSentinel\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*0;[\s\S]*?width:\s*1px;[\s\S]*?height:\s*1px;[\s\S]*?pointer-events:\s*none;/u,
  )
  assert.match(
    signalStyles,
    /\.traceTarget,\s*\.traceMask\s*\{[\s\S]*?transform-box:\s*fill-box;[\s\S]*?transform-origin:\s*left center;/u,
  )
  assert.match(
    signalStyles,
    /\.traceLatestPoint\s*\{[\s\S]*?transform-box:\s*fill-box;[\s\S]*?transform-origin:\s*center;/u,
  )

  for (const { selector, declarations } of getLeafRules(
    signalStyles,
  )) {
    const targetsStickyAncestor = selector
      .split(',')
      .some((part) =>
        /(?:^|\s)\.signal(?:Story|Section)(?:\[[^\]]+\])*\s*$/u.test(
          part.trim(),
        ),
      )
    if (targetsStickyAncestor) {
      assert.doesNotMatch(
        declarations,
        /(?:^|;)\s*transform\s*:/u,
        `${selector} must remain untransformed`,
      )
    }
  }

  for (const forbidden of [
    /\bposition:\s*fixed\b/u,
    /\bscroll-snap/u,
    /\bdvh\b/u,
    /\bstroke-dashoffset\s*:/u,
    /\btransition:\s*all\b/u,
    /\bwill-change\s*:/u,
  ]) {
    assert.doesNotMatch(signalStyles, forbidden)
  }
})

test('native eligibility keeps the settled desktop frame inside its 616-pixel fit cap', () => {
  assert.match(
    signalMotion,
    /export const MAX_NATIVE_INSTRUMENT_HEIGHT = 616/u,
  )
  assert.match(
    signalStyles,
    /\.signalHeader\s*\{[\s\S]*?padding:\s*30px 40px 26px;/u,
  )
  assert.match(
    signalStyles,
    /\.trace\s*\{[\s\S]*?padding:\s*16px 40px 12px;/u,
  )
  assert.match(
    signalStyles,
    /\.signalMetrics\s*\{[\s\S]*?padding:\s*21px 40px 23px;/u,
  )
  assert.match(
    signalStyles,
    /\.signalCaption\s*\{[\s\S]*?padding:\s*14px 40px 17px;/u,
  )
  assert.match(signalStyles, /@media \(max-width: 899px\)/u)
  assert.doesNotMatch(signalStyles, /@media \(max-width: 900px\)/u)
})

test('native motion declares every approved beat, range, and easing', () => {
  for (const keyframe of [
    'signalStageIn',
    'signalScaleXIn',
    'signalFadeIn',
    'signalCurrentIn',
    'signalPointIn',
    'signalMetricIn',
    'signalCaptionIn',
  ]) {
    assert.match(
      signalStyles,
      new RegExp(`@keyframes ${keyframe}\\b`, 'u'),
    )
  }

  for (const range of [
    'contain 0% contain 15%',
    'contain 10% contain 28%',
    'contain 22% contain 68%',
    'contain 58% contain 76%',
    'contain 70% contain 82%',
    'contain 72% contain 84%',
    'contain 74% contain 86%',
    'contain 76% contain 88%',
    'contain 88% contain 99%',
  ]) {
    assert.match(
      signalStyles,
      new RegExp(
        `animation-range:\\s*${range}`,
        'u',
      ),
    )
  }

  assert.match(
    signalStyles,
    /cubic-bezier\(0\.16, 1, 0\.3, 1\)/u,
  )
  assert.match(
    signalStyles,
    /cubic-bezier\(0\.65, 0, 0\.35, 1\)/u,
  )
  assert.match(
    signalStyles,
    /\[data-motion-sticky='enabled'\]:not\(\s*\[data-motion-state='latched'\]\s*\)/u,
  )
  assert.match(
    signalStyles,
    /\[data-motion-state='latched'\][\s\S]*?animation-name:\s*none;/u,
  )

  const keyframeSource =
    signalStyles.match(
      /@keyframes signalStageIn[\s\S]*?(?=@media \(scripting: enabled\))/u,
    )?.[0] ?? ''
  assert.doesNotMatch(
    keyframeSource,
    /\b(?:filter|box-shadow|text-shadow)\s*:/u,
  )
})

test('every native animation preserves its named timeline with ordered longhands', () => {
  const nativeRules = getLeafRules(signalStyles).filter(
    ({ declarations }) =>
      declarations.includes(
        'animation-timeline: --signal-passage',
      ),
  )

  assert.equal(
    nativeRules.length,
    11,
    'the instrument, field, thresholds, mask, endpoint, reading, four metrics, and caption each own one native animation',
  )

  for (const { selector, declarations } of nativeRules) {
    const nameIndex = declarations.indexOf('animation-name:')
    const durationIndex = declarations.indexOf(
      'animation-duration:',
    )
    const fillIndex = declarations.indexOf('animation-fill-mode:')
    const easingIndex = declarations.indexOf(
      'animation-timing-function:',
    )
    const timelineIndex = declarations.indexOf(
      'animation-timeline:',
    )
    const rangeIndex = declarations.indexOf('animation-range:')

    assert.ok(nameIndex >= 0, `${selector} needs animation-name`)
    assert.ok(
      durationIndex > nameIndex,
      `${selector} must order duration after name`,
    )
    assert.ok(
      fillIndex > durationIndex,
      `${selector} must order fill mode after duration`,
    )
    assert.ok(
      easingIndex > fillIndex,
      `${selector} must order easing after fill mode`,
    )
    assert.ok(
      timelineIndex > easingIndex,
      `${selector} must declare its timeline after all longhands`,
    )
    assert.ok(
      rangeIndex > timelineIndex,
      `${selector} must declare its range after its timeline`,
    )
    assert.match(declarations, /animation-duration:\s*1ms;/u)
    assert.match(declarations, /animation-fill-mode:\s*both;/u)
    assert.doesNotMatch(
      declarations,
      /(?:^|;)\s*animation\s*:/u,
      `${selector} must not reset its timeline with animation shorthand`,
    )
  }
})
