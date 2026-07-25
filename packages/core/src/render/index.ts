/**
 * Zero-dependency SVG-string renderers. Each returns a self-contained SVG
 * string for server or browser embedding. Email, PDF, README, native, and
 * watch hosts require host-specific embedding, conversion, or integration.
 */

export { agpChartToSVG, type AGPChartOptions } from './agp-svg'
export { tirBarToSVG, type TIRBarOptions } from './tir-bar'
export { trendTileToSVG, type TrendTileOptions } from './trend-tile'
