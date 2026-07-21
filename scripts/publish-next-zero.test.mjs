import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import * as publisher from './publish-next-zero.mjs'

const releaseSha = '0123456789abcdef0123456789abcdef01234567'
const packageSpecs = [
  ['@glucoseiq/core', 'packages/core'],
  ['@glucoseiq/react', 'packages/react'],
  ['@glucoseiq/tokens', 'packages/tokens'],
  ['@glucoseiq/testing', 'packages/testing'],
  ['@glucoseiq/cli', 'packages/cli'],
].map(([name, directory]) => ({
  name,
  directory,
  version: '1.0.0-next.0',
  tag: `${name}@1.0.0-next.0`,
  ...(name === '@glucoseiq/react' || name === '@glucoseiq/testing' || name === '@glucoseiq/cli'
    ? { coreDependency: true, coreVersion: '1.0.0-next.0' }
    : {}),
}))

function packedManifests() {
  return new Map(packageSpecs.map((spec) => [spec.name, {
    name: spec.name,
    version: spec.version,
    ...(spec.coreDependency
      ? { dependencies: { '@glucoseiq/core': '^1.0.0-next.0' } }
      : {}),
  }]))
}

function manifests() {
  return new Map(packageSpecs.map((spec) => [spec.name, {
    name: spec.name,
    version: spec.version,
    ...(spec.coreDependency
      ? { dependencies: { '@glucoseiq/core': 'workspace:^' } }
      : {}),
  }]))
}

function response({ status = 404, json } = {}) {
  return { status, async json() { return structuredClone(json) } }
}

function publishedPackument(spec) {
  return {
    name: spec.name,
    'dist-tags': { next: spec.version, latest: '0.9.0' },
    versions: { [spec.version]: { name: spec.name, version: spec.version } },
  }
}

