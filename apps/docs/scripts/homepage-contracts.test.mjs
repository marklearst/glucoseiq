import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (path) => readFileSync(join(docsRoot, path), 'utf8')

const pagePath = join(docsRoot, 'app/(home)/page.tsx')
const page = read('app/(home)/page.tsx')
const styles = read('app/(home)/home.module.css')
const reportSuite = read('app/(home)/glucose-report-suite.tsx')
const reportStyles = read('app/(home)/glucose-report.module.css')
const glucoseTrace = read('app/(home)/glucose-trace.tsx')
const gmiScale = read('app/(home)/gmi-scale.tsx')
const timeInRange = read('app/(home)/time-in-range-distribution.tsx')
const agpProfile = read('app/(home)/agp-profile.tsx')
const highlightedCode = read('app/(home)/highlighted-code.tsx')
const installer = read('components/install-command.tsx')
const installerStyles = read('components/install-command.module.css')
const gettingStarted = read('content/docs/index.mdx')
const globalStyles = read('app/global.css')
const layout = read('app/(home)/layout.tsx')
const logo = read('lib/logo.tsx')

test('docs prose links use a quiet underline until hover or focus', () => {
  assert.match(
    globalStyles,
    /--giq-link-underline:\s*color-mix\(\s*in srgb,\s*var\(--color-fd-primary\) 52%,\s*transparent\s*\);/u,
  )
  assert.match(
    globalStyles,
    /#nd-page\s+\.prose\s+:where\(a:not\(\[data-card\]\)\):not\([\s\S]*?\)\s*\{[\s\S]*?text-decoration-color:\s*var\(--giq-link-underline\);[\s\S]*?text-decoration-thickness:\s*2px;/u,
  )
})

test('docs use the drop-only lockup while the homepage retains the full mark', () => {
  assert.match(logo, /variant\?: 'full' \| 'drop'/u)
  assert.match(logo, /const showRing = props\.variant !== 'drop'/u)
  assert.match(logo, /<LogoMark size=\{s\} variant="drop" \/>/u)
  assert.match(page, /<LogoMark motion size=\{92\} \/>/u)
  assert.match(
    styles,
    /\.heroMark\s*\{[^}]*width:\s*92px;[^}]*height:\s*110px;/u,
  )
})

