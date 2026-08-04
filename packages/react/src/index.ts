'use client'

/**
 * @glucoseiq/react exports React hooks and components built on @glucoseiq/core.
 *
 * Hooks use `useMemo` for report, profile, score, meal response, latest
 * reading, and trend results. `useGlucoseLive` recalculates reading age on
 * every render. Components call @glucoseiq/core SVG renderers and place the
 * returned SVG in a wrapper element.
 *
 * React is a peer dependency. @glucoseiq/core is a runtime dependency and has
 * no runtime dependencies of its own.
 */

export {
  useGlucoseAnalysis,
  useAGPProfile,
  useGlucoseIQScore,
  useMealResponse,
  useGlucoseLive,
  type GlucoseLive,
  type GlucoseLiveOptions,
} from './hooks'

export { AgpChart, TirBar, TrendTile, type ChartBaseProps } from './components'
