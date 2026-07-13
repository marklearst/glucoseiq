# GlucoseIQ 1.0 Launch Runbook

This runbook executes the approved two-gate launch without rewriting published
history:

1. merge the transition pull request, deploy the documentation, and make
   `glucoseiq.health` canonical; then
2. review and merge the generated release pull request to publish the package
   family.

Stop at any failed check. Do not publish around a failed workflow, replace an
already published artifact, rewrite `main`, or delete a successful registry
version.

## Release contract

The first coordinated publication is:

| Package | Version | npm tag |
| --- | ---: | --- |
| `@glucoseiq/core` | `1.0.0` | `latest` |
| `@glucoseiq/react` | `1.0.0` | `latest` |
| `@glucoseiq/tokens` | `1.0.0` | `latest` |
| `@glucoseiq/testing` | `1.0.0` | `latest` |
| `@glucoseiq/cli` | `1.0.0` | `latest` |
| `diabetic-utils` | `2.0.0` | `latest` |
| `diabetic-utils` | `1.5.0` | `legacy` |

Do not deprecate `diabetic-utils@1.5.0`. The 2.0 package is the compatibility
bridge and must retain all 107 legacy exports.

## Part A: Machine-checked commands

Run this section against the exact transition or release-candidate commit being
approved. Save the workflow URL and command output with the launch record.
The command blocks require Bash and fail fast. Do not paste them into zsh. Run
every command block in the same Bash shell during one candidate review so the
prohibited-term value entered in A1 remains available to A4.

### A1. Confirm repository identity and a clean candidate

```bash
set -euo pipefail

git remote -v
git branch --show-current
git status --short
test -z "$(git status --porcelain)"
git log --oneline --decorate origin/main..HEAD
git diff --check
git diff --cached --check
```

Expected before a merge or release approval:

- the primary remote is `marklearst/glucoseiq`;
- the branch and Git metadata are project-focused;
- the candidate contains no unrelated or protected legacy-worktree files;
- the final committed worktree is clean; and
- no whitespace diagnostics are printed.

Scan the branch name, current public files, every unpublished commit tree, and
unpublished commit metadata for the project's prohibited attribution term.
Ignored build maps are scanned after the build in A4. Read `FORBIDDEN_TERM`
without writing its value into a file or shell history:

```bash
set -euo pipefail

printf 'Prohibited term: ' > /dev/tty
IFS= read -r -s FORBIDDEN_TERM < /dev/tty
printf '\n' > /dev/tty
test -n "${FORBIDDEN_TERM:-}"

found=0
branch_name=$(git branch --show-current)
if rg -n -i --fixed-strings -- "$FORBIDDEN_TERM" <<<"$branch_name"; then
  found=1
fi

while IFS= read -r -d '' file; do
  case "$file" in
    packages/core/docs-md/*) continue ;;
  esac
  if rg -n -i --fixed-strings -- "$FORBIDDEN_TERM" "$file"; then
    found=1
  fi
done < <(git ls-files -co --exclude-standard -z)

while IFS= read -r commit; do
  if git grep -I -n -i --fixed-strings "$FORBIDDEN_TERM" "$commit" \
    -- . ':(exclude)packages/core/docs-md/**'; then
    found=1
  fi
done < <(git rev-list origin/main..HEAD)

if [ "$found" -ne 0 ]; then
  echo "Prohibited attribution found in the branch or a public file tree" >&2
  exit 1
fi

git_metadata=$(git log origin/main..HEAD \
  --format='%H%n%B%n%an%n%ae%n%cn%n%ce')
if rg -n -i --fixed-strings -- "$FORBIDDEN_TERM" <<<"$git_metadata"; then
  echo "Prohibited unpublished Git metadata found" >&2
  exit 1
fi

commit_bodies=$(git log origin/main..HEAD --format='%B')
if rg -n -i 'co-authored-by|generated-by|task[ -]?link|tool attribution' \
  <<<"$commit_bodies"; then
  echo "Non-project Git trailer or attribution found" >&2
  exit 1
fi
```

No matching line is the passing result. Review the human-written pull-request
body separately because it is not stored in the worktree.

### A2. Confirm the pinned toolchain and lockfile

