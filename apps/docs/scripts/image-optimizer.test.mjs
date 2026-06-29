import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { detectContentType, optimizeImage } = require(
  'next/dist/server/image-optimizer',
)

const PNG_FIXTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

test('Next image optimizer processes PNG input with the installed Sharp version', async () => {
  const output = await optimizeImage({
    buffer: PNG_FIXTURE,
    contentType: 'image/webp',
    quality: 80,
    width: 1,
    timeoutInSeconds: 7,
  })

  assert.equal(await detectContentType(output), 'image/webp')
  assert.ok(output.length > 0)
})
