import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import * as releasePolicy from './test-changeset-policy.mjs'

import {
  PUBLIC_PACKAGE_DIRECTORIES,
  evaluateChangesetPolicy,
  isChangesetReaderPath,
  isReleaseAffectingPath,
  parseNullDelimitedChanges,
  parseNullDelimitedPaths,
  parsePrereleaseState,
  runChangesetPolicy,
  validateGeneratedVersionCommit,
} from './test-changeset-policy.mjs'

const BASE_OID = '1'.repeat(40)
const MERGE_BASE_OID = '2'.repeat(40)
const PUSH_BASE_OID = '3'.repeat(40)
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHANGESETS_CLI = resolve(
  REPOSITORY_ROOT,
  'node_modules/@changesets/cli/bin.js',
)
const TURBO_CLI = resolve(REPOSITORY_ROOT, 'node_modules/turbo/bin/turbo')
const PACKAGE_CONTRACT_FIXTURE_FILES = [
  'scripts/lib/package-contracts.mjs',
  'scripts/package-contract-helpers.test.mjs',
  'scripts/test-package-contracts.mjs',
]

function runFixtureCommand(file, args, cwd) {
  try {
    return execFileSync(file, args, {
      cwd,
      encoding: null,
      env: { ...process.env, CI: 'true' },
      killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
  } catch (error) {
    const output = [error?.stdout, error?.stderr]
      .filter(Boolean)
      .map((chunk) => Buffer.from(chunk).toString('utf8'))
      .filter(Boolean)
      .join('\n')
    throw new Error(
      `${file} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`,
      { cause: error },
    )
  }
}

function selectGeneratedVersionFixtureRevision(changes) {
  return changes.some(
    ({ status, path }) => status === 'D' && isChangesetReaderPath(path),
  )
    ? 'HEAD^1'
    : 'HEAD'
}

function synchronizeFixturePackageManager(repository) {
  const sourceManifest = JSON.parse(
    readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  )
  const fixtureManifestPath = join(repository, 'package.json')
  const fixtureManifest = JSON.parse(readFileSync(fixtureManifestPath, 'utf8'))

  if (fixtureManifest.packageManager === sourceManifest.packageManager) return

  fixtureManifest.packageManager = sourceManifest.packageManager
  writeFileSync(fixtureManifestPath, `${JSON.stringify(fixtureManifest, null, 2)}\n`)
  runFixtureCommand('git', ['add', '--', 'package.json'], repository)
  runFixtureCommand(
    'git',
    [
      '-c',
      'user.name=Release Fixture',
      '-c',
      'user.email=release-fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'test: synchronize fixture package manager',
    ],
    repository,
  )
}

function readLaunchChangesetContents(rootChangeset, fixtureChangeset) {
  return readFileSync(
    existsSync(rootChangeset) ? rootChangeset : fixtureChangeset,
    'utf8',
  )
}

function synchronizeLaunchFixture(repository) {
  for (const directory of readdirSync(join(repository, 'packages'))) {
    if (PUBLIC_PACKAGE_DIRECTORIES.includes(`packages/${directory}`)) continue
    rmSync(join(repository, 'packages', directory), { force: true, recursive: true })
  }
  const fixtureChangeset = join(
    repository,
    '.changeset/launch-glucoseiq-one.md',
  )
  writeFileSync(
    fixtureChangeset,
    readLaunchChangesetContents(
      join(REPOSITORY_ROOT, '.changeset/launch-glucoseiq-one.md'),
      fixtureChangeset,
    ),
  )
  runFixtureCommand('git', ['add', '-A', '--'], repository)
  const pending = runFixtureCommand('git', ['status', '--porcelain'], repository)
  if (pending.length === 0) return
  runFixtureCommand(
    'git',
    [
      '-c',
      'user.name=Release Fixture',
      '-c',
      'user.email=release-fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'test: synchronize launch package set',
    ],
    repository,
  )
}

function synchronizePackageContractFixture(repository) {
  for (const file of PACKAGE_CONTRACT_FIXTURE_FILES) {
    writeFileSync(
      join(repository, file),
      readFileSync(join(REPOSITORY_ROOT, file)),
    )
  }
}

function createGeneratedVersionFixture({
  generate = true,
  mutate,
  prerelease = false,
  prepareBase,
} = {}) {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'glucoseiq-version-policy-test-'),
  )
  const repository = join(temporaryDirectory, 'repository')
  runFixtureCommand(
    'git',
    ['clone', '--quiet', '--no-local', REPOSITORY_ROOT, repository],
    REPOSITORY_ROOT,
  )
  const fixtureRevision = selectGeneratedVersionFixtureRevision(
    parseNullDelimitedChanges(
      runFixtureCommand(
        'git',
        [
          'diff',
          '--name-status',
          '-z',
          '--no-renames',
          'HEAD^1',
          'HEAD',
          '--',
          '.changeset',
        ],
        repository,
      ),
    ),
  )
  if (fixtureRevision !== 'HEAD') {
    runFixtureCommand(
      'git',
      ['checkout', '--quiet', '--detach', fixtureRevision],
      repository,
    )
  }
  synchronizeFixturePackageManager(repository)
  synchronizeLaunchFixture(repository)
  if (prerelease) {
    writeFileSync(
      join(repository, '.changeset/pre.json'),
      `${JSON.stringify({
        mode: 'pre',
        tag: 'next',
        initialVersions: {
          '@glucoseiq/cli': '0.0.0',
          '@glucoseiq/core': '0.0.0',
          '@glucoseiq/react': '0.0.0',
          '@glucoseiq/testing': '0.0.0',
          '@glucoseiq/tokens': '0.0.0',
          docs: '0.0.0',
        },
        changesets: [],
      }, null, 2)}\n`,
    )
  }
  if (prerelease || prepareBase) {
    prepareBase?.(repository)
    runFixtureCommand('git', ['add', '-A', '--'], repository)
    const pending = runFixtureCommand('git', ['status', '--porcelain'], repository)
    if (pending.length > 0) {
      runFixtureCommand(
        'git',
        [
          '-c',
          'user.name=Release Fixture',
          '-c',
          'user.email=release-fixture@example.invalid',
          'commit',
          '--quiet',
          '-m',
          'test: prepare version fixture',
        ],
        repository,
      )
    }
  }
  const baseOid = runFixtureCommand(
    'git',
    ['rev-parse', 'HEAD'],
    repository,
  ).toString('utf8').trim()
  if (generate) {
    symlinkSync(resolve(REPOSITORY_ROOT, 'node_modules'), join(repository, 'node_modules'))
    runFixtureCommand(process.execPath, [CHANGESETS_CLI, 'version'], repository)
    runFixtureCommand('pnpm', ['install', '--lockfile-only'], repository)
  }
  mutate?.(repository)
  rmSync(join(repository, 'node_modules'), { force: true })
  runFixtureCommand('git', ['add', '-A', '--'], repository)
  runFixtureCommand(
    'git',
    [
      '-c',
      'user.name=Release Fixture',
      '-c',
      'user.email=release-fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'chore(release): version packages',
    ],
    repository,
  )
  return {
    baseOid,
    cleanup: () => rmSync(temporaryDirectory, { force: true, recursive: true }),
    repository,
  }
}