function harness({
  published = new Set(),
  tagCommit = releaseSha,
  missingTags = false,
  publishFailure,
  publishThrow,
  packumentFor,
  packedManifestFor,
  githubRelease,
  fetchedTagObject,
  remoteTagFetchFailure,
  remoteTagFailure,
  remoteTagOutput,
} = {}) {
  const commands = []
  const events = []
  const lines = []
  const publishedNames = []
  const packedArchives = new Map()
  const fetchedTagObjects = new Map()
  return {
    commands,
    events,
    lines,
    publishedNames,
    fetchImpl: async (url) => {
      const name = decodeURIComponent(new URL(url).pathname.slice(1))
      const spec = packageSpecs.find((entry) => entry.name === name)
      assert.ok(spec, `unexpected registry request: ${url}`)
      events.push(`registry:${spec.name}`)
      return published.has(name)
        ? response({ status: 200, json: packumentFor?.(spec) ?? publishedPackument(spec) })
        : response()
    },
    runCommand: async (command, args) => {
      commands.push({ command, args })
      events.push(`${command}:${args[0]}`)
      if (command === 'pnpm' && args[0] === '--dir' && args[2] === 'pack') {
        const spec = packageSpecs.find((entry) => args[1].endsWith(entry.directory))
        assert.ok(spec, `unexpected package directory: ${args[1]}`)
        const packRoot = args[4]
        const archiveName = `${spec.name.slice(1).replace('/', '-')}-${spec.version}.tgz`
        const archivePath = join(packRoot, archiveName)
        writeFileSync(archivePath, '')
        packedArchives.set(archivePath, spec)
        return { status: 0, stdout: `${archivePath}\n`, stderr: '' }
      }
      if (command === 'tar') {
        const spec = packedArchives.get(args[1])
        assert.ok(spec, `unexpected package archive: ${args[1]}`)
        return {
          status: 0,
          stdout: JSON.stringify(packedManifestFor?.(spec) ?? packedManifests().get(spec.name)),
          stderr: '',
        }
      }
      if (command === 'npm' && args[0] === '--version') return { status: 0, stdout: '11.17.0\n', stderr: '' }
      if (command === 'git' && args[0] === 'rev-parse' && args.at(-1) === 'HEAD^{commit}') {
        return { status: 0, stdout: `${releaseSha}\n`, stderr: '' }
      }
      if (command === 'git' && args[0] === 'rev-parse') {
        const ref = args.at(-1)
        const tag = ref
          .slice('refs/tags/'.length)
          .replace(/\^\{commit\}$/u, '')
        if (fetchedTagObjects.has(tag)) {
          return {
            status: 0,
            stdout: `${ref.endsWith('^{commit}') ? releaseSha : fetchedTagObjects.get(tag)}\n`,
            stderr: '',
          }
        }
        return missingTags
          ? { status: 1, stdout: '', stderr: '' }
          : { status: 0, stdout: `${tagCommit}\n`, stderr: '' }
      }
      if (command === 'git' && args[0] === 'ls-remote') {
        const tag = args[2].slice('refs/tags/'.length)
        if (remoteTagFailure?.(tag)) {
          return { status: 128, stdout: '', stderr: 'simulated remote transport failure' }
        }
        return { status: 0, stdout: remoteTagOutput?.(tag) ?? '', stderr: '' }
      }
      if (command === 'git' && args[0] === 'fetch') {
        const sourceRef = args.at(-1).split(':', 1)[0]
        const tag = sourceRef.slice('refs/tags/'.length)
        if (
          remoteTagFetchFailure === true ||
          (typeof remoteTagFetchFailure === 'function' && remoteTagFetchFailure(tag))
        ) {
          return { status: 1, stdout: '', stderr: 'simulated remote tag fetch failure' }
        }
        const directRef = `refs/tags/${tag}`
        const directRecord = (remoteTagOutput?.(tag) ?? '')
          .split('\n')
          .find((line) => line.endsWith(`\t${directRef}`))
        assert.ok(directRecord, `missing direct remote tag record for ${tag}`)
        const observedObject = directRecord.slice(0, directRecord.indexOf('\t'))
        fetchedTagObjects.set(
          tag,
          typeof fetchedTagObject === 'function'
            ? fetchedTagObject(tag, observedObject)
            : fetchedTagObject ?? observedObject,
        )
        return { status: 0, stdout: '', stderr: '' }
      }
      if (command === 'git' && args[0] === 'tag') return { status: 0, stdout: '', stderr: '' }
      if (command === 'gh') {
        return githubRelease
          ? { status: 0, stdout: JSON.stringify(githubRelease(args)), stderr: '' }
          : { status: 1, stdout: '', stderr: 'HTTP 404: Not Found' }
      }
      if (command === 'npm' && args[0] === 'publish') {
        const spec = packedArchives.get(args[1])
        assert.ok(spec, `publication must use a prepared package archive: ${args[1]}`)
        if (spec.name === publishThrow) throw new Error('simulated transport failure')
        if (spec.name === publishFailure) return { status: 1, stdout: '', stderr: 'simulated publish failure' }
        publishedNames.push(spec.name)
        return { status: 0, stdout: '', stderr: '' }
      }
      assert.fail(`unexpected command: ${command} ${args.join(' ')}`)
    },
    logger(line) { lines.push(line) },
    tagCommit,
  }
}

