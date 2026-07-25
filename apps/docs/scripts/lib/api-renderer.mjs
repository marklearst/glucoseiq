import { compareUnicodeScalars } from './unicode-scalar-compare.mjs'

const KIND = Object.freeze({
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
})

const PACKAGE_NAME = '@glucoseiq/core'
const GENERATED_API_FRAGMENT = 'ts fragment="generated API declaration or signature"'

const FUNCTION_CATEGORIES = Object.freeze([
  {
    slug: 'reports',
    title: 'Reports',
    description: 'Selected composed CGM analytics summaries.',
    matches: (file) => /(^|\/)analyze\.ts$/u.test(file),
  },
  {
    slug: 'agp',
    title: 'AGP & Metrics Aggregate',
    description: 'AGP-style percentile-band series and selected aggregate metrics.',
    matches: (file) => /(^|\/)metrics\/agp(?:-profile)?\.ts$/u.test(file),
  },
  {
    slug: 'time-in-range',
    title: 'Time in Range',
    description: 'Time-in-range, pregnancy, and tight-range calculations.',
    matches: (file) => /(^|\/)tir(?:-enhanced)?\.ts$/u.test(file),
  },
  {
    slug: 'score',
    title: 'Glucose IQ Score',
    description: 'The project-defined wellness score derived from GRI.',
    matches: (file) => /(^|\/)score\.ts$/u.test(file),
  },
  {
    slug: 'variability',
    title: 'Variability & Risk Metrics',
    description: 'Glucose variability and risk indices.',
    matches: (file) =>
      /(^|\/)(?:variability|mage|metrics\/(?:adrr|bgi|grade|gri|jindex|modd|conga|active-percent|m-value|igc|gvi-pgs|curve))\.ts$/u.test(
        file,
      ),
  },
  {
    slug: 'meals',
    title: 'Meals & AUC',
    description: 'Meal-response and area-under-the-curve analysis.',
    matches: (file) => /(^|\/)metrics\/(?:meal|auc)\.ts$/u.test(file),
  },
  {
    slug: 'episodes',
    title: 'Episodes',
    description: 'Timestamp-grouped hypoglycemia and hyperglycemia episode candidates.',
    matches: (file) => /(^|\/)metrics\/episodes\.ts$/u.test(file),
  },
  {
    slug: 'live',
    title: 'Live Model',
    description: 'Trend derivation and sensor staleness helpers.',
    matches: (file) => /(^|\/)live\.ts$/u.test(file),
  },
  {
    slug: 'series',
    title: 'Time-Series Primitives',
    description: 'Gap detection, day/night splitting, and grid alignment.',
    matches: (file) => /(^|\/)(?:timeseries|align)\.ts$/u.test(file),
  },
  {
    slug: 'cohort',
    title: 'Cohort',
    description: 'Metric distributions across multiple subjects.',
    matches: (file) => /(^|\/)cohort\.ts$/u.test(file),
  },
  {
    slug: 'render',
    title: 'Rendering (SVG)',
    description: 'Dependency-free SVG-string renderers.',
    matches: (file) => /(^|\/)render\//u.test(file),
  },
  {
    slug: 'connectors',
    title: 'Connectors',
    description: 'Dexcom, Libre, and Nightscout normalization.',
    matches: (file) => /(^|\/)connectors\//u.test(file),
  },
  {
    slug: 'ingestion',
    title: 'Ingestion',
    description: 'Mapped header-row delimited data parsing.',
    matches: (file) => /(^|\/)csv\.ts$/u.test(file),
  },
  {
    slug: 'interop',
    title: 'Interoperability',
    description: 'FHIR and Open mHealth payload builders.',
    matches: (file) => /(^|\/)interop\//u.test(file),
  },
  {
    slug: 'conversions',
    title: 'Conversions, A1C & GMI',
    description: 'Unit conversion and A1C, eAG, and GMI estimation.',
    matches: (file) => /(^|\/)(?:conversions|a1c)\.ts$/u.test(file),
  },
  {
    slug: 'glucose',
    title: 'Glucose Values & Formatting',
    description: 'Validation, guards, alignment, labels, and formatting.',
    matches: (file) =>
      /(^|\/)(?:glucose|validators|guards|formatters|alignment)\.ts$/u.test(file),
  },
  {
    slug: 'errors',
    title: 'Errors',
    description: 'Typed errors with stable machine-readable codes.',
    matches: (file) => /(^|\/)errors\.ts$/u.test(file),
  },
])

function ensureTrailingNewline(value) {
  return `${value.trimEnd()}\n`
}

export function escapeMdx(value, context = 'prose') {
  const text = String(value ?? '')
  if (context === 'code') return text
  let escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
  if (context === 'table') escaped = escaped.replaceAll('|', '\\|').replace(/[\r\n]+/gu, ' ')
  return escaped
}

function literalValue(value, owner) {
  if (typeof value === 'string') {
    const escapes = new Map([
      ['\\', '\\\\'],
      ["'", "\\'"],
      ['\0', '\\x00'],
      ['\b', '\\b'],
      ['\t', '\\t'],
      ['\n', '\\n'],
      ['\v', '\\v'],
      ['\f', '\\f'],
      ['\r', '\\r'],
      ['\u2028', '\\u2028'],
      ['\u2029', '\\u2029'],
    ])
    const escaped = [...value]
      .map((character) => {
        if (escapes.has(character)) return escapes.get(character)
        const codePoint = character.codePointAt(0)
        if (codePoint < 0x20 || codePoint === 0x7f) {
          return `\\x${codePoint.toString(16).padStart(2, '0')}`
        }
        return character
      })
      .join('')
    return `'${escaped}'`
  }
  if (value === null) return 'null'
  if (
    value &&
    typeof value === 'object' &&
    typeof value.value === 'string' &&
    typeof value.negative === 'boolean'
  ) {
    return `${value.negative ? '-' : ''}${value.value}n`
  }
  if (!['boolean', 'number'].includes(typeof value)) {
    throw new Error(`Unsupported TypeDoc literal at ${owner}`)
  }
  return String(value)
}

