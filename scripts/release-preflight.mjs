import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const APEX_URL = 'https://glucoseiq.dev/'
export const WWW_URL = 'https://www.glucoseiq.dev/'
export const DEFAULT_ATTEMPTS = 3
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
export const DEFAULT_RETRY_DELAY_MS = 2_000

const ROBOTS_URL = new URL('/robots.txt', APEX_URL).href
const SITEMAP_URL = new URL('/sitemap.xml', APEX_URL).href
const HEAD_ELEMENTS = new Set([
  'base',
  'basefont',
  'bgsound',
  'link',
  'meta',
  'noframes',
  'noscript',
  'script',
  'style',
  'template',
  'title',
])
const RAW_TEXT_ELEMENTS = new Set([
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
])
const FOREIGN_ROOTS = new Set(['math', 'svg'])
const HEAD_CLOSING_END_TAGS = new Set(['body', 'br', 'html'])

function describeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/gu, ' ').trim() || 'unknown failure'
}

function findTagEnd(html, start) {
  let quote
  for (let index = start; index < html.length; index += 1) {
    const character = html[index]
    if (quote) {
      if (character === quote) quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '<') throw new Error('apex canonical: malformed HTML tag')
    if (character === '>') return index
  }
  throw new Error('apex canonical: malformed HTML tag')
}

