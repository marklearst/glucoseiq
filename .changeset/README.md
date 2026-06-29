# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).

## Record a release entry

When a pull request changes a public package, record the affected packages,
their independent semantic-version bumps, and a user-facing summary:

```bash
pnpm changeset
```

Commit the generated Markdown file with the package change. CI compares pull
requests with `origin/main` and main-branch pushes with the trusted pre-push
commit. It requires a non-README Changeset for release-affecting changes under
the six public package directories. Package README and documentation-only
changes are exempt. The generated `release/glucoseiq-packages` branch is also
exempt. When that branch is merged, the deleted Changeset is accepted only if
the push contains the exact generated manifest and matching changelog shape,
with no source or unrelated changes.

Run the policy locally with:

```bash
pnpm test:changesets
```

## Release flow

A main-branch push runs the quality suite in
`.github/workflows/release.yml`. Pending Changesets create or refresh a draft
release pull request. That candidate is checked out by its exact commit, built,
packed, and tested before its required check can pass.

Merging the reviewed release pull request starts publication only after the
same quality suite, the versioned-tarball matrix, and the live
`glucoseiq.dev` preflight pass. Registry verification runs after a real
publication and checks the published packages, metadata, tags, provenance,
entrypoints, declarations, React peers, CLI, and compatibility exports.

## npm authentication

The first public release uses a one-day, package-scoped npm credential stored
temporarily in the repository npm secret. After all six package pages exist,
configure each package's trusted publisher for this repository and
`release.yml`. In a reviewed change, remove token references from the workflow
and delete the repository npm secret before the OIDC verification release.
Retain the one-day credential only outside CI until that release succeeds or
the credential expires, then revoke it. Do not restore a long-lived
publication token.
