import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as publishedVerifier from './verify-published-packages.mjs'
import {
  LAUNCH_PACKAGES,
  createExpectedPublicationPlan,
  createPublishedPackageSpecs,
  deriveCheckedOutReleasePlan,
  parsePublishedPackages,
  pollForPublishedMetadata,
  resolveDirectVerificationPlan,
  resolvePublicationInventory,
  runExternalCommand,
  scrubNpmAuthConfiguration,
  scrubUserNpmAuth,
  validateRegistrySnapshot,
  validateTarballEvidence,
  verifyPublishedPackages,
  verifyRepositoryArtifacts,
  verifySignatureAudit,
} from './verify-published-packages.mjs'

const registry = 'https://registry.npmjs.org'
const releaseSha = '0123456789abcdef0123456789abcdef01234567'
const tagObjectSha = '89abcdef0123456789abcdef0123456789abcdef'
const slsaPredicate = 'https://slsa.dev/provenance/v1'

function packagePurl(spec) {
  return `pkg:npm/${spec.name.replace(/^@/u, '%40')}@${spec.version}`
}

function packageSha512(spec) {
  const { integrity } = createVersionMetadata(spec).metadata.dist
  return Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex')
}

function provenanceStatement(spec, {
  repository = 'https://github.com/marklearst/glucoseiq',
  path = '.github/workflows/release.yml',
  ref = 'refs/heads/main',
  builder = 'https://github.com/actions/runner/github-hosted',
  gitCommit = releaseSha,
  uri = 'git+https://github.com/marklearst/glucoseiq@refs/heads/main',
  subjectName = packagePurl(spec),
  subjectDigest = packageSha512(spec),
} = {}) {
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: subjectName, digest: { sha512: subjectDigest } }],
    predicateType: slsaPredicate,
    predicate: {
      buildDefinition: {
        buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        externalParameters: { workflow: { ref, repository, path } },
        internalParameters: { github: { event_name: 'push' } },
        resolvedDependencies: [{ uri, digest: { gitCommit } }],
      },
      runDetails: {
        builder: { id: builder },
        metadata: {
          invocationId: 'https://github.com/marklearst/glucoseiq/actions/runs/123/attempts/1',
        },
      },
    },
  }
}

function attestationBundles(spec, statement = provenanceStatement(spec)) {
  const publishStatement = {
    _type: 'https://in-toto.io/Statement/v0.1',
    predicateType: 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1',
    predicate: { name: 'example', version: '1.0.0', registry },
  }
  return [
    {
      predicateType: publishStatement.predicateType,
      bundle: {
        mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.2',
        verificationMaterial: { tlogEntries: [{}] },
        dsseEnvelope: {
          payload: Buffer.from(JSON.stringify(publishStatement)).toString('base64'),
          payloadType: 'application/vnd.in-toto+json',
          signatures: [{ sig: 'publish-signature' }],
        },
      },
    },
    {
      predicateType: slsaPredicate,
      bundle: {
        mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.2',
        verificationMaterial: { tlogEntries: [{}] },
        dsseEnvelope: {
          payload: Buffer.from(JSON.stringify(statement)).toString('base64'),
          payloadType: 'application/vnd.in-toto+json',
          signatures: [{ sig: 'provenance-signature' }],
        },
      },
    },
  ]
}

function signatureAuditResult(overrides = {}, packageSpecs = LAUNCH_PACKAGES) {
  return {
    invalid: [],
    missing: [],
    verified: packageSpecs.map((spec) => {
      const selectedOverrides = typeof overrides === 'function' ? overrides(spec) : overrides
      return {
        name: spec.name,
        version: spec.version,
        attestations: { provenance: { predicateType: slsaPredicate } },
        attestationBundles: attestationBundles(
          spec,
          provenanceStatement(spec, selectedOverrides),
        ),
      }
    }),
  }
}

function expectedDigests(packageSpecs = LAUNCH_PACKAGES) {
  return new Map(packageSpecs.map((spec) => [spec.name, packageSha512(spec)]))
}

function auditOptions({
  packageSpecs = LAUNCH_PACKAGES,
  publishedPackages = packageSpecs,
} = {}) {
  return {
    releaseSha,
    expectedDigests: expectedDigests(packageSpecs),
    publishedPackages,
  }
}

function response({ status = 200, json, bytes, statusText = '' }) {
  return {
    status,
    statusText,
    async json() {
      if (json instanceof Error) throw json
      return structuredClone(json)
    },
    async arrayBuffer() {
      if (bytes instanceof Error) throw bytes
      const value = Buffer.from(bytes ?? '')
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    },
  }
}

function createVersionMetadata(spec) {
  const archive = Buffer.from(`archive:${spec.name}@${spec.version}`)
  const tarball = `${registry}/${encodeURIComponent(spec.name)}/-/${encodeURIComponent(spec.name)}-${spec.version}.tgz`
  const metadata = {
    name: spec.name,
    version: spec.version,
    license: 'MIT',
    engines: { node: '>=24' },
    publishConfig: { access: 'public' },
    repository: {
      type: 'git',
      url: 'https://github.com/marklearst/glucoseiq.git',
      directory: spec.directory,
    },
    files: ['dist/', 'package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'],
    dist: {
      integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}`,
      shasum: createHash('sha1').update(archive).digest('hex'),
      tarball,
      signatures: [{ keyid: 'SHA256:registry-key', sig: 'registry-signature' }],
      attestations: {
        url: `${registry}/-/npm/v1/attestations/${spec.name}@${spec.version}`,
        provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
      },
    },
  }

  if (spec.coreDependency) {
    const coreMajor = spec.coreVersion?.split('.')[0] ?? '1'
    metadata.dependencies = {
      '@glucoseiq/core': spec.coreDependencyRange ?? `^${coreMajor}.0.0`,
    }
  }
  if (spec.name === '@glucoseiq/react') metadata.peerDependencies = { react: '>=18' }

  return { archive, metadata }
}

function createPackument(spec) {
  const { metadata } = createVersionMetadata(spec)
  return {
    name: spec.name,
    'dist-tags': {
      latest: spec.version,
    },
    versions: {
      [spec.version]: metadata,
    },
  }
}

function createSnapshot() {
  return new Map(LAUNCH_PACKAGES.map((spec) => [spec.name, createPackument(spec)]))
}

function expectedPackedManifest(spec) {
  const manifest = structuredClone(createVersionMetadata(spec).metadata)
  delete manifest.dist
  return manifest
}

function createHappyHarness({
  missingAttempts = new Map(),
  packageShas = new Map(),
  packageSpecs = LAUNCH_PACKAGES,
} = {}) {
  const fetchCalls = []
  const commands = []
  const events = []
  const requestCounts = new Map()
  const archives = new Map(
    packageSpecs.map((spec) => [spec.name, createVersionMetadata(spec).archive]),
  )

  const fetchImpl = async (url) => {
    fetchCalls.push(url)
    events.push(`fetch:${url}`)

    const tarballSpec = packageSpecs.find(
      (spec) => url === createVersionMetadata(spec).metadata.dist.tarball,
    )
    if (tarballSpec) return response({ bytes: archives.get(tarballSpec.name) })

    const encodedName = new URL(url).pathname.slice(1)
    const name = decodeURIComponent(encodedName)
    const count = (requestCounts.get(name) ?? 0) + 1
    requestCounts.set(name, count)
    if (count <= (missingAttempts.get(name) ?? 0)) return response({ status: 404 })

    const spec = packageSpecs.find((entry) => entry.name === name)
    assert.ok(spec, `unexpected registry request for ${name}`)
    return response({ json: createPackument(spec) })
  }

  const runCommand = async (command, args, options = {}) => {
    commands.push({
      command,
      args: [...args],
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
    })
    events.push(`command:${command}:${args.join(' ')}`)

    if (command === 'tar') {
      const archive = readFileSync(args[1])
      const identity = archive.toString().replace(/^archive:/u, '')
      const separator = identity.lastIndexOf('@')
      const name = identity.slice(0, separator)
      const spec = packageSpecs.find((entry) => entry.name === name)
      assert.ok(spec, `unexpected tarball identity ${identity}`)

      if (args[0] === '-tzf') {
        return {
          status: 0,
          stdout: [
            'package/package.json',
            'package/README.md',
            'package/LICENSE',
            'package/CHANGELOG.md',
            'package/dist/index.mjs',
          ].join('\n'),
          stderr: '',
        }
      }
      if (args[0] === '-xOzf' && args[2] === 'package/package.json') {
        return { status: 0, stdout: JSON.stringify(expectedPackedManifest(spec)), stderr: '' }
      }
      if (args[0] === '-xOzf' && args[2] === 'package/CHANGELOG.md') {
        return { status: 0, stdout: `# ${spec.name} ${spec.version}\n`, stderr: '' }
      }
    }

    if (command === 'git') {
      if (args[0] === 'rev-parse') {
        return { status: 0, stdout: `${releaseSha}\n`, stderr: '' }
      }
      const tagRef = args.at(-2)
      const tag = tagRef.slice('refs/tags/'.length)
      const spec = packageSpecs.find((entry) => entry.tag === tag)
      assert.ok(spec, `unexpected tag ${tag}`)
      const packageSha = packageShas.get(spec.name) ?? releaseSha
      return { status: 0, stdout: `${packageSha}\t${tagRef}\n`, stderr: '' }
    }

    if (command === 'gh') {
      const encodedTag = args.at(-1).split('/').at(-1)
      const tag = decodeURIComponent(encodedTag)
      return {
        status: 0,
        stdout: JSON.stringify({ tag_name: tag, draft: false, prerelease: false }),
        stderr: '',
      }
    }

    if (command === 'npm' && args[0] === 'install') {
      return { status: 0, stdout: '', stderr: '' }
    }

    if (command === 'npm' && args[0] === 'audit') {
      return {
        status: 0,
        stdout: JSON.stringify(signatureAuditResult(
          (spec) => ({ gitCommit: packageShas.get(spec.name) ?? releaseSha }),
          packageSpecs,
        )),
        stderr: '',
      }
    }

    if (
      command === process.execPath &&
      args.join(' ') === 'scripts/test-package-contracts.mjs --source registry'
    ) {
      return { status: 0, stdout: 'registry matrix passed', stderr: '' }
    }

    assert.fail(`unexpected command: ${command} ${args.join(' ')}`)
  }

  return { commands, events, fetchCalls, fetchImpl, releaseSha, runCommand }
}

