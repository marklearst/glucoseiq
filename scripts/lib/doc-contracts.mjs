import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { posix } from 'node:path'

const requireFromDocs = createRequire(
  new URL('../../apps/docs/package.json', import.meta.url)
)
const { decodeNamedCharacterReference } = await import(
  requireFromDocs.resolve('decode-named-character-reference')
)

const PUBLIC_PACKAGE_ROOTS = new Set([
  'core',
  'react',
  'tokens',
  'testing',
  'cli',
  'diabetic-utils',
])

const MIGRATION_URL = 'https://glucoseiq.health/docs/migration'

export const PACKAGE_README_CONTRACTS = Object.freeze(
  [
    {
      path: 'packages/core/README.md',
      packageName: '@glucoseiq/core',
      guideUrl: 'https://glucoseiq.health/docs/core-concepts',
      apiUrl: 'https://glucoseiq.health/docs/api/core',
      migrationUrl: MIGRATION_URL,
    },
    {
      path: 'packages/react/README.md',
      packageName: '@glucoseiq/react',
      guideUrl: 'https://glucoseiq.health/docs/react',
      apiUrl: 'https://glucoseiq.health/docs/api',
      migrationUrl: MIGRATION_URL,
    },
    {
      path: 'packages/tokens/README.md',
      packageName: '@glucoseiq/tokens',
      guideUrl: 'https://glucoseiq.health/docs/tokens',
      apiUrl: 'https://glucoseiq.health/docs/api',
      migrationUrl: MIGRATION_URL,
    },
    {
      path: 'packages/testing/README.md',
      packageName: '@glucoseiq/testing',
      guideUrl: 'https://glucoseiq.health/docs/testing',
      apiUrl: 'https://glucoseiq.health/docs/api',
      migrationUrl: MIGRATION_URL,
    },
    {
      path: 'packages/cli/README.md',
      packageName: '@glucoseiq/cli',
      guideUrl: 'https://glucoseiq.health/docs/cli',
      apiUrl: 'https://glucoseiq.health/docs/api',
      migrationUrl: MIGRATION_URL,
    },
    {
      path: 'packages/diabetic-utils/README.md',
      packageName: 'diabetic-utils',
      guideUrl: MIGRATION_URL,
      apiUrl: 'https://glucoseiq.health/docs/api/core',
      migrationUrl: MIGRATION_URL,
    },
  ].map((contract) => Object.freeze(contract))
)

const TRACKED_FILE_CACHE = new Map()

const ENTITY_VALUES = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['gt', '>'],
  ['hellip', '…'],
  ['lt', '<'],
  ['mdash', '—'],
  ['nbsp', ' '],
  ['ndash', '–'],
  ['newline', '\n'],
  ['colon', ':'],
  ['quot', '"'],
  ['shy', '\u00ad'],
  ['sol', '/'],
  ['tab', '\t'],
  ['zerowidthspace', '\u200b'],
  ['zwj', '\u200d'],
  ['zwnj', '\u200c'],
])

const CLAIM_RULES = [
  {
    code: 'authority-claim',
    message:
      'Replace clinician-grade or clinical-report authority language with a precise analytics description.',
    patterns: [
      /\bclinician(?:\s|-)?grade\b/iu,
      /\bclinical(?:\s|-)?reports?\b/iu,
    ],
  },
  {
    code: 'arbitrary-export-claim',
    message:
      'Do not promise support for arbitrary CGM or vendor exports; describe the mapped delimited-data contract.',
    patterns: [
      /\b(?:any|all|arbitrary|every)\s+(?:(?:CGM|vendor)\s+)*(?:data\s+)?exports?\b/iu,
      /\b(?:parses?|supports?|accepts?|imports?)\s+(?:data\s+from\s+)?(?:any|all|every)\s+(?:CGM\s+)?(?:vendor|device|system)\b/iu,
      /\b(?:all|every)\s+(?:major\s+)?CGM\s+(?:vendor|platform|system)s?\b/iu,
    ],
  },
  {
    code: 'universal-claim',
    message:
      'Qualify universal normalization, formula, citation, or research-grade claims to the implemented input contract.',
    patterns: [
      /\bresearch(?:er)?(?:\s|-)?grade\b/iu,
      /\b(?:universally|always|fully|wholly)\s+normaliz\w*\b/iu,
      /\bnormaliz\w*\s+(?:universally|always|fully|wholly)\b/iu,
      /\b(?:every|all)\s+(?:formula|metric|calculation|citation)s?\b[^.!?]{0,120}\b(?:cit(?:e|ed|ation)|published|research|trace|normaliz)\w*\b/iu,
      /\bnormaliz\w*\s+(?:any|all|every)\s+(?:input|reading|series|unit|value)s?\b/iu,
      /\b(?:any|all|every)\s+(?:input|reading|series|unit|value)s?\b[^.!?]{0,60}\bnormaliz\w*\b/iu,
    ],
  },
  {
    code: 'synthetic-data-claim',
    message:
      'Describe generated readings as synthetic CGM-shaped test data, not realistic or clinically representative data.',
    patterns: [
      /\b(?:realistic|clinically\s+representative|clinical(?:ly)?\s+realistic)\b[^.!?\n]{0,100}\bsynthetic(?:\s+\w+){0,3}\s+data\b/iu,
      /\bsynthetic(?:\s+\w+){0,3}\s+data\b[^.!?\n]{0,100}\b(?:realistic|clinically\s+representative|clinical(?:ly)?\s+realistic)\b/iu,
    ],
  },
  {
    code: 'forecast-package-claim',
    message: 'Remove references to the nonexistent @glucoseiq/forecast package.',
    patterns: [/@glucoseiq\/forecast\b/iu],
  },
  {
    code: 'host-runtime-claim',
    message:
      'Qualify host support; email, PDF, README, and watch surfaces need host-specific integration.',
    patterns: [
      /\bruns?\s+(?:virtually\s+)?anywhere\b/iu,
      /\b(?:direct(?:ly)?|out[- ]of[- ]the[- ]box)\b[^.!?\n]{0,120}\b(?:email|PDF|README|watch(?:\s+runtime)?)s?\b/iu,
      /\b(?:email|PDF|README|watch(?:\s+runtime)?)s?\b[^.!?\n]{0,120}\b(?:without\s+(?:conversion|integration|embedding)|direct(?:ly)?|out[- ]of[- ]the[- ]box)\b/iu,
    ],
  },
  {
    code: 'color-safety-claim',
    message:
      'Do not claim colorblind safety without a verified accessibility contract.',
    patterns: [
      /\bcolou?r(?:\s|-)?blind(?:ness)?(?:\s|-)?safe\b/iu,
      /\bsafe\s+for\s+(?:people\s+with\s+)?colou?r(?:\s|-)?blindness\b/iu,
    ],
  },
]