function updateFixtureManifest(repository, packageDirectory, update) {
  const manifestPath = join(repository, packageDirectory, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  update(manifest)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function runGeneratedVersionFixture(fixture, options = {}) {
  return runChangesetPolicy({
    cwd: fixture.repository,
    env: {
      CHANGESET_POLICY_BRANCH: 'main',
      CHANGESET_POLICY_BASE_SHA: fixture.baseOid,
    },
    write: () => {},
    ...options,
  })
}

test('generated-version fixtures start from the pre-version commit', () => {
  assert.equal(
    selectGeneratedVersionFixtureRevision([
      { status: 'D', path: '.changeset/release.md' },
      { status: 'M', path: 'packages/core/package.json' },
    ]),
    'HEAD^1',
  )
  assert.equal(
    selectGeneratedVersionFixtureRevision([
      { status: 'M', path: '.changeset/release.md' },
      { status: 'M', path: 'packages/core/src/index.ts' },
    ]),
    'HEAD',
  )
})

test('launch fixtures keep the pre-version Changeset after the root copy is consumed', () => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'glucoseiq-launch-fixture-test-'),
  )
  const rootChangeset = join(temporaryDirectory, 'consumed.md')
  const fixtureChangeset = join(temporaryDirectory, 'pre-version.md')
  const contents = '---\n"@glucoseiq/core": major\n---\n'
  writeFileSync(fixtureChangeset, contents)

  try {
    assert.equal(
      readLaunchChangesetContents(rootChangeset, fixtureChangeset),
      contents,
    )
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true })
  }
})

test('generated-version fixtures use the working-tree package manager pin', () => {
  const expectedPackageManager = JSON.parse(
    readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  ).packageManager
  const fixture = createGeneratedVersionFixture({
    generate: false,
    mutate(repository) {
      writeFileSync(join(repository, '.fixture-marker'), 'fixture\n')
    },
  })

  try {
    const fixturePackageManager = JSON.parse(
      readFileSync(join(fixture.repository, 'package.json'), 'utf8'),
    ).packageManager
    assert.equal(fixturePackageManager, expectedPackageManager)
  } finally {
    fixture.cleanup()
  }
})

function nullDelimited(...paths) {
  return Buffer.from(paths.length === 0 ? '' : `${paths.join('\0')}\0`)
}

function statusDelimited(...changes) {
  return nullDelimited(...changes.flatMap(({ status, path }) => [status, path]))
}

function createCommandFixture({
  branch = 'feat/release-safety',
  baseOid = BASE_OID,
  mergeBaseOid = MERGE_BASE_OID,
  changedPaths = [],
  changes,
  changesetContents = {},
  failCommand,
} = {}) {
  const changeRecords = changes ?? changedPaths.map((path) => ({ status: 'M', path }))
  const packageNames = new Map([
    ['packages/cli', '@glucoseiq/cli'],
    ['packages/core', '@glucoseiq/core'],
    ['packages/react', '@glucoseiq/react'],
    ['packages/testing', '@glucoseiq/testing'],
    ['packages/tokens', '@glucoseiq/tokens'],
  ])
  const defaultReleases = [...new Set(changeRecords.flatMap(({ path }) =>
    [...packageNames].flatMap(([directory, name]) =>
      path.startsWith(`${directory}/`) ? [name] : []
    )
  ))]
  if (defaultReleases.length === 0) defaultReleases.push('@glucoseiq/core')
  const defaultChangeset = [
    '---',
    ...defaultReleases.map((name) => `"${name}": patch`),
    '---',
    '',
    'Release fixture.',
    '',
  ].join('\n')
  const calls = []
  const execFile = (file, args, options) => {
    calls.push({ file, args, options })
    if (args[0] === failCommand) throw new Error(`simulated ${failCommand} failure`)
    if (args[0] === 'symbolic-ref') return Buffer.from(`${branch}\n`)
    if (args[0] === 'rev-parse') return Buffer.from(`${baseOid}\n`)
    if (args[0] === 'merge-base') return Buffer.from(`${mergeBaseOid}\n`)
    if (args[0] === 'cat-file') {
      const path = args[2]?.replace(/^HEAD:/u, '')
      return Buffer.from(changesetContents[path] ?? defaultChangeset)
    }
    if (args[0] === 'diff') {
      return statusDelimited(...changeRecords)
    }
    throw new Error(`unexpected command: ${file} ${args.join(' ')}`)
  }
  return { calls, execFile }
}

test('defines exactly the five public package directories', () => {
  assert.deepEqual(PUBLIC_PACKAGE_DIRECTORIES, [
    'packages/cli',
    'packages/core',
    'packages/react',
    'packages/testing',
    'packages/tokens',
  ])
})

test('classifies source and manifest changes in every public package as release affecting', () => {
  for (const packageDirectory of PUBLIC_PACKAGE_DIRECTORIES) {
    assert.equal(isReleaseAffectingPath(`${packageDirectory}/src/index.ts`), true)
    assert.equal(isReleaseAffectingPath(`${packageDirectory}/package.json`), true)
  }
})

test('does not classify similarly named packages, apps, or repository documentation', () => {
  for (const path of [
    'packages/core-extra/src/index.ts',
    'packages/internal/src/index.ts',
    'apps/docs/app/page.tsx',
    'docs/LAUNCH_RUNBOOK.md',
    'README.md',
  ]) {
    assert.equal(isReleaseAffectingPath(path), false, path)
  }
})

test('exempts package README, docs directory, and Markdown changes', () => {
  for (const path of [
    'packages/core/README.md',
    'packages/core/guide.md',
    'packages/react/guide.mdx',
    'packages/react/docs/guides/hooks.mdx',
    'packages/testing/docs/examples.json',
    'packages/cli/docs/deployment/config.yaml',
    'packages/tokens/CHANGELOG.md',
  ]) {
    assert.equal(isReleaseAffectingPath(path), false, path)
  }
  assert.equal(isReleaseAffectingPath('packages/core/documentation/schema.json'), true)
  assert.equal(isReleaseAffectingPath('packages/core/README.txt'), true)
  assert.equal(isReleaseAffectingPath('packages/core/src/template.md'), true)
  assert.equal(isReleaseAffectingPath('packages/react/templates/card.mdx'), true)
  assert.equal(isReleaseAffectingPath('packages/tokens/assets/README.md'), true)
  assert.equal(isReleaseAffectingPath('packages/testing/guides/setup.md'), true)
})

test('exempts package docs descendants but not a file literally named docs', () => {
  assert.equal(isReleaseAffectingPath('packages/core/docs/guide.md'), false)
  assert.equal(isReleaseAffectingPath('packages/core/docs'), true)
})

test('requires a root Changeset Markdown file other than README', () => {
  const withoutChangeset = evaluateChangesetPolicy({
    branch: 'feat/new-metric',
    changedPaths: [
      'packages/core/src/metric.ts',
      '.changeset/README.md',
      '.changeset/config.json',
      '.changeset/nested/not-valid.md',
    ],
  })
  const withChangeset = evaluateChangesetPolicy({
    branch: 'feat/new-metric',
    changedPaths: [
      'packages/core/src/metric.ts',
      '.changeset/new-metric.md',
    ],
    changesetReleaseDirectories: ['packages/core'],
  })

  assert.equal(withoutChangeset.ok, false)
  assert.deepEqual(withoutChangeset.changesets, [])
  assert.equal(withChangeset.ok, true)
  assert.deepEqual(withChangeset.changesets, ['.changeset/new-metric.md'])
})

