import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')
const ciWorkflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
const pullRequestBody = readFileSync(join(root, '.github/release-pr-body.md'), 'utf8')
const launchRunbook = readFileSync(join(root, 'docs/LAUNCH_RUNBOOK.md'), 'utf8')
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const pnpmAction =
  'pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v4.4.0'

function jobBlock(name) {
  const lines = workflow.split('\n')
  const start = lines.indexOf(`  ${name}:`)
  assert.notEqual(start, -1, `release workflow must define the ${name} job`)
  let end = lines.length
  for (let index = start + 1; index < lines.length; index++) {
    if (/^ {2}[a-z][a-z0-9_-]*:$/u.test(lines[index])) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length
}

function versionPullRequestAddPaths() {
  const match = version.match(/\n {10}add-paths: \|\n((?: {12}[^\n]+\n)+)/u)
  assert.ok(match, 'version job must define release pull-request paths')
  return match[1].trim().split('\n').map((line) => line.trim())
}

function assertVersionPullRequestPaths({ prerelease }) {
  const repository = mkdtempSync(join(tmpdir(), 'glucoseiq-release-paths-'))
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: repository })
    mkdirSync(join(repository, '.changeset'), { recursive: true })
    mkdirSync(join(repository, 'packages/core'), { recursive: true })
    writeFileSync(join(repository, '.changeset/README.md'), '# Changesets\n')
    writeFileSync(join(repository, 'packages/core/package.json'), '{}\n')
    writeFileSync(join(repository, 'packages/core/CHANGELOG.md'), '# Changelog\n')
    writeFileSync(join(repository, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    if (prerelease) {
      writeFileSync(join(repository, '.changeset/pre.json'), '{"mode":"pre"}\n')
    }

    execFileSync('git', ['add', '--', ...versionPullRequestAddPaths()], {
      cwd: repository,
      stdio: 'pipe',
    })
    const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], {
      cwd: repository,
      encoding: 'utf8',
    }).split('\0').filter(Boolean)
    assert.ok(staged.includes('.changeset/README.md'))
    assert.equal(staged.includes('.changeset/pre.json'), prerelease)
  } finally {
    rmSync(repository, { force: true, recursive: true })
  }
}

assert.match(workflow, /^permissions: \{\}$/mu, 'root permissions must default to none')
const quality = jobBlock('quality')
const version = jobBlock('version')
const publish = jobBlock('publish')
assert.doesNotMatch(workflow, /^ {2}release:$/mu, 'the former combined release job must be removed')

assert.match(quality, /^ {4}permissions:\n {6}contents: read$/mu)
assert.match(quality, /^ {4}timeout-minutes: 30$/mu)
assert.doesNotMatch(quality, /^ {6}\S+: write$/mu)
assert.match(quality, /^ {4}outputs:\n {6}should_version:/mu)
assert.match(quality, /^ {6}should_publish:/mu)
assert.match(quality, /^ {6}publish_command:/mu)
assert.match(quality, /^ {6}release_state:/mu)
assert.match(quality, /^ {6}expected_packages:/mu)
assert.match(quality, /npm install --global npm@11\.17\.0/u)
assert.match(
  quality,
  /import \{\s+detectReleaseMode,\s+isChangesetReaderPath,\s+parseNullDelimitedPaths,\s+runChangesetPolicy,?\s+\}/u,
)
assert.match(quality, /paths\.filter\(isChangesetReaderPath\)/u)
assert.match(quality, /detectReleaseMode/u)
assert.match(quality, /policy\.reason === 'generated-version-commit'/u)
assert.match(quality, /policy\.versionedPackages/u)
assert.match(quality, /createExpectedPublicationPlan/u)
assert.match(quality, /expected_packages=\$\{JSON\.stringify\(expectedPackages\)\}/u)
assert.match(quality, /should_version=\$\{releaseMode\.shouldVersion\}/u)
assert.match(quality, /should_publish=\$\{releaseMode\.shouldPublish\}/u)
assert.match(quality, /publish_command=\$\{releaseMode\.publishCommand \?\? ''\}/u)
assert.match(quality, /release_state=\$\{releaseMode\.state\}/u)
assert.doesNotMatch(quality, /git ls-files '\.changeset\/\*\.md'/u)
for (const command of [
  'pnpm build',
  'pnpm typecheck',
  'pnpm lint',
  'pnpm test:changesets',
  'pnpm test:release-safety',
  'pnpm test:launch',
  'pnpm --filter docs test:api',
  'pnpm --filter docs docs:api:check',
  'pnpm test:docs',
  'pnpm test:coverage',
  'pnpm test:errors',
  'pnpm test:size',
  'pnpm test:packages',
  'pnpm --filter docs build',
]) {
  assert.ok(quality.includes(command), `quality job must run ${command}`)
}

