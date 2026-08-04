import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  PACKAGE_README_CONTRACTS,
  createTrackedDocsRoutes,
  createPublicInventory,
  extractDocumentLinks,
  findClaimViolations,
  formatContractDiagnostics,
  mapSiteUrlToTrackedRoute,
  normalizeContractText,
  sortContractDiagnostics,
  validateDocumentLinks,
  validateReadmeContract,
} from './lib/doc-contracts.mjs'
import {
  analyzeSnippetSource,
  assertOwnedTempPath,
  collectCompilerDiagnostics,
  compileSnippets,
  createCompilerProject,
  deriveDeclarationManifest,
  executeCompilerJob,
  extractHomepageSnippet,
  extractSourceExamples,
  extractTypedFences,
  formatDeclarationPrerequisite,
  formatSnippetDiagnostics,
  MANUAL_FRAGMENT_ALLOWLIST,
  parseFenceMetadata,
  planSnippetCompilations,
  reconcileManualFragmentAllowlist,
  resolveDocsToolchain,
  resolveRepositoryRoot,
  runFourWorkerPool,
  sortSnippetDiagnostics,
  validateDeclarationManifest,
} from './lib/doc-snippets.mjs'

const GENERATED_FRAGMENT_REASON = 'generated API declaration or signature'
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const requireFromDocs = createRequire(join(repoRoot, 'apps/docs/package.json'))

function codes(diagnostics) {
  return diagnostics.map((diagnostic) => diagnostic.code)
}

test('shares one frozen, line-stable manual fragment allowlist', () => {
  assert.equal(Object.isFrozen(MANUAL_FRAGMENT_ALLOWLIST), true)
  assert.deepEqual(MANUAL_FRAGMENT_ALLOWLIST, [
    'apps/docs/content/docs/dashboard.mdx:193:imports the GlucoseDashboard component defined earlier in this guide',
    'apps/docs/content/docs/live.mdx:73:imports the mergeReadings helper defined earlier in this guide',
    'apps/docs/content/docs/live.mdx:183:composes tutorial hooks and components defined earlier in this guide',
  ])
})

test('shares one frozen five-package README contract and derives tracked docs routes', () => {
  assert.equal(Object.isFrozen(PACKAGE_README_CONTRACTS), true)
  assert.equal(PACKAGE_README_CONTRACTS.length, 5)
  assert.ok(PACKAGE_README_CONTRACTS.every((contract) => Object.isFrozen(contract)))
  assert.deepEqual(
    PACKAGE_README_CONTRACTS.map(({ packageName, path, guideUrl, apiUrl }) => ({
      packageName,
      path,
      guideUrl,
      apiUrl,
    })),
    [
      {
        packageName: '@glucoseiq/core',
        path: 'packages/core/README.md',
        guideUrl: 'https://glucoseiq.dev/docs/core-concepts',
        apiUrl: 'https://glucoseiq.dev/docs/api/core',
      },
      {
        packageName: '@glucoseiq/react',
        path: 'packages/react/README.md',
        guideUrl: 'https://glucoseiq.dev/docs/react',
        apiUrl: 'https://glucoseiq.dev/docs/api',
      },
      {
        packageName: '@glucoseiq/tokens',
        path: 'packages/tokens/README.md',
        guideUrl: 'https://glucoseiq.dev/docs/tokens',
        apiUrl: 'https://glucoseiq.dev/docs/api',
      },
      {
        packageName: '@glucoseiq/testing',
        path: 'packages/testing/README.md',
        guideUrl: 'https://glucoseiq.dev/docs/testing',
        apiUrl: 'https://glucoseiq.dev/docs/api',
      },
      {
        packageName: '@glucoseiq/cli',
        path: 'packages/cli/README.md',
        guideUrl: 'https://glucoseiq.dev/docs/cli',
        apiUrl: 'https://glucoseiq.dev/docs/api',
      },
    ]
  )

  assert.deepEqual(
    [...createTrackedDocsRoutes({
      narrativeDocs: [
        'apps/docs/content/docs/index.mdx',
        'apps/docs/content/docs/react.mdx',
        'apps/docs/content/docs/nested/index.mdx',
      ],
      managedApi: ['apps/docs/content/docs/api/core/index.mdx'],
    })],
    ['/', '/docs', '/docs/api/core', '/docs/nested', '/docs/react']
  )
})

test('normalizes disguised public claims without erasing meaningful prose', () => {
  assert.equal(
    normalizeContractText(
      '**Clinician&#45;grade** <span>clinical</span>\nreport {/* internal note */}'
    ),
    'Clinician-grade clinical report'
  )
  assert.equal(
    normalizeContractText('Clinical thresholds &amp; clinical systems for research use'),
    'Clinical thresholds & clinical systems for research use'
  )
})

test('finds every forbidden claim family across multiline and markup disguises', () => {
  const diagnostics = findClaimViolations({
    path: 'README.md',
    text: `
      Clinician-\n<strong>grade</strong> clinical report.
      Parses any <em>CGM export</em> with every formula universally normalized.
      Produces realistic clinically representative synthetic data.
      Add @glucoseiq/forecast for predictions.
      Runs anywhere, including direct email, PDF, README, and watch runtimes.
      The palette is colorblind-safe.
    `,
  })

  assert.deepEqual(codes(diagnostics), [
    'authority-claim',
    'arbitrary-export-claim',
    'universal-claim',
    'synthetic-data-claim',
    'forecast-package-claim',
    'host-runtime-claim',
    'color-safety-claim',
  ])
  assert.deepEqual(
    findClaimViolations({
      path: 'guide.mdx',
      text: 'Clinical thresholds integrate with clinical systems and support research use.',
    }),
    []
  )
})

test('finds rendered claim disguises while allowing explicit negations', () => {
  for (const text of [
    "Clinician{'-'}grade analytics",
    'Clinician\\-grade analytics',
    'Clinician&ZeroWidthSpace;&#45;grade analytics',
    'Clinician&hyphen;grade analytics',
  ]) {
    assert.deepEqual(
      codes(findClaimViolations({ path: 'claim.mdx', text })),
      ['authority-claim'],
      text
    )
  }

  assert.deepEqual(
    findClaimViolations({
      path: 'limits.mdx',
      text: `
        Synthetic data is not clinically representative.
        This is not a clinical report.
        The parser does not support any vendor export.
        The palette is not colorblind-safe.
      `,
    }),
    []
  )

  assert.deepEqual(
    codes(
      findClaimViolations({
        path: 'scope.mdx',
        text: 'The workflow is not slow and remains clinician-grade.',
      })
    ),
    ['authority-claim']
  )
  assert.deepEqual(
    codes(
      findClaimViolations({
        path: 'scope.mdx',
        text: 'Synthetic data is not fake but is clinically representative.',
      })
    ),
    ['synthetic-data-claim']
  )
  assert.deepEqual(
    codes(
      findClaimViolations({
        path: 'scope.mdx',
        text: 'The workflow is not slow and clinician-grade.',
      })
    ),
    ['authority-claim']
  )
  assert.deepEqual(
    codes(
      findClaimViolations({
        path: 'scope.mdx',
        text: 'Synthetic data is not fake and clinically representative.',
      })
    ),
    ['synthetic-data-claim']
  )
})

test('reports claim diagnostics at the matched rendered source line', () => {
  const diagnostics = findClaimViolations({
    path: 'locations.mdx',
    text: 'Clinical thresholds support configuration.\r\n\r\nThis is a <em>clinical</em> report.\r\n',
  })
  assert.equal(diagnostics.length, 1)
  assert.equal(diagnostics[0].code, 'authority-claim')
  assert.equal(diagnostics[0].line, 3)
})

test('does not let unrelated negation mask an affirmative claim', () => {
  assert.deepEqual(
    codes(
      findClaimViolations({
        path: 'scope.mdx',
        text: 'The workflow is not slow and remains clinician-grade.',
      })
    ),
    ['authority-claim']
  )
  assert.deepEqual(
    codes(
      findClaimViolations({
        path: 'scope.mdx',
        text: 'Synthetic data is not fake but is clinically representative.',
      })
    ),
    ['synthetic-data-claim']
  )
})

test('extracts Markdown, reference, image, HTML, and MDX URL destinations', () => {
  const links = extractDocumentLinks({
    path: 'guide.mdx',
    text: `# Links
[inline](https://example.com/a)
[reference][ref]
![image](/image.png)
<a href="/docs/core">Core</a>
<Link href={'https://glucoseiq.dev/docs/react'}>React</Link>
<img src="https://example.com/image.png" />

[ref]: ../relative.md
`,
  })

  assert.deepEqual(
    links.map(({ destination, kind }) => ({ destination, kind })),
    [
      { destination: 'https://example.com/a', kind: 'link' },
      { destination: '../relative.md', kind: 'link' },
      { destination: '/image.png', kind: 'image' },
      { destination: '/docs/core', kind: 'link' },
      { destination: 'https://glucoseiq.dev/docs/react', kind: 'link' },
      { destination: 'https://example.com/image.png', kind: 'image' },
    ]
  )
  assert.ok(links.every((link) => Number.isInteger(link.line) && link.line > 0))
})

