import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'

import {
  DEFAULT_BUDGET_BYTES,
  measureCoreBundle,
  runCoreBundleCli,
} from './measure-core-bundle.mjs'

const fixtureRoots = new Set()

function createFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'glucoseiq-core-size-'))
  fixtureRoots.add(root)
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(root, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents)
  }
  return root
}

test.afterEach(() => {
  for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true })
  fixtureRoots.clear()
})

test('walks each reachable static .mjs module once in deterministic order', () => {
  const root = createFixture({
    'index.mjs': [
      "import 'node:fs'",
      "import'./a.mjs'",
      "import attributes from './attributes.mjs' with { type: 'json' }",
      "export { b } from './b.mjs'",
      "export * from './shared.mjs'",
      "const fakeString = \"import './fake-string.mjs'\"",
      "const fakeTemplate = `export * from './fake-template.mjs' ${`import './nested-fake.mjs'`}`",
      "const fakeRegex = /import\\s+['\"]\\.\\/fake-regex\\.mjs/",
      "void import('./fake-dynamic.mjs')",
      "/* import './fake-block-comment.mjs' */",
      "// export * from './fake-line-comment.mjs'",
      'void { fakeString, fakeTemplate, fakeRegex }',
    ].join('\n'),
    'a.mjs': "import { shared } from './shared.mjs'; export const a = shared",
    'attributes.mjs': 'export default { enabled: true }',
    'b.mjs': "export * as cycle from './cycle.mjs'; export const b = true",
    'shared.mjs': "import './cycle.mjs'; export const shared = true",
    'cycle.mjs': "import './a.mjs'; export const cycle = true",
    'unreachable.mjs': "import './missing-from-unreachable.mjs'",
    'index.mjs.map': '{"version":3}',
    'types.d.mts': 'export interface NotRuntime {}',
  })

  const first = measureCoreBundle({
    root,
    entry: 'index.mjs',
    budget: Number.MAX_SAFE_INTEGER,
  })
  const second = measureCoreBundle({
    root,
    entry: 'index.mjs',
    budget: Number.MAX_SAFE_INTEGER,
  })

  assert.deepEqual(first.files, [
    'a.mjs',
    'attributes.mjs',
    'b.mjs',
    'cycle.mjs',
    'index.mjs',
    'shared.mjs',
  ])
  assert.equal(new Set(first.files).size, first.files.length)
  const expectedPayload = Buffer.concat(
    first.files.flatMap((file) => [readFileSync(join(root, file)), Buffer.from('\n')]),
  )
  assert.equal(first.gzipBytes, gzipSync(expectedPayload).byteLength)
  assert.equal(first.gzipBytes, second.gzipBytes)
  assert.deepEqual(first.files, second.files)
})

test('rejects a relative static edge that is not an .mjs production module', () => {
  const root = createFixture({
    'index.mjs': "import './runtime.js'",
    'runtime.js': 'export const runtime = true',
  })

  assert.throws(
    () =>
      measureCoreBundle({
        root,
        entry: 'index.mjs',
        budget: Number.MAX_SAFE_INTEGER,
      }),
    /relative static module specifier must target an \.mjs file/,
  )
})

test('rejects lexical imports that escape the selected root', () => {
  const parent = createFixture({
    'dist/index.mjs': "import '../outside.mjs'",
    'outside.mjs': 'export const outside = true',
  })

  assert.throws(
    () =>
      measureCoreBundle({
        root: join(parent, 'dist'),
        entry: 'index.mjs',
        budget: Number.MAX_SAFE_INTEGER,
      }),
    /escapes the selected ESM root/,
  )
})

test('rejects symlink imports whose real path escapes the selected root', () => {
  const parent = createFixture({
    'dist/index.mjs': "import './escape.mjs'",
    'outside.mjs': 'export const outside = true',
  })
  symlinkSync(join(parent, 'outside.mjs'), join(parent, 'dist/escape.mjs'))

  assert.throws(
    () =>
      measureCoreBundle({
        root: join(parent, 'dist'),
        entry: 'index.mjs',
        budget: Number.MAX_SAFE_INTEGER,
      }),
    /real path escapes the selected ESM root/,
  )
})

test('accepts a selected root reached through a directory symlink', () => {
  const parent = createFixture({
    'dist/index.mjs': "import './feature.mjs'",
    'dist/feature.mjs': 'export const feature = true',
  })
  symlinkSync(join(parent, 'dist'), join(parent, 'dist-alias'), 'dir')

  const result = measureCoreBundle({
    root: join(parent, 'dist-alias'),
    entry: 'index.mjs',
    budget: Number.MAX_SAFE_INTEGER,
  })

  assert.deepEqual(result.files, ['feature.mjs', 'index.mjs'])
})

test('rejects an entry symlink whose real path escapes the selected root', () => {
  const parent = createFixture({
    'dist/placeholder.mjs': 'export const placeholder = true',
    'outside.mjs': 'export const outside = true',
  })
  symlinkSync(join(parent, 'outside.mjs'), join(parent, 'dist/index.mjs'))

  assert.throws(
    () =>
      measureCoreBundle({
        root: join(parent, 'dist'),
        entry: 'index.mjs',
        budget: Number.MAX_SAFE_INTEGER,
      }),
    /entry real path escapes the selected ESM root/,
  )
})

test('enforces the injected gzip budget at the exact byte boundary', () => {
  const root = createFixture({
    'entry.mjs': 'export const payload = "glucose-intelligence".repeat(40)',
  })
  const unbounded = measureCoreBundle({
    root,
    entry: 'entry.mjs',
    budget: Number.MAX_SAFE_INTEGER,
  })

  assert.equal(DEFAULT_BUDGET_BYTES, 20_000)
  assert.doesNotThrow(() =>
    measureCoreBundle({
      root,
      entry: 'entry.mjs',
      budget: unbounded.gzipBytes,
    }),
  )
  assert.throws(
    () =>
      measureCoreBundle({
        root,
        entry: 'entry.mjs',
        budget: unbounded.gzipBytes - 1,
      }),
    new RegExp(
      `reachable core ESM is ${unbounded.gzipBytes} gzip bytes, exceeding the ${unbounded.gzipBytes - 1}-byte budget`,
    ),
  )
})

test('CLI output prints the relative inventory and measured byte total', () => {
  const root = createFixture({
    'entry.mjs': "import './feature.mjs'; export const entry = true",
    'feature.mjs': 'export const feature = true',
  })
  const lines = []

  const result = runCoreBundleCli({
    root,
    entry: 'entry.mjs',
    budget: Number.MAX_SAFE_INTEGER,
    write: (line) => lines.push(line),
  })

  assert.deepEqual(lines, [
    'Reachable core ESM files:',
    'entry.mjs',
    'feature.mjs',
    `Gzip bytes: ${result.gzipBytes}`,
    `Budget bytes: ${Number.MAX_SAFE_INTEGER}`,
  ])
})

test('CLI prints its complete report before rejecting an exceeded budget', () => {
  const root = createFixture({
    'index.mjs': 'export const payload = "budget-report"',
  })
  const lines = []

  assert.throws(
    () =>
      runCoreBundleCli({
        root,
        entry: 'index.mjs',
        budget: 0,
        write: (line) => lines.push(line),
      }),
    /exceeding the 0-byte budget/,
  )
  assert.deepEqual(lines.slice(0, 2), ['Reachable core ESM files:', 'index.mjs'])
  assert.match(lines[2], /^Gzip bytes: [1-9]\d*$/u)
  assert.equal(lines[3], 'Budget bytes: 0')
})
