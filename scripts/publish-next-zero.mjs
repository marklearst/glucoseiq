import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertExactNextZeroPackageVersions,
  assertPackedCoreDependency,
} from './lib/package-contracts.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const DEFAULT_REPOSITORY = 'marklearst/glucoseiq'
const DEFAULT_TIMEOUT_MS = 15 * 60_000
const NEXT_ZERO_VERSION = '1.0.0-next.0'

export const NEXT_ZERO_PACKAGES = Object.freeze([
  ['@glucoseiq/core', 'packages/core'],
  ['@glucoseiq/react', 'packages/react'],
  ['@glucoseiq/tokens', 'packages/tokens'],
  ['@glucoseiq/testing', 'packages/testing'],
  ['@glucoseiq/cli', 'packages/cli'],
].map(([name, directory]) => Object.freeze({
  name,
  directory,
  version: NEXT_ZERO_VERSION,
  tag: `${name}@${NEXT_ZERO_VERSION}`,
  ...(name === '@glucoseiq/react' || name === '@glucoseiq/testing' || name === '@glucoseiq/cli'
    ? { coreDependency: true, coreVersion: NEXT_ZERO_VERSION }
    : {}),
})))

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive safe integer`)
}

function assertCommandResult(result, label) {
  if (!result || typeof result !== 'object' || !Number.isInteger(result.status)) {
    throw new Error(`${label} returned an invalid command result`)
  }
  if (result.status !== 0 || result.signal) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(`${label} failed${output ? `: ${output.trim()}` : ''}`)
  }
  return result
}

export function runNextZeroCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  assertPositiveInteger(timeoutMs, 'timeoutMs')
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    shell: false,
    killSignal: 'SIGKILL',
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.error) throw result.error
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

export function loadNextZeroManifests({ repoRoot = repositoryRoot, packageSpecs = NEXT_ZERO_PACKAGES } = {}) {
  return new Map(packageSpecs.map((spec) => {
    const path = join(repoRoot, spec.directory, 'package.json')
    try {
      return [spec.name, JSON.parse(readFileSync(path, 'utf8'))]
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Unable to read ${path}: ${message}`, { cause: error })
    }
  }))
}

export function assertNextZeroPublicationPlan(packageSpecs, manifests) {
  if (!Array.isArray(packageSpecs) || packageSpecs.length !== NEXT_ZERO_PACKAGES.length) {
    throw new Error('next.0 publication must contain exactly five coordinated packages')
  }
  const versions = new Map()
  for (let index = 0; index < NEXT_ZERO_PACKAGES.length; index += 1) {
    const expected = NEXT_ZERO_PACKAGES[index]
    const spec = packageSpecs[index]
    if (spec?.name !== expected.name || spec.directory !== expected.directory || spec.version !== NEXT_ZERO_VERSION || spec.tag !== expected.tag) {
      throw new Error(`next.0 package specification ${index} must describe ${expected.name}@${NEXT_ZERO_VERSION}`)
    }
    if (
      Boolean(spec.coreDependency) !== Boolean(expected.coreDependency) ||
      (expected.coreDependency && spec.coreVersion !== expected.coreVersion)
    ) {
      throw new Error(`${expected.name} must retain the immutable core dependency role and version`)
    }
    const manifest = manifests?.get(spec.name)
    if (!manifest || manifest.name !== spec.name) throw new Error(`Missing manifest for ${spec.name}`)
    versions.set(spec.name, manifest.version)
  }
  assertExactNextZeroPackageVersions(versions)
  for (const spec of packageSpecs) {
    if (!spec.coreDependency) continue
    assertPackedCoreDependency({
      source: 'candidate',
      range: manifests.get(spec.name).dependencies?.['@glucoseiq/core'],
      coreVersion: NEXT_ZERO_VERSION,
      packageName: spec.name,
    })
  }
}

function registryUrl(registry, name) {
  const root = new URL(registry)
  if (root.protocol !== 'https:') throw new Error('registry must use HTTPS')
  root.pathname = `${root.pathname.replace(/\/$/u, '')}/${encodeURIComponent(name)}`
  return root.href
}

