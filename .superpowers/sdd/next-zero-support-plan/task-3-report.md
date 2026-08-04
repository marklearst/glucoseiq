# Task 3 report

## Meaning-preservation checklist, before edits

- Merge this release-support pull request before beginning the prerelease flow.
- In a separate reviewed pull request, add `.changeset/pre.json` with the
  exact prerelease state and enter Changesets prerelease mode with the `next`
  tag. Do not add that file in this release-support pull request.
- The workflow-generated release pull request must contain the exact five
  `1.0.0-next.0` package candidates, with the matching changelogs, lockfile,
  and exact internal dependency ranges.
- Publish the five candidates under npm dist-tag `next`, not `latest`, with the
  existing Node, npm, public-access, OIDC, provenance, registry, tag, release,
  and consumer-verification requirements intact.
- Keep `launch-glucoseiq-one.md` in the generated candidate. `pre.json` records
  it as consumed so it cannot generate `next.1+`.
- Do not begin `next.1+`; use a later stable `1.0.0` promotion path instead.
- Preserve every exact command, package name, URL, identifier, credential rule,
  recovery limit, medical statement, and uncertainty outside the specific
  prerelease values that must change.

## Baseline scanner

`python3 /Users/mark/.codex/plugins/cache/one-more-pass-private/one-more-pass/1.0.0/skills/writing/scripts/scan.py --format json --fail-on never .changeset/README.md .github/release-pr-body.md docs/LAUNCH_RUNBOOK.md .changeset/launch-glucoseiq-one.md`

- Result: 0 findings, 0 notes, 0 warnings, 0 errors.
- Manual adjudication: no scanner findings required an editorial decision.

## Changes and meaning review

- `.changeset/README.md` now gives the exact prerelease sequence: merge release
  support, add the exact reviewed prerelease state in a separate pull request,
  review the five `1.0.0-next.0` candidates, publish under `next`, retain the
  consumed launch Changeset, and reserve stable `1.0.0` for a later path.
- `.github/release-pr-body.md` now identifies the exact candidate, npm tag, and
  consumed launch state that reviewers must confirm.
- `docs/LAUNCH_RUNBOOK.md` now distinguishes the release-support,
  prerelease-entry, and generated-candidate phases. Its tables, commands,
  registry checks, tag/release recovery, and immutable-artifact guidance use
  exact `1.0.0-next.0` prerelease values and block `next.1+`.
- `launch-glucoseiq-one.md` was reviewed and intentionally left unchanged. Its
  durable summary is reused by the later stable `1.0.0` promotion, so calling
  it a prerelease would make that later changelog misleading.
- All package names, medical statements, OIDC and provenance requirements,
  credential limits, URLs, recovery boundaries, and later stable path remain
  intact. No review-required prose span remains.

## Approved documentation-contract update

- RED: `mise exec node@24 -- pnpm test:docs` failed because
  `scripts/doc-snippet-contracts.test.mjs` required the old generated-candidate
  command `test ! -e .changeset/launch-glucoseiq-one.md`.
- Approved deviation: update only that runbook contract to require the three
  current phase headings, retained launch Markdown, exact `.changeset/pre.json`
  state, and exact `1.0.0-next.0` manifest and changelog checks.
- GREEN: the focused `node --test scripts/doc-snippet-contracts.test.mjs` and
  the full docs suite pass. No production code, manifest, changelog, workflow,
  or `.changeset/pre.json` was changed.

## Final scanner and verification

- Post-edit scanner: 0 findings, 0 notes, 0 warnings, 0 errors. Manual
  adjudication: no scanner findings required a change.
- `mise exec node@24 -- pnpm test:launch` passed, including release metadata.
- `mise exec node@24 -- node scripts/release-metadata.test.mjs` passed.
- `mise exec node@24 -- pnpm test:docs` passed.
- `mise exec node@24 -- pnpm lint` passed.
- `git diff --check` passed.