function typePrecedence(type) {
  switch (type?.type) {
    case 'conditional':
    case 'predicate':
    case 'inferred':
    case 'unknown':
      return 1
    case 'union':
      return 2
    case 'intersection':
      return 3
    case 'query':
    case 'typeOperator':
      return 4
    case 'array':
      return 5
    case 'indexedAccess':
      return 6
    case 'reflection':
      return type.declaration?.kind === KIND.constructor &&
        type.declaration.signatures?.length === 1
        ? 1
        : 10
    default:
      return 10
  }
}

function assertAllowedFlags(reflection, allowed, owner) {
  for (const [flag, enabled] of Object.entries(reflection?.flags ?? {})) {
    if (enabled && !allowed.has(flag)) {
      throw new Error(`Unsupported TypeDoc flag ${flag} at ${owner}`)
    }
  }
}

const PUBLIC_DECLARATION_FLAGS = Object.freeze(['isPublic', 'isInherited'])

function allowedDeclarationFlags(...flags) {
  return new Set([...PUBLIC_DECLARATION_FLAGS, ...flags])
}

function renderTypeParameters(typeParameters, owner) {
  if (!typeParameters?.length) return ''
  const rendered = typeParameters.map((parameter) => {
    const parameterOwner = `${owner}.${parameter.name}`
    assertAllowedFlags(parameter, new Set(['isConst']), parameterOwner)
    const variance = parameter.varianceModifier
    if (variance !== undefined && !['in', 'out', 'in out'].includes(variance)) {
      throw new Error(`Unsupported TypeDoc variance modifier ${variance} at ${parameterOwner}`)
    }
    let value = `${parameter.flags?.isConst ? 'const ' : ''}${variance ? `${variance} ` : ''}${parameter.name}`
    if (parameter.type) value += ` extends ${renderType(parameter.type, parameterOwner)}`
    if (parameter.default) value += ` = ${renderType(parameter.default, parameterOwner)}`
    return value
  })
  return `<${rendered.join(', ')}>`
}

function renderAnonymousSignature(signature, owner) {
  let prefix
  if (signature.kind === KIND.callSignature) {
    assertAllowedFlags(signature, allowedDeclarationFlags(), owner)
    prefix = ''
  } else if (signature.kind === KIND.constructorSignature) {
    assertAllowedFlags(signature, allowedDeclarationFlags('isAbstract'), owner)
    prefix = `${signature.flags?.isAbstract ? 'abstract ' : ''}new `
  }
  else {
    throw new Error(`Unsupported TypeDoc signature kind ${signature.kind} at ${owner}`)
  }
  const typeParameters = renderTypeParameters(signature.typeParameters, owner)
  const parameters = renderParameters(signature.parameters, owner)
  return `${prefix}${typeParameters}(${parameters}): ${renderType(signature.type, `${owner}.return`)}`
}

function renderConstructorFunctionSignature(signature, owner) {
  if (signature.kind !== KIND.constructorSignature) {
    throw new Error(`Unsupported TypeDoc signature kind ${signature.kind} at ${owner}`)
  }
  assertAllowedFlags(signature, allowedDeclarationFlags('isAbstract'), owner)
  const prefix = `${signature.flags?.isAbstract ? 'abstract ' : ''}new `
  const typeParameters = renderTypeParameters(signature.typeParameters, owner)
  const parameters = renderParameters(signature.parameters, owner)
  return `${prefix}${typeParameters}(${parameters}) => ${renderType(signature.type, `${owner}.return`)}`
}

function renderIndexSignature(signature, owner) {
  if (signature.kind !== KIND.indexSignature) {
    throw new Error(`Unsupported TypeDoc signature kind ${signature.kind} at ${owner}`)
  }
  assertAllowedFlags(signature, allowedDeclarationFlags('isReadonly'), owner)
  const readonly = signature.flags?.isReadonly ? 'readonly ' : ''
  return `${readonly}[${renderParameters(signature.parameters, owner)}]: ${renderType(signature.type, `${owner}.return`)}`
}

function renderMemberModifiers(member, owner, {
  container,
  memberKind,
  classIsAbstract = false,
}) {
  const supported = new Set(PUBLIC_DECLARATION_FLAGS)
  if (memberKind === 'property') {
    supported.add('isReadonly')
    supported.add('isOptional')
  } else if (memberKind === 'method') {
    supported.add('isOptional')
  }
  if (container === 'class') {
    supported.add('isStatic')
    supported.add('isAbstract')
  }
  assertAllowedFlags(member, supported, owner)

  const isStatic = Boolean(member.flags?.isStatic)
  const isAbstract = Boolean(member.flags?.isAbstract)
  if (isStatic && isAbstract) {
    throw new Error(`Conflicting TypeDoc flags isStatic and isAbstract at ${owner}`)
  }
  if (isAbstract && !classIsAbstract) {
    throw new Error(`Abstract TypeDoc member belongs to non-abstract class at ${owner}`)
  }

  const prefix = `${isStatic ? 'static ' : ''}${isAbstract ? 'abstract ' : ''}${member.flags?.isReadonly ? 'readonly ' : ''}`
  const optional = member.flags?.isOptional ? '?' : ''
  return { prefix, optional }
}

