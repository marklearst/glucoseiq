import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assertPackedCoreDependency,
  assertLaunchVersionPolicy,
  assertValidPackageVersions,
  compareStableSemver,
  createLaunchPackageVersions,
  parsePackageContractSource,
  requiresSourceReadmeParity,
  queryPublicLaunchVersions,
} from './lib/package-contracts.mjs'

const packageCommandHelpers = await import('./lib/package-command.mjs').catch(() => ({}))
const {
  DEFAULT_PACKAGE_COMMAND_TIMEOUT_MS,
  spawnPackageContractCommandSync,
} = packageCommandHelpers

assert.equal(
  typeof spawnPackageContractCommandSync,
  'function',
  'the package matrix must expose one bounded synchronous command helper',
)

let observedCommand
const successfulCommand = spawnPackageContractCommandSync('npm', ['pack', '@glucoseiq/core'], {
  cwd: '/tmp/package-contract-consumer',
  env: { PACKAGE_CONTRACT_TEST: '1' },
  spawnSyncImpl(command, args, options) {
    observedCommand = { command, args, options }
    return { status: 0, signal: null, stdout: 'ok\n', stderr: '' }
  },
})
assert.equal(successfulCommand.status, 0)
assert.equal(observedCommand.command, 'npm')
assert.deepEqual(observedCommand.args, ['pack', '@glucoseiq/core'])
assert.equal(observedCommand.options.cwd, '/tmp/package-contract-consumer')
assert.deepEqual(observedCommand.options.env, { PACKAGE_CONTRACT_TEST: '1' })
assert.equal(observedCommand.options.encoding, 'utf8')
assert.equal(observedCommand.options.timeout, DEFAULT_PACKAGE_COMMAND_TIMEOUT_MS)
assert.equal(
  observedCommand.options.killSignal,
  'SIGKILL',
  'package-contract command deadlines must terminate resistant child processes',
)
assert.equal(Number.isFinite(observedCommand.options.timeout), true)
assert.ok(observedCommand.options.timeout > 0)

for (const timeoutMs of [0, -1, Number.POSITIVE_INFINITY, Number.NaN, 1.5, '120000']) {
  assert.throws(
    () =>
      spawnPackageContractCommandSync('npm', ['pack'], {
        timeoutMs,
        spawnSyncImpl() {
          throw new Error('the command must not start with an invalid timeout')
        },
      }),
    /package-contract command timeout must be a positive integer in milliseconds/,
  )
}

const timeoutError = Object.assign(new Error('spawnSync npm ETIMEDOUT'), {
  code: 'ETIMEDOUT',
})
assert.throws(
  () =>
    spawnPackageContractCommandSync('npm', ['install', '--ignore-scripts'], {
      timeoutMs: 321,
      spawnSyncImpl() {
        return {
          error: timeoutError,
          status: null,
          signal: 'SIGTERM',
          stdout: '',
          stderr: '',
        }
      },
    }),
  (error) => {
    assert.equal(
      error.message,
      'npm install --ignore-scripts timed out after 321 ms. Inspect the package registry, network, or child process before retrying.',
    )
    return true
  },
)

const resistantChildStartedAt = Date.now()
assert.throws(
  () =>
    spawnPackageContractCommandSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)",
      ],
      { timeoutMs: 100 },
    ),
  /timed out after 100 ms/u,
)
assert.ok(
  Date.now() - resistantChildStartedAt < 5_000,
  'a child that ignores SIGTERM must still be terminated before the matrix can hang',
)

const packageMatrixSource = readFileSync(
  new URL('./test-package-contracts.mjs', import.meta.url),
  'utf8',
)
assert.doesNotMatch(
  packageMatrixSource,
  /\bspawnSync\b/u,
  'the package matrix must not bypass the bounded command helper',
)
assert.match(
  packageMatrixSource,
  /spawnPackageContractCommandSync/u,
  'the package matrix must route external commands through the bounded helper',
)

