# GlucoseIQ 1.0 Hardening Implementation Plan

**Goal:** Correct the known runtime, package, documentation, CI, and release-safety defects before the six-package 1.0 launch.

**Architecture:** Stabilize public contracts before documentation and automation. Each behavior change begins with a focused failing test, receives a minimal implementation, and passes a task-level review before the next task starts. The final release workflow enforces the same package and documentation contracts verified locally.

**Tech stack:** TypeScript, Node 24, pnpm 11.12.0, Turborepo, Vitest, tsup, TypeDoc, Next.js 16, Fumadocs, Changesets, GitHub Actions, and npm provenance.

## Global constraints

- Work on `fix/glucoseiq-1-0-hardening` from `b69ea3bb11a6490bd736f7666a047e8d64d96820`.
- Do not merge, publish, deploy, configure DNS, change repository settings, or create credentials.
- Keep the public package set at five `@glucoseiq/*` packages plus the `diabetic-utils` compatibility bridge.
- Preserve all 107 `diabetic-utils@1.5.0` runtime exports.
- Preserve the core root and `/metrics`, `/connectors`, `/interop`, and `/render` entrypoints.
- Require Node `>=24` in every published package and React `>=18` in the React peer range.
- Route ESM declarations to `.d.mts` and CommonJS declarations to `.d.ts`.
- Keep `@glucoseiq/core` free of runtime dependencies.
- Freeze the visual layer. Content, metadata, semantics, and documentation behavior remain in scope.
- Do not inspect, delete, regenerate, stage, or commit `packages/core/docs-md/`.
- Keep branch names, commits, pull requests, source, packages, releases, and public documentation free of assistant attribution, generated-by trailers, task links, and tool-focused naming.
- Use project-focused commit subjects and no commit trailers.

## Baseline evidence

The isolated worktree started clean. These commands passed before implementation:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:coverage
pnpm test:packages
pnpm test:launch
```

The baseline contains 546 passing tests with 100 percent coverage, six packed tarballs, ten public entrypoints, React 18 and React 19 consumers, and 107 compatibility exports.

---

### Task 1: Complete the coded core error contract

**Files:**

- Modify: `packages/core/src/errors.ts`
- Modify: `packages/core/src/a1c.ts`
- Modify: `packages/core/src/alignment.ts`
- Modify: `packages/core/src/conversions.ts`
- Modify: `packages/core/src/formatters.ts`
- Modify: `packages/core/src/connectors/nightscout.ts`
- Modify: `packages/core/tests/errors.test.ts`
- Create: `scripts/check-core-error-contract.mjs`
- Modify: `package.json`

**Interfaces:**

- Preserve `GlucoseIQError`, `DomainError`, `ParseError`, `EmptyDatasetError`, and `TimestampError`.
- Preserve every existing error message.
- Map A1C, glucose, insulin, unit, timezone, option, parse, and timestamp failures to the existing `GlucoseIQErrorCode` union.

- [ ] **Step 1: Add failing table-driven error tests**

Expand `packages/core/tests/errors.test.ts` so each case asserts the subclass, code, and exact message. The table must cover these mappings:

| Public call | Subclass | Code | Exact message |
| --- | --- | --- | --- |
| `a1cDelta(-1, 6)` | `DomainError` | `INVALID_A1C_VALUE` | `Invalid A1C value` |
| `estimateEAG(-1)` | `DomainError` | `INVALID_A1C_VALUE` | `A1C must be positive` |
| `calculateHOMAIR(-1, 5)` | `DomainError` | `INVALID_GLUCOSE_VALUE` | `Invalid fasting glucose value (must be a positive number in mg/dL)` |
| `calculateHOMAIR(100, -1)` | `DomainError` | `INVALID_INSULIN_VALUE` | `Invalid fasting insulin value (must be a positive number in µIU/mL)` |
| `checkGlycemicAlignment(-1, 100, 5)` | `DomainError` | `INVALID_A1C_VALUE` | `Invalid A1C value (must be a positive number < 20%)` |
| `estimateGMI(100)` | `DomainError` | `INVALID_UNIT` | `Unit is required when input is a number.` |
| `estimateGMI(100, 'other' as never)` | `DomainError` | `INVALID_UNIT` | `Unsupported glucose unit: other` |
| `estimateGMI(0, 'mg/dL')` | `DomainError` | `INVALID_GLUCOSE_VALUE` | `Glucose value must be a positive number.` |
| `mgDlToMmolL(0)` | `DomainError` | `INVALID_GLUCOSE_VALUE` | `Invalid glucose value` |
| `mmolLToMgDl(0)` | `DomainError` | `INVALID_GLUCOSE_VALUE` | `Invalid glucose value` |
| `convertGlucoseUnit({ value: 0, unit: 'mg/dL' })` | `DomainError` | `INVALID_GLUCOSE_VALUE` | `Invalid glucose value` |
| `convertGlucoseUnit({ value: 100, unit: 'other' as never })` | `DomainError` | `INVALID_UNIT` | `Invalid unit` |
| `formatDate('bad')` | `TimestampError` | `TIMESTAMP_UNPARSEABLE` | `Invalid ISO timestamp` |
| `normalizeNightscoutEntry()` with invalid date fields | `TimestampError` | `TIMESTAMP_UNPARSEABLE` | preserve the existing field-specific message |

Use a helper with this shape:

```ts
function expectCodedError(
  call: () => unknown,
  expected: {
    type: new (...args: never[]) => GlucoseIQError
    code: GlucoseIQErrorCode
    message: string
  },
): void {
  try {
    call()
    throw new Error('Expected call to throw')
  } catch (error) {
    expect(error).toBeInstanceOf(expected.type)
    expect(error).toMatchObject({ code: expected.code, message: expected.message })
  }
}
```

- [ ] **Step 2: Run the focused test and confirm the expected red state**

Run:

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/errors.test.ts
```

Expected: the new cases fail because the functions still throw built-in `Error` or `RangeError` objects without codes.

- [ ] **Step 3: Replace each intentional built-in throw**

Import `DomainError` or `TimestampError` at each call site and use these exact constructions:

```ts
throw new DomainError(message, 'INVALID_A1C_VALUE')
throw new DomainError(message, 'INVALID_GLUCOSE_VALUE')
throw new DomainError(message, 'INVALID_INSULIN_VALUE')
throw new DomainError(message, 'INVALID_UNIT')
throw new DomainError(message, 'INVALID_TIMEZONE')
throw new TimestampError(message)
```

Wrap the `Intl` timezone failure in `formatDate` while retaining its platform message:

```ts
try {
  return new Date(iso).toLocaleString('en-US', options)
} catch (error) {
  if (error instanceof RangeError) {
    throw new DomainError(error.message, 'INVALID_TIMEZONE')
  }
  throw error
}
```

Check `Date#getTime()` before every `toISOString()` call so an out-of-range vendor epoch becomes `TimestampError` instead of a built-in `RangeError`.

- [ ] **Step 4: Add the static source contract**

Create `scripts/check-core-error-contract.mjs` to recursively scan `packages/core/src/**/*.ts` and fail when this expression matches executable source:

```js
/throw\s+new\s+(?:Error|RangeError|TypeError)\s*\(/
```

Add `test:errors` to the root scripts:

```json
"test:errors": "node scripts/check-core-error-contract.mjs"
```

- [ ] **Step 5: Verify the green state**

Run:

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/errors.test.ts
pnpm test:errors
```

Expected: all focused tests pass and the static scan reports zero built-in intentional throws.

- [ ] **Step 6: Commit the task**

```sh
git add package.json scripts/check-core-error-contract.mjs packages/core/src packages/core/tests/errors.test.ts
git commit -m "fix: standardize core error contracts"
```

---

### Task 2: Bound grid alignment and generated test data

**Files:**

- Modify: `packages/core/src/align.ts`
- Modify: `packages/core/tests/align.test.ts`
- Modify: `packages/testing/src/index.ts`
- Modify: `packages/testing/tests/testing.test.ts`

**Interfaces:**

- `alignToGrid` throws `DomainError` with `INVALID_OPTION` for invalid options.
- `generateCGMSeries` throws `RangeError` with a stable option-specific message.
- Both APIs cap generated output at 100,000 points.

- [ ] **Step 1: Add safe failing alignment tests**

Add tests for `intervalMin` values `0`, `NaN`, and `Infinity`, plus `maxInterpolateGapMin` values `-1`, `NaN`, and `Infinity`. Assert `DomainError` and `INVALID_OPTION`. Do not execute `intervalMin: -5` until validation exists because the baseline loop does not terminate.

- [ ] **Step 2: Run the alignment red test**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/align.test.ts
```

Expected: the option assertions fail without hanging.

- [ ] **Step 3: Validate before grid arithmetic**

Add:

```ts
const MAX_GRID_POINTS = 100_000

function assertFiniteOption(name: string, value: number, allowZero = false): void {
  const valid = Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)
  if (!valid) {
    throw new DomainError(`${name} must be ${allowZero ? 'non-negative' : 'positive'} and finite`, 'INVALID_OPTION')
  }
}
```

Calculate `slotCount` once, reject counts above `MAX_GRID_POINTS`, and iterate by integer index:

```ts
const slotCount = Math.floor((endSlot - startSlot) / intervalMs) + 1
if (!Number.isSafeInteger(slotCount) || slotCount > MAX_GRID_POINTS) {
  throw new DomainError(`alignToGrid would create more than ${MAX_GRID_POINTS} grid points`, 'INVALID_OPTION')
}
for (let index = 0; index < slotCount; index++) {
  const slotMs = startSlot + index * intervalMs
  // existing slot logic
}
```

Add the `-5` regression after the guard exists and confirm it throws.

- [ ] **Step 4: Add safe failing generator tests**

Before adding validation, use inputs that return or throw promptly: `days: 0`, `days: 1.5`, `intervalMin: NaN`, invalid `start`, invalid unit, non-finite seed, non-positive basal, negative noise, negative meal amplitude, invalid meal time, and negative nocturnal-hypo day. Assert stable messages naming each option.

- [ ] **Step 5: Run the generator red test**

```sh
pnpm --filter @glucoseiq/testing exec vitest run tests/testing.test.ts
```

Expected: the new option contract fails under the permissive baseline implementation.

- [ ] **Step 6: Validate the complete generator input**

Add `MAX_GENERATED_READINGS = 100_000`, validate before creating the PRNG, and compute:

```ts
const perDay = Math.floor(1440 / intervalMin)
const totalReadings = days * perDay
if (!Number.isSafeInteger(totalReadings) || totalReadings > MAX_GENERATED_READINGS) {
  throw new RangeError(`generateCGMSeries cannot create more than ${MAX_GENERATED_READINGS} readings`)
}
```

Require positive integer `days`, `intervalMin` between 0 and 1440, a safe-integer `seed`, positive finite `basal`, non-negative finite noise and meal amplitude, finite meal times between 0 and 1439, non-negative integer hypo-day indices, a supported unit, and a parseable start timestamp. Reject a zero-reading result before entering the loops.

After validation exists, add direct regressions for `days: Infinity` and `intervalMin: 0` and verify they throw without entering a loop.

