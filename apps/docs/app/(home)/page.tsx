import {
  analyzeGlucose,
  computeGlucoseTrend,
  getGlucoseLabel,
  latestReading,
} from '@glucoseiq/core'
import { generateCGMSeries } from '@glucoseiq/testing'
import { InstallCommand } from '@/components/install-command'
import { LogoMark } from '@/lib/logo'
import { GlucoseTrace } from './glucose-trace'
import { HighlightedCode } from './highlighted-code'
import styles from './home.module.css'
import type { JSX } from 'react'

const readings = generateCGMSeries({
  days: 14,
  seed: 7,
  mealAmplitude: 95,
  noise: 2,
  nocturnalHypoDays: [3, 9],
})

const report = analyzeGlucose(readings)
const currentReading = latestReading(readings)
const currentTrend = computeGlucoseTrend(readings)
const profile = report.agpProfile

if (
  !report.valid ||
  !report.timeInRange ||
  !profile ||
  currentReading === null ||
  currentTrend.trend === 'unknown'
) {
  throw new Error('Homepage fixture did not produce a complete report')
}

const completeProfile = profile
const displayedReading = currentReading
const timeInRange = report.timeInRange.inRange.percentage
const RANGE_SEGMENTS = [
  {
    label: 'Very low',
    range: '<54 mg/dL',
    percentage: report.timeInRange.veryLow.percentage,
    className: styles.rangeVeryLow,
  },
  {
    label: 'Low',
    range: '54–69 mg/dL',
    percentage: report.timeInRange.low.percentage,
    className: styles.rangeLow,
  },
  {
    label: 'In range',
    range: '70–180 mg/dL',
    percentage: timeInRange,
    className: styles.rangeInRange,
  },
  {
    label: 'High',
    range: '181–250 mg/dL',
    percentage: report.timeInRange.high.percentage,
    className: styles.rangeHigh,
  },
  {
    label: 'Very high',
    range: '>250 mg/dL',
    percentage: report.timeInRange.veryHigh.percentage,
    className: styles.rangeVeryHigh,
  },
] as const
const rangeSummaryLabel = RANGE_SEGMENTS.map(
  ({ label, percentage, range }) => `${label} (${range}): ${percentage}%`,
).join(', ')

const TREND_ARROW = {
  rapidRising: '⇈',
  rising: '↑',
  slightlyRising: '↗',
  flat: '→',
  slightlyFalling: '↘',
  falling: '↓',
  rapidFalling: '⇊',
  unknown: '·',
} as const

const TREND_LABEL = {
  rapidRising: 'Rising quickly',
  rising: 'Rising',
  slightlyRising: 'Rising slowly',
  flat: 'Steady',
  slightlyFalling: 'Falling slowly',
  falling: 'Falling',
  rapidFalling: 'Falling quickly',
  unknown: 'Trend unavailable',
} as const

const ZONE_LABEL = {
  low: 'Low',
  normal: 'In range',
  high: 'High',
} as const
const currentZone = getGlucoseLabel(
  displayedReading.value,
  displayedReading.unit,
)
const totalReadings = report.dataSufficiency.totalReadings
const REPORT_RESULT = JSON.stringify(
  {
    meanGlucose: report.meanGlucose,
    gmi: report.gmi,
    cv: report.cv,
    timeInRange,
  },
  null,
  2,
)

const HOME_REPORT_SNIPPET = `import { analyzeGlucose } from '@glucoseiq/core'
import { generateCGMSeries } from '@glucoseiq/testing'

const readings = generateCGMSeries({
  days: 14,
  seed: 7,
  mealAmplitude: 95,
  noise: 2,
  nocturnalHypoDays: [3, 9],
})

const report = analyzeGlucose(readings)

if (report.valid && report.timeInRange) {
  const result = {
    meanGlucose: report.meanGlucose,
    gmi: report.gmi,
    cv: report.cv,
    timeInRange: report.timeInRange.inRange.percentage,
  }

  console.log(JSON.stringify(result, null, 2))
}`

const PACKAGES = [
  {
    name: '@glucoseiq/core',
    href: '/docs/api/core',
    role: 'CGM analysis, normalization, interoperability, and SVG rendering.',
  },
  {
    name: '@glucoseiq/react',
    href: '/docs/react',
    role: 'React hooks and SVG components backed by core.',
  },
  {
    name: '@glucoseiq/tokens',
    href: '/docs/tokens',
    role: 'Glucose-zone colors, labels, trend glyphs, and CSS variables.',
  },
  {
    name: '@glucoseiq/testing',
    href: '/docs/testing',
    role: 'Synthetic CGM fixtures with repeatable seeds.',
  },
  {
    name: '@glucoseiq/cli',
    href: '/docs/cli',
    role: 'CGM CSV analysis with JSON and AGP-style SVG output.',
  },
  {
    name: 'diabetic-utils',
    href: '/docs/migration',
    role: 'diabetic-utils@2 keeps the existing import path while you move to @glucoseiq/core.',
  },
] as const

