import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { renderApiModel } from './lib/api-renderer.mjs'
import { compareUnicodeScalars } from './lib/unicode-scalar-compare.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = resolve(SCRIPT_DIR, '..')
const DEFAULT_CONFIG_PATH = join(DOCS_DIR, 'typedoc.api.json')
const DEFAULT_OUTPUT_DIR = join(DOCS_DIR, 'content/docs/api/core')
export const API_TEMP_PREFIX = `glucoseiq-api-${process.pid}-`

function normalizedRelativePath(value) {
  return value.split(sep).join('/')
}

function safeOutputPath(root, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.includes('\\')
  ) {
    throw new Error(`Invalid generated API path: ${String(relativePath)}`)
  }
  const target = resolve(root, relativePath)
  const fromRoot = normalizedRelativePath(relative(root, target))
  if (fromRoot === '..' || fromRoot.startsWith('../')) {
    throw new Error(`Generated API path escapes its output root: ${relativePath}`)
  }
  return target
}

function inventoryCandidate(root, current = root) {
  if (current === root) {
    const rootStats = lstatSync(root)
    if (rootStats.isSymbolicLink()) {
      throw new Error('Symlink is not allowed in generated API candidate: .')
    }
    if (!rootStats.isDirectory()) {
      throw new Error('Unsupported file type in generated API candidate: .')
    }
  }
  const files = []
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name)
    const relativePath = normalizedRelativePath(relative(root, absolute))
    const stats = lstatSync(absolute)
    if (stats.isSymbolicLink()) {
      throw new Error(`Symlink is not allowed in generated API candidate: ${relativePath}`)
    }
    if (stats.isDirectory()) files.push(...inventoryCandidate(root, absolute))
    else if (stats.isFile()) files.push(relativePath)
    else throw new Error(`Unsupported file type in generated API candidate: ${relativePath}`)
  }
  return files.sort(compareUnicodeScalars)
}