test('matches the Changesets reader filename rules exactly', () => {
  for (const ignoredPath of [
    '.changeset/.hidden.md',
    '.changeset/UPPER.MD',
    '.changeset/ReadMe.md',
  ]) {
    const result = evaluateChangesetPolicy({
      branch: 'feat/new-metric',
      changedPaths: ['packages/core/src/metric.ts', ignoredPath],
    })
    assert.equal(result.ok, false, ignoredPath)
    assert.deepEqual(result.changesets, [], ignoredPath)
  }

  const valid = evaluateChangesetPolicy({
    branch: 'feat/new-metric',
    changedPaths: ['packages/core/src/metric.ts', '.changeset/UPPER.md'],
    changesetReleaseDirectories: ['packages/core'],
  })
  assert.equal(valid.ok, true)
  assert.deepEqual(valid.changesets, ['.changeset/UPPER.md'])
})

test('exports the exact Changesets reader path predicate', () => {
  for (const validPath of [
    '.changeset/feature.md',
    '.changeset/UPPER.md',
  ]) {
    assert.equal(isChangesetReaderPath(validPath), true, validPath)
  }
  for (const ignoredPath of [
    '.changeset/.hidden.md',
    '.changeset/feature.MD',
    '.changeset/README.md',
    '.changeset/ReadMe.md',
    '.changeset/nested/feature.md',
    '.changeset/config.json',
    'docs/feature.md',
  ]) {
    assert.equal(isChangesetReaderPath(ignoredPath), false, ignoredPath)
  }
})

test('does not count a deleted Changeset as release coverage', () => {
  const deleted = evaluateChangesetPolicy({
    branch: 'feat/new-metric',
    changes: [
      { status: 'M', path: 'packages/core/src/metric.ts' },
      { status: 'D', path: '.changeset/removed.md' },
    ],
  })
  const added = evaluateChangesetPolicy({
    branch: 'feat/new-metric',
    changes: [
      { status: 'M', path: 'packages/core/src/metric.ts' },
      { status: 'A', path: '.changeset/new-metric.md' },
    ],
    changesetReleaseDirectories: ['packages/core'],
  })

  assert.equal(deleted.ok, false)
  assert.deepEqual(deleted.changesets, [])
  assert.equal(added.ok, true)
  assert.deepEqual(added.changesets, ['.changeset/new-metric.md'])
})

test('rejects a Changeset that names a different public package', () => {
  const fixture = createCommandFixture({
    changes: [
      { status: 'M', path: 'packages/react/src/hooks.ts' },
      { status: 'A', path: '.changeset/core-only.md' },
    ],
    changesetContents: {
      '.changeset/core-only.md': [
        '---',
        '"@glucoseiq/core": patch',
        '---',
        '',
        'Release core only.',
        '',
      ].join('\n'),
    },
  })

  assert.throws(
    () => runChangesetPolicy({
      execFile: fixture.execFile,
      env: { GITHUB_HEAD_REF: 'feat/react-change' },
      write: () => {},
    }),
    /packages\/react/u,
  )
})

for (const { label, source } of [
  {
    label: 'malformed frontmatter',
    source: '---\nthis is not valid frontmatter\n---\n\nBroken.\n',
  },
  {
    label: 'an unknown package',
    source: '---\n"@glucoseiq/unknown": patch\n---\n\nUnknown.\n',
  },
  {
    label: 'a none release',
    source: '---\n"@glucoseiq/core": none\n---\n\nNo release.\n',
  },
]) {
  test(`fails closed when changed package coverage uses ${label}`, () => {
    const fixture = createCommandFixture({
      changes: [
        { status: 'M', path: 'packages/core/src/index.ts' },
        { status: 'A', path: '.changeset/core-change.md' },
      ],
      changesetContents: { '.changeset/core-change.md': source },
    })

    assert.throws(
      () =>
        runChangesetPolicy({
          execFile: fixture.execFile,
          env: { GITHUB_HEAD_REF: 'feat/core-change' },
          write: () => {},
        }),
      /Changeset policy failed/u,
    )
  })
}

test('rejects deletion-only Changeset diffs outside an exact version commit', () => {
  const fixture = createCommandFixture({
    changes: [{ status: 'D', path: '.changeset/pending-release.md' }],
  })

  assert.throws(
    () => runChangesetPolicy({
      execFile: fixture.execFile,
      env: { GITHUB_HEAD_REF: 'feat/drop-pending-release' },
      write: () => {},
    }),
    /pending-release\.md/u,
  )
})

test('sorts and deduplicates every release-affecting path deterministically', () => {
  const result = evaluateChangesetPolicy({
    branch: 'feat/new-metric',
    changedPaths: [
      'packages/tokens/src/index.ts',
      'packages/core/src/zeta.ts',
      'packages/core/src/alpha.ts',
      'packages/tokens/src/index.ts',
    ],
  })

  assert.equal(result.ok, false)
  assert.deepEqual(result.releaseAffectingPaths, [
    'packages/core/src/alpha.ts',
    'packages/core/src/zeta.ts',
    'packages/tokens/src/index.ts',
  ])
})

