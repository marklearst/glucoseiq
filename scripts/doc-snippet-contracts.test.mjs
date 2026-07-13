import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  PACKAGE_README_CONTRACTS,
  createTrackedDocsRoutes,
  createPublicInventory,
  findClaimViolations,
  formatContractDiagnostics,
  validateDocumentLinks,
  validateReadmeContract,
} from './lib/doc-contracts.mjs'
import {
  analyzeSnippetSource,
  deriveDeclarationManifest,
  extractHomepageSnippet,
  extractSourceExamples,
  extractTypedFences,
  formatSnippetDiagnostics,
  MANUAL_FRAGMENT_ALLOWLIST,
  planSnippetCompilations,
  reconcileManualFragmentAllowlist,
} from './lib/doc-snippets.mjs'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const GENERATED_FRAGMENT_REASON = 'generated API declaration or signature'

// Keep hand-authored reviewed fragments exceptional, exact, and line-stable.
const manualFragments = new Set(MANUAL_FRAGMENT_ALLOWLIST)

function gitTrackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .sort()
}

function expectedInventoryFromTracked(trackedFiles) {
  const packageRoot = 'packages/(?:core|react|tokens|testing|cli|diabetic-utils)'
  const packageSource = new RegExp(`^${packageRoot}/src/.+\\.(?:ts|tsx)$`, 'u')
  const packageReadme = new RegExp(`^${packageRoot}/README\\.md$`, 'u')
  const archive = /^(?:CHANGELOG\.md|docs\/(?:globals|LAUNCH_RUNBOOK)\.md|docs\/(?:functions|interfaces|type-aliases|variables)\/.+\.md)$/u

  return {
    readmes: trackedFiles.filter(
      (path) => path === 'README.md' || packageReadme.test(path)
    ),
    narrativeDocs: trackedFiles.filter(
      (path) =>
        /^apps\/docs\/content\/docs\/.+\.mdx$/u.test(path) &&
        !path.startsWith('apps/docs/content/docs/api/core/')
    ),
    managedApi: trackedFiles.filter((path) =>
      /^apps\/docs\/content\/docs\/api\/core\/.+\.mdx$/u.test(path)
    ),
    sourceFiles: trackedFiles.filter((path) => packageSource.test(path)),
    homepageFiles: trackedFiles.filter(
      (path) => path === 'apps/docs/app/(home)/page.tsx'
    ),
    legacyLandingFiles: trackedFiles.filter(
      (path) => path === 'docs/README.md' || path === 'docs/index.md'
    ),
    linkOnlyFiles: trackedFiles.filter((path) => archive.test(path)),
  }
}

function readTracked(path) {
  if (path.startsWith('packages/core/docs-md/')) {
    throw new Error(`protected documentation path entered public inventory: ${path}`)
  }
  return readFileSync(join(repoRoot, path), 'utf8')
}

test('public contract inventory is complete and protected sources are absent', () => {
  const trackedFiles = gitTrackedFiles()
  const expected = expectedInventoryFromTracked(trackedFiles)
  const inventory = createPublicInventory({ repoRoot })

  assert.deepEqual(inventory, expected)
  assert.equal(inventory.readmes.length, 7)
  assert.ok(inventory.sourceFiles.length > 0)
  assert.ok(inventory.linkOnlyFiles.length > 0)
  assert.ok(
    trackedFiles.includes('docs/README.md') &&
      existsSync(join(repoRoot, 'docs/README.md')),
    'docs/README.md must be a tracked legacy landing page'
  )
  assert.ok(
    trackedFiles.includes('docs/LAUNCH_RUNBOOK.md') &&
      existsSync(join(repoRoot, 'docs/LAUNCH_RUNBOOK.md')) &&
      inventory.linkOnlyFiles.includes('docs/LAUNCH_RUNBOOK.md'),
    'docs/LAUNCH_RUNBOOK.md must be a tracked link-only launch document'
  )
  for (const path of Object.values(inventory).flat()) {
    assert.ok(!path.startsWith('packages/core/docs-md/'))
  }
})

