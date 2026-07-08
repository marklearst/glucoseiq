import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  escapeMdx,
  formatSignature,
  renderApiModel,
  renderCommentParts,
  renderType,
  sourceImportPath,
} from './lib/api-renderer.mjs'
import * as apiGenerator from './generate-api.mjs'
import * as apiCheck from './check-api.mjs'

const {
  assertSpawnResult,
  generateApiReference,
  resolveTypeDocBinary,
  runTypeDoc,
} = apiGenerator
const { checkApiDrift, compareManagedTrees, inventoryRegularFiles } = apiCheck

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = join(SCRIPT_DIR, '..')
const REPO_ROOT = join(DOCS_DIR, '../..')

const MANAGED_CORE_MDX_SLUGS = Object.freeze([
  'agp',
  'cohort',
  'connectors',
  'constants',
  'conversions',
  'episodes',
  'errors',
  'glucose',
  'ingestion',
  'interop',
  'live',
  'meals',
  'render',
  'reports',
  'score',
  'series',
  'time-in-range',
  'types',
  'variability',
])

const KIND = {
  project: 1,
  variable: 32,
  function: 64,
  class: 128,
  interface: 256,
  constructor: 512,
  property: 1024,
  method: 2048,
  callSignature: 4096,
  indexSignature: 8192,
  constructorSignature: 16384,
  parameter: 32768,
  typeLiteral: 65536,
  typeParameter: 131072,
  accessor: 262144,
  getSignature: 524288,
  setSignature: 1048576,
  typeAlias: 2097152,
}

let fixtureId = 10_000
const nextFixtureId = () => fixtureId++

function withTempDir(run) {
  const root = mkdtempSync(join(tmpdir(), `glucoseiq-api-test-${process.pid}-`))
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function text(value) {
  return { kind: 'text', text: value }
}

function code(value) {
  return { kind: 'code', text: value }
}

function parameter(name, type, options = {}) {
  return {
    id: options.id ?? nextFixtureId(),
    name,
    variant: 'param',
    kind: KIND.parameter,
    flags: options.flags ?? {},
    type,
    ...(options.defaultValue === undefined
      ? {}
      : { defaultValue: options.defaultValue }),
    ...(options.comment ? { comment: options.comment } : {}),
  }
}

function signature(name, options = {}) {
  return {
    id: options.id ?? nextFixtureId(),
    name,
    variant: 'signature',
    kind: options.kind ?? KIND.callSignature,
    flags: options.flags ?? {},
    parameters: options.parameters ?? [],
    typeParameters: options.typeParameters ?? [],
    type: options.type ?? { type: 'intrinsic', name: 'void' },
    ...(options.comment ? { comment: options.comment } : {}),
  }
}

function declaration(kind, name, options = {}) {
  return {
    id: options.id ?? nextFixtureId(),
    name,
    variant: 'declaration',
    kind,
    flags: options.flags ?? {},
    ...(options.sources ? { sources: options.sources } : {}),
    ...(options.type ? { type: options.type } : {}),
    ...(options.signatures ? { signatures: options.signatures } : {}),
    ...(options.indexSignatures ? { indexSignatures: options.indexSignatures } : {}),
    ...(options.getSignature ? { getSignature: options.getSignature } : {}),
    ...(options.setSignature ? { setSignature: options.setSignature } : {}),
    ...(options.children ? { children: options.children } : {}),
    ...(options.typeParameters ? { typeParameters: options.typeParameters } : {}),
    ...(options.extendedTypes ? { extendedTypes: options.extendedTypes } : {}),
    ...(options.implementedTypes ? { implementedTypes: options.implementedTypes } : {}),
    ...(options.defaultValue === undefined
      ? {}
      : { defaultValue: options.defaultValue }),
    ...(options.comment ? { comment: options.comment } : {}),
  }
}

function project(children = [], options = {}) {
  return {
    id: 0,
    name: options.name ?? '@glucoseiq/core',
    variant: 'project',
    kind: KIND.project,
    flags: {},
    schemaVersion: options.schemaVersion ?? '2.0',
    children,
  }
}

const intrinsic = (name) => ({ type: 'intrinsic', name })
const reference = (name, typeArguments) => ({
  type: 'reference',
  name,
  target: -1,
  ...(typeArguments ? { typeArguments } : {}),
})

function parseGeneratedFrontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(source)
  assert.ok(match, 'generated MDX must begin with frontmatter')
  const result = {}
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':')
    assert.ok(separator > 0, `invalid frontmatter line: ${line}`)
    result[line.slice(0, separator)] = JSON.parse(line.slice(separator + 1).trim())
  }
  return result
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function countNumericInlineTagTargets(value) {
  if (!value || typeof value !== 'object') return 0
  const current = value.kind === 'inline-tag' && typeof value.target === 'number' ? 1 : 0
  return current + Object.values(value)
    .reduce((count, child) => count + countNumericInlineTagTargets(child), 0)
}

function snapshotRegularTree(root) {
  return new Map(
    inventoryRegularFiles(root).map((path) => [
      path,
      readFileSync(join(root, ...path.split('/'))).toString('hex'),
    ]),
  )
}

test('renders every TypeDoc 0.28.20 type node deliberately', () => {
  const cases = [
    [intrinsic('string'), 'string'],
    [{ type: 'literal', value: 'mg/dL' }, "'mg/dL'"],
    [{ type: 'literal', value: 42 }, '42'],
    [{ type: 'literal', value: null }, 'null'],
    [{ type: 'literal', value: { value: '42', negative: false } }, '42n'],
    [{ type: 'literal', value: { value: '42', negative: true } }, '-42n'],
    [{ type: 'literal', value: "line\n'quote'\t" }, "'line\\n\\'quote\\'\\t'"],
    [
      { type: 'literal', value: 'backslash\\"double\u0000\b\v\f\r\u2028\u2029' },
      "'backslash\\\\\"double\\x00\\b\\v\\f\\r\\u2028\\u2029'",
    ],
    [reference('Promise', [intrinsic('string')]), 'Promise<string>'],
    [
      {
        type: 'union',
        types: [
          { type: 'literal', value: 'mg/dL' },
          { type: 'literal', value: 'mmol/L' },
        ],
      },
      "'mg/dL' | 'mmol/L'",
    ],
    [
      { type: 'intersection', types: [reference('A'), reference('B')] },
      'A & B',
    ],
    [
      {
        type: 'array',
        elementType: {
          type: 'union',
          types: [reference('A'), reference('B')],
        },
      },
      '(A | B)[]',
    ],
    [
      {
        type: 'array',
        elementType: { type: 'typeOperator', operator: 'keyof', target: reference('T') },
      },
      '(keyof T)[]',
    ],
    [
      {
        type: 'typeOperator',
        operator: 'readonly',
        target: { type: 'array', elementType: reference('GlucoseReading') },
      },
      'readonly GlucoseReading[]',
    ],
    [
      {
        type: 'indexedAccess',
        objectType: reference('Record'),
        indexType: { type: 'literal', value: 'value' },
      },
      "Record['value']",
    ],
    [
      {
        type: 'indexedAccess',
        objectType: { type: 'union', types: [reference('A'), reference('B')] },
        indexType: reference('K'),
      },
      '(A | B)[K]',
    ],
    [
      { type: 'typeOperator', operator: 'keyof', target: reference('Reading') },
      'keyof Reading',
    ],
    [
      {
        type: 'typeOperator',
        operator: 'keyof',
        target: { type: 'union', types: [reference('A'), reference('B')] },
      },
      'keyof (A | B)',
    ],
    [
      {
        type: 'conditional',
        checkType: reference('T'),
        extendsType: reference('Reading'),
        trueType: intrinsic('true'),
        falseType: intrinsic('false'),
      },
      'T extends Reading ? true : false',
    ],
    [
      {
        type: 'intersection',
        types: [
          { type: 'union', types: [reference('A'), reference('B')] },
          reference('C'),
        ],
      },
      '(A | B) & C',
    ],
    [
      {
        type: 'union',
        types: [
          {
            type: 'conditional',
            checkType: reference('T'),
            extendsType: reference('U'),
            trueType: reference('A'),
            falseType: reference('B'),
          },
          reference('C'),
        ],
      },
      '(T extends U ? A : B) | C',
    ],
    [
      {
        type: 'mapped',
        parameter: 'K',
        parameterType: {
          type: 'typeOperator',
          operator: 'keyof',
          target: reference('T'),
        },
        templateType: {
          type: 'indexedAccess',
          objectType: reference('T'),
          indexType: reference('K'),
        },
        readonlyModifier: '-',
        optionalModifier: '+',
        nameType: {
          type: 'templateLiteral',
          head: 'get',
          tail: [[reference('K'), '']],
        },
      },
      '{ -readonly [K in keyof T as `get${K}`]?: T[K] }',
    ],
    [
      { type: 'inferred', name: 'U', constraint: reference('Reading') },
      'infer U extends Reading',
    ],
    [
      {
        type: 'templateLiteral',
        head: 'reading-',
        tail: [[reference('K'), '-value']],
      },
      '`reading-${K}-value`',
    ],
    [
      { type: 'predicate', name: 'value', asserts: false, targetType: reference('GlucoseReading') },
      'value is GlucoseReading',
    ],
    [
      { type: 'predicate', name: 'value', asserts: true },
      'asserts value',
    ],
    [
      { type: 'predicate', name: 'value', asserts: true, targetType: reference('GlucoseReading') },
      'asserts value is GlucoseReading',
    ],
    [
      { type: 'query', queryType: reference('GLUCOSE_ZONE_COLORS') },
      'typeof GLUCOSE_ZONE_COLORS',
    ],
    [
      {
        type: 'tuple',
        elements: [intrinsic('string'), intrinsic('number')],
      },
      '[string, number]',
    ],
    [
      {
        type: 'tuple',
        elements: [
          { type: 'namedTupleMember', name: 'value', isOptional: false, element: intrinsic('number') },
          { type: 'namedTupleMember', name: 'unit', isOptional: true, element: reference('GlucoseUnit') },
          {
            type: 'namedTupleMember',
            name: 'rest',
            isOptional: false,
            element: { type: 'rest', elementType: { type: 'array', elementType: intrinsic('string') } },
          },
        ],
      },
      '[value: number, unit?: GlucoseUnit, ...rest: string[]]',
    ],
    [
      {
        type: 'tuple',
        elements: [
          { type: 'optional', elementType: intrinsic('string') },
          { type: 'rest', elementType: { type: 'array', elementType: intrinsic('number') } },
        ],
      },
      '[string?, ...number[]]',
    ],
    [{ type: 'optional', elementType: intrinsic('string') }, 'string?'],
    [
      {
        type: 'optional',
        elementType: { type: 'union', types: [reference('A'), reference('B')] },
      },
      '(A | B)?',
    ],
    [{ type: 'rest', elementType: { type: 'array', elementType: intrinsic('number') } }, '...number[]'],
    [{ type: 'unknown', name: 'unresolved-type' }, 'unresolved-type'],
  ]

  for (const [type, expected] of cases) {
    assert.equal(renderType(type, '@glucoseiq/core.fixture'), expected)
  }
})

test('parenthesizes nested conditional, inferred, and unknown types by context', () => {
  const nestedConditional = {
    type: 'conditional',
    checkType: {
      type: 'conditional',
      checkType: reference('A'),
      extendsType: reference('B'),
      trueType: reference('C'),
      falseType: reference('D'),
    },
    extendsType: {
      type: 'conditional',
      checkType: reference('E'),
      extendsType: reference('F'),
      trueType: reference('G'),
      falseType: reference('H'),
    },
    trueType: reference('I'),
    falseType: reference('J'),
  }
  assert.equal(
    renderType(nestedConditional, '@glucoseiq/core.NestedConditional'),
    '(A extends B ? C : D) extends (E extends F ? G : H) ? I : J',
  )
  assert.equal(
    renderType(
      {
        type: 'array',
        elementType: { type: 'inferred', name: 'U' },
      },
      '@glucoseiq/core.InferredArray',
    ),
    '(infer U)[]',
  )
  assert.equal(
    renderType(
      {
        type: 'array',
        elementType: { type: 'unknown', name: 'A | B' },
      },
      '@glucoseiq/core.UnknownArray',
    ),
    '(A | B)[]',
  )
})

