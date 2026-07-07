import {
  analyzeGlucose,
  computeGlucoseTrend,
  latestReading,
} from '@glucoseiq/core'
import { buildAGPProfile } from '@glucoseiq/core/metrics'
import { generateCGMSeries } from '@glucoseiq/testing'
import { InstallCommand } from '@/components/install-command'
import { LogoMark } from '@/lib/logo'
import { GlucoseReportSuite } from './glucose-report-suite'
import { HighlightedCode } from './highlighted-code'
import { ReportEntrance } from './report-entrance'
import styles from './home.module.css'
import type { JSX } from 'react'

const readings = generateCGMSeries({
  days: 14,
  seed: 7,
  mealAmplitude: 55,
  noise: 2,
  nocturnalHypoDays: [],
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

const dailyProfile = buildAGPProfile(readings, {
  binMinutes: 120,
  method: 'linear',
  percentiles: [5, 25, 50, 75, 95],
  timeZone: profile.timeZone,
})

if (!dailyProfile.valid) {
  throw new Error('Homepage fixture did not produce a daily profile')
}

const completeProfile = dailyProfile
const completeTimeInRange = report.timeInRange
const displayedReading = currentReading
const displayedTrend = currentTrend.trend
const timeInRange = report.timeInRange.inRange.percentage
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
  mealAmplitude: 55,
  noise: 2,
  nocturnalHypoDays: [],
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

        <ReportEntrance>
          <GlucoseReportSuite
            currentReading={displayedReading}
            currentTrend={displayedTrend}
            cv={report.cv}
            days={14}
            gmi={report.gmi}
            meanGlucose={report.meanGlucose}
            profile={completeProfile}
            readings={readings}
            timeInRange={completeTimeInRange}
            totalReadings={report.dataSufficiency.totalReadings}
          />
        </ReportEntrance>

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