test('preflights every manifest before any package can be published', async () => {
  // Catches a malformed late manifest causing a partial external publication.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness()
  const invalid = manifests()
  invalid.get('@glucoseiq/cli').version = '1.0.0-next.1'
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: invalid, ...state }),
    /exact next\.0 version/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects an injected dependency-role removal before publication', async () => {
  // Catches a caller stripping React's immutable core-dependency role so a bad
  // packed core range bypasses the shared exact-next.0 contract.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness()
  const injectedSpecs = packageSpecs.map((spec) => (
    spec.name === '@glucoseiq/react'
      ? { ...spec, coreDependency: false, coreVersion: undefined }
      : spec
  ))
  const invalid = manifests()
  invalid.get('@glucoseiq/react').dependencies['@glucoseiq/core'] = '^1.0.0-next.1'
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs: injectedSpecs, manifests: invalid, ...state }),
    /must retain the immutable core dependency role/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('publishes missing packages sequentially with npm 11 next provenance arguments', async () => {
  // Catches a dependency-order regression or a publish that leaks into latest.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness()
  const result = await publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state })
  assert.deepEqual(result.published, packageSpecs.map(({ name }) => name))
  assert.deepEqual(state.publishedNames, packageSpecs.map(({ name }) => name))
  for (const { args } of state.commands.filter(
    ({ command, args }) => command === 'npm' && args[0] === 'publish',
  )) {
    assert.deepEqual(args.slice(2), ['--access', 'public', '--tag', 'next', '--provenance'])
  }
  assert.deepEqual(linesWithNewTags(state.lines), packageSpecs.map(({ tag }) => `New tag: ${tag}`))
})

test('publishes the exact pnpm-packed tarballs after inspecting their manifests', async () => {
  // Catches source workspace ranges being validated as packed metadata and
  // relative package directories being parsed by npm as GitHub shorthands.
  const state = harness()
  await publisher.runNextZeroPublisher({
    packageSpecs,
    manifests: manifests(),
    ...state,
  })
  const packs = state.commands.filter(({ command, args }) =>
    command === 'pnpm' && args.includes('pack'))
  const inspections = state.commands.filter(({ command }) => command === 'tar')
  const publications = state.commands.filter(({ command, args }) =>
    command === 'npm' && args[0] === 'publish')
  assert.equal(packs.length, packageSpecs.length)
  assert.equal(inspections.length, packageSpecs.length)
  assert.deepEqual(
    publications.map(({ args }) => args[1]),
    inspections.map(({ args }) => args[1]),
  )
  assert.equal(publications.every(({ args }) => args[1].startsWith('/')), true)
  assert.equal(publications.every(({ args }) => args[1].endsWith('.tgz')), true)
  assert.deepEqual(
    state.events.slice(0, packageSpecs.length * 2),
    packageSpecs.flatMap(() => ['pnpm:--dir', 'tar:-xOzf']),
  )
  assert.equal(state.events[packageSpecs.length * 2].startsWith('registry:'), true)
  for (const { args } of packs) {
    assert.equal(existsSync(dirname(args[4])), false)
  }
})

test('rejects invalid packed dependency metadata before external release state', async () => {
  const state = harness({
    packedManifestFor(spec) {
      const manifest = packedManifests().get(spec.name)
      if (spec.name === '@glucoseiq/react') {
        manifest.dependencies['@glucoseiq/core'] = 'workspace:^'
      }
      return manifest
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /packed manifest must not contain workspace dependencies/u,
  )
  assert.equal(state.events.some((event) => event.startsWith('registry:')), false)
  assert.equal(
    state.commands.some(({ command }) => ['git', 'gh', 'npm'].includes(command)),
    false,
  )
  const pack = state.commands.find(({ command }) => command === 'pnpm')
  assert.ok(pack)
  assert.equal(existsSync(dirname(pack.args[4])), false)
})

test('recovers already-published exact next packages without republishing them', async () => {
  // Catches recovery accidentally publishing an immutable package version twice.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({ published: new Set(['@glucoseiq/core']) })
  const result = await publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state })
  assert.deepEqual(result.alreadyPublished, ['@glucoseiq/core'])
  assert.deepEqual(state.publishedNames, packageSpecs.slice(1).map(({ name }) => name))
})

test('creates each missing local exact tag at the checked-out release commit', async () => {
  // Catches package tags being omitted or created at an implicit, moving ref.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({ missingTags: true })
  await publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state })
  assert.deepEqual(
    state.commands.filter(({ command, args }) => command === 'git' && args[0] === 'tag').map(({ args }) => args.slice(1, 4)),
    packageSpecs.map(({ tag }) => ['-a', tag, releaseSha]),
  )
})

