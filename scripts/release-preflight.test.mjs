import assert from 'node:assert/strict'
import test from 'node:test'

import {
  APEX_URL,
  DEFAULT_ATTEMPTS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  WWW_URL,
  extractCanonicalHref,
  fetchWithTimeout,
  runReleasePreflight,
  runReleasePreflightCli,
  verifyReleaseDomainOnce,
} from './release-preflight.mjs'

const ROBOTS_URL = `${APEX_URL}robots.txt`
const SITEMAP_URL = `${APEX_URL}sitemap.xml`

function createResponse(status, { body = '', location } = {}) {
  return {
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'location' ? (location ?? null) : null
      },
    },
    async text() {
      return body
    },
  }
}

function createSuccessfulFetch({
  apexBody,
  canonical = '/',
  headPrefix = '',
  wwwStatus = 308,
  location = APEX_URL,
} = {}) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })

    if (url === APEX_URL) {
      return createResponse(200, {
        body: apexBody ?? `<!doctype html><html><head>${headPrefix}<link data-value=">" HREF="${canonical}" REL="alternate CANONICAL"></head></html>`,
      })
    }
    if (url === ROBOTS_URL || url === SITEMAP_URL) return createResponse(200)
    if (url === WWW_URL) return createResponse(wwwStatus, { location })
    throw new Error(`Unexpected test URL: ${url}`)
  }

  return { calls, fetchImpl }
}

test('extracts one canonical href with case-insensitive attributes and rel tokens', () => {
  const html = [
    '<!doctype html><html><head>',
    '<link rel="stylesheet" href="/styles.css">',
    '<LINK data-value=">" HREF="/" REL="alternate CANONICAL">',
    '</head><body></body></html>',
  ].join('')

  assert.equal(extractCanonicalHref(html), '/')
})

test('ignores canonical-looking text in comments and inert elements', () => {
  const html = [
    '<!doctype html><html><head>',
    '<!-- <link rel="canonical" href="https://comment.example/"> -->',
    '<script>const markup = \'<link rel="canonical" href="https://script.example/">\'</script>',
    '<style>.example::after { content: \'<link rel="canonical" href="https://style.example/">\' }</style>',
    '<template><link rel="canonical" href="https://template.example/"></template>',
    '<link rel="canonical" href="/">',
    '</head><body></body></html>',
  ].join('')

  assert.equal(extractCanonicalHref(html), '/')
})

test('ignores tag-like link text inside quoted attributes and foreign content', () => {
  const html = [
    '<!doctype html><html><head>',
    '<meta data-example="<link rel=\'canonical\' href=\'https://attribute.example/\'>">',
    '<link rel="canonical" href="/">',
    '<svg xmlns="http://www.w3.org/2000/svg"><link rel="canonical" href="https://svg.example/"></link></svg>',
    '<math><link rel="canonical" href="https://math.example/"></link></math>',
    '</head><body></body></html>',
  ].join('')

  assert.equal(extractCanonicalHref(html), '/')
})

test('ignores tag-like base text inside quoted attributes and foreign content', async () => {
  const apexBody = [
    '<!doctype html><html><head>',
    '<meta data-example="<base href=\'https://attribute.example/docs/\'>">',
    '<link rel="canonical" href="/">',
    '<svg xmlns="http://www.w3.org/2000/svg"><base href="https://svg.example/"></base></svg>',
    '</head><body><base href="https://body.example/"></body></html>',
  ].join('')
  const { fetchImpl } = createSuccessfulFetch({ apexBody })

  await assert.doesNotReject(
    verifyReleaseDomainOnce({ fetchImpl, requestTimeoutMs: 100 }),
  )
})

test('rejects a canonical link that exists only in the document body', () => {
  assert.throws(
    () =>
      extractCanonicalHref(
        '<!doctype html><html><head><title>GlucoseIQ</title></head><body><link rel="canonical" href="/"></body></html>',
      ),
    /expected exactly one active canonical link in the document head, found 0/,
  )
})