test('parenthesizes single construct-reflection arrow types only in nested precedence contexts', () => {
  const constructorType = (returnType = 'Box') => ({
    type: 'reflection',
    declaration: declaration(KIND.constructor, '__type', {
      signatures: [
        signature('__new', {
          kind: KIND.constructorSignature,
          type: reference(returnType),
        }),
      ],
    }),
  })
  const objectType = {
    type: 'reflection',
    declaration: declaration(KIND.typeLiteral, '__type', {
      children: [
        declaration(KIND.property, 'value', { type: intrinsic('string') }),
      ],
    }),
  }

  assert.equal(
    renderType(constructorType(), '@glucoseiq/core.Constructor'),
    'new () => Box',
  )
  assert.equal(
    renderType(
      { type: 'array', elementType: constructorType() },
      '@glucoseiq/core.ConstructorArray',
    ),
    '(new () => Box)[]',
  )
  assert.equal(
    renderType(
      { type: 'union', types: [constructorType(), intrinsic('null')] },
      '@glucoseiq/core.ConstructorUnion',
    ),
    '(new () => Box) | null',
  )
  assert.equal(
    renderType(
      { type: 'intersection', types: [constructorType(), reference('Marker')] },
      '@glucoseiq/core.ConstructorIntersection',
    ),
    '(new () => Box) & Marker',
  )
  assert.equal(
    renderType(
      {
        type: 'conditional',
        checkType: constructorType(),
        extendsType: constructorType('Base'),
        trueType: reference('Yes'),
        falseType: reference('No'),
      },
      '@glucoseiq/core.ConstructorConditional',
    ),
    '(new () => Box) extends (new () => Base) ? Yes : No',
  )
  assert.equal(
    renderType(
      {
        type: 'indexedAccess',
        objectType: constructorType(),
        indexType: { type: 'literal', value: 'prototype' },
      },
      '@glucoseiq/core.ConstructorIndexedAccess',
    ),
    "(new () => Box)['prototype']",
  )
  assert.equal(
    renderType(
      { type: 'typeOperator', operator: 'keyof', target: constructorType() },
      '@glucoseiq/core.ConstructorKeys',
    ),
    'keyof (new () => Box)',
  )
  assert.equal(
    renderType(
      { type: 'array', elementType: objectType },
      '@glucoseiq/core.ObjectArray',
    ),
    '{ value: string }[]',
  )
})

test('sorts rendered public names by Unicode scalar value', () => {
  const privateUseName = '\uE000'
  const astralName = '\u{10000}'
  const page = renderApiModel(project([
    declaration(KIND.typeAlias, astralName, { type: intrinsic('string') }),
    declaration(KIND.typeAlias, privateUseName, { type: intrinsic('string') }),
  ])).get('types.mdx')

  assert.ok(page.indexOf(`### ${privateUseName}`) < page.indexOf(`### ${astralName}`))
})

test('renders callable reflection types and deeply nested readonly object properties', () => {
  const callable = {
    type: 'reflection',
    declaration: declaration(KIND.typeLiteral, '__type', {
      signatures: [
        signature('__call', {
          parameters: [parameter('value', intrinsic('string'))],
          type: intrinsic('number'),
        }),
      ],
      children: [
        declaration(KIND.property, 'nested', {
          flags: { isReadonly: true },
          type: {
            type: 'reflection',
            declaration: declaration(KIND.typeLiteral, '__type', {
              children: [
                declaration(KIND.property, 'count', {
                  flags: { isReadonly: true },
                  type: intrinsic('number'),
                }),
              ],
            }),
          },
        }),
      ],
    }),
  }

  assert.equal(
    renderType(callable, '@glucoseiq/core.Callable'),
    '{ (value: string): number; readonly nested: { readonly count: number } }',
  )
})

test('distinguishes call and constructor signatures and rejects unknown signature kinds', () => {
  const factory = {
    type: 'reflection',
    declaration: declaration(KIND.typeLiteral, '__type', {
      signatures: [
        signature('__call', {
          kind: KIND.callSignature,
          parameters: [parameter('value', intrinsic('string'))],
          type: intrinsic('boolean'),
        }),
        signature('__new', {
          kind: KIND.constructorSignature,
          parameters: [parameter('options', reference('FactoryOptions'))],
          type: reference('Factory'),
        }),
      ],
    }),
  }

  assert.equal(
    renderType(factory, '@glucoseiq/core.FactoryLike'),
    '{ (value: string): boolean; new (options: FactoryOptions): Factory }',
  )
  assert.throws(
    () =>
      renderType(
        {
          type: 'reflection',
          declaration: declaration(KIND.typeLiteral, '__type', {
            signatures: [signature('__future', { kind: 999_999 })],
          }),
        },
        '@glucoseiq/core.FutureSignature',
      ),
    /Unsupported TypeDoc signature kind 999999 at @glucoseiq\/core\.FutureSignature/,
  )
})

test('renders TypeDoc 0.28 constructor-declaration reflection shapes and semantic type parameters', () => {
  const constructType = {
    type: 'reflection',
    declaration: declaration(KIND.constructor, '__type', {
      signatures: [
        signature('__new', {
          kind: KIND.constructorSignature,
          flags: { isAbstract: true },
          typeParameters: [
            {
              id: nextFixtureId(),
              name: 'T',
              variant: 'typeParam',
              kind: KIND.typeParameter,
              flags: { isConst: true },
            },
          ],
          parameters: [parameter('value', reference('T'))],
          type: reference('Box', [reference('T')]),
        }),
      ],
    }),
  }

  assert.equal(
    renderType(constructType, '@glucoseiq/core.AbstractBoxConstructor'),
    'abstract new <const T>(value: T) => Box<T>',
  )
  const variancePage = renderApiModel(project([
    declaration(KIND.interface, 'Transformer', {
      sources: [{ fileName: 'src/types.ts' }],
      typeParameters: [
        {
          id: nextFixtureId(),
          name: 'TInput',
          variant: 'typeParam',
          kind: KIND.typeParameter,
          flags: {},
          varianceModifier: 'in',
        },
        {
          id: nextFixtureId(),
          name: 'TOutput',
          variant: 'typeParam',
          kind: KIND.typeParameter,
          flags: { isConst: true },
          varianceModifier: 'out',
        },
      ],
    }),
  ])).get('types.mdx')
  assert.match(variancePage, /interface Transformer<in TInput, const out TOutput>/)
})

test('rejects missing, malformed, and silently duplicated constructor shapes', () => {
  const emptyFunction = declaration(KIND.function, 'emptyFunction', {
    sources: [{ fileName: 'src/conversions.ts' }],
    signatures: [],
  })
  assert.throws(
    () => renderApiModel(project([emptyFunction])),
    /Function has no signatures at @glucoseiq\/core\.emptyFunction/,
  )

  const emptyConstructor = declaration(KIND.class, 'EmptyConstructor', {
    sources: [{ fileName: 'src/errors.ts' }],
    children: [declaration(KIND.constructor, 'constructor', { signatures: [] })],
  })
  assert.throws(
    () => renderApiModel(project([emptyConstructor])),
    /Constructor has no signatures at @glucoseiq\/core\.EmptyConstructor\.constructor/,
  )

  const malformedConstructor = declaration(KIND.class, 'MalformedConstructor', {
    sources: [{ fileName: 'src/errors.ts' }],
    children: [
      declaration(KIND.constructor, 'constructor', {
        signatures: [signature('new MalformedConstructor', { kind: KIND.callSignature })],
      }),
    ],
  })
  assert.throws(
    () => renderApiModel(project([malformedConstructor])),
    /Unsupported TypeDoc signature kind 4096 at @glucoseiq\/core\.MalformedConstructor\.constructor/,
  )

  const duplicateConstructors = declaration(KIND.class, 'DuplicateConstructors', {
    sources: [{ fileName: 'src/errors.ts' }],
    children: [
      declaration(KIND.constructor, 'constructor', {
        signatures: [
          signature('new DuplicateConstructors', {
            kind: KIND.constructorSignature,
            type: reference('DuplicateConstructors'),
          }),
        ],
      }),
      declaration(KIND.constructor, 'constructor', {
        signatures: [
          signature('new DuplicateConstructors', {
            kind: KIND.constructorSignature,
            type: reference('DuplicateConstructors'),
          }),
        ],
      }),
    ],
  })
  assert.throws(
    () => renderApiModel(project([duplicateConstructors])),
    /Multiple constructor reflections at @glucoseiq\/core\.DuplicateConstructors/,
  )

  const rendererSource = readFileSync(join(SCRIPT_DIR, 'lib/api-renderer.mjs'), 'utf8')
  assert.match(rendererSource, /accessor:\s*262144/u)
  assert.doesNotMatch(rendererSource, /child\.kind === 262144/u)
})

test('renders inherited properties, index signatures, and accessors without dropping children', () => {
  const publicShape = declaration(KIND.interface, 'PublicShape', {
    sources: [{ fileName: 'src/types.ts' }],
    children: [
      declaration(KIND.property, 'code', {
        flags: { isInherited: true, isReadonly: true },
        type: reference('GlucoseIQErrorCode'),
      }),
      declaration(KIND.accessor, 'current', {
        getSignature: signature('current', {
          kind: KIND.getSignature,
          type: intrinsic('number'),
        }),
        setSignature: signature('current', {
          kind: KIND.setSignature,
          parameters: [parameter('value', intrinsic('number'))],
          type: intrinsic('void'),
        }),
      }),
    ],
    indexSignatures: [
      signature('__index', {
        kind: KIND.indexSignature,
        parameters: [parameter('key', intrinsic('string'))],
        type: intrinsic('number'),
      }),
    ],
  })
  const page = renderApiModel(project([publicShape])).get('types.mdx')
  assert.match(page, /\| `readonly code` \| `GlucoseIQErrorCode` \|/)
  assert.match(page, /\[key: string\]: number/)
  assert.match(page, /get current\(\): number/)
  assert.match(page, /set current\(value: number\)/)

  const unsupportedChild = structuredClone(publicShape)
  unsupportedChild.children.push(
    declaration(16, 'futureMember', { type: intrinsic('string') }),
  )
  assert.throws(
    () => renderApiModel(project([unsupportedChild])),
    /Unsupported TypeDoc reflection kind 16 at @glucoseiq\/core\.PublicShape\.futureMember/,
  )
})

test('renders declaration-level optional, readonly, static, and abstract modifiers on every overload', () => {
  const publicShape = declaration(KIND.interface, 'PublicShape', {
    sources: [{ fileName: 'src/types.ts' }],
    children: [
      declaration(KIND.method, 'lookup', {
        flags: { isOptional: true },
        signatures: [
          signature('lookup', {
            parameters: [parameter('key', intrinsic('string'))],
            type: intrinsic('number'),
          }),
          signature('lookup', {
            parameters: [parameter('key', intrinsic('number'))],
            type: intrinsic('number'),
          }),
        ],
      }),
    ],
    indexSignatures: [
      signature('__index', {
        kind: KIND.indexSignature,
        flags: { isReadonly: true },
        parameters: [parameter('key', intrinsic('string'))],
        type: intrinsic('number'),
      }),
    ],
  })
  const abstractStore = declaration(KIND.class, 'AbstractStore', {
    flags: { isAbstract: true },
    sources: [{ fileName: 'src/errors.ts' }],
    implementedTypes: [reference('PublicShape')],
    children: [
      declaration(KIND.constructor, 'constructor', {
        signatures: [
          signature('new AbstractStore', {
            kind: KIND.constructorSignature,
            type: reference('AbstractStore'),
          }),
        ],
      }),
      declaration(KIND.property, 'version', {
        flags: { isStatic: true, isReadonly: true },
        type: intrinsic('number'),
      }),
      declaration(KIND.property, 'value', {
        flags: { isAbstract: true, isOptional: true },
        type: intrinsic('number'),
      }),
      declaration(KIND.method, 'create', {
        flags: { isStatic: true },
        signatures: [signature('create', { type: reference('AbstractStore') })],
      }),
      declaration(KIND.method, 'read', {
        flags: { isAbstract: true },
        signatures: [
          signature('read', { parameters: [parameter('key', intrinsic('string'))] }),
          signature('read', { parameters: [parameter('key', intrinsic('number'))] }),
        ],
      }),
      declaration(KIND.accessor, 'current', {
        flags: { isStatic: true },
        getSignature: signature('current', {
          kind: KIND.getSignature,
          type: intrinsic('number'),
        }),
      }),
    ],
  })

  const files = renderApiModel(project([publicShape, abstractStore]))
  const typesPage = files.get('types.mdx')
  assert.match(typesPage, /readonly \[key: string\]: number/)
  assert.match(typesPage, /lookup\?\(key: string\): number\nlookup\?\(key: number\): number/)

  const errorsPage = files.get('errors.mdx')
  assert.match(errorsPage, /abstract class AbstractStore implements PublicShape/)
  assert.match(errorsPage, /\| `static readonly version` \| `number` \|/)
  assert.match(errorsPage, /\| `abstract value\?` \| `number` \|/)
  assert.match(errorsPage, /static create\(\): AbstractStore/)
  assert.match(errorsPage, /abstract read\(key: string\): void\nabstract read\(key: number\): void/)
  assert.match(errorsPage, /static get current\(\): number/)

  const reflectionType = {
    type: 'reflection',
    declaration: declaration(KIND.typeLiteral, '__type', {
      children: [
        declaration(KIND.method, 'parse', {
          flags: { isOptional: true },
          signatures: [
            signature('parse', { parameters: [parameter('value', intrinsic('string'))] }),
            signature('parse', { parameters: [parameter('value', intrinsic('number'))] }),
          ],
        }),
      ],
    }),
  }
  assert.equal(
    renderType(reflectionType, '@glucoseiq/core.OptionalParser'),
    '{ parse?(value: string): void; parse?(value: number): void }',
  )
})