function renderAccessorLines(accessor, owner, context) {
  const { prefix } = renderMemberModifiers(accessor, owner, {
    ...context,
    memberKind: 'accessor',
  })
  const lines = []
  if (accessor.getSignature) {
    if (accessor.getSignature.kind !== KIND.getSignature) {
      throw new Error(
        `Unsupported TypeDoc signature kind ${accessor.getSignature.kind} at ${owner}.get`,
      )
    }
    assertAllowedFlags(accessor.getSignature, allowedDeclarationFlags(), `${owner}.get`)
    lines.push(
      `${prefix}get ${accessor.name}(): ${renderType(accessor.getSignature.type, `${owner}.get.return`)}`,
    )
  }
  if (accessor.setSignature) {
    if (accessor.setSignature.kind !== KIND.setSignature) {
      throw new Error(
        `Unsupported TypeDoc signature kind ${accessor.setSignature.kind} at ${owner}.set`,
      )
    }
    assertAllowedFlags(accessor.setSignature, allowedDeclarationFlags(), `${owner}.set`)
    lines.push(
      `${prefix}set ${accessor.name}(${renderParameters(accessor.setSignature.parameters, `${owner}.set`)})`,
    )
  }
  if (lines.length === 0) {
    throw new Error(`Accessor has no signatures at ${owner}`)
  }
  return lines
}

function renderReflection(type, owner) {
  const declaration = type.declaration
  if (!declaration || ![KIND.typeLiteral, KIND.constructor].includes(declaration.kind)) {
    throw new Error(
      `Unsupported TypeDoc reflection kind ${declaration?.kind ?? '<missing>'} at ${owner}`,
    )
  }
  assertAllowedFlags(declaration, allowedDeclarationFlags(), owner)

  if (declaration.kind === KIND.constructor) {
    if ((declaration.children?.length ?? 0) > 0 || (declaration.indexSignatures?.length ?? 0) > 0) {
      throw new Error(`Unsupported TypeDoc constructor reflection members at ${owner}`)
    }
    if (!declaration.signatures?.length) {
      throw new Error(`Constructor reflection has no signatures at ${owner}`)
    }
    if (declaration.signatures.length === 1) {
      return renderConstructorFunctionSignature(declaration.signatures[0], `${owner}.__new.0`)
    }
    return `{ ${declaration.signatures.map((signature, index) =>
      renderAnonymousSignature(signature, `${owner}.__new.${index}`),
    ).join('; ')} }`
  }

  const members = []
  for (const [index, signature] of (declaration.signatures ?? []).entries()) {
    members.push(renderAnonymousSignature(signature, `${owner}.__signature.${index}`))
  }
  for (const signature of declaration.indexSignatures ?? []) {
    members.push(renderIndexSignature(signature, `${owner}.__index`))
  }
  for (const child of declaration.children ?? []) {
    const childOwner = `${owner}.${child.name}`
    if (child.kind === KIND.property) {
      const { prefix, optional } = renderMemberModifiers(child, childOwner, {
        container: 'reflection',
        memberKind: 'property',
      })
      members.push(`${prefix}${child.name}${optional}: ${renderType(child.type, childOwner)}`)
      continue
    }
    if (child.kind === KIND.method) {
      if (!child.signatures?.length) {
        throw new Error(`Method has no signatures at ${childOwner}`)
      }
      const { prefix, optional } = renderMemberModifiers(child, childOwner, {
        container: 'reflection',
        memberKind: 'method',
      })
      for (const signature of child.signatures) {
        members.push(formatSignature(`${prefix}${child.name}${optional}`, signature, childOwner))
      }
      continue
    }
    if (child.kind === KIND.accessor) {
      members.push(...renderAccessorLines(child, childOwner, { container: 'reflection' }))
      continue
    }
    throw new Error(`Unsupported TypeDoc reflection kind ${child.kind} at ${childOwner}`)
  }
  return members.length ? `{ ${members.join('; ')} }` : '{}'
}