test('locks the five coordinated launch package versions and tags', () => {
  assert.deepEqual(
    LAUNCH_PACKAGES.map(({ name, version, tag }) => ({ name, version, tag })),
    [
      { name: '@glucoseiq/core', version: '1.0.0', tag: '@glucoseiq/core@1.0.0' },
      { name: '@glucoseiq/react', version: '1.0.0', tag: '@glucoseiq/react@1.0.0' },
      { name: '@glucoseiq/tokens', version: '1.0.0', tag: '@glucoseiq/tokens@1.0.0' },
      { name: '@glucoseiq/testing', version: '1.0.0', tag: '@glucoseiq/testing@1.0.0' },
      { name: '@glucoseiq/cli', version: '1.0.0', tag: '@glucoseiq/cli@1.0.0' },
    ],
  )
})

test('parses the Changesets published-package subset and fails closed on invalid output', () => {
  const selected = parsePublishedPackages(JSON.stringify([
    { name: '@glucoseiq/core', version: '1.0.0' },
  ]))
  assert.deepEqual(
    selected.map(({ name, version }) => ({ name, version })),
    [
      { name: '@glucoseiq/core', version: '1.0.0' },
      ],
  )

  for (const fixture of [
    { source: undefined, expected: /publishedPackages output must be provided/u },
    { source: '', expected: /publishedPackages output must be provided/u },
    { source: '{', expected: /publishedPackages output is invalid JSON/u },
    { source: '[]', expected: /must contain at least one package/u },
    {
      source: JSON.stringify([
        { name: '@glucoseiq/core', version: '1.0.0' },
        { name: '@glucoseiq/core', version: '1.0.0' },
      ]),
      expected: /contains duplicate @glucoseiq\/core@1\.0\.0/u,
    },
    {
      source: JSON.stringify([{ name: '@glucoseiq/unknown', version: '1.0.0' }]),
      expected: /contains unknown package @glucoseiq\/unknown/u,
    },
    {
      source: JSON.stringify([{ name: '@glucoseiq/core', version: '9.0.0' }]),
      expected: /@glucoseiq\/core version must be 1\.0\.0/u,
    },
    {
      source: JSON.stringify(['@glucoseiq/core@1.0.0']),
      expected: /entries must contain name and version/u,
    },
  ]) {
    assert.throws(() => parsePublishedPackages(fixture.source), fixture.expected)
  }
})

test('maps exact generated-version package directories to a deterministic plan', () => {
  assert.deepEqual(
    createExpectedPublicationPlan([
      'packages/core',
    ]),
    [
      { name: '@glucoseiq/core', version: '1.0.0' },
      ],
  )
  assert.throws(
    () => createExpectedPublicationPlan([]),
    /must contain at least one package directory/u,
  )
  assert.throws(
    () => createExpectedPublicationPlan(['packages/unknown']),
    /unknown package directory: packages\/unknown/u,
  )
  assert.throws(
    () => createExpectedPublicationPlan(['packages/core', 'packages/core']),
    /duplicate package directory: packages\/core/u,
  )
})

test('derives the manual verification plan from an exact replay-validated HEAD parent', () => {
  const calls = []
  const execFile = (command, args, options) => {
    calls.push({ command, args, options })
    return Buffer.from(`${tagObjectSha}\n`)
  }
  const runPolicy = (options) => {
    assert.equal(options.execFile, execFile)
    assert.equal(options.cwd, '/release')
    assert.deepEqual(options.env, {
      GITHUB_ACTIONS: 'false',
      CHANGESET_POLICY_BRANCH: 'main',
      CHANGESET_POLICY_BASE_SHA: tagObjectSha,
    })
    assert.equal(options.generatedVersionOptions.commandTimeoutMs, 4321)
    return {
      reason: 'generated-version-commit',
      versionedPackages: ['packages/react', 'packages/core'],
    }
  }

  const plan = deriveCheckedOutReleasePlan({
    cwd: '/release',
    execFile,
    runPolicy,
    commandTimeoutMs: 4321,
  })

  assert.deepEqual(plan, [
    { name: '@glucoseiq/core', version: '1.0.0' },
    { name: '@glucoseiq/react', version: '1.0.0' },
  ])
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    'HEAD^1^{commit}',
  ])
  assert.equal(calls[0].options.timeout, 4321)
  assert.equal(calls[0].options.killSignal, 'SIGKILL')
  assert.equal(calls[0].options.shell, false)
})

test('manual verification fails closed when HEAD is not an exact generated-version commit', () => {
  const execFile = () => Buffer.from(`${tagObjectSha}\n`)
  assert.throws(
    () => deriveCheckedOutReleasePlan({
      execFile,
      runPolicy: () => ({ reason: 'changeset-present' }),
    }),
    /checked-out commit must be an exact replay-validated generated-version commit/u,
  )
  assert.throws(
    () => deriveCheckedOutReleasePlan({
      execFile: () => Buffer.from('not-a-commit\n'),
      runPolicy: () => assert.fail('policy must not run for an invalid parent'),
    }),
    /HEAD first parent did not resolve to a commit ID/u,
  )
})

test('direct verification derives a plan only when the workflow does not provide one', () => {
  let derivations = 0
  const derivePlan = () => {
    derivations += 1
    return [{ name: '@glucoseiq/core', version: '1.0.0' }]
  }

  const manual = resolveDirectVerificationPlan({
    env: {},
    derivePlan,
  })
  assert.equal(derivations, 1)
  assert.deepEqual(
    manual.map(({ name, version }) => ({ name, version })),
    [{ name: '@glucoseiq/core', version: '1.0.0' }],
  )

  const hosted = resolveDirectVerificationPlan({
    env: {
      CHANGESETS_VERIFICATION_PACKAGES: JSON.stringify([
        { name: '@glucoseiq/react', version: '1.0.0' },
      ]),
    },
    derivePlan: () => assert.fail('hosted verification must use its validated plan'),
  })
  assert.deepEqual(
    hosted.map(({ name, version }) => ({ name, version })),
    [{ name: '@glucoseiq/react', version: '1.0.0' }],
  )
  assert.throws(
    () => resolveDirectVerificationPlan({
      env: { CHANGESETS_VERIFICATION_PACKAGES: '' },
      derivePlan,
    }),
    /publishedPackages output must be provided/u,
  )
})