test('fails loudly when semantic TypeDoc flags cannot be rendered as valid declarations', () => {
  const staticInterfaceMethod = declaration(KIND.interface, 'InvalidInterface', {
    sources: [{ fileName: 'src/types.ts' }],
    children: [
      declaration(KIND.method, 'create', {
        flags: { isStatic: true },
        signatures: [signature('create')],
      }),
    ],
  })
  assert.throws(
    () => renderApiModel(project([staticInterfaceMethod])),
    /Unsupported TypeDoc flag isStatic at @glucoseiq\/core\.InvalidInterface\.create/,
  )

  const concreteAbstractMember = declaration(KIND.class, 'InvalidClass', {
    sources: [{ fileName: 'src/errors.ts' }],
    children: [
      declaration(KIND.constructor, 'constructor', {
        signatures: [
          signature('new InvalidClass', {
            kind: KIND.constructorSignature,
            type: reference('InvalidClass'),
          }),
        ],
      }),
      declaration(KIND.method, 'read', {
        flags: { isAbstract: true },
        signatures: [signature('read')],
      }),
    ],
  })
  assert.throws(
    () => renderApiModel(project([concreteAbstractMember])),
    /Abstract TypeDoc member belongs to non-abstract class at @glucoseiq\/core\.InvalidClass\.read/,
  )

  const mutableVariable = declaration(KIND.variable, 'mutableValue', {
    sources: [{ fileName: 'src/constants.ts' }],
    type: intrinsic('number'),
  })
  assert.throws(
    () => renderApiModel(project([mutableVariable])),
    /Mutable TypeDoc variable cannot be rendered as const at @glucoseiq\/core\.mutableValue/,
  )

  assert.throws(
    () =>
      renderType(
        {
          type: 'reflection',
          declaration: declaration(KIND.typeLiteral, '__type', {
            children: [
              declaration(KIND.property, 'value', {
                flags: { isFuture: true },
                type: intrinsic('number'),
              }),
            ],
          }),
        },
        '@glucoseiq/core.FutureFlags',
      ),
    /Unsupported TypeDoc flag isFuture at @glucoseiq\/core\.FutureFlags\.value/,
  )

  const conflictingMember = structuredClone(concreteAbstractMember)
  conflictingMember.flags = { isAbstract: true }
  conflictingMember.children.at(-1).flags = { isAbstract: true, isStatic: true }
  assert.throws(
    () => renderApiModel(project([conflictingMember])),
    /Conflicting TypeDoc flags isStatic and isAbstract at @glucoseiq\/core\.InvalidClass\.read/,
  )

  const privateConstructor = declaration(KIND.class, 'PrivateConstructor', {
    sources: [{ fileName: 'src/errors.ts' }],
    children: [
      declaration(KIND.constructor, 'constructor', {
        flags: { isPrivate: true },
        signatures: [
          signature('new PrivateConstructor', {
            kind: KIND.constructorSignature,
            type: reference('PrivateConstructor'),
          }),
        ],
      }),
    ],
  })
  assert.throws(
    () => renderApiModel(project([privateConstructor])),
    /Unsupported TypeDoc flag isPrivate at @glucoseiq\/core\.PrivateConstructor\.constructor/,
  )
})