test('homepage keeps structure and styling in separate server files', () => {
  assert.equal(existsSync(pagePath), true)
  assert.match(page, /import styles from '\.\/home\.module\.css'/u)
  assert.doesNotMatch(page, /<style>/u)
  assert.doesNotMatch(page, /^\s*['"]use client['"];?/mu)
  for (const source of [
    page,
    reportSuite,
    glucoseTrace,
    gmiScale,
    timeInRange,
    agpProfile,
  ]) {
    assert.doesNotMatch(source, /^\s*['"]use client['"];?/mu)
  }
})

test('shared installer offers the same four commands everywhere', () => {
  assert.match(
    installer,
    /from 'fumadocs-ui\/components\/dynamic-codeblock'/u,
  )
  assert.match(installer, /from 'fumadocs-ui\/components\/tabs'/u)

  const options = [
    ...installer.matchAll(
      /\{ label: '([^']+)', command: '([^']+)' \}/gu,
    ),
  ].map(([, label, command]) => ({ label, command }))

  assert.deepEqual(options, [
    { label: 'npm', command: 'npm install @glucoseiq/core' },
    { label: 'pnpm', command: 'pnpm add @glucoseiq/core' },
    { label: 'yarn', command: 'yarn add @glucoseiq/core' },
    { label: 'bun', command: 'bun add @glucoseiq/core' },
  ])

  for (const source of [page, gettingStarted]) {
    assert.match(
      source,
      /import \{ InstallCommand \} from '@\/components\/install-command'/u,
    )
    assert.match(source, /<InstallCommand \/>/u)
  }
})

test('shared installer preserves keyboard focus and 44-pixel controls', () => {
  assert.match(
    installer,
    /<Tabs className=\{styles\.installer\} defaultValue="npm">/u,
  )
  assert.match(installer, /<TabsList aria-label="Package manager">/u)
  assert.match(
    installerStyles,
    /\.installer :global\(\[role='tabpanel'\]:focus-visible\)\s*\{[^}]*outline:\s*2px solid var\(--color-fd-primary\);/u,
  )
  assert.match(
    installerStyles,
    /\.installer :global\(\[role='tab'\]\)\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/u,
  )
  assert.match(
    installerStyles,
    /\.installer :global\(\[role='tabpanel'\] button\)\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/u,
  )
})

test('homepage uses the workspace packages to create its report', () => {
  for (const call of [
    'analyzeGlucose(',
    'computeGlucoseTrend(',
    'generateCGMSeries(',
    'latestReading(',
  ]) {
    assert.equal(page.includes(call), true, `homepage must call ${call}`)
  }
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/u)
  assert.doesNotMatch(page, /dataSufficiency\.meetsCGMStandard/u)
})

test('getting started reports the GMI implied by its example readings', () => {
  const firstReport = gettingStarted.match(
    /## Your first report([\s\S]*?)## Render an SVG without a DOM/u,
  )?.[1]
  assert.ok(firstReport, 'the first report example must remain available')

  const values = [...firstReport.matchAll(/\{ value: (\d+), unit: 'mg\/dL'/gu)]
    .map((match) => Number(match[1]))
  assert.deepEqual(values, [120, 135])

  const documentedGMI = Number(
    firstReport.match(/report\.gmi\s*\/\/ (\d+\.\d):/u)?.[1],
  )
  const meanGlucose = values.reduce((sum, value) => sum + value, 0) / values.length
  const expectedGMI = Math.round((3.31 + 0.02392 * meanGlucose) * 10) / 10

  assert.equal(documentedGMI, expectedGMI)
})

test('homepage renders one four-view report with one shared limitation', () => {
  assert.match(
    page,
    /<GlucoseReportSuite[\s\S]*?totalReadings=\{report\.dataSufficiency\.totalReadings\}[\s\S]*?\/>/u,
  )
  assert.doesNotMatch(page, /ReportEntrance|report-entrance/u)
  for (const view of ['trace', 'gmi', 'tir', 'agp']) {
    const sources = `${reportSuite}\n${gmiScale}\n${timeInRange}\n${agpProfile}`
    assert.equal(
      (sources.match(new RegExp(`data-report-view="${view}"`, 'gu')) ?? [])
        .length,
      1,
      `render ${view} once`,
    )
  }
  assert.match(reportSuite, /<figure[^>]*className=\{styles\.reportFigure\}/u)
  assert.match(reportSuite, /<figcaption className=\{styles\.reportCaption\}>/u)
  assert.equal(
    (
      `${reportSuite}\n${gmiScale}\n${timeInRange}\n${agpProfile}`.match(
        /Synthetic data\. Not clinically representative\./gu,
      ) ?? []
    ).length,
    1,
  )
})

test('report views expose truthful labels and accessible alternatives', () => {
  assert.match(reportSuite, /Latest reading/u)
  assert.match(reportSuite, /Last 24 hours/u)
  assert.match(reportSuite, /Target range/u)
  assert.match(reportSuite, /<div className=\{styles\.reportIntro\}>/u)
  assert.match(
    reportSuite,
    /The same \{days\}-day synthetic fixture drives the latest reading/u,
  )
  assert.match(
    reportSuite,
    /24-hour trace, range distribution, GMI estimate, and daily profile/u,
  )
  assert.match(reportSuite, /className=\{styles\.statusCheck\}/u)
  assert.match(reportSuite, /currentZone === 'normal'/u)
  assert.doesNotMatch(reportSuite, /statusDot/u)

  assert.match(gmiScale, /Glucose management indicator/u)
  assert.match(
    gmiScale,
    /on a display scale from \$\{SCALE_MIN\} percent to \$\{SCALE_MAX\} percent and above/u,
  )
  assert.doesNotMatch(gmiScale, /role="progressbar"/u)

  assert.match(timeInRange, /\{days\} days · Target 70–180 mg\/dL/u)
  assert.match(timeInRange, /Time in range/u)
  assert.match(timeInRange, /metric\.readingCount \/ total/u)
  assert.match(timeInRange, /Of \$\{total\.toLocaleString\('en-US'\)\} synthetic readings/u)

  assert.match(agpProfile, /\{days\}-day percentile profile/u)
  assert.match(agpProfile, /Daily profile/u)
  assert.match(agpProfile, /5th to 95th/u)
  assert.match(agpProfile, /middle 50 percent/u)
  assert.match(agpProfile, /short line marks the median/u)
  assert.match(
    agpProfile,
    /target\s+range[\s\S]*?70 to 180/u,
  )
  assert.match(agpProfile, /preserveAspectRatio="none"/u)
})

test('trace keeps labels crisp while the data geometry scales', () => {
  const geometrySvg =
    /<svg\s+aria-labelledby=\{`\$\{titleId\} \$\{descriptionId\}`\}[\s\S]*?<\/svg>/u.exec(
      glucoseTrace,
    )?.[0]
  assert.notEqual(geometrySvg, undefined)
  assert.doesNotMatch(geometrySvg, /<text\b/u)
  assert.match(
    glucoseTrace,
    /className=\{styles\.traceThresholdOverlay\}[\s\S]*?THRESHOLDS\.map/u,
  )
  assert.match(
    glucoseTrace,
    /className=\{styles\.traceLatestMarker\}[\s\S]*?left: `\$\{\(geometry\.latest\.x \/ geometry\.width\) \* 100\}%`/u,
  )
  assert.match(
    reportStyles,
    /\.traceThresholdOverlay\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*pointer-events:\s*none;/u,
  )
})

test('report layout preserves hierarchy across desktop, tablet, and phone', () => {
  assert.match(
    reportStyles,
    /\.supportDeck\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*3fr\)\s*minmax\(0,\s*4fr\)\s*minmax\(0,\s*5fr\);/u,
  )
  assert.match(
    reportStyles,
    /@media \(max-width: 1100px\)[\s\S]*?\.supportDeck\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*3fr\)\s*minmax\(0,\s*4fr\);/u,
  )
  assert.match(
    reportStyles,
    /@media \(max-width: 620px\)[\s\S]*?\.supportDeck\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/u,
  )
  assert.match(reportStyles, /\.reportPanel\s*\{[^}]*overflow:\s*clip;/u)
  assert.match(reportStyles, /\.supportDeck > \.reportPanel \+ \.reportPanel/u)
  assert.match(
    reportStyles,
    /\.reportFigure\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums;/u,
  )
  assert.doesNotMatch(reportStyles, /font-family:[^;]*mono/u)
})

test('homepage sample reproduces the displayed report', () => {
  const snippetMarker = 'const HOME_REPORT_SNIPPET = `'
  const snippetStart = page.indexOf(snippetMarker)
  assert.notEqual(snippetStart, -1)

  const reportSource = page.slice(0, snippetStart)
  const snippet = /const HOME_REPORT_SNIPPET = `([\s\S]*?)`/u.exec(page)?.[1]
  assert.notEqual(snippet, undefined)

  const fixturePattern =
    /const readings = generateCGMSeries\((\{[\s\S]*?\n\})\)/u
  const reportFixture = fixturePattern.exec(reportSource)?.[1]
  const snippetFixture = fixturePattern.exec(snippet)?.[1]
  assert.notEqual(reportFixture, undefined)
  assert.notEqual(snippetFixture, undefined)
  assert.equal(
    reportFixture.replaceAll(/\s/gu, ''),
    snippetFixture.replaceAll(/\s/gu, ''),
  )

  const execution = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', snippet],
    {
      cwd: docsRoot,
      encoding: 'utf8',
      timeout: 10_000,
    },
  )
  assert.equal(execution.status, 0, execution.stderr)
  assert.deepEqual(JSON.parse(execution.stdout), {
    meanGlucose: 122.8,
    gmi: 6.2,
    cv: 20,
    timeInRange: 97.8,
  })
})

test('homepage code samples use server-rendered syntax highlighting', () => {
  assert.match(
    highlightedCode,
    /from 'fumadocs-ui\/components\/codeblock\.rsc'/u,
  )
  assert.match(highlightedCode, /<ServerCodeBlock/u)
  assert.doesNotMatch(highlightedCode, /^\s*['"]use client['"];?/mu)
  assert.match(
    page,
    /<HighlightedCode[\s\S]*?code=\{HOME_REPORT_SNIPPET\}[\s\S]*?lang="ts"/u,
  )
  assert.match(
    page,
    /<HighlightedCode[\s\S]*?code=\{REPORT_RESULT\}[\s\S]*?lang="json"/u,
  )
  assert.match(page, />Report summary<\/p>/u)
  assert.match(page, /label="Report summary JSON"/u)
})

test('homepage links directly to every public package boundary', () => {
  for (const href of [
    '/docs/api/core',
    '/docs/react',
    '/docs/tokens',
    '/docs/testing',
    '/docs/cli',
  ]) {
    assert.equal(page.includes(`href: '${href}'`), true)
  }
  for (const name of [
    '@glucoseiq/core',
    '@glucoseiq/react',
    '@glucoseiq/tokens',
    '@glucoseiq/testing',
    '@glucoseiq/cli',
  ]) {
    assert.equal(page.includes(name), true)
  }
  assert.match(page, /href="https:\/\/github\.com\/marklearst\/glucoseiq"/u)
})

test('homepage navigation keeps one restrained translucent boundary', () => {
  const shell = /\.homeLayout :global\(#nd-nav\)\s*\{([^}]*)\}/u.exec(
    styles,
  )?.[1]
  const surface =
    /\.homeLayout :global\(#nd-nav > div\)\s*\{([^}]*)\}/u.exec(styles)?.[1]
  assert.notEqual(shell, undefined)
  assert.match(shell, /background:\s*rgb\(10 10 11 \/ 82%\);/u)
  assert.match(shell, /backdrop-filter:\s*blur\(18px\);/u)
  assert.notEqual(surface, undefined)
  assert.match(surface, /background:\s*transparent;/u)
  assert.match(surface, /backdrop-filter:\s*none;/u)
})

test('homepage avoids scroll capture and generic dashboard machinery', () => {
  const source = `${page}\n${styles}\n${reportSuite}\n${reportStyles}`
  for (const forbidden of [
    'IntersectionObserver',
    'requestAnimationFrame',
    'animation-timeline',
    'data-entrance-state',
    'data-motion-part',
    'position: sticky',
    'preventDefault(',
    'GSAP',
    'framer-motion',
    'metricCard',
    'featureGrid',
    'terminalChrome',
  ]) {
    assert.equal(source.includes(forbidden), false, `remove ${forbidden}`)
  }
  assert.doesNotMatch(source, /addEventListener\(['"]scroll['"]/u)
  assert.doesNotMatch(reportStyles, /@keyframes|\banimation\s*:/u)
})

test('homepage preserves focus and safety language with a complete static report', () => {
  assert.match(layout, /<HomeLayout\b/u)
  assert.doesNotMatch(page, /<main\b/u)
  assert.match(page, /Informational use only\. Not medical advice\./u)
  assert.match(styles, /:focus-visible\s*\{/u)
  assert.doesNotMatch(
    reportStyles,
    /reportEntrance|data-entrance-state|prefers-reduced-motion|filter:\s*blur|opacity:\s*0(?:\.0+1)?/u,
  )
  assert.match(
    styles,
    /\.homeLayout :global\(#nd-nav a\),[\s\S]*?min-height:\s*44px;/u,
  )
})

test('hero mark lands before its ring completes one clockwise pass', () => {
  assert.match(logo, /data-logo-part="drop"/u)
  assert.match(logo, /data-logo-part="ring-reveal"/u)
  assert.match(logo, /pathLength="1"/u)
  assert.match(logo, /strokeDasharray="1"/u)
  assert.match(logo, /strokeDashoffset="0"/u)
  assert.match(logo, /transform="rotate\(-90 32 52\)"/u)
  assert.match(logo, /mask=\{props\.motion \? `url\(#\$\{ringRevealId\}\)` : undefined\}/u)
  assert.doesNotMatch(logo, /ring-tip|tipShadow|feDropShadow/u)
  assert.match(
    styles,
    /animation:\s*homeDropLand 360ms ease-out both;/u,
  )
  assert.match(
    styles,
    /animation:\s*homeRingReveal 720ms cubic-bezier\(0\.65,\s*0,\s*0\.35,\s*1\) 360ms both;/u,
  )
  const ringKeyframes = /@keyframes homeRingReveal\s*\{([\s\S]*?)\n\}/u.exec(styles)?.[1]
  const dropKeyframes = /@keyframes homeDropLand\s*\{([\s\S]*?)\n\}/u.exec(styles)?.[1]
  assert.notEqual(ringKeyframes, undefined)
  assert.notEqual(dropKeyframes, undefined)
  assert.match(ringKeyframes, /stroke-dashoffset:\s*1;/u)
  assert.match(ringKeyframes, /stroke-dashoffset:\s*0;/u)
  assert.doesNotMatch(dropKeyframes, /scale|rotate|animation-timing-function/u)
  assert.doesNotMatch(styles, /homeRingTip|rotate\(360deg\)/u)
  assert.match(
    styles,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\[data-logo-part='ring-reveal'\][\s\S]*?animation:\s*none;[\s\S]*?stroke-dashoffset:\s*0;/u,
  )
})

test('hero mark keeps a compact gap below the navigation', () => {
  assert.match(
    styles,
    /\.hero\s*\{[\s\S]*?padding-block:\s*clamp\(88px,\s*calc\(13vw - 8px\),\s*176px\)\s+clamp\(72px,\s*9vw,\s*128px\);/u,
  )
  assert.match(
    styles,
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.hero\s*\{\s*padding-block:\s*80px 72px;/u,
  )
  assert.match(
    styles,
    /@media\s*\(max-width:\s*480px\)[\s\S]*?\.hero\s*\{\s*padding-top:\s*64px;/u,
  )
})
