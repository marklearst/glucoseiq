import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NEXT_ZERO_NPM_TAG,
  RELEASE_PACKAGE_IDENTITIES,
} from './lib/release-contract.mjs'

export { NEXT_ZERO_NPM_TAG, RELEASE_PACKAGE_IDENTITIES }

const RELEASE_BRANCH = 'release/glucoseiq-packages'
const BASE_REFERENCE = 'origin/main'
const COMMAND_BUFFER_BYTES = 16 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 120_000
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const require = createRequire(import.meta.url)
const CHANGESETS_CLI = require.resolve('@changesets/cli/bin.js')
const parseChangeset = require('@changesets/parse').default

export const PUBLIC_PACKAGE_DIRECTORIES = Object.freeze([
  ...RELEASE_PACKAGE_IDENTITIES
    .map(({ directory }) => directory)
    .sort(comparePaths),
])
const PUBLIC_PACKAGE_BY_NAME = new Map(
  RELEASE_PACKAGE_IDENTITIES.map(({ name, directory }) => [name, directory]),
)
const LAUNCH_CHANGESET_ID = 'launch-glucoseiq-one'
const INITIAL_PRERELEASE_VERSIONS = Object.freeze(Object.fromEntries([
  ...RELEASE_PACKAGE_IDENTITIES.map(({ name }) => [name, '0.0.0']),
  ['docs', '0.0.0'],
]))

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function decodeUtf8(buffer, label) {
  try {
    return utf8Decoder.decode(buffer)
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error })
  }
}

function assertExactObjectKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`)
  }
  const actual = Object.keys(value).sort(comparePaths)
  const wanted = [...expected].sort(comparePaths)
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly ${wanted.join(', ')}`)
  }
}

