import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { initSync, parse } from 'es-module-lexer'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CORE_DIST_ROOT = resolve(scriptDirectory, '../packages/core/dist')
const DEFAULT_ENTRY = 'index.mjs'
const NEWLINE = Buffer.from('\n')

export const DEFAULT_BUDGET_BYTES = 20_000

initSync()

/** Extracts static import and re-export specifiers without executing the module. */
export function extractStaticModuleSpecifiers(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string')
  const [imports] = parse(source)
  return imports
    .filter((specifier) => specifier.d === -1 && typeof specifier.n === 'string')
    .map((specifier) => specifier.n)
}

function isInside(root, candidate) {
  const pathFromRoot = relative(root, candidate)
  return (
    pathFromRoot === '' ||
    (pathFromRoot !== '..' &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot))
  )
}

function asRelativePath(root, file) {
  return relative(root, file).split(sep).join('/')
}

function assertProductionMjs(pathOrSpecifier, label) {
  if (!pathOrSpecifier.endsWith('.mjs')) {
    throw new Error(`${label}: relative static module specifier must target an .mjs file`)
  }
}

function resolveRealPath(candidate, label) {
  try {
    return realpathSync(candidate)
  } catch (error) {
    throw new Error(`${label} does not resolve to a file: ${candidate}`, { cause: error })
  }
}

function resolveRoot(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('root must be a non-empty path string')
  }
  const requestedRoot = resolve(root)
  const realRoot = resolveRealPath(requestedRoot, 'root')
  if (!statSync(realRoot).isDirectory()) throw new Error(`root is not a directory: ${root}`)
  return realRoot
}

function resolveModulePath({ root, candidate, label }) {
  if (!isInside(root, candidate)) throw new Error(`${label} escapes the selected ESM root`)
  const realPath = resolveRealPath(candidate, label)
  if (!isInside(root, realPath)) {
    throw new Error(`${label} real path escapes the selected ESM root`)
  }
  if (!statSync(realPath).isFile()) {
    throw new Error(`${label} does not resolve to a regular file: ${candidate}`)
  }
  assertProductionMjs(realPath, label)
  return realPath
}

function readPackageImports(root) {
  const manifestPath = resolve(dirname(root), 'package.json')
  const realManifestPath = resolveRealPath(manifestPath, 'core package manifest')
  if (!statSync(realManifestPath).isFile()) {
    throw new Error(`core package manifest is not a regular file: ${manifestPath}`)
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(realManifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`core package manifest is not valid JSON: ${manifestPath}`, {
      cause: error,
    })
  }

  const imports = manifest?.imports
  if (imports === null || typeof imports !== 'object' || Array.isArray(imports)) {
    return { imports: {}, packageRoot: dirname(realManifestPath) }
  }
  return { imports, packageRoot: dirname(realManifestPath) }
}

function resolvePrivatePackageImport({ root, specifier, importer }) {
  const { imports, packageRoot } = readPackageImports(root)
  if (!Object.hasOwn(imports, specifier)) {
    throw new Error(`Static edge from ${importer}: private package import ${JSON.stringify(specifier)} is not mapped`)
  }

  const conditions = imports[specifier]
  if (
    conditions === null ||
    typeof conditions !== 'object' ||
    Array.isArray(conditions) ||
    typeof conditions.import !== 'string' ||
    !conditions.import.startsWith('./')
  ) {
    throw new Error(
      `Static edge from ${importer}: private package import ${JSON.stringify(specifier)} must define one exact ESM import target`,
    )
  }

  const label = `Static edge ${JSON.stringify(specifier)} from ${importer}`
  assertProductionMjs(conditions.import, label)
  return { candidate: resolve(packageRoot, conditions.import), label }
}

function collectReachableModules({ root, entry }) {
  const realRoot = resolveRoot(root)
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new TypeError('entry must be a non-empty path string')
  }
  assertProductionMjs(entry, 'entry')

  const requestedEntry = isAbsolute(entry) ? resolve(entry) : resolve(realRoot, entry)
  const pending = [{ candidate: requestedEntry, label: 'entry' }]
  const modules = new Map()

  while (pending.length > 0) {
    const next = pending.pop()
    const canonical = resolveModulePath({ root: realRoot, ...next })
    if (modules.has(canonical)) continue

    const buffer = readFileSync(canonical)
    modules.set(canonical, buffer)
    const importer = asRelativePath(realRoot, canonical)
    for (const specifier of extractStaticModuleSpecifiers(buffer.toString('utf8'))) {
      if (specifier.startsWith('#')) {
        pending.push(
          resolvePrivatePackageImport({ root: realRoot, specifier, importer }),
        )
        continue
      }
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue
      const label = `Static edge ${JSON.stringify(specifier)} from ${importer}`
      assertProductionMjs(specifier, label)
      pending.push({ candidate: resolve(dirname(canonical), specifier), label })
    }
  }

  return { root: realRoot, modules }
}

function assertBudget(budget) {
  if (!Number.isSafeInteger(budget) || budget < 0) {
    throw new RangeError('budget must be a non-negative safe integer')
  }
}

function budgetError(gzipBytes, budget) {
  return new RangeError(
    `reachable core ESM is ${gzipBytes} gzip bytes, exceeding the ${budget}-byte budget`,
  )
}

/** Measures the gzip size of the reachable production ESM graph. */
export function measureCoreBundle({
  root = DEFAULT_CORE_DIST_ROOT,
  entry = DEFAULT_ENTRY,
  budget = DEFAULT_BUDGET_BYTES,
} = {}) {
  assertBudget(budget)
  const graph = collectReachableModules({ root, entry })
  const files = [...graph.modules.keys()]
    .map((file) => asRelativePath(graph.root, file))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  const buffersByRelativePath = new Map(
    [...graph.modules].map(([file, buffer]) => [asRelativePath(graph.root, file), buffer]),
  )
  const payload = Buffer.concat(
    files.flatMap((file) => [buffersByRelativePath.get(file), NEWLINE]),
  )
  const gzipBytes = gzipSync(payload).byteLength

  if (gzipBytes > budget) throw budgetError(gzipBytes, budget)
  return { files, gzipBytes, budget }
}

/** Measures and prints the deterministic CLI report before enforcing its budget. */
export function runCoreBundleCli({
  root = DEFAULT_CORE_DIST_ROOT,
  entry = DEFAULT_ENTRY,
  budget = DEFAULT_BUDGET_BYTES,
  write = (line) => console.log(line),
} = {}) {
  if (typeof write !== 'function') throw new TypeError('write must be a function')
  assertBudget(budget)
  const measured = measureCoreBundle({ root, entry, budget: Number.MAX_SAFE_INTEGER })
  const result = { ...measured, budget }
  write('Reachable core ESM files:')
  for (const file of result.files) write(file)
  write(`Gzip bytes: ${result.gzipBytes}`)
  write(`Budget bytes: ${result.budget}`)
  if (result.gzipBytes > budget) throw budgetError(result.gzipBytes, budget)
  return result
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
    runCoreBundleCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
