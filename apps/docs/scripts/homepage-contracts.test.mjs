import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const pagePath = join(docsRoot, 'app/(home)/page.tsx')
const highlightedCodePath = join(
  docsRoot,
  'app/(home)/highlighted-code.tsx',
)
const glucoseTracePath = join(
  docsRoot,
  'app/(home)/glucose-trace.tsx',
)
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
const highlightedCode = existsSync(highlightedCodePath)
  ? readFileSync(highlightedCodePath, 'utf8')
  : ''
const glucoseTrace = existsSync(glucoseTracePath)
  ? readFileSync(glucoseTracePath, 'utf8')
  : ''
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

test('logo mark keeps a finished ring and exposes a clockwise motion path', () => {
  assert.match(logo, /const id = useId\(\)\.replaceAll\(':', ''\)/u)
  assert.match(logo, /id=\{gradientId\}/u)
  assert.match(logo, /fill=\{`url\(#\$\{gradientId\}\)`\}/u)
  assert.match(logo, /data-logo-part="ring"/u)
  assert.match(
    logo,
    /data-logo-part="ring-reveal"[\s\S]*?pathLength="1"[\s\S]*?strokeDasharray="1"[\s\S]*?strokeWidth="8"/u,
  )
  assert.match(logo, /data-logo-part="ring-tip"/u)
  assert.match(logo, /data-logo-part="ring-tip-disc"/u)
  assert.match(logo, /fillRule="evenodd"/u)
  assert.match(logo, /const ringRevealId = `giq-ring-reveal-\$\{id\}`/u)
  assert.match(logo, /<mask[\s\S]*?id=\{ringRevealId\}/u)
  assert.match(logo, /mask=\{props\.motion \? `url\(#\$\{ringRevealId\}\)` : undefined\}/u)
  assert.doesNotMatch(logo, /data-logo-part="ring-echo"/u)
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
    /<Tabs className=\{styles\.installer\} defaultValue="npm">/u,
  )
  assert.match(installer, /<TabsList aria-label="Package manager">/u)
  assert.match(
    installer,
    /<TabsTrigger key=\{label\} value=\{label\}>/u,
  )
  assert.match(
    installer,
    /<TabsContent key=\{label\} value=\{label\}>/u,
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
    /<Tabs className=\{styles\.installer\} defaultValue="npm">/u,
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

test('shared installer aligns the command and copy control in every placement', () => {
  assert.match(
    installerStyles,
    /\.installer :global\(\[role='tabpanel'\] figure > div\[role='region'\]\)\s*\{[^}]*padding-right:\s*64px;[^}]*text-align:\s*left;/u,
  )
  assert.match(
    installerStyles,
    /\.installer :global\(\[role='tabpanel'\] pre\)\s*\{[^}]*min-width:\s*0;[^}]*width:\s*max-content;[^}]*margin:\s*0;/u,
  )
  assert.match(
    installerStyles,
    /\.installer :global\(\[role='tabpanel'\] figure > div:not\(\[role\]\)\)\s*\{[^}]*top:\s*50%;[^}]*transform:\s*translateY\(-50%\);/u,
  )
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
    'computeGlucoseTrend(',
    'generateCGMSeries(',
    'latestReading(',
  ]) {
    assert.equal(page.includes(call), true, `homepage must call ${call}`)
  }

  assert.match(page, /data-doc-snippet="home-report"/u)
  assert.doesNotMatch(page, /agpChartToSVG/u)
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/u)
  assert.doesNotMatch(page, /glucoseIQScore\(/u)
  assert.doesNotMatch(page, /tirBarToSVG\(/u)
})

