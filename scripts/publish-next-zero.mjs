import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertExactNextZeroPackageVersions,
  assertPackedCoreDependency,
} from './lib/package-contracts.mjs'
import {
  NEXT_ZERO_NPM_TAG,
  NEXT_ZERO_PACKAGE_SPECS,
  NEXT_ZERO_VERSION,
} from './lib/release-contract.mjs'

export { NEXT_ZERO_PACKAGE_SPECS as NEXT_ZERO_PACKAGES } from './lib/release-contract.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const DEFAULT_REPOSITORY = 'marklearst/glucoseiq'
const DEFAULT_TIMEOUT_MS = 15 * 60_000
const NEXT_ZERO_PACKAGES = NEXT_ZERO_PACKAGE_SPECS
const GIT_SHA = /^[a-f0-9]{40}$/u

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

function assertNextZeroManifestIdentities(packageSpecs, manifests) {
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
}

function assertNextZeroSourcePlan(packageSpecs, manifests) {
  assertNextZeroManifestIdentities(packageSpecs, manifests)
  for (const spec of packageSpecs) {
    if (!spec.coreDependency) continue
    const range = manifests.get(spec.name).dependencies?.['@glucoseiq/core']
    if (range !== 'workspace:^') {
      throw new Error(`${spec.name} source core dependency must equal workspace:^; received ${range}`)
    }
  }
}