function parseAttributes(html, start, end) {
  const attributes = new Map()
  let index = start
  let selfClosing = false

  while (index < end) {
    while (/\s/u.test(html[index] ?? '')) index += 1
    if (index >= end) break
    if (html[index] === '/') {
      selfClosing = true
      index += 1
      while (/\s/u.test(html[index] ?? '')) index += 1
      if (index !== end) throw new Error('apex canonical: malformed self-closing HTML tag')
      break
    }

    const nameMatch = /^[^\s"'`=<>/]+/u.exec(html.slice(index, end))
    if (!nameMatch) throw new Error('apex canonical: malformed link attributes')
    const name = nameMatch[0].toLowerCase()
    index += nameMatch[0].length

    while (/\s/u.test(html[index] ?? '')) index += 1
    let value = ''

    if (html[index] === '=') {
      index += 1
      while (/\s/u.test(html[index] ?? '')) index += 1
      const quote = html[index]

      if (quote === '"' || quote === "'") {
        const valueEnd = html.indexOf(quote, index + 1)
        if (valueEnd === -1 || valueEnd >= end) {
          throw new Error('apex canonical: malformed quoted link attribute')
        }
        value = html.slice(index + 1, valueEnd)
        index = valueEnd + 1
      } else {
        const valueMatch = /^[^\s"'`=<>]+/u.exec(html.slice(index, end))
        if (!valueMatch) throw new Error('apex canonical: malformed link attribute value')
        value = valueMatch[0]
        index += valueMatch[0].length
      }
    }

    if (attributes.has(name)) {
      throw new Error(`apex canonical: duplicate ${name} attribute`)
    }
    attributes.set(name, value)
  }

  return { attributes, selfClosing }
}

function parseTag(html, start) {
  let index = start + 1
  let type = 'startTag'
  if (html[index] === '/') {
    type = 'endTag'
    index += 1
  }

  const nameMatch = /^[A-Za-z][A-Za-z0-9:-]*/u.exec(html.slice(index))
  if (!nameMatch) return { next: start + 1, token: { data: '<', type: 'text' } }
  const name = nameMatch[0].toLowerCase()
  index += nameMatch[0].length
  const end = findTagEnd(html, index)

  if (type === 'endTag') {
    return { next: end + 1, token: { name, type } }
  }

  const { attributes, selfClosing } = parseAttributes(html, index, end)
  return {
    next: end + 1,
    token: { attributes, name, selfClosing, type },
  }
}

function findRawTextEnd(lowerHtml, start, name) {
  const prefix = `</${name}`
  let candidate = lowerHtml.indexOf(prefix, start)
  while (candidate !== -1) {
    const boundary = lowerHtml[candidate + prefix.length]
    if (boundary === '>' || boundary === '/' || /\s/u.test(boundary ?? '')) return candidate
    candidate = lowerHtml.indexOf(prefix, candidate + prefix.length)
  }
  return -1
}

function* tokenizeHtml(html) {
  const lowerHtml = html.toLowerCase()
  let index = 0

  while (index < html.length) {
    const tagStart = html.indexOf('<', index)
    if (tagStart === -1) {
      yield { data: html.slice(index), type: 'text' }
      break
    }
    if (tagStart > index) {
      yield { data: html.slice(index, tagStart), type: 'text' }
      index = tagStart
      continue
    }

    if (html.startsWith('<!--', index)) {
      const commentEnd = html.indexOf('-->', index + 4)
      if (commentEnd === -1) throw new Error('apex canonical: malformed HTML comment')
      index = commentEnd + 3
      continue
    }

    if (html.startsWith('<![CDATA[', index)) {
      const cdataEnd = html.indexOf(']]>', index + 9)
      if (cdataEnd === -1) throw new Error('apex canonical: malformed CDATA section')
      index = cdataEnd + 3
      continue
    }

    if (html.startsWith('<!', index) || html.startsWith('<?', index)) {
      index = findTagEnd(html, index + 1) + 1
      continue
    }

    const { next, token } = parseTag(html, index)
    yield token
    index = next

    if (token.type === 'startTag' && RAW_TEXT_ELEMENTS.has(token.name)) {
      const rawTextEnd = findRawTextEnd(lowerHtml, index, token.name)
      if (rawTextEnd === -1) {
        throw new Error(`apex canonical: malformed inert HTML element <${token.name}>`)
      }
      index = rawTextEnd
    } else if (token.type === 'startTag' && token.name === 'plaintext') {
      index = html.length
    }
  }
}

function closeForeignContext(foreignStack, name) {
  const matchingIndex = foreignStack.lastIndexOf(name)
  if (matchingIndex !== -1) foreignStack.length = matchingIndex
}

function inspectDocumentHead(html) {
  if (typeof html !== 'string') throw new Error('apex response body must be a string')

  const canonicalLinks = []
  const foreignStack = []
  let baseHref
  let bodyStarted = false
  let headSeen = false
  let inHead = false
  let templateDepth = 0

  for (const token of tokenizeHtml(html)) {
    if (foreignStack.length > 0) {
      if (token.type === 'startTag' && !token.selfClosing) foreignStack.push(token.name)
      if (token.type === 'endTag') closeForeignContext(foreignStack, token.name)
      continue
    }

    if (templateDepth > 0) {
      if (token.type === 'startTag' && token.name === 'template') templateDepth += 1
      if (token.type === 'endTag' && token.name === 'template') templateDepth -= 1
      continue
    }

    if (token.type === 'text') {
      if (/\S/u.test(token.data)) {
        if (inHead) inHead = false
        bodyStarted = true
      }
      continue
    }

    if (token.type === 'endTag') {
      if (HEAD_CLOSING_END_TAGS.has(token.name) && !bodyStarted) {
        throw new Error(
          `apex canonical: unexpected </${token.name}> before the document head was closed`,
        )
      }
      if (token.name === 'head' && inHead) {
        inHead = false
        bodyStarted = true
      }
      continue
    }

    if (token.name === 'template') {
      templateDepth = 1
      if (!inHead) bodyStarted = true
      continue
    }

    if (FOREIGN_ROOTS.has(token.name)) {
      if (inHead) inHead = false
      bodyStarted = true
      if (!token.selfClosing) foreignStack.push(token.name)
      continue
    }

    if (token.name === 'html') continue
    if (token.name === 'head') {
      if (!headSeen && !bodyStarted) {
        headSeen = true
        inHead = true
      }
      continue
    }
    if (token.name === 'body') {
      inHead = false
      bodyStarted = true
      continue
    }

    if (!inHead) {
      bodyStarted = true
      continue
    }
    if (!HEAD_ELEMENTS.has(token.name)) {
      inHead = false
      bodyStarted = true
      continue
    }

    if (token.name === 'base' && baseHref === undefined && token.attributes.has('href')) {
      baseHref = token.attributes.get('href')
    }
    if (token.name === 'link') {
      const relations = (token.attributes.get('rel') ?? '')
        .toLowerCase()
        .split(/\s+/u)
        .filter(Boolean)
      if (relations.includes('canonical')) canonicalLinks.push(token.attributes)
    }
  }

  if (templateDepth > 0) throw new Error('apex canonical: malformed inert HTML element <template>')
  if (foreignStack.length > 0) throw new Error('apex canonical: malformed foreign HTML context')
  if (canonicalLinks.length !== 1) {
    throw new Error(
      `apex canonical: expected exactly one active canonical link in the document head, found ${canonicalLinks.length}`,
    )
  }

  const canonicalHref = canonicalLinks[0].get('href')
  if (typeof canonicalHref !== 'string' || canonicalHref.trim() === '') {
    throw new Error('apex canonical: canonical link is missing a non-empty href')
  }

  let documentBaseUrl = APEX_URL
  if (baseHref !== undefined) {
    try {
      documentBaseUrl = new URL(baseHref, APEX_URL).href
    } catch (error) {
      throw new Error(`apex base: href "${baseHref}" is not a valid URL`, { cause: error })
    }
  }

  return { canonicalHref, documentBaseUrl }
}

export function extractCanonicalHref(html) {
  return inspectDocumentHead(html).canonicalHref
}

function requirePositiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`)
  }
}

function requireNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`)
  }
}