test('strict registry recovery refuses a workflow-supplied verification subset', () => {
  assert.throws(
    () => resolveDirectVerificationPlan({
      env: {
        CHANGESETS_VERIFICATION_PACKAGES: JSON.stringify([
          { name: '@glucoseiq/core', version: '1.0.0' },
        ]),
      },
      allowEnvironmentPlan: false,
      derivePlan: () => assert.fail('an injected workflow plan must fail closed'),
    }),
    /Registry-evidence recovery must derive its package plan from the checked-out release commit/u,
  )

  let derivations = 0
  const plan = resolveDirectVerificationPlan({
    env: {},
    allowEnvironmentPlan: false,
    derivePlan: () => {
      derivations += 1
      return [{ name: '@glucoseiq/core', version: '1.0.0' }]
    },
  })
  assert.equal(derivations, 1)
  assert.deepEqual(
    plan.map(({ name, version }) => ({ name, version })),
    [{ name: '@glucoseiq/core', version: '1.0.0' }],
  )
})

test('prefers a non-empty Changesets inventory after a partial publish failure', () => {
  const inventory = resolvePublicationInventory({
    actionOutcome: 'failure',
    published: 'false',
    publishedPackages: JSON.stringify([
      { name: '@glucoseiq/core', version: '1.0.0' },
    ]),
    expectedPackages: JSON.stringify([
      { name: '@glucoseiq/core', version: '1.0.0' },
      ]),
  })

  assert.equal(inventory.source, 'changesets')
  assert.deepEqual(
    inventory.reportedPackages.map(({ name, version }) => ({ name, version })),
    [{ name: '@glucoseiq/core', version: '1.0.0' }],
  )
  assert.deepEqual(
    inventory.verificationPackages.map(({ name, version }) => ({ name, version })),
    [
      { name: '@glucoseiq/core', version: '1.0.0' },
      ],
  )
})

test('falls back to the validated version-commit plan when action inventory is unset', () => {
  const expectedPackages = JSON.stringify([
    { name: '@glucoseiq/core', version: '1.0.0' },
  ])

  for (const fixture of [
    { actionOutcome: 'failure', published: 'false', publishedPackages: '[]' },
    { actionOutcome: 'success', published: 'false', publishedPackages: '' },
  ]) {
    const inventory = resolvePublicationInventory({
      ...fixture,
      expectedPackages,
    })
    assert.equal(inventory.source, 'expected-plan')
    assert.deepEqual(
      inventory.reportedPackages.map(({ name, version }) => ({ name, version })),
      [
        { name: '@glucoseiq/core', version: '1.0.0' },
          ],
    )
    assert.deepEqual(inventory.verificationPackages, inventory.reportedPackages)
  }
})

test('fails closed on inconsistent or unvalidated publication inventories', () => {
  const core = JSON.stringify([
    { name: '@glucoseiq/core', version: '1.0.0' },
  ])
  const react = JSON.stringify([
    { name: '@glucoseiq/react', version: '1.0.0' },
  ])

  for (const fixture of [
    {
      options: {
        actionOutcome: 'success',
        published: 'true',
        publishedPackages: '[]',
        expectedPackages: core,
      },
      expected: /reported published=true but did not provide a package inventory/u,
    },
    {
      options: {
        actionOutcome: 'failure',
        published: 'false',
        publishedPackages: '[]',
        expectedPackages: '[]',
      },
      expected: /expected publication plan must contain at least one package/u,
    },
    {
      options: {
        actionOutcome: 'failure',
        published: 'false',
        publishedPackages: react,
        expectedPackages: core,
      },
      expected: /publishedPackages contains package outside the validated plan/u,
    },
    {
      options: {
        actionOutcome: 'failure',
        published: 'sometimes',
        publishedPackages: '[]',
        expectedPackages: core,
      },
      expected: /published output must be "true", "false", or unset/u,
    },
    {
      options: {
        actionOutcome: 'cancelled',
        published: 'false',
        publishedPackages: '[]',
        expectedPackages: core,
      },
      expected: /action outcome must be success or failure/u,
    },
  ]) {
    assert.throws(
      () => resolvePublicationInventory(fixture.options),
      fixture.expected,
    )
  }
})

test('scrubs npm authentication entries without changing unrelated user configuration', () => {
  const source = [
    'registry=https://registry.npmjs.org/',
    '//registry.npmjs.org/:_authToken=bootstrap-secret',
    '//registry.example.test/team/:_AUTH=legacy-secret',
    '//registry.example.test/:certfile=/tmp/client.pem',
    '//registry.example.test/:keyfile=/tmp/client-key.pem',
    '_password=encoded-secret',
    'username=publisher',
    'always-auth=true',
    '# keep this comment',
    '',
  ].join('\r\n')

  const result = scrubNpmAuthConfiguration(source)

  assert.equal(result.removed, 6)
  assert.equal(
    result.configuration,
    [
      'registry=https://registry.npmjs.org/',
      'always-auth=true',
      '# keep this comment',
      '',
    ].join('\r\n'),
  )
  assert.doesNotMatch(result.configuration, /secret|username/iu)
})

test('rewrites the runner user npm configuration and confirms credentials are absent', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'glucoseiq-npm-auth-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const userConfig = join(directory, '.npmrc')
  writeFileSync(
    userConfig,
    'registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=secret\n',
  )

  const result = scrubUserNpmAuth({ userConfig })

  assert.equal(result.removed, 1)
  assert.equal(
    readFileSync(userConfig, 'utf8'),
    'registry=https://registry.npmjs.org/\n',
  )
})

test('derives independently versioned expectations from source manifests above launch floors', () => {
  const manifests = new Map(
    LAUNCH_PACKAGES.map((spec, index) => [
      spec.name,
      {
        name: spec.name,
        version: `1.${index + 1}.0`,
        ...(spec.coreDependency
          ? { dependencies: { '@glucoseiq/core': 'workspace:^' } }
          : {}),
      },
    ]),
  )
  const specs = createPublishedPackageSpecs(manifests)
  assert.deepEqual(
    specs
      .filter(({ coreDependency }) => coreDependency)
      .map(({ coreVersion }) => coreVersion),
    Array.from({ length: 3 }, () => '1.1.0'),
  )
  assert.deepEqual(
    specs.map(({ name, version, tag }) => ({ name, version, tag })),
    LAUNCH_PACKAGES.map((spec, index) => {
      const version = `1.${index + 1}.0`
      return { name: spec.name, version, tag: `${spec.name}@${version}` }
    }),
  )

  manifests.get('@glucoseiq/core').version = '0.9.9'
  assert.throws(
    () => createPublishedPackageSpecs(manifests),
    /@glucoseiq\/core version must be at least 1\.0\.0/u,
  )
})

test('accepts only launch-floor caret ranges that include the checked-out core', () => {
  const manifests = new Map(LAUNCH_PACKAGES.map((spec) => [
    spec.name,
    {
      name: spec.name,
      version: '2.0.0',
      ...(spec.coreDependency
        ? { dependencies: { '@glucoseiq/core': 'workspace:^' } }
        : {}),
    },
  ]))
  const specs = createPublishedPackageSpecs(manifests)
  const snapshot = new Map(specs.map((spec) => [spec.name, createPackument(spec)]))

  assert.doesNotThrow(() => validateRegistrySnapshot(snapshot, { packageSpecs: specs }))
  snapshot.get('@glucoseiq/react').versions['2.0.0'].dependencies['@glucoseiq/core'] = '^1.0.0'
  assert.throws(
    () => validateRegistrySnapshot(snapshot, { packageSpecs: specs }),
    /@glucoseiq\/react registry core dependency \^1\.0\.0 does not include 2\.0\.0/u,
  )

  snapshot.get('@glucoseiq/react').versions['2.0.0'].dependencies['@glucoseiq/core'] = '^2.0.0'
  assert.doesNotThrow(() => validateRegistrySnapshot(snapshot, { packageSpecs: specs }))
  snapshot.get('@glucoseiq/react').versions['2.0.0'].dependencies['@glucoseiq/core'] = '^0.9.0'
  assert.throws(
    () => validateRegistrySnapshot(snapshot, { packageSpecs: specs }),
    /registry core dependency must start at 1\.0\.0 or newer/u,
  )
  snapshot.get('@glucoseiq/react').versions['2.0.0'].dependencies['@glucoseiq/core'] = '>=1'
  assert.throws(
    () => validateRegistrySnapshot(snapshot, { packageSpecs: specs }),
    /must be a stable caret range/u,
  )
})