test('fails closed when a head-closing end tag precedes a canonical in an open head', () => {
  for (const tagName of ['body', 'html', 'br']) {
    assert.throws(
      () =>
        extractCanonicalHref(
          `<!doctype html><html><head></${tagName}><link rel="canonical" href="/"></head><body></body></html>`,
        ),
      new RegExp(`unexpected <\\/${tagName}> before the document head was closed`),
    )
  }
})

test('fails closed when a head-closing end tag appears before a later explicit head', () => {
  for (const tagName of ['body', 'html', 'br']) {
    assert.throws(
      () =>
        extractCanonicalHref(
          `<!doctype html><html></${tagName}><head><link rel="canonical" href="/"></head><body></body></html>`,
        ),
      new RegExp(`unexpected <\\/${tagName}> before the document head was closed`),
    )
  }
})

test('rejects missing, duplicate, and malformed canonical markup', () => {
  assert.throws(
    () => extractCanonicalHref('<html><head></head></html>'),
    /expected exactly one active canonical link in the document head, found 0/,
  )
  assert.throws(
    () =>
      extractCanonicalHref(
        '<html><head><link rel="canonical" href="/"><link href="/other" rel="canonical"></head></html>',
      ),
    /expected exactly one active canonical link in the document head, found 2/,
  )
  assert.throws(
    () => extractCanonicalHref('<html><head><link rel="canonical"></head></html>'),
    /canonical link is missing a non-empty href/,
  )
  assert.throws(
    () => extractCanonicalHref(undefined),
    /apex response body must be a string/,
  )
  assert.throws(
    () => extractCanonicalHref('<html><head><!-- <link rel="canonical" href="/">'),
    /malformed HTML comment/,
  )
  assert.throws(
    () => extractCanonicalHref('<html><head><script><link rel="canonical" href="/">'),
    /malformed inert HTML element/,
  )
})

test('verifies all four release-domain requests with manual redirects and isolated signals', async () => {
  const { calls, fetchImpl } = createSuccessfulFetch()

  const result = await verifyReleaseDomainOnce({ fetchImpl, requestTimeoutMs: 100 })

  assert.deepEqual(result, {
    apexUrl: APEX_URL,
    checkedUrls: [APEX_URL, ROBOTS_URL, SITEMAP_URL, WWW_URL],
  })
  assert.deepEqual(
    calls.map(({ url }) => url),
    [APEX_URL, ROBOTS_URL, SITEMAP_URL, WWW_URL],
  )
  assert.ok(calls.every(({ options }) => options.redirect === 'manual'))
  assert.ok(calls.every(({ options }) => options.signal instanceof AbortSignal))
  assert.equal(new Set(calls.map(({ options }) => options.signal)).size, 4)
})

test('requires HTTP 200 from the apex, robots, and sitemap endpoints', async () => {
  const cases = [
    [APEX_URL, 'apex', 503],
    [ROBOTS_URL, 'robots.txt', 404],
    [SITEMAP_URL, 'sitemap.xml', 204],
  ]

  for (const [failingUrl, label, status] of cases) {
    const { fetchImpl: successfulFetch } = createSuccessfulFetch()
    const fetchImpl = async (url, options) =>
      url === failingUrl ? createResponse(status) : successfulFetch(url, options)

    await assert.rejects(
      verifyReleaseDomainOnce({ fetchImpl, requestTimeoutMs: 100 }),
      new RegExp(`${label} \\(${failingUrl.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\): expected HTTP 200, received ${status}`),
    )
  }
})