function renderTypeWithPrecedence(type, owner, parentPrecedence) {
  if (!type) throw new Error(`Missing TypeDoc type at ${owner}`)
  let rendered
  switch (type.type) {
    case 'array':
      rendered = `${renderTypeWithPrecedence(type.elementType, `${owner}.element`, 5)}[]`
      break
    case 'conditional':
      rendered = `${renderTypeWithPrecedence(type.checkType, `${owner}.check`, 2)} extends ${renderTypeWithPrecedence(type.extendsType, `${owner}.extends`, 2)} ? ${renderTypeWithPrecedence(type.trueType, `${owner}.true`, 0)} : ${renderTypeWithPrecedence(type.falseType, `${owner}.false`, 0)}`
      break
    case 'indexedAccess':
      rendered = `${renderTypeWithPrecedence(type.objectType, `${owner}.object`, 6)}[${renderTypeWithPrecedence(type.indexType, `${owner}.index`, 0)}]`
      break
    case 'inferred':
      rendered = `infer ${type.name}${type.constraint ? ` extends ${renderTypeWithPrecedence(type.constraint, `${owner}.constraint`, 0)}` : ''}`
      break
    case 'intersection':
      rendered = (type.types ?? []).map((entry, index) => renderTypeWithPrecedence(entry, `${owner}.${index}`, 3)).join(' & ')
      break
    case 'intrinsic':
      rendered = type.name
      break
    case 'literal':
      rendered = literalValue(type.value, owner)
      break
    case 'mapped': {
      const readonly = type.readonlyModifier === '-' ? '-readonly ' : type.readonlyModifier === '+' ? 'readonly ' : ''
      const optional = type.optionalModifier === '-' ? '-?' : type.optionalModifier === '+' ? '?' : ''
      const name = type.nameType ? ` as ${renderType(type.nameType, `${owner}.name`)}` : ''
      rendered = `{ ${readonly}[${type.parameter} in ${renderTypeWithPrecedence(type.parameterType, `${owner}.parameter`, 0)}${name}]${optional}: ${renderTypeWithPrecedence(type.templateType, `${owner}.template`, 0)} }`
      break
    }
    case 'namedTupleMember': {
      const rest = type.element?.type === 'rest' ? '...' : ''
      const optional = type.isOptional ? '?' : ''
      const element = type.element?.type === 'rest' ? type.element.elementType : type.element
      rendered = `${rest}${type.name}${optional}: ${renderTypeWithPrecedence(element, `${owner}.${type.name}`, 0)}`
      break
    }
    case 'optional':
      rendered = `${renderTypeWithPrecedence(type.elementType, `${owner}.optional`, 5)}?`
      break
    case 'predicate': {
      const name = type.name ?? 'this'
      const target = type.targetType
        ? ` is ${renderType(type.targetType, `${owner}.target`)}`
        : ''
      rendered = `${type.asserts ? 'asserts ' : ''}${name}${target}`
      break
    }
    case 'query':
      rendered = `typeof ${renderTypeWithPrecedence(type.queryType, `${owner}.query`, 4)}`
      break
    case 'reference': {
      const argumentsText = type.typeArguments?.length
        ? `<${type.typeArguments.map((entry, index) => renderType(entry, `${owner}.${index}`)).join(', ')}>`
        : ''
      rendered = `${type.name}${argumentsText}`
      break
    }
    case 'reflection':
      rendered = renderReflection(type, owner)
      break
    case 'rest':
      rendered = `...${renderTypeWithPrecedence(type.elementType, `${owner}.rest`, 0)}`
      break
    case 'templateLiteral':
      rendered = `\`${type.head ?? ''}${(type.tail ?? []).map(([entry, text], index) => `\${${renderTypeWithPrecedence(entry, `${owner}.${index}`, 0)}}${text}`).join('')}\``
      break
    case 'tuple':
      rendered = `[${(type.elements ?? []).map((entry, index) => renderTypeWithPrecedence(entry, `${owner}.${index}`, 0)).join(', ')}]`
      break
    case 'typeOperator':
      rendered = `${type.operator} ${renderTypeWithPrecedence(type.target, `${owner}.target`, 4)}`
      break
    case 'union':
      rendered = (type.types ?? []).map((entry, index) => renderTypeWithPrecedence(entry, `${owner}.${index}`, 2)).join(' | ')
      break
    case 'unknown':
      if (!type.name) throw new Error(`Unnamed TypeDoc unknown type at ${owner}`)
      rendered = type.name
      break
    default:
      throw new Error(`Unsupported TypeDoc type "${type.type ?? '<missing>'}" at ${owner}`)
  }
  return typePrecedence(type) < parentPrecedence ? `(${rendered})` : rendered
}

export function renderType(type, owner = PACKAGE_NAME) {
  return renderTypeWithPrecedence(type, owner, 0)
}

function renderParameterDefault(parameter, owner) {
  if (parameter.defaultValue === undefined) return ''
  if (parameter.defaultValue !== '...') return ` = ${parameter.defaultValue}`

  const description = (parameter.comment?.summary ?? [])
    .map((part) => part.text ?? '')
    .join('')
  const documented = /\(default:\s*(.+)\)\s*$/iu.exec(description)?.[1]?.trim()
  if (!documented || documented === '...') {
    throw new Error(
      `Abbreviated TypeDoc default lacks a documented concrete default at ${owner}`,
    )
  }
  return ` = ${documented}`
}

function renderParameters(parameters, owner) {
  return (parameters ?? []).map((parameter) => {
    const parameterOwner = `${owner}.${parameter.name}`
    assertAllowedFlags(parameter, new Set(['isOptional', 'isRest']), parameterOwner)
    const rest = parameter.flags?.isRest ? '...' : ''
    const optional = parameter.flags?.isOptional && parameter.defaultValue === undefined ? '?' : ''
    const defaultValue = renderParameterDefault(parameter, parameterOwner)
    return `${rest}${parameter.name}${optional}: ${renderType(parameter.type, parameterOwner)}${defaultValue}`
  }).join(', ')
}

export function formatSignature(name, signature, owner = `${PACKAGE_NAME}.${name}`) {
  if (signature.kind !== KIND.callSignature) {
    throw new Error(`Unsupported TypeDoc signature kind ${signature.kind} at ${owner}`)
  }
  assertAllowedFlags(signature, allowedDeclarationFlags(), owner)
  const typeParameters = renderTypeParameters(signature.typeParameters, owner)
  const parameters = renderParameters(signature.parameters, owner)
  const prefix = name ? `${name}${typeParameters}` : typeParameters
  return `${prefix}(${parameters}): ${renderType(signature.type, `${owner}.return`)}`
}

function symbolKey(target) {
  return `${target.packageName ?? ''}|${target.packagePath ?? ''}|${target.qualifiedName ?? ''}`
}

function sanitizedLinkLabel(label) {
  // ASCII controls are intentionally matched so hostile labels cannot alter Markdown structure.
  // eslint-disable-next-line no-control-regex
  return String(label).replace(/[\u0000-\u001f\u007f]+/gu, ' ')
}

