import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifySignalPosition,
  FALLBACK_DURATION_MS,
  FALLBACK_ROOT_MARGIN,
  FALLBACK_THRESHOLD,
  MAX_NATIVE_INSTRUMENT_HEIGHT,
  REDUCED_MOTION_QUERY,
  SCROLL_MEDIA_QUERY,
  selectSignalMotion,
  shouldLatchScrollLayout,
} from '../app/(home)/signal-motion.ts'

const positions = ['below', 'visible', 'above']
const booleans = [false, true]

test('reduced motion always renders the complete latched flow', () => {
  for (const viewportEligible of booleans) {
    for (const supportsViewTimeline of booleans) {
      for (const supportsAnimationRange of booleans) {
        for (const position of positions) {
          assert.deepEqual(
            selectSignalMotion({
              reducedMotion: true,
              viewportEligible,
              supportsViewTimeline,
              supportsAnimationRange,
              position,
            }),
            { layout: 'flow', state: 'latched' },
          )
        }
      }
    }
  }
})

test('an eligible native environment reveals only while the instrument is below', () => {
  const environment = {
    reducedMotion: false,
    viewportEligible: true,
    supportsViewTimeline: true,
    supportsAnimationRange: true,
  }

  assert.deepEqual(
    selectSignalMotion({ ...environment, position: 'below' }),
    { layout: 'scroll', state: 'revealing' },
  )

  for (const position of ['visible', 'above']) {
    assert.deepEqual(
      selectSignalMotion({ ...environment, position }),
      { layout: 'scroll', state: 'latched' },
    )
  }
})

test('an ineligible viewport arms only a below-viewport flow', () => {
  for (const supportsViewTimeline of booleans) {
    for (const supportsAnimationRange of booleans) {
      const environment = {
        reducedMotion: false,
        viewportEligible: false,
        supportsViewTimeline,
        supportsAnimationRange,
      }

      assert.deepEqual(
        selectSignalMotion({ ...environment, position: 'below' }),
        { layout: 'flow', state: 'armed' },
      )

      for (const position of ['visible', 'above']) {
        assert.deepEqual(
          selectSignalMotion({ ...environment, position }),
          { layout: 'flow', state: 'latched' },
        )
      }
    }
  }
})

test('each missing CSS feature independently rejects native motion', () => {
  for (const [supportsViewTimeline, supportsAnimationRange] of [
    [false, false],
    [false, true],
    [true, false],
  ]) {
    const environment = {
      reducedMotion: false,
      viewportEligible: true,
      supportsViewTimeline,
      supportsAnimationRange,
    }

    assert.deepEqual(
      selectSignalMotion({ ...environment, position: 'below' }),
      { layout: 'flow', state: 'armed' },
    )

    for (const position of ['visible', 'above']) {
      assert.deepEqual(
        selectSignalMotion({ ...environment, position }),
        { layout: 'flow', state: 'latched' },
      )
    }
  }
})

test('initial native eligibility includes the settled instrument height limit', () => {
  const mediaEligible = true
  const selectAtHeight = (instrumentHeight) =>
    selectSignalMotion({
      reducedMotion: false,
      viewportEligible:
        mediaEligible &&
        instrumentHeight <= MAX_NATIVE_INSTRUMENT_HEIGHT,
      supportsViewTimeline: true,
      supportsAnimationRange: true,
      position: 'below',
    })

  assert.deepEqual(selectAtHeight(616), {
    layout: 'scroll',
    state: 'revealing',
  })
  assert.deepEqual(selectAtHeight(617), {
    layout: 'flow',
    state: 'armed',
  })
})

test('position classification keeps exact offscreen boundaries out of view', () => {
  assert.equal(
    classifySignalPosition({ top: 720, bottom: 900 }, 720),
    'below',
  )
  assert.equal(
    classifySignalPosition({ top: 721, bottom: 901 }, 720),
    'below',
  )
  assert.equal(
    classifySignalPosition({ top: -200, bottom: 0 }, 720),
    'above',
  )
  assert.equal(
    classifySignalPosition({ top: -201, bottom: -1 }, 720),
    'above',
  )

  for (const rect of [
    { top: 719, bottom: 900 },
    { top: -200, bottom: 1 },
    { top: 0, bottom: 720 },
  ]) {
    assert.equal(classifySignalPosition(rect, 720), 'visible')
  }
})

test('a selected scroll layout latches when its viewport or fit gate later fails', () => {
  assert.equal(
    shouldLatchScrollLayout({
      layout: 'scroll',
      viewportEligible: false,
      instrumentHeight: 616,
    }),
    true,
  )
  assert.equal(
    shouldLatchScrollLayout({
      layout: 'scroll',
      viewportEligible: true,
      instrumentHeight: 617,
    }),
    true,
  )
  assert.equal(
    shouldLatchScrollLayout({
      layout: 'scroll',
      viewportEligible: true,
      instrumentHeight: 616,
    }),
    false,
  )
  assert.equal(
    shouldLatchScrollLayout({
      layout: 'flow',
      viewportEligible: false,
      instrumentHeight: 617,
    }),
    false,
  )
})

test('motion capability and fallback constants match the approved contract', () => {
  assert.equal(
    SCROLL_MEDIA_QUERY,
    '(min-width: 900px) and (min-height: 720px) and ' +
      '(prefers-reduced-motion: no-preference)',
  )
  assert.equal(
    REDUCED_MOTION_QUERY,
    '(prefers-reduced-motion: reduce)',
  )
  assert.equal(FALLBACK_THRESHOLD, 0.25)
  assert.equal(FALLBACK_ROOT_MARGIN, '0px')
  assert.equal(FALLBACK_DURATION_MS, 1100)
  assert.equal(MAX_NATIVE_INSTRUMENT_HEIGHT, 616)
})