function writeAndValidateCandidate(candidateDir, renderedFiles) {
  mkdirSync(candidateDir, { recursive: true })
  for (const [relativePath, content] of renderedFiles) {
    if (typeof content !== 'string') {
      throw new Error(`Generated API content must be a string: ${relativePath}`)
    }
    const target = safeOutputPath(candidateDir, relativePath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }

  const expected = [...renderedFiles.keys()].sort(compareUnicodeScalars)
  const actual = inventoryCandidate(candidateDir)
  if (expected.length !== actual.length || expected.some((file, index) => file !== actual[index])) {
    throw new Error(
      `Generated API candidate inventory mismatch: expected ${expected.join(', ')}, received ${actual.join(', ')}`,
    )
  }
  for (const [relativePath, content] of renderedFiles) {
    const actualBytes = readFileSync(safeOutputPath(candidateDir, relativePath))
    if (!actualBytes.equals(Buffer.from(content))) {
      throw new Error(`Generated API candidate byte validation failed: ${relativePath}`)
    }
  }
}

function replaceManagedOutput(candidateDir, outputDir, operations) {
  return replaceManagedOutputTransactional(candidateDir, outputDir, operations)
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function assertNoSymlinkBelow(root, target) {
  const relativeTarget = normalizedRelativePath(relative(root, target))
  const components = [root]
  let current = root
  for (const part of relativeTarget.split('/').filter(Boolean)) {
    current = join(current, part)
    components.push(current)
  }
  for (const component of components) {
    const stats = lstatIfPresent(component)
    if (stats?.isSymbolicLink()) {
      throw new Error(`Refusing generated API output with symlink component: ${component}`)
    }
  }
}

export function validateManagedOutputDirectory(outputDirectory) {
  const output = resolve(outputDirectory)
  if (output === DEFAULT_OUTPUT_DIR) {
    assertNoSymlinkBelow(realpathSync(DOCS_DIR), output)
    return output
  }

  const temporaryDirectory = resolve(tmpdir())
  const fromTemporaryDirectory = normalizedRelativePath(
    relative(temporaryDirectory, output),
  )
  const parts = fromTemporaryDirectory.split('/')
  const temporaryRootName = parts[0]
  const temporaryRoot = join(temporaryDirectory, temporaryRootName)
  const isDescendant =
    parts.length >= 2 &&
    fromTemporaryDirectory !== '..' &&
    !fromTemporaryDirectory.startsWith('../')
  const hasOwnedPrefix = /^glucoseiq-api-[^/]+$/u.test(temporaryRootName)
  const temporaryRootStats = lstatIfPresent(temporaryRoot)
  if (!isDescendant || !hasOwnedPrefix || !temporaryRootStats) {
    throw new Error(`Refusing unsafe generated API output directory: ${output}`)
  }
  const currentUser = typeof process.getuid === 'function' ? process.getuid() : null
  if (
    temporaryRootStats.isSymbolicLink() ||
    !temporaryRootStats.isDirectory() ||
    (currentUser !== null && temporaryRootStats.uid !== currentUser)
  ) {
    throw new Error(`Refusing unowned generated API temporary root: ${temporaryRoot}`)
  }
  assertNoSymlinkBelow(temporaryRoot, output)
  return output
}

function assertCopiedTreeMatches(candidateDirectory, stagedDirectory) {
  const candidateFiles = inventoryCandidate(candidateDirectory)
  const stagedFiles = inventoryCandidate(stagedDirectory)
  if (
    candidateFiles.length !== stagedFiles.length ||
    candidateFiles.some((file, index) => file !== stagedFiles[index])
  ) {
    throw new Error('Staged generated API inventory does not match the validated candidate')
  }
  for (const file of candidateFiles) {
    if (
      !readFileSync(join(candidateDirectory, ...file.split('/'))).equals(
        readFileSync(join(stagedDirectory, ...file.split('/'))),
      )
    ) {
      throw new Error(`Staged generated API bytes do not match: ${file}`)
    }
  }
}

export function replaceManagedOutputTransactional(
  candidateDirectory,
  outputDirectory,
  {
    copyDirectory = (source, destination) =>
      cpSync(source, destination, { recursive: true, force: true }),
    renamePath = renameSync,
    removePath = (path) => rmSync(path, { recursive: true, force: true }),
  } = {},
) {
  const candidate = resolve(candidateDirectory)
  const output = validateManagedOutputDirectory(outputDirectory)
  const outputParent = dirname(output)
  mkdirSync(outputParent, { recursive: true })
  const transactionRoot = mkdtempSync(
    join(outputParent, `.${basename(output)}-staging-`),
  )
  const stagedTree = join(transactionRoot, 'tree')
  const backupPath = join(
    outputParent,
    `.${basename(output)}-backup-${basename(transactionRoot)}`,
  )
  let backupExists = false
  let committed = false
  let preserveTransactionRoot = false
  let failure
  const cleanupWarnings = []
  try {
    copyDirectory(candidate, stagedTree)
    assertCopiedTreeMatches(candidate, stagedTree)
    if (existsSync(output)) {
      renamePath(output, backupPath)
      backupExists = true
    }
    try {
      renamePath(stagedTree, output)
    } catch (swapError) {
      if (backupExists) {
        try {
          renamePath(backupPath, output)
          backupExists = false
        } catch (rollbackError) {
          preserveTransactionRoot = true
          throw new AggregateError(
            [swapError, rollbackError],
            `Unable to install generated API output or restore ${output}. Recovery paths: staged tree ${stagedTree}; prior backup ${backupPath}`,
            { cause: rollbackError },
          )
        }
      }
      throw swapError
    }
    committed = true

    if (backupExists) {
      try {
        removePath(backupPath)
        backupExists = false
      } catch (cleanupError) {
        cleanupWarnings.push({
          phase: 'prior-backup',
          path: backupPath,
          error: cleanupError,
        })
      }
    }
  } catch (error) {
    failure = error
  }

  if (!preserveTransactionRoot) {
    try {
      removePath(transactionRoot)
    } catch (cleanupError) {
      if (committed && !failure) {
        cleanupWarnings.push({
          phase: 'transaction-root',
          path: transactionRoot,
          error: cleanupError,
        })
      } else {
        failure = failure
          ? new AggregateError(
              [failure, cleanupError],
              `Generated API transaction failed and cleanup also failed for ${transactionRoot}`,
            )
          : cleanupError
      }
    }
  }

  if (failure) throw failure
  return { cleanupWarnings, committed }
}

export function resolveTypeDocBinary() {
  const docsRequire = createRequire(join(DOCS_DIR, 'package.json'))
  const packagePath = docsRequire.resolve('typedoc/package.json')
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))
  const declaredBinary =
    typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.typedoc
  if (typeof declaredBinary !== 'string' || declaredBinary.length === 0) {
    throw new Error(`TypeDoc does not declare a typedoc binary in ${packagePath}`)
  }
  return {
    binaryPath: resolve(dirname(packagePath), declaredBinary),
    packagePath,
    version: manifest.version,
  }
}

function commandOutput(result) {
  return [result.stdout, result.stderr]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
}