const GENERIC_README_RULES = [
  {
    code: 'readme-node',
    message: 'State the Node >=24 runtime requirement.',
    test: ({ normalized }) =>
      /\bNode(?:\.js)?\s*(?:version\s*)?`?\s*>=\s*24\b/iu.test(normalized),
  },
  {
    code: 'readme-install',
    message: 'Provide the exact npm install command.',
    test: ({ text, packageName }) => hasExactInstallCommand(text, packageName),
  },
  {
    code: 'readme-first-use',
    message: 'Provide a standalone TypeScript first-use example.',
    test: ({ text, packageName }) => hasTypedFirstUse(text, packageName),
  },
  {
    code: 'readme-options',
    message: 'Document options and defaults, including when none are required.',
    test: ({ normalized }) =>
      /\boptions?\s+and\s+defaults?\b/iu.test(normalized),
  },
  {
    code: 'readme-invalid-input',
    message: 'Document invalid-input behavior.',
    test: ({ normalized }) => /\binvalid\s+input\b/iu.test(normalized),
  },
  {
    code: 'readme-safety',
    message: 'Document package safety limits.',
    test: ({ normalized }) => /\bsafety\s+limits?\b/iu.test(normalized),
  },
  {
    code: 'readme-guide-link',
    message: 'Link to the package guide with its canonical absolute URL.',
    test: ({ destinations, guideUrl }) => destinations.has(guideUrl),
  },
  {
    code: 'readme-api-link',
    message: 'Link to the public API with its canonical absolute URL.',
    test: ({ destinations, apiUrl }) => destinations.has(apiUrl),
  },
  {
    code: 'readme-migration-link',
    message: 'Link to the migration guide with its canonical absolute URL.',
    test: ({ destinations, migrationUrl }) => destinations.has(migrationUrl),
  },
  {
    code: 'readme-license-link',
    message: 'Link to the repository MIT license with an absolute URL.',
    test: ({ destinations }) =>
      destinations.has(
        'https://github.com/marklearst/glucoseiq/blob/main/LICENSE'
      ),
  },
  {
    code: 'readme-changelog-link',
    message: 'Link to the repository changelog with an absolute URL.',
    test: ({ destinations }) =>
      destinations.has(
        'https://github.com/marklearst/glucoseiq/blob/main/CHANGELOG.md'
      ),
  },
]

const PACKAGE_README_RULES = new Map([
  [
    '@glucoseiq/core',
    [
      packageRule(
        'readme-core-subpaths',
        'List every public core entrypoint.',
        (text) =>
          [
            '@glucoseiq/core',
            '@glucoseiq/core/metrics',
            '@glucoseiq/core/connectors',
            '@glucoseiq/core/interop',
            '@glucoseiq/core/render',
          ].every((specifier) => text.includes(specifier))
      ),
      packageRule(
        'readme-core-errors',
        'Document the typed core error hierarchy and stable codes.',
        (text) =>
          [
            'GlucoseIQError',
            'DomainError',
            'ParseError',
            'EmptyDatasetError',
            'TimestampError',
          ].every((name) => text.includes(name)) &&
          /\bstable\s+error\s+codes?\b/iu.test(text)
      ),
      packageRule(
        'readme-core-csv',
        'Document the exact mapped CSV and delimiter behavior.',
        (text) =>
          /\bheader-row\s+delimited\s+data\b/iu.test(text) &&
          /\bmapped\s+timestamp\s+and\s+value\s+columns\b/iu.test(text) &&
          /\bone(?:\s|-)?code(?:\s|-)?unit\s+delimiter\b/iu.test(text) &&
          /\bdelimiter\s+defaults\s+to\s+comma\b/iu.test(text) &&
          /\brejects?\s+double\s+quote,\s*NUL,\s*CR,\s*and\s*LF\b/iu.test(
            text
          ) &&
          /\bBlank\s+or\s+BOM-only\s+input\s+returns\s+an\s+empty\s+array\b/iu.test(
            text
          ) &&
          /\bvalid\s+header-only\s+document\s+returns\s+an\s+empty\s+array\s+after\s+header\s+validation\b/iu.test(
            text
          ) &&
          /\bmissing\s+mapped\s+header\s+throws\s+ParseError\s+with\s+CSV_COLUMN_NOT_FOUND\b/iu.test(
            text
          ) &&
          /\binvalid\s+delimiter\s+throws\s+DomainError\s+with\s+INVALID_OPTION\b/iu.test(
            text
          ) &&
          /\binvalid\s+rows?\s+(?:are\s+)?skipped\b/iu.test(text) &&
          /\bquoted\s+fields?\s+cannot\s+span\s+physical\s+lines?\b/iu.test(
            text
          )
      ),
      packageRule(
        'readme-core-renderers',
        'Document optional SVG renderer validation and output.',
        (text) =>
          /\boptional\s+SVG\s+renderers?\b/iu.test(text) &&
          /\bpositive\s+finite\s+dimensions?\b/iu.test(text) &&
          /\breturn\s+SVG\s+strings?\b/iu.test(text)
      ),
      packageRule(
        'readme-core-disclaimer',
        'State that the software is informational and not medical advice.',
        (text) =>
          /\binformational\b/iu.test(text) &&
          /\bnot\s+medical\s+advice\b/iu.test(text)
      ),
      packageRule(
        'readme-core-units',
        'Distinguish mixed-unit-aware APIs, legacy calculateTIR, and homogeneous numeric-array APIs.',
        (text) =>
          /\bmixed-unit-aware\s+GlucoseReading\s+APIs?\s+normalize\b/iu.test(
            text
          ) &&
          /\blegacy\s+calculateTIR\b[^.]*\bhomogeneous\s+unit\b/iu.test(text) &&
          /\bnumeric-array\s+APIs?\s+require\s+a\s+homogeneous\s+series\b/iu.test(
            text
          ) &&
          /\bmatching\s+unit\b/iu.test(text)
      ),
      packageRule(
        'readme-core-score',
        'Describe the score as a project-defined non-diagnostic heuristic derived from GRI.',
        (text) =>
          /\bproject-defined,?\s+non-diagnostic\s+wellness\s+heuristic\s+derived\s+from\s+GRI\b/iu.test(
            text
          )
      ),
      packageRule(
        'readme-core-agp-limit',
        'Limit the AGP renderer claim and describe host-specific integration requirements.',
        (text) =>
          /\bAGP-style\s+percentile-band\s+series\b/iu.test(text) &&
          /\bnot\s+a\s+complete\s+standardized\s+AGP\s+report\b/iu.test(text) &&
          /\bEmail,\s*PDF,\s*README,\s*and\s*watch\s+hosts?\b/iu.test(text) &&
          /\bhost-specific\s+embedding,\s*conversion,\s*or\s*integration\b/iu.test(
            text
          )
      ),
    ],
  ],
  [
    '@glucoseiq/react',
    [
      packageRule(
        'readme-react-peer',
        'State the React >=18 peer range.',
        (text) => /\bReact\s+>=\s*18\b/iu.test(text)
      ),
      packageRule(
        'readme-react-client',
        'Identify the root as a Client Component package.',
        (text) => /\bClient\s+Component\s+package\b/u.test(text)
      ),
      packageRule(
        'readme-react-server',
        'Direct server-only consumers to @glucoseiq/core.',
        (text) =>
          text.includes('@glucoseiq/core') && /\bserver-only\s+work\b/iu.test(text)
      ),
      packageRule(
        'readme-react-identity',
        'Explain stable readings-array and options-object identity.',
        (text) =>
          /\breadings\s+array\b/iu.test(text) &&
          /\boptions\s+object\b/iu.test(text) &&
          /\bidentit(?:y|ies)\s+stable\b/iu.test(text)
      ),
    ],
  ],
  [
    '@glucoseiq/tokens',
    [
      packageRule(
        'readme-tokens-unit',
        'State that classifyGlucoseZone accepts mg/dL only.',
        (text) =>
          text.includes('classifyGlucoseZone') && /\bmg\/dL\s+only\b/u.test(text)
      ),
      packageRule(
        'readme-tokens-range',
        'Document RangeError behavior for non-positive or non-finite values.',
        (text) =>
          text.includes('RangeError') &&
          /\bpositive\s+and\s+finite\b/iu.test(text)
      ),
    ],
  ],
  [
    '@glucoseiq/testing',
    [
      packageRule(
        'readme-testing-options',
        'List every synthetic-data generator option.',
        (text) =>
          [
            'days',
            'intervalMin',
            'seed',
            'start',
            'basal',
            'mealTimes',
            'mealAmplitude',
            'noise',
            'nocturnalHypoDays',
            'unit',
          ].every((name) => new RegExp(`\\b${name}\\b`, 'u').test(text))
      ),
      packageRule(
        'readme-testing-cap',
        'Document the 100,000-reading generation cap.',
        (text) => /\b100,?000\s+readings?\b/u.test(text)
      ),
      packageRule(
        'readme-testing-synthetic',
        'State that synthetic data is not clinically representative.',
        (text) =>
          /\bsynthetic\b/iu.test(text) &&
          /\bnot\s+clinically\s+representative\b/iu.test(text)
      ),
    ],
  ],
  [
    '@glucoseiq/cli',
    [
      packageRule(
        'readme-cli-run',
        'Show a typed import and invocation of run with CliIO.',
        (_text, rawText) => hasTypedCliRun(rawText)
      ),
      packageRule(
        'readme-cli-flags',
        'List every supported CLI flag.',
        (text) => hasExactCliFlagList(text)
      ),
      packageRule(
        'readme-cli-delimiter',
        'Document the one UTF-16 code unit delimiter rule.',
        (text) =>
          /\bdelimiter\s+defaults\s+to\s+comma\b/iu.test(text) &&
          /\bone\s+UTF-16\s+code\s+unit\b/iu.test(text) &&
          /\bexcluding\s+double\s+quote,\s*NUL,\s*CR,\s*and\s*LF\b/iu.test(
            text
          )
      ),
      packageRule(
        'readme-cli-columns',
        'Explain that the timestamp and value flags map exact CSV columns.',
        (text) => /\bmap\s+exact\s+CSV\s+columns\b/iu.test(text)
      ),
      packageRule(
        'readme-cli-exit',
        'Document success, help, and error exit codes.',
        (text) =>
          /\bSuccess\s+and\s+help\s+return\s+exit\s+code\s+0\b/iu.test(text) &&
          /\berrors?\s+return\s+1\b/iu.test(text)
      ),
      packageRule(
        'readme-cli-units',
        'Document accepted CLI units and the default unit.',
        (text) =>
          /\bmg\/dL\s+or\s+mmol\/L\b/u.test(text) &&
          /\bdefaults?\s+to\s+mg\/dL\b/iu.test(text)
      ),
      packageRule(
        'readme-cli-json',
        'Document the JSON shape and non-finite-number serialization.',
        (text) =>
          text.includes('{ report, glucoseIQ }') &&
          /\bnon-finite\s+numbers?\s+serialize\s+as\s+null\b/iu.test(text)
      ),
      packageRule(
        'readme-cli-svg-json',
        'Document JSON plus SVG stdout behavior.',
        (text) =>
          /\bsuppresses\s+the\s+SVG\s+success\s+line\b/iu.test(text)
      ),
    ],
  ],
  [
    'diabetic-utils',
    [
      packageRule(
        'readme-compat-legacy',
        'Explain the legacy dist-tag for version 1.5.',
        (text) =>
          /\b1\.5\b/u.test(text) && /\blegacy\s+dist-tag\b/iu.test(text)
      ),
      packageRule(
        'readme-compat-scoped',
        'Direct new projects to the scoped @glucoseiq/core package.',
        (text) =>
          text.includes('@glucoseiq/core') &&
          /\bscoped(?:-package)?\s+migration\s+guide\b/iu.test(text)
      ),
    ],
  ],
])

function packageRule(code, message, test) {
  return {
    code,
    message,
    test: (context) => test(context.normalized, context.text, context),
  }
}

function decodeEntity(entity) {
  const body = entity.slice(1, -1)
  if (body.startsWith('#')) {
    const hexadecimal = body[1]?.toLowerCase() === 'x'
    const digits = body.slice(hexadecimal ? 2 : 1)
    if (!digits || !/^[\da-f]+$/iu.test(digits)) return entity
    const value = Number.parseInt(digits, hexadecimal ? 16 : 10)
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 0x10ffff ||
      (value >= 0xd800 && value <= 0xdfff)
    ) {
      return '\ufffd'
    }
    return normalizeDashCharacters(String.fromCodePoint(value))
  }
  const decoded = decodeNamedCharacterReference(body)
  return normalizeDashCharacters(
    decoded === false ? ENTITY_VALUES.get(body.toLowerCase()) ?? entity : decoded
  )
}

function normalizeDashCharacters(value) {
  return value.replace(/[\p{Dash_Punctuation}\u2212]/gu, '-')
}

export function normalizeContractText(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string')
  return renderContractText(text).text
}

export function findClaimViolations({ path, text }) {
  assertDocumentInput(path, text)
  const rendered = renderContractText(text)
  const diagnostics = []

  for (const rule of CLAIM_RULES) {
    const match = firstAffirmativePatternMatch(
      rendered.text,
      rule.patterns,
      rule.code
    )
    if (!match) continue
    const sourceIndex = rendered.origins[match.index] ?? 0
    const location = locationAt(text, sourceIndex)
    diagnostics.push({
      path,
      line: location.line,
      column: location.column,
      code: rule.code,
      message: rule.message,
    })
  }

  return diagnostics
}

export function extractDocumentLinks({ path, text }) {
  assertDocumentInput(path, text)
  const masked = maskNonProse(text)
  const definitions = extractReferenceDefinitions(masked)
  const candidates = []
  const occupiedMarkdownRanges = [...definitions.values()].map(
    ({ index, end }) => ({ index, end })
  )

  for (const candidate of extractInlineMarkdownCandidates(masked)) {
    candidates.push(candidate)
    occupiedMarkdownRanges.push({
      index: candidate.index,
      end: candidate.end,
    })
  }

  const references = /(!?)\[([^\]\n]+)\]\[([^\]\n]*)\]/gu
  for (const match of masked.matchAll(references)) {
    const label = normalizeReferenceLabel(match[3] || match[2])
    const definition = definitions.get(label)
    if (!definition) continue
    candidates.push({
      index: match.index,
      end: match.index + match[0].length,
      destination: definition.destination,
      kind: match[1] === '!' ? 'image' : 'link',
    })
    occupiedMarkdownRanges.push({
      index: match.index,
      end: match.index + match[0].length,
    })
  }

  const shortcuts = /(!?)\[([^\]\n]+)\](?![\[(])/gu
  for (const match of masked.matchAll(shortcuts)) {
    if (
      masked[match.index + match[0].length] === ':' ||
      occupiedMarkdownRanges.some(
        (range) => match.index >= range.index && match.index < range.end
      )
    ) {
      continue
    }
    const definition = definitions.get(normalizeReferenceLabel(match[2]))
    if (!definition) continue
    candidates.push({
      index: match.index,
      end: match.index + match[0].length,
      destination: definition.destination,
      kind: match[1] === '!' ? 'image' : 'link',
    })
  }

  const attributes = /\b(href|src)\s*=\s*(?:(["'])(.*?)\2|\{\s*(["'`])((?:\\.|[^"'`])*?)\4\s*\}|([^\s"'=<>`{}]+)|\{([^}]*)\})/giu
  for (const match of masked.matchAll(attributes)) {
    const expression = match[7]
    const literal = match[5]
    const nonliteral =
      expression !== undefined ||
      (match[4] === '`' && literal !== undefined && literal.includes('${'))
    candidates.push({
      index: match.index,
      end: match.index + match[0].length,
      destination: nonliteral
        ? null
        : cleanDestination(
            match[3] ??
              (literal === undefined ? match[6] ?? '' : decodeJavascriptString(literal))
          ),
      kind: match[1].toLowerCase() === 'src' ? 'image' : 'link',
      nonliteral,
    })
  }

  const autolinks = /<(https?:\/\/[^<>\s]+|mailto:[^<>\s]+)>/giu
  for (const match of masked.matchAll(autolinks)) {
    candidates.push({
      index: match.index,
      end: match.index + match[0].length,
      destination: cleanDestination(match[1]),
      kind: 'link',
    })
  }

  const seen = new Set()
  return candidates
    .filter(({ destination, nonliteral }) =>
      nonliteral ? true : destination.length > 0
    )
    .sort((left, right) => left.index - right.index)
    .filter(({ index, destination, kind, nonliteral }) => {
      const key = `${index}\0${kind}\0${destination ?? '<nonliteral>'}\0${Boolean(nonliteral)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(({ index, destination, kind, nonliteral = false }) => {
      const location = locationAt(text, index)
      return { destination, kind, nonliteral, ...location }
    })
}

export function mapSiteUrlToTrackedRoute(destination) {
  if (typeof destination !== 'string') return null
  let url
  try {
    url = new URL(destination)
  } catch {
    return null
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'glucoseiq.health' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return null
  }
  return normalizeRoute(url.pathname)
}

export function validateDocumentLinks({
  path,
  text,
  repoRoot,
  trackedRoutes = new Set(),
  trackedFiles = new Set(),
  publishedReadme = false,
}) {
  assertDocumentInput(path, text)
  const routes = trackedRoutes instanceof Set ? trackedRoutes : new Set(trackedRoutes)
  const files = trackedFiles instanceof Set ? new Set(trackedFiles) : new Set(trackedFiles)
  if (typeof repoRoot === 'string' && repoRoot.length > 0) {
    for (const trackedPath of cachedTrackedFiles(repoRoot)) {
      if (!trackedPath.startsWith('packages/core/docs-md/')) files.add(trackedPath)
    }
  }
  const normalizedRoutes = new Set([...routes].map(normalizeRoute))
  const diagnostics = []

  for (const link of extractDocumentLinks({ path, text })) {
    if (link.nonliteral) {
      diagnostics.push(
        linkDiagnostic(
          path,
          link,
          'nonliteral-link-destination',
          'URL-bearing Markdown/MDX attributes must use a static string literal.'
        )
      )
      continue
    }
    const destination = link.destination.trim()
    const scheme = explicitScheme(destination)
    if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme)) {
      diagnostics.push(
        linkDiagnostic(
          path,
          link,
          'unsafe-link-scheme',
          `Reject unsafe ${scheme}: URL.`
        )
      )
      continue
    }

    if (scheme === 'http' || scheme === 'https') {
      if (!/^https?:\/\//iu.test(destination)) {
        diagnostics.push(
          linkDiagnostic(
            path,
            link,
            'malformed-link-url',
            `HTTP(S) links must use an absolute URL with //: ${destination}`
          )
        )
        continue
      }
      try {
        const parsed = new URL(destination)
        if (publishedReadme && parsed.protocol !== 'https:') {
          diagnostics.push(
            linkDiagnostic(
              path,
              link,
              'published-readme-http',
              `Published README links must use HTTPS: ${destination}`
            )
          )
          continue
        }
      } catch {
        diagnostics.push(
          linkDiagnostic(
            path,
            link,
            'malformed-link-url',
            `Malformed HTTP(S) URL: ${destination}`
          )
        )
        continue
      }
    }

    if (destination.startsWith('#')) continue

    if (publishedReadme && scheme === null) {
      diagnostics.push(
        linkDiagnostic(
          path,
          link,
          'tarball-relative-link',
          `Published README link is scheme-less and cannot be resolved from the package tarball: ${destination}`
        )
      )
      continue
    }

    if (/^https?:\/\//iu.test(destination)) {
      try {
        const parsed = new URL(destination)
        if (parsed.hostname.toLowerCase() === 'glucoseiq.health.') {
          diagnostics.push(
            linkDiagnostic(
              path,
              link,
              'noncanonical-site-host',
              `Remove the trailing dot from the canonical site host: ${destination}`
            )
          )
          continue
        }
      } catch {
        // The normal HTTP(S) validation below emits the malformed URL diagnostic.
      }
    }

    const route = mapSiteUrlToTrackedRoute(destination)
    if (route !== null) {
      if (!normalizedRoutes.has(route)) {
        diagnostics.push(
          linkDiagnostic(
            path,
            link,
            'missing-site-route',
            `Canonical site route does not exist: ${route}`
          )
        )
      }
      continue
    }

    if (/^https?:\/\//iu.test(destination)) {
      let external
      try {
        external = new URL(destination)
      } catch {
        diagnostics.push(
          linkDiagnostic(
            path,
            link,
            'malformed-link-url',
            `Malformed HTTP(S) URL: ${destination}`
          )
        )
        continue
      }
      if (external.hostname.toLowerCase() === 'glucoseiq.health') {
        diagnostics.push(
          linkDiagnostic(
            path,
            link,
            'noncanonical-site-url',
            `Use canonical HTTPS glucoseiq.health URLs: ${destination}`
          )
        )
      }
      continue
    }

    if (scheme || destination.startsWith('//')) {
      continue
    }

    if (destination.startsWith('/')) {
      if (destination === '/docs' || destination.startsWith('/docs/')) {
        const localRoute = normalizeRoute(destination.split(/[?#]/u, 1)[0])
        if (!normalizedRoutes.has(localRoute)) {
          diagnostics.push(
            linkDiagnostic(
              path,
              link,
              'missing-site-route',
              `Documentation route does not exist: ${localRoute}`
            )
          )
        }
      }
      continue
    }

    const relativePath = destination.split(/[?#]/u, 1)[0]
    if (relativePath === '') continue
    const resolved = posix.normalize(posix.join(posix.dirname(path), relativePath))
    if (
      resolved === '..' ||
      resolved.startsWith('../') ||
      posix.isAbsolute(resolved) ||
      !files.has(resolved) &&
      ![...files].some((trackedPath) => trackedPath.startsWith(`${resolved}/`))
    ) {
      diagnostics.push(
        linkDiagnostic(
          path,
          link,
          'missing-relative-file',
          `Relative link target is not tracked: ${destination}`
        )
      )
    }
  }

  return diagnostics
}

export function validateReadmeContract({
  path,
  text,
  packageName,
  guideUrl,
  apiUrl,
  migrationUrl,
}) {
  assertDocumentInput(path, text)
  for (const [field, value] of Object.entries({
    packageName,
    guideUrl,
    apiUrl,
    migrationUrl,
  })) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${field} must be a nonempty string`)
    }
  }

  const normalized = normalizeContractText(text)
  const destinations = new Set(
    extractDocumentLinks({ path, text }).map(({ destination }) => destination)
  )
  const context = {
    path,
    text,
    normalized,
    packageName,
    guideUrl,
    apiUrl,
    migrationUrl,
    destinations,
  }
  const diagnostics = []

  for (const rule of [
    ...GENERIC_README_RULES,
    ...(PACKAGE_README_RULES.get(packageName) ?? []),
  ]) {
    if (rule.test(context)) continue
    diagnostics.push({
      path,
      line: 1,
      column: 1,
      code: rule.code,
      message: rule.message,
    })
  }

  return diagnostics
}

export function createTrackedDocsRoutes(inventory) {
  if (inventory === null || typeof inventory !== 'object') {
    throw new TypeError('inventory must be an object')
  }
  const { narrativeDocs, managedApi } = inventory
  if (!Array.isArray(narrativeDocs) || !Array.isArray(managedApi)) {
    throw new TypeError('inventory documentation groups must be arrays')
  }

  const routes = new Set(['/'])
  for (const path of [...narrativeDocs, ...managedApi]) {
    if (
      typeof path !== 'string' ||
      !path.startsWith('apps/docs/content/docs/') ||
      !path.endsWith('.mdx')
    ) {
      throw new TypeError(`invalid tracked documentation path: ${String(path)}`)
    }
    const sourceRelative = path.slice(
      'apps/docs/content/docs/'.length,
      -'.mdx'.length
    )
    const relative =
      sourceRelative === 'index' ? '' : sourceRelative.replace(/\/index$/u, '')
    routes.add(normalizeRoute(`/docs/${relative}`))
  }

  return new Set([...routes].sort(compareText))
}

export function createPublicInventory({
  repoRoot,
  trackedFiles,
} = {}) {
  if (trackedFiles === undefined) {
    if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
      throw new TypeError('repoRoot must be a nonempty string')
    }
    trackedFiles = listTrackedFiles(repoRoot)
  }
  if (!Array.isArray(trackedFiles)) {
    throw new TypeError('trackedFiles must be an array')
  }

  const files = [...new Set(trackedFiles)]
    .filter(
      (path) =>
        typeof path === 'string' &&
        path.length > 0 &&
        !path.startsWith('packages/core/docs-md/')
    )
    .sort(compareText)
  const packagePath = (path, suffixPattern) => {
    const match = /^packages\/([^/]+)\/(.+)$/u.exec(path)
    return (
      match !== null &&
      PUBLIC_PACKAGE_ROOTS.has(match[1]) &&
      suffixPattern.test(match[2])
    )
  }

  return {
    readmes: files.filter(
      (path) => path === 'README.md' || packagePath(path, /^README\.md$/u)
    ),
    narrativeDocs: files.filter(
      (path) =>
        /^apps\/docs\/content\/docs\/.+\.mdx$/u.test(path) &&
        !path.startsWith('apps/docs/content/docs/api/core/')
    ),
    managedApi: files.filter((path) =>
      /^apps\/docs\/content\/docs\/api\/core\/.+\.mdx$/u.test(path)
    ),
    sourceFiles: files.filter((path) =>
      packagePath(path, /^src\/.+\.(?:ts|tsx)$/u)
    ),
    homepageFiles: files.filter(
      (path) => path === 'apps/docs/app/(home)/page.tsx'
    ),
    legacyLandingFiles: files.filter(
      (path) => path === 'docs/README.md' || path === 'docs/index.md'
    ),
    linkOnlyFiles: files.filter((path) =>
      path === 'CHANGELOG.md' ||
      path === 'docs/globals.md' ||
      path === 'docs/LAUNCH_RUNBOOK.md' ||
      /^docs\/(?:functions|interfaces|type-aliases|variables)\/.+\.md$/u.test(path)
    ),
  }
}

export function sortContractDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics)) {
    throw new TypeError('diagnostics must be an array')
  }
  return [...diagnostics].sort(
    (left, right) =>
      compareText(left.path ?? '', right.path ?? '') ||
      numberOrZero(left.line) - numberOrZero(right.line) ||
      numberOrZero(left.column) - numberOrZero(right.column) ||
      compareText(left.code ?? '', right.code ?? '') ||
      compareText(left.message ?? '', right.message ?? '')
  )
}

export function formatContractDiagnostics(diagnostics) {
  return sortContractDiagnostics(diagnostics)
    .map(
      ({ path, line, column, code, message }) =>
        `${path}:${numberOrOne(line)}:${numberOrOne(column)} [${code}] ${message}`
    )
    .join('\n')
}

function assertDocumentInput(path, text) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new TypeError('path must be a nonempty string')
  }
  if (typeof text !== 'string') throw new TypeError('text must be a string')
}

function firstAffirmativePatternMatch(text, patterns, code) {
  let first = null
  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
    const matcher = new RegExp(pattern.source, flags)
    for (const match of text.matchAll(matcher)) {
      if (claimMatchIsNegated(text, match, code)) continue
      if (first === null || match.index < first.index) first = match
      break
    }
  }
  return first
}

function claimMatchIsNegated(text, match, code) {
  const anchors = claimPredicateAnchors(match, code)
  return anchors.length > 0 && anchors.every((offset) => {
    const anchor = match.index + offset
    const sentenceStart = Math.max(
      text.lastIndexOf('.', anchor - 1),
      text.lastIndexOf('!', anchor - 1),
      text.lastIndexOf('?', anchor - 1),
      text.lastIndexOf(';', anchor - 1)
    )
    let clauseStart = sentenceStart
    const sentencePrefix = text.slice(sentenceStart + 1, anchor)
    for (const boundary of sentencePrefix.matchAll(
      /\b(?:although|and|but|however|or|yet)\b/giu
    )) {
      clauseStart = sentenceStart + 1 + boundary.index + boundary[0].length
    }
    const prefix = text
      .slice(clauseStart + 1, anchor)
      .replace(/\bnot\s+only\b/giu, '')
    return /\b(?:cannot|can't|does\s+not|doesn't|do\s+not|don't|is\s+not|isn't|are\s+not|aren't|never|no|not|without|will\s+not|won't)(?:\s+[\p{L}\p{N}'-]+){0,2}\s*$/iu.test(
      prefix
    )
  })
}

function claimPredicateAnchors(match, code) {
  if (code !== 'synthetic-data-claim') return [0]
  const anchors = []
  const predicate = /\b(?:clinical(?:ly)?\s+realistic|clinically\s+representative|realistic)\b/giu
  for (const candidate of match[0].matchAll(predicate)) anchors.push(candidate.index)
  return anchors
}

function renderContractText(source) {
  const tokens = renderMarkdownTokens(renderSourceTokens(source))
  const text = []
  const origins = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const character = normalizeDashCharacters(token.character)
    if (/\p{Default_Ignorable_Code_Point}/u.test(character)) continue

    if (character === '-' && followsLineBreak(tokens, index + 1)) {
      text.push('-')
      origins.push(token.origin)
      while (tokens[index + 1] && /\s/u.test(tokens[index + 1].character)) {
        index += 1
      }
      continue
    }

    if (/\s/u.test(character)) {
      if (text.length > 0 && text.at(-1) !== ' ') {
        text.push(' ')
        origins.push(token.origin)
      }
      continue
    }

    if (isMarkdownPresentationMarker(tokens, index)) continue
    text.push(character)
    origins.push(token.origin)
  }

  while (text.at(-1) === ' ') {
    text.pop()
    origins.pop()
  }

  return { text: text.join(''), origins }
}

function renderMarkdownTokens(tokens) {
  const rendered = []
  let index = 0

  while (index < tokens.length) {
    if (isReferenceDefinitionStart(tokens, index)) {
      while (index < tokens.length && tokens[index].character !== '\n') index += 1
      continue
    }

    const image = tokens[index]?.character === '!'
    const open = image ? index + 1 : index
    if (tokens[open]?.character !== '[') {
      rendered.push(tokens[index])
      index += 1
      continue
    }

    const labelEnd = findBalancedToken(tokens, open, '[', ']')
    if (labelEnd === -1) {
      rendered.push(tokens[index])
      index += 1
      continue
    }

    const following = tokens[labelEnd + 1]?.character
    let end = labelEnd + 1
    if (following === '(') {
      const destinationEnd = findBalancedToken(tokens, labelEnd + 1, '(', ')')
      if (destinationEnd === -1) {
        rendered.push(tokens[index])
        index += 1
        continue
      }
      end = destinationEnd + 1
    } else if (following === '[') {
      const referenceEnd = findBalancedToken(tokens, labelEnd + 1, '[', ']')
      if (referenceEnd === -1) {
        rendered.push(tokens[index])
        index += 1
        continue
      }
      end = referenceEnd + 1
    }

    rendered.push(...tokens.slice(open + 1, labelEnd))
    index = end
  }

  return rendered
}

function isReferenceDefinitionStart(tokens, index) {
  if (tokens[index]?.character !== '[') return false
  let cursor = index - 1
  let spaces = 0
  while (cursor >= 0 && tokens[cursor].character === ' ') {
    cursor -= 1
    spaces += 1
  }
  if (spaces > 3) return false
  if (cursor >= 0 && !['\n', '\r'].includes(tokens[cursor].character)) return false
  const close = findBalancedToken(tokens, index, '[', ']')
  return close !== -1 && tokens[close + 1]?.character === ':'
}

function findBalancedToken(tokens, start, open, close) {
  if (tokens[start]?.character !== open) return -1
  let depth = 0
  for (let index = start; index < tokens.length; index += 1) {
    const character = tokens[index].character
    if (character === '\n' && open === '[') return -1
    if (character === open) depth += 1
    else if (character === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function renderSourceTokens(source) {
  const tokens = []
  let index = 0

  const emit = (value, origin) => {
    for (const character of value) tokens.push({ character, origin })
  }

  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4)
      emit(' ', index)
      index = end === -1 ? source.length : end + 3
      continue
    }
    if (/^\{\s*\/\*/u.test(source.slice(index))) {
      const end = source.indexOf('*/', index + 2)
      if (end !== -1) {
        const close = /^\s*\}/u.exec(source.slice(end + 2))
        if (close) {
          emit(' ', index)
          index = end + 2 + close[0].length
          continue
        }
      }
    }

    const literal = parseStaticJsxLiteral(source, index)
    if (literal) {
      emit(literal.value, index)
      index = literal.end
      continue
    }

    const tag = parseMarkupTag(source, index)
    if (tag) {
      if (tag.block) emit(' ', index)
      index = tag.end
      continue
    }

    if (source[index] === '&') {
      const entity = /^&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/iu.exec(
        source.slice(index)
      )
      if (entity) {
        const decoded = decodeEntity(entity[0])
        emit(decoded, index)
        index += entity[0].length
        continue
      }
    }

    if (
      source[index] === '\\' &&
      source[index + 1] !== undefined &&
      /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/u.test(source[index + 1])
    ) {
      emit(source[index + 1], index)
      index += 2
      continue
    }

    const codePoint = source.codePointAt(index)
    const character = String.fromCodePoint(codePoint)
    emit(character, index)
    index += character.length
  }

  return tokens
}

function parseStaticJsxLiteral(source, start) {
  if (source[start] !== '{') return null
  let index = start + 1
  while (/\s/u.test(source[index] ?? '')) index += 1
  const quote = source[index]
  if (!['"', "'", '`'].includes(quote)) return null
  index += 1
  let encoded = ''
  let escaped = false
  while (index < source.length) {
    const character = source[index]
    if (!escaped && character === quote) break
    if (quote === '`' && !escaped && source.startsWith('${', index)) return null
    encoded += character
    if (escaped) escaped = false
    else if (character === '\\') escaped = true
    index += 1
  }
  if (source[index] !== quote) return null
  index += 1
  while (/\s/u.test(source[index] ?? '')) index += 1
  if (source[index] !== '}') return null
  return {
    value: decodeJavascriptString(encoded),
    end: index + 1,
  }
}

function decodeJavascriptString(encoded) {
  return encoded.replace(
    /\\(?:u\{([\da-f]{1,6})\}|u([\da-f]{4})|x([\da-f]{2})|([\s\S]))/giu,
    (_match, braced, unicode, hexadecimal, escaped) => {
      const digits = braced ?? unicode ?? hexadecimal
      if (digits !== undefined) {
        const value = Number.parseInt(digits, 16)
        return value <= 0x10ffff ? String.fromCodePoint(value) : '\ufffd'
      }
      return (
        {
          '0': '\0',
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
          v: '\v',
        }[escaped] ?? escaped
      )
    }
  )
}

function parseMarkupTag(source, start) {
  if (source[start] !== '<' || !/^<\/?[A-Za-z]/u.test(source.slice(start))) {
    return null
  }
  let index = start + 1
  let quote = null
  while (index < source.length) {
    const character = source[index]
    if (quote !== null) {
      if (character === quote && source[index - 1] !== '\\') quote = null
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      const name = /^<\/?\s*([A-Za-z][\w.-]*)/u.exec(source.slice(start))?.[1]
      return {
        end: index + 1,
        block: /^(?:address|article|aside|blockquote|br|div|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)$/iu.test(
          name ?? ''
        ),
      }
    }
    index += 1
  }
  return null
}

function followsLineBreak(tokens, start) {
  let sawLineBreak = false
  for (let index = start; index < tokens.length; index += 1) {
    const character = tokens[index].character
    if (!/\s/u.test(character)) break
    if (character === '\n' || character === '\r') sawLineBreak = true
  }
  return sawLineBreak
}

function isMarkdownPresentationMarker(tokens, index) {
  const character = tokens[index].character
  if (character === '_') {
    const previous = tokens[index - 1]?.character ?? ''
    const next = tokens[index + 1]?.character ?? ''
    return !/[\p{L}\p{N}]/u.test(previous) || !/[\p{L}\p{N}]/u.test(next)
  }
  return character === '*' || character === '~' || character === '`'
}

function maskNonProse(text) {
  let masked = text.replace(/\r\n?/gu, (match) =>
    match.length === 2 ? '\n ' : '\n'
  )
  masked = maskMatches(masked, /<!--[^]*?-->/gu)
  masked = maskMatches(masked, /\{\s*\/\*[^]*?\*\/\s*\}/gu)
  masked = maskMatches(masked, /^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[^]*?^ {0,3}\1\s*$/gmu)
  masked = masked.replace(
    /(?<!`)`(?!`)[^`\n]*`/gu,
    (match, offset, whole) =>
      /\{\s*$/u.test(whole.slice(Math.max(0, offset - 16), offset))
        ? match
        : match.replace(/[^\n]/gu, ' ')
  )
  return masked
}

function maskMatches(text, pattern) {
  return text.replace(pattern, (match) => match.replace(/[^\n]/gu, ' '))
}

function extractInlineMarkdownCandidates(text) {
  const candidates = []
  let index = 0

  while (index < text.length) {
    const image = text[index] === '!'
    const open = image ? index + 1 : index
    if (text[open] !== '[') {
      index += 1
      continue
    }

    const labelEnd = findBalancedCharacter(text, open, '[', ']', true)
    if (labelEnd === -1 || text[labelEnd + 1] !== '(') {
      index += 1
      continue
    }
    const destinationEnd = findBalancedCharacter(
      text,
      labelEnd + 1,
      '(',
      ')',
      false
    )
    if (destinationEnd === -1) {
      index += 1
      continue
    }

    const destination = parseMarkdownDestination(
      text.slice(labelEnd + 2, destinationEnd)
    )
    if (destination !== null) {
      candidates.push({
        index,
        end: destinationEnd + 1,
        destination: cleanDestination(destination),
        kind: image ? 'image' : 'link',
      })
    }
    index = destinationEnd + 1
  }

  return candidates
}

function findBalancedCharacter(text, start, open, close, stopAtLineBreak) {
  if (text[start] !== open) return -1
  let depth = 0
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (stopAtLineBreak && (character === '\n' || character === '\r')) return -1
    if (character === open) depth += 1
    else if (character === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function parseMarkdownDestination(content) {
  const value = content.trimStart()
  if (value.length === 0) return null
  if (value[0] === '<') {
    const close = value.indexOf('>')
    return close === -1 ? null : value.slice(1, close)
  }

  let depth = 0
  let destination = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '\\' && value[index + 1] !== undefined) {
      destination += character + value[index + 1]
      index += 1
      continue
    }
    if (/\s/u.test(character) && depth === 0) break
    if (character === '(') depth += 1
    else if (character === ')' && depth > 0) depth -= 1
    destination += character
  }
  return destination || null
}

function extractReferenceDefinitions(text) {
  const definitions = new Map()
  const pattern = /^ {0,3}\[([^\]\n]+)\]:\s*(<[^>\n]*>|\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/gmu
  for (const match of text.matchAll(pattern)) {
    const label = normalizeReferenceLabel(match[1])
    if (!definitions.has(label)) {
      definitions.set(label, {
        destination: cleanDestination(match[2]),
        index: match.index,
        end: match.index + match[0].length,
      })
    }
  }
  return definitions
}

function normalizeReferenceLabel(label) {
  return label.trim().replace(/\s+/gu, ' ').toLowerCase()
}

function cleanDestination(destination) {
  let value = destination.trim()
  if (value.startsWith('<') && value.endsWith('>')) value = value.slice(1, -1)
  return value
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/giu, decodeEntity)
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/gu, '$1')
    .replace(/\p{Default_Ignorable_Code_Point}/gu, '')
}

function locationAt(text, index) {
  const before = text.slice(0, index)
  const lines = before.split(/\r\n?|\n/u)
  return {
    line: lines.length,
    column: [...(lines.at(-1) ?? '')].length + 1,
  }
}

function normalizeRoute(pathname) {
  const withoutQuery = pathname.split(/[?#]/u, 1)[0] || '/'
  let decoded = withoutQuery
  try {
    decoded = decodeURI(withoutQuery)
  } catch {
    // Keep the original path so malformed escapes cannot accidentally match a route.
  }
  const normalized = posix.normalize(decoded.startsWith('/') ? decoded : `/${decoded}`)
  return normalized === '/' ? '/' : normalized.replace(/\/+$/u, '')
}

function explicitScheme(destination) {
  const compact = destination
    .slice(0, 64)
    .replace(/[\u0000-\u0020\u007f]+/gu, '')
  const match = /^([a-z][a-z\d+.-]*):/iu.exec(compact)
  return match?.[1].toLowerCase() ?? null
}

function linkDiagnostic(path, link, code, message) {
  return {
    path,
    line: link.line,
    column: link.column,
    code,
    message,
  }
}

function hasTypedFirstUse(text, packageName) {
  const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const fences = text.matchAll(
    /^ {0,3}```(?:ts|tsx|typescript)\s+typecheck\s*\n([^]*?)^ {0,3}```\s*$/gmu
  )
  const importPattern = new RegExp(
    `(?:from\\s*|import\\s*\\(\\s*)['"]${escapedPackage}['"]`,
    'u'
  )
  return [...fences].some((match) => importPattern.test(match[1]))
}

function hasExactInstallCommand(text, packageName) {
  const expected = `npm install ${packageName}`
  for (const match of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/gu)) {
    if (match[1].trim() === expected) return true
  }
  for (const line of text.split(/\r\n?|\n/u)) {
    const command = line.trim().replace(/^\$\s*/u, '')
    if (command === expected) return true
  }
  return false
}

function hasTypedCliRun(text) {
  const programs = extractTypedReadmePrograms(text)
  const runLocals = new Set()
  let hasCliIo = false

  for (const program of programs) {
    const imports =
      program.matchAll(
        /import\s+(type\s+)?\{([^}]*)\}\s+from\s*['"]@glucoseiq\/cli['"]/gu
      )
    for (const declaration of imports) {
      const declarationIsTypeOnly = declaration[1] !== undefined
      for (const rawSpecifier of declaration[2].split(',')) {
        const specifier = rawSpecifier.trim()
        const parsed = /^(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/u.exec(
          specifier
        )
        if (!parsed) continue
        const specifierIsTypeOnly = declarationIsTypeOnly || parsed[1] !== undefined
        const imported = parsed[2]
        const local = parsed[3] ?? imported
        if (imported === 'CliIO') hasCliIo = true
        if (imported === 'run' && !specifierIsTypeOnly) runLocals.add(local)
      }
    }
  }

  if (!hasCliIo || runLocals.size === 0) return false
  return programs.some((program) =>
    [...runLocals].some((local) =>
      new RegExp(`\\b${escapeRegExp(local)}\\s*\\(`, 'u').test(program)
    )
  )
}

function hasExactCliFlagList(text) {
  const list = /\bFlags\s+are\s+([^.]*)\./iu.exec(text)?.[1]
  if (list === undefined) return false
  const actual = list.match(/--[a-z][a-z-]*/gu) ?? []
  const expected = [
    '--timestamp-col',
    '--value-col',
    '--unit',
    '--delimiter',
    '--timezone',
    '--json',
    '--agp-svg',
    '--help',
  ]
  return (
    actual.length === expected.length &&
    [...actual].sort(compareText).every(
      (flag, index) => flag === [...expected].sort(compareText)[index]
    )
  )
}

function extractTypedReadmePrograms(text) {
  return [
    ...text.matchAll(
      /^ {0,3}```(?:ts|tsx|typescript)\s+typecheck\s*\n([^]*?)^ {0,3}```\s*$/gmu
    ),
  ].map((match) => match[1])
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function listTrackedFiles(repoRoot) {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
}

function cachedTrackedFiles(repoRoot) {
  if (!TRACKED_FILE_CACHE.has(repoRoot)) {
    TRACKED_FILE_CACHE.set(repoRoot, listTrackedFiles(repoRoot))
  }
  return TRACKED_FILE_CACHE.get(repoRoot)
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0
}

function numberOrOne(value) {
  return Number.isInteger(value) && value > 0 ? value : 1
}