export async function fetchWithTimeout(
  url,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    readText = false,
    redirect = 'manual',
    AbortControllerImpl = globalThis.AbortController,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
  } = {},
) {
  requirePositiveFinite(timeoutMs, 'timeoutMs')
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function')
  if (typeof AbortControllerImpl !== 'function') {
    throw new TypeError('AbortControllerImpl must be a constructor')
  }
  if (typeof setTimeoutImpl !== 'function' || typeof clearTimeoutImpl !== 'function') {
    throw new TypeError('timeout hooks must be functions')
  }

  const controller = new AbortControllerImpl()
  const timeoutError = new Error(`request ${url} timed out after ${timeoutMs} ms`)
  let timedOut = false
  let timer

  const operation = Promise.resolve().then(async () => {
    let response
    try {
      response = await fetchImpl(url, { redirect, signal: controller.signal })
    } catch (error) {
      if (timedOut) throw timeoutError
      throw new Error(`request ${url} failed: ${describeError(error)}`, { cause: error })
    }

    if (!readText) return { response }
    if (!response || typeof response.text !== 'function') {
      throw new Error(`request ${url} returned a response without a text body reader`)
    }

    try {
      return { body: await response.text(), response }
    } catch (error) {
      if (timedOut) throw timeoutError
      throw new Error(`request ${url} body read failed: ${describeError(error)}`, { cause: error })
    }
  })

  const timeout = new Promise((_, reject) => {
    timer = setTimeoutImpl(() => {
      timedOut = true
      try {
        controller.abort()
      } finally {
        reject(timeoutError)
      }
    }, timeoutMs)
  })

  try {
    return await Promise.race([operation, timeout])
  } finally {
    clearTimeoutImpl(timer)
  }
}

function assertResponseStatus(response, { allowed, label, url }) {
  if (
    !response ||
    !Number.isInteger(response.status) ||
    response.status < 100 ||
    response.status > 599
  ) {
    throw new Error(`${label} (${url}): response is missing an integer HTTP status`)
  }

  if (!allowed.includes(response.status)) {
    const expectation = allowed.length === 1
      ? `${allowed[0]}`
      : `${allowed.slice(0, -1).join(', ')} or ${allowed.at(-1)}`
    throw new Error(
      `${label} (${url}): expected HTTP ${expectation}, received ${response.status}`,
    )
  }
}

function resolveExactUrl(value, { base, expected, label }) {
  let resolved
  try {
    resolved = new URL(value, base).href
  } catch {
    throw new Error(`${label}: value "${value}" is not a valid URL`)
  }

  if (resolved !== expected) {
    throw new Error(`${label}: expected ${expected}, resolved ${resolved}`)
  }

  return resolved
}