function neutralizeRawMarkdownDestinations(value) {
  return String(value).replace(/(\\*)\[/gu, (match, slashes) =>
    `${slashes}${slashes.length % 2 === 0 ? '\\' : ''}[`)
}

function markdownLink(label, destination, codeStyle, owner) {
  const sanitizedLabel = sanitizedLinkLabel(label)
  const escapedLabel = sanitizedLabel
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
  const safeLabel = codeStyle ? codeSpan(sanitizedLabel) : escapedLabel
  const rawDestination = String(destination)
  // ASCII controls are intentionally matched so hostile destinations fail closed.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/u.test(rawDestination)) {
    throw new Error(`Unsafe Markdown link destination at ${owner}: ${rawDestination}`)
  }
  const isGeneratedInternal = /^\/docs\/api\/core\/[a-z0-9-]+(?:#[a-z0-9-]+)?$/u.test(
    rawDestination,
  )
  let isHttp = false
  if (/^https?:\/\//iu.test(rawDestination)) {
    try {
      const parsed = new URL(rawDestination)
      isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      // The shared fail-closed branch below includes the owning reflection.
    }
  }
  if (!isGeneratedInternal && !isHttp) {
    throw new Error(`Unsafe Markdown link destination at ${owner}: ${rawDestination}`)
  }
  const safeDestination = rawDestination
    .replaceAll('\\', '%5C')
    .replaceAll(' ', '%20')
    .replaceAll('(', '%28')
    .replaceAll(')', '%29')
    .replaceAll('<', '%3C')
    .replaceAll('>', '%3E')
    .replaceAll('{', '%7B')
    .replaceAll('}', '%7D')
  return `[${safeLabel}](${safeDestination})`
}

export function renderCommentParts(
  parts,
  owner = PACKAGE_NAME,
  links = {},
  { neutralizeRawMarkdown = true } = {},
) {
  const byId = links.byId ?? new Map()
  const bySymbol = links.bySymbol ?? new Map()
  return (parts ?? []).map((part) => {
    if (part.kind !== 'inline-tag') {
      const value = part.text ?? ''
      return neutralizeRawMarkdown && part.kind === 'text'
        ? neutralizeRawMarkdownDestinations(value)
        : value
    }
    const codeStyle = part.tag === '@linkcode'
    const target = part.target
    let destination
    let fallback = part.text ?? ''
    if (typeof target === 'string') {
      if (
        /^https?:\/\//iu.test(target) ||
        /^[a-z][a-z0-9+.-]*:/iu.test(target) ||
        target.startsWith('//') ||
        target.startsWith('/docs/api/core/')
      ) {
        destination = target
      }
      fallback ||= target
    } else if (typeof target === 'number') {
      destination = byId.get(target)
    } else if (target && typeof target === 'object') {
      destination = bySymbol.get(symbolKey(target))
      fallback ||= target.qualifiedName ?? target.name ?? ''
    }
    const label = fallback || destination || owner
    return destination
      ? markdownLink(label, destination, codeStyle, owner)
      : codeStyle
        ? codeSpan(sanitizedLinkLabel(label))
        : label
  }).join('')
}