test('uses the shared semantic registry policy for an explicit checked-out range', () => {
  const manifests = new Map(LAUNCH_PACKAGES.map((spec) => [
    spec.name,
    {
      name: spec.name,
      version: '1.1.0',
      ...(spec.coreDependency
        ? {
            dependencies: {
              '@glucoseiq/core': spec.name === '@glucoseiq/testing' ? '^1.0.0' : 'workspace:^',
            },
          }
        : {}),
    },
  ]))
  const specs = createPublishedPackageSpecs(manifests)
  const snapshot = new Map(specs.map((spec) => [spec.name, createPackument(spec)]))
  assert.doesNotThrow(() => validateRegistrySnapshot(snapshot, { packageSpecs: specs }))
  snapshot.get('@glucoseiq/testing').versions['1.1.0'].dependencies['@glucoseiq/core'] = '^1.1.0'
  assert.doesNotThrow(() => validateRegistrySnapshot(snapshot, { packageSpecs: specs }))
  snapshot.get('@glucoseiq/testing').versions['1.1.0'].dependencies['@glucoseiq/core'] = '^1.2.0'
  assert.throws(
    () => validateRegistrySnapshot(snapshot, { packageSpecs: specs }),
    /@glucoseiq\/testing registry core dependency \^1\.2\.0 does not include 1\.1\.0/u,
  )
})

test('polls only 404 records until all five exact versions are visible', async () => {
  const sleeps = []
  const harness = createHappyHarness({
    missingAttempts: new Map(LAUNCH_PACKAGES.map(({ name }) => [name, 1])),
  })

  const snapshot = await pollForPublishedMetadata({
    fetchImpl: harness.fetchImpl,
    maxAttempts: 2,
    pollIntervalMs: 37,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  })

  assert.deepEqual([...snapshot.keys()], LAUNCH_PACKAGES.map(({ name }) => name))
  assert.deepEqual(sleeps, [37])
  assert.equal(harness.fetchCalls.length, 10)
})

test('bounds each polling attempt to one request window by fetching pending records concurrently', async () => {
  let activeRequests = 0
  let peakRequests = 0
  const requestSignals = new Set()

  const fetchImpl = async (url, options) => {
    const name = decodeURIComponent(new URL(url).pathname.slice(1))
    const spec = LAUNCH_PACKAGES.find((entry) => entry.name === name)
    assert.ok(spec, `unexpected registry request for ${name}`)
    requestSignals.add(options.signal)
    activeRequests += 1
    peakRequests = Math.max(peakRequests, activeRequests)

    await new Promise((resolvePromise) => setImmediate(resolvePromise))
    activeRequests -= 1
    return response({ json: createPackument(spec) })
  }

  const snapshot = await pollForPublishedMetadata({
    fetchImpl,
    maxAttempts: 1,
    requestTimeoutMs: 101,
  })

  assert.equal(snapshot.size, LAUNCH_PACKAGES.length)
  assert.equal(peakRequests, LAUNCH_PACKAGES.length)
  assert.equal(requestSignals.size, LAUNCH_PACKAGES.length)
  for (const signal of requestSignals) assert.ok(signal instanceof AbortSignal)
})

test('settles a concurrent polling batch before reporting fatal errors in package order', async () => {
  const fetchCalls = []
  const fetchImpl = async (url) => {
    const name = decodeURIComponent(new URL(url).pathname.slice(1))
    fetchCalls.push(name)
    if (name === '@glucoseiq/core') {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 15))
      return response({ status: 401, statusText: 'Unauthorized' })
    }
    if (name === '@glucoseiq/react') {
      return response({ json: new SyntaxError('earlier concurrent failure') })
    }
    const spec = LAUNCH_PACKAGES.find((entry) => entry.name === name)
    assert.ok(spec, `unexpected registry request for ${name}`)
    return response({ json: createPackument(spec) })
  }

  await assert.rejects(
    pollForPublishedMetadata({ fetchImpl, maxAttempts: 1 }),
    /401 Unauthorized.*@glucoseiq\/core@1\.0\.0/u,
  )
  assert.deepEqual(fetchCalls, LAUNCH_PACKAGES.map(({ name }) => name))

  // Let the event loop turn once so a late, unobserved rejection fails this test.
  await new Promise((resolvePromise) => setImmediate(resolvePromise))
})

test('keeps polling when a package exists before its exact version record propagates', async () => {
  let coreRequests = 0
  const sleeps = []
  const fetchImpl = async (url) => {
    const name = decodeURIComponent(new URL(url).pathname.slice(1))
    const spec = LAUNCH_PACKAGES.find((entry) => entry.name === name)
    const packument = createPackument(spec)
    if (name === '@glucoseiq/core' && coreRequests++ === 0) {
      delete packument.versions[spec.version]
    }
    return response({ json: packument })
  }

  const snapshot = await pollForPublishedMetadata({
    fetchImpl,
    maxAttempts: 2,
    pollIntervalMs: 19,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  })

  assert.equal(snapshot.get('@glucoseiq/core').versions['1.0.0'].version, '1.0.0')
  assert.equal(coreRequests, 2)
  assert.deepEqual(sleeps, [19])
})

test('refreshes exact versions until all distribution metadata and tags are ready', async () => {
  const requests = new Map()
  const sleeps = []
  const fetchImpl = async (url) => {
    const name = decodeURIComponent(new URL(url).pathname.slice(1))
    const spec = LAUNCH_PACKAGES.find((entry) => entry.name === name)
    const count = (requests.get(name) ?? 0) + 1
    requests.set(name, count)
    const packument = createPackument(spec)
    if (name === '@glucoseiq/core' && count === 1) {
      packument['dist-tags'].latest = '0.9.0'
    }
    return response({ json: packument })
  }

  const snapshot = await pollForPublishedMetadata({
    fetchImpl,
    maxAttempts: 2,
    pollIntervalMs: 23,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  })

  assert.equal(snapshot.get('@glucoseiq/core')['dist-tags'].latest, '1.0.0')
  assert.equal(requests.get('@glucoseiq/core'), 2)
  assert.equal(requests.get('@glucoseiq/react'), 1)
  assert.deepEqual(sleeps, [23])
})

test('reports total absence after the bounded registry window', async () => {
  const harness = createHappyHarness({
    missingAttempts: new Map(LAUNCH_PACKAGES.map(({ name }) => [name, 2])),
  })

  await assert.rejects(
    pollForPublishedMetadata({
      fetchImpl: harness.fetchImpl,
      maxAttempts: 2,
      pollIntervalMs: 0,
      sleep: async () => {},
    }),
    (error) => {
      assert.match(error.message, /No launch package versions became visible/u)
      for (const spec of LAUNCH_PACKAGES) assert.match(error.message, new RegExp(spec.name.replace('/', '\\/'), 'u'))
      return true
    },
  )
})

test('distinguishes confirmed 404 absence from transient registry exhaustion', async () => {
  const fetchImpl = async (url) => {
    const name = decodeURIComponent(new URL(url).pathname.slice(1))
    return name === '@glucoseiq/core'
      ? response({ status: 503, statusText: 'Unavailable' })
      : response({ status: 404, statusText: 'Not Found' })
  }

  await assert.rejects(
    pollForPublishedMetadata({
      fetchImpl,
      maxAttempts: 1,
      pollIntervalMs: 0,
      sleep: async () => {},
    }),
    (error) => {
      assert.match(error.message, /Registry publication readiness could not be confirmed/u)
      assert.match(error.message, /Confirmed absent: @glucoseiq\/react@1\.0\.0/u)
      assert.match(
        error.message,
        /Unready: @glucoseiq\/core@1\.0\.0 \(registry returned 503 Unavailable\)/u,
      )
      return true
    },
  )
})

test('reports partial publication with separate present and missing inventories', async () => {
  const missingNames = new Set(['@glucoseiq/testing', '@glucoseiq/cli'])
  const harness = createHappyHarness({
    missingAttempts: new Map([...missingNames].map((name) => [name, 2])),
  })

  await assert.rejects(
    pollForPublishedMetadata({
      fetchImpl: harness.fetchImpl,
      maxAttempts: 2,
      pollIntervalMs: 0,
      sleep: async () => {},
    }),
    (error) => {
      assert.match(error.message, /Partial publication readiness detected/u)
      assert.match(error.message, /Present: @glucoseiq\/core@1\.0\.0/u)
      assert.match(error.message, /Missing: @glucoseiq\/testing@1\.0\.0/u)
      return true
    },
  )
})

