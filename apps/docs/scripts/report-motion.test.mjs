import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyReportPosition,
  hasPassedReportViewport,
  hasReachedReportIntersection,
  REPORT_ANALYTICS_DELAY_MS,
  REPORT_CAPSULE_DURATION_MS,
  REPORT_CAPSULE_STAGGER_MS,
  REPORT_ENTRANCE_DURATION_MS,
  REPORT_GMI_DURATION_MS,
  REPORT_INTERSECTION_ROOT_MARGIN,
  REPORT_INTERSECTION_THRESHOLD,
  REPORT_SHELL_DURATION_MS,
  REPORT_TIR_DURATION_MS,
  REPORT_TRACE_DELAY_MS,
  REPORT_TRACE_DURATION_MS,
  selectReportEntrance,
} from '../app/(home)/report-motion.ts'

test('report entrance stays complete when motion should not run', () => {
  for (const environment of [
    { reducedMotion: true, hasPlayed: false, position: 'below' },
    { reducedMotion: false, hasPlayed: true, position: 'below' },
    { reducedMotion: false, hasPlayed: false, position: 'visible' },
    { reducedMotion: false, hasPlayed: false, position: 'above' },
  ]) {
    assert.equal(selectReportEntrance(environment), 'complete')
  }
})

test('report entrance arms only before its first below-viewport visit', () => {
  assert.equal(
    selectReportEntrance({
      reducedMotion: false,
      hasPlayed: false,
      position: 'below',
    }),
    'armed',
  )
})

test('report position classification treats viewport boundaries as offscreen', () => {
  assert.equal(
    classifyReportPosition({ top: 720, bottom: 900 }, 720),
    'below',
  )
  assert.equal(
    classifyReportPosition({ top: -200, bottom: 0 }, 720),
    'above',
  )
  assert.equal(
    classifyReportPosition({ top: 719, bottom: 900 }, 720),
    'visible',
  )
})

test('report intersection requires the configured visible ratio', () => {
  assert.equal(
    hasReachedReportIntersection([
      {
        isIntersecting: true,
        intersectionRatio: REPORT_INTERSECTION_THRESHOLD - 0.001,
      },
    ]),
    false,
  )
  assert.equal(
    hasReachedReportIntersection([
      {
        isIntersecting: true,
        intersectionRatio: REPORT_INTERSECTION_THRESHOLD,
      },
    ]),
    true,
  )
  assert.equal(
    hasReachedReportIntersection([
      {
        isIntersecting: false,
        intersectionRatio: 1,
      },
    ]),
    false,
  )
})

test('a report skipped above the viewport completes instead of staying hidden', () => {
  assert.equal(
    hasPassedReportViewport([
      { boundingClientRect: { bottom: -1 } },
    ]),
    true,
  )
  assert.equal(
    hasPassedReportViewport([
      { boundingClientRect: { bottom: 1 } },
    ]),
    false,
  )
})

test('report entrance timing follows one bounded sequence', () => {
  assert.equal(REPORT_INTERSECTION_THRESHOLD, 0.12)
  assert.equal(REPORT_INTERSECTION_ROOT_MARGIN, '0px 0px -8% 0px')
  assert.equal(REPORT_SHELL_DURATION_MS, 420)
  assert.equal(REPORT_TRACE_DELAY_MS, 240)
  assert.equal(REPORT_TRACE_DURATION_MS, 850)
  assert.equal(REPORT_ANALYTICS_DELAY_MS, 720)
  assert.equal(REPORT_GMI_DURATION_MS, 700)
  assert.equal(REPORT_TIR_DURATION_MS, 460)
  assert.equal(REPORT_CAPSULE_DURATION_MS, 420)
  assert.equal(REPORT_CAPSULE_STAGGER_MS, 28)
  assert.equal(REPORT_ENTRANCE_DURATION_MS, 1500)
})