test('homepage keeps the distribution proof when it adds a glucose trace', () => {
  assert.match(page, /const currentReading = latestReading\(readings\)/u)
  assert.match(page, /const currentTrend = computeGlucoseTrend\(readings\)/u)
  assert.match(page, /const profile = report\.agpProfile/u)
  assert.match(page, /!profile/u)
  assert.match(
    page,
    /import \{ GlucoseTrace \} from '\.\/glucose-trace'/u,
  )
  assert.match(page, /const RANGE_SEGMENTS = \[/u)
  assert.match(page, /className=\{styles\.signalInstrument\}/u)
  assert.match(page, /className=\{styles\.currentReading\}/u)
  assert.match(page, /className=\{styles\.rangeSummary\}/u)
  assert.match(page, /className=\{styles\.rangeRail\}/u)
  assert.match(page, /className=\{styles\.rangeLegend\}/u)
  assert.match(page, /aria-label=\{rangeSummaryLabel\}/u)
  assert.match(
    page,
    /<GlucoseTrace\s+profile=\{completeProfile\}\s+readings=\{readings\}\s*\/>/u,
  )
  assert.match(
    page,
    /className=\{styles\.currentReading\}[\s\S]*?className=\{styles\.readingStatus\}[\s\S]*?className=\{styles\.rangeSummary\}[\s\S]*?<GlucoseTrace\s+profile=\{completeProfile\}\s+readings=\{readings\}\s*\/>[\s\S]*?<figcaption/u,
  )
  assert.match(page, /className=\{styles\.signalMetrics\}/u)
  assert.match(page, /report\.dataSufficiency\.totalReadings/u)
  assert.match(page, /report\.meanGlucose/u)
  assert.match(page, /report\.gmi/u)
  assert.match(page, /report\.cv/u)
  assert.match(page, /data-zone=\{currentZone\}/u)
  assert.match(page, /className=\{styles\.statusCheck\}/u)
  assert.match(page, /strokeWidth="1\.5"/u)
  assert.match(page, /readings/u)
  assert.match(
    page,
    /<dt>Mean · mg\/dL<\/dt>\s*<dd>\{report\.meanGlucose\}<\/dd>/u,
  )
  assert.doesNotMatch(page, /dataSufficiency\.meetsCGMStandard/u)
  assert.doesNotMatch(page, /statusDot/u)
  assert.equal(
    existsSync(glucoseTracePath),
    true,
    'glucose trace component must exist',
  )
  assert.match(
    glucoseTrace,
    /import \{ createGlucoseProfileGeometry \} from '@\/lib\/glucose-profile'/u,
  )
  assert.match(glucoseTrace, /<svg[\s\S]*?role="img"/u)
  assert.match(glucoseTrace, /aria-labelledby=\{`\$\{titleId\} \$\{descriptionId\}`\}/u)
  assert.match(glucoseTrace, /<title id=\{titleId\}>/u)
  assert.match(glucoseTrace, /<desc id=\{descriptionId\}>/u)
  for (const part of ['profile-trace', 'profile-latest']) {
    assert.equal(
      glucoseTrace.includes(`data-profile-part="${part}"`),
      true,
      `trace must expose ${part}`,
    )
  }
  assert.match(glucoseTrace, /geometry\.target\.highY/u)
  assert.match(glucoseTrace, /geometry\.target\.lowY/u)
  assert.match(
    styles,
    /\.signalInstrument\s*\{[^}]*display:\s*grid;[^}]*max-width:\s*var\(--home-content-width\);[^}]*grid-template-columns:\s*minmax\(248px,\s*0\.66fr\)\s+minmax\(0,\s*1\.34fr\);/u,
  )
  assert.match(
    styles,
    /\.rangeRail\s*\{[^}]*display:\s*flex;[^}]*height:\s*10px;/u,
  )
  assert.match(
    styles,
    /\.trace\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*border-top:\s*1px solid var\(--home-line\);/u,
  )
  assert.match(
    styles,
    /\.traceSvg\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*224px;/u,
  )
  assert.match(
    styles,
    /\.traceGraph\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+36px;/u,
  )
  assert.match(
    styles,
    /\.signalMetrics\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/u,
  )
  assert.match(glucoseTrace, /Last 24 hours/u)
  assert.match(glucoseTrace, /geometry\.observedRange\.min/u)
  assert.match(glucoseTrace, /geometry\.observedRange\.max/u)
  assert.match(glucoseTrace, /const Y_AXIS_TICKS = \[/u)
  assert.match(glucoseTrace, /const X_GRID_TICKS = \[/u)
  assert.match(glucoseTrace, /className=\{styles\.traceGridLine\}/u)
  assert.match(glucoseTrace, /className=\{styles\.traceGlow\}/u)
  assert.match(glucoseTrace, /className=\{styles\.traceLatestGuide\}/u)
  assert.match(glucoseTrace, /className=\{styles\.traceLatestLabel\}/u)
  assert.match(glucoseTrace, /Now · \{geometry\.latest\.value\}/u)
  assert.match(glucoseTrace, /geometry\.tracePaths\.map/u)
  assert.match(glucoseTrace, /data-zone=\{geometry\.latest\.zone\}/u)
  assert.doesNotMatch(glucoseTrace, /profileOuterBand/u)
  assert.doesNotMatch(glucoseTrace, /profileInnerBand/u)
  assert.doesNotMatch(glucoseTrace, /profileMedian/u)
  assert.doesNotMatch(styles, /\.readingValue span\s*\{[^}]*font-family:\s*var\(--home-mono\);/u)
  assert.doesNotMatch(styles, /\.rangeHeading > span\s*\{[^}]*font-family:\s*var\(--home-mono\);/u)
  assert.doesNotMatch(styles, /\.rangeLegend\s*\{[^}]*font-family:\s*var\(--home-mono\);/u)
  assert.doesNotMatch(styles, /\.traceTimeAxis\s*\{[^}]*font-family:\s*var\(--home-mono\);/u)
  assert.doesNotMatch(styles, /\.traceYAxis\s*\{[^}]*font-family:\s*var\(--home-mono\);/u)
  assert.doesNotMatch(styles, /\.signalMetrics dd\s*\{[^}]*font-family:\s*var\(--home-mono\);/u)
  assert.match(
    styles,
    /\.readingValue strong\s*\{[^}]*letter-spacing:\s*-0\.04em;/u,
  )
})