```bash
set -euo pipefail

test "$(node -p 'process.versions.node.split(".")[0]')" = "24"
test "$(pnpm --version)" = "11.12.0"
test "$(npm --version)" = "11.17.0"
pnpm install --frozen-lockfile
```

The launch toolchain is Node 24, pnpm 11.12.0, and npm 11.17.0 in release CI.
The frozen install must finish without changing `pnpm-lock.yaml`.

### A3. Confirm the release state for the current phase

The transition candidate and generated release pull request have intentionally
different Changesets state. Run only the matching block.

#### Transition candidate

```bash
set -euo pipefail

test -e .changeset/launch-glucoseiq-one.md
pnpm changeset status
pnpm test:launch
```

The status must predict exactly five scoped `1.0.0` releases and
`diabetic-utils@2.0.0`, each from a major launch entry. Versioning remains
independent after this coordinated release.

#### Generated release pull request

The versioning workflow consumes the launch Changeset. Do not require
`pnpm changeset status` to repeat the prediction on this branch. Verify the
consumed state, exact manifests, changelogs, and release policy instead:

```bash
set -euo pipefail

test ! -e .changeset/launch-glucoseiq-one.md
pnpm test:launch

for package in core react tokens testing cli; do
  test "$(jq -r .version "packages/$package/package.json")" = "1.0.0"
  rg -n '^## 1\.0\.0$' "packages/$package/CHANGELOG.md"
done

test "$(jq -r .version packages/diabetic-utils/package.json)" = "2.0.0"
rg -n '^## 2\.0\.0$' packages/diabetic-utils/CHANGELOG.md
```

### A4. Run the durable quality gates

```bash
set -euo pipefail

pnpm build
pnpm lint
pnpm typecheck
pnpm test:size
pnpm test:coverage
pnpm test:errors
pnpm test:packages
pnpm test:docs
pnpm --filter docs build
```

Required evidence:

- build, lint, and strict type checks pass on Node 24;
- every reachable production core ESM chunk is counted once and remains within
  the 20,000-byte gzip budget;
- package coverage remains 100 percent;
- the core intentional-error contract passes;
- six tarballs and ten public entrypoints pass clean-consumer tests;
- ESM, CommonJS, NodeNext, Bundler, React 18, React 19, CLI, and the 107-export
  compatibility checks pass; and
- documentation contracts, compiled examples, generated API drift, and the
  production documentation build pass.

The build creates ignored source maps that enter package tarballs. In the same
shell where `FORBIDDEN_TERM` was set in A1, require at least one map and scan all
of them for the prohibited term and local absolute developer paths:

```bash
set -euo pipefail

test -n "${FORBIDDEN_TERM:-}"
map_count=0
found=0

while IFS= read -r -d '' file; do
  map_count=$((map_count + 1))
  if rg -n -i --fixed-strings -- "$FORBIDDEN_TERM" "$file"; then
    found=1
  fi
  if rg -n '(/Users/[^/]+/|/home/[^/]+/|[A-Za-z]:\\Users\\)' "$file"; then
    found=1
  fi
done < <(find packages -path '*/dist/*.map' -type f -print0)

test "$map_count" -gt 0
test "$found" -eq 0
```

### A5. Inspect packed manifests and contents

`pnpm test:packages` is the authoritative local matrix. In addition, review its
tarball inventory before approving the release pull request:

```bash
set -euo pipefail

for manifest in packages/{core,react,tokens,testing,cli,diabetic-utils}/package.json; do
  jq '{name,version,engines,exports,bin,peerDependencies,dependencies,publishConfig}' "$manifest"
done
```

The packed dependents must resolve core as `^1.0.0`; scoped packages must be
public; ESM types must route to `.d.mts`; CommonJS types must route to `.d.ts`;
and package READMEs must contain only files and links valid inside a tarball.

## Part B: Unchecked human and external gates

These boxes require a maintainer, GitHub, Vercel, the registrar, or npm. Local
tests cannot mark them complete.

### B1. Transition pull request and GitHub controls

- [ ] The transition pull request title is
      `feat: launch the GlucoseIQ 1.0 monorepo`.