test('requires the apex canonical URL to resolve exactly to the HTTPS apex', async () => {
  for (const canonical of [
    'https://example.com/',
    'http://glucoseiq.health/',
    'https://glucoseiq.health/docs',
    'https://glucoseiq.health/?preview=true',
    'https://glucoseiq.health/#top',
  ]) {
    const { fetchImpl } = createSuccessfulFetch({ canonical })

    await assert.rejects(
      verifyReleaseDomainOnce({ fetchImpl, requestTimeoutMs: 100 }),
      /apex canonical: expected https:\/\/glucoseiq\.health\/, resolved /,
    )
  }

  const { fetchImpl } = createSuccessfulFetch({ canonical: 'http://[invalid' })
  await assert.rejects(
    verifyReleaseDomainOnce({ fetchImpl, requestTimeoutMs: 100 }),
    /apex canonical: href "http:\/\/\[invalid" is not a valid URL/,
  )

  const { fetchImpl: alteredByBase } = createSuccessfulFetch({
    canonical: '/',
    headPrefix: '<base href="https://example.com/docs/">',
  })
  await assert.rejects(
    verifyReleaseDomainOnce({ fetchImpl: alteredByBase, requestTimeoutMs: 100 }),
    /apex canonical: expected https:\/\/glucoseiq\.health\/, resolved https:\/\/example\.com\//,
  )
})

test('fails closed when an endpoint response or apex body is malformed', async () => {
  const { fetchImpl: successfulFetch } = createSuccessfulFetch()

  await assert.rejects(
    verifyReleaseDomainOnce({
      fetchImpl: async (url, options) =>
        url === ROBOTS_URL ? { status: '200', headers: new Headers() } : successfulFetch(url, options),
      requestTimeoutMs: 100,
    }),
    /robots\.txt .* response is missing an integer HTTP status/,
  )

  await assert.rejects(
    verifyReleaseDomainOnce({
      fetchImpl: async (url, options) =>
        url === APEX_URL
          ? { status: 200, headers: new Headers() }
          : successfulFetch(url, options),
      requestTimeoutMs: 100,
    }),
    /request https:\/\/glucoseiq\.health\/ returned a response without a text body reader/,
  )

  await assert.rejects(
    verifyReleaseDomainOnce({
      fetchImpl: async (url, options) =>
        url === APEX_URL
          ? createResponse(200, { body: undefined })
          : successfulFetch(url, options),
      requestTimeoutMs: 100,
    }),
    /expected exactly one active canonical link in the document head, found 0/,
  )
})

test('allows only permanent www redirects whose Location resolves exactly to the apex', async () => {
  for (const wwwStatus of [301, 308]) {
    const { fetchImpl } = createSuccessfulFetch({ wwwStatus, location: '//glucoseiq.health/' })
    await assert.doesNotReject(
      verifyReleaseDomainOnce({ fetchImpl, requestTimeoutMs: 100 }),
    )
  }

  for (const wwwStatus of [200, 302, 307, 404]) {
    const { fetchImpl } = createSuccessfulFetch({ wwwStatus })
    await assert.rejects(
      verifyReleaseDomainOnce({ fetchImpl, requestTimeoutMs: 100 }),
      new RegExp(`www .* expected HTTP 301 or 308, received ${wwwStatus}`),
    )
  }

  for (const location of [
    '/',
    'http://glucoseiq.health/',
    'https://glucoseiq.health/docs',
    'https://glucoseiq.health/?from=www',
  ]) {
    const { fetchImpl } = createSuccessfulFetch({ location })
    await assert.rejects(
      verifyReleaseDomainOnce({ fetchImpl, requestTimeoutMs: 100 }),
      /www Location: expected https:\/\/glucoseiq\.health\/, resolved /,
    )
  }

  const { fetchImpl: missingLocation } = createSuccessfulFetch({ location: null })
  await assert.rejects(
    verifyReleaseDomainOnce({ fetchImpl: missingLocation, requestTimeoutMs: 100 }),
    /www .* missing Location header/,
  )

  const { fetchImpl: malformedLocation } = createSuccessfulFetch({ location: 'http://[invalid' })
  await assert.rejects(
    verifyReleaseDomainOnce({ fetchImpl: malformedLocation, requestTimeoutMs: 100 }),
    /www Location: value "http:\/\/\[invalid" is not a valid URL/,
  )
})

