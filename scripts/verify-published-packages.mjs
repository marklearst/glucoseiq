import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPackedCoreDependency } from './lib/package-contracts.mjs'
import { runChangesetPolicy } from './test-changeset-policy.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const DEFAULT_REPOSITORY = 'marklearst/glucoseiq'
const DEFAULT_ATTEMPTS = 31
const DEFAULT_POLL_INTERVAL_MS = 20_000
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_COMMAND_TIMEOUT_MS = 15 * 60_000
const DEFAULT_POLICY_COMMAND_TIMEOUT_MS = 120_000
const PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1'
const PROVENANCE_STATEMENT = 'https://in-toto.io/Statement/v1'
const PROVENANCE_BUILD_TYPE = 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1'
const PROVENANCE_REPOSITORY = 'https://github.com/marklearst/glucoseiq'
const PROVENANCE_WORKFLOW = '.github/workflows/release.yml'
const PROVENANCE_REF = 'refs/heads/main'
const PROVENANCE_BUILDER = 'https://github.com/actions/runner/github-hosted'
const PROVENANCE_SOURCE = 'git+https://github.com/marklearst/glucoseiq@refs/heads/main'
const GIT_SHA = /^[a-f0-9]{40}$/u
const GIT_COMMIT_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u

const launchDefinitions = [
  {
    name: '@glucoseiq/core',
    directory: 'packages/core',
    minimumVersion: '1.0.0',
  },
  {
    name: '@glucoseiq/react',
    directory: 'packages/react',
    minimumVersion: '1.0.0',
    coreDependency: true,
  },
  {
    name: '@glucoseiq/tokens',
    directory: 'packages/tokens',
    minimumVersion: '1.0.0',
  },
  {
    name: '@glucoseiq/testing',
    directory: 'packages/testing',
    minimumVersion: '1.0.0',
    coreDependency: true,
  },
  {
    name: '@glucoseiq/cli',
    directory: 'packages/cli',
    minimumVersion: '1.0.0',
    coreDependency: true,
  },
  {
    name: 'diabetic-utils',
    directory: 'packages/diabetic-utils',
    minimumVersion: '2.0.0',
    coreDependency: true,
  },
]

export const LAUNCH_PACKAGES = Object.freeze(
  launchDefinitions.map((definition) => Object.freeze({
    ...definition,
    version: definition.minimumVersion,
    tag: `${definition.name}@${definition.minimumVersion}`,
    ...(definition.coreDependency
      ? { coreVersion: '1.0.0' }
      : {}),
  })),
)

function stableSemverParts(version, label) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(version)
  if (!match) throw new Error(`${label} must be a stable semantic version; received ${version}`)
  return match.slice(1).map((part) => BigInt(part))
}

function compareStableSemver(left, right) {
  const leftParts = stableSemverParts(left, 'version')
  const rightParts = stableSemverParts(right, 'minimum version')
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1
    if (leftParts[index] < rightParts[index]) return -1
  }
  return 0
}

export function createPublishedPackageSpecs(manifests) {
  if (!(manifests instanceof Map)) throw new TypeError('manifests must be a Map')

  const source = new Map(launchDefinitions.map((definition) => {
    const manifest = manifests.get(definition.name)
    if (!manifest || typeof manifest !== 'object') {
      throw new Error(`Missing source manifest for ${definition.name}`)
    }
    if (manifest.name !== definition.name) {
      throw new Error(
        `${definition.directory}/package.json name must be ${definition.name}; received ${manifest.name ?? 'missing'}`,
      )
    }
    const version = manifest.version
    stableSemverParts(version, `${definition.name} version`)
    if (compareStableSemver(version, definition.minimumVersion) < 0) {
      throw new Error(
        `${definition.name} version must be at least ${definition.minimumVersion}; received ${version}`,
      )
    }

    return [definition.name, manifest]
  }))
  const coreVersion = source.get('@glucoseiq/core').version

  return Object.freeze(launchDefinitions.map((definition) => {
    const manifest = source.get(definition.name)
    const version = manifest.version
    let requiredCoreVersion
    if (definition.coreDependency) {
      const sourceRange = manifest.dependencies?.['@glucoseiq/core']
      if (sourceRange === 'workspace:^') {
        requiredCoreVersion = coreVersion
      } else if (typeof sourceRange === 'string' && sourceRange.length > 0) {
        if (sourceRange.startsWith('workspace:')) {
          throw new Error(
            `${definition.name} uses unsupported source range ${sourceRange} for @glucoseiq/core`,
          )
        }
        assertPackedCoreDependency({
          source: 'registry',
          range: sourceRange,
          coreVersion,
          packageName: definition.name,
        })
        requiredCoreVersion = coreVersion
      } else {
        throw new Error(
          `${definition.name} source manifest must depend on @glucoseiq/core`,
        )
      }
    }

    return Object.freeze({
      ...definition,
      version,
      tag: `${definition.name}@${version}`,
      ...(requiredCoreVersion ? { coreVersion: requiredCoreVersion } : {}),
    })
  }))
}