- [ ] **Step 7: Verify and commit**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/align.test.ts
pnpm --filter @glucoseiq/testing exec vitest run tests/testing.test.ts
git add packages/core/src/align.ts packages/core/tests/align.test.ts packages/testing/src/index.ts packages/testing/tests/testing.test.ts
git commit -m "fix: bound generated glucose series"
```

---

### Task 3: Remove time-in-range gaps and invalid SVG geometry

**Files:**

- Modify: `packages/core/src/tir-enhanced.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/render/tir-bar.ts`
- Modify: `packages/core/tests/tir-enhanced.test.ts`
- Modify: `packages/core/tests/tir-bar.test.ts`

**Interfaces:**

- Each accepted reading belongs to one and only one zone.
- Default thresholds use each reading's native unit.
- Custom enhanced thresholds remain mg/dL values.
- Pregnancy TIR keeps its explicit unit option.

- [ ] **Step 1: Add boundary and invariant regressions**

Add exact tests for:

```ts
expect(zoneFor(180.005, 'mg/dL')).toBe('high')
expect(zoneFor(250.005, 'mg/dL')).toBe('veryHigh')
expect(zoneFor(3.0, 'mmol/L')).toBe('low')
expect(zoneFor(3.9, 'mmol/L')).toBe('inRange')
expect(zoneFor(10.0, 'mmol/L')).toBe('inRange')
expect(zoneFor(13.9, 'mmol/L')).toBe('high')
expect(zoneFor(13.91, 'mmol/L')).toBe('veryHigh')
```

For mixed-unit and boundary datasets, assert:

```ts
const count = result.veryLow.readingCount + result.low.readingCount +
  result.inRange.readingCount + result.high.readingCount + result.veryHigh.readingCount
expect(count).toBe(readings.length)
```

Add invalid-threshold cases for `NaN`, infinity, equality, and descending values. Add pregnancy readings immediately above 140 mg/dL and 7.8 mmol/L. Add an SVG assertion that valid input never contains `NaN` or `Infinity`.

- [ ] **Step 2: Run the red tests**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/tir-enhanced.test.ts tests/tir-bar.test.ts
```

Expected: boundary, count-invariant, threshold-validation, and SVG geometry assertions fail.

- [ ] **Step 3: Replace filter-based classification with one pass**

Remove `BOUNDARY_EPSILON`. Add one internal zone classifier that returns `'veryLow' | 'low' | 'inRange' | 'high' | 'veryHigh'` through ordered comparisons. Use native mmol/L constants for default thresholds and normalize to mg/dL only for averages and custom-threshold comparisons.

Validate custom thresholds before mapping readings:

```ts
const values = [veryLowThreshold, lowThreshold, highThreshold, veryHighThreshold]
if (!values.every(Number.isFinite) || !(values[0] < values[1] && values[1] < values[2] && values[2] < values[3])) {
  throw new DomainError('Enhanced TIR thresholds must be finite and strictly increasing', 'INVALID_OPTION')
}
```

Build zone arrays during one traversal, then calculate `RangeMetrics` from those arrays. Preserve the current rounded percentages, duration model, and mg/dL average output.

- [ ] **Step 4: Remove pregnancy epsilon logic**

Classify pregnancy values with `value < low`, `value <= high`, and `value > high`. Retain the current unit-selection strategy and output shape.

- [ ] **Step 5: Guard renderer totals**

Before dividing by the zone total, return the existing `No data` frame when the total is not finite or is less than or equal to zero. Add an accessible summary to the SVG label without changing its dimensions or colors.

- [ ] **Step 6: Verify and commit**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/tir-enhanced.test.ts tests/tir-bar.test.ts
git add packages/core/src/tir-enhanced.ts packages/core/src/types.ts packages/core/src/render/tir-bar.ts packages/core/tests/tir-enhanced.test.ts packages/core/tests/tir-bar.test.ts
git commit -m "fix: classify glucose ranges without gaps"
```

---

### Task 4: Finalize pre-1.0 statistics and option contracts

**Files:**

- Modify: `packages/tokens/src/index.ts`
- Modify: `packages/tokens/tests/tokens.test.ts`
- Modify: `packages/core/src/cohort.ts`
- Modify: `packages/core/tests/cohort.test.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/metrics/episodes.ts`
- Modify: `packages/core/src/metrics/gvi-pgs.ts`
- Modify: `packages/core/src/score.ts`
- Modify: `packages/core/src/analyze.ts`
- Modify: `packages/react/src/hooks.ts`
- Modify: affected core and React tests
- Modify: `scripts/test-package-contracts.mjs`

**Interfaces:**

- `classifyGlucoseZone` remains mg/dL-only and throws `RangeError` for invalid input.
- Even cohort medians average the middle pair; quartiles retain nearest-rank behavior.
- Remove unit options that cannot override the unit carried by each `GlucoseReading`.

- [ ] **Step 1: Add failing token and median tests**

```ts
for (const value of [NaN, Infinity, -Infinity, 0, -1]) {
  expect(() => classifyGlucoseZone(value)).toThrow(RangeError)
}

const result = aggregateCohort([constantPatient(100), constantPatient(200)])
expect(result.meanGlucose.median).toBe(150)
expect(result.tir.median).toBe(50)
```

- [ ] **Step 2: Run the focused red tests**

```sh
pnpm --filter @glucoseiq/tokens exec vitest run tests/tokens.test.ts
pnpm --filter @glucoseiq/core exec vitest run tests/cohort.test.ts
```

Expected: tokens classify invalid numbers and the cohort returns the lower middle value.

- [ ] **Step 3: Implement the contracts**

Add the token guard before threshold comparisons. Compute the cohort median separately from `p25` and `p75`:

```ts
const middle = Math.floor(v.length / 2)
const median = v.length % 2 === 0 ? (v[middle - 1] + v[middle]) / 2 : v[middle]
```

- [ ] **Step 4: Remove inert pre-1.0 unit options**

Remove these properties and their unused reads:

- `EnhancedTIROptions.unit`
- `EpisodeOptions.unit`
- `GVIPGSOptions.unit`
- `CohortOptions.unit` and the empty `aggregateCohort` options parameter
- `GlucoseIQOptions.unit` and the empty `glucoseIQScore` options parameter
- `AnalyzeGlucoseOptions.unit`

Retain `PregnancyTIROptions.unit`. Update React hook types and call sites so TypeScript exposes the actual behavior. Do not remove runtime exports.

Add a packed-package invariant that renders all five TIR zones through core and compares the emitted dark colors with `@glucoseiq/tokens`. This guards the deliberate zero-dependency duplication without adding a core runtime dependency or changing the palette.

- [ ] **Step 5: Verify and commit**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/cohort.test.ts tests/episodes.test.ts tests/gvi-pgs.test.ts tests/score.test.ts tests/analyze.test.ts
pnpm --filter @glucoseiq/tokens exec vitest run tests/tokens.test.ts
pnpm --filter @glucoseiq/react exec vitest run tests/react.test.tsx
pnpm test:packages
git add packages/core packages/react/src/hooks.ts packages/react/tests packages/tokens scripts/test-package-contracts.mjs
git commit -m "fix: finalize glucose metric contracts"
```

---

### Task 5: Enforce one reading-validity policy across connectors and live surfaces

**Files:**

- Create: `packages/core/src/reading-policy.ts`
- Modify: `packages/core/src/connectors/dexcom.ts`
- Modify: `packages/core/src/connectors/libre.ts`
- Modify: `packages/core/src/connectors/nightscout.ts`
- Modify: `packages/core/src/connectors/safe.ts`
- Modify: `packages/core/src/connectors/types.ts`
- Modify: `packages/core/src/live.ts`
- Modify: `packages/core/src/render/trend-tile.ts`
- Modify: `packages/core/tests/connectors.test.ts`
- Modify: `packages/core/tests/connectors-v2.test.ts`
- Modify: `packages/core/tests/live.test.ts`
- Modify: `packages/core/tests/trend-tile.test.ts`

**Interfaces:**

- Strict normalizers throw coded errors for malformed readings.
- Safe normalizers retain valid siblings and report each rejected input by original index.
- `NormalizeError` gains optional `code?: GlucoseIQErrorCode` while retaining `index` and `message`.
- `latestReading` returns the newest fully usable reading or `null`.

- [ ] **Step 1: Add connector regressions**

For Dexcom, Libre, and Nightscout, add cases for `NaN`, both infinities, zero, negatives, normalized values over 600 mg/dL, invalid runtime units, and out-of-range timestamps. Assert `DomainError` with `INVALID_GLUCOSE_VALUE` or `INVALID_UNIT`, or `TimestampError` for timestamp failures.

Add safe-normalizer input with valid entries on both sides of each malformed entry. Assert preserved order after chronological sorting, original failure index, message, and error code.

- [ ] **Step 2: Add live and renderer regressions**

Add tests proving:

```ts
expect(latestReading([validOlder, invalidNewer])).toBe(validOlder)
expect(latestReading([invalidOnly])).toBeNull()
expect(classifyGlucoseTrend(NaN)).toBe('unknown')
expect(() => computeGlucoseTrend(readings, { windowMin: 0 })).toMatchCodedError('INVALID_OPTION')
expect(() => minutesSinceLastReading(readings, 'bad')).toThrow(TimestampError)
expect(trendTileToSVG([invalidOnly])).toContain('No data')
expect(trendTileToSVG([invalidOnly])).not.toMatch(/NaN|Infinity/)
```

- [ ] **Step 3: Run the focused red suite**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/connectors.test.ts tests/connectors-v2.test.ts tests/live.test.ts tests/trend-tile.test.ts
```

Expected: malformed values escape strict normalizers, safe variants miss them, and live helpers select invalid readings.

- [ ] **Step 4: Add the internal validity helper**

Create `reading-policy.ts` with no public export from package entrypoints:

```ts
export const MAX_GLUCOSE_MGDL = 600

export function toUsableMgDl(value: number, unit: unknown, label: string): number {
  if (unit !== MG_DL && unit !== MMOL_L) {
    throw new DomainError(`${label} has unsupported glucose unit: ${String(unit)}`, 'INVALID_UNIT')
  }
  const mgdl = unit === MG_DL ? value : value * MGDL_MMOLL_CONVERSION
  if (!Number.isFinite(mgdl) || mgdl <= 0 || mgdl > MAX_GLUCOSE_MGDL) {
    throw new DomainError(`${label} has invalid glucose value: ${String(value)}`, 'INVALID_GLUCOSE_VALUE')
  }
  return mgdl
}

export function parseUsableTimestamp(timestamp: string, label: string): number {
  const value = Date.parse(timestamp)
  if (!Number.isFinite(value)) throw new TimestampError(`${label} has invalid timestamp: ${timestamp}`)
  return value
}

export function isUsableReading(reading: GlucoseReading): boolean {
  try {
    toUsableMgDl(reading.value, reading.unit, 'Reading')
    parseUsableTimestamp(reading.timestamp, 'Reading')
    return true
  } catch {
    return false
  }
}
```

Keep vendor-specific timestamp messages by validating inside each adapter before calling the shared value helper.

- [ ] **Step 5: Apply the policy through the data path**

Validate values in every strict normalizer after resolving the vendor unit. In `safeMap`, add `code` only when the caught value is a `GlucoseIQError`. Filter live trend input and latest-reading candidates with `isUsableReading`. Validate `windowMin` before filtering. Return `unknown` for non-finite rate input. Validate explicit `now` with `TimestampError`.

- [ ] **Step 6: Verify and commit**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/connectors.test.ts tests/connectors-v2.test.ts tests/live.test.ts tests/trend-tile.test.ts
git add packages/core/src/reading-policy.ts packages/core/src/connectors packages/core/src/live.ts packages/core/src/render/trend-tile.ts packages/core/tests
git commit -m "fix: reject malformed glucose readings"
```

---