export default function HomePage(): JSX.Element {
  return (
    <div className={styles.home}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroMark}>
            <LogoMark motion size={92} />
          </div>
          <h1>The data layer for glucose products.</h1>
          <p className={styles.heroBody}>
            GlucoseIQ analyzes CGM readings and returns a typed report with
            metrics and chart-ready output. Use it in your own interface.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="/docs">
              Read the quickstart
            </a>
            <a className={styles.secondaryAction} href="/docs/api">
              Browse the API
            </a>
          </div>
          <div className={styles.installCommand}>
            <InstallCommand />
          </div>
        </header>

        <section className={styles.signalSection} aria-label="Example report">
          <figure className={styles.signalInstrument}>
            <div className={styles.currentReading}>
              <p className={styles.signalLabel}>Latest synthetic reading</p>
              <div className={styles.readingValue}>
                <strong>{displayedReading.value}</strong>
                <span>{displayedReading.unit}</span>
              </div>
              <p className={styles.readingStatus}>
                <span aria-hidden="true" className={styles.trendArrow}>
                  {TREND_ARROW[currentTrend.trend]}
                </span>
                <span>{TREND_LABEL[currentTrend.trend]}</span>
                <svg
                  aria-hidden="true"
                  className={styles.statusCheck}
                  data-zone={currentZone}
                  fill="none"
                  viewBox="0 0 16 16"
                >
                  <path
                    d="m3.25 8.25 3 3 6.5-6.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                </svg>
                <span>{ZONE_LABEL[currentZone]}</span>
              </p>
            </div>

            <div className={styles.rangeSummary}>
              <div className={styles.rangeHeading}>
                <div>
                  <p className={styles.signalLabel}>14-day distribution</p>
                  <p className={styles.rangeResult}>
                    <strong>{timeInRange}%</strong> in 70–180 mg/dL
                  </p>
                </div>
                <span>{totalReadings.toLocaleString('en-US')} readings</span>
              </div>

              <div
                aria-label={rangeSummaryLabel}
                className={styles.rangeRail}
                role="img"
              >
                {RANGE_SEGMENTS.map((segment) => (
                  <span
                    aria-hidden="true"
                    className={segment.className}
                    key={segment.label}
                    style={{
                      flexBasis: `${segment.percentage}%`,
                      flexGrow: segment.percentage,
                      minWidth: segment.percentage > 0 ? 3 : 0,
                    }}
                  />
                ))}
              </div>
              <ul
                aria-label="Glucose range distribution"
                className={styles.rangeLegend}
              >
                {RANGE_SEGMENTS.map((segment) => (
                  <li key={segment.label}>
                    <strong>{segment.percentage}%</strong>
                    <span>{segment.label}</span>
                  </li>
                ))}
              </ul>

              <dl className={styles.signalMetrics}>
                <div>
                  <dt>Time in range</dt>
                  <dd>{timeInRange}%</dd>
                </div>
                <div>
                  <dt>Mean · mg/dL</dt>
                  <dd>{report.meanGlucose}</dd>
                </div>
                <div>
                  <dt>GMI</dt>
                  <dd>{report.gmi}%</dd>
                </div>
                <div>
                  <dt>CV</dt>
                  <dd>{report.cv}%</dd>
                </div>
              </dl>
            </div>

            <GlucoseTrace profile={completeProfile} readings={readings} />

            <figcaption className={styles.signalCaption}>
              <span>14 days of synthetic readings · mg/dL</span>
              <span>Synthetic data. Not clinically representative.</span>
            </figcaption>
          </figure>
        </section>

        <section
          aria-labelledby="report-heading"
          className={styles.reportSection}
        >
          <h2 id="report-heading">Inspect the typed report.</h2>
          <div className={styles.reportColumns}>
            <div
              className={styles.reportCode}
              data-doc-snippet="home-report"
            >
              <p className={styles.reportLabel}>Code used for this report</p>
              <HighlightedCode
                className={styles.reportCodeBlock}
                code={HOME_REPORT_SNIPPET}
                label="TypeScript used for this report"
                lang="ts"
                viewportClassName={styles.reportCodeViewport}
              />
            </div>
            <div className={styles.reportOutput}>
              <p className={styles.reportLabel}>Report summary</p>
              <HighlightedCode
                className={styles.reportCodeBlock}
                code={REPORT_RESULT}
                label="Report summary JSON"
                lang="json"
                viewportClassName={styles.reportCodeViewport}
              />
            </div>
          </div>
          <div className={styles.reportNotes}>
            <p>
              This page runs <code>@glucoseiq/core</code> during the docs build
              with synthetic readings from <code>@glucoseiq/testing</code>.
            </p>
            <p>Synthetic data. Not clinically representative.</p>
          </div>
        </section>

        <section
          aria-label="Product responsibilities"
          className={styles.boundarySection}
        >
          <div className={styles.boundaryStatements}>
            <p>
              <strong>Your application:</strong> credentials, consent,
              transport, and storage
            </p>
            <p>
              <strong>GlucoseIQ:</strong> supported payload normalization and
              analysis
            </p>
          </div>
          <p className={styles.boundarySummary}>
            Use the returned report in the interface you build.
          </p>
        </section>

        <nav
          aria-label="Package documentation"
          className={styles.packagesSection}
        >
          <div className={styles.packagesIntro}>
            <h2>Use the packages your product needs.</h2>
            <p>
              Core handles analysis. React, tokens, test fixtures, and the CLI
              stay in separate packages.
            </p>
          </div>
          <ul className={styles.packageList}>
            {PACKAGES.map((item) => (
              <li key={item.name}>
                <a className={styles.packageLink} href={item.href}>
                  <code>{item.name}</code>
                  <span>{item.role}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-label="Get started" className={styles.closing}>
          <a className={styles.closingLink} href="/docs">
            Read the quickstart
          </a>
          <code className={styles.install}>npm install @glucoseiq/core</code>
          <a
            className={styles.sourceLink}
            href="https://github.com/marklearst/glucoseiq"
          >
            View the source on GitHub
          </a>
        </section>

        <footer className={styles.footer}>
          <p>Informational use only. Not medical advice.</p>
          <p>MIT © Mark Learst</p>
        </footer>
      </div>
    </div>
  )
}