test('passes documentation-only and non-package diffs without a Changeset', () => {
  const result = evaluateChangesetPolicy({
    branch: 'docs/migration-guide',
    changedPaths: [
      'apps/docs/content/docs/migration.mdx',
      'docs/LAUNCH_RUNBOOK.md',
      'packages/core/docs/migration.json',
      'packages/react/README.md',
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.reason, 'no-release-affecting-paths')
  assert.deepEqual(result.releaseAffectingPaths, [])
})

test('exempts only the generated release branch', () => {
  const exempt = evaluateChangesetPolicy({
    branch: 'release/glucoseiq-packages',
    changedPaths: ['packages/core/package.json'],
    exemptReleaseBranch: true,
  })
  const similar = evaluateChangesetPolicy({
    branch: 'release/glucoseiq-packages-preview',
    changedPaths: ['packages/core/package.json'],
  })

  assert.equal(exempt.ok, true)
  assert.equal(exempt.reason, 'release-branch')
  assert.equal(similar.ok, false)
})

test('pure policy evaluation does not assume release-branch trust', () => {
  const result = evaluateChangesetPolicy({
    branch: 'release/glucoseiq-packages',
    changedPaths: ['packages/core/package.json'],
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'changeset-required')
})

test('parses NUL-delimited paths without losing spaces or newlines', () => {
  assert.deepEqual(
    parseNullDelimitedPaths(
      nullDelimited(
        'packages/core/src/space name.ts',
        'packages/react/src/line\nbreak.ts',
      ),
    ),
    [
      'packages/core/src/space name.ts',
      'packages/react/src/line\nbreak.ts',
    ],
  )
  assert.deepEqual(parseNullDelimitedPaths(Buffer.alloc(0)), [])
})

test('parses NUL-delimited status and path records without path ambiguity', () => {
  assert.deepEqual(
    parseNullDelimitedChanges(
      statusDelimited(
        { status: 'A', path: 'packages/core/src/space name.ts' },
        { status: 'D', path: 'packages/react/src/line\nbreak.ts' },
      ),
    ),
    [
      { status: 'A', path: 'packages/core/src/space name.ts' },
      { status: 'D', path: 'packages/react/src/line\nbreak.ts' },
    ],
  )
})

test('rejects malformed status and path records', () => {
  assert.throws(
    () => parseNullDelimitedChanges(nullDelimited('M')),
    /status and path pairs/,
  )
  assert.throws(
    () => parseNullDelimitedChanges(nullDelimited('?', 'packages/core/src/index.ts')),
    /unsupported Git change status/,
  )
})

test('rejects malformed or invalid NUL-delimited path output', () => {
  assert.throws(
    () => parseNullDelimitedPaths(Buffer.from('packages/core/src/index.ts')),
    /not NUL terminated/,
  )
  assert.throws(
    () => parseNullDelimitedPaths(Buffer.from('packages/core/src/index.ts\0\0')),
    /empty path/,
  )
  assert.throws(
    () => parseNullDelimitedPaths(Buffer.from([0xc3, 0x28, 0x00])),
    /UTF-8/,
  )
  assert.throws(
    () => parseNullDelimitedPaths(nullDelimited('../outside.ts')),
    /repository-relative/,
  )
})

test('uses injected commands with no shell interpolation and diffs from the merge base', () => {
  const fixture = createCommandFixture({
    changedPaths: [
      'packages/core/src/metric with spaces.ts',
      '.changeset/new-metric.md',
    ],
  })
  const lines = []

  const result = runChangesetPolicy({
    execFile: fixture.execFile,
    env: { GITHUB_HEAD_REF: 'feat/new-metric' },
    write: (line) => lines.push(line),
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.comparisonBase, {
    source: 'origin-main-merge-base',
    oid: MERGE_BASE_OID,
  })
  assert.deepEqual(
    fixture.calls.map(({ file, args }) => [file, args]),
    [
      ['git', ['rev-parse', '--verify', '--end-of-options', 'origin/main^{commit}']],
      ['git', ['merge-base', BASE_OID, 'HEAD']],
      [
        'git',
        [
          'diff',
          '--name-status',
          '-z',
          '--no-renames',
          MERGE_BASE_OID,
          'HEAD',
          '--',
        ],
      ],
      [
        'git',
        ['cat-file', 'blob', 'HEAD:.changeset/new-metric.md'],
      ],
    ],
  )
  for (const { options } of fixture.calls) {
    assert.equal(options.shell, false)
    assert.equal(options.encoding, null)
    assert.ok(Number.isInteger(options.timeout) && options.timeout > 0)
    assert.equal(options.killSignal, 'SIGKILL')
  }
  assert.deepEqual(lines, [
    `Comparison base: origin/main merge base ${MERGE_BASE_OID}.`,
    'Changeset policy passed: 1 release-affecting path covered by .changeset/new-metric.md.',
  ])
})

test('uses the pushed-before SHA directly and requires release coverage', () => {
  const fixture = createCommandFixture({
    changedPaths: ['packages/core/src/pushed.ts'],
  })

  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: fixture.execFile,
        env: {
          CHANGESET_POLICY_BRANCH: 'main',
          CHANGESET_POLICY_BASE_SHA: PUSH_BASE_OID,
        },
        write: () => {},
      }),
    (error) => {
      assert.match(error.message, /Changeset policy failed/)
      assert.match(
        error.message,
        new RegExp(`Comparison base: push-before ${PUSH_BASE_OID}\\.`),
      )
      return true
    },
  )

  assert.deepEqual(
    fixture.calls.map(({ file, args }) => [file, args]),
    [
      [
        'git',
        [
          'diff',
          '--name-status',
          '-z',
          '--no-renames',
          PUSH_BASE_OID,
          'HEAD',
          '--',
        ],
      ],
    ],
  )
})

test('reports the pushed-before comparison base on success', () => {
  const fixture = createCommandFixture({
    changedPaths: [
      'packages/core/src/pushed.ts',
      '.changeset/pushed-core.md',
    ],
  })
  const lines = []

  const result = runChangesetPolicy({
    execFile: fixture.execFile,
    env: {
      CHANGESET_POLICY_BRANCH: 'main',
      CHANGESET_POLICY_BASE_SHA: PUSH_BASE_OID,
    },
    write: (line) => lines.push(line),
  })

  assert.deepEqual(result.comparisonBase, {
    source: 'push-before',
    oid: PUSH_BASE_OID,
  })
  assert.equal(lines[0], `Comparison base: push-before ${PUSH_BASE_OID}.`)
})

test('allows only a generated version commit to consume Changesets on a main push', () => {
  const fixture = createCommandFixture({
    changes: [
      { status: 'D', path: '.changeset/launch.md' },
      { status: 'M', path: 'packages/core/package.json' },
      { status: 'A', path: 'packages/core/CHANGELOG.md' },
      { status: 'M', path: 'packages/react/package.json' },
      { status: 'A', path: 'packages/react/CHANGELOG.md' },
      { status: 'M', path: 'pnpm-lock.yaml' },
    ],
  })
  const validations = []

  const result = runChangesetPolicy({
    execFile: fixture.execFile,
    env: {
      CHANGESET_POLICY_BRANCH: 'main',
      CHANGESET_POLICY_BASE_SHA: PUSH_BASE_OID,
    },
    write: () => {},
    validateVersionCommit: (context) => {
      validations.push(context)
      return true
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.reason, 'generated-version-commit')
  assert.deepEqual(result.versionedPackages, [
    'packages/core',
    'packages/react',
  ])
  assert.equal(validations.length, 1)
  assert.equal(validations[0].baseOid, PUSH_BASE_OID)
  assert.equal(validations[0].execFile, fixture.execFile)
})

test('rejects a generated-version-shaped commit with an arbitrary version jump', () => {
  const fixture = createGeneratedVersionFixture({
    mutate: (repository) => {
      updateFixtureManifest(repository, 'packages/core', (manifest) => {
        manifest.version = '9.0.0'
      })
    },
  })

  try {
    assert.throws(
      () => runGeneratedVersionFixture(fixture),
      /generated version artifacts.*Changesets output/iu,
    )
  } finally {
    fixture.cleanup()
  }
})

test('accepts the exact release candidate generated by Changesets and pnpm', () => {
  const fixture = createGeneratedVersionFixture({
    prepareBase: synchronizePackageContractFixture,
  })
  const commandCalls = []
  const commandTimeoutMs = 60_000

  try {
    const result = runGeneratedVersionFixture(fixture, {
      execFile: (file, args, options) => {
        commandCalls.push({ args, file, options })
        return execFileSync(file, args, options)
      },
      generatedVersionOptions: { commandTimeoutMs },
    })
    assert.equal(result.reason, 'generated-version-commit')
    assert.deepEqual(result.versionedPackages, PUBLIC_PACKAGE_DIRECTORIES)
    const replayCalls = commandCalls.filter(({ args, file }) =>
      (file === process.execPath && args[1] === 'version') ||
      (file === 'pnpm' && args[0] === 'install')
    )
    assert.equal(replayCalls.length, 2)
    for (const { options } of replayCalls) {
      assert.equal(options.timeout, commandTimeoutMs)
      assert.equal(options.killSignal, 'SIGKILL')
      assert.equal(options.shell, false)
    }

    try {
      runFixtureCommand('pnpm', ['install', '--frozen-lockfile'], fixture.repository)
      runFixtureCommand(
        process.execPath,
        ['scripts/package-contract-helpers.test.mjs'],
        fixture.repository,
      )
      runFixtureCommand(
        process.execPath,
        [
          TURBO_CLI,
          'run',
          'build',
          '--filter=@glucoseiq/core',
          '--filter=@glucoseiq/react',
          '--filter=@glucoseiq/tokens',
          '--filter=@glucoseiq/testing',
          '--filter=@glucoseiq/cli',
        ],
        fixture.repository,
      )
      runFixtureCommand(
        process.execPath,
        ['scripts/test-package-contracts.mjs', '--source', 'candidate'],
        fixture.repository,
      )
    } finally {
      rmSync(join(fixture.repository, 'node_modules'), { force: true, recursive: true })
    }
  } finally {
    fixture.cleanup()
  }
})

test('accepts only the exact real Changesets next.0 candidate', () => {
  const fixture = createGeneratedVersionFixture({
    prerelease: true,
    prepareBase: synchronizePackageContractFixture,
  })

  try {
    const preState = JSON.parse(
      readFileSync(join(fixture.repository, '.changeset/pre.json'), 'utf8'),
    )
    assert.deepEqual(preState, {
      mode: 'pre',
      tag: 'next',
      initialVersions: {
        '@glucoseiq/cli': '0.0.0',
        '@glucoseiq/core': '0.0.0',
        '@glucoseiq/react': '0.0.0',
        '@glucoseiq/testing': '0.0.0',
        '@glucoseiq/tokens': '0.0.0',
        docs: '0.0.0',
      },
      changesets: ['launch-glucoseiq-one'],
    })
    assert.equal(
      existsSync(join(fixture.repository, '.changeset/launch-glucoseiq-one.md')),
      true,
    )
    for (const packageDirectory of PUBLIC_PACKAGE_DIRECTORIES) {
      const manifest = JSON.parse(
        readFileSync(join(fixture.repository, packageDirectory, 'package.json'), 'utf8'),
      )
      assert.equal(manifest.version, '1.0.0-next.0', packageDirectory)
      if (packageDirectory !== 'packages/core' && packageDirectory !== 'packages/tokens') {
        assert.equal(
          manifest.dependencies['@glucoseiq/core'],
          'workspace:^',
          packageDirectory,
        )
      }
      assert.match(
        readFileSync(join(fixture.repository, packageDirectory, 'CHANGELOG.md'), 'utf8'),
        /^## 1\.0\.0-next\.0$/mu,
        packageDirectory,
      )
    }

    const result = runGeneratedVersionFixture(fixture)
    assert.equal(result.reason, 'generated-version-commit')
    assert.equal(result.releaseKind, 'next.0')
    assert.deepEqual(result.versionedPackages, PUBLIC_PACKAGE_DIRECTORIES)
    assert.deepEqual(result.consumedChangesets, ['launch-glucoseiq-one'])

    try {
      runFixtureCommand('pnpm', ['install', '--frozen-lockfile'], fixture.repository)
      runFixtureCommand(
        process.execPath,
        ['scripts/package-contract-helpers.test.mjs'],
        fixture.repository,
      )
      runFixtureCommand(
        process.execPath,
        [
          TURBO_CLI,
          'run',
          'build',
          '--filter=@glucoseiq/core',
          '--filter=@glucoseiq/react',
          '--filter=@glucoseiq/tokens',
          '--filter=@glucoseiq/testing',
          '--filter=@glucoseiq/cli',
        ],
        fixture.repository,
      )
      runFixtureCommand(
        process.execPath,
        ['scripts/test-package-contracts.mjs', '--source', 'candidate'],
        fixture.repository,
      )
    } finally {
      rmSync(join(fixture.repository, 'node_modules'), { force: true, recursive: true })
    }
  } finally {
    fixture.cleanup()
  }
})

test('parses only the two exact prerelease JSON states', () => {
  const initial = {
    mode: 'pre',
    tag: 'next',
    initialVersions: {
      '@glucoseiq/cli': '0.0.0',
      '@glucoseiq/core': '0.0.0',
      '@glucoseiq/react': '0.0.0',
      '@glucoseiq/testing': '0.0.0',
      '@glucoseiq/tokens': '0.0.0',
      docs: '0.0.0',
    },
    changesets: [],
  }
  assert.deepEqual(parsePrereleaseState(JSON.stringify(initial)), {
    kind: 'initial',
    consumedChangesets: [],
  })
  assert.deepEqual(
    parsePrereleaseState(JSON.stringify({
      ...initial,
      changesets: ['launch-glucoseiq-one'],
    })),
    {
      kind: 'generated',
      consumedChangesets: ['launch-glucoseiq-one'],
    },
  )

  const invalidStates = [
    '{',
    JSON.stringify({ ...initial, extra: true }),
    JSON.stringify({
      ...initial,
      initialVersions: { ...initial.initialVersions, extra: '0.0.0' },
    }),
    JSON.stringify({ ...initial, mode: 'exit' }),
    JSON.stringify({ ...initial, tag: 'beta' }),
    JSON.stringify({
      ...initial,
      initialVersions: { ...initial.initialVersions, docs: '0.0.1' },
    }),
    JSON.stringify({
      ...initial,
      changesets: ['launch-glucoseiq-one', 'launch-glucoseiq-one'],
    }),
    JSON.stringify({ ...initial, changesets: ['unknown-release'] }),
  ]
  for (const source of invalidStates) {
    assert.throws(() => parsePrereleaseState(source), /pre\.json|valid JSON/iu)
  }
})

test('routes version PR and publication from unconsumed Changesets', () => {
  const initialState = JSON.stringify({
    mode: 'pre',
    tag: 'next',
    initialVersions: {
      '@glucoseiq/cli': '0.0.0',
      '@glucoseiq/core': '0.0.0',
      '@glucoseiq/react': '0.0.0',
      '@glucoseiq/testing': '0.0.0',
      '@glucoseiq/tokens': '0.0.0',
      docs: '0.0.0',
    },
    changesets: [],
  })
  const generatedState = JSON.stringify({
    ...JSON.parse(initialState),
    changesets: ['launch-glucoseiq-one'],
  })
  const detect = releasePolicy.detectReleaseMode
  const nonGeneratedPolicy = { reason: 'no-release-affecting-paths' }
  const generatedPolicy = {
    reason: 'generated-version-commit',
    releaseKind: 'next.0',
    consumedChangesets: ['launch-glucoseiq-one'],
    versionedPackages: PUBLIC_PACKAGE_DIRECTORIES,
  }

  assert.deepEqual(
    detect?.({
      changesetPaths: ['.changeset/launch-glucoseiq-one.md'],
      policy: nonGeneratedPolicy,
    }),
    {
      pendingChangesets: ['launch-glucoseiq-one'],
      publishCommand: null,
      shouldPublish: false,
      shouldVersion: true,
      state: 'baseline',
    },
  )
  assert.deepEqual(
    detect?.({
      changesetPaths: ['.changeset/launch-glucoseiq-one.md'],
      policy: nonGeneratedPolicy,
      prereleaseStateSource: initialState,
    }),
    {
      pendingChangesets: ['launch-glucoseiq-one'],
      publishCommand: null,
      shouldPublish: false,
      shouldVersion: true,
      state: 'initial-next.0',
    },
  )
  assert.deepEqual(
    detect?.({
      changesetPaths: ['.changeset/launch-glucoseiq-one.md'],
      policy: generatedPolicy,
      prereleaseStateSource: generatedState,
    }),
    {
      pendingChangesets: [],
      publishCommand: 'pnpm publish:next.0',
      shouldPublish: true,
      shouldVersion: false,
      state: 'generated-next.0',
    },
  )
  assert.deepEqual(
    detect?.({
      changesetPaths: ['.changeset/launch-glucoseiq-one.md'],
      policy: nonGeneratedPolicy,
      prereleaseStateSource: generatedState,
    }),
    {
      pendingChangesets: [],
      publishCommand: null,
      shouldPublish: false,
      shouldVersion: false,
      state: 'consumed-next.0',
    },
  )

  for (const invalid of [
    {
      changesetPaths: [
        '.changeset/launch-glucoseiq-one.md',
        '.changeset/stale.md',
      ],
      policy: generatedPolicy,
      prereleaseStateSource: generatedState,
    },
    {
      changesetPaths: [],
      policy: {
        reason: 'generated-version-commit',
        releaseKind: 'stable',
        consumedChangesets: ['launch-glucoseiq-one'],
        versionedPackages: PUBLIC_PACKAGE_DIRECTORIES,
      },
    },
    {
      changesetPaths: ['.changeset/launch-glucoseiq-one.md'],
      policy: { ...generatedPolicy, releaseKind: 'next.1' },
      prereleaseStateSource: generatedState,
    },
  ]) {
    assert.throws(() => detect?.(invalid), /release|launch|next\.0|stale/iu)
  }

  assert.deepEqual(
    detect?.({
      changesetPaths: [],
      policy: {
        reason: 'generated-version-commit',
        releaseKind: 'stable',
        consumedChangesets: ['future-core'],
        versionedPackages: ['packages/core'],
      },
    }),
    {
      pendingChangesets: [],
      publishCommand: 'pnpm changeset publish',
      shouldPublish: true,
      shouldVersion: false,
      state: 'generated-stable',
    },
  )
})

test('rejects every hard mutation of the next.0 candidate', () => {
  const cases = [
    {
      label: 'tag',
      mutate: (repository) => {
        const path = join(repository, '.changeset/pre.json')
        const state = JSON.parse(readFileSync(path, 'utf8'))
        state.tag = 'beta'
        writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)
      },
    },
    {
      label: 'counter',
      mutate: (repository) => {
        updateFixtureManifest(repository, 'packages/core', (manifest) => {
          manifest.version = '1.0.0-next.1'
        })
      },
    },
    {
      label: 'consumed list',
      mutate: (repository) => {
        const path = join(repository, '.changeset/pre.json')
        const state = JSON.parse(readFileSync(path, 'utf8'))
        state.changesets.push('unknown-release')
        writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)
      },
    },
    {
      label: 'package set',
      mutate: (repository) => {
        runFixtureCommand(
          'git',
          ['checkout', 'HEAD', '--', 'packages/react/package.json'],
          repository,
        )
        rmSync(join(repository, 'packages/react/CHANGELOG.md'))
      },
    },
    {
      label: 'manifest',
      mutate: (repository) => {
        updateFixtureManifest(repository, 'packages/cli', (manifest) => {
          manifest.dependencies['@glucoseiq/core'] = '^1.0.0-next.1'
        })
      },
    },
    {
      label: 'changelog',
      mutate: (repository) => {
        const path = join(repository, 'packages/core/CHANGELOG.md')
        writeFileSync(path, `${readFileSync(path, 'utf8')}\n- Fabricated.\n`)
      },
    },
    {
      label: 'source',
      mutate: (repository) => {
        writeFileSync(join(repository, 'packages/core/src/task-2-mutation.ts'), 'export {}\n')
      },
    },
    {
      label: 'pre-state',
      prepareBase: (repository) => {
        const path = join(repository, '.changeset/pre.json')
        const state = JSON.parse(readFileSync(path, 'utf8'))
        state.initialVersions.docs = '0.0.1'
        writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)
      },
    },
  ]

  for (const fixtureCase of cases) {
    const fixture = createGeneratedVersionFixture({
      prerelease: true,
      mutate: fixtureCase.mutate,
      prepareBase: fixtureCase.prepareBase,
    })
    try {
      assert.throws(
        () => runGeneratedVersionFixture(fixture),
        /(?:pre\.json|prerelease|generated version artifacts|Changeset policy failed)/iu,
        fixtureCase.label,
      )
    } finally {
      fixture.cleanup()
    }
  }
})

