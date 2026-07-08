import { execFile } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MODULE_REPOSITORY_ROOT = dirname(
  dirname(dirname(fileURLToPath(import.meta.url)))
)
const REACT_SPECIFIERS = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@glucoseiq/react',
])
const OWNED_TEMP_PREFIX = 'glucoseiq-docs-'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024

export const MANUAL_FRAGMENT_ALLOWLIST = Object.freeze([
  'apps/docs/content/docs/dashboard.mdx:193:imports the GlucoseDashboard component defined earlier in this guide',
  'apps/docs/content/docs/live.mdx:73:imports the mergeReadings helper defined earlier in this guide',
  'apps/docs/content/docs/live.mdx:183:composes tutorial hooks and components defined earlier in this guide',
])

let typescript

function diagnostic({ code, path, line = 1, message }) {
  return {
    code,
    path,
    sourcePath: path,
    line,
    sourceLine: line,
    column: 1,
    reactMajor: null,
    message,
  }
}

function loadTypeScript() {
  if (typescript !== undefined) return typescript

  const requireFromDocs = createRequire(
    join(MODULE_REPOSITORY_ROOT, 'apps/docs/package.json')
  )
  typescript = requireFromDocs('typescript')
  if (typescript.version !== '5.9.3') {
    throw new Error(
      `The documentation contract requires TypeScript 5.9.3; resolved ${typescript.version}.`
    )
  }
  return typescript
}

function normalizedLines(text) {
  return text.replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n').split('\n')
}

function typedFenceLanguage(metadata) {
  const match = /^(ts|tsx|typescript)(?=\s|$)/u.exec(metadata.trim())
  return match?.[1] ?? null
}

function parseFenceOpening(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line)
  if (match === null) return null
  if (match[1][0] === '`' && match[2].includes('`')) return null
  return {
    marker: match[1][0],
    length: match[1].length,
    metadata: match[2].trim(),
  }
}