### Task 6: Make CLI parsing and failure output deterministic

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/tests/cli.test.ts`
- Modify: `scripts/test-package-contracts.mjs`

**Interfaces:**

- Preserve `run(argv, io): number` and `CliIO`.
- Accept only the documented command and flags.
- Return `0` for success and `1` for input or operational failure.
- Keep JSON stdout parseable when `--agp-svg` is also present.

- [ ] **Step 1: Add failing CLI cases**

Add table-driven tests for an unknown flag, every value-taking flag without a value, invalid unit, empty delimiter, multi-character delimiter, extra positional argument, invalid IANA timezone, and an unwritable SVG path. Assert no exception escapes `run`, exit code `1`, and one concise error line.

Add a success case for `--json --agp-svg`:

```ts
const code = run(['report', csvPath, '--json', '--agp-svg', svgPath], io)
expect(code).toBe(0)
expect(() => JSON.parse(io.outLines.join('\n'))).not.toThrow()
expect(existsSync(svgPath)).toBe(true)
```

- [ ] **Step 2: Run the CLI red test**

```sh
pnpm --filter @glucoseiq/cli exec vitest run tests/cli.test.ts
```

Expected: permissive parsing accepts invalid syntax and later operations can throw outside the current catch.

- [ ] **Step 3: Replace the parser with `node:util`**

Use `parseArgs` from `node:util` with `strict: true`, `allowPositionals: true`, and this closed option map:

```ts
const options = {
  'timestamp-col': { type: 'string' },
  'value-col': { type: 'string' },
  unit: { type: 'string' },
  delimiter: { type: 'string' },
  timezone: { type: 'string' },
  json: { type: 'boolean' },
  'agp-svg': { type: 'string' },
  help: { type: 'boolean' },
} as const
```

Require exactly `report` and one file positional. Validate `unit` against `mg/dL` and `mmol/L`. Require one-character delimiter. Keep the default columns, delimiter, unit, and UTC behavior.

- [ ] **Step 4: Enclose the operational path in one error boundary**

Keep the existing friendly read-file message. Catch parsing, analysis, timezone, rendering, and write failures. Send errors to `io.err` and return `1`. Suppress the SVG success line when JSON output is active so stdout remains one JSON document.

- [ ] **Step 5: Exercise packed CLI failures**

In `scripts/test-package-contracts.mjs`, run the packed executable once with `--unit other` and once with `--unknown`. Assert nonzero status, concise stderr, and no stack trace.

- [ ] **Step 6: Verify and commit**

```sh
pnpm --filter @glucoseiq/cli exec vitest run tests/cli.test.ts
pnpm test:packages
git add packages/cli/src/index.ts packages/cli/tests/cli.test.ts scripts/test-package-contracts.mjs
git commit -m "fix: validate cli input and failures"
```

---

### Task 7: Preserve the React client boundary in packed artifacts

**Files:**

- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/src/hooks.ts`
- Modify: `packages/react/src/components.tsx`
- Modify: `packages/react/tsup.config.ts`
- Modify: `packages/react/tests/react.test.tsx`
- Modify: `scripts/test-package-contracts.mjs`

**Interfaces:**

- The existing React root remains the only entrypoint and remains client-only.
- Preserve every current React runtime and type export.
- Keep React as peer dependency `>=18` and core as a runtime dependency.
- Do not add a server subpath or package.

- [ ] **Step 1: Add packed-output contract assertions**

After packing `@glucoseiq/react`, read `dist/index.mjs` and `dist/index.js` and assert each begins with either `'use client'` or `"use client"`. Keep the existing ESM/CommonJS export parity and React 18/19 checks.

- [ ] **Step 2: Run the red package contract**

```sh
pnpm --filter @glucoseiq/react build
pnpm test:packages
```

Expected: both React runtime files lack the directive.

- [ ] **Step 3: Preserve the directive through tsup**

Place `'use client'` as the first statement in `packages/react/src/index.ts`. Add a tsup JavaScript banner for both output formats:

```ts
banner: {
  js: "'use client';",
},
```

Remove source comments claiming server-component friendliness. The docs task will direct server-only consumers to pure core APIs.

- [ ] **Step 4: Verify and commit**

```sh
pnpm --filter @glucoseiq/react exec vitest run tests/react.test.tsx
pnpm --filter @glucoseiq/react build
pnpm test:packages
git add packages/react scripts/test-package-contracts.mjs
git commit -m "fix: preserve the react client boundary"
```

---

### Task 8: Make API generation isolated, accurate, and drift-gated

**Files:**

- Create: `apps/docs/typedoc.api.json`
- Create: `apps/docs/scripts/lib/api-renderer.mjs`
- Create: `apps/docs/scripts/lib/api-redirects.mjs`
- Create: `apps/docs/scripts/lib/unicode-scalar-compare.mjs`
- Create: `apps/docs/scripts/generate-api.test.mjs`
- Create: `apps/docs/scripts/check-api.mjs`
- Modify: `apps/docs/scripts/generate-api.mjs`
- Modify: `apps/docs/next.config.mjs`
- Modify: `apps/docs/package.json`
- Modify: `packages/core/package.json`
- Delete: `packages/core/typedoc.json`
- Modify: `packages/core/src/conversions.ts`
- Modify: `packages/core/src/interop/types.ts`
- Modify: `packages/core/src/metrics/index.ts`
- Modify: `packages/core/src/render/index.ts`
- Create and regenerate: `apps/docs/content/docs/api/core/**`
- Remove: superseded generated category pages directly under `apps/docs/content/docs/api/`
- Modify: `apps/docs/content/docs/api/index.mdx`
- Modify: `apps/docs/content/docs/api/meta.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/plans/2026-07-13-glucoseiq-1-0-hardening.md`

**Interfaces:**

- TypeDoc runs with full type checking, no Markdown plugin, no warnings, and no writes outside an OS temporary directory plus the requested output's validated replacement transaction.
- The generated reference lives under `/docs/api/core` and identifies itself as the `@glucoseiq/core` API.
- CI compares generated filenames and bytes within the managed `api/core` subtree. Hand-written package reference pages remain outside that subtree.

- [ ] **Step 1: Add renderer unit tests before changing generation**

Export pure helpers from `api-renderer.mjs` and use `node:test` fixtures to assert exact rendering for:

- literal unions such as `'mg/dL' | 'mmol/L'`;
- type predicates such as `value is GlucoseReading`;
- `readonly` properties and readonly arrays;
- tuples, indexed access, and type operators;
- generic interfaces with defaults, including `OMHDataPoint<T = OMHBloodGlucose>`;
- optional and rest parameters;
- callable reflection types and nested object types;
- overloads, remarks, deprecation text, examples, returns, throws, and labeled links.

Cover every TypeDoc 0.28.4 type discriminant, callable and nested reflection types,
defaulted parameters, readonly members, internal and external links, MDX escaping,
schema and package identity, unsupported discriminants, uncategorized functions,
generator failures, and byte-level drift. Unknown discriminants and uncategorized
functions must fail with the owning reflection path. Drift fixtures must prove that
the hand-written API root files are outside the managed comparison.

Also cover abbreviated TypeDoc defaults backed by structured documented initializers,
call versus construct signatures, empty and malformed signature shapes, nested type
precedence, hostile `@see` and `@linkcode` content, Unicode scalar ordering, and
process-scoped temporary cleanup. Neutralize raw Markdown destinations in ordinary
TSDoc text, and allow structured links only to validated HTTP(S) URLs or generated
`/docs/api/core/...` destinations with owner-path failures. The real model must contain
no rendered `= ...` default.

The expected fixture for a generic interface must include its type parameter:

```md
interface OMHDataPoint<T = OMHBloodGlucose>
```

- [ ] **Step 2: Run the renderer red test**

```sh
node --test apps/docs/scripts/generate-api.test.mjs
```

Expected: the current generator has no importable renderer and cannot represent the listed types.

- [ ] **Step 3: Create a dedicated TypeDoc configuration**

Use:

```json
{
  "entryPoints": ["../../packages/core/src/index.ts"],
  "tsconfig": "../../packages/core/tsconfig.json",
  "excludeInternal": true,
  "excludePrivate": true,
  "excludeProtected": true,
  "excludeExternals": true,
  "plugin": [],
  "name": "@glucoseiq/core",
  "readme": "none",
  "treatWarningsAsErrors": true,
  "treatValidationWarningsAsErrors": true
}
```

Move TypeDoc `0.28.4` to the docs app’s direct dev dependencies and require JSON
schema `2.0`. Remove the core TypeDoc config, core `docs:api` script, and
`typedoc-plugin-markdown` when `pnpm why typedoc-plugin-markdown` shows no remaining
consumer.

- [ ] **Step 4: Refactor generation into pure rendering plus a safe CLI**

Resolve TypeDoc from the docs package, read its declared binary, and invoke it with
`process.execPath`, `spawnSync`, and an argument array. Check spawn errors, signals,
and status. Create the model and complete generated candidate tree under
`mkdtempSync(join(tmpdir(), 'glucoseiq-api-<pid>-'))`, validate it before touching tracked
output, and clean it in `finally`. Never use a shell or `--skipErrorChecking`. Replace
only `apps/docs/content/docs/api/core` through a same-filesystem staging copy and
rollback-capable rename transaction so failures preserve prior bytes, deleted pages
cannot linger, and hand-written package pages remain intact.

Treat the staged-tree-to-canonical rename as the commit point. Roll back the intact
prior backup only when that rename fails. After it succeeds, never touch the new
canonical tree during cleanup: a partial prior-backup deletion, empty-staging cleanup,
or generation-temporary cleanup failure is an ordered, non-fatal warning containing the
residual path and manual recovery guidance. Aggregate pre-commit rollback and cleanup
failures in deterministic order, retain nested causes, and preserve both recovery paths.
Use process-scoped `glucoseiq-api-<pid>-*` temporary roots while retaining the managed
temporary-root ownership validation.

Implement every TypeDoc 0.28.4 type node. Preserve type parameters and variance,
`readonly` index signatures, declaration-level optional overloads, static and abstract
members, abstract classes, implemented types, every child and overload, remarks,
defaults, source import paths, and TSDoc safety guidance. Reject unknown truthy flags or
flag combinations that cannot be rendered truthfully with the owning reflection path.
Assign single construct-reflection arrow types context-sensitive precedence so nested
arrays, unions, intersections, conditional checks and constraints, indexed access, and
type operators remain syntactically truthful while object reflections remain atomic.
Derive stable `@glucoseiq/core` subpath imports from source filenames instead of source
URLs. Render links as Markdown links with labels rather than bare URLs.
Validate absolute HTTP(S) link destinations with URL parsing while preserving generated
internal destinations.

Move generated core categories under `api/core`. Keep the top-level API index and metadata hand-written, with `core` as the first package entry. Update existing narrative links to the new core paths before removing the superseded category pages.

Add permanent redirects from all 19 superseded `/docs/api/<category>` routes to their
`/docs/api/core/<category>` replacements.

- [ ] **Step 5: Remove all six TypeDoc warnings at their source**

Remove unsupported `@file` tags from the two subpath index comments. Name the
`convertGlucoseUnit` object parameter `input`, destructure it inside the function, and
retain the property descriptions. Export the type-only `FHIRCoding`,
`FHIRCodeableConcept`, and `FHIRQuantity` interfaces so public FHIR types do not
reference omitted declarations.

- [ ] **Step 6: Add the byte-for-byte drift check**

`check-api.mjs` must generate into a temporary directory, recursively inventory regular
files, reject symlinks, normalize and code-point-sort POSIX paths, compare filename sets
against `apps/docs/content/docs/api/core`, then compare each file with `Buffer.equals`.
Print every missing, extra, or changed file and exit nonzero on drift. Never mutate the
tracked output during the check. Cover the direct CLI's nonzero status, complete
diagnostics, and read-only behavior with a subprocess fixture.
Propagate generation and drift-temporary cleanup warnings to the CLI without turning a
clean comparison into failure, and never let cleanup mask a primary generation or
comparison error. If comparison fails after cleanup warnings, preserve the primary error
identity, retain warnings in deterministic generation-then-drift order, and have the
direct command print actionable warning guidance before the primary diagnostic while
exiting nonzero. Format nested errors using active recursion-stack cycle detection so a
shared non-recursive cause is rendered on every branch.
Use true Unicode-scalar lexicographic ordering in the renderer, candidate validator,
and drift checker rather than JavaScript UTF-16 code-unit ordering.