assert.match(version, /^ {4}needs: quality$/mu)
assert.match(version, /^ {4}timeout-minutes: 45$/mu)
assert.match(version, /^ {4}if: needs\.quality\.outputs\.should_version == 'true'$/mu)
assert.match(version, /^ {4}permissions:\n {6}contents: write\n {6}pull-requests: write\n {6}checks: write$/mu)
assert.match(version, /npm install --global npm@11\.17\.0/u)
assert.doesNotMatch(version, /id-token:/u)
assert.match(version, /branch: release\/glucoseiq-packages/u)
assert.match(version, /base: main/u)
assert.match(version, /commit-message: 'chore\(release\): version packages'/u)
assert.match(version, /title: 'chore\(release\): version packages'/u)
assert.match(version, /body-path: \.github\/release-pr-body\.md/u)
assert.match(version, /draft: always-true/u)
assert.match(version, /pull-request-head-sha/u)
assert.match(version, /name: Checkout release candidate/u)
assert.match(version, /ref: \$\{\{ steps\.version-pr\.outputs\.pull-request-head-sha \}\}/u)
assert.match(version, /pnpm test:packages:candidate/u)
assert.match(version, /pnpm test:errors/u)
assert.match(version, /pnpm test:release-safety/u)
assert.match(version, /pnpm --filter docs test:api/u)
assert.match(version, /Build & test \(Node 24\)/u)
assert.match(version, /check-runs/u)
assert.match(version, /head_sha/u)
assert.match(version, /details_url/u)
assert.match(version, /steps\.candidate\.outcome/u)

// Catches a literal optional prerelease path aborting Git staging before
// .changeset/pre.json exists.
assertVersionPullRequestPaths({ prerelease: false })
assertVersionPullRequestPaths({ prerelease: true })

