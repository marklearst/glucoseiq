import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = dirname(dirname(docsRoot))
const metadataModulePath = join(docsRoot, 'lib/site-metadata.ts')

function read(relativePath) {
  const absolutePath = join(repositoryRoot, relativePath)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

async function loadSiteMetadata() {
  assert.equal(
    existsSync(metadataModulePath),
    true,
    'apps/docs/lib/site-metadata.ts must centralize the site contract'
  )
  return import(`${pathToFileURL(metadataModulePath).href}?site-contract`)
}

test('canonical URLs always use the GlucoseIQ apex domain', async () => {
  const { SITE_ORIGIN, canonicalUrl } = await loadSiteMetadata()

  assert.equal(SITE_ORIGIN, 'https://glucoseiq.dev')
  assert.equal(canonicalUrl('/'), 'https://glucoseiq.dev/')
  assert.equal(
    canonicalUrl('/docs/data-quality'),
    'https://glucoseiq.dev/docs/data-quality'
  )
  assert.equal(
    canonicalUrl('/docs/react'),
    'https://glucoseiq.dev/docs/react'
  )
  assert.equal(
    canonicalUrl('https://glucoseiq-git-preview.vercel.app/docs/metrics'),
    'https://glucoseiq.dev/docs/metrics'
  )
})

test('root HTML is indexable only for a production Vercel deployment', async () => {
  const { createRootMetadata } = await loadSiteMetadata()

  const production = createRootMetadata('production')
  assert.equal(production.metadataBase.href, 'https://glucoseiq.dev/')
  assert.equal(production.alternates.canonical, 'https://glucoseiq.dev/')
  assert.deepEqual(production.robots, { index: true, follow: true })

  for (const environment of [undefined, 'preview', 'development']) {
    const metadata = createRootMetadata(environment)
    assert.equal(metadata.metadataBase.href, 'https://glucoseiq.dev/')
    assert.equal(metadata.alternates.canonical, 'https://glucoseiq.dev/')
    assert.deepEqual(metadata.robots, { index: false, follow: false })
  }
})

test('robots disallows previews and advertises the production sitemap', async () => {
  const { createRobots } = await loadSiteMetadata()

  assert.deepEqual(createRobots('preview'), {
    rules: { userAgent: '*', disallow: '/' },
  })
  assert.deepEqual(createRobots(undefined), {
    rules: { userAgent: '*', disallow: '/' },
  })
  assert.deepEqual(createRobots('production'), {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://glucoseiq.dev/sitemap.xml',
    host: 'https://glucoseiq.dev',
  })
})

test('sitemap output is unique, deterministic, canonical, and undated', async () => {
  const { createSitemap } = await loadSiteMetadata()
  const pages = [
    { url: '/docs/metrics' },
    { url: '/docs' },
    { url: '/docs/metrics' },
    { url: 'https://glucoseiq-git-preview.vercel.app/docs/data-quality' },
  ]

  const expected = [
    { url: 'https://glucoseiq.dev/' },
    { url: 'https://glucoseiq.dev/docs' },
    { url: 'https://glucoseiq.dev/docs/data-quality' },
    { url: 'https://glucoseiq.dev/docs/metrics' },
  ]
  assert.deepEqual(createSitemap(pages), expected)
  assert.deepEqual(createSitemap([...pages].reverse()), expected)
  for (const entry of createSitemap(pages)) {
    assert.deepEqual(Object.keys(entry), ['url'])
  }
})

test('page metadata carries its own canonical and social identity', async () => {
  const { createPageMetadata, SITE_DESCRIPTION, SITE_TITLE } =
    await loadSiteMetadata()

  const page = createPageMetadata({
    title: 'Data quality',
    description: 'Validate coverage before rendering analytics.',
    pathname: '/docs/data-quality',
  })
  assert.equal(page.title, 'Data quality')
  assert.equal(
    page.alternates.canonical,
    'https://glucoseiq.dev/docs/data-quality'
  )
  assert.deepEqual(page.openGraph, {
    type: 'website',
    siteName: 'GlucoseIQ',
    title: 'Data quality',
    description: 'Validate coverage before rendering analytics.',
    url: 'https://glucoseiq.dev/docs/data-quality',
  })

  const home = createPageMetadata({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    pathname: '/',
    absoluteTitle: true,
  })
  assert.deepEqual(home.title, { absolute: SITE_TITLE })
  assert.equal(home.openGraph.url, 'https://glucoseiq.dev/')
  assert.deepEqual(home.twitter, {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  })
})

test('Next routes and layouts delegate to the centralized contract', () => {
  const rootLayout = read('apps/docs/app/layout.tsx')
  const homeLayout = read('apps/docs/app/(home)/layout.tsx')
  const docsPage = read('apps/docs/app/docs/[[...slug]]/page.tsx')
  const robotsRoute = read('apps/docs/app/robots.ts')
  const sitemapRoute = read('apps/docs/app/sitemap.ts')

  assert.match(rootLayout, /createRootMetadata\(\)/)
  assert.match(homeLayout, /createPageMetadata\(/)
  assert.match(docsPage, /createPageMetadata\(/)
  assert.match(docsPage, /pathname:\s*page\.url/)
  assert.match(robotsRoute, /createRobots\(\)/)
  assert.match(sitemapRoute, /source\.getPages\(\)/)
  assert.match(sitemapRoute, /createSitemap\(/)
})

test('navigation metadata resolves every slug to a tracked MDX route', () => {
  const trackedFiles = new Set(
    execFileSync(
      'git',
      ['ls-files', '--', 'apps/docs/content/docs'],
      { cwd: repositoryRoot, encoding: 'utf8' }
    )
      .trim()
      .split('\n')
      .filter(Boolean)
  )
  const navigationRoots = [
    {
      metadata: 'apps/docs/content/docs/meta.json',
      directory: 'apps/docs/content/docs',
    },
    {
      metadata: 'apps/docs/content/docs/api/meta.json',
      directory: 'apps/docs/content/docs/api',
    },
  ]

  for (const { metadata, directory } of navigationRoots) {
    const { pages } = JSON.parse(read(metadata))
    assert.ok(Array.isArray(pages), `${metadata} must define a pages array`)

    for (const slug of pages) {
      assert.equal(typeof slug, 'string', `${metadata} slugs must be strings`)
      if (/^---.+---$/u.test(slug)) continue

      const candidates = [
        `${directory}/${slug}.mdx`,
        `${directory}/${slug}/index.mdx`,
      ]
      assert.ok(
        candidates.some((candidate) => trackedFiles.has(candidate)),
        `${metadata} slug ${JSON.stringify(slug)} must resolve to a tracked MDX route`
      )
    }
  }
})

test('site contracts are exposed locally and through the durable docs gate', () => {
  const docsPackage = JSON.parse(read('apps/docs/package.json'))
  const rootPackage = JSON.parse(read('package.json'))

  assert.equal(
    docsPackage.scripts['test:site'],
    'node --test scripts/site-contracts.test.mjs'
  )
  assert.match(rootPackage.scripts['test:docs'], /pnpm --filter docs test:site/)
})