test('the six real manifests derive exactly ten public ESM declarations', () => {
  const packageRoots = ['core', 'react', 'tokens', 'testing', 'cli', 'diabetic-utils']
  const entries = deriveDeclarationManifest({
    repoRoot,
    packages: packageRoots.map((name) => ({
      root: `packages/${name}`,
      manifest: JSON.parse(readTracked(`packages/${name}/package.json`)),
    })),
  })
  assert.deepEqual(
    entries.map(({ specifier }) => specifier).sort(),
    [
      '@glucoseiq/cli',
      '@glucoseiq/core',
      '@glucoseiq/core/connectors',
      '@glucoseiq/core/interop',
      '@glucoseiq/core/metrics',
      '@glucoseiq/core/render',
      '@glucoseiq/react',
      '@glucoseiq/testing',
      '@glucoseiq/tokens',
      'diabetic-utils',
    ]
  )
})

test('current public prose and package descriptions contain no prohibited claims', () => {
  const inventory = createPublicInventory({ repoRoot })
  const manifestPaths = [
    'package.json',
    'packages/core/package.json',
    'packages/react/package.json',
    'packages/tokens/package.json',
    'packages/testing/package.json',
    'packages/cli/package.json',
    'packages/diabetic-utils/package.json',
  ]
  const paths = [
    ...inventory.readmes,
    ...inventory.narrativeDocs,
    ...inventory.sourceFiles,
    ...inventory.homepageFiles,
    ...inventory.legacyLandingFiles,
    ...manifestPaths,
  ]
  const diagnostics = paths.flatMap((path) =>
    findClaimViolations({ path, text: readTracked(path) })
  )
  assert.equal(diagnostics.length, 0, formatContractDiagnostics(diagnostics))
})

test('all public and historical links resolve under their distribution rules', () => {
  const inventory = createPublicInventory({ repoRoot })
  const trackedRoutes = createTrackedDocsRoutes(inventory)
  const trackedFiles = new Set(
    Object.values(inventory).flatMap((paths) =>
      Array.isArray(paths) ? paths : []
    )
  )
  const paths = [
    ...inventory.readmes,
    ...inventory.narrativeDocs,
    ...inventory.managedApi,
    ...inventory.legacyLandingFiles,
    ...inventory.linkOnlyFiles,
  ]
  const packageReadmePaths = new Set(
    PACKAGE_README_CONTRACTS.map(({ path }) => path)
  )
  const diagnostics = paths.flatMap((path) =>
    validateDocumentLinks({
      path,
      text: readTracked(path),
      repoRoot,
      trackedRoutes,
      trackedFiles,
      publishedReadme: packageReadmePaths.has(path),
    })
  )
  assert.equal(diagnostics.length, 0, formatContractDiagnostics(diagnostics))
})

test('all six source READMEs provide the complete packed-package contract', () => {
  const diagnostics = PACKAGE_README_CONTRACTS.flatMap((contract) =>
    validateReadmeContract({
      ...contract,
      text: readTracked(contract.path),
    })
  )
  assert.equal(diagnostics.length, 0, formatContractDiagnostics(diagnostics))
})