assert.match(publish, /^ {4}needs: quality$/mu)
assert.match(publish, /^ {4}timeout-minutes: 45$/mu)
assert.match(publish, /^ {4}if: needs\.quality\.outputs\.should_publish == 'true'$/mu)
assert.doesNotMatch(publish, /outputs\.has_changesets == 'false'/u)
assert.match(publish, /^ {4}permissions:\n {6}contents: write\n {6}id-token: write$/mu)
assert.doesNotMatch(publish, /pull-requests:/u)
assert.doesNotMatch(publish, /checks:/u)
assert.doesNotMatch(
  publish,
  /registry-url:/u,
  'setup-node registry auth must not override Changesets bootstrap or npm OIDC auth',
)
assert.match(publish, /npm install --global npm@11\.17\.0/u)
assert.match(publish, /node scripts\/release-preflight\.mjs/u)
assert.ok(
  publish.indexOf('node scripts/release-preflight.mjs') < publish.indexOf('changesets/action@'),
  'live-domain preflight must run before publication',
)
assert.match(
  publish,
  /uses: changesets\/action@a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d/u,
)
// Catches the action returning to its API tag path, which swallows every
// createRef error before it creates a public GitHub release.
assert.doesNotMatch(publish, /^ {10}commitMode:/mu)
assert.match(publish, /name: Prepare Git tag authentication/u)
assert.match(publish, /glucoseiq-git-askpass/u)
assert.match(publish, /GIT_ASKPASS: \$\{\{ runner\.temp \}\}\/glucoseiq-git-askpass/u)
assert.match(publish, /GIT_TERMINAL_PROMPT: 0/u)
assert.match(publish, /name: Remove Git tag authentication helper/u)
assert.match(
  publish,
  /name: Remove Git tag authentication helper\n {8}id: git-auth-cleanup\n {8}if: \$\{\{ always\(\) \}\}/u,
)
const gitAuthCleanup = publish.slice(
  publish.indexOf('name: Remove Git tag authentication helper'),
  publish.indexOf('name: Resolve publication inventory'),
)
assert.match(gitAuthCleanup, /rm -f "\$RUNNER_TEMP\/glucoseiq-git-askpass"/u)
assert.match(gitAuthCleanup, /rm -f "\$HOME\/\.netrc"/u)
assert.match(gitAuthCleanup, /test ! -e "\$RUNNER_TEMP\/glucoseiq-git-askpass"/u)
assert.match(gitAuthCleanup, /test ! -e "\$HOME\/\.netrc"/u)
assert.ok(
  publish.indexOf('name: Prepare Git tag authentication') <
    publish.indexOf('uses: changesets/action@') &&
    publish.indexOf('uses: changesets/action@') <
    publish.indexOf('name: Remove Git tag authentication helper') &&
    publish.indexOf('name: Remove Git tag authentication helper') <
    publish.indexOf('name: Resolve publication inventory'),
  'ephemeral Git tag authentication must surround only the Changesets Action',
)
assert.match(publish, /name: Resolve publication inventory/u)
assert.match(
  publish,
  /name: Resolve publication inventory[\s\S]{0,260}if: \$\{\{ !cancelled\(\) && steps\.git-auth-cleanup\.outcome == 'success' && \(steps\.changesets\.outcome == 'success' \|\| steps\.changesets\.outcome == 'failure'\) \}\}/u,
  'post-attempt inventory must run when publication fails before action outputs are updated',
)
assert.match(publish, /resolvePublicationInventory/u)
assert.match(
  publish,
  /EXPECTED_PUBLISHED_PACKAGES: \$\{\{ needs\.quality\.outputs\.expected_packages \}\}/u,
)
assert.match(publish, /CHANGESETS_ACTION_OUTCOME: \$\{\{ steps\.changesets\.outcome \}\}/u)
assert.match(publish, /CHANGESETS_PUBLISHED: \$\{\{ steps\.changesets\.outputs\.published \}\}/u)
assert.match(publish, /reported_packages=\$\{JSON\.stringify\(reportedPackages\)\}/u)
assert.match(
  publish,
  /verification_packages=\$\{JSON\.stringify\(verificationPackages\)\}/u,
)
assert.match(publish, /inventory\.reportedPackages/u)
assert.match(publish, /inventory\.verificationPackages/u)
assert.doesNotMatch(publish, /continue-on-error:/u)
assert.equal(
  occurrences(publish, /publish: \$\{\{ needs\.quality\.outputs\.publish_command \}\}/gu),
  1,
)
assert.doesNotMatch(
  publish.slice(publish.indexOf('name: Resolve publication inventory')),
  /(?:changeset|npm) publish/u,
  'post-attempt recovery must inventory existing state rather than republish',
)
assert.match(publish, /name: Remove npm authentication/u)
assert.match(publish, /scrubUserNpmAuth/u)
assert.match(
  publish,
  /if: \$\{\{ !cancelled\(\) && \(steps\.changesets\.outcome == 'success' \|\| steps\.changesets\.outcome == 'failure'\) \}\}/u,
)
assert.match(publish, /node scripts\/verify-published-packages\.mjs/u)
assert.match(
  publish,
  /CHANGESETS_VERIFICATION_PACKAGES: \$\{\{ steps\.publication-inventory\.outputs\.verification_packages \}\}/u,
)
const verifierStep = publish.slice(publish.indexOf('name: Verify published packages'))
assert.doesNotMatch(verifierStep, /CHANGESETS_PUBLISHED_PACKAGES/u)
assert.match(
  publish,
  /steps\.npm-auth-cleanup\.outcome == 'success'/u,
  'registry verification must not run unless npm authentication cleanup succeeds',
)
assert.match(
  verifierStep,
  /steps\.git-auth-cleanup\.outcome == 'success'/u,
  'registry verification must not run unless Git authentication cleanup succeeds',
)
assert.ok(
  publish.indexOf('name: Remove npm authentication') <
    publish.indexOf('name: Verify published packages'),
  'npm authentication cleanup must finish before registry consumers run',
)
assert.doesNotMatch(workflow, /gh workflow run/u)