test('does not let rendered Markdown and MDX URL forms bypass validation', () => {
  const text = `
[shortcut]
[collapsed][]
[nested](https://example.com/a_(b))
[nested-unsafe](javascript:alert(foo(bar)))
<a href=javascript:alert(1)>unsafe</a>
<Link href={\`javascript:alert(2)\`}>unsafe</Link>
<Link href={dynamicDestination}>dynamic</Link>
[trailing-dot](https://glucoseiq.dev./docs/missing)

[shortcut]: javascript:alert(3)
[collapsed]: /docs/core
`
  const links = extractDocumentLinks({ path: 'adversarial.mdx', text })
  assert.ok(links.some(({ destination }) => destination === 'https://example.com/a_(b)'))
  assert.ok(links.some(({ destination }) => destination === 'javascript:alert(1)'))
  assert.ok(links.some(({ destination }) => destination === 'javascript:alert(2)'))
  assert.ok(links.some(({ destination }) => destination === 'javascript:alert(3)'))
  assert.ok(
    links.some(
      ({ destination }) => destination === 'javascript:alert(foo(bar))'
    )
  )

  const diagnostics = validateDocumentLinks({
    path: 'adversarial.mdx',
    text,
    trackedRoutes: new Set(['/docs/core']),
    trackedFiles: new Set(),
  })
  assert.equal(
    codes(diagnostics).filter((code) => code === 'unsafe-link-scheme').length,
    4
  )
  assert.ok(codes(diagnostics).includes('nonliteral-link-destination'))
  assert.ok(codes(diagnostics).includes('noncanonical-site-host'))

  const packedDiagnostics = validateDocumentLinks({
    path: 'package/README.md',
    text: '[root](/docs/core) ![image](/image.png) [protocol](//example.com/a)',
    publishedReadme: true,
    trackedRoutes: new Set(['/docs/core']),
    trackedFiles: new Set(),
  })
  assert.deepEqual(codes(packedDiagnostics), [
    'tarball-relative-link',
    'tarball-relative-link',
    'tarball-relative-link',
  ])
})

test('maps canonical site URLs and rejects unsafe or tarball-relative links', () => {
  assert.equal(
    mapSiteUrlToTrackedRoute('https://glucoseiq.dev/docs/api/core#parse'),
    '/docs/api/core'
  )
  assert.equal(mapSiteUrlToTrackedRoute('https://example.com/docs'), null)

  const diagnostics = validateDocumentLinks({
    path: 'packages/core/README.md',
    text: `
[fragment](#install)
[relative](../../docs/index.md)
[missing](https://glucoseiq.dev/docs/missing)
[unsafe](javascript:alert(1))
[scheme-relative-https](https:relative)
[scheme-relative-http](http:relative)
[broken-https](https:/broken)
[insecure-published-link](http://example.com/docs)
`,
    publishedReadme: true,
    trackedRoutes: new Set(['/docs/api/core']),
    trackedFiles: new Set(),
  })

  assert.deepEqual(codes(diagnostics), [
    'tarball-relative-link',
    'missing-site-route',
    'unsafe-link-scheme',
    'malformed-link-url',
    'malformed-link-url',
    'malformed-link-url',
    'published-readme-http',
  ])
})

test('requires every packed README contract and accepts a complete one', () => {
  const base = {
    path: 'packages/example/README.md',
    packageName: '@glucoseiq/example',
    guideUrl: 'https://glucoseiq.dev/docs/example',
    apiUrl: 'https://glucoseiq.dev/docs/api',
  }
  const incomplete = validateReadmeContract({ ...base, text: '# Example' })
  assert.deepEqual(codes(incomplete), [
    'readme-node',
    'readme-install',
    'readme-first-use',
    'readme-options',
    'readme-invalid-input',
    'readme-safety',
    'readme-guide-link',
    'readme-api-link',
    'readme-license-link',
    'readme-changelog-link',
  ])

  const complete = `# Example

Requires Node \`>=24\`.

## Install

\`npm install @glucoseiq/example\`

## First use

\`\`\`ts typecheck
import { example } from '@glucoseiq/example'
example()
\`\`\`

## Options and defaults

No options are required.

## Invalid input

Invalid input throws a typed error.

## Safety limits

Output is informational and bounded.

[Guide](https://glucoseiq.dev/docs/example) · [API](https://glucoseiq.dev/docs/api) · [License](https://github.com/marklearst/glucoseiq/blob/main/LICENSE) · [Changelog](https://github.com/marklearst/glucoseiq/blob/main/CHANGELOG.md)
`
  assert.deepEqual(validateReadmeContract({ ...base, text: complete }), [])
  assert.ok(
    codes(
      validateReadmeContract({
        ...base,
        text: complete.replace(
          'npm install @glucoseiq/example',
          'npm install @glucoseiq/example-malicious'
        ),
      })
    ).includes('readme-install')
  )
})