test('preflights every absent remote exact tag before next.0 publication', async () => {
  // Catches publishing before a remote tag collision or recovery state has
  // been checked for every package identity.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness()
  await publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state })
  assert.deepEqual(
    state.commands
      .filter(({ command, args }) => command === 'git' && args[0] === 'ls-remote')
      .map(({ args }) => args),
    packageSpecs.map(({ tag }) => [
      'ls-remote',
      'origin',
      `refs/tags/${tag}`,
      `refs/tags/${tag}^{}`,
    ]),
  )
})

test('accepts existing correct lightweight remote tags before next.0 publication', async () => {
  // Catches rejecting a safe recovery where an exact lightweight tag already
  // points at the checked-out release commit.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    remoteTagOutput(tag) {
      return `${releaseSha}\trefs/tags/${tag}\n`
    },
  })
  await assert.doesNotReject(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
  )
  assert.equal(
    state.commands.filter(({ command, args }) => command === 'git' && args[0] === 'ls-remote').length,
    packageSpecs.length,
  )
})

test('synchronizes each existing exact remote tag into its local ref before publication', async () => {
  // Catches the fail-closed git-cli release path pushing a stale or separately
  // created local tag object when the remote tag already exists.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    remoteTagOutput(tag) {
      return `${releaseSha}\trefs/tags/${tag}\n`
    },
  })
  await publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state })
  assert.deepEqual(
    state.commands
      .filter(({ command, args }) => command === 'git' && args[0] === 'fetch')
      .map(({ args }) => args),
    packageSpecs.map(({ tag }) => [
      'fetch',
      '--force',
      '--no-tags',
      'origin',
      `refs/tags/${tag}:refs/tags/${tag}`,
    ]),
  )
  const lastFetch = state.commands.findLastIndex(
    ({ command, args }) => command === 'git' && args[0] === 'fetch',
  )
  const firstPublish = state.commands.findIndex(
    ({ command, args }) => command === 'npm' && args[0] === 'publish',
  )
  assert.ok(lastFetch >= 0 && lastFetch < firstPublish)
})