assert.equal(occurrences(workflow, /uses: actions\/checkout@/gu), 4)
assert.equal(occurrences(workflow, /persist-credentials: false/gu), 4)
assert.equal(occurrences(workflow, /fetch-depth: 0/gu), 4)
assert.equal(rootPackage.packageManager, 'pnpm@11.17.0')
assert.equal(occurrences(workflow, new RegExp(pnpmAction.replaceAll('.', '\\.'), 'gu')), 3)
assert.equal(occurrences(workflow, /version: 11\.17\.0/gu), 3)
assert.equal(occurrences(workflow, /node-version: 24/gu), 3)
assert.equal(occurrences(workflow, /npm install --global npm@11\.17\.0/gu), 3)
assert.doesNotMatch(workflow, /workflow_dispatch:/u)
assert.equal(occurrences(ciWorkflow, new RegExp(pnpmAction.replaceAll('.', '\\.'), 'gu')), 1)
assert.equal(occurrences(ciWorkflow, /version: 11\.17\.0/gu), 1)

for (const source of [workflow, ciWorkflow]) {
  assert.match(source, /fetch-depth: 0/u, 'Changeset policy callers must fetch complete history')
  assert.match(source, /git branch --track main origin\/main/u)
  assert.match(
    source,
    /CHANGESET_POLICY_BRANCH: \$\{\{ github\.head_ref \|\| github\.ref_name \}\}/u,
  )
  assert.match(
    source,
    /CHANGESET_POLICY_HEAD_REPOSITORY: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \|\| github\.repository \}\}/u,
  )
  assert.match(
    source,
    /CHANGESET_POLICY_BASE_SHA: \$\{\{ github\.event_name == 'push' && github\.event\.before \|\| '' \}\}/u,
  )
}
assert.match(ciWorkflow, /pnpm test:errors/u)
assert.match(ciWorkflow, /pnpm test:release-safety/u)
assert.match(
  ciWorkflow,
  /if: github\.event_name == 'pull_request'\n {8}run: pnpm lint:commits --from "\$\{\{ github\.event\.pull_request\.base\.sha \}\}" --to "\$\{\{ github\.event\.pull_request\.head\.sha \}\}"/u,
  'pull-request CI must lint only the exact head commits after the selected base',
)
assert.match(ciWorkflow, /pnpm --filter docs test:api/u)
assert.match(ciWorkflow, /npm install --global npm@11\.17\.0/u)
assert.match(ciWorkflow, /^ {4}timeout-minutes: 30$/mu)
assert.match(
  ciWorkflow,
  /^ {4}name: \$\{\{ github\.event_name == 'pull_request' && github\.head_ref == 'release\/glucoseiq-packages' && github\.event\.pull_request\.head\.repo\.full_name == github\.repository && 'Release branch CI \(handled by release workflow\)' \|\| 'Build & test \(Node 24\)' \}\}$/mu,
  'the required CI context must have only the release workflow as its producer on the generated release branch',
)
assert.match(
  ciWorkflow,
  /^ {4}if: github\.event_name != 'pull_request' \|\| github\.head_ref != 'release\/glucoseiq-packages' \|\| github\.event\.pull_request\.head\.repo\.full_name != github\.repository$/mu,
  'CI must skip only the same-repository generated release branch',
)
assert.doesNotMatch(ciWorkflow, /^ {4}name: Build & test \(Node 24\)$/mu)

