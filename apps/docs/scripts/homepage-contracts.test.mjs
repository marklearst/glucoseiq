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
const signalFigurePath = join(
  docsRoot,
  'app/(home)/glucose-signal-figure.tsx',
)
const signalStylesPath = join(
  docsRoot,
  'app/(home)/glucose-signal.module.css',
)
const installerPath = join(docsRoot, 'components/install-command.tsx')
const installerStylesPath = join(
  docsRoot,
  'components/install-command.module.css',
)
const gettingStartedPath = join(docsRoot, 'content/docs/index.mdx')
const stylesPath = join(docsRoot, 'app/(home)/home.module.css')
const globalStylesPath = join(docsRoot, 'app/global.css')
const layoutPath = join(docsRoot, 'app/(home)/layout.tsx')
const logoPath = join(docsRoot, 'lib/logo.tsx')
const page = readFileSync(pagePath, 'utf8')
const highlightedCode = existsSync(highlightedCodePath)
  ? readFileSync(highlightedCodePath, 'utf8')
  : ''
const glucoseTrace = existsSync(glucoseTracePath)
  ? readFileSync(glucoseTracePath, 'utf8')
  : ''
const signalFigure = existsSync(signalFigurePath)
  ? readFileSync(signalFigurePath, 'utf8')
  : ''
const signalStyles = existsSync(signalStylesPath)
  ? readFileSync(signalStylesPath, 'utf8')
  : ''
const installer = existsSync(installerPath)
  ? readFileSync(installerPath, 'utf8')
  : ''
const installerStyles = existsSync(installerStylesPath)
  ? readFileSync(installerStylesPath, 'utf8')
  : ''
const gettingStarted = readFileSync(gettingStartedPath, 'utf8')
const styles = readFileSync(stylesPath, 'utf8')
const globalStyles = readFileSync(globalStylesPath, 'utf8')
const layout = readFileSync(layoutPath, 'utf8')
const logo = readFileSync(logoPath, 'utf8')

test('docs prose links use a quiet underline until hover or focus', () => {
  assert.match(
    globalStyles,
    /--giq-link-underline:\s*color-mix\(\s*in srgb,\s*var\(--color-fd-primary\) 58%,\s*transparent\s*\);/u,
  )
  assert.match(
    globalStyles,
    /#nd-page\s+\.prose\s+:where\(a:not\(\[data-card\]\)\):not\([\s\S]*?\)\s*\{[\s\S]*?text-decoration-color:\s*var\(--giq-link-underline\);[\s\S]*?text-decoration-thickness:\s*1px;[\s\S]*?text-underline-offset:\s*0\.18em;/u,
  )
  assert.match(
    globalStyles,
    /#nd-page\s+\.prose\s+:where\(a:not\(\[data-card\]\):is\(:hover,\s*:focus-visible\)\):not\([\s\S]*?\)\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?text-decoration-color:\s*var\(--color-fd-primary\);/u,
  )
})

test('docs lockup opts into the drop-only logo variant', () => {
  assert.match(logo, /variant\?: 'full' \| 'drop'/u)
  assert.match(logo, /const showRing = props\.variant !== 'drop'/u)
  assert.match(logo, /<LogoMark size=\{s\} variant="drop" \/>/u)
})

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

