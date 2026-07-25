/**
 * @file src/connectors/index.ts
 *
 * CGM vendor data normalization adapters.
 * Pure transformation helpers that map vendor payloads into the shared
 * `NormalizedCGMReading` type for reading-based analytics.
 */

export * from './types'
export * from './dexcom'
export * from './libre'
export * from './nightscout'
export * from './capabilities'
export * from './safe'
