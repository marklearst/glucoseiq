# Contributing

GlucoseIQ requires Node.js 24 or newer and pnpm 11.17.0. Install dependencies
from the repository root:

```bash
pnpm install --frozen-lockfile
```

Make focused changes and add tests for behavior you change. Use fixed synthetic
data in tests, examples, bug reports, and reproductions. Do not include real
health information, credentials, access tokens, or production records.

Add a Changeset when a change affects a published package:

```bash
pnpm changeset
```

Describe the public effect and choose the appropriate version bump for each
affected package. Repository documentation and package README updates do not
need a Changeset.

Run the full quality gate before requesting review:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test:release-safety
pnpm test:changesets
pnpm test:launch
pnpm test:size
pnpm test:coverage
pnpm test:errors
pnpm test:packages
pnpm test:docs
pnpm --filter docs test:api
pnpm --filter docs docs:api:check
pnpm --filter docs build
```

Use `pnpm test:packages:candidate` only after Changesets has generated release
candidates.
