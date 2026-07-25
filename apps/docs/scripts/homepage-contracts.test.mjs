import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const pagePath = join(docsRoot, 'app/(home)/page.tsx')
const installerPath = join(docsRoot, 'components/install-command.tsx')
const installerStylesPath = join(
  docsRoot,
  'components/install-command.module.css',
)
const gettingStartedPath = join(docsRoot, 'content/docs/index.mdx')
const stylesPath = join(docsRoot, 'app/(home)/home.module.css')
const layoutPath = join(docsRoot, 'app/(home)/layout.tsx')
const logoPath = join(docsRoot, 'lib/logo.tsx')
const page = readFileSync(pagePath, 'utf8')
const installer = existsSync(installerPath)
  ? readFileSync(installerPath, 'utf8')
  : ''
const installerStyles = existsSync(installerStylesPath)
  ? readFileSync(installerStylesPath, 'utf8')
  : ''
const gettingStarted = readFileSync(gettingStartedPath, 'utf8')
const styles = readFileSync(stylesPath, 'utf8')
const layout = readFileSync(layoutPath, 'utf8')
const logo = readFileSync(logoPath, 'utf8')

test('logo mark uses a unique gradient identifier for each render', () => {
  assert.match(logo, /useId\(\)/u)
  assert.match(logo, /id=\{gradientId\}/u)
  assert.match(logo, /stroke=\{`url\(#\$\{gradientId\}\)`\}/u)
})