Add scripts:

```json
"docs:api": "node scripts/generate-api.mjs",
"docs:api:check": "node scripts/check-api.mjs",
"test:api": "node --test scripts/generate-api.test.mjs"
```

- [ ] **Step 7: Generate, verify, and commit**

```sh
pnpm install --frozen-lockfile
pnpm --filter docs test:api
pnpm --filter docs docs:api
pnpm --filter docs docs:api:check
pnpm --filter docs build
pnpm --filter @glucoseiq/core build
pnpm --filter @glucoseiq/core test:coverage
pnpm test:packages
pnpm why typedoc-plugin-markdown
git diff --check
git add apps/docs packages/core/package.json packages/core/src pnpm-lock.yaml docs/plans/2026-07-13-glucoseiq-1-0-hardening.md
git commit -m "docs: harden the generated api reference"
```

---

### Task 8A: Close proven packed, parser, and SVG trust boundaries

No new public package or export is justified by these fixes. Keep the work in the
existing core and CLI packages, preserve current constructor and renderer signatures,
and make each boundary an independently reviewed commit before documentation prose is
expanded. Do not change the established visual layer.

Commit this reviewed plan amendment before the three implementation units so their
staging commands remain atomic:

```sh
git add docs/plans/2026-07-13-glucoseiq-1-0-hardening.md
git commit -m "docs: add package boundary hardening steps"
```

#### Commit 8A.1: Preserve public error names in packed runtimes

**Files:**

- Modify: `packages/core/src/errors.ts`
- Modify: `packages/core/tests/errors.test.ts`
- Modify: `scripts/test-package-contracts.mjs`

**Interfaces:**

- `GlucoseIQError`, `ParseError`, `DomainError`, `EmptyDatasetError`, and
  `TimestampError` retain those exact `.name` values in source, packed ESM, and packed
  CommonJS execution.
- `instanceof`, `code`, `message`, inheritance, and every constructor signature remain
  unchanged. Do not make `constructor.name` part of the public contract.
- Do not enable global `keepNames`. A measured build increased the reachable ESM gzip
  graph from 18,663 to 19,940 bytes, leaving only 60 bytes under the planned 20 KB
  ceiling.

- [ ] **Step 1: Add source and packed error-identity contracts**

In `errors.test.ts`, instantiate all five classes and assert their literal `.name`,
base identity, subclass identity, code, and message. Include the two-argument base,
parse, and domain constructors and the one-argument empty-dataset and timestamp
constructors.

In `test-package-contracts.mjs`, load `@glucoseiq/core` from the extracted tarball
through both `import()` and `require()`. For each format, construct all five errors and
assert the same names, inheritance relationships, codes, and messages. Assert only the
instance `.name`; minifier-dependent function names are not contractual.

- [ ] **Step 2: Run the RED packed contract**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/errors.test.ts
pnpm --filter @glucoseiq/core build
pnpm test:packages
```

Expected: source behavior characterizes the intended contract, while packed ESM and
CommonJS expose shortened subclass names and fail.

- [ ] **Step 3: Implement the GREEN error identity**

Assign `this.name = 'GlucoseIQError'` in the base constructor. Give each subclass its
existing public constructor signature, call `super`, and then assign its own literal
name. Do not derive a public value from `new.target.name`, add a runtime dependency, or
alter error codes and messages.

- [ ] **Step 4: Verify, review, and commit**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/errors.test.ts
pnpm --filter @glucoseiq/core test:coverage
pnpm --filter @glucoseiq/core build
pnpm test:packages
git diff --check
```

Have an independent reviewer inspect the source and both packed formats. Resolve every
substantive finding and rerun the ladder. Use the following subject as the complete
commit message, with an empty body and no trailers:

```sh
git add packages/core/src/errors.ts packages/core/tests/errors.test.ts scripts/test-package-contracts.mjs
git commit -m "fix: preserve public error names"
```

#### Commit 8A.2: Validate delimited input before reading or parsing

**Files:**

- Modify: `packages/core/src/csv.ts`
- Modify: `packages/core/tests/csv.test.ts`
- Modify: `packages/core/tests/errors.test.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/tests/cli.test.ts`
- Modify: `scripts/test-package-contracts.mjs`

**Interfaces:**

- An omitted delimiter defaults to comma. A supplied delimiter must be a string of
  exactly one UTF-16 code unit and must not be double quote, NUL, CR, or LF.
- Invalid delimiters throw `DomainError` with code `INVALID_OPTION` and this exact core
  message:

  ```text
  parseGlucoseCSV: delimiter must be exactly one character other than double quote, NUL, CR, or LF
  ```

- The CLI rejects the same values before file I/O with this exact single-line message:

  ```text
  Invalid delimiter: expected exactly one character other than double quote, NUL, CR, or LF.
  ```

- Empty, BOM-only, and blank-only documents return `[]`. A valid header-only document
  returns `[]`; a header-only document missing either mapped column throws the existing
  `ParseError` with code `CSV_COLUMN_NOT_FOUND` and its unchanged message.
- Comma, semicolon, tab, pipe, and space remain valid. Preserve BOM handling, LF and
  CRLF input, quoted delimiters, doubled quotes, whitespace-only physical-line
  filtering, and invalid-row skipping. Physical newlines inside quoted fields remain
  unsupported and must be stated in the public CSV contract when source comments are
  synchronized in Commit 8A.3.

- [ ] **Step 1: Add the core delimiter and document-shape matrix**

Add table-driven tests that pass empty string, multiple code units, an astral character,
double quote, NUL, CR, LF, `null`, and representative non-string runtime values as the
delimiter. Assert the exact error type, code, and message, including when the document
is empty, to prove option validation runs first.

Add positive cases for comma, semicolon, tab, pipe, and space. Cover empty, BOM-only,
blank-only, BOM-prefixed header, valid header-only, missing-column header-only,
whitespace-only physical lines, LF, CRLF, a quoted delimiter, doubled quotes, short
rows, and rows with invalid timestamps or glucose values.

- [ ] **Step 2: Add CLI and packed-consumer contracts**

In `cli.test.ts`, assert every prohibited delimiter returns the exact CLI message. Use a
missing file path in at least one case so the assertion proves delimiter validation
precedes `readFileSync`. Keep stderr to one sanitized line.

In `test-package-contracts.mjs`, exercise `parseGlucoseCSV` through packed ESM and
CommonJS for invalid delimiter order, valid header-only input, missing-column
header-only input, BOM and CRLF, quoting, and a valid custom delimiter. Run the packed
`glucoseiq` executable against an invalid delimiter and nonexistent file, and assert
status `1`, empty stdout, and the exact delimiter diagnostic.

- [ ] **Step 3: Run the RED parser contracts**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/csv.test.ts tests/errors.test.ts
pnpm --filter @glucoseiq/cli exec vitest run tests/cli.test.ts
pnpm build
pnpm test:packages
```

Expected: invalid core delimiters are accepted or misclassified, the CLI does not reject
all prohibited delimiters, and a missing-column header-only document incorrectly
returns `[]`.

- [ ] **Step 4: Implement the GREEN parser boundary**

Validate the snapshotted delimiter before classifying document emptiness. Default only
`undefined`; reject every other value outside the stated one-code-unit allowlist with
the exact `DomainError`. Strip a leading BOM for header matching, ignore whitespace-only
physical lines, distinguish a truly empty document from a header-only document, and
always validate mapped columns when a header exists. Keep the line parser and
invalid-row policy otherwise unchanged.

Mirror the same delimiter predicate in the CLI before file access and emit the exact
CLI diagnostic. Do not loosen terminal-output sanitization or expose a new helper from
either package.

- [ ] **Step 5: Verify, review, and commit**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/csv.test.ts tests/errors.test.ts
pnpm --filter @glucoseiq/cli exec vitest run tests/cli.test.ts
pnpm --filter @glucoseiq/core test:coverage
pnpm build
pnpm test:packages
git diff --check
```

Have an independent reviewer check validation order, exact diagnostics, BOM and
header-only behavior, packed formats, and executable behavior. Resolve findings and
rerun the ladder. Use the following subject as the complete commit message, with an
empty body and no trailers:

```sh
git add packages/core/src/csv.ts packages/core/tests/csv.test.ts packages/core/tests/errors.test.ts packages/cli/src/index.ts packages/cli/tests/cli.test.ts scripts/test-package-contracts.mjs
git commit -m "fix: validate delimited input options"
```

#### Commit 8A.3: Harden SVG renderer inputs without changing valid output

**Files:**

- Create: `packages/core/src/render/svg-options.ts`
- Modify: `packages/core/src/render/agp-svg.ts`
- Modify: `packages/core/src/render/tir-bar.ts`
- Modify: `packages/core/src/render/trend-tile.ts`
- Modify: `packages/core/src/csv.ts` (public limitation and throw documentation only)
- Modify: `packages/core/tests/agp-svg.test.ts`
- Modify: `packages/core/tests/tir-bar.test.ts`
- Modify: `packages/core/tests/trend-tile.test.ts`
- Modify: `packages/core/tests/errors.test.ts`
- Modify: `scripts/test-package-contracts.mjs`
- Regenerate: `apps/docs/content/docs/api/core/**`

**Interfaces:**

- All three renderers default dimensions only when the raw option is `undefined`.
  Present dimensions must be finite, positive primitive numbers. Invalid values throw
  `DomainError` with code `INVALID_OPTION` and one of these exact messages:

  ```text
  agpChartToSVG: width must be a finite positive number
  agpChartToSVG: height must be a finite positive number
  tirBarToSVG: width must be a finite positive number
  tirBarToSVG: height must be a finite positive number
  trendTileToSVG: width must be a finite positive number
  trendTileToSVG: height must be a finite positive number
  ```

- A present AGP title must be a primitive string or throw `DomainError` /
  `INVALID_OPTION` with the exact message `agpChartToSVG: title must be a string`.
  Primitive strings remain XML-escaped, and XML 1.0-forbidden code points are replaced
  with U+FFFD so caller text cannot make the document malformed. An empty title remains
  byte-identical to an omitted title.
- Existing valid default and normal-size output remains byte-for-byte stable. Small
  positive canvases produce finite coordinates and finite, nonnegative length and radius
  attributes. `Number.MAX_VALUE` is accepted without producing a non-finite attribute.
  No palette option, public type, subpath, package, or export is added.
- A trend tile snapshots every input reading's value, unit, and timestamp into plain
  objects exactly once, validates that snapshot, and derives both the selected latest
  value and trend from the same immutable snapshot. A getter that throws during the
  snapshot produces the existing finite `No data` frame. Invalid captured readings are
  skipped under the established reading policy; `No data` is returned only when no
  usable snapshot remains. Non-object and sparse entries are skipped, unrelated
  enumerable properties are never read, and conversion hooks on invalid field values
  are never invoked. Later accessor changes are never read and cannot affect or inject
  into output.

- [ ] **Step 1: Add dimension and injection red tests**

For each renderer and for both `width` and `height`, test `NaN`, positive and negative
infinity, zero, a negative number, `null`, a numeric string, a `BigInt`, an
attribute-breaking string, and an object whose conversion hooks throw or return markup.
Assert the exact `DomainError`, `INVALID_OPTION` code, and renderer-specific message,
and prove conversion hooks are never called. Add getter fixtures proving each raw
dimension is read once and defaulting occurs only for `undefined`.

