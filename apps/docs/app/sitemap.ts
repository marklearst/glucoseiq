import type { MetadataRoute } from 'next'
import { source } from '@/lib/source'
import { createSitemap } from '@/lib/site-metadata'

export default function sitemap(): MetadataRoute.Sitemap {
  return createSitemap(source.getPages())
}
