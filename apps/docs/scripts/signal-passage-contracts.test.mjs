import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const pagePath = join(docsRoot, 'app/(home)/page.tsx')
const signalMotionPath = join(
  docsRoot,
  'app/(home)/signal-motion.ts',
)
const signalStoryPath = join(
  docsRoot,
  'app/(home)/signal-story.tsx',
)
const signalFigurePath = join(
  docsRoot,
  'app/(home)/glucose-signal-figure.tsx',
)
const signalTracePath = join(docsRoot, 'app/(home)/glucose-trace.tsx')
const signalStylesPath = join(
  docsRoot,
  'app/(home)/glucose-signal.module.css',
)
const page = readFileSync(pagePath, 'utf8')
const signalMotion = existsSync(signalMotionPath)
  ? readFileSync(signalMotionPath, 'utf8')
  : ''
const signalStory = existsSync(signalStoryPath)
  ? readFileSync(signalStoryPath, 'utf8')
  : ''
const signalFigure = existsSync(signalFigurePath)
  ? readFileSync(signalFigurePath, 'utf8')
  : ''
const signalTrace = existsSync(signalTracePath)
  ? readFileSync(signalTracePath, 'utf8')
  : ''
const signalStyles = existsSync(signalStylesPath)
  ? readFileSync(signalStylesPath, 'utf8')
  : ''
const signalMarkup = `${signalStory}\n${signalFigure}\n${signalTrace}`

const nativeMediaHeader =
  '@media (scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 900px) and (min-height: 720px)'
const nativeSupportsHeader =
  '@supports (view-timeline-name: --signal-passage) and (animation-range: contain 0% contain 15%)'
const activeMotionRoot =
  ".signalStory[data-motion-sticky='enabled']:not([data-motion-state='latched'])"
const nativeAnimationTuples = [
  {
    target: '.signalInstrument',
    motionPart: 'instrument',
    name: 'signalStageIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 0% contain 15%',
  },
  {
    target: '.traceTarget',
    motionPart: 'target-field',
    name: 'signalScaleXIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 10% contain 28%',
  },
  {
    target: '.traceThresholdOverlay',
    motionPart: 'thresholds',
    name: 'signalFadeIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 10% contain 28%',
  },
  {
    target: '.traceMask',
    motionPart: 'trace-mask',
    name: 'signalScaleXIn',
    easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    range: 'contain 22% contain 68%',
  },
  {
    target: '.traceLatestPoint',
    motionPart: 'latest-point',
    name: 'signalPointIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 58% contain 76%',
  },
  {
    target: '.latestReading',
    motionPart: 'latest-reading',
    name: 'signalCurrentIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 58% contain 76%',
  },
  {
    target: '.signalMetrics > div:nth-child(1)',
    metricIndex: 1,
    motionPart: 'metrics',
    name: 'signalMetricIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 70% contain 82%',
  },
  {
    target: '.signalMetrics > div:nth-child(2)',
    metricIndex: 2,
    motionPart: 'metrics',
    name: 'signalMetricIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 72% contain 84%',
  },
  {
    target: '.signalMetrics > div:nth-child(3)',
    metricIndex: 3,
    motionPart: 'metrics',
    name: 'signalMetricIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 74% contain 86%',
  },
  {
    target: '.signalMetrics > div:nth-child(4)',
    metricIndex: 4,
    motionPart: 'metrics',
    name: 'signalMetricIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 76% contain 88%',
  },
  {
    target: '.signalCaption',
    motionPart: 'caption',
    name: 'signalCaptionIn',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    range: 'contain 88% contain 99%',
  },
].map((tuple) => ({
  ...tuple,
  selector: `${activeMotionRoot} ${tuple.target}`,
}))
const nativeKeyframeBodies = new Map([
  [
    'signalStageIn',
    [
      [
        'from',
        [
          ['opacity', '0.84'],
          ['transform', 'scale(0.985)'],
        ],
      ],
      [
        'to',
        [
          ['opacity', '1'],
          ['transform', 'scale(1)'],
        ],
      ],
    ],
  ],
  [
    'signalScaleXIn',
    [
      [
        'from',
        [
          ['opacity', '0'],
          ['transform', 'scaleX(0)'],
        ],
      ],
      [
        'to',
        [
          ['opacity', '1'],
          ['transform', 'scaleX(1)'],
        ],
      ],
    ],
  ],
  [
    'signalFadeIn',
    [
      ['from', [['opacity', '0']]],
      ['to', [['opacity', '1']]],
    ],
  ],
  [
    'signalCurrentIn',
    [
      [
        'from',
        [
          ['opacity', '0'],
          ['transform', 'translateY(6px)'],
        ],
      ],
      [
        'to',
        [
          ['opacity', '1'],
          ['transform', 'translateY(0)'],
        ],
      ],
    ],
  ],
  [
    'signalPointIn',
    [
      [
        'from',
        [
          ['opacity', '0'],
          ['transform', 'scale(0.92)'],
        ],
      ],
      [
        'to',
        [
          ['opacity', '1'],
          ['transform', 'scale(1)'],
        ],
      ],
    ],
  ],
  [
    'signalMetricIn',
    [
      [
        'from',
        [
          ['opacity', '0'],
          ['transform', 'translateY(8px)'],
        ],
      ],
      [
        'to',
        [
          ['opacity', '1'],
          ['transform', 'translateY(0)'],
        ],
      ],
    ],
  ],
  [
    'signalCaptionIn',
    [
      ['from', [['opacity', '0.55']]],
      ['to', [['opacity', '1']]],
    ],
  ],
])

function normalizeCssText(value) {
  return value.replaceAll(/\s+/gu, ' ').trim()
}

function normalizeSelector(value) {
  return normalizeCssText(value)
    .replaceAll(/\(\s+/gu, '(')
    .replaceAll(/\s+\)/gu, ')')
    .replaceAll(/\s*>\s*/gu, ' > ')
}

function splitSelectorList(selector) {
  const selectors = []
  let current = ''
  let bracketDepth = 0
  let parenthesisDepth = 0
  let quote = ''

  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index]

    if (quote !== '') {
      current += character
      if (character === '\\' && index + 1 < selector.length) {
        current += selector[index + 1]
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === "'" || character === '"') {
      quote = character
      current += character
      continue
    }

    if (character === '[') {
      bracketDepth += 1
    } else if (character === ']') {
      bracketDepth -= 1
    } else if (character === '(') {
      parenthesisDepth += 1
    } else if (character === ')') {
      parenthesisDepth -= 1
    }

    if (
      character === ',' &&
      bracketDepth === 0 &&
      parenthesisDepth === 0
    ) {
      if (current.trim() !== '') {
        selectors.push(current.trim())
      }
      current = ''
      continue
    }

    current += character
  }

  if (current.trim() !== '') {
    selectors.push(current.trim())
  }

  return selectors
}

function parseSelectorCompounds(selector) {
  const compounds = []
  let bracketDepth = 0
  let current = ''
  let parenthesisDepth = 0
  let pendingCombinator = null
  let quote = ''

  function pushCompound() {
    const compound = current.trim()
    if (compound === '') {
      return
    }

    compounds.push({
      compound,
      combinator:
        compounds.length === 0
          ? null
          : (pendingCombinator ?? ' '),
    })
    current = ''
    pendingCombinator = null
  }

  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index]

    if (quote !== '') {
      current += character
      if (character === '\\' && index + 1 < selector.length) {
        current += selector[index + 1]
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === "'" || character === '"') {
      quote = character
      current += character
      continue
    }

    if (character === '[') {
      bracketDepth += 1
    } else if (character === ']') {
      bracketDepth -= 1
    } else if (character === '(') {
      parenthesisDepth += 1
    } else if (character === ')') {
      parenthesisDepth -= 1
    }

    if (bracketDepth === 0 && parenthesisDepth === 0) {
      if (character === '>' || character === '+' || character === '~') {
        pushCompound()
        pendingCombinator = character
        continue
      }

      if (/\s/u.test(character)) {
        if (current.trim() !== '') {
          pushCompound()
          pendingCombinator = ' '
        }
        continue
      }
    }

    current += character
  }

  pushCompound()
  return compounds
}