test('homepage renders one server-owned Signal Passage instrument', () => {
  assert.match(page, /const currentReading = latestReading\(readings\)/u)
  assert.match(page, /const currentTrend = computeGlucoseTrend\(readings\)/u)
  assert.match(page, /const profile = report\.agpProfile/u)
  assert.match(page, /!profile/u)
  assert.doesNotMatch(page, /^\s*['"]use client['"];?/mu)
  assert.doesNotMatch(signalFigure, /^\s*['"]use client['"];?/mu)
  assert.doesNotMatch(glucoseTrace, /^\s*['"]use client['"];?/mu)
  assert.match(
    page,
    /import \{ GlucoseSignalFigure \} from '\.\/glucose-signal-figure'/u,
  )
  assert.match(page, /<GlucoseSignalFigure/u)
  assert.match(
    page,
    /const displayedTrend = currentTrend\.trend[\s\S]*?<GlucoseSignalFigure\s+currentReading=\{displayedReading\}\s+currentTrend=\{displayedTrend\}\s+cv=\{report\.cv\}\s+gmi=\{report\.gmi\}\s+meanGlucose=\{report\.meanGlucose\}\s+readings=\{readings\}\s+timeInRange=\{timeInRange\}\s+timeZone=\{completeProfile\.timeZone\}\s+totalReadings=\{report\.dataSufficiency\.totalReadings\}\s*\/>/u,
  )
  assert.match(signalFigure, /<GlucoseTrace geometry=\{geometry\} \/>/u)
  assert.match(signalFigure, /<dt>Time in range<\/dt>/u)
  assert.match(signalFigure, /<dt>Mean<\/dt>/u)
  assert.match(signalFigure, /<dt>GMI<\/dt>/u)
  assert.match(signalFigure, /<dt>CV<\/dt>/u)
  assert.equal(
    (signalFigure.match(/Time in range/gu) ?? []).length,
    1,
  )
  assert.match(
    signalFigure,
    /const geometry = createGlucoseTraceGeometry\(\{\s*readings,\s*timeZone,\s*width: PLOT_WIDTH,\s*height: PLOT_HEIGHT,\s*yMin: Y_MIN,\s*yMax: Y_MAX,\s*\}\)/u,
  )
  assert.match(
    signalFigure,
    /<dt>Mean<\/dt>\s*<dd>\{meanGlucose\} mg\/dL<\/dd>/u,
  )
  assert.match(
    signalFigure,
    /<dt>Time in range<\/dt>\s*<dd>\{timeInRange\}%<\/dd>/u,
  )
  assert.match(
    signalFigure,
    /<dt>GMI<\/dt>\s*<dd>\{gmi\}%<\/dd>/u,
  )
  assert.match(
    signalFigure,
    /<dt>CV<\/dt>\s*<dd>\{cv\}%<\/dd>/u,
  )
  assert.match(signalFigure, /data-zone=\{currentZone\}/u)
  assert.match(signalFigure, /className=\{styles\.statusCheck\}/u)
  assert.match(signalFigure, /strokeWidth="1\.5"/u)
  assert.doesNotMatch(signalFigure, /statusDot/u)

  for (const removed of [
    'RANGE_SEGMENTS',
    'rangeRail',
    'rangeLegend',
    'X_GRID_TICKS',
    'traceGlow',
    'feGaussianBlur',
    'traceLatestLabel',
  ]) {
    assert.equal(
      `${page}\n${signalFigure}\n${glucoseTrace}\n${signalStyles}`.includes(removed),
      false,
      `remove ${removed}`,
    )
  }

  assert.match(glucoseTrace, /const THRESHOLDS = \[180, 70\] as const/u)
  const transitionWidth = Number(
    /const transitionWidth = ([\d.]+)/u.exec(glucoseTrace)?.[1],
  )
  assert.equal(Number.isFinite(transitionWidth), true)
  assert.equal(transitionWidth > 0 && transitionWidth <= 2, true)
  assert.equal((glucoseTrace.match(/<title\b/gu) ?? []).length, 1)
  assert.equal((glucoseTrace.match(/<desc\b/gu) ?? []).length, 1)
  assert.match(glucoseTrace, /const id = useId\(\)\.replaceAll\(':', ''\)/u)
  assert.match(
    glucoseTrace,
    /const titleId = `glucose-trace-title-\$\{id\}`/u,
  )
  assert.match(
    glucoseTrace,
    /const descriptionId = `glucose-trace-description-\$\{id\}`/u,
  )
  assert.match(
    glucoseTrace,
    /const traceGradientId = `glucose-trace-gradient-\$\{id\}`/u,
  )
  assert.match(
    glucoseTrace,
    /const traceMaskId = `glucose-trace-mask-\$\{id\}`/u,
  )
  assert.match(
    glucoseTrace,
    /aria-labelledby=\{`\$\{titleId\} \$\{descriptionId\}`\}/u,
  )
  assert.match(glucoseTrace, /<title id=\{titleId\}>/u)
  assert.match(glucoseTrace, /<desc id=\{descriptionId\}>/u)
  assert.equal(
    (glucoseTrace.match(/data-motion-part="trace-mask"/gu) ?? []).length,
    1,
  )
  assert.match(
    glucoseTrace,
    /<rect\s+className=\{styles\.traceMask\}\s+data-motion-part="trace-mask"[\s\S]*?\/>/u,
  )
  assert.match(
    signalStyles,
    /\.traceMask\s*\{[^}]*transform:\s*scaleX\(1\);[^}]*transform-origin:\s*left center;/u,
  )
  assert.equal(
    (glucoseTrace.match(/data-motion-part="latest-point"/gu) ?? []).length,
    1,
  )
  assert.match(
    glucoseTrace,
    /<g transform=\{`translate\(\$\{geometry\.latest\.x\} \$\{geometry\.latest\.y\}\)`\}>/u,
  )
  assert.match(
    glucoseTrace,
    /className=\{styles\.traceLatestPoint\}\s+data-motion-part="latest-point"\s+data-zone=\{geometry\.latest\.zone\}\s*>[\s\S]*?<circle className=\{styles\.traceLatestRing\} r="5" \/>\s*<circle className=\{styles\.traceLatestCore\} r="1\.75" \/>/u,
  )
  assert.doesNotMatch(glucoseTrace, /stroke-dashoffset/u)

  const motionSources = `${signalFigure}\n${glucoseTrace}`
  for (const part of [
    'instrument',
    'target-field',
    'thresholds',
    'trace-mask',
    'latest-reading',
    'latest-point',
    'metrics',
    'caption',
  ]) {
    assert.equal(
      (motionSources.match(new RegExp(`data-motion-part="${part}"`, 'gu')) ??
        []).length,
      1,
      `render ${part} exactly once`,
    )
  }

  assert.match(
    signalStyles,
    /\.traceTarget\s*\{[^}]*fill:\s*rgb\(48 209 88 \/ 5%\);/u,
  )
  assert.match(
    signalStyles,
    /\.traceThreshold\s*\{[^}]*stroke:\s*rgb\(48 209 88 \/ 24%\);/u,
  )
  assert.doesNotMatch(
    signalStyles,
    /\.traceTarget\s*\{[^}]*\bopacity:\s*0\.05;/u,
  )

  assert.match(
    glucoseTrace,
    /Latest 24 hours from a synthetic 14-day glucose report\./u,
  )
  assert.match(glucoseTrace, /observed range is \{geometry\.observedRange\.min\} to\{' '\}\s*\{geometry\.observedRange\.max\} milligrams per deciliter/u)
  assert.match(
    glucoseTrace,
    /target\s*range is 70 to 180 milligrams per deciliter/u,
  )
  assert.match(
    glucoseTrace,
    /Three high excursions\s*rise above the target range\./u,
  )
  assert.match(glucoseTrace, /latest reading is\{' '\}\s*\{geometry\.latest\.value\} milligrams per deciliter/u)
  assert.match(glucoseTrace, /Synthetic data;\s*not clinically representative\./u)

  assert.match(
    signalFigure,
    /\{totalReadings\.toLocaleString\('en-US'\)\} readings\. Synthetic\s*14-day report with its latest 24-hour trace\./u,
  )
  assert.match(
    signalFigure,
    /Synthetic data\. Not clinically representative\./u,
  )
  assert.doesNotMatch(page, /dataSufficiency\.meetsCGMStandard/u)

  assert.match(glucoseTrace, /height=\{geometry\.height\}/u)
  assert.match(glucoseTrace, /width=\{geometry\.width\}/u)
  assert.match(
    glucoseTrace,
    /viewBox=\{`0 0 \$\{geometry\.width\} \$\{geometry\.height\}`\}/u,
  )
  assert.match(glucoseTrace, /geometry\.tracePaths\.map/u)
  assert.match(glucoseTrace, /geometry\.isolatedTracePoints\.map/u)
  assert.match(glucoseTrace, /geometry\.timeLabels\.map/u)
  assert.match(
    glucoseTrace,
    /<g mask=\{`url\(#\$\{traceMaskId\}\)`\}>[\s\S]*?geometry\.tracePaths\.map[\s\S]*?geometry\.isolatedTracePoints\.map[\s\S]*?<\/g>/u,
  )
  assert.doesNotMatch(glucoseTrace, /createGlucoseTraceGeometry/u)
  assert.doesNotMatch(glucoseTrace, /GlucoseReading/u)

  assert.match(
    signalStyles,
    /\.signalInstrument\s*\{[^}]*width:\s*calc\(100% - var\(--home-gutter\) - var\(--home-gutter\)\);[^}]*max-width:\s*var\(--home-content-width\);[^}]*margin:\s*0 auto;[^}]*overflow:\s*hidden;[^}]*border:\s*1px solid rgb\(255 255 255 \/ 10%\);[^}]*border-radius:\s*24px;[^}]*background:\s*#0e0e10;[^}]*color:\s*var\(--home-ink\);[^}]*font-variant-numeric:\s*tabular-nums;/u,
  )
  assert.match(
    signalStyles,
    /\.traceLine\s*\{[^}]*stroke-linecap:\s*round;[^}]*stroke-linejoin:\s*round;[^}]*stroke-width:\s*2\.15;/u,
  )
  assert.match(
    signalStyles,
    /\.tracePlot\s*\{[^}]*height:\s*224px;[^}]*overflow:\s*visible;/u,
  )
  assert.match(
    signalStyles,
    /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.tracePlot,\s*\.traceSvg\s*\{[^}]*height:\s*196px;/u,
  )
  assert.match(
    signalStyles,
    /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.tracePlot,\s*\.traceSvg\s*\{[^}]*height:\s*184px;[\s\S]*?\.traceTimeAxis \[data-minor='true'\]\s*\{[^}]*display:\s*none;/u,
  )
  const nativeKeyframesStart = signalStyles.indexOf(
    '@keyframes signalStageIn',
  )
  const nativeGateStart = signalStyles.indexOf(
    '@media (scripting: enabled)',
  )
  assert.notEqual(
    nativeKeyframesStart,
    -1,
    'native keyframes must follow the complete settled frame',
  )
  assert.equal(
    nativeGateStart > nativeKeyframesStart,
    true,
    'native declarations must follow their keyframes',
  )

  const settledFrameStyles = signalStyles.slice(
    0,
    nativeKeyframesStart,
  )
  const nativeKeyframes = signalStyles.slice(
    nativeKeyframesStart,
    nativeGateStart,
  )
  assert.doesNotMatch(
    settledFrameStyles,
    /\b(?:animation|filter|box-shadow|opacity):\s*(?:0|[^;]+)/u,
  )
  assert.doesNotMatch(
    signalStyles,
    /\b(?:filter|box-shadow)\s*:/u,
  )
  assert.doesNotMatch(signalStyles, /\btransition:\s*all\b/u)
  assert.doesNotMatch(
    nativeKeyframes,
    /\b(?:width|height|min-height|max-height|top|right|bottom|left|inset|margin|padding|gap|grid-template-columns|font-size|border)\s*:/u,
  )
  assert.doesNotMatch(signalStyles, /font-family:[^;]*mono/u)
  assert.doesNotMatch(
    styles,
    /\.(?:signal|range|trace|metric|caption)[\w-]*\s*(?:[,{:]|>)/u,
  )
})