test('reports visible but unready package metadata at bounded exhaustion', async () => {
  const fetchImpl = async (url) => {
    const name = decodeURIComponent(new URL(url).pathname.slice(1))
    const spec = LAUNCH_PACKAGES.find((entry) => entry.name === name)
    const packument = createPackument(spec)
    if (name === '@glucoseiq/core') packument['dist-tags'].latest = '0.9.0'
    return response({ json: packument })
  }

  await assert.rejects(
    pollForPublishedMetadata({
      fetchImpl,
      maxAttempts: 2,
      pollIntervalMs: 0,
      sleep: async () => {},
    }),
    (error) => {
      assert.match(error.message, /Partial publication readiness detected/u)
      assert.match(error.message, /Ready: @glucoseiq\/react@1\.0\.0/u)
      assert.match(error.message, /Unready: @glucoseiq\/core@1\.0\.0/u)
      assert.match(error.message, /latest must be 1\.0\.0/u)
      return true
    },
  )
})

test('retries transient network, timeout, 408, 429, and server failures', async (t) => {
  const cases = [
    {
      name: 'network',
      transient: async () => { throw new Error('socket closed') },
    },
    {
      name: 'timeout',
      transient: async () => { throw new DOMException('timed out', 'TimeoutError') },
    },
    {
      name: 'response body timeout',
      transient: async () => response({ json: new DOMException('timed out', 'TimeoutError') }),
    },
    {
      name: 'request timeout status',
      transient: async () => response({ status: 408, statusText: 'Request Timeout' }),
    },
    {
      name: 'rate limit',
      transient: async () => response({ status: 429, statusText: 'Too Many Requests' }),
    },
    {
      name: 'server',
      transient: async () => response({ status: 503, statusText: 'Unavailable' }),
    },
  ]

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const requests = new Map()
      const sleeps = []
      const fetchImpl = async (url) => {
        const name = decodeURIComponent(new URL(url).pathname.slice(1))
        const spec = LAUNCH_PACKAGES.find((entry) => entry.name === name)
        const count = (requests.get(name) ?? 0) + 1
        requests.set(name, count)
        if (name === '@glucoseiq/core' && count === 1) return fixture.transient()
        return response({ json: createPackument(spec) })
      }
      const snapshot = await pollForPublishedMetadata({
        fetchImpl,
        maxAttempts: 2,
        pollIntervalMs: 17,
        sleep: async (milliseconds) => sleeps.push(milliseconds),
      })
      assert.equal(snapshot.size, 5)
      assert.equal(requests.get('@glucoseiq/core'), 2)
      assert.deepEqual(sleeps, [17])
    })
  }
})

test('fails immediately on registry auth and structurally invalid records', async (t) => {
  const cases = [
    {
      name: 'authentication',
      fetchImpl: async () => response({ status: 401, statusText: 'Unauthorized' }),
      expected: /401 Unauthorized.*@glucoseiq\/core@1\.0\.0/u,
    },
    {
      name: 'authorization',
      fetchImpl: async () => response({ status: 403, statusText: 'Forbidden' }),
      expected: /403 Forbidden.*@glucoseiq\/core@1\.0\.0/u,
    },
    {
      name: 'invalid JSON',
      fetchImpl: async () => response({ json: new SyntaxError('bad document') }),
      expected: /invalid JSON.*@glucoseiq\/core@1\.0\.0.*bad document/u,
    },
    {
      name: 'wrong package name',
      fetchImpl: async () => response({ json: { name: '@glucoseiq/wrong', versions: {} } }),
      expected: /metadata for @glucoseiq\/wrong while checking @glucoseiq\/core@1\.0\.0/u,
    },
  ]

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      let sleepCalls = 0
      await assert.rejects(
        pollForPublishedMetadata({
          fetchImpl: fixture.fetchImpl,
          maxAttempts: 4,
          sleep: async () => { sleepCalls += 1 },
        }),
        fixture.expected,
      )
      assert.equal(sleepCalls, 0)
    })
  }
})

test('accepts the exact launch manifests and distribution tags', () => {
  const records = validateRegistrySnapshot(createSnapshot())
  assert.deepEqual(records.map(({ spec }) => spec.name), LAUNCH_PACKAGES.map(({ name }) => name))
})

test('accepts registry-normalized public metadata while retaining its security contract', () => {
  const snapshot = createSnapshot()
  for (const spec of LAUNCH_PACKAGES) {
    const metadata = snapshot.get(spec.name).versions[spec.version]
    delete metadata.publishConfig
    delete metadata.files
    metadata.repository.url = 'git+https://github.com/marklearst/glucoseiq.git'
  }

  assert.doesNotThrow(() => validateRegistrySnapshot(snapshot))
})

test('rejects wrong tags, engines, access, internal ranges, peers, signatures, and provenance', async (t) => {
  const cases = [
    {
      name: 'latest tag',
      mutate(packument) { packument['dist-tags'].latest = '0.9.0' },
      expected: /latest must be 1\.0\.0/u,
    },
    {
      name: 'Node engine',
      mutate(packument, spec) { packument.versions[spec.version].engines.node = '>=22' },
      expected: /Node engine must be >=24/u,
    },
    {
      name: 'public access',
      mutate(packument, spec) { packument.versions[spec.version].publishConfig.access = 'restricted' },
      expected: /publish access must be public/u,
    },
    {
      name: 'internal dependency',
      packageName: '@glucoseiq/testing',
      mutate(packument, spec) { packument.versions[spec.version].dependencies['@glucoseiq/core'] = '~1.0.0' },
      expected: /registry core dependency must be a stable caret range/u,
    },
    {
      name: 'React peer',
      packageName: '@glucoseiq/react',
      mutate(packument, spec) { packument.versions[spec.version].peerDependencies.react = '^19.0.0' },
      expected: /React peer dependency must be >=18/u,
    },
    {
      name: 'registry signature',
      mutate(packument, spec) { packument.versions[spec.version].dist.signatures = [] },
      expected: /registry signature evidence/u,
    },
    {
      name: 'provenance',
      mutate(packument, spec) { delete packument.versions[spec.version].dist.attestations },
      expected: /provenance attestation evidence/u,
    },
  ]

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const snapshot = createSnapshot()
      const spec = LAUNCH_PACKAGES.find(
        ({ name }) => name === (fixture.packageName ?? '@glucoseiq/core'),
      )
      const packument = snapshot.get(spec.name)
      fixture.mutate(packument, spec)
      assert.throws(() => validateRegistrySnapshot(snapshot), fixture.expected)
    })
  }
})

test('validates tarball digests, required contents, changelog, and packed dependency ranges', async (t) => {
  const spec = LAUNCH_PACKAGES.find(({ name }) => name === '@glucoseiq/testing')
  const { archive, metadata } = createVersionMetadata(spec)
  const entries = [
    'package/package.json',
    'package/README.md',
    'package/LICENSE',
    'package/CHANGELOG.md',
    'package/dist/index.mjs',
  ]
  const manifest = expectedPackedManifest(spec)

  validateTarballEvidence({ spec, metadata, archive, entries, manifest, changelog: '# 1.0.0\n' })

  await t.test('integrity mismatch', () => {
    assert.throws(
      () => validateTarballEvidence({ spec, metadata, archive: Buffer.from('tampered'), entries, manifest, changelog: '# 1.0.0\n' }),
      /tarball integrity mismatch/u,
    )
  })
  await t.test('missing changelog entry', () => {
    assert.throws(
      () => validateTarballEvidence({ spec, metadata, archive, entries: entries.filter((entry) => !entry.endsWith('CHANGELOG.md')), manifest, changelog: '# 1.0.0\n' }),
      /tarball must contain package\/CHANGELOG\.md/u,
    )
  })
  await t.test('empty changelog', () => {
    assert.throws(
      () => validateTarballEvidence({ spec, metadata, archive, entries, manifest, changelog: '   ' }),
      /CHANGELOG\.md must not be empty/u,
    )
  })
  await t.test('workspace range', () => {
    const invalidManifest = structuredClone(manifest)
    invalidManifest.dependencies['@glucoseiq/core'] = 'workspace:^'
    assert.throws(
      () => validateTarballEvidence({ spec, metadata, archive, entries, manifest: invalidManifest, changelog: '# 1.0.0\n' }),
      /must not contain workspace: ranges/u,
    )
  })
  await t.test('missing packed public access metadata', () => {
    const invalidManifest = structuredClone(manifest)
    delete invalidManifest.publishConfig
    assert.throws(
      () => validateTarballEvidence({ spec, metadata, archive, entries, manifest: invalidManifest, changelog: '# 1.0.0\n' }),
      /publish access must be public/u,
    )
  })
})