function compoundHasClass(compound, className) {
  const escapedClassName = className.replaceAll(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  )
  return new RegExp(
    `\\.${escapedClassName}(?![\\w-])`,
    'u',
  ).test(compound)
}

function compoundHasMotionPart(compound, motionPart) {
  return Array.from(
    compound.matchAll(
      /\[\s*data-motion-part\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\]\s]+))\s*\]/gu,
    ),
    (match) => match[1] ?? match[2] ?? match[3],
  ).includes(motionPart)
}

function selectorTargetsNativeTuple(selector, tuple) {
  const targetClass = /^\.([\w-]+)/u.exec(tuple.target)?.[1]
  assert.notEqual(
    targetClass,
    undefined,
    `${tuple.target} must expose a target class`,
  )

  return splitSelectorList(selector).some((selectorPart) => {
    const compounds = parseSelectorCompounds(selectorPart)
    const subject = compounds.at(-1)

    if (
      subject === undefined ||
      subject.compound.includes('::')
    ) {
      return false
    }

    if (tuple.motionPart !== 'metrics') {
      return (
        compoundHasClass(subject.compound, targetClass) ||
        compoundHasMotionPart(
          subject.compound,
          tuple.motionPart,
        )
      )
    }

    const parent = compounds.at(-2)
    const subjectName = subject.compound.toLowerCase()
    const targetsDiv =
      subjectName === 'div' ||
      ['div.', 'div#', 'div[', 'div:'].some((prefix) =>
        subjectName.startsWith(prefix),
      )
    const nthChild = /:nth-child\(\s*(\d+)\s*\)/u.exec(
      subject.compound,
    )

    if (
      parent === undefined ||
      (subject.combinator !== '>' &&
        subject.combinator !== ' ') ||
      !targetsDiv ||
      (nthChild !== null &&
        Number(nthChild[1]) !== tuple.metricIndex)
    ) {
      return false
    }

    return (
      compoundHasClass(parent.compound, targetClass) ||
      compoundHasMotionPart(parent.compound, tuple.motionPart)
    )
  })
}

function findMatchingBrace(source, openIndex, end = source.length) {
  let depth = 0
  let quote = ''

  for (let index = openIndex; index < end; index += 1) {
    const character = source[index]
    const nextCharacter = source[index + 1]

    if (quote !== '') {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      const commentEnd = source.indexOf('*/', index + 2)
      assert.notEqual(
        commentEnd,
        -1,
        'CSS comments must terminate before native contracts run',
      )
      index = commentEnd + 1
      continue
    }

    if (character === "'" || character === '"') {
      quote = character
      continue
    }

    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  assert.fail(`CSS block at offset ${openIndex} is not closed`)
}

function getTopLevelBlocks(
  source,
  start = 0,
  end = source.length,
) {
  const blocks = []
  let headerStart = start
  let quote = ''

  for (let index = start; index < end; index += 1) {
    const character = source[index]
    const nextCharacter = source[index + 1]

    if (quote !== '') {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      const commentEnd = source.indexOf('*/', index + 2)
      assert.notEqual(
        commentEnd,
        -1,
        'CSS comments must terminate before native contracts run',
      )
      index = commentEnd + 1
      continue
    }

    if (character === "'" || character === '"') {
      quote = character
      continue
    }

    if (character === ';') {
      headerStart = index + 1
      continue
    }

    if (character !== '{') {
      continue
    }

    const closeIndex = findMatchingBrace(source, index, end)
    const header = source
      .slice(headerStart, index)
      .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
      .trim()

    if (header !== '') {
      blocks.push({
        header,
        start: headerStart,
        openIndex: index,
        bodyStart: index + 1,
        bodyEnd: closeIndex,
        end: closeIndex + 1,
        body: source.slice(index + 1, closeIndex),
      })
    }

    index = closeIndex
    headerStart = closeIndex + 1
  }

  return blocks
}

function collectStyleRules(
  source,
  start = 0,
  end = source.length,
) {
  const rules = []

  for (const block of getTopLevelBlocks(source, start, end)) {
    if (!block.header.startsWith('@')) {
      rules.push({
        ...block,
        selector: block.header,
        declarations: block.body,
      })
      continue
    }

    if (!block.header.startsWith('@keyframes ')) {
      rules.push(
        ...collectStyleRules(
          source,
          block.bodyStart,
          block.bodyEnd,
        ),
      )
    }
  }

  return rules
}

function collectKeyframeBlocks(
  source,
  start = 0,
  end = source.length,
) {
  const keyframes = []

  for (const block of getTopLevelBlocks(source, start, end)) {
    if (block.header.startsWith('@keyframes ')) {
      keyframes.push(block)
      continue
    }

    keyframes.push(
      ...collectKeyframeBlocks(
        source,
        block.bodyStart,
        block.bodyEnd,
      ),
    )
  }

  return keyframes
}

function getStyleRules(source) {
  return collectStyleRules(source).map(
    ({ selector, declarations, start, end }) => ({
      selector,
      declarations,
      start,
      end,
    }),
  )
}

function getLeafRules(source) {
  return getStyleRules(source).map(
    ({ selector, declarations }) => ({
      selector,
      declarations,
    }),
  )
}

function findOnlyStyleRule(source, selector, message) {
  const expectedSelector = normalizeSelector(selector)
  const matches = getStyleRules(source).filter(
    (rule) => normalizeSelector(rule.selector) === expectedSelector,
  )

  assert.equal(matches.length, 1, message)
  return matches[0]
}

function findOnlyStyleRuleList(source, selectors, message) {
  const expectedSelectors = selectors.map(normalizeSelector)
  const matches = getStyleRules(source).filter((rule) => {
    const actualSelectors = splitSelectorList(rule.selector).map(
      normalizeSelector,
    )
    return (
      actualSelectors.length === expectedSelectors.length &&
      actualSelectors.every(
        (selector, index) => selector === expectedSelectors[index],
      )
    )
  })

  assert.equal(matches.length, 1, message)
  return matches[0]
}

function parseDeclarations(source) {
  return source
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const colonIndex = declaration.indexOf(':')
      assert.ok(
        colonIndex > 0,
        `CSS declaration must include a property: ${declaration}`,
      )
      return [
        declaration.slice(0, colonIndex).trim().toLowerCase(),
        normalizeCssText(declaration.slice(colonIndex + 1)),
      ]
    })
}

function findOnlyBlock(blocks, header, errorMessage) {
  const matches = blocks.filter(
    (block) => normalizeCssText(block.header) === header,
  )
  assert.equal(matches.length, 1, errorMessage)
  return matches[0]
}

function assertExactStructure(actual, expected, message) {
  try {
    assert.deepEqual(actual, expected)
  } catch {
    assert.fail(message)
  }
}

function expectedNativeDeclarations(tuple) {
  return [
    ['animation-name', tuple.name],
    ['animation-duration', '1ms'],
    ['animation-fill-mode', 'both'],
    ['animation-timing-function', tuple.easing],
    ['animation-timeline', '--signal-passage'],
    ['animation-range', tuple.range],
  ]
}