export function sourceImportPath(reflection) {
  const file = String(reflection?.sources?.[0]?.fileName ?? '').replaceAll('\\', '/')
  if (/(^|\/)metrics\//u.test(file)) return `${PACKAGE_NAME}/metrics`
  if (/(^|\/)connectors\//u.test(file)) return `${PACKAGE_NAME}/connectors`
  if (/(^|\/)interop\//u.test(file)) return `${PACKAGE_NAME}/interop`
  if (/(^|\/)render\//u.test(file)) return `${PACKAGE_NAME}/render`
  return PACKAGE_NAME
}

function reflectionSourceFile(reflection) {
  return String(reflection?.sources?.[0]?.fileName ?? '').replaceAll('\\', '/')
}

function headingAnchor(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
}

function collectIds(reflection, destination, byId) {
  if (typeof reflection?.id === 'number') byId.set(reflection.id, destination)
  for (const child of reflection?.children ?? []) collectIds(child, destination, byId)
  for (const signature of reflection?.signatures ?? []) collectIds(signature, destination, byId)
  for (const signature of reflection?.indexSignatures ?? []) collectIds(signature, destination, byId)
  for (const parameter of reflection?.parameters ?? []) collectIds(parameter, destination, byId)
  for (const parameter of reflection?.typeParameters ?? []) collectIds(parameter, destination, byId)
}

function reflectionComment(reflection) {
  return reflection?.comment
}

function commentText(parts, owner, links, context = 'prose') {
  return escapeMdx(renderCommentParts(parts, owner, links), context).trim()
}

function renderBlockComment(comment, owner, links) {
  if (!comment) return ''
  const sections = []
  const summary = commentText(comment.summary, owner, links)
  if (summary) sections.push(summary)
  for (const tag of comment.blockTags ?? []) {
    if (tag.tag === '@see') {
      const raw = renderCommentParts(tag.content, owner, links)
      const lines = raw
        .split(/\r?\n/gu)
        .map((line) => line.trim().replace(/^\s*-\s*/u, ''))
        .filter(Boolean)
        .map((line) => {
          const match = /^(https?:\/\/\S+?)(?:\s+\((.+)\))?$/u.exec(line)
          if (!match) return escapeMdx(line, 'prose')
          return markdownLink(
            escapeMdx(match[2] || match[1], 'prose'),
            match[1],
            false,
            owner,
          )
        })
      if (lines.length === 1) sections.push(`**See:** ${lines[0]}`)
      else if (lines.length > 1) {
        sections.push(`**See:**\n\n${lines.map((line) => `- ${line}`).join('\n')}`)
      }
      continue
    }
    const rendered = commentText(tag.content, owner, links)
    if (!rendered && tag.tag !== '@deprecated') continue
    if (tag.tag === '@remarks') sections.push(`**Remarks:** ${rendered}`)
    else if (tag.tag === '@deprecated') sections.push(`**Deprecated:** ${rendered || 'Deprecated.'}`)
    else if (tag.tag === '@returns') sections.push(`**Returns:** ${rendered}`)
    else if (tag.tag === '@throws') sections.push(`**Throws:** ${rendered}`)
    else if (tag.tag === '@example') {
      const raw = renderCommentParts(tag.content, owner, links, {
        neutralizeRawMarkdown: false,
      }).trim()
      const existingFence = /^(`{3,})([^\n]*)\n([\s\S]*?)\n\1$/u.exec(raw)
      const exampleLanguage = existingFence?.[2].trim().split(/\s+/u)[0] || 'ts'
      sections.push(
        existingFence
          ? codeBlock(existingFence[3], `${exampleLanguage} typecheck`)
          : codeBlock(raw, 'ts typecheck'),
      )
    } else if (tag.tag === '@defaultValue') sections.push(`**Default:** ${rendered}`)
  }
  if (comment.modifierTags?.includes('@deprecated') && !sections.some((entry) => entry.startsWith('**Deprecated:**'))) {
    sections.push('**Deprecated:** Deprecated.')
  }
  return sections.length ? `${sections.join('\n\n')}\n\n` : ''
}

function renderImport(reflection) {
  return `**Import:** \`${sourceImportPath(reflection)}\`\n\n`
}

function tableCell(value) {
  const rendered = escapeMdx(value ?? '', 'table').trim()
  return rendered
}

function codeSpan(value, { table = false } = {}) {
  let source = String(value ?? '').replace(/[\r\n]+/gu, ' ')
  if (table) source = source.replaceAll('|', '\\|')
  const runs = source.match(/`+/gu) ?? []
  const delimiter = '`'.repeat(
    Math.max(1, ...runs.map((run) => run.length + 1)),
  )
  const needsPadding = /^`|`$/u.test(source)
  return `${delimiter}${needsPadding ? ' ' : ''}${source}${needsPadding ? ' ' : ''}${delimiter}`
}

function codeBlock(value, language = 'ts') {
  const source = String(value ?? '').trimEnd()
  const runs = source.match(/`+/gu) ?? []
  const fence = '`'.repeat(
    Math.max(3, ...runs.map((run) => run.length + 1)),
  )
  return `${fence}${language}\n${source}\n${fence}`
}

function renderPropertyTable(properties, owner, links, context) {
  if (!properties.length) return ''
  let output = '| Property | Type | Description |\n| --- | --- | --- |\n'
  for (const property of properties) {
    const propertyOwner = `${owner}.${property.name}`
    const { prefix, optional } = renderMemberModifiers(property, propertyOwner, {
      ...context,
      memberKind: 'property',
    })
    const description = tableCell(renderCommentParts(reflectionComment(property)?.summary, propertyOwner, links))
    output += `| ${codeSpan(`${prefix}${property.name}${optional}`, { table: true })} | ${codeSpan(renderType(property.type, propertyOwner), { table: true })} | ${description} |\n`
  }
  return `${output}\n`
}

function renderCallableMembers(
  reflection,
  owner,
  { allowConstructor = false, container, classIsAbstract = false } = {},
) {
  const lines = []
  for (const child of reflection.children ?? []) {
    const childOwner = `${owner}.${child.name}`
    if (child.kind === KIND.property) continue
    if (child.kind === KIND.method) {
      if (!child.signatures?.length) {
        throw new Error(`Method has no signatures at ${childOwner}`)
      }
      const { prefix, optional } = renderMemberModifiers(child, childOwner, {
        container,
        memberKind: 'method',
        classIsAbstract,
      })
      for (const signature of child.signatures) {
        lines.push(formatSignature(`${prefix}${child.name}${optional}`, signature, childOwner))
      }
      continue
    }
    if (child.kind === KIND.accessor) {
      lines.push(
        ...renderAccessorLines(child, childOwner, { container, classIsAbstract }),
      )
      continue
    }
    if (allowConstructor && child.kind === KIND.constructor) continue
    throw new Error(`Unsupported TypeDoc reflection kind ${child.kind} at ${childOwner}`)
  }
  for (const signature of reflection.indexSignatures ?? []) {
    lines.push(renderIndexSignature(signature, `${owner}.__index`))
  }
  for (const signature of reflection.signatures ?? []) {
    lines.push(renderAnonymousSignature(signature, `${owner}.__call`))
  }
  return lines.length ? `${codeBlock(lines.join('\n'), GENERATED_API_FRAGMENT)}\n\n` : ''
}

function renderInterface(reflection, links) {
  const owner = `${PACKAGE_NAME}.${reflection.name}`
  assertAllowedFlags(reflection, allowedDeclarationFlags(), owner)
  const generics = renderTypeParameters(reflection.typeParameters, owner)
  const extended = (reflection.extendedTypes ?? []).map((type, index) => renderType(type, `${owner}.extends.${index}`))
  let output = `### ${reflection.name}\n\n${codeBlock(`interface ${reflection.name}${generics}${extended.length ? ` extends ${extended.join(', ')}` : ''}`, GENERATED_API_FRAGMENT)}\n\n`
  output += renderImport(reflection)
  output += renderBlockComment(reflection.comment, owner, links)
  output += renderPropertyTable(
    (reflection.children ?? []).filter((child) => child.kind === KIND.property),
    owner,
    links,
    { container: 'interface' },
  )
  output += renderCallableMembers(reflection, owner, { container: 'interface' })
  return output
}

function renderAlias(reflection, links) {
  const owner = `${PACKAGE_NAME}.${reflection.name}`
  assertAllowedFlags(reflection, allowedDeclarationFlags(), owner)
  const generics = renderTypeParameters(reflection.typeParameters, owner)
  let output = `### ${reflection.name}\n\n${codeBlock(`type ${reflection.name}${generics} = ${renderType(reflection.type, owner)}`, GENERATED_API_FRAGMENT)}\n\n`
  output += renderImport(reflection)
  output += renderBlockComment(reflection.comment, owner, links)
  return output
}

function renderVariable(reflection, links) {
  const owner = `${PACKAGE_NAME}.${reflection.name}`
  assertAllowedFlags(reflection, allowedDeclarationFlags('isConst'), owner)
  if (!reflection.flags?.isConst) {
    throw new Error(`Mutable TypeDoc variable cannot be rendered as const at ${owner}`)
  }
  let output = `### ${reflection.name}\n\n${codeBlock(`const ${reflection.name}: ${renderType(reflection.type, owner)}`, GENERATED_API_FRAGMENT)}\n\n`
  output += renderImport(reflection)
  output += renderBlockComment(reflection.comment, owner, links)
  return output
}

function renderClass(reflection, links) {
  const owner = `${PACKAGE_NAME}.${reflection.name}`
  assertAllowedFlags(reflection, allowedDeclarationFlags('isAbstract'), owner)
  const isAbstract = Boolean(reflection.flags?.isAbstract)
  const generics = renderTypeParameters(reflection.typeParameters, owner)
  const extended = (reflection.extendedTypes ?? []).map((type, index) => renderType(type, `${owner}.extends.${index}`))
  if (extended.length > 1) {
    throw new Error(`Class has multiple extended types at ${owner}`)
  }
  const implemented = (reflection.implementedTypes ?? []).map((type, index) =>
    renderType(type, `${owner}.implements.${index}`),
  )
  let output = `### ${reflection.name}\n\n${codeBlock(`${isAbstract ? 'abstract ' : ''}class ${reflection.name}${generics}${extended.length ? ` extends ${extended[0]}` : ''}${implemented.length ? ` implements ${implemented.join(', ')}` : ''}`, GENERATED_API_FRAGMENT)}\n\n`
  output += renderImport(reflection)
  output += renderBlockComment(reflection.comment, owner, links)
  const constructorReflections = (reflection.children ?? []).filter(
    (child) => child.kind === KIND.constructor,
  )
  if (constructorReflections.length > 1) {
    throw new Error(`Multiple constructor reflections at ${owner}`)
  }
  const constructorReflection = constructorReflections[0]
  if (constructorReflection && !constructorReflection.signatures?.length) {
    throw new Error(`Constructor has no signatures at ${owner}.constructor`)
  }
  if (constructorReflection) {
    assertAllowedFlags(
      constructorReflection,
      allowedDeclarationFlags(),
      `${owner}.constructor`,
    )
    const constructors = constructorReflection.signatures.map((signature, index) => {
      const constructorOwner = `${owner}.constructor.${index}`
      if (signature.kind !== KIND.constructorSignature) {
        throw new Error(
          `Unsupported TypeDoc signature kind ${signature.kind} at ${constructorOwner}`,
        )
      }
      assertAllowedFlags(signature, allowedDeclarationFlags(), constructorOwner)
      return `new ${reflection.name}${renderTypeParameters(signature.typeParameters, constructorOwner)}(${renderParameters(signature.parameters, constructorOwner)})`
    }).join('\n')
    output += `**Constructor**\n\n${codeBlock(constructors, GENERATED_API_FRAGMENT)}\n\n`
  }
  output += renderPropertyTable(
    (reflection.children ?? []).filter((child) => child.kind === KIND.property),
    owner,
    links,
    { container: 'class', classIsAbstract: isAbstract },
  )
  output += renderCallableMembers(reflection, owner, {
    allowConstructor: true,
    container: 'class',
    classIsAbstract: isAbstract,
  })
  return output
}

function renderFunction(reflection, links) {
  const owner = `${PACKAGE_NAME}.${reflection.name}`
  assertAllowedFlags(reflection, allowedDeclarationFlags(), owner)
  if (!reflection.signatures?.length) {
    throw new Error(`Function has no signatures at ${owner}`)
  }
  let output = `### ${reflection.name}\n\n${renderImport(reflection)}`
  for (const signature of reflection.signatures ?? []) {
    output += `${codeBlock(formatSignature(reflection.name, signature, owner), GENERATED_API_FRAGMENT)}\n\n`
    output += renderBlockComment(signature.comment ?? reflection.comment, owner, links)
    const described = (signature.parameters ?? []).filter((parameter) => parameter.comment?.summary?.length)
    if (described.length) {
      output += '| Parameter | Description |\n| --- | --- |\n'
      for (const parameter of described) {
        output += `| \`${parameter.name}\` | ${tableCell(renderCommentParts(parameter.comment.summary, `${owner}.${parameter.name}`, links))} |\n`
      }
      output += '\n'
    }
  }
  return output
}

function pageFrontmatter(title, description) {
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n`
}

function categoryForFunction(reflection) {
  const file = reflectionSourceFile(reflection)
  const category = FUNCTION_CATEGORIES.find((candidate) => candidate.matches(file))
  if (!category) {
    throw new Error(`Uncategorized public function at ${PACKAGE_NAME}.${reflection.name} from ${file || '<missing source>'}`)
  }
  return category
}

function validateProject(model) {
  if (model?.schemaVersion !== '2.0') {
    throw new Error(`Expected TypeDoc JSON schema 2.0; received ${model?.schemaVersion ?? '<missing>'}`)
  }
  if (model?.name !== PACKAGE_NAME) {
    throw new Error(`Expected TypeDoc project ${PACKAGE_NAME}; received ${model?.name ?? '<missing>'}`)
  }
  if (model?.kind !== KIND.project) {
    throw new Error(`Unsupported TypeDoc reflection kind ${model?.kind ?? '<missing>'} at ${PACKAGE_NAME}`)
  }
}

function classifyExports(model) {
  const classified = {
    functions: [],
    variables: [],
    classes: [],
    interfaces: [],
    aliases: [],
  }
  for (const reflection of model.children ?? []) {
    if (reflection.flags?.isPrivate || reflection.flags?.isProtected) continue
    if (reflection.kind === KIND.function) classified.functions.push(reflection)
    else if (reflection.kind === KIND.variable) classified.variables.push(reflection)
    else if (reflection.kind === KIND.class) classified.classes.push(reflection)
    else if (reflection.kind === KIND.interface) classified.interfaces.push(reflection)
    else if (reflection.kind === KIND.typeAlias) classified.aliases.push(reflection)
    else throw new Error(`Unsupported TypeDoc reflection kind ${reflection.kind} at ${PACKAGE_NAME}.${reflection.name}`)
  }
  for (const values of Object.values(classified)) {
    values.sort((left, right) => compareUnicodeScalars(left.name, right.name))
  }
  return classified
}

function buildLinks(classified, pageByReflection) {
  const byId = new Map()
  const bySymbol = new Map()
  for (const values of Object.values(classified)) {
    for (const reflection of values) {
      const page = pageByReflection.get(reflection)
      const destination = `/docs/api/core/${page}#${headingAnchor(reflection.name)}`
      collectIds(reflection, destination, byId)
      const source = reflectionSourceFile(reflection)
      bySymbol.set(`${PACKAGE_NAME}|${source}|${reflection.name}`, destination)
      bySymbol.set(`${PACKAGE_NAME}|src/${source}|${reflection.name}`, destination)
    }
  }
  return { byId, bySymbol }
}

export function renderApiModel(model) {
  validateProject(model)
  const classified = classifyExports(model)
  const functionsByCategory = new Map()
  const pageByReflection = new Map()
  for (const reflection of classified.functions) {
    const category = categoryForFunction(reflection)
    const items = functionsByCategory.get(category.slug) ?? []
    items.push(reflection)
    functionsByCategory.set(category.slug, items)
    pageByReflection.set(reflection, category.slug)
  }
  for (const reflection of [...classified.interfaces, ...classified.aliases]) pageByReflection.set(reflection, 'types')
  for (const reflection of classified.variables) pageByReflection.set(reflection, 'constants')
  for (const reflection of classified.classes) pageByReflection.set(reflection, 'errors')
  const links = buildLinks(classified, pageByReflection)

  const files = new Map()
  const functionOrder = FUNCTION_CATEGORIES.filter((category) => functionsByCategory.has(category.slug))
  const standaloneFunctionOrder = functionOrder.filter(
    (category) => category.slug !== 'errors',
  )
  for (const category of standaloneFunctionOrder) {
    const items = functionsByCategory.get(category.slug).toSorted((left, right) =>
      compareUnicodeScalars(left.name, right.name),
    )
    let page = pageFrontmatter(category.title, category.description)
    page += items.map((reflection) => renderFunction(reflection, links)).join('\n---\n\n')
    files.set(`${category.slug}.mdx`, ensureTrailingNewline(page))
  }

  let typesPage = pageFrontmatter('Types & Interfaces', 'Public contracts for ingestion, analytics, rendering, and integrations.')
  typesPage += [
    ...classified.interfaces.map((reflection) => renderInterface(reflection, links)),
    ...classified.aliases.map((reflection) => renderAlias(reflection, links)),
  ].join('\n---\n\n')
  files.set('types.mdx', ensureTrailingNewline(typesPage))

  let constantsPage = pageFrontmatter('Constants', 'Exported thresholds, goals, conversion factors, and capabilities.')
  constantsPage += classified.variables.map((reflection) => renderVariable(reflection, links)).join('\n---\n\n')
  files.set('constants.mdx', ensureTrailingNewline(constantsPage))

  const errorItems = [
    ...(functionsByCategory.get('errors') ?? []).map((reflection) =>
      renderFunction(reflection, links),
    ),
    ...classified.classes.map((reflection) => renderClass(reflection, links)),
  ]
  let errorsPage = pageFrontmatter('Errors', 'Functions and typed failures with stable machine-readable codes.')
  errorsPage += errorItems.join('\n---\n\n')
  files.set('errors.mdx', ensureTrailingNewline(errorsPage))

  const pageOrder = [
    ...standaloneFunctionOrder.map((category) => category.slug),
    'types',
    'constants',
    'errors',
  ]
  files.set('meta.json', `${JSON.stringify({ title: PACKAGE_NAME, pages: pageOrder }, null, 2)}\n`)

  let index = pageFrontmatter(`${PACKAGE_NAME} API`, 'Generated reference for the complete public core API.')
  index += `The public contracts exported by \`${PACKAGE_NAME}\`, generated from source declarations and TSDoc.\n\n`
  for (const category of standaloneFunctionOrder) {
    index += `## [${category.title}](/docs/api/core/${category.slug})\n\n${category.description}\n\n`
  }
  index += '## [Types & Interfaces](/docs/api/core/types)\n\nPublic data contracts.\n\n'
  index += '## [Constants](/docs/api/core/constants)\n\nPublic constants and capabilities.\n\n'
  index += '## [Error Classes](/docs/api/core/errors)\n\nTyped errors and stable codes.\n'
  files.set('index.mdx', ensureTrailingNewline(index))

  return new Map(
    [...files].sort(([left], [right]) => compareUnicodeScalars(left, right)),
  )
}