assert.equal(
  rootPackage.scripts['lint:commits'],
  'commitlint --config commitlint.config.mjs --verbose',
  'commit linting must use the repository configuration explicitly',
)

assert.equal(
  rootPackage.scripts['test:release-safety'],
  'node --test scripts/commit-message-contracts.test.mjs scripts/test-changeset-policy.test.mjs scripts/release-preflight.test.mjs scripts/release-contract-consumers.test.mjs scripts/verify-published-packages.test.mjs scripts/publish-next-zero.test.mjs',
  'release-safety regressions must have one durable root command',
)

for (const heading of [
  '## Domain and documentation',
  '## Package candidate',
  '## Bootstrap credential',
  '## Metadata and approval',
  '## Trusted publishing migration',
]) {
  assert.ok(pullRequestBody.includes(heading), `release checklist must include ${heading}`)
}
for (const checklistItem of [
  'domain registration is active',
  'Vercel production deployment is healthy',
  'apex and www redirect',
  'search, routes, robots, and sitemap',
  'package versions and changelogs',
  'packed manifests and tarball contents',
  'release branch is current with main and no newer Changesets remain',
  'one-day npm credential',
  'public metadata scan',
  'final publication approval',
  'trusted publisher configured for all five packages',
  'repository npm secret removed',
]) {
  assert.match(
    pullRequestBody,
    new RegExp(`^- \\[ \\] .*${checklistItem}`, 'imu'),
    `release checklist must leave ${checklistItem} unchecked`,
  )
}
assert.doesNotMatch(pullRequestBody, /\b(?:opened|generated) by\b/iu)
assert.match(pullRequestBody, /every pre-publication gate/iu)
assert.match(pullRequestBody, /post-bootstrap.*not a pre-merge gate/isu)

assert.match(launchRunbook, /validated generated-version commit.*fallback/isu)
assert.match(launchRunbook, /does not republish/iu)
assert.match(launchRunbook, /removes npm authentication.*before.*verifier/isu)
assert.match(launchRunbook, /original publication failure remains failed/iu)
assert.match(launchRunbook, /resolves.*HEAD\^1.*replays Changesets/isu)
assert.match(launchRunbook, /fails closed.*exact\s+generated-version commit/isu)
assert.match(launchRunbook, /action output.*diagnostic/isu)
assert.match(launchRunbook, /exact version plan.*checked-out\s+release commit/isu)
assert.match(
  launchRunbook,
  /verify-published-packages\.mjs --registry-evidence-only/u,
  'recovery must expose the strict registry-evidence verifier mode',
)
assert.match(
  launchRunbook,
  /Never overwrite, move, delete, or force-update an existing release tag/u,
  'recovery must preserve every existing release tag',
)
assert.match(
  launchRunbook,
  /Only a confirmed GitHub API HTTP 404 means a GitHub release is missing/u,
  'recovery must distinguish a missing release from transport and authorization failures',
)
assert.match(
  launchRunbook,
  /gh release create "\$tag"[\s\S]{0,240}--verify-tag[\s\S]{0,240}--notes-file "\$notes"/u,
  'recovery releases must reuse the verified tag and reviewed package changelog notes',
)
assert.ok(
  launchRunbook.indexOf('--registry-evidence-only') <
    launchRunbook.indexOf('gh api --method POST'),
  'registry evidence must pass before a missing Git tag is created',
)

console.log('Release metadata contract passed.')