function validateNativeKeyframes(source) {
  const expectedNames = new Set(nativeKeyframeBodies.keys())
  const keyframeBlocks = collectKeyframeBlocks(source)
  const nativeBlocks = keyframeBlocks.filter((block) => {
    const match = /^@keyframes\s+([\w-]+)$/u.exec(
      normalizeCssText(block.header),
    )
    return match !== null && expectedNames.has(match[1])
  })

  assert.equal(
    nativeBlocks.length,
    nativeKeyframeBodies.size,
    'each approved native keyframe must be defined exactly once across the stylesheet',
  )

  for (const [name, expectedFrames] of nativeKeyframeBodies) {
    const keyframeBlock = findOnlyBlock(
      keyframeBlocks,
      `@keyframes ${name}`,
      `native keyframe ${name} must be defined exactly once across the stylesheet`,
    )
    const frames = getTopLevelBlocks(
      source,
      keyframeBlock.bodyStart,
      keyframeBlock.bodyEnd,
    ).map((frame) => [
      normalizeCssText(frame.header),
      parseDeclarations(frame.body),
    ])

    for (const [, declarations] of frames) {
      for (const [property] of declarations) {
        if (property.startsWith('--')) {
          assert.fail(
            `${name} must not animate a custom property`,
          )
        }
        if (property === 'x' || property === 'width') {
          assert.fail(
            `${name} must not animate an SVG geometry property`,
          )
        }
        if (property !== 'opacity' && property !== 'transform') {
          assert.fail(
            `${name} must stay inside the transform/opacity compositor allowlist`,
          )
        }
      }
    }

    assertExactStructure(
      frames,
      expectedFrames,
      `${name} must preserve its exact approved keyframe body and final state`,
    )
  }
}

function validateNativeMotionSource(source) {
  const rootBlocks = getTopLevelBlocks(source)
  validateNativeKeyframes(source)

  const mediaBlock = findOnlyBlock(
    rootBlocks,
    nativeMediaHeader,
    'native animations must use the exact native capability gate',
  )
  const mediaBlocks = getTopLevelBlocks(
    source,
    mediaBlock.bodyStart,
    mediaBlock.bodyEnd,
  )
  const supportsBlock = findOnlyBlock(
    mediaBlocks,
    nativeSupportsHeader,
    'native animations must use the exact native capability gate',
  )
  const allStyleRules = collectStyleRules(source)
  const timelineRules = allStyleRules.filter((rule) =>
    parseDeclarations(rule.declarations).some(
      ([property, value]) =>
        property === 'animation-timeline' &&
        value === '--signal-passage',
    ),
  )
  const escapedTimelineRules = timelineRules.filter(
    (rule) =>
      rule.start < supportsBlock.bodyStart ||
      rule.end > supportsBlock.bodyEnd,
  )

  assert.equal(
    escapedTimelineRules.length,
    0,
    'all timeline rules must remain inside the exact native capability gate',
  )
  assert.equal(
    timelineRules.length,
    nativeAnimationTuples.length,
    'the exact native capability gate must own all eleven timeline rules',
  )

  const gatedRules = getTopLevelBlocks(
    source,
    supportsBlock.bodyStart,
    supportsBlock.bodyEnd,
  ).filter((block) => !block.header.startsWith('@'))
  const matchedNativeRules = []

  for (const tuple of nativeAnimationTuples) {
    const selector = normalizeSelector(tuple.selector)
    const matches = gatedRules.filter(
      (rule) => normalizeSelector(rule.header) === selector,
    )
    assert.equal(
      matches.length,
      1,
      `native animation tuple for ${tuple.target} must exist exactly once inside the gate`,
    )

    const [rule] = matches
    assertExactStructure(
      parseDeclarations(rule.body),
      expectedNativeDeclarations(tuple),
      `native animation tuple for ${tuple.target} must preserve its selector, keyframe, duration, fill, easing, timeline, and range`,
    )
    matchedNativeRules.push([tuple, rule])
  }

  for (const [tuple, nativeRule] of matchedNativeRules) {
    const laterReset = allStyleRules.find(
      (rule) =>
        rule.start > nativeRule.end &&
        selectorTargetsNativeTuple(rule.selector, tuple) &&
        parseDeclarations(rule.declarations).some(
          ([property]) => property === 'animation',
        ),
    )

    assert.equal(
      laterReset,
      undefined,
      `${tuple.target} must not receive a later animation shorthand reset`,
    )
  }
}

const fallbackArmedRoot =
  ".signalStory[data-motion-layout='flow'][data-motion-state='armed']"
const fallbackRevealingRoot =
  ".signalStory[data-motion-layout='flow'][data-motion-state='revealing']"
const fallbackAnimationTuples = [
  {
    target: "[data-motion-part='target-field']",
    animation:
      'signalScaleXIn 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
  },
  {
    target: "[data-motion-part='thresholds']",
    animation:
      'signalFadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
  },
  {
    target: "[data-motion-part='trace-mask']",
    animation:
      'signalScaleXIn 660ms cubic-bezier(0.65, 0, 0.35, 1) 100ms both',
  },
  {
    target: "[data-motion-part='latest-reading']",
    animation:
      'signalCurrentIn 280ms cubic-bezier(0.16, 1, 0.3, 1) 620ms both',
  },
  {
    target: "[data-motion-part='latest-point']",
    animation:
      'signalPointIn 280ms cubic-bezier(0.16, 1, 0.3, 1) 620ms both',
  },
  {
    target: "[data-motion-part='metrics'] > div:nth-child(1)",
    animation:
      'signalMetricIn 260ms cubic-bezier(0.16, 1, 0.3, 1) 780ms both',
  },
  {
    target: "[data-motion-part='metrics'] > div:nth-child(2)",
    animation:
      'signalMetricIn 260ms cubic-bezier(0.16, 1, 0.3, 1) 800ms both',
  },
  {
    target: "[data-motion-part='metrics'] > div:nth-child(3)",
    animation:
      'signalMetricIn 260ms cubic-bezier(0.16, 1, 0.3, 1) 820ms both',
  },
  {
    target: "[data-motion-part='metrics'] > div:nth-child(4)",
    animation:
      'signalMetricIn 260ms cubic-bezier(0.16, 1, 0.3, 1) 840ms both',
  },
  {
    target: "[data-motion-part='caption']",
    animation:
      'signalCaptionIn 320ms cubic-bezier(0.16, 1, 0.3, 1) 780ms both',
  },
].map((tuple) => ({
  ...tuple,
  selector: `${fallbackRevealingRoot} ${tuple.target}`,
}))

const semanticMotionParts = [
  'instrument',
  'latest-reading',
  'metrics',
  'caption',
]
const signalAncestorClassNames = new Map([
  ['signal-story', 'signalStory'],
  ['signal-section', 'signalSection'],
  ['signal-instrument', 'signalInstrument'],
  ['signal-header', 'signalHeader'],
  ['signal-trace', 'trace'],
  ['signal-trace-plot', 'tracePlot'],
])
const motionPartClassNames = new Map([
  ['instrument', 'signalInstrument'],
  ['target-field', 'traceTarget'],
  ['thresholds', 'traceThresholdOverlay'],
  ['trace-mask', 'traceMask'],
  ['latest-reading', 'latestReading'],
  ['latest-point', 'traceLatestPoint'],
  ['metrics', 'signalMetrics'],
  ['caption', 'signalCaption'],
])
const approvedArmedConcealment = new Set(
  [
    ["[data-motion-part='target-field']", 'opacity', '0'],
    ["[data-motion-part='target-field']", 'transform', 'scaleX(0)'],
    ["[data-motion-part='thresholds']", 'opacity', '0'],
    ["[data-motion-part='trace-mask']", 'opacity', '0'],
    ["[data-motion-part='trace-mask']", 'transform', 'scaleX(0)'],
    ["[data-motion-part='latest-reading']", 'opacity', '0'],
    ["[data-motion-part='latest-reading']", 'transform', 'translateY(6px)'],
    ["[data-motion-part='latest-point']", 'opacity', '0'],
    ["[data-motion-part='latest-point']", 'transform', 'scale(0.92)'],
    ["[data-motion-part='metrics'] > div", 'opacity', '0'],
    ["[data-motion-part='metrics'] > div", 'transform', 'translateY(8px)'],
    ["[data-motion-part='caption']", 'opacity', '0.55'],
  ].map(([target, property, value]) =>
    `${normalizeSelector(`${fallbackArmedRoot} ${target}`)}|${property}|${value}`,
  ),
)

function getSelectorSpecificity(selector) {
  return (
    (selector.match(/\.[\w-]+/gu) ?? []).length +
    (selector.match(/\[[^\]]+\]/gu) ?? []).length
  )
}