test('accepts a future independent major release and its dependent bumps', () => {
  const fixture = createGeneratedVersionFixture({
    prepareBase: (repository) => {
      for (const packageDirectory of PUBLIC_PACKAGE_DIRECTORIES) {
        updateFixtureManifest(repository, packageDirectory, (manifest) => {
          manifest.version = '1.4.0'
        })
      }
      writeFileSync(
        join(repository, '.changeset/launch-glucoseiq-one.md'),
        [
          '---',
          '"@glucoseiq/core": major',
          '---',
          '',
          'Release a new core contract.',
          '',
        ].join('\n'),
      )
    },
  })

  try {
    const result = runGeneratedVersionFixture(fixture)
    assert.equal(result.reason, 'generated-version-commit')
    assert.ok(result.versionedPackages.includes('packages/core'))
    assert.ok(result.versionedPackages.includes('packages/cli'))
    assert.equal(result.versionedPackages.includes('packages/tokens'), false)
  } finally {
    fixture.cleanup()
  }
})

test('rejects a generated-version-shaped commit with a fabricated changelog entry', () => {
  const fixture = createGeneratedVersionFixture({
    mutate: (repository) => {
      const changelogPath = join(repository, 'packages/core/CHANGELOG.md')
      const changelog = readFileSync(changelogPath, 'utf8')
      writeFileSync(changelogPath, `${changelog}\n- Unrelated release claim.\n`)
    },
  })

  try {
    assert.throws(
      () => runGeneratedVersionFixture(fixture),
      /generated version artifacts.*Changesets output/iu,
    )
  } finally {
    fixture.cleanup()
  }
})