test('homepage metrics reflow into labeled rows at extreme zoom widths', () => {
  assert.match(
    signalStyles,
    /@media \(max-width: 360px\)\s*\{[\s\S]*?\.signalMetrics\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*gap:\s*14px;[^}]*\}[\s\S]*?\.signalMetrics > div\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*align-items:\s*baseline;[^}]*gap:\s*12px;[^}]*\}[\s\S]*?\.signalMetrics dd\s*\{[^}]*margin:\s*0;[^}]*text-align:\s*right;/u,
  )
})

test('homepage keeps scale-sensitive trace annotations outside the stretched geometry layer', () => {
  const geometrySvg = /<svg\s+aria-labelledby=\{`\$\{titleId\} \$\{descriptionId\}`\}[\s\S]*?<\/svg>/u.exec(
    glucoseTrace,
  )?.[0]
  assert.notEqual(geometrySvg, undefined, 'stretched geometry SVG must exist')
  assert.doesNotMatch(geometrySvg, /<text\b/u)
  assert.doesNotMatch(
    geometrySvg,
    /data-motion-part="(?:thresholds|latest-point)"/u,
  )

  assert.match(
    glucoseTrace,
    /<div\s+aria-hidden="true"\s+className=\{styles\.traceThresholdOverlay\}\s+data-motion-part="thresholds"\s*>[\s\S]*?THRESHOLDS\.map[\s\S]*?<line\s+className=\{styles\.traceThreshold\}[\s\S]*?<span className=\{styles\.traceThresholdLabel\}>\s*\{threshold\}\s*<\/span>[\s\S]*?<\/div>/u,
  )
  assert.match(
    glucoseTrace,
    /<svg\s+aria-hidden="true"\s+className=\{styles\.traceLatestMarker\}\s+height="12"\s+style=\{\{[\s\S]*?left: `\$\{\(geometry\.latest\.x \/ geometry\.width\) \* 100\}%`,[\s\S]*?top: `\$\{\(geometry\.latest\.y \/ geometry\.height\) \* 100\}%`,[\s\S]*?\}\}\s+viewBox=\{`\$\{geometry\.latest\.x - 6\} \$\{geometry\.latest\.y - 6\} 12 12`\}\s+width="12"\s*>/u,
  )
  assert.match(
    signalStyles,
    /\.traceThresholdOverlay\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*pointer-events:\s*none;/u,
  )
  assert.match(
    signalStyles,
    /\.traceThresholdLabel\s*\{[^}]*position:\s*absolute;[^}]*right:\s*8px;[^}]*font-size:\s*0\.625rem;[^}]*white-space:\s*nowrap;/u,
  )
  assert.match(
    signalStyles,
    /\.traceLatestMarker\s*\{[^}]*position:\s*absolute;[^}]*width:\s*12px;[^}]*height:\s*12px;[^}]*transform:\s*translate\(-50%, -50%\);/u,
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
  assert.match(
    signalFigure,
    /<figure\s+className=\{styles\.signalInstrument\}\s+data-motion-part="instrument"\s*>/u,
  )
  assert.match(
    signalFigure,
    /<figcaption\s+className=\{styles\.signalCaption\}\s+data-motion-part="caption"\s*>/u,
  )
  assert.match(
    signalFigure,
    /Synthetic\s*14-day report with its latest 24-hour trace\./u,
  )
  assert.match(signalFigure, /mg\/dL/u)
  assert.match(
    signalFigure,
    /Synthetic data\. Not clinically representative\./u,
  )
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