test('homepage keeps structure and styling in separate files', () => {
  assert.equal(existsSync(stylesPath), true, 'homepage CSS module must exist')
  assert.match(page, /import styles from '\.\/home\.module\.css'/u)
  assert.doesNotMatch(page, /<style>/u)
  assert.doesNotMatch(page, /^\s*['"]use client['"];?/mu)
})

test('shared installer offers four package managers through Fumadocs', () => {
  assert.equal(existsSync(installerPath), true, 'shared installer must exist')
  assert.match(
    installer,
    /from 'fumadocs-ui\/components\/dynamic-codeblock'/u,
  )
  assert.match(installer, /from 'fumadocs-ui\/components\/tabs'/u)

  const installerOptions = [
    ...installer.matchAll(
      /\{ label: '([^']+)', command: '([^']+)' \}/gu,
    ),
  ].map(([, label, command]) => ({ label, command }))

  assert.deepEqual(installerOptions, [
    { label: 'npm', command: 'npm install @glucoseiq/core' },
    { label: 'pnpm', command: 'pnpm add @glucoseiq/core' },
    { label: 'yarn', command: 'yarn add @glucoseiq/core' },
    { label: 'bun', command: 'bun add @glucoseiq/core' },
  ])

  assert.match(
    installer,
    /<Tabs className=\{styles\.installer\} items=\{INSTALLER_LABELS\}>/u,
  )
  assert.match(installer, /<DynamicCodeBlock code=\{command\} lang="bash" \/>/u)
})

test('homepage and getting started render the shared installer', () => {
  for (const source of [page, gettingStarted]) {
    assert.match(
      source,
      /import \{ InstallCommand \} from '@\/components\/install-command'/u,
    )
    assert.match(source, /<InstallCommand \/>/u)
  }
})

test('shared installer tab panels retain a visible keyboard focus indicator', () => {
  assert.match(
    installer,
    /import styles from '\.\/install-command\.module\.css'/u,
  )
  assert.match(
    installer,
    /<Tabs className=\{styles\.installer\} items=\{INSTALLER_LABELS\}>/u,
  )
  assert.match(
    installerStyles,
    /\.installer :global\(\[role='tabpanel'\]:focus-visible\)\s*\{[^}]*outline:\s*2px solid var\(--color-fd-primary\);[^}]*outline-offset:\s*-2px;/u,
  )
})

test('shared installer controls keep 44-pixel hit areas without label coupling', () => {
  assert.match(
    installerStyles,
    /\.installer :global\(\[role='tab'\]\)\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/u,
  )
  assert.match(
    installerStyles,
    /\.installer :global\(\[role='tabpanel'\] button\)\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/u,
  )
  assert.doesNotMatch(installerStyles, /aria-label/u)
})

test('homepage leaves installer interaction styling to Fumadocs', () => {
  assert.doesNotMatch(
    styles,
    /\.installer(?:Tab|Tabs|Panel|Command|Copy|Status)?\b/u,
  )

  const installCommandSelectors = [
    ...styles.matchAll(/([^{}]*\.installCommand[^{}]*)\{/gu),
  ].map(([, selector]) => selector.trim())
  assert.deepEqual(installCommandSelectors, ['.installCommand'])

  const installCommandBlock = styles.match(
    /\.installCommand\s*\{([^}]*)\}/u,
  )
  assert.ok(installCommandBlock, 'installer wrapper styles must exist')

  const installCommandDeclarations = [
    ...installCommandBlock[1].matchAll(/([\w-]+)\s*:\s*([^;]+);/gu),
  ].map(([, property, value]) => [property, value.trim()])
  assert.deepEqual(installCommandDeclarations, [
    ['width', 'min(100%, 540px)'],
    ['margin-top', '8px'],
  ])
})

test('homepage uses the exact dark shell palette in styles and layout', () => {
  for (const value of [
    '#0a0a0b',
    '#f5f5f7',
    '#a1a1a6',
    'rgb(255 255 255 / 11%)',
    '#ff453a',
  ]) {
    assert.equal(styles.includes(value), true, `styles must use ${value}`)
    assert.equal(layout.includes(value), true, `layout must use ${value}`)
  }
})

test('homepage demonstrates output from workspace packages', () => {
  for (const call of [
    'analyzeGlucose(',
    'agpChartToSVG(',
    'generateCGMSeries(',
  ]) {
    assert.equal(page.includes(call), true, `homepage must call ${call}`)
  }

  assert.match(page, /theme:\s*'dark'/u)
  assert.match(page, /data-doc-snippet="home-report"/u)
  assert.doesNotMatch(page, /glucoseIQScore\(/u)
  assert.doesNotMatch(page, /tirBarToSVG\(/u)
  assert.doesNotMatch(page, /computeGlucoseTrend\(/u)
})

test('homepage styles AGP semantics without expanding the renderer API', () => {
  assert.doesNotMatch(page, /includePartAttributes/u)
  assert.match(
    styles,
    /\.signalGraphic :global\(text\)\s*\{[^}]*fill:\s*var\(--home-muted\);/u,
  )
  assert.match(
    styles,
    /\.signalGraphic :global\(\[stroke-dasharray\]\)\s*\{[^}]*stroke:\s*var\(--home-green\);/u,
  )
  assert.match(styles, /\.signalGraphic :global\(polyline\)/u)
  assert.doesNotMatch(styles, /svg > rect:first-child/u)
  assert.doesNotMatch(styles, /rgba\(34,197,94,0\.5\)/u)
  assert.doesNotMatch(styles, /data-glucoseiq-part/u)
})

test('homepage sample reproduces the displayed report', () => {
  assert.match(
    page,
    /const HOME_REPORT_SNIPPET = `import \{ analyzeGlucose \} from '@glucoseiq\/core'\nimport \{ generateCGMSeries \} from '@glucoseiq\/testing'/u,
  )
  assert.match(
    page,
    /const readings = generateCGMSeries\(\{\n[ ]{2}days: 14,\n[ ]{2}seed: 7,\n[ ]{2}mealAmplitude: 95,\n[ ]{2}noise: 10,\n[ ]{2}nocturnalHypoDays: \[3, 9\],\n\}\)/u,
  )
  assert.doesNotMatch(page, /const readings: GlucoseReading\[\]/u)
})

test('homepage offers flat package navigation and direct documentation routes', () => {
  assert.match(page, /href="\/docs"/u)
  assert.match(page, /href="\/docs\/api"/u)
  assert.match(page, /href="https:\/\/github\.com\/marklearst\/glucoseiq"/u)
  assert.match(page, /aria-label="Package documentation"/u)

  for (const href of [
    '/docs/api/core',
    '/docs/react',
    '/docs/tokens',
    '/docs/testing',
    '/docs/cli',
    '/docs/migration',
  ]) {
    assert.equal(
      page.includes(`href: '${href}'`),
      true,
      `package index must include ${href}`,
    )
  }

  assert.match(page, /\{PACKAGES\.map\(\(item\) => \(/u)
  assert.match(
    page,
    /<a\s+className=\{styles\.packageLink\}\s+href=\{item\.href\}>/u,
  )
})

test('homepage keeps package roles and migration support visible', () => {
  for (const packageName of [
    '@glucoseiq/core',
    '@glucoseiq/react',
    '@glucoseiq/tokens',
    '@glucoseiq/testing',
    '@glucoseiq/cli',
    'diabetic-utils',
  ]) {
    assert.equal(page.includes(packageName), true, `homepage must name ${packageName}`)
  }

  assert.match(page, /<code[^>]*>[\s\S]*?npm install @glucoseiq\/core\s*<\/code>/u)
  assert.match(page, /MIT © Mark Learst/u)
})

test('homepage avoids dashboard and landing-page template patterns', () => {
  const source = `${page}\n${styles}`

  for (const forbidden of [
    'paperGrid',
    'dashboard',
    'workbench',
    'workbenchSection',
    'workbenchHeader',
    'workbenchGrid',
    'metricCard',
    'metricPanel',
    'metricList',
    'metricDetail',
    'metricValue',
    'featureGrid',
    'glow',
    'glass',
    'terminalChrome',
    'terminalBar',
    'kicker',
    'scroll reveal',
  ]) {
    assert.equal(source.includes(forbidden), false, `remove homepage pattern: ${forbidden}`)
  }

  assert.doesNotMatch(source, /animation-timeline\s*:\s*view\(\)/u)
  for (const match of source.matchAll(
    /(?:-webkit-)?backdrop-filter:\s*([^;]+);/gu,
  )) {
    assert.equal(match[1]?.trim(), 'none', 'homepage must not use backdrop blur')
  }
  assert.doesNotMatch(
    source,
    /opacity:\s*0[\s\S]{0,200}transform:\s*translate(?:Y|3d)|transform:\s*translate(?:Y|3d)[\s\S]{0,200}opacity:\s*0/u,
  )
  assert.doesNotMatch(styles, /--paper:/u)
  assert.doesNotMatch(styles, /font-family:[^;]*(?:Georgia|Palatino|serif)/u)
})

test('homepage navigation shares the page surface without glass or a separator', () => {
  for (const [name, pattern] of [
    ['navigation shell', /\.homeLayout :global\(#nd-nav\)\s*\{([^}]*)\}/u],
    [
      'navigation surface',
      /\.homeLayout :global\(#nd-nav > div\)\s*\{([^}]*)\}/u,
    ],
  ]) {
    const navigationRule = pattern.exec(styles)?.[1]

    assert.notEqual(navigationRule, undefined, `homepage must own the ${name}`)
    assert.match(navigationRule, /background:\s*#0a0a0b;/u)
    assert.match(navigationRule, /border-color:\s*transparent;/u)
    assert.match(navigationRule, /backdrop-filter:\s*none;/u)
  }
})

test('homepage states the safety boundary plainly', () => {
  assert.match(page, /Informational use only\. Not medical advice\./u)
})

test('home layout owns the main landmark and page presents a semantic dark signal figure', () => {
  assert.doesNotMatch(page, /<main\b/u)
  assert.match(page, /<div className=\{styles\.home\}>/u)
  assert.match(layout, /<HomeLayout\b/u)
  assert.match(page, /<figure className=\{styles\.signalFigure\}>/u)
  assert.match(page, /<figcaption className=\{styles\.signalCaption\}>/u)
  assert.match(page, /14 days of synthetic readings/u)
  assert.match(page, /mg\/dL/u)

  const signalGraphicClass = page.indexOf('className={styles.signalGraphic}')
  assert.notEqual(signalGraphicClass, -1, 'homepage must render the signal graphic')
  const signalGraphicOpen = page.slice(
    page.lastIndexOf('<div', signalGraphicClass),
    page.indexOf('>', signalGraphicClass) + 1,
  )
  assert.match(signalGraphicOpen, /tabIndex=\{0\}/u)
  assert.match(signalGraphicOpen, /role="region"/u)
  assert.match(signalGraphicOpen, /aria-label="Scrollable AGP chart"/u)
})

test('homepage keeps visible focus, 44-pixel navigation, and reduced-motion support', () => {
  assert.match(layout, /className=\{styles\.homeLayout\}/u)
  assert.match(
    styles,
    /\.homeLayout :global\(#nd-nav a\),[\s\S]*?min-height:\s*44px;/u,
  )
  assert.match(
    styles,
    /:focus-visible\s*\{/u,
  )
  assert.match(
    styles,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/u,
  )
})

test('signal content stays visible when animation does not run', () => {
  assert.match(
    styles,
    /\.signalGraphic :global\(polyline\)\s*\{[^}]*stroke-dashoffset:\s*0;/u,
  )
  assert.match(
    styles,
    /@keyframes homeMedianLine\s*\{[\s\S]*?from\s*\{[\s\S]*?stroke-dashoffset:\s*2200;/u,
  )
})