test('homepage sample reproduces the displayed report', () => {
  const snippetMarker = 'const HOME_REPORT_SNIPPET = `'
  const snippetStart = page.indexOf(snippetMarker)
  assert.notEqual(
    snippetStart,
    -1,
    'homepage report snippet marker must exist',
  )

  const reportSource = page.slice(0, snippetStart)
  const snippet = /const HOME_REPORT_SNIPPET = `([\s\S]*?)`/u.exec(page)?.[1]
  assert.notEqual(snippet, undefined, 'homepage report snippet must exist')

  assert.match(
    snippet,
    /^import \{ analyzeGlucose \} from '@glucoseiq\/core'\nimport \{ generateCGMSeries \} from '@glucoseiq\/testing'/u,
  )

  const fixturePattern =
    /const readings = generateCGMSeries\((\{[\s\S]*?\n\})\)/u
  const reportFixture = fixturePattern.exec(reportSource)?.[1]
  const snippetFixture = fixturePattern.exec(snippet)?.[1]
  assert.notEqual(reportFixture, undefined, 'homepage fixture must exist')
  assert.notEqual(snippetFixture, undefined, 'snippet fixture must exist')
  assert.equal(
    reportFixture.replaceAll(/\s/gu, ''),
    snippetFixture.replaceAll(/\s/gu, ''),
    'homepage and snippet fixture options must match',
  )

  const reportProjection =
    /const REPORT_RESULT = JSON\.stringify\(\n[ ]{2}(\{[\s\S]*?\n[ ]{2}\}),\n[ ]{2}null,\n[ ]{2}2,\n\)/u.exec(
      reportSource,
    )?.[1]
  const snippetProjection =
    /const result = (\{[\s\S]*?\n[ ]{2}\})/u.exec(snippet)?.[1]
  assert.notEqual(
    reportProjection,
    undefined,
    'displayed report projection must exist',
  )
  assert.notEqual(
    snippetProjection,
    undefined,
    'snippet report projection must exist',
  )
  for (const mapping of [
    'meanGlucose: report.meanGlucose',
    'gmi: report.gmi',
    'cv: report.cv',
  ]) {
    assert.equal(reportProjection.includes(mapping), true)
    assert.equal(snippetProjection.includes(mapping), true)
  }
  assert.match(reportSource, /const timeInRange = report\.timeInRange\.inRange\.percentage/u)
  assert.match(reportProjection, /\btimeInRange,\n/u)
  assert.match(
    snippetProjection,
    /timeInRange: report\.timeInRange\.inRange\.percentage/u,
  )

  assert.match(snippet, /console\.log\(JSON\.stringify\(result, null, 2\)\)/u)
  assert.doesNotMatch(reportSource, /const readings: GlucoseReading\[\]/u)

  const execution = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', snippet],
    {
      cwd: docsRoot,
      encoding: 'utf8',
      timeout: 10_000,
    },
  )
  assert.equal(
    execution.status,
    0,
    execution.stderr || 'homepage snippet execution failed',
  )
  assert.deepEqual(JSON.parse(execution.stdout), {
    meanGlucose: 120,
    gmi: 6,
    cv: 20.1,
    timeInRange: 97,
  })
})