test('rejects a generated-version-shaped commit that omits a planned package release', () => {
  const fixture = createGeneratedVersionFixture({
    mutate: (repository) => {
      runFixtureCommand(
        'git',
        ['checkout', 'HEAD', '--', 'packages/react/package.json'],
        repository,
      )
      rmSync(join(repository, 'packages/react/CHANGELOG.md'))
    },
  })

  try {
    assert.throws(
      () => runGeneratedVersionFixture(fixture),
      /generated version artifacts.*Changesets output/iu,
    )
  } finally {
    fixture.cleanup()
  }
})

test('rejects dependency-range tampering in a released package manifest', () => {
  const fixture = createGeneratedVersionFixture({
    mutate: (repository) => {
      updateFixtureManifest(repository, 'packages/cli', (manifest) => {
        manifest.dependencies['@glucoseiq/core'] = 'workspace:*'
      })
    },
  })

  try {
    assert.throws(
      () => runGeneratedVersionFixture(fixture),
      /generated version artifacts.*Changesets output/iu,
    )
  } finally {
    fixture.cleanup()
  }
})

test('fails closed when a consumed Changeset was malformed at the pushed base', () => {
  const fixture = createGeneratedVersionFixture({
    generate: false,
    prepareBase: (repository) => {
      writeFileSync(
        join(repository, '.changeset/launch-glucoseiq-one.md'),
        '---\nthis is not valid frontmatter\n---\n\nBroken release entry.\n',
      )
    },
    mutate: (repository) => {
      rmSync(join(repository, '.changeset/launch-glucoseiq-one.md'))
      updateFixtureManifest(repository, 'packages/core', (manifest) => {
        manifest.version = '1.0.0'
      })
      writeFileSync(
        join(repository, 'packages/core/CHANGELOG.md'),
        '# @glucoseiq/core\n\n## 1.0.0\n\n### Major Changes\n\n- Fabricated.\n',
      )
    },
  })

  try {
    assert.throws(
      () => runGeneratedVersionFixture(fixture),
      /Generated version validation failed while replaying Changesets/,
    )
  } finally {
    fixture.cleanup()
  }
})

