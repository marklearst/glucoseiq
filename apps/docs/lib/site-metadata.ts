import type { Metadata, MetadataRoute } from 'next'

export const SITE_NAME = 'GlucoseIQ'
export const SITE_ORIGIN = 'https://glucoseiq.health'
export const SITE_TITLE = 'GlucoseIQ | TypeScript tools for CGM analytics'
export const SITE_DESCRIPTION =
  'TypeScript packages for analyzing CGM data and rendering charts, with no runtime dependencies in the core package.'

interface PageMetadataOptions {
  readonly title: string
  readonly description?: string
  readonly pathname: string
  readonly absoluteTitle?: boolean
}

interface SitemapPage {
  readonly url: string
}

/** Returns an apex-domain URL while preserving only the supplied URL's path and query. */
export function canonicalUrl(value: string): string {
  const parsed = new URL(value || '/', `${SITE_ORIGIN}/`)
  return new URL(`${parsed.pathname}${parsed.search}`, `${SITE_ORIGIN}/`).toString()
}

function indexingMetadata(
  vercelEnvironment: string | undefined
): NonNullable<Metadata['robots']> {
  const index = vercelEnvironment === 'production'
  return { index, follow: index }
}

export function createRootMetadata(
  vercelEnvironment: string | undefined = process.env.VERCEL_ENV
): Metadata {
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: {
      default: SITE_TITLE,
      template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    alternates: { canonical: canonicalUrl('/') },
    robots: indexingMetadata(vercelEnvironment),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      url: canonicalUrl('/'),
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
    },
  }
}

export function createPageMetadata({
  title,
  description,
  pathname,
  absoluteTitle = false,
}: PageMetadataOptions): Metadata {
  const url = canonicalUrl(pathname)
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      url,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export function createRobots(
  vercelEnvironment: string | undefined = process.env.VERCEL_ENV
): MetadataRoute.Robots {
  if (vercelEnvironment !== 'production') {
    return { rules: { userAgent: '*', disallow: '/' } }
  }

  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: canonicalUrl('/sitemap.xml'),
    host: SITE_ORIGIN,
  }
}

export function createSitemap(
  pages: Iterable<SitemapPage>
): MetadataRoute.Sitemap {
  const urls = new Set<string>([canonicalUrl('/')])
  for (const page of pages) urls.add(canonicalUrl(page.url))

  return [...urls]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((url) => ({ url }))
}