test('parses npm 11.17 provenance bundles and binds all five packages to the release SHA', async (t) => {
  const result = signatureAuditResult()
  const commits = verifySignatureAudit(
    JSON.stringify(result),
    LAUNCH_PACKAGES,
    auditOptions(),
  )
  assert.deepEqual(
    [...commits],
    LAUNCH_PACKAGES.map((spec) => [spec.name, releaseSha]),
  )

  const cases = [
    {
      name: 'repository',
      overrides: { repository: 'https://github.com/marklearst/other' },
      expected: /workflow repository must be https:\/\/github\.com\/marklearst\/glucoseiq/u,
    },
    {
      name: 'workflow path',
      overrides: { path: '.github/workflows/other.yml' },
      expected: /workflow path must be \.github\/workflows\/release\.yml/u,
    },
    {
      name: 'workflow ref',
      overrides: { ref: 'refs/heads/feature' },
      expected: /workflow ref must be refs\/heads\/main/u,
    },
    {
      name: 'builder',
      overrides: { builder: 'https://example.invalid/runner' },
      expected: /builder must be GitHub-hosted/u,
    },
    {
      name: 'git commit',
      overrides: { gitCommit: tagObjectSha },
      expected: new RegExp(`resolved gitCommit must equal ${releaseSha}`, 'u'),
    },
    {
      name: 'source URI',
      overrides: {
        uri: 'git+https://github.com/marklearst/glucoseiq@refs/heads/feature',
      },
      expected: /resolved source URI must be .*@refs\/heads\/main/u,
    },
    {
      name: 'package subject',
      overrides: { subjectName: 'pkg:npm/example@1.0.0' },
      expected: /provenance subject must include pkg:npm\/%40glucoseiq\/core@1\.0\.0/u,
    },
    {
      name: 'package digest',
      overrides: { subjectDigest: '0'.repeat(128) },
      expected: /provenance subject SHA-512 must match the published tarball/u,
    },
  ]

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      assert.throws(
        () => verifySignatureAudit(
          JSON.stringify(signatureAuditResult(fixture.overrides)),
          LAUNCH_PACKAGES,
          auditOptions(),
        ),
        fixture.expected,
      )
    })
  }

  await t.test('missing SLSA bundle', () => {
    const invalid = signatureAuditResult()
    invalid.verified[0].attestationBundles = invalid.verified[0].attestationBundles.filter(
      ({ predicateType }) => predicateType !== slsaPredicate,
    )
    assert.throws(
      () => verifySignatureAudit(JSON.stringify(invalid), LAUNCH_PACKAGES, auditOptions()),
      /did not return a SLSA v1 provenance bundle for @glucoseiq\/core@1\.0\.0/u,
    )
  })

  await t.test('invalid DSSE payload', () => {
    const invalid = signatureAuditResult()
    const bundle = invalid.verified[0].attestationBundles.find(
      ({ predicateType }) => predicateType === slsaPredicate,
    )
    bundle.bundle.dsseEnvelope.payload = '***not-base64***'
    assert.throws(
      () => verifySignatureAudit(JSON.stringify(invalid), LAUNCH_PACKAGES, auditOptions()),
      /SLSA payload is not valid base64 JSON/u,
    )
  })

  const missingPackage = signatureAuditResult()
  missingPackage.verified.pop()
  assert.throws(
    () => verifySignatureAudit(JSON.stringify(missingPackage), LAUNCH_PACKAGES, auditOptions()),
    /did not verify @glucoseiq\/cli@1\.0\.0/u,
  )
  assert.throws(
    () => verifySignatureAudit('{', LAUNCH_PACKAGES, auditOptions()),
    /invalid JSON/u,
  )
  assert.throws(
    () => verifySignatureAudit(
      JSON.stringify({ ...result, invalid: [{ name: '@glucoseiq/core' }] }),
      LAUNCH_PACKAGES,
      auditOptions(),
    ),
    /reported invalid package evidence/u,
  )
})

test('permits older provenance only for packages unchanged by an independent release', () => {
  const publishedPackages = [LAUNCH_PACKAGES[0]]
  const result = signatureAuditResult((spec) => ({
    gitCommit: spec.name === '@glucoseiq/core' ? releaseSha : tagObjectSha,
  }))
  const commits = verifySignatureAudit(
    JSON.stringify(result),
    LAUNCH_PACKAGES,
    auditOptions({ publishedPackages }),
  )

  assert.equal(commits.get('@glucoseiq/core'), releaseSha)
  assert.equal(commits.get('@glucoseiq/react'), tagObjectSha)
})

test('enforces the configured timeout in the external command runner', () => {
  const startedAt = Date.now()
  const result = runExternalCommand(
    process.execPath,
    [
      '--eval',
      "process.on('SIGTERM', () => {}); setTimeout(() => {}, 2000)",
    ],
    { cwd: process.cwd(), timeoutMs: 50 },
  )
  assert.equal(result.status, null)
  assert.equal(result.error?.code, 'ETIMEDOUT')
  assert.ok(Date.now() - startedAt < 1000, 'SIGTERM-resistant child must be killed promptly')
})

test('reports actionable external command timeouts and propagates the configured limit', async () => {
  const calls = []
  const timeout = Object.assign(new Error('spawn timed out'), { code: 'ETIMEDOUT' })
  const runCommand = async (command, args, options) => {
    calls.push({ command, args, options })
    return { status: null, stdout: '', stderr: '', error: timeout }
  }

  await assert.rejects(
    verifyRepositoryArtifacts({
      runCommand,
      commandTimeoutMs: 4321,
    }),
    /Resolve checked-out release commit timed out after 4321 ms/u,
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.timeoutMs, 4321)
})

test('verifies each exact Git tag and non-draft GitHub release', async () => {
  const harness = createHappyHarness()
  const result = await verifyRepositoryArtifacts({ runCommand: harness.runCommand })
  assert.equal(result.releaseSha, releaseSha)

  const gitCommands = harness.commands.filter(({ command }) => command === 'git')
  assert.deepEqual(gitCommands[0].args, ['rev-parse', '--verify', 'HEAD^{commit}'])
  assert.deepEqual(
    gitCommands.slice(1).map(({ args }) => args.slice(-2)),
    LAUNCH_PACKAGES.map(({ tag }) => [
      `refs/tags/${tag}`,
      `refs/tags/${tag}^{}`,
    ]),
  )

  const releasePaths = harness.commands
    .filter(({ command }) => command === 'gh')
    .map(({ args }) => args.at(-1))
  assert.deepEqual(
    releasePaths,
    LAUNCH_PACKAGES.map(
      ({ tag }) => `repos/marklearst/glucoseiq/releases/tags/${encodeURIComponent(tag)}`,
    ),
  )
})

test('fails repository verification with the exact missing tag and does not check its release', async () => {
  const calls = []
  const runCommand = async (command, args) => {
    calls.push({ command, args })
    if (command === 'git' && args[0] === 'rev-parse') {
      return { status: 0, stdout: `${releaseSha}\n`, stderr: '' }
    }
    if (command === 'git' && args.includes('refs/tags/@glucoseiq/tokens@1.0.0')) {
      return { status: 2, stdout: '', stderr: 'not found' }
    }
    if (command === 'git') {
      return { status: 0, stdout: `${releaseSha}\t${args.at(-2)}\n`, stderr: '' }
    }
    const tag = decodeURIComponent(args.at(-1).split('/').at(-1))
    return {
      status: 0,
      stdout: JSON.stringify({ tag_name: tag, draft: false, prerelease: false }),
      stderr: '',
    }
  }

  await assert.rejects(
    verifyRepositoryArtifacts({ runCommand }),
    /Missing Git tag @glucoseiq\/tokens@1\.0\.0/u,
  )
  assert.equal(
    calls.some(({ command, args }) => command === 'gh' && args.at(-1).includes('tokens')),
    false,
  )
})