const launchChangesetSource = readFileSync(
  new URL('./test-launch-changeset.mjs', import.meta.url),
  'utf8',
)
assert.doesNotMatch(
  launchChangesetSource,
  /\bspawnSync\b/u,
  'launch Changeset validation must not bypass the bounded command helper',
)
assert.match(
  launchChangesetSource,
  /spawnPackageContractCommandSync/u,
  'launch Changeset validation must route external commands through the bounded helper',
)

const baselineVersions = new Map([
  ['@glucoseiq/core', '0.0.0'],
  ['@glucoseiq/react', '0.0.0'],
  ['@glucoseiq/tokens', '0.0.0'],
  ['@glucoseiq/testing', '0.0.0'],
  ['@glucoseiq/cli', '0.0.0'],
])
const launchVersions = new Map([
  ['@glucoseiq/core', '1.0.0'],
  ['@glucoseiq/react', '1.0.0'],
  ['@glucoseiq/tokens', '1.0.0'],
  ['@glucoseiq/testing', '1.0.0'],
  ['@glucoseiq/cli', '1.0.0'],
])

assert.deepEqual(createLaunchPackageVersions(), launchVersions)
assert.equal(parsePackageContractSource([]), 'local')
assert.equal(parsePackageContractSource(['--source', 'local']), 'local')
assert.equal(parsePackageContractSource(['--source', 'candidate']), 'candidate')
assert.equal(parsePackageContractSource(['--source=registry']), 'registry')
assert.equal(requiresSourceReadmeParity('local'), true)
assert.equal(requiresSourceReadmeParity('candidate'), true)
assert.equal(requiresSourceReadmeParity('registry'), false)
assert.throws(() => parsePackageContractSource(['--source', 'unknown']), /must be local, candidate, or registry/)
assert.throws(() => parsePackageContractSource(['--source']), /requires a value/)
assert.throws(() => parsePackageContractSource(['unexpected']), /Unexpected package-contract argument/)

assert.doesNotThrow(() =>
  assertPackedCoreDependency({
    source: 'candidate',
    range: '^1.4.0',
    coreVersion: '1.4.0',
  }),
)
assert.throws(
  () =>
    assertPackedCoreDependency({
      source: 'candidate',
      range: '^1.0.0',
      coreVersion: '1.4.0',
    }),
  /must equal \^1\.4\.0/,
)
for (const range of ['^1.0.0', '^1.3.0', '^1.4.0']) {
  assert.doesNotThrow(() =>
    assertPackedCoreDependency({ source: 'registry', range, coreVersion: '1.4.0' }),
  )
}
for (const range of ['workspace:^', '>=1.0.0', '^0.9.0', '^1.5.0', '^2.0.0']) {
  assert.throws(
    () => assertPackedCoreDependency({ source: 'registry', range, coreVersion: '1.4.0' }),
    /registry core dependency/,
  )
}
assert.doesNotThrow(() =>
  assertPackedCoreDependency({ source: 'registry', range: '^2.0.0', coreVersion: '2.1.0' }),
)
assert.throws(
  () => assertPackedCoreDependency({ source: 'registry', range: '^1.0.0', coreVersion: '2.1.0' }),
  /does not include 2\.1\.0/,
)
const registryMetadata = (url) => {
  const pathname = new URL(url).pathname.split('/').filter(Boolean)
  return {
    name: decodeURIComponent(pathname.at(-2)),
    version: decodeURIComponent(pathname.at(-1)),
  }
}

assert.doesNotThrow(() =>
  assertValidPackageVersions(
    new Map([
      ['@glucoseiq/core', { version: '1.3.0' }],
      ['@glucoseiq/react', { version: '2.1.0' }],
      ['@glucoseiq/tokens', { version: '1.0.4' }],
      ['@glucoseiq/testing', { version: '3.0.0-beta.2' }],
      ['@glucoseiq/cli', { version: '1.8.1+build.7' }],
    ]),
  ),
  'independently versioned packages should be valid',
)