test('every public typed fence is explicitly and validly classified', () => {
  const inventory = createPublicInventory({ repoRoot })
  const paths = [
    ...inventory.readmes,
    ...inventory.narrativeDocs,
    ...inventory.managedApi,
  ]
  const results = paths.map((path) => {
    const text = readTracked(path)
    const result = extractTypedFences({
      path,
      text,
      manualFragments,
      generatedFragmentReason: GENERATED_FRAGMENT_REASON,
    })
    const typedFenceCount = result.typedFenceCount
    assert.ok(Number.isInteger(typedFenceCount) && typedFenceCount >= 0)
    assert.equal(
      result.snippets.length + result.fragments.length,
      typedFenceCount,
      `${path} must classify every typed fence exactly once`
    )
    return { path, ...result }
  })
  const diagnostics = results.flatMap(({ diagnostics }) => diagnostics)
  const consumedManualFragments = new Set(
    results.flatMap(({ consumedManualFragments = [] }) => [
      ...consumedManualFragments,
    ])
  )
  const classified = results.reduce(
    (count, result) => count + result.snippets.length + result.fragments.length,
    0
  )
  assert.ok(classified > 0)

  for (const path of [
    'README.md',
    ...PACKAGE_README_CONTRACTS.map(({ path }) => path),
  ]) {
    const result = results.find((entry) => entry.path === path)
    assert.ok(result, `${path} must be in the public fence inventory`)
    assert.ok(
      result.snippets.length > 0,
      `${path} must include at least one independently compiling example`
    )
  }

  const cliResult = results.find(
    (entry) => entry.path === 'packages/cli/README.md'
  )
  assert.ok(
    cliResult.snippets.some(({ source }) => {
      const analysis = analyzeSnippetSource({
        path: 'packages/cli/README.md',
        source,
        allowedPackages: new Set(['@glucoseiq/cli']),
      })
      const runImport = analysis.imports.find(
        (entry) =>
          entry.specifier === '@glucoseiq/cli' &&
          entry.imported === 'run' &&
          entry.typeOnly === false
      )
      const cliIoImport = analysis.imports.find(
        (entry) =>
          entry.specifier === '@glucoseiq/cli' && entry.imported === 'CliIO'
      )
      return (
        runImport !== undefined &&
        cliIoImport !== undefined &&
        analysis.calls.includes(runImport.local)
      )
    }),
    'the CLI README first-use contract must import and call typed run'
  )
  diagnostics.push(
    ...reconcileManualFragmentAllowlist({
      manualFragments,
      consumedManualFragments,
    })
  )
  assert.equal(diagnostics.length, 0, formatSnippetDiagnostics(diagnostics))
})

test('every dynamically discovered source example is a standalone typed snippet', () => {
  const inventory = createPublicInventory({ repoRoot })
  let expectedExamples = 0
  const results = inventory.sourceFiles.map((path) => {
    const text = readTracked(path)
    expectedExamples += text.match(/@example\b/gu)?.length ?? 0
    return extractSourceExamples({ path, text })
  })
  const snippets = results.flatMap(({ snippets }) => snippets)
  const diagnostics = results.flatMap(({ diagnostics }) => diagnostics)
  assert.ok(expectedExamples > 0)
  assert.equal(snippets.length, expectedExamples)
  assert.equal(diagnostics.length, 0, formatSnippetDiagnostics(diagnostics))
})

test('the visible homepage sample is explicitly marked and standalone', () => {
  const inventory = createPublicInventory({ repoRoot })
  const path = inventory.homepageFiles[0]
  const result = extractHomepageSnippet({
    path,
    text: readTracked(path),
    marker: 'home-report',
  })
  assert.ok(
    result.snippet,
    formatSnippetDiagnostics(result.diagnostics) ||
      'the visible homepage sample must be explicitly marked'
  )
  assert.ok(result.snippet.source.includes("from '@glucoseiq/core'"))
  assert.equal(result.snippet.language, 'ts')
  assert.equal(result.diagnostics.length, 0, formatSnippetDiagnostics(result.diagnostics))
})