function selectorTargetsTraceMask(selector) {
  return (
    (selector.includes('.traceMask') ||
      /\[\s*data-motion-part\s*=\s*(?:"trace-mask"|'trace-mask'|trace-mask)\s*\]/u.test(
        selector,
      ) || /\[\s*data-motion-part\s*\]/u.test(selector)) &&
    !/\[\s*data-motion-state\s*=\s*(?:"(?:armed|revealing|idle)"|'(?:armed|revealing|idle)'|(?:armed|revealing|idle))\s*\]/u.test(
      selector,
    ) &&
    !/:not\([^)]*\[\s*data-motion-state\s*=\s*(?:"latched"|'latched'|latched)\s*\]/u.test(
      selector,
    )
  )
}

function validateTraceMaskFinalTransform(
  source,
  latchedTransformsRule,
  reducedGenericRule,
  reducedMaskRule,
) {
  const finalMaskRule = findOnlyStyleRule(
    source,
    ".signalStory[data-motion-state='latched'] [data-motion-part='trace-mask']",
    'latched trace masks must have one final transform rule',
  )
  assertExactStructure(
    parseDeclarations(finalMaskRule.declarations),
    [['transform', 'scaleX(1)']],
    'latched trace masks must finish at scaleX(1)',
  )
  assert.ok(
    finalMaskRule.start > latchedTransformsRule.start,
    'the explicit latched trace-mask final transform must follow the broad reset',
  )
  const broadMaskSelector = splitSelectorList(
    latchedTransformsRule.selector,
  ).find((selector) =>
    selector.includes("[data-motion-part='trace-mask']"),
  )
  assert.notEqual(
    broadMaskSelector,
    undefined,
    'the broad latched transform reset must include the trace mask',
  )
  assert.equal(
    getSelectorSpecificity(finalMaskRule.selector),
    getSelectorSpecificity(broadMaskSelector),
    'the explicit latched trace-mask final transform must win the equal-specificity reset by order',
  )
  assert.ok(
    reducedMaskRule.start > reducedGenericRule.start,
    'the reduced-motion trace mask must follow the generic final-frame reset',
  )
  assert.equal(
    getSelectorSpecificity(reducedMaskRule.selector),
    getSelectorSpecificity(reducedGenericRule.selector),
    'the reduced-motion trace mask must win the equal-specificity reset by order',
  )

  for (const rule of getStyleRules(source)) {
    if (rule.start <= finalMaskRule.start) {
      continue
    }

    const transform = parseDeclarations(rule.declarations).find(
      ([property]) => property === 'transform',
    )?.[1]
    if (transform === undefined) {
      continue
    }

    for (const selector of splitSelectorList(rule.selector)) {
      if (
        selectorTargetsTraceMask(selector) &&
        getSelectorSpecificity(selector) >=
          getSelectorSpecificity(finalMaskRule.selector)
      ) {
        assert.equal(
          transform,
          'scaleX(1)',
          'a later equal or higher-specificity trace-mask rule must retain scaleX(1)',
        )
      }
    }
  }
}

function selectorMotionPart(selector) {
  const exactMotionPart = /\[\s*data-motion-part\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\]\s]+))\s*\]/u.exec(
    selector,
  )
  if (exactMotionPart !== null) {
    return exactMotionPart[1] ?? exactMotionPart[2] ?? exactMotionPart[3]
  }
  if (/\[\s*data-motion-part\s*\]/u.test(selector)) {
    return 'every-motion-part'
  }

  for (const [motionPart, className] of motionPartClassNames) {
    if (selector.includes(`.${className}`)) {
      return motionPart
    }
  }

  for (const [ancestor, className] of signalAncestorClassNames) {
    if (compoundHasClass(selector, className)) {
      return ancestor
    }
  }

  return null
}