async function inspectRegistry(spec, { fetchImpl, registry, timeoutMs }) {
  let response
  try {
    response = await fetchImpl(registryUrl(registry, spec.name), {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to inspect npm state for ${spec.name}: ${message}`, { cause: error })
  }
  if (!Number.isInteger(response?.status)) throw new Error(`npm registry returned an invalid status for ${spec.name}`)
  if (response.status === 404) return { published: false }
  if (response.status !== 200) throw new Error(`npm registry returned ${response.status} for ${spec.name}`)
  let packument
  try {
    packument = await response.json()
  } catch (error) {
    throw new Error(`npm registry returned invalid JSON for ${spec.name}`, { cause: error })
  }
  if (!packument || typeof packument !== 'object' || Array.isArray(packument) || packument.name !== spec.name) {
    throw new Error(`npm registry returned malformed metadata for ${spec.name}`)
  }
  if (!packument.versions || typeof packument.versions !== 'object' || Array.isArray(packument.versions)) {
    throw new Error(`npm registry returned malformed version metadata for ${spec.name}`)
  }
  if (!packument['dist-tags'] || typeof packument['dist-tags'] !== 'object' || Array.isArray(packument['dist-tags'])) {
    throw new Error(`npm registry returned malformed dist-tags for ${spec.name}`)
  }
  if (
    packument['dist-tags'].next !== undefined &&
    packument['dist-tags'].next !== NEXT_ZERO_VERSION
  ) {
    throw new Error(`${spec.name} npm next tag must be ${NEXT_ZERO_VERSION}; received ${packument['dist-tags'].next ?? 'missing'}`)
  }
  const hasExactVersion = Object.hasOwn(packument.versions, spec.version)
  const metadata = packument.versions[spec.version]
  if (!hasExactVersion) {
    if (packument['dist-tags'].next === NEXT_ZERO_VERSION) {
      throw new Error(`npm registry returned malformed exact version metadata for ${spec.name}`)
    }
    return { published: false }
  }
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata) ||
    metadata.name !== spec.name ||
    metadata.version !== spec.version
  ) {
    throw new Error(`npm registry returned malformed exact version metadata for ${spec.name}`)
  }
  if (packument['dist-tags'].next !== NEXT_ZERO_VERSION) {
    throw new Error(`${spec.name} npm next tag must be ${NEXT_ZERO_VERSION}; received ${packument['dist-tags'].next ?? 'missing'}`)
  }
  if (packument['dist-tags'].latest === NEXT_ZERO_VERSION) {
    throw new Error(`${spec.name} npm latest must not promote ${NEXT_ZERO_VERSION}`)
  }
  return { published: true }
}

async function execute(runCommand, command, args, options, label) {
  let result
  try {
    result = await runCommand(command, args, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} failed: ${message}`, { cause: error })
  }
  return result
}

async function resolveReleaseSha(runCommand, cwd, timeoutMs) {
  const result = assertCommandResult(
    await execute(runCommand, 'git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd, timeoutMs }, 'Resolve release commit'),
    'Resolve release commit',
  )
  const sha = result.stdout.trim()
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error('Release commit must be a 40-character lowercase Git SHA')
  return sha
}

async function verifyOrCreateLocalTag(spec, releaseSha, runCommand, cwd, timeoutMs) {
  const result = await execute(
    runCommand,
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/tags/${spec.tag}^{commit}`],
    { cwd, timeoutMs },
    `Check local tag ${spec.tag}`,
  )
  if (result.status === 0) {
    const commit = result.stdout.trim()
    if (commit !== releaseSha) throw new Error(`${spec.tag} must resolve to release commit ${releaseSha}; received ${commit}`)
    return
  }
  if (result.status !== 1 || result.signal) {
    throw new Error(`Check local tag ${spec.tag} failed: ${[result.stdout, result.stderr].filter(Boolean).join('\n').trim()}`)
  }
  assertCommandResult(
    await execute(runCommand, 'git', ['tag', '-a', spec.tag, releaseSha, '-m', spec.tag], { cwd, timeoutMs }, `Create local tag ${spec.tag}`),
    `Create local tag ${spec.tag}`,
  )
}

async function inspectGitHubRelease(spec, runCommand, repository, cwd, timeoutMs) {
  const result = await execute(
    runCommand,
    'gh',
    ['api', '--method', 'GET', `repos/${repository}/releases/tags/${encodeURIComponent(spec.tag)}`],
    { cwd, timeoutMs },
    `Check GitHub release ${spec.tag}`,
  )
  if (result.status === 1 && /(?:HTTP )?404\b/u.test(result.stderr ?? '')) return false
  assertCommandResult(result, `Check GitHub release ${spec.tag}`)
  let release
  try {
    release = JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`GitHub release ${spec.tag} returned invalid JSON`, { cause: error })
  }
  if (release?.tag_name !== spec.tag || release.draft !== false || release.prerelease !== true) {
    throw new Error(`${spec.tag} must have a published, non-draft prerelease GitHub release`)
  }
  return true
}

export async function runNextZeroPublisher({
  packageSpecs = NEXT_ZERO_PACKAGES,
  manifests = loadNextZeroManifests({ packageSpecs }),
  fetchImpl = globalThis.fetch,
  runCommand = runNextZeroCommand,
  logger = (line) => console.log(line),
  registry = DEFAULT_REGISTRY,
  repository = DEFAULT_REPOSITORY,
  cwd = repositoryRoot,
  commandTimeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof runCommand !== 'function' || typeof logger !== 'function') {
    throw new TypeError('publisher requires fetchImpl, runCommand, and logger functions')
  }
  assertPositiveInteger(commandTimeoutMs, 'commandTimeoutMs')
  assertNextZeroPublicationPlan(packageSpecs, manifests)

  const states = await Promise.all(packageSpecs.map((spec) => inspectRegistry(spec, {
    fetchImpl,
    registry,
    timeoutMs: commandTimeoutMs,
  })))
  const releaseSha = await resolveReleaseSha(runCommand, cwd, commandTimeoutMs)
  for (const spec of packageSpecs) await verifyOrCreateLocalTag(spec, releaseSha, runCommand, cwd, commandTimeoutMs)
  const githubExists = []
  for (const spec of packageSpecs) githubExists.push(await inspectGitHubRelease(spec, runCommand, repository, cwd, commandTimeoutMs))

  const npmVersion = assertCommandResult(
    await execute(runCommand, 'npm', ['--version'], { cwd, timeoutMs: commandTimeoutMs }, 'Check npm version'),
    'Check npm version',
  ).stdout.trim()
  if (!/^11\./u.test(npmVersion)) throw new Error(`next.0 publication requires npm 11; received ${npmVersion}`)

  const alreadyPublished = packageSpecs.filter((_, index) => states[index].published).map(({ name }) => name)
  const published = [...alreadyPublished]
  for (const spec of packageSpecs) {
    if (alreadyPublished.includes(spec.name)) continue
    const remaining = packageSpecs.slice(packageSpecs.findIndex(({ name }) => name === spec.name)).map(({ name }) => name)
    let result
    try {
      result = await execute(
        runCommand,
        'npm',
        ['publish', spec.directory, '--access', 'public', '--tag', 'next', '--provenance'],
        { cwd, timeoutMs: commandTimeoutMs },
        `Publish ${spec.name}@${spec.version}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Partial next.0 publication failed. Published: ${published.join(', ') || 'none'}. Remaining: ${remaining.join(', ')}. Cause: ${message}`,
        { cause: error },
      )
    }
    if (result.status !== 0 || result.signal) {
      throw new Error(`Partial next.0 publication failed. Published: ${published.join(', ') || 'none'}. Remaining: ${remaining.join(', ')}`)
    }
    published.push(spec.name)
  }
  const githubArtifacts = packageSpecs.filter((_, index) => !githubExists[index])
  for (const spec of githubArtifacts) logger(`New tag: ${spec.tag}`)
  return Object.freeze({ releaseSha, published, alreadyPublished, githubArtifacts: githubArtifacts.map(({ tag }) => tag) })
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
    await runNextZeroPublisher()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
