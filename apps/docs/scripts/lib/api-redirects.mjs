const SUPERSEDED_CORE_API_SLUGS = Object.freeze([
  'agp',
  'cohort',
  'connectors',
  'constants',
  'conversions',
  'episodes',
  'errors',
  'glucose',
  'ingestion',
  'interop',
  'live',
  'meals',
  'render',
  'reports',
  'score',
  'series',
  'time-in-range',
  'types',
  'variability',
])

export function createCoreApiRedirects() {
  return SUPERSEDED_CORE_API_SLUGS.map((slug) => ({
    source: `/docs/api/${slug}`,
    destination: `/docs/api/core/${slug}`,
    permanent: true,
  }))
}