For small positive canvases, including `Number.MIN_VALUE` and values below fixed
margins, assert every emitted numeric geometry attribute is finite and every
length-like `width`, `height`, `r`, `rx`, and `ry`
attribute is nonnegative. Negative positional `x` or `y` values remain valid SVG and do
not require clamping. Exercise `Number.MAX_VALUE` and `Number.MAX_VALUE / 2` on
data-bearing paths for each dimension; inspect scalar attributes, `viewBox`, paths, and
point lists for non-finite derived values. Preserve exact output fixtures for
established valid dimensions and defaults. Prove dimension validation precedes any
reading or profile access and uses deterministic width-first ordering.

- [ ] **Step 2: Add title and hostile-reading red tests**

Test an AGP title object whose `replace` method and conversion hooks expose markup or
throw, other present non-string values, an accessor that changes value, and primitive
titles containing all XML metacharacters and XML-forbidden code points. Assert
non-strings produce the exact typed error without invoking any hooks, valid strings
remain escaped, invalid XML characters become U+FFFD, and empty-string output stays
byte-identical to an omitted title.

For the trend tile, use multiple readings with getters that count, mutate after their
first read, or throw for value, unit, and timestamp. Assert every captured field is read
once, both latest selection and trend derivation use the captured values, later hostile
strings never appear, and a throwing capture yields the existing `No data` frame. Add a
mixed invalid/valid snapshot regression proving invalid readings are skipped while a
usable reading still renders. Include non-object and sparse entries, an unrelated
enumerable throwing getter, and hostile field conversion hooks. Include ordinary
readings to prove the value, unit, zone, and trend arrow still render normally.