/** Parses one of the two exact prerelease states owned by this launch. */
export function parsePrereleaseState(source, label = '.changeset/pre.json') {
  let parsed
  try {
    const text = Buffer.isBuffer(source) || source instanceof Uint8Array
      ? decodeUtf8(source, label)
      : source
    if (typeof text !== 'string') throw new TypeError('source must be text or bytes')
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} must be valid JSON`, { cause: error })
  }

  assertExactObjectKeys(
    parsed,
    ['mode', 'tag', 'initialVersions', 'changesets'],
    label,
  )
  if (parsed.mode !== 'pre') throw new Error(`${label} mode must be pre`)
  if (parsed.tag !== NEXT_ZERO_NPM_TAG) {
    throw new Error(`${label} tag must be ${NEXT_ZERO_NPM_TAG}`)
  }
  assertExactObjectKeys(
    parsed.initialVersions,
    Object.keys(INITIAL_PRERELEASE_VERSIONS),
    `${label} initialVersions`,
  )
  for (const [name, version] of Object.entries(INITIAL_PRERELEASE_VERSIONS)) {
    if (parsed.initialVersions[name] !== version) {
      throw new Error(`${label} initial version for ${name} must be ${version}`)
    }
  }
  if (!Array.isArray(parsed.changesets)) {
    throw new Error(`${label} changesets must be an array`)
  }
  const consumed = new Set()
  for (const id of parsed.changesets) {
    if (id !== LAUNCH_CHANGESET_ID) {
      throw new Error(`${label} contains an unknown consumed Changeset ID`)
    }
    if (consumed.has(id)) {
      throw new Error(`${label} contains a duplicated consumed Changeset ID`)
    }
    consumed.add(id)
  }
  if (parsed.changesets.length > 1) {
    throw new Error(`${label} contains too many consumed Changesets`)
  }
  return {
    kind: parsed.changesets.length === 0 ? 'initial' : 'generated',
    consumedChangesets: [...parsed.changesets],
  }
}

function trackedChangesetIds(paths) {
  if (!Array.isArray(paths)) throw new TypeError('changesetPaths must be an array')
  const ids = []
  for (const path of paths) {
    if (!isChangesetReaderPath(path)) {
      throw new Error(`Release mode received an invalid Changeset path: ${String(path)}`)
    }
    ids.push(path.slice('.changeset/'.length, -'.md'.length))
  }
  const unique = [...new Set(ids)].sort(comparePaths)
  if (unique.length !== ids.length) {
    throw new Error('Release mode received a duplicated Changeset path')
  }
  return unique
}

/** Separates version-PR and publication decisions from unconsumed Changesets. */
export function detectReleaseMode({
  changesetPaths,
  policy,
  prereleaseStateSource,
}) {
  if (!policy || typeof policy !== 'object') {
    throw new TypeError('policy must be an object')
  }
  const tracked = trackedChangesetIds(changesetPaths)
  const prerelease = prereleaseStateSource === undefined
    ? undefined
    : parsePrereleaseState(prereleaseStateSource)
  const consumed = new Set(prerelease?.consumedChangesets ?? [])
  const pendingChangesets = tracked.filter((id) => !consumed.has(id))
  const generated = policy.reason === 'generated-version-commit'

  if (!prerelease) {
    if (generated) {
      if (pendingChangesets.length > 0) {
        throw new Error('A stale generated release has pending Changesets')
      }
      if (policy.consumedChangesets?.includes(LAUNCH_CHANGESET_ID)) {
        throw new Error('The launch must not publish a stable generated release before next.0')
      }
      if (policy.releaseKind !== 'stable') {
        throw new Error('A generated release without pre.json must be stable')
      }
      return {
        pendingChangesets,
        publishCommand: 'pnpm changeset publish',
        shouldPublish: true,
        shouldVersion: false,
        state: 'generated-stable',
      }
    }
    if (
      pendingChangesets.includes(LAUNCH_CHANGESET_ID) &&
      pendingChangesets.length !== 1
    ) {
      throw new Error('The launch baseline must contain only its coordinated Changeset')
    }
    return {
      pendingChangesets,
      publishCommand: null,
      shouldPublish: false,
      shouldVersion: pendingChangesets.length > 0,
      state: pendingChangesets.includes(LAUNCH_CHANGESET_ID) ? 'baseline' : 'idle',
    }
  }

  if (tracked.length !== 1 || tracked[0] !== LAUNCH_CHANGESET_ID) {
    throw new Error('The next.0 prerelease must retain only the launch Changeset')
  }
  if (prerelease.kind === 'initial') {
    if (generated) throw new Error('The initial next.0 state cannot be a generated release')
    return {
      pendingChangesets,
      publishCommand: null,
      shouldPublish: false,
      shouldVersion: true,
      state: 'initial-next.0',
    }
  }
  if (!generated) {
    return {
      pendingChangesets,
      publishCommand: null,
      shouldPublish: false,
      shouldVersion: false,
      state: 'consumed-next.0',
    }
  }
  if (
    policy.releaseKind !== 'next.0' ||
    policy.versionedPackages?.length !== PUBLIC_PACKAGE_DIRECTORIES.length ||
    policy.versionedPackages.some(
      (directory, index) => directory !== PUBLIC_PACKAGE_DIRECTORIES[index],
    ) ||
    policy.consumedChangesets?.length !== 1 ||
    policy.consumedChangesets[0] !== LAUNCH_CHANGESET_ID
  ) {
    throw new Error('Only the exact replay-validated generated next.0 release may publish')
  }
  return {
    pendingChangesets,
    publishCommand: 'pnpm publish:next.0',
    shouldPublish: true,
    shouldVersion: false,
    state: 'generated-next.0',
  }
}

function asCommandBuffer(output, label) {
  if (Buffer.isBuffer(output)) return output
  if (output instanceof Uint8Array) return Buffer.from(output)
  throw new TypeError(`${label} must return bytes`)
}

function assertRepositoryRelativePath(path) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('Git diff returned an empty path')
  }
  const components = path.split('/')
  if (
    path.startsWith('/') ||
    components.some((component) =>
      component === '' || component === '.' || component === '..'
    )
  ) {
    throw new Error(`Git diff path must be repository-relative: ${JSON.stringify(path)}`)
  }
}

function parseNullDelimitedFields(output) {
  const buffer = asCommandBuffer(output, 'Git diff')
  if (buffer.length === 0) return []
  if (buffer.at(-1) !== 0) throw new Error('Git diff path output is not NUL terminated')

  const fields = []
  let start = 0
  while (start < buffer.length) {
    const end = buffer.indexOf(0, start)
    if (end === start) throw new Error('Git diff returned an empty path')
    fields.push(decodeUtf8(buffer.subarray(start, end), 'Git diff field'))
    start = end + 1
  }
  return fields
}

/** Parses the raw path format produced by `git diff --name-only -z`. */
export function parseNullDelimitedPaths(output) {
  const paths = parseNullDelimitedFields(output)
  for (const path of paths) assertRepositoryRelativePath(path)
  return paths
}

/** Parses the status/path pairs produced by `git diff --name-status -z`. */
export function parseNullDelimitedChanges(output) {
  const fields = parseNullDelimitedFields(output)
  if (fields.length % 2 !== 0) {
    throw new Error('Git diff must return NUL-delimited status and path pairs')
  }

  const changes = []
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index]
    const path = fields[index + 1]
    if (!/^[ABCDMRTUX]$/u.test(status)) {
      throw new Error(`unsupported Git change status: ${JSON.stringify(status)}`)
    }
    assertRepositoryRelativePath(path)
    changes.push({ status, path })
  }
  return changes
}

function packageRelativePath(path) {
  for (const directory of PUBLIC_PACKAGE_DIRECTORIES) {
    const prefix = `${directory}/`
    if (path.startsWith(prefix)) return path.slice(prefix.length)
  }
  return undefined
}

function publicPackageDirectory(path) {
  return PUBLIC_PACKAGE_DIRECTORIES.find(
    (directory) => path.startsWith(`${directory}/`),
  )
}

function publicPackageArtifact(path, artifact) {
  for (const directory of PUBLIC_PACKAGE_DIRECTORIES) {
    if (path === `${directory}/${artifact}`) return directory
  }
  return undefined
}

/** Returns whether a changed path can alter one of the five public packages. */
export function isReleaseAffectingPath(path) {
  if (typeof path !== 'string') throw new TypeError('path must be a string')
  const relativePath = packageRelativePath(path)
  if (!relativePath) return false
  if (relativePath.startsWith('docs/')) return false
  if (!relativePath.includes('/') && /\.mdx?$/iu.test(relativePath)) return false
  if (!relativePath.includes('/') && /^README$/iu.test(relativePath)) return false
  return true
}

export function isChangesetReaderPath(path) {
  const match = /^\.changeset\/([^/]+)$/u.exec(path)
  if (!match) return false
  const basename = match[1]
  return (
    !basename.startsWith('.') &&
    basename.endsWith('.md') &&
    basename.toLowerCase() !== 'readme.md'
  )
}

function normalizeChangesetReleaseDirectories(directories) {
  if (!Array.isArray(directories)) {
    throw new TypeError('changesetReleaseDirectories must be an array')
  }
  const normalized = new Set()
  for (const directory of directories) {
    if (!PUBLIC_PACKAGE_DIRECTORIES.includes(directory)) {
      throw new Error(
        `unknown public package directory in Changeset coverage: ${String(directory)}`,
      )
    }
    normalized.add(directory)
  }
  return [...normalized].sort(comparePaths)
}

function parseChangesetReleaseDirectories(source, path) {
  let parsed
  try {
    parsed = parseChangeset(decodeUtf8(source, `Changeset ${path}`))
  } catch (error) {
    throw new Error(`Changeset policy failed: ${path} is not a valid Changeset`, {
      cause: error,
    })
  }
  if (!parsed || !Array.isArray(parsed.releases)) {
    throw new Error(`Changeset policy failed: ${path} has no release list`)
  }

  const directories = []
  for (const release of parsed.releases) {
    const directory = PUBLIC_PACKAGE_BY_NAME.get(release?.name)
    if (!directory) {
      throw new Error(
        `Changeset policy failed: ${path} names an unknown public package`,
      )
    }
    if (release.type === 'none') continue
    if (!['major', 'minor', 'patch'].includes(release.type)) {
      throw new Error(
        `Changeset policy failed: ${path} has an unsupported release type`,
      )
    }
    directories.push(directory)
  }
  return directories
}

function readChangesetReleaseDirectories({ changes, execFile, cwd }) {
  const directories = new Set()
  const paths = [...new Set(
    changes
      .filter(({ status, path }) =>
        (status === 'A' || status === 'M') && isChangesetReaderPath(path)
      )
      .map(({ path }) => path),
  )].sort(comparePaths)

  for (const path of paths) {
    const source = runGit(
      execFile,
      ['cat-file', 'blob', `HEAD:${path}`],
      { cwd, label: `reading ${path} from HEAD` },
    )
    for (const directory of parseChangesetReleaseDirectories(source, path)) {
      directories.add(directory)
    }
  }
  return [...directories].sort(comparePaths)
}

function generatedVersionCommitPackages(changes) {
  const manifests = new Set()
  const changelogs = new Set()
  const deletedChangesets = []
  let prereleaseStateModified = false

  for (const { status, path } of changes) {
    if (status === 'D' && isChangesetReaderPath(path)) {
      deletedChangesets.push(path.slice('.changeset/'.length, -'.md'.length))
      continue
    }
    if (status === 'M' && path === '.changeset/pre.json') {
      prereleaseStateModified = true
      continue
    }
    if (status === 'M' && path === 'pnpm-lock.yaml') continue

    const manifestPackage = publicPackageArtifact(path, 'package.json')
    if (status === 'M' && manifestPackage) {
      manifests.add(manifestPackage)
      continue
    }

    const changelogPackage = publicPackageArtifact(path, 'CHANGELOG.md')
    if ((status === 'A' || status === 'M') && changelogPackage) {
      changelogs.add(changelogPackage)
      continue
    }

    return undefined
  }

  if (manifests.size === 0) return undefined
  if (manifests.size !== changelogs.size) return undefined
  for (const directory of manifests) {
    if (!changelogs.has(directory)) return undefined
  }
  const versionedPackages = [...manifests].sort(comparePaths)
  if (prereleaseStateModified) {
    if (
      deletedChangesets.length !== 0 ||
      versionedPackages.length !== PUBLIC_PACKAGE_DIRECTORIES.length ||
      versionedPackages.some(
        (directory, index) => directory !== PUBLIC_PACKAGE_DIRECTORIES[index],
      )
    ) {
      return undefined
    }
    return {
      consumedChangesets: [LAUNCH_CHANGESET_ID],
      releaseKind: 'next.0',
      versionedPackages,
    }
  }
  if (deletedChangesets.length === 0) return undefined
  return {
    consumedChangesets: deletedChangesets.sort(comparePaths),
    releaseKind: 'stable',
    versionedPackages,
  }
}

function isValidBranchName(branch) {
  if (typeof branch !== 'string' || branch.length === 0) return false
  const containsForbiddenCharacter = [...branch].some((character) => {
    const codePoint = character.codePointAt(0)
    return (
      codePoint <= 0x20 ||
      codePoint === 0x7f ||
      '~^:?*[\\'.includes(character)
    )
  })
  if (branch.trim() !== branch || containsForbiddenCharacter) {
    return false
  }
  if (
    branch === '@' ||
    branch.startsWith('.') ||
    branch.startsWith('/') ||
    branch.endsWith('.') ||
    branch.endsWith('/') ||
    branch.endsWith('.lock') ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.includes('//') ||
    branch.split('/').some((component) => component.startsWith('.'))
  ) {
    return false
  }
  return true
}

function assertBranchName(branch, label = 'branch') {
  if (!isValidBranchName(branch)) {
    throw new Error(`${label} must be a single valid branch name`)
  }
  return branch
}

function normalizeChanges({ changedPaths, changes }) {
  if (changedPaths !== undefined && changes !== undefined) {
    throw new TypeError('provide either changedPaths or changes, not both')
  }
  if (changes !== undefined) {
    if (!Array.isArray(changes)) throw new TypeError('changes must be an array')
    return changes.map((change) => {
      if (!change || typeof change !== 'object') {
        throw new TypeError('each change must be an object')
      }
      const { status, path } = change
      if (!/^[ABCDMRTUX]$/u.test(status)) {
        throw new Error(`unsupported Git change status: ${JSON.stringify(status)}`)
      }
      assertRepositoryRelativePath(path)
      return { status, path }
    })
  }
  if (!Array.isArray(changedPaths)) throw new TypeError('changedPaths must be an array')
  return changedPaths.map((path) => {
    assertRepositoryRelativePath(path)
    return { status: 'M', path }
  })
}

/** Evaluates policy from already collected repository-relative changes. */
export function evaluateChangesetPolicy({
  branch,
  changedPaths,
  changes,
  exemptReleaseBranch = false,
  allowGeneratedVersionCommit = false,
  generatedVersionValidated = false,
  changesetReleaseDirectories = [],
}) {
  assertBranchName(branch)
  if (typeof exemptReleaseBranch !== 'boolean') {
    throw new TypeError('exemptReleaseBranch must be a boolean')
  }
  if (typeof allowGeneratedVersionCommit !== 'boolean') {
    throw new TypeError('allowGeneratedVersionCommit must be a boolean')
  }
  if (typeof generatedVersionValidated !== 'boolean') {
    throw new TypeError('generatedVersionValidated must be a boolean')
  }
  const normalizedChanges = normalizeChanges({ changedPaths, changes })
  const normalizedChangesetReleases = normalizeChangesetReleaseDirectories(
    changesetReleaseDirectories,
  )

  if (branch === RELEASE_BRANCH && exemptReleaseBranch) {
    return {
      ok: true,
      reason: 'release-branch',
      releaseAffectingPaths: [],
      changesets: [],
    }
  }

  if (
    branch === 'main' &&
    allowGeneratedVersionCommit &&
    generatedVersionValidated
  ) {
    const generatedVersion = generatedVersionCommitPackages(normalizedChanges)
    if (generatedVersion) {
      return {
        ok: true,
        reason: 'generated-version-commit',
        releaseAffectingPaths: generatedVersion.versionedPackages.map(
          (directory) => `${directory}/package.json`,
        ),
        changesets: [],
        ...generatedVersion,
      }
    }
  }

  const releaseAffectingPaths = [...new Set(
    normalizedChanges.map(({ path }) => path).filter(isReleaseAffectingPath),
  )]
    .sort(comparePaths)
  const changesets = [...new Set(
    normalizedChanges
      .filter(({ status, path }) =>
        (status === 'A' || status === 'M') && isChangesetReaderPath(path)
      )
      .map(({ path }) => path),
  )]
    .sort(comparePaths)
  const deletedChangesets = [...new Set(
    normalizedChanges
      .filter(({ status, path }) => status === 'D' && isChangesetReaderPath(path))
      .map(({ path }) => path),
  )].sort(comparePaths)
  const releaseAffectingPackages = [...new Set(
    releaseAffectingPaths.map(publicPackageDirectory).filter(Boolean),
  )].sort(comparePaths)
  const uncoveredPackages = releaseAffectingPackages.filter(
    (directory) => !normalizedChangesetReleases.includes(directory),
  )

  if (deletedChangesets.length > 0) {
    return {
      ok: false,
      reason: 'changeset-deletion-forbidden',
      releaseAffectingPaths,
      releaseAffectingPackages,
      changesets,
      deletedChangesets,
      uncoveredPackages,
    }
  }

  if (releaseAffectingPaths.length === 0) {
    return {
      ok: true,
      reason: 'no-release-affecting-paths',
      releaseAffectingPaths,
      releaseAffectingPackages,
      changesets,
      deletedChangesets,
      uncoveredPackages,
    }
  }
  if (changesets.length > 0 && uncoveredPackages.length > 0) {
    return {
      ok: false,
      reason: 'changeset-package-coverage-required',
      releaseAffectingPaths,
      releaseAffectingPackages,
      changesets,
      deletedChangesets,
      uncoveredPackages,
    }
  }
  return {
    ok: changesets.length > 0,
    reason: changesets.length > 0 ? 'changeset-present' : 'changeset-required',
    releaseAffectingPaths,
    releaseAffectingPackages,
    changesets,
    deletedChangesets,
    uncoveredPackages,
  }
}

function runGit(
  execFile,
  args,
  { cwd, label, timeoutMs = COMMAND_TIMEOUT_MS },
) {
  try {
    return asCommandBuffer(
      execFile('git', args, {
        cwd,
        encoding: null,
        killSignal: 'SIGKILL',
        maxBuffer: COMMAND_BUFFER_BYTES,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
      }),
      `Git ${args[0]}`,
    )
  } catch (error) {
    throw new Error(`Git ${args[0]} failed while ${label}`, { cause: error })
  }
}

function runCommand(
  execFile,
  file,
  args,
  { cwd, label, timeoutMs = COMMAND_TIMEOUT_MS },
) {
  try {
    return asCommandBuffer(
      execFile(file, args, {
        cwd,
        encoding: null,
        killSignal: 'SIGKILL',
        maxBuffer: COMMAND_BUFFER_BYTES,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
      }),
      `${file} ${args[0] ?? ''}`.trim(),
    )
  } catch (error) {
    throw new Error(`Generated version validation failed while ${label}`, {
      cause: error,
    })
  }
}

/**
 * Replays the repository's pinned Changesets version operation from the pushed
 * base commit and compares its complete Git patch with the committed result.
 */
export function validateGeneratedVersionCommit({
  baseOid,
  cwd = process.cwd(),
  execFile = execFileSync,
  nodeModulesDirectory = resolve(cwd, 'node_modules'),
  changesetsCli = CHANGESETS_CLI,
  packageManager = 'pnpm',
  commandTimeoutMs = COMMAND_TIMEOUT_MS,
} = {}) {
  const validatedBaseOid = singleCommitId(
    Buffer.from(`${baseOid ?? ''}\n`),
    'generated-version base',
  )
  if (typeof execFile !== 'function') throw new TypeError('execFile must be a function')
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new TypeError('cwd must be a non-empty path string')
  }
  if (typeof nodeModulesDirectory !== 'string' || nodeModulesDirectory.length === 0) {
    throw new TypeError('nodeModulesDirectory must be a non-empty path string')
  }
  if (typeof changesetsCli !== 'string' || changesetsCli.length === 0) {
    throw new TypeError('changesetsCli must be a non-empty path string')
  }
  if (typeof packageManager !== 'string' || packageManager.length === 0) {
    throw new TypeError('packageManager must be a non-empty command string')
  }
  if (!Number.isInteger(commandTimeoutMs) || commandTimeoutMs <= 0) {
    throw new TypeError('commandTimeoutMs must be a positive integer')
  }

  const actualPatch = runGit(
    execFile,
    [
      'diff',
      '--binary',
      '--full-index',
      '--no-renames',
      validatedBaseOid,
      'HEAD',
      '--',
    ],
    {
      cwd,
      label: 'reading the committed generated-version patch',
      timeoutMs: commandTimeoutMs,
    },
  )
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'glucoseiq-generated-version-'),
  )
  const expectedRepository = join(temporaryDirectory, 'repository')
  let worktreeAdded = false
  let patchesMatch = false
  let primaryError

  try {
    runGit(
      execFile,
      ['worktree', 'add', '--detach', expectedRepository, validatedBaseOid],
      {
        cwd,
        label: 'creating the generated-version comparison worktree',
        timeoutMs: commandTimeoutMs,
      },
    )
    worktreeAdded = true
    symlinkSync(
      nodeModulesDirectory,
      join(expectedRepository, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    runCommand(
      execFile,
      process.execPath,
      [changesetsCli, 'version'],
      {
        cwd: expectedRepository,
        label: 'replaying Changesets from the pushed base commit',
        timeoutMs: commandTimeoutMs,
      },
    )
    runCommand(
      execFile,
      packageManager,
      ['install', '--lockfile-only'],
      {
        cwd: expectedRepository,
        label: 'replaying the release lockfile update',
        timeoutMs: commandTimeoutMs,
      },
    )
    rmSync(join(expectedRepository, 'node_modules'))
    runGit(execFile, ['add', '-A', '--'], {
      cwd: expectedRepository,
      label: 'staging the expected generated-version artifacts',
      timeoutMs: commandTimeoutMs,
    })
    const expectedPatch = runGit(
      execFile,
      [
        'diff',
        '--cached',
        '--binary',
        '--full-index',
        '--no-renames',
        'HEAD',
        '--',
      ],
      {
        cwd: expectedRepository,
        label: 'reading the expected generated-version patch',
        timeoutMs: commandTimeoutMs,
      },
    )
    patchesMatch = actualPatch.equals(expectedPatch)
  } catch (error) {
    primaryError = error
  }

  let cleanupError
  if (worktreeAdded) {
    try {
      runGit(
        execFile,
        ['worktree', 'remove', '--force', expectedRepository],
        {
          cwd,
          label: 'removing the generated-version comparison worktree',
          timeoutMs: commandTimeoutMs,
        },
      )
    } catch (error) {
      cleanupError = error
    }
  }
  try {
    rmSync(temporaryDirectory, { force: true, recursive: true })
  } catch (error) {
    cleanupError ??= error
  }

  if (primaryError) throw primaryError
  if (cleanupError) throw cleanupError
  return patchesMatch
}

function singleCommandLine(output, label) {
  const buffer = asCommandBuffer(output, label)
  const decoded = decodeUtf8(buffer, label)
  const withoutTerminator = decoded.endsWith('\n') ? decoded.slice(0, -1) : decoded
  const value = withoutTerminator.endsWith('\r')
    ? withoutTerminator.slice(0, -1)
    : withoutTerminator
  if (value.length === 0 || /[\r\n\0]/u.test(value)) {
    throw new Error(`${label} did not resolve to a single value`)
  }
  return value
}

function singleCommitId(output, label) {
  let commitId
  try {
    commitId = singleCommandLine(output, label)
  } catch (error) {
    throw new Error(`${label} did not resolve to a single commit ID`, {
      cause: error,
    })
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(commitId)) {
    throw new Error(`${label} did not resolve to a single commit ID`)
  }
  return commitId.toLowerCase()
}

function actionsEnvironment(env) {
  const value = env.GITHUB_ACTIONS
  if (value === undefined || value === '' || value === 'false') return false
  if (value === 'true') return true
  throw new Error('GITHUB_ACTIONS must be "true", "false", or unset')
}

function configuredBranch(env, name, label) {
  const value = env[name]
  if (value === undefined || value === '') return undefined
  return assertBranchName(value, label)
}

function resolveBranch({ execFile, env, cwd, inActions }) {
  const override = configuredBranch(
    env,
    'CHANGESET_POLICY_BRANCH',
    'configured branch',
  )
  if (override) return override

  const pullRequestBranch = configuredBranch(
    env,
    'GITHUB_HEAD_REF',
    'pull-request branch',
  )
  if (pullRequestBranch) return pullRequestBranch

  if (inActions) {
    const refName = configuredBranch(env, 'GITHUB_REF_NAME', 'Actions ref name')
    if (refName) return refName
  }

  const output = runGit(
    execFile,
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    { cwd, label: 'resolving the current branch' },
  )
  let branch
  try {
    branch = singleCommandLine(output, 'current branch')
  } catch (error) {
    throw new Error('current branch must be a single valid branch name', {
      cause: error,
    })
  }
  return assertBranchName(branch, 'current branch')
}

function repositoryContext(env, name) {
  const value = env[name]
  if (value === undefined || value === '') return undefined
  if (
    typeof value !== 'string' ||
    !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(value)
  ) {
    throw new Error(`${name} must be a single owner/repository value`)
  }
  return value
}

function releaseBranchIsExempt({ branch, env, inActions }) {
  if (branch !== RELEASE_BRANCH) return false
  if (!inActions) return true
  const repository = repositoryContext(env, 'GITHUB_REPOSITORY')
  const headRepository = repositoryContext(
    env,
    'CHANGESET_POLICY_HEAD_REPOSITORY',
  )
  return Boolean(repository && headRepository && repository === headRepository)
}

function configuredBaseSha(env) {
  const value = env.CHANGESET_POLICY_BASE_SHA
  if (value === undefined || value === '') return undefined
  if (
    typeof value !== 'string' ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(value) ||
    /^0+$/u.test(value)
  ) {
    throw new Error(
      'CHANGESET_POLICY_BASE_SHA must be a non-zero 40- or 64-character hexadecimal commit ID',
    )
  }
  return value.toLowerCase()
}

function formatComparisonBase(comparisonBase) {
  const label = comparisonBase.source === 'push-before'
    ? 'push-before'
    : 'origin/main merge base'
  return `Comparison base: ${label} ${comparisonBase.oid}.`
}

function formatPolicyFailure(result, comparisonBase) {
  if (result.reason === 'changeset-deletion-forbidden') {
    return [
      'Changeset policy failed: pending Changesets may be deleted only by an exact generated version commit.',
      formatComparisonBase(comparisonBase),
      'Deleted Changesets:',
      ...result.deletedChangesets.map((path) => `- ${JSON.stringify(path)}`),
    ].join('\n')
  }
  if (result.reason === 'changeset-package-coverage-required') {
    return [
      'Changeset policy failed: every release-affecting public package must be named in a valid Changeset with a release type.',
      formatComparisonBase(comparisonBase),
      'Uncovered package directories:',
      ...result.uncoveredPackages.map((path) => `- ${JSON.stringify(path)}`),
      'Changed Changesets:',
      ...result.changesets.map((path) => `- ${JSON.stringify(path)}`),
    ].join('\n')
  }
  return [
    'Changeset policy failed: release-affecting package changes require a non-README .changeset Markdown file.',
    formatComparisonBase(comparisonBase),
    'Release-affecting paths:',
    ...result.releaseAffectingPaths.map((path) => `- ${JSON.stringify(path)}`),
  ].join('\n')
}

function formatSuccess(result) {
  if (result.reason === 'release-branch') {
    return `Changeset policy skipped for ${RELEASE_BRANCH}.`
  }
  if (result.reason === 'no-release-affecting-paths') {
    return 'Changeset policy passed: no release-affecting package changes.'
  }
  if (result.reason === 'generated-version-commit') {
    return `Changeset policy passed: generated version artifacts for ${result.versionedPackages.join(', ')} consumed a Changeset.`
  }
  const pathLabel = result.releaseAffectingPaths.length === 1 ? 'path' : 'paths'
  return `Changeset policy passed: ${result.releaseAffectingPaths.length} release-affecting ${pathLabel} covered by ${result.changesets.join(', ')}.`
}

/** Runs the policy using byte-oriented, argument-array Git commands. */
export function runChangesetPolicy({
  execFile = execFileSync,
  env = process.env,
  cwd = process.cwd(),
  write = (line) => console.log(line),
  validateVersionCommit = validateGeneratedVersionCommit,
  generatedVersionOptions = {},
} = {}) {
  if (typeof execFile !== 'function') throw new TypeError('execFile must be a function')
  if (!env || typeof env !== 'object') throw new TypeError('env must be an object')
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new TypeError('cwd must be a non-empty path string')
  }
  if (typeof write !== 'function') throw new TypeError('write must be a function')
  if (typeof validateVersionCommit !== 'function') {
    throw new TypeError('validateVersionCommit must be a function')
  }
  if (!generatedVersionOptions || typeof generatedVersionOptions !== 'object') {
    throw new TypeError('generatedVersionOptions must be an object')
  }

  const inActions = actionsEnvironment(env)
  const branch = resolveBranch({ execFile, env, cwd, inActions })
  const exemptReleaseBranch = releaseBranchIsExempt({ branch, env, inActions })
  if (exemptReleaseBranch) {
    const result = evaluateChangesetPolicy({
      branch,
      changedPaths: [],
      exemptReleaseBranch: true,
    })
    write(formatSuccess(result))
    return { ...result, branch }
  }

  const pushBaseOid = configuredBaseSha(env)
  let baseOid
  let mergeBaseOid
  let comparisonBase
  if (pushBaseOid) {
    comparisonBase = { source: 'push-before', oid: pushBaseOid }
  } else {
    baseOid = singleCommitId(
      runGit(
        execFile,
        ['rev-parse', '--verify', '--end-of-options', `${BASE_REFERENCE}^{commit}`],
        {
          cwd,
          label: `resolving ${BASE_REFERENCE}; fetch-depth: 0 is required`,
        },
      ),
      BASE_REFERENCE,
    )
    mergeBaseOid = singleCommitId(
      runGit(execFile, ['merge-base', baseOid, 'HEAD'], {
        cwd,
        label: `finding the merge base with ${BASE_REFERENCE}; fetch-depth: 0 is required`,
      }),
      `merge base with ${BASE_REFERENCE}`,
    )
    comparisonBase = {
      source: 'origin-main-merge-base',
      oid: mergeBaseOid,
    }
  }
  const changes = parseNullDelimitedChanges(
    runGit(
      execFile,
      [
        'diff',
        '--name-status',
        '-z',
        '--no-renames',
        comparisonBase.oid,
        'HEAD',
        '--',
      ],
      { cwd, label: `reading the pull-request diff from ${BASE_REFERENCE}` },
    ),
  )
  const generatedVersion =
    branch === 'main' && pushBaseOid
      ? generatedVersionCommitPackages(changes)
      : undefined
  let generatedVersionValidated = false
  if (generatedVersion?.releaseKind === 'next.0') {
    const initialState = parsePrereleaseState(
      runGit(execFile, ['cat-file', 'blob', `${comparisonBase.oid}:.changeset/pre.json`], {
        cwd,
        label: 'reading the initial prerelease state',
      }),
      'initial .changeset/pre.json',
    )
    if (initialState.kind !== 'initial') {
      throw new Error('Initial .changeset/pre.json must not contain consumed Changesets')
    }
    const generatedState = parsePrereleaseState(
      runGit(execFile, ['cat-file', 'blob', 'HEAD:.changeset/pre.json'], {
        cwd,
        label: 'reading the generated prerelease state',
      }),
      'generated .changeset/pre.json',
    )
    if (generatedState.kind !== 'generated') {
      throw new Error('Generated .changeset/pre.json must consume the launch Changeset')
    }
  }
  if (generatedVersion) {
    generatedVersionValidated = validateVersionCommit({
      ...generatedVersionOptions,
      baseOid: comparisonBase.oid,
      cwd,
      execFile,
    })
    if (generatedVersionValidated !== true) {
      throw new Error(
        'Changeset policy failed: generated version artifacts do not exactly match the Changesets output for the pushed base commit.',
      )
    }
  }
  const changesetReleaseDirectories = generatedVersionValidated
    ? []
    : readChangesetReleaseDirectories({ changes, execFile, cwd })
  const result = evaluateChangesetPolicy({
    branch,
    changes,
    exemptReleaseBranch: false,
    allowGeneratedVersionCommit: Boolean(pushBaseOid),
    generatedVersionValidated,
    changesetReleaseDirectories,
  })
  if (!result.ok) {
    throw new Error(
      formatPolicyFailure(result, comparisonBase),
    )
  }
  write(formatComparisonBase(comparisonBase))
  write(formatSuccess(result))
  return { ...result, branch, baseOid, mergeBaseOid, comparisonBase }
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
    runChangesetPolicy()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