- [ ] Its title, body, commits, trailers, branch name, and changed files contain
      no tool attribution, generated-by marker, task link, or prohibited term.
- [ ] The pull request contains the intended Fumadocs, compatibility, package,
      CI, and release infrastructure and no protected legacy-worktree content.
- [ ] GitHub Actions is allowed to create and update pull requests.
- [ ] An active `main` ruleset requires the uniquely named
      `Build & test (Node 24)` check, blocks force pushes, and restricts branch
      deletion. GitHub documents these controls in
      [available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).
- [ ] The required check passes on the exact transition head SHA.

Do not merge the transition pull request until its Vercel preview also passes.

### B2. Vercel preview and production

- [ ] Create the Vercel project `glucoseiq` from `marklearst/glucoseiq`.
- [ ] Set root directory `apps/docs`.
- [ ] Select Next.js and Node 24.x.
- [ ] Set the build command to
      `cd ../.. && turbo run build --filter=docs`.
- [ ] Leave installation on automatic pnpm workspace detection.
- [ ] Open the transition pull-request preview and verify navigation, search,
      API pages, migration, safety, runtime, deployment, HTTPS, direct routes,
      canonical metadata, preview `noindex`, robots, and sitemap behavior.
- [ ] Merge the transition pull request only after the preview and required
      GitHub check pass.
- [ ] Confirm the production deployment for that merge succeeds before adding
      or moving the public domain.

