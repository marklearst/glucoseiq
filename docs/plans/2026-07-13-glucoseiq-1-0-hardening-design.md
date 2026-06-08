# GlucoseIQ 1.0 Hardening Design

**Status:** Approved

**Goal:** Make the six-package GlucoseIQ 1.0 release as safe, predictable, and well verified as practical before publication.

## Scope

This quality pass covers the public runtime contracts, compatibility package, package documentation, Fumadocs content, generated API reference, continuous integration, release workflow, and launch verification.

The public package set remains:

- `@glucoseiq/core`
- `@glucoseiq/react`
- `@glucoseiq/tokens`
- `@glucoseiq/testing`
- `@glucoseiq/cli`
- `diabetic-utils`, as the compatibility bridge

No public package will be added for GlucoseIQ 1.0. A future package requires an independent dependency, runtime, security, or release boundary with enough value to justify another contract.

## Constraints

- Keep the release pull request in draft and do not merge or publish.
- Do not deploy, configure DNS, change repository settings, or create npm credentials during implementation.
- Preserve published Git history and all 107 exports from `diabetic-utils@1.5.0`.
- Preserve `@glucoseiq/core` subpaths for metrics, connectors, interoperability, and rendering.
- Require Node 24 or newer for each published package and retain React 18 or newer as the peer range.
- Keep ESM declarations on `.d.mts` and CommonJS declarations on `.d.ts`.
- Freeze the visual layer. Content structure, metadata, accessibility semantics, and documentation behavior remain in scope.
- Keep `packages/core/docs-md/` outside the change and do not inspect, delete, regenerate, stage, or commit it.
- Keep public Git metadata and repository content free of assistant attribution, generated-by trailers, task links, and tool-focused naming.

## Approach

The implementation follows a contract-first sequence. Each behavior change starts with a focused failing regression test. The implementation then makes the smallest complete change that satisfies the documented contract. Package and documentation work follows once the runtime contract is stable. CI and release checks finish the sequence so they enforce the corrected behavior.

Work happens in an isolated worktree on `fix/glucoseiq-1-0-hardening`. The branch starts from `b69ea3bb11a6490bd736f7666a047e8d64d96820`.

## Runtime contracts

### Finite option validation

Public APIs that use an interval, duration, or day count will reject non-finite and non-positive values before entering loops or calculating sample counts. Tests will cover zero, negative values, `NaN`, and both infinities. Error messages and codes will identify the invalid option.

### Time-in-range classification

Enhanced time-in-range will classify each finite reading exactly once through ordered comparisons. Unit-specific thresholds will match the public documentation. Tests will prove boundary behavior, reject invalid thresholds, and assert that category counts sum to the number of accepted readings. SVG rendering will reject or safely handle invalid input and will never emit `NaN` or `Infinity`.

### Input validity

Connector normalizers will share one reading-validity policy for timestamps, glucose values, and units. Strict APIs will throw a coded error at the invalid record. Safe APIs will return valid records and collect structured issues. Live helpers and renderers will reject invalid readings rather than describing `NaN` as an in-range value.

The token classifier will document its mg/dL input and reject non-finite or physiologically impossible values. This change preserves the existing zone names and color contract.

### CLI behavior

The CLI will accept a closed set of flags and units. It will reject unknown flags, missing flag values, invalid units, invalid time zones, unreadable input, and unwritable output with deterministic messages and nonzero exit codes. The top-level error boundary will cover argument parsing and output writes. Packed-tarball tests will execute failure paths through the published binary.

### Error contract

Intentional validation and parsing failures exported by core will use `GlucoseIQError` subclasses with stable codes. Existing message text will remain stable where consumers may already rely on it. Tests will cover the class, code, and message. Documentation will distinguish coded library failures from platform errors that can still originate in host I/O.

### Package behavior

The cohort median will average the middle pair for an even number of values. React’s root entry will retain its client boundary through the build, and documentation will direct server-only consumers to core. Public options that do not affect behavior will either gain their documented behavior or be removed before 1.0 when removal does not violate an established compatibility contract.

## Documentation contracts

Glucose-reading APIs and numeric-array APIs will have separate unit guarantees. APIs that receive `GlucoseReading[]` can normalize values carrying their own unit. APIs that receive `number[]` require one homogeneous series and the correct unit option where available.

The documentation will state the exact CSV shape accepted by the parser, the CLI’s supported flags and exits, the project-defined nature of the wellness score, and the difference between headless data contracts and optional SVG renderers. Strict TypeScript examples will narrow nullable report sections before use.

Each npm README will include installation, a typed example, runtime and unit constraints, failure behavior, a safety note where relevant, and absolute links to its package guide and API reference.

The Fumadocs information architecture will add package selection, safety and limitations, runtime support, integration testing, deployment, and maintainer launch guidance. The maintainer guide will describe credential steps without storing secrets. Canonical metadata, Open Graph metadata, `robots.txt`, and `sitemap.xml` will use the production domain while keeping preview deployments out of the canonical index.

## API reference generation

The generator will use a dedicated TypeDoc configuration that does not load the Markdown plugin. It will fail on TypeDoc warnings and type-checking errors, render difficult TypeScript nodes accurately, retain generics and readonly modifiers, include safety remarks and deprecation information, and clear temporary output before generation.

Representative snapshots will cover literal unions, type predicates, indexed access, readonly arrays, tuples, generics with defaults, nested object types, callable reflections, and referenced interoperability types. CI will generate into a temporary directory and compare the result with committed MDX so stale or hand-edited API pages fail the build.

The generated reference will live under `/docs/api/core` and identify itself as the `@glucoseiq/core` API. The top-level API index will remain hand-written. React, tokens, testing, and CLI will receive package-specific reference pages based on their public declarations and command contract.

## CI and release safety

The root workspace will expose explicit lint and typecheck commands. CI and release verification will run them with the build, 100 percent coverage, packed consumers, documentation build, API drift check, and launch metadata tests.

The core size check will bundle the reachable production entry graph and gzip that artifact. The 20,000-byte limit will apply to the actual bundle rather than the split entry stub. Source maps and declaration files will remain outside the measurement.

The release workflow will separate read-only verification from the narrow job that creates a release pull request or publishes. Checkout will not persist credentials. Each job will receive the minimum GitHub and OIDC permissions it needs.

The release pull request template will contain human gates for the domain, documentation, package versions, changelogs, packed manifests, temporary bootstrap credential, and publication approval. Publication will run a domain preflight and a complete registry verification. The post-publication check will verify all six versions, dist-tags, dependency ranges, tarballs, provenance metadata, GitHub tags and releases, the CLI executable, and clean consumer installations. A recovery section will explain how to retry missing publications without unpublishing a successful package.

## Verification and review

Each task records red and green test evidence. A focused review checks every task against its requirements and code quality. A final independent review examines the full branch.

The completion audit will rerun these gates from a clean state on Node 24:

- frozen pnpm installation
- lint and typecheck
- all package and documentation builds
- 100 percent statement, branch, function, and line coverage
- core bundle budget
- API generation drift check
- packed ESM, CommonJS, NodeNext, and Bundler consumers
- React 18 and React 19 installations
- CLI success and failure execution from its tarball
- all 107 compatibility exports
- launch Changeset and release metadata checks
- documentation routes, metadata, search, and link checks
- prohibited public-metadata scan
- clean tracked worktree and index

The branch will remain unmerged after the final review. Domain registration, Vercel production configuration, npm bootstrap publication, trusted-publisher setup, repository metadata updates, and the post-launch folder rename remain manual launch gates.