test('requires package-specific README behavior instead of generic boilerplate', () => {
  function genericReadme(packageName, guideUrl, apiUrl) {
    return `# ${packageName}

Node \`>=24\`. Install with \`npm install ${packageName}\`.

## First use

\`\`\`ts typecheck
import * as api from '${packageName}'
void api
\`\`\`

## Options and defaults

Options and defaults are documented.

## Invalid input

Invalid input is rejected.

## Safety limits

The package has explicit limits.

[Guide](${guideUrl}) [API](${apiUrl}) [License](https://github.com/marklearst/glucoseiq/blob/main/LICENSE) [Changelog](https://github.com/marklearst/glucoseiq/blob/main/CHANGELOG.md)
`
  }

  const fixtures = [
    {
      packageName: '@glucoseiq/core',
      guideUrl: 'https://glucoseiq.dev/docs/core-concepts',
      apiUrl: 'https://glucoseiq.dev/docs/api/core',
      expected: [
        'readme-core-subpaths',
        'readme-core-errors',
        'readme-core-csv',
        'readme-core-renderers',
        'readme-core-disclaimer',
        'readme-core-units',
        'readme-core-score',
        'readme-core-agp-limit',
      ],
    },
    {
      packageName: '@glucoseiq/react',
      guideUrl: 'https://glucoseiq.dev/docs/react',
      apiUrl: 'https://glucoseiq.dev/docs/api',
      expected: [
        'readme-react-peer',
        'readme-react-client',
        'readme-react-server',
        'readme-react-identity',
      ],
    },
    {
      packageName: '@glucoseiq/tokens',
      guideUrl: 'https://glucoseiq.dev/docs/tokens',
      apiUrl: 'https://glucoseiq.dev/docs/api',
      expected: ['readme-tokens-unit', 'readme-tokens-range'],
    },
    {
      packageName: '@glucoseiq/testing',
      guideUrl: 'https://glucoseiq.dev/docs/testing',
      apiUrl: 'https://glucoseiq.dev/docs/api',
      expected: [
        'readme-testing-options',
        'readme-testing-cap',
        'readme-testing-synthetic',
      ],
    },
    {
      packageName: '@glucoseiq/cli',
      guideUrl: 'https://glucoseiq.dev/docs/cli',
      apiUrl: 'https://glucoseiq.dev/docs/api',
      expected: [
        'readme-cli-run',
        'readme-cli-flags',
        'readme-cli-delimiter',
        'readme-cli-columns',
        'readme-cli-exit',
        'readme-cli-units',
        'readme-cli-json',
        'readme-cli-svg-json',
      ],
    },
  ]

  for (const fixture of fixtures) {
    const diagnostics = validateReadmeContract({
      path: `packages/${fixture.packageName.split('/').at(-1)}/README.md`,
      packageName: fixture.packageName,
      guideUrl: fixture.guideUrl,
      apiUrl: fixture.apiUrl,
      text: genericReadme(
        fixture.packageName,
        fixture.guideUrl,
        fixture.apiUrl
      ),
    })
    assert.deepEqual(
      codes(diagnostics).filter((code) =>
        code.startsWith(
          `readme-${fixture.packageName.split('/').at(-1)}-`
        )
      ),
      fixture.expected,
      fixture.packageName
    )
  }

  const completeAdditions = {
    '@glucoseiq/core': `
Public entrypoints are @glucoseiq/core, @glucoseiq/core/metrics,
@glucoseiq/core/connectors, @glucoseiq/core/interop, and @glucoseiq/core/render.
GlucoseIQError, DomainError, ParseError, EmptyDatasetError, and TimestampError
carry stable error codes. CSV input is header-row delimited data with mapped timestamp
and value columns; its one-code-unit delimiter defaults to comma and rejects double quote, NUL,
CR, and LF. Blank or BOM-only input returns an empty array. A valid header-only
document returns an empty array after header validation; a missing mapped header
throws ParseError with CSV_COLUMN_NOT_FOUND. An invalid delimiter throws DomainError
with INVALID_OPTION. Invalid rows are skipped. The optional SVG renderers validate
positive finite dimensions and return SVG strings. Quoted fields cannot span physical lines.
Mixed-unit-aware GlucoseReading APIs normalize each declared unit. Legacy
calculateTIR requires readings and targets in one homogeneous unit, while
numeric-array APIs require a homogeneous series and its matching unit. The score is a
project-defined, non-diagnostic wellness heuristic derived from GRI. The AGP
renderer returns an AGP-style percentile-band series, not a complete
standardized AGP report. Email, PDF, README, and watch hosts require
host-specific embedding, conversion, or integration. This software is
informational and is not medical advice.
`,
    '@glucoseiq/react': `
React >=18 is a peer dependency. The root is a Client Component package;
use @glucoseiq/core for server-only work. Keep the readings array and options
object identities stable so memoized hooks do not recompute unnecessarily.
`,
    '@glucoseiq/tokens': `
classifyGlucoseZone accepts mg/dL only. NaN, infinity, zero, and negative
values throw RangeError with "Glucose value must be positive and finite".
`,
    '@glucoseiq/testing': `
GenerateOptions documents days, intervalMin, seed, start, basal, mealTimes,
mealAmplitude, noise, nocturnalHypoDays, and unit. Generation is capped at
100000 readings. The output is synthetic CGM-shaped data and is not clinically
representative or a substitute for validation with real data.
`,
    '@glucoseiq/cli': `
\`\`\`ts typecheck
import { type CliIO, run } from '@glucoseiq/cli'
const io: CliIO = { out: console.log, err: console.error }
const exitCode: number = run(['report', 'data.csv', '--json'], io)
void exitCode
\`\`\`
Flags are --timestamp-col, --value-col, --unit, --delimiter, --timezone,
--json, --agp-svg, and --help. Timestamp and value flags map exact CSV columns.
The --unit flag accepts mg/dL or mmol/L and defaults to mg/dL.
The delimiter defaults to comma and is one UTF-16 code unit excluding double quote,
NUL, CR, and LF.
Success and help return exit code 0; errors return 1. JSON is
{ report, glucoseIQ }; non-finite numbers serialize as null. With --json and
--agp-svg, stdout remains one JSON document and suppresses the SVG success line.
`,
  }
  const mutations = {
    '@glucoseiq/core': [
      ['/metrics', 'readme-core-subpaths'],
      ['GlucoseIQError', 'readme-core-errors'],
      ['header-row delimited', 'readme-core-csv'],
      ['mapped timestamp', 'readme-core-csv'],
      ['one-code-unit delimiter', 'readme-core-csv'],
      ['defaults to comma', 'readme-core-csv'],
      ['rejects double quote, NUL,', 'readme-core-csv'],
      ['Blank or BOM-only input', 'readme-core-csv'],
      ['valid header-only', 'readme-core-csv'],
      ['CSV_COLUMN_NOT_FOUND', 'readme-core-csv'],
      ['invalid delimiter', 'readme-core-csv'],
      ['INVALID_OPTION', 'readme-core-csv'],
      ['Invalid rows are skipped', 'readme-core-csv'],
      ['cannot span physical lines', 'readme-core-csv'],
      ['positive finite dimensions', 'readme-core-renderers'],
      ['not medical advice', 'readme-core-disclaimer'],
      ['Mixed-unit-aware', 'readme-core-units'],
      ['Legacy\ncalculateTIR', 'readme-core-units'],
      ['homogeneous series', 'readme-core-units'],
      ['non-diagnostic wellness heuristic derived from GRI', 'readme-core-score'],
      ['not a complete', 'readme-core-agp-limit'],
      ['host-specific embedding', 'readme-core-agp-limit'],
    ],
    '@glucoseiq/react': [
      ['React >=18', 'readme-react-peer'],
      ['Client Component package', 'readme-react-client'],
      ['server-only work', 'readme-react-server'],
      ['identities stable', 'readme-react-identity'],
    ],
    '@glucoseiq/tokens': [
      ['mg/dL only', 'readme-tokens-unit'],
      ['RangeError', 'readme-tokens-range'],
    ],
    '@glucoseiq/testing': [
      ['nocturnalHypoDays', 'readme-testing-options'],
      ['100000', 'readme-testing-cap'],
      ['not clinically', 'readme-testing-synthetic'],
    ],
    '@glucoseiq/cli': [
      ['import { type CliIO, run', 'readme-cli-run'],
      ['--timestamp-col', 'readme-cli-flags'],
      ['--value-col', 'readme-cli-flags'],
      ['--unit', 'readme-cli-flags'],
      ['--delimiter', 'readme-cli-flags'],
      ['--timezone', 'readme-cli-flags'],
      ['--json', 'readme-cli-flags'],
      ['--agp-svg', 'readme-cli-flags'],
      ['--help', 'readme-cli-flags'],
      ['one UTF-16 code unit', 'readme-cli-delimiter'],
      ['defaults to comma', 'readme-cli-delimiter'],
      ['excluding double quote', 'readme-cli-delimiter'],
      ['NUL, CR, and LF', 'readme-cli-delimiter'],
      ['map exact CSV columns', 'readme-cli-columns'],
      ['exit code 0', 'readme-cli-exit'],
      ['errors return 1', 'readme-cli-exit'],
      ['mg/dL or mmol/L', 'readme-cli-units'],
      ['defaults to mg/dL', 'readme-cli-units'],
      ['{ report, glucoseIQ }', 'readme-cli-json'],
      ['non-finite numbers serialize as null', 'readme-cli-json'],
      ['suppresses the SVG success line', 'readme-cli-svg-json'],
    ],
  }

  for (const fixture of fixtures) {
    const base = {
      path: `packages/${fixture.packageName.split('/').at(-1)}/README.md`,
      packageName: fixture.packageName,
      guideUrl: fixture.guideUrl,
      apiUrl: fixture.apiUrl,
    }
    const complete = `${genericReadme(
      fixture.packageName,
      fixture.guideUrl,
      fixture.apiUrl
    )}${completeAdditions[fixture.packageName]}`
    assert.deepEqual(
      validateReadmeContract({ ...base, text: complete }),
      [],
      `${fixture.packageName} complete contract`
    )
    if (fixture.packageName === '@glucoseiq/cli') {
      const splitImports = complete.replace(
        "import { type CliIO, run } from '@glucoseiq/cli'",
        "import { run } from '@glucoseiq/cli'\nimport type { CliIO } from '@glucoseiq/cli'"
      )
      assert.deepEqual(
        validateReadmeContract({ ...base, text: splitImports }),
        [],
        'CLI run and CliIO imports may be ordered or split without weakening the contract'
      )
    }

    for (const [marker, expectedCode] of mutations[fixture.packageName]) {
      assert.ok(complete.includes(marker), `${fixture.packageName}: ${marker}`)
      const changed = complete.replaceAll(marker, 'removed-contract-marker')
      assert.ok(
        codes(validateReadmeContract({ ...base, text: changed })).includes(
          expectedCode
        ),
        `${fixture.packageName} must fail when ${marker} is removed`
      )
    }
  }
})

test('builds public inventory without reading protected paths and keeps archives link-only', () => {
  const reads = []
  const trackedFiles = [
    'CHANGELOG.md',
    'README.md',
    'packages/core/README.md',
    'packages/core/src/a1c.ts',
    'packages/core/docs-md/private.md',
    'apps/docs/content/docs/index.mdx',
    'apps/docs/content/docs/api/core/index.mdx',
    'apps/docs/app/(home)/page.tsx',
    'docs/globals.md',
    'docs/LAUNCH_RUNBOOK.md',
    'docs/functions/legacy.md',
    'docs/plans/launch.md',
    '.changeset/launch.md',
  ]
  const inventory = createPublicInventory({
    repoRoot: '/repo',
    trackedFiles,
    readFile(path) {
      reads.push(path)
      if (path.includes('docs-md')) throw new Error('protected path was read')
      return ''
    },
  })

  assert.ok(!reads.some((path) => path.includes('packages/core/docs-md/')))
  assert.deepEqual(inventory.readmes, ['README.md', 'packages/core/README.md'])
  assert.deepEqual(inventory.narrativeDocs, ['apps/docs/content/docs/index.mdx'])
  assert.deepEqual(inventory.managedApi, ['apps/docs/content/docs/api/core/index.mdx'])
  assert.deepEqual(inventory.sourceFiles, ['packages/core/src/a1c.ts'])
  assert.deepEqual(inventory.homepageFiles, ['apps/docs/app/(home)/page.tsx'])
  assert.deepEqual(inventory.linkOnlyFiles, [
    'CHANGELOG.md',
    'docs/LAUNCH_RUNBOOK.md',
    'docs/functions/legacy.md',
    'docs/globals.md',
  ])
})