test('homepage and UI examples pair visual shorthand with semantic text', () => {
  const homepage = readTracked('apps/docs/app/(home)/page.tsx')
  assert.match(homepage, /<caption className="sr-only">[^<]+<\/caption>/u)
  assert.match(homepage, /<thead className="sr-only">/u)
  assert.equal(homepage.match(/<th scope="col">/gu)?.length, 2)
  assert.match(
    homepage,
    /<span aria-hidden="true">\{ARROW\[trend\.trend\]\}<\/span>/u
  )
  assert.match(homepage, /<span className="sr-only">[^<]*\{trendLabel\}<\/span>/u)

  const live = readTracked('apps/docs/content/docs/live.mdx')
  assert.match(
    live,
    /<span aria-hidden="true">\{arrows\[live\.trend\.trend\]\}<\/span>/u
  )
  assert.match(live, /style=\{\{[^}]*clipPath: 'inset\(50%\)'[^}]*\}\}/u)
  assert.match(
    live,
    /<span style=\{\{[^}]+\}\}>[^<]*\{trendLabel\}<\/span>/u
  )

  const react = readTracked('apps/docs/content/docs/react.mdx')
  assert.equal(react.match(/<figcaption>\{summaries\./gu)?.length, 3)
  assert.match(react, /adjacent text summary/u)
})

test('the launch runbook preserves phase, artifact, and OIDC safety gates', () => {
  const runbook = readTracked('docs/LAUNCH_RUNBOOK.md')

  const bashFences = [...runbook.matchAll(/```bash\n([\s\S]*?)```/gu)]
  assert.ok(bashFences.length > 0, 'the runbook must contain checked Bash blocks')
  for (const [index, match] of bashFences.entries()) {
    assert.match(
      match[1],
      /^set -euo pipefail\n/u,
      `Bash block ${index + 1} must fail fast`
    )
  }
  assert.match(runbook, /Run\s+every command block in the same Bash shell/u)
  assert.match(
    runbook,
    /test "\$\(node -p 'process\.versions\.node\.split\("\."\)\[0\]'\)" = "24"/u
  )
  assert.match(runbook, /test "\$\(pnpm --version\)" = "11\.12\.0"/u)
  assert.match(runbook, /test "\$\(npm --version\)" = "11\.17\.0"/u)

  assert.match(runbook, /Transition candidate[\s\S]*pnpm changeset status/u)
  assert.match(
    runbook,
    /Generated release pull request[\s\S]*test ! -e \.changeset\/launch-glucoseiq-one\.md/u
  )
  assert.match(runbook, /pnpm test:size/u)
  assert.doesNotMatch(runbook, /core root ESM gzip/u)

  assert.match(runbook, /branch_name=\$\(git branch --show-current\)/u)
  assert.match(runbook, /git grep[\s\S]*"\$commit"/u)
  assert.match(
    runbook,
    /find packages -path '\*\/dist\/\*\.map' -type f -print0/u
  )

  assert.match(runbook, /trap 'rm -rf -- "\$tmp"' EXIT/u)
  assert.match(runbook, /mv -- diabetic-utils glucoseiq/u)
  assert.match(runbook, /confirmed E404 after the propagation window/u)
  assert.match(runbook, /Unexpected registry failure/u)

  const oneWorktree = runbook.indexOf(
    'test "$(git worktree list --porcelain | rg -c \'^worktree \')" -eq 1'
  )
  const emptyTarget = runbook.indexOf('test ! -e glucoseiq')
  const moveCheckout = runbook.indexOf('mv -- diabetic-utils glucoseiq')
  const switchMain = runbook.indexOf('git switch main')
  const assertMain = runbook.indexOf('test "$(git branch --show-current)" = "main"')
  const fastForward = runbook.indexOf('git merge --ff-only origin/main')
  const finalClean = runbook.lastIndexOf('test -z "$(git status --porcelain)"')
  assert.ok(oneWorktree >= 0 && oneWorktree < moveCheckout)
  assert.ok(emptyTarget >= 0 && emptyTarget < moveCheckout)
  assert.ok(switchMain > moveCheckout && assertMain > switchMain)
  assert.ok(fastForward > assertMain && finalClean > fastForward)

  const removeToken = runbook.indexOf('Remove every workflow reference to `NPM_TOKEN`')
  const deleteToken = runbook.indexOf('Delete the GitHub repository secret')
  const verifyOidc = runbook.indexOf('Run the next legitimate OIDC release')
  const revokeToken = runbook.indexOf('Revoke the retained one-day token')
  assert.ok(removeToken >= 0, 'the workflow token must be removed before OIDC verification')
  assert.ok(deleteToken > removeToken, 'the GitHub secret must be deleted after workflow removal')
  assert.ok(verifyOidc > deleteToken, 'OIDC verification must run without a GitHub token fallback')
  assert.ok(revokeToken > verifyOidc, 'the retained npm credential is revoked after OIDC succeeds')
})