The monorepo setup follows Vercel's
[Turborepo deployment guidance](https://vercel.com/docs/monorepos/turborepo).

### B3. Registrar and custom domain

- [ ] Confirm the registrar reports `glucoseiq.health` as active. Do this before
      changing DNS.
- [ ] Add `glucoseiq.health` to the Vercel project and make it the canonical
      production domain.
- [ ] Add `www.glucoseiq.health` and configure it to redirect to the apex.
- [ ] Ask Vercel to inspect both names and copy the exact A, CNAME, TXT, or
      nameserver values it reports for this project.
- [ ] Enter those exact values at the active DNS provider. Do not copy a generic
      IP address or example CNAME from documentation.
- [ ] Wait for Vercel to report both domains configured and for its certificate
      to be issued.

Vercel's [custom-domain setup](https://vercel.com/docs/domains/set-up-custom-domain)
explains why project-specific inspection is authoritative.

After propagation, capture fresh evidence:

```bash
set -euo pipefail

dig +short A glucoseiq.health
dig +short CNAME www.glucoseiq.health
curl -fsSIL https://glucoseiq.health/
curl -fsSIL https://www.glucoseiq.health/
curl -fsS https://glucoseiq.health/robots.txt
curl -fsS https://glucoseiq.health/sitemap.xml
curl -fsS https://glucoseiq.health/docs/migration >/dev/null
curl -fsS https://glucoseiq.health/docs/api/core >/dev/null
```

- [ ] The apex serves the production documentation over HTTPS.
- [ ] `www` redirects to the apex without a redirect loop.
- [ ] Canonicals use `https://glucoseiq.health` and production is indexable.
- [ ] Navigation, search, links, and every documented route work on the apex.

### B4. Retire the stale site and update repository metadata

Only after the Vercel apex is healthy:

- [ ] Disable the stale GitHub Pages deployment. GitHub documents the `None`
      publishing source in
      [Deleting a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/deleting-a-github-pages-site).
- [ ] Confirm the Pages URL no longer competes with the canonical production
      site.
- [ ] Set the repository homepage to `https://glucoseiq.health`.
- [ ] Set a concise repository description that identifies GlucoseIQ as a
      headless TypeScript toolkit for glucose-data applications.
- [ ] Review public topics such as `typescript`, `diabetes`, `cgm`, `glucose`,
      `headless`, `react`, and `data-visualization`; keep only accurate topics.
- [ ] Confirm the repository remains public so npm provenance can link its
      source commit and workflow.

GitHub's [topic guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)
describes the public discovery metadata.

### B5. Review the generated release pull request

- [ ] The release pull request title is
      `chore(release): version packages`.
- [ ] The release branch is `release/glucoseiq-packages`.
- [ ] The pull request contains five `1.0.0` manifests and one `2.0.0`
      compatibility manifest, correct changelogs, and the updated lockfile.
- [ ] The release body and commits remain project-focused and contain no tool
      attribution, generated trailer, task link, or prohibited term.
- [ ] Re-run Part A against the exact versioned release head SHA.
- [ ] Inspect the packed manifests, package contents, documentation, and
      migration text from that SHA.
- [ ] Confirm `glucoseiq.health` is still healthy and canonical.

Do not merge the release pull request until the bootstrap credential in B6 is
ready and every box above is complete.

### B6. Create the one-day npm bootstrap credential

Immediately before merging the release pull request:

- [ ] On npmjs.com, create a new granular access token with a one-day expiry.
- [ ] Grant read/write package access only to the `@glucoseiq` scope and
      `diabetic-utils`.
- [ ] Enable bypass 2FA for this short-lived bootstrap publish.
- [ ] Grant no unrelated package or organization access.
- [ ] Copy the token once and replace the stale GitHub Actions `NPM_TOKEN`
      repository secret without printing it in a command, log, issue, or pull
      request.
- [ ] Record the token's npm identifier and expiry, but never its value.

npm documents one-day expiry, package/scope selection, read/write permission,
and bypass 2FA in
[Creating and viewing access tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens/).

The scoped manifests already specify public access. First publication must
still use the public contract described in
[Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).

### B7. Bootstrap publication

- [ ] Merge the reviewed release pull request.
- [ ] Observe the GitHub-hosted `release.yml` run for the exact merge SHA.
- [ ] Confirm it uses Node 24, pnpm 11.12.0, npm 11.17.0, public access, and
      provenance.
- [ ] Do not start a separate manual publication while the workflow is running.
- [ ] If any package fails, stop and use Partial-publication recovery below.
- [ ] Confirm `diabetic-utils` tags are `latest=2.0.0` and `legacy=1.5.0`.

## Part C: Registry, provenance, tag, and consumer verification

Registry propagation can lag. Poll until the launch verifier succeeds or the
documented timeout expires; do not interpret one transient 404 as permission
to publish a second way.

### C1. Inventory exact registry versions

```bash
set -euo pipefail

expected=(
  '@glucoseiq/core@1.0.0'
  '@glucoseiq/react@1.0.0'
  '@glucoseiq/tokens@1.0.0'
  '@glucoseiq/testing@1.0.0'
  '@glucoseiq/cli@1.0.0'
  'diabetic-utils@2.0.0'
)

for spec in "${expected[@]}"; do
  printf '\n%s\n' "$spec"
  npm view "$spec" version engines exports bin peerDependencies dependencies dist --json
done

npm view diabetic-utils dist-tags --json
```

Verify that no registry dependency contains `workspace:`, every scoped package
is public, core-dependent packages use `@glucoseiq/core:^1.0.0`, and the React
peer remains `>=18`.

### C2. Verify provenance and signatures

- [ ] Each of the six npm package pages shows provenance for the intended
      source commit and `.github/workflows/release.yml` run.
- [ ] The repository, commit, workflow, and transparency-log links resolve.
- [ ] A clean install passes npm's signature and provenance audit.

```bash
set -euo pipefail

tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
npm --prefix "$tmp" init -y
npm --prefix "$tmp" install --ignore-scripts \
  @glucoseiq/core@1.0.0 \
  @glucoseiq/react@1.0.0 \
  @glucoseiq/tokens@1.0.0 \
  @glucoseiq/testing@1.0.0 \
  @glucoseiq/cli@1.0.0 \
  diabetic-utils@2.0.0 \
  react@19 \
  react-dom@19
npm --prefix "$tmp" audit signatures
```

See npm's [package provenance verification](https://docs.npmjs.com/viewing-package-provenance/).

### C3. Verify tags, releases, tarballs, and consumers

```bash
set -euo pipefail

git fetch --tags origin
git tag --list '*1.0.0' '*2.0.0'
gh release list --repo marklearst/glucoseiq --limit 20
npm exec --yes --package=@glucoseiq/cli@1.0.0 -- glucoseiq --help
```

- [ ] Git tags and GitHub releases exist for all six versions.
- [ ] Registry tarballs contain the expected READMEs, licenses, manifests,
      runtime files, declarations, executable, and source maps.
- [ ] Source maps contain no local absolute paths or prohibited attribution.
- [ ] Clean ESM and CommonJS consumers load all ten entrypoints.
- [ ] Strict NodeNext and Bundler consumers resolve the matching declarations.
- [ ] React 18 and React 19 consumers install without peer errors.
- [ ] The CLI succeeds for valid input and exits 1 with one safe diagnostic for
      invalid input.
- [ ] The compatibility package exposes all 107 legacy exports.

## Part D: Migrate each package to npm trusted publishing

Trusted publishing can be configured only after each package page exists. Do
this separately for all six packages:

- [ ] `@glucoseiq/core`
- [ ] `@glucoseiq/react`
- [ ] `@glucoseiq/tokens`
- [ ] `@glucoseiq/testing`
- [ ] `@glucoseiq/cli`
- [ ] `diabetic-utils`

Use the same trusted-publisher fields on each npm package:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Owner or organization | `marklearst` |
| Repository | `glucoseiq` |
| Workflow filename | `release.yml` |
| Environment | Leave blank |
| Allowed action | `npm publish` |

The workflow must run on GitHub-hosted runners and grant `id-token: write`.
The filename is entered without `.github/workflows/`. npm 11.5.1 or newer is
required; release CI pins npm 11.17.0.

npm's [trusted-publisher guide](https://docs.npmjs.com/trusted-publishers/)
documents the GitHub fields, allowed action, OIDC requirements, and automatic
provenance for public packages from public repositories.

After all six publishers are configured:

- [ ] Remove every workflow reference to `NPM_TOKEN` in a reviewed change,
      including any `NODE_AUTH_TOKEN` value sourced from that secret. Confirm
      the publish job has `id-token: write` and no token-auth fallback.
- [ ] Retain the one-day token only in secure credential storage outside GitHub,
      the repository, and the release workflow until OIDC succeeds or it
      expires. It must not be available to the verification job.
- [ ] Delete the GitHub repository secret before the OIDC verification release.
- [ ] Run the next legitimate OIDC release and verify the package, source SHA,
      workflow, transparency-log entry, and provenance. A provenance badge by
      itself is not sufficient evidence when a token fallback is possible.
- [ ] If that release fails authentication, diagnose the trusted-publisher
      configuration. Do not add a token to the running job or publish locally.
- [ ] Revoke the retained one-day token after OIDC succeeds. If it expires first,
      confirm the npm token record is no longer active.
- [ ] On every package, select **Require two-factor authentication and disallow
      tokens** under publishing access.
- [ ] Confirm the next OIDC release still succeeds after token publishing is
      disabled.

Do not disallow tokens before the bootstrap publish and token-free OIDC
verification are complete. npm explains the final package setting in
[Requiring 2FA for publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/).

## Partial-publication recovery

Use this procedure when the workflow publishes some, but not all, expected
versions.

### 1. Freeze and inventory

Do not merge another release, run a local publish, change dist-tags, or delete
anything until the registry state is written down.
Poll a registry 404 for up to ten minutes to allow propagation. Only a confirmed
E404 after that window means missing. Authentication, network, timeout, and 5xx
failures abort the inventory instead of authorizing a retry.

```bash
set -euo pipefail

registry='https://registry.npmjs.org'
propagation_seconds=600
expected=(
  '@glucoseiq/core@1.0.0'
  '@glucoseiq/react@1.0.0'
  '@glucoseiq/tokens@1.0.0'
  '@glucoseiq/testing@1.0.0'
  '@glucoseiq/cli@1.0.0'
  'diabetic-utils@2.0.0'
)

npm ping --registry "$registry" >/dev/null

for spec in "${expected[@]}"; do
  deadline=$((SECONDS + propagation_seconds))

  while true; do
    if result=$(npm view "$spec" version --registry "$registry" 2>&1); then
      printf 'PUBLISHED %s %s\n' "$spec" "$result"
      break
    fi

    if ! rg -q '(^|[^[:alnum:]])E404([^[:alnum:]]|$)|404 Not Found' \
      <<<"$result"; then
      printf 'Unexpected registry failure for %s:\n%s\n' "$spec" "$result" >&2
      exit 1
    fi

    if [ "$SECONDS" -ge "$deadline" ]; then
      printf '%s\n' "$result" >&2
      printf 'MISSING   %s (confirmed E404 after the propagation window)\n' "$spec"
      break
    fi

    sleep 10
  done
done

npm view diabetic-utils dist-tags --json --registry "$registry"
gh run view RUN_ID --repo marklearst/glucoseiq --log-failed
```

Record the workflow run ID, source SHA, packages confirmed published, packages
missing, dist-tags, failure log, and credential state.

### 2. Preserve every successful publication

Never unpublish a successful package to make the set look atomic. Registry
versions are immutable and an unpublished `package@version` cannot be reused.
npm's [unpublish policy](https://docs.npmjs.com/policies/unpublish/) explains
the ecosystem and version consequences.

Do not republish a package that `npm view` confirms. Do not create a new
version merely because another package is still propagating.

### 3. Retry only missing versions through the approved workflow

After correcting the verified cause, rerun the failed GitHub-hosted publish job
for the same approved source SHA:

```bash
set -euo pipefail

gh run rerun RUN_ID --repo marklearst/glucoseiq --failed
```

Changesets should skip versions already present and publish only missing
versions. Observe the run and repeat the registry inventory before changing a
dist-tag. If the bootstrap token expired, create another equally narrow
one-day token or finish the trusted-publisher setup for packages that already
exist; do not broaden credentials.

### 4. Correct tags without republishing artifacts

If all artifacts are correct and only a dist-tag is wrong, update that tag with
maintainer 2FA or the still-authorized release path, then verify it:

```bash
set -euo pipefail

npm dist-tag add diabetic-utils@1.5.0 legacy
npm dist-tag add diabetic-utils@2.0.0 latest
npm view diabetic-utils dist-tags --json
```

Do not use a dist-tag change to hide a bad tarball.

### 5. Patch a bad immutable artifact

If a published tarball, manifest, declaration, executable, or runtime is bad:

1. leave the published version in place;
2. fix the source with a focused regression test;
3. add a patch Changeset for every package whose own artifact or dependency
   contract changes;
4. run the complete candidate suite and inspect new tarballs;
5. publish the corrective patch, such as `1.0.1` or `2.0.1`, through the
   approved workflow; and
6. move `latest` only after the patch verifies.

If the bad version needs a warning, deprecate that version only after the
replacement exists and document the exact upgrade. Missing provenance cannot
be attached to an immutable published version; correct the workflow and ship a
verified patch.

Finish recovery by rerunning Parts C and D and recording the incident, root
cause, affected versions, corrective release, and final registry state.

## Rename the local folder last

Do not rename the original checkout until the worktree is clean and the domain,
documentation, packages, dist-tags, provenance, tags, releases, and clean
consumer installs are verified.

From the existing checkout:

```bash
set -euo pipefail

cd /Users/mark/Developer/oss/diabetic-utils
test -z "$(git status --porcelain)"
test "$(git worktree list --porcelain | rg -c '^worktree ')" -eq 1
cd /Users/mark/Developer/oss
test -d diabetic-utils
test ! -e glucoseiq
mv -- diabetic-utils glucoseiq
cd glucoseiq

git status --short
git remote -v
git branch -vv
```

Inspect the remote names before removing anything. Remove only the redundant
legacy remote, retain `origin` for `marklearst/glucoseiq`, and track
`origin/main`:

```bash
set -euo pipefail

git remote remove LEGACY_REMOTE_NAME
git fetch --prune --tags origin
git switch main
test "$(git branch --show-current)" = "main"
git branch --set-upstream-to=origin/main main
git merge --ff-only origin/main
pnpm install --force
pnpm build
pnpm typecheck
pnpm lint
pnpm test:size
pnpm test:coverage
pnpm test:errors
pnpm test:packages
pnpm test:docs
pnpm test:launch
pnpm --filter docs build
test -z "$(git status --porcelain)"
```

The final `git status --short` must be empty. If an editor or workspace still
points at the old path, update it only after these commands pass.