test('sorts and formats contract diagnostics deterministically', () => {
  const diagnostics = [
    { path: 'z.md', line: 1, column: 1, code: 'z', message: 'last' },
    { path: 'a.md', line: 3, column: 2, code: 'b', message: 'second' },
    { path: 'a.md', line: 3, column: 1, code: 'a', message: 'first' },
  ]
  const sorted = sortContractDiagnostics(diagnostics)
  assert.deepEqual(sorted.map((item) => item.message), ['first', 'second', 'last'])
  assert.equal(
    formatContractDiagnostics(sorted),
    'a.md:3:1 [a] first\na.md:3:2 [b] second\nz.md:1:1 [z] last'
  )
})

test('parses exactly one explicit fence classification', () => {
  assert.deepEqual(parseFenceMetadata('ts typecheck'), {
    language: 'ts',
    classification: 'typecheck',
    reason: null,
  })
  assert.deepEqual(parseFenceMetadata('tsx fragment="reviewed component shell"'), {
    language: 'tsx',
    classification: 'fragment',
    reason: 'reviewed component shell',
  })
  assert.deepEqual(parseFenceMetadata('typescript typecheck'), {
    language: 'typescript',
    classification: 'typecheck',
    reason: null,
  })

  for (const metadata of [
    'ts',
    'js typecheck',
    'ts typecheck typecheck',
    'ts typecheck fragment="reason"',
    'ts fragment=""',
    'ts fragment="   "',
    'ts hidden="typecheck"',
    'ts typecheck extra',
  ]) {
    assert.throws(() => parseFenceMetadata(metadata), /fence metadata/i, metadata)
  }
})

