import assert from 'node:assert/strict'
import test from 'node:test'
import * as releaseContract from './lib/release-contract.mjs'

const candidateContracts = await import('./lib/package-contracts.mjs')
const publisher = await import('./publish-next-zero.mjs')
const verifier = await import('./verify-published-packages.mjs')

test('shares one immutable exact next.0 identity across candidate, publisher, and verifier consumers', () => {
  // Catches separately maintained package arrays or next.0 literals drifting so
  // one release consumer accepts a different identity than another.
  assert.equal(Array.isArray(releaseContract.RELEASE_PACKAGE_IDENTITIES), true)
  assert.equal(Object.isFrozen(releaseContract.RELEASE_PACKAGE_IDENTITIES), true)
  assert.equal(releaseContract.NEXT_ZERO_VERSION, '1.0.0-next.0')
  assert.equal(releaseContract.NEXT_ZERO_NPM_TAG, 'next')
  assert.equal(releaseContract.NEXT_ZERO_CORE_RANGE, '^1.0.0-next.0')
  assert.deepEqual(
    releaseContract.RELEASE_PACKAGE_IDENTITIES,
    [
      { name: '@glucoseiq/core', directory: 'packages/core', minimumStableVersion: '1.0.0', coreDependency: false },
      { name: '@glucoseiq/react', directory: 'packages/react', minimumStableVersion: '1.0.0', coreDependency: true },
      { name: '@glucoseiq/tokens', directory: 'packages/tokens', minimumStableVersion: '1.0.0', coreDependency: false },
      { name: '@glucoseiq/testing', directory: 'packages/testing', minimumStableVersion: '1.0.0', coreDependency: true },
      { name: '@glucoseiq/cli', directory: 'packages/cli', minimumStableVersion: '1.0.0', coreDependency: true },
    ],
  )
  assert.strictEqual(
    candidateContracts.RELEASE_PACKAGE_IDENTITIES,
    releaseContract.RELEASE_PACKAGE_IDENTITIES,
  )
  assert.strictEqual(
    publisher.NEXT_ZERO_PACKAGES,
    releaseContract.NEXT_ZERO_PACKAGE_SPECS,
  )
  assert.strictEqual(
    verifier.NEXT_ZERO_PACKAGES,
    releaseContract.NEXT_ZERO_PACKAGE_SPECS,
  )
  assert.strictEqual(
    verifier.LAUNCH_PACKAGES,
    releaseContract.LAUNCH_PACKAGE_SPECS,
  )
})