export function assertSpawnResult(result) {
  const output = commandOutput(result)
  if (result.error) {
    throw new Error(
      `Unable to start TypeDoc: ${result.error.message}${output ? `\n${output}` : ''}`,
    )
  }
  if (result.signal) {
    throw new Error(
      `TypeDoc terminated by signal ${result.signal}${output ? `\n${output}` : ''}`,
    )
  }
  if (result.status !== 0) {
    throw new Error(
      `TypeDoc exited with status ${String(result.status)}${output ? `\n${output}` : ''}`,
    )
  }
  return result
}

export function runTypeDoc({ binaryPath, configPath, modelPath }) {
  const result = spawnSync(
    process.execPath,
    [resolve(binaryPath), '--options', resolve(configPath), '--json', resolve(modelPath)],
    {
      cwd: DOCS_DIR,
      encoding: 'utf8',
      shell: false,
    },
  )
  return assertSpawnResult(result)
}

export function generateApiReference({
  outputDir = DEFAULT_OUTPUT_DIR,
  typedocBinaryPath,
  typedocConfigPath = DEFAULT_CONFIG_PATH,
  transactionOperations,
  removeTemporaryRoot = (path) =>
    rmSync(path, { recursive: true, force: true }),
} = {}) {
  const validatedOutputDirectory = validateManagedOutputDirectory(outputDir)
  const temporaryRoot = mkdtempSync(join(tmpdir(), API_TEMP_PREFIX))
  let result
  let failure
  try {
    const modelPath = join(temporaryRoot, 'api-model.json')
    const candidateDir = join(temporaryRoot, 'candidate')
    const resolvedTypeDoc = typedocBinaryPath
      ? { binaryPath: typedocBinaryPath }
      : resolveTypeDocBinary()
    const typeDocResult = runTypeDoc({
      binaryPath: resolvedTypeDoc.binaryPath,
      configPath: typedocConfigPath,
      modelPath,
    })
    const model = JSON.parse(readFileSync(modelPath, 'utf8'))
    const renderedFiles = renderApiModel(model)
    writeAndValidateCandidate(candidateDir, renderedFiles)
    const transactionResult = replaceManagedOutput(
      candidateDir,
      validatedOutputDirectory,
      transactionOperations,
    )
    result = {
      outputDir: validatedOutputDirectory,
      renderedFiles,
      typeDocResult,
      cleanupWarnings: [...transactionResult.cleanupWarnings],
    }
  } catch (error) {
    failure = error
  }

  try {
    removeTemporaryRoot(temporaryRoot)
  } catch (cleanupError) {
    if (result) {
      result.cleanupWarnings.push({
        phase: 'generation-temporary-root',
        path: temporaryRoot,
        error: cleanupError,
      })
    } else {
      failure = failure
        ? new AggregateError(
            [failure, cleanupError],
            `API generation failed and temporary cleanup also failed for ${temporaryRoot}`,
          )
        : cleanupError
    }
  }

  if (failure) throw failure
  return result
}

function formatErrorInternal(error, active) {
  const tracked = Boolean(error && typeof error === 'object')
  if (tracked && active.has(error)) return '[circular error]'
  if (tracked) active.add(error)
  try {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof AggregateError) {
      const causes = [...error.errors]
        .map((cause, index) => `${index + 1}. ${formatErrorInternal(cause, active)}`)
        .join('; ')
      return causes ? `${message} [${causes}]` : message
    }
    if (error instanceof Error && error.cause !== undefined) {
      return `${message} [cause: ${formatErrorInternal(error.cause, active)}]`
    }
    return message
  } finally {
    if (tracked) active.delete(error)
  }
}

export function formatError(error) {
  return formatErrorInternal(error, new Set())
}

export function formatCleanupWarning(warning) {
  return `Warning: ${warning.phase} cleanup failed for ${warning.path}: ${formatError(warning.error)}. Inspect ${warning.path} and remove it manually after verifying it is no longer needed.`
}

function isDirectInvocation() {
  return Boolean(
    process.argv[1] &&
      pathToFileURL(resolve(process.argv[1])).href === import.meta.url,
  )
}

if (isDirectInvocation()) {
  try {
    const result = generateApiReference({
      outputDir: process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUTPUT_DIR,
    })
    if (result.typeDocResult.stdout) process.stdout.write(result.typeDocResult.stdout)
    if (result.typeDocResult.stderr) process.stderr.write(result.typeDocResult.stderr)
    for (const warning of result.cleanupWarnings) {
      console.error(formatCleanupWarning(warning))
    }
    console.log(
      `Wrote ${result.renderedFiles.size} generated API files to ${result.outputDir}`,
    )
  } catch (error) {
    console.error(formatError(error))
    process.exitCode = 1
  }
}