test('homepage report uses server-rendered TypeScript and JSON code blocks', () => {
  assert.equal(
    existsSync(highlightedCodePath),
    true,
    'homepage highlighted-code component must exist',
  )
  assert.match(
    highlightedCode,
    /from 'fumadocs-ui\/components\/codeblock\.rsc'/u,
  )
  assert.match(highlightedCode, /<ServerCodeBlock/u)
  assert.doesNotMatch(highlightedCode, /^\s*['"]use client['"];?/mu)

  assert.match(
    page,
    /<HighlightedCode[\s\S]*?code=\{HOME_REPORT_SNIPPET\}[\s\S]*?lang="ts"[\s\S]*?\/>/u,
  )
  assert.match(
    page,
    /<HighlightedCode[\s\S]*?code=\{REPORT_RESULT\}[\s\S]*?lang="json"[\s\S]*?\/>/u,
  )
  assert.match(page, /const REPORT_RESULT = JSON\.stringify\(/u)
  assert.doesNotMatch(
    page,
    /<pre[^>]*data-doc-snippet="home-report"[^>]*>\s*<code>/u,
  )
})

test('homepage labels projected JSON as a report summary', () => {
  assert.match(
    page,
    /<p className=\{styles\.reportLabel\}>Report summary<\/p>/u,
  )
  assert.match(page, /label="Report summary JSON"/u)
  assert.doesNotMatch(page, />AnalyzeGlucoseResult</u)
  assert.doesNotMatch(page, /label="AnalyzeGlucoseResult JSON"/u)
})

test('homepage code proof keeps copy and focus behavior inside a flat frame', () => {
  assert.match(
    styles,
    /\.reportCodeBlock:global\(\.shiki\)\s*\{[^}]*margin:\s*0;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/u,
  )
  assert.match(
    styles,
    /\.reportCodeViewport\s*\{[^}]*--padding-left:\s*0;[^}]*--padding-right:\s*0;[^}]*padding:\s*0 56px 8px 0;/u,
  )
  assert.match(
    styles,
    /\.reportCodeBlock > :global\(div:not\(\[role\]\) button\)\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/u,
  )
  assert.match(
    styles,
    /\.reportCodeViewport:focus-visible\s*\{[^}]*border-radius:\s*6px;[^}]*outline:\s*2px solid var\(--home-accent\);[^}]*outline-offset:\s*-2px;/u,
  )
  assert.match(
    styles,
    /\.reportCode:focus-within,[\s\S]*?\.reportOutput:focus-within\s*\{[^}]*background:\s*rgb\(255 255 255 \/ 2%\);/u,
  )
  assert.doesNotMatch(styles, /\.reportColumns pre\s*\{/u)
})

test('homepage code proof stacks before the two-column result becomes cramped', () => {
  assert.match(
    styles,
    /@media \(max-width: 860px\)\s*\{[\s\S]*?\.reportColumns\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*\}[\s\S]*?\.reportOutput\s*\{[^}]*border-top:\s*1px solid var\(--home-line\);[^}]*border-left:\s*0;[^}]*padding-left:\s*0;/u,
  )
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
    'terminalChrome',
    'terminalBar',
    'kicker',
    'scroll reveal',
  ]) {
    assert.equal(source.includes(forbidden), false, `remove homepage pattern: ${forbidden}`)
  }

  assert.doesNotMatch(source, /animation-timeline\s*:\s*view\(\)/u)
  assert.doesNotMatch(styles, /--paper:/u)
  assert.doesNotMatch(
    styles,
    /font-family:[^;]*(?:Georgia|Palatino|,\s*serif\b)/u,
  )
})

test('homepage navigation uses one restrained translucent boundary', () => {
  const navigationShell = /\.homeLayout :global\(#nd-nav\)\s*\{([^}]*)\}/u.exec(
    styles,
  )?.[1]
  const navigationSurface =
    /\.homeLayout :global\(#nd-nav > div\)\s*\{([^}]*)\}/u.exec(styles)?.[1]

  assert.notEqual(navigationShell, undefined, 'homepage must own the navigation shell')
  assert.match(navigationShell, /background:\s*rgb\(10 10 11 \/ 82%\);/u)
  assert.match(navigationShell, /border-color:\s*var\(--color-fd-border\);/u)
  assert.match(navigationShell, /backdrop-filter:\s*blur\(18px\);/u)

  assert.notEqual(navigationSurface, undefined, 'homepage must own the navigation surface')
  assert.match(navigationSurface, /background:\s*transparent;/u)
  assert.match(navigationSurface, /border-color:\s*transparent;/u)
  assert.match(navigationSurface, /backdrop-filter:\s*none;/u)

  const atmosphere = /\.home::before\s*\{([^}]*)\}/u.exec(styles)?.[1]
  assert.notEqual(atmosphere, undefined, 'homepage must own the nav atmosphere')
  assert.match(atmosphere, /height:\s*120px;/u)
  assert.match(
    atmosphere,
    /radial-gradient\([^}]*rgb\(255 69 58 \/ 9%\)[^}]*transparent 72%\s*\);/u,
  )
})

