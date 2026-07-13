import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  API_TEMP_PREFIX,
  formatCleanupWarning,
  formatError,
  generateApiReference,
} from './generate-api.mjs'
import { compareUnicodeScalars } from './lib/unicode-scalar-compare.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const TRACKED_CORE_DIR = resolve(SCRIPT_DIR, '../content/docs/api/core')
const CLEANUP_WARNINGS_BY_FAILURE = new WeakMap()

class PrimitiveCheckFailure extends Error {
  constructor(primaryFailure) {
    super('API drift check threw a non-object value')
    this.primaryFailure = primaryFailure
  }
}

function canTrackFailure(error) {
  return error !== null && ['object', 'function'].includes(typeof error)
}

function preserveCleanupWarnings(error, warnings) {
  if (canTrackFailure(error)) {
    CLEANUP_WARNINGS_BY_FAILURE.set(error, [...warnings])
  }
}

export function primaryFailureForError(error) {
  return error instanceof PrimitiveCheckFailure ? error.primaryFailure : error
}

export function cleanupWarningsForError(error) {
  return canTrackFailure(error)
    ? [...(CLEANUP_WARNINGS_BY_FAILURE.get(error) ?? [])]
    : []
}

function posixRelative(root, target) {
  return relative(root, target).split(sep).join('/')
}

function walkRegularFiles(root, current, files) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name)
    const relativePath = posixRelative(root, absolute)
    const stats = lstatSync(absolute)
    if (stats.isSymbolicLink()) {
      throw new Error(`Symlink is not allowed in managed API output: ${relativePath}`)
    }
    if (stats.isDirectory()) walkRegularFiles(root, absolute, files)
    else if (stats.isFile()) files.push(relativePath)
    else throw new Error(`Unsupported file type in managed API output: ${relativePath}`)
  }
}

export function inventoryRegularFiles(rootDirectory) {
  const root = resolve(rootDirectory)
  const rootStats = lstatSync(root)
  if (rootStats.isSymbolicLink()) {
    throw new Error('Symlink is not allowed in managed API output: .')
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`Managed API output is not a directory: ${root}`)
  }
  const files = []
  walkRegularFiles(root, root, files)
  return files.sort(compareUnicodeScalars)
}

export function compareManagedTrees(expectedDirectory, actualDirectory) {
  const expectedRoot = resolve(expectedDirectory)
  const actualRoot = resolve(actualDirectory)
  const expected = inventoryRegularFiles(expectedRoot)
  const actual = inventoryRegularFiles(actualRoot)
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  const missing = expected.filter((file) => !actualSet.has(file))
  const extra = actual.filter((file) => !expectedSet.has(file))
  const changed = expected
    .filter((file) => actualSet.has(file))
    .filter(
      (file) =>
        !readFileSync(join(expectedRoot, ...file.split('/'))).equals(
          readFileSync(join(actualRoot, ...file.split('/'))),
        ),
    )
  return { missing, extra, changed }
}

export function formatDrift(drift) {
  return [
    ...drift.missing.map((file) => `missing: ${file}`),
    ...drift.extra.map((file) => `extra: ${file}`),
    ...drift.changed.map((file) => `changed: ${file}`),
  ]
}

export function checkApiDrift({
  trackedDirectory = TRACKED_CORE_DIR,
  generateReference = generateApiReference,
  compareTrees = compareManagedTrees,
  removeTemporaryRoot = (path) => rmSync(path, { recursive: true, force: true }),
} = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), API_TEMP_PREFIX))
  const cleanupWarnings = []
  let drift
  let failure
  let failed = false
  try {
    const candidateDirectory = join(temporaryRoot, 'candidate')
    const generation = generateReference({ outputDir: candidateDirectory })
    cleanupWarnings.push(...(generation.cleanupWarnings ?? []))
    drift = compareTrees(candidateDirectory, trackedDirectory)
  } catch (error) {
    failed = true
    failure = error
  }

  try {
    removeTemporaryRoot(temporaryRoot)
  } catch (cleanupError) {
    cleanupWarnings.push({
      phase: 'drift-temporary-root',
      path: temporaryRoot,
      error: cleanupError,
    })
  }

  if (failed) {
    const reportedFailure =
      canTrackFailure(failure) || cleanupWarnings.length === 0
        ? failure
        : new PrimitiveCheckFailure(failure)
    preserveCleanupWarnings(reportedFailure, cleanupWarnings)
    throw reportedFailure
  }
  return { ...drift, cleanupWarnings }
}

export function formatCheckReport(result) {
  const driftLines = formatDrift(result)
  const warningLines = (result.cleanupWarnings ?? []).map(formatCleanupWarning)
  if (driftLines.length > 0) {
    return {
      exitCode: 1,
      stdout: [],
      stderr: [
        ...warningLines,
        'Generated API reference is out of date:',
        ...driftLines.map((line) => `- ${line}`),
      ],
    }
  }
  return {
    exitCode: 0,
    stdout: [
      'Generated API reference matches the tracked api/core files byte-for-byte.',
    ],
    stderr: warningLines,
  }
}

export function formatCheckFailure(error) {
  const primaryFailure = primaryFailureForError(error)
  const diagnostic = canTrackFailure(primaryFailure)
    ? formatError(primaryFailure)
    : `Thrown non-Error value: ${
        typeof primaryFailure === 'string'
          ? JSON.stringify(primaryFailure)
          : String(primaryFailure)
      }`
  return {
    exitCode: 1,
    stdout: [],
    stderr: [
      ...cleanupWarningsForError(error).map(formatCleanupWarning),
      diagnostic,
    ],
  }
}

export function runCheckApiCommand({
  trackedDirectory = TRACKED_CORE_DIR,
  checkDrift = checkApiDrift,
  writeStdout = (line) => console.log(line),
  writeStderr = (line) => console.error(line),
} = {}) {
  let report
  try {
    report = formatCheckReport(checkDrift({ trackedDirectory }))
  } catch (error) {
    report = formatCheckFailure(error)
  }
  for (const line of report.stdout) writeStdout(line)
  for (const line of report.stderr) writeStderr(line)
  return report.exitCode
}

function isDirectInvocation() {
  return Boolean(
    process.argv[1] &&
      pathToFileURL(resolve(process.argv[1])).href === import.meta.url,
  )
}

if (isDirectInvocation()) {
  const trackedDirectory = process.argv[2]
    ? resolve(process.argv[2])
    : TRACKED_CORE_DIR
  process.exitCode = runCheckApiCommand({ trackedDirectory })
}
