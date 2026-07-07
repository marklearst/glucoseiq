# GlucoseIQ roadmap

GlucoseIQ is the TypeScript layer between CGM data and a product interface. It
normalizes supported payloads, calculates glucose metrics, and returns typed
data or SVG. Applications keep responsibility for credentials, storage,
workflows, and presentation.

## GlucoseIQ 1.0

The first scoped release contains five packages:

- `@glucoseiq/core`
- `@glucoseiq/react`
- `@glucoseiq/tokens`
- `@glucoseiq/testing`
- `@glucoseiq/cli`


No package will be added to the 1.0 launch. A larger package list would add
more versioning and support work without improving the initial contract.

## Work after 1.0

### Connector evidence

Keep connector normalization under `@glucoseiq/core/connectors`.

- Add fixtures from documented Dexcom, Libre, and Nightscout payload shapes.
- Record which timestamp, trend, unit, and identifier fields each normalizer
  reads.
- Test replay, duplicate records, clock differences, and missing trend values.
- Keep authentication and fetching in the host application.

### Report contracts

Make the path from readings to a report easier to inspect.

- Document screening rules next to the affected report fields.
- Expose data sufficiency wherever a summary could be mistaken for a complete
  period.
- Keep numeric-array APIs separate from unit-bearing reading APIs.
- Add report fixtures for common product states such as missing data, mixed
  units, long gaps, and meal windows.

### Product examples

Examples should prove that the packages support different interfaces without
turning those interfaces into framework requirements.

- A responsive web dashboard that uses typed report data.
- An AGP-style report that uses the SVG renderer.
- A small React surface that uses hooks and components.
- A server example that normalizes a payload already fetched by the host.

Examples belong under `examples/` until they need their own release or support
policy.


## When a new package is justified

A proposed package needs a boundary that users can understand and maintainers
can test independently. At least one of these conditions should apply:

- It introduces a runtime dependency that does not belong in core.
- It needs a separate security or credential policy.
- It targets a runtime with a different support matrix.
- It has a release cadence independent of the existing packages.
- It owns a public contract large enough to document and support on its own.

Two ideas may eventually meet that test:

- A schema adapter package if Zod or Standard Schema support develops a stable
  public contract and dependency boundary.
- A transport package if retry, caching, and credential handling can be
  separated from vendor clients without weakening their security model.

Neither is part of 1.0. Start with an example or internal module, gather real
use cases, then decide whether a package earns the maintenance cost.

## Measures that matter

- A developer can install core and produce a report in under 30 minutes.
- Packed-package tests cover every public entrypoint and supported module
  system.
- Core stays below its 20 KB compressed bundle budget and has no runtime
  dependencies.
- Connector docs match the fields used by the implementation.