test('rejects a remote tag synchronization failure before publication', async () => {
  // Catches a remote tag changing or becoming unreadable after preflight while
  // the publisher prepares the exact local ref used by Changesets Action.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    remoteTagFetchFailure: true,
    remoteTagOutput(tag) {
      return `${releaseSha}\trefs/tags/${tag}\n`
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /Synchronize local tag.*failed/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects a remote tag that changes while its exact local ref is synchronized', async () => {
  // Catches a tag race between ls-remote preflight and the authenticated fetch
  // used to prepare the action's fail-closed git push.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    fetchedTagObject: '89abcdef0123456789abcdef0123456789abcdef',
    remoteTagOutput(tag) {
      return `${releaseSha}\trefs/tags/${tag}\n`
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /changed during local synchronization/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('accepts existing correct annotated remote tags through their peeled refs', async () => {
  // Catches treating the annotated tag object SHA as the release commit rather
  // than validating the peeled commit that GitHub will release.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    remoteTagOutput(tag) {
      return `89abcdef0123456789abcdef0123456789abcdef\trefs/tags/${tag}\n${releaseSha}\trefs/tags/${tag}^{}\n`
    },
  })
  await assert.doesNotReject(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
  )
  assert.equal(
    state.commands.filter(({ command, args }) => command === 'git' && args[0] === 'ls-remote').length,
    packageSpecs.length,
  )
})

test('rejects an existing GitHub prerelease whose exact remote tag is absent', async () => {
  // Catches a deleted remote tag being hidden by a surviving GitHub release,
  // which would suppress the action output needed to restore the tag.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    githubRelease(args) {
      const endpoint = args.at(-1)
      const tag = decodeURIComponent(endpoint.slice(endpoint.lastIndexOf('/') + 1))
      return { tag_name: tag, draft: false, prerelease: true }
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /GitHub release.*remote tag.*absent/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
  assert.equal(state.commands.some(({ command, args }) => command === 'git' && args[0] === 'tag'), false)
})

test('rejects a remote exact tag that points at a different commit before publication', async () => {
  // Catches recovery publishing packages while a GitHub tag would release a
  // different commit than the checked-out candidate.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    remoteTagOutput(tag) {
      return `89abcdef0123456789abcdef0123456789abcdef\trefs/tags/${tag}\n`
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /Remote tag.*release commit/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects malformed remote tag output before publication', async () => {
  // Catches a malformed remote ref response being interpreted as an absent tag
  // and allowing immutable npm publication to proceed.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    remoteTagOutput() {
      return 'not a git ref\n'
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /Remote tag.*malformed/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects malformed remote tag records with extra or duplicate refs before publication', async () => {
  // Catches an unbounded or ambiguous remote ref response being treated as a
  // safe tag record before immutable npm publication begins.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const invalidOutputs = [
    (tag) => `${releaseSha}\trefs/tags/${tag}\n${releaseSha}\trefs/tags/unexpected\n`,
    (tag) => `${releaseSha}\trefs/tags/${tag}\n${releaseSha}\trefs/tags/${tag}\n`,
  ]
  for (const remoteTagOutput of invalidOutputs) {
    const state = harness({ remoteTagOutput })
    await assert.rejects(
      publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
      /Remote tag.*malformed/u,
    )
    assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
  }
})

test('rejects an annotated remote tag with a malformed direct object SHA before publication', async () => {
  // Catches accepting a peeled commit while the direct annotated ref is
  // malformed, which hides remote corruption from release recovery.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    remoteTagOutput(tag) {
      return `not-a-git-object\trefs/tags/${tag}\n${releaseSha}\trefs/tags/${tag}^{}\n`
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /Remote tag.*malformed/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects a remote tag command failure before publication', async () => {
  // Catches a transport failure being downgraded to an absent tag during
  // recovery, which would permit publication without a complete preflight.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    remoteTagFailure(tag) {
      return tag === packageSpecs[0].tag
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /Check remote tag.*failed/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('reports the published and remaining package inventories after a publish failure', async () => {
  // Catches a partial failure that leaves operators without a safe recovery inventory.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({ publishFailure: '@glucoseiq/tokens' })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /Partial next\.0 publication failed\. Published: @glucoseiq\/core, @glucoseiq\/react\. Remaining: @glucoseiq\/tokens, @glucoseiq\/testing, @glucoseiq\/cli/u,
  )
})

test('preserves the partial-publication inventory when the publish command throws', async () => {
  // Catches a timeout or process error replacing the operator recovery inventory.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({ publishThrow: '@glucoseiq/tokens' })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /Partial next\.0 publication failed\. Published: @glucoseiq\/core, @glucoseiq\/react\. Remaining: @glucoseiq\/tokens, @glucoseiq\/testing, @glucoseiq\/cli/u,
  )
})