test('preserves actionable Git and GitHub API failure diagnostics', async (t) => {
  await t.test('Git authentication or network failure', async () => {
    const runCommand = async (command, args) => {
      if (command === 'git' && args[0] === 'rev-parse') {
        return { status: 0, stdout: `${releaseSha}\n`, stderr: '' }
      }
      return {
        status: 128,
        stdout: '',
        stderr: 'fatal: Could not read from remote repository.',
      }
    }
    await assert.rejects(
      verifyRepositoryArtifacts({ runCommand }),
      /Check Git tag @glucoseiq\/core@1\.0\.0 failed: fatal: Could not read from remote repository\./u,
    )
  })

  await t.test('GitHub API authorization failure', async () => {
    const runCommand = async (command, args) => {
      if (command === 'git' && args[0] === 'rev-parse') {
        return { status: 0, stdout: `${releaseSha}\n`, stderr: '' }
      }
      if (command === 'git') {
        return { status: 0, stdout: `${releaseSha}\t${args.at(-2)}\n`, stderr: '' }
      }
      return { status: 1, stdout: '', stderr: 'HTTP 403: Resource not accessible' }
    }
    await assert.rejects(
      verifyRepositoryArtifacts({ runCommand }),
      /Check GitHub release @glucoseiq\/core@1\.0\.0 failed: HTTP 403: Resource not accessible/u,
    )
  })
})

test('accepts annotated tags only when their peeled commits equal the checked-out release SHA', async () => {
  const runCommand = async (command, args) => {
    if (command === 'git' && args[0] === 'rev-parse') {
      return { status: 0, stdout: `${releaseSha}\n`, stderr: '' }
    }
    if (command === 'git') {
      return {
        status: 0,
        stdout: `${tagObjectSha}\t${args.at(-2)}\n${releaseSha}\t${args.at(-1)}\n`,
        stderr: '',
      }
    }
    const tag = decodeURIComponent(args.at(-1).split('/').at(-1))
    return {
      status: 0,
      stdout: JSON.stringify({ tag_name: tag, draft: false, prerelease: false }),
      stderr: '',
    }
  }

  const result = await verifyRepositoryArtifacts({ runCommand })
  assert.equal(result.releaseSha, releaseSha)
})

test('rejects a remote tag whose peeled commit differs from the checked-out release SHA', async () => {
  const runCommand = async (command, args) => {
    if (command === 'git' && args[0] === 'rev-parse') {
      return { status: 0, stdout: `${releaseSha}\n`, stderr: '' }
    }
    return {
      status: 0,
      stdout: `${tagObjectSha}\t${args.at(-2)}\n${tagObjectSha}\t${args.at(-1)}\n`,
      stderr: '',
    }
  }

  await assert.rejects(
    verifyRepositoryArtifacts({ runCommand }),
    new RegExp(`@glucoseiq/core@1\\.0\\.0 must resolve to release commit ${releaseSha}`, 'u'),
  )
})

test('runs tarball, signature, release, and registry consumer checks in a safe deterministic order', async () => {
  const harness = createHappyHarness()
  const output = []

  const result = await verifyPublishedPackages({
    packageSpecs: LAUNCH_PACKAGES,
    fetchImpl: harness.fetchImpl,
    runCommand: harness.runCommand,
    maxAttempts: 1,
    commandTimeoutMs: 9876,
    logger: (line) => output.push(line),
  })

  assert.deepEqual(result.packages, LAUNCH_PACKAGES.map(({ name, version }) => `${name}@${version}`))
  assert.equal(result.releaseSha, releaseSha)
  assert.deepEqual(output, [
    'Verified registry metadata for 5 launch packages.',
    'Verified tarball integrity and contents for 5 launch packages.',
    'Verified registry signatures and provenance for 5 launch packages.',
    'Verified 5 Git tags and 5 GitHub releases.',
    'Verified the exact-version registry consumer matrix.',
    'GlucoseIQ post-publication verification passed for 5 packages.',
  ])

  const auditIndex = harness.events.findIndex((entry) => entry.startsWith('command:npm:audit'))
  const releaseShaIndex = harness.events.findIndex(
    (entry) => entry === 'command:git:rev-parse --verify HEAD^{commit}',
  )
  const lastReleaseIndex = harness.events.findLastIndex((entry) => entry.startsWith('command:gh:'))
  const matrixIndex = harness.events.findIndex(
    (entry) => entry === `command:${process.execPath}:scripts/test-package-contracts.mjs --source registry`,
  )
  assert.ok(releaseShaIndex >= 0)
  assert.ok(auditIndex > releaseShaIndex)
  assert.ok(lastReleaseIndex > auditIndex)
  assert.ok(matrixIndex > lastReleaseIndex)
  assert.equal(matrixIndex, harness.events.length - 1)
  assert.ok(harness.commands.every(({ timeoutMs }) => timeoutMs === 9876))
})

test('registry-evidence-only mode verifies immutable npm evidence without requiring Git artifacts', async () => {
  const harness = createHappyHarness()
  const output = []

  const result = await verifyPublishedPackages({
    packageSpecs: LAUNCH_PACKAGES,
    fetchImpl: harness.fetchImpl,
    runCommand: harness.runCommand,
    maxAttempts: 1,
    registryEvidenceOnly: true,
    logger: (line) => output.push(line),
  })

  assert.deepEqual(result.packages, LAUNCH_PACKAGES.map(({ name, version }) => `${name}@${version}`))
  assert.equal(result.releaseSha, releaseSha)
  assert.deepEqual(output, [
    'Verified registry metadata for 5 launch packages.',
    'Verified tarball integrity and contents for 5 launch packages.',
    'Verified registry signatures and provenance for 5 launch packages.',
    'Verified the exact-version registry consumer matrix.',
    'GlucoseIQ registry-evidence verification passed for 5 packages.',
  ])

  assert.deepEqual(
    harness.commands
      .filter(({ command }) => command === 'git')
      .map(({ args }) => args),
    [['rev-parse', '--verify', 'HEAD^{commit}']],
  )
  assert.equal(harness.commands.some(({ command }) => command === 'gh'), false)
  assert.equal(
    harness.events.at(-1),
    `command:${process.execPath}:scripts/test-package-contracts.mjs --source registry`,
  )
})

test('published verifier arguments expose only the explicit registry-evidence mode', () => {
  assert.deepEqual(
    publishedVerifier.parsePublishedVerifierArguments([]),
    { registryEvidenceOnly: false },
  )
  assert.deepEqual(
    publishedVerifier.parsePublishedVerifierArguments(['--registry-evidence-only']),
    { registryEvidenceOnly: true },
  )

  for (const args of [
    ['--registry-evidence-only', '--registry-evidence-only'],
    ['--unknown'],
    ['registry-evidence-only'],
  ]) {
    assert.throws(
      () => publishedVerifier.parsePublishedVerifierArguments(args),
      /Usage: node scripts\/verify-published-packages\.mjs \[--registry-evidence-only\]/u,
    )
  }
})

test('binds unchanged package tags to their own provenance during an independent release', async () => {
  const publishedPackages = [LAUNCH_PACKAGES[0]]
  const packageShas = new Map(
    LAUNCH_PACKAGES.slice(1).map((spec) => [spec.name, tagObjectSha]),
  )
  const harness = createHappyHarness({ packageShas })

  const result = await verifyPublishedPackages({
    packageSpecs: LAUNCH_PACKAGES,
    publishedPackages,
    fetchImpl: harness.fetchImpl,
    runCommand: harness.runCommand,
    maxAttempts: 1,
    logger: () => {},
  })

  assert.equal(result.packageCommits.get('@glucoseiq/core'), releaseSha)
  assert.equal(result.packageCommits.get('@glucoseiq/react'), tagObjectSha)
})

test('keeps every planned package HEAD-bound when Changesets reports only a subset', async () => {
  const inventory = resolvePublicationInventory({
    actionOutcome: 'failure',
    published: 'false',
    publishedPackages: JSON.stringify([
      { name: '@glucoseiq/core', version: '1.0.0' },
    ]),
    expectedPackages: JSON.stringify([
      { name: '@glucoseiq/core', version: '1.0.0' },
      { name: '@glucoseiq/react', version: '1.0.0' },
    ]),
  })
  const harness = createHappyHarness({
    packageShas: new Map([['@glucoseiq/react', tagObjectSha]]),
  })

  await assert.rejects(
    verifyPublishedPackages({
      packageSpecs: LAUNCH_PACKAGES,
      verificationPackages: inventory.verificationPackages,
      fetchImpl: harness.fetchImpl,
      runCommand: harness.runCommand,
      maxAttempts: 1,
      logger: () => {},
    }),
    new RegExp(
      `@glucoseiq/react@1\\.0\\.0 resolved gitCommit must equal ${releaseSha}`,
      'u',
    ),
  )
})