export async function verifyReleaseDomainOnce({
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  AbortControllerImpl = globalThis.AbortController,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  const requestOptions = {
    AbortControllerImpl,
    clearTimeoutImpl,
    fetchImpl,
    setTimeoutImpl,
    timeoutMs: requestTimeoutMs,
  }

  const apex = await fetchWithTimeout(APEX_URL, { ...requestOptions, readText: true })
  assertResponseStatus(apex.response, { allowed: [200], label: 'apex', url: APEX_URL })

  const { canonicalHref, documentBaseUrl } = inspectDocumentHead(apex.body)
  try {
    resolveExactUrl(canonicalHref, {
      base: documentBaseUrl,
      expected: APEX_URL,
      label: 'apex canonical',
    })
  } catch (error) {
    if (/is not a valid URL$/u.test(describeError(error))) {
      throw new Error(`apex canonical: href "${canonicalHref}" is not a valid URL`, {
        cause: error,
      })
    }
    throw error
  }

  const robots = await fetchWithTimeout(ROBOTS_URL, requestOptions)
  assertResponseStatus(robots.response, {
    allowed: [200],
    label: 'robots.txt',
    url: ROBOTS_URL,
  })

  const sitemap = await fetchWithTimeout(SITEMAP_URL, requestOptions)
  assertResponseStatus(sitemap.response, {
    allowed: [200],
    label: 'sitemap.xml',
    url: SITEMAP_URL,
  })

  const www = await fetchWithTimeout(WWW_URL, requestOptions)
  assertResponseStatus(www.response, { allowed: [301, 308], label: 'www', url: WWW_URL })
  if (!www.response.headers || typeof www.response.headers.get !== 'function') {
    throw new Error(`www (${WWW_URL}): response is missing readable headers`)
  }

  const location = www.response.headers.get('location')
  if (typeof location !== 'string' || location.trim() === '') {
    throw new Error(`www (${WWW_URL}): missing Location header`)
  }
  resolveExactUrl(location, {
    base: WWW_URL,
    expected: APEX_URL,
    label: 'www Location',
  })

  return {
    apexUrl: APEX_URL,
    checkedUrls: [APEX_URL, ROBOTS_URL, SITEMAP_URL, WWW_URL],
  }
}

export async function runReleasePreflight({
  attempts = DEFAULT_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  sleepImpl = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
  ...requestOptions
} = {}) {
  if (!Number.isInteger(attempts) || attempts <= 0) {
    throw new TypeError('attempts must be a positive integer')
  }
  requirePositiveFinite(requestTimeoutMs, 'requestTimeoutMs')
  requireNonNegativeFinite(retryDelayMs, 'retryDelayMs')
  if (typeof sleepImpl !== 'function') throw new TypeError('sleepImpl must be a function')

  const failures = []
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await verifyReleaseDomainOnce({
        ...requestOptions,
        requestTimeoutMs,
      })
      return { ...result, attemptsUsed: attempt }
    } catch (error) {
      failures.push(`- attempt ${attempt}: ${describeError(error)}`)
      if (attempt < attempts) await sleepImpl(retryDelayMs)
    }
  }

  throw new Error(
    [`Release domain preflight failed after ${attempts} attempts:`, ...failures].join('\n'),
  )
}

export async function runReleasePreflightCli({ write = console.log, ...options } = {}) {
  if (typeof write !== 'function') throw new TypeError('write must be a function')
  const result = await runReleasePreflight(options)
  const attemptLabel = result.attemptsUsed === 1 ? 'attempt' : 'attempts'
  write(
    `Release domain preflight passed: ${result.apexUrl} (${result.checkedUrls.length} endpoints, ${result.attemptsUsed} ${attemptLabel}).`,
  )
  return result
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined
if (entryPath === import.meta.url) {
  try {
    await runReleasePreflightCli()
  } catch (error) {
    console.error(describeError(error))
    process.exitCode = 1
  }
}