test('fails closed on malformed next registry metadata before publication', async () => {
  // Catches a malformed registry response being interpreted as an unpublished package.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    published: new Set(['@glucoseiq/core']),
    packumentFor(spec) {
      const value = publishedPackument(spec)
      value['dist-tags'].next = '1.0.0-next.1'
      return value
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /npm next tag must be 1\.0\.0-next\.0/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects a wrong next tag even when the exact target version is absent', async () => {
  // Catches an already-published next.1 tag being treated as permission to
  // publish next.0 because the target version record has not propagated.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    published: new Set(['@glucoseiq/core']),
    packumentFor(spec) {
      const value = publishedPackument(spec)
      delete value.versions[spec.version]
      value['dist-tags'].next = '1.0.0-next.1'
      return value
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /npm next tag must be 1\.0\.0-next\.0/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects a malformed exact registry version record before publication', async () => {
  // Catches an identity-mismatched target record being recovered as a valid
  // immutable next.0 package.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    published: new Set(['@glucoseiq/core']),
    packumentFor(spec) {
      const value = publishedPackument(spec)
      value.versions[spec.version] = { name: spec.name, version: '1.0.0-next.1' }
      return value
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /npm registry returned malformed exact version metadata for @glucoseiq\/core/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects an exact next tag without its exact version record before publication', async () => {
  // Catches a registry race or malformed packument turning an owned next tag
  // into permission to overwrite an immutable version.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    published: new Set(['@glucoseiq/core']),
    packumentFor(spec) {
      const value = publishedPackument(spec)
      delete value.versions[spec.version]
      return value
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /npm registry returned malformed exact version metadata for @glucoseiq\/core/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects an exact version record whose next tag is missing', async () => {
  // npm publishes a version record and its requested dist-tag in one registry
  // update. Their disagreement is inconsistent state, not a retry signal.
  const state = harness({
    published: new Set(['@glucoseiq/core']),
    packumentFor(spec) {
      const value = publishedPackument(spec)
      delete value['dist-tags'].next
      return value
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /@glucoseiq\/core npm next tag must be 1\.0\.0-next\.0; received missing/u,
  )
  assert.equal(
    state.commands.some(({ command }) => ['git', 'gh', 'npm'].includes(command)),
    false,
  )
})

test('rejects falsey exact version records before publication', async () => {
  // Catches falsey own properties bypassing the exact-record identity check.
  for (const malformed of [null, false, 0, '']) {
    const state = harness({
      published: new Set(['@glucoseiq/core']),
      packumentFor(spec) {
        const value = publishedPackument(spec)
        value.versions[spec.version] = malformed
        return value
      },
    })
    await assert.rejects(
      publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
      /npm registry returned malformed exact version metadata for @glucoseiq\/core/u,
    )
    assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
  }
})

test('publishes when a stable-only package has neither next tag nor next.0 record', async () => {
  // Catches the fail-closed exact-tag rule incorrectly blocking a legitimate
  // unpublished package that only has stable registry history.
  const state = harness({
    published: new Set(['@glucoseiq/core']),
    packumentFor(spec) {
      const value = publishedPackument(spec)
      delete value.versions[spec.version]
      delete value['dist-tags'].next
      return value
    },
  })
  const result = await publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state })
  assert.equal(result.alreadyPublished.includes('@glucoseiq/core'), false)
  assert.equal(state.publishedNames.includes('@glucoseiq/core'), true)
})

test('rejects a local prerelease tag that points away from the release commit', async () => {
  // Catches a release artifact being attached to a different commit than provenance.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({ tagCommit: '89abcdef0123456789abcdef0123456789abcdef' })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /@glucoseiq\/core@1\.0\.0-next\.0 must resolve to release commit/u,
  )
  assert.equal(state.commands.some(({ command, args }) => command === 'npm' && args[0] === 'publish'), false)
})

test('rejects malformed GitHub prerelease state without emitting a release artifact', async () => {
  // Catches a draft or stable GitHub release satisfying the next.0 artifact check.
  assert.equal(typeof publisher.runNextZeroPublisher, 'function')
  const state = harness({
    githubRelease() {
      return { tag_name: '@glucoseiq/core@1.0.0-next.0', draft: false, prerelease: false }
    },
  })
  await assert.rejects(
    publisher.runNextZeroPublisher({ packageSpecs, manifests: manifests(), ...state }),
    /must have a published, non-draft prerelease/u,
  )
  assert.deepEqual(linesWithNewTags(state.lines), [])
})

function linesWithNewTags(lines) {
  return lines.filter((line) => line.startsWith('New tag: '))
}