export function loadPublishedPackageSpecs({ repoRoot = repositoryRoot } = {}) {
  const manifests = new Map(launchDefinitions.map((definition) => {
    const manifestPath = join(repoRoot, definition.directory, 'package.json')
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Unable to read ${manifestPath}: ${message}`, { cause: error })
    }
    return [definition.name, manifest]
  }))
  return createPublishedPackageSpecs(manifests)
}

function assertPackageSpecs(packageSpecs) {
  if (!Array.isArray(packageSpecs) || packageSpecs.length !== launchDefinitions.length) {
    throw new Error(`packageSpecs must contain exactly ${launchDefinitions.length} packages`)
  }
  for (let index = 0; index < launchDefinitions.length; index += 1) {
    const expected = launchDefinitions[index]
    const actual = packageSpecs[index]
    if (actual?.name !== expected.name || actual?.directory !== expected.directory) {
      throw new Error(`packageSpecs[${index}] must describe ${expected.name}`)
    }
    stableSemverParts(actual.version, `${actual.name} version`)
    if (compareStableSemver(actual.version, expected.minimumVersion) < 0) {
      throw new Error(
        `${actual.name} version must be at least ${expected.minimumVersion}; received ${actual.version}`,
      )
    }
    if (actual.tag !== `${actual.name}@${actual.version}`) {
      throw new Error(`${actual.name} tag must be ${actual.name}@${actual.version}`)
    }
    const validInternalContract =
      !expected.coreDependency || typeof actual.coreVersion === 'string'
    if (
      Boolean(actual.coreDependency) !== Boolean(expected.coreDependency) ||
      !validInternalContract
    ) {
      throw new Error(`${actual.name} internal dependency contract is invalid`)
    }
  }
}

export function createExpectedPublicationPlan(
  versionedPackages,
  packageSpecs = LAUNCH_PACKAGES,
) {
  assertPackageSpecs(packageSpecs)
  if (!Array.isArray(versionedPackages) || versionedPackages.length === 0) {
    throw new Error('versionedPackages must contain at least one package directory')
  }
  const specsByDirectory = new Map(
    packageSpecs.map((spec) => [spec.directory, spec]),
  )
  const seen = new Set()
  const directories = versionedPackages.map((directory) => {
    if (typeof directory !== 'string' || !specsByDirectory.has(directory)) {
      throw new Error(`versionedPackages contains unknown package directory: ${directory}`)
    }
    if (seen.has(directory)) {
      throw new Error(`versionedPackages contains duplicate package directory: ${directory}`)
    }
    seen.add(directory)
    return directory
  }).sort()

  return Object.freeze(directories.map((directory) => {
    const { name, version } = specsByDirectory.get(directory)
    return Object.freeze({ name, version })
  }))
}

function checkedOutFirstParent({ execFile, cwd, commandTimeoutMs }) {
  let output
  try {
    output = execFile(
      'git',
      ['rev-parse', '--verify', '--end-of-options', 'HEAD^1^{commit}'],
      {
        cwd,
        encoding: null,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: commandTimeoutMs,
      },
    )
  } catch (error) {
    throw new Error('Unable to resolve the checked-out release commit first parent', {
      cause: error,
    })
  }
  if (!Buffer.isBuffer(output) && !(output instanceof Uint8Array)) {
    throw new Error('HEAD first parent did not resolve to a commit ID')
  }
  const parent = Buffer.from(output).toString('utf8').trim()
  if (!GIT_COMMIT_OID.test(parent)) {
    throw new Error('HEAD first parent did not resolve to a commit ID')
  }
  return parent
}

export function deriveCheckedOutReleasePlan({
  cwd = repositoryRoot,
  packageSpecs = LAUNCH_PACKAGES,
  execFile = execFileSync,
  runPolicy = runChangesetPolicy,
  commandTimeoutMs = DEFAULT_POLICY_COMMAND_TIMEOUT_MS,
} = {}) {
  assertPackageSpecs(packageSpecs)
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new TypeError('cwd must be a non-empty path')
  }
  if (typeof execFile !== 'function') throw new TypeError('execFile must be a function')
  if (typeof runPolicy !== 'function') throw new TypeError('runPolicy must be a function')
  assertPositiveInteger(commandTimeoutMs, 'commandTimeoutMs')

  const baseSha = checkedOutFirstParent({ execFile, cwd, commandTimeoutMs })
  const policy = runPolicy({
    execFile,
    env: {
      GITHUB_ACTIONS: 'false',
      CHANGESET_POLICY_BRANCH: 'main',
      CHANGESET_POLICY_BASE_SHA: baseSha,
    },
    cwd,
    write: () => {},
    generatedVersionOptions: { commandTimeoutMs },
  })
  if (policy?.reason !== 'generated-version-commit') {
    throw new Error(
      'The checked-out commit must be an exact replay-validated generated-version commit',
    )
  }
  return createExpectedPublicationPlan(policy.versionedPackages, packageSpecs)
}

export function resolveDirectVerificationPlan({
  env = process.env,
  cwd = repositoryRoot,
  packageSpecs = LAUNCH_PACKAGES,
  derivePlan = deriveCheckedOutReleasePlan,
  execFile = execFileSync,
  runPolicy = runChangesetPolicy,
  commandTimeoutMs = DEFAULT_POLICY_COMMAND_TIMEOUT_MS,
} = {}) {
  assertPackageSpecs(packageSpecs)
  if (!env || typeof env !== 'object') throw new TypeError('env must be an object')
  if (typeof derivePlan !== 'function') throw new TypeError('derivePlan must be a function')
  const provided = env.CHANGESETS_VERIFICATION_PACKAGES
  if (provided !== undefined) return parsePublishedPackages(provided, packageSpecs)

  const derived = derivePlan({
    cwd,
    packageSpecs,
    execFile,
    runPolicy,
    commandTimeoutMs,
  })
  return normalizePublishedPackages(derived, packageSpecs)
}

function normalizePublishedPackages(publishedPackages, packageSpecs) {
  if (!Array.isArray(publishedPackages) || publishedPackages.length === 0) {
    throw new Error('publishedPackages must contain at least one package')
  }
  const expectedByName = new Map(packageSpecs.map((spec) => [spec.name, spec]))
  const seen = new Set()
  return publishedPackages.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.name !== 'string' ||
      typeof entry.version !== 'string'
    ) {
      throw new Error('publishedPackages entries must contain name and version')
    }
    const expected = expectedByName.get(entry.name)
    if (!expected) {
      throw new Error(`publishedPackages contains unknown package ${entry.name}`)
    }
    if (entry.version !== expected.version) {
      throw new Error(
        `publishedPackages ${entry.name} version must be ${expected.version}; received ${entry.version}`,
      )
    }
    const identity = `${entry.name}@${entry.version}`
    if (seen.has(entry.name)) {
      throw new Error(`publishedPackages contains duplicate ${identity}`)
    }
    seen.add(entry.name)
    return expected
  })
}

export function parsePublishedPackages(source, packageSpecs = LAUNCH_PACKAGES) {
  assertPackageSpecs(packageSpecs)
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('publishedPackages output must be provided')
  }
  let publishedPackages
  try {
    publishedPackages = JSON.parse(source)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`publishedPackages output is invalid JSON: ${message}`, { cause: error })
  }
  return normalizePublishedPackages(publishedPackages, packageSpecs)
}

function parseOptionalPublishedPackages(source, packageSpecs) {
  if (source === undefined || source === null) return []
  if (typeof source !== 'string') {
    throw new TypeError('publishedPackages output must be a string')
  }
  if (source.trim() === '') return []
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`publishedPackages output is invalid JSON: ${message}`, { cause: error })
  }
  if (!Array.isArray(parsed)) {
    throw new Error('publishedPackages output must be an array')
  }
  return parsed.length === 0
    ? []
    : normalizePublishedPackages(parsed, packageSpecs)
}

function parseExpectedPublicationPlan(source, packageSpecs) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('expected publication plan must be provided')
  }
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`expected publication plan is invalid JSON: ${message}`, { cause: error })
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('expected publication plan must contain at least one package')
  }
  return normalizePublishedPackages(parsed, packageSpecs)
}

export function resolvePublicationInventory({
  actionOutcome,
  published,
  publishedPackages,
  expectedPackages,
}, packageSpecs = LAUNCH_PACKAGES) {
  assertPackageSpecs(packageSpecs)
  if (actionOutcome !== 'success' && actionOutcome !== 'failure') {
    throw new Error('Changesets action outcome must be success or failure')
  }
  if (published !== undefined && published !== '' && published !== 'true' && published !== 'false') {
    throw new Error('Changesets published output must be "true", "false", or unset')
  }

  const expected = parseExpectedPublicationPlan(expectedPackages, packageSpecs)
  const expectedNames = new Set(expected.map(({ name }) => name))
  const reported = parseOptionalPublishedPackages(publishedPackages, packageSpecs)
  if (reported.length > 0) {
    for (const spec of reported) {
      if (!expectedNames.has(spec.name)) {
        throw new Error(
          `publishedPackages contains package outside the validated plan: ${spec.name}@${spec.version}`,
        )
      }
    }
    return Object.freeze({
      source: 'changesets',
      reportedPackages: Object.freeze(reported),
      verificationPackages: Object.freeze(expected),
    })
  }

  if (published === 'true') {
    throw new Error(
      'Changesets reported published=true but did not provide a package inventory',
    )
  }
  return Object.freeze({
    source: 'expected-plan',
    reportedPackages: Object.freeze(expected),
    verificationPackages: Object.freeze(expected),
  })
}

const NPM_AUTH_FIELDS = new Set([
  '_auth',
  '_authtoken',
  '_password',
  'certfile',
  'keyfile',
  'username',
])

function isNpmAuthenticationLine(line) {
  const trimmed = line.trimStart()
  if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) return false
  const separator = trimmed.indexOf('=')
  if (separator === -1) return false
  const key = trimmed.slice(0, separator).trim()
  const field = key.slice(key.lastIndexOf(':') + 1).toLowerCase()
  return NPM_AUTH_FIELDS.has(field)
}

export function scrubNpmAuthConfiguration(source) {
  if (typeof source !== 'string') throw new TypeError('npm configuration must be a string')
  let removed = 0
  const configuration = source
    .split(/(?<=\n)/u)
    .filter((line) => {
      const content = line.endsWith('\n')
        ? line.slice(0, line.endsWith('\r\n') ? -2 : -1)
        : line
      if (!isNpmAuthenticationLine(content)) return true
      removed += 1
      return false
    })
    .join('')
  return Object.freeze({ configuration, removed })
}

export function scrubUserNpmAuth({ userConfig } = {}) {
  if (typeof userConfig !== 'string' || userConfig.length === 0) {
    throw new TypeError('userConfig must be a non-empty path')
  }
  let source
  try {
    source = readFileSync(userConfig, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return Object.freeze({ configuration: '', removed: 0 })
    }
    throw error
  }
  const result = scrubNpmAuthConfiguration(source)
  if (result.removed === 0) return result

  writeFileSync(userConfig, result.configuration, 'utf8')
  const confirmed = scrubNpmAuthConfiguration(readFileSync(userConfig, 'utf8'))
  if (confirmed.removed !== 0) {
    throw new Error(`npm authentication cleanup did not complete for ${userConfig}`)
  }
  return result
}

function assertFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`)
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer`)
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}

function normalizedRegistry(registry) {
  let url
  try {
    url = new URL(registry)
  } catch (error) {
    throw new Error(`registry must be an absolute URL; received ${registry}`, { cause: error })
  }
  if (url.protocol !== 'https:') throw new Error('registry must use HTTPS')
  url.pathname = url.pathname.replace(/\/+$/u, '')
  url.search = ''
  url.hash = ''
  return url.href.replace(/\/$/u, '')
}

function requestSignal(timeoutMs) {
  return AbortSignal.timeout(timeoutMs)
}

function responseStatus(response) {
  return Number.isInteger(response?.status) ? response.status : undefined
}

function registryStatusReason(status, statusText) {
  const suffix = statusText ? ` ${statusText}` : ''
  return `registry returned ${status ?? 'an invalid status'}${suffix}`
}

function isTransientRegistryStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599)
}

function isTransientRequestError(error) {
  const code = error?.code ?? error?.cause?.code
  return (
    error instanceof TypeError ||
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    [
      'ABORT_ERR',
      'ECONNRESET',
      'ENETRESET',
      'ETIMEDOUT',
      'UND_ERR_ABORTED',
      'UND_ERR_BODY_TIMEOUT',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_SOCKET',
    ].includes(code)
  )
}

async function fetchPackument(spec, { fetchImpl, registry, timeoutMs }) {
  const url = `${registry}/${encodeURIComponent(spec.name)}`
  let response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal: requestSignal(timeoutMs),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { kind: 'transient', reason: `unable to fetch registry metadata: ${message}` }
  }

  const status = responseStatus(response)
  if (status === 404) return { kind: 'missing', reason: 'registry returned 404' }
  if (isTransientRegistryStatus(status)) {
    return {
      kind: 'transient',
      reason: registryStatusReason(status, response?.statusText),
    }
  }
  if (status !== 200) {
    throw new Error(
      `${registryStatusReason(status, response?.statusText)} for ${spec.name}@${spec.version}`,
    )
  }

  let packument
  try {
    packument = await response.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isTransientRequestError(error)) {
      return {
        kind: 'transient',
        reason: `unable to read registry metadata: ${message}`,
      }
    }
    throw new Error(
      `Registry returned invalid JSON for ${spec.name}@${spec.version}: ${message}`,
      { cause: error },
    )
  }
  assertPlainObject(packument, `${spec.name} registry metadata`)
  if (packument.name !== spec.name) {
    throw new Error(
      `Registry returned metadata for ${packument.name ?? 'an unknown package'} while checking ${spec.name}@${spec.version}`,
    )
  }
  return { kind: 'record', packument }
}

function versionIdentities(specs) {
  return specs.map(({ name, version }) => `${name}@${version}`)
}

export async function pollForPublishedMetadata({
  packageSpecs = LAUNCH_PACKAGES,
  fetchImpl = globalThis.fetch,
  registry = DEFAULT_REGISTRY,
  maxAttempts = DEFAULT_ATTEMPTS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
} = {}) {
  assertPackageSpecs(packageSpecs)
  assertFunction(fetchImpl, 'fetchImpl')
  assertFunction(sleep, 'sleep')
  assertPositiveInteger(maxAttempts, 'maxAttempts')
  assertNonNegativeInteger(pollIntervalMs, 'pollIntervalMs')
  assertPositiveInteger(requestTimeoutMs, 'requestTimeoutMs')
  const registryRoot = normalizedRegistry(registry)
  const ready = new Map()
  const seenExactVersions = new Set()
  const reasons = new Map()
  const states = new Map()

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const pendingSpecs = packageSpecs.filter((spec) => !ready.has(spec.name))
    const pendingResults = await Promise.allSettled(pendingSpecs.map((spec) =>
      fetchPackument(spec, {
        fetchImpl,
        registry: registryRoot,
        timeoutMs: requestTimeoutMs,
      })))

    for (let index = 0; index < pendingSpecs.length; index += 1) {
      const spec = pendingSpecs[index]
      const settledResult = pendingResults[index]
      if (settledResult.status === 'rejected') throw settledResult.reason
      const result = settledResult.value
      if (result.kind !== 'record') {
        reasons.set(spec.name, result.reason)
        states.set(spec.name, result.kind)
        continue
      }

      const { packument } = result
      if (packument.versions?.[spec.version]) seenExactVersions.add(spec.name)
      const readinessIssue = registryReadinessIssue(spec, packument)
      if (readinessIssue) {
        reasons.set(spec.name, readinessIssue)
        states.set(spec.name, 'unready')
        continue
      }
      validateRegistryRecord(spec, packument, registryRoot)
      ready.set(spec.name, packument)
      reasons.delete(spec.name)
      states.set(spec.name, 'ready')
    }

    if (ready.size === packageSpecs.length) {
      return new Map(packageSpecs.map((spec) => [spec.name, ready.get(spec.name)]))
    }
    if (attempt < maxAttempts) await sleep(pollIntervalMs)
  }

  const present = packageSpecs.filter((spec) => seenExactVersions.has(spec.name))
  const missing = packageSpecs.filter((spec) => !seenExactVersions.has(spec.name))
  if (present.length === 0) {
    const confirmedAbsent = missing.filter((spec) => states.get(spec.name) === 'missing')
    const unready = missing.filter((spec) => states.get(spec.name) !== 'missing')
    if (unready.length > 0) {
      const unreadyDetails = unready.map(
        (spec) => `${spec.name}@${spec.version} (${reasons.get(spec.name) ?? 'not ready'})`,
      )
      throw new Error(
        `Registry publication readiness could not be confirmed after ${maxAttempts} attempts. Confirmed absent: ${versionIdentities(confirmedAbsent).join(', ') || 'none'}. Unready: ${unreadyDetails.join(', ')}`,
      )
    }
    throw new Error(
      `No launch package versions became visible after ${maxAttempts} attempts. Missing: ${versionIdentities(missing).join(', ')}`,
    )
  }
  const readyIdentities = versionIdentities(packageSpecs.filter((spec) => ready.has(spec.name)))
  const unready = packageSpecs
    .filter((spec) => !ready.has(spec.name))
    .map((spec) => `${spec.name}@${spec.version} (${reasons.get(spec.name) ?? 'not ready'})`)
  throw new Error(
    `Partial publication readiness detected after ${maxAttempts} attempts. Present: ${versionIdentities(present).join(', ') || 'none'}. Missing: ${versionIdentities(missing).join(', ') || 'none'}. Ready: ${readyIdentities.join(', ') || 'none'}. Unready: ${unready.join(', ')}`,
  )
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
}

function registryReadinessIssue(spec, packument) {
  assertPlainObject(packument, `${spec.name} registry metadata`)
  if (packument.name !== spec.name) {
    throw new Error(`${spec.name} registry record returned name ${packument.name ?? 'missing'}`)
  }

  if (packument['dist-tags'] !== undefined) {
    assertPlainObject(packument['dist-tags'], `${spec.name} distribution tags`)
  }
  if (packument['dist-tags']?.latest !== spec.version) {
    return `${spec.name} latest must be ${spec.version}; received ${packument['dist-tags']?.latest ?? 'missing'}`
  }
  if (
    spec.name === 'diabetic-utils' &&
    packument['dist-tags']?.legacy !== '1.5.0'
  ) {
    return `diabetic-utils legacy must remain 1.5.0; received ${packument['dist-tags']?.legacy ?? 'missing'}`
  }

  if (packument.versions !== undefined) {
    assertPlainObject(packument.versions, `${spec.name} version inventory`)
  }
  const metadata = packument.versions?.[spec.version]
  if (!metadata) return `${spec.name}@${spec.version} is missing from its version inventory`
  assertPlainObject(metadata, `${spec.name}@${spec.version} registry version`)

  if (spec.name === 'diabetic-utils') {
    const legacy = packument.versions?.['1.5.0']
    if (!legacy) return 'diabetic-utils must retain diabetic-utils@1.5.0 in its version inventory'
    assertPlainObject(legacy, 'diabetic-utils@1.5.0 registry version')
  }

  if (metadata.dist === undefined) {
    return `${spec.name} distribution metadata is not visible yet`
  }
  assertPlainObject(metadata.dist, `${spec.name} distribution metadata`)
  for (const field of ['integrity', 'shasum', 'tarball']) {
    if (typeof metadata.dist[field] !== 'string' || metadata.dist[field].length === 0) {
      return `${spec.name} distribution ${field} is not visible yet`
    }
  }
  if (!Array.isArray(metadata.dist.signatures) || metadata.dist.signatures.length === 0) {
    return `${spec.name} registry signatures are not visible yet`
  }
  if (metadata.dist.attestations === undefined) {
    return `${spec.name} provenance attestations are not visible yet`
  }
  assertPlainObject(metadata.dist.attestations, `${spec.name} distribution attestations`)
  if (
    metadata.dist.attestations.provenance?.predicateType !== PROVENANCE_PREDICATE ||
    typeof metadata.dist.attestations.url !== 'string' ||
    metadata.dist.attestations.url.length === 0
  ) {
    return `${spec.name} provenance attestations are not visible yet`
  }
  return undefined
}

function workspaceRangePath(value, path = 'package.json') {
  if (typeof value === 'string') return value.startsWith('workspace:') ? path : undefined
  if (!value || typeof value !== 'object') return undefined
  for (const [key, child] of Object.entries(value)) {
    const result = workspaceRangePath(child, `${path}.${key}`)
    if (result) return result
  }
  return undefined
}

function assertUrlOnRegistry(value, registry, label) {
  let target
  try {
    target = new URL(value)
  } catch (error) {
    throw new Error(`${label} must be an absolute URL`, { cause: error })
  }
  const registryUrl = new URL(registry)
  if (target.protocol !== 'https:' || target.origin !== registryUrl.origin) {
    throw new Error(`${label} must use the public registry HTTPS origin`)
  }
}

function repositoryUrlMatches(value) {
  return (
    value === 'https://github.com/marklearst/glucoseiq.git' ||
    value === 'git+https://github.com/marklearst/glucoseiq.git'
  )
}

function assertInternalDependencyRange(spec, coreRange) {
  assertPackedCoreDependency({
    source: 'registry',
    range: coreRange,
    coreVersion: spec.coreVersion,
    packageName: spec.name,
  })
}

function assertManifestContract(
  spec,
  manifest,
  { registry, requireDistribution, registryRecord = false },
) {
  assertPlainObject(manifest, `${spec.name} manifest`)
  if (manifest.name !== spec.name || manifest.version !== spec.version) {
    throw new Error(
      `${spec.name} manifest identity must be ${spec.name}@${spec.version}; received ${manifest.name ?? 'missing'}@${manifest.version ?? 'missing'}`,
    )
  }
  if (manifest.engines?.node !== '>=24') {
    throw new Error(`${spec.name} Node engine must be >=24`)
  }
  if (manifest.private === true) throw new Error(`${spec.name} must not be private`)
  if (
    (!registryRecord && manifest.publishConfig?.access !== 'public') ||
    (registryRecord &&
      manifest.publishConfig !== undefined &&
      manifest.publishConfig?.access !== 'public')
  ) {
    throw new Error(`${spec.name} publish access must be public`)
  }
  if (manifest.license !== 'MIT') throw new Error(`${spec.name} license must be MIT`)
  if (
    manifest.repository?.type !== 'git' ||
    !repositoryUrlMatches(manifest.repository?.url) ||
    manifest.repository?.directory !== spec.directory
  ) {
    throw new Error(`${spec.name} repository metadata must point to ${spec.directory}`)
  }
  if (
    (!registryRecord && !Array.isArray(manifest.files)) ||
    (manifest.files !== undefined &&
      (!Array.isArray(manifest.files) || !manifest.files.includes('CHANGELOG.md')))
  ) {
    throw new Error(`${spec.name} files allowlist must include CHANGELOG.md`)
  }

  const workspacePath = workspaceRangePath(manifest)
  if (workspacePath) {
    throw new Error(`${spec.name} manifest must not contain workspace: ranges (${workspacePath})`)
  }

  const coreRange = manifest.dependencies?.['@glucoseiq/core']
  if (spec.coreDependency) assertInternalDependencyRange(spec, coreRange)
  if (!spec.coreDependency && coreRange !== undefined) {
    throw new Error(`${spec.name} must not depend on @glucoseiq/core`)
  }

  if (spec.name === '@glucoseiq/react') {
    if (manifest.peerDependencies?.react !== '>=18') {
      throw new Error('@glucoseiq/react React peer dependency must be >=18')
    }
    if (manifest.dependencies?.react !== undefined || manifest.optionalDependencies?.react !== undefined) {
      throw new Error('@glucoseiq/react must expose React only as a peer dependency')
    }
  }

  if (!requireDistribution) return
  assertPlainObject(manifest.dist, `${spec.name} distribution metadata`)
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(manifest.dist.integrity ?? '')) {
    throw new Error(`${spec.name} distribution must provide sha512 integrity`)
  }
  if (!/^[a-f0-9]{40}$/u.test(manifest.dist.shasum ?? '')) {
    throw new Error(`${spec.name} distribution must provide a SHA-1 shasum`)
  }
  assertUrlOnRegistry(manifest.dist.tarball, registry, `${spec.name} tarball URL`)

  if (
    !Array.isArray(manifest.dist.signatures) ||
    manifest.dist.signatures.length === 0 ||
    manifest.dist.signatures.some(
      (signature) =>
        typeof signature?.keyid !== 'string' ||
        !signature.keyid.startsWith('SHA256:') ||
        typeof signature?.sig !== 'string' ||
        signature.sig.length === 0,
    )
  ) {
    throw new Error(`${spec.name} distribution must include registry signature evidence`)
  }

  const attestations = manifest.dist.attestations
  if (
    !attestations ||
    attestations.provenance?.predicateType !== PROVENANCE_PREDICATE ||
    typeof attestations.url !== 'string'
  ) {
    throw new Error(`${spec.name} distribution must include provenance attestation evidence`)
  }
  assertUrlOnRegistry(attestations.url, registry, `${spec.name} attestation URL`)
}

function validateRegistryRecord(spec, packument, registry) {
  assertPlainObject(packument, `${spec.name} registry metadata`)
  if (packument.name !== spec.name) {
    throw new Error(`${spec.name} registry record returned name ${packument.name ?? 'missing'}`)
  }
  assertPlainObject(packument['dist-tags'], `${spec.name} distribution tags`)
  if (packument['dist-tags'].latest !== spec.version) {
    throw new Error(
      `${spec.name} latest must be ${spec.version}; received ${packument['dist-tags'].latest ?? 'missing'}`,
    )
  }
  if (
    spec.name === 'diabetic-utils' &&
    packument['dist-tags'].legacy !== '1.5.0'
  ) {
    throw new Error(
      `diabetic-utils legacy must remain 1.5.0; received ${packument['dist-tags'].legacy ?? 'missing'}`,
    )
  }

  assertPlainObject(packument.versions, `${spec.name} version inventory`)
  const metadata = packument.versions[spec.version]
  if (!metadata) throw new Error(`${spec.name}@${spec.version} is missing from its version inventory`)
  if (spec.name === 'diabetic-utils') {
    const legacy = packument.versions['1.5.0']
    if (!legacy) {
      throw new Error('diabetic-utils must retain diabetic-utils@1.5.0 in its version inventory')
    }
    assertPlainObject(legacy, 'diabetic-utils@1.5.0 registry version')
    if (Object.hasOwn(legacy, 'deprecated')) {
      throw new Error('diabetic-utils@1.5.0 must not be deprecated')
    }
  }
  assertManifestContract(spec, metadata, {
    registry,
    requireDistribution: true,
    registryRecord: true,
  })
  return { spec, metadata, packument }
}

export function validateRegistrySnapshot(
  snapshot,
  { packageSpecs = LAUNCH_PACKAGES, registry = DEFAULT_REGISTRY } = {},
) {
  if (!(snapshot instanceof Map)) throw new TypeError('snapshot must be a Map')
  assertPackageSpecs(packageSpecs)
  const registryRoot = normalizedRegistry(registry)

  return packageSpecs.map((spec) =>
    validateRegistryRecord(spec, snapshot.get(spec.name), registryRoot))
}

function expectedRegistryDigests(records) {
  return new Map(records.map(({ spec, metadata }) => {
    const encoded = metadata.dist.integrity.slice('sha512-'.length)
    const digest = Buffer.from(encoded, 'base64').toString('hex')
    if (!/^[a-f0-9]{128}$/u.test(digest)) {
      throw new Error(`${spec.name}@${spec.version} registry integrity is not a SHA-512 digest`)
    }
    return [spec.name, digest]
  }))
}

function assertSafeTarballEntries(spec, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`${spec.name} tarball inventory must not be empty`)
  }
  for (const entry of entries) {
    if (
      typeof entry !== 'string' ||
      (entry !== 'package' && entry !== 'package/' && !entry.startsWith('package/')) ||
      entry.split('/').includes('..')
    ) {
      throw new Error(`${spec.name} tarball contains an unsafe path: ${String(entry)}`)
    }
  }
  const inventory = new Set(entries)
  for (const required of [
    'package/package.json',
    'package/README.md',
    'package/LICENSE',
    'package/CHANGELOG.md',
  ]) {
    if (!inventory.has(required)) throw new Error(`${spec.name} tarball must contain ${required}`)
  }
  if (![...inventory].some((entry) => entry.startsWith('package/dist/'))) {
    throw new Error(`${spec.name} tarball must contain production files under package/dist/`)
  }
}

export function validateTarballEvidence({
  spec,
  metadata,
  archive,
  entries,
  manifest,
  changelog,
  registry = DEFAULT_REGISTRY,
}) {
  const registryRoot = normalizedRegistry(registry)
  assertPackageSpecs(LAUNCH_PACKAGES.map((launchSpec) =>
    launchSpec.name === spec?.name ? { ...launchSpec, ...spec } : launchSpec,
  ))
  if (!(archive instanceof Uint8Array)) throw new TypeError('archive must be a Uint8Array')

  const expectedIntegrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`
  if (metadata.dist.integrity !== expectedIntegrity) {
    throw new Error(`${spec.name} tarball integrity mismatch`)
  }
  const expectedShasum = createHash('sha1').update(archive).digest('hex')
  if (metadata.dist.shasum !== expectedShasum) {
    throw new Error(`${spec.name} tarball SHA-1 mismatch`)
  }

  assertSafeTarballEntries(spec, entries)
  if (typeof changelog !== 'string' || changelog.trim().length === 0) {
    throw new Error(`${spec.name} CHANGELOG.md must not be empty`)
  }
  assertManifestContract(spec, manifest, { registry: registryRoot, requireDistribution: false })
  return { name: spec.name, version: spec.version, files: entries.length }
}

export function runExternalCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
  assertPositiveInteger(timeoutMs, 'timeoutMs')
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    killSignal: 'SIGKILL',
    maxBuffer: 20 * 1024 * 1024,
    timeout: timeoutMs,
  })
  if (result.error) {
    return {
      status: null,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error,
    }
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    signal: result.signal,
  }
}