- [ ] **Step 3: Run the RED renderer matrix**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/agp-svg.test.ts tests/tir-bar.test.ts tests/trend-tile.test.ts tests/errors.test.ts
```

Expected: unchecked dimensions reach SVG attributes, hostile title values are coerced,
small canvases emit negative lengths, extreme finite dimensions overflow rounding, and
unstable reading accessors let the displayed value and derived trend observe different
states or throw.

- [ ] **Step 4: Implement the GREEN private renderer boundary**

Create `svg-options.ts` as an unexported implementation module. Snapshot each raw
dimension once, default only `undefined`, require `typeof value === 'number'`,
`Number.isFinite(value)`, and `value > 0`, then throw the exact typed diagnostic on
failure. Use the validated locals for every SVG attribute, make rounding and percentage
arithmetic overflow-safe for extreme finite values, and clamp only inner length-like
plot dimensions to zero when fixed margins exceed a small positive canvas.

Snapshot the AGP title once and reject present non-string values before rendering. Keep
the existing XML escaping for primitive strings and replace XML 1.0-forbidden code
points with U+FFFD. In the trend renderer, snapshot the entire series once inside a
guarded boundary, copying only `value`, `unit`, and `timestamp`; validate primitive
field types before reusable validators can format them, and use only the resulting
plain snapshot for latest selection and trend derivation. Return the existing no-data
frame when a declared field getter throws or no usable snapshot remains; otherwise
retain the existing policy of skipping invalid, non-object, and sparse readings. Do not
add caller-controlled colors or change output for established valid inputs.

In `scripts/test-package-contracts.mjs`, assert that packed ESM and CommonJS imports of
`@glucoseiq/core/render` expose exactly `agpChartToSVG`, `tirBarToSVG`, and
`trendTileToSVG`. Parse both packed `.d.mts` and `.d.ts` render declarations and assert
their exact exported surface is those three functions plus `AGPChartOptions`,
`TIRBarOptions`, and `TrendTileOptions`; reject any reference or export containing
`svg-options`. This pins both runtime and type-only private-helper boundaries rather
than merely requiring a nonempty entrypoint.

- [ ] **Step 5: Synchronize public source contracts and generated API**

After the runtime behavior is green, document the exact dimension and title throws on
the three renderers. Document the delimiter rule, header-only behavior, and unsupported
physical newlines inside quoted CSV fields in `csv.ts`. Keep these source-comment
changes with this final boundary commit so the managed reference is regenerated once
after all three fixes.

```sh
pnpm --filter docs docs:api
pnpm --filter docs docs:api:check
```

- [ ] **Step 6: Verify 100% coverage, review, and commit**

```sh
pnpm --filter @glucoseiq/core test:coverage
pnpm --filter @glucoseiq/core build
pnpm --filter docs docs:api:check
pnpm --filter docs build
pnpm test:packages
git diff --check
```

Have an independent reviewer inspect runtime trust boundaries, exact error contracts,
valid-output stability, tiny geometry, accessor handling, API drift, and coverage.
Resolve findings and rerun the complete ladder. Use the following subject as the
complete commit message, with an empty body and no trailers:

```sh
git add packages/core/src/render/svg-options.ts packages/core/src/render/agp-svg.ts packages/core/src/render/tir-bar.ts packages/core/src/render/trend-tile.ts packages/core/src/csv.ts packages/core/tests/agp-svg.test.ts packages/core/tests/tir-bar.test.ts packages/core/tests/trend-tile.test.ts packages/core/tests/errors.test.ts scripts/test-package-contracts.mjs apps/docs/content/docs/api/core
git commit -m "fix: harden svg renderer inputs"
```

---

### Task 8B: Correct the default A1C category boundaries

**Files:**

- Modify: `packages/core/src/a1c.ts`
- Modify: `packages/core/tests/a1c.test.ts`
- Modify: `scripts/test-package-contracts.mjs`
- Modify: `apps/docs/content/docs/migration.mdx`
- Modify: `CHANGELOG.md`
- Regenerate: `apps/docs/content/docs/api/core/**`

**Interfaces:**

- The default classifier follows the current
  [CDC diagnostic ranges](https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html): values below 5.7%
  are `normal`, values from 5.7% up to but not including 6.5% are `prediabetes`, and
  values at or above 6.5% are `diabetes`.
- Preserve the public function signature and the existing inclusive semantics of an
  explicitly supplied `normalMax` or `prediabetesMax`; this avoids silently changing
  custom research cutoffs while correcting only the defective defaults.
- Treat `undefined` and runtime `null` custom bounds as omitted, matching the existing
  nullish-default behavior. Any other supplied runtime value, including zero or `NaN`,
  retains the current JavaScript comparison semantics; this task does not invent a new
  validation error.
- Keep invalid-input behavior and every public export unchanged. This is an intentional
  pre-1.0 correctness fix inherited by the `diabetic-utils` 2.0 bridge; the untouched
  1.5 release remains available under the `legacy` dist-tag.

- [ ] **Step 1: Add exact boundary RED tests**

Assert 5.7 is `prediabetes`, the greatest representative value below 6.5 remains
`prediabetes`, and 6.5 is `diabetes`. Retain checks just below 5.7 and above 6.5. Add
custom-threshold equality tests proving explicitly supplied maxima remain inclusive.
Cover each bound independently: custom normal with omitted prediabetes, omitted normal
with custom prediabetes, both custom, explicit `undefined`, and runtime `null`. These
mixed cases prevent an implementation based only on property presence from changing
the current nullish behavior.

Extend the packed ESM and CommonJS consumer matrix with the same default boundary
contract through both `@glucoseiq/core` and the `diabetic-utils` 2.0 bridge so minified
tarball behavior cannot diverge from source. Keep the historical 1.5 fixture and legacy
documentation unchanged.

- [ ] **Step 2: Run the RED category contract**

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/a1c.test.ts
pnpm test:packages
```

Expected: 5.7 is currently classified as `normal` and 6.5 as `prediabetes`.

- [ ] **Step 3: Implement the GREEN default semantics**

Distinguish omitted defaults from caller-supplied inclusive maxima. Use strict
comparisons only for the CDC defaults and `<=` only for explicit custom maxima. Remove
the duplicated adjacent JSDoc, document the exact ranges and custom semantics, and cite
the canonical CDC A1C page. Record the corrected defaults in the launch changelog and
migration guide without implying that the preserved 1.5 artifact changed.

Regenerate and drift-check the managed API reference:

```sh
pnpm --filter docs docs:api
pnpm --filter docs docs:api:check
```

- [ ] **Step 4: Verify, review, and commit**

```sh
pnpm --filter @glucoseiq/core test:coverage
pnpm --filter @glucoseiq/core build
pnpm --filter docs docs:api:check
pnpm --filter docs build
pnpm test:packages
git diff --check
```

Have an independent reviewer verify the CDC boundary mapping, unchanged custom cutoff
semantics, packed behavior, generated API drift, and public type/export stability. Use
the following complete commit message with an empty body and no trailers:

```sh
git add packages/core/src/a1c.ts packages/core/tests/a1c.test.ts scripts/test-package-contracts.mjs apps/docs/content/docs/migration.mdx CHANGELOG.md apps/docs/content/docs/api/core
git commit -m "fix: correct a1c category boundaries"
```

---

### Task 9: Make package READMEs and public claims match runtime behavior

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/core/README.md`
- Modify: `packages/react/README.md`
- Modify: `packages/tokens/README.md`
- Modify: `packages/testing/README.md`
- Modify: `packages/cli/README.md`
- Modify: `packages/diabetic-utils/README.md`
- Modify: `packages/testing/package.json`
- Modify: `packages/testing/src/index.ts`
- Modify: `packages/tokens/package.json`
- Modify: `packages/tokens/src/index.ts`
- Modify: `packages/react/package.json`
- Modify: `packages/react/src/hooks.ts`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/diabetic-utils/package.json`
- Modify: `packages/diabetic-utils/src/index.ts`
- Modify: `packages/core/src/a1c.ts`
- Modify: `packages/core/src/align.ts`
- Modify: `packages/core/src/analyze.ts`
- Modify: `packages/core/src/cohort.ts`
- Modify: `packages/core/src/constants.ts`
- Modify: `packages/core/src/conversions.ts`
- Modify: `packages/core/src/formatters.ts`
- Modify: `packages/core/src/glucose.ts`
- Modify: `packages/core/src/guards.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/connectors/index.ts`
- Modify: `packages/core/src/connectors/dexcom.ts`
- Modify: `packages/core/src/connectors/libre.ts`
- Modify: `packages/core/src/connectors/nightscout.ts`
- Modify: `packages/core/src/connectors/types.ts`
- Modify: `packages/core/src/live.ts`
- Modify: `packages/core/src/mage.ts`
- Modify: `packages/core/src/score.ts`
- Modify: `packages/core/src/csv.ts`
- Modify: `packages/core/src/tir.ts`
- Modify: `packages/core/src/tir-enhanced.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/variability.ts`
- Modify: `packages/core/src/metrics/agp-profile.ts`
- Modify: `packages/core/src/metrics/active-percent.ts`
- Modify: `packages/core/src/metrics/agp.ts`
- Modify: `packages/core/src/metrics/auc.ts`
- Modify: `packages/core/src/metrics/episodes.ts`
- Modify: `packages/core/src/metrics/meal.ts`
- Modify: `packages/core/src/render/agp-svg.ts`
- Modify: `packages/core/src/render/index.ts`
- Modify: `packages/core/src/render/tir-bar.ts`
- Modify: `packages/core/src/render/trend-tile.ts`
- Modify: `packages/core/tests/analyze.test.ts`
- Modify: `packages/core/tests/glucose.test.ts`
- Modify: `packages/core/tests/guards.test.ts`
- Modify: `packages/core/tests/metrics.test.ts`
- Modify: `packages/core/tests/score.test.ts`
- Modify: `packages/core/tests/tir-bar.test.ts`
- Modify: `packages/core/tests/tir-enhanced.test.ts`
- Modify: `apps/docs/app/(home)/page.tsx`
- Modify: `apps/docs/app/layout.tsx`
- Modify: `apps/docs/content/docs/agp.mdx`
- Modify: `apps/docs/content/docs/cli.mdx`
- Modify: `apps/docs/content/docs/connectors.mdx`
- Modify: `apps/docs/content/docs/core-concepts.mdx`
- Modify: `apps/docs/content/docs/dashboard.mdx`
- Modify: `apps/docs/content/docs/index.mdx`
- Modify: `apps/docs/content/docs/data-model.mdx`
- Modify: `apps/docs/content/docs/data-quality.mdx`
- Modify: `apps/docs/content/docs/interoperability.mdx`
- Modify: `apps/docs/content/docs/live.mdx`
- Modify: `apps/docs/content/docs/metrics.mdx`
- Modify: `apps/docs/content/docs/migration.mdx`
- Modify: `apps/docs/content/docs/react.mdx`
- Modify: `apps/docs/content/docs/testing.mdx`
- Modify: `apps/docs/content/docs/tokens.mdx`
- Modify: `apps/docs/package.json`
- Modify: `apps/docs/scripts/lib/api-renderer.mjs`
- Modify: `apps/docs/scripts/generate-api.test.mjs`
- Regenerate: `apps/docs/content/docs/api/core/**`
- Create: `docs/README.md`
- Modify: `docs/index.md`
- Create: `scripts/doc-snippet-contracts.test.mjs`
- Create: `scripts/doc-snippet-contracts.unit.test.mjs`
- Create: `scripts/test-doc-snippets.mjs`
- Create: `scripts/lib/doc-contracts.mjs`
- Create: `scripts/lib/doc-snippets.mjs`
- Modify: `scripts/test-package-contracts.mjs`

**Interfaces:**

- Reading-based APIs can normalize mixed units because each reading carries a unit.
- Numeric-array APIs require one homogeneous unit and the matching unit option where available.
- The score is a project-defined wellness heuristic derived from GRI, not a diagnostic or validated clinical score.
- CSV accepts a header-row delimited file with explicitly mapped timestamp and value columns.
- Every public TypeScript or TSX example is either independently compiled or explicitly
  classified as a reviewed fragment with a nonempty reason.
- Documentation examples compile against the actual built package declarations and both
  the React 18 peer floor and React 19, with no ambient test or Node types leaking in.

- [ ] **Step 1: Add prose and snippet contract tests**

Discover public inputs from `git ls-files` and explicitly exclude
`packages/core/docs-md/**` plus generated or historical claim-only paths before reading
or statting them. Normalize Markdown emphasis, entities, raw
HTML/MDX, JSX text, comments, and collapsed whitespace before applying narrowly scoped
claim rules. Add RED fixtures for split or disguised versions of:

- clinician-grade or clinical-report claims;
- arbitrary vendor export support;
- universal normalization, formula, citation, or research-grade claims;
- realistic or clinically representative synthetic data;
- the nonexistent forecast package;
- unqualified “runs anywhere” and direct email, PDF, README, or watch-runtime promises;
- unverified colorblind-safe claims.

Do not reject legitimate terms such as clinical thresholds, clinical systems, or
research use. Exclude managed API pages and historical generated 1.5 prose from current
claim enforcement, while still checking their links.

Parse Markdown/MDX links, reference definitions, images, and raw HTML/MDX URL
attributes. Reject unsafe schemes and tarball-breaking relative non-fragment URLs in
published READMEs. Map every `https://glucoseiq.health/...` link back to a tracked docs
route. Require all six published READMEs to contain Node `>=24`, installation, a strict
typed first-use example, option and invalid-input behavior, safety limits, absolute
guide/migration/API links, license, and changelog links. Add a tracked legacy landing
page so preserved 1.5 API breadcrumbs resolve without rewriting historical API prose.

Before changing any README, extend `scripts/test-package-contracts.mjs` to read each of
the six actual tarball README files and apply the same first-use, URL, route, and unsafe
scheme contracts. Source-only checks are insufficient because npm consumers receive the
packed artifact.

- [ ] **Step 2: Run the harness-unit RED before implementation**

Create both repository contract tests and `doc-snippet-contracts.unit.test.mjs`, with
the latter containing only synthetic fixtures for claim
normalization, MDX/link extraction, fence metadata, module-specifier rejection,
declaration containment, diagnostics, workers, timeouts, and cleanup. Import the
intended pure helpers from `scripts/lib`. After the tests are authored, add only
export-complete helper stubs that throw a stable internal `Not implemented` error; do
not add functional behavior. Do not change package dependencies, classify repository
examples, or edit public prose yet.

```sh
node --test scripts/doc-snippet-contracts.unit.test.mjs
```

Expected: the suite collects successfully and fails behavioral assertions against the
nonfunctional stubs, rather than failing because of syntax or missing imports.

- [ ] **Step 3: Implement the harness only, then establish the full-corpus RED**

Add exact docs-owned dev dependencies for `@mdx-js/mdx@3.1.1`, TypeScript `5.8.3`,
`react-types-18` as `npm:@types/react@18.3.31`, and `react-types-19` as
`npm:@types/react@19.2.17`. Keep the aliases outside the `@types/*` namespace so they
cannot enter the docs app's ambient type discovery. Assert that the two resolved roots are distinct
and have the expected exact majors. Map `react`, `react/jsx-runtime`, and
`react/jsx-dev-runtime` from each alias; never install dependencies inside the temporary
project.

Implement the pure helpers and runner so every public `ts`, `tsx`, or `typescript`
fence must carry exactly one of:

- `typecheck`, meaning it is standalone and compiled independently;
- `fragment="nonempty reviewed reason"`, accepted only from an explicit path/line
  allowlist maintained by the contract test when the fence is hand-authored.

Generated API declaration and signature fences are the sole exception to the manual
path/line allowlist. Accept them only when all three conditions hold: the file is under
the managed `apps/docs/content/docs/api/core/**` tree, the API renderer emitted the
exact repository-owned fragment reason, and renderer unit tests pin that metadata.
Reject that generated reason everywhere else. This keeps the authored-fragment
allowlist small and line-stable without maintaining hundreds of generated line-number
entries or permitting generated pages to self-classify arbitrary examples.

Reject malformed, duplicate, hidden, empty, unclosed, or unclassified fences. Discover
source `@example` blocks dynamically across all six published packages rather than
hard-coding a count. Extract the visible home-page code sample so JSX source cannot
bypass the gate. Require at least one compiling example in the root README and each of
the six package READMEs; the CLI README must exercise its typed `run` API.

Define the current public snippet inventory explicitly as the root README, all six
published package READMEs, every current Fumadocs narrative and managed API page, the
visible home-page sample, and all source `@example` blocks across the six published
packages. Exclude launch plans, changesets, pull-request templates, and archived 1.5
generated reference files under `docs/functions`, `docs/interfaces`, `docs/variables`,
and `docs/type-aliases` from compilation; keep their links under integrity checks.
Never discover or inspect `packages/core/docs-md/**`.

Resolve the exact ten public ESM declaration entrypoints from the six package
manifests. Require regular, nonsymlink `.d.mts` files contained by their package roots;
aggregate missing entries with a clear build-first diagnostic. Compile each fence in
its own contained temporary directory with strict Bundler, ESNext, ES2022, DOM,
`noUncheckedIndexedAccess`, `skipLibCheck: false`, and `types: []`. Use the TypeScript
AST to reject suppression directives, ambient declarations, triple-slash references,
relative/absolute/file imports, undeclared packages, and every module-specifier form
including dynamic and import-type expressions. Use a bounded four-worker pool with
timeouts, bounded child output, deterministic sorted diagnostics, safe cleanup, and no
shell interpolation. Unit fixtures cover BOM, CRLF/frontmatter line mapping,
React-19-only APIs failing the React 18 pass, missing declarations, compile failures,
timeouts, spawn failures, and execution from outside the repository.

Make `pnpm test:docs` build all six public package declarations first, then run the
contract and compiler harnesses. A direct harness run after `pnpm clean` must fail with
the explicit declaration prerequisite; the normal root script must never validate
against stale build output.

First make only the synthetic unit suite green. Then run the completed harness against
the unchanged repository before classifying or correcting any public content:

```sh
node --test scripts/doc-snippet-contracts.unit.test.mjs
node --test scripts/doc-snippet-contracts.test.mjs
pnpm build
node scripts/test-doc-snippets.mjs
pnpm test:packages
```

Expected: helper fixtures pass, while the repository checks fail on stale claims,
unclassified fences, absent source and packed package README contracts, and unsafe
nullable examples.

Then prove the declaration prerequisite independently:

```sh
pnpm clean
node scripts/test-doc-snippets.mjs
```

Expected: a nonzero, aggregated diagnostic names all ten missing public `.d.mts`
entrypoints and performs no compilation. After recording that fail-closed result, run
the six-package declaration build (or `pnpm test:docs`, which performs it) before any
green snippet run.

- [ ] **Step 4: Correct the public contracts**

Only after the unchanged-corpus RED is recorded, mark generated API
declaration/signature fences as reviewed fragments in the API renderer; convert every
dynamically discovered public source `@example` to a standalone `typecheck` example;
and classify every authored docs/README fence. Keep the manual fragment allowlist
small, reasoned, and line-stable; generated declarations and signatures use only the
managed-path, exact-reason exception above. Regenerate the managed API after source
examples change.

Use these terms across source and documentation:

- `CGM analytics summary` instead of clinical or clinician-grade report;
- `optional SVG renderers` for React and core renderer components;
- `header-row delimited data with mapped timestamp and value columns` instead of any vendor export;
- `mixed-unit safe for GlucoseReading APIs` and `homogeneous numeric series` for number-array APIs;
- `project-defined, non-diagnostic wellness heuristic derived from GRI` for the score.

Remove the legacy core banner, stale version text, old analytics name, and nonexistent forecasting package reference. Replace the broken AGP citation with a stable primary-source or DOI URL.

Describe the renderer as an AGP-style percentile-band series, not a complete
standardized AGP report. Explain that email, PDF, README, and watch hosts require
host-specific embedding, conversion, or application integration. Treat 50% TITR as the
library's configurable default benchmark rather than a universal 2019-consensus goal.
Correct the metrics guide's positional-versus-option unit contracts and the
`calculateGVIPGS` unit-bearing input. Replace stale CDC A1C links with the canonical
testing page. Document the exact mapped CSV, delimiter, blank-line, skipped-row,
header-only, typed-error, and unsupported quoted-physical-newline behavior.

- [ ] **Step 5: Give each npm README a complete first-use contract**

Each README must contain installation, Node `>=24`, a typed minimal example, valid options, invalid-input behavior, safety limits, absolute documentation and migration links, license, and changelog link. Add these package-specific details:

- React: client-only root, stable option object identity, React `>=18`, core for server use.
- Tokens: mg/dL-only classifier and its `RangeError` behavior.
- Testing: synthetic data warning, all generator options, 100,000-reading cap.
- CLI: exact flags, units, delimiter rule, exit codes, mapped CSV columns, and the
  `{ report, glucoseIQ }` JSON shape, including that non-finite JSON numbers serialize
  as `null` and that JSON mode suppresses the SVG success line.
- Compatibility bridge: `legacy` tag guidance and direct scoped-package migration.

Repair stale changelog source links to the preserved `v1.4.0` tag before linking the
package READMEs. Use canonical package guide URLs under `https://glucoseiq.health/docs`
and include API, migration, MIT license, and changelog links that exist in packed
tarballs or are absolute HTTPS URLs.

During Task 9, link core to `/docs/api/core`; link the other scoped packages to the
already tracked `/docs/api` overview plus their package-specific guide, and link the
compatibility bridge to `/docs/api/core` plus `/docs/migration`. Task 10 may replace the
overview links with package-specific API pages only after those routes exist.

- [ ] **Step 5A: Repair review-discovered runtime boundaries with regressions**

The public-contract review is authorized to fix correctness defects discovered while
matching documentation to runtime behavior. Keep each repair inside the existing six
package architecture; do not add a public package unless the review demonstrates an
independent ownership boundary, consumer, and release value that cannot live in an
existing package. No such package boundary is currently justified.

Record a focused failing test before each behavior change, then make only that contract
green:

- require positive finite glucose strings and exact supported units in runtime guards;
- validate runtime population, reading-unit, and pregnancy unit-option literals before
  any target or conversion branch, while report/score wrappers consistently screen
  unsupported-unit rows under their sentinel-result contracts;
- assess Enhanced and pregnancy TIR targets from raw percentages with strict TIR
  boundaries, cumulative TBR/TAR limits, the pregnancy Level 2 subset, and explicit
  `targetBasis` disclosure for configured ranges;
- count active percent as occupied half-open timestamp slots, excluding invalid
  timestamps and duplicate rows, with the unrounded ratio driving the threshold flag;
- make `analyzeGlucose` use unrounded span and slot coverage for sufficiency decisions;
- make Enhanced and pregnancy summary duration fail closed for invalid or
  duplicate-only timestamps, require at least 70% slot coverage for quality grades,
  divide each occupied slot across its distinct observations and zones, collapse exact
  duplicates, ignore invalid timestamps, and conserve integer minutes across primary
  range durations;
- describe threshold-grouped episodes as candidates rather than confirmed recovery;
- narrow connector, compatibility, testing, token, and aggregate-metric prose to the
  behavior proven by source and package tests.

Add migration and data-quality disclosures for every public behavior correction. Keep
the managed API stale while runtime source is moving; regenerate it once after the
source and narrative contracts settle.

Run the focused and complete gates:

```sh
pnpm --filter @glucoseiq/core exec vitest run tests/guards.test.ts tests/glucose.test.ts
pnpm --filter @glucoseiq/core exec vitest run tests/metrics.test.ts tests/analyze.test.ts tests/score.test.ts tests/tir-enhanced.test.ts
pnpm --filter @glucoseiq/core test:coverage
pnpm test:errors
```

Expected: the regression subsets pass and core reports exactly 100% statements,
branches, functions, and lines before managed API regeneration.

- [ ] **Step 6: Fix strict examples and run green checks**

Narrow nullable report sections before dereference:

```ts
const report = analyzeGlucose(readings)
if (!report.valid || !report.timeInRange || !report.risk || !report.episodes || !report.agpProfile) {
  throw new Error('The input did not contain enough valid CGM data')
}
```

Hoist React option objects outside components or memoize them. Keep the visual layout unchanged.

First repeat the fail-closed prerequisite from a clean tree and confirm the direct
harness exits nonzero with the aggregated ten-entrypoint diagnostic:

```sh
pnpm clean
node scripts/test-doc-snippets.mjs
```

Then run the green ladder; `test:docs` must rebuild the six declarations before it
invokes the same harness:

```sh
pnpm test:docs
pnpm --filter docs docs:api
pnpm --filter docs docs:api:check
pnpm --filter docs build
pnpm test:packages
REPO_ROOT=$PWD
(cd /tmp && node "$REPO_ROOT/scripts/test-doc-snippets.mjs")
```

Require the package-contract script to prove all six packed README files pass, not only
their sources. Verify all dynamically discovered source `@example` blocks, managed API
fences, narrative fences, package READMEs, and the home sample are represented in the
classification count. Run `git diff --check` after API regeneration.

- [ ] **Step 7: Commit the task**

```sh
test -z "$(git diff --name-only -- packages/core/docs-md/)"
git add README.md CHANGELOG.md package.json pnpm-lock.yaml
git add packages/{core,react,tokens,testing,cli,diabetic-utils}/README.md
git add packages/{react,tokens,testing,cli,diabetic-utils}/package.json
git add packages/react/src/hooks.ts packages/tokens/src/index.ts packages/testing/src/index.ts packages/cli/src/index.ts packages/diabetic-utils/src/index.ts
git add packages/core/src/{a1c,align,analyze,cohort,constants,conversions,csv,formatters,glucose,guards,index,live,mage,score,tir,tir-enhanced,types,variability}.ts
git add packages/core/src/connectors/{dexcom,index,libre,nightscout,types}.ts packages/core/src/metrics/{active-percent,agp,agp-profile,auc,episodes,meal}.ts packages/core/src/render/{agp-svg,index,tir-bar,trend-tile}.ts
git add packages/core/tests/{analyze,glucose,guards,metrics,score,tir-bar,tir-enhanced}.test.ts
git add apps/docs/package.json apps/docs/app/layout.tsx apps/docs/app/'(home)'/page.tsx
git add apps/docs/content/docs/{agp,cli,connectors,core-concepts,dashboard,data-model,data-quality,index,interoperability,live,metrics,migration,react,testing,tokens}.mdx
git add apps/docs/content/docs/api/core apps/docs/scripts/lib/api-renderer.mjs apps/docs/scripts/generate-api.test.mjs
git add docs/README.md docs/index.md
git add scripts/doc-snippet-contracts.test.mjs scripts/doc-snippet-contracts.unit.test.mjs scripts/test-doc-snippets.mjs scripts/lib/doc-contracts.mjs scripts/lib/doc-snippets.mjs scripts/test-package-contracts.mjs
git diff --cached --check
git commit -m "docs: clarify package and safety contracts"
```

Before committing, compare `git diff --cached --name-only` with the Task 9 file
allowlist and abort on any extra path. The protected `packages/core/docs-md/` path must
remain unstaged and untouched even if it exists in the original worktree.

---

### Task 10: Finish documentation architecture, metadata, and accessibility semantics

**Files:**

- Create: `apps/docs/content/docs/packages.mdx`
- Create: `apps/docs/content/docs/safety.mdx`
- Create: `apps/docs/content/docs/runtime-support.mdx`
- Create: `apps/docs/content/docs/deployment.mdx`
- Create: `apps/docs/content/docs/integration-testing.mdx`
- Create: `apps/docs/content/docs/api/react.mdx`
- Create: `apps/docs/content/docs/api/tokens.mdx`
- Create: `apps/docs/content/docs/api/testing.mdx`
- Create: `apps/docs/content/docs/api/cli.mdx`
- Create: `docs/LAUNCH_RUNBOOK.md`
- Create: `apps/docs/app/robots.ts`
- Create: `apps/docs/app/sitemap.ts`
- Create: `apps/docs/lib/site-metadata.ts`
- Create: `apps/docs/scripts/site-contracts.test.mjs`
- Modify: `apps/docs/content/docs/meta.json`
- Modify: `apps/docs/content/docs/api/meta.json`
- Modify: `apps/docs/content/docs/api/index.mdx`
- Modify: `apps/docs/app/layout.tsx`
- Modify: `apps/docs/app/(home)/layout.tsx`
- Modify: `apps/docs/app/(home)/page.tsx`
- Modify: `apps/docs/app/docs/[[...slug]]/page.tsx`
- Modify: `apps/docs/content/docs/live.mdx`
- Modify: `apps/docs/content/docs/react.mdx`
- Modify: `apps/docs/package.json`
- Modify: `package.json`
- Modify: `scripts/doc-snippet-contracts.test.mjs`
- Modify: `scripts/doc-snippet-contracts.unit.test.mjs`
- Modify: `scripts/lib/doc-contracts.mjs`

**Interfaces:**

- The canonical production origin is `https://glucoseiq.health`.
- Preview deployments use `noindex` and do not replace production canonicals.
- The sitemap contains `/` plus every Fumadocs page returned by `source.getPages()`.
- No visual redesign or palette change is allowed.

- [ ] **Step 1: Add route and metadata tests**

Create a Node test in `apps/docs/scripts/site-contracts.test.mjs` that imports or inspects the route builders and asserts:

- the production root canonical is `/` on the apex origin;
- `/docs/react` canonicalizes to its own path;
- preview robots disallow indexing;
- production robots allow indexing and point to `/sitemap.xml`;
- sitemap URLs are unique and use HTTPS on the apex origin;
- every slug in both metadata JSON files resolves to a tracked MDX file.

Centralize the production origin, environment test, canonical URL builder, HTML robots
metadata, robots.txt contract, and sitemap-entry builder in
`apps/docs/lib/site-metadata.ts`. Route files consume those pure builders so the test
does not duplicate production logic.

- [ ] **Step 2: Run the red site contract**

```sh
node --test apps/docs/scripts/site-contracts.test.mjs
```

Expected: metadata routes and the new documentation pages do not exist.

- [ ] **Step 3: Add the missing documentation routes**

Write consumer-facing pages for package selection, safety and limitations, runtime support, integration testing, and deployment. Add package references for React exports and props, token exports, testing options/scenarios, and CLI flags, output schema, and exit codes.

Classify every TypeScript/TSX fence in the new or modified pages as an independently
compiled `typecheck` example or an allowlisted fragment with a nonempty reason. Keep
all new package-reference links within the Task 9 route-integrity contract. Update the
reviewed-fragment allowlist only for genuine non-standalone API signatures; do not use
it to hide fixable examples.

Write `docs/LAUNCH_RUNBOOK.md` with checked-command and unchecked-human sections covering Vercel, registrar activation, apex and `www`, npm bootstrap, trusted publishers, Pages shutdown, repository metadata, registry verification, local-folder rename, and partial-publication recovery. Recovery must inventory published versions, retry missing packages, never unpublish a successful package, and use a corrective patch for a bad artifact.

Add the runbook to the existing tracked link-only inventory so its local and public
links receive the same integrity checks as the changelog and archived reference. Add
unit coverage for the inventory rule. Stage the new runbook before running the
git-tracked inventory contract.

- [ ] **Step 4: Add canonical and discovery metadata**

Set `metadataBase` to the apex origin. Add environment-aware HTML robots metadata at
the root so previews emit `noindex` even when a crawler does not consult robots.txt.
Add home Open Graph and Twitter metadata in the home layout. Return page-specific
`alternates.canonical`, Open Graph URL, title, and description from the docs page’s
`generateMetadata`.

Create `robots.ts` using `process.env.VERCEL_ENV === 'production'` to choose allow or disallow rules. Create `sitemap.ts` from `source.getPages()` plus `/`. Omit `lastModified` unless a stable source date exists so repeated builds remain deterministic.

Expose the site contract as a docs-owned script and invoke it from the root
`test:docs` command so route, canonical, robots, sitemap, and metadata navigation drift
cannot bypass the durable documentation gate.

- [ ] **Step 5: Improve semantics without changing appearance**

Give the package table a caption, `<thead>`, and `<th scope="col">` cells. Add visually hidden trend text beside glyph-only examples. Document an adjacent textual-summary pattern for SVG charts. Preserve the byte-locked renderer output and existing runtime `aria-label` strings during this launch task; richer data-dependent renderer labels require a later test-first public-output change with regenerated fixtures.

- [ ] **Step 6: Verify and commit**

```sh
node --test apps/docs/scripts/site-contracts.test.mjs
pnpm test:docs
pnpm --filter docs build
pnpm test:packages
git diff --check
git add apps/docs/content/docs/{packages,safety,runtime-support,deployment,integration-testing}.mdx
git add apps/docs/content/docs/api/{react,tokens,testing,cli,index}.mdx
git add apps/docs/content/docs/{meta.json,live.mdx,react.mdx} apps/docs/content/docs/api/meta.json
git add apps/docs/app/{robots.ts,sitemap.ts,layout.tsx} apps/docs/app/'(home)'/{layout.tsx,page.tsx} apps/docs/app/docs/'[[...slug]]'/page.tsx
git add apps/docs/lib/site-metadata.ts apps/docs/scripts/site-contracts.test.mjs apps/docs/package.json package.json
git add docs/LAUNCH_RUNBOOK.md scripts/doc-snippet-contracts.test.mjs scripts/doc-snippet-contracts.unit.test.mjs scripts/lib/doc-contracts.mjs
git diff --cached --check
git commit -m "docs: complete the launch information architecture"
```

Compare the staged path list with the exact Task 10 allowlist before committing; do not
stage unrelated docs, renderer, generated API, or protected legacy-worktree changes.

---

### Task 11: Add explicit lint, typecheck, and reachable-core size gates

**Files:**

- Create: `eslint.config.mjs`
- Create: `scripts/measure-core-bundle.mjs`
- Create: `scripts/measure-core-bundle.test.mjs`
- Modify: `package.json`
- Modify: `turbo.json`
- Modify: every workspace `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- `pnpm lint`, `pnpm typecheck`, and `pnpm test:size` become required local and CI gates.
- The core size gate measures every reachable production ESM chunk exactly once and enforces 20,000 gzip bytes.
- Lint dependencies remain development-only.

- [ ] **Step 1: Add size-graph tests before the implementation**

Create temporary fixture modules with shared imports and a cycle. Assert the graph walker includes each reachable `.mjs` file once, excludes maps and declarations, rejects imports that escape the selected dist root, and fails when the injected budget is one byte below the measured gzip size.

- [ ] **Step 2: Run the size red test**

```sh
node --test scripts/measure-core-bundle.test.mjs
```

Expected: the measurement module does not exist.

- [ ] **Step 3: Implement reachable-graph measurement**

Start at `packages/core/dist/index.mjs`. Parse relative static import and export specifiers, resolve them inside `packages/core/dist`, traverse with a `Set`, sort the final paths, concatenate each file buffer once with a newline, and pass the result to `gzipSync`. Print the relative file inventory and byte count. Exit nonzero above `20_000`.

Add:

```json
"test:size": "node scripts/measure-core-bundle.mjs",
"typecheck": "turbo run typecheck",
"lint": "eslint . --max-warnings 0"
```

- [ ] **Step 4: Add workspace typecheck tasks**

Add `"typecheck": "tsc --noEmit"` to all seven workspaces and a cached `typecheck` task to `turbo.json` that depends on dependency typechecks. Update direct `@types/node` ranges to `^24.13.3` where Node types are used.

- [ ] **Step 5: Add the pinned lint stack**

Install these root development dependencies:

```sh
pnpm add -Dw eslint@10.7.0 @eslint/js@10.0.1 typescript-eslint@8.63.0 eslint-plugin-react-hooks@7.1.1 globals@17.7.0
```

Create a flat config for JavaScript, TypeScript, and TSX. Ignore build output, coverage, `.next`, generated Fumadocs source, legacy generated `docs/`, and temporary directories. Enable ESLint recommended, TypeScript recommended, and React Hooks recommended rules. Disable style-only rules and allow explicit `any` only in malformed-input test fixtures.

- [ ] **Step 6: Put the gates in CI**

Run `pnpm typecheck`, `pnpm lint`, API drift, documentation snippets, and `pnpm test:size` in `.github/workflows/ci.yml`. Replace the shell gzip check with `pnpm test:size`. Set checkout `persist-credentials: false`. Limit the `push` trigger to `main`; feature branches receive the pull-request check and no duplicate push run.

- [ ] **Step 7: Verify and commit**

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test:size
node --test scripts/measure-core-bundle.test.mjs
git add eslint.config.mjs scripts/measure-core-bundle.mjs scripts/measure-core-bundle.test.mjs package.json turbo.json packages/*/package.json apps/docs/package.json pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "ci: enforce types lint and bundle size"
```

---

### Task 12: Harden release permissions, human gates, and registry verification

**Files:**

- Modify: `.github/workflows/release.yml`
- Modify: `.github/release-pr-body.md`
- Modify: `.changeset/README.md`
- Modify: `.changeset/launch-glucoseiq-one.md`
- Create: `scripts/test-changeset-policy.mjs`
- Create: `scripts/test-changeset-policy.test.mjs`
- Create: `scripts/release-preflight.mjs`
- Create: `scripts/release-preflight.test.mjs`
- Create: `scripts/verify-published-packages.mjs`
- Create: `scripts/verify-published-packages.test.mjs`
- Modify: `scripts/release-metadata.test.mjs`
- Modify: `scripts/test-package-contracts.mjs`
- Modify: all six published package manifests
- Modify: `package.json`

**Interfaces:**

- A read-only quality job must succeed in the same release workflow before versioning or publication.
- Generated release pull requests stay draft.
- Publication requires the live domain preflight.
- Post-publication verification runs only when the publish action reports `published == 'true'`.
- Each source manifest allows `CHANGELOG.md`; the versioned release-candidate and registry checks require the generated changelog in every tarball.

- [ ] **Step 1: Add failing workflow and script contracts**

Expand `release-metadata.test.mjs` to require separate `quality`, `version`, and `publish` jobs, job-level permissions, `persist-credentials: false`, a draft release pull request, exact check publication for the release-candidate head, domain preflight, the `published` output condition, and every heading in the human checklist.

Add unit tests for changeset policy, domain responses, registry polling, manifest validation, tags, provenance metadata, and partial publication. Inject command execution and fetch functions so tests never contact GitHub, npm, or the production domain.

- [ ] **Step 2: Run the release red tests**

```sh
node scripts/release-metadata.test.mjs
node --test scripts/test-changeset-policy.test.mjs scripts/release-preflight.test.mjs scripts/verify-published-packages.test.mjs
```

Expected: the current single-job workflow, permissive checklist, and missing scripts fail.

- [ ] **Step 3: Enforce Changeset policy**

Compare the pull request diff against `origin/main`. Require a non-README Changeset when release-affecting files under the six public packages change. Exempt `release/glucoseiq-packages` and documentation-only changes. Print each release-affecting path when the check fails.

- [ ] **Step 4: Split release permissions and candidate verification**

Create:

- `quality`: `contents: read`, no persisted credentials, full build and quality suite;
- `version`: after quality, `contents: write`, `pull-requests: write`, `checks: write`, no OIDC;
- `publish`: after quality, `contents: write`, `id-token: write`, no pull-request permission.

Use Node 24 and pnpm 11.12.0 in all three jobs. Pin npm 11.17.0 in the publish job. Keep every action SHA-pinned and keep public npm provenance enabled.

The version job must create or update `release/glucoseiq-packages` as a draft, check out the returned head SHA, run the full candidate suite against versioned manifests, and create a `Build & test (Node 24)` check run on that exact SHA with a link to the workflow run and its real conclusion. Remove the detached manual workflow dispatch.

- [ ] **Step 5: Add the live-domain preflight**

Before publish, require:

- apex HTTPS status 200;
- apex canonical markup pointing to itself;
- `/robots.txt` and `/sitemap.xml` status 200;
- `www` status 301 or 308 with apex `Location`;
- bounded attempts and per-request timeouts with actionable errors.

Keep the command injectable for unit tests. Do not run this preflight locally while the domain remains inactive.

- [ ] **Step 6: Complete release and package verification**

Add `CHANGELOG.md` to each published manifest’s `files` array and assert the allowlist entry on the unversioned launch branch. Do not hand-create changelogs before Changesets versions the packages. The release-candidate job must assert that Changesets created each changelog and that each versioned tarball contains it. Refactor the packed consumer matrix so it can run against local tarballs, a versioned candidate checkout, or exact registry versions.

After a real publication, verify all six versions, `latest` and `legacy` dist-tags, internal dependency ranges, tarball contents, integrity, signatures, provenance or attestation metadata, Git tags, GitHub releases, every ESM/CommonJS entrypoint, NodeNext and Bundler declarations, React 18/19, CLI execution, and all 107 compatibility exports.

Run the legacy-tag and registry verification steps only when:

```yaml
if: steps.changesets.outputs.published == 'true'
```

- [ ] **Step 7: Expand the human release gate and release notes**

Use unchecked boxes for domain registration, Vercel production, apex and `www`, search/routes/robots/sitemap, package versions and changelogs, packed manifests, temporary one-day npm credential, metadata scan, final approval, trusted-publisher migration, and credential removal. Expand the launch Changeset with package-specific 1.0 capabilities and the compatibility bridge behavior.

- [ ] **Step 8: Verify and commit**

```sh
node scripts/release-metadata.test.mjs
node --test scripts/test-changeset-policy.test.mjs scripts/release-preflight.test.mjs scripts/verify-published-packages.test.mjs
pnpm test:launch
pnpm test:packages
git add .github .changeset scripts package.json packages/*/package.json
git commit -m "ci: harden release and registry verification"
```

---

### Task 13: Run the completion audit and independent branch review

**Files:**

- Review: every file changed from `b69ea3bb11a6490bd736f7666a047e8d64d96820`
- Update only when verification or review identifies a concrete defect.

**Acceptance evidence:**

- Every explicit requirement in the design maps to a passing command or inspected artifact.
- The tracked worktree and index finish clean after commits.
- The branch remains local and unmerged unless the owner later requests publication workflow actions.

- [ ] **Step 1: Install and build under Node 24 without cache evidence**

Use an installed Node 24 runtime. Clear only generated outputs inside the isolated worktree, keep the durable progress ledger, and run:

```sh
pnpm install --frozen-lockfile
pnpm turbo run build --force
```

- [ ] **Step 2: Run every local quality gate**

```sh
pnpm typecheck
pnpm lint
pnpm test:errors
pnpm test:launch
pnpm test:coverage
pnpm test:size
node --test scripts/measure-core-bundle.test.mjs
pnpm test:packages
node --test scripts/doc-snippet-contracts.test.mjs
node scripts/test-doc-snippets.mjs
pnpm --filter docs test:api
pnpm --filter docs docs:api:check
node --test apps/docs/scripts/site-contracts.test.mjs
pnpm --filter docs build
node scripts/release-metadata.test.mjs
node --test scripts/test-changeset-policy.test.mjs scripts/release-preflight.test.mjs scripts/verify-published-packages.test.mjs
git diff --check
```

- [ ] **Step 3: Audit public contracts**

Confirm exact release predictions, six packed manifests, ten entrypoints, correct declaration routes, React peer installs, CLI success and failure paths, 107 compatibility exports, changelog inclusion, no `workspace:` ranges in tarballs, and no source-map local paths.

Scan tracked files, the complete branch commit subjects and bodies, and the prepared pull-request text for prohibited attribution, generated-by trailers, task links, and tool-focused names. Do not place the prohibited terms in a tracked scanner or configuration file.

- [ ] **Step 4: Review the complete branch**

Generate one review package for the full merge-base range. A fresh reviewer must return both a specification-compliance verdict and a code-quality verdict. Fix every Critical and Important finding in one follow-up batch, rerun covering tests, and request one re-review.

- [ ] **Step 5: Confirm the final state without merging**

```sh
git status --short --branch
git log --format='%h %s%n%b' b69ea3bb11a6490bd736f7666a047e8d64d96820..HEAD
```

Expected: the hardening branch contains only reviewed project-focused commits, the tracked worktree is clean, the release pull request remains draft, and no merge or publication has occurred.
