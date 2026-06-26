'use client'

/**
 * @glucoseiq/react provides React hooks and components for the GlucoseIQ
 * engine.
 *
 * Hooks memoize the pure @glucoseiq/core functions; components wrap the
 * zero-dependency SVG renderers. React is a peer dependency and
 * @glucoseiq/core is a runtime dependency.
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