function commandTimedOut(error) {
  return error?.code === 'ETIMEDOUT'
}

async function execute(runCommand, command, args, options, label) {
  let result
  try {
    result = await runCommand(command, args, options)
  } catch (error) {
    if (commandTimedOut(error)) {
      throw new Error(`${label} timed out after ${options.timeoutMs} ms`, { cause: error })
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} could not execute: ${message}`, { cause: error })
  }
  if (result?.error) {
    if (commandTimedOut(result.error)) {
      throw new Error(`${label} timed out after ${options.timeoutMs} ms`, {
        cause: result.error,
      })
    }
    const message = result.error instanceof Error ? result.error.message : String(result.error)
    throw new Error(`${label} could not execute: ${message}`, { cause: result.error })
  }
  return result ?? {}
}

function commandFailure(result, label) {
  const detail = [result.stderr, result.stdout]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .join('\n')
  return new Error(`${label} failed${detail ? `: ${detail}` : ''}`)
}

async function executeChecked(runCommand, command, args, options, label) {
  const result = await execute(runCommand, command, args, options, label)
  if (result.status !== 0 || result.signal) throw commandFailure(result, label)
  return result
}

async function fetchTarball(
  record,
  { fetchImpl, runCommand, registry, requestTimeoutMs, commandTimeoutMs, path },
) {
  let response
  try {
    response = await fetchImpl(record.metadata.dist.tarball, {
      method: 'GET',
      headers: { accept: 'application/octet-stream' },
      credentials: 'omit',
      redirect: 'error',
      signal: requestSignal(requestTimeoutMs),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to download ${record.spec.name}@${record.spec.version}: ${message}`, {
      cause: error,
    })
  }
  if (responseStatus(response) !== 200) {
    const statusText = response?.statusText ? ` ${response.statusText}` : ''
    throw new Error(
      `Tarball download returned ${responseStatus(response) ?? 'an invalid status'}${statusText} for ${record.spec.name}@${record.spec.version}`,
    )
  }

  let archive
  try {
    archive = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to read ${record.spec.name}@${record.spec.version} tarball: ${message}`, {
      cause: error,
    })
  }
  writeFileSync(path, archive, { mode: 0o600 })

  const list = await executeChecked(
    runCommand,
    'tar',
    ['-tzf', path],
    { timeoutMs: commandTimeoutMs },
    `Inventory ${record.spec.name}@${record.spec.version}`,
  )
  const manifestResult = await executeChecked(
    runCommand,
    'tar',
    ['-xOzf', path, 'package/package.json'],
    { timeoutMs: commandTimeoutMs },
    `Read ${record.spec.name}@${record.spec.version} package.json`,
  )
  const changelogResult = await executeChecked(
    runCommand,
    'tar',
    ['-xOzf', path, 'package/CHANGELOG.md'],
    { timeoutMs: commandTimeoutMs },
    `Read ${record.spec.name}@${record.spec.version} CHANGELOG.md`,
  )

  let manifest
  try {
    manifest = JSON.parse(manifestResult.stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${record.spec.name}@${record.spec.version} tarball package.json is invalid JSON: ${message}`,
      { cause: error },
    )
  }
  const entries = list.stdout.split(/\r?\n/u).filter(Boolean)
  return validateTarballEvidence({
    spec: record.spec,
    metadata: record.metadata,
    archive,
    entries,
    manifest,
    changelog: changelogResult.stdout,
    registry,
  })
}