test('homepage keeps non-code navigation text out of the mono stack', () => {
  assert.match(
    styles,
    /\.homeLayout :global\(#nd-nav kbd\)\s*\{[^}]*font-family:\s*-apple-system,\s*BlinkMacSystemFont,\s*"SF Pro Display",\s*"Segoe UI",\s*sans-serif;/u,
  )
})

test('homepage states the safety boundary plainly', () => {
  assert.match(page, /Informational use only\. Not medical advice\./u)
})

test('home layout owns the main landmark and page presents a semantic glucose instrument', () => {
  assert.doesNotMatch(page, /<main\b/u)
  assert.match(page, /<div className=\{styles\.home\}>/u)
  assert.match(layout, /<HomeLayout\b/u)
  assert.match(page, /<figure className=\{styles\.signalInstrument\}>/u)
  assert.match(page, /<figcaption className=\{styles\.signalCaption\}>/u)
  assert.match(page, /14 days of synthetic readings · mg\/dL/u)
  assert.match(page, /mg\/dL/u)
  assert.match(page, /Synthetic data\. Not clinically representative\./u)
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

test('hero mark lands before its gradient ring draws clockwise', () => {
  assert.match(logo, /motion\?: boolean/u)
  assert.match(logo, /data-logo-part="drop"/u)
  assert.match(logo, /data-logo-part="ring"/u)
  assert.match(logo, /data-logo-part="ring-reveal"/u)
  assert.match(logo, /data-logo-part="ring-tip"/u)
  assert.match(page, /<LogoMark motion size=\{92\} \/>/u)
  assert.match(
    styles,
    /\.heroMark\s*\{[^}]*width:\s*92px;[^}]*height:\s*110px;/u,
  )
  assert.match(
    styles,
    /\.heroMark svg\s*\{[^}]*display:\s*block;[^}]*overflow:\s*visible;/u,
  )
  assert.match(
    styles,
    /\.heroMark\s+:global\(svg\[data-logo-motion='true'\] \[data-logo-part='drop'\]\)\s*\{[^}]*animation:\s*homeDropSettle 700ms/u,
  )
  assert.match(
    styles,
    /\.heroMark\s+:global\(svg\[data-logo-motion='true'\] \[data-logo-part='ring-reveal'\]\)\s*\{[^}]*stroke-dashoffset:\s*1;[^}]*animation:\s*homeRingReveal 720ms cubic-bezier\(0\.65,\s*0,\s*0\.35,\s*1\) 760ms both;/u,
  )
  assert.match(
    styles,
    /\.heroMark\s+:global\(svg\[data-logo-motion='true'\] \[data-logo-part='ring-tip'\]\)\s*\{[^}]*transform-origin:\s*32px 52px;[^}]*animation:\s*homeRingTip 720ms cubic-bezier\(0\.65,\s*0,\s*0\.35,\s*1\) 760ms both;/u,
  )
  assert.match(
    styles,
    /@keyframes homeDropSettle\s*\{[\s\S]*?0%\s*\{[\s\S]*?translate3d\(0,\s*-520px,\s*0\)[\s\S]*?84%\s*\{[\s\S]*?scaleX\(1\.055\) scaleY\(0\.945\)[\s\S]*?100%\s*\{[\s\S]*?translate3d\(0,\s*0,\s*0\) scale\(1\);/u,
  )
  assert.match(
    styles,
    /@keyframes homeRingReveal\s*\{[\s\S]*?0%\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?stroke-dashoffset:\s*1;[\s\S]*?8%\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?100%\s*\{[\s\S]*?stroke-dashoffset:\s*0;/u,
  )
  assert.match(
    styles,
    /@keyframes homeRingTip\s*\{[\s\S]*?0%\s*\{[\s\S]*?rotate\(0deg\)[\s\S]*?50%\s*\{[\s\S]*?color:\s*#ff6b3d;[\s\S]*?100%\s*\{[\s\S]*?rotate\(360deg\);/u,
  )
  assert.match(
    styles,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\[data-logo-part='drop'\][\s\S]*?\[data-logo-part='ring-reveal'\][\s\S]*?\[data-logo-part='ring-tip'\][\s\S]*?animation:\s*none;[\s\S]*?\[data-logo-part='ring-reveal'\][\s\S]*?stroke-dashoffset:\s*0;/u,
  )
  assert.match(
    styles,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\[data-logo-part='ring-reveal'\][\s\S]*?\[data-logo-part='ring-tip'\][\s\S]*?display:\s*none;/u,
  )
  assert.doesNotMatch(styles, /homeRingLock/u)
  assert.doesNotMatch(styles, /homeRingEcho/u)
  assert.doesNotMatch(styles, /homeProfileBandIn/u)
  assert.doesNotMatch(styles, /will-change:/u)
})