assert.throws(
  () => assertValidPackageVersions(new Map([['@glucoseiq/core', { version: 'next' }]])),
  /valid semantic version/,
)

assert.equal(compareStableSemver('1.0.0', '1.0.0'), 0)
assert.equal(compareStableSemver('1.10.0', '1.2.9'), 1)
assert.equal(compareStableSemver('2.0.0+build.7', '1.99.99'), 1)
assert.equal(compareStableSemver('9007199254740993.0.0', '9007199254740992.0.0'), 1)
assert.throws(() => compareStableSemver('2.0.0-beta.1', '2.0.0'), /stable semantic version/)

assert.equal(
  assertLaunchVersionPolicy({
    currentVersions: baselineVersions,
    baselineVersions,
    launchVersions,
    hasLaunchChangeset: true,
    allLaunchVersionsPublic: false,
  }),
  'baseline',
)
assert.equal(
  assertLaunchVersionPolicy({
    currentVersions: launchVersions,
    baselineVersions,
    launchVersions,
    hasLaunchChangeset: false,
    allLaunchVersionsPublic: false,
  }),
  'release',
)

const independentVersions = new Map([
  ['@glucoseiq/core', '1.4.0'],
  ['@glucoseiq/react', '2.1.0'],
  ['@glucoseiq/tokens', '1.0.3'],
  ['@glucoseiq/testing', '3.0.0'],
  ['@glucoseiq/cli', '1.8.1+build.7'],
])
assert.equal(
  assertLaunchVersionPolicy({
    currentVersions: independentVersions,
    baselineVersions,
    launchVersions,
    hasLaunchChangeset: false,
    allLaunchVersionsPublic: true,
  }),
  'stable',
)
assert.throws(
  () =>
    assertLaunchVersionPolicy({
      currentVersions: independentVersions,
      baselineVersions,
      launchVersions,
      hasLaunchChangeset: false,
      allLaunchVersionsPublic: false,
    }),
  /not all public/,
)
assert.throws(
  () =>
    assertLaunchVersionPolicy({
      currentVersions: new Map(independentVersions).set('@glucoseiq/core', '0.9.9'),
      baselineVersions,
      launchVersions,
      hasLaunchChangeset: false,
      allLaunchVersionsPublic: true,
    }),
  /at least 1\.0\.0/,
)
assert.throws(
  () =>
    assertLaunchVersionPolicy({
      currentVersions: new Map(independentVersions).set('@glucoseiq/cli', '1.8.2-rc.1'),
      baselineVersions,
      launchVersions,
      hasLaunchChangeset: false,
      allLaunchVersionsPublic: true,
    }),
  /stable semantic version/,
)

const publicResult = await queryPublicLaunchVersions(launchVersions, {
  fetchImpl: async (url) => ({
    status: 200,
    json: async () => registryMetadata(url),
  }),
})
assert.equal(publicResult.allPublic, true)
assert.deepEqual(publicResult.missing, [])

const partialResult = await queryPublicLaunchVersions(launchVersions, {
  fetchImpl: async (url) => ({
    status: url.includes(encodeURIComponent('@glucoseiq/testing')) ? 404 : 200,
    json: async () => registryMetadata(url),
  }),
})
assert.equal(partialResult.allPublic, false)
assert.deepEqual(partialResult.missing, ['@glucoseiq/testing@1.0.0'])

await assert.rejects(
  () =>
    queryPublicLaunchVersions(launchVersions, {
      fetchImpl: async () => ({ status: 503, statusText: 'Service Unavailable' }),
    }),
  /public npm registry returned 503/,
)
await assert.rejects(
  () =>
    queryPublicLaunchVersions(new Map([['@glucoseiq/core', '1.0.0']]), {
      fetchImpl: async () => ({
        status: 200,
        json: async () => ({ name: '@glucoseiq/react', version: '1.0.0' }),
      }),
    }),
  /unexpected metadata/,
)

console.log('Package contract helper tests passed.')