test('extracts line-stable fences and enforces manual and generated fragment authority', () => {
  const authored = extractTypedFences({
    path: 'apps/docs/content/docs/guide.mdx',
    text: '\ufeff---\r\ntitle: Guide\r\n---\r\n\r\n```ts typecheck\r\nconst value = 1\r\n```\r\n\r\n```ts fragment="reviewed pseudocode"\r\nconst sketch = true\r\n```\r\n',
    manualFragments: new Set([
      'apps/docs/content/docs/guide.mdx:9:reviewed pseudocode',
    ]),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.deepEqual(authored.diagnostics, [])
  assert.equal(authored.typedFenceCount, 2)
  assert.equal(authored.snippets[0].line, 5)
  assert.equal(authored.fragments[0].line, 9)

  const managed = extractTypedFences({
    path: 'apps/docs/content/docs/api/core/a1c.mdx',
    text: `\`\`\`ts fragment="${GENERATED_FRAGMENT_REASON}"
declare function getA1CCategory(value: number): string
\`\`\`
`,
    manualFragments: new Set(),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.deepEqual(managed.diagnostics, [])

  for (const source of [
    'getA1CCategory(value: number): string',
    'formatPercentage(val: number, digits: number = 1): string',
    'estimateA1CFromAverage(avgGlucose: number, unit: GlucoseUnit = MG_DL): number',
    'isA1CInTarget(a1c: number, target: [number, number] = [6.5, 7.0], thresholds?: { max?: number; min?: number }): boolean',
    'formatGlucose(val: number, unit: GlucoseUnit, options: { digits?: number; suffix?: boolean } = {}): string',
    'isEstimateGMIOptions(input: unknown): input is EstimateGMIOptions',
    'interface GlucoseReading',
    "type GlucoseUnit = 'mg/dL' | 'mmol/L'",
    'const MG_DL: \'mg/dL\'',
    'class DomainError extends GlucoseIQError',
    'toJSON(): Record<string, unknown>',
    '(value: number): string',
    'new (value: number): Thing',
    'readonly [key: string]: number',
  ]) {
    const generated = extractTypedFences({
      path: 'apps/docs/content/docs/api/core/generated.mdx',
      text: `\`\`\`ts fragment="${GENERATED_FRAGMENT_REASON}"\n${source}\n\`\`\`\n`,
      manualFragments: new Set(),
      generatedFragmentReason: GENERATED_FRAGMENT_REASON,
    })
    assert.deepEqual(generated.diagnostics, [], source)
  }

  const wrongPath = extractTypedFences({
    path: 'apps/docs/content/docs/guide.mdx',
    text: `\`\`\`ts fragment="${GENERATED_FRAGMENT_REASON}"
declare function example(): void
\`\`\`
`,
    manualFragments: new Set(),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.deepEqual(codes(wrongPath.diagnostics), ['unauthorized-generated-fragment'])

  const arbitraryManagedExample = extractTypedFences({
    path: 'apps/docs/content/docs/api/core/a1c.mdx',
    text: `\`\`\`ts fragment="${GENERATED_FRAGMENT_REASON}"
const value = 1
\`\`\`
`,
    manualFragments: new Set(),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.deepEqual(codes(arbitraryManagedExample.diagnostics), [
    'invalid-generated-fragment',
  ])

  for (const source of [
    "import { analyzeGlucose } from '@glucoseiq/core'",
    'getA1CCategory(5.7)',
    'unsafe(value: number = dangerous()): number',
    'unsafe(value: number = new Date().getTime()): number',
    'unsafe(value: number = 1 + 2): number',
    'function demo(): number { return dangerous() }',
    'type Demo = number; dangerous()',
    'const demo: number = dangerous()',
    'demo(): number; dangerous()',
    '(value: number = dangerous()): string',
    'new (value: number = dangerous()): Thing',
    'readonly [key: string]: number; dangerous()',
  ]) {
    const generatedExample = extractTypedFences({
      path: 'apps/docs/content/docs/api/core/generated.mdx',
      text: `\`\`\`ts fragment="${GENERATED_FRAGMENT_REASON}"\n${source}\n\`\`\`\n`,
      manualFragments: new Set(),
      generatedFragmentReason: GENERATED_FRAGMENT_REASON,
    })
    assert.deepEqual(
      codes(generatedExample.diagnostics),
      ['invalid-generated-fragment'],
      source
    )
  }

  const unauthorizedManual = extractTypedFences({
    path: 'apps/docs/content/docs/guide.mdx',
    text: `\`\`\`ts fragment="reviewed pseudocode"
const sketch = true
\`\`\`
`,
    manualFragments: new Set(),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.deepEqual(codes(unauthorizedManual.diagnostics), [
    'unauthorized-manual-fragment',
  ])

  const staleManual = extractTypedFences({
    path: 'apps/docs/content/docs/guide.mdx',
    text: '```ts typecheck\nconst value = 1\n```\n',
    manualFragments: new Set([
      'apps/docs/content/docs/guide.mdx:99:removed fragment',
    ]),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.deepEqual(codes(staleManual.diagnostics), ['unused-manual-fragment'])
})

test('classifies CommonMark backtick and tilde fence runs without bypasses', () => {
  const result = extractTypedFences({
    path: 'fences.mdx',
    text: `\`\`\`\`ts typecheck
const markdown = '\`\`\`'
\`\`\`\`

~~~tsx typecheck
export const view = <div />
~~~~
`,
    manualFragments: new Set(),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.equal(result.typedFenceCount, 2)
  assert.deepEqual(
    result.snippets.map(({ language, line }) => [language, line]),
    [
      ['ts', 1],
      ['tsx', 5],
    ]
  )
  assert.deepEqual(result.diagnostics, [])

  const unclosed = extractTypedFences({
    path: 'unclosed.mdx',
    text: '~~~~ts typecheck\nconst value = true\n~~~\n',
    manualFragments: new Set(),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.equal(unclosed.typedFenceCount, 1)
  assert.deepEqual(codes(unclosed.diagnostics), ['unclosed-fence'])
})

test('rejects executable or multi-statement generated API fragments', () => {
  for (const source of [
    'function demo(): number { return dangerous() }',
    'type Demo = number; dangerous()',
    'const demo: number = dangerous()',
    'demo(): number; dangerous()',
  ]) {
    const result = extractTypedFences({
      path: 'apps/docs/content/docs/api/core/generated.mdx',
      text: `\`\`\`ts fragment="${GENERATED_FRAGMENT_REASON}"\n${source}\n\`\`\`\n`,
      manualFragments: new Set(),
      generatedFragmentReason: GENERATED_FRAGMENT_REASON,
    })
    assert.deepEqual(
      codes(result.diagnostics),
      ['invalid-generated-fragment'],
      source
    )
  }
})

test('maps extracted snippet diagnostics to the first public code line', () => {
  const path = 'apps/docs/content/docs/guide.mdx'
  const extracted = extractTypedFences({
    path,
    text: '# Guide\n\n```ts typecheck\nconst value = true\nimport \'./local\'\n```\n',
    manualFragments: new Set(),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.deepEqual(extracted.diagnostics, [])
  assert.equal(extracted.snippets[0].line, 3)
  assert.equal(extracted.snippets[0].sourceLine, 4)
  assert.equal(extracted.snippets[0].path, path)

  const analysis = analyzeSnippetSource({
    path: extracted.snippets[0].path,
    sourceLine: extracted.snippets[0].sourceLine,
    source: extracted.snippets[0].source,
    allowedPackages: new Set(),
  })
  assert.equal(analysis.diagnostics.length, 1)
  assert.equal(analysis.diagnostics[0].code, 'relative-import')
  assert.equal(analysis.diagnostics[0].sourcePath, path)
  assert.equal(analysis.diagnostics[0].sourceLine, 5)
  assert.equal(analysis.diagnostics[0].line, 5)
})

test('reports empty, unclassified, malformed, hidden, and unclosed typed fences', () => {
  const result = extractTypedFences({
    path: 'broken.mdx',
    text: `
\`\`\`ts
const unclassified = true
\`\`\`
\`\`\`ts typecheck
\`\`\`
\`\`\`ts hidden="typecheck"
const hidden = true
\`\`\`
\`\`\`tsx typecheck
const unclosed = true
`,
    manualFragments: new Set(),
    generatedFragmentReason: GENERATED_FRAGMENT_REASON,
  })
  assert.deepEqual(codes(result.diagnostics), [
    'unclassified-fence',
    'empty-fence',
    'malformed-fence-metadata',
    'unclosed-fence',
  ])
})

test('rejects manual fragment entries for deleted or undiscovered files', () => {
  const diagnostics = reconcileManualFragmentAllowlist({
    manualFragments: new Set([
      'apps/docs/content/docs/guide.mdx:9:reviewed pseudocode',
      'apps/docs/content/docs/deleted.mdx:4:removed fragment',
    ]),
    consumedManualFragments: new Set([
      'apps/docs/content/docs/guide.mdx:9:reviewed pseudocode',
    ]),
  })
  assert.deepEqual(codes(diagnostics), ['unused-manual-fragment'])
  assert.match(diagnostics[0].message, /deleted\.mdx:4/u)
})

test('extracts source examples dynamically and requires standalone typecheck fences', () => {
  const result = extractSourceExamples({
    path: 'packages/core/src/example.ts',
    text: `/**
 * @example
 * \`\`\`ts typecheck
 * import { value } from '@glucoseiq/core'
 * value()
 * \`\`\`
 * @example
 * \`\`\`ts
 * const missing = true
 * \`\`\`
 */
export const value = () => 1
`,
  })
  assert.equal(result.snippets.length, 1)
  assert.equal(result.snippets[0].path, 'packages/core/src/example.ts')
  assert.equal(result.snippets[0].sourceLine, 4)
  assert.deepEqual(codes(result.diagnostics), ['unclassified-source-example'])
})

test('source examples honor CommonMark fence runs and code origins', () => {
  const result = extractSourceExamples({
    path: 'packages/core/src/fences.ts',
    text: `/**
 * @example
 * \`\`\`\`ts typecheck
 * const ticks = '\`\`\`'
 * \`\`\`\`
 * @example
 * ~~~typescript typecheck
 * const tildes = true
 * ~~~~
 */
export const value = true
`,
  })
  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(
    result.snippets.map(({ language, line, sourceLine }) => [
      language,
      line,
      sourceLine,
    ]),
    [
      ['ts', 3, 4],
      ['typescript', 7, 8],
    ]
  )
})

test('extracts one explicitly marked visible homepage program', () => {
  const result = extractHomepageSnippet({
    path: 'apps/docs/app/(home)/page.tsx',
    text: `
const sample = "import { analyzeGlucose } from '@glucoseiq/core'"
export default function Page() {
  return <pre data-doc-snippet="home-report"><code>{sample}</code></pre>
}
`,
    marker: 'home-report',
  })
  assert.equal(result.snippet.source, "import { analyzeGlucose } from '@glucoseiq/core'")
  assert.equal(result.snippet.language, 'ts')
  assert.deepEqual(result.diagnostics, [])

  const duplicate = extractHomepageSnippet({
    path: 'page.tsx',
    text: '<pre data-doc-snippet="home-report" /><pre data-doc-snippet="home-report" />',
    marker: 'home-report',
  })
  assert.deepEqual(codes(duplicate.diagnostics), ['homepage-snippet-count'])
})

test('extracts the lexical homepage binding rendered by the marker', () => {
  const result = extractHomepageSnippet({
    path: 'apps/docs/app/(home)/page.tsx',
    text: `
const sample = "import { analyzeGlucose } from '@glucoseiq/core'"
export default function Page() {
  const sample = "import value from 'not-installed'"
  return <pre data-doc-snippet="home-report"><code>{sample}</code></pre>
}
`,
    marker: 'home-report',
  })
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.snippet.source, "import value from 'not-installed'")
})

test('extracts a lexical homepage binding passed to the visible code renderer', () => {
  const result = extractHomepageSnippet({
    path: 'apps/docs/app/(home)/page.tsx',
    text: `
const sample = "import { analyzeGlucose } from '@glucoseiq/core'"
function HighlightedCode({ code }: { code: string }) {
  return <>{code}</>
}
export default function Page() {
  return (
    <div data-doc-snippet="home-report">
      <HighlightedCode code={sample} />
    </div>
  )
}
`,
    marker: 'home-report',
  })
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.snippet.source, "import { analyzeGlucose } from '@glucoseiq/core'")
})

test('uses the TypeScript AST to find every module-specifier form', () => {
  const result = analyzeSnippetSource({
    path: 'example.ts',
    source: `
import core, { type GlucoseReading } from '@glucoseiq/core'
export { thing } from '@glucoseiq/testing'
export * from '@glucoseiq/testing'
import '@glucoseiq/core/render'
const dynamicValue = import('@glucoseiq/tokens')
type Render = import('@glucoseiq/core/render').AGPChartOptions
import cliModule = require('@glucoseiq/cli')
import { run as execute } from '@glucoseiq/cli'
execute([], { out() {}, err() {} })
// run() and "import { run } from '@glucoseiq/cli'" must not count.
`,
    allowedPackages: new Set([
      '@glucoseiq/core',
      '@glucoseiq/core/render',
      '@glucoseiq/testing',
      '@glucoseiq/tokens',
      '@glucoseiq/cli',
    ]),
  })
  assert.deepEqual(result.specifiers, [
    '@glucoseiq/cli',
    '@glucoseiq/core',
    '@glucoseiq/core/render',
    '@glucoseiq/testing',
    '@glucoseiq/tokens',
  ])
  assert.ok(
    result.imports.some(
      (entry) =>
        entry.specifier === '@glucoseiq/cli' &&
        entry.imported === 'run' &&
        entry.local === 'execute' &&
        entry.typeOnly === false
    )
  )
  assert.ok(result.calls.includes('execute'))
  assert.deepEqual(result.diagnostics, [])
})

test('rejects unsafe source constructs without matching comments or strings', () => {
  const fixtures = [
    ["import value from './local'", 'relative-import'],
    ["import value from '/absolute/path'", 'absolute-import'],
    ["import value from 'file:///tmp/value'", 'file-import'],
    ["import value from 'not-installed'", 'undeclared-package'],
    ["import value from '@glucoseiq/core/private'", 'undeclared-package'],
    ["import { readFile } from 'node:fs'", 'undeclared-package'],
    ["const name = '@glucoseiq/core'; import(name)", 'nonliteral-module-specifier'],
    ["const name = '@glucoseiq/core'; require(name)", 'nonliteral-module-specifier'],
    ["const part = 'core'; import(`@glucoseiq/${part}`)", 'nonliteral-module-specifier'],
    ['// @ts-ignore\nconst value = 1', 'suppression-directive'],
    ['// @ts-expect-error\nconst value = 1', 'suppression-directive'],
    ['// @ts-nocheck\nconst value = 1', 'suppression-directive'],
    ['/// <reference types="node" />', 'triple-slash-reference'],
    ['/// <reference path="./ambient.d.ts" />', 'triple-slash-reference'],
    ['/// <reference lib="dom" />', 'triple-slash-reference'],
    ['/// <reference no-default-lib="true" />', 'triple-slash-reference'],
    ['/// <amd-module name="fixture" />', 'triple-slash-reference'],
    ['/// <amd-dependency path="fixture" />', 'triple-slash-reference'],
    ['declare global { interface Window { value: string } }', 'ambient-declaration'],
    ["declare module 'virtual' {}", 'ambient-declaration'],
    ['declare const externalValue: string', 'ambient-declaration'],
    ['declare function externalFunction(): void', 'ambient-declaration'],
    ['declare namespace External {}', 'ambient-declaration'],
  ]
  for (const [source, expected] of fixtures) {
    const result = analyzeSnippetSource({
      path: 'fixture.ts',
      source,
      allowedPackages: new Set(['@glucoseiq/core']),
    })
    assert.ok(codes(result.diagnostics).includes(expected), source)
  }

  const harmless = analyzeSnippetSource({
    path: 'harmless.ts',
    source: `
const text = "import value from './not-real'"
// require('not-real')
import { analyzeGlucose } from '@glucoseiq/core'
`,
    allowedPackages: new Set(['@glucoseiq/core']),
  })
  assert.deepEqual(harmless.diagnostics, [])
})

test('derives declaration entrypoints from manifest import types', () => {
  const entries = deriveDeclarationManifest({
    repoRoot: '/repo',
    packages: [
      {
        root: 'packages/core',
        manifest: {
          name: '@glucoseiq/core',
          exports: {
            '.': { import: { types: './dist/index.d.mts' } },
            './render': { import: { types: './dist/render/index.d.mts' } },
            './package.json': './package.json',
          },
        },
      },
      {
        root: 'packages/react',
        manifest: {
          name: '@glucoseiq/react',
          exports: {
            '.': { import: { types: './dist/index.d.mts' } },
          },
        },
      },
    ],
  })
  assert.deepEqual(
    entries.map(({ specifier, declaration }) => ({ specifier, declaration })),
    [
      {
        specifier: '@glucoseiq/core',
        declaration: '/repo/packages/core/dist/index.d.mts',
      },
      {
        specifier: '@glucoseiq/core/render',
        declaration: '/repo/packages/core/dist/render/index.d.mts',
      },
      {
        specifier: '@glucoseiq/react',
        declaration: '/repo/packages/react/dist/index.d.mts',
      },
    ]
  )

  assert.throws(
    () =>
      deriveDeclarationManifest({
        repoRoot: '/repo',
        packages: [
          {
            root: 'packages/bad',
            manifest: {
              name: '@glucoseiq/bad',
              exports: {
                '.': { import: { types: './dist/index.d.ts' } },
              },
            },
          },
        ],
      }),
    /\.d\.mts/u
  )
})

test('aggregates missing, symlinked, non-regular, and escaping declarations', () => {
  const root = mkdtempSync(join(tmpdir(), 'glucoseiq-declarations-'))
  try {
    const packageRoot = join(root, 'packages/core')
    const dist = join(packageRoot, 'dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(join(dist, 'valid.d.mts'), 'export {}')
    mkdirSync(join(dist, 'directory.d.mts'))
    const outside = join(root, 'outside.d.mts')
    writeFileSync(outside, 'export {}')
    symlinkSync(outside, join(dist, 'link.d.mts'))
    const parentLinkPackage = join(root, 'packages/parent-link')
    const outsideDirectory = join(root, 'outside-directory')
    mkdirSync(parentLinkPackage, { recursive: true })
    mkdirSync(outsideDirectory)
    writeFileSync(join(outsideDirectory, 'index.d.mts'), 'export {}')
    symlinkSync(outsideDirectory, join(parentLinkPackage, 'dist'))

    const diagnostics = validateDeclarationManifest([
      { specifier: 'valid', packageRoot, declaration: join(dist, 'valid.d.mts') },
      { specifier: 'missing', packageRoot, declaration: join(dist, 'missing.d.mts') },
      { specifier: 'directory', packageRoot, declaration: join(dist, 'directory.d.mts') },
      { specifier: 'link', packageRoot, declaration: join(dist, 'link.d.mts') },
      { specifier: 'escape', packageRoot, declaration: outside },
      {
        specifier: 'parent-link',
        packageRoot: parentLinkPackage,
        declaration: join(parentLinkPackage, 'dist/index.d.mts'),
      },
    ])
    assert.deepEqual(codes(diagnostics), [
      'missing-declaration',
      'non-regular-declaration',
      'symlink-declaration',
      'declaration-escape',
      'declaration-escape',
    ])
    const prerequisite = formatDeclarationPrerequisite(diagnostics)
    for (const specifier of ['missing', 'directory', 'link', 'escape', 'parent-link']) {
      assert.match(prerequisite, new RegExp(specifier, 'u'))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolves only regular, contained docs-owned compiler and React type files', () => {
  const root = mkdtempSync(join(tmpdir(), 'glucoseiq-toolchain-'))
  try {
    const typescriptRoot = join(root, 'typescript')
    const react18Root = join(root, 'react-types-18')
    const react19Root = join(root, 'react-types-19')
    mkdirSync(join(typescriptRoot, 'bin'), { recursive: true })
    mkdirSync(react18Root)
    mkdirSync(react19Root)
    writeFileSync(
      join(typescriptRoot, 'package.json'),
      JSON.stringify({ version: '5.9.3' })
    )
    writeFileSync(join(typescriptRoot, 'bin/tsc'), 'export {}')
    for (const [packageRoot, version] of [
      [react18Root, '18.3.31'],
      [react19Root, '19.2.18'],
    ]) {
      writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ version }))
      for (const file of ['index.d.ts', 'jsx-runtime.d.ts', 'jsx-dev-runtime.d.ts']) {
        writeFileSync(join(packageRoot, file), 'export {}')
      }
    }

    const packagePaths = {
      typescript: join(typescriptRoot, 'package.json'),
      'react-types-18': join(react18Root, 'package.json'),
      'react-types-19': join(react19Root, 'package.json'),
    }
    const resolvePackage = (name) => packagePaths[name]
    const toolchain = resolveDocsToolchain({
      docsManifestPath: '/repo/apps/docs/package.json',
      resolvePackage,
    })
    assert.equal(toolchain.typescriptVersion, '5.9.3')
    assert.equal(toolchain.tscPath, join(typescriptRoot, 'bin/tsc'))
    assert.deepEqual(toolchain.react18, {
      version: '18.3.31',
      root: react18Root,
      index: join(react18Root, 'index.d.ts'),
      jsxRuntime: join(react18Root, 'jsx-runtime.d.ts'),
      jsxDevRuntime: join(react18Root, 'jsx-dev-runtime.d.ts'),
    })
    assert.deepEqual(toolchain.react19, {
      version: '19.2.18',
      root: react19Root,
      index: join(react19Root, 'index.d.ts'),
      jsxRuntime: join(react19Root, 'jsx-runtime.d.ts'),
      jsxDevRuntime: join(react19Root, 'jsx-dev-runtime.d.ts'),
    })

    writeFileSync(
      join(typescriptRoot, 'package.json'),
      JSON.stringify({ version: '5.9.0' })
    )
    assert.throws(
      () =>
        resolveDocsToolchain({
          docsManifestPath: '/repo/apps/docs/package.json',
          resolvePackage,
        }),
      /TypeScript 5\.9\.3/u
    )
    writeFileSync(
      join(typescriptRoot, 'package.json'),
      JSON.stringify({ version: '5.9.3' })
    )

    writeFileSync(
      join(react18Root, 'package.json'),
      JSON.stringify({ version: '19.2.18' })
    )
    assert.throws(
      () =>
        resolveDocsToolchain({
          docsManifestPath: '/repo/apps/docs/package.json',
          resolvePackage,
        }),
      /React 18.*18\.3\.31/iu
    )
    writeFileSync(
      join(react18Root, 'package.json'),
      JSON.stringify({ version: '18.3.31' })
    )

    writeFileSync(
      join(react19Root, 'package.json'),
      JSON.stringify({ version: '18.3.31' })
    )
    assert.throws(
      () =>
        resolveDocsToolchain({
          docsManifestPath: '/repo/apps/docs/package.json',
          resolvePackage,
        }),
      /React 19.*19\.2\.18/iu
    )
    writeFileSync(
      join(react19Root, 'package.json'),
      JSON.stringify({ version: '19.2.18' })
    )

    const outside = join(root, 'outside.d.ts')
    writeFileSync(outside, 'export {}')
    rmSync(join(react18Root, 'jsx-runtime.d.ts'))
    symlinkSync(outside, join(react18Root, 'jsx-runtime.d.ts'))
    assert.throws(
      () =>
        resolveDocsToolchain({
          docsManifestPath: '/repo/apps/docs/package.json',
          resolvePackage,
        }),
      /jsx-runtime.*regular.*contained|symlink/iu
    )

    let reactReads = 0
    assert.throws(
      () =>
        resolveDocsToolchain({
          docsManifestPath: '/repo/apps/docs/package.json',
          resolvePackage(name) {
            if (name === 'typescript') return packagePaths.typescript
            return join(react19Root, 'package.json')
          },
          readJson(path) {
            if (path === packagePaths.typescript) return { version: '5.9.3' }
            reactReads += 1
            return { version: reactReads === 1 ? '18.3.31' : '19.2.18' }
          },
        }),
      /distinct React type roots/u
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('plans non-React once and React-dependent snippets for both peer majors', () => {
  const jobs = planSnippetCompilations({
    snippets: [
      { id: 'core', source: "import '@glucoseiq/core'", language: 'ts' },
      { id: 'tsx-without-import', source: 'export const view = <div />', language: 'tsx' },
      {
        id: 'react-package-from-ts',
        source: "import { useGlucoseAnalysis } from '@glucoseiq/react'",
        language: 'ts',
      },
    ],
    reactVariants: ['18', '19'],
  })
  assert.deepEqual(
    jobs.map(({ snippetId, reactMajor }) => [snippetId, reactMajor]),
    [
      ['core', null],
      ['tsx-without-import', '18'],
      ['tsx-without-import', '19'],
      ['react-package-from-ts', '18'],
      ['react-package-from-ts', '19'],
    ]
  )
})

test('creates an isolated strict compiler project with exact declaration mappings', () => {
  const project = createCompilerProject({
    job: {
      ordinal: 7,
      snippetId: 'react-example',
      language: 'tsx',
      source: "import React from 'react'\nexport const view = <div />",
      sourcePath: 'apps/docs/content/docs/react.mdx',
      sourceLine: 42,
      reactMajor: '18',
    },
    tempRoot: '/tmp/glucoseiq-docs-owned',
    declarations: new Map([
      ['@glucoseiq/core', '/repo/packages/core/dist/index.d.mts'],
      ['@glucoseiq/core/render', '/repo/packages/core/dist/render/index.d.mts'],
      ['@glucoseiq/react', '/repo/packages/react/dist/index.d.mts'],
    ]),
    reactTypes: {
      18: { root: '/repo/node_modules/react-types-18' },
      19: { root: '/repo/node_modules/react-types-19' },
    },
  })

  assert.equal(project.directory, '/tmp/glucoseiq-docs-owned/0007')
  assert.equal(project.sourcePath, '/tmp/glucoseiq-docs-owned/0007/index.tsx')
  assert.equal(project.sourceDocumentPath, 'apps/docs/content/docs/react.mdx')
  assert.equal(project.sourceDocumentLine, 42)
  assert.equal(project.configPath, '/tmp/glucoseiq-docs-owned/0007/tsconfig.json')
  assert.equal(project.source, "import React from 'react'\nexport const view = <div />")
  assert.deepEqual(project.config, {
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      jsx: 'react-jsx',
      noEmit: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: false,
      types: [],
      baseUrl: '.',
      paths: {
        '@glucoseiq/core': ['/repo/packages/core/dist/index.d.mts'],
        '@glucoseiq/core/render': ['/repo/packages/core/dist/render/index.d.mts'],
        '@glucoseiq/react': ['/repo/packages/react/dist/index.d.mts'],
        react: ['/repo/node_modules/react-types-18/index.d.ts'],
        'react/jsx-runtime': ['/repo/node_modules/react-types-18/jsx-runtime.d.ts'],
        'react/jsx-dev-runtime': [
          '/repo/node_modules/react-types-18/jsx-dev-runtime.d.ts',
        ],
      },
    },
    include: ['index.tsx'],
  })
  assert.ok(project.sourcePath.startsWith(`${project.directory}/`))
  assert.ok(project.configPath.startsWith(`${project.directory}/`))
  const projectDiagnostics = collectCompilerDiagnostics([
    {
      ...project,
      code: 1,
      stdout: 'index.tsx(2,3): error TS2322: Wrong type',
      stderr: '',
    },
  ])
  assert.equal(projectDiagnostics[0].sourcePath, 'apps/docs/content/docs/react.mdx')
  assert.equal(projectDiagnostics[0].sourceLine, 43)
  assert.equal(projectDiagnostics[0].line, 2)

  const react19Project = createCompilerProject({
    job: {
      ordinal: 8,
      snippetId: 'react-19-example',
      language: 'tsx',
      source: "import React from 'react'\nexport const view = <div />",
      reactMajor: '19',
    },
    tempRoot: '/tmp/glucoseiq-docs-owned',
    declarations: new Map([
      ['@glucoseiq/core', '/repo/packages/core/dist/index.d.mts'],
      ['@glucoseiq/react', '/repo/packages/react/dist/index.d.mts'],
    ]),
    reactTypes: {
      18: { root: '/repo/node_modules/react-types-18' },
      19: { root: '/repo/node_modules/react-types-19' },
    },
  })
  assert.deepEqual(react19Project.config.compilerOptions.paths.react, [
    '/repo/node_modules/react-types-19/index.d.ts',
  ])
  assert.deepEqual(
    react19Project.config.compilerOptions.paths['react/jsx-runtime'],
    ['/repo/node_modules/react-types-19/jsx-runtime.d.ts']
  )
  assert.deepEqual(
    react19Project.config.compilerOptions.paths['react/jsx-dev-runtime'],
    ['/repo/node_modules/react-types-19/jsx-dev-runtime.d.ts']
  )
})

test('TypeScript 5.9.3 rejects a React 19-only API under the React 18 pass', () => {
  const typescriptPackage = requireFromDocs.resolve('typescript/package.json')
  const root = mkdtempSync(join(tmpdir(), 'glucoseiq-react-matrix-'))
  try {
    const react18 = join(root, 'react18')
    const react19 = join(root, 'react19')
    mkdirSync(react18)
    mkdirSync(react19)
    writeFileSync(
      join(react18, 'package.json'),
      JSON.stringify({ version: '18.3.31' })
    )
    writeFileSync(
      join(react19, 'package.json'),
      JSON.stringify({ version: '19.2.18' })
    )
    writeFileSync(
      join(react18, 'index.d.ts'),
      'export function useState<T>(value: T): [T, (value: T) => void]\n'
    )
    writeFileSync(
      join(react19, 'index.d.ts'),
      'export function useState<T>(value: T): [T, (value: T) => void]\nexport function useEffectEvent<T extends (...args: never[]) => unknown>(callback: T): T\n'
    )
    for (const reactRoot of [react18, react19]) {
      writeFileSync(join(reactRoot, 'jsx-runtime.d.ts'), 'export {}\n')
      writeFileSync(join(reactRoot, 'jsx-dev-runtime.d.ts'), 'export {}\n')
    }

    const packagePaths = {
      typescript: typescriptPackage,
      'react-types-18': join(react18, 'package.json'),
      'react-types-19': join(react19, 'package.json'),
    }
    const toolchain = resolveDocsToolchain({
      docsManifestPath: join(repoRoot, 'apps/docs/package.json'),
      resolvePackage(name) {
        return packagePaths[name]
      },
    })
    assert.equal(toolchain.typescriptVersion, '5.9.3')

    const source =
      "import { useEffectEvent } from 'react'\nconst handler = useEffectEvent(() => undefined)\nvoid handler\n"

    function compile(reactMajor, ordinal) {
      const project = createCompilerProject({
        job: {
          ordinal,
          snippetId: `react-${reactMajor}`,
          language: 'ts',
          source,
          reactMajor,
        },
        tempRoot: root,
        declarations: new Map(),
        reactTypes: { 18: toolchain.react18, 19: toolchain.react19 },
      })
      const expectedRoot = reactMajor === '18' ? react18 : react19
      assert.deepEqual(project.config.compilerOptions.paths.react, [
        join(expectedRoot, 'index.d.ts'),
      ])
      mkdirSync(project.directory)
      writeFileSync(project.sourcePath, project.source)
      writeFileSync(project.configPath, `${JSON.stringify(project.config)}\n`)
      return spawnSync(
        process.execPath,
        [toolchain.tscPath, '--project', project.configPath],
        {
        cwd: project.directory,
        encoding: 'utf8',
        shell: false,
        }
      )
    }

    const under18 = compile('18', 0)
    assert.notEqual(under18.status, 0)
    assert.match(`${under18.stdout}${under18.stderr}`, /useEffectEvent/u)
    const under19 = compile('19', 1)
    assert.equal(under19.status, 0, `${under19.stdout}${under19.stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('never runs more than four compiler workers and preserves job order', async () => {
  let active = 0
  let maximum = 0
  const jobs = Array.from({ length: 17 }, (_, index) => ({ index }))
  const results = await runFourWorkerPool(jobs, async ({ index }) => {
    active += 1
    maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, (index % 3) + 1))
    active -= 1
    return index * 2
  })
  assert.ok(maximum <= 4)
  assert.deepEqual(results, jobs.map(({ index }) => index * 2))
})

test('worker failure stops scheduling and waits for in-flight work before cleanup', async () => {
  let active = 0
  const started = []
  const jobs = Array.from({ length: 12 }, (_, index) => ({ index }))
  const startedAt = Date.now()

  await assert.rejects(
    runFourWorkerPool(jobs, async ({ index }) => {
      active += 1
      started.push(index)
      try {
        if (index === 0) {
          await new Promise((resolve) => setTimeout(resolve, 2))
          throw new Error('first compiler failed')
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
        return index
      } finally {
        active -= 1
      }
    }),
    /first compiler failed/u
  )

  assert.equal(active, 0, 'all in-flight workers must settle before rejection')
  assert.deepEqual(started, [0, 1, 2, 3], 'no job may start after the first failure')
  assert.ok(
    Date.now() - startedAt >= 20,
    'the pool must await slower in-flight workers before rejecting'
  )
})

test('executes the docs-owned compiler without a shell and bounds time and output', async () => {
  const calls = []
  const result = await executeCompilerJob(
    {
      tscPath: '/repo/apps/docs/node_modules/typescript/bin/tsc',
      configPath: '/tmp/owned/3/tsconfig.json',
    },
    {
      async execute(spec) {
        calls.push(spec)
        return { code: 0, stdout: '', stderr: '' }
      },
      timeoutMs: 30_000,
      maxOutputBytes: 512 * 1024,
    }
  )
  assert.deepEqual(result, { code: 0, stdout: '', stderr: '' })
  assert.equal(calls[0].file, process.execPath)
  assert.deepEqual(calls[0].args, [
    '/repo/apps/docs/node_modules/typescript/bin/tsc',
    '--project',
    '/tmp/owned/3/tsconfig.json',
  ])
  assert.equal(calls[0].options.shell, false)
  assert.equal(calls[0].options.timeout, 30_000)
  assert.equal(calls[0].options.maxBuffer, 512 * 1024)

  await assert.rejects(
    executeCompilerJob(
      { tscPath: '/tsc', configPath: '/config' },
      { async execute() { throw Object.assign(new Error('late'), { code: 'ETIMEDOUT' }) } }
    ),
    /timed out/i
  )
  await assert.rejects(
    executeCompilerJob(
      { tscPath: '/tsc', configPath: '/config' },
      { async execute() { throw Object.assign(new Error('large'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }) } }
    ),
    /output limit/i
  )
  await assert.rejects(
    executeCompilerJob(
      { tscPath: '/tsc', configPath: '/config' },
      { async execute() { throw new Error('spawn failed') } }
    ),
    /spawn failed/i
  )

  const nonzero = await executeCompilerJob(
    { tscPath: '/tsc', configPath: '/config' },
    {
      async execute() {
        throw Object.assign(new Error('TypeScript failed'), {
          code: 2,
          stdout: 'index.ts(1,1): error TS2305: Missing export',
          stderr: '',
        })
      },
    }
  )
  assert.equal(nonzero.code, 2)
  assert.match(nonzero.stdout, /TS2305/u)
})

test('sorts and deduplicates compiler diagnostics without merging source locations', () => {
  const diagnostics = collectCompilerDiagnostics([
    {
      sourcePath: 'z.mdx',
      sourceLine: 4,
      reactMajor: '19',
      code: 1,
      stdout: 'index.tsx(2,3): error TS2322: Wrong type',
      stderr: 'index.tsx(2,3): error TS2322: Wrong type',
    },
    {
      sourcePath: 'a.mdx',
      sourceLine: 8,
      reactMajor: '18',
      code: 1,
      stdout: 'index.tsx(1,1): error TS2305: Missing export\nindex.tsx(1,1): error TS2305: Missing export',
      stderr: '',
    },
    {
      sourcePath: 'a.mdx',
      sourceLine: 9,
      reactMajor: '18',
      code: 1,
      stdout: '',
      stderr: 'index.tsx(1,1): error TS2305: Missing export',
    },
    {
      sourcePath: 'empty.mdx',
      sourceLine: 1,
      reactMajor: null,
      code: 1,
      stdout: '',
      stderr: '',
    },
  ])
  assert.deepEqual(
    diagnostics.map(({ sourcePath, sourceLine, reactMajor, code }) => [
      sourcePath,
      sourceLine,
      reactMajor,
      code,
    ]),
    [
      ['a.mdx', 8, '18', 2305],
      ['a.mdx', 9, '18', 2305],
      ['empty.mdx', 1, null, 'compiler-exit'],
      ['z.mdx', 5, '19', 2322],
    ]
  )
})

test('sorts and formats snippet diagnostics deterministically', () => {
  const diagnostics = [
    { sourcePath: 'b.mdx', sourceLine: 1, reactMajor: null, line: 1, column: 1, code: 2, message: 'b' },
    { sourcePath: 'a.mdx', sourceLine: 2, reactMajor: '19', line: 2, column: 1, code: 3, message: 'c' },
    { sourcePath: 'a.mdx', sourceLine: 2, reactMajor: '18', line: 1, column: 2, code: 1, message: 'a' },
  ]
  const sorted = sortSnippetDiagnostics(diagnostics)
  assert.deepEqual(sorted.map((item) => item.message), ['a', 'c', 'b'])
  assert.match(formatSnippetDiagnostics(sorted), /a\.mdx:2.*React 18.*TS1.*a/)
})

test('finds a repository root from an outside working directory', () => {
  const root = resolveRepositoryRoot('/tmp/outside/deeper', {
    parent(path) {
      return {
        '/tmp/outside/deeper': '/tmp/outside',
        '/tmp/outside': '/tmp',
        '/tmp': '/',
      }[path] ?? path
    },
    isRepository(path) {
      return path === '/tmp'
    },
  })
  assert.equal(root, '/tmp')
})

test('allows cleanup only inside the owned temporary root', () => {
  assert.equal(assertOwnedTempPath('/tmp/glucoseiq-docs-123', '/tmp/glucoseiq-docs-123/4'), true)
  for (const path of ['/tmp', '/tmp/glucoseiq-docs-123', '/tmp/glucoseiq-docs-123/../other']) {
    assert.throws(
      () => assertOwnedTempPath('/tmp/glucoseiq-docs-123', path),
      /owned temporary/i,
      path
    )
  }
})

test('fails before temp creation when declarations are missing and always cleans owned roots', async () => {
  let tempCreates = 0
  let cleanups = 0
  await assert.rejects(
    compileSnippets({
      declarationDiagnostics: [
        { code: 'missing-declaration', specifier: '@glucoseiq/core', declaration: '/missing' },
      ],
      createTempRoot() {
        tempCreates += 1
      },
    }),
    /build.*declaration/i
  )
  assert.equal(tempCreates, 0)

  await assert.rejects(
    compileSnippets({
      declarationDiagnostics: [],
      snippets: [{ id: 'react-19-only', usesReact: true }],
      createTempRoot() {
        tempCreates += 1
        return '/tmp/glucoseiq-docs-owned'
      },
      async compileJob(job) {
        if (job.reactMajor === '18') throw new Error('React 18 rejected React 19 API')
        return { code: 0, stdout: '', stderr: '' }
      },
      removeTempRoot(path) {
        assert.equal(path, '/tmp/glucoseiq-docs-owned')
        cleanups += 1
      },
    }),
    /React 18 rejected React 19 API/
  )
  assert.equal(tempCreates, 1)
  assert.equal(cleanups, 1)

  const success = await compileSnippets({
    declarationDiagnostics: [],
    snippets: [{ id: 'core', usesReact: false }],
    createTempRoot() {
      tempCreates += 1
      return '/tmp/glucoseiq-docs-owned-success'
    },
    async compileJob() {
      return { code: 0, stdout: '', stderr: '' }
    },
    removeTempRoot(path) {
      assert.equal(path, '/tmp/glucoseiq-docs-owned-success')
      cleanups += 1
    },
  })
  assert.deepEqual(success, [])
  assert.equal(tempCreates, 2)
  assert.equal(cleanups, 2)
})