function isFenceClose(line, opening) {
  const match = /^ {0,3}(`+|~+)[ \t]*$/u.exec(line)
  return (
    match !== null &&
    match[1][0] === opening.marker &&
    match[1].length >= opening.length
  )
}

function isManagedApiPath(path) {
  return /^apps\/docs\/content\/docs\/api\/core\/.+\.mdx$/u.test(path)
}

function isGeneratedDeclaration(source) {
  const value = source.trim()
  if (value.length === 0) return false
  const ts = loadTypeScript()

  function parse(candidate) {
    return ts.createSourceFile(
      'generated-fragment.d.ts',
      candidate,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    )
  }

  function hasNoSyntaxErrors(sourceFile) {
    return sourceFile.parseDiagnostics.length === 0
  }

  function isSafeParameterDefault(initializer) {
    if (
      ts.isIdentifier(initializer) ||
      ts.isNumericLiteral(initializer) ||
      ts.isStringLiteral(initializer) ||
      ts.isNoSubstitutionTemplateLiteral(initializer) ||
      initializer.kind === ts.SyntaxKind.TrueKeyword ||
      initializer.kind === ts.SyntaxKind.FalseKeyword ||
      initializer.kind === ts.SyntaxKind.NullKeyword
    ) {
      return true
    }
    if (ts.isParenthesizedExpression(initializer)) {
      return isSafeParameterDefault(initializer.expression)
    }
    if (ts.isPrefixUnaryExpression(initializer)) {
      return (
        (initializer.operator === ts.SyntaxKind.PlusToken ||
          initializer.operator === ts.SyntaxKind.MinusToken) &&
        ts.isNumericLiteral(initializer.operand)
      )
    }
    if (ts.isArrayLiteralExpression(initializer)) {
      return initializer.elements.every(
        (element) =>
          !ts.isSpreadElement(element) && isSafeParameterDefault(element)
      )
    }
    return ts.isObjectLiteralExpression(initializer) && initializer.properties.length === 0
  }

  function hasSafeParameters(node) {
    return (node.parameters ?? []).every(
      (parameter) =>
        parameter.initializer === undefined ||
        isSafeParameterDefault(parameter.initializer)
    )
  }

  function isSafePropertyName(name) {
    return (
      name === undefined ||
      ts.isIdentifier(name) ||
      ts.isStringLiteral(name) ||
      ts.isNumericLiteral(name)
    )
  }

  function isSafeTypeMember(member) {
    return (
      isSafePropertyName(member.name) &&
      hasSafeParameters(member) &&
      !('initializer' in member && member.initializer !== undefined) &&
      !('body' in member && member.body !== undefined)
    )
  }

  function isSafeHeritageExpression(expression) {
    return (
      ts.isIdentifier(expression) ||
      (ts.isPropertyAccessExpression(expression) &&
        isSafeHeritageExpression(expression.expression))
    )
  }

  function isSafeClassHeritage(statement) {
    return (statement.heritageClauses ?? []).every((clause) =>
      clause.types.every((type) => {
        return isSafeHeritageExpression(type.expression)
      })
    )
  }

  let candidate = value
  if (/^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?class\s/u.test(value) && !value.includes('{')) {
    candidate = `${value} {}`
  } else if (/^(?:export\s+)?(?:declare\s+)?interface\s/u.test(value) && !value.includes('{')) {
    candidate = `${value} {}`
  }

  const direct = parse(candidate)
  if (hasNoSyntaxErrors(direct) && direct.statements.length === 1) {
    const statement = direct.statements[0]
    if (ts.isInterfaceDeclaration(statement)) {
      return statement.members.every(isSafeTypeMember)
    }
    if (ts.isTypeAliasDeclaration(statement)) return true
    if (ts.isFunctionDeclaration(statement)) {
      return statement.body === undefined && hasSafeParameters(statement)
    }
    if (ts.isClassDeclaration(statement)) {
      return (
        statement.members.length === 0 &&
        isSafeClassHeritage(statement) &&
        !statement.modifiers?.some((modifier) => ts.isDecorator(modifier))
      )
    }
    if (ts.isVariableStatement(statement)) {
      return (
        statement.declarationList.declarations.length === 1 &&
        statement.declarationList.declarations.every(
          (declaration) =>
            ts.isIdentifier(declaration.name) && declaration.initializer === undefined
        )
      )
    }
  }

  const methodWrapper = parse(`interface GeneratedFragment { ${value} }`)
  if (
    hasNoSyntaxErrors(methodWrapper) &&
    methodWrapper.statements.length === 1 &&
    ts.isInterfaceDeclaration(methodWrapper.statements[0]) &&
    methodWrapper.statements[0].members.length === 1
  ) {
    const member = methodWrapper.statements[0].members[0]
    if (
      (ts.isMethodSignature(member) ||
        ts.isPropertySignature(member) ||
        ts.isCallSignatureDeclaration(member) ||
        ts.isConstructSignatureDeclaration(member) ||
        ts.isIndexSignatureDeclaration(member)) &&
      member.type !== undefined &&
      isSafeTypeMember(member)
    ) {
      return true
    }
  }

  const constructor = /^new\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(\([\s\S]*\))$/u.exec(
    value
  )
  if (constructor !== null) {
    const constructorWrapper = parse(
      `interface GeneratedFragment { new ${constructor[2]}: ${constructor[1]} }`
    )
    return (
      hasNoSyntaxErrors(constructorWrapper) &&
      constructorWrapper.statements.length === 1 &&
      ts.isInterfaceDeclaration(constructorWrapper.statements[0]) &&
      constructorWrapper.statements[0].members.length === 1 &&
      ts.isConstructSignatureDeclaration(
        constructorWrapper.statements[0].members[0]
      ) &&
      hasSafeParameters(constructorWrapper.statements[0].members[0])
    )
  }

  return false
}

function allowlistKey(path, line, reason) {
  return `${path}:${line}:${reason}`
}

function unusedManualFragmentDiagnostic(entry) {
  const match = /^(.*):(\d+):(.*)$/u.exec(entry)
  const path = match?.[1] ?? entry
  const line = Number(match?.[2] ?? 1)
  return diagnostic({
    code: 'unused-manual-fragment',
    path,
    line,
    message: `Manual fragment allowlist entry was not consumed: ${entry}`,
  })
}

function stringLiteralValue(node, ts) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }
  return null
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

function moduleDiagnostic(
  path,
  sourceFile,
  node,
  code,
  message,
  sourceLine = 1
) {
  const documentLine = sourceLine + lineOf(sourceFile, node) - 1
  return diagnostic({ code, path, line: documentLine, message })
}

function validateSpecifier({
  specifier,
  allowedPackages,
  path,
  sourceFile,
  node,
  sourceLine,
}) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return moduleDiagnostic(
      path,
      sourceFile,
      node,
      'relative-import',
      `Relative module specifier is not allowed: ${specifier}`,
      sourceLine
    )
  }
  if (specifier.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(specifier)) {
    return moduleDiagnostic(
      path,
      sourceFile,
      node,
      'absolute-import',
      `Absolute module specifier is not allowed: ${specifier}`,
      sourceLine
    )
  }
  if (/^file:/iu.test(specifier)) {
    return moduleDiagnostic(
      path,
      sourceFile,
      node,
      'file-import',
      `File URL module specifier is not allowed: ${specifier}`,
      sourceLine
    )
  }
  if (!allowedPackages.has(specifier)) {
    return moduleDiagnostic(
      path,
      sourceFile,
      node,
      'undeclared-package',
      `Module specifier is not in the public declaration manifest: ${specifier}`,
      sourceLine
    )
  }
  return null
}

function hasDeclareModifier(node, ts) {
  return node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword
  ) === true
}

function sourceContainsJsx(sourceFile, ts) {
  let found = false
  function visit(node) {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      found = true
      return
    }
    if (!found) ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function isContained(root, candidate) {
  const relation = relative(root, candidate)
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation))
}

function pathHasSymlink(root, candidate) {
  const relation = relative(root, candidate)
  if (relation === '' || relation.startsWith('..') || isAbsolute(relation)) return false
  let current = root
  for (const part of relation.split(sep)) {
    current = join(current, part)
    if (lstatSync(current).isSymbolicLink()) return true
  }
  return false
}

function describeDeclarationDiagnostic(item) {
  return `${item.specifier}: ${item.declaration} (${item.message ?? item.code})`
}

function declarationMapFrom(value) {
  if (value instanceof Map) return new Map(value)
  if (!Array.isArray(value)) return new Map()
  return new Map(
    value.map((entry) =>
      Array.isArray(entry)
        ? entry
        : [entry.specifier, entry.declaration]
    )
  )
}

function compilerSourcePath(result) {
  return (
    result.sourceDocumentPath ??
    result.sourcePath ??
    result.path ??
    result.snippetId ??
    '<snippet>'
  )
}

function compilerSourceLine(result, snippetLine = 1) {
  const sourceDocumentLine =
    result.sourceDocumentLine ?? result.sourceLine ?? result.line ?? 1
  return sourceDocumentLine + snippetLine - 1
}

function ownedTempRoot(path) {
  const resolved = resolve(path)
  if (!basename(resolved).startsWith(OWNED_TEMP_PREFIX)) {
    throw new Error(`Refusing to remove a non-owned temporary root: ${path}`)
  }
  return resolved
}

export function parseFenceMetadata(metadata) {
  const value = metadata.trim()
  const typecheck = /^(ts|tsx|typescript)\s+typecheck$/u.exec(value)
  if (typecheck !== null) {
    return {
      language: typecheck[1],
      classification: 'typecheck',
      reason: null,
    }
  }

  const fragment = /^(ts|tsx|typescript)\s+fragment="([^"]*)"$/u.exec(value)
  if (fragment !== null && fragment[2].trim().length > 0) {
    return {
      language: fragment[1],
      classification: 'fragment',
      reason: fragment[2],
    }
  }

  throw new Error(`Invalid typed fence metadata: ${metadata}`)
}

export function extractTypedFences({
  path,
  text,
  manualFragments = new Set(),
  generatedFragmentReason,
}) {
  const lines = normalizedLines(text)
  const snippets = []
  const fragments = []
  const diagnostics = []
  const consumedManualFragments = new Set()
  let typedFenceCount = 0

  for (let index = 0; index < lines.length; index += 1) {
    const opening = parseFenceOpening(lines[index])
    if (opening === null) continue

    const metadata = opening.metadata
    const language = typedFenceLanguage(metadata)
    let closeIndex = index + 1
    while (
      closeIndex < lines.length &&
      !isFenceClose(lines[closeIndex], opening)
    ) {
      closeIndex += 1
    }
    if (language === null) {
      if (closeIndex < lines.length) index = closeIndex
      continue
    }

    typedFenceCount += 1
    const line = index + 1
    if (closeIndex >= lines.length) {
      diagnostics.push(
        diagnostic({
          code: 'unclosed-fence',
          path,
          line,
          message: 'Typed code fence is not closed.',
        })
      )
      break
    }

    const source = lines.slice(index + 1, closeIndex).join('\n')
    let parsed
    try {
      parsed = parseFenceMetadata(metadata)
    } catch {
      diagnostics.push(
        diagnostic({
          code: metadata === language ? 'unclassified-fence' : 'malformed-fence-metadata',
          path,
          line,
          message:
            metadata === language
              ? 'Typed code fence must be classified as typecheck or fragment.'
              : `Malformed typed fence metadata: ${metadata}`,
        })
      )
      index = closeIndex
      continue
    }

    if (source.trim().length === 0) {
      diagnostics.push(
        diagnostic({
          code: 'empty-fence',
          path,
          line,
          message: 'Typed code fence must not be empty.',
        })
      )
      index = closeIndex
      continue
    }

    const item = {
      path,
      line,
      sourceLine: line + 1,
      language: parsed.language,
      source,
    }
    if (parsed.classification === 'typecheck') {
      snippets.push(item)
    } else {
      const reason = parsed.reason
      const key = allowlistKey(path, line, reason)
      const fragment = { ...item, reason }
      fragments.push(fragment)

      if (reason === generatedFragmentReason) {
        if (!isManagedApiPath(path)) {
          diagnostics.push(
            diagnostic({
              code: 'unauthorized-generated-fragment',
              path,
              line,
              message: 'Generated API fragment authority is restricted to managed core API pages.',
            })
          )
        } else if (!isGeneratedDeclaration(source)) {
          diagnostics.push(
            diagnostic({
              code: 'invalid-generated-fragment',
              path,
              line,
              message: 'Generated API fragment must contain only a declaration or signature.',
            })
          )
        }
      } else if (!manualFragments.has(key)) {
        diagnostics.push(
          diagnostic({
            code: 'unauthorized-manual-fragment',
            path,
            line,
            message: `Manual fragment is not allowlisted at its exact path and line: ${key}`,
          })
        )
      } else {
        consumedManualFragments.add(key)
      }
    }

    index = closeIndex
  }

  for (const entry of [...manualFragments].sort()) {
    if (entry.startsWith(`${path}:`) && !consumedManualFragments.has(entry)) {
      diagnostics.push(unusedManualFragmentDiagnostic(entry))
    }
  }

  return {
    snippets,
    fragments,
    typedFenceCount,
    diagnostics: sortSnippetDiagnostics(diagnostics),
    consumedManualFragments,
  }
}

export function reconcileManualFragmentAllowlist({
  manualFragments = new Set(),
  consumedManualFragments = new Set(),
}) {
  return sortSnippetDiagnostics(
    [...manualFragments]
      .filter((entry) => !consumedManualFragments.has(entry))
      .map(unusedManualFragmentDiagnostic)
  )
}

export function extractSourceExamples({ path, text }) {
  const lines = normalizedLines(text)
  const markdownLine = (line) => line.replace(/^\s*\* ?/u, '')
  const exampleLines = []
  for (let index = 0; index < lines.length; index += 1) {
    if (/@example\b/u.test(lines[index])) exampleLines.push(index)
  }

  const snippets = []
  const diagnostics = []
  for (let exampleIndex = 0; exampleIndex < exampleLines.length; exampleIndex += 1) {
    const start = exampleLines[exampleIndex]
    const nextExample = exampleLines[exampleIndex + 1] ?? lines.length
    let end = nextExample
    for (let index = start + 1; index < nextExample; index += 1) {
      if (/\*\//u.test(lines[index])) {
        end = index
        break
      }
    }

    const fences = []
    for (let index = start + 1; index < end; index += 1) {
      const opening = parseFenceOpening(markdownLine(lines[index]))
      if (opening === null) continue

      let close = index + 1
      while (
        close < end &&
        !isFenceClose(markdownLine(lines[close]), opening)
      ) {
        close += 1
      }
      fences.push({ index, opening, close: close < end ? close : null })
      if (close < end) index = close
    }

    if (fences.length !== 1) {
      diagnostics.push(
        diagnostic({
          code: 'unclassified-source-example',
          path,
          line: start + 1,
          message: 'Each @example must contain exactly one standalone typed typecheck fence.',
        })
      )
      continue
    }

    const fence = fences[0]
    let parsed
    try {
      parsed = parseFenceMetadata(fence.opening.metadata)
    } catch {
      parsed = null
    }
    if (parsed?.classification !== 'typecheck') {
      diagnostics.push(
        diagnostic({
          code: 'unclassified-source-example',
          path,
          line: fence.index + 1,
          message: 'Source @example fence must use an explicit typecheck classification.',
        })
      )
      continue
    }

    if (fence.close === null) {
      diagnostics.push(
        diagnostic({
          code: 'unclassified-source-example',
          path,
          line: fence.index + 1,
          message: 'Source @example typed fence is not closed.',
        })
      )
      continue
    }

    const source = lines
      .slice(fence.index + 1, fence.close)
      .map(markdownLine)
      .join('\n')
    if (source.trim().length === 0) {
      diagnostics.push(
        diagnostic({
          code: 'unclassified-source-example',
          path,
          line: fence.index + 1,
          message: 'Source @example typed fence must not be empty.',
        })
      )
      continue
    }

    snippets.push({
      path,
      line: fence.index + 1,
      sourceLine: fence.index + 2,
      language: parsed.language,
      source,
    })
  }

  return { snippets, diagnostics: sortSnippetDiagnostics(diagnostics) }
}

export function extractHomepageSnippet({ path, text, marker }) {
  const ts = loadTypeScript()
  const sourceFileName = '/glucoseiq-homepage-snippet.tsx'
  const sourceFile = ts.createSourceFile(
    sourceFileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

  function attributeValue(attribute) {
    const initializer = attribute.initializer
    if (initializer === undefined) return null
    if (ts.isStringLiteral(initializer)) return initializer.text
    if (
      ts.isJsxExpression(initializer) &&
      initializer.expression !== undefined &&
      ts.isStringLiteral(initializer.expression)
    ) {
      return initializer.expression.text
    }
    return null
  }

  const markedAttributes = []
  function findMarkers(node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sourceFile) === 'data-doc-snippet' &&
      attributeValue(node) === marker
    ) {
      markedAttributes.push(node)
    }
    ts.forEachChild(node, findMarkers)
  }
  findMarkers(sourceFile)

  if (markedAttributes.length !== 1) {
    return {
      snippet: null,
      diagnostics: [
        diagnostic({
          code: 'homepage-snippet-count',
          path,
          line: 1,
          message: `Expected exactly one visible homepage snippet marked ${marker}; found ${markedAttributes.length}.`,
        }),
      ],
    }
  }

  const markedAttribute = markedAttributes[0]
  const opening = markedAttribute.parent.parent
  const markedElement = ts.isJsxOpeningElement(opening) ? opening.parent : opening
  const line = lineOf(sourceFile, markedAttribute)
  const renderedIdentifiers = []
  function collectHighlightedSource(node) {
    const opening = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxElement(node)
        ? node.openingElement
        : null
    if (
      opening === null ||
      opening.tagName.getText(sourceFile) !== 'HighlightedCode'
    ) {
      return
    }
    const codeAttribute = opening.attributes.properties.find(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.name.getText(sourceFile) === 'code'
    )
    const initializer = codeAttribute?.initializer
    if (
      initializer !== undefined &&
      ts.isJsxExpression(initializer) &&
      initializer.expression !== undefined &&
      ts.isIdentifier(initializer.expression)
    ) {
      renderedIdentifiers.push(initializer.expression)
    }
  }

  function findRenderedIdentifier(node) {
    collectHighlightedSource(node)
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(sourceFile) === 'code'
    ) {
      for (const child of node.children) {
        if (
          ts.isJsxExpression(child) &&
          child.expression !== undefined &&
          ts.isIdentifier(child.expression)
        ) {
          renderedIdentifiers.push(child.expression)
        }
      }
      return
    }
    ts.forEachChild(node, findRenderedIdentifier)
  }
  findRenderedIdentifier(markedElement)

  function staticString(initializer) {
    let value = initializer
    while (
      ts.isParenthesizedExpression(value) ||
      ts.isAsExpression(value) ||
      ts.isSatisfiesExpression(value)
    ) {
      value = value.expression
    }
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
      return value.text
    }
    if (
      ts.isTaggedTemplateExpression(value) &&
      ts.isPropertyAccessExpression(value.tag) &&
      ts.isIdentifier(value.tag.expression) &&
      value.tag.expression.text === 'String' &&
      value.tag.name.text === 'raw' &&
      ts.isNoSubstitutionTemplateLiteral(value.template)
    ) {
      return value.template.rawText ?? value.template.text
    }
    return null
  }

  function resolveLexicalString(identifier) {
    const compilerHost = {
      fileExists(fileName) {
        return fileName === sourceFileName
      },
      readFile(fileName) {
        return fileName === sourceFileName ? text : undefined
      },
      getSourceFile(fileName) {
        return fileName === sourceFileName ? sourceFile : undefined
      },
      getDefaultLibFileName() {
        return '/lib.d.ts'
      },
      writeFile() {},
      getCurrentDirectory() {
        return '/'
      },
      getDirectories() {
        return []
      },
      getCanonicalFileName(fileName) {
        return fileName
      },
      useCaseSensitiveFileNames() {
        return true
      },
      getNewLine() {
        return '\n'
      },
    }
    const program = ts.createProgram(
      [sourceFileName],
      {
        jsx: ts.JsxEmit.Preserve,
        noLib: true,
        noResolve: true,
        target: ts.ScriptTarget.Latest,
      },
      compilerHost
    )
    const symbol = program.getTypeChecker().getSymbolAtLocation(identifier)
    const declaration = symbol?.valueDeclaration
    if (
      declaration === undefined ||
      !ts.isVariableDeclaration(declaration) ||
      declaration.initializer === undefined
    ) {
      return null
    }
    const source = staticString(declaration.initializer)
    if (source === null) return null
    return {
      source,
      sourceLine: lineOf(sourceFile, declaration.initializer),
    }
  }

  const resolvedSource =
    renderedIdentifiers.length === 1
      ? resolveLexicalString(renderedIdentifiers[0])
      : null

  if (resolvedSource === null) {
    return {
      snippet: null,
      diagnostics: [
        diagnostic({
          code: 'homepage-snippet-source',
          path,
          line,
          message: 'The marked homepage sample must render one static string variable through the visible code block.',
        }),
      ],
    }
  }

  return {
    snippet: {
      path,
      line,
      sourceLine: resolvedSource.sourceLine,
      language: 'ts',
      source: resolvedSource.source,
    },
    diagnostics: [],
  }
}

export function analyzeSnippetSource({
  path,
  source,
  sourceLine = 1,
  allowedPackages = new Set(),
}) {
  const ts = loadTypeScript()
  const scriptKind = /\.tsx$/u.test(path) || /<\/?[A-Za-z][^>]*>/u.test(source)
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  )
  const specifiers = new Set()
  const imports = []
  const calls = []
  const diagnostics = []

  function addModule(node, moduleNode) {
    const specifier = stringLiteralValue(moduleNode, ts)
    if (specifier === null) {
      diagnostics.push(
        moduleDiagnostic(
          path,
          sourceFile,
          moduleNode,
          'nonliteral-module-specifier',
          'Module specifiers must be string literals.',
          sourceLine
        )
      )
      return null
    }
    specifiers.add(specifier)
    const invalid = validateSpecifier({
      specifier,
      allowedPackages,
      path,
      sourceFile,
      node: moduleNode,
      sourceLine,
    })
    if (invalid !== null) diagnostics.push(invalid)
    return specifier
  }

  function recordImports(node, specifier) {
    const clause = node.importClause
    if (clause === undefined) return
    if (clause.name !== undefined) {
      imports.push({
        specifier,
        imported: 'default',
        local: clause.name.text,
        typeOnly: clause.isTypeOnly,
      })
    }
    const bindings = clause.namedBindings
    if (bindings === undefined) return
    if (ts.isNamespaceImport(bindings)) {
      imports.push({
        specifier,
        imported: '*',
        local: bindings.name.text,
        typeOnly: clause.isTypeOnly,
      })
      return
    }
    for (const element of bindings.elements) {
      imports.push({
        specifier,
        imported: (element.propertyName ?? element.name).text,
        local: element.name.text,
        typeOnly: clause.isTypeOnly || element.isTypeOnly,
      })
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const specifier = addModule(node, node.moduleSpecifier)
      if (specifier !== null) recordImports(node, specifier)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      addModule(node, node.moduleSpecifier)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const expression = node.moduleReference.expression
      if (expression !== undefined) {
        const specifier = addModule(node, expression)
        if (specifier !== null) {
          imports.push({
            specifier,
            imported: 'export=',
            local: node.name.text,
            typeOnly: node.isTypeOnly,
          })
        }
      }
    } else if (ts.isImportTypeNode(node)) {
      const moduleNode = ts.isLiteralTypeNode(node.argument)
        ? node.argument.literal
        : node.argument
      addModule(node, moduleNode)
    } else if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')
      ) {
        const argument = node.arguments[0]
        if (argument === undefined || stringLiteralValue(argument, ts) === null) {
          diagnostics.push(
            moduleDiagnostic(
              path,
              sourceFile,
              argument ?? node,
              'nonliteral-module-specifier',
              'Dynamic import and require specifiers must be string literals.',
              sourceLine
            )
          )
        } else {
          addModule(node, argument)
        }
      } else if (ts.isIdentifier(node.expression)) {
        calls.push(node.expression.text)
      }
    }

    const ambientModule =
      ts.isModuleDeclaration(node) &&
      (hasDeclareModifier(node, ts) ||
        node.flags & ts.NodeFlags.GlobalAugmentation ||
        node.name.kind === ts.SyntaxKind.GlobalKeyword)
    if (hasDeclareModifier(node, ts) || ambientModule) {
      diagnostics.push(
        moduleDiagnostic(
          path,
          sourceFile,
          node,
          'ambient-declaration',
          'Ambient declarations are not allowed in public examples.',
          sourceLine
        )
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    scriptKind === ts.ScriptKind.TSX ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source
  )
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue
    }
    const comment = scanner.getTokenText()
    const position = scanner.getTokenPos()
    const commentNode = {
      getStart() {
        return position
      },
    }
    if (/@ts-(?:ignore|expect-error|nocheck)\b/u.test(comment)) {
      diagnostics.push(
        moduleDiagnostic(
          path,
          sourceFile,
          commentNode,
          'suppression-directive',
          'TypeScript suppression directives are not allowed in public examples.',
          sourceLine
        )
      )
    }
    if (/^\/\/\/\s*<[A-Za-z]/u.test(comment)) {
      diagnostics.push(
        moduleDiagnostic(
          path,
          sourceFile,
          commentNode,
          'triple-slash-reference',
          'Triple-slash references are not allowed in public examples.',
          sourceLine
        )
      )
    }
  }

  const uniqueDiagnostics = []
  const seenDiagnostics = new Set()
  for (const item of sortSnippetDiagnostics(diagnostics)) {
    const key = [item.sourcePath, item.sourceLine, item.code, item.message].join('\0')
    if (!seenDiagnostics.has(key)) {
      seenDiagnostics.add(key)
      uniqueDiagnostics.push(item)
    }
  }

  const sortedSpecifiers = [...specifiers].sort()
  return {
    specifiers: sortedSpecifiers,
    imports,
    calls,
    usesReact:
      sourceContainsJsx(sourceFile, ts) ||
      sortedSpecifiers.some((specifier) => REACT_SPECIFIERS.has(specifier)),
    diagnostics: uniqueDiagnostics,
  }
}

export function deriveDeclarationManifest({ repoRoot, packages }) {
  const entries = []
  for (const packageEntry of packages) {
    const packageRoot = resolve(repoRoot, packageEntry.root)
    const packageName = packageEntry.manifest?.name
    if (typeof packageName !== 'string' || packageName.length === 0) {
      throw new Error(`Public package at ${packageEntry.root} is missing its name.`)
    }
    const exportsMap = packageEntry.manifest?.exports
    if (exportsMap === null || typeof exportsMap !== 'object' || Array.isArray(exportsMap)) {
      throw new Error(`${packageName} must expose an exports map.`)
    }

    for (const [subpath, contract] of Object.entries(exportsMap)) {
      if (subpath === './package.json') continue
      if (contract === null || typeof contract !== 'object' || Array.isArray(contract)) continue
      const declaration = contract.import?.types
      if (typeof declaration !== 'string') {
        throw new Error(`${packageName} export ${subpath} is missing import.types.`)
      }
      if (!declaration.endsWith('.d.mts')) {
        throw new Error(`${packageName} export ${subpath} import types must use .d.mts.`)
      }
      const specifier =
        subpath === '.'
          ? packageName
          : `${packageName}/${subpath.replace(/^\.\//u, '')}`
      entries.push({
        specifier,
        packageRoot,
        declaration: resolve(packageRoot, declaration),
      })
    }
  }
  return entries.sort((left, right) => left.specifier.localeCompare(right.specifier))
}

export function validateDeclarationManifest(entries) {
  const diagnostics = []
  for (const entry of entries) {
    const { specifier, packageRoot, declaration } = entry
    if (!existsSync(declaration)) {
      diagnostics.push({
        code: 'missing-declaration',
        specifier,
        declaration,
        message: 'declaration does not exist',
      })
      continue
    }

    const declarationStat = lstatSync(declaration)
    if (declarationStat.isSymbolicLink()) {
      diagnostics.push({
        code: 'symlink-declaration',
        specifier,
        declaration,
        message: 'declaration must not be a symlink',
      })
      continue
    }
    if (!declarationStat.isFile()) {
      diagnostics.push({
        code: 'non-regular-declaration',
        specifier,
        declaration,
        message: 'declaration must be a regular file',
      })
      continue
    }

    const lexicalRoot = resolve(packageRoot)
    const lexicalDeclaration = resolve(declaration)
    let escaped = !isContained(lexicalRoot, lexicalDeclaration)
    if (!escaped) {
      const realRoot = realpathSync(lexicalRoot)
      const realDeclaration = realpathSync(lexicalDeclaration)
      escaped = !isContained(realRoot, realDeclaration)
    }
    if (escaped) {
      diagnostics.push({
        code: 'declaration-escape',
        specifier,
        declaration,
        message: 'declaration escapes its package root',
      })
    }
  }
  return diagnostics
}

export function formatDeclarationPrerequisite(diagnostics) {
  const body = diagnostics.map(describeDeclarationDiagnostic).join('\n')
  return `Build the public package declarations before checking documentation snippets (run pnpm build).\n${body}`
}

export function sortSnippetDiagnostics(diagnostics) {
  function compareNumber(left, right) {
    return Number(left ?? 0) - Number(right ?? 0)
  }
  return [...diagnostics].sort((left, right) => {
    const leftPath = left.sourcePath ?? left.path ?? ''
    const rightPath = right.sourcePath ?? right.path ?? ''
    return (
      leftPath.localeCompare(rightPath) ||
      compareNumber(left.sourceLine ?? left.line, right.sourceLine ?? right.line) ||
      String(left.reactMajor ?? '').localeCompare(String(right.reactMajor ?? '')) ||
      compareNumber(left.line, right.line) ||
      compareNumber(left.column, right.column) ||
      String(left.code).localeCompare(String(right.code)) ||
      String(left.message ?? '').localeCompare(String(right.message ?? ''))
    )
  })
}

export function formatSnippetDiagnostics(diagnostics) {
  return sortSnippetDiagnostics(diagnostics)
    .map((item) => {
      const path = item.sourcePath ?? item.path ?? '<snippet>'
      const sourceLine = item.sourceLine ?? item.line ?? 1
      const compilerLocation =
        item.line !== undefined && item.line !== sourceLine
          ? ` (snippet ${item.line}:${item.column ?? 1})`
          : ''
      const react = item.reactMajor === null || item.reactMajor === undefined
        ? ''
        : ` React ${item.reactMajor}`
      const code = typeof item.code === 'number' ? ` TS${item.code}` : ` ${item.code}`
      return `${path}:${sourceLine}${react}${code}${compilerLocation}: ${item.message}`
    })
    .join('\n')
}

export async function runFourWorkerPool(jobs, worker) {
  const results = new Array(jobs.length)
  let next = 0
  let failed = false
  let failure
  const workerCount = Math.min(4, jobs.length)

  async function run() {
    while (true) {
      if (failed) return
      const index = next
      next += 1
      if (index >= jobs.length) return
      try {
        results[index] = await worker(jobs[index], index)
      } catch (error) {
        if (!failed) {
          failed = true
          failure = error
        }
        return
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => run()))
  if (failed) throw failure
  return results
}

export function resolveRepositoryRoot(
  start = MODULE_REPOSITORY_ROOT,
  {
    parent = dirname,
    isRepository = (path) =>
      existsSync(join(path, '.git')) && existsSync(join(path, 'pnpm-workspace.yaml')),
  } = {}
) {
  let current = resolve(start)
  while (true) {
    if (isRepository(current)) return current
    const next = parent(current)
    if (next === current) {
      throw new Error(`Unable to find the repository root from ${start}.`)
    }
    current = next
  }
}

export function assertOwnedTempPath(tempRoot, candidate) {
  const root = resolve(tempRoot)
  const path = resolve(candidate)
  if (!basename(root).startsWith(OWNED_TEMP_PREFIX)) {
    throw new Error(`Temporary root is not an owned temporary directory: ${tempRoot}`)
  }
  if (path === root || !isContained(root, path)) {
    throw new Error(`Path is outside the owned temporary root: ${candidate}`)
  }
  return true
}

export async function executeCompilerJob(
  { tscPath, configPath },
  {
    execute = ({ file, args, options }) => execFileAsync(file, args, options),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  } = {}
) {
  const spec = {
    file: process.execPath,
    args: [tscPath, '--project', configPath],
    options: {
      cwd: dirname(configPath),
      encoding: 'utf8',
      shell: false,
      timeout: timeoutMs,
      maxBuffer: maxOutputBytes,
    },
  }

  try {
    const result = await execute(spec)
    return {
      code: result.code ?? 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  } catch (error) {
    if (error?.code === 'ETIMEDOUT' || error?.killed === true) {
      throw new Error(`TypeScript compiler timed out after ${timeoutMs}ms.`, {
        cause: error,
      })
    }
    if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      throw new Error(
        `TypeScript compiler exceeded the output limit of ${maxOutputBytes} bytes.`,
        { cause: error }
      )
    }
    if (typeof error?.code === 'number') {
      return {
        code: error.code,
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
      }
    }
    throw error
  }
}

export function resolveDocsToolchain({
  docsManifestPath,
  resolvePackage,
  readJson = (path) => JSON.parse(readFileSync(path, 'utf8')),
}) {
  const requireFromDocs = createRequire(docsManifestPath)
  const resolveManifest =
    resolvePackage ?? ((name) => requireFromDocs.resolve(`${name}/package.json`))

  const typescriptManifestPath = resolveManifest('typescript')
  const react18ManifestPath = resolveManifest('react-types-18')
  const react19ManifestPath = resolveManifest('react-types-19')
  const typescriptRoot = dirname(typescriptManifestPath)
  const react18Root = dirname(react18ManifestPath)
  const react19Root = dirname(react19ManifestPath)

  const typescriptManifest = readJson(typescriptManifestPath)
  const react18Manifest = readJson(react18ManifestPath)
  const react19Manifest = readJson(react19ManifestPath)
  if (typescriptManifest.version !== '5.9.3') {
    throw new Error(
      `Documentation snippets require TypeScript 5.9.3; resolved ${typescriptManifest.version}.`
    )
  }
  if (react18Manifest.version !== '18.3.31') {
    throw new Error(
      `React 18 declarations must be exactly 18.3.31; resolved ${react18Manifest.version}.`
    )
  }
  if (react19Manifest.version !== '19.2.18') {
    throw new Error(
      `React 19 declarations must be exactly 19.2.18; resolved ${react19Manifest.version}.`
    )
  }
  if (realpathSync(react18Root) === realpathSync(react19Root)) {
    throw new Error('React 18 and React 19 must resolve from distinct React type roots.')
  }

  function regularContainedFile(root, path, label) {
    if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
    if (pathHasSymlink(root, path)) {
      throw new Error(`${label} must be a regular, contained file and not a symlink: ${path}`)
    }
    if (!statSync(path).isFile()) {
      throw new Error(`${label} must be a regular, contained file: ${path}`)
    }
    if (!isContained(realpathSync(root), realpathSync(path))) {
      throw new Error(`${label} must be a regular, contained file: ${path}`)
    }
    return path
  }

  const tscPath = regularContainedFile(
    typescriptRoot,
    join(typescriptRoot, 'bin/tsc'),
    'TypeScript compiler'
  )
  function reactContract(root, version, label) {
    return {
      version,
      root,
      index: regularContainedFile(root, join(root, 'index.d.ts'), `${label} index`),
      jsxRuntime: regularContainedFile(
        root,
        join(root, 'jsx-runtime.d.ts'),
        `${label} jsx-runtime`
      ),
      jsxDevRuntime: regularContainedFile(
        root,
        join(root, 'jsx-dev-runtime.d.ts'),
        `${label} jsx-dev-runtime`
      ),
    }
  }

  return {
    typescriptVersion: typescriptManifest.version,
    tscPath,
    react18: reactContract(react18Root, react18Manifest.version, 'React 18'),
    react19: reactContract(react19Root, react19Manifest.version, 'React 19'),
  }
}

export function planSnippetCompilations({ snippets, reactVariants = ['18', '19'] }) {
  const jobs = []
  for (const snippet of snippets) {
    const dependsOnReact =
      snippet.usesReact === true ||
      snippet.language === 'tsx' ||
      /(?:from\s*|import\s*\(|require\s*\()\s*["'](?:react(?:\/[^"']+)?|@glucoseiq\/react)["']/u.test(
        snippet.source ?? ''
      )
    const variants = dependsOnReact ? reactVariants : [null]
    for (const reactMajor of variants) {
      const sourceDocumentPath =
        snippet.sourceDocumentPath ??
        snippet.path ??
        snippet.sourcePath ??
        snippet.id
      const sourceDocumentLine =
        snippet.sourceDocumentLine ?? snippet.sourceLine ?? snippet.line ?? 1
      jobs.push({
        ...snippet,
        ordinal: jobs.length,
        snippetId: snippet.id,
        sourcePath: sourceDocumentPath,
        sourceLine: sourceDocumentLine,
        sourceDocumentPath,
        sourceDocumentLine,
        reactMajor,
      })
    }
  }
  return jobs
}

export function createCompilerProject({
  job,
  tempRoot,
  declarations = new Map(),
  reactTypes = {},
}) {
  const directory = join(tempRoot, String(job.ordinal).padStart(4, '0'))
  if (directory === resolve(tempRoot) || !isContained(resolve(tempRoot), resolve(directory))) {
    throw new Error(`Compiler project escapes its temporary root: ${directory}`)
  }
  const extension = job.language === 'tsx' ? 'tsx' : 'ts'
  const sourcePath = join(directory, `index.${extension}`)
  const configPath = join(directory, 'tsconfig.json')
  const sourceDocumentPath =
    job.sourceDocumentPath ?? job.sourcePath ?? job.path ?? job.snippetId
  const sourceDocumentLine =
    job.sourceDocumentLine ?? job.sourceLine ?? job.line ?? 1
  const paths = Object.fromEntries(
    [...declarationMapFrom(declarations)].map(([specifier, declaration]) => [
      specifier,
      Array.isArray(declaration) ? declaration : [declaration],
    ])
  )

  if (job.reactMajor !== null && job.reactMajor !== undefined) {
    const react = reactTypes[job.reactMajor]
    if (react === undefined) {
      throw new Error(`Missing React ${job.reactMajor} declaration mapping.`)
    }
    paths.react = [react.index ?? join(react.root, 'index.d.ts')]
    paths['react/jsx-runtime'] = [
      react.jsxRuntime ?? join(react.root, 'jsx-runtime.d.ts'),
    ]
    paths['react/jsx-dev-runtime'] = [
      react.jsxDevRuntime ?? join(react.root, 'jsx-dev-runtime.d.ts'),
    ]
  }

  const config = {
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      jsx: 'react-jsx',
      noEmit: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: false,
      types: [],
      baseUrl: '.',
      paths,
    },
    include: [`index.${extension}`],
  }
  return {
    ...job,
    directory,
    sourcePath,
    sourceDocumentPath,
    sourceDocumentLine,
    configPath,
    source: job.source,
    config,
  }
}

export function collectCompilerDiagnostics(results) {
  const diagnostics = []
  const pattern = /(?:^|\n).*?\((\d+),(\d+)\):\s*error\s+TS(\d+):\s*([^\n]+)/gu
  for (const result of results) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    let parsed = 0
    for (const match of output.matchAll(pattern)) {
      parsed += 1
      const snippetLine = Number(match[1])
      diagnostics.push({
        sourcePath: compilerSourcePath(result),
        sourceLine: compilerSourceLine(result, snippetLine),
        reactMajor: result.reactMajor ?? null,
        line: snippetLine,
        column: Number(match[2]),
        code: Number(match[3]),
        message: match[4].trim(),
      })
    }
    if ((result.code ?? 0) !== 0 && parsed === 0) {
      diagnostics.push({
        sourcePath: compilerSourcePath(result),
        sourceLine: compilerSourceLine(result),
        reactMajor: result.reactMajor ?? null,
        line: 1,
        column: 1,
        code: 'compiler-exit',
        message: `TypeScript compiler exited with code ${result.code} without a diagnostic.`,
      })
    }
  }

  const unique = []
  const seen = new Set()
  for (const item of sortSnippetDiagnostics(diagnostics)) {
    const key = [
      item.sourcePath,
      item.sourceLine,
      item.reactMajor,
      item.line,
      item.column,
      item.code,
      item.message,
    ].join('\0')
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }
  return unique
}

export async function compileSnippets({
  snippets = [],
  declarationEntries,
  declarations = declarationEntries,
  declarationDiagnostics =
    declarationEntries === undefined
      ? []
      : validateDeclarationManifest(declarationEntries),
  toolchain,
  reactVariants = ['18', '19'],
  createTempRoot = () => mkdtempSync(join(tmpdir(), OWNED_TEMP_PREFIX)),
  removeTempRoot,
  compileJob,
  execute,
}) {
  if (declarationDiagnostics.length > 0) {
    throw new Error(formatDeclarationPrerequisite(declarationDiagnostics))
  }

  const jobs = planSnippetCompilations({ snippets, reactVariants })
  const tempRoot = createTempRoot()
  if (typeof tempRoot !== 'string') {
    throw new Error('Temporary root creation did not return a path.')
  }
  ownedTempRoot(tempRoot)

  const cleanup =
    removeTempRoot ??
    ((path) => {
      rmSync(ownedTempRoot(path), { recursive: true, force: true })
    })

  try {
    if (compileJob !== undefined) {
      const results = await runFourWorkerPool(jobs, compileJob)
      return collectCompilerDiagnostics(
        results.map((result, index) => ({ ...jobs[index], ...result }))
      )
    }

    if (toolchain === undefined) {
      throw new Error('The documentation compiler toolchain is required.')
    }
    const declarationMap = declarationMapFrom(declarations)
    const reactTypes = { 18: toolchain.react18, 19: toolchain.react19 }
    const projects = jobs.map((job) =>
      createCompilerProject({
        job,
        tempRoot,
        declarations: declarationMap,
        reactTypes,
      })
    )
    for (const project of projects) {
      mkdirSync(project.directory)
      writeFileSync(project.sourcePath, project.source)
      writeFileSync(project.configPath, `${JSON.stringify(project.config)}\n`)
    }
    const results = await runFourWorkerPool(projects, async (project) => ({
      ...project,
      ...(await executeCompilerJob(
        { tscPath: toolchain.tscPath, configPath: project.configPath },
        { execute }
      )),
    }))
    return collectCompilerDiagnostics(results)
  } finally {
    cleanup(tempRoot)
  }
}