async function verifyTarballs(records, options) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'glucoseiq-published-'))
  try {
    const results = []
    for (let index = 0; index < records.length; index += 1) {
      results.push(await fetchTarball(records[index], {
        ...options,
        path: join(temporaryRoot, `${index}.tgz`),
      }))
    }
    return results
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

function assertReleaseSha(releaseSha) {
  if (typeof releaseSha !== 'string' || !GIT_SHA.test(releaseSha)) {
    throw new Error(`releaseSha must be a 40-character lowercase Git commit; received ${releaseSha ?? 'missing'}`)
  }
}

function decodeProvenanceStatement(bundle, identity) {
  const payload = bundle?.bundle?.dsseEnvelope?.payload
  if (
    typeof payload !== 'string' ||
    payload.length === 0 ||
    payload.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(payload)
  ) {
    throw new Error(`SLSA payload is not valid base64 JSON for ${identity}`)
  }

  let statement
  try {
    statement = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`SLSA payload is not valid base64 JSON for ${identity}: ${message}`, {
      cause: error,
    })
  }
  assertPlainObject(statement, `${identity} SLSA statement`)
  return statement
}

function packagePurl(spec) {
  return `pkg:npm/${spec.name.replace(/^@/u, '%40')}@${spec.version}`
}

function assertExpectedDigests(expectedDigests, packageSpecs) {
  if (!(expectedDigests instanceof Map)) {
    throw new TypeError('expectedDigests must be a Map')
  }
  for (const spec of packageSpecs) {
    if (!/^[a-f0-9]{128}$/u.test(expectedDigests.get(spec.name) ?? '')) {
      throw new Error(`expectedDigests must contain the SHA-512 digest for ${spec.name}@${spec.version}`)
    }
  }
}