function validateMeaningfulMotionVisibility(source, markup) {
  for (const { selector, declarations } of getLeafRules(source)) {
    for (const selectorPart of splitSelectorList(selector)) {
      const motionPart = selectorMotionPart(selectorPart)
      if (motionPart === null) {
        continue
      }

      for (const [property, value] of parseDeclarations(declarations)) {
        const concealsMotionPart =
          (property === 'display' && value === 'none') ||
          (property === 'visibility' && value === 'hidden') ||
          (property === 'opacity' && value !== '1') ||
          (property === 'transform' &&
            !['none', 'scale(1)', 'scaleX(1)', 'translateY(0)'].includes(
              value,
            ))
        if (!concealsMotionPart) {
          continue
        }

        assert.equal(
          approvedArmedConcealment.has(
            `${normalizeSelector(selectorPart)}|${property}|${value}`,
          ),
          true,
          `${motionPart} must not hide outside its exact armed flow start`,
        )
      }
    }
  }

  for (const motionPart of semanticMotionParts) {
    const openingTag = new RegExp(
      `<[^>]*data-motion-part=["']${motionPart}["'][^>]*>`,
      'u',
    ).exec(markup)
    assert.notEqual(
      openingTag,
      null,
      `${motionPart} must remain a semantic motion part`,
    )
    assert.doesNotMatch(
      openingTag[0],
      /aria-hidden\s*=\s*["']true["']/u,
      `${motionPart} must not become aria hidden`,
    )
  }

  for (const [ancestor, className] of signalAncestorClassNames) {
    const openingTag = new RegExp(
      `<[^>]*className=\\{styles\\.${className}\\}[^>]*>`,
      'u',
    ).exec(markup)
    if (openingTag === null) {
      continue
    }

    assert.doesNotMatch(
      openingTag[0],
      /aria-hidden\s*=\s*["']true["']/u,
      `${ancestor} must not become aria hidden`,
    )
  }
}

function validateFallbackMotionSource(source, markup = signalMarkup) {
  const armedOpacityRule = findOnlyStyleRuleList(
    source,
    [
      `${fallbackArmedRoot} [data-motion-part='target-field']`,
      `${fallbackArmedRoot} [data-motion-part='thresholds']`,
    ],
    'the field and thresholds must hide only for an armed flow fallback',
  )
  assertExactStructure(
    parseDeclarations(armedOpacityRule.declarations),
    [['opacity', '0']],
    'the field and thresholds must begin transparent in the armed fallback state',
  )

  const armedScaleRule = findOnlyStyleRuleList(
    source,
    [
      `${fallbackArmedRoot} [data-motion-part='target-field']`,
      `${fallbackArmedRoot} [data-motion-part='trace-mask']`,
    ],
    'the field and trace mask must offset only for an armed flow fallback',
  )
  assertExactStructure(
    parseDeclarations(armedScaleRule.declarations),
    [['transform', 'scaleX(0)']],
    'the field and trace mask must begin collapsed in the armed fallback state',
  )

  const armedHiddenRule = findOnlyStyleRuleList(
    source,
    [
      `${fallbackArmedRoot} [data-motion-part='trace-mask']`,
      `${fallbackArmedRoot} [data-motion-part='latest-reading']`,
      `${fallbackArmedRoot} [data-motion-part='latest-point']`,
      `${fallbackArmedRoot} [data-motion-part='metrics'] > div`,
    ],
    'the trace, endpoint, result, and metrics must hide only for an armed flow fallback',
  )
  assertExactStructure(
    parseDeclarations(armedHiddenRule.declarations),
    [['opacity', '0']],
    'the trace, endpoint, result, and metrics must begin transparent in the armed fallback state',
  )

  for (const [target, transform] of [
    ["[data-motion-part='latest-reading']", 'translateY(6px)'],
    ["[data-motion-part='latest-point']", 'scale(0.92)'],
    ["[data-motion-part='metrics'] > div", 'translateY(8px)'],
  ]) {
    const rule = findOnlyStyleRule(
      source,
      `${fallbackArmedRoot} ${target}`,
      `${target} must have one armed fallback transform`,
    )
    assertExactStructure(
      parseDeclarations(rule.declarations),
      [['transform', transform]],
      `${target} must use its approved armed fallback transform`,
    )
  }

  const armedCaptionRule = findOnlyStyleRule(
    source,
    `${fallbackArmedRoot} [data-motion-part='caption']`,
    'the caption must have one armed fallback state',
  )
  assertExactStructure(
    parseDeclarations(armedCaptionRule.declarations),
    [['opacity', '0.55']],
    'the caption must begin at its approved armed fallback opacity',
  )

  for (const { selector, animation } of fallbackAnimationTuples) {
    const rule = findOnlyStyleRule(
      source,
      selector,
      `${selector} must have one revealing fallback animation`,
    )
    assertExactStructure(
      parseDeclarations(rule.declarations),
      [['animation', animation]],
      `${selector} must preserve its approved revealing fallback timing`,
    )
  }

  for (const { selector, declarations } of getLeafRules(source)) {
    const parsedDeclarations = parseDeclarations(declarations)
    const beginsHidden = parsedDeclarations.some(
      ([property, value]) =>
        (property === 'opacity' && value === '0') ||
        (property === 'transform' &&
          ['scaleX(0)', 'scale(0.92)', 'translateY(6px)', 'translateY(8px)'].includes(
            value,
          )),
    )

    if (!beginsHidden || !selector.includes('[data-motion-part')) {
      continue
    }

    assert.match(
      selector,
      /\[data-motion-layout='flow'\]\[data-motion-state='armed'\]/u,
      'meaningful fallback layers may hide or offset only for an armed flow visit',
    )
  }

  const flowSafetyRule = findOnlyStyleRule(
    source,
    ".signalStory[data-motion-layout='flow']:not([data-motion-state='idle'])",
    'post-hydration flow visits must release the prepaint chapter geometry',
  )
  assertExactStructure(
    parseDeclarations(flowSafetyRule.declarations),
    [
      ['min-height', 'auto'],
      ['view-timeline-name', 'none'],
    ],
    'post-hydration flow visits must cancel only the prepaint height and timeline',
  )

  const disabledStickyRule = findOnlyStyleRule(
    source,
    ".signalStory[data-motion-sticky='disabled'] .signalSection",
    'disabled sticky state must release the signal section regardless of the safety latch',
  )
  assertExactStructure(
    parseDeclarations(disabledStickyRule.declarations),
    [
      ['position', 'relative'],
      ['top', 'auto'],
      ['min-height', 'auto'],
    ],
    'disabled sticky state must restore ordinary section layout',
  )

  const latchedPartsRule = findOnlyStyleRule(
    source,
    ".signalStory[data-motion-state='latched'] [data-motion-part]",
    'latched visits must settle every motion part',
  )
  assertExactStructure(
    parseDeclarations(latchedPartsRule.declarations),
    [
      ['animation', 'none'],
      ['opacity', '1'],
    ],
    'latched visits must stop every motion part at full opacity',
  )

  const latchedTransformsRule = findOnlyStyleRuleList(
    source,
    [
      ".signalStory[data-motion-state='latched'] [data-motion-part='instrument']",
      ".signalStory[data-motion-state='latched'] [data-motion-part='target-field']",
      ".signalStory[data-motion-state='latched'] [data-motion-part='trace-mask']",
      ".signalStory[data-motion-state='latched'] [data-motion-part='latest-reading']",
      ".signalStory[data-motion-state='latched'] [data-motion-part='latest-point']",
      ".signalStory[data-motion-state='latched'] [data-motion-part='metrics'] > div",
    ],
    'latched visits must settle every transformed motion part',
  )
  assertExactStructure(
    parseDeclarations(latchedTransformsRule.declarations),
    [['transform', 'none']],
    'latched visits must remove every motion transform',
  )

  const reducedMotionBlock = findOnlyBlock(
    getTopLevelBlocks(source),
    '@media (prefers-reduced-motion: reduce)',
    'reduced-motion visits must have one explicit final-frame reset',
  )
  const reducedMotionRules = collectStyleRules(
    source,
    reducedMotionBlock.bodyStart,
    reducedMotionBlock.bodyEnd,
  )
  const findReducedMotionRule = (selector, message) => {
    const expectedSelector = normalizeSelector(selector)
    const matches = reducedMotionRules.filter(
      (rule) => normalizeSelector(rule.selector) === expectedSelector,
    )
    assert.equal(matches.length, 1, message)
    return matches[0]
  }

  assertExactStructure(
    parseDeclarations(
      findReducedMotionRule(
        ".signalStory[data-motion-layout='flow']",
        'an initially reduced-motion flow visit must retain ordinary chapter height',
      ).declarations,
    ),
    [
      ['min-height', 'auto'],
      ['view-timeline-name', 'none'],
    ],
    'an initially reduced-motion flow visit must not reserve scroll passage height',
  )
  assertExactStructure(
    parseDeclarations(
      findReducedMotionRule(
        '.signalStory .signalSection',
        'reduced-motion must remove native sticky positioning',
      ).declarations,
    ),
    [
      ['position', 'relative'],
      ['top', 'auto'],
      ['min-height', 'auto'],
    ],
    'reduced-motion must restore ordinary section layout',
  )
  const reducedGenericRule = findReducedMotionRule(
    '.signalStory [data-motion-part]',
    'reduced-motion must settle every motion part',
  )
  assertExactStructure(
    parseDeclarations(reducedGenericRule.declarations),
    [
      ['animation', 'none'],
      ['opacity', '1'],
      ['transform', 'none'],
    ],
    'reduced-motion must settle every motion part at its final frame',
  )
  const reducedMaskRule = findReducedMotionRule(
    ".signalStory [data-motion-part='trace-mask']",
    'reduced-motion must leave the trace mask fully revealed',
  )
  assertExactStructure(
    parseDeclarations(reducedMaskRule.declarations),
    [['transform', 'scaleX(1)']],
    'reduced-motion must reveal the full trace mask',
  )
  validateTraceMaskFinalTransform(
    source,
    latchedTransformsRule,
    reducedGenericRule,
    reducedMaskRule,
  )

  for (const rule of reducedMotionRules) {
    const declarations = parseDeclarations(rule.declarations)
    if (
      declarations.some(
        ([property, value]) =>
          property === 'min-height' && value === 'auto',
      )
    ) {
      assert.doesNotMatch(
        rule.selector,
        /\[data-motion-layout='scroll'\]/u,
        'reduced-motion must preserve the saved outer chapter height of a scroll visit',
      )
    }
  }

  validateMeaningfulMotionVisibility(source, markup)
}

function moveNativeRuleOutsideGate(source, target) {
  const rootBlocks = getTopLevelBlocks(source)
  const mediaBlock = findOnlyBlock(
    rootBlocks,
    nativeMediaHeader,
    'mutation fixture needs the native media gate',
  )
  const supportsBlock = findOnlyBlock(
    getTopLevelBlocks(
      source,
      mediaBlock.bodyStart,
      mediaBlock.bodyEnd,
    ),
    nativeSupportsHeader,
    'mutation fixture needs the native supports gate',
  )
  const expectedSelector = normalizeSelector(
    `${activeMotionRoot} ${target}`,
  )
  const nativeRule = getTopLevelBlocks(
    source,
    supportsBlock.bodyStart,
    supportsBlock.bodyEnd,
  ).find(
    (block) =>
      normalizeSelector(block.header) === expectedSelector,
  )

  assert.notEqual(
    nativeRule,
    undefined,
    `mutation fixture needs ${target}`,
  )

  return `${source.slice(0, nativeRule.start)}${source.slice(nativeRule.end)}\n${source.slice(nativeRule.start, nativeRule.end).trim()}\n`
}

const nativeResetTargets = nativeAnimationTuples.map(
  ({ target }) => target,
)
const nativeAlternateResetTargets = [
  "[data-motion-part='instrument']",
  "[data-motion-part='target-field']",
  "[data-motion-part='thresholds']",
  "[data-motion-part='trace-mask']",
  "[data-motion-part='latest-point']",
  "[data-motion-part='latest-reading']",
  "[data-motion-part='metrics'] > div",
  "[data-motion-part='metrics'] > div:nth-child(1)",
  "[data-motion-part='metrics'] > div:nth-child(2)",
  "[data-motion-part='metrics'] > div:nth-child(3)",
  "[data-motion-part='metrics'] > div:nth-child(4)",
  "[data-motion-part='caption']",
]

test('the pure motion selector exists without a client or React boundary', () => {
  assert.equal(
    existsSync(signalMotionPath),
    true,
    'signal-motion.ts must exist',
  )
  assert.doesNotMatch(signalMotion, /^\s*['"]use client['"];?/mu)
  assert.doesNotMatch(signalMotion, /from ['"]react['"]/u)
})

test('SignalStory is the only signal client boundary and accepts rendered children only', () => {
  assert.equal(
    existsSync(signalStoryPath),
    true,
    'signal-story.tsx must exist',
  )
  assert.match(signalStory, /^'use client'\n/u)

  const propsBody =
    /interface SignalStoryProps\s*\{([\s\S]*?)\}/u.exec(signalStory)?.[1]
  assert.notEqual(propsBody, undefined, 'SignalStoryProps must exist')
  assert.equal(
    propsBody.replaceAll(/\s+/gu, ' ').trim(),
    'readonly children: ReactNode',
  )

  for (const lifecycleImport of [
    'classifySignalPosition',
    'FALLBACK_DURATION_MS',
    'FALLBACK_ROOT_MARGIN',
    'FALLBACK_THRESHOLD',
    'MAX_NATIVE_INSTRUMENT_HEIGHT',
    'REDUCED_MOTION_QUERY',
    'SCROLL_MEDIA_QUERY',
    'selectSignalMotion',
    'shouldLatchScrollLayout',
    'SignalMotionLayout',
    'SignalMotionState',
  ]) {
    assert.equal(
      signalStory.includes(lifecycleImport),
      true,
      `SignalStory must import and use ${lifecycleImport}`,
    )
  }
  assert.match(signalStory, /from '\.\/signal-motion'/u)

  for (const forbiddenImport of [
    '@glucoseiq/',
    'glucose-signal-figure',
    'glucose-trace',
    'glucose-profile',
  ]) {
    assert.equal(
      `${signalMotion}\n${signalStory}`.includes(forbiddenImport),
      false,
      `client lifecycle must not import ${forbiddenImport}`,
    )
  }
})

test('SignalStory renders the complete flow state before hydration', () => {
  assert.match(signalStory, /data-motion-layout="flow"/u)
  assert.match(signalStory, /data-motion-state="idle"/u)
  assert.match(signalStory, /data-motion-sticky="enabled"/u)
  assert.match(
    signalStory,
    /data-motion-part="completion-sentinel"/u,
  )
  assert.match(signalStory, /\{children\}/u)

  assert.match(
    signalMotion,
    /export type SignalMotionLayout = 'scroll' \| 'flow'/u,
  )
  assert.match(
    signalMotion,
    /export type SignalMotionState =\s*\| 'idle'\s*\| 'armed'\s*\| 'revealing'\s*\| 'latched'/u,
  )
  assert.match(
    signalStory,
    /type SignalMotionSticky = 'enabled' \| 'disabled'/u,
  )
})

test('capability selection measures the approved viewport, motion, CSS, and height gates', () => {
  assert.match(
    signalMotion,
    /\(min-width: 900px\) and \(min-height: 720px\)/u,
  )
  assert.match(signalMotion, /prefers-reduced-motion: no-preference/u)
  assert.match(signalMotion, /prefers-reduced-motion: reduce/u)
  assert.match(
    signalStory,
    /CSS\.supports\(\s*'view-timeline-name: --signal-passage',\s*\)/u,
  )
  assert.match(
    signalStory,
    /CSS\.supports\(\s*'animation-range: contain 0% contain 15%',\s*\)/u,
  )
  assert.match(
    signalStory,
    /viewportEligible:\s*scrollQuery\.matches &&\s*instrument\.offsetHeight <= MAX_NATIVE_INSTRUMENT_HEIGHT/u,
  )
})

test('flow fallback and scroll completion use separate one-shot observers', () => {
  assert.match(
    signalStory,
    /new IntersectionObserver\([\s\S]*?\{\s*threshold: FALLBACK_THRESHOLD,\s*rootMargin: FALLBACK_ROOT_MARGIN,\s*\},\s*\)/u,
  )
  assert.match(
    signalMotion,
    /export const FALLBACK_THRESHOLD = 0\.25/u,
  )
  assert.match(
    signalMotion,
    /export const FALLBACK_ROOT_MARGIN = '0px'/u,
  )
  assert.match(
    signalStory,
    /querySelector<HTMLElement>\(\s*'\[data-motion-part="completion-sentinel"\]',\s*\)/u,
  )
  assert.match(
    signalStory,
    /completionObserver = new IntersectionObserver/u,
  )
  assert.match(signalStory, /triggerObserver\?\.disconnect\(\)/u)
  assert.match(
    signalStory,
    /window\.setTimeout\([\s\S]*?FALLBACK_DURATION_MS/u,
  )
})

test('restoration and capability changes latch without switching the visit layout', () => {
  assert.match(signalStory, /event\.persisted/u)
  assert.match(
    signalStory,
    /shouldLatchScrollLayout\(\{\s*layout,\s*viewportEligible: scrollQuery\.matches,\s*instrumentHeight: instrument\.offsetHeight,\s*\}\)/u,
  )
  assert.match(
    signalStory,
    /reducedMotionQuery\.addEventListener\(\s*'change',\s*onReducedMotionChange,\s*\)/u,
  )
  assert.match(
    signalStory,
    /scrollQuery\.addEventListener\('change', onViewportChange\)/u,
  )
  assert.match(
    signalStory,
    /window\.addEventListener\('pageshow', onPageShow\)/u,
  )
  assert.match(
    signalStory,
    /window\.addEventListener\('resize', onViewportChange\)/u,
  )
  assert.match(
    signalStory,
    /window\.addEventListener\('orientationchange', onViewportChange\)/u,
  )
})

test('controller cleanup is complete and guards Strict Mode teardown', () => {
  assert.match(signalStory, /let active = true/u)
  assert.match(signalStory, /if \(!active\) \{\s*return\s*\}/u)
  assert.match(signalStory, /active = false/u)

  assert.match(
    signalStory,
    /reducedMotionQuery\.removeEventListener\(\s*'change',\s*onReducedMotionChange,\s*\)/u,
  )
  assert.match(
    signalStory,
    /scrollQuery\.removeEventListener\('change', onViewportChange\)/u,
  )
  assert.match(
    signalStory,
    /window\.removeEventListener\('pageshow', onPageShow\)/u,
  )
  assert.match(
    signalStory,
    /window\.removeEventListener\('resize', onViewportChange\)/u,
  )
  assert.match(
    signalStory,
    /window\.removeEventListener\(\s*'orientationchange',\s*onViewportChange,\s*\)/u,
  )
  assert.match(signalStory, /triggerObserver\?\.disconnect\(\)/u)
  assert.match(signalStory, /completionObserver\?\.disconnect\(\)/u)
  assert.match(signalStory, /window\.clearTimeout\(fallbackTimer\)/u)

  assert.doesNotMatch(signalStory, /requestAnimationFrame/u)
  assert.doesNotMatch(signalStory, /addEventListener\('scroll'/u)
  assert.doesNotMatch(signalStory, /\bwheel\b/u)
  assert.doesNotMatch(signalStory, /\btouchstart\b/u)
  assert.doesNotMatch(signalStory, /\btouchmove\b/u)
})

test('the server homepage passes one complete figure through SignalStory', () => {
  assert.match(page, /import \{ SignalStory \} from '\.\/signal-story'/u)
  assert.match(
    page,
    /<SignalStory>\s*<GlucoseSignalFigure\s+currentReading=\{displayedReading\}\s+currentTrend=\{displayedTrend\}\s+cv=\{report\.cv\}\s+gmi=\{report\.gmi\}\s+meanGlucose=\{report\.meanGlucose\}\s+readings=\{readings\}\s+timeInRange=\{timeInRange\}\s+timeZone=\{completeProfile\.timeZone\}\s+totalReadings=\{report\.dataSufficiency\.totalReadings\}\s*\/>\s*<\/SignalStory>/u,
  )
  assert.equal(
    (page.match(/<SignalStory>/gu) ?? []).length,
    1,
    'homepage must render one SignalStory boundary',
  )
  assert.doesNotMatch(signalStory, /\b(?:currentReading|currentTrend|cv|gmi|meanGlucose|readings|timeInRange|timeZone|totalReadings)\b/u)
})

test('native motion owns one named outer-story timeline behind the approved capability gate', () => {
  assert.equal(
    existsSync(signalStylesPath),
    true,
    'glucose-signal.module.css must exist',
  )
  assert.match(
    signalStyles,
    /view-timeline-name:\s*--signal-passage/u,
  )
  assert.match(signalStyles, /view-timeline-axis:\s*block/u)
  assert.match(
    signalStyles,
    /calc\(100svh \+ clamp\(360px, 45svh, 620px\)\)/u,
  )
  assert.match(
    signalStyles,
    /@media \(scripting: enabled\)\s+and \(prefers-reduced-motion: no-preference\)\s+and \(min-width: 900px\)\s+and \(min-height: 720px\)/u,
  )
  assert.match(
    signalStyles,
    /@supports\s+\(view-timeline-name: --signal-passage\)\s+and \(animation-range: contain 0% contain 15%\)/u,
  )

  const timelineOwners = getLeafRules(signalStyles).filter(
    ({ declarations }) =>
      declarations.includes(
        'view-timeline-name: --signal-passage',
      ),
  )
  assert.ok(
    timelineOwners.length >= 2,
    'persistent and prepaint layouts must both establish the timeline',
  )
  for (const { selector } of timelineOwners) {
    assert.match(selector, /\.signalStory/u)
    assert.doesNotMatch(selector, /\.signalSection/u)
  }
})

test('native motion preserves sticky geometry and compositor-only ownership', () => {
  assert.match(
    signalStyles,
    /\.signalStory\s*\{\s*position:\s*relative;/u,
  )
  assert.match(
    signalStyles,
    /\.signalStory\[data-motion-layout='scroll'\]\[data-motion-sticky='enabled'\]\s+\.signalSection\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*56px;[\s\S]*?display:\s*grid;[\s\S]*?min-height:\s*calc\(100svh - 56px\);[\s\S]*?place-items:\s*center;/u,
  )
  assert.match(
    signalStyles,
    /\.completionSentinel\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*0;[\s\S]*?width:\s*1px;[\s\S]*?height:\s*1px;[\s\S]*?pointer-events:\s*none;/u,
  )
  assert.match(
    signalStyles,
    /\.traceTarget,\s*\.traceMask\s*\{[\s\S]*?transform-box:\s*fill-box;[\s\S]*?transform-origin:\s*left center;/u,
  )
  assert.match(
    signalStyles,
    /\.traceLatestPoint\s*\{[\s\S]*?transform-box:\s*fill-box;[\s\S]*?transform-origin:\s*center;/u,
  )

  for (const { selector, declarations } of getLeafRules(
    signalStyles,
  )) {
    const targetsStickyAncestor = selector
      .split(',')
      .some((part) =>
        /(?:^|\s)\.signal(?:Story|Section)(?:\[[^\]]+\])*\s*$/u.test(
          part.trim(),
        ),
      )
    if (targetsStickyAncestor) {
      assert.doesNotMatch(
        declarations,
        /(?:^|;)\s*transform\s*:/u,
        `${selector} must remain untransformed`,
      )
    }
  }

  for (const forbidden of [
    /\bposition:\s*fixed\b/u,
    /\bscroll-snap/u,
    /\bdvh\b/u,
    /\bstroke-dashoffset\s*:/u,
    /\btransition:\s*all\b/u,
    /\bwill-change\s*:/u,
  ]) {
    assert.doesNotMatch(signalStyles, forbidden)
  }
})

test('native eligibility keeps the settled desktop frame inside its 616-pixel fit cap', () => {
  assert.match(
    signalMotion,
    /export const MAX_NATIVE_INSTRUMENT_HEIGHT = 616/u,
  )
  assert.match(
    signalStyles,
    /\.signalHeader\s*\{[\s\S]*?padding:\s*30px 40px 26px;/u,
  )
  assert.match(
    signalStyles,
    /\.trace\s*\{[\s\S]*?padding:\s*16px 40px 12px;/u,
  )
  assert.match(
    signalStyles,
    /\.signalMetrics\s*\{[\s\S]*?padding:\s*21px 40px 23px;/u,
  )
  assert.match(
    signalStyles,
    /\.signalCaption\s*\{[\s\S]*?padding:\s*14px 40px 17px;/u,
  )
  assert.match(signalStyles, /@media \(max-width: 899px\)/u)
  assert.doesNotMatch(signalStyles, /@media \(max-width: 900px\)/u)
})

test('the native contract rejects a swapped selector-animation tuple', () => {
  const swappedTuple = signalStyles.replace(
    'animation-name: signalStageIn;',
    'animation-name: signalScaleXIn;',
  )

  assert.notEqual(swappedTuple, signalStyles)
  assert.throws(
    () => validateNativeMotionSource(swappedTuple),
    /native animation tuple/u,
  )
})

test('the native contract rejects a timeline rule escaped from the exact capability gate', () => {
  assert.throws(
    () =>
      validateNativeMotionSource(
        moveNativeRuleOutsideGate(signalStyles, '.traceMask'),
      ),
    /exact native capability gate/u,
  )
})

test('the native contract rejects a duplicate keyframe nested in a conditional', () => {
  const nestedDuplicate = `${signalStyles}
@media (min-width: 900px) {
  @keyframes signalScaleXIn {
    from {
      opacity: 0;
      transform: scaleX(0);
    }

    to {
      opacity: 1;
      transform: scaleX(1);
    }
  }
}
`

  assert.throws(
    () => validateNativeMotionSource(nestedDuplicate),
    /defined exactly once across the stylesheet/u,
  )
})

test('the native contract rejects unsafe and indirect keyframe properties', () => {
  for (const [property, replacement, message] of [
    ['width', 'width: 0;', /SVG geometry property/u],
    ['x', 'x: 0;', /SVG geometry property/u],
    [
      'custom property',
      '--trace-progress: 0;',
      /custom property/u,
    ],
    ['filter', 'filter: blur(2px);', /compositor allowlist/u],
  ]) {
    const unsafeKeyframe = signalStyles.replace(
      'transform: scaleX(0);',
      replacement,
    )

    assert.notEqual(unsafeKeyframe, signalStyles)
    assert.throws(
      () => validateNativeMotionSource(unsafeKeyframe),
      message,
      `${property} must not pass the native keyframe contract`,
    )
  }
})

test('the native contract rejects later animation shorthand resets for every target', () => {
  for (const target of nativeResetTargets) {
    assert.throws(
      () =>
        validateNativeMotionSource(
          `${signalStyles}\n${target} { animation: none; }\n`,
        ),
      /later animation shorthand reset/u,
      `${target} must retain its named timeline`,
    )
  }
})

test('the native contract rejects later shorthand resets through every alternate target selector', () => {
  for (const target of nativeAlternateResetTargets) {
    assert.throws(
      () =>
        validateNativeMotionSource(
          `${signalStyles}\n${target} { animation: none; }\n`,
        ),
      /later animation shorthand reset/u,
      `${target} must retain its named timeline`,
    )
  }
})

test('the native contract ignores shorthand on selector substrings and pseudo-elements', () => {
  for (const unrelatedTarget of [
    '.signalInstrumentSummary',
    '.signalMetricsSummary',
    '.signalInstrument::before',
    "[data-motion-part='instrument-note']",
  ]) {
    assert.doesNotThrow(
      () =>
        validateNativeMotionSource(
          `${signalStyles}\n${unrelatedTarget} { animation: none; }\n`,
        ),
      `${unrelatedTarget} is not a native target reset`,
    )
  }
})

test('native motion binds all exact tuples, keyframe bodies, and gate nesting', () => {
  assert.doesNotThrow(() =>
    validateNativeMotionSource(signalStyles),
  )
})

test('native motion declares every approved beat, range, and easing', () => {
  for (const keyframe of [
    'signalStageIn',
    'signalScaleXIn',
    'signalFadeIn',
    'signalCurrentIn',
    'signalPointIn',
    'signalMetricIn',
    'signalCaptionIn',
  ]) {
    assert.match(
      signalStyles,
      new RegExp(`@keyframes ${keyframe}\\b`, 'u'),
    )
  }

  for (const range of [
    'contain 0% contain 15%',
    'contain 10% contain 28%',
    'contain 22% contain 68%',
    'contain 58% contain 76%',
    'contain 70% contain 82%',
    'contain 72% contain 84%',
    'contain 74% contain 86%',
    'contain 76% contain 88%',
    'contain 88% contain 99%',
  ]) {
    assert.match(
      signalStyles,
      new RegExp(
        `animation-range:\\s*${range}`,
        'u',
      ),
    )
  }

  assert.match(
    signalStyles,
    /cubic-bezier\(0\.16, 1, 0\.3, 1\)/u,
  )
  assert.match(
    signalStyles,
    /cubic-bezier\(0\.65, 0, 0\.35, 1\)/u,
  )
  assert.match(
    signalStyles,
    /\[data-motion-sticky='enabled'\]:not\(\s*\[data-motion-state='latched'\]\s*\)/u,
  )
  assert.match(
    signalStyles,
    /\[data-motion-state='latched'\][\s\S]*?animation-name:\s*none;/u,
  )

  const keyframeSource =
    signalStyles.match(
      /@keyframes signalStageIn[\s\S]*?(?=@media \(scripting: enabled\))/u,
    )?.[0] ?? ''
  assert.doesNotMatch(
    keyframeSource,
    /\b(?:filter|box-shadow|text-shadow)\s*:/u,
  )
})

test('every native animation preserves its named timeline with ordered longhands', () => {
  const nativeRules = getLeafRules(signalStyles).filter(
    ({ declarations }) =>
      declarations.includes(
        'animation-timeline: --signal-passage',
      ),
  )

  assert.equal(
    nativeRules.length,
    11,
    'the instrument, field, thresholds, mask, endpoint, reading, four metrics, and caption each own one native animation',
  )

  for (const { selector, declarations } of nativeRules) {
    const nameIndex = declarations.indexOf('animation-name:')
    const durationIndex = declarations.indexOf(
      'animation-duration:',
    )
    const fillIndex = declarations.indexOf('animation-fill-mode:')
    const easingIndex = declarations.indexOf(
      'animation-timing-function:',
    )
    const timelineIndex = declarations.indexOf(
      'animation-timeline:',
    )
    const rangeIndex = declarations.indexOf('animation-range:')

    assert.ok(nameIndex >= 0, `${selector} needs animation-name`)
    assert.ok(
      durationIndex > nameIndex,
      `${selector} must order duration after name`,
    )
    assert.ok(
      fillIndex > durationIndex,
      `${selector} must order fill mode after duration`,
    )
    assert.ok(
      easingIndex > fillIndex,
      `${selector} must order easing after fill mode`,
    )
    assert.ok(
      timelineIndex > easingIndex,
      `${selector} must declare its timeline after all longhands`,
    )
    assert.ok(
      rangeIndex > timelineIndex,
      `${selector} must declare its range after its timeline`,
    )
    assert.match(declarations, /animation-duration:\s*1ms;/u)
    assert.match(declarations, /animation-fill-mode:\s*both;/u)
    assert.doesNotMatch(
      declarations,
      /(?:^|;)\s*animation\s*:/u,
      `${selector} must not reset its timeline with animation shorthand`,
    )
  }
})

test('flow fallback timing and reduced-motion safety preserve a complete final frame', () => {
  assert.doesNotThrow(() =>
    validateFallbackMotionSource(signalStyles),
  )
})

test('the fallback contract rejects later equal or higher trace-mask resets', () => {
  for (const selector of [
    ".signalStory[data-motion-state='latched'] [data-motion-part='trace-mask']",
    ".signalStory[data-motion-layout='flow'][data-motion-state='latched'] [data-motion-part='trace-mask']",
  ]) {
    const laterMaskReset = `${signalStyles}
${selector} {
  transform: none;
}
`

    assert.throws(
      () => validateFallbackMotionSource(laterMaskReset),
      /latched trace masks must have one|later equal or higher-specificity trace-mask rule/u,
    )
  }
})

test('the fallback contract rejects meaningful motion-part concealment mutations', () => {
  for (const declaration of [
    'display: none;',
    'visibility: hidden;',
    'opacity: 0;',
    'transform: scaleX(0);',
  ]) {
    const concealedCaption = `${signalStyles}
.signalStory[data-motion-state='idle']
  [data-motion-part='caption'] {
  ${declaration}
}
`

    assert.throws(
      () =>
        validateMeaningfulMotionVisibility(
          concealedCaption,
          signalMarkup,
        ),
      /caption must not hide outside its exact armed flow start/u,
    )
  }

  const ariaHiddenCaption = signalMarkup.replace(
    'data-motion-part="caption"',
    'aria-hidden="true" data-motion-part="caption"',
  )
  assert.notEqual(ariaHiddenCaption, signalMarkup)
  assert.throws(
    () =>
      validateMeaningfulMotionVisibility(
        signalStyles,
        ariaHiddenCaption,
      ),
    /caption must not become aria hidden/u,
  )
})

test('the fallback contract rejects broad signal ancestor concealment mutations', () => {
  for (const [ancestor, selector] of [
    [
      'signal-story',
      ".signalStory[data-motion-layout='flow'][data-motion-state='armed']",
    ],
    ['signal-section', '.signalSection'],
    ['instrument', '.signalInstrument'],
  ]) {
    for (const declaration of [
      'display: none;',
      'visibility: hidden;',
      'opacity: 0;',
      'transform: scaleX(0);',
    ]) {
      const concealedStory = `${signalStyles}
${selector} {
  ${declaration}
}
`

      assert.throws(
        () =>
          validateMeaningfulMotionVisibility(
            concealedStory,
            signalMarkup,
          ),
        new RegExp(
          `${ancestor} must not hide outside its exact armed flow start`,
          'u',
        ),
      )
    }
  }

  for (const [ancestor, className] of [
    ['signal-story', 'signalStory'],
    ['signal-section', 'signalSection'],
    ['instrument', 'signalInstrument'],
  ]) {
    const ariaHiddenAncestor = signalMarkup.replace(
      `className={styles.${className}}`,
      `aria-hidden="true" className={styles.${className}}`,
    )
    assert.notEqual(ariaHiddenAncestor, signalMarkup)
    assert.throws(
      () =>
        validateMeaningfulMotionVisibility(
          signalStyles,
          ariaHiddenAncestor,
        ),
      new RegExp(`${ancestor} must not become aria hidden`, 'u'),
    )
  }
})

test('the fallback contract rejects trace wrapper aria-hidden mutations', () => {
  for (const [ancestor, className] of [
    ['signal-trace', 'trace'],
    ['signal-trace-plot', 'tracePlot'],
  ]) {
    assert.match(
      signalMarkup,
      new RegExp(`className=\\{styles\\.${className}\\}`, 'u'),
      `${ancestor} must be included in inspected signal markup`,
    )
    const ariaHiddenAncestor = signalMarkup.replace(
      `className={styles.${className}}`,
      `aria-hidden="true" className={styles.${className}}`,
    )
    assert.notEqual(ariaHiddenAncestor, signalMarkup)
    assert.throws(
      () =>
        validateMeaningfulMotionVisibility(
          signalStyles,
          ariaHiddenAncestor,
        ),
      new RegExp(`${ancestor} must not become aria hidden`, 'u'),
    )
  }
})