test('every classified public program enters the compiler job set', () => {
  const inventory = createPublicInventory({ repoRoot })
  const declarations = deriveDeclarationManifest({
    repoRoot,
    packages: ['core', 'react', 'tokens', 'testing', 'cli', 'diabetic-utils'].map(
      (name) => ({
        root: `packages/${name}`,
        manifest: JSON.parse(readTracked(`packages/${name}/package.json`)),
      })
    ),
  })
  const allowedPackages = new Set(
    [
      ...declarations.map(({ specifier }) => specifier),
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ]
  )
  const snippets = []

  for (const path of [
    ...inventory.readmes,
    ...inventory.narrativeDocs,
    ...inventory.managedApi,
  ]) {
    const result = extractTypedFences({
      path,
      text: readTracked(path),
      manualFragments,
      generatedFragmentReason: GENERATED_FRAGMENT_REASON,
    })
    snippets.push(
      ...result.snippets.map((snippet) => ({
        ...snippet,
        id: `${path}:${snippet.line}`,
      }))
    )
  }

  for (const path of inventory.sourceFiles) {
    const result = extractSourceExamples({ path, text: readTracked(path) })
    snippets.push(
      ...result.snippets.map((snippet) => ({
        ...snippet,
        id: `${path}:${snippet.line}`,
      }))
    )
  }

  const homePath = inventory.homepageFiles[0]
  const home = extractHomepageSnippet({
    path: homePath,
    text: readTracked(homePath),
    marker: 'home-report',
  })
  assert.ok(
    home.snippet,
    formatSnippetDiagnostics(home.diagnostics) ||
      'the visible homepage sample must be explicitly marked'
  )
  snippets.push({ ...home.snippet, id: `${homePath}:${home.snippet.line}` })

  let directReactImports = 0
  const analyzed = snippets.map((snippet) => {
    const analysis = analyzeSnippetSource({
      path: snippet.path ?? snippet.id,
      sourceLine: snippet.sourceLine ?? snippet.line,
      source: snippet.source,
      allowedPackages,
    })
    assert.equal(
      analysis.diagnostics.length,
      0,
      formatSnippetDiagnostics(analysis.diagnostics)
    )
    if (
      analysis.specifiers.some(
        (specifier) =>
          specifier === 'react' || specifier.startsWith('react/')
      )
    ) {
      directReactImports += 1
      assert.equal(
        analysis.usesReact,
        true,
        `${snippet.id} directly imports React and must run both peer passes`
      )
    }
    return { ...snippet, usesReact: analysis.usesReact }
  })
  assert.ok(directReactImports > 0, 'the public corpus must exercise direct React imports')
  const jobs = planSnippetCompilations({
    snippets: analyzed,
    reactVariants: ['18', '19'],
  })
  const plannedIds = new Set(jobs.map(({ snippetId }) => snippetId))
  assert.deepEqual(plannedIds, new Set(analyzed.map(({ id }) => id)))
  for (const snippet of analyzed) {
    const variants = jobs
      .filter(({ snippetId }) => snippetId === snippet.id)
      .map(({ reactMajor }) => reactMajor)
    assert.deepEqual(
      variants,
      snippet.usesReact ? ['18', '19'] : [null],
      snippet.id
    )
  }
})