export function assertNextZeroPublicationPlan(packageSpecs, manifests) {
  assertNextZeroManifestIdentities(packageSpecs, manifests)
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

function removePackedArtifacts(temporaryRoot, primaryError) {
  try {
    rmSync(temporaryRoot, { force: true, recursive: true })
  } catch (cleanupError) {
    if (primaryError === undefined) throw cleanupError
    const message = primaryError instanceof Error ? primaryError.message : String(primaryError)
    throw new AggregateError(
      [primaryError, cleanupError],
      `${message}. Temporary package cleanup also failed.`,
      { cause: cleanupError },
    )
  }
}

async function packNextZeroArtifacts({
  packageSpecs,
  runCommand,
  cwd,
  commandTimeoutMs,
}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'glucoseiq-next-zero-'))
  const archives = new Map()
  const packedManifests = new Map()
  try {
    for (let index = 0; index < packageSpecs.length; index += 1) {
      const spec = packageSpecs[index]
      const packRoot = join(temporaryRoot, String(index))
      mkdirSync(packRoot)
      assertCommandResult(
        await execute(
          runCommand,
          'pnpm',
          [
            '--dir',
            join(cwd, spec.directory),
            'pack',
            '--pack-destination',
            packRoot,
          ],
          { cwd, timeoutMs: commandTimeoutMs },
          `Pack ${spec.name}@${spec.version}`,
        ),
        `Pack ${spec.name}@${spec.version}`,
      )
      const candidates = readdirSync(packRoot, { withFileTypes: true })
        .filter((entry) => entry.name.endsWith('.tgz'))
      if (candidates.length !== 1 || !candidates[0].isFile()) {
        throw new Error(`${spec.name} must produce exactly one regular package tarball`)
      }
      const archivePath = join(packRoot, candidates[0].name)
      const manifestText = assertCommandResult(
        await execute(
          runCommand,
          'tar',
          ['-xOzf', archivePath, 'package/package.json'],
          { cwd, timeoutMs: commandTimeoutMs },
          `Inspect packed manifest for ${spec.name}@${spec.version}`,
        ),
        `Inspect packed manifest for ${spec.name}@${spec.version}`,
      ).stdout
      if (manifestText.includes('workspace:')) {
        throw new Error(`${spec.name} packed manifest must not contain workspace dependencies`)
      }
      try {
        packedManifests.set(spec.name, JSON.parse(manifestText))
      } catch (error) {
        throw new Error(`${spec.name} packed manifest must contain valid JSON`, { cause: error })
      }
      archives.set(spec.name, archivePath)
    }
    assertNextZeroPublicationPlan(packageSpecs, packedManifests)
    return { archives, temporaryRoot }
  } catch (error) {
    removePackedArtifacts(temporaryRoot, error)
    throw error
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
  const nextVersion = packument['dist-tags'][NEXT_ZERO_NPM_TAG]
  if (nextVersion !== undefined && nextVersion !== NEXT_ZERO_VERSION) {
    throw new Error(`${spec.name} npm ${NEXT_ZERO_NPM_TAG} tag must be ${NEXT_ZERO_VERSION}; received ${nextVersion ?? 'missing'}`)
  }
  const hasExactVersion = Object.hasOwn(packument.versions, spec.version)
  const metadata = packument.versions[spec.version]
  if (!hasExactVersion) {
    if (nextVersion === NEXT_ZERO_VERSION) {
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
  if (nextVersion !== NEXT_ZERO_VERSION) {
    throw new Error(`${spec.name} npm ${NEXT_ZERO_NPM_TAG} tag must be ${NEXT_ZERO_VERSION}; received ${nextVersion ?? 'missing'}`)
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

function parseRemoteTagState(output, tag, releaseSha) {
  if (typeof output !== 'string') {
    throw new Error(`Remote tag ${tag} returned malformed output`)
  }
  if (output === '') return { kind: 'absent' }
  if (!output.endsWith('\n')) {
    throw new Error(`Remote tag ${tag} returned malformed output`)
  }

  const directRef = `refs/tags/${tag}`
  const peeledRef = `${directRef}^{}`
  let direct
  let peeled
  for (const line of output.slice(0, -1).split('\n')) {
    const match = /^(?<sha>[a-f0-9]{40})\t(?<ref>[^\t\r\n]+)$/u.exec(line)
    if (!match || (match.groups.ref !== directRef && match.groups.ref !== peeledRef)) {
      throw new Error(`Remote tag ${tag} returned malformed output`)
    }
    if (match.groups.ref === directRef) {
      if (direct !== undefined) throw new Error(`Remote tag ${tag} returned malformed output`)
      direct = match.groups.sha
    } else {
      if (peeled !== undefined) throw new Error(`Remote tag ${tag} returned malformed output`)
      peeled = match.groups.sha
    }
  }
  if (
    !direct ||
    !GIT_SHA.test(direct) ||
    (peeled !== undefined && !GIT_SHA.test(peeled))
  ) {
    throw new Error(`Remote tag ${tag} returned malformed output`)
  }
  const commit = peeled ?? direct
  if (commit !== releaseSha) {
    throw new Error(`Remote tag ${tag} must resolve to release commit ${releaseSha}; received ${commit}`)
  }
  return {
    kind: peeled === undefined ? 'lightweight' : 'annotated',
    objectSha: direct,
    commitSha: commit,
  }
}

async function inspectRemoteTag(spec, releaseSha, runCommand, cwd, timeoutMs) {
  const result = assertCommandResult(
    await execute(
      runCommand,
      'git',
      [
        'ls-remote',
        'origin',
        `refs/tags/${spec.tag}`,
        `refs/tags/${spec.tag}^{}`,
      ],
      { cwd, timeoutMs },
      `Check remote tag ${spec.tag}`,
    ),
    `Check remote tag ${spec.tag}`,
  )
  return parseRemoteTagState(result.stdout, spec.tag, releaseSha)
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

async function synchronizeLocalTag(spec, remoteState, releaseSha, runCommand, cwd, timeoutMs) {
  const ref = `refs/tags/${spec.tag}`
  assertCommandResult(
    await execute(
      runCommand,
      'git',
      ['fetch', '--force', '--no-tags', 'origin', `${ref}:${ref}`],
      { cwd, timeoutMs },
      `Synchronize local tag ${spec.tag}`,
    ),
    `Synchronize local tag ${spec.tag}`,
  )
  const objectSha = assertCommandResult(
    await execute(
      runCommand,
      'git',
      ['rev-parse', '--verify', ref],
      { cwd, timeoutMs },
      `Resolve local tag object ${spec.tag}`,
    ),
    `Resolve local tag object ${spec.tag}`,
  ).stdout.trim()
  if (!GIT_SHA.test(objectSha)) {
    throw new Error(`Local tag ${spec.tag} returned a malformed object SHA`)
  }
  if (objectSha !== remoteState.objectSha) {
    throw new Error(`Remote tag ${spec.tag} changed during local synchronization`)
  }
  const commitSha = assertCommandResult(
    await execute(
      runCommand,
      'git',
      ['rev-parse', '--verify', `${ref}^{commit}`],
      { cwd, timeoutMs },
      `Resolve local tag commit ${spec.tag}`,
    ),
    `Resolve local tag commit ${spec.tag}`,
  ).stdout.trim()
  if (commitSha !== releaseSha || commitSha !== remoteState.commitSha) {
    throw new Error(`${spec.tag} must resolve to release commit ${releaseSha}; received ${commitSha}`)
  }
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
  assertNextZeroSourcePlan(packageSpecs, manifests)
  const { archives, temporaryRoot } = await packNextZeroArtifacts({
    packageSpecs,
    runCommand,
    cwd,
    commandTimeoutMs,
  })
  let primaryError
  try {
    const states = await Promise.all(packageSpecs.map((spec) => inspectRegistry(spec, {
      fetchImpl,
      registry,
      timeoutMs: commandTimeoutMs,
    })))
    const releaseSha = await resolveReleaseSha(runCommand, cwd, commandTimeoutMs)
    const remoteStates = []
    for (const spec of packageSpecs) {
      remoteStates.push(await inspectRemoteTag(spec, releaseSha, runCommand, cwd, commandTimeoutMs))
    }
    const githubExists = []
    for (const spec of packageSpecs) githubExists.push(await inspectGitHubRelease(spec, runCommand, repository, cwd, commandTimeoutMs))
    for (let index = 0; index < packageSpecs.length; index += 1) {
      if (githubExists[index] && remoteStates[index].kind === 'absent') {
        throw new Error(`GitHub release ${packageSpecs[index].tag} exists while its remote tag is absent`)
      }
    }
    for (let index = 0; index < packageSpecs.length; index += 1) {
      if (remoteStates[index].kind !== 'absent') {
        await synchronizeLocalTag(
          packageSpecs[index],
          remoteStates[index],
          releaseSha,
          runCommand,
          cwd,
          commandTimeoutMs,
        )
      }
    }
    for (let index = 0; index < packageSpecs.length; index += 1) {
      if (remoteStates[index].kind === 'absent') {
        await verifyOrCreateLocalTag(packageSpecs[index], releaseSha, runCommand, cwd, commandTimeoutMs)
      }
    }

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
          ['publish', archives.get(spec.name), '--access', 'public', '--tag', NEXT_ZERO_NPM_TAG, '--provenance'],
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
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    removePackedArtifacts(temporaryRoot, primaryError)
  }
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
