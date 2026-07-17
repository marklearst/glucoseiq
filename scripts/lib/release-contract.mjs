const packageIdentities = [
  {
    name: '@glucoseiq/core',
    directory: 'packages/core',
    minimumStableVersion: '1.0.0',
    coreDependency: false,
  },
  {
    name: '@glucoseiq/react',
    directory: 'packages/react',
    minimumStableVersion: '1.0.0',
    coreDependency: true,
  },
  {
    name: '@glucoseiq/tokens',
    directory: 'packages/tokens',
    minimumStableVersion: '1.0.0',
    coreDependency: false,
  },
  {
    name: '@glucoseiq/testing',
    directory: 'packages/testing',
    minimumStableVersion: '1.0.0',
    coreDependency: true,
  },
  {
    name: '@glucoseiq/cli',
    directory: 'packages/cli',
    minimumStableVersion: '1.0.0',
    coreDependency: true,
  },
]

export const NEXT_ZERO_VERSION = '1.0.0-next.0'
export const NEXT_ZERO_NPM_TAG = 'next'
export const NEXT_ZERO_CORE_RANGE = `^${NEXT_ZERO_VERSION}`

export const RELEASE_PACKAGE_IDENTITIES = Object.freeze(
  packageIdentities.map((identity) => Object.freeze({ ...identity })),
)

function createPackageSpecs(versionFor) {
  return Object.freeze(RELEASE_PACKAGE_IDENTITIES.map((identity) => {
    const version = versionFor(identity)
    return Object.freeze({
      name: identity.name,
      directory: identity.directory,
      minimumVersion: identity.minimumStableVersion,
      version,
      tag: `${identity.name}@${version}`,
      ...(identity.coreDependency ? { coreDependency: true, coreVersion: version } : {}),
    })
  }))
}

export const LAUNCH_PACKAGE_SPECS = createPackageSpecs(
  ({ minimumStableVersion }) => minimumStableVersion,
)

export const NEXT_ZERO_PACKAGE_SPECS = createPackageSpecs(
  () => NEXT_ZERO_VERSION,
)