test('times out the complete request body read and aborts its request signal', async () => {
  let capturedSignal
  let clearedTimer

  const request = fetchWithTimeout(APEX_URL, {
    fetchImpl: async (_url, { signal }) => {
      capturedSignal = signal
      return {
        status: 200,
        headers: new Headers(),
        text: () => new Promise(() => {}),
      }
    },
    readText: true,
    timeoutMs: 25,
    setTimeoutImpl(callback) {
      queueMicrotask(callback)
      return 41
    },
    clearTimeoutImpl(timer) {
      clearedTimer = timer
    },
  })

  await assert.rejects(
    request,
    /request https:\/\/glucoseiq\.health\/ timed out after 25 ms/,
  )
  assert.equal(capturedSignal.aborted, true)
  assert.equal(clearedTimer, 41)
})

test('reports network failures without exposing unstable stack output', async () => {
  await assert.rejects(
    fetchWithTimeout(APEX_URL, {
      fetchImpl: async () => {
        throw new Error('socket\nclosed')
      },
      timeoutMs: 100,
    }),
    {
      message: 'request https://glucoseiq.health/ failed: socket closed',
    },
  )
})

test('bounds attempts, sleeps only between attempts, and reports every failure', async () => {
  let calls = 0
  const sleeps = []

  await assert.rejects(
    runReleasePreflight({
      attempts: 3,
      fetchImpl: async () => {
        calls += 1
        throw new Error(`offline ${calls}`)
      },
      requestTimeoutMs: 100,
      retryDelayMs: 7,
      sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
    }),
    {
      message: [
        'Release domain preflight failed after 3 attempts:',
        '- attempt 1: request https://glucoseiq.health/ failed: offline 1',
        '- attempt 2: request https://glucoseiq.health/ failed: offline 2',
        '- attempt 3: request https://glucoseiq.health/ failed: offline 3',
      ].join('\n'),
    },
  )

  assert.equal(calls, 3)
  assert.deepEqual(sleeps, [7, 7])
})

test('stops retrying after a successful attempt', async () => {
  const { fetchImpl: successfulFetch } = createSuccessfulFetch()
  let apexAttempts = 0
  const sleeps = []

  const result = await runReleasePreflight({
    attempts: 3,
    fetchImpl: async (url, options) => {
      if (url === APEX_URL && apexAttempts++ === 0) throw new Error('temporary outage')
      return successfulFetch(url, options)
    },
    requestTimeoutMs: 100,
    retryDelayMs: 9,
    sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
  })

  assert.equal(result.attemptsUsed, 2)
  assert.equal(apexAttempts, 2)
  assert.deepEqual(sleeps, [9])
})

test('rejects invalid bounds before issuing a request', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return createResponse(200)
  }

  assert.equal(DEFAULT_ATTEMPTS, 3)
  assert.equal(DEFAULT_REQUEST_TIMEOUT_MS, 10_000)
  await assert.rejects(runReleasePreflight({ attempts: 0, fetchImpl }), /attempts must be a positive integer/)
  await assert.rejects(
    runReleasePreflight({ fetchImpl, requestTimeoutMs: Number.POSITIVE_INFINITY }),
    /requestTimeoutMs must be a positive finite number/,
  )
  await assert.rejects(
    runReleasePreflight({ fetchImpl, retryDelayMs: -1 }),
    /retryDelayMs must be a non-negative finite number/,
  )
  assert.equal(calls, 0)
})

test('CLI uses injected dependencies and prints one deterministic success line', async () => {
  const { fetchImpl } = createSuccessfulFetch()
  const lines = []

  const result = await runReleasePreflightCli({
    attempts: 1,
    fetchImpl,
    requestTimeoutMs: 100,
    write: (line) => lines.push(line),
  })

  assert.equal(result.attemptsUsed, 1)
  assert.deepEqual(lines, [
    'Release domain preflight passed: https://glucoseiq.health/ (4 endpoints, 1 attempt).',
  ])
})
