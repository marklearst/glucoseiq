import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = path.join(repositoryRoot, 'packages/core/src')
const builtInThrow = /throw\s+new\s+(?:Error|RangeError|TypeError)\s*\(/g

async function findTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return findTypeScriptFiles(entryPath)
      return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : []
    })
  )

  return files.flat()
}

const violations = []

for (const file of await findTypeScriptFiles(sourceRoot)) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(builtInThrow)) {
    const line = source.slice(0, match.index).split('\n').length
    violations.push(`${path.relative(repositoryRoot, file)}:${line}`)
  }
}

if (violations.length > 0) {
  console.error('Core error contract failed: built-in intentional throws found:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('Core error contract passed: 0 built-in intentional throws.')
}
