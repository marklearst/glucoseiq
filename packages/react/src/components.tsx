/**
 * @file src/components.tsx
 *
 * These headless chart components wrap the SVG-string renderers in
 * @glucoseiq/core. Each component inlines the chart SVG inside a wrapper
 * element and passes through className and style. The components do not use a
 * chart library or measure client-side layout.
 */

import { useMemo, type CSSProperties, type JSX } from 'react'
import {
  agpChartToSVG,
  tirBarToSVG,
  trendTileToSVG,
  type GlucoseReading,
  type AGPChartOptions,
  type TIRBarOptions,
  type TrendTileOptions,
} from '@glucoseiq/core'

/** Common props for all chart components. */
export interface ChartBaseProps {
  readonly readings: GlucoseReading[]
  readonly className?: string
  readonly style?: CSSProperties
}

function SvgBox(props: {
  svg: string
  className?: string
  style?: CSSProperties
}): JSX.Element {
  return (
    <div
      className={props.className}
      style={props.style}
      // This private wrapper receives SVG only from @glucoseiq/core renderers.
      // agpChartToSVG XML-escapes its optional title.
      dangerouslySetInnerHTML={{ __html: props.svg }}
    />
  )
}

/** The Ambulatory Glucose Profile chart. */
export function AgpChart(props: ChartBaseProps & { options?: AGPChartOptions }): JSX.Element {
  const svg = useMemo(
    () => agpChartToSVG(props.readings, props.options),
    [props.readings, props.options]
  )
  return <SvgBox svg={svg} className={props.className} style={props.style} />
}

/** The five-zone Time-in-Range stacked bar. */
export function TirBar(props: ChartBaseProps & { options?: TIRBarOptions }): JSX.Element {
  const svg = useMemo(
    () => tirBarToSVG(props.readings, props.options),
    [props.readings, props.options]
  )
  return <SvgBox svg={svg} className={props.className} style={props.style} />
}

/** A current-glucose tile with a value, trend arrow, and zone label. */
export function TrendTile(props: ChartBaseProps & { options?: TrendTileOptions }): JSX.Element {
  const svg = useMemo(
    () => trendTileToSVG(props.readings, props.options),
    [props.readings, props.options]
  )
  return <SvgBox svg={svg} className={props.className} style={props.style} />
}