test('keeps visible TypeScript syntax inside delimiter-safe table code spans', () => {
  const nestedType = {
    type: 'reflection',
    declaration: declaration(KIND.typeLiteral, '__type', {
      children: [
        declaration(KIND.property, 'template', {
          type: {
            type: 'templateLiteral',
            head: 'reading-',
            tail: [[reference('K'), '']],
          },
        }),
      ],
    }),
  }
  const visible = declaration(KIND.interface, 'VisibleType', {
    sources: [{ fileName: 'src/types.ts' }],
    children: [
      declaration(KIND.property, 'value', {
        type: reference('Record', [intrinsic('number'), nestedType]),
      }),
      declaration(KIND.property, 'choice', {
        type: { type: 'union', types: [intrinsic('string'), intrinsic('number')] },
      }),
    ],
  })
  const page = renderApiModel(project([visible])).get('types.mdx')
  const row = page.split('\n').find((line) => line.includes('`value`'))
  assert.match(row, /Record<number, \{ template: `reading-\$\{K\}` \}>/)
  assert.doesNotMatch(row, /&lt;|&gt;|&#123;|&#125;/)
  assert.match(row, /``Record<number, \{ template: `reading-\$\{K\}` \}>``/)
  const unionRow = page.split('\n').find((line) => line.includes('`choice`'))
  assert.match(unionRow, /`string \\| number`/)
})

test('fails loudly for unsupported type and reflection discriminants with the owner path', () => {
  assert.throws(
    () => renderType(undefined, '@glucoseiq/core.Future.missing'),
    /Missing TypeDoc type at @glucoseiq\/core\.Future\.missing/,
  )
  assert.throws(
    () => renderType({ type: 'unknown', name: '' }, '@glucoseiq/core.Future.unknown'),
    /Unnamed TypeDoc unknown type at @glucoseiq\/core\.Future\.unknown/,
  )
  assert.throws(
    () => renderType({ type: 'futureType' }, '@glucoseiq/core.Future.value'),
    /Unsupported TypeDoc type "futureType" at @glucoseiq\/core\.Future\.value/,
  )
  assert.throws(
    () =>
      renderType(
        {
          type: 'reflection',
          declaration: {
            id: 91,
            name: '__type',
            variant: 'declaration',
            kind: 16_777_216,
            flags: {},
          },
        },
        '@glucoseiq/core.Future.object',
      ),
    /Unsupported TypeDoc reflection kind 16777216 at @glucoseiq\/core\.Future\.object/,
  )
  assert.throws(
    () =>
      renderApiModel(
        project([
          declaration(16_777_216, 'FutureExport', {
            sources: [{ fileName: 'src/future.ts' }],
          }),
        ]),
      ),
    /Unsupported TypeDoc reflection kind 16777216 at @glucoseiq\/core\.FutureExport/,
  )
})

test('formats optional, rest, defaulted, generic, and predicate signatures exactly', () => {
  const rendered = formatSignature(
    'isReading',
    signature('isReading', {
      typeParameters: [
        {
          id: 500,
          name: 'T',
          variant: 'typeParam',
          kind: KIND.typeParameter,
          flags: {},
          type: reference('GlucoseReading'),
          default: reference('GlucoseReading'),
        },
      ],
      parameters: [
        parameter('input', intrinsic('unknown'), { defaultValue: 'undefined' }),
        parameter('unit', reference('GlucoseUnit'), {
          flags: { isOptional: true },
        }),
        parameter('rest', { type: 'array', elementType: intrinsic('number') }, {
          flags: { isRest: true },
        }),
      ],
      type: {
        type: 'predicate',
        name: 'input',
        asserts: false,
        targetType: reference('T'),
      },
    }),
    '@glucoseiq/core.isReading',
  )

  assert.equal(
    rendered,
    'isReading<T extends GlucoseReading = GlucoseReading>(input: unknown = undefined, unit?: GlucoseUnit, ...rest: number[]): input is T',
  )
  assert.doesNotMatch(rendered, /input\?/)
})

test('renders abbreviated TypeDoc defaults from a documented concrete initializer', () => {
  const rendered = formatSignature(
    'isA1CInTarget',
    signature('isA1CInTarget', {
      parameters: [
        parameter(
          'target',
          {
            type: 'tuple',
            elements: [intrinsic('number'), intrinsic('number')],
          },
          {
            defaultValue: '...',
            comment: {
              summary: [text('[min, max] range (default: [6.5, 7.0])')],
            },
          },
        ),
      ],
      type: intrinsic('boolean'),
    }),
    '@glucoseiq/core.isA1CInTarget',
  )

  assert.equal(
    rendered,
    'isA1CInTarget(target: [number, number] = [6.5, 7.0]): boolean',
  )
})

test('rejects abbreviated TypeDoc defaults without a documented concrete initializer', () => {
  assert.throws(
    () =>
      formatSignature(
        'ambiguousDefault',
        signature('ambiguousDefault', {
          parameters: [
            parameter('value', intrinsic('number'), {
              defaultValue: '...',
              comment: { summary: [text('A value with an undocumented default.')] },
            }),
          ],
        }),
        '@glucoseiq/core.ambiguousDefault',
      ),
    /Abbreviated TypeDoc default lacks a documented concrete default at @glucoseiq\/core\.ambiguousDefault\.value/,
  )
})

test('escapes prose and table MDX without corrupting code syntax', () => {
  assert.equal(
    escapeMdx('<Callout>{danger}</Callout> | safe', 'prose'),
    '&lt;Callout&gt;&#123;danger&#125;&lt;/Callout&gt; | safe',
  )
  assert.equal(
    escapeMdx('left | right\nnext', 'table'),
    'left \\| right next',
  )
  assert.equal(escapeMdx('Map<string, { value: number }>', 'code'), 'Map<string, { value: number }>')
})

test('renders bare, labeled external, numeric internal, and symbol links', () => {
  const parts = [
    text('See '),
    { kind: 'inline-tag', tag: '@link', text: '', target: 'https://example.com' },
    text(', '),
    { kind: 'inline-tag', tag: '@link', text: 'Guide', target: 'https://example.com/guide' },
    text(', '),
    { kind: 'inline-tag', tag: '@link', text: 'Target', target: 42 },
    text(', and '),
    {
      kind: 'inline-tag',
      tag: '@linkcode',
      text: 'Symbol',
      target: {
        packageName: '@glucoseiq/core',
        packagePath: 'src/types.ts',
        qualifiedName: 'Symbol',
      },
    },
  ]
  const links = {
    byId: new Map([[42, '/docs/api/core/types#target']]),
    bySymbol: new Map([['@glucoseiq/core|src/types.ts|Symbol', '/docs/api/core/types#symbol']]),
  }

  assert.equal(
    renderCommentParts(parts, '@glucoseiq/core.fixture', links),
    'See [https://example.com](https://example.com), [Guide](https://example.com/guide), [Target](/docs/api/core/types#target), and [`Symbol`](/docs/api/core/types#symbol)',
  )

  assert.equal(
    renderCommentParts([
      {
        kind: 'inline-tag',
        tag: '@linkcode',
        text: 'A]`B\\C',
        target: 'https://example.com/a_(b) c',
      },
    ]),
    '[``A]`B\\C``](https://example.com/a_%28b%29%20c)',
  )

  assert.equal(
    renderCommentParts([
      {
        kind: 'inline-tag',
        tag: '@linkcode',
        text: 'string | number',
        target: 'https://example.com/union',
      },
    ]),
    '[`string | number`](https://example.com/union)',
  )

  assert.equal(
    escapeMdx(
      renderCommentParts([
        {
          kind: 'inline-tag',
          tag: '@link',
          text: '<Guide>[safe]{ok}</Guide>',
          target: 'https://example.com/guide',
        },
      ]),
      'prose',
    ),
    '[&lt;Guide&gt;\\[safe\\]&#123;ok&#125;&lt;/Guide&gt;](https://example.com/guide)',
  )
  assert.throws(
    () =>
      renderCommentParts([
        {
          kind: 'inline-tag',
          tag: '@link',
          text: 'unsafe',
          target: 'https://example.com/line\nbreak',
        },
      ]),
    /Unsafe Markdown link destination/,
  )

  assert.throws(
    () =>
      renderCommentParts([
        {
          kind: 'inline-tag',
          tag: '@link',
          text: 'malformed',
          target: 'https://[',
        },
      ]),
    /Unsafe Markdown link destination/,
  )

  assert.equal(
    renderCommentParts(
      [{ kind: 'inline-tag', tag: '@link', text: 'Internal', target: 42 }],
      '@glucoseiq/core.fixture',
      { byId: new Map([[42, '/docs/api/core/types#target']]) },
    ),
    '[Internal](/docs/api/core/types#target)',
  )
})

test('neutralizes raw Markdown destinations and rejects unsafe structured links with owner diagnostics', () => {
  assert.equal(
    renderCommentParts([
      text('Unsafe [script](javascript:alert(1)), ![image](data:text/html,bad), and [ref][target].'),
    ]),
    'Unsafe \\[script](javascript:alert(1)), !\\[image](data:text/html,bad), and \\[ref]\\[target].',
  )

  for (const destination of [
    'javascript:alert(1)',
    'data:text/html,bad',
    'mailto:attacker@example.com',
    '//example.com/redirect',
    '../outside',
  ]) {
    assert.throws(
      () =>
        renderCommentParts(
          [{ kind: 'inline-tag', tag: '@link', text: 'Unsafe', target: 42 }],
          '@glucoseiq/core.LinkOwner',
          { byId: new Map([[42, destination]]) },
        ),
      /Unsafe Markdown link destination at @glucoseiq\/core\.LinkOwner/,
    )
  }

  assert.throws(
    () =>
      renderCommentParts(
        [{ kind: 'inline-tag', tag: '@link', text: 'Unsafe', target: 'data:text/html,bad' }],
        '@glucoseiq/core.StringLinkOwner',
      ),
    /Unsafe Markdown link destination at @glucoseiq\/core\.StringLinkOwner/,
  )

  assert.equal(
    renderCommentParts(
      [{ kind: 'inline-tag', tag: '@link', text: 'Internal', target: 42 }],
      '@glucoseiq/core.InternalLinkOwner',
      { byId: new Map([[42, '/docs/api/core/types#target']]) },
    ),
    '[Internal](/docs/api/core/types#target)',
  )
  assert.equal(
    renderCommentParts([
      { kind: 'inline-tag', tag: '@link', text: 'HTTPS', target: 'https://example.com/docs' },
    ]),
    '[HTTPS](https://example.com/docs)',
  )
})

test('neutralizes raw Markdown destinations inside see blocks while preserving structured links', () => {
  const linked = declaration(KIND.function, 'safeSeeBlock', {
    sources: [{ fileName: 'src/conversions.ts' }],
    signatures: [
      signature('safeSeeBlock', {
        comment: {
          summary: [],
          blockTags: [
            {
              tag: '@see',
              content: [
                text('[Unsafe](javascript:alert(1))\n'),
                {
                  kind: 'inline-tag',
                  tag: '@link',
                  text: 'Safe',
                  target: 'https://example.com/safe',
                },
              ],
            },
          ],
        },
      }),
    ],
  })
  const page = renderApiModel(project([linked])).get('conversions.mdx')

  assert.match(page, /- \\\[(?:Unsafe)\]\(javascript:alert\(1\)\)/)
  assert.match(page, /- \[Safe\]\(https:\/\/example\.com\/safe\)/)
  assert.doesNotMatch(page, /- \[Unsafe\]\(javascript:/)
})

test('uses a dynamic block fence when generated declarations or examples contain backticks', () => {
  const fencedAlias = declaration(KIND.typeAlias, 'FencedType', {
    sources: [{ fileName: 'src/types.ts' }],
    type: {
      type: 'templateLiteral',
      head: 'before\n```\nafter',
      tail: [],
    },
    comment: {
      summary: [],
      blockTags: [
        {
          tag: '@example',
          content: [code('const marker = "```"')],
        },
      ],
    },
  })
  const page = renderApiModel(project([fencedAlias])).get('types.mdx')
  assert.match(
    page,
    /````ts fragment="generated API declaration or signature"\ntype FencedType = `before\n```\nafter`\n````/,
  )
  assert.match(page, /````ts typecheck\nconst marker = "```"\n````/)
})

test('classifies generated declaration and signature fences separately from examples', () => {
  const shape = declaration(KIND.interface, 'GeneratedShape', {
    sources: [{ fileName: 'src/types.ts' }],
  })
  const alias = declaration(KIND.typeAlias, 'GeneratedAlias', {
    sources: [{ fileName: 'src/types.ts' }],
    type: intrinsic('string'),
  })
  const constant = declaration(KIND.variable, 'GENERATED_VALUE', {
    sources: [{ fileName: 'src/constants.ts' }],
    flags: { isConst: true },
    type: intrinsic('number'),
  })
  const callable = declaration(KIND.function, 'generatedFunction', {
    sources: [{ fileName: 'src/conversions.ts' }],
    signatures: [
      signature('generatedFunction', {
        parameters: [parameter('value', intrinsic('number'))],
        type: intrinsic('string'),
        comment: {
          summary: [],
          blockTags: [
            {
              tag: '@example',
              content: [code('import { generatedFunction } from \'@glucoseiq/core\'\n\ngeneratedFunction(1)')],
            },
          ],
        },
      }),
    ],
  })

  const pages = renderApiModel(project([shape, alias, constant, callable]))
  const fragmentMetadata = 'ts fragment="generated API declaration or signature"'

  assert.match(
    pages.get('types.mdx'),
    new RegExp('```' + fragmentMetadata + '\\ninterface GeneratedShape'),
  )
  assert.match(
    pages.get('types.mdx'),
    new RegExp('```' + fragmentMetadata + '\\ntype GeneratedAlias = string'),
  )
  assert.match(
    pages.get('constants.mdx'),
    new RegExp('```' + fragmentMetadata + '\\nconst GENERATED_VALUE: number'),
  )
  assert.match(
    pages.get('conversions.mdx'),
    new RegExp(
      '```' + fragmentMetadata + '\\ngeneratedFunction\\(value: number\\): string',
    ),
  )
  assert.match(
    pages.get('conversions.mdx'),
    /```ts typecheck\nimport \{ generatedFunction \} from '@glucoseiq\/core'\n\ngeneratedFunction\(1\)\n```/,
  )
})

test('normalizes plain and multi-item see URLs into labeled Markdown links', () => {
  const linked = declaration(KIND.function, 'convertLinkedValue', {
    sources: [{ fileName: 'src/conversions.ts' }],
    signatures: [
      signature('convertLinkedValue', {
        comment: {
          summary: [],
          blockTags: [
            {
              tag: '@see',
              content: [
                text(' - https://example.com/one (Primary reference)\n'),
                text(' - https://example.com/two\n'),
              ],
            },
          ],
        },
      }),
    ],
  })
  const page = renderApiModel(project([linked])).get('conversions.mdx')
  assert.match(page, /\*\*See:\*\*\n\n- \[Primary reference\]\(https:\/\/example\.com\/one\)\n- \[https:\/\/example\.com\/two\]\(https:\/\/example\.com\/two\)/)
})

test('escapes hostile see labels and encodes URL metacharacters without double escaping', () => {
  const linked = declaration(KIND.function, 'renderSafeLink', {
    sources: [{ fileName: 'src/render/agp-svg.ts' }],
    signatures: [
      signature('renderSafeLink', {
        comment: {
          summary: [
            {
              kind: 'inline-tag',
              tag: '@link',
              text: '<Guide>{safe}</Guide>',
              target: 'https://example.com/guide',
            },
          ],
          blockTags: [
            {
              tag: '@see',
              content: [
                text('https://example.com/{value}<draft> (<Widget>{danger}</Widget>)'),
              ],
            },
          ],
        },
      }),
    ],
  })

  const page = renderApiModel(project([linked])).get('render.mdx')
  assert.match(
    page,
    /\[&lt;Guide&gt;&#123;safe&#125;&lt;\/Guide&gt;\]\(https:\/\/example\.com\/guide\)/,
  )
  assert.match(
    page,
    /\*\*See:\*\* \[&lt;Widget&gt;&#123;danger&#125;&lt;\/Widget&gt;\]\(https:\/\/example\.com\/%7Bvalue%7D%3Cdraft%3E\)/,
  )
  assert.doesNotMatch(page, /&amp;(?:lt|gt|#123|#125);/u)
})

test('derives stable package imports from source files and ignores source URLs', () => {
  const cases = [
    ['src/metrics/agp.ts', '@glucoseiq/core/metrics'],
    ['src/connectors/dexcom.ts', '@glucoseiq/core/connectors'],
    ['src/interop/fhir.ts', '@glucoseiq/core/interop'],
    ['src/render/agp-svg.ts', '@glucoseiq/core/render'],
    ['src/analyze.ts', '@glucoseiq/core'],
  ]
  for (const [fileName, expected] of cases) {
    assert.equal(
      sourceImportPath({ sources: [{ fileName, url: 'https://github.com/example/blob/deadbeef/file.ts' }] }),
      expected,
    )
  }
})

test('renders deterministic complete pages with generic interfaces, overloads, rich comments, and class properties', () => {
  const omh = declaration(KIND.interface, 'OMHDataPoint', {
    id: 10,
    sources: [{ fileName: 'src/interop/types.ts' }],
    typeParameters: [
      {
        id: 11,
        name: 'T',
        variant: 'typeParam',
        kind: KIND.typeParameter,
        flags: {},
        default: reference('OMHBloodGlucose'),
      },
    ],
    children: [
      declaration(KIND.property, 'body', {
        id: 12,
        flags: { isReadonly: true },
        type: reference('T'),
      }),
    ],
  })
  const overloaded = declaration(KIND.function, 'normalizeReading', {
    id: 20,
    sources: [
      {
        fileName: 'src/interop/fhir.ts',
        url: 'https://github.com/example/blob/deadbeef/fhir.ts#L1',
      },
    ],
    signatures: [
      signature('normalizeReading', {
        id: 21,
        parameters: [parameter('value', intrinsic('number'), { id: 22 })],
        type: reference('OMHDataPoint'),
        comment: {
          summary: [text('Normalizes <unsafe> {input}.')],
          blockTags: [
            { tag: '@remarks', content: [text('Validate values before clinical use.')] },
            { tag: '@deprecated', content: [text('Use the typed overload.')] },
            { tag: '@returns', content: [text('A normalized reading.')] },
            { tag: '@throws', content: [text('When the value is invalid.')] },
            { tag: '@example', content: [code('normalizeReading(100)')] },
            {
              tag: '@see',
              content: [
                {
                  kind: 'inline-tag',
                  tag: '@link',
                  text: 'Clinical guide',
                  target: 'https://example.com/guide',
                },
              ],
            },
          ],
        },
      }),
      signature('normalizeReading', {
        id: 23,
        parameters: [parameter('value', intrinsic('string'), { id: 24 })],
        type: reference('OMHDataPoint'),
      }),
    ],
  })
  const errorClass = declaration(KIND.class, 'GlucoseIQError', {
    id: 30,
    sources: [{ fileName: 'src/errors.ts' }],
    extendedTypes: [reference('Error')],
    children: [
      declaration(KIND.constructor, 'constructor', {
        id: 31,
        signatures: [
          signature('new GlucoseIQError', {
            id: 32,
            kind: KIND.constructorSignature,
            parameters: [parameter('message', intrinsic('string'), { id: 33 })],
            type: reference('GlucoseIQError'),
          }),
          signature('new GlucoseIQError', {
            kind: KIND.constructorSignature,
            parameters: [
              parameter('code', reference('ErrorCode')),
              parameter('message', intrinsic('string')),
            ],
            type: reference('GlucoseIQError'),
          }),
        ],
      }),
      declaration(KIND.property, 'code', {
        id: 34,
        flags: { isReadonly: true },
        type: reference('GlucoseIQErrorCode'),
        comment: { summary: [text('Stable machine-readable code.')] },
      }),
    ],
  })
  const model = project([omh, overloaded, errorClass])

  const first = renderApiModel(model)
  const second = renderApiModel(structuredClone(model))

  assert.ok(first instanceof Map)
  assert.deepEqual([...first], [...second])
  assert.deepEqual([...first.keys()], [...first.keys()].toSorted())
  assert.deepEqual([...first.keys()], [
    'constants.mdx',
    'errors.mdx',
    'index.mdx',
    'interop.mdx',
    'meta.json',
    'types.mdx',
  ])

  const typesPage = first.get('types.mdx')
  assert.match(typesPage, /interface OMHDataPoint<T = OMHBloodGlucose>/)
  assert.match(typesPage, /\| `readonly body` \| `T` \|/)
  assert.match(typesPage, /\*\*Import:\*\* `@glucoseiq\/core\/interop`/)

  const functionPage = first.get('interop.mdx')
  assert.match(functionPage, /normalizeReading\(value: number\): OMHDataPoint/)
  assert.match(functionPage, /normalizeReading\(value: string\): OMHDataPoint/)
  assert.match(functionPage, /Normalizes &lt;unsafe&gt; &#123;input&#125;\./)
  assert.match(functionPage, /\*\*Remarks:\*\* Validate values before clinical use\./)
  assert.match(functionPage, /\*\*Deprecated:\*\* Use the typed overload\./)
  assert.match(functionPage, /\*\*Returns:\*\* A normalized reading\./)
  assert.match(functionPage, /\*\*Throws:\*\* When the value is invalid\./)
  assert.match(functionPage, /```ts typecheck\nnormalizeReading\(100\)\n```/)
  assert.match(functionPage, /\[Clinical guide\]\(https:\/\/example\.com\/guide\)/)
  assert.doesNotMatch(functionPage, /deadbeef|github\.com\/example\/blob/)

  const errorsPage = first.get('errors.mdx')
  assert.match(errorsPage, /class GlucoseIQError extends Error/)
  assert.match(
    errorsPage,
    /new GlucoseIQError\(message: string\)\nnew GlucoseIQError\(code: ErrorCode, message: string\)/,
  )
  assert.doesNotMatch(errorsPage, /new GlucoseIQError\([^\n]+\):/u)
  assert.match(errorsPage, /\| `readonly code` \| `GlucoseIQErrorCode` \| Stable machine-readable code\. \|/)

  assert.match(first.get('index.mdx'), /@glucoseiq\/core API/)
  assert.deepEqual(JSON.parse(first.get('meta.json')), {
    title: '@glucoseiq/core',
    pages: ['interop', 'types', 'constants', 'errors'],
  })
  for (const bytes of first.values()) assert.ok(bytes.endsWith('\n'))
})

test('does not mutate a deeply frozen TypeDoc model', () => {
  const frozen = deepFreeze(
    project([
      declaration(KIND.interface, 'FrozenShape', {
        sources: [{ fileName: 'src/types.ts' }],
        children: [
          declaration(KIND.property, 'value', {
            flags: { isReadonly: true },
            type: intrinsic('number'),
          }),
        ],
      }),
    ]),
  )
  assert.doesNotThrow(() => renderApiModel(frozen))
})

test('combines error functions and classes without overwriting either export', () => {
  const errorFunction = declaration(KIND.function, 'formatErrorCode', {
    sources: [{ fileName: 'src/errors.ts' }],
    signatures: [signature('formatErrorCode', { type: intrinsic('string') })],
  })
  const errorClass = declaration(KIND.class, 'GlucoseIQError', {
    sources: [{ fileName: 'src/errors.ts' }],
  })
  const files = renderApiModel(project([errorFunction, errorClass]))
  assert.match(files.get('errors.mdx'), /### formatErrorCode/)
  assert.match(files.get('errors.mdx'), /### GlucoseIQError/)
  assert.equal(JSON.parse(files.get('meta.json')).pages.filter((page) => page === 'errors').length, 1)
})

test('serializes parseable frontmatter for every generated MDX page', () => {
  const files = renderApiModel(project())
  for (const [path, source] of files) {
    if (!path.endsWith('.mdx')) continue
    const frontmatter = parseGeneratedFrontmatter(source)
    assert.equal(typeof frontmatter.title, 'string', path)
    assert.equal(typeof frontmatter.description, 'string', path)
  }
})

test('rejects invalid package/schema identity and uncategorized functions', () => {
  assert.throws(
    () => renderApiModel(project([], { schemaVersion: '1.0' })),
    /Expected TypeDoc JSON schema 2\.0.*received 1\.0/,
  )
  assert.throws(
    () => renderApiModel(project([], { name: 'wrong-package' })),
    /Expected TypeDoc project @glucoseiq\/core.*received wrong-package/,
  )
  assert.throws(
    () =>
      renderApiModel(
        project([
          declaration(KIND.function, 'futureFunction', {
            sources: [{ fileName: 'src/future-area.ts' }],
            signatures: [signature('futureFunction')],
          }),
        ]),
      ),
    /Uncategorized public function at @glucoseiq\/core\.futureFunction.*future-area\.ts/,
  )
})

test('dedicated TypeDoc config and dependency ownership are exact', () => {
  const config = JSON.parse(readFileSync(join(DOCS_DIR, 'typedoc.api.json'), 'utf8'))
  assert.deepEqual(config, {
    $schema: 'https://typedoc.org/schema.json',
    name: '@glucoseiq/core',
    entryPoints: ['../../packages/core/src/index.ts'],
    tsconfig: '../../packages/core/tsconfig.json',
    excludeInternal: true,
    excludePrivate: true,
    excludeProtected: true,
    excludeExternals: true,
    plugin: [],
    readme: 'none',
    treatWarningsAsErrors: true,
    treatValidationWarningsAsErrors: true,
  })

  const docsPackage = JSON.parse(readFileSync(join(DOCS_DIR, 'package.json'), 'utf8'))
  const corePackage = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/core/package.json'), 'utf8'),
  )
  assert.equal(docsPackage.devDependencies.typedoc, '0.28.20')
  assert.equal(corePackage.devDependencies?.typedoc, undefined)
  assert.equal(corePackage.devDependencies?.['typedoc-plugin-markdown'], undefined)
  assert.equal(corePackage.scripts?.['docs:api'], undefined)
})

test('resolves the TypeDoc binary and package version from the docs package', () => {
  const resolved = resolveTypeDocBinary()
  assert.equal(resolved.version, '0.28.20')
  assert.equal(
    realpathSync(resolved.binaryPath),
    realpathSync(join(DOCS_DIR, 'node_modules/typedoc/bin/typedoc')),
  )
  assert.match(realpathSync(resolved.packagePath), /typedoc@0\.28\.20/)
})

test('validates spawn errors, signals, and nonzero statuses', () => {
  assert.throws(
    () => assertSpawnResult({ error: new Error('spawn failed'), status: null, signal: null }),
    /Unable to start TypeDoc.*spawn failed/,
  )
  assert.throws(
    () => assertSpawnResult({ status: null, signal: 'SIGTERM', stdout: '', stderr: 'stopped' }),
    /TypeDoc terminated by signal SIGTERM.*stopped/s,
  )
  assert.throws(
    () => assertSpawnResult({ status: 7, signal: null, stdout: 'out', stderr: 'bad' }),
    /TypeDoc exited with status 7.*out.*bad/s,
  )
  assert.doesNotThrow(() =>
    assertSpawnResult({ status: 0, signal: null, stdout: '', stderr: '' }),
  )
})

test('formats the exact cleanup warning line used by the generator CLI', () => {
  assert.equal(
    apiGenerator.formatCleanupWarning({
      phase: 'generation-temporary-root',
      path: '/tmp/glucoseiq-api-123-example',
      error: new Error('injected cleanup failure'),
    }),
    'Warning: generation-temporary-root cleanup failed for /tmp/glucoseiq-api-123-example: injected cleanup failure. Inspect /tmp/glucoseiq-api-123-example and remove it manually after verifying it is no longer needed.',
  )

  const nested = new AggregateError(
    [
      new Error('first cause'),
      new AggregateError(
        [new Error('second cause'), new Error('third cause')],
        'nested failure',
      ),
    ],
    'outer failure',
  )
  assert.equal(
    apiGenerator.formatError(nested),
    'outer failure [1. first cause; 2. nested failure [1. second cause; 2. third cause]]',
  )
})

test('formats shared error objects per branch and detects only active recursive cycles', () => {
  const shared = new Error('shared cause')
  const repeated = new AggregateError([shared, shared], 'repeated failure')
  assert.equal(
    apiGenerator.formatError(repeated),
    'repeated failure [1. shared cause; 2. shared cause]',
  )

  const cyclic = new Error('cyclic failure')
  cyclic.cause = cyclic
  assert.equal(
    apiGenerator.formatError(cyclic),
    'cyclic failure [cause: [circular error]]',
  )
})

test('invokes a TypeDoc script through process.execPath with an argument array', () =>
  withTempDir((root) => {
    const spaced = join(root, 'path with spaces')
    mkdirSync(spaced)
    const binary = join(spaced, 'typedoc fixture.mjs')
    const configPath = join(spaced, 'typedoc config.json')
    const modelPath = join(spaced, 'api model.json')
    writeFileSync(configPath, '{}\n')
    writeFileSync(
      binary,
      `import { writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
if (args.includes('--skipErrorChecking')) process.exit(91)
const optionsIndex = args.indexOf('--options')
const jsonIndex = args.indexOf('--json')
if (optionsIndex < 0 || jsonIndex < 0 || args[optionsIndex + 1] !== ${JSON.stringify(configPath)}) process.exit(92)
writeFileSync(args[jsonIndex + 1], JSON.stringify({ schemaVersion: '2.0', name: '@glucoseiq/core' }))
`,
    )

    const result = runTypeDoc({ binaryPath: binary, configPath, modelPath })
    assert.equal(result.status, 0)
    assert.deepEqual(JSON.parse(readFileSync(modelPath, 'utf8')), {
      schemaVersion: '2.0',
      name: '@glucoseiq/core',
    })
  }))

test('accepts only the canonical managed output or owned glucoseiq-api temp descendants', () =>
  withTempDir((root) => {
    const canonical = join(DOCS_DIR, 'content/docs/api/core')
    const safeTemporaryOutput = join(root, 'candidate', 'core')
    assert.equal(apiGenerator.validateManagedOutputDirectory(canonical), realpathSync(canonical))
    assert.equal(
      apiGenerator.validateManagedOutputDirectory(safeTemporaryOutput),
      safeTemporaryOutput,
    )

    for (const unsafe of [REPO_ROOT, join(DOCS_DIR, 'content/docs/api'), tmpdir(), root]) {
      assert.throws(
        () => apiGenerator.validateManagedOutputDirectory(unsafe),
        /Refusing unsafe generated API output directory/,
      )
    }

    const realParent = join(root, 'real-parent')
    const linkedParent = join(root, 'linked-parent')
    mkdirSync(realParent)
    symlinkSync(realParent, linkedParent, 'dir')
    assert.throws(
      () => apiGenerator.validateManagedOutputDirectory(join(linkedParent, 'core')),
      /symlink/i,
    )
  }))

test('rejects dangling symlinks in the managed output path', () =>
  withTempDir((root) => {
    const danglingOutput = join(root, 'dangling-output')
    symlinkSync(join(root, 'missing-output'), danglingOutput, 'dir')
    assert.throws(
      () => apiGenerator.validateManagedOutputDirectory(danglingOutput),
      /symlink component.*dangling-output/iu,
    )

    const danglingParent = join(root, 'dangling-parent')
    symlinkSync(join(root, 'missing-parent'), danglingParent, 'dir')
    assert.throws(
      () => apiGenerator.validateManagedOutputDirectory(join(danglingParent, 'core')),
      /symlink component.*dangling-parent/iu,
    )
  }))

test('rejects an unsafe requested output before spawning TypeDoc', () => {
  assert.throws(
    () =>
      generateApiReference({
        outputDir: REPO_ROOT,
        typedocBinaryPath: join(REPO_ROOT, 'does-not-exist.mjs'),
        typedocConfigPath: join(REPO_ROOT, 'does-not-exist.json'),
      }),
    /Refusing unsafe generated API output directory/,
  )
})

test('a staging copy failure preserves prior managed bytes and cleans transaction files', () =>
  withTempDir((root) => {
    const candidate = join(root, 'candidate')
    const output = join(root, 'managed')
    mkdirSync(candidate)
    mkdirSync(output)
    writeFileSync(join(candidate, 'index.mdx'), 'new bytes\n')
    writeFileSync(join(output, 'index.mdx'), 'prior bytes\n')

    assert.throws(
      () =>
        apiGenerator.replaceManagedOutputTransactional(candidate, output, {
          copyDirectory() {
            throw new Error('injected copy failure')
          },
        }),
      /injected copy failure/,
    )
    assert.equal(readFileSync(join(output, 'index.mdx'), 'utf8'), 'prior bytes\n')
    assert.deepEqual(
      readdirSync(root).filter((name) => name.includes('staging') || name.includes('backup')),
      [],
    )
  }))

test('rejects a symlink used as the generated candidate root', () =>
  withTempDir((root) => {
    const realCandidate = join(root, 'real-candidate')
    const candidate = join(root, 'candidate')
    const output = join(root, 'managed')
    mkdirSync(realCandidate)
    mkdirSync(output)
    writeFileSync(join(realCandidate, 'index.mdx'), 'new bytes\n')
    writeFileSync(join(output, 'index.mdx'), 'prior bytes\n')
    symlinkSync(realCandidate, candidate, 'dir')

    assert.throws(
      () => apiGenerator.replaceManagedOutputTransactional(candidate, output),
      /Symlink is not allowed in generated API candidate: \./,
    )
    assert.equal(readFileSync(join(output, 'index.mdx'), 'utf8'), 'prior bytes\n')
  }))

test('rejects a symlink injected as the staged tree root', () =>
  withTempDir((root) => {
    const candidate = join(root, 'candidate')
    const output = join(root, 'managed')
    mkdirSync(candidate)
    mkdirSync(output)
    writeFileSync(join(candidate, 'index.mdx'), 'new bytes\n')
    writeFileSync(join(output, 'index.mdx'), 'prior bytes\n')

    assert.throws(
      () =>
        apiGenerator.replaceManagedOutputTransactional(candidate, output, {
          copyDirectory(source, destination) {
            symlinkSync(source, destination, 'dir')
          },
        }),
      /Symlink is not allowed in generated API candidate: \./,
    )
    assert.equal(readFileSync(join(output, 'index.mdx'), 'utf8'), 'prior bytes\n')
  }))

test('a failed stage-to-target rename rolls the prior managed tree back', () =>
  withTempDir((root) => {
    const candidate = join(root, 'candidate')
    const output = join(root, 'managed')
    mkdirSync(candidate)
    mkdirSync(output)
    writeFileSync(join(candidate, 'index.mdx'), 'new bytes\n')
    writeFileSync(join(output, 'index.mdx'), 'prior bytes\n')
    let renameCount = 0

    assert.throws(
      () =>
        apiGenerator.replaceManagedOutputTransactional(candidate, output, {
          renamePath(source, destination) {
            renameCount += 1
            if (renameCount === 2) throw new Error('injected swap failure')
            renameSync(source, destination)
          },
        }),
      /injected swap failure/,
    )
    assert.equal(renameCount, 3)
    assert.equal(readFileSync(join(output, 'index.mdx'), 'utf8'), 'prior bytes\n')
    assert.deepEqual(
      readdirSync(root).filter((name) => name.includes('staging') || name.includes('backup')),
      [],
    )
  }))

test('a partial prior-backup cleanup keeps the committed canonical tree and returns a warning', () =>
  withTempDir((root) => {
    const candidate = join(root, 'candidate')
    const output = join(root, 'managed')
    const cleanupError = new Error('injected backup cleanup failure')
    let residualBackup
    mkdirSync(candidate)
    mkdirSync(output)
    writeFileSync(join(candidate, 'a.mdx'), 'new a\n')
    writeFileSync(join(candidate, 'b.mdx'), 'new b\n')
    writeFileSync(join(output, 'a.mdx'), 'prior a\n')
    writeFileSync(join(output, 'b.mdx'), 'prior b\n')

    const result = apiGenerator.replaceManagedOutputTransactional(candidate, output, {
      removePath(path) {
        if (path.includes('-backup-')) {
          residualBackup = path
          rmSync(join(path, 'a.mdx'), { force: true })
          throw cleanupError
        }
        rmSync(path, { recursive: true, force: true })
      },
    })

    assert.deepEqual(result.cleanupWarnings, [
      {
        phase: 'prior-backup',
        path: residualBackup,
        error: cleanupError,
      },
    ])
    assert.equal(readFileSync(join(output, 'a.mdx'), 'utf8'), 'new a\n')
    assert.equal(readFileSync(join(output, 'b.mdx'), 'utf8'), 'new b\n')
    assert.deepEqual(readdirSync(residualBackup), ['b.mdx'])
    assert.equal(readFileSync(join(residualBackup, 'b.mdx'), 'utf8'), 'prior b\n')
    assert.equal(
      readdirSync(root).filter((name) => name.startsWith('.managed-staging-')).length,
      0,
    )
  }))

test('a failed install and failed rollback preserve recovery paths in error order', () =>
  withTempDir((root) => {
    const candidate = join(root, 'candidate')
    const output = join(root, 'managed')
    const swapError = new Error('injected install failure')
    const rollbackError = new Error('injected rollback failure')
    let renameCount = 0
    let transactionError
    mkdirSync(candidate)
    mkdirSync(output)
    writeFileSync(join(candidate, 'index.mdx'), 'new bytes\n')
    writeFileSync(join(output, 'index.mdx'), 'prior bytes\n')

    assert.throws(
      () =>
        apiGenerator.replaceManagedOutputTransactional(candidate, output, {
          renamePath(source, destination) {
            renameCount += 1
            if (renameCount === 2) throw swapError
            if (renameCount === 3) throw rollbackError
            renameSync(source, destination)
          },
        }),
      (error) => {
        assert.ok(error instanceof AggregateError)
        assert.deepEqual(error.errors, [swapError, rollbackError])
        transactionError = error
        return true
      },
    )

    assert.equal(existsSync(output), false)
    const transactionPaths = readdirSync(root).filter(
      (name) => name.includes('staging') || name.includes('backup'),
    )
    assert.equal(transactionPaths.length, 2)
    const stagingRoot = transactionPaths.find((name) => name.startsWith('.managed-staging-'))
    const backup = transactionPaths.find((name) => name.startsWith('.managed-backup-'))
    assert.match(transactionError.message, /Recovery paths:/)
    assert.ok(transactionError.message.includes(join(root, stagingRoot, 'tree')))
    assert.ok(transactionError.message.includes(join(root, backup)))
    assert.equal(
      readFileSync(join(root, stagingRoot, 'tree', 'index.mdx'), 'utf8'),
      'new bytes\n',
    )
    assert.equal(readFileSync(join(root, backup, 'index.mdx'), 'utf8'), 'prior bytes\n')
  }))

test('a pre-commit failure keeps primary and cleanup errors in deterministic order', () =>
  withTempDir((root) => {
    const candidate = join(root, 'candidate')
    const output = join(root, 'managed')
    const primaryError = new Error('injected copy failure')
    const cleanupError = new Error('injected transaction cleanup failure')
    mkdirSync(candidate)
    mkdirSync(output)
    writeFileSync(join(candidate, 'index.mdx'), 'new bytes\n')
    writeFileSync(join(output, 'index.mdx'), 'prior bytes\n')

    assert.throws(
      () =>
        apiGenerator.replaceManagedOutputTransactional(candidate, output, {
          copyDirectory() {
            throw primaryError
          },
          removePath() {
            throw cleanupError
          },
        }),
      (error) => {
        assert.ok(error instanceof AggregateError)
        assert.deepEqual(error.errors, [primaryError, cleanupError])
        return true
      },
    )

    assert.equal(readFileSync(join(output, 'index.mdx'), 'utf8'), 'prior bytes\n')
    assert.equal(
      readdirSync(root).filter((name) => name.startsWith('.managed-staging-')).length,
      1,
    )
  }))

test('post-commit transaction cleanup returns a warning without undoing new bytes', () =>
  withTempDir((root) => {
    const candidate = join(root, 'candidate')
    const output = join(root, 'managed')
    const cleanupError = new Error('injected committed cleanup failure')
    let retainedTransactionRoot
    mkdirSync(candidate)
    mkdirSync(output)
    writeFileSync(join(candidate, 'index.mdx'), 'new bytes\n')
    writeFileSync(join(output, 'index.mdx'), 'prior bytes\n')

    const result = apiGenerator.replaceManagedOutputTransactional(candidate, output, {
      removePath(path) {
        if (path.includes('-backup-')) {
          rmSync(path, { recursive: true, force: true })
          return
        }
        retainedTransactionRoot = path
        throw cleanupError
      },
    })

    assert.deepEqual(result.cleanupWarnings, [
      {
        phase: 'transaction-root',
        path: retainedTransactionRoot,
        error: cleanupError,
      },
    ])
    assert.equal(readFileSync(join(output, 'index.mdx'), 'utf8'), 'new bytes\n')
    assert.deepEqual(readdirSync(retainedTransactionRoot), [])
    assert.equal(
      readdirSync(root).filter((name) => name.startsWith('.managed-backup-')).length,
      0,
    )
  }))

test('generator returns transaction and temporary cleanup warnings after commit', () =>
  withTempDir((root) => {
    const output = join(root, 'managed')
    const configPath = join(root, 'typedoc.json')
    const binary = join(root, 'typedoc-success.mjs')
    const backupCleanupError = new Error('injected backup cleanup failure')
    const transactionCleanupError = new Error('injected transaction cleanup failure')
    const temporaryCleanupError = new Error('injected temporary cleanup failure')
    let retainedBackup
    let retainedTransactionRoot
    let retainedTemporaryRoot
    mkdirSync(output)
    writeFileSync(join(output, 'prior.mdx'), 'prior bytes\n')
    writeFileSync(configPath, '{}\n')
    writeFileSync(
      binary,
      `import { writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify({ id: 0, name: '@glucoseiq/core', variant: 'project', kind: 1, flags: {}, schemaVersion: '2.0', children: [] }))
`,
    )

    try {
      const result = generateApiReference({
        outputDir: output,
        typedocBinaryPath: binary,
        typedocConfigPath: configPath,
        transactionOperations: {
          removePath(path) {
            if (path.includes('-backup-')) {
              retainedBackup = path
              throw backupCleanupError
            }
            retainedTransactionRoot = path
            throw transactionCleanupError
          },
        },
        removeTemporaryRoot(path) {
          retainedTemporaryRoot = path
          throw temporaryCleanupError
        },
      })

      assert.deepEqual(result.cleanupWarnings, [
        {
          phase: 'prior-backup',
          path: retainedBackup,
          error: backupCleanupError,
        },
        {
          phase: 'transaction-root',
          path: retainedTransactionRoot,
          error: transactionCleanupError,
        },
        {
          phase: 'generation-temporary-root',
          path: retainedTemporaryRoot,
          error: temporaryCleanupError,
        },
      ])
      assert.deepEqual(inventoryRegularFiles(output), [
        'constants.mdx',
        'errors.mdx',
        'index.mdx',
        'meta.json',
        'types.mdx',
      ])
      assert.equal(readFileSync(join(retainedBackup, 'prior.mdx'), 'utf8'), 'prior bytes\n')
    } finally {
      if (retainedTemporaryRoot) {
        rmSync(retainedTemporaryRoot, { recursive: true, force: true })
      }
    }
  }))

test('generator preserves a pre-commit error before temporary cleanup failure', () =>
  withTempDir((root) => {
    const output = join(root, 'managed')
    const configPath = join(root, 'typedoc.json')
    const binary = join(root, 'typedoc-fail.mjs')
    const cleanupError = new Error('injected temporary cleanup failure')
    let retainedTemporaryRoot
    mkdirSync(output)
    writeFileSync(join(output, 'prior.mdx'), 'prior bytes\n')
    writeFileSync(configPath, '{}\n')
    writeFileSync(binary, 'process.exit(19)\n')

    try {
      assert.throws(
        () =>
          generateApiReference({
            outputDir: output,
            typedocBinaryPath: binary,
            typedocConfigPath: configPath,
            removeTemporaryRoot(path) {
              retainedTemporaryRoot = path
              throw cleanupError
            },
          }),
        (error) => {
          assert.ok(error instanceof AggregateError)
          assert.match(error.errors[0].message, /TypeDoc exited with status 19/)
          assert.equal(error.errors[1], cleanupError)
          return true
        },
      )
      assert.equal(readFileSync(join(output, 'prior.mdx'), 'utf8'), 'prior bytes\n')
    } finally {
      if (retainedTemporaryRoot) {
        rmSync(retainedTemporaryRoot, { recursive: true, force: true })
      }
    }
  }))

test('outer cleanup preserves nested rollback causes and recovery paths in diagnostics', () =>
  withTempDir((root) => {
    const output = join(root, 'managed')
    const configPath = join(root, 'typedoc.json')
    const binary = join(root, 'typedoc-success.mjs')
    const swapError = new Error('injected install failure')
    const rollbackError = new Error('injected rollback failure')
    const temporaryCleanupError = new Error('injected temporary cleanup failure')
    let renameCount = 0
    let retainedTemporaryRoot
    let outerError
    mkdirSync(output)
    writeFileSync(join(output, 'prior.mdx'), 'prior bytes\n')
    writeFileSync(configPath, '{}\n')
    writeFileSync(
      binary,
      `import { writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify({ id: 0, name: '@glucoseiq/core', variant: 'project', kind: 1, flags: {}, schemaVersion: '2.0', children: [] }))
`,
    )

    try {
      assert.throws(
        () =>
          generateApiReference({
            outputDir: output,
            typedocBinaryPath: binary,
            typedocConfigPath: configPath,
            transactionOperations: {
              renamePath(source, destination) {
                renameCount += 1
                if (renameCount === 2) throw swapError
                if (renameCount === 3) throw rollbackError
                renameSync(source, destination)
              },
            },
            removeTemporaryRoot(path) {
              retainedTemporaryRoot = path
              throw temporaryCleanupError
            },
          }),
        (error) => {
          assert.ok(error instanceof AggregateError)
          assert.ok(error.errors[0] instanceof AggregateError)
          assert.deepEqual(error.errors[0].errors, [swapError, rollbackError])
          assert.equal(error.errors[1], temporaryCleanupError)
          outerError = error
          return true
        },
      )

      const transactionPaths = readdirSync(root).filter(
        (name) => name.includes('staging') || name.includes('backup'),
      )
      const stagingRoot = transactionPaths.find((name) => name.startsWith('.managed-staging-'))
      const backup = transactionPaths.find((name) => name.startsWith('.managed-backup-'))
      const formatted = apiGenerator.formatError(outerError)
      assert.ok(formatted.indexOf(swapError.message) < formatted.indexOf(rollbackError.message))
      assert.ok(formatted.indexOf(rollbackError.message) < formatted.indexOf(temporaryCleanupError.message))
      assert.ok(formatted.includes(join(root, stagingRoot, 'tree')))
      assert.ok(formatted.includes(join(root, backup)))
    } finally {
      if (retainedTemporaryRoot) {
        rmSync(retainedTemporaryRoot, { recursive: true, force: true })
      }
    }
  }))

test('does not replace requested output when TypeDoc or model validation fails', () =>
  withTempDir((root) => {
    const outputDir = join(root, 'tracked-output')
    const configPath = join(root, 'typedoc.json')
    const failingBinary = join(root, 'typedoc-fail.mjs')
    const invalidBinary = join(root, 'typedoc-invalid.mjs')
    const unrenderableBinary = join(root, 'typedoc-unrenderable.mjs')
    mkdirSync(outputDir)
    writeFileSync(join(outputDir, 'sentinel.mdx'), 'tracked bytes\n')
    writeFileSync(configPath, '{}\n')
    writeFileSync(failingBinary, 'process.exit(7)\n')
    writeFileSync(
      invalidBinary,
      `import { writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify({ schemaVersion: '1.0', name: '@glucoseiq/core' }))
`,
    )
    writeFileSync(
      unrenderableBinary,
      `import { writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify({ id: 0, name: '@glucoseiq/core', variant: 'project', kind: 1, flags: {}, schemaVersion: '2.0', children: [{ id: 1, name: 'FutureExport', variant: 'declaration', kind: 16777216, flags: {}, sources: [{ fileName: 'src/future.ts' }] }] }))
`,
    )

    assert.throws(
      () =>
        generateApiReference({
          outputDir,
          typedocBinaryPath: failingBinary,
          typedocConfigPath: configPath,
        }),
      /status 7/,
    )
    assert.deepEqual(inventoryRegularFiles(outputDir), ['sentinel.mdx'])
    assert.equal(readFileSync(join(outputDir, 'sentinel.mdx'), 'utf8'), 'tracked bytes\n')

    assert.throws(
      () =>
        generateApiReference({
          outputDir,
          typedocBinaryPath: invalidBinary,
          typedocConfigPath: configPath,
        }),
      /schema 2\.0/,
    )
    assert.deepEqual(inventoryRegularFiles(outputDir), ['sentinel.mdx'])
    assert.equal(readFileSync(join(outputDir, 'sentinel.mdx'), 'utf8'), 'tracked bytes\n')

    assert.throws(
      () =>
        generateApiReference({
          outputDir,
          typedocBinaryPath: unrenderableBinary,
          typedocConfigPath: configPath,
        }),
      /Unsupported TypeDoc reflection kind/,
    )
    assert.deepEqual(inventoryRegularFiles(outputDir), ['sentinel.mdx'])
    assert.equal(readFileSync(join(outputDir, 'sentinel.mdx'), 'utf8'), 'tracked bytes\n')
  }))

test('generator temporary roots are cleaned after a failure', () =>
  withTempDir((root) => {
    const outputDir = join(root, 'managed')
    const configPath = join(root, 'typedoc.json')
    const binary = join(root, 'typedoc-fail.mjs')
    mkdirSync(outputDir)
    writeFileSync(configPath, '{}\n')
    writeFileSync(binary, 'process.exit(9)\n')
    const processPrefix = `glucoseiq-api-${process.pid}-`
    const before = readdirSync(tmpdir())
      .filter((name) => name.startsWith(processPrefix))
      .toSorted()
    let generatedTemporaryRoot
    assert.throws(
      () =>
        generateApiReference({
          outputDir,
          typedocBinaryPath: binary,
          typedocConfigPath: configPath,
          removeTemporaryRoot(path) {
            generatedTemporaryRoot = path
            rmSync(path, { recursive: true, force: true })
          },
        }),
      /status 9/,
    )
    assert.ok(generatedTemporaryRoot.startsWith(join(tmpdir(), processPrefix)))
    const after = readdirSync(tmpdir())
      .filter((name) => name.startsWith(processPrefix))
      .toSorted()
    assert.deepEqual(after, before)
  }))

test('writes only a fully rendered candidate into the requested managed directory', () =>
  withTempDir((root) => {
    const outputDir = join(root, 'managed')
    const configPath = join(root, 'typedoc.json')
    const binary = join(root, 'typedoc-success.mjs')
    mkdirSync(outputDir)
    writeFileSync(join(outputDir, 'stale.mdx'), 'stale\n')
    writeFileSync(configPath, '{}\n')
    writeFileSync(
      binary,
      `import { writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify({ id: 0, name: '@glucoseiq/core', variant: 'project', kind: 1, flags: {}, schemaVersion: '2.0', children: [] }))
`,
    )

    generateApiReference({
      outputDir,
      typedocBinaryPath: binary,
      typedocConfigPath: configPath,
    })

    assert.deepEqual(inventoryRegularFiles(outputDir), [
      'constants.mdx',
      'errors.mdx',
      'index.mdx',
      'meta.json',
      'types.mdx',
    ])
    assert.match(readFileSync(join(outputDir, 'index.mdx'), 'utf8'), /@glucoseiq\/core API/)
  }))

test('inventories only regular files with normalized code-point-sorted paths', () =>
  withTempDir((root) => {
    mkdirSync(join(root, 'nested'))
    writeFileSync(join(root, 'a.mdx'), 'a')
    writeFileSync(join(root, 'Z.mdx'), 'z')
    writeFileSync(join(root, 'ä.mdx'), 'unicode')
    writeFileSync(join(root, '\uE000.mdx'), 'private-use')
    writeFileSync(join(root, '\u{10000}.mdx'), 'astral')
    writeFileSync(join(root, 'nested', 'b.mdx'), 'b')
    assert.deepEqual(inventoryRegularFiles(root), [
      'Z.mdx',
      'a.mdx',
      'nested/b.mdx',
      'ä.mdx',
      '\uE000.mdx',
      '\u{10000}.mdx',
    ])
  }))

test('rejects symlinks while recursively inventorying managed output', () =>
  withTempDir((root) => {
    writeFileSync(join(root, 'target.mdx'), 'target')
    symlinkSync(join(root, 'target.mdx'), join(root, 'linked.mdx'))
    assert.throws(
      () => inventoryRegularFiles(root),
      /Symlink is not allowed in managed API output: linked\.mdx/,
    )
  }))

test('rejects a symlink used as the managed output root', () =>
  withTempDir((root) => {
    const realRoot = join(root, 'real-root')
    const linkedRoot = join(root, 'linked-root')
    mkdirSync(realRoot)
    symlinkSync(realRoot, linkedRoot, 'dir')
    assert.throws(
      () => inventoryRegularFiles(linkedRoot),
      /Symlink is not allowed in managed API output: \./,
    )
  }))

test('reports every nested missing, extra, and byte-changed managed file', () =>
  withTempDir((root) => {
    const expected = join(root, 'expected')
    const actual = join(root, 'actual')
    mkdirSync(join(expected, 'nested'), { recursive: true })
    mkdirSync(join(actual, 'nested'), { recursive: true })
    writeFileSync(join(expected, 'same.mdx'), 'same\n')
    writeFileSync(join(actual, 'same.mdx'), 'same\n')
    writeFileSync(join(expected, 'nested', 'missing.mdx'), 'missing\n')
    writeFileSync(join(actual, 'nested', 'extra.mdx'), 'extra\n')
    writeFileSync(join(expected, 'changed.mdx'), Buffer.from([0, 1, 2]))
    writeFileSync(join(actual, 'changed.mdx'), Buffer.from([0, 1, 3]))
    writeFileSync(join(expected, 'invalid-utf8.mdx'), Buffer.from([0xff, 0xfe]))
    writeFileSync(join(actual, 'invalid-utf8.mdx'), Buffer.from([0xff, 0xfd]))

    assert.deepEqual(compareManagedTrees(expected, actual), {
      missing: ['nested/missing.mdx'],
      extra: ['nested/extra.mdx'],
      changed: ['changed.mdx', 'invalid-utf8.mdx'],
    })
  }))

test('reports no drift for identical trees and excludes hand-written API root files', () =>
  withTempDir((root) => {
    const candidateApi = join(root, 'candidate-api')
    const trackedApi = join(root, 'tracked-api')
    mkdirSync(join(candidateApi, 'core'), { recursive: true })
    mkdirSync(join(trackedApi, 'core'), { recursive: true })
    writeFileSync(join(candidateApi, 'core', 'index.mdx'), 'generated\n')
    cpSync(join(candidateApi, 'core'), join(trackedApi, 'core'), {
      recursive: true,
      force: true,
    })
    writeFileSync(join(candidateApi, 'index.mdx'), 'candidate hand-written bytes\n')
    writeFileSync(join(candidateApi, 'meta.json'), '{"candidate":true}\n')
    writeFileSync(join(trackedApi, 'index.mdx'), 'tracked hand-written bytes\n')
    writeFileSync(join(trackedApi, 'meta.json'), '{"tracked":true}\n')

    assert.deepEqual(
      compareManagedTrees(join(candidateApi, 'core'), join(trackedApi, 'core')),
      { missing: [], extra: [], changed: [] },
    )
  }))

test('formats every drift category for CLI reporting', () => {
  assert.deepEqual(
    apiCheck.formatDrift({
      missing: ['nested/missing.mdx'],
      extra: ['extra.mdx'],
      changed: ['changed.mdx'],
    }),
    [
      'missing: nested/missing.mdx',
      'extra: extra.mdx',
      'changed: changed.mdx',
    ],
  )
})

test('drift commands fail and diagnose every falsy non-object throw', async (t) => {
  const cases = [
    { label: 'undefined from generation', value: undefined, source: 'generation', diagnostic: 'undefined' },
    { label: 'null from comparison', value: null, source: 'comparison', diagnostic: 'null' },
    { label: 'false from generation', value: false, source: 'generation', diagnostic: 'false' },
    { label: 'zero from comparison', value: 0, source: 'comparison', diagnostic: '0' },
    { label: 'empty string from comparison', value: '', source: 'comparison', diagnostic: '""' },
  ]

  for (const { label, value, source, diagnostic } of cases) {
    await t.test(label, () => {
      const stdout = []
      const stderr = []
      const exitCode = apiCheck.runCheckApiCommand({
        trackedDirectory: '/unused',
        checkDrift() {
          return checkApiDrift({
            generateReference() {
              if (source === 'generation') throw value
              return { cleanupWarnings: [] }
            },
            compareTrees() {
              if (source === 'comparison') throw value
              return { missing: [], extra: [], changed: [] }
            },
          })
        },
        writeStdout(line) {
          stdout.push(line)
        },
        writeStderr(line) {
          stderr.push(line)
        },
      })

      assert.equal(exitCode, 1)
      assert.deepEqual(stdout, [])
      assert.deepEqual(stderr, [`Thrown non-Error value: ${diagnostic}`])
    })
  }
})

test('drift retains a primitive primary failure with ordered cleanup warnings', () => {
  const primaryFailure = 0
  const generationWarning = {
    phase: 'generation-temporary-root',
    path: '/tmp/glucoseiq-api-primitive-generation-residual',
    error: new Error('injected primitive generation cleanup failure'),
  }
  const driftCleanupError = new Error('injected primitive drift cleanup failure')
  let retainedDriftRoot
  try {
    assert.throws(
      () =>
        checkApiDrift({
          generateReference() {
            return { cleanupWarnings: [generationWarning] }
          },
          compareTrees() {
            throw primaryFailure
          },
          removeTemporaryRoot(path) {
            retainedDriftRoot = path
            throw driftCleanupError
          },
        }),
      (error) => {
        assert.equal(apiCheck.primaryFailureForError(error), primaryFailure)
        const warnings = apiCheck.cleanupWarningsForError(error)
        assert.deepEqual(warnings, [
          generationWarning,
          {
            phase: 'drift-temporary-root',
            path: retainedDriftRoot,
            error: driftCleanupError,
          },
        ])
        assert.deepEqual(apiCheck.formatCheckFailure(error), {
          exitCode: 1,
          stdout: [],
          stderr: [
            ...warnings.map(apiGenerator.formatCleanupWarning),
            'Thrown non-Error value: 0',
          ],
        })
        return true
      },
    )
  } finally {
    if (retainedDriftRoot) {
      rmSync(retainedDriftRoot, { recursive: true, force: true })
    }
  }
})

test('drift carries ordered cleanup warnings to a successful CLI report', () =>
  withTempDir((root) => {
    const generationError = new Error('injected generation cleanup failure')
    const driftError = new Error('injected drift cleanup failure')
    const generationWarning = {
      phase: 'generation-temporary-root',
      path: '/tmp/glucoseiq-api-generation-residual',
      error: generationError,
    }
    let retainedDriftRoot
    try {
      const result = checkApiDrift({
        trackedDirectory: root,
        generateReference() {
          return { cleanupWarnings: [generationWarning] }
        },
        compareTrees() {
          return { missing: [], extra: [], changed: [] }
        },
        removeTemporaryRoot(path) {
          retainedDriftRoot = path
          throw driftError
        },
      })

      assert.deepEqual(result.cleanupWarnings, [
        generationWarning,
        {
          phase: 'drift-temporary-root',
          path: retainedDriftRoot,
          error: driftError,
        },
      ])
      const report = apiCheck.formatCheckReport(result)
      assert.equal(report.exitCode, 0)
      assert.deepEqual(report.stdout, [
        'Generated API reference matches the tracked api/core files byte-for-byte.',
      ])
      assert.deepEqual(report.stderr, result.cleanupWarnings.map(apiGenerator.formatCleanupWarning))
    } finally {
      if (retainedDriftRoot) {
        rmSync(retainedDriftRoot, { recursive: true, force: true })
      }
    }
  }))

test('drift cleanup cannot mask a primary failure', () => {
  const primaryError = new Error('injected drift primary failure')
  const cleanupError = new Error('injected drift cleanup failure')
  let retainedDriftRoot
  try {
    assert.throws(
      () =>
        checkApiDrift({
          generateReference() {
            throw primaryError
          },
          removeTemporaryRoot(path) {
            retainedDriftRoot = path
            throw cleanupError
          },
        }),
      (error) => {
        assert.strictEqual(error, primaryError)
        assert.deepEqual(apiCheck.cleanupWarningsForError(error), [
          {
            phase: 'drift-temporary-root',
            path: retainedDriftRoot,
            error: cleanupError,
          },
        ])
        return true
      },
    )
  } finally {
    if (retainedDriftRoot) {
      rmSync(retainedDriftRoot, { recursive: true, force: true })
    }
  }
})

test('drift preserves ordered generation and drift cleanup warnings on a comparison failure', () => {
  const primaryError = new Error('injected comparison failure')
  const generationWarning = {
    phase: 'generation-temporary-root',
    path: '/tmp/glucoseiq-api-generation-residual',
    error: new Error('injected generation cleanup failure'),
  }
  const driftCleanupError = new Error('injected drift cleanup failure')
  let retainedDriftRoot
  try {
    assert.throws(
      () =>
        checkApiDrift({
          generateReference() {
            return { cleanupWarnings: [generationWarning] }
          },
          compareTrees() {
            throw primaryError
          },
          removeTemporaryRoot(path) {
            retainedDriftRoot = path
            throw driftCleanupError
          },
        }),
      (error) => {
        assert.strictEqual(error, primaryError)
        const warnings = apiCheck.cleanupWarningsForError(error)
        assert.deepEqual(warnings, [
          generationWarning,
          {
            phase: 'drift-temporary-root',
            path: retainedDriftRoot,
            error: driftCleanupError,
          },
        ])
        const report = apiCheck.formatCheckFailure(error)
        assert.equal(report.exitCode, 1)
        assert.deepEqual(report.stdout, [])
        assert.deepEqual(report.stderr, [
          ...warnings.map(apiGenerator.formatCleanupWarning),
          'injected comparison failure',
        ])
        return true
      },
    )
  } finally {
    if (retainedDriftRoot) {
      rmSync(retainedDriftRoot, { recursive: true, force: true })
    }
  }
})

test('drift command prints cleanup guidance before a primary comparison failure', () => {
  const primaryError = new Error('injected command comparison failure')
  const generationWarning = {
    phase: 'generation-temporary-root',
    path: '/tmp/glucoseiq-api-command-generation-residual',
    error: new Error('injected command generation cleanup failure'),
  }
  const driftCleanupError = new Error('injected command drift cleanup failure')
  const stdout = []
  const stderr = []
  let retainedDriftRoot
  try {
    const exitCode = apiCheck.runCheckApiCommand({
      trackedDirectory: '/unused',
      checkDrift() {
        return checkApiDrift({
          generateReference() {
            return { cleanupWarnings: [generationWarning] }
          },
          compareTrees() {
            throw primaryError
          },
          removeTemporaryRoot(path) {
            retainedDriftRoot = path
            throw driftCleanupError
          },
        })
      },
      writeStdout(line) {
        stdout.push(line)
      },
      writeStderr(line) {
        stderr.push(line)
      },
    })

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.deepEqual(stderr, [
      apiGenerator.formatCleanupWarning(generationWarning),
      apiGenerator.formatCleanupWarning({
        phase: 'drift-temporary-root',
        path: retainedDriftRoot,
        error: driftCleanupError,
      }),
      'injected command comparison failure',
    ])
  } finally {
    if (retainedDriftRoot) {
      rmSync(retainedDriftRoot, { recursive: true, force: true })
    }
  }
})

test('drift clears stale cleanup warnings when the same error is reused', () => {
  const reusedError = new Error('reused comparison failure')
  const priorWarning = {
    phase: 'generation-temporary-root',
    path: '/tmp/glucoseiq-api-prior-residual',
    error: new Error('prior cleanup failure'),
  }

  assert.throws(
    () =>
      checkApiDrift({
        generateReference() {
          return { cleanupWarnings: [priorWarning] }
        },
        compareTrees() {
          throw reusedError
        },
      }),
    (error) => {
      assert.strictEqual(error, reusedError)
      assert.deepEqual(apiCheck.cleanupWarningsForError(error), [priorWarning])
      return true
    },
  )

  assert.throws(
    () =>
      checkApiDrift({
        generateReference() {
          return { cleanupWarnings: [] }
        },
        compareTrees() {
          throw reusedError
        },
      }),
    (error) => {
      assert.strictEqual(error, reusedError)
      assert.deepEqual(apiCheck.cleanupWarningsForError(error), [])
      return true
    },
  )
})

test('the drift CLI reports all categories and leaves an argv-selected fixture unchanged', () =>
  withTempDir((root) => {
    const fixture = join(root, 'tracked-core')
    cpSync(join(DOCS_DIR, 'content/docs/api/core'), fixture, { recursive: true })
    rmSync(join(fixture, 'agp.mdx'))
    writeFileSync(join(fixture, 'extra.mdx'), 'extra bytes\n')
    writeFileSync(join(fixture, 'cohort.mdx'), 'changed bytes\n')
    const before = snapshotRegularTree(fixture)

    const result = spawnSync(
      process.execPath,
      [join(SCRIPT_DIR, 'check-api.mjs'), fixture],
      { encoding: 'utf8', shell: false },
    )

    assert.equal(result.error, undefined)
    assert.equal(result.signal, null)
    assert.equal(result.status, 1)
    const output = `${result.stdout}\n${result.stderr}`
    assert.match(output, /missing: agp\.mdx/)
    assert.match(output, /extra: extra\.mdx/)
    assert.match(output, /changed: cohort\.mdx/)
    assert.deepEqual(snapshotRegularTree(fixture), before)
  }))

test('the drift command generates independently without mutating API root files', () => {
  const apiRoot = join(DOCS_DIR, 'content/docs/api')
  const managedRoot = join(apiRoot, 'core')
  const rootBefore = new Map([
    ['index.mdx', readFileSync(join(apiRoot, 'index.mdx')).toString('hex')],
    ['meta.json', readFileSync(join(apiRoot, 'meta.json')).toString('hex')],
  ])
  const managedBefore = snapshotRegularTree(managedRoot)
  assert.deepEqual(checkApiDrift(), {
    missing: [],
    extra: [],
    changed: [],
    cleanupWarnings: [],
  })
  assert.deepEqual(
    new Map([
      ['index.mdx', readFileSync(join(apiRoot, 'index.mdx')).toString('hex')],
      ['meta.json', readFileSync(join(apiRoot, 'meta.json')).toString('hex')],
    ]),
    rootBefore,
  )
  assert.deepEqual(snapshotRegularTree(managedRoot), managedBefore)
})

test('the repository contains exactly the managed core tree and no superseded flat pages', () => {
  const apiRoot = join(DOCS_DIR, 'content/docs/api')
  const managedFiles = inventoryRegularFiles(join(apiRoot, 'core'))
  assert.deepEqual(managedFiles, [
    ...MANAGED_CORE_MDX_SLUGS.map((slug) => `${slug}.mdx`),
    'index.mdx',
    'meta.json',
  ].toSorted())
  for (const slug of MANAGED_CORE_MDX_SLUGS) {
    assert.equal(existsSync(join(apiRoot, `${slug}.mdx`)), false, slug)
  }
  const rootMeta = JSON.parse(readFileSync(join(apiRoot, 'meta.json'), 'utf8'))
  assert.deepEqual(rootMeta.pages.slice(0, 2), ['index', 'core'])
  const rootIndex = readFileSync(join(apiRoot, 'index.mdx'), 'utf8')
  assert.match(rootIndex, /\/docs\/api\/core/)
  assert.doesNotMatch(
    rootIndex,
    new RegExp(`/docs/api/(?:${MANAGED_CORE_MDX_SLUGS.join('|')})(?:[)#/?]|$)`, 'u'),
  )
})

test('adds permanent redirects for every superseded flat core API page', async () => {
  const { createCoreApiRedirects } = await import('./lib/api-redirects.mjs')
  const redirects = createCoreApiRedirects()
  assert.deepEqual(
    redirects,
    MANAGED_CORE_MDX_SLUGS.map((slug) => ({
      source: `/docs/api/${slug}`,
      destination: `/docs/api/core/${slug}`,
      permanent: true,
    })),
  )
  assert.equal(Object.isFrozen(redirects), false)
  assert.ok(redirects.every((redirect) => !Object.isFrozen(redirect)))
  const nextConfigSource = readFileSync(join(DOCS_DIR, 'next.config.mjs'), 'utf8')
  assert.match(nextConfigSource, /import \{ createCoreApiRedirects \} from "\.\/scripts\/lib\/api-redirects\.mjs"/)
  assert.match(nextConfigSource, /redirects: async \(\) => createCoreApiRedirects\(\)/)
})

test('the real TypeDoc model is warning-free, schema 2.0, and renderable', () =>
  withTempDir((root) => {
    const { binaryPath } = resolveTypeDocBinary()
    const modelPath = join(root, 'api-model.json')
    const result = runTypeDoc({
      binaryPath,
      configPath: join(DOCS_DIR, 'typedoc.api.json'),
      modelPath,
    })
    assert.equal(result.status, 0)
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /\[warning\]|Found \d+ errors? and [1-9]\d* warnings?/i)
    const model = JSON.parse(readFileSync(modelPath, 'utf8'))
    assert.equal(model.schemaVersion, '2.0')
    assert.equal(model.name, '@glucoseiq/core')
    const files = renderApiModel(model)
    assert.deepEqual(
      [...files.keys()],
      [
        ...MANAGED_CORE_MDX_SLUGS.map((slug) => `${slug}.mdx`),
        'index.mdx',
        'meta.json',
      ].toSorted(),
    )
    for (const [path, source] of files) {
      if (path.endsWith('.mdx')) parseGeneratedFrontmatter(source)
    }
    const renderedMdx = [...files]
      .filter(([path]) => path.endsWith('.mdx'))
      .map(([, source]) => source)
      .join('\n')
    assert.doesNotMatch(renderedMdx, /= \.\.\./u)
    const renderedInternalLinks = renderedMdx.match(
      /\]\(\/docs\/api\/core\/[^)#\s]+#[^)\s]+\)/gu,
    ) ?? []
    assert.equal(renderedInternalLinks.length, countNumericInlineTagTargets(model))
    assert.doesNotMatch(renderedMdx, /\*\*See:\*\*\s*https?:\/\//u)
    assert.doesNotMatch(renderedMdx, /^\s*-\s+https?:\/\//mu)
    const renderedHeadings = [...files]
      .filter(([path]) => path.endsWith('.mdx') && path !== 'index.mdx')
      .flatMap(([, source]) => [...source.matchAll(/^### (.+)$/gmu)].map((match) => match[1]))
      .toSorted()
    const topLevelExports = (model.children ?? [])
      .filter((reflection) => !reflection.flags?.isPrivate && !reflection.flags?.isProtected)
      .map((reflection) => reflection.name)
      .toSorted()
    assert.deepEqual(renderedHeadings, topLevelExports)
    assert.match(files.get('types.mdx'), /interface OMHDataPoint<T = OMHBloodGlucose>/)
    assert.match(files.get('types.mdx'), /### FHIRCoding/)
    assert.match(files.get('types.mdx'), /### FHIRCodeableConcept/)
    assert.match(files.get('types.mdx'), /### FHIRQuantity/)
  }))