test('rejects imitations of the generated version commit shape', () => {
  const baseChanges = [
    { status: 'D', path: '.changeset/release.md' },
    { status: 'M', path: 'packages/core/package.json' },
    { status: 'A', path: 'packages/core/CHANGELOG.md' },
  ]
  const invalidCases = [
    {
      label: 'source change',
      changes: [...baseChanges, { status: 'M', path: 'packages/core/src/index.ts' }],
    },
    {
      label: 'missing matching changelog',
      changes: baseChanges.filter(({ path }) => path !== 'packages/core/CHANGELOG.md'),
    },
    {
      label: 'orphan changelog',
      changes: [...baseChanges, { status: 'M', path: 'packages/react/CHANGELOG.md' }],
    },
    {
      label: 'no consumed Changeset',
      changes: baseChanges.filter(({ path }) => path !== '.changeset/release.md'),
    },
    {
      label: 'README deletion',
      changes: baseChanges.map((change) =>
        change.path === '.changeset/release.md'
          ? { ...change, path: '.changeset/README.md' }
          : change
      ),
    },
  ]

  for (const { label, changes } of invalidCases) {
    const fixture = createCommandFixture({ changes })
    assert.throws(
      () =>
        runChangesetPolicy({
          execFile: fixture.execFile,
          env: {
            CHANGESET_POLICY_BRANCH: 'main',
            CHANGESET_POLICY_BASE_SHA: PUSH_BASE_OID,
          },
          write: () => {},
        }),
      /Changeset policy failed/,
      label,
    )
  }
})

test('does not allow generated version artifacts outside a direct main push', () => {
  const changes = [
    { status: 'D', path: '.changeset/release.md' },
    { status: 'M', path: 'packages/core/package.json' },
    { status: 'A', path: 'packages/core/CHANGELOG.md' },
  ]

  const featurePush = createCommandFixture({ changes })
  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: featurePush.execFile,
        env: {
          CHANGESET_POLICY_BRANCH: 'feat/not-a-release',
          CHANGESET_POLICY_BASE_SHA: PUSH_BASE_OID,
        },
        write: () => {},
      }),
    /Changeset policy failed/,
  )

  const pullRequest = createCommandFixture({ changes })
  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: pullRequest.execFile,
        env: { CHANGESET_POLICY_BRANCH: 'main' },
        write: () => {},
      }),
    /Changeset policy failed/,
  )
})

test('rejects zero, ambiguous, or malformed pushed-before SHAs before Git', () => {
  for (const baseSha of [
    '0'.repeat(40),
    `${PUSH_BASE_OID}\n${BASE_OID}`,
    '3'.repeat(39),
    `${'g'.repeat(40)}`,
  ]) {
    const calls = []
    assert.throws(
      () =>
        runChangesetPolicy({
          execFile: (...args) => {
            calls.push(args)
            return Buffer.alloc(0)
          },
          env: {
            CHANGESET_POLICY_BRANCH: 'main',
            CHANGESET_POLICY_BASE_SHA: baseSha,
          },
          write: () => {},
        }),
      /CHANGESET_POLICY_BASE_SHA.*non-zero 40- or 64-character hexadecimal commit ID/,
      baseSha,
    )
    assert.deepEqual(calls, [], baseSha)
  }
})

test('rejects non-positive generated-version command timeouts before Git', () => {
  for (const commandTimeoutMs of [0, -1, 1.5]) {
    const calls = []
    assert.throws(
      () =>
        validateGeneratedVersionCommit({
          baseOid: PUSH_BASE_OID,
          commandTimeoutMs,
          execFile: (...args) => {
            calls.push(args)
            return Buffer.alloc(0)
          },
        }),
      /commandTimeoutMs must be a positive integer/,
    )
    assert.deepEqual(calls, [])
  }
})

test('disables rename collapsing so moves out of public packages remain visible', () => {
  const fixture = createCommandFixture({
    changedPaths: [
      'packages/core/src/removed.ts',
      'docs/removed.md',
      '.changeset/remove-core-entry.md',
    ],
  })

  runChangesetPolicy({
    execFile: fixture.execFile,
    env: { GITHUB_HEAD_REF: 'feat/remove-core-entry' },
    write: () => {},
  })

  const diffCall = fixture.calls.find(({ args }) => args[0] === 'diff')
  assert.ok(diffCall)
  assert.ok(diffCall.args.includes('--no-renames'))
})

test('does not filter out release-affecting Git change types', () => {
  const fixture = createCommandFixture({
    changedPaths: [
      'packages/cli/src/index.ts',
      '.changeset/cli-file-type.md',
    ],
  })

  runChangesetPolicy({
    execFile: fixture.execFile,
    env: { GITHUB_HEAD_REF: 'feat/cli-file-type' },
    write: () => {},
  })

  const diffCall = fixture.calls.find(({ args }) => args[0] === 'diff')
  assert.ok(diffCall)
  assert.equal(
    diffCall.args.some((argument) => argument.startsWith('--diff-filter=')),
    false,
  )
})

test('resolves a local branch explicitly when the pull-request head is unavailable', () => {
  const fixture = createCommandFixture()

  const result = runChangesetPolicy({
    execFile: fixture.execFile,
    env: {},
    write: () => {},
  })

  assert.equal(result.branch, 'feat/release-safety')
  assert.deepEqual(fixture.calls[0].args, [
    'symbolic-ref',
    '--quiet',
    '--short',
    'HEAD',
  ])
})

test('skips Git inspection on the generated release branch', () => {
  const calls = []
  const lines = []

  const result = runChangesetPolicy({
    execFile: (...args) => {
      calls.push(args)
      throw new Error('Git should not run for the exempt branch')
    },
    env: { GITHUB_HEAD_REF: 'release/glucoseiq-packages' },
    write: (line) => lines.push(line),
  })

  assert.equal(result.reason, 'release-branch')
  assert.deepEqual(calls, [])
  assert.deepEqual(lines, [
    'Changeset policy skipped for release/glucoseiq-packages.',
  ])
})

