import { agpChartToSVG, analyzeGlucose } from '@glucoseiq/core'
import { generateCGMSeries } from '@glucoseiq/testing'
import { InstallCommand } from '@/components/install-command'
import { LogoMark } from '@/lib/logo'
import styles from './home.module.css'
import type { JSX } from 'react'

const readings = generateCGMSeries({
  days: 14,
  seed: 7,
  mealAmplitude: 95,
  noise: 10,
  nocturnalHypoDays: [3, 9],
})

const report = analyzeGlucose(readings)
if (!report.valid || !report.timeInRange) {
  throw new Error('Homepage fixture did not produce a complete report')
}

const signalSvg = agpChartToSVG(readings, {
  width: 1400,
  height: 420,
  theme: 'dark',
  title: 'Fourteen-day AGP profile',
})

const timeInRange = report.timeInRange.inRange.percentage
const REPORT_RESULT = `{
  meanGlucose: ${report.meanGlucose},
  gmi: ${report.gmi},
  cv: ${report.cv},
  timeInRange: ${timeInRange}
}`

const HOME_REPORT_SNIPPET = `import { analyzeGlucose } from '@glucoseiq/core'
import { generateCGMSeries } from '@glucoseiq/testing'

const readings = generateCGMSeries({
  days: 14,
  seed: 7,
  mealAmplitude: 95,
  noise: 10,
  nocturnalHypoDays: [3, 9],
})

const report = analyzeGlucose(readings)

if (report.valid && report.timeInRange) {
  console.log(report.gmi)
  console.log(report.timeInRange.inRange.percentage)
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
            <LogoMark size={56} />
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
          <figure className={styles.signalFigure}>
            <div
              aria-label="Scrollable AGP chart"
              className={styles.signalGraphic}
              dangerouslySetInnerHTML={{ __html: signalSvg }}
              role="region"
              tabIndex={0}
            />
            <figcaption className={styles.signalCaption}>
              <span>14 days of synthetic readings · mg/dL</span>
              <span>
                {timeInRange}% of readings in the 70–180 mg/dL range
              </span>
            </figcaption>
          </figure>
        </section>

        <section
          aria-labelledby="report-heading"
          className={styles.reportSection}
        >
          <h2 id="report-heading">Inspect the typed report.</h2>
          <div className={styles.reportColumns}>
            <div className={styles.reportCode}>
              <p className={styles.reportLabel}>Code used for this report</p>
              <pre data-doc-snippet="home-report" tabIndex={0}>
                <code>{HOME_REPORT_SNIPPET}</code>
              </pre>
            </div>
            <div className={styles.reportOutput}>
              <p className={styles.reportLabel}>AnalyzeGlucoseResult</p>
              <pre tabIndex={0}>
                <code>{REPORT_RESULT}</code>
              </pre>
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
