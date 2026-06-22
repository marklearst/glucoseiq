#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPublicInventory } from './lib/doc-contracts.mjs'
import {
  analyzeSnippetSource,
  compileSnippets,
  deriveDeclarationManifest,
  extractHomepageSnippet,
  extractSourceExamples,
  extractTypedFences,
  formatDeclarationPrerequisite,
  formatSnippetDiagnostics,
  MANUAL_FRAGMENT_ALLOWLIST,
  planSnippetCompilations,
  reconcileManualFragmentAllowlist,
  resolveDocsToolchain,
  resolveRepositoryRoot,
  sortSnippetDiagnostics,
  validateDeclarationManifest,
} from './lib/doc-snippets.mjs'

const GENERATED_FRAGMENT_REASON = 'generated API declaration or signature'
const manualFragments = new Set(MANUAL_FRAGMENT_ALLOWLIST)
const packageDirectories = [
  'core',
  'react',
  'tokens',
  'testing',
  'cli',
  'diabetic-utils',
]

function readPublicFile(repoRoot, path) {
  if (path.startsWith('packages/core/docs-md/')) {
    throw new Error(`Protected documentation path entered snippet inventory: ${path}`)
  }
  return readFileSync(join(repoRoot, path), 'utf8')
}

function loadDeclarationEntries(repoRoot) {
  return deriveDeclarationManifest({
    repoRoot,
    packages: packageDirectories.map((directory) => ({
      root: `packages/${directory}`,
      manifest: JSON.parse(
        readPublicFile(repoRoot, `packages/${directory}/package.json`)
      ),
    })),
  })
}

function extractPublicSnippets(repoRoot, inventory) {
  const diagnostics = []
  const snippets = []
  const consumedManualFragments = new Set()

  for (const path of [
    ...inventory.readmes,
    ...inventory.narrativeDocs,
    ...inventory.managedApi,
  ]) {
    const result = extractTypedFences({
      path,
      text: readPublicFile(repoRoot, path),
      manualFragments,
      generatedFragmentReason: GENERATED_FRAGMENT_REASON,
    })
    diagnostics.push(...result.diagnostics)
    for (const key of result.consumedManualFragments ?? []) {
      consumedManualFragments.add(key)
    }
    snippets.push(
      ...result.snippets.map((snippet) => ({
        ...snippet,
        id: `${path}:${snippet.line}`,
      }))
    )
  }

  for (const path of inventory.sourceFiles) {
    const result = extractSourceExamples({
      path,
      text: readPublicFile(repoRoot, path),
    })
    diagnostics.push(...result.diagnostics)
    snippets.push(
      ...result.snippets.map((snippet) => ({
        ...snippet,
        id: `${path}:${snippet.line}`,
      }))
    )
  }

  for (const path of inventory.homepageFiles) {
    const result = extractHomepageSnippet({
      path,
      text: readPublicFile(repoRoot, path),
      marker: 'home-report',
    })
    diagnostics.push(...result.diagnostics)
    if (result.snippet) {
      snippets.push({
        ...result.snippet,
        id: `${path}:${result.snippet.line}`,
      })
    }
  }

  diagnostics.push(
    ...reconcileManualFragmentAllowlist({
      manualFragments,
      consumedManualFragments,
    })
  )

  return { diagnostics, snippets }
}

async function main() {
  const repoRoot = resolveRepositoryRoot(dirname(fileURLToPath(import.meta.url)))
  const declarationEntries = loadDeclarationEntries(repoRoot)
  const declarationDiagnostics = validateDeclarationManifest(declarationEntries)

  if (declarationDiagnostics.length > 0) {
    throw new Error(formatDeclarationPrerequisite(declarationDiagnostics))
  }

  const inventory = createPublicInventory({ repoRoot })
  const extracted = extractPublicSnippets(repoRoot, inventory)
  const allowedPackages = new Set([
    ...declarationEntries.map(({ specifier }) => specifier),
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
  ])
  const analyzed = extracted.snippets.map((snippet) => {
    const analysis = analyzeSnippetSource({
      path: snippet.path ?? snippet.id,
      sourceLine: snippet.sourceLine ?? snippet.line,
      source: snippet.source,
      allowedPackages,
    })
    extracted.diagnostics.push(...analysis.diagnostics)
    return { ...snippet, usesReact: analysis.usesReact }
  })

  if (extracted.diagnostics.length > 0) {
    throw new Error(
      formatSnippetDiagnostics(sortSnippetDiagnostics(extracted.diagnostics))
    )
  }

  const toolchain = resolveDocsToolchain({
    docsManifestPath: join(repoRoot, 'apps/docs/package.json'),
  })
  const compilerDiagnostics = await compileSnippets({
    snippets: analyzed,
    declarationEntries,
    declarationDiagnostics,
    toolchain,
  })
  if (compilerDiagnostics.length > 0) {
    throw new Error(formatSnippetDiagnostics(compilerDiagnostics))
  }

  const jobs = planSnippetCompilations({
    snippets: analyzed,
    reactVariants: ['18', '19'],
  })
  process.stdout.write(
    `Documentation snippets passed: ${analyzed.length} programs, ${jobs.length} compiler passes.\n`
  )
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