function verifyProvenanceStatement(statement, spec, expectedDigest) {
  const identity = `${spec.name}@${spec.version}`
  if (statement._type !== PROVENANCE_STATEMENT) {
    throw new Error(`${identity} SLSA statement type must be ${PROVENANCE_STATEMENT}`)
  }
  if (statement.predicateType !== PROVENANCE_PREDICATE) {
    throw new Error(`${identity} SLSA predicate type must be ${PROVENANCE_PREDICATE}`)
  }

  const expectedSubject = packagePurl(spec)
  const subject = Array.isArray(statement.subject)
    ? statement.subject.find((entry) => entry?.name === expectedSubject)
    : undefined
  if (!subject) {
    throw new Error(`${identity} provenance subject must include ${expectedSubject}`)
  }
  if (subject.digest?.sha512 !== expectedDigest) {
    throw new Error(`${identity} provenance subject SHA-512 must match the published tarball`)
  }

  const buildDefinition = statement.predicate?.buildDefinition
  if (buildDefinition?.buildType !== PROVENANCE_BUILD_TYPE) {
    throw new Error(`${identity} SLSA build type must be ${PROVENANCE_BUILD_TYPE}`)
  }
  const workflow = buildDefinition.externalParameters?.workflow
  if (workflow?.repository !== PROVENANCE_REPOSITORY) {
    throw new Error(`${identity} workflow repository must be ${PROVENANCE_REPOSITORY}`)
  }
  if (workflow.path !== PROVENANCE_WORKFLOW) {
    throw new Error(`${identity} workflow path must be ${PROVENANCE_WORKFLOW}`)
  }
  if (workflow.ref !== PROVENANCE_REF) {
    throw new Error(`${identity} workflow ref must be ${PROVENANCE_REF}`)
  }
  if (statement.predicate?.runDetails?.builder?.id !== PROVENANCE_BUILDER) {
    throw new Error(`${identity} provenance builder must be GitHub-hosted (${PROVENANCE_BUILDER})`)
  }

  const source = Array.isArray(buildDefinition.resolvedDependencies)
    ? buildDefinition.resolvedDependencies.find((dependency) => dependency?.uri === PROVENANCE_SOURCE)
    : undefined
  if (!source) {
    throw new Error(`${identity} resolved source URI must be ${PROVENANCE_SOURCE}`)
  }
  const gitCommit = source.digest?.gitCommit
  if (typeof gitCommit !== 'string' || !GIT_SHA.test(gitCommit)) {
    throw new Error(`${identity} resolved gitCommit must be a 40-character lowercase Git commit`)
  }
  return gitCommit
}