test('skips the generated release branch in Actions only for the same repository', () => {
  const calls = []
  const result = runChangesetPolicy({
    execFile: (...args) => {
      calls.push(args)
      throw new Error('Git should not run for the trusted release branch')
    },
    env: {
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'marklearst/glucoseiq',
      CHANGESET_POLICY_BRANCH: 'release/glucoseiq-packages',
      CHANGESET_POLICY_HEAD_REPOSITORY: 'marklearst/glucoseiq',
    },
    write: () => {},
  })

  assert.equal(result.reason, 'release-branch')
  assert.deepEqual(calls, [])
})

test('does not exempt a fork that uses the generated release branch name', () => {
  const fixture = createCommandFixture({
    changedPaths: ['packages/core/package.json'],
  })

  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: fixture.execFile,
        env: {
          GITHUB_ACTIONS: 'true',
          GITHUB_REPOSITORY: 'marklearst/glucoseiq',
          CHANGESET_POLICY_BRANCH: 'release/glucoseiq-packages',
          CHANGESET_POLICY_HEAD_REPOSITORY: 'contributor/glucoseiq',
        },
        write: () => {},
      }),
    /Changeset policy failed/,
  )
  assert.equal(fixture.calls.some(({ args }) => args[0] === 'symbolic-ref'), false)
})

test('uses the explicit branch override for a detached Actions checkout', () => {
  const fixture = createCommandFixture({
    changedPaths: ['.changeset/docs-only.md'],
  })

  const result = runChangesetPolicy({
    execFile: fixture.execFile,
    env: {
      GITHUB_ACTIONS: 'true',
      CHANGESET_POLICY_BRANCH: 'feat/detached-checkout',
      GITHUB_HEAD_REF: 'feat/ignored-head-ref',
      GITHUB_REF_NAME: '123/merge',
    },
    write: () => {},
  })

  assert.equal(result.branch, 'feat/detached-checkout')
  assert.equal(fixture.calls.some(({ args }) => args[0] === 'symbolic-ref'), false)
})

test('uses GITHUB_REF_NAME when Actions has no pull-request head or override', () => {
  const fixture = createCommandFixture()

  const result = runChangesetPolicy({
    execFile: fixture.execFile,
    env: {
      GITHUB_ACTIONS: 'true',
      GITHUB_REF_NAME: 'feat/ref-name-checkout',
    },
    write: () => {},
  })

  assert.equal(result.branch, 'feat/ref-name-checkout')
  assert.equal(fixture.calls.some(({ args }) => args[0] === 'symbolic-ref'), false)
})

test('rejects an ambiguous explicit branch override before invoking Git', () => {
  let invoked = false
  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: () => {
          invoked = true
          return Buffer.alloc(0)
        },
        env: {
          GITHUB_ACTIONS: 'true',
          CHANGESET_POLICY_BRANCH: 'feat/one\nfeat/two',
        },
        write: () => {},
      }),
    /configured branch.*single valid branch name/,
  )
  assert.equal(invoked, false)
})

test('prints every deterministic release-affecting path in a safe failure message', () => {
  const fixture = createCommandFixture({
    changedPaths: [
      'packages/tokens/src/zeta.ts',
      'packages/core/src/line\nbreak.ts',
      'packages/core/src/alpha.ts',
    ],
  })

  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: fixture.execFile,
        env: { GITHUB_HEAD_REF: 'feat/missing-changeset' },
        write: () => {},
      }),
    (error) => {
      assert.equal(
        error.message,
        [
          'Changeset policy failed: release-affecting package changes require a non-README .changeset Markdown file.',
          `Comparison base: origin/main merge base ${MERGE_BASE_OID}.`,
          'Release-affecting paths:',
          '- "packages/core/src/alpha.ts"',
          '- "packages/core/src/line\\nbreak.ts"',
          '- "packages/tokens/src/zeta.ts"',
        ].join('\n'),
      )
      return true
    },
  )
})

test('fails safely when branch, base, merge base, or Git output is ambiguous', () => {
  const ambiguousBranch = createCommandFixture({ branch: 'one\ntwo' })
  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: ambiguousBranch.execFile,
        env: {},
        write: () => {},
      }),
    /current branch.*single valid branch name/,
  )

  const ambiguousBase = createCommandFixture({ baseOid: `${BASE_OID}\n${MERGE_BASE_OID}` })
  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: ambiguousBase.execFile,
        env: { GITHUB_HEAD_REF: 'feat/base-check' },
        write: () => {},
      }),
    /origin\/main.*single commit ID/,
  )

  const ambiguousMergeBase = createCommandFixture({
    mergeBaseOid: `${MERGE_BASE_OID}\n${BASE_OID}`,
  })
  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: ambiguousMergeBase.execFile,
        env: { GITHUB_HEAD_REF: 'feat/base-check' },
        write: () => {},
      }),
    /merge base.*single commit ID/,
  )

  const malformedDiff = createCommandFixture({ changedPaths: ['packages/core/src/index.ts'] })
  const originalExecFile = malformedDiff.execFile
  malformedDiff.execFile = (file, args, options) =>
    args[0] === 'diff'
      ? Buffer.from('packages/core/src/index.ts')
      : originalExecFile(file, args, options)
  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: malformedDiff.execFile,
        env: { GITHUB_HEAD_REF: 'feat/diff-check' },
        write: () => {},
      }),
    /not NUL terminated/,
  )
})

test('fails safely when Git cannot resolve the branch, base, merge base, or diff', () => {
  for (const failCommand of ['symbolic-ref', 'rev-parse', 'merge-base', 'diff']) {
    const fixture = createCommandFixture({ failCommand })
    assert.throws(
      () =>
        runChangesetPolicy({
          execFile: fixture.execFile,
          env: failCommand === 'symbolic-ref' ? {} : { GITHUB_HEAD_REF: 'feat/failure' },
          write: () => {},
        }),
      new RegExp(`Git ${failCommand} failed`),
      failCommand,
    )
  }

  const changesetRead = createCommandFixture({
    changedPaths: [
      'packages/core/src/index.ts',
      '.changeset/core-change.md',
    ],
    failCommand: 'cat-file',
  })
  assert.throws(
    () => runChangesetPolicy({
      execFile: changesetRead.execFile,
      env: { GITHUB_HEAD_REF: 'feat/changeset-read-failure' },
      write: () => {},
    }),
    /Git cat-file failed/u,
  )
})

test('explains the full-history requirement when the base or merge base is unavailable', () => {
  for (const failCommand of ['rev-parse', 'merge-base']) {
    const fixture = createCommandFixture({ failCommand })
    assert.throws(
      () =>
        runChangesetPolicy({
          execFile: fixture.execFile,
          env: { CHANGESET_POLICY_BRANCH: 'feat/full-history' },
          write: () => {},
        }),
      /fetch-depth: 0 is required/,
      failCommand,
    )
  }
})

test('rejects an ambiguous pull-request branch before invoking Git', () => {
  let invoked = false
  assert.throws(
    () =>
      runChangesetPolicy({
        execFile: () => {
          invoked = true
          return Buffer.alloc(0)
        },
        env: { GITHUB_HEAD_REF: 'feat/one\nfeat/two' },
        write: () => {},
      }),
    /pull-request branch.*single valid branch name/,
  )
  assert.equal(invoked, false)
})