test('parses direct Changesets output against current above-floor package versions', async () => {
  const manifests = new Map(LAUNCH_PACKAGES.map((spec) => [
    spec.name,
    {
      name: spec.name,
      version: spec.name === '@glucoseiq/core' ? '1.1.0' : spec.version,
      ...(spec.coreDependency
        ? { dependencies: { '@glucoseiq/core': 'workspace:^' } }
        : {}),
    },
  ]))
  const packageSpecs = createPublishedPackageSpecs(manifests)
  const packageShas = new Map(
    packageSpecs.slice(1).map((spec) => [spec.name, tagObjectSha]),
  )
  const harness = createHappyHarness({ packageShas, packageSpecs })

  const result = await verifyPublishedPackages({
    packageSpecs,
    publishedPackages: JSON.stringify([
      { name: '@glucoseiq/core', version: '1.1.0' },
    ]),
    fetchImpl: harness.fetchImpl,
    runCommand: harness.runCommand,
    maxAttempts: 1,
    logger: () => {},
  })

  assert.equal(result.packageCommits.get('@glucoseiq/core'), releaseSha)
  assert.equal(result.packageCommits.get('@glucoseiq/react'), tagObjectSha)
})

test('rejects an unchanged package tag that disagrees with its provenance commit', async () => {
  const publishedPackages = [LAUNCH_PACKAGES[0]]
  const packageShas = new Map(
    LAUNCH_PACKAGES.slice(1).map((spec) => [spec.name, tagObjectSha]),
  )
  const harness = createHappyHarness({ packageShas })
  const baseRun = harness.runCommand
  const runCommand = async (command, args, options) => {
    if (
      command === 'git' &&
      args[0] === 'ls-remote' &&
      args.includes('refs/tags/@glucoseiq/react@1.0.0')
    ) {
      return {
        status: 0,
        stdout: `${releaseSha}\trefs/tags/@glucoseiq/react@1.0.0\n`,
        stderr: '',
      }
    }
    return baseRun(command, args, options)
  }

  await assert.rejects(
    verifyPublishedPackages({
      packageSpecs: LAUNCH_PACKAGES,
      publishedPackages,
      fetchImpl: harness.fetchImpl,
      runCommand,
      maxAttempts: 1,
      logger: () => {},
    }),
    new RegExp(
      `@glucoseiq/react@1\\.0\\.0 must resolve to package provenance commit ${tagObjectSha}`,
      'u',
    ),
  )
})

test('does not download tarballs or run commands when metadata validation fails', async () => {
  const commands = []
  const fetchImpl = async (url) => {
    const name = decodeURIComponent(new URL(url).pathname.slice(1))
    const spec = LAUNCH_PACKAGES.find((entry) => entry.name === name)
    const packument = createPackument(spec)
    if (name === '@glucoseiq/core') packument['dist-tags'].latest = '9.0.0'
    return response({ json: packument })
  }

  await assert.rejects(
    verifyPublishedPackages({
      packageSpecs: LAUNCH_PACKAGES,
      fetchImpl,
      runCommand: async (...args) => { commands.push(args); return { status: 0, stdout: '', stderr: '' } },
      maxAttempts: 1,
      logger: () => {},
    }),
    /latest must be 1\.0\.0/u,
  )
  assert.deepEqual(commands, [])
})

test('stops before signature and repository checks when a tarball download fails', async () => {
  const harness = createHappyHarness()
  const fetchImpl = async (url, options) => {
    if (url.endsWith('.tgz')) return response({ status: 503, statusText: 'Unavailable' })
    return harness.fetchImpl(url, options)
  }

  await assert.rejects(
    verifyPublishedPackages({
      packageSpecs: LAUNCH_PACKAGES,
      fetchImpl,
      runCommand: harness.runCommand,
      maxAttempts: 1,
      logger: () => {},
    }),
    /Tarball download returned 503 Unavailable for @glucoseiq\/core@1\.0\.0/u,
  )
  assert.equal(
    harness.commands.some(({ command }) => ['npm', 'git', 'gh', process.execPath].includes(command)),
    false,
  )
})

test('reports a malformed packed manifest and stops before signature checks', async () => {
  const harness = createHappyHarness()
  const baseRun = harness.runCommand
  const runCommand = async (command, args, options) => {
    if (command === 'tar' && args[0] === '-xOzf' && args[2] === 'package/package.json') {
      return { status: 0, stdout: '{', stderr: '' }
    }
    return baseRun(command, args, options)
  }

  await assert.rejects(
    verifyPublishedPackages({
      packageSpecs: LAUNCH_PACKAGES,
      fetchImpl: harness.fetchImpl,
      runCommand,
      maxAttempts: 1,
      logger: () => {},
    }),
    /@glucoseiq\/core@1\.0\.0 tarball package\.json is invalid JSON/u,
  )
  assert.equal(harness.commands.some(({ command }) => command === 'npm'), false)
})

test('stops before repository and consumer checks when signature verification fails', async () => {
  const harness = createHappyHarness()
  const baseRun = harness.runCommand
  const runCommand = async (command, args, options) => {
    if (command === 'npm' && args[0] === 'audit') {
      return { status: 1, stdout: '', stderr: 'attestation verification failed' }
    }
    return baseRun(command, args, options)
  }

  await assert.rejects(
    verifyPublishedPackages({
      packageSpecs: LAUNCH_PACKAGES,
      fetchImpl: harness.fetchImpl,
      runCommand,
      maxAttempts: 1,
      logger: () => {},
    }),
    /Verify registry signatures and provenance failed: attestation verification failed/u,
  )
  assert.deepEqual(
    harness.commands.filter(({ command }) => command === 'git').map(({ args }) => args),
    [['rev-parse', '--verify', 'HEAD^{commit}']],
  )
  assert.equal(harness.commands.some(({ command }) => ['gh', process.execPath].includes(command)), false)
})

test('does not run the consumer matrix when release verification fails', async () => {
  const harness = createHappyHarness()
  const baseRun = harness.runCommand
  harness.runCommand = async (command, args, options) => {
    if (command === 'gh' && args.at(-1).includes(encodeURIComponent('@glucoseiq/cli@1.0.0'))) {
      return { status: 1, stdout: '', stderr: 'release absent' }
    }
    return baseRun(command, args, options)
  }

  await assert.rejects(
    verifyPublishedPackages({
      packageSpecs: LAUNCH_PACKAGES,
      fetchImpl: harness.fetchImpl,
      runCommand: harness.runCommand,
      maxAttempts: 1,
      logger: () => {},
    }),
    /Check GitHub release @glucoseiq\/cli@1\.0\.0 failed: release absent/u,
  )
  assert.equal(
    harness.commands.some(
      ({ command, args }) => command === process.execPath && args.includes('--source'),
    ),
    false,
  )
})

test('rejects draft and malformed GitHub release records', async (t) => {
  for (const fixture of [
    {
      name: 'draft release',
      stdout: JSON.stringify({
        tag_name: '@glucoseiq/core@1.0.0',
        draft: true,
        prerelease: false,
      }),
      expected: /must have a published, stable GitHub release/u,
    },
    {
      name: 'malformed response',
      stdout: '{',
      expected: /GitHub release @glucoseiq\/core@1\.0\.0 returned invalid JSON/u,
    },
  ]) {
    await t.test(fixture.name, async () => {
      const runCommand = async (command, args) => {
        if (command === 'git' && args[0] === 'rev-parse') {
          return { status: 0, stdout: `${releaseSha}\n`, stderr: '' }
        }
        if (command === 'git') {
          return { status: 0, stdout: `${releaseSha}\t${args.at(-2)}\n`, stderr: '' }
        }
        return { status: 0, stdout: fixture.stdout, stderr: '' }
      }
      await assert.rejects(verifyRepositoryArtifacts({ runCommand }), fixture.expected)
    })
  }
})