export function verifySignatureAudit(
  source,
  packageSpecs = LAUNCH_PACKAGES,
  {
    releaseSha,
    expectedDigests,
    publishedPackages = packageSpecs,
  } = {},
) {
  assertPackageSpecs(packageSpecs)
  assertReleaseSha(releaseSha)
  assertExpectedDigests(expectedDigests, packageSpecs)
  const published = normalizePublishedPackages(publishedPackages, packageSpecs)
  const publishedNames = new Set(published.map(({ name }) => name))
  let audit
  try {
    audit = JSON.parse(source)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Signature audit returned invalid JSON: ${message}`, { cause: error })
  }
  assertPlainObject(audit, 'Signature audit result')
  if (!Array.isArray(audit.invalid) || audit.invalid.length > 0) {
    throw new Error('Signature audit reported invalid package evidence')
  }
  if (!Array.isArray(audit.missing) || audit.missing.length > 0) {
    throw new Error('Signature audit reported missing registry signatures')
  }
  if (!Array.isArray(audit.verified)) {
    throw new Error('Signature audit did not return verified attestation bundles')
  }

  const packageCommits = new Map()
  for (const spec of packageSpecs) {
    const verified = audit.verified.find(
      (entry) => entry?.name === spec.name && entry?.version === spec.version,
    )
    if (!verified) {
      throw new Error(`Signature audit did not verify ${spec.name}@${spec.version}`)
    }
    if (verified.attestations?.provenance?.predicateType !== PROVENANCE_PREDICATE) {
      throw new Error(
        `Signature audit did not return verified provenance for ${spec.name}@${spec.version}`,
      )
    }
    const provenanceBundle = Array.isArray(verified.attestationBundles)
      ? verified.attestationBundles.find(
        (bundle) => bundle?.predicateType === PROVENANCE_PREDICATE,
      )
      : undefined
    if (!provenanceBundle) {
      throw new Error(
        `Signature audit did not return a SLSA v1 provenance bundle for ${spec.name}@${spec.version}`,
      )
    }
    const identity = `${spec.name}@${spec.version}`
    const statement = decodeProvenanceStatement(provenanceBundle, identity)
    const gitCommit = verifyProvenanceStatement(
      statement,
      spec,
      expectedDigests.get(spec.name),
    )
    if (publishedNames.has(spec.name) && gitCommit !== releaseSha) {
      throw new Error(`${identity} resolved gitCommit must equal ${releaseSha}`)
    }
    packageCommits.set(spec.name, gitCommit)
  }
  return packageCommits
}

async function verifyRegistrySignatures({
  packageSpecs,
  runCommand,
  registry,
  releaseSha,
  expectedDigests,
  publishedPackages,
  commandTimeoutMs,
}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'glucoseiq-signatures-'))
  try {
    const dependencies = Object.fromEntries(
      packageSpecs.map(({ name, version }) => [name, version]),
    )
    writeFileSync(
      join(temporaryRoot, 'package.json'),
      `${JSON.stringify({ private: true, dependencies }, null, 2)}\n`,
      { mode: 0o600 },
    )

    await executeChecked(
      runCommand,
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--legacy-peer-deps',
        '--no-audit',
        '--no-fund',
        '--loglevel=error',
        `--registry=${registry}`,
      ],
      { cwd: temporaryRoot, timeoutMs: commandTimeoutMs },
      'Install exact versions for signature verification',
    )
    const audit = await executeChecked(
      runCommand,
      'npm',
      [
        'audit',
        'signatures',
        '--json',
        '--include-attestations',
        `--registry=${registry}`,
      ],
      { cwd: temporaryRoot, timeoutMs: commandTimeoutMs },
      'Verify registry signatures and provenance',
    )
    return verifySignatureAudit(audit.stdout, packageSpecs, {
      releaseSha,
      expectedDigests,
      publishedPackages,
    })
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

async function resolveReleaseSha({ runCommand, cwd, commandTimeoutMs }) {
  const result = await executeChecked(
    runCommand,
    'git',
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    { cwd, timeoutMs: commandTimeoutMs },
    'Resolve checked-out release commit',
  )
  const releaseSha = result.stdout.trim()
  assertReleaseSha(releaseSha)
  return releaseSha
}

function normalizePackageCommits(packageCommits, packageSpecs, releaseSha) {
  if (packageCommits === undefined) {
    return new Map(packageSpecs.map((spec) => [spec.name, releaseSha]))
  }
  if (!(packageCommits instanceof Map)) throw new TypeError('packageCommits must be a Map')
  return new Map(packageSpecs.map((spec) => {
    const commit = packageCommits.get(spec.name)
    if (typeof commit !== 'string' || !GIT_SHA.test(commit)) {
      throw new Error(`packageCommits must contain a Git commit for ${spec.name}@${spec.version}`)
    }
    return [spec.name, commit]
  }))
}

function remoteTagCommit(
  spec,
  result,
  directRef,
  peeledRef,
  remote,
  expectedCommit,
  releaseSha,
) {
  if (result.status === 2) {
    throw new Error(`Missing Git tag ${spec.tag} on ${remote}`)
  }
  if (result.status !== 0 || result.signal) {
    throw commandFailure(result, `Check Git tag ${spec.tag}`)
  }
  const refs = new Map()
  for (const line of result.stdout?.split(/\r?\n/u).filter(Boolean) ?? []) {
    const [sha, ref, ...extra] = line.split('\t')
    if (extra.length > 0 || !GIT_SHA.test(sha ?? '') || typeof ref !== 'string') {
      throw new Error(`Git tag ${spec.tag} returned malformed remote reference data`)
    }
    if (ref === directRef || ref === peeledRef) refs.set(ref, sha)
  }
  if (!refs.has(directRef)) throw new Error(`Missing Git tag ${spec.tag} on ${remote}`)

  const commit = refs.get(peeledRef) ?? refs.get(directRef)
  if (commit !== expectedCommit) {
    const expectation = expectedCommit === releaseSha
      ? `release commit ${releaseSha}`
      : `package provenance commit ${expectedCommit}`
    throw new Error(`${spec.tag} must resolve to ${expectation}; received ${commit}`)
  }
  return commit
}

export async function verifyRepositoryArtifacts({
  packageSpecs = LAUNCH_PACKAGES,
  runCommand = runExternalCommand,
  repository = DEFAULT_REPOSITORY,
  remote = 'origin',
  cwd = repositoryRoot,
  releaseSha: providedReleaseSha,
  packageCommits: providedPackageCommits,
  commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
} = {}) {
  assertPackageSpecs(packageSpecs)
  assertFunction(runCommand, 'runCommand')
  assertPositiveInteger(commandTimeoutMs, 'commandTimeoutMs')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    throw new Error(`repository must use owner/name form; received ${repository}`)
  }
  const releaseSha = providedReleaseSha ?? await resolveReleaseSha({
    runCommand,
    cwd,
    commandTimeoutMs,
  })
  assertReleaseSha(releaseSha)
  const packageCommits = normalizePackageCommits(
    providedPackageCommits,
    packageSpecs,
    releaseSha,
  )

  for (const spec of packageSpecs) {
    const directRef = `refs/tags/${spec.tag}`
    const peeledRef = `${directRef}^{}`
    const tagResult = await execute(
      runCommand,
      'git',
      ['ls-remote', '--exit-code', '--tags', remote, directRef, peeledRef],
      { cwd, timeoutMs: commandTimeoutMs },
      `Check Git tag ${spec.tag}`,
    )
    remoteTagCommit(
      spec,
      tagResult,
      directRef,
      peeledRef,
      remote,
      packageCommits.get(spec.name),
      releaseSha,
    )

    const releaseResult = await execute(
      runCommand,
      'gh',
      ['api', '--method', 'GET', `repos/${repository}/releases/tags/${encodeURIComponent(spec.tag)}`],
      { cwd, timeoutMs: commandTimeoutMs },
      `Check GitHub release ${spec.tag}`,
    )
    if (releaseResult.status !== 0 || releaseResult.signal) {
      throw commandFailure(releaseResult, `Check GitHub release ${spec.tag}`)
    }
    let release
    try {
      release = JSON.parse(releaseResult.stdout)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`GitHub release ${spec.tag} returned invalid JSON: ${message}`, {
        cause: error,
      })
    }
    if (
      release.tag_name !== spec.tag ||
      release.draft !== false ||
      release.prerelease !== false
    ) {
      throw new Error(`${spec.tag} must have a published, stable GitHub release`)
    }
  }
  return { releaseSha, packageCommits }
}

export async function verifyPublishedPackages({
  packageSpecs,
  verificationPackages,
  publishedPackages,
  fetchImpl = globalThis.fetch,
  runCommand = runExternalCommand,
  registry = DEFAULT_REGISTRY,
  repository = DEFAULT_REPOSITORY,
  remote = 'origin',
  maxAttempts = DEFAULT_ATTEMPTS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  sleep,
  logger = (line) => console.log(line),
  cwd = repositoryRoot,
} = {}) {
  const selectedPackages = packageSpecs ?? loadPublishedPackageSpecs({ repoRoot: cwd })
  assertPackageSpecs(selectedPackages)
  if (verificationPackages !== undefined && publishedPackages !== undefined) {
    throw new Error('provide verificationPackages or publishedPackages, not both')
  }
  const verificationInput = verificationPackages ?? publishedPackages ?? selectedPackages
  const selectedVerification = typeof verificationInput === 'string'
    ? parsePublishedPackages(verificationInput, selectedPackages)
    : normalizePublishedPackages(verificationInput, selectedPackages)
  assertFunction(fetchImpl, 'fetchImpl')
  assertFunction(runCommand, 'runCommand')
  assertFunction(logger, 'logger')
  assertPositiveInteger(commandTimeoutMs, 'commandTimeoutMs')
  const registryRoot = normalizedRegistry(registry)

  const pollingOptions = {
    packageSpecs: selectedPackages,
    fetchImpl,
    registry: registryRoot,
    maxAttempts,
    pollIntervalMs,
    requestTimeoutMs,
  }
  if (sleep !== undefined) pollingOptions.sleep = sleep
  const snapshot = await pollForPublishedMetadata(pollingOptions)
  const records = validateRegistrySnapshot(snapshot, {
    packageSpecs: selectedPackages,
    registry: registryRoot,
  })
  const expectedDigests = expectedRegistryDigests(records)
  logger(`Verified registry metadata for ${records.length} launch packages.`)

  await verifyTarballs(records, {
    fetchImpl,
    runCommand,
    registry: registryRoot,
    requestTimeoutMs,
    commandTimeoutMs,
  })
  logger(`Verified tarball integrity and contents for ${records.length} launch packages.`)

  const releaseSha = await resolveReleaseSha({ runCommand, cwd, commandTimeoutMs })

  const packageCommits = await verifyRegistrySignatures({
    packageSpecs: selectedPackages,
    runCommand,
    registry: registryRoot,
    releaseSha,
    expectedDigests,
    publishedPackages: selectedVerification,
    commandTimeoutMs,
  })
  logger(`Verified registry signatures and provenance for ${records.length} launch packages.`)

  await verifyRepositoryArtifacts({
    packageSpecs: selectedPackages,
    runCommand,
    repository,
    remote,
    cwd,
    releaseSha,
    packageCommits,
    commandTimeoutMs,
  })
  logger(`Verified ${records.length} Git tags and ${records.length} GitHub releases.`)

  await executeChecked(
    runCommand,
    process.execPath,
    ['scripts/test-package-contracts.mjs', '--source', 'registry'],
    { cwd, timeoutMs: commandTimeoutMs },
    'Exact-version registry consumer matrix',
  )
  logger('Verified the exact-version registry consumer matrix.')

  const packages = versionIdentities(selectedPackages)
  logger(`GlucoseIQ post-publication verification passed for ${packages.length} packages.`)
  return { packages, releaseSha, packageCommits }
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  try {
    const packageSpecs = loadPublishedPackageSpecs()
    const verificationPackages = resolveDirectVerificationPlan({ packageSpecs })
    await verifyPublishedPackages({ packageSpecs, verificationPackages })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
