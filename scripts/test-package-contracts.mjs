import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PACKAGE_README_CONTRACTS,
  createPublicInventory,
  createTrackedDocsRoutes,
  findClaimViolations,
  formatContractDiagnostics,
  validateDocumentLinks,
  validateReadmeContract,
} from './lib/doc-contracts.mjs'
import { assertValidPackageVersions } from './lib/package-contracts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reactRequire = createRequire(join(root, 'packages/react/package.json'))
const ts = reactRequire('typescript')
const fixturePath = join(root, 'scripts/fixtures/diabetic-utils-1.5-exports.json')
const legacyExports = JSON.parse(readFileSync(fixturePath, 'utf8'))
const readmeContracts = new Map(
  PACKAGE_README_CONTRACTS.map((contract) => [contract.packageName, contract]),
)
const trackedDocsRoutes = createTrackedDocsRoutes(createPublicInventory({ repoRoot: root }))

const packageSpecs = [
  { directory: 'packages/core', name: '@glucoseiq/core', scoped: true },
  { directory: 'packages/react', name: '@glucoseiq/react', scoped: true, coreDependency: true },
  { directory: 'packages/tokens', name: '@glucoseiq/tokens', scoped: true },
  { directory: 'packages/testing', name: '@glucoseiq/testing', scoped: true, coreDependency: true },
  { directory: 'packages/cli', name: '@glucoseiq/cli', scoped: true, coreDependency: true },
  { directory: 'packages/diabetic-utils', name: 'diabetic-utils', coreDependency: true },
]
assert.deepEqual(
  [...readmeContracts.keys()].sort(),
  packageSpecs.map(({ name }) => name).sort(),
  'the packed-package matrix and shared README contracts must cover the same packages',
)
const publicEntrypoints = [
  '@glucoseiq/core',
  '@glucoseiq/core/metrics',
  '@glucoseiq/core/connectors',
  '@glucoseiq/core/interop',
  '@glucoseiq/core/render',
  '@glucoseiq/react',
  '@glucoseiq/tokens',
  '@glucoseiq/testing',
  '@glucoseiq/cli',
  'diabetic-utils',
]
const reactConsumers = [
  { label: 'React 18', react: '18.3.1', reactTypes: '18.3.31' },
  { label: 'React 19', react: '19.2.7', reactTypes: '19.2.17' },
]
const reactRuntimeExports = [
  'AgpChart',
  'TirBar',
  'TrendTile',
  'useAGPProfile',
  'useGlucoseAnalysis',
  'useGlucoseIQScore',
  'useGlucoseLive',
  'useMealResponse',
]
const renderRuntimeExports = [
  'agpChartToSVG',
  'tirBarToSVG',
  'trendTileToSVG',
]
const renderTypeExports = [
  'AGPChartOptions',
  'TIRBarOptions',
  'TrendTileOptions',
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  })

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${output}`)
  }

  return result.stdout.trim()
}

function assertCommandFailure(command, args, expectedMessage, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
  })

  assert.equal(result.error, undefined, `${options.label} must execute`)
  assert.equal(result.signal, null, `${options.label} must not terminate from a signal`)
  assert.equal(result.status, 1, `${options.label} exit status`)
  assert.equal(result.stdout, '', `${options.label} stdout`)
  const stderrMatch = /^([^\r\n\u2028\u2029]+)(?:\r?\n)?(?![\s\S])/u.exec(result.stderr)
  assert.ok(stderrMatch, `${options.label} must emit exactly one nonempty stderr line`)
  const stderr = stderrMatch[1]
  assert.match(stderr, expectedMessage, `${options.label} stderr`)
  assert.doesNotMatch(stderr, /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u, `${options.label} unsafe stderr controls`)
  assert.doesNotMatch(stderr, /^(?:Error|TypeError|RangeError)(?:\s|\[|:)/, `${options.label} stack prefix`)
  assert.doesNotMatch(stderr, /\bat\s+\S+\s+\(/, `${options.label} stack frame`)
}

function assertTypeRoute(exportTarget, label) {
  assert.equal(exportTarget.import.types, './dist/index.d.mts', `${label} import types`)
  assert.equal(exportTarget.require.types, './dist/index.d.ts', `${label} require types`)
  assert.match(exportTarget.import.default, /\.mjs$/, `${label} ESM runtime`)
  assert.match(exportTarget.require.default, /\.js$/, `${label} CommonJS runtime`)
}

function firstDirective(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  )
  const first = sourceFile.statements[0]
  if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression)) {
    return undefined
  }
  return first.expression.text
}

function renderDeclarationExports(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const runtime = []
  const types = []

  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue
    }

    for (const element of statement.exportClause.elements) {
      const target = statement.isTypeOnly || element.isTypeOnly ? types : runtime
      target.push(element.name.text)
    }
  }

  return {
    runtime: runtime.sort(),
    types: types.sort(),
  }
}

function assertRenderDeclarationSurface(packedRoot) {
  for (const file of ['index.d.mts', 'index.d.ts']) {
    const declarationPath = join(packedRoot, 'dist/render', file)
    const source = readFileSync(declarationPath, 'utf8')
    assert.doesNotMatch(
      source,
      /svg-options/u,
      `${file} must not reference the private SVG option helper`,
    )
    assert.deepEqual(
      renderDeclarationExports(source, file),
      {
        runtime: [...renderRuntimeExports].sort(),
        types: [...renderTypeExports].sort(),
      },
      `${file} exact render declaration exports`,
    )
  }
}

assert.equal(legacyExports.length, 107, 'the diabetic-utils 1.5 fixture must contain 107 exports')
assert.equal(new Set(legacyExports).size, 107, 'the diabetic-utils 1.5 fixture must not contain duplicates')

const sourceManifests = new Map(
  packageSpecs.map((spec) => {
    const manifest = JSON.parse(readFileSync(join(root, spec.directory, 'package.json'), 'utf8'))
    assert.equal(manifest.name, spec.name)
    assert.equal(manifest.engines?.node, '>=24', `${spec.name} Node support`)
    assert.ok(
      manifest.files?.includes('README.md'),
      `${spec.name} source manifest must explicitly pack README.md`,
    )
    assertTypeRoute(manifest.exports['.'], spec.name)

    if (spec.scoped) {
      assert.equal(manifest.publishConfig?.access, 'public', `${spec.name} must publish publicly`)
    }

    if (spec.coreDependency) {
      assert.equal(manifest.dependencies?.['@glucoseiq/core'], 'workspace:^', `${spec.name} workspace dependency`)
    }

    return [spec.name, manifest]
  }),
)

assertValidPackageVersions(sourceManifests)
const coreVersion = sourceManifests.get('@glucoseiq/core').version

const reactManifest = sourceManifests.get('@glucoseiq/react')
assert.deepEqual(Object.keys(reactManifest.exports), ['.'], 'React source entrypoints')
assert.equal(reactManifest.peerDependencies?.react, '>=18', 'React 18 and 19 must satisfy the peer range')
assert.equal(reactManifest.dependencies?.react, undefined, 'React must not be a runtime dependency')
assert.equal(reactManifest.optionalDependencies?.react, undefined, 'React must not be an optional dependency')
assert.equal(reactManifest.dependencies?.['@glucoseiq/core'], 'workspace:^', 'React source core dependency')

const temporaryRoot = mkdtempSync(join(tmpdir(), 'glucoseiq-packages-'))

try {
  const packedManifests = new Map()
  const packedRoots = new Map()
  const tarballs = new Map()
  const packedReadmeDiagnostics = []

  for (const spec of packageSpecs) {
    const packRoot = join(temporaryRoot, spec.name.replaceAll('/', '-').replace('@', ''))
    mkdirSync(packRoot, { recursive: true })
    run('pnpm', ['--dir', join(root, spec.directory), 'pack', '--pack-destination', packRoot])

    const archives = readdirSync(packRoot).filter((entry) => entry.endsWith('.tgz'))
    assert.equal(archives.length, 1, `${spec.name} must produce one tarball`)
    const archivePath = join(packRoot, archives[0])
    run('tar', ['-xzf', archivePath, '-C', packRoot])

    const packedRoot = join(packRoot, 'package')
    const packedReadmePath = join(packedRoot, 'README.md')
    const sourceReadmePath = join(root, spec.directory, 'README.md')
    const manifestText = readFileSync(join(packedRoot, 'package.json'), 'utf8')
    const readmeText = readFileSync(packedReadmePath, 'utf8')
    const sourceReadmeText = readFileSync(sourceReadmePath, 'utf8')
    assert.equal(
      readmeText,
      sourceReadmeText,
      `${spec.name} packed README must byte-match its compiler-checked source README`,
    )
    const packedManifest = JSON.parse(manifestText)
    assert.equal(manifestText.includes('workspace:'), false, `${spec.name} tarball must not contain workspace dependencies`)
    assertTypeRoute(packedManifest.exports['.'], `${spec.name} tarball`)

    if (spec.coreDependency) {
      assert.equal(
        packedManifest.dependencies?.['@glucoseiq/core'],
        `^${coreVersion}`,
        `${spec.name} tarball core dependency`,
      )
    }

    const readmeContract = readmeContracts.get(spec.name)
    assert.ok(readmeContract, `${spec.name} must have one shared README contract`)
    const diagnosticPath = `packed/${spec.name}/README.md`
    packedReadmeDiagnostics.push(
      ...findClaimViolations({ path: diagnosticPath, text: readmeText }),
      ...validateReadmeContract({
        ...readmeContract,
        path: diagnosticPath,
        text: readmeText,
      }),
      ...validateDocumentLinks({
        path: diagnosticPath,
        text: readmeText,
        trackedRoutes: trackedDocsRoutes,
        publishedReadme: true,
      }),
    )

    packedManifests.set(spec.name, packedManifest)
    packedRoots.set(spec.name, packedRoot)
    tarballs.set(spec.name, archivePath)
  }

  assert.equal(
    packedReadmeDiagnostics.length,
    0,
    formatContractDiagnostics(packedReadmeDiagnostics),
  )

  assert.equal(packedManifests.get('@glucoseiq/cli').bin?.glucoseiq, './dist/bin.js')
  const packedReactManifest = packedManifests.get('@glucoseiq/react')
  assert.deepEqual(Object.keys(packedReactManifest.exports), ['.'], 'React packed entrypoints')
  assert.equal(packedReactManifest.peerDependencies?.react, '>=18', 'React packed peer range')
  assert.equal(packedReactManifest.dependencies?.react, undefined, 'React packed runtime dependencies')
  assert.equal(
    packedReactManifest.optionalDependencies?.react,
    undefined,
    'React packed optional dependencies',
  )
  assert.equal(
    packedReactManifest.dependencies?.['@glucoseiq/core'],
    `^${coreVersion}`,
    'React packed core dependency',
  )

  assertRenderDeclarationSurface(packedRoots.get('@glucoseiq/core'))

  const packedReactRoot = packedRoots.get('@glucoseiq/react')
  const packedReactDirectives = [
    ['ESM', 'dist/index.mjs'],
    ['CommonJS', 'dist/index.js'],
  ].map(([format, file]) => ({
    format,
    directive: firstDirective(readFileSync(join(packedReactRoot, file), 'utf8'), file),
  }))
  assert.deepEqual(
    packedReactDirectives,
    [
      { format: 'ESM', directive: 'use client' },
      { format: 'CommonJS', directive: 'use client' },
    ],
    'React packed runtimes must begin with the client directive',
  )

  const inspectModules = (loader) => `
    const names = ${JSON.stringify(publicEntrypoints)};
    const modules = await Promise.all(names.map((name) => ${loader}));
    console.log(JSON.stringify(modules.map((module, index) => [names[index], Object.keys(module).sort()])));
  `
  const cjsCode = `
    const names = ${JSON.stringify(publicEntrypoints)};
    const modules = names.map((name) => require(name));
    console.log(JSON.stringify(modules.map((module, index) => [names[index], Object.keys(module).sort()])));
  `
  const compatibilityCode = `
    const module = require('diabetic-utils');
    console.log(JSON.stringify({
      exports: Object.keys(module).sort(),
      conversion: module.mgDlToMmolL(180),
      timeInRange: module.calculateTimeInRange([54, 70, 120, 180, 250], 70, 180),
      gmi: module.estimateGMI(154, module.MG_DL),
    }));
  `
  const tirPaletteCode = `
    import { tirBarToSVG } from '@glucoseiq/core/render';
    import { GLUCOSE_ZONES, ZONE_PALETTE } from '@glucoseiq/tokens';

    const values = {
      veryLow: 40,
      low: 60,
      inRange: 100,
      high: 200,
      veryHigh: 300,
    };
    const actual = Object.fromEntries(GLUCOSE_ZONES.map((zone) => {
      const svg = tirBarToSVG([{
        value: values[zone],
        unit: 'mg/dL',
        timestamp: '2024-01-01T00:00:00.000Z',
      }], { theme: 'dark' });
      const visibleSegments = [...svg.matchAll(/<rect x="16"[^>]*height="([0-9.]+)"[^>]*fill="(#[0-9a-f]{6})"/g)]
        .filter((match) => Number(match[1]) > 0);
      if (visibleSegments.length !== 1) {
        throw new Error(\`Expected one visible TIR segment for \${zone}, received \${visibleSegments.length}\`);
      }
      return [zone, visibleSegments[0][2]];
    }));
    console.log(JSON.stringify({ actual, expected: ZONE_PALETTE.dark }));
  `
  const errorContractBody = `
    const cases = [
      [GlucoseIQError, new GlucoseIQError('base failure', 'INVALID_OPTION')],
      [ParseError, new ParseError('parse failure', 'PARSE_FAILED')],
      [DomainError, new DomainError('domain failure', 'INVALID_GLUCOSE_VALUE')],
      [EmptyDatasetError, new EmptyDatasetError('empty failure')],
      [TimestampError, new TimestampError('timestamp failure')],
    ];
    console.log(JSON.stringify(cases.map(([Type, error]) => ({
      name: error.name,
      code: error.code,
      message: error.message,
      isError: error instanceof Error,
      isBase: error instanceof GlucoseIQError,
      isOwnType: error instanceof Type,
      hasExpectedBasePrototype: Type === GlucoseIQError
        ? Object.getPrototypeOf(Type.prototype) === Error.prototype
        : Object.getPrototypeOf(Type.prototype) === GlucoseIQError.prototype,
    }))));
  `
  const esmErrorContractCode = `
    import {
      DomainError,
      EmptyDatasetError,
      GlucoseIQError,
      ParseError,
      TimestampError,
    } from '@glucoseiq/core';
    ${errorContractBody}
  `
  const cjsErrorContractCode = `
    const {
      DomainError,
      EmptyDatasetError,
      GlucoseIQError,
      ParseError,
      TimestampError,
    } = require('@glucoseiq/core');
    ${errorContractBody}
  `
  const csvContractBody = `
    const capture = (call) => {
      try {
        return { value: call() };
      } catch (error) {
        return { error: { name: error.name, code: error.code, message: error.message } };
      }
    };
    const options = { timestampColumn: 't', valueColumn: 'v' };
    console.log(JSON.stringify({
      invalidEmpty: capture(() => parseGlucoseCSV('', { ...options, delimiter: '||' })),
      headerOnly: capture(() => parseGlucoseCSV('t,v', options)),
      missingColumnHeaderOnly: capture(() => parseGlucoseCSV('t,other', options)),
      bomCrLf: capture(() => parseGlucoseCSV(
        '\\ufefft,v\\r\\n2024-01-01T08:00:00Z,120\\r\\n',
        options,
      )),
      quoted: capture(() => parseGlucoseCSV(
        '\"Time, local\",\"Val\"\"ue\"\\n\"2024-01-01T08:00:00Z\",\"125\"',
        { timestampColumn: 'Time, local', valueColumn: 'Val\"ue' },
      )),
      custom: capture(() => parseGlucoseCSV(
        't;v\\n2024-01-01T08:00:00Z;130',
        { ...options, delimiter: ';' },
      )),
    }));
  `
  const esmCsvContractCode = `
    import { parseGlucoseCSV } from '@glucoseiq/core';
    ${csvContractBody}
  `
  const cjsCsvContractCode = `
    const { parseGlucoseCSV } = require('@glucoseiq/core');
    ${csvContractBody}
  `
  const a1cCategoryContractBody = `
    const captureCategory = (call) => {
      try {
        return { value: call() };
      } catch (error) {
        return { error: error.name };
      }
    };
    const evaluateCategoryContract = (getA1CCategory) => {
      const thresholdSymbol = Symbol('threshold');
      const earlyAccesses = [];
      let earlyNormalReads = 0;
      let earlyPrediabetesReads = 0;
      const earlyThresholds = Object.defineProperties({}, {
        normalMax: {
          get() {
            earlyAccesses.push('normalMax');
            earlyNormalReads += 1;
            return 6;
          },
        },
        prediabetesMax: {
          get() {
            earlyAccesses.push('prediabetesMax');
            earlyPrediabetesReads += 1;
            return 7;
          },
        },
      });
      const earlyCategory = getA1CCategory(5.5, earlyThresholds);

      const invalidAccesses = [];
      let invalidCoercions = 0;
      const hostileA1C = {
        [Symbol.toPrimitive]() {
          invalidCoercions += 1;
          return 6;
        },
        valueOf() {
          invalidCoercions += 1;
          return 6;
        },
        toString() {
          invalidCoercions += 1;
          return '6';
        },
      };
      const invalidThresholds = Object.defineProperties({}, {
        normalMax: {
          get() {
            invalidAccesses.push('normalMax');
            return thresholdSymbol;
          },
        },
        prediabetesMax: {
          get() {
            invalidAccesses.push('prediabetesMax');
            return thresholdSymbol;
          },
        },
      });
      const invalidCategory = getA1CCategory(hostileA1C, invalidThresholds);

      return {
        defaults: {
          belowNormal: getA1CCategory(5.699999999999999),
          normalBoundary: getA1CCategory(5.7),
          belowDiabetes: getA1CCategory(6.499999999999999),
          diabetesBoundary: getA1CCategory(6.5),
          aboveDiabetes: getA1CCategory(6.500000000000001),
        },
        custom: {
          normalOnlyEquality: getA1CCategory(6, { normalMax: 6 }),
          prediabetesOnlyEquality: getA1CCategory(7, { prediabetesMax: 7 }),
          bothNormalEquality: getA1CCategory(6, { normalMax: 6, prediabetesMax: 7 }),
          bothPrediabetesEquality: getA1CCategory(7, { normalMax: 6, prediabetesMax: 7 }),
        },
        nullish: {
          undefinedNormal: getA1CCategory(5.7, { normalMax: undefined, prediabetesMax: 7 }),
          undefinedNormalInterior: getA1CCategory(5.6, { normalMax: undefined, prediabetesMax: 7 }),
          undefinedPrediabetes: getA1CCategory(6.5, { normalMax: 6, prediabetesMax: undefined }),
          undefinedPrediabetesInterior: getA1CCategory(6, { normalMax: 5.5, prediabetesMax: undefined }),
          nullNormal: getA1CCategory(5.7, { normalMax: null, prediabetesMax: 7 }),
          nullNormalInterior: getA1CCategory(5.6, { normalMax: null, prediabetesMax: 7 }),
          nullPrediabetes: getA1CCategory(6.5, { normalMax: 6, prediabetesMax: null }),
          nullPrediabetesInterior: getA1CCategory(6, { normalMax: 5.5, prediabetesMax: null }),
          nullThresholdsAtNormal: getA1CCategory(5.7, null),
          nullThresholdsAtDiabetes: getA1CCategory(6.5, null),
        },
        runtimeValues: {
          zeroNormal: getA1CCategory(5.6, { normalMax: 0 }),
          nanPrediabetes: getA1CCategory(6, { prediabetesMax: Number.NaN }),
          numericStringNormal: getA1CCategory(6, { normalMax: '6' }),
          numericStringPrediabetes: getA1CCategory(7, { prediabetesMax: '7' }),
          infiniteNormal: getA1CCategory(19.999, { normalMax: Infinity }),
          infinitePrediabetes: getA1CCategory(19.999, { prediabetesMax: Infinity }),
        },
        symbols: {
          skippedPrediabetes: captureCategory(() =>
            getA1CCategory(5.6, { prediabetesMax: thresholdSymbol })),
          reachedNormal: captureCategory(() =>
            getA1CCategory(6, { normalMax: thresholdSymbol })),
          reachedPrediabetes: captureCategory(() =>
            getA1CCategory(6, { prediabetesMax: thresholdSymbol })),
          invalid: captureCategory(() => getA1CCategory(-1, {
            normalMax: thresholdSymbol,
            prediabetesMax: thresholdSymbol,
          })),
        },
        earlyGetters: {
          category: earlyCategory,
          accesses: earlyAccesses,
          normalReads: earlyNormalReads,
          prediabetesReads: earlyPrediabetesReads,
        },
        invalidInput: {
          category: invalidCategory,
          accesses: invalidAccesses,
          coercions: invalidCoercions,
        },
      };
    };
    console.log(JSON.stringify({
      core: evaluateCategoryContract(coreGetA1CCategory),
      compatibility: evaluateCategoryContract(compatibilityGetA1CCategory),
    }));
  `
  const esmA1CCategoryContractCode = `
    import { getA1CCategory as coreGetA1CCategory } from '@glucoseiq/core';
    import { getA1CCategory as compatibilityGetA1CCategory } from 'diabetic-utils';
    ${a1cCategoryContractBody}
  `
  const cjsA1CCategoryContractCode = `
    const { getA1CCategory: coreGetA1CCategory } = require('@glucoseiq/core');
    const { getA1CCategory: compatibilityGetA1CCategory } = require('diabetic-utils');
    ${a1cCategoryContractBody}
  `
  const expectedCsvContract = {
    invalidEmpty: {
      error: {
        name: 'DomainError',
        code: 'INVALID_OPTION',
        message:
          'parseGlucoseCSV: delimiter must be exactly one character other than double quote, NUL, CR, or LF',
      },
    },
    headerOnly: { value: [] },
    missingColumnHeaderOnly: {
      error: {
        name: 'ParseError',
        code: 'CSV_COLUMN_NOT_FOUND',
        message: 'parseGlucoseCSV: column not found (timestamp="t", value="v")',
      },
    },
    bomCrLf: {
      value: [
        { value: 120, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00.000Z' },
      ],
    },
    quoted: {
      value: [
        { value: 125, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00.000Z' },
      ],
    },
    custom: {
      value: [
        { value: 130, unit: 'mg/dL', timestamp: '2024-01-01T08:00:00.000Z' },
      ],
    },
  }
  const expectedA1CCategoryValues = {
    defaults: {
      belowNormal: 'normal',
      normalBoundary: 'prediabetes',
      belowDiabetes: 'prediabetes',
      diabetesBoundary: 'diabetes',
      aboveDiabetes: 'diabetes',
    },
    custom: {
      normalOnlyEquality: 'normal',
      prediabetesOnlyEquality: 'prediabetes',
      bothNormalEquality: 'normal',
      bothPrediabetesEquality: 'prediabetes',
    },
    nullish: {
      undefinedNormal: 'prediabetes',
      undefinedNormalInterior: 'normal',
      undefinedPrediabetes: 'diabetes',
      undefinedPrediabetesInterior: 'prediabetes',
      nullNormal: 'prediabetes',
      nullNormalInterior: 'normal',
      nullPrediabetes: 'diabetes',
      nullPrediabetesInterior: 'prediabetes',
      nullThresholdsAtNormal: 'prediabetes',
      nullThresholdsAtDiabetes: 'diabetes',
    },
    runtimeValues: {
      zeroNormal: 'prediabetes',
      nanPrediabetes: 'diabetes',
      numericStringNormal: 'normal',
      numericStringPrediabetes: 'prediabetes',
      infiniteNormal: 'normal',
      infinitePrediabetes: 'prediabetes',
    },
    symbols: {
      skippedPrediabetes: { value: 'normal' },
      reachedNormal: { error: 'TypeError' },
      reachedPrediabetes: { error: 'TypeError' },
      invalid: { value: 'invalid' },
    },
    earlyGetters: {
      category: 'normal',
      accesses: ['normalMax', 'prediabetesMax'],
      normalReads: 1,
      prediabetesReads: 1,
    },
    invalidInput: {
      category: 'invalid',
      accesses: ['normalMax', 'prediabetesMax'],
      coercions: 0,
    },
  }
  const expectedA1CCategoryContract = {
    core: expectedA1CCategoryValues,
    compatibility: expectedA1CCategoryValues,
  }
  const expectedErrorContract = [
    {
      name: 'GlucoseIQError',
      code: 'INVALID_OPTION',
      message: 'base failure',
      isError: true,
      isBase: true,
      isOwnType: true,
      hasExpectedBasePrototype: true,
    },
    {
      name: 'ParseError',
      code: 'PARSE_FAILED',
      message: 'parse failure',
      isError: true,
      isBase: true,
      isOwnType: true,
      hasExpectedBasePrototype: true,
    },
    {
      name: 'DomainError',
      code: 'INVALID_GLUCOSE_VALUE',
      message: 'domain failure',
      isError: true,
      isBase: true,
      isOwnType: true,
      hasExpectedBasePrototype: true,
    },
    {
      name: 'EmptyDatasetError',
      code: 'EMPTY_DATASET',
      message: 'empty failure',
      isError: true,
      isBase: true,
      isOwnType: true,
      hasExpectedBasePrototype: true,
    },
    {
      name: 'TimestampError',
      code: 'TIMESTAMP_UNPARSEABLE',
      message: 'timestamp failure',
      isError: true,
      isBase: true,
      isOwnType: true,
      hasExpectedBasePrototype: true,
    },
  ]
  const esmSource = `
    import * as core from '@glucoseiq/core'
    import * as metrics from '@glucoseiq/core/metrics'
    import * as connectors from '@glucoseiq/core/connectors'
    import * as interop from '@glucoseiq/core/interop'
    import * as render from '@glucoseiq/core/render'
    import * as reactAdapter from '@glucoseiq/react'
    import * as tokens from '@glucoseiq/tokens'
    import * as testing from '@glucoseiq/testing'
    import * as cli from '@glucoseiq/cli'
    import * as compatibility from 'diabetic-utils'
    import type { GlucoseUnit } from '@glucoseiq/core'
    import type { ChartBaseProps, GlucoseLive, GlucoseLiveOptions } from '@glucoseiq/react'
    const unit: GlucoseUnit = 'mg/dL'
    const readings: core.GlucoseReading[] = []
    const patients: core.GlucoseReading[][] = []
    const chartProps: ChartBaseProps = { readings }
    const liveOptions: GlucoseLiveOptions = {}
    const liveResult = null as unknown as GlucoseLive
    const errors = [
      new core.GlucoseIQError('base failure', 'INVALID_OPTION'),
      new core.ParseError('parse failure', 'PARSE_FAILED'),
      new core.DomainError('domain failure', 'INVALID_GLUCOSE_VALUE'),
      new core.EmptyDatasetError('empty failure'),
      new core.TimestampError('timestamp failure'),
    ]
    core.calculatePregnancyTIR(readings, { unit: 'mmol/L' })
    // @ts-expect-error Each reading already carries its unit.
    core.calculateEnhancedTIR(readings, { unit: 'mg/dL' })
    // @ts-expect-error Each reading already carries its unit.
    metrics.detectEpisodes(readings, { unit: 'mg/dL' })
    // @ts-expect-error Each reading already carries its unit.
    metrics.calculateGVIPGS(readings, { unit: 'mg/dL' })
    // @ts-expect-error Each reading already carries its unit.
    core.analyzeGlucose(readings, { unit: 'mg/dL' })
    // @ts-expect-error aggregateCohort has no options.
    core.aggregateCohort(patients, {})
    // @ts-expect-error glucoseIQScore has no options.
    core.glucoseIQScore(readings, {})
    // @ts-expect-error Each reading already carries its unit.
    reactAdapter.useGlucoseAnalysis(readings, { unit: 'mg/dL' })
    // @ts-expect-error The score hook has no options.
    reactAdapter.useGlucoseIQScore(readings, {})
    // @ts-expect-error CohortOptions was removed before 1.0.
    type RemovedCohortOptions = import('@glucoseiq/core').CohortOptions
    // @ts-expect-error GlucoseIQOptions was removed before 1.0.
    type RemovedGlucoseIQOptions = import('@glucoseiq/core').GlucoseIQOptions
    void [core, metrics, connectors, interop, render, reactAdapter, tokens, testing, cli, compatibility, unit, readings, patients, chartProps, liveOptions, liveResult, errors]
  `
  const cjsSource = `
    import core = require('@glucoseiq/core')
    import metrics = require('@glucoseiq/core/metrics')
    import connectors = require('@glucoseiq/core/connectors')
    import interop = require('@glucoseiq/core/interop')
    import render = require('@glucoseiq/core/render')
    import reactAdapter = require('@glucoseiq/react')
    import tokens = require('@glucoseiq/tokens')
    import testing = require('@glucoseiq/testing')
    import cli = require('@glucoseiq/cli')
    import compatibility = require('diabetic-utils')
    import type { ChartBaseProps, GlucoseLive, GlucoseLiveOptions } from '@glucoseiq/react'
    const reactTypes = null as unknown as [ChartBaseProps, GlucoseLive, GlucoseLiveOptions]
    const errors = [
      new core.GlucoseIQError('base failure', 'INVALID_OPTION'),
      new core.ParseError('parse failure', 'PARSE_FAILED'),
      new core.DomainError('domain failure', 'INVALID_GLUCOSE_VALUE'),
      new core.EmptyDatasetError('empty failure'),
      new core.TimestampError('timestamp failure'),
    ]
    void [core, metrics, connectors, interop, render, reactAdapter, tokens, testing, cli, compatibility, reactTypes, errors]
  `
  const tsc = join(root, 'packages/core/node_modules/typescript/bin/tsc')
  const sharedTypeArgs = ['--noEmit', '--strict', '--skipLibCheck', 'false', '--target', 'ES2022']

  for (const consumer of reactConsumers) {
    const consumerRoot = join(temporaryRoot, `consumer-react-${consumer.react.split('.')[0]}`)
    mkdirSync(consumerRoot, { recursive: true })
    const dependencies = Object.fromEntries(
      packageSpecs.map((spec) => [spec.name, `file:${tarballs.get(spec.name)}`]),
    )
    Object.assign(dependencies, {
      react: consumer.react,
      'react-dom': consumer.react,
      '@types/react': consumer.reactTypes,
    })
    writeFileSync(
      join(consumerRoot, 'package.json'),
      `${JSON.stringify({ private: true, type: 'module', dependencies }, null, 2)}\n`,
    )
    run(
      'npm',
      ['install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund', '--loglevel=error'],
      { cwd: consumerRoot },
    )

    const esmKeys = JSON.parse(
      run('node', ['--input-type=module', '--eval', inspectModules('import(name)')], { cwd: consumerRoot }),
    )
    const cjsKeys = JSON.parse(run('node', ['--input-type=commonjs', '--eval', cjsCode], { cwd: consumerRoot }))
    assert.deepEqual(
      cjsKeys,
      esmKeys,
      `${consumer.label} ESM and CommonJS entrypoints must expose the same runtime names`,
    )
    for (const [entrypoint, keys] of esmKeys) {
      assert.ok(keys.length > 0, `${consumer.label} ${entrypoint} must expose runtime exports`)
    }
    const esmRenderExports = esmKeys.find(
      ([entrypoint]) => entrypoint === '@glucoseiq/core/render',
    )?.[1]
    const cjsRenderExports = cjsKeys.find(
      ([entrypoint]) => entrypoint === '@glucoseiq/core/render',
    )?.[1]
    assert.deepEqual(
      esmRenderExports,
      renderRuntimeExports,
      `${consumer.label} ESM render runtime exports`,
    )
    assert.deepEqual(
      cjsRenderExports,
      renderRuntimeExports,
      `${consumer.label} CommonJS render runtime exports`,
    )
    const packedReactExports = esmKeys.find(([entrypoint]) => entrypoint === '@glucoseiq/react')?.[1]
    assert.deepEqual(
      packedReactExports,
      reactRuntimeExports,
      `${consumer.label} React runtime exports`,
    )

    for (const [format, source, inputType] of [
      ['ESM', esmErrorContractCode, 'module'],
      ['CommonJS', cjsErrorContractCode, 'commonjs'],
    ]) {
      const errorContract = JSON.parse(
        run('node', ['--input-type', inputType, '--eval', source], {
          cwd: consumerRoot,
        }),
      )
      assert.deepEqual(
        errorContract,
        expectedErrorContract,
        `${consumer.label} ${format} error contract`,
      )
    }

    for (const [format, source, inputType] of [
      ['ESM', esmCsvContractCode, 'module'],
      ['CommonJS', cjsCsvContractCode, 'commonjs'],
    ]) {
      const csvContract = JSON.parse(
        run('node', ['--input-type', inputType, '--eval', source], {
          cwd: consumerRoot,
        }),
      )
      assert.deepEqual(
        csvContract,
        expectedCsvContract,
        `${consumer.label} ${format} CSV contract`,
      )
    }

    for (const [format, source, inputType] of [
      ['ESM', esmA1CCategoryContractCode, 'module'],
      ['CommonJS', cjsA1CCategoryContractCode, 'commonjs'],
    ]) {
      const a1cCategoryContract = JSON.parse(
        run('node', ['--input-type', inputType, '--eval', source], {
          cwd: consumerRoot,
        }),
      )
      assert.deepEqual(
        a1cCategoryContract,
        expectedA1CCategoryContract,
        `${consumer.label} ${format} packed A1C category contract`,
      )
    }

    const compatibility = JSON.parse(
      run('node', ['--input-type=commonjs', '--eval', compatibilityCode], { cwd: consumerRoot }),
    )
    const missingLegacyExports = legacyExports.filter((name) => !compatibility.exports.includes(name))
    assert.deepEqual(
      missingLegacyExports,
      [],
      `${consumer.label} compatibility package must preserve every diabetic-utils 1.5 export`,
    )
    assert.equal(compatibility.conversion, 10, `${consumer.label} compatibility conversion`)
    assert.equal(compatibility.timeInRange, 60, `${consumer.label} compatibility time in range`)
    assert.equal(compatibility.gmi, 7, `${consumer.label} compatibility GMI`)

    const tirPalette = JSON.parse(
      run('node', ['--input-type=module', '--eval', tirPaletteCode], { cwd: consumerRoot }),
    )
    assert.deepEqual(
      tirPalette.actual,
      tirPalette.expected,
      `${consumer.label} core TIR dark colors must match @glucoseiq/tokens`,
    )

    const cliExecutable = join(consumerRoot, 'node_modules/.bin/glucoseiq')
    const cliOutput = run(
      cliExecutable,
      ['--help'],
      { cwd: consumerRoot },
    )
    assert.match(cliOutput, /Usage:\s+glucoseiq report/, `${consumer.label} CLI help`)

    const cliFixture = join(consumerRoot, 'cli.csv')
    writeFileSync(
      cliFixture,
      'Timestamp,Glucose Value (mg/dL)\n2024-01-01T00:00:00.000Z,100\n',
    )
    assertCommandFailure(
      cliExecutable,
      ['report', cliFixture, '--unit', 'other'],
      /Invalid unit: expected "mg\/dL" or "mmol\/L"\./,
      { cwd: consumerRoot, label: `${consumer.label} packed CLI invalid unit` },
    )
    assertCommandFailure(
      cliExecutable,
      ['report', cliFixture, '--unknown'],
      /Unknown option '--unknown'/,
      { cwd: consumerRoot, label: `${consumer.label} packed CLI unknown flag` },
    )
    assertCommandFailure(
      cliExecutable,
      ['report', join(consumerRoot, 'missing.csv'), '--delimiter', '💉'],
      /^Invalid delimiter: expected exactly one character other than double quote, NUL, CR, or LF\.$/,
      { cwd: consumerRoot, label: `${consumer.label} packed CLI invalid delimiter` },
    )

    writeFileSync(join(consumerRoot, 'consumer.mts'), esmSource)
    writeFileSync(join(consumerRoot, 'consumer.cts'), cjsSource)
    writeFileSync(join(consumerRoot, 'consumer.ts'), esmSource)
    run(
      'node',
      [
        tsc,
        ...sharedTypeArgs,
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        'consumer.mts',
        'consumer.cts',
      ],
      { cwd: consumerRoot },
    )
    run(
      'node',
      [tsc, ...sharedTypeArgs, '--module', 'ESNext', '--moduleResolution', 'Bundler', 'consumer.ts'],
      { cwd: consumerRoot },
    )
    console.log(`${consumer.label} clean packed consumer passed.`)
  }

  console.log(
    `Package contract smoke test passed for ${packageSpecs.length} tarballs, ${publicEntrypoints.length} entrypoints, and ${legacyExports.length} legacy exports.`,
  )
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
